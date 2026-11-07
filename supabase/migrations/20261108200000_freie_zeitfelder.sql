/*
  FREI KONFIGURIERBARE ZEITFELDER (M06b, N01, 08.11.2026)

  WAS FEHLTE. Was ein Betrieb über die festen Spalten hinaus zu einer
  Zeitbuchung wissen will — die Kostenstelle, die Kilometer mit dem
  Firmenauto, die Auftragsnummer der Hausverwaltung, ob der Kunde das
  Material gestellt hat —, stand im Kommentar oder auf einem Zettel. Der
  Feldumfang hing an der Rolle, nicht am Betrieb.

  WAS SICH ÄNDERT.
  - `zeitfeld_definitionen`: die Felder des Betriebs — Name, Typ (Text, Zahl,
    Ja/Nein, Auswahl, Datum), Regeln je Typ, für welche Stände und Rollen,
    Pflicht (nie, beim Buchen, nur das Büro), Reihenfolge, aktiv. Die
    Kennung ist eine UUID und wird nie wiederverwendet; ein Typwechsel ergibt
    ein NEUES Feld, das alte endet (ein Wert wechselt seinen Typ nie).
  - `zeitfeld_fassungen`: jede Änderung, die die Prüfung betrifft, ergibt eine
    veröffentlichte Fassung mit fortlaufender Nummer je Betrieb und dem
    Schnappschuss der Regeln. Umbenennen und Umsortieren ergeben keine — der
    Schnappschuss trägt weder Namen noch Reihenfolge, und eine Fassung, die
    der letzten gleicht, wird nicht noch einmal geschrieben.
  - `zeitbuchung_feldwerte`: je Buchung und Feld höchstens ein Wert, als
    `jsonb` mit Prüfung auf den Typ, mit der Fassung, unter der er erfasst
    wurde. Kein Spalten-Schema je Betrieb.
  - DER SCHREIBWEG IN EINEM ZUG: die Werte reisen in der Zeile der Buchung mit
    (`time_entries.zeitfelder`, nur Durchgang — gespeichert ist dort immer
    leer). Ein Auslöser prüft sie vor dem Schreiben der Buchung und schreibt
    sie danach in die eigene Tabelle — in derselben Anweisung. Damit tragen
    alle Schreibwege der Buchung sie, ohne dass einer neu gebaut wird:
    das Anlegen und Ändern über die Tabelle, das Ausgangsfach ohne Empfang
    (es speichert die ganze Zeile samt Fassung und sendet sie unverändert
    nach) und `zeit_einfuegen`. Eine Buchung ohne ihre Pflichtwerte entsteht
    nicht halb: der Auslöser lehnt die ganze Anweisung ab.
  - DIE PRÜFUNG — dieselbe Regel wie `src/lib/zeitfelder.ts`:
      Typ, Grenzen, Option (eine deaktivierte bleibt an alten Werten,
      gewählt wird sie nicht mehr); ob das Feld für Stand und Rolle der
      gebuchten Person gilt; Pflicht nach der Fassung, die das Gerät kannte.
    Eine offline vorgemerkte Buchung mit einer älteren Fassung wird nach
    IHRER Fassung geprüft und angenommen. Was die Fassung beim Eintreffen
    zusätzlich verlangt, fehlt dann — „Nachpflege“: die Buchung trägt die
    Fassung beim Eintreffen (`time_entries.zeitfeld_fassung`), und offen ist
    jede Pflichtangabe „beim Buchen“ dieser Fassung ohne Wert. Ebenso sieht
    das Büro „fehlt“ an jeder Angabe „nur Büro“ ohne Wert. Gerechnet wird das
    beim Lesen, nicht gespeichert: nichts, das veralten könnte.
  - Verrechnet: die Werte sind gesperrt wie die Buchung. Gelöscht: die Werte
    gehen mit (Fremdschlüssel).
  - Das Änderungsprotokoll (E50) zeigt die Werte: beim Anlegen und Löschen
    mit dem ganzen Stand, beim Ändern als `feld:<Kennung>` alt → neu.
    Geschrieben vom selben Auslöser wie bisher — Werte ändern sich nur mit
    ihrer Buchung, ein zweiter Schreiber wäre eine zweite Wahrheit über
    dieselbe Änderung.
  - Definieren dürfen Geschäftsführung und Administration — ein eigenes
    Recht wie die Sätze des Betriebs, nicht die Modulliste (E51).
  - Modul: Kern `zeiterfassung` mit der Unterfähigkeit
    `zeiterfassung.freie_zeitfelder` (Standard an; ohne Felder ändert sich
    nichts). Definieren und Werte schreiben prüfen sie (V3).

  DATENSCHUTZ. Die Werte gehören zur Arbeitszeitaufzeichnung: Datenauskunft
  der Person, bei ihrer Löschung mit den Buchungen aufbewahrt (§ 132 BAO),
  Datenauszug des Betriebs. Der Support sieht sie nicht und schreibt nicht.
  Die Definitionen liest jeder im Betrieb und der Support (Stammdaten ohne
  Personenbezug); wer veröffentlicht hat, steht als Bearbeiter in der
  Auskunft.

  Bestehende Migrationen bleiben unberührt; was sich an vorhandenen
  Funktionen ändert, steht hier als neue Fassung mit dem alten Rumpf und der
  Ergänzung (jeweils gesagt, welche).
*/

-- ---------------------------------------------------------------------------
-- 1. Das Register auf dem Server bekommt die Zeiterfassung als Kern (E51, E56)
-- ---------------------------------------------------------------------------

/*
  DIESELBE LISTE WIE `MODULE` UND `KERN` in `src/lib/module.ts` — Rumpf wie
  in `20261108100000_materialbereitschaft.sql` (mit Materialbereitschaft und
  Bestellvorschlägen aus M04b), dazu der Kernbereich
  `zeiterfassung` und seine Unterfähigkeit `zeiterfassung.freie_zeitfelder`.
  `tests/supabase/modulRegisterServer.test.ts` vergleicht beide Listen mit
  der App.
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
    ('zeiterfassung', true, '{}'::text[]),
    ('zeiterfassung.freie_zeitfelder', true, '{}'::text[]),
    ('einsatzplanung', true, '{}'::text[]),
    ('material', true, '{}'::text[]),
    ('material.katalogversionen', true, '{}'::text[]),
    ('material.lieferantenvergleich', true, '{}'::text[]),
    ('material.katalogpreisverlauf', true, '{}'::text[]),
    ('material.lagerorte_fahrzeuglager', true, '{}'::text[]),
    ('material.materialbereitschaft', true, '{}'::text[]),
    ('material.bestellvorschlaege', true, '{}'::text[]),
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
  DER KERN — Rumpf wie in `20261107300000_auftragseingang.sql`, dazu die
  Zeiterfassung. Sie ist heute nicht abschaltbar (E51, V2: das Abschalten mit
  Folgenvorschau ist ein eigenes Paket); ihre Teile sind es.
*/
create or replace function app.modul_kern()
  returns setof text
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  values ('baustellen'), ('kunden'), ('zeiterfassung')
$$;

revoke all on function app.modul_kern() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Die Regel: Definition, Wert, Geltung — dieselbe wie `src/lib/zeitfelder.ts`
-- ---------------------------------------------------------------------------

/*
  DIE STÄNDE, FÜR DIE EIN FELD GELTEN KANN: Anwesend und Zeitausgleich — die
  Stände, die in der Buchungsmaske erfasst werden. Krank, Urlaub,
  Berufsschule und die Freistellungen entstehen über ihre Meldung bzw. ihren
  Antrag, mehrtägig und auf dem Server; ein Feld dort hätte keinen Ort zum
  Ausfüllen. Für den Krankenstand kommt der Datenschutz dazu: ein Freitext
  dort nähme Diagnosen auf, die nicht hingehören (Art. 9 DSGVO).
*/
create or replace function app.zeitfeld_staende() returns text[]
  language sql immutable security definer set search_path = ''
as $$ select array['Anwesend', 'Zeitausgleich'] $$;

create or replace function app.zeitfeld_rollen() returns text[]
  language sql immutable security definer set search_path = ''
as $$ select array['Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator'] $$;

revoke all on function app.zeitfeld_staende() from public, anon, authenticated;
revoke all on function app.zeitfeld_rollen() from public, anon, authenticated;

/* Eine Zahl, wie sie in einer Meldung steht: ohne Nachkomma-Nullen, mit Komma (wie `zahlText` in der App). */
create or replace function app.zeitfeld_zahl_text(p_zahl numeric) returns text
  language sql immutable security definer set search_path = ''
as $$ select replace(trim_scale(p_zahl)::text, '.', ',') $$;

revoke all on function app.zeitfeld_zahl_text(numeric) from public, anon, authenticated;

/*
  DIE REGELN EINER DEFINITION — `null`, wenn sie stimmen, sonst der Grund.
  Je Typ nur die eigenen Schlüssel; ein fremder ist ein Fehler, keine
  stille Zugabe (sonst schleppte ein Feld Regeln eines anderen Typs mit).
*/
create or replace function app.zeitfeld_regeln_fehler(p_typ text, p_regeln jsonb) returns text
  language plpgsql immutable security definer set search_path = ''
as $$
declare
  erlaubt text[];
  fremd text;
  wert jsonb;
  opt jsonb;
  kennungen text[] := '{}';
  texte text[] := '{}';
  aktive integer := 0;
  t text;
begin
  if p_regeln is null or jsonb_typeof(p_regeln) <> 'object' then
    return 'Die Regeln haben keine gültige Form';
  end if;
  erlaubt := case p_typ
    when 'text' then array['laenge']
    when 'zahl' then array['min', 'max', 'stellen', 'einheit']
    when 'auswahl' then array['optionen']
    when 'janein' then '{}'::text[]
    when 'datum' then '{}'::text[]
  end;
  if erlaubt is null then
    return 'Unbekannter Typ';
  end if;
  select min(k) into fremd from jsonb_object_keys(p_regeln) k where not (k = any(erlaubt));
  if fremd is not null then
    return format('Unbekannte Regel „%s“', fremd);
  end if;

  if p_typ = 'text' and p_regeln ? 'laenge' then
    wert := p_regeln -> 'laenge';
    -- Erst die Art, dann die Zahl: `case` hält die Reihenfolge, ein `or` nicht zwingend.
    -- In Klammern: PL/pgSQL liest die Bedingung eines `if` bis zum ersten `then`.
    if (case when jsonb_typeof(wert) <> 'number' then true
             else (wert #>> '{}')::numeric <> trunc((wert #>> '{}')::numeric)
                  or (wert #>> '{}')::numeric < 1 or (wert #>> '{}')::numeric > 2000 end) then
      return 'Die Länge muss zwischen 1 und 2000 Zeichen liegen';
    end if;
  elsif p_typ = 'zahl' then
    if (p_regeln ? 'min' and jsonb_typeof(p_regeln -> 'min') <> 'number')
       or (p_regeln ? 'max' and jsonb_typeof(p_regeln -> 'max') <> 'number') then
      return 'Mindest- und Höchstwert müssen Zahlen sein';
    end if;
    if p_regeln ? 'min' and p_regeln ? 'max'
       and (p_regeln ->> 'min')::numeric > (p_regeln ->> 'max')::numeric then
      return 'Der Mindestwert liegt über dem Höchstwert';
    end if;
    if p_regeln ? 'stellen' then
      wert := p_regeln -> 'stellen';
      if (case when jsonb_typeof(wert) <> 'number' then true
               else (wert #>> '{}')::numeric <> trunc((wert #>> '{}')::numeric)
                    or (wert #>> '{}')::numeric < 0 or (wert #>> '{}')::numeric > 4 end) then
        return 'Nachkommastellen: 0 bis 4';
      end if;
    end if;
    if p_regeln ? 'einheit' and (jsonb_typeof(p_regeln -> 'einheit') <> 'string'
                                 or char_length(p_regeln ->> 'einheit') > 20) then
      return 'Die Einheit hat höchstens 20 Zeichen';
    end if;
  elsif p_typ = 'auswahl' then
    wert := p_regeln -> 'optionen';
    if wert is null or jsonb_typeof(wert) <> 'array' or jsonb_array_length(wert) = 0 then
      return 'Eine Auswahl braucht mindestens eine Option';
    end if;
    if jsonb_array_length(wert) > 100 then
      return 'Höchstens 100 Optionen';
    end if;
    for opt in select * from jsonb_array_elements(wert) loop
      if jsonb_typeof(opt) <> 'object' or jsonb_typeof(opt -> 'id') is distinct from 'string'
         or coalesce((opt ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true) then
        return 'Jede Option braucht eine Kennung';
      end if;
      if jsonb_typeof(opt -> 'text') is distinct from 'string' or btrim(opt ->> 'text') = ''
         or char_length(btrim(opt ->> 'text')) > 80 then
        return 'Jede Option braucht einen Text (höchstens 80 Zeichen)';
      end if;
      if jsonb_typeof(opt -> 'aktiv') is distinct from 'boolean' then
        return 'Jede Option ist wählbar oder nicht';
      end if;
      if (opt ->> 'id') = any(kennungen) then
        return 'Eine Option steht doppelt';
      end if;
      t := lower(btrim(opt ->> 'text'));
      if t = any(texte) then
        return 'Zwei Optionen heißen gleich';
      end if;
      kennungen := kennungen || (opt ->> 'id');
      texte := texte || t;
      if (opt ->> 'aktiv')::boolean then
        aktive := aktive + 1;
      end if;
    end loop;
    if aktive = 0 then
      return 'Mindestens eine Option muss wählbar sein';
    end if;
  end if;
  return null;
end;
$$;

revoke all on function app.zeitfeld_regeln_fehler(text, jsonb) from public, anon, authenticated;

/*
  EIN WERT, WIE ER GESPEICHERT WIRD: Text ohne Ränder, leer heißt „kein Wert“
  (`null`). Zahlen und Ja/Nein bleiben, wie sie sind.
*/
create or replace function app.zeitfeld_wert_norm(p_wert jsonb) returns jsonb
  language sql immutable security definer set search_path = ''
as $$
  select case
    when p_wert is null or p_wert = 'null'::jsonb then null
    when jsonb_typeof(p_wert) = 'string' then
      case when btrim(p_wert #>> '{}') = '' then null else to_jsonb(btrim(p_wert #>> '{}')) end
    else p_wert
  end
$$;

revoke all on function app.zeitfeld_wert_norm(jsonb) from public, anon, authenticated;

/*
  EIN WERT GEGEN SEIN FELD (`p_feld` wie im Schnappschuss einer Fassung:
  typ, regeln, staende, rollen, pflicht) — `null`, wenn er passt, sonst der
  Grund. `p_alt`: der bisherige Wert derselben Buchung. Eine deaktivierte
  Option bleibt an einem Wert, der sie schon trägt; neu wählen lässt sie
  sich nicht.
*/
create or replace function app.zeitfeld_wert_fehler(p_feld jsonb, p_wert jsonb, p_alt jsonb default null) returns text
  language plpgsql immutable security definer set search_path = ''
as $$
declare
  typ text := p_feld ->> 'typ';
  regeln jsonb := coalesce(p_feld -> 'regeln', '{}'::jsonb);
  zahl numeric;
  stellen integer;
  laenge integer;
  opt jsonb;
  tag date;
  s text;
begin
  if p_wert is null or p_wert = 'null'::jsonb then
    return null;
  end if;
  if typ = 'text' then
    if jsonb_typeof(p_wert) <> 'string' then
      return 'Bitte einen Text eingeben';
    end if;
    laenge := coalesce((regeln ->> 'laenge')::integer, 200);
    if char_length(p_wert #>> '{}') > laenge then
      return format('Höchstens %s Zeichen', laenge);
    end if;
    return null;
  elsif typ = 'zahl' then
    if jsonb_typeof(p_wert) <> 'number' then
      return 'Bitte eine Zahl eingeben';
    end if;
    zahl := (p_wert #>> '{}')::numeric;
    if regeln ? 'min' and zahl < (regeln ->> 'min')::numeric then
      return format('Mindestens %s', app.zeitfeld_zahl_text((regeln ->> 'min')::numeric));
    end if;
    if regeln ? 'max' and zahl > (regeln ->> 'max')::numeric then
      return format('Höchstens %s', app.zeitfeld_zahl_text((regeln ->> 'max')::numeric));
    end if;
    stellen := coalesce((regeln ->> 'stellen')::integer, 0);
    if zahl * power(10::numeric, stellen) <> trunc(zahl * power(10::numeric, stellen)) then
      return case when stellen = 0 then 'Bitte eine ganze Zahl eingeben'
                  else format('Höchstens %s Nachkommastellen', stellen) end;
    end if;
    return null;
  elsif typ = 'janein' then
    if jsonb_typeof(p_wert) <> 'boolean' then
      return 'Bitte Ja oder Nein wählen';
    end if;
    return null;
  elsif typ = 'auswahl' then
    if jsonb_typeof(p_wert) <> 'string' then
      return 'Bitte eine Option wählen';
    end if;
    select o into opt from jsonb_array_elements(coalesce(regeln -> 'optionen', '[]'::jsonb)) o
     where o ->> 'id' = p_wert #>> '{}';
    if opt is null then
      return 'Diese Option gibt es nicht';
    end if;
    if not coalesce((opt ->> 'aktiv')::boolean, true) and p_alt is distinct from p_wert then
      return 'Diese Option ist nicht mehr wählbar';
    end if;
    return null;
  elsif typ = 'datum' then
    if jsonb_typeof(p_wert) <> 'string' or (p_wert #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
      return 'Bitte ein Datum eingeben';
    end if;
    s := p_wert #>> '{}';
    begin
      tag := s::date;
    exception when others then
      return 'Dieses Datum gibt es nicht';
    end;
    if to_char(tag, 'YYYY-MM-DD') <> s then
      return 'Dieses Datum gibt es nicht';
    end if;
    if extract(year from tag) < 1900 or extract(year from tag) > 2100 then
      return 'Bitte ein Datum zwischen 1900 und 2100';
    end if;
    return null;
  end if;
  return 'Unbekannter Typ';
end;
$$;

revoke all on function app.zeitfeld_wert_fehler(jsonb, jsonb, jsonb) from public, anon, authenticated;

/*
  GILT DAS FELD FÜR DIESE BUCHUNG? Stand und Rolle der GEBUCHTEN Person (beim
  Büro, das für jemanden bucht, zählt dessen Rolle — wie bei den
  Projektfeldern der Maske). Nie für eine Buchung aus einem Antrag, einer
  Meldung oder einer Freistellung: die entstehen auf dem Server und ändern
  sich nur über ihren Antrag.
*/
create or replace function app.zeitfeld_gilt(p_feld jsonb, p_status text, p_rolle text, p_aus_antrag boolean) returns boolean
  language sql immutable security definer set search_path = ''
as $$
  select not coalesce(p_aus_antrag, false)
     and coalesce(p_feld -> 'staende', '[]'::jsonb) ? coalesce(p_status, '')
     and coalesce(p_feld -> 'rollen', '[]'::jsonb) ? coalesce(p_rolle, '')
$$;

revoke all on function app.zeitfeld_gilt(jsonb, text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Die Tabellen
-- ---------------------------------------------------------------------------

/*
  DIE DEFINITIONEN.
  - `id` ist die stabile Kennung: Werte hängen an ihr, nicht am Namen —
    umbenennen ändert keinen Wert. Nie gelöscht (kein Recht dazu): ein
    beendetes Feld bleibt mit Name und Typ lesbar, solange Werte daran
    hängen, und das ist bei einer Arbeitszeitaufzeichnung für Jahre.
  - `ersetzt_durch`: nach einem Typwechsel das neue Feld.
  - `gilt_staende` und `gilt_rollen` sortiert gespeichert (die Funktion
    sortiert), damit gleiche Regeln gleiche Schnappschüsse ergeben.
  - Wer zuletzt geändert hat, steht hier; was jede Fassung bewirkte, steht
    mit ihr (`zeitfeld_fassungen.anlass`).
*/
create table if not exists public.zeitfeld_definitionen (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  name text not null,
  typ text not null,
  regeln jsonb not null default '{}'::jsonb,
  gilt_staende text[] not null default array['Anwesend'],
  gilt_rollen text[] not null default array['Administrator', 'Buchhaltung', 'Geschäftsführung', 'Mitarbeiter', 'Projektleiter', 'Verwaltung'],
  pflicht text not null default 'nie',
  reihenfolge integer not null default 0,
  aktiv boolean not null default true,
  ersetzt_durch uuid references public.zeitfeld_definitionen(id),
  angelegt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  geaendert_von_uid uuid,
  geaendert_von_name text,
  constraint zeitfeld_definitionen_typ check (typ in ('text', 'zahl', 'janein', 'auswahl', 'datum')),
  constraint zeitfeld_definitionen_pflicht check (pflicht in ('nie', 'beim_buchen', 'nur_buero')),
  constraint zeitfeld_definitionen_name check (btrim(name) <> '' and char_length(name) <= 60),
  /*
    Die Regeln je Typ prüft `zeitfeld_speichern` (`app.zeitfeld_regeln_fehler`);
    hier nur die Form. Eine Prüfregel, die jene Funktion riefe, bräuchte für
    den Rücklauf (Dienstschlüssel) ein Ausführungsrecht, das sonst niemand hat.
  */
  constraint zeitfeld_definitionen_regeln check (jsonb_typeof(regeln) = 'object'),
  constraint zeitfeld_definitionen_staende check (cardinality(gilt_staende) > 0 and gilt_staende <@ array['Anwesend', 'Zeitausgleich']),
  constraint zeitfeld_definitionen_rollen check (
    cardinality(gilt_rollen) > 0
    and gilt_rollen <@ array['Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator'])
);

comment on table public.zeitfeld_definitionen is
  'Freie Zeitfelder (M06b, N01): eigene Angaben eines Betriebs zu Zeitbuchungen — Name, Typ, Regeln, Stände, Rollen, Pflicht. Geschrieben nur über zeitfeld_speichern/zeitfeld_typ_wechseln/zeitfeld_reihenfolge.';
comment on column public.zeitfeld_definitionen.ersetzt_durch is
  'Nach einem Typwechsel das neue Feld; dieses ist dann beendet (aktiv = false).';

-- Zwei aktive Felder mit demselben Namen wären in Export und Maske nicht zu unterscheiden.
create unique index if not exists zeitfeld_definitionen_name_eindeutig
  on public.zeitfeld_definitionen (company_id, lower(btrim(name))) where aktiv;
create index if not exists zeitfeld_definitionen_betrieb on public.zeitfeld_definitionen (company_id, reihenfolge);
create index if not exists zeitfeld_definitionen_ersetzt on public.zeitfeld_definitionen (ersetzt_durch) where ersetzt_durch is not null;

/*
  DIE FASSUNGEN. Eine eigene Tabelle und keine Nummer am Definitionssatz:
  geprüft wird eine Buchung nach dem GANZEN Feldsatz, wie er galt — welche
  Felder es gab, welche Pflicht waren, welche Optionen wählbar. Das hält nur
  ein Schnappschuss fest; eine Nummer an jeder Definition sagte nicht, wie
  die übrigen damals aussahen. Unveränderlich: niemand hat ein Recht zum
  Ändern oder Löschen.
*/
create table if not exists public.zeitfeld_fassungen (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  nummer integer not null,
  veroeffentlicht_am timestamptz not null default now(),
  felder jsonb not null default '{}'::jsonb,
  anlass text,
  von_uid uuid,
  von_name text,
  constraint zeitfeld_fassungen_nummer check (nummer > 0),
  constraint zeitfeld_fassungen_felder check (jsonb_typeof(felder) = 'object')
);

comment on table public.zeitfeld_fassungen is
  'Veröffentlichte Fassungen der freien Zeitfelder (M06b): Nummer je Betrieb und Schnappschuss der Regeln aller aktiven Felder (typ, regeln, staende, rollen, pflicht). Nur von den Funktionen geschrieben, nie geändert.';

create unique index if not exists zeitfeld_fassungen_nummer on public.zeitfeld_fassungen (company_id, nummer);

/*
  DIE WERTE.
  - `user_id` und `datum` folgen der Buchung (Auslöser unten): danach liest
    der Zeilenschutz wie bei der Buchung, und Zeiträume lassen sich ohne
    Umweg über die Buchung abfragen.
  - `typ` steht am Wert, damit die Prüfregel der Tabelle ihn kennt: ein Wert
    wechselt seinen Typ nie.
  - `fassung`: unter welcher Fassung er erfasst wurde.
  - KEIN FREMDSCHLÜSSEL AUF DIE PERSON (wie E50): die Werte bleiben mit der
    Buchung, auch wenn das Konto geht.
*/
create table if not exists public.zeitbuchung_feldwerte (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  eintrag_id uuid not null references public.time_entries(id) on delete cascade,
  feld_id uuid not null references public.zeitfeld_definitionen(id),
  user_id uuid not null,
  datum date not null,
  typ text not null,
  wert jsonb not null,
  fassung integer not null,
  geaendert_am timestamptz not null default now(),
  constraint zeitbuchung_feldwerte_typ check (typ in ('text', 'zahl', 'janein', 'auswahl', 'datum')),
  constraint zeitbuchung_feldwerte_wert check (
    case typ
      when 'zahl' then jsonb_typeof(wert) = 'number'
      when 'janein' then jsonb_typeof(wert) = 'boolean'
      else jsonb_typeof(wert) = 'string' and btrim(wert #>> '{}') <> ''
    end),
  constraint zeitbuchung_feldwerte_fassung check (fassung > 0)
);

comment on table public.zeitbuchung_feldwerte is
  'Werte der freien Zeitfelder (M06b): je Buchung und Feld höchstens einer, mit der Fassung, unter der er erfasst wurde. Geschrieben nur vom Auslöser an time_entries; lesen wie die Buchung.';

create unique index if not exists zeitbuchung_feldwerte_eintrag_feld on public.zeitbuchung_feldwerte (eintrag_id, feld_id);
create index if not exists zeitbuchung_feldwerte_person on public.zeitbuchung_feldwerte (company_id, user_id, datum);
create index if not exists zeitbuchung_feldwerte_datum on public.zeitbuchung_feldwerte (company_id, datum);
create index if not exists zeitbuchung_feldwerte_feld on public.zeitbuchung_feldwerte (feld_id);

/*
  LESEN: die Definitionen und Fassungen jeder im Betrieb (die Maske braucht
  sie) und der Support (Stammdaten ohne Personenbezug — wer „mein Feld fehlt“
  meldet, dem soll er helfen können). Die Werte, wer die Buchung liest: die
  Person selbst, Buchhaltung und Spitze (`time_entries_lesen`); der Support
  nie. SCHREIBEN: niemand über die Schnittstelle — Definitionen nur über
  die Funktionen, Werte nur mit ihrer Buchung.
*/
alter table public.zeitfeld_definitionen enable row level security;
revoke all on public.zeitfeld_definitionen from public, anon, authenticated;
grant select on public.zeitfeld_definitionen to authenticated;

drop policy if exists zeitfeld_definitionen_lesen on public.zeitfeld_definitionen;
create policy zeitfeld_definitionen_lesen on public.zeitfeld_definitionen for select
  using (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()));

alter table public.zeitfeld_fassungen enable row level security;
revoke all on public.zeitfeld_fassungen from public, anon, authenticated;
grant select on public.zeitfeld_fassungen to authenticated;

drop policy if exists zeitfeld_fassungen_lesen on public.zeitfeld_fassungen;
create policy zeitfeld_fassungen_lesen on public.zeitfeld_fassungen for select
  using (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()));

alter table public.zeitbuchung_feldwerte enable row level security;
revoke all on public.zeitbuchung_feldwerte from public, anon, authenticated;
grant select on public.zeitbuchung_feldwerte to authenticated;

drop policy if exists zeitbuchung_feldwerte_lesen on public.zeitbuchung_feldwerte;
create policy zeitbuchung_feldwerte_lesen on public.zeitbuchung_feldwerte for select
  using (company_id = (select app.lesebetrieb())
         and (user_id = (select auth.uid()) or (select app.ist_buch_oder_spitze())));

/*
  Die Riegel: `support_schreibt_nicht` auf den beiden lesbaren Tabellen,
  `support_niemals` auf den Werten (wie an den Buchungen selbst). Dazu der
  feste Betrieb, obwohl es keine Änderungsregel gibt — fiele eines Tages eine
  dazu, bliebe er.
*/
drop trigger if exists zeitfeld_definitionen_kein_support_schreiben on public.zeitfeld_definitionen;
create trigger zeitfeld_definitionen_kein_support_schreiben
  before insert or update or delete on public.zeitfeld_definitionen
  for each row execute function app.support_schreibt_nicht();
drop trigger if exists zeitfeld_definitionen_betrieb_fest on public.zeitfeld_definitionen;
create trigger zeitfeld_definitionen_betrieb_fest
  before update on public.zeitfeld_definitionen
  for each row execute function app.betrieb_unveraenderlich();

drop trigger if exists zeitfeld_fassungen_kein_support_schreiben on public.zeitfeld_fassungen;
create trigger zeitfeld_fassungen_kein_support_schreiben
  before insert or update or delete on public.zeitfeld_fassungen
  for each row execute function app.support_schreibt_nicht();
drop trigger if exists zeitfeld_fassungen_betrieb_fest on public.zeitfeld_fassungen;
create trigger zeitfeld_fassungen_betrieb_fest
  before update on public.zeitfeld_fassungen
  for each row execute function app.betrieb_unveraenderlich();

drop trigger if exists zeitbuchung_feldwerte_support_niemals on public.zeitbuchung_feldwerte;
create trigger zeitbuchung_feldwerte_support_niemals
  before insert or update or delete on public.zeitbuchung_feldwerte
  for each row execute function app.support_niemals();
drop trigger if exists zeitbuchung_feldwerte_betrieb_fest on public.zeitbuchung_feldwerte;
create trigger zeitbuchung_feldwerte_betrieb_fest
  before update on public.zeitbuchung_feldwerte
  for each row execute function app.betrieb_unveraenderlich();

-- ---------------------------------------------------------------------------
-- 4. Die Spalten an der Buchung
-- ---------------------------------------------------------------------------

/*
  `zeitfelder`: der DURCHGANG der Werte — `{"fassung": n, "werte": {"<Feld>":
  Wert oder null}}`. Gespeichert ist er nie (der Auslöser leert ihn vor dem
  Schreiben; die Prüfregel hält es fest). `null` im Durchgang heißt „Wert
  entfernen“; ein Feld, das fehlt, bleibt, wie es ist.

  `zeitfeld_fassung`: die Fassung, die beim Eintreffen der Buchung galt —
  setzt die Datenbank. Danach rechnet sich, was fehlt (oben).
*/
alter table public.time_entries add column if not exists zeitfelder jsonb;
alter table public.time_entries add column if not exists zeitfeld_fassung integer;

alter table public.time_entries drop constraint if exists time_entries_zeitfelder_durchgang;
alter table public.time_entries
  add constraint time_entries_zeitfelder_durchgang check (zeitfelder is null);

comment on column public.time_entries.zeitfelder is
  'Durchgang der freien Zeitfelder beim Schreiben ({fassung, werte}); immer leer gespeichert — die Werte stehen in zeitbuchung_feldwerte.';
comment on column public.time_entries.zeitfeld_fassung is
  'Die Fassung der freien Zeitfelder beim Eintreffen der Buchung — setzt die Datenbank. Leer: vor den freien Zeitfeldern.';

-- ---------------------------------------------------------------------------
-- 5. Veröffentlichen, Recht
-- ---------------------------------------------------------------------------

/* Der Schnappschuss der Regeln aller aktiven Felder — ohne Namen und Reihenfolge. */
create or replace function app.zeitfeld_satz(p_betrieb text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_object_agg(d.id::text, jsonb_build_object(
           'typ', d.typ, 'regeln', d.regeln, 'staende', to_jsonb(d.gilt_staende),
           'rollen', to_jsonb(d.gilt_rollen), 'pflicht', d.pflicht)), '{}'::jsonb)
    from public.zeitfeld_definitionen d
   where d.company_id = p_betrieb and d.aktiv
$$;

revoke all on function app.zeitfeld_satz(text) from public, anon, authenticated;

/*
  EINE NEUE FASSUNG — nur, wenn sich der Schnappschuss von der letzten
  unterscheidet. Gibt die geltende Nummer zurück (leer, solange es keine
  Felder gibt). Der Aufrufer hält die Sperre des Betriebs.
*/
create or replace function app.zeitfeld_veroeffentlichen(p_betrieb text, p_anlass text) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  satz jsonb := app.zeitfeld_satz(p_betrieb);
  letzte public.zeitfeld_fassungen;
  neue_nummer integer;
begin
  select * into letzte from public.zeitfeld_fassungen f
   where f.company_id = p_betrieb order by f.nummer desc limit 1;
  if letzte.id is not null and letzte.felder = satz then
    return letzte.nummer;
  end if;
  if letzte.id is null and satz = '{}'::jsonb then
    return null;
  end if;
  neue_nummer := coalesce(letzte.nummer, 0) + 1;
  insert into public.zeitfeld_fassungen (company_id, nummer, felder, anlass, von_uid, von_name)
  values (p_betrieb, neue_nummer, satz, p_anlass, auth.uid(), (select u.name from public.users u where u.id = auth.uid()));
  return neue_nummer;
end;
$$;

revoke all on function app.zeitfeld_veroeffentlichen(text, text) from public, anon, authenticated;

/*
  DAS RECHT: Geschäftsführung und Administration des eigenen Betriebs — ein
  eigenes Recht wie die Sätze des Betriebs, nicht die Modulliste (die hat nur
  die Administration, E51). Der Support definiert nicht, auch mit
  „mitarbeiten“ nicht: die Felder gehören zur Arbeitszeitaufzeichnung, die
  er nicht sieht. Das Modul zählt (V3). Gibt den Betrieb zurück und hält die
  Sperre, unter der eine Fassung nach der anderen entsteht.
*/
create or replace function app.darf_zeitfelder_definieren() returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
begin
  if betrieb is null or not app.betriebsmitglied(betrieb) then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Die Zeitfelder legen die Geschäftsführung und die Administration fest' using errcode = '42501';
  end if;
  if not app.modul_aktiv(betrieb, 'zeiterfassung.freie_zeitfelder') then
    raise exception 'Die freien Zeitfelder sind in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;
  perform pg_advisory_xact_lock(hashtext('zeitfelder:' || betrieb));
  return betrieb;
end;
$$;

revoke all on function app.darf_zeitfelder_definieren() from public, anon, authenticated;

/* Die Angaben einer Definition aus dem Aufruf — geprüft; wirft mit dem Grund. */
create or replace function app.zeitfeld_angaben(p_feld jsonb,
  out name text, out typ text, out regeln jsonb, out staende text[], out rollen text[], out pflicht text, out aktiv boolean)
  language plpgsql immutable security definer set search_path = ''
as $$
declare
  fehler text;
begin
  if p_feld is null or jsonb_typeof(p_feld) <> 'object' then
    raise exception 'Die Angaben zum Feld fehlen' using errcode = '22023';
  end if;
  name := btrim(coalesce(p_feld ->> 'name', ''));
  if name = '' or char_length(name) > 60 then
    raise exception 'Bitte einen Namen eingeben (höchstens 60 Zeichen)' using errcode = '22023';
  end if;
  typ := p_feld ->> 'typ';
  if typ is null or typ not in ('text', 'zahl', 'janein', 'auswahl', 'datum') then
    raise exception 'Unbekannter Typ' using errcode = '22023';
  end if;
  regeln := coalesce(p_feld -> 'regeln', '{}'::jsonb);
  fehler := app.zeitfeld_regeln_fehler(typ, regeln);
  if fehler is not null then
    raise exception '%', fehler using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_feld -> 'gilt_staende', '["Anwesend"]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_feld -> 'gilt_rollen', to_jsonb(app.zeitfeld_rollen()))) <> 'array' then
    raise exception 'Stände und Rollen sind Listen' using errcode = '22023';
  end if;
  staende := array(select distinct x from jsonb_array_elements_text(coalesce(p_feld -> 'gilt_staende', '["Anwesend"]'::jsonb)) x order by 1);
  rollen := array(select distinct x from jsonb_array_elements_text(coalesce(p_feld -> 'gilt_rollen', to_jsonb(app.zeitfeld_rollen()))) x order by 1);
  if cardinality(staende) = 0 or not (staende <@ app.zeitfeld_staende()) then
    raise exception 'Gilt für Anwesend, Zeitausgleich oder beide' using errcode = '22023';
  end if;
  if cardinality(rollen) = 0 or not (rollen <@ app.zeitfeld_rollen()) then
    raise exception 'Bitte mindestens eine Rolle wählen' using errcode = '22023';
  end if;
  pflicht := coalesce(p_feld ->> 'pflicht', 'nie');
  if pflicht not in ('nie', 'beim_buchen', 'nur_buero') then
    raise exception 'Unbekannte Pflicht' using errcode = '22023';
  end if;
  aktiv := coalesce((p_feld ->> 'aktiv')::boolean, true);
end;
$$;

revoke all on function app.zeitfeld_angaben(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Die Befehle der Definitionsseite
-- ---------------------------------------------------------------------------

/*
  EIN FELD ANLEGEN (ohne `id`) ODER ÄNDERN — und, wo es die Prüfung betrifft,
  eine neue Fassung veröffentlichen, im selben Zug.

  - Der Typ ändert sich hier nicht: ein Wert wechselt seinen Typ nie. Dafür
    gibt es `zeitfeld_typ_wechseln` — neues Feld, altes endet.
  - Eine Option lässt sich deaktivieren; ENTFERNEN nur, solange kein Wert sie
    trägt. Sonst stünde an alten Buchungen eine Kennung ohne Text.
  - Ein durch einen Typwechsel beendetes Feld kommt nicht zurück — es gäbe
    sonst zwei aktive Felder für dieselbe Angabe.
*/
create or replace function public.zeitfeld_speichern(p_feld jsonb) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.darf_zeitfelder_definieren();
  a record;
  kennung uuid;
  alt public.zeitfeld_definitionen;
  weg text;
  nummer integer;
  ich text := (select u.name from public.users u where u.id = auth.uid());
  anlass text;
begin
  select * into a from app.zeitfeld_angaben(p_feld);
  begin
    kennung := nullif(p_feld ->> 'id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Unbekannte Kennung' using errcode = '22023';
  end;

  begin
    if kennung is null then
      insert into public.zeitfeld_definitionen (
        company_id, name, typ, regeln, gilt_staende, gilt_rollen, pflicht, reihenfolge, aktiv,
        geaendert_von_uid, geaendert_von_name)
      values (
        betrieb, a.name, a.typ, a.regeln, a.staende, a.rollen, a.pflicht,
        coalesce((select max(d.reihenfolge) from public.zeitfeld_definitionen d where d.company_id = betrieb), 0) + 1,
        a.aktiv, auth.uid(), ich)
      returning id into kennung;
      anlass := format('„%s“ angelegt', a.name);
    else
      select * into alt from public.zeitfeld_definitionen d
       where d.id = kennung and d.company_id = betrieb for update;
      if alt.id is null then
        raise exception 'Dieses Feld gibt es in diesem Betrieb nicht' using errcode = 'P0002';
      end if;
      if alt.typ <> a.typ then
        raise exception 'Den Typ ändert „Typ ändern“: daraus wird ein neues Feld, das alte endet'
          using errcode = '22023';
      end if;
      if a.aktiv and not alt.aktiv and alt.ersetzt_durch is not null then
        raise exception 'Dieses Feld ist durch ein neues ersetzt und bleibt beendet' using errcode = '55000';
      end if;
      if alt.typ = 'auswahl' then
        select o ->> 'text' into weg
          from jsonb_array_elements(alt.regeln -> 'optionen') o
         where not exists (select 1 from jsonb_array_elements(a.regeln -> 'optionen') n where n ->> 'id' = o ->> 'id')
           and exists (select 1 from public.zeitbuchung_feldwerte w
                        where w.feld_id = kennung and w.wert = to_jsonb(o ->> 'id'))
         limit 1;
        if weg is not null then
          raise exception 'Die Option „%“ ist an Buchungen gewählt — deaktivieren statt entfernen', weg
            using errcode = '55000';
        end if;
      end if;
      update public.zeitfeld_definitionen
         set name = a.name, regeln = a.regeln, gilt_staende = a.staende, gilt_rollen = a.rollen,
             pflicht = a.pflicht, aktiv = a.aktiv,
             geaendert_am = now(), geaendert_von_uid = auth.uid(), geaendert_von_name = ich
       where id = kennung;
      anlass := case
        when alt.aktiv and not a.aktiv then format('„%s“ beendet', a.name)
        when not alt.aktiv and a.aktiv then format('„%s“ wieder aktiv', a.name)
        else format('„%s“ geändert', a.name) end;
    end if;
  exception when unique_violation then
    raise exception 'Ein aktives Feld „%“ gibt es schon', a.name using errcode = '23505';
  end;

  nummer := app.zeitfeld_veroeffentlichen(betrieb, anlass);
  return jsonb_build_object('id', kennung, 'fassung', nummer);
end;
$$;

comment on function public.zeitfeld_speichern(jsonb) is
  'Legt ein freies Zeitfeld an oder ändert es (ohne Typwechsel) und veröffentlicht, wo es die Prüfung betrifft, eine neue Fassung — Geschäftsführung und Administration (M06b).';

revoke all on function public.zeitfeld_speichern(jsonb) from public, anon;
grant execute on function public.zeitfeld_speichern(jsonb) to authenticated;

/*
  TYPWECHSEL = NEUES FELD, ALTES ENDET (Entscheidung M06b). Ein Wert wechselt
  seinen Typ nie: „12“ als Text ist keine Zahl, und „Ja“ keine Option. Das
  alte Feld bleibt mit Namen und Typ lesbar, seine Werte bleiben, wie sie
  sind; das neue steht an seiner Stelle in der Reihenfolge. Eine Fassung.
*/
create or replace function public.zeitfeld_typ_wechseln(p_alt uuid, p_feld jsonb) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.darf_zeitfelder_definieren();
  a record;
  alt public.zeitfeld_definitionen;
  neu uuid;
  nummer integer;
  ich text := (select u.name from public.users u where u.id = auth.uid());
begin
  select * into a from app.zeitfeld_angaben(p_feld);
  select * into alt from public.zeitfeld_definitionen d
   where d.id = p_alt and d.company_id = betrieb for update;
  if alt.id is null then
    raise exception 'Dieses Feld gibt es in diesem Betrieb nicht' using errcode = 'P0002';
  end if;
  if not alt.aktiv then
    raise exception 'Ein beendetes Feld wechselt seinen Typ nicht' using errcode = '55000';
  end if;
  if alt.typ = a.typ then
    raise exception 'Der Typ ist derselbe — dafür genügt „Speichern“' using errcode = '22023';
  end if;

  update public.zeitfeld_definitionen
     set aktiv = false, geaendert_am = now(), geaendert_von_uid = auth.uid(), geaendert_von_name = ich
   where id = alt.id;
  begin
    insert into public.zeitfeld_definitionen (
      company_id, name, typ, regeln, gilt_staende, gilt_rollen, pflicht, reihenfolge, aktiv,
      geaendert_von_uid, geaendert_von_name)
    values (betrieb, a.name, a.typ, a.regeln, a.staende, a.rollen, a.pflicht, alt.reihenfolge, true, auth.uid(), ich)
    returning id into neu;
  exception when unique_violation then
    raise exception 'Ein aktives Feld „%“ gibt es schon', a.name using errcode = '23505';
  end;
  update public.zeitfeld_definitionen set ersetzt_durch = neu where id = alt.id;

  nummer := app.zeitfeld_veroeffentlichen(betrieb, format('„%s“: Typ gewechselt, neues Feld', a.name));
  return jsonb_build_object('id', neu, 'alt', alt.id, 'fassung', nummer);
end;
$$;

comment on function public.zeitfeld_typ_wechseln(uuid, jsonb) is
  'Typwechsel eines freien Zeitfelds: legt ein neues Feld an, beendet das alte (Werte bleiben lesbar), eine neue Fassung (M06b).';

revoke all on function public.zeitfeld_typ_wechseln(uuid, jsonb) from public, anon;
grant execute on function public.zeitfeld_typ_wechseln(uuid, jsonb) to authenticated;

/* Die Reihenfolge — betrifft die Prüfung nicht, ergibt also keine Fassung. */
create or replace function public.zeitfeld_reihenfolge(p_ids uuid[]) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.darf_zeitfelder_definieren();
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;
  if exists (select 1 from unnest(p_ids) k
              where not exists (select 1 from public.zeitfeld_definitionen d where d.id = k and d.company_id = betrieb)) then
    raise exception 'Ein Feld der Reihenfolge gibt es in diesem Betrieb nicht' using errcode = 'P0002';
  end if;
  update public.zeitfeld_definitionen d
     set reihenfolge = x.pos
    from unnest(p_ids) with ordinality as x(id, pos)
   where d.id = x.id and d.company_id = betrieb;
end;
$$;

revoke all on function public.zeitfeld_reihenfolge(uuid[]) from public, anon;
grant execute on function public.zeitfeld_reihenfolge(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Der Schreibweg: Auslöser an der Buchung
-- ---------------------------------------------------------------------------

/*
  WIE DIE WERTE VON DER PRÜFUNG ZUM SCHREIBEN KOMMEN. Geprüft wird VOR dem
  Schreiben der Buchung (nur dort lässt sich der Durchgang leeren und die
  ganze Anweisung ablehnen), geschrieben DANACH (erst dann gibt es die
  Buchung, an der der Fremdschlüssel hängt — und ein „anlegen“, das das
  Ausgangsfach ein zweites Mal sendet und das wegen derselben Kennung nicht
  stattfindet, schreibt dann auch keine Werte über spätere Änderungen).
  Dazwischen liegt die Änderung je Buchung in EINER Einstellung der
  Transaktion (`app.zeitfelder_stash`, ein Objekt je Kennung), nicht in
  einer je Buchung: jede eigene Einstellung bliebe als Name in der
  Verbindung stehen, bis sie endet.
*/
create or replace function app.zeitfelder_stash() returns jsonb
  language sql stable security definer set search_path = ''
as $$ select coalesce(nullif(current_setting('app.zeitfelder_stash', true), '')::jsonb, '{}'::jsonb) $$;

revoke all on function app.zeitfelder_stash() from public, anon, authenticated;

create or replace function app.zeitfelder_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  stash jsonb := app.zeitfelder_stash();
  schluessel text;
  eingabe jsonb;
  werte jsonb;
  fassung_nr integer;
  satz jsonb;
  buchungssatz jsonb;
  definitionen jsonb;
  alte jsonb := '{}'::jsonb;
  rolle text;
  aus_antrag boolean;
  eintrag record;
  feld jsonb;
  def jsonb;
  neu jsonb;
  alt jsonb;
  fehler text;
  aenderung jsonb := '{}'::jsonb;
  fehlend text;
  dienst boolean := app.ist_dienst();
begin
  if tg_op = 'DELETE' then
    -- Für das Änderungsprotokoll: der Stand der Werte vor dem Löschen (danach nimmt der Fremdschlüssel sie mit).
    if exists (select 1 from public.zeitbuchung_feldwerte w where w.eintrag_id = old.id) then
      stash := stash || jsonb_build_object('weg:' || old.id::text,
        (select jsonb_object_agg(w.feld_id::text, w.wert) from public.zeitbuchung_feldwerte w where w.eintrag_id = old.id));
      perform set_config('app.zeitfelder_stash', stash::text, true);
    end if;
    return old;
  end if;

  schluessel := new.id::text;
  eingabe := new.zeitfelder;
  new.zeitfelder := null;
  -- Ein Rest aus einer früheren Anweisung derselben Transaktion gilt nicht für diese.
  if stash ? schluessel then
    stash := stash - schluessel;
    perform set_config('app.zeitfelder_stash', stash::text, true);
  end if;

  if tg_op = 'INSERT' then
    -- Der Rücklauf bringt die Fassung mit; sonst gilt die beim Eintreffen.
    if not dienst then
      new.zeitfeld_fassung := (select max(f.nummer) from public.zeitfeld_fassungen f where f.company_id = new.company_id);
    end if;
    -- Dieselbe Kennung noch einmal (das Ausgangsfach sendet nach): angelegt wird ohnehin nichts.
    if exists (select 1 from public.time_entries t where t.id = new.id) then
      return new;
    end if;
  elsif not dienst then
    new.zeitfeld_fassung := old.zeitfeld_fassung;
  end if;

  if eingabe is null or eingabe = 'null'::jsonb then
    return new;
  end if;
  if jsonb_typeof(eingabe) <> 'object' then
    raise exception 'Die freien Angaben haben keine gültige Form' using errcode = '22023';
  end if;
  werte := coalesce(eingabe -> 'werte', '{}'::jsonb);
  if jsonb_typeof(werte) <> 'object' then
    raise exception 'Die freien Angaben haben keine gültige Form' using errcode = '22023';
  end if;

  -- V3: abgeschaltet nimmt der Server keine Werte an; ein leerer Durchgang ändert nichts.
  if not app.modul_aktiv(new.company_id, 'zeiterfassung.freie_zeitfelder') then
    if exists (select 1 from jsonb_each(werte) x where app.zeitfeld_wert_norm(x.value) is not null) then
      raise exception 'Die freien Zeitfelder sind in diesem Betrieb ausgeschaltet (Einstellungen → Module) — bitte ohne diese Angaben speichern'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if jsonb_typeof(eingabe -> 'fassung') is distinct from 'number' then
    raise exception 'Die Fassung der freien Zeitfelder fehlt' using errcode = '22023';
  end if;
  fassung_nr := (eingabe ->> 'fassung')::numeric::integer;
  select f.felder into satz from public.zeitfeld_fassungen f where f.company_id = new.company_id and f.nummer = fassung_nr;
  if satz is null then
    raise exception 'Diese Fassung der freien Zeitfelder gibt es nicht' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(d.id::text, jsonb_build_object('name', d.name, 'typ', d.typ, 'reihenfolge', d.reihenfolge)), '{}'::jsonb)
    into definitionen
    from public.zeitfeld_definitionen d where d.company_id = new.company_id;
  rolle := (select u.role from public.users u where u.id = new.user_id);
  aus_antrag := num_nonnulls(new.vacation_id, new.krankmeldung_id, new.freistellung_id) > 0;

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(w.feld_id::text, w.wert), '{}'::jsonb) into alte
      from public.zeitbuchung_feldwerte w where w.eintrag_id = new.id;
  end if;

  for eintrag in select x.key, x.value from jsonb_each(werte) x loop
    if not (definitionen ? eintrag.key) then
      raise exception 'Dieses Feld gibt es in diesem Betrieb nicht' using errcode = '22023';
    end if;
    neu := app.zeitfeld_wert_norm(eintrag.value);
    alt := alte -> eintrag.key;
    continue when neu is not distinct from alt;
    def := satz -> eintrag.key;
    if neu is not null then
      if def is null then
        raise exception '„%“ ist in dieser Fassung kein Feld (mehr) — bitte neu laden', definitionen -> eintrag.key ->> 'name'
          using errcode = '22023';
      end if;
      if not app.zeitfeld_gilt(def, new.status, rolle, aus_antrag) then
        raise exception '„%“ gilt nicht für diese Buchung', definitionen -> eintrag.key ->> 'name' using errcode = '22023';
      end if;
      fehler := app.zeitfeld_wert_fehler(def, neu, alt);
      if fehler is not null then
        raise exception '%: %', definitionen -> eintrag.key ->> 'name', fehler using errcode = '22023';
      end if;
    end if;
    aenderung := aenderung || jsonb_build_object(eintrag.key, jsonb_build_object(
      'alt', alt, 'neu', neu, 'typ', definitionen -> eintrag.key ->> 'typ', 'fassung', fassung_nr));
  end loop;

  -- PFLICHT BEIM BUCHEN, nach der Fassung, die das Gerät kannte.
  if tg_op = 'INSERT' then
    select string_agg(definitionen -> x.key ->> 'name', ', ' order by (definitionen -> x.key ->> 'reihenfolge')::integer, x.key)
      into fehlend
      from jsonb_each(satz) x
     where x.value ->> 'pflicht' = 'beim_buchen'
       and app.zeitfeld_gilt(x.value, new.status, rolle, aus_antrag)
       and app.zeitfeld_wert_norm(werte -> x.key) is null;
    if fehlend is not null then
      raise exception 'Bitte ausfüllen: %', fehlend using errcode = '22023';
    end if;
  else
    /*
      Beim Ändern bleibt eine Pflichtangabe, was sie war: entfernt wird
      keine, die nach der Fassung der Buchung beim Buchen Pflicht ist.
    */
    if exists (select 1 from jsonb_each(aenderung) x where x.value -> 'neu' = 'null'::jsonb) then
      select f.felder into buchungssatz from public.zeitfeld_fassungen f
       where f.company_id = new.company_id and f.nummer = new.zeitfeld_fassung;
      select string_agg(definitionen -> x.key ->> 'name', ', ' order by x.key) into fehlend
        from jsonb_each(aenderung) x
       where x.value -> 'neu' = 'null'::jsonb
         and buchungssatz -> x.key ->> 'pflicht' = 'beim_buchen'
         and app.zeitfeld_gilt(buchungssatz -> x.key, new.status, rolle, aus_antrag);
      if fehlend is not null then
        raise exception 'Pflichtangabe bleibt: %', fehlend using errcode = '22023';
      end if;
    end if;
    -- VERRECHNET IST VERRECHNET — auch für die Angaben (wie `app.verrechnet_bleibt_verrechnet`).
    if old.is_billed and not dienst and aenderung <> '{}'::jsonb then
      raise exception 'Diese Buchung ist mit Rechnung % verrechnet — ihre Angaben bleiben, wie sie sind',
        coalesce(nullif(old.invoice_number, ''), '—')
        using errcode = '42501';
    end if;
  end if;

  if aenderung <> '{}'::jsonb then
    stash := stash || jsonb_build_object(schluessel, aenderung);
    perform set_config('app.zeitfelder_stash', stash::text, true);
  end if;
  return new;
end;
$$;

revoke all on function app.zeitfelder_pruefen() from public, anon, authenticated;

/*
  ALS LETZTER der Auslöser vor dem Schreiben („z“): er sieht den Stand, den
  die übrigen gesetzt haben, und eine Sperre, die ohnehin ablehnt (verrechnet,
  Antrag, Meldung), greift vorher.
*/
drop trigger if exists time_entries_zeitfelder on public.time_entries;
create trigger time_entries_zeitfelder
  before insert or update or delete on public.time_entries
  for each row execute function app.zeitfelder_pruefen();

/* Nach dem Schreiben: die Werte in ihre Tabelle; Person und Tag folgen der Buchung. */
create or replace function app.zeitfelder_schreiben() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  aenderung jsonb := app.zeitfelder_stash() -> new.id::text;
  x record;
begin
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.date is distinct from old.date) then
    update public.zeitbuchung_feldwerte w
       set user_id = new.user_id, datum = new.date
     where w.eintrag_id = new.id;
  end if;
  if aenderung is null then
    return null;
  end if;
  for x in select e.key, e.value from jsonb_each(aenderung) e loop
    if x.value -> 'neu' is null or x.value -> 'neu' = 'null'::jsonb then
      delete from public.zeitbuchung_feldwerte w where w.eintrag_id = new.id and w.feld_id = x.key::uuid;
    else
      insert into public.zeitbuchung_feldwerte (company_id, eintrag_id, feld_id, user_id, datum, typ, wert, fassung)
      values (new.company_id, new.id, x.key::uuid, new.user_id, new.date, x.value ->> 'typ', x.value -> 'neu',
              (x.value ->> 'fassung')::integer)
      on conflict (eintrag_id, feld_id) do update
        set wert = excluded.wert, fassung = excluded.fassung, typ = excluded.typ,
            user_id = excluded.user_id, datum = excluded.datum, geaendert_am = now();
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function app.zeitfelder_schreiben() from public, anon, authenticated;

/* „f“ vor „v“: das Änderungsprotokoll (`time_entries_verlauf`) sieht beim Anlegen die geschriebenen Werte. */
drop trigger if exists time_entries_feldwerte on public.time_entries;
create trigger time_entries_feldwerte
  after insert or update on public.time_entries
  for each row execute function app.zeitfelder_schreiben();

-- ---------------------------------------------------------------------------
-- 8. Das Änderungsprotokoll (E50) zeigt die Werte
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in `20261105100000_zeitbuchung_verlauf.sql`. Neu:
  - `zeitfelder` (Durchgang, immer leer) und `zeitfeld_fassung` (setzt die
    Datenbank) stehen bei dem, was nichts Neues sagt — die Ausschlussliste
    von E50 bleibt sonst, wie sie ist;
  - beim Anlegen und Löschen die Werte im ganzen Stand, beim Ändern je
    geändertem Wert `feld:<Kennung>` mit alt und neu. Die Namen löst die
    App über die Definition auf (`verlaufText.ts`): ein umbenanntes Feld
    heißt im Verlauf, wie es jetzt heißt — seine Kennung bleibt.
*/
create or replace function app.zeitbuchung_protokollieren() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ohne constant text[] := array['created_at', 'updated_at', 'last_edited_by', 'last_edited_by_uid', 'hours', 'satz',
                                'zeitfelder', 'zeitfeld_fassung'];
  zeile public.time_entries := coalesce(new, old);
  alt jsonb;
  neu jsonb;
  spalte text;
  unterschied jsonb := '{}'::jsonb;
  inhalt jsonb;
  art text;
  stash jsonb;
  felder jsonb;
begin
  -- Rücklauf, Löschen eines Betriebs, Prüfungen: siehe E50.
  if app.ist_dienst() then
    return null;
  end if;
  stash := app.zeitfelder_stash();

  if tg_op = 'INSERT' then
    art := 'angelegt';
    inhalt := (to_jsonb(new) - ohne) || coalesce((
      select jsonb_object_agg('feld:' || w.feld_id::text, w.wert)
        from public.zeitbuchung_feldwerte w where w.eintrag_id = new.id), '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    art := 'geloescht';
    felder := stash -> ('weg:' || old.id::text);
    inhalt := (to_jsonb(old) - ohne) || coalesce((
      select jsonb_object_agg('feld:' || e.key, e.value) from jsonb_each(felder) e), '{}'::jsonb);
  else
    alt := to_jsonb(old);
    neu := to_jsonb(new);
    for spalte in select jsonb_object_keys(neu) loop
      if not (spalte = any(ohne)) and alt -> spalte is distinct from neu -> spalte then
        unterschied := unterschied || jsonb_build_object(spalte, jsonb_build_object('alt', alt -> spalte, 'neu', neu -> spalte));
      end if;
    end loop;
    felder := stash -> new.id::text;
    if felder is not null then
      unterschied := unterschied || coalesce((
        select jsonb_object_agg('feld:' || e.key, jsonb_build_object('alt', e.value -> 'alt', 'neu', e.value -> 'neu'))
          from jsonb_each(felder) e), '{}'::jsonb);
    end if;
    if unterschied = '{}'::jsonb then
      return null;
    end if;
    art := 'geaendert';
    inhalt := unterschied;
  end if;

  insert into public.zeitbuchung_verlauf (company_id, eintrag_id, user_id, datum, art, aenderungen, von_uid, von_name)
  values (
    zeile.company_id, zeile.id, zeile.user_id, zeile.date, art, inhalt,
    auth.uid(),
    (select u.name from public.users u where u.id = auth.uid())
  );
  return null;
end;
$$;

revoke all on function app.zeitbuchung_protokollieren() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. `zeit_einfuegen` nimmt die Werte mit
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in `20261024900000_zeit_einfuegen_bearbeiten.sql`. Neu ist allein
  der Durchgang `zeitfelder` aus `p_neu` beim Anlegen der neuen und beim
  Ändern der geänderten Buchung — so prüft und schreibt derselbe Auslöser
  die Werte, im selben Zug wie das Kürzen der anderen. Der hintere Teil einer
  geteilten Buchung bekommt KEINE Werte: er ist eine neue Buchung, und was
  dort gilt (die Kilometer etwa), stünde sonst zweimal da; fehlt ihm eine
  Pflichtangabe, ist sie „Nachpflege“.
*/
create or replace function public.zeit_einfuegen(p_neu jsonb, p_id uuid default null)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  besitzer uuid := nullif(p_neu ->> 'user_id', '')::uuid;
  tag date := nullif(p_neu ->> 'date', '')::date;
  nb integer;
  ne integer;
  nummer text := btrim(coalesce(p_neu ->> 'project_number', ''));
  e public.time_entries%rowtype;
  alt public.time_entries%rowtype;
  von integer;
  bis integer;
  versatz integer;
  pause integer;
  name text;
  vorne boolean;
  hinten boolean;
  stueck record;
  geaendert jsonb := '[]'::jsonb;
  dazu jsonb := '[]'::jsonb;
  neu uuid := gen_random_uuid();
  betrieb text;
  bearbeiter text;
  bearbeiter_uid uuid := (select auth.uid());
  anzahl integer := 0;
  angaben jsonb := case when jsonb_typeof(p_neu -> 'zeitfelder') = 'object' then p_neu -> 'zeitfelder' end;
begin
  if p_neu is null or jsonb_typeof(p_neu) <> 'object' or besitzer is null or tag is null then
    raise exception 'Person und Tag der neuen Zeit fehlen' using errcode = '22023';
  end if;
  if nullif(p_neu ->> 'start_time', '') is null or nullif(p_neu ->> 'end_time', '') is null then
    raise exception 'Einfügen lässt sich nur eine Zeit mit Von und Bis' using errcode = '22023';
  end if;
  nb := extract(hour from (p_neu ->> 'start_time')::time)::integer * 60 + extract(minute from (p_neu ->> 'start_time')::time)::integer;
  ne := extract(hour from (p_neu ->> 'end_time')::time)::integer * 60 + extract(minute from (p_neu ->> 'end_time')::time)::integer;
  if ne = nb then
    raise exception 'Von und Bis sind gleich — die Zeit hat keine Dauer' using errcode = '22023';
  end if;
  -- Über Mitternacht: das Ende liegt am Folgetag.
  if ne < nb then
    ne := ne + 1440;
  end if;
  if nummer = '' then
    raise exception 'Die neue Zeit braucht eine Baustelle' using errcode = '22023';
  end if;

  -- Die geänderte Buchung: dieselbe Person, gearbeitet, nicht verrechnet.
  if p_id is not null then
    select * into alt from public.time_entries where id = p_id for update;
    if not found then
      raise exception 'Die Buchung gibt es nicht (mehr)' using errcode = 'P0002';
    end if;
    if alt.user_id is distinct from besitzer then
      raise exception 'Die Buchung gehört jemand anderem' using errcode = '22023';
    end if;
    if alt.is_billed then
      raise exception 'Die Buchung ist schon verrechnet und bleibt, wie sie ist' using errcode = '42501';
    end if;
  end if;

  if bearbeiter_uid is distinct from besitzer then
    select u.name into bearbeiter from public.users u where u.id = bearbeiter_uid;
  end if;

  -- Was der Aufrufer nicht sehen darf, gibt es für ihn nicht (Zeilenschutz).
  for e in
    select * from public.time_entries t
     where t.user_id = besitzer and t.date between tag - 1 and tag + 1 and t.status = 'Anwesend'
       and t.id is distinct from p_id
       and app.arbeitsspanne(t.date, t.start_time, t.end_time)
           && tsrange(tag + make_interval(mins => nb), tag + make_interval(mins => ne))
     order by t.date, t.start_time
     for update
  loop
    anzahl := anzahl + 1;
    betrieb := e.company_id;
    versatz := (e.date - tag) * 1440;
    von := versatz + extract(hour from e.start_time)::integer * 60 + extract(minute from e.start_time)::integer;
    bis := versatz + extract(hour from e.end_time)::integer * 60 + extract(minute from e.end_time)::integer;
    if bis <= von then
      bis := bis + 1440;
    end if;
    name := to_char(e.start_time, 'HH24:MI') || '–' || to_char(e.end_time, 'HH24:MI')
            || case when e.date < tag then ' am Vortag' when e.date > tag then ' am Folgetag' else '' end
            || coalesce(' (' || nullif(e.project_number, '') || ')', '');
    if btrim(coalesce(e.project_number, '')) = nummer then
      raise exception 'Auf derselben Baustelle ist % schon gebucht — bitte diese Buchung ändern, statt die Zeit einzufügen', name
        using errcode = '22023';
    end if;
    if e.is_billed then
      raise exception '% ist schon verrechnet und bleibt, wie sie ist — einfügen geht dort nicht', name using errcode = '42501';
    end if;
    if nb <= von and bis <= ne then
      raise exception 'Die neue Zeit bedeckt % ganz — bitte diese Buchung zuerst löschen oder ändern', name using errcode = '22023';
    end if;

    vorne := von < nb;
    hinten := ne < bis;
    pause := coalesce(e.break_duration, 0);

    if vorne and hinten then
      -- Geteilt: die Pause bleibt am längeren Teil (gleich lang: am vorderen).
      if (nb - von) >= (bis - ne) then
        if pause >= nb - von then
          raise exception 'Die Pause von % Min. aus % passt in keinen der verbleibenden Teile — bitte die Pause dort anpassen', pause, name
            using errcode = '22023';
        end if;
      elsif pause >= bis - ne then
        raise exception 'Die Pause von % Min. aus % passt in keinen der verbleibenden Teile — bitte die Pause dort anpassen', pause, name
          using errcode = '22023';
      end if;
      select * into stueck from app.einfuegen_stueck(tag, von, nb);
      update public.time_entries
         set end_time = stueck.ende,
             break_duration = case when (nb - von) >= (bis - ne) then pause else 0 end,
             last_edited_by = coalesce(bearbeiter, last_edited_by),
             last_edited_by_uid = case when bearbeiter is null then last_edited_by_uid else bearbeiter_uid end
       where id = e.id;
      select * into stueck from app.einfuegen_stueck(tag, ne, bis);
      insert into public.time_entries (
        id, company_id, user_id, user_name, date, status, start_time, end_time, break_duration,
        project_number, customer_name, is_emergency, is_helper, vehicle_plate, nacht_abgewaehlt,
        source, last_edited_by, last_edited_by_uid
      ) values (
        gen_random_uuid(), e.company_id, e.user_id, e.user_name, stueck.tag, 'Anwesend',
        stueck.beginn, stueck.ende,
        case when (nb - von) >= (bis - ne) then 0 else pause end,
        e.project_number, e.customer_name, e.is_emergency, e.is_helper, e.vehicle_plate, e.nacht_abgewaehlt,
        'manual', bearbeiter, case when bearbeiter is null then null else bearbeiter_uid end
      );
      dazu := dazu || to_jsonb(e.id);
    else
      if pause >= (case when vorne then nb - von else bis - ne end) then
        raise exception 'Die Pause von % Min. aus % passt in keinen der verbleibenden Teile — bitte die Pause dort anpassen', pause, name
          using errcode = '22023';
      end if;
      -- Bleibt nur der hintere Teil, kann er am Folgetag beginnen: dann wandert die Buchung dorthin.
      if vorne then
        select * into stueck from app.einfuegen_stueck(tag, von, nb);
      else
        select * into stueck from app.einfuegen_stueck(tag, ne, bis);
      end if;
      update public.time_entries
         set date = stueck.tag,
             start_time = stueck.beginn,
             end_time = stueck.ende,
             last_edited_by = coalesce(bearbeiter, last_edited_by),
             last_edited_by_uid = case when bearbeiter is null then last_edited_by_uid else bearbeiter_uid end
       where id = e.id;
    end if;
    geaendert := geaendert || to_jsonb(e.id);
  end loop;

  if anzahl = 0 then
    raise exception 'Die Zeit überschneidet sich mit keiner Buchung — es gibt nichts einzufügen' using errcode = '22023';
  end if;

  if p_id is null then
    -- Die neue Zeit, so wie die Maske sie sonst angelegt hätte. Nur diese
    -- Spalten: Verrechnung, Satz, Stunden und Nacht setzt nicht der Aufrufer.
    insert into public.time_entries (
      id, company_id, user_id, user_name, date, status, start_time, end_time, break_duration, travel_time,
      project_number, customer_name, vehicle_plate, helper_name, comment, is_helper, is_emergency,
      is_night_work, nacht_abgewaehlt, source, last_edited_by, last_edited_by_uid, zeitfelder
    ) values (
      neu, betrieb, besitzer, p_neu ->> 'user_name', tag, 'Anwesend',
      (p_neu ->> 'start_time')::time, (p_neu ->> 'end_time')::time,
      coalesce(nullif(p_neu ->> 'break_duration', '')::integer, 0),
      nullif(p_neu ->> 'travel_time', '')::integer,
      nummer, nullif(p_neu ->> 'customer_name', ''), nullif(p_neu ->> 'vehicle_plate', ''),
      nullif(p_neu ->> 'helper_name', ''), nullif(p_neu ->> 'comment', ''),
      coalesce((p_neu ->> 'is_helper')::boolean, false), coalesce((p_neu ->> 'is_emergency')::boolean, false),
      coalesce((p_neu ->> 'is_night_work')::boolean, false), nullif(p_neu ->> 'nacht_abgewaehlt', ''),
      'manual', bearbeiter, case when bearbeiter is null then null else bearbeiter_uid end, angaben
    );
  else
    -- Die geänderte Buchung bekommt ihre neuen Werte — erst jetzt, da die
    -- anderen Platz gemacht haben. Dieselben Spalten wie beim Anlegen.
    neu := p_id;
    update public.time_entries
       set date = tag,
           start_time = (p_neu ->> 'start_time')::time,
           end_time = (p_neu ->> 'end_time')::time,
           break_duration = coalesce(nullif(p_neu ->> 'break_duration', '')::integer, 0),
           travel_time = nullif(p_neu ->> 'travel_time', '')::integer,
           project_number = nummer,
           customer_name = nullif(p_neu ->> 'customer_name', ''),
           vehicle_plate = nullif(p_neu ->> 'vehicle_plate', ''),
           helper_name = nullif(p_neu ->> 'helper_name', ''),
           comment = nullif(p_neu ->> 'comment', ''),
           is_helper = coalesce((p_neu ->> 'is_helper')::boolean, false),
           is_emergency = coalesce((p_neu ->> 'is_emergency')::boolean, false),
           is_night_work = coalesce((p_neu ->> 'is_night_work')::boolean, false),
           nacht_abgewaehlt = nullif(p_neu ->> 'nacht_abgewaehlt', ''),
           last_edited_by = coalesce(bearbeiter, last_edited_by),
           last_edited_by_uid = case when bearbeiter is null then last_edited_by_uid else bearbeiter_uid end,
           zeitfelder = angaben
     where id = p_id;
  end if;

  return jsonb_build_object('neu', neu, 'geaendert', geaendert, 'geteilt', dazu);
end;
$$;

comment on function public.zeit_einfuegen(jsonb, uuid) is
  'Fügt eine gearbeitete Zeit zwischen bestehende Buchungen anderer Baustellen ein — neu oder als Änderung der Buchung p_id —, auch über Mitternacht: kürzt oder teilt die anderen, in einem Zug; die freien Angaben (p_neu.zeitfelder) gehen mit. Mit den Rechten des Aufrufers.';

revoke all on function public.zeit_einfuegen(jsonb, uuid) from public, anon;
grant execute on function public.zeit_einfuegen(jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Datenauskunft und Löschung
-- ---------------------------------------------------------------------------

/*
  DATENAUSKUNFT — gezielt eingefügt wie E50, M01b, M02a, M02b; wiederholbar,
  und ohne eindeutige Einfügestelle bricht die Migration ab.
  - Bei der Person: die freien Angaben ihrer Buchungen, mit dem Namen des
    Feldes und — bei einer Auswahl — dem Text der Option.
  - Als Bearbeiter: wie viele Fassungen sie veröffentlicht und wie viele
    Felder sie zuletzt geändert hat.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('zeitbuchungen_freie_angaben' in quelle) = 0 then
    marke := $m$from public.zeitbuchung_verlauf v where v.company_id = betrieb and v.user_id = p_id),$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Verlauf fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M06b: die freien Angaben ihrer Buchungen, mit dem Namen des Feldes.
      'zeitbuchungen_freie_angaben', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'buchung', w.eintrag_id, 'tag', w.datum, 'feld', d.name, 'fassung', w.fassung,
                 'wert', case when d.typ = 'auswahl'
                              then coalesce((select o -> 'text' from jsonb_array_elements(d.regeln -> 'optionen') o
                                              where o ->> 'id' = w.wert #>> '{}'), w.wert)
                              else w.wert end)
                 order by w.datum, d.reihenfolge, w.id), '[]'::jsonb)
          from public.zeitbuchung_feldwerte w
          join public.zeitfeld_definitionen d on d.id = w.feld_id
         where w.company_id = betrieb and w.user_id = p_id),$eintrag$);

    marke := $m$where v.company_id = betrieb and v.von_uid = p_id and v.user_id <> p_id),$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Bearbeiter fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M06b: Fassungen der freien Zeitfelder, die sie veröffentlicht, und Felder, die sie zuletzt geändert hat.
      'zeitfeld_fassungen_veroeffentlicht', (select count(*) from public.zeitfeld_fassungen f
        where f.company_id = betrieb and f.von_uid = p_id),
      'zeitfeld_definitionen_geaendert', (select count(*) from public.zeitfeld_definitionen d
        where d.company_id = betrieb and d.geaendert_von_uid = p_id),$eintrag$);
    execute quelle;
  end if;
end;
$migration$;

/*
  LÖSCHUNG EINER PERSON: die freien Angaben bleiben mit den Buchungen
  aufbewahrt (§ 132 BAO, wie E50). Wer eine Fassung veröffentlicht oder ein
  Feld geändert hat, bleibt stehen wie im Änderungsprotokoll (Art. 5 Abs. 2:
  wer die Aufzeichnung eingerichtet hat, muss sich zeigen lassen).
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('Freie Angaben der Zeitbuchungen' in quelle) = 0 then
    marke := $m$from public.zeitbuchung_verlauf v where v.company_id = betrieb and v.user_id = p_id
        union all$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle Verlauf fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
        -- M06b: die freien Angaben gehören zur Arbeitszeitaufzeichnung und bleiben mit ihr.
        select jsonb_build_object('was', 'Freie Angaben der Zeitbuchungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(w.datum)), 'grund', rechtsgrund)
          from public.zeitbuchung_feldwerte w where w.company_id = betrieb and w.user_id = p_id
        union all$eintrag$);
    execute quelle;
  end if;
end;
$migration$;
