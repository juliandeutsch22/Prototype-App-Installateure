/*
  AUFTRAGSEINGANG (M02b, A03 und A11, 07.11.2026)

  WAS FEHLTE. Ein Auftrag kam bisher nur auf zwei Wegen in die App: als
  angenommenes Angebot oder als „Neue Baustelle“, die nur die Führung anlegen
  darf. Was am Telefon, per Mail, von der Hausverwaltung oder der Versicherung
  hereinkam, stand bis dahin auf einem Zettel — ohne Quelle, ohne die
  Schadens- oder Auftragsnummer des Auftraggebers, ohne Stand. Die Verwaltung,
  die das Telefon abnimmt, konnte gar nichts festhalten.

  WAS SICH ÄNDERT.
  - `auftragseingaenge`: ein Eingang mit Pflichtangaben (Quelle, Anliegen,
    Kunde oder Angaben zu einem neuen Kunden), Ort, Ansprechpartner vor Ort,
    Dringlichkeit, Wunschtermin und der Nummer des Auftraggebers, dazu eine
    eigene Nummer aus einem neuen Nummernkreis („EG-2026-0001“).
  - Erfassen und ändern das Büro: Verwaltung, Buchhaltung, Projektleitung,
    Geschäftsführung, Administration — jede Rolle, die Kunden liest
    (`customers_lesen`), also jede außer dem Monteur. Geändert wird nur,
    solange der Eingang offen ist.
  - Umwandeln nur über Funktionen, jede in EINEM Zug:
      `eingang_zu_baustelle`  Kunde (falls neu), Baustelle mit Nummer aus dem
                              Zähler der Baustellen, Eingang „übernommen“;
      `eingang_zu_angebot`    Kunde (falls neu), Angebotsentwurf über
                              `angebot_speichern` mit Nummer aus dem Zähler
                              der Angebote, Eingang „übernommen“;
      `eingang_ablehnen`, `eingang_wieder_oeffnen`, `eingang_kunde_anlegen`.
    Umwandeln darf die Führung, wie heute Baustellen und Angebote anlegen.
  - Die Unterfähigkeit `baustellen.auftragseingang` (Standard an) steht unter
    dem neuen KERN des Registers: Kunden und Baustellen sind nicht
    abschaltbar (E51, V1), ihre Teile schon. Erfassen und jede Funktion
    prüfen sie auf dem Server (E51, V3).
  - Änderungsjournal (M01b) mit der Objektart `eingang`, Datenauskunft und
    Löschung eines Kunden.

  WAS NICHT GEBAUT IST — und warum: ein IMPORT aus den Portalen der
  Hausverwaltungen und Versicherungen. Ohne Formatbeschreibung oder
  Beispieldateien der Auftraggeber wäre jeder Leser erfunden; das liegt bei
  den Auftraggebern bzw. dem Pilotbetrieb (Nachweisregister). Erfassen und
  Umwandeln sind vollständig.

  Bestehende Migrationen bleiben unberührt; was sich an vorhandenen
  Funktionen ändert, steht hier als neue Fassung mit dem alten Rumpf und der
  Ergänzung (jeweils gesagt, welche).
*/

-- ---------------------------------------------------------------------------
-- 1. Der Nummernkreis der Eingänge
-- ---------------------------------------------------------------------------

/*
  Der Zähler kennt bisher Rechnungen, Angebote und Baustellen
  (`20260918100000_praefixe.sql`). Ohne die vierte Art scheiterte die erste
  Eingangsnummer an der Prüfregel statt mit einem Grund.
*/
alter table public.number_counters drop constraint if exists number_counters_art_check;
alter table public.number_counters
  add constraint number_counters_art_check
  check (art in ('invoices', 'quotes', 'projects', 'eingaenge'));

-- ---------------------------------------------------------------------------
-- 2. Das Register auf dem Server bekommt den Kern (E51 V1, E56)
-- ---------------------------------------------------------------------------

/*
  DIESELBE LISTE WIE `MODULE` UND `KERN` in `src/lib/module.ts` — Rumpf wie
  in `20261106400000_angebot_annahme_link.sql`, dazu die Kernbereiche
  `baustellen` und `kunden` und die Unterfähigkeit
  `baustellen.auftragseingang`. Die Kernbereiche stehen mit Standard „an“
  darin, damit eine Unterfähigkeit unter ihnen dieselbe Regel findet wie
  unter einem Modul (Teil vor dem Punkt); abschaltbar macht sie das nicht —
  das sagt `app.modul_kern()`. `tests/supabase/modulRegisterServer.test.ts`
  vergleicht beide Listen mit der App.
*/
create or replace function app.modul_register()
  returns table (kennung text, standard boolean, abhaengig_von text[])
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  values
    ('baustellen', true, '{}'::text[]),
    ('baustellen.auftragseingang', true, '{}'::text[]),
    ('kunden', true, '{}'::text[]),
    ('einsatzplanung', true, '{}'::text[]),
    ('material', true, '{}'::text[]),
    ('urlaub', true, '{}'::text[]),
    ('scheine', true, '{}'::text[]),
    ('angebote', true, '{}'::text[]),
    ('angebote.online_annahme', true, '{}'::text[]),
    ('rechnungen', true, '{}'::text[]),
    ('nachkalkulation', true, '{rechnungen}'::text[]),
    ('wartung', true, '{}'::text[]),
    ('zeitkonten', true, '{}'::text[])
$$;

revoke all on function app.modul_register() from public, anon, authenticated;

/*
  DER KERN: immer an, gleich was in `companies.modules` steht. Eine
  Festlegung `{"baustellen": false}` — von Hand in die Datenbank geschrieben
  oder aus einer alten Sicherung — schaltet nichts ab; die App liest sie
  ebenso nicht (`aktiveSchalter`).
*/
create or replace function app.modul_kern()
  returns setof text
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  values ('baustellen'), ('kunden')
$$;

revoke all on function app.modul_kern() from public, anon, authenticated;

/* Rumpf wie in `20261106400000_angebot_annahme_link.sql`; neu ist allein der Kern (Stufe 2). */
create or replace function app.modul_aktiv(p_betrieb text, p_schalter text)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  festlegung jsonb;
  an text[];
  knoten record;
  geaendert boolean := true;
begin
  select c.modules into festlegung from public.companies c where c.id = p_betrieb;

  select coalesce(array_agg(r.kennung), '{}'::text[]) into an
    from app.modul_register() r
   where r.kennung in (select app.modul_kern())
      or case jsonb_typeof(festlegung -> r.kennung)
           when 'boolean' then (festlegung ->> r.kennung)::boolean
           when 'number' then (festlegung ->> r.kennung)::numeric <> 0
           when 'string' then (festlegung ->> r.kennung) <> ''
           when 'object' then true
           when 'array' then true
           else r.standard
         end;

  while geaendert loop
    geaendert := false;
    for knoten in
      select r.kennung,
             r.abhaengig_von || case when position('.' in r.kennung) > 0
                                     then array[split_part(r.kennung, '.', 1)]
                                     else '{}'::text[] end as braucht
        from app.modul_register() r
    loop
      if knoten.kennung = any(an) and not (knoten.braucht <@ an) then
        an := array_remove(an, knoten.kennung);
        geaendert := true;
      end if;
    end loop;
  end loop;

  return p_schalter = any(an);
end;
$$;

revoke all on function app.modul_aktiv(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Die Tabelle
-- ---------------------------------------------------------------------------

/*
  - `id` ist eine UUID und keine Zählnummer: der Rücklauf spielt die Zeilen
    mit ihrer Kennung zurück.
  - `nummer` vergibt die Datenbank beim Anlegen (Zähler `eingaenge`); nur der
    Rücklauf bringt sie mit.
  - KUNDE ODER NEUER KUNDE: `customer_id` zeigt auf einen vorhandenen Kunden;
    sonst tragen die Spalten `neukunde_*` die Angaben, aus denen beim
    Umwandeln (oder mit „Kunde anlegen“) der Kunde wird — danach sind sie
    leer, der Kunde trägt sie. `kunde_name` ist der Name zum Anzeigen und
    Suchen (wie `customer_name` an der Baustelle); er kommt aus dem Kunden
    bzw. aus `neukunde_name` und wird nur von der Datenbank gesetzt.
  - Die Verweise lassen den Eingang stehen, wenn ihr Ziel geht
    (`on delete set null`): ein übernommener Eingang belegt, woher eine
    Baustelle oder ein Angebot kam. Ist das Ziel gelöscht (ein verworfener
    Angebotsentwurf), lässt sich der Eingang wieder öffnen. Einen gelöschten
    Kunden ersetzt man durch einen anderen; die Löschung nach DSGVO räumt
    selbst (`person_loeschen`, unten).
  - KEIN FREMDSCHLÜSSEL AUF DIE PERSONEN (wie E50, M01b, M02a): wer erfasst,
    bearbeitet, abgelehnt oder übernommen hat, bleibt stehen, auch wenn das
    Konto geht; der Name daneben ist der zum Zeitpunkt.
  - `dringlichkeit_rang` rechnet die Datenbank: die Liste sortiert auf dem
    Server — Notfall, dringend, normal, dann nach Eingang —, sonst stünde
    ein Notfall von gestern auf Seite zwei. Eine gewöhnliche Spalte, die ein
    Auslöser setzt und eine Prüfregel festhält, keine berechnete: der
    Rücklauf schreibt jede Spalte zurück, und in eine berechnete Spalte
    nimmt Postgres keinen Wert an.
*/
create table if not exists public.auftragseingaenge (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  nummer text not null,
  stand text not null default 'offen',
  quelle text not null,
  auftraggeber_nummer text,
  customer_id uuid references public.customers(id) on delete set null,
  kunde_name text,
  neukunde_name text,
  neukunde_strasse text,
  neukunde_plz text,
  neukunde_ort text,
  neukunde_telefon text,
  neukunde_email text,
  ort text,
  ansprechpartner_name text,
  ansprechpartner_telefon text,
  anliegen text not null,
  dringlichkeit text not null default 'normal',
  dringlichkeit_rang smallint not null default 2,
  wunschtermin date,
  eingegangen_am timestamptz not null default now(),
  project_id uuid references public.projects(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  termin_id uuid references public.termine(id) on delete set null,
  abgelehnt_grund text,
  abgelehnt_am timestamptz,
  abgelehnt_von_uid uuid,
  abgelehnt_von_name text,
  uebernommen_am timestamptz,
  uebernommen_von_uid uuid,
  uebernommen_von_name text,
  erfasst_von_uid uuid,
  erfasst_von_name text,
  bearbeitet_am timestamptz,
  bearbeitet_von_uid uuid,
  bearbeitet_von_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auftragseingaenge_stand check (stand in ('offen', 'uebernommen', 'abgelehnt')),
  constraint auftragseingaenge_quelle check (quelle in ('telefon', 'email', 'hausverwaltung', 'versicherung', 'persoenlich', 'sonstige')),
  constraint auftragseingaenge_dringlichkeit check (dringlichkeit in ('normal', 'dringend', 'notfall')),
  constraint auftragseingaenge_rang check (
    dringlichkeit_rang = case dringlichkeit when 'notfall' then 0 when 'dringend' then 1 else 2 end),
  constraint auftragseingaenge_anliegen check (btrim(anliegen) <> '' and char_length(anliegen) <= 4000),
  constraint auftragseingaenge_laengen check (
    char_length(coalesce(auftraggeber_nummer, '')) <= 80
    and char_length(coalesce(neukunde_name, '')) <= 200
    and char_length(coalesce(ort, '')) <= 300
    and char_length(coalesce(abgelehnt_grund, '')) <= 1000),
  constraint auftragseingaenge_abgelehnt check (stand <> 'abgelehnt' or (abgelehnt_grund is not null and abgelehnt_am is not null)),
  constraint auftragseingaenge_uebernommen check (stand <> 'uebernommen' or uebernommen_am is not null)
);

comment on table public.auftragseingaenge is
  'Auftragseingang (M02b, A03/A11): Anfragen und Aufträge mit Quelle, Nummer des Auftraggebers, Kunde oder Angaben zu einem neuen Kunden, Ort, Ansprechpartner, Anliegen, Dringlichkeit — offen, übernommen (Baustelle oder Angebot) oder abgelehnt. Erfassen und ändern das Büro; umwandeln nur die Funktionen eingang_*.';
comment on column public.auftragseingaenge.auftraggeber_nummer is
  'Auftrags- bzw. Schadensnummer des Auftraggebers (Hausverwaltung, Versicherung).';
comment on column public.auftragseingaenge.kunde_name is
  'Name des Kunden bzw. des neuen Kunden — setzt die Datenbank (zum Anzeigen und Suchen).';
comment on column public.auftragseingaenge.ort is
  'Adresse des Einsatzes; Vorgabe in der App ist die Anschrift des Kunden.';
comment on column public.auftragseingaenge.dringlichkeit_rang is
  'Rechnet die Datenbank: 0 Notfall, 1 dringend, 2 normal — für die Reihenfolge der Liste.';

create unique index if not exists auftragseingaenge_nummer on public.auftragseingaenge (company_id, nummer);
-- Die Liste: Betrieb, Stand, Dringlichkeit, Eingang.
create index if not exists auftragseingaenge_liste
  on public.auftragseingaenge (company_id, stand, dringlichkeit_rang, eingegangen_am);
create index if not exists auftragseingaenge_kunde on public.auftragseingaenge (customer_id) where customer_id is not null;
create index if not exists auftragseingaenge_baustelle on public.auftragseingaenge (project_id) where project_id is not null;
create index if not exists auftragseingaenge_angebot on public.auftragseingaenge (quote_id) where quote_id is not null;
create index if not exists auftragseingaenge_termin on public.auftragseingaenge (termin_id) where termin_id is not null;
create index if not exists auftragseingaenge_erfasst on public.auftragseingaenge (company_id, erfasst_von_uid);

/*
  DER ZÄHLER LIEST AUCH DIE EINGÄNGE — Rumpf wie in
  `20260929150000_stornorechnung.sql`, dazu der Zweig `eingaenge`. Fehlt die
  Zeile im Zähler (etwa nach einem Rücklauf ohne sie), beginnt er nicht bei
  eins, sondern hinter der höchsten vergebenen Nummer.
*/
create or replace function app.hoechste_lfd(p_art text, p_betrieb text, p_jahr integer)
  returns integer
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(max(lfd), 0)::integer from (
    select (regexp_match(i.invoice_number, '(?:^|-)' || p_jahr || '-(\d+)$'))[1]::bigint as lfd
      from public.invoices i
     where p_art = 'invoices' and i.company_id = p_betrieb
    union all
    select (regexp_match(i.storno_nummer, '(?:^|-)' || p_jahr || '-(\d+)$'))[1]::bigint
      from public.invoices i
     where p_art = 'invoices' and i.company_id = p_betrieb and i.storno_nummer is not null
    union all
    select (regexp_match(q.quote_number, '(?:^|-)' || p_jahr || '-(\d+)$'))[1]::bigint
      from public.quotes q
     where p_art = 'quotes' and q.company_id = p_betrieb
    union all
    select (regexp_match(p.project_number, '(?:^|-)' || p_jahr || '-(\d+)$'))[1]::bigint
      from public.projects p
     where p_art = 'projects' and p.company_id = p_betrieb
    union all
    select (regexp_match(e.nummer, '(?:^|-)' || p_jahr || '-(\d+)$'))[1]::bigint
      from public.auftragseingaenge e
     where p_art = 'eingaenge' and e.company_id = p_betrieb
  ) x
  where lfd is not null and lfd < 2147483647
$$;

revoke all on function app.hoechste_lfd(text, text, integer) from public, anon;

/*
  EINGANGSNUMMERN ZIEHT NUR DAS ERFASSEN. Rumpf wie in
  `20261106400000_angebot_annahme_link.sql`; neu ist allein die erste
  Prüfung: `naechste_nummer` vergibt die drei Kreise der App. Eine Nummer
  des Eingangskreises, die jemand über die Schnittstelle zöge, würde nie ein
  Eingang — der Kreis bekäme Löcher, die niemand erklären kann. Eine
  unbekannte Art scheiterte vorher an der Prüfregel des Zählers; jetzt mit
  einem Satz.
*/
create or replace function public.naechste_nummer(
  p_art text,
  p_jahr integer,
  p_seed integer default 0,
  p_wunsch integer default null
) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
begin
  betrieb := app.arbeitsbetrieb();
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_art is null or p_art not in ('invoices', 'quotes', 'projects') then
    raise exception 'Diesen Nummernkreis vergibt die App selbst beim Anlegen' using errcode = '42501';
  end if;
  /*
    RECHNUNGSNUMMERN NICHT FÜR DEN SUPPORT. Eine Rechnung legt er nicht an —
    sie greift in die Zeitbuchungen, und die bleiben ihm verschlossen. Eine
    Nummer, die er zöge, würde deshalb nie eine Rechnung; in einer
    lückenlosen Folge wäre sie ein Loch, das der Betrieb dem Finanzamt
    erklären müsste.
  */
  if p_art = 'invoices' and app.ist_plattform() then
    raise exception 'Rechnungsnummern vergibt nur der Betrieb selbst — Rechnungen gehen im Supportzugang nicht'
      using errcode = '42501';
  end if;
  if p_art = 'invoices' and not app.ist_buch_oder_spitze() then
    raise exception 'Nur die Buchhaltung vergibt Rechnungsnummern' using errcode = '42501';
  end if;
  if p_art = 'quotes' and not (app.ist_fuehrung() or app.ist_buch_oder_spitze()) then
    raise exception 'Nur die Führung vergibt Angebotsnummern' using errcode = '42501';
  end if;
  if p_art = 'projects' and not app.ist_fuehrung() then
    raise exception 'Nur die Führung vergibt Baustellennummern' using errcode = '42501';
  end if;

  return app.naechste_nummer_kern(betrieb, p_art, p_jahr, p_wunsch);
end;
$$;

/*
  LESEN: im eigenen Betrieb jede Rolle außer dem Monteur — dieselbe Menge,
  die Kunden liest (`customers_lesen`), und aus demselben Grund: ein Eingang
  ist eine Kundenangelegenheit, die das Büro annimmt. Der Support liest mit
  Einblick mit, wie bei den Kunden — wer einen Eingang „verschwunden“ meldet,
  dem soll er helfen können.

  SCHREIBEN: das Büro im eigenen Betrieb — nicht der Support, auch nicht mit
  „mitarbeiten“: ein Eingang ist eine Erklärung eines Kunden an den Betrieb,
  und die Umwandlung legt Baustellen und Angebote an. Geändert wird nur ein
  offener Eingang; Stand, Verweise und die Vermerke wer/wann setzen nur die
  Funktionen und die Auslöser (Spaltenrechte unten). Löschen nur die
  Führung, nur offene und abgelehnte: ein übernommener Eingang belegt, woher
  eine Baustelle bzw. ein Angebot kam.
*/
alter table public.auftragseingaenge enable row level security;
revoke all on public.auftragseingaenge from public, anon, authenticated;
grant select, delete on public.auftragseingaenge to authenticated;
grant insert (company_id, quelle, auftraggeber_nummer, customer_id, neukunde_name, neukunde_strasse, neukunde_plz,
              neukunde_ort, neukunde_telefon, neukunde_email, ort, ansprechpartner_name, ansprechpartner_telefon,
              anliegen, dringlichkeit, wunschtermin, eingegangen_am)
  on public.auftragseingaenge to authenticated;
grant update (quelle, auftraggeber_nummer, customer_id, neukunde_name, neukunde_strasse, neukunde_plz,
              neukunde_ort, neukunde_telefon, neukunde_email, ort, ansprechpartner_name, ansprechpartner_telefon,
              anliegen, dringlichkeit, wunschtermin, eingegangen_am, termin_id)
  on public.auftragseingaenge to authenticated;

drop policy if exists auftragseingaenge_lesen on public.auftragseingaenge;
create policy auftragseingaenge_lesen on public.auftragseingaenge for select
  using (
    (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()))
    and (select app.rolle()) is distinct from 'Mitarbeiter'
  );

drop policy if exists auftragseingaenge_erfassen on public.auftragseingaenge;
create policy auftragseingaenge_erfassen on public.auftragseingaenge for insert
  with check (
    company_id = (select app.lesebetrieb())
    and (select app.hat_rolle(array['Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']))
  );

drop policy if exists auftragseingaenge_aendern on public.auftragseingaenge;
create policy auftragseingaenge_aendern on public.auftragseingaenge for update
  using (
    company_id = (select app.lesebetrieb())
    and (select app.hat_rolle(array['Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']))
    and stand = 'offen'
  )
  with check (
    company_id = (select app.lesebetrieb())
    and (select app.hat_rolle(array['Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']))
    and stand = 'offen'
  );

drop policy if exists auftragseingaenge_loeschen on public.auftragseingaenge;
create policy auftragseingaenge_loeschen on public.auftragseingaenge for delete
  using (
    company_id = (select app.lesebetrieb())
    and (select app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator']))
    and stand in ('offen', 'abgelehnt')
  );

/*
  `support_schreibt_nicht` und nicht `support_niemals`: der Support darf
  lesen (oben), also gilt der Riegel der lesbaren Tabellen. Schreiben kann
  er trotzdem nicht — die Regeln kennen nur den eigenen Betrieb, und die
  Funktionen verlangen ihn ebenso.
*/
drop trigger if exists auftragseingaenge_kein_support_schreiben on public.auftragseingaenge;
create trigger auftragseingaenge_kein_support_schreiben
  before insert or update or delete on public.auftragseingaenge
  for each row execute function app.support_schreibt_nicht();

drop trigger if exists auftragseingaenge_betrieb_fest on public.auftragseingaenge;
create trigger auftragseingaenge_betrieb_fest
  before update on public.auftragseingaenge
  for each row execute function app.betrieb_unveraenderlich();

/* Die Reihenfolge der Dringlichkeit — nur aus `dringlichkeit`, siehe oben. */
create or replace function app.eingang_rang() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.dringlichkeit_rang := case new.dringlichkeit when 'notfall' then 0 when 'dringend' then 1 else 2 end;
  return new;
end;
$$;

revoke all on function app.eingang_rang() from public, anon, authenticated;

drop trigger if exists auftragseingaenge_rang on public.auftragseingaenge;
create trigger auftragseingaenge_rang
  before insert or update on public.auftragseingaenge
  for each row execute function app.eingang_rang();

drop trigger if exists auftragseingaenge_updated_at on public.auftragseingaenge;
create trigger auftragseingaenge_updated_at
  before update on public.auftragseingaenge
  for each row execute function app.updated_at_setzen();

-- ---------------------------------------------------------------------------
-- 4. Was die Datenbank beim Erfassen und Ändern selbst setzt und prüft
-- ---------------------------------------------------------------------------

/*
  ERFASSEN: Nummer, wer erfasst hat, Modul und Pflichtangaben.

  - Die NUMMER kommt aus dem Zähler `eingaenge` mit dem Vorsatz „EG“ —
    fest, nicht je Betrieb einstellbar wie bei Rechnung, Angebot und
    Baustelle: diese Nummer verlässt den Betrieb nie (kein Beleg, kein PDF,
    kein Export), und die Vorsätze der Belege gibt es, weil Belegnummern
    beim Kunden, im Dateinamen und bei der Kanzlei stehen.
  - Der RÜCKLAUF (Dienstschlüssel mit Nummer) bringt die Zeile, wie sie war.
  - Das MODUL zählt beim Erfassen (E51, V3); abgeschaltet entsteht kein
    neuer Eingang.
  - KUNDE ODER NEUER KUNDE ist Pflicht — ohne beides wüsste beim Umwandeln
    niemand, für wen.
*/
create or replace function app.eingang_anlegen_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  jahr integer;
  lfd integer;
begin
  if app.ist_dienst() and new.nummer is not null then
    return new;
  end if;
  if not app.ist_dienst() then
    if not app.modul_aktiv(new.company_id, 'baustellen.auftragseingang') then
      raise exception 'Der Auftragseingang ist in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
        using errcode = '55000';
    end if;
    if new.customer_id is null and nullif(btrim(coalesce(new.neukunde_name, '')), '') is null then
      raise exception 'Bitte einen Kunden wählen oder den Namen eines neuen Kunden angeben'
        using errcode = '22023';
    end if;
    new.stand := 'offen';
    new.erfasst_von_uid := auth.uid();
    new.erfasst_von_name := (select u.name from public.users u where u.id = auth.uid());
  end if;
  -- Das Jahr des Erfassens, wie bei den übrigen Kreisen — auch für einen Eingang „von gestern“.
  jahr := extract(year from now() at time zone 'Europe/Vienna');
  lfd := app.naechste_nummer_kern(new.company_id, 'eingaenge', jahr, null);
  new.nummer := app.belegnummer('EG', jahr, lfd);
  return new;
end;
$$;

revoke all on function app.eingang_anlegen_pruefen() from public, anon, authenticated;

drop trigger if exists auftragseingaenge_anlegen on public.auftragseingaenge;
create trigger auftragseingaenge_anlegen
  before insert on public.auftragseingaenge
  for each row execute function app.eingang_anlegen_pruefen();

/*
  DER KUNDE: nur einer aus diesem Betrieb, und sein Name steht zum Anzeigen
  und Suchen am Eingang (sonst brauchte jede Zeile der Liste eine zweite
  Abfrage). Ohne Kunden steht dort der Name des neuen Kunden. Wird der Kunde
  gelöscht (`on delete set null`), bleibt der Name stehen wie an einer
  Baustelle — der Eingang zeigt dann, für wen er war, und verlangt vor dem
  Umwandeln einen Kunden.
*/
create or replace function app.eingang_kunde_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  kundenname text;
begin
  -- Der Rücklauf bringt die Zeile, wie sie war (die Reihenfolge der Tabellen kennt er nicht).
  if app.ist_dienst() and tg_op = 'INSERT' and new.kunde_name is not null then
    return new;
  end if;
  if new.customer_id is not null then
    select c.name into kundenname from public.customers c
     where c.id = new.customer_id and c.company_id = new.company_id;
    if kundenname is null then
      raise exception 'Diesen Kunden gibt es in diesem Betrieb nicht.' using errcode = '23503';
    end if;
    new.kunde_name := kundenname;
  elsif nullif(btrim(coalesce(new.neukunde_name, '')), '') is not null then
    new.kunde_name := btrim(new.neukunde_name);
  elsif tg_op = 'INSERT' then
    new.kunde_name := null;
  end if;
  return new;
end;
$$;

revoke all on function app.eingang_kunde_pruefen() from public, anon, authenticated;

drop trigger if exists auftragseingaenge_kunde on public.auftragseingaenge;
create trigger auftragseingaenge_kunde
  before insert or update of customer_id, neukunde_name on public.auftragseingaenge
  for each row execute function app.eingang_kunde_pruefen();

/*
  EIN UMBENANNTER KUNDE heißt auch an seinen Eingängen so — wie an seinen
  Baustellen (`kundenname_nachziehen`). Als Auslöser am Kunden und nicht in
  `kunde_umbenennen`: jeder Weg, der den Namen ändert, zieht so nach, auch
  die Übernahme aus einer Datei und der Support mit „mitarbeiten“.
*/
create or replace function app.eingang_kundenname_nachziehen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.auftragseingaenge e
     set kunde_name = new.name
   where e.company_id = new.company_id and e.customer_id = new.id
     and e.kunde_name is distinct from new.name;
  return null;
end;
$$;

revoke all on function app.eingang_kundenname_nachziehen() from public, anon, authenticated;

drop trigger if exists customers_eingaenge_name on public.customers;
create trigger customers_eingaenge_name
  after update of name on public.customers
  for each row when (new.name is distinct from old.name)
  execute function app.eingang_kundenname_nachziehen();

/*
  ÄNDERN: wer zuletzt geändert hat, der Termin aus diesem Betrieb, und das
  Modul.

  DAS MODUL zählt, wenn jemand die Angaben eines offenen Eingangs wirklich
  ändert. Nicht dagegen, wenn die Funktionen den Stand setzen (sie prüfen
  selbst), wenn die Löschung eines Kunden Kontaktdaten entfernt (DSGVO geht
  vor dem Modul) oder wenn das Löschen eines Kunden den Verweis leert.
*/
create or replace function app.eingang_aendern_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  inhalt_geaendert boolean;
begin
  if app.ist_dienst() or auth.uid() is null then
    return new;
  end if;
  if new.termin_id is not null and new.termin_id is distinct from old.termin_id and not exists (
       select 1 from public.termine t where t.id = new.termin_id and t.company_id = new.company_id) then
    raise exception 'Diesen Termin gibt es in diesem Betrieb nicht.' using errcode = '23503';
  end if;
  inhalt_geaendert :=
    (new.quelle, new.auftraggeber_nummer, new.neukunde_name, new.neukunde_strasse, new.neukunde_plz,
     new.neukunde_ort, new.neukunde_telefon, new.neukunde_email, new.ort, new.ansprechpartner_name,
     new.ansprechpartner_telefon, new.anliegen, new.dringlichkeit, new.wunschtermin, new.eingegangen_am,
     new.termin_id)
    is distinct from
    (old.quelle, old.auftraggeber_nummer, old.neukunde_name, old.neukunde_strasse, old.neukunde_plz,
     old.neukunde_ort, old.neukunde_telefon, old.neukunde_email, old.ort, old.ansprechpartner_name,
     old.ansprechpartner_telefon, old.anliegen, old.dringlichkeit, old.wunschtermin, old.eingegangen_am,
     old.termin_id)
    or (new.customer_id is not null and new.customer_id is distinct from old.customer_id);
  if old.stand = 'offen' and new.stand = 'offen' and inhalt_geaendert
     and not app.modul_aktiv(new.company_id, 'baustellen.auftragseingang') then
    raise exception 'Der Auftragseingang ist in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;
  -- Wer den Kunden umbenennt, hat am Eingang nichts bearbeitet — nur der Name zieht nach.
  if inhalt_geaendert or new.stand is distinct from old.stand or new.customer_id is distinct from old.customer_id then
    new.bearbeitet_am := now();
    new.bearbeitet_von_uid := auth.uid();
    new.bearbeitet_von_name := (select u.name from public.users u where u.id = auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function app.eingang_aendern_pruefen() from public, anon, authenticated;

drop trigger if exists auftragseingaenge_aendern on public.auftragseingaenge;
create trigger auftragseingaenge_aendern
  before update on public.auftragseingaenge
  for each row execute function app.eingang_aendern_pruefen();

-- ---------------------------------------------------------------------------
-- 5. Die Funktionen
-- ---------------------------------------------------------------------------

/*
  DER KUNDE EINES EINGANGS — vorhanden, oder aus den Angaben zum neuen
  Kunden angelegt. Für ihn gelten die Kundenrechte (`darf_kunden_pflegen`):
  wer sie nicht hat, bekommt einen Satz, der es sagt, und es entsteht nichts.
  Danach sind die Angaben am Eingang leer — der Kunde trägt sie, und eine
  zweite Kopie von Anschrift und Telefon wäre Datenhaltung ohne Zweck.
  Keine eigene Rechte- und Modulprüfung: die hat der Aufrufer.
*/
create or replace function app.eingang_kunde(p_eingang uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  e public.auftragseingaenge;
  kunde uuid;
begin
  select * into e from public.auftragseingaenge where id = p_eingang;
  if e.customer_id is not null then
    if not exists (select 1 from public.customers c where c.id = e.customer_id and c.company_id = e.company_id) then
      raise exception 'Den Kunden dieses Eingangs gibt es nicht mehr — bitte einen Kunden wählen' using errcode = '23503';
    end if;
    return e.customer_id;
  end if;
  if nullif(btrim(coalesce(e.neukunde_name, '')), '') is null then
    raise exception 'Der Eingang % hat keinen Kunden — bitte einen Kunden wählen oder die Angaben zum neuen Kunden ergänzen', e.nummer
      using errcode = '22023';
  end if;
  if app.darf_kunden_pflegen() is not true then
    raise exception 'Einen neuen Kunden anlegen darf nur, wer Kunden pflegen darf — bitte einen vorhandenen Kunden wählen oder die Geschäftsführung um das Recht „Kunden pflegen“ bitten'
      using errcode = '42501';
  end if;
  insert into public.customers (company_id, name, strasse, plz, ort, contact_phone, email)
  values (e.company_id, btrim(e.neukunde_name),
          nullif(btrim(coalesce(e.neukunde_strasse, '')), ''), nullif(btrim(coalesce(e.neukunde_plz, '')), ''),
          nullif(btrim(coalesce(e.neukunde_ort, '')), ''), nullif(btrim(coalesce(e.neukunde_telefon, '')), ''),
          nullif(btrim(coalesce(e.neukunde_email, '')), ''))
  returning id into kunde;
  update public.auftragseingaenge
     set customer_id = kunde,
         neukunde_name = null, neukunde_strasse = null, neukunde_plz = null, neukunde_ort = null,
         neukunde_telefon = null, neukunde_email = null
   where id = e.id;
  return kunde;
end;
$$;

revoke all on function app.eingang_kunde(uuid) from public, anon, authenticated;

/*
  DEN EINGANG SPERREN UND PRÜFEN — eigener Betrieb (nicht der Support) und
  Modul. Die Rolle prüft jede Funktion selbst, vor dem Aufruf. Gesperrt mit
  `for update`: zwei gleichzeitige Aufrufe warten aufeinander, der zweite
  sieht den Stand des ersten — so entsteht aus einem Doppelklick genau eine
  Baustelle.
*/
create or replace function app.eingang_sperren(p_eingang uuid)
  returns public.auftragseingaenge
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  e public.auftragseingaenge;
begin
  select * into e from public.auftragseingaenge
   where id = p_eingang and company_id = (select app.lesebetrieb())
     for update;
  if e.id is null then
    raise exception 'Eingang nicht gefunden' using errcode = 'P0002';
  end if;
  if not app.modul_aktiv(e.company_id, 'baustellen.auftragseingang') then
    raise exception 'Der Auftragseingang ist in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;
  return e;
end;
$$;

revoke all on function app.eingang_sperren(uuid) from public, anon, authenticated;

/* Der Stand in Worten — für die Meldungen. */
create or replace function app.eingang_stand_text(p_stand text)
  returns text
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  select case p_stand when 'offen' then 'offen' when 'uebernommen' then 'übernommen'
                      when 'abgelehnt' then 'abgelehnt' else p_stand end
$$;

revoke all on function app.eingang_stand_text(text) from public, anon, authenticated;

/* Eine Belegnummer wie `belegNummer` in `src/lib/praefixe.ts`: „B-2026-0007“, ohne Vorsatz „2026-0007“. */
create or replace function app.belegnummer(p_praefix text, p_jahr integer, p_lfd bigint)
  returns text
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  select case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
         || p_jahr || '-' || lpad(p_lfd::text, greatest(4, length(p_lfd::text)), '0')
$$;

revoke all on function app.belegnummer(text, integer, bigint) from public, anon, authenticated;

/*
  EINGANG → BAUSTELLE, in einem Zug (A03): gegebenenfalls der Kunde, die
  Baustelle, der Eingang „übernommen“ mit Verweis.

  - Rechte wie „Neue Baustelle“ (`projects_anlegen`): die Führung; dazu der
    eigene Betrieb — ein Supportzugang legt keine Baustelle aus einem
    Kundenauftrag an.
  - Abrechnungsart und Vorsatz wählt die Führung wie bei der internen
    Annahme eines Angebots (`angebot_annehmen`).
  - DIE NUMMER zieht `naechste_nummer` — derselbe Weg wie „Neue Baustelle“
    (`reserveProjectNumber`) und dieselbe Form (`belegNummer`); keine zweite
    Nummernlogik.
  - Die Baustelle trägt Kunde, Ort (sonst die Kundenanschrift),
    Ansprechpartner vor Ort (sonst den der Kundenakte, wie die Annahme eines
    Angebots), das Anliegen und die Nummer des Auftraggebers als
    Beschreibung und den Verweis auf den Eingang.
  - EIN ZWEITER AUFRUF gibt die schon angelegte Baustelle zurück
    (`neu: false`), statt eine zweite anzulegen.
*/
create or replace function public.eingang_zu_baustelle(p_eingang uuid, p_praefix text, p_abrechnung text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  e public.auftragseingaenge;
  k public.customers;
  kunde uuid;
  jahr integer;
  nummer text;
  projekt uuid;
  beschreibung text;
begin
  if app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Einen Eingang übernimmt nur die Führung — wie eine neue Baustelle' using errcode = '42501';
  end if;
  e := app.eingang_sperren(p_eingang);
  if e.stand = 'uebernommen' and e.project_id is not null then
    return jsonb_build_object('project_id', e.project_id, 'neu', false,
      'project_number', (select p.project_number from public.projects p where p.id = e.project_id));
  end if;
  if e.stand <> 'offen' then
    raise exception 'Der Eingang % ist %; übernommen wird nur ein offener', e.nummer, app.eingang_stand_text(e.stand)
      using errcode = '55000';
  end if;
  if p_abrechnung is null or p_abrechnung not in ('Regie', 'Pauschal', 'Einheitspreis') then
    raise exception 'Bitte die Abrechnung der Baustelle wählen — Regie, Pauschal oder Einheitspreis' using errcode = '22023';
  end if;
  if p_praefix is null or p_praefix !~ '^[A-Z0-9-]{0,6}$' then
    raise exception 'Der Vorsatz der Baustellennummer hat höchstens sechs Großbuchstaben, Ziffern oder Bindestriche'
      using errcode = '22023';
  end if;

  -- Erst den Kunden, dann lesen: in einer Bedingung liefe die Funktion je gelesener Zeile.
  kunde := app.eingang_kunde(e.id);
  select * into k from public.customers where id = kunde;
  jahr := extract(year from now() at time zone 'Europe/Vienna');
  nummer := app.belegnummer(p_praefix, jahr, public.naechste_nummer('projects', jahr));
  beschreibung := btrim(e.anliegen)
    || coalesce(E'\n\nNummer des Auftraggebers: ' || nullif(btrim(coalesce(e.auftraggeber_nummer, '')), ''), '')
    || E'\n\nAus Eingang ' || e.nummer;

  insert into public.projects (company_id, project_number, customer_id, customer_name, address, status,
                               billing_mode, description, contact_name, contact_phone)
  values (e.company_id, nummer, k.id, k.name,
          coalesce(nullif(btrim(coalesce(e.ort, '')), ''), k.address), 'Aktiv', p_abrechnung, beschreibung,
          coalesce(nullif(btrim(coalesce(e.ansprechpartner_name, '')), ''), nullif(btrim(coalesce(k.contact_name, '')), '')),
          coalesce(nullif(btrim(coalesce(e.ansprechpartner_telefon, '')), ''), nullif(btrim(coalesce(k.contact_phone, '')), '')))
  returning id into projekt;

  update public.auftragseingaenge
     set stand = 'uebernommen', project_id = projekt, uebernommen_am = now(),
         uebernommen_von_uid = auth.uid(),
         uebernommen_von_name = (select u.name from public.users u where u.id = auth.uid())
   where id = e.id;

  return jsonb_build_object('project_id', projekt, 'project_number', nummer, 'customer_id', k.id, 'neu', true);
end;
$$;

revoke all on function public.eingang_zu_baustelle(uuid, text, text) from public, anon;
grant execute on function public.eingang_zu_baustelle(uuid, text, text) to authenticated;

/*
  EINGANG → ANGEBOTSENTWURF, in einem Zug: gegebenenfalls der Kunde, ein
  Entwurf über `angebot_speichern` — derselbe Weg wie „Neues Angebot“ — mit
  einer Nummer aus `naechste_nummer` und dem Vorsatz des Betriebs
  (`reserveQuoteNumber`), Bindefrist 30 Tage, USt-Satz des Betriebs, der Ort
  als Adresse, das Anliegen und die Nummer des Auftraggebers in den
  Anmerkungen. Die Nummer des Eingangs steht NICHT darin: die Anmerkungen
  gehen an den Kunden, die Eingangsnummer ist intern (der Verweis steht am
  Eingang). Wird aus dem Angebot eine Baustelle, ist der Weg der vorhandene
  (`angebot_annehmen`). Nur mit dem Modul Angebote.
*/
create or replace function public.eingang_zu_angebot(p_eingang uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  e public.auftragseingaenge;
  k public.customers;
  kunde uuid;
  c public.companies;
  heute date := (now() at time zone 'Europe/Vienna')::date;
  jahr integer;
  nummer text;
  angebot uuid;
begin
  if app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Einen Eingang übernimmt nur die Führung — wie ein neues Angebot' using errcode = '42501';
  end if;
  e := app.eingang_sperren(p_eingang);
  if e.stand = 'uebernommen' and e.quote_id is not null then
    return jsonb_build_object('quote_id', e.quote_id, 'neu', false,
      'quote_number', (select q.quote_number from public.quotes q where q.id = e.quote_id));
  end if;
  if e.stand <> 'offen' then
    raise exception 'Der Eingang % ist %; übernommen wird nur ein offener', e.nummer, app.eingang_stand_text(e.stand)
      using errcode = '55000';
  end if;
  if not app.modul_aktiv(e.company_id, 'angebote') then
    raise exception 'Angebote sind in diesem Betrieb ausgeschaltet (Einstellungen → Module)' using errcode = '55000';
  end if;

  kunde := app.eingang_kunde(e.id);
  select * into k from public.customers where id = kunde;
  select * into c from public.companies where id = e.company_id;
  jahr := extract(year from heute);
  nummer := app.belegnummer(coalesce(c.praefix_angebot, 'AN'), jahr, public.naechste_nummer('quotes', jahr));

  angebot := public.angebot_speichern(null, jsonb_build_object(
    'quote_number', nummer,
    'customer_id', k.id,
    'customer_name', k.name,
    'address', coalesce(nullif(btrim(coalesce(e.ort, '')), ''), k.address),
    'quote_date', heute,
    'valid_until', heute + 30,
    'status', 'Entwurf',
    'vat_rate', coalesce((c.rates ->> 'vatRate')::numeric, 0.2),
    'kalkulierte_stunden', 0,
    'notes', btrim(e.anliegen)
      || coalesce(E'\n\nIhre Auftrags- bzw. Schadensnummer: ' || nullif(btrim(coalesce(e.auftraggeber_nummer, '')), ''), '')
  ), '[]'::jsonb);

  update public.auftragseingaenge
     set stand = 'uebernommen', quote_id = angebot, uebernommen_am = now(),
         uebernommen_von_uid = auth.uid(),
         uebernommen_von_name = (select u.name from public.users u where u.id = auth.uid())
   where id = e.id;

  return jsonb_build_object('quote_id', angebot, 'quote_number', nummer, 'customer_id', k.id, 'neu', true);
end;
$$;

revoke all on function public.eingang_zu_angebot(uuid) from public, anon;
grant execute on function public.eingang_zu_angebot(uuid) to authenticated;

/*
  ABLEHNEN — mit Grund, das Büro. Ein zweiter Aufruf ändert nichts.
*/
create or replace function public.eingang_ablehnen(p_eingang uuid, p_grund text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  e public.auftragseingaenge;
  grund text := btrim(coalesce(p_grund, ''));
begin
  if app.hat_rolle(array['Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Eingänge bearbeitet nur das Büro' using errcode = '42501';
  end if;
  e := app.eingang_sperren(p_eingang);
  if e.stand = 'abgelehnt' then
    return;
  end if;
  if e.stand <> 'offen' then
    raise exception 'Der Eingang % ist %; abgelehnt wird nur ein offener', e.nummer, app.eingang_stand_text(e.stand)
      using errcode = '55000';
  end if;
  if char_length(grund) < 3 or char_length(grund) > 1000 then
    raise exception 'Bitte einen Grund angeben (3 bis 1000 Zeichen)' using errcode = '22023';
  end if;
  update public.auftragseingaenge
     set stand = 'abgelehnt', abgelehnt_grund = grund, abgelehnt_am = now(),
         abgelehnt_von_uid = auth.uid(),
         abgelehnt_von_name = (select u.name from public.users u where u.id = auth.uid())
   where id = e.id;
end;
$$;

revoke all on function public.eingang_ablehnen(uuid, text) from public, anon;
grant execute on function public.eingang_ablehnen(uuid, text) to authenticated;

/*
  WIEDER ÖFFNEN — ein abgelehnter Eingang, oder ein übernommener, dessen
  Baustelle bzw. Angebot es nicht mehr gibt (ein verworfener und endgültig
  gelöschter Entwurf). Ein übernommener mit Ziel bleibt, wie er ist: er
  belegt, woher Baustelle bzw. Angebot kamen. Das Journal hält fest, was
  vorher dastand.
*/
create or replace function public.eingang_wieder_oeffnen(p_eingang uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  e public.auftragseingaenge;
begin
  if app.hat_rolle(array['Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Eingänge bearbeitet nur das Büro' using errcode = '42501';
  end if;
  e := app.eingang_sperren(p_eingang);
  if e.stand = 'offen' then
    return;
  end if;
  if e.stand = 'uebernommen' and (e.project_id is not null or e.quote_id is not null) then
    raise exception 'Der Eingang % ist übernommen und belegt, woher % kam — er bleibt, wie er ist', e.nummer,
      case when e.project_id is not null then 'die Baustelle' else 'das Angebot' end
      using errcode = '55000';
  end if;
  update public.auftragseingaenge
     set stand = 'offen',
         abgelehnt_grund = null, abgelehnt_am = null, abgelehnt_von_uid = null, abgelehnt_von_name = null,
         uebernommen_am = null, uebernommen_von_uid = null, uebernommen_von_name = null
   where id = e.id;
end;
$$;

revoke all on function public.eingang_wieder_oeffnen(uuid) from public, anon;
grant execute on function public.eingang_wieder_oeffnen(uuid) to authenticated;

/*
  KUNDE ANLEGEN, ohne umzuwandeln — für die Besichtigung: ein Termin hängt
  an einem Kunden oder einer Baustelle (`termine_bezug`), und der Eingang
  bleibt bis dahin offen. Das Büro mit dem Recht „Kunden pflegen“.
*/
create or replace function public.eingang_kunde_anlegen(p_eingang uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  e public.auftragseingaenge;
begin
  if app.hat_rolle(array['Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Eingänge bearbeitet nur das Büro' using errcode = '42501';
  end if;
  e := app.eingang_sperren(p_eingang);
  if e.stand <> 'offen' then
    raise exception 'Der Eingang % ist %', e.nummer, app.eingang_stand_text(e.stand) using errcode = '55000';
  end if;
  return app.eingang_kunde(e.id);
end;
$$;

revoke all on function public.eingang_kunde_anlegen(uuid) from public, anon;
grant execute on function public.eingang_kunde_anlegen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Das Änderungsjournal (M01b) kennt den Eingang
-- ---------------------------------------------------------------------------

alter table public.aenderungsjournal drop constraint if exists aenderungsjournal_objektart;
alter table public.aenderungsjournal add constraint aenderungsjournal_objektart
  check (objektart in ('kunde', 'baustelle', 'angebot', 'rechnung', 'zahlung', 'wartung', 'benutzer', 'eingang'));

/*
  Rumpf wie in `20261106100000_aenderungsjournal.sql`; neu ist allein die
  Bezeichnung eines Eingangs (seine Nummer) — woran man ihn erkennt, auch
  wenn er gelöscht ist. Der Kunde kommt wie bei den übrigen Objekten aus
  `customer_id`.
*/
create or replace function app.journal_protokollieren() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  objektart constant text := tg_argv[0];
  ohne constant text[] := tg_argv[1]::text[];
  leer constant jsonb[] := array['null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb];
  stand jsonb;
  alt jsonb;
  neu jsonb;
  spalte text;
  unterschied jsonb := '{}'::jsonb;
  art text;
  inhalt jsonb := '{}'::jsonb;
  bezug uuid;
  kunde uuid;
  bezeichnung text;
  wer text;
begin
  if tg_op = 'DELETE' then
    stand := to_jsonb(old);
  else
    stand := to_jsonb(new);
  end if;

  -- Dienstschlüssel und Arbeiten ohne Anmeldung schreiben nicht (siehe oben).
  -- Eine Zeile ohne Betrieb gehört keinem Betrieb — und damit in kein Journal.
  if not app.ist_dienst() and auth.uid() is not null and stand ->> 'company_id' is not null then
    if tg_op = 'INSERT' then
      art := 'angelegt';
    elsif tg_op = 'DELETE' then
      art := 'geloescht';
    else
      alt := to_jsonb(old);
      neu := stand;
      for spalte in select jsonb_object_keys(neu) loop
        if spalte = any(ohne)
           or alt -> spalte is not distinct from neu -> spalte
           or ((alt -> spalte) = any(leer) and (neu -> spalte) = any(leer)) then
          continue;
        end if;
        unterschied := unterschied || jsonb_build_object(spalte, jsonb_build_object('alt', alt -> spalte, 'neu', neu -> spalte));
      end loop;
      art := 'geaendert';
      inhalt := unterschied;
    end if;

    if art <> 'geaendert' or unterschied <> '{}'::jsonb then
      bezug := case when objektart = 'zahlung' then (stand ->> 'invoice_id')::uuid end;
      kunde := case objektart
                 when 'kunde' then (stand ->> 'id')::uuid
                 when 'benutzer' then null
                 when 'zahlung' then (select i.customer_id from public.invoices i where i.id = (stand ->> 'invoice_id')::uuid)
                 else (stand ->> 'customer_id')::uuid
               end;
      -- Woran ein Mensch das Objekt erkennt, auch wenn es nicht mehr da ist.
      bezeichnung := case objektart
        when 'kunde' then stand ->> 'name'
        when 'baustelle' then stand ->> 'project_number'
        when 'angebot' then stand ->> 'quote_number'
        when 'rechnung' then stand ->> 'invoice_number'
        when 'zahlung' then
          -- Wie `euro()` der App (de-AT): geschütztes Leerzeichen als Tausendertrennung, Komma vor den Cent.
          '€ ' || translate(to_char((stand ->> 'betrag')::numeric, 'FM999,999,999,990.00'), ',.', chr(160) || ',')
          || ' vom ' || to_char((stand ->> 'datum')::date, 'DD.MM.YYYY')
          || coalesce(' · ' || nullif(btrim(stand ->> 'art'), ''), '')
        when 'wartung' then stand ->> 'anlage'
        when 'benutzer' then stand ->> 'name'
        -- M02b: die Nummer des Eingangs — intern, keine Angabe über den Kunden.
        when 'eingang' then stand ->> 'nummer'
      end;
      -- Wer im Supporteinblick ändert, steht nicht in der Belegschaft — dann sein Plattformkonto.
      wer := coalesce(
        (select u.name from public.users u where u.id = auth.uid()),
        (select 'Support (' || coalesce(nullif(btrim(p.name), ''), 'Senklot') || ')'
           from public.platform_admins p where p.id = auth.uid()));

      insert into public.aenderungsjournal
        (company_id, objektart, objekt_id, bezug_id, kunde_id, art, aenderungen, bezeichnung, von_uid, von_name)
      values
        (stand ->> 'company_id', objektart, (stand ->> 'id')::uuid, bezug, kunde, art, inhalt, bezeichnung, auth.uid(), wer);
    end if;
  end if;

  -- Auch mit dem Dienstschlüssel: ein gelöschter Kunde ist gelöscht, egal auf welchem Weg.
  if tg_op = 'DELETE' and objektart = 'kunde' then
    perform app.journal_kunde_vergessen(old.company_id, old.id, true);
  end if;
  return null;
end;
$$;

revoke all on function app.journal_protokollieren() from public, anon, authenticated;

/*
  WAS AM EINGANG OHNE PROTOKOLL BLEIBT:
  - `id`, `company_id`, `created_at`, `updated_at` (wie überall);
  - `customer_id` (Kennung; der Name steht in `kunde_name`), `project_id`,
    `quote_id`, `termin_id` (Kennungen; Baustelle, Angebot und Termin zeigt
    der Eingang selbst, der Wechsel des Stands steht mit Zeit im Journal);
  - `dringlichkeit_rang` (rechnet die Datenbank aus `dringlichkeit`);
  - `erfasst_von_*`, `bearbeitet_*`, `abgelehnt_am`, `abgelehnt_von_*`,
    `uebernommen_am`, `uebernommen_von_*`: das „wer und wann“ der Zeile —
    das Journal hält beides selbst fest.
*/
drop trigger if exists auftragseingaenge_journal on public.auftragseingaenge;
create trigger auftragseingaenge_journal
  after insert or update or delete on public.auftragseingaenge
  for each row execute function app.journal_protokollieren(
    'eingang', '{id,company_id,created_at,updated_at,customer_id,project_id,quote_id,termin_id,dringlichkeit_rang,erfasst_von_uid,erfasst_von_name,bearbeitet_am,bearbeitet_von_uid,bearbeitet_von_name,abgelehnt_am,abgelehnt_von_uid,abgelehnt_von_name,uebernommen_am,uebernommen_von_uid,uebernommen_von_name}');

/*
  DER KUNDE NACHGETRAGEN. Solange ein Eingang nur die Angaben zu einem
  NEUEN Kunden trägt, hat er keinen Kunden, und seine Journalzeilen keine
  `kunde_id`. Wird daraus ein Kunde (oder einer gewählt), bekommen die
  Zeilen davor ihn nachgetragen — sonst fände die Löschung dieses Kunden
  (Art. 17) die Werte nicht, die vor dem Umwandeln geändert wurden, und
  seine Datenauskunft zeigte sie nicht. Am Inhalt ändert sich nichts.
  Nach dem Journal (Name), damit die Zeile dieser Änderung schon dasteht.
*/
create or replace function app.eingang_journal_kunde() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.customer_id is not null and old.customer_id is null then
    update public.aenderungsjournal j
       set kunde_id = new.customer_id
     where j.company_id = new.company_id and j.objektart = 'eingang' and j.objekt_id = new.id
       and j.kunde_id is null;
  end if;
  return null;
end;
$$;

revoke all on function app.eingang_journal_kunde() from public, anon, authenticated;

drop trigger if exists auftragseingaenge_kunde_nachtragen on public.auftragseingaenge;
create trigger auftragseingaenge_kunde_nachtragen
  after update of customer_id on public.auftragseingaenge
  for each row execute function app.eingang_journal_kunde();

/*
  LESEN wie in `20261106100000_aenderungsjournal.sql`; neu ist der Eingang:
  wer ihn selbst sieht (`auftragseingaenge_lesen`), sieht sein Journal.
*/
drop policy if exists aenderungsjournal_lesen on public.aenderungsjournal;
create policy aenderungsjournal_lesen on public.aenderungsjournal for select
  using (
    company_id = (select app.lesebetrieb())
    and (select app.rolle()) is distinct from 'Mitarbeiter'
    and (
      (select app.ist_spitze())
      or case objektart
           when 'kunde' then exists (select 1 from public.customers t where t.id = aenderungsjournal.objekt_id)
           when 'baustelle' then exists (select 1 from public.projects t where t.id = aenderungsjournal.objekt_id)
           when 'angebot' then exists (select 1 from public.quotes t where t.id = aenderungsjournal.objekt_id)
           when 'rechnung' then exists (select 1 from public.invoices t where t.id = aenderungsjournal.objekt_id)
           -- Eine Zahlung über ihre Rechnung und mit der Regel der Zahlungen
           -- (`zahlungen_lesen`: Buchhaltung und Spitze) — nicht über die Zeile
           -- der Zahlung selbst: sonst sähe die Buchhaltung eine GELÖSCHTE
           -- Zahlung im Verlauf ihrer Rechnung nicht, und genau die ist der
           -- häufigste Grund, dort nachzusehen.
           when 'zahlung' then (select app.ist_buch_oder_spitze())
             and exists (select 1 from public.invoices t where t.id = aenderungsjournal.bezug_id)
           when 'wartung' then exists (select 1 from public.wartungen t where t.id = aenderungsjournal.objekt_id)
           -- M02b: der Eingang, wie ihn das Büro sieht.
           when 'eingang' then exists (select 1 from public.auftragseingaenge t where t.id = aenderungsjournal.objekt_id)
           -- Benutzer: Lohnstammdaten, nur die Spitze (oben).
           else false
         end
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Datenauskunft und Löschung
-- ---------------------------------------------------------------------------

/*
  DATENAUSKUNFT — gezielt eingefügt wie E50, M01b, M01d, M02a; wiederholbar,
  und ohne eindeutige Einfügestelle bricht die Migration ab.

  - Beim Kunden: seine Eingänge (über die Kennung), wie seine Angebote —
    ohne wer im Betrieb erfasst, geändert, abgelehnt oder übernommen hat
    (Angaben über Mitarbeiter). Ein Eingang mit den Angaben zu einem NEUEN
    Kunden hat keine Kennung und ist über ihn nicht auffindbar — Grenze mit
    Grund: über den Namen allein träfe es Namensvettern; solche Eingänge
    werden zum Kunden oder gelöscht (nur offene und abgelehnte).
  - Bei der Person: als Bearbeiter die Anzahl der Eingänge, die sie erfasst
    bzw. geändert, abgelehnt oder übernommen hat — der Inhalt gehört den
    Kunden.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('auftragseingaenge' in quelle) = 0 then
    marke := $m$from public.uid_pruefungen u where u.company_id = betrieb and u.customer_id = p_id),$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Kunde fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M02b: seine Eingänge — ohne wer im Betrieb erfasst, geändert, abgelehnt oder übernommen hat.
      'auftragseingaenge', (
        select coalesce(jsonb_agg(to_jsonb(e) - array['company_id', 'dringlichkeit_rang',
                 'erfasst_von_uid', 'erfasst_von_name', 'bearbeitet_von_uid', 'bearbeitet_von_name',
                 'abgelehnt_von_uid', 'abgelehnt_von_name', 'uebernommen_von_uid', 'uebernommen_von_name']
                 order by e.eingegangen_am, e.id), '[]'::jsonb)
          from public.auftragseingaenge e
         where e.company_id = betrieb and e.customer_id = p_id),$eintrag$);

    marke := $m$where q.company_id = betrieb and q.verworfen_von_uid = p_id),$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Bearbeiter fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M02b: Eingänge, die sie erfasst bzw. geändert, abgelehnt oder übernommen hat.
      'auftragseingaenge_erfasst', (select count(*) from public.auftragseingaenge e
        where e.company_id = betrieb and e.erfasst_von_uid = p_id),
      'auftragseingaenge_bearbeitet', (select count(*) from public.auftragseingaenge e
        where e.company_id = betrieb and e.erfasst_von_uid is distinct from p_id
          and (e.bearbeitet_von_uid = p_id or e.abgelehnt_von_uid = p_id or e.uebernommen_von_uid = p_id)),$eintrag$);
    execute quelle;
  end if;
end;
$migration$;

/*
  LÖSCHUNG EINES KUNDEN (Art. 17).

  - Offene und abgelehnte Eingänge gehen sofort mit: sie sind kein Beleg.
    Ebenso übernommene, deren Baustelle bzw. Angebot es nicht mehr gibt, und
    alle, wenn der Kunde ganz geht.
  - Ein übernommener Eingang mit Baustelle bzw. Angebot bleibt: er belegt,
    woher sie kamen, und hängt an Belegen, die aufbewahrt werden. Er verliert
    — wie die Baustelle — Ansprechpartner und Telefon, dazu was vom neuen
    Kunden an Telefon und E-Mail stehen könnte.
  - Im Journal verlieren die Zeilen seiner Eingänge alle Werte (wie die
    Wartungen): die Nummer bleibt, sie ist keine Angabe über ihn.
  - Kein Eintrag in „aufbewahren“: übernommene Eingänge hängen an
    Baustellen bzw. Angeboten, die dort schon stehen.

  Gezielt eingefügt wie oben; wiederholbar.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('auftragseingaenge' in quelle) = 0 then
    marke := $m$where t.company_id = betrieb and t.customer_id = p_id),$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle „sofort“ fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M02b: offene und abgelehnte Eingänge, übernommene ohne Baustelle bzw. Angebot.
      'auftragseingaenge', (select count(*) from public.auftragseingaenge e
                             where e.company_id = betrieb and e.customer_id = p_id
                               and (e.stand <> 'uebernommen' or (e.project_id is null and e.quote_id is null))),$eintrag$);

    marke := $m$delete from public.termine t where t.company_id = betrieb and t.customer_id = p_id;$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle Eingänge fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M02b: Eingänge — offene, abgelehnte und gegenstandslose gehen; übernommene ohne Kontaktdaten.
      delete from public.auftragseingaenge e
       where e.company_id = betrieb and e.customer_id = p_id
         and (ganz or e.stand <> 'uebernommen' or (e.project_id is null and e.quote_id is null));
      update public.auftragseingaenge e
         set ansprechpartner_name = null, ansprechpartner_telefon = null,
             neukunde_telefon = null, neukunde_email = null
       where e.company_id = betrieb and e.customer_id = p_id
         and num_nonnulls(e.ansprechpartner_name, e.ansprechpartner_telefon, e.neukunde_telefon, e.neukunde_email) > 0;
      update public.aenderungsjournal j
         set aenderungen = (select coalesce(jsonb_object_agg(x.key, '{"entfernt": true}'::jsonb), '{}'::jsonb)
                              from jsonb_each(j.aenderungen) x)
       where j.company_id = betrieb and j.objektart = 'eingang' and j.kunde_id = p_id
         and j.aenderungen <> '{}'::jsonb;$eintrag$);
    execute quelle;
  end if;
end;
$migration$;
