/*
  DER SUPPORTZUGANG — was der Betrieb GEWÄHRT, nicht was sich jemand nimmt.

  DIE LAGE VORHER, ehrlich benannt: der globale Administrator kann einen
  Betrieb anlegen und danach nie wieder etwas über ihn erfahren. Das ist eine
  starke Zusage, und sie stimmt — nur hatte sie eine Kehrseite. Ruft der
  Betrieb an, weil eine Rechnung nicht stimmt, kann niemand nachsehen. Der
  einzige Weg hinein war der DIENSTSCHLÜSSEL: er umgeht jeden Zeilenschutz,
  erreicht jeden Mandanten und hinterlässt keine Spur. Der Generalschlüssel
  existierte also längst — er war nur nirgends erklärt und nirgends begrenzt.

  WAS HIER AN SEINE STELLE TRITT, in vier Eigenschaften:

    BEFRISTET   — jede Freigabe läuft ab, spätestens nach sieben Tagen.
    BEGRÜNDET   — ohne Grund keine Freigabe; der Grund steht im Protokoll.
    WIDERRUFBAR — der Betrieb beendet sie jederzeit mit einem Klick.
    NUR LESEND  — ein Supportzugang schreibt nichts. Nirgends. Das steht
                  nicht in der Oberfläche, sondern als Riegel vor jeder
                  Tabelle, die ein `company_id` trägt.

  UND EIN NOTZUGANG, weil eine rein einvernehmliche Lösung ausgerechnet dann
  versagt, wofür man sie braucht: wer sich ausgesperrt hat, kann nichts mehr
  freigeben. Der Notzugang läuft ohne Zustimmung, aber NICHT heimlich — er ist
  als solcher gekennzeichnet, gilt höchstens 24 Stunden, steht im Protokoll
  des Betriebs und erzeugt dasselbe Band in seiner App wie jede andere
  Freigabe.
*/

-- ---------------------------------------------------------------------------
-- 1. Wer ist ein Plattformkonto?
-- ---------------------------------------------------------------------------

/*
  Der Anspruch steht im Token (`app.plattform_anspruch` setzt ihn). Ein
  Plattformkonto trägt WEDER `company_id` NOCH `role` — daran hängt, dass es
  von sich aus nirgends hineinsieht.
*/
create or replace function app.ist_plattform() returns boolean
  language sql stable
  set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'plattform_admin')::boolean, false)
$$;

grant execute on function app.ist_plattform() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2. Die Freigabe
-- ---------------------------------------------------------------------------

create table if not exists support_freigaben (
  id             uuid primary key default gen_random_uuid(),
  company_id     text not null references companies (id),
  /* Wer sie gewährt hat — leer bei einem Notzugang, denn der kommt nicht vom Betrieb. */
  gewaehrt_von   uuid references users (id),
  /* WOFÜR. Ohne Grund keine Freigabe: er ist das, was der Betrieb später nachliest. */
  grund          text not null check (btrim(grund) <> ''),
  notzugang      boolean not null default false,
  gilt_bis       timestamptz not null,
  widerrufen_am  timestamptz,
  widerrufen_von uuid references users (id),
  created_at     timestamptz not null default now(),
  /*
    Eine Freigabe ohne Gewährenden ist ein Notzugang, und ein Notzugang hat
    keinen Gewährenden. Beides auseinanderfallen zu lassen hiesse, im
    Protokoll nicht mehr unterscheiden zu können, wer den Zugang wollte.
  */
  constraint support_freigaben_herkunft check ((gewaehrt_von is null) = notzugang)
);

create index if not exists support_freigaben_betrieb
  on support_freigaben (company_id, gilt_bis desc);

/*
  DIE FRIST WIRD ERZWUNGEN UND NICHT NUR VORGESCHLAGEN. Eine `check`-Bedingung
  kann das nicht: sie darf `now()` nicht sehen. Ohne Obergrenze wäre die erste
  Freigabe „bis 2099" die letzte, die je jemand vergibt — und aus dem
  befristeten Zugang wäre wieder ein Generalschlüssel geworden, diesmal mit
  Protokoll.
*/
create or replace function app.support_frist_pruefen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  grenze interval := case when new.notzugang then interval '24 hours' else interval '7 days' end;
begin
  /*
    DER DIENSTSCHLÜSSEL GEHT VORBEI, und zwar aus einem konkreten Grund: der
    Rücklauf einer Sicherung spielt die Freigaben eines Betriebs wieder ein,
    und die sind dann allesamt abgelaufen. Eine Fristprüfung beim Einfügen
    liesse genau diesen Wiederanlauf scheitern — an einer Tabelle, die für
    den Betrieb selbst gar nichts tut.

    Nach der Hausregel zum Dienstschlüssel (siehe
    `20260912100000_dienstschluessel.sql`) ist das die richtige Seite: er geht
    an BERECHTIGUNGEN vorbei, nicht an dem, was einen Beleg schützt. Dass sich
    eine bestehende Freigabe nicht nachträglich verlängern lässt, ist Letzteres
    — und dort steht kein Vorbeiweg.
  */
  if app.ist_dienst() then return new; end if;

  if new.gilt_bis <= now() then
    raise exception 'Eine Freigabe, die schon abgelaufen ist, ist keine' using errcode = '22023';
  end if;
  if new.gilt_bis > now() + grenze then
    raise exception 'Eine Freigabe gilt höchstens % — länger wäre kein Supportzugang mehr, sondern ein Dauerzugang',
      case when new.notzugang then '24 Stunden' else '7 Tage' end
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger support_freigaben_frist before insert on support_freigaben
  for each row execute function app.support_frist_pruefen();

create trigger support_freigaben_betrieb_fest before update on support_freigaben
  for each row execute function app.betrieb_unveraenderlich();

/*
  WAS SICH AN EINER FREIGABE NOCH ÄNDERN LÄSST: der Widerruf. Sonst nichts.

  Liesse sich `gilt_bis` nachträglich verlängern, wäre die Frist eine
  Empfehlung; liesse sich der Grund ändern, wäre das Protokoll eine Erzählung.
  Und ein einmal ausgesprochener Widerruf bleibt stehen — ihn zurückzunehmen
  ist eine NEUE Freigabe, mit neuem Grund und neuer Frist.
*/
create or replace function app.support_freigabe_fest() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.grund is distinct from old.grund
     or new.gilt_bis is distinct from old.gilt_bis
     or new.notzugang is distinct from old.notzugang
     or new.gewaehrt_von is distinct from old.gewaehrt_von
     or new.created_at is distinct from old.created_at then
    raise exception 'An einer Freigabe lässt sich nur der Widerruf ändern' using errcode = '42501';
  end if;
  if old.widerrufen_am is not null and new.widerrufen_am is null then
    raise exception 'Ein Widerruf lässt sich nicht zurücknehmen — das ist eine neue Freigabe'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger support_freigaben_fest before update on support_freigaben
  for each row execute function app.support_freigabe_fest();

-- ---------------------------------------------------------------------------
-- 3. Die Frage, an der alles hängt
-- ---------------------------------------------------------------------------

/*
  `app.darf` ist die Funktion, auf der JEDE Leseregel dieser Datenbank steht.
  Sie zu erweitern ist der gefährlichste Eingriff dieser Arbeit — deshalb
  zerfällt sie in zwei Teile, die einzeln zu lesen und einzeln zu prüfen sind:

    app.betriebsmitglied()  — der alte Satz, Wort für Wort
    app.support_liest()     — der neue, und er kann NUR wahr werden, wenn
                              eine gültige Freigabe dieses Betriebs vorliegt

  SECURITY DEFINER bei der zweiten, und das ist kein Versehen: sie schlägt in
  `support_freigaben` nach, und auf dieser Tabelle liegt selbst ein
  Zeilenschutz. Ohne Definer-Rechte prüfte die Regel sich selbst und drehte
  sich im Kreis.
*/
create or replace function app.betriebsmitglied(betrieb text) returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.angemeldet() and app.betrieb() is not null and app.betrieb() = betrieb
$$;

create or replace function app.support_liest(betrieb text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_plattform() and exists (
    select 1 from public.support_freigaben f
     where f.company_id = betrieb
       and f.widerrufen_am is null
       and f.gilt_bis > now())
$$;

grant execute on function app.betriebsmitglied(text) to authenticated, anon, service_role;
grant execute on function app.support_liest(text) to authenticated, anon, service_role;

create or replace function app.darf(betrieb text) returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.betriebsmitglied(betrieb) or app.support_liest(betrieb)
$$;

-- ---------------------------------------------------------------------------
-- 3b. Das Protokoll
-- ---------------------------------------------------------------------------

/*
  WAS HIER STEHT UND WAS NICHT. Festgehalten wird, WER wann WELCHEN Bereich
  eines Betriebs geöffnet hat — nicht jede gelesene Zeile. Das ist keine
  Bequemlichkeit: ein Zeilenprotokoll müsste in jeder Leseregel mitschreiben,
  und eine Leseregel, die schreibt, ist keine Leseregel mehr.

  Angehängt wird, geändert nie: es gibt eine Regel zum Einfügen und keine zum
  Ändern oder Löschen. Ein Protokoll, das sich nachbessern lässt, beantwortet
  die Frage nicht, für die es da ist.
*/
create table if not exists support_zugriffe (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references companies (id),
  freigabe_id uuid not null references support_freigaben (id) on delete cascade,
  /*
    AUS DEM TOKEN UND NICHT AUS DER ANSICHT. Die Regel verlangt ohnehin
    `admin_uid = auth.uid()`; sie zusätzlich mitschicken zu müssen wäre eine
    Gelegenheit, es falsch zu machen, und sonst nichts.
  */
  admin_uid   uuid not null default auth.uid(),
  /* Welcher Bereich geöffnet wurde, z. B. „Rechnungen". */
  bereich     text not null,
  wann        timestamptz not null default now()
);

create index if not exists support_zugriffe_betrieb on support_zugriffe (company_id, wann desc);

-- ---------------------------------------------------------------------------
-- 4. Und der Riegel: ein Supportzugang schreibt nichts
-- ---------------------------------------------------------------------------

/*
  WARUM DAS NICHT ÜBER DIE SCHREIBREGELN GEHT. Die meisten von ihnen verlangen
  ohnehin eine Rolle, und ein Plattformkonto hat keine — es fiele schon dort
  durch. „Die meisten" ist aber keine Zusage. Eine einzige Regel, die zum
  Schreiben nur `app.darf` prüft (und davon gibt es welche), machte aus dem
  Lesezugang einen Schreibzugang, und zwar unbemerkt.

  Deshalb steht der Riegel VOR der Tabelle und nicht in der Regel: ein
  Auslöser auf jeder Tabelle, die ein `company_id` trägt. Dass wirklich jede
  ihn hat, prüft `tests/supabase/schema.test.ts` — dieselbe Bauart wie beim
  Betriebsriegel, und der hat in dieser Sitzung schon eine fehlende Tabelle
  gemeldet.
*/
create or replace function app.support_schreibt_nicht() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_plattform() then
    raise exception 'Ein Supportzugang darf lesen und sonst nichts' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array app.auszug_tabellen() loop
    /*
      ZWEI AUSNAHMEN, UND BEIDE HABEN EINEN NAMEN.

      `support_zugriffe` entsteht gerade dadurch, dass ein Supportzugang etwas
      ansieht — ein Riegel darauf hiesse, den Zugang unprotokolliert zu
      lassen. `support_freigaben` muss der Notzugang schreiben können, sonst
      gäbe es ihn nicht. Beide Tabellen sind dafür einzeln und eng geregelt
      (Abschnitt 5), und genau diese Regeln prüft
      `tests/supabase/supportzugang.test.ts` Stück für Stück nach: ein
      Plattformkonto kann weder eine gewöhnliche Freigabe anlegen noch eine
      widerrufen noch einen Protokolleintrag ändern.
    */
    if t in ('support_zugriffe', 'support_freigaben') then continue; end if;
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function app.support_schreibt_nicht()',
      t || '_kein_support_schreiben', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. Zeilenschutz
-- ---------------------------------------------------------------------------

alter table support_freigaben enable row level security;
alter table support_zugriffe enable row level security;

/*
  HIER STEHT `app.betriebsmitglied` UND NICHT `app.darf`. Der Unterschied ist
  der ganze Kreisschluss: `app.darf` fragt diese Tabelle, und fragte diese
  Tabelle über `app.darf` zurück, drehte sich beides im Kreis.
*/
/*
  DIE PLATTFORMSEITE IST AN DIE FREIGABE GEBUNDEN, nicht an das Konto. Ein
  blosses `app.ist_plattform()` hätte jedem Plattformkonto die Supportakte
  JEDES Betriebs geöffnet — wer wann ein Problem hatte, ist auch ohne
  Geschäftsdaten eine Auskunft. Gelesen wird deshalb nur, wo gerade Einblick
  gewährt ist. Welche Betriebe das sind, beantwortet `support_freigaben_offen`
  getrennt und ohne diesen Umweg.
*/
create policy support_freigaben_lesen on support_freigaben
  for select using (app.betriebsmitglied(company_id) or app.support_liest(company_id));

-- Gewähren darf die Spitze des Betriebs — und niemand sonst.
create policy support_freigaben_gewaehren on support_freigaben
  for insert with check (
    app.betriebsmitglied(company_id) and app.ist_spitze()
    and gewaehrt_von = auth.uid() and not notzugang);

-- Widerrufen ebenso. Der Betrieb beendet, was der Betrieb begonnen hat —
-- und ebenso einen Notzugang, den er nicht begonnen hat.
create policy support_freigaben_widerrufen on support_freigaben
  for update using (app.betriebsmitglied(company_id) and app.ist_spitze())
  with check (app.betriebsmitglied(company_id) and app.ist_spitze());

/*
  DER BETRIEB SIEHT SEIN PROTOKOLL. Das ist die Gegenleistung für den Zugang:
  wer Einblick gewährt, soll nachlesen können, was damit geschehen ist.
*/
create policy support_zugriffe_lesen on support_zugriffe
  for select using (app.betriebsmitglied(company_id) or app.support_liest(company_id));

create policy support_zugriffe_melden on support_zugriffe
  for insert with check (
    app.ist_plattform() and app.support_liest(company_id) and admin_uid = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Der Notzugang
-- ---------------------------------------------------------------------------

/*
  Er entsteht nicht über die Schnittstelle, sondern über diese Funktion — und
  zwar mit Definer-Rechten, weil ein Plattformkonto nach Abschnitt 5 gar keine
  Freigabe einfügen darf. Genau so soll es sein: der gewöhnliche Weg bleibt
  versperrt, und der Notweg ist eine benannte Ausnahme mit eigenem Namen im
  Protokoll.

  ER IST NICHT HEIMLICH. Er ist als `notzugang` gekennzeichnet, gilt höchstens
  24 Stunden, steht im Protokoll des Betriebs und erzeugt dasselbe Band in
  seiner App wie jede andere Freigabe. Was er NICHT kann, ist schreiben — der
  Riegel aus Abschnitt 4 gilt für ihn wie für jeden anderen Supportzugang.
*/
create or replace function public.support_notzugang(p_company text, p_grund text, p_stunden integer default 4)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  neu uuid;
begin
  if not app.ist_plattform() then
    raise exception 'Einen Notzugang öffnet nur die Plattform' using errcode = '42501';
  end if;
  if btrim(coalesce(p_grund, '')) = '' then
    raise exception 'Ein Notzugang braucht einen Grund' using errcode = '22023';
  end if;
  if p_stunden is null or p_stunden < 1 or p_stunden > 24 then
    raise exception 'Ein Notzugang gilt zwischen einer und 24 Stunden' using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company) then
    raise exception 'Diesen Betrieb gibt es nicht' using errcode = 'P0002';
  end if;

  insert into public.support_freigaben (company_id, gewaehrt_von, grund, notzugang, gilt_bis)
    values (p_company, null, btrim(p_grund), true, now() + make_interval(hours => p_stunden))
    returning id into neu;
  return neu;
end;
$$;

grant execute on function public.support_notzugang(text, text, integer) to authenticated;

/*
  Welche Betriebe gerade Einblick gewähren — die einzige Liste, die ein
  Plattformkonto von sich aus sieht. Sie enthält keine Geschäftsdaten: Name,
  Grund, Frist. Mehr braucht es nicht, um zu wissen, wo man nachsehen darf.
*/
create or replace function public.support_freigaben_offen()
  returns table (
    id uuid, company_id text, name text, grund text,
    notzugang boolean, gilt_bis timestamptz)
  language sql
  security definer
  set search_path = ''
as $$
  select f.id, f.company_id, c.name, f.grund, f.notzugang, f.gilt_bis
    from public.support_freigaben f
    join public.companies c on c.id = f.company_id
   where app.ist_plattform()
     and f.widerrufen_am is null
     and f.gilt_bis > now()
   order by f.gilt_bis
$$;

grant execute on function public.support_freigaben_offen() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Was ein Supportzugang NICHT sieht
-- ---------------------------------------------------------------------------

/*
  DER ZUGANG SOLL SO KLEIN SEIN WIE MÖGLICH, und zwar in der Datenbank und
  nicht in der Ansicht. Drei Bereiche bleiben aussen vor:

    ZEITBUCHUNGEN und URLAUBE sind schon zu, ohne dass hier etwas geschieht:
    ihre Leseregeln verlangen die eigene Kennung oder eine Rolle, und ein
    Plattformkonto hat keine von beiden. In ihnen stehen Kranken- und
    Urlaubstage — Gesundheitsdaten im Sinne des Art. 9 DSGVO. Dass ein
    Supportzugang sie nicht sieht, ist kein Zufall, sondern wird in
    `tests/supabase/supportzugang.test.ts` festgehalten.

    SCHEINFOTOS waren offen und sind es ab hier nicht mehr. Sie entstehen in
    der Wohnung eines Kunden; wer sie ansieht, sieht mehr als eine
    Installation. Für die Fragen, mit denen ein Betrieb anruft, braucht es sie
    nicht.

  Für jedes Mitglied des Betriebs ändert sich dadurch NICHTS:
  `app.betriebsmitglied` ist Wort für Wort der alte Rumpf von `app.darf`.
*/
drop policy if exists work_sheet_photos_lesen on work_sheet_photos;
create policy work_sheet_photos_lesen on work_sheet_photos
  for select using (app.betriebsmitglied(company_id));

/*
  UND DIE ZWEITE TÜR ZUM SELBEN RAUM. `work_sheet_photos_schreiben` ist eine
  `for all`-Richtlinie, und `all` schliesst das LESEN ein — die engere
  Leseregel darüber hätte allein gar nichts bewirkt, weil Richtlinien
  ODER-verknüpft sind. Genau diese Falle hat die Prüfung gefunden, nicht das
  Nachdenken.

  Für Mitglieder des Betriebs bleibt alles wie zuvor; für ein Plattformkonto
  fällt damit auch der Schreibweg weg, den ohnehin schon der Riegel aus
  Abschnitt 4 versperrt.
*/
drop policy if exists work_sheet_photos_schreiben on work_sheet_photos;
create policy work_sheet_photos_schreiben on work_sheet_photos
  for all using (app.betriebsmitglied(company_id))
  with check (app.betriebsmitglied(company_id));

-- ---------------------------------------------------------------------------
-- 8. Und was er sehr wohl sieht: die Rechnungen
-- ---------------------------------------------------------------------------

/*
  DIE LINIE, DIE HIER GEZOGEN WIRD, IN EINEM SATZ: ein Supportzugang sieht die
  GESCHÄFTSDATEN des Betriebs, aber keine personenbezogenen Daten seiner
  Mitarbeiter und keine Bilder aus Kundenwohnungen.

  Ohne diesen Abschnitt wäre der Zugang an der häufigsten Frage überhaupt
  vorbeigebaut — „die Rechnung stimmt nicht". Die vier Tabellen unten hängen
  an `app.ist_buch_oder_spitze()`, und ein Plattformkonto hat keine Rolle; es
  sähe Kunden, Baustellen und Scheine, aber ausgerechnet den Beleg nicht, um
  den es geht.

  BEWUSST NICHT DABEI sind die ANGEBOTE. Ein Angebot ist selten der Grund
  eines Anrufs, und was nicht gebraucht wird, bleibt zu. Dass die Liste
  dadurch etwas willkürlich aussieht, ist der Preis dafür, dass sie klein
  bleibt; sie steht als Ganzes in `tests/supabase/supportzugang.test.ts`.

  Für jedes Mitglied des Betriebs ändert sich nichts: die bisherige Bedingung
  steht unverändert davor, der Supportzweig kommt daneben.
*/
drop policy if exists invoices_lesen on invoices;
create policy invoices_lesen on invoices
  for select using (
    (app.darf(company_id) and app.ist_buch_oder_spitze()) or app.support_liest(company_id));

drop policy if exists invoice_lines_lesen on invoice_lines;
create policy invoice_lines_lesen on invoice_lines
  for select using (
    (app.darf(company_id) and app.ist_buch_oder_spitze()) or app.support_liest(company_id));

drop policy if exists invoice_coverage_lesen on invoice_coverage;
create policy invoice_coverage_lesen on invoice_coverage
  for select using (
    (app.darf(company_id) and app.ist_buch_oder_spitze()) or app.support_liest(company_id));

drop policy if exists zahlungen_lesen on zahlungseingaenge;
create policy zahlungen_lesen on zahlungseingaenge
  for select using (
    (app.darf(company_id) and app.ist_buch_oder_spitze()) or app.support_liest(company_id));
