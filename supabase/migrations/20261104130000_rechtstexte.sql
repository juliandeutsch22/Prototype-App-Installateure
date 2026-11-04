-- RECHTSTEXTE IM GLOBALEN ADMIN (Auftrag 04.11.2026: „wäre es möglich im
-- globalen Admin eine Seite zu machen, in welcher man die Rechtstexte direkt
-- anpassen kann? … setze das alles direkt um.“)
--
-- Bis hierher standen Impressum und Datenschutzerklärung im Quelltext
-- (`src/features/recht/`): jede Änderung — und sei es nur die Anschrift des
-- Betreibers — brauchte eine neue Fassung der App. Jetzt pflegt sie der
-- Betreiber in der Plattform, und die App liest sie von hier.
--
-- DREI ARTEN, JEDE IN FASSUNGEN.
--   betreiber    die Angaben zum Betreiber (Name, Anschrift, E-Mail …) —
--                einmal gepflegt, gelten sie in Impressum und
--                Datenschutzerklärung (Platzhalter wie `{Name}` im Text);
--   impressum    Abschnitte mit Überschrift und Text;
--   datenschutz  Abschnitte, dazu die Liste der Unterauftragsverarbeiter.
--
-- GEARBEITET WIRD IM ENTWURF (höchstens einer je Art), VERÖFFENTLICHT WIRD
-- EINE FASSUNG, und eine veröffentlichte Fassung ändert sich nie wieder:
-- welcher Text wann galt, muss sich auch nach Jahren belegen lassen
-- (Rechenschaft, Art. 5 Abs. 2 DSGVO). Ein Entwurf lässt sich verwerfen, eine
-- Fassung nicht löschen. Was zu einem Tag galt: die jüngste Fassung je Art,
-- die bis dahin veröffentlicht war.
--
-- OHNE PERSONENBEZUG. Wer im Betreiber eine Fassung veröffentlicht hat, steht
-- nicht darin — es gibt nur das Plattformkonto, und die Zuordnung „Fassung
-- von wem“ braucht niemand. „Geprüft von“ nennt, wer den Text rechtlich
-- freigegeben hat (etwa eine Kanzlei); das ist eine Angabe des Betreibers,
-- kein Datum einer Person in einem Betrieb.

create table if not exists public.rechtstexte (
  id                 bigint generated always as identity primary key,
  art                text not null check (art in ('betreiber', 'impressum', 'datenschutz')),
  -- Laufende Nummer je Art, vergeben beim Veröffentlichen; ein Entwurf hat keine.
  nummer             integer,
  inhalt             jsonb not null,
  veroeffentlicht_am timestamptz,
  -- Rechtlich geprüft und freigegeben — erst dann fällt das Band „Entwurf“.
  geprueft           boolean not null default false,
  geprueft_von       text,
  -- Datenschutzerklärung: wer die App benutzt, bekommt einen Hinweis.
  hinweisen          boolean not null default false,
  -- Datenschutzerklärung: Unterauftragsverarbeiter, die gegenüber der
  -- vorigen Fassung neu sind — darüber wird die Leitung jedes Betriebs
  -- informiert (Art. 28 Abs. 2 DSGVO).
  neue_verarbeiter   jsonb not null default '[]'::jsonb,
  geaendert_am       timestamptz not null default now(),
  constraint rechtstexte_nummer_mit_datum check ((nummer is null) = (veroeffentlicht_am is null)),
  constraint rechtstexte_geprueft_von check (not geprueft or nullif(btrim(coalesce(geprueft_von, '')), '') is not null),
  constraint rechtstexte_nummer_je_art unique (art, nummer)
);

create unique index if not exists rechtstexte_ein_entwurf
  on public.rechtstexte (art) where veroeffentlicht_am is null;

alter table public.rechtstexte enable row level security;

/*
  LESEN: die Tabelle samt Entwürfen nur die Plattform. Alle anderen — auch
  ohne Anmeldung, denn das Impressum muss jeder lesen können (§ 5 ECG) —
  lesen die geltenden Fassungen über `rechtstexte_aktuell()`. So bekommt
  `anon` kein Recht auf eine Tabelle.
*/
drop policy if exists rechtstexte_plattform_lesen on public.rechtstexte;
create policy rechtstexte_plattform_lesen on public.rechtstexte
  for select to authenticated using ((select app.ist_plattform()));

revoke all on table public.rechtstexte from public, anon, authenticated;
grant select on table public.rechtstexte to authenticated;

/* Eine veröffentlichte Fassung ändert sich nicht und verschwindet nicht. */
create or replace function app.rechtstext_fassung_fest() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if old.veroeffentlicht_am is not null then
    raise exception 'Eine veröffentlichte Fassung bleibt, wie sie ist — ändern heißt: eine neue Fassung veröffentlichen'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app.rechtstext_fassung_fest() from public, anon, authenticated;

drop trigger if exists rechtstexte_fassung_fest on public.rechtstexte;
create trigger rechtstexte_fassung_fest
  before update or delete on public.rechtstexte
  for each row execute function app.rechtstext_fassung_fest();

/*
  DIE FORM, an einer Stelle geprüft. Gibt NULL zurück, wenn alles stimmt,
  sonst den Grund. Die Grenzen sind großzügig; sie sollen Unsinn abhalten,
  nicht schreiben verhindern.
*/
create or replace function app.rechtstext_form(p_art text, p_inhalt jsonb) returns text
  language plpgsql immutable
  set search_path = ''
as $$
declare
  feld text;
  a jsonb;
  v jsonb;
begin
  if p_inhalt is null or jsonb_typeof(p_inhalt) <> 'object' then
    return 'Der Inhalt fehlt';
  end if;
  if octet_length(p_inhalt::text) > 200000 then
    return 'Der Text ist zu lang (höchstens 200 KB)';
  end if;

  if p_art = 'betreiber' then
    if (select array_agg(k order by k) from jsonb_object_keys(p_inhalt) k)
       is distinct from array['anschrift', 'email', 'firmenbuch', 'gewerbe', 'name', 'telefon', 'uid'] then
      return 'Die Betreiberangaben haben nicht die vorgesehenen Felder';
    end if;
    foreach feld in array array['name', 'anschrift', 'email', 'telefon', 'uid', 'firmenbuch', 'gewerbe'] loop
      if jsonb_typeof(p_inhalt -> feld) <> 'string' or length(p_inhalt ->> feld) > 500 then
        return 'Eine Betreiberangabe ist kein Text oder länger als 500 Zeichen';
      end if;
    end loop;
    return null;
  end if;

  if p_art not in ('impressum', 'datenschutz') then
    return 'Unbekannte Art eines Rechtstexts';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_inhalt) k)
     is distinct from (case when p_art = 'datenschutz' then array['abschnitte', 'verarbeiter'] else array['abschnitte'] end) then
    return case when p_art = 'datenschutz'
      then 'Die Datenschutzerklärung besteht aus Abschnitten und der Liste der Unterauftragsverarbeiter'
      else 'Das Impressum besteht aus Abschnitten' end;
  end if;
  if jsonb_typeof(p_inhalt -> 'abschnitte') <> 'array'
     or jsonb_array_length(p_inhalt -> 'abschnitte') not between 1 and 50 then
    return 'Ein Rechtstext hat einen bis fünfzig Abschnitte';
  end if;
  for a in select * from jsonb_array_elements(p_inhalt -> 'abschnitte') loop
    if jsonb_typeof(a) <> 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(a) k) is distinct from array['text', 'titel']
       or jsonb_typeof(a -> 'titel') <> 'string' or jsonb_typeof(a -> 'text') <> 'string' then
      return 'Jeder Abschnitt hat eine Überschrift und einen Text';
    end if;
    if btrim(a ->> 'titel') = '' or length(a ->> 'titel') > 200 then
      return 'Jeder Abschnitt braucht eine Überschrift (höchstens 200 Zeichen)';
    end if;
    if btrim(a ->> 'text') = '' or length(a ->> 'text') > 20000 then
      return 'Jeder Abschnitt braucht einen Text (höchstens 20.000 Zeichen)';
    end if;
  end loop;

  if p_art = 'datenschutz' then
    if jsonb_typeof(p_inhalt -> 'verarbeiter') <> 'array' or jsonb_array_length(p_inhalt -> 'verarbeiter') > 50 then
      return 'Die Liste der Unterauftragsverarbeiter hat höchstens fünfzig Einträge';
    end if;
    for v in select * from jsonb_array_elements(p_inhalt -> 'verarbeiter') loop
      if jsonb_typeof(v) <> 'object'
         or (select array_agg(k order by k) from jsonb_object_keys(v) k) is distinct from array['wer', 'wo', 'wofuer']
         or jsonb_typeof(v -> 'wer') <> 'string' or jsonb_typeof(v -> 'wofuer') <> 'string' or jsonb_typeof(v -> 'wo') <> 'string' then
        return 'Jeder Unterauftragsverarbeiter hat Anbieter, Zweck und Standort';
      end if;
      if btrim(v ->> 'wer') = '' or length(v ->> 'wer') > 200
         or btrim(v ->> 'wofuer') = '' or length(v ->> 'wofuer') > 1000
         or btrim(v ->> 'wo') = '' or length(v ->> 'wo') > 500 then
        return 'Anbieter, Zweck und Standort eines Unterauftragsverarbeiters dürfen nicht leer sein';
      end if;
    end loop;
    if (select count(distinct e ->> 'wer') from jsonb_array_elements(p_inhalt -> 'verarbeiter') e)
       <> jsonb_array_length(p_inhalt -> 'verarbeiter') then
      return 'Jeder Unterauftragsverarbeiter steht nur einmal in der Liste';
    end if;
  end if;
  return null;
end;
$$;

revoke all on function app.rechtstext_form(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schreiben: nur die Plattform, nur über diese Funktionen
-- ---------------------------------------------------------------------------

create or replace function public.rechtstext_entwurf_speichern(p_art text, p_inhalt jsonb)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  fehler text;
begin
  if not app.ist_plattform() then
    raise exception 'Die Rechtstexte pflegt der Betreiber' using errcode = '42501';
  end if;
  fehler := app.rechtstext_form(p_art, p_inhalt);
  if fehler is not null then
    raise exception '%', fehler using errcode = '22023';
  end if;
  update public.rechtstexte set inhalt = p_inhalt, geaendert_am = now()
   where art = p_art and veroeffentlicht_am is null;
  if not found then
    insert into public.rechtstexte (art, inhalt) values (p_art, p_inhalt);
  end if;
end;
$$;

create or replace function public.rechtstext_entwurf_verwerfen(p_art text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not app.ist_plattform() then
    raise exception 'Die Rechtstexte pflegt der Betreiber' using errcode = '42501';
  end if;
  delete from public.rechtstexte where art = p_art and veroeffentlicht_am is null;
end;
$$;

/*
  VERÖFFENTLICHEN macht aus dem Entwurf die nächste Fassung. „Geprüft“ geht
  nur mit dem Namen dessen, der geprüft hat, und nur ohne offene Angaben
  („… — wird ergänzt]“) im Text. Bei der Datenschutzerklärung hält die
  Fassung fest, welche Unterauftragsverarbeiter gegenüber der vorigen neu
  sind; daran hängt der Hinweis an die Betriebe.
*/
create or replace function public.rechtstext_veroeffentlichen(
  p_art text, p_geprueft boolean, p_geprueft_von text, p_hinweisen boolean)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  entwurf public.rechtstexte%rowtype;
  vorher  public.rechtstexte%rowtype;
  neu     jsonb := '[]'::jsonb;
  v_nummer integer;
  fehler  text;
begin
  if not app.ist_plattform() then
    raise exception 'Die Rechtstexte pflegt der Betreiber' using errcode = '42501';
  end if;
  select * into entwurf from public.rechtstexte
   where art = p_art and veroeffentlicht_am is null for update;
  if not found then
    raise exception 'Es gibt keinen Entwurf zum Veröffentlichen' using errcode = 'P0002';
  end if;
  fehler := app.rechtstext_form(p_art, entwurf.inhalt);
  if fehler is not null then
    raise exception '%', fehler using errcode = '22023';
  end if;
  if coalesce(p_geprueft, false) then
    if p_art = 'betreiber' then
      raise exception 'Die Betreiberangaben werden nicht rechtlich freigegeben — das geschieht beim Text' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(p_geprueft_von, '')), '') is null then
      raise exception 'Wer hat den Text rechtlich geprüft?' using errcode = '22023';
    end if;
    if position('wird ergänzt]' in entwurf.inhalt::text) > 0 then
      raise exception 'Im Text stehen noch offene Angaben („… — wird ergänzt]“)' using errcode = '22023';
    end if;
  end if;

  -- Die Fassungen einer Art reihen sich; zwei gleichzeitige Veröffentlichungen warten aufeinander.
  perform pg_advisory_xact_lock(hashtext('rechtstexte:' || p_art));
  select * into vorher from public.rechtstexte
   where art = p_art and veroeffentlicht_am is not null
   order by nummer desc limit 1;
  v_nummer := coalesce(vorher.nummer, 0) + 1;

  if p_art = 'datenschutz' then
    select coalesce(jsonb_agg(v -> 'wer'), '[]'::jsonb) into neu
      from jsonb_array_elements(entwurf.inhalt -> 'verarbeiter') v
     where not exists (
       select 1 from jsonb_array_elements(coalesce(vorher.inhalt -> 'verarbeiter', '[]'::jsonb)) a
        where a ->> 'wer' = v ->> 'wer');
  end if;

  update public.rechtstexte
     set nummer = v_nummer,
         veroeffentlicht_am = now(),
         geprueft = coalesce(p_geprueft, false),
         geprueft_von = case when coalesce(p_geprueft, false) then btrim(p_geprueft_von) end,
         hinweisen = p_art = 'datenschutz' and coalesce(p_hinweisen, false),
         neue_verarbeiter = neu,
         geaendert_am = now()
   where id = entwurf.id;
  return v_nummer;
end;
$$;

revoke all on function public.rechtstext_entwurf_speichern(text, jsonb) from public, anon;
revoke all on function public.rechtstext_entwurf_verwerfen(text) from public, anon;
revoke all on function public.rechtstext_veroeffentlichen(text, boolean, text, boolean) from public, anon;
grant execute on function public.rechtstext_entwurf_speichern(text, jsonb) to authenticated;
grant execute on function public.rechtstext_entwurf_verwerfen(text) to authenticated;
grant execute on function public.rechtstext_veroeffentlichen(text, boolean, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Lesen: die geltenden Fassungen, für jeden
-- ---------------------------------------------------------------------------

/*
  DIE GELTENDEN FASSUNGEN — auch ohne Anmeldung, denn Impressum und
  Datenschutzerklärung muss jeder lesen können, bevor er ein Konto hat.
  Gibt nur Veröffentlichtes zurück, nie einen Entwurf.
*/
create or replace function public.rechtstexte_aktuell() returns jsonb
  language sql stable
  security definer
  set search_path = ''
as $$
  select coalesce(jsonb_object_agg(t.art, jsonb_build_object(
           'nummer', t.nummer,
           'inhalt', t.inhalt,
           'veroeffentlichtAm', t.veroeffentlicht_am,
           'geprueft', t.geprueft,
           'hinweisen', t.hinweisen,
           'neueVerarbeiter', t.neue_verarbeiter)), '{}'::jsonb)
    from (select distinct on (r.art) r.*
            from public.rechtstexte r
           where r.veroeffentlicht_am is not null
           order by r.art, r.nummer desc) t
$$;

revoke all on function public.rechtstexte_aktuell() from public;
grant execute on function public.rechtstexte_aktuell() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Neue Unterauftragsverarbeiter: die Leitung jedes Betriebs nimmt Kenntnis
-- ---------------------------------------------------------------------------

/*
  WANN DIE LEITUNG ZULETZT KENNTNIS GENOMMEN HAT — am Betrieb, ohne Person:
  wer im Betrieb geklickt hat, braucht niemand (Datenminimierung). Ohne
  Eintrag gilt der Tag, an dem der Betrieb angelegt wurde: was davor galt,
  hat er mit dem Vertrag übernommen.
*/
alter table public.companies add column if not exists verarbeiter_kenntnis_am timestamptz;

/*
  Die Fassungen der Datenschutzerklärung mit neuen Unterauftragsverarbeitern,
  die die Leitung DIESES Betriebs noch nicht zur Kenntnis genommen hat.
  Nur für Geschäftsführung und Administration des eigenen Betriebs — für alle
  anderen eine leere Liste. Ein Supportzugang ist kein Mitglied und sieht
  nichts.
*/
create or replace function public.verarbeiter_aenderungen() returns jsonb
  language sql stable
  security definer
  set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'nummer', r.nummer,
           'veroeffentlichtAm', r.veroeffentlicht_am,
           'neueVerarbeiter', r.neue_verarbeiter) order by r.nummer), '[]'::jsonb)
    from public.users u
    join public.companies c on c.id = u.company_id
    join public.rechtstexte r
      on r.art = 'datenschutz'
     and r.veroeffentlicht_am is not null
     and jsonb_array_length(r.neue_verarbeiter) > 0
     and r.veroeffentlicht_am > coalesce(c.verarbeiter_kenntnis_am, c.created_at)
   where u.id = auth.uid()
     and u.role in ('Geschäftsführung', 'Administrator')
     and app.aktiv()
$$;

create or replace function public.verarbeiter_zur_kenntnis_nehmen() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
begin
  select u.company_id into betrieb from public.users u
   where u.id = auth.uid() and u.role in ('Geschäftsführung', 'Administrator');
  if betrieb is null or not app.aktiv() then
    raise exception 'Zur Kenntnis nimmt die Geschäftsführung oder die Administration des Betriebs'
      using errcode = '42501';
  end if;
  update public.companies set verarbeiter_kenntnis_am = now() where id = betrieb;
end;
$$;

revoke all on function public.verarbeiter_aenderungen() from public, anon;
revoke all on function public.verarbeiter_zur_kenntnis_nehmen() from public, anon;
grant execute on function public.verarbeiter_aenderungen() to authenticated;
grant execute on function public.verarbeiter_zur_kenntnis_nehmen() to authenticated;

-- ---------------------------------------------------------------------------
-- Fassung 1: die Texte, die bis hierher im Quelltext standen — Wort für Wort
-- ---------------------------------------------------------------------------

/*
  Übernommen, wie sie am 05.10.2026 in `src/features/recht/` standen (das
  war ihr „Stand“), als Fassung 1, nicht geprüft. Die Betreiberangaben sind
  leer: auf der Seite stehen dafür wie bisher die eckigen Klammern. Nur
  eingefügt, wenn es noch gar keine Fassung gibt — ein zweiter Lauf ändert
  nichts.
*/
insert into public.rechtstexte (art, nummer, inhalt, veroeffentlicht_am)
select v.art, 1, v.inhalt, timestamptz '2026-10-05 12:00:00+02'
  from (values
    ('betreiber', jsonb_build_object(
      'name', '', 'anschrift', '', 'email', '', 'telefon', '', 'uid', '', 'firmenbuch', '', 'gewerbe', '')),
    ('impressum', jsonb_build_object('abschnitte', jsonb_build_array(
      jsonb_build_object('titel', 'Medieninhaber und Diensteanbieter', 'text',
        E'{Name}\n{Anschrift}\n\nE-Mail: {E-Mail}\nTelefon: {Telefon}'),
      jsonb_build_object('titel', 'Unternehmensangaben', 'text',
        E'Unternehmensgegenstand: Entwicklung und Betrieb der Software „Senklot“ für Installationsbetriebe.\n\n'
        || E'UID-Nummer: {UID-Nummer}\n\nFirmenbuch: {Firmenbuch}\n\nGewerbe und Aufsicht: {Gewerbe}\n\n'
        || 'Anwendbare Vorschriften: Gewerbeordnung, abrufbar unter [www.ris.bka.gv.at](https://www.ris.bka.gv.at).'),
      jsonb_build_object('titel', 'Grundlegende Richtung', 'text',
        'Senklot ist eine Arbeitsanwendung für Installationsbetriebe: Zeiterfassung, Einsätze, Material, '
        || 'Handwerksscheine, Angebote und Rechnungen. Die Inhalte, die ein Betrieb darin führt, verantwortet dieser Betrieb.'),
      jsonb_build_object('titel', 'Streitbeilegung', 'text',
        'Senklot richtet sich an Unternehmen, nicht an Verbraucher. Zur Teilnahme an einem Streitbeilegungsverfahren '
        || 'vor einer Verbraucherschlichtungsstelle ist der Betreiber weder verpflichtet noch bereit.')))),
    ('datenschutz', jsonb_build_object(
      'abschnitte', jsonb_build_array(
        jsonb_build_object('titel', 'Wer verantwortlich ist', 'text',
          'Senklot ist eine Arbeitsanwendung, die ein Installationsbetrieb für sich und seine Mitarbeiter einsetzt. '
          || '**Verantwortlich** für die Daten, die darin geführt werden — Mitarbeiter, Arbeitszeiten, Kunden, Belege —, '
          || 'ist dieser Betrieb (Art. 4 Z 7 DSGVO). Fragen zu diesen Daten und Anträge auf Auskunft oder Löschung '
          || E'richtest du an ihn, in der Regel an deinen Arbeitgeber.\n\n'
          || 'Der Betreiber von Senklot verarbeitet die Daten im Auftrag des Betriebs (Auftragsverarbeiter, Art. 28 DSGVO) '
          || 'auf Grundlage eines Auftragsverarbeitungsvertrags: {Name}, {Anschrift}, {E-Mail}.'),
        jsonb_build_object('titel', 'Welche Daten die App verarbeitet', 'text',
          E'- Dein Konto: Name, E-Mail-Adresse oder Benutzername, Rolle im Betrieb.\n'
          || '- Arbeitszeiten, Einsätze, Urlaube, Zeitausgleich und Krankenstände. Krankenstände sind Gesundheitsdaten '
          || '(Art. 9 DSGVO): sehen können sie nur du selbst und die Personen im Betrieb, deren Rolle es verlangt; '
          || E'nach einer Diagnose fragt die App nicht.\n'
          || '- Wenn der Betrieb es einträgt, dein Geburtsdatum — nur, um die Schutzregeln für Jugendliche unter 18 zu '
          || 'prüfen (KJBG). Sehen können es du selbst sowie Büro und Leitung. Dazu Begründungen des Büros, wenn deine '
          || E'Arbeitszeit eine gesetzliche Grenze überschreitet (etwa Notdienst).\n'
          || E'- Handwerksscheine mit Unterschriften und, wenn aufgenommen, Fotos; Pläne und Dokumente zu Baustellen.\n'
          || E'- Kunden, Angebote, Rechnungen und Zahlungen des Betriebs.\n'
          || '- Prüft das Büro die UID-Nummer eines Kunden, gehen diese Nummer und die UID-Nummer des Betriebs an das '
          || 'Abfragesystem VIES der EU-Kommission; Ergebnis, Zeitpunkt und wer gefragt hat, stehen danach beim '
          || E'Kunden.\n'
          || '- Wenn der Betrieb es erlaubt und du ein Kalender-Abo einrichtest: deine Einsätze samt Kundenname, Adresse '
          || 'und Ansprechpartner gehen an den Kalenderdienst, den du dafür wählst (etwa Google, Apple oder Microsoft). '
          || 'In Senklot steht nur, wann das Abo eingerichtet und zuletzt abgeholt wurde; beenden kannst du es jederzeit. '
          || E'Dasselbe gilt für die Termine, an denen du teilnimmst oder deren Baustelle du an dem Tag hast.\n'
          || '- Richtet die Leitung (Geschäftsführung, Administration, Projektleitung) den ganzen Einsatzplan als '
          || 'Kalender-Abo ein, gehen auch Name und Einsatzort der Mitarbeiter — wer an welchem Tag auf welcher Baustelle '
          || 'ist, mit Uhrzeit und Einstufung — sowie die Termine des Betriebs an deren Kalenderdienst. Abwesenheiten wie '
          || 'Urlaub oder Krankenstand stehen nicht darin. Das Abo endet, sobald die Person die Einsatzplanung nicht mehr '
          || E'sieht.\n'
          || E'- Wenn du Push-Meldungen erlaubst: eine Kennung deines Geräts.\n'
          || '- Ein Fehlerprotokoll: stürzt die App ab, werden Fehlermeldung, Ansicht, Fassung der App und Gerätetyp '
          || 'festgehalten — ohne Inhalte, Namen oder Kennungen. Was du unter „Problem melden“ selbst schreibst, geht mit '
          || 'deinem Namen und deiner E-Mail-Adresse an den Senklot-Support, damit er nachfragen kann. Beides liest nur '
          || E'der Support, nicht der Betrieb.\n'
          || '- Wenn der Betrieb dem Senklot-Support befristet Einblick oder Mitarbeit gewährt: wer wann welchen Bereich '
          || 'geöffnet hat. Zeitbuchungen, Urlaube und Krankenstände sind davon ausgenommen.'),
        jsonb_build_object('titel', 'Wozu', 'text',
          'Um die Arbeit des Betriebs zu organisieren und abzurechnen: Arbeitszeitaufzeichnung, Lohnverrechnung, '
          || 'Einsatzplanung, Leistungsnachweise und Rechnungen. Rechtsgrundlage ist in der Regel das Arbeitsverhältnis '
          || 'und die gesetzliche Aufzeichnungspflicht (Art. 6 Abs. 1 lit. b und c, für Krankenstände Art. 9 Abs. 2 lit. b '
          || 'DSGVO), für das Fehlerprotokoll das berechtigte Interesse an einer funktionierenden Anwendung (Art. 6 Abs. 1 '
          || 'lit. f DSGVO).'),
        jsonb_build_object('titel', 'Auf deinem Gerät', 'text',
          'Die App speichert im Browser, was sie zum Arbeiten braucht: die Anmeldung, einen Zwischenstand für die Arbeit '
          || 'ohne Empfang und Buchungen, die noch nicht gesendet werden konnten. Es gibt keine Werbe- oder '
          || 'Analyse-Cookies, keine Reichweitenmessung und kein Tracking. Die Schriften werden von der App selbst '
          || 'ausgeliefert, nicht von einem fremden Dienst.'),
        jsonb_build_object('titel', 'Wer die Daten technisch verarbeitet', 'text',
          E'Der Betreiber setzt diese Unterauftragsverarbeiter ein:\n\n{Unterauftragsverarbeiter}\n\n'
          || 'Wo ein Anbieter oder seine Muttergesellschaft ihren Sitz in den USA hat, stützt sich die Übermittlung auf '
          || 'das EU-US Data Privacy Framework bzw. auf Standardvertragsklauseln der EU-Kommission.'),
        jsonb_build_object('titel', 'Wie lange', 'text',
          'Solange der Betrieb die Daten führt und gesetzliche Aufbewahrungsfristen es verlangen (etwa sieben Jahre für '
          || 'Buchhaltungsbelege und Arbeitszeitaufzeichnungen nach § 132 BAO). Verlangst du die Löschung, entfernt der '
          || 'Betrieb sofort, was keiner Aufbewahrung unterliegt; der Rest bleibt gesperrt, bis die Frist abgelaufen ist. '
          || 'Sicherungen im eigenen Rechenzentrum werden nach 30 Tagen gelöscht, die Kopie außer Haus nach der '
          || 'Ablauffrist beim Anbieter der Sicherung (vorgesehen 90 Tage); das Fehlerprotokoll nach 90 Tagen. Endet die '
          || 'Nutzung durch den Betrieb, werden seine Daten nach Rückgabe gelöscht, wie im Auftragsverarbeitungsvertrag '
          || 'vereinbart.'),
        jsonb_build_object('titel', 'Deine Rechte', 'text',
          'Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, '
          || 'Datenübertragbarkeit und Widerspruch. Wende dich dafür an den Betrieb, für den du die App nutzt — die '
          || 'Auskunft kann er dir als Datei aus der App geben. Beschwerden kannst du bei der Österreichischen '
          || 'Datenschutzbehörde einbringen: Barichgasse 40–42, 1030 Wien, dsb@dsb.gv.at.')),
      'verarbeiter', jsonb_build_array(
        jsonb_build_object('wer', 'Supabase Inc.',
          'wofuer', 'Datenbank, Anmeldung und Dateispeicher (Fotos, Pläne, Unterschriften)',
          'wo', 'Rechenzentrum in der EU (Frankfurt am Main) — Region im Produktivprojekt zu bestätigen'),
        jsonb_build_object('wer', 'Google Ireland Ltd. (Firebase Hosting)',
          'wofuer', 'Auslieferung der App an den Browser; dabei wird die IP-Adresse verarbeitet',
          'wo', 'weltweites Auslieferungsnetz, Google LLC in den USA als Mutterunternehmen'),
        jsonb_build_object('wer', 'Google Ireland Ltd. (Firebase Cloud Messaging)',
          'wofuer', 'Push-Meldungen auf das Gerät, wenn sie erlaubt wurden: Gerätekennung und Text der Meldung',
          'wo', 'Google LLC in den USA als Mutterunternehmen'),
        jsonb_build_object('wer', '[Anbieter der Sicherung außer Haus — wird ergänzt]',
          'wofuer', 'nächtliche Sicherung des gesamten Bestands eines Betriebs, nach der Ablauffrist beim Anbieter gelöscht (vorgesehen 90 Tage)',
          'wo', '[Standort — wird ergänzt]'),
        jsonb_build_object('wer', '[Mailanbieter — wird ergänzt]',
          'wofuer', 'Einladungs- und Rücksetzmails zur Anmeldung',
          'wo', '[Standort — wird ergänzt]'))))
  ) as v(art, inhalt)
 where not exists (select 1 from public.rechtstexte r where r.art = v.art);
