/*
  KUNDEN ZUSAMMENFÜHREN (Durchsicht 15.11.2026, F9).

  WAS HEUTE IST (nachgestellt). Eine Dublette mit Belegen ist unlösbar:
  Löschen scheitert an den Fremdschlüsseln (Baustellen, Angebote, Rechnungen,
  Scheine, Wartungen), Baustellen lassen sich nur einzeln umhängen, versendete
  Angebote, ausgestellte Rechnungen und unterschriebene Scheine gar nicht
  (`app.rechnung_eingefroren`, `app.schein_zustandswechsel`). Was an der
  Dublette hängt, bleibt dort — in der Kundenakte, in der Datenauskunft, in
  der Mahnung über den Kundenstamm.

  WAS JETZT GILT. `kunden_zusammenfuehren(bleibt, geht, felder, stand)` hängt
  in EINER Transaktion alles von „geht“ an „bleibt“ um, übernimmt die
  gewählten Stammfelder, löscht „geht“ und schreibt den Vorgang ins
  Änderungsjournal. `kunden_zusammenfuehren_vorschau` zeigt vorher, was
  wohin wandert; der Stand der Vorschau geht mit, und hat sich seither etwas
  geändert, wird nichts zusammengeführt (wie bei den Schreibbefehlen).

  AUSGESTELLTE BELEGE BLEIBEN IN IHREM TEXT UNVERÄNDERT. Was auf dem Beleg
  steht — Name, Anschrift, UID der Rechnung (`customer_name`, `address`,
  `customer_vat_id`), der Name auf dem versendeten Angebot und auf dem
  unterschriebenen Schein — rührt das Zusammenführen nicht an; § 11 UStG und
  § 132 BAO verlangen den Beleg, wie er hinausging. Es wandert nur der BEZUG
  (`customer_id`): er steht auf keinem Beleg, und an ihm hängen Kundenakte,
  Mahnung (Anschrift und Kundenart aus dem Stamm), Export (Kundennummer) und
  Datenauskunft. Bliebe er an einer gelöschten oder stillgelegten Dublette,
  wären genau diese Wege falsch. Die Prüfsumme des Scheins
  (`app.schein_kanonisch`) enthält die Kennung nicht und bleibt gültig.
  Dafür öffnen `app.rechnung_eingefroren` und `app.schein_zustandswechsel`
  eine schmale Tür: genau dieser Bezug, genau von „geht“ (oder einem Beleg
  ohne Bezug mit dem Namen der Dublette) zu „bleibt“, nur während des
  Zusammenführens (`app.kunde_wandert`, gesetzt nur in dieser Funktion; ein
  Browser kann die Einstellung nicht setzen). Alle übrigen Felder bleiben
  eingefroren.

  BELEGE OHNE KUNDENBEZUG (Altdaten aus der Zeit vor den Kennungen), die den
  Namen der Dublette tragen, zählen Datenauskunft und Löschung schon heute zu
  ihr (`person_auskunft`, `person_loeschen`: „über Kennung ODER Namen“). Nach
  dem Zusammenführen gäbe es den Namen nicht mehr — sie fielen aus jeder
  Auskunft. Darum werden sie mit umgehängt, sofern kein dritter Kunde
  denselben Namen trägt; sonst bleiben sie, wie sie sind, und die Vorschau
  sagt es (Grund: Verwechslungsgefahr bei Namensgleichheit).

  DAS JOURNAL. Die Einträge mit `kunde_id = geht` wandern mit (sonst
  vergäße sie das Löschen der Dublette — `app.journal_kunde_vergessen` —
  samt dem Verlauf der umgehängten Baustellen und Rechnungen). Ein eigener
  Eintrag am bleibenden Kunden hält fest, wer wen hierher zusammengeführt
  hat und was mitkam; die geänderten Stammfelder schreibt der Auslöser am
  Kunden wie bei jeder Änderung. Löscht der Betrieb den Kunden später
  (DSGVO), vergisst `app.journal_kunde_vergessen` auch diesen Eintrag.

  DATENAUSKUNFT UND LÖSCHUNG. Keine neue Tabelle mit Personenbezug: alles
  hängt danach am bleibenden Kunden und erscheint in seiner Auskunft und
  seiner Löschung. Die Dublette selbst wird gelöscht; ihr Name und ihre
  Kennzahlen stehen im Journaleintrag am bleibenden Kunden.

  DER WÄCHTER. `app.kundenbezug_tabellen()` nennt jede Tabelle, die das
  Zusammenführen behandelt. Kennt das Schema eine weitere mit Verweis auf
  `customers` (oder einer Spalte `customer_id`/`kunde_id`), verweigert die
  Funktion das Zusammenführen, statt sie über `on delete cascade` still zu
  leeren oder ihren Verweis zu verlieren. Dieselbe Liste prüfen
  `tests/unit/kundenbezugWaechter.test.ts` (Migrationen) und
  `tests/supabase/kundenZusammenfuehren.test.ts` (Schema).

  RECHTE: wer Kunden pflegt (`app.darf_kunden_pflegen`: Führung, Verwaltung
  und Buchhaltung mit Kundenrecht). `security definer`, `search_path = ''`.
*/

-- ---------------------------------------------------------------------------
-- 1. Die Tür im Eingefrorenen: nur dieser Bezug, nur beim Zusammenführen
-- ---------------------------------------------------------------------------

/*
  Darf der Kundenbezug einer Zeile von `p_alt` auf `p_neu` wechseln? Nur
  während `kunden_zusammenfuehren` läuft — die Einstellung setzt nur diese
  Funktion, für ihre eigene Transaktion. `p_alt` ist die Dublette oder leer
  (ein Altbeleg mit ihrem Namen), `p_neu` der bleibende Kunde.

  AUSFÜHRBAR FÜR ANGEMELDETE, mit Absicht: `app.rechnung_eingefroren` und
  `app.schein_zustandswechsel` laufen mit den Rechten des Schreibenden, und
  Postgres prüft das Ausführungsrecht einer Funktion schon beim Vorbereiten
  des Ausdrucks — ohne Recht scheiterte jede Mahnung und jeder Storno. Die
  Funktion liest nur eine Einstellung der eigenen Sitzung.
*/
create or replace function app.kunde_wandert(p_alt uuid, p_neu uuid) returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select p_neu is not null
     and coalesce(current_setting('app.kunde_wandert', true), '') <> ''
     and split_part(current_setting('app.kunde_wandert', true), '>', 2) = p_neu::text
     and (p_alt is null or split_part(current_setting('app.kunde_wandert', true), '>', 1) = p_alt::text)
$$;

revoke all on function app.kunde_wandert(uuid, uuid) from public, anon;
grant execute on function app.kunde_wandert(uuid, uuid) to authenticated;

/*
  Gezielter Textersatz statt Vollersatz: diese vier Funktionen ändern auch
  andere Migrationen. Fehlt die Stelle, bricht die Migration ab, statt still
  eine veraltete Fassung einzuspielen.
*/
do $migration$
declare
  quelle text;
  marke text;
  zahl integer;
begin
  -- Die Rechnung: der Bezug ist eingefroren — außer beim Zusammenführen.
  quelle := pg_get_functiondef('app.rechnung_eingefroren()'::regprocedure);
  if position('app.kunde_wandert' in quelle) = 0 then
    marke := $m$     or new.customer_id is distinct from old.customer_id
$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Rechnung eingefroren: Stelle % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$     or (new.customer_id is distinct from old.customer_id
         and not app.kunde_wandert(old.customer_id, new.customer_id))
$neu$);
    execute quelle;
  end if;

  -- Der Schein: in jedem Zustand darf nur der Bezug wandern, sonst nichts.
  quelle := pg_get_functiondef('app.schein_zustandswechsel()'::regprocedure);
  if position('app.kunde_wandert' in quelle) = 0 then
    marke := $m$  if app.ist_dienst() then return new; end if;
$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Scheinzustand: Stelle % mal gefunden', zahl; end if;
    -- `project_id` leitet `app.baustelle_aufloesen` vorher aus der unveränderten Nummer ab (bei Altzeilen ohne Kennung).
    quelle := replace(quelle, marke, marke || $neu$  -- F9: beim Zusammenführen zweier Kunden wandert nur der Bezug; Inhalt und Prüfsumme bleiben.
  if app.kunde_wandert(old.customer_id, new.customer_id)
     and app.nur_diese_felder(to_jsonb(old), to_jsonb(new), array['customer_id', 'project_id']) then
    return new;
  end if;
$neu$);
    execute quelle;
  end if;

  -- Der Eingang: ein umgehängter Kunde ist keine Bearbeitung (und braucht das Modul nicht).
  quelle := pg_get_functiondef('app.eingang_aendern_pruefen()'::regprocedure);
  if position('app.kunde_wandert' in quelle) = 0 then
    marke := $m$  if app.ist_dienst() or auth.uid() is null then
    return new;
  end if;
$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Eingang ändern: Stelle % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, marke || $neu$  -- F9: zusammengeführt hat niemand am Eingang etwas bearbeitet — nur der Kunde zieht nach.
  if app.kunde_wandert(old.customer_id, new.customer_id)
     and app.nur_diese_felder(to_jsonb(old), to_jsonb(new), array['customer_id', 'kunde_name']) then
    return new;
  end if;
$neu$);
    execute quelle;
  end if;

  -- Der Beteiligte einer Liegenschaft: der Kunde wandert auch bei ausgeschaltetem Modul.
  quelle := pg_get_functiondef('app.liegenschaft_schreiben_pruefen()'::regprocedure);
  if position('app.kunde_wandert' in quelle) = 0 then
    marke := $m$  if app.ist_dienst() or auth.uid() is null
$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Liegenschaft schreiben: Stelle % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, marke || $neu$     -- F9: beim Zusammenführen zweier Kunden wandert der Beteiligte mit, auch ohne Modul.
     or (tg_op = 'UPDATE' and tg_table_name = 'liegenschaft_beteiligte'
         and app.kunde_wandert((to_jsonb(old) ->> 'customer_id')::uuid, (to_jsonb(new) ->> 'customer_id')::uuid))
$neu$);
    execute quelle;
  end if;
end;
$migration$;

-- ---------------------------------------------------------------------------
-- 2. Der Wächter: welche Tabellen das Zusammenführen behandelt
-- ---------------------------------------------------------------------------

/*
  JEDE TABELLE MIT KUNDENBEZUG. Kommt eine dazu, gehört sie hier hinein UND
  in `kunden_zusammenfuehren` (und in die Vorschau) — sonst verweigert die
  Funktion die Arbeit (`app.kundenbezug_unbekannt`), und die Prüfungen
  fallen.
*/
create or replace function app.kundenbezug_tabellen() returns text[]
  language sql
  immutable
  set search_path = ''
as $$
  select array[
    'aenderungsjournal', 'auftragseingaenge', 'invoices', 'liegenschaft_beteiligte', 'projects',
    'quotes', 'termine', 'uid_pruefungen', 'wartungen', 'work_sheets'
  ]::text[]
$$;

/* Tabellen mit Kundenbezug, die das Zusammenführen nicht kennt — `null`, wenn keine. */
create or replace function app.kundenbezug_unbekannt() returns text
  language sql
  stable
  set search_path = ''
as $$
  select string_agg(distinct t, ', ' order by t)
    from (
      select con.conrelid::regclass::text as t
        from pg_catalog.pg_constraint con
       where con.contype = 'f' and con.confrelid = 'public.customers'::regclass
      union
      select c.table_schema || '.' || c.table_name
        from information_schema.columns c
        join information_schema.tables tb
          on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
       where c.table_schema = 'public'
         and c.column_name in ('customer_id', 'kunde_id')
    ) x
   where regexp_replace(t, '^public\.', '') <> all (app.kundenbezug_tabellen())
$$;

revoke all on function app.kundenbezug_tabellen() from public, anon, authenticated;
revoke all on function app.kundenbezug_unbekannt() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Was wohin wandert — für Vorschau und Ausführung dieselbe Rechnung
-- ---------------------------------------------------------------------------

/*
  Die Lage zweier Kunden: beide Stammdatensätze, je Tabelle die Zahl der
  Zeilen, die wandern (über die Kennung und — bei eindeutigem Namen — über
  den Namen), und ein Stand, der sich mit jeder dieser Zahlen und jeder
  Änderung an den beiden Kunden ändert. Ohne Rechteprüfung — die beiden
  öffentlichen Funktionen prüfen vorher.
*/
create or replace function app.kunden_zusammenfuehren_lage(p_bleibt uuid, p_geht uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  bleibt public.customers;
  geht public.customers;
  betrieb text;
  name_geht text;
  eindeutig boolean;
  zahlen jsonb;
  ueber_namen jsonb;
  ergebnis jsonb;
begin
  select * into bleibt from public.customers c where c.id = p_bleibt;
  select * into geht from public.customers c where c.id = p_geht;
  betrieb := bleibt.company_id;
  name_geht := lower(btrim(geht.name));
  -- Trägt ein dritter Kunde denselben Namen, ist ein Altbeleg mit diesem Namen nicht zuzuordnen.
  eindeutig := not exists (
    select 1 from public.customers c
     where c.company_id = betrieb and c.id <> p_bleibt and c.id <> p_geht
       and lower(btrim(c.name)) = name_geht);

  zahlen := jsonb_build_object(
    'baustellen', (select count(*) from public.projects x where x.company_id = betrieb and x.customer_id = p_geht),
    'angebote', (select count(*) from public.quotes x where x.company_id = betrieb and x.customer_id = p_geht),
    'rechnungen', (select count(*) from public.invoices x where x.company_id = betrieb and x.customer_id = p_geht),
    'scheine', (select count(*) from public.work_sheets x where x.company_id = betrieb and x.customer_id = p_geht),
    'wartungen', (select count(*) from public.wartungen x where x.company_id = betrieb and x.customer_id = p_geht),
    'termine', (select count(*) from public.termine x where x.company_id = betrieb and x.customer_id = p_geht),
    'eingaenge', (select count(*) from public.auftragseingaenge x where x.company_id = betrieb and x.customer_id = p_geht),
    'beteiligungen', (select count(*) from public.liegenschaft_beteiligte x where x.company_id = betrieb and x.customer_id = p_geht),
    'uid_pruefungen', (select count(*) from public.uid_pruefungen x where x.company_id = betrieb and x.customer_id = p_geht),
    'verlauf', (select count(*) from public.aenderungsjournal x where x.company_id = betrieb and x.kunde_id = p_geht),
    -- Dieselbe Beteiligung zweimal (Liegenschaft, Top, Rolle, Zeitraum): die der Dublette geht.
    'beteiligungen_doppelt', (
      select count(*) from public.liegenschaft_beteiligte g
       where g.company_id = betrieb and g.customer_id = p_geht
         and exists (select 1 from public.liegenschaft_beteiligte b
                      where b.company_id = betrieb and b.customer_id = p_bleibt
                        and b.liegenschaft_id = g.liegenschaft_id
                        and b.top_id is not distinct from g.top_id
                        and b.rolle = g.rolle
                        and b.gueltig_ab is not distinct from g.gueltig_ab
                        and b.gueltig_bis is not distinct from g.gueltig_bis)));

  ueber_namen := jsonb_build_object(
    'baustellen', (select count(*) from public.projects x
                    where x.company_id = betrieb and x.customer_id is null and lower(btrim(x.customer_name)) = name_geht),
    'angebote', (select count(*) from public.quotes x
                  where x.company_id = betrieb and x.customer_id is null and lower(btrim(x.customer_name)) = name_geht),
    'rechnungen', (select count(*) from public.invoices x
                    where x.company_id = betrieb and x.customer_id is null and lower(btrim(x.customer_name)) = name_geht),
    'scheine', (select count(*) from public.work_sheets x
                 where x.company_id = betrieb and x.customer_id is null and lower(btrim(x.customer_name)) = name_geht),
    'wartungen', (select count(*) from public.wartungen x
                   where x.company_id = betrieb and x.customer_id is null and lower(btrim(x.customer_name)) = name_geht));

  ergebnis := jsonb_build_object(
    'bleibt', to_jsonb(bleibt) - array['company_id'],
    'geht', to_jsonb(geht) - array['company_id'],
    'zahlen', zahlen,
    'ueber_namen', ueber_namen,
    'name_eindeutig', eindeutig);
  -- Der Stand: ändert sich ein Kunde (updated_at) oder eine Zahl, passt er nicht mehr.
  return ergebnis || jsonb_build_object('stand', md5(jsonb_build_array(
    bleibt.updated_at, geht.updated_at, zahlen, ueber_namen, eindeutig)::text));
end;
$$;

revoke all on function app.kunden_zusammenfuehren_lage(uuid, uuid) from public, anon, authenticated;

/* Beide Kunden gibt es, im selben Betrieb, verschieden — und wer fragt, pflegt Kunden. */
create or replace function app.kunden_zusammenfuehren_pruefen(p_bleibt uuid, p_geht uuid) returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb_bleibt text;
  betrieb_geht text;
  unbekannt text;
begin
  if p_bleibt is null or p_geht is null then
    raise exception 'Bitte beide Kunden wählen.' using errcode = '22023';
  end if;
  if p_bleibt = p_geht then
    raise exception 'Ein Kunde lässt sich nicht mit sich selbst zusammenführen.' using errcode = '22023';
  end if;
  select c.company_id into betrieb_bleibt from public.customers c where c.id = p_bleibt;
  select c.company_id into betrieb_geht from public.customers c where c.id = p_geht;
  if betrieb_bleibt is null or betrieb_geht is null or betrieb_bleibt <> betrieb_geht
     or not app.betriebsmitglied(betrieb_bleibt) then
    raise exception 'Diesen Kunden gibt es in diesem Betrieb nicht.' using errcode = '42501';
  end if;
  if not app.darf_kunden_pflegen() then
    raise exception 'Kunden zusammenführen darf, wer Kunden pflegt.' using errcode = '42501';
  end if;
  unbekannt := app.kundenbezug_unbekannt();
  if unbekannt is not null then
    raise exception 'Das Zusammenführen kennt % noch nicht — es wurde nichts geändert. Bitte dem Support melden.', unbekannt
      using errcode = '55000';
  end if;
  return betrieb_bleibt;
end;
$$;

revoke all on function app.kunden_zusammenfuehren_pruefen(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Die Vorschau
-- ---------------------------------------------------------------------------

create or replace function public.kunden_zusammenfuehren_vorschau(p_bleibt uuid, p_geht uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  perform app.kunden_zusammenfuehren_pruefen(p_bleibt, p_geht);
  return app.kunden_zusammenfuehren_lage(p_bleibt, p_geht);
end;
$$;

revoke all on function public.kunden_zusammenfuehren_vorschau(uuid, uuid) from public, anon;
grant execute on function public.kunden_zusammenfuehren_vorschau(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Das Zusammenführen
-- ---------------------------------------------------------------------------

/*
  `p_felder`: welche Stammfelder von „geht“ kommen — `{"name": "geht", …}`;
  was fehlt, behält „bleibt“. Die Anschrift ist EIN Feld (Straße, PLZ, Ort,
  Land und die Zeile gehören zusammen); die Notiz kann auch `"beide"` sein.
  Ein unbekannter Schlüssel oder Wert weist ab, bevor etwas geschieht (wie
  `kunde_umbenennen`, A2): lieber nichts als still nur einen Teil.

  Ergebnis: `{"art": "zusammengefuehrt", …}` oder — wenn sich seit der
  Vorschau etwas geändert hat — `{"art": "veraltet", "vorschau": …}` ohne
  jede Änderung.
*/
create or replace function public.kunden_zusammenfuehren(
  p_bleibt uuid, p_geht uuid, p_felder jsonb, p_stand text
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  felder jsonb := coalesce(p_felder, '{}'::jsonb);
  erlaubt constant text[] := array[
    'name', 'anschrift', 'contact_name', 'contact_phone', 'email', 'vat_id',
    'kundennummer', 'kundenart', 'lieferantennummer', 'notes'
  ];
  falsch text;
  betrieb text;
  lage jsonb;
  bleibt public.customers;
  geht public.customers;
  neu public.customers;
  eindeutig boolean;
  name_geht text;
  wer text;
  von_geht boolean;
begin
  if jsonb_typeof(felder) <> 'object' then
    raise exception 'Nichts zusammengeführt: die Felder kamen nicht als Liste.' using errcode = '22023';
  end if;
  select string_agg('„' || k || '“', ', ' order by k) into falsch
    from jsonb_each_text(felder) as f(k, v)
   where k <> all (erlaubt)
      or v is null
      or v not in ('bleibt', 'geht', 'beide')
      or (v = 'beide' and k <> 'notes');
  if falsch is not null then
    raise exception 'Nichts zusammengeführt: % kennt das Zusammenführen nicht. Bitte dem Support melden.', falsch
      using errcode = '22023';
  end if;

  betrieb := app.kunden_zusammenfuehren_pruefen(p_bleibt, p_geht);

  -- Beide sperren, immer in derselben Reihenfolge — zwei gleichzeitige Läufe warten aufeinander.
  perform 1 from public.customers c where c.id in (p_bleibt, p_geht) order by c.id for update;

  lage := app.kunden_zusammenfuehren_lage(p_bleibt, p_geht);
  if p_stand is distinct from lage ->> 'stand' then
    return jsonb_build_object('art', 'veraltet', 'vorschau', lage);
  end if;

  select * into bleibt from public.customers c where c.id = p_bleibt;
  select * into geht from public.customers c where c.id = p_geht;
  eindeutig := (lage ->> 'name_eindeutig')::boolean;
  name_geht := lower(btrim(geht.name));

  perform set_config('app.kunde_wandert', p_geht::text || '>' || p_bleibt::text, true);

  -- Altbelege ohne Bezug mit dem Namen der Dublette (siehe Kopf) — nur bei eindeutigem Namen.
  if eindeutig then
    update public.projects x set customer_id = p_bleibt
     where x.company_id = betrieb and x.customer_id is null and lower(btrim(x.customer_name)) = name_geht;
    update public.quotes x set customer_id = p_bleibt
     where x.company_id = betrieb and x.customer_id is null and lower(btrim(x.customer_name)) = name_geht;
    update public.invoices x set customer_id = p_bleibt
     where x.company_id = betrieb and x.customer_id is null and lower(btrim(x.customer_name)) = name_geht;
    update public.work_sheets x set customer_id = p_bleibt
     where x.company_id = betrieb and x.customer_id is null and lower(btrim(x.customer_name)) = name_geht;
    update public.wartungen x set customer_id = p_bleibt
     where x.company_id = betrieb and x.customer_id is null and lower(btrim(x.customer_name)) = name_geht;
  end if;

  -- Eine Beteiligung, die „bleibt“ schon genauso hat, wandert nicht doppelt.
  delete from public.liegenschaft_beteiligte g
   where g.company_id = betrieb and g.customer_id = p_geht
     and exists (select 1 from public.liegenschaft_beteiligte b
                  where b.company_id = betrieb and b.customer_id = p_bleibt
                    and b.liegenschaft_id = g.liegenschaft_id
                    and b.top_id is not distinct from g.top_id
                    and b.rolle = g.rolle
                    and b.gueltig_ab is not distinct from g.gueltig_ab
                    and b.gueltig_bis is not distinct from g.gueltig_bis);

  -- Alles mit der Kennung der Dublette — jede Tabelle aus `app.kundenbezug_tabellen()`.
  update public.projects x set customer_id = p_bleibt where x.company_id = betrieb and x.customer_id = p_geht;
  update public.quotes x set customer_id = p_bleibt where x.company_id = betrieb and x.customer_id = p_geht;
  update public.invoices x set customer_id = p_bleibt where x.company_id = betrieb and x.customer_id = p_geht;
  update public.work_sheets x set customer_id = p_bleibt where x.company_id = betrieb and x.customer_id = p_geht;
  update public.wartungen x set customer_id = p_bleibt where x.company_id = betrieb and x.customer_id = p_geht;
  update public.termine x set customer_id = p_bleibt where x.company_id = betrieb and x.customer_id = p_geht;
  update public.auftragseingaenge x set customer_id = p_bleibt where x.company_id = betrieb and x.customer_id = p_geht;
  update public.liegenschaft_beteiligte x set customer_id = p_bleibt where x.company_id = betrieb and x.customer_id = p_geht;
  update public.uid_pruefungen x set customer_id = p_bleibt where x.company_id = betrieb and x.customer_id = p_geht;
  update public.aenderungsjournal x set kunde_id = p_bleibt where x.company_id = betrieb and x.kunde_id = p_geht;

  perform set_config('app.kunde_wandert', '', true);

  /*
    DAS SICHERHEITSNETZ. Zeigt danach noch irgendeine Zeile auf die Dublette,
    hätte das Löschen sie mitgenommen (`on delete cascade`) oder ihren Bezug
    geleert (`set null`). Dann lieber gar nichts.
  */
  declare
    t record;
    rest integer;
  begin
    for t in
      select con.conrelid::regclass as tabelle, a.attname as spalte
        from pg_catalog.pg_constraint con
        join pg_catalog.pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
       where con.contype = 'f' and con.confrelid = 'public.customers'::regclass
    loop
      execute format('select count(*) from %s where %I = $1', t.tabelle, t.spalte) into rest using p_geht;
      if rest > 0 then
        raise exception 'Nichts zusammengeführt: in % zeigen noch % Zeilen auf den Kunden. Bitte dem Support melden.', t.tabelle, rest
          using errcode = '55000';
      end if;
    end loop;
  end;

  delete from public.customers c where c.id = p_geht;

  -- Die gewählten Stammfelder. Erst nach dem Löschen: die Kundennummer ist eindeutig.
  von_geht := felder ->> 'anschrift' = 'geht';
  update public.customers c set
    name              = case when felder ->> 'name' = 'geht' then geht.name else c.name end,
    address           = case when von_geht then geht.address else c.address end,
    strasse           = case when von_geht then geht.strasse else c.strasse end,
    plz               = case when von_geht then geht.plz else c.plz end,
    ort               = case when von_geht then geht.ort else c.ort end,
    land              = case when von_geht then geht.land else c.land end,
    contact_name      = case when felder ->> 'contact_name' = 'geht' then geht.contact_name else c.contact_name end,
    contact_phone     = case when felder ->> 'contact_phone' = 'geht' then geht.contact_phone else c.contact_phone end,
    email             = case when felder ->> 'email' = 'geht' then geht.email else c.email end,
    vat_id            = case when felder ->> 'vat_id' = 'geht' then geht.vat_id else c.vat_id end,
    kundennummer      = case when felder ->> 'kundennummer' = 'geht' then geht.kundennummer else c.kundennummer end,
    kundenart         = case when felder ->> 'kundenart' = 'geht' then geht.kundenart else c.kundenart end,
    lieferantennummer = case when felder ->> 'lieferantennummer' = 'geht' then geht.lieferantennummer else c.lieferantennummer end,
    notes             = case felder ->> 'notes'
                          when 'geht' then geht.notes
                          when 'beide' then nullif(concat_ws(E'\n\n', nullif(btrim(c.notes), ''), nullif(btrim(geht.notes), '')), '')
                          else c.notes end,
    -- Aktiv ist, wer es in einer der beiden Fassungen war: an der Dublette hing laufende Arbeit.
    active            = c.active or geht.active
   where c.id = p_bleibt
  returning * into neu;

  -- Baustellen, Wartungen und Angebotsentwürfe tragen den Namen als Text — wie beim Umbenennen.
  perform app.kundenname_nachziehen(p_bleibt, neu.name);
  -- Ebenso Scheinentwürfe: unterschrieben steht der Name fest, ein Entwurf bekommt den richtigen.
  update public.work_sheets x set customer_name = neu.name
   where x.company_id = betrieb and x.customer_id = p_bleibt and x.status = 'Entwurf'
     and x.customer_name is distinct from neu.name;

  wer := coalesce(
    (select u.name from public.users u where u.id = auth.uid()),
    (select 'Support (' || coalesce(nullif(btrim(p.name), ''), 'Senklot') || ')'
       from public.platform_admins p where p.id = auth.uid()));
  insert into public.aenderungsjournal
    (company_id, objektart, objekt_id, kunde_id, art, aenderungen, bezeichnung, von_uid, von_name)
  values (
    betrieb, 'kunde', p_bleibt, p_bleibt, 'geaendert',
    jsonb_build_object('zusammengefuehrt', jsonb_build_object(
      'alt', jsonb_build_object(
        'id', geht.id, 'name', geht.name, 'kundennummer', geht.kundennummer,
        'anschrift', geht.address, 'uid', geht.vat_id),
      'neu', jsonb_build_object(
        'zahlen', lage -> 'zahlen',
        'ueber_namen', case when eindeutig then lage -> 'ueber_namen' else '{}'::jsonb end))),
    neu.name, auth.uid(), wer);

  return jsonb_build_object(
    'art', 'zusammengefuehrt',
    'kunde', p_bleibt,
    'name', neu.name,
    'zahlen', lage -> 'zahlen',
    'ueber_namen', case when eindeutig then lage -> 'ueber_namen' else '{}'::jsonb end);
end;
$$;

revoke all on function public.kunden_zusammenfuehren(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.kunden_zusammenfuehren(uuid, uuid, jsonb, text) to authenticated;
