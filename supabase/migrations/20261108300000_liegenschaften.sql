/*
  LIEGENSCHAFTEN, TOPS, BETEILIGTE (M02c, A09 „Optional“, 07.11.2026)

  WAS FEHLTE. Ein Installateur arbeitet für eine Hausverwaltung in vielen
  Häusern und je Haus in mehreren Wohnungen. Das stand bisher nur als
  Freitext an der Baustelle („Bad 2. OG“, `bezeichnung`). Die Fragen „Was
  haben wir in diesem Haus schon gemacht?“ und „Wer ist hier Eigentümer, wer
  zahlt?“ beantwortete die App nicht.

  WAS SICH ÄNDERT.
  - `liegenschaften`: ein Haus bzw. eine Anlage mit Anschrift in Teilen wie
    beim Kunden. Sie gehört KEINEM Kunden — sie hat Beteiligte.
  - `liegenschaft_tops`: die Wohnungen bzw. Einheiten darin („Top 5“,
    „2. OG“), eindeutig je Liegenschaft.
  - `liegenschaft_beteiligte`: wer an der Liegenschaft oder an einem Top
    beteiligt ist, mit getrennter Rolle (Eigentümer, Hausverwaltung,
    Betreiber, Nutzer bzw. Mieter, Auftraggeber, Rechnungsempfänger,
    Versicherung, Lieferadresse) — ein Kunde ODER freie Angaben (Name,
    Telefon, E-Mail), mit Hinweis und gültig ab bzw. bis (Mieterwechsel).
  - Baustelle, Wartung, Auftragseingang und Angebot tragen optional
    Liegenschaft und Top (das Angebot, damit der Weg Eingang → Angebot →
    Annahme → Baustelle sie nicht unterwegs verliert). Der Server prüft: gleicher Betrieb, das Top gehört zur
    Liegenschaft, ein Top setzt die Liegenschaft voraus. Die Bezeichnungen
    stehen als Text daneben (wie der Kundenname an der Baustelle): so sieht
    der Monteur sie an seinem Einsatz, ohne die Liegenschaft lesen zu dürfen,
    und das Journal zeigt den Namen statt einer Kennung.
  - Unterfähigkeit `kunden.liegenschaften`, „Optional“, ab Werk AUS. Jeder
    Schreibweg auf die neuen Tabellen und jede neue Zuordnung prüft sie auf
    dem Server (E51, V3). Was schon zugeordnet ist, bleibt.
  - Journal (M01b) mit den Objektarten `liegenschaft`, `top` und
    `beteiligter`; Tops und Beteiligte stehen unter ihrer Liegenschaft
    (`bezug_id`).
  - Datenauskunft und Löschung eines Kunden: seine Beteiligungen.

  WAS BEWUSST NICHT GEBAUT IST — und warum:
  - Eine abweichende Rechnungsanschrift je Rechnung. Rechnungen gehen an
    genau einen Kunden der Baustelle (`rechnung_anlegen`, Befund 4 der
    Bestandsmatrix); eine zweite Anschrift je Rechnung wäre ein Umbau der
    Rechnungsfunktionen samt Storno und Export. Die Rolle
    „Rechnungsempfänger“ wird beim Anlegen einer Baustelle als Kunde
    VORGESCHLAGEN. Sammelabrechnung über mehrere Baustellen ist A10 (M13).
  - Eine eigene Auskunftsart für freie Beteiligte. Ein freier Beteiligter
    hat keine Identität über den Namen hinaus; eine Auskunft „über den
    Namen“ träfe Namensvettern (dieselbe Grenze wie bei den Eingängen,
    M02b). Stattdessen: „Beteiligten entfernen“ ist eine echte Löschung
    samt der Werte im Journal (unten, `journal_beteiligter_vergessen`).

  Bestehende Migrationen bleiben unberührt; was sich an vorhandenen
  Funktionen ändert, steht hier als neue Fassung mit dem alten Rumpf und der
  Ergänzung (jeweils gesagt, welche).
*/

-- ---------------------------------------------------------------------------
-- 1. Das Register auf dem Server (E51 V3, E56, E59)
-- ---------------------------------------------------------------------------

/*
  DIESELBE LISTE WIE `MODULE` UND `KERN` in `src/lib/module.ts` — Rumpf wie
  in `20261108200000_freie_zeitfelder.sql` (mit M04b und M06b), dazu die Unterfähigkeit
  `kunden.liegenschaften` (Standard aus: „Optional“ steht ab Werk aus, E51).
  `tests/supabase/modulRegisterServer.test.ts` vergleicht beide Listen.
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
    ('kunden.liegenschaften', false, '{}'::text[]),
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

/* Unverändert wie in `20261108200000_freie_zeitfelder.sql` — hier nur, damit beide Listen an einer Stelle stehen. */
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

/* Eine Stelle für den Satz — Trigger und Funktionen sagen dasselbe. */
create or replace function app.liegenschaften_modul_pflicht(p_betrieb text) returns void
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not app.modul_aktiv(p_betrieb, 'kunden.liegenschaften') then
    raise exception 'Liegenschaften sind in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;
end;
$$;

revoke all on function app.liegenschaften_modul_pflicht(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Die Tabellen
-- ---------------------------------------------------------------------------

/*
  LIEGENSCHAFT.
  - Die Anschrift in Teilen wie beim Kunden (Straße, PLZ, Ort, Land);
    `anschrift` ist die eine Zeile daraus, gesetzt von der Datenbank
    (`app.adresse_zeile`, dieselbe Regel wie `customers.address`) — zum
    Suchen, Anzeigen und als Vorschlag für die Baustellenadresse.
  - `(company_id, id)` eindeutig: daran hängen Tops, Beteiligte, Baustellen,
    Wartungen und Eingänge mit BEIDEN Spalten. So kann keine Zeile auf die
    Liegenschaft eines anderen Betriebs zeigen, auch nicht über den
    Dienstschlüssel.
  - Kein „gehört Kunde X“: wer beteiligt ist, sagen die Beteiligten.
  - Gelöscht wird nur eine Liegenschaft, an der weder Baustelle, Wartung
    noch Eingang hängt (Fremdschlüssel ohne Kaskade, Satz im Auslöser
    unten); sonst wird sie inaktiv gesetzt — die Geschichte des Hauses
    bleibt.
*/
create table if not exists public.liegenschaften (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  bezeichnung text not null,
  strasse text,
  plz text,
  ort text,
  land text not null default 'AT',
  anschrift text,
  notiz text,
  aktiv boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint liegenschaften_betrieb_kennung unique (company_id, id),
  constraint liegenschaften_bezeichnung check (btrim(bezeichnung) <> '' and char_length(bezeichnung) <= 200),
  constraint liegenschaften_laengen check (
    char_length(coalesce(strasse, '')) <= 200
    and char_length(coalesce(plz, '')) <= 20
    and char_length(coalesce(ort, '')) <= 120
    and char_length(coalesce(notiz, '')) <= 4000)
);

comment on table public.liegenschaften is
  'Liegenschaften (M02c, A09): ein Haus bzw. eine Anlage mit Anschrift. Gehört keinem Kunden — wer beteiligt ist, steht in liegenschaft_beteiligte. Lesen wie Kunden, pflegen wer Kunden pflegen darf; nur mit der Unterfähigkeit kunden.liegenschaften.';
comment on column public.liegenschaften.anschrift is
  'Die Anschrift als eine Zeile — setzt die Datenbank aus Straße, PLZ, Ort und Land.';

create index if not exists liegenschaften_liste on public.liegenschaften (company_id, aktiv, bezeichnung, id);

/*
  TOP — eine Wohnung bzw. Einheit. Die Bezeichnung ist eindeutig je
  Liegenschaft, ohne Rücksicht auf Groß-/Kleinschreibung und Leerraum am
  Rand: „Top 5“ und „top 5 “ sind dieselbe Wohnung. Nur eingebaute
  Funktionen im Ausdruck, damit der Rücklauf den Index ohne eigenes
  Ausführungsrecht pflegen kann (wie bei den Fahrzeugen, M04a).
*/
create table if not exists public.liegenschaft_tops (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  liegenschaft_id uuid not null,
  bezeichnung text not null,
  lage text,
  notiz text,
  aktiv boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint liegenschaft_tops_betrieb_kennung unique (company_id, liegenschaft_id, id),
  constraint liegenschaft_tops_liegenschaft foreign key (company_id, liegenschaft_id)
    references public.liegenschaften (company_id, id) on delete cascade,
  constraint liegenschaft_tops_bezeichnung check (btrim(bezeichnung) <> '' and char_length(bezeichnung) <= 80),
  constraint liegenschaft_tops_laengen check (char_length(coalesce(lage, '')) <= 120 and char_length(coalesce(notiz, '')) <= 2000)
);

comment on table public.liegenschaft_tops is
  'Tops einer Liegenschaft (M02c): Wohnungen bzw. Einheiten, Bezeichnung eindeutig je Liegenschaft, Stockwerk bzw. Lage frei.';

create unique index if not exists liegenschaft_tops_bezeichnung_eindeutig
  on public.liegenschaft_tops (liegenschaft_id, lower(btrim(bezeichnung)));
create index if not exists liegenschaft_tops_liegenschaft on public.liegenschaft_tops (company_id, liegenschaft_id, bezeichnung);

/*
  BETEILIGTER — mit getrennter Rolle; mehrere je Rolle sind möglich (zwei
  Eigentümer, ein alter und ein neuer Mieter).

  KUNDE ODER FREIE ANGABEN, genau eines: ein Kunde trägt seine Daten selbst
  (eine Kopie von Telefon und E-Mail wäre Datenhaltung ohne Zweck, und sie
  liefe beim Ändern des Kunden auseinander). Freie Angaben sind für
  Beteiligte, die kein Kunde des Betriebs sind — der Mieter, der Eigentümer
  als Privatperson. Sie sind Personendaten (Datenschutz unten).

  Mit dem Kunden gehen seine Beteiligungen (`on delete cascade`): eine
  Beteiligung ohne den Kunden sagte nichts mehr. Mit dem Top gehen die
  Beteiligten des Tops, mit der Liegenschaft alle.
*/
create table if not exists public.liegenschaft_beteiligte (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  liegenschaft_id uuid not null,
  top_id uuid,
  rolle text not null,
  customer_id uuid references public.customers(id) on delete cascade,
  name text,
  telefon text,
  email text,
  hinweis text,
  gueltig_ab date,
  gueltig_bis date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint liegenschaft_beteiligte_liegenschaft foreign key (company_id, liegenschaft_id)
    references public.liegenschaften (company_id, id) on delete cascade,
  constraint liegenschaft_beteiligte_top foreign key (company_id, liegenschaft_id, top_id)
    references public.liegenschaft_tops (company_id, liegenschaft_id, id) on delete cascade,
  constraint liegenschaft_beteiligte_rolle check (rolle in (
    'eigentuemer', 'hausverwaltung', 'betreiber', 'nutzer', 'auftraggeber', 'rechnungsempfaenger', 'versicherung', 'lieferadresse')),
  constraint liegenschaft_beteiligte_kunde_oder_frei check (
    (customer_id is not null and name is null and telefon is null and email is null)
    or (customer_id is null and btrim(coalesce(name, '')) <> '')),
  constraint liegenschaft_beteiligte_zeitraum check (gueltig_bis is null or gueltig_ab is null or gueltig_bis >= gueltig_ab),
  constraint liegenschaft_beteiligte_laengen check (
    char_length(coalesce(name, '')) <= 200
    and char_length(coalesce(telefon, '')) <= 60
    and char_length(coalesce(email, '')) <= 200
    and char_length(coalesce(hinweis, '')) <= 1000)
);

comment on table public.liegenschaft_beteiligte is
  'Beteiligte einer Liegenschaft bzw. eines Tops (M02c): Rolle, Kunde ODER freie Angaben, Hinweis, gültig ab/bis. Freie Angaben sind Personendaten — „entfernen“ löscht sie samt ihrer Werte im Journal.';

create index if not exists liegenschaft_beteiligte_liegenschaft on public.liegenschaft_beteiligte (company_id, liegenschaft_id);
create index if not exists liegenschaft_beteiligte_top on public.liegenschaft_beteiligte (company_id, liegenschaft_id, top_id) where top_id is not null;
create index if not exists liegenschaft_beteiligte_kunde on public.liegenschaft_beteiligte (customer_id) where customer_id is not null;

/* Die Rolle in Worten — für das Journal und die Datenauskunft; dieselben Wörter wie `ROLLE_TEXT` der App. */
create or replace function app.beteiligter_rolle_text(p_rolle text)
  returns text
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  select case p_rolle
    when 'eigentuemer' then 'Eigentümer'
    when 'hausverwaltung' then 'Hausverwaltung'
    when 'betreiber' then 'Betreiber'
    when 'nutzer' then 'Nutzer bzw. Mieter'
    when 'auftraggeber' then 'Auftraggeber'
    when 'rechnungsempfaenger' then 'Rechnungsempfänger'
    when 'versicherung' then 'Versicherung'
    when 'lieferadresse' then 'Lieferadresse'
    else p_rolle end
$$;

revoke all on function app.beteiligter_rolle_text(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lesen und Schreiben — wie Kunden
-- ---------------------------------------------------------------------------

/*
  LESEN wie `customers_lesen`: im eigenen Betrieb jede Rolle außer dem
  Monteur; der Support mit Einblick. Der Monteur sieht Liegenschaft und Top
  nur als Text an seiner Baustelle (Spalten an `projects`, unten) — eine
  Liegenschaft trägt Beteiligte mit Telefon und E-Mail, und die gehören
  nicht auf jedes Telefon im Betrieb.

  SCHREIBEN wie `customers_anlegen/aendern/loeschen`: wer Kunden pflegen
  darf (`app.darf_kunden_pflegen`: die Führung, dazu Verwaltung und
  Buchhaltung mit der Freigabe). Der Support mit „mitarbeiten“ wie bei den
  Kunden.
*/
do $migration$
declare t text;
begin
  foreach t in array array['liegenschaften', 'liegenschaft_tops', 'liegenschaft_beteiligte'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists %I on public.%I', t || '_lesen', t);
    execute format($p$create policy %I on public.%I for select using (
        ((company_id = (select app.lesebetrieb())) or (company_id = (select app.supportbetrieb())))
        and ((select app.rolle()) is distinct from 'Mitarbeiter'))$p$, t || '_lesen', t);
    execute format('drop policy if exists %I on public.%I', t || '_anlegen', t);
    execute format($p$create policy %I on public.%I for insert with check (
        ((company_id = (select app.lesebetrieb())) or (company_id = (select app.supportbetrieb())))
        and (select app.darf_kunden_pflegen()))$p$, t || '_anlegen', t);
    execute format('drop policy if exists %I on public.%I', t || '_aendern', t);
    execute format($p$create policy %I on public.%I for update using (
        ((company_id = (select app.lesebetrieb())) or (company_id = (select app.supportbetrieb())))
        and (select app.darf_kunden_pflegen()))
      with check (
        ((company_id = (select app.lesebetrieb())) or (company_id = (select app.supportbetrieb())))
        and (select app.darf_kunden_pflegen()))$p$, t || '_aendern', t);
    execute format('drop policy if exists %I on public.%I', t || '_loeschen', t);
    execute format($p$create policy %I on public.%I for delete using (
        ((company_id = (select app.lesebetrieb())) or (company_id = (select app.supportbetrieb())))
        and (select app.darf_kunden_pflegen()))$p$, t || '_loeschen', t);

    -- Der Riegel der Tabellen, die der Support liest: schreiben nur mit „mitarbeiten“ (wie Kunden).
    execute format('drop trigger if exists %I on public.%I', t || '_kein_support_schreiben', t);
    execute format('create trigger %I before insert or update or delete on public.%I
                      for each row execute function app.support_schreibt_nicht()', t || '_kein_support_schreiben', t);
    execute format('drop trigger if exists %I on public.%I', t || '_betrieb_fest', t);
    execute format('create trigger %I before update on public.%I
                      for each row execute function app.betrieb_unveraenderlich()', t || '_betrieb_fest', t);
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I
                      for each row execute function app.updated_at_setzen()', t || '_updated_at', t);
  end loop;
end;
$migration$;

-- ---------------------------------------------------------------------------
-- 4. Was die Datenbank selbst setzt und prüft
-- ---------------------------------------------------------------------------

/*
  DAS MODUL (V3) — bei jedem Anlegen und Ändern, bei Liegenschaft und Top
  auch beim Löschen. NICHT beim Löschen eines Beteiligten: wer gelöscht
  werden will, wird gelöscht, auch wenn der Betrieb die Liegenschaften
  gerade ausgeschaltet hat (DSGVO geht vor dem Modul — ebenso die Löschung
  eines Kunden, die seine Beteiligungen mitnimmt). Der Dienstschlüssel
  (Rücklauf, Löschen eines Betriebs) und Arbeiten ohne Anmeldung gehen
  durch.

  LÖSCHEN EINER LIEGENSCHAFT BZW. EINES TOPS, an dem eine Baustelle, eine
  Wartung oder ein Eingang hängt: mit einem Satz statt der Meldung des
  Fremdschlüssels — die Geschichte des Hauses bleibt, inaktiv setzen geht.
*/
create or replace function app.liegenschaft_schreiben_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  zeile jsonb;
  spalte text := case tg_table_name when 'liegenschaften' then 'liegenschaft_id' else 'top_id' end;
  belegt boolean;
begin
  if tg_op = 'DELETE' then
    zeile := to_jsonb(old);
  else
    zeile := to_jsonb(new);
  end if;
  if app.ist_dienst() or auth.uid() is null
     or (tg_op = 'DELETE' and tg_table_name = 'liegenschaft_beteiligte') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  perform app.liegenschaften_modul_pflicht(zeile ->> 'company_id');
  if tg_op = 'DELETE' then
    execute format(
      'select exists (select 1 from public.projects x where x.company_id = $1 and x.%1$I = $2)
           or exists (select 1 from public.wartungen x where x.company_id = $1 and x.%1$I = $2)
           or exists (select 1 from public.auftragseingaenge x where x.company_id = $1 and x.%1$I = $2)
           or exists (select 1 from public.quotes x where x.company_id = $1 and x.%1$I = $2)', spalte)
      into belegt using zeile ->> 'company_id', (zeile ->> 'id')::uuid;
    if belegt then
      raise exception '% ist Baustellen, Wartungen, Eingängen oder Angeboten zugeordnet und bleibt — stattdessen auf inaktiv setzen',
        case tg_table_name when 'liegenschaften' then 'Diese Liegenschaft' else 'Dieses Top' end
        using errcode = '23503';
    end if;
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app.liegenschaft_schreiben_pruefen() from public, anon, authenticated;

drop trigger if exists liegenschaften_modul on public.liegenschaften;
create trigger liegenschaften_modul
  before insert or update or delete on public.liegenschaften
  for each row execute function app.liegenschaft_schreiben_pruefen();
drop trigger if exists liegenschaft_tops_modul on public.liegenschaft_tops;
create trigger liegenschaft_tops_modul
  before insert or update or delete on public.liegenschaft_tops
  for each row execute function app.liegenschaft_schreiben_pruefen();
drop trigger if exists liegenschaft_beteiligte_modul on public.liegenschaft_beteiligte;
create trigger liegenschaft_beteiligte_modul
  before insert or update or delete on public.liegenschaft_beteiligte
  for each row execute function app.liegenschaft_schreiben_pruefen();

/* Die Anschrift als Zeile — wie `app.kunde_adresse`, ohne den Weg „nur die Zeile kam“ (den gibt es hier nicht). */
create or replace function app.liegenschaft_anschrift() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  new.bezeichnung := btrim(new.bezeichnung);
  new.land := upper(coalesce(nullif(btrim(new.land), ''), 'AT'));
  new.strasse := nullif(btrim(coalesce(new.strasse, '')), '');
  new.plz := nullif(btrim(coalesce(new.plz, '')), '');
  new.ort := nullif(btrim(coalesce(new.ort, '')), '');
  new.anschrift := app.adresse_zeile(new.strasse, new.plz, new.ort, new.land);
  return new;
end;
$$;

revoke all on function app.liegenschaft_anschrift() from public, anon, authenticated;

drop trigger if exists liegenschaften_anschrift on public.liegenschaften;
create trigger liegenschaften_anschrift
  before insert or update on public.liegenschaften
  for each row execute function app.liegenschaft_anschrift();

/* Ein Top: Bezeichnung ohne Leerraum am Rand — sonst stünden „Top 5“ und „Top 5 “ nebeneinander in der Wahl. */
create or replace function app.liegenschaft_top_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  new.bezeichnung := btrim(new.bezeichnung);
  new.lage := nullif(btrim(coalesce(new.lage, '')), '');
  if tg_op = 'UPDATE' and new.liegenschaft_id is distinct from old.liegenschaft_id then
    raise exception 'Ein Top bleibt in seiner Liegenschaft' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function app.liegenschaft_top_pruefen() from public, anon, authenticated;

drop trigger if exists liegenschaft_tops_pruefen on public.liegenschaft_tops;
create trigger liegenschaft_tops_pruefen
  before insert or update on public.liegenschaft_tops
  for each row execute function app.liegenschaft_top_pruefen();

/*
  EIN BETEILIGTER: der Kunde aus diesem Betrieb, leere freie Angaben als
  leer, und er bleibt an seiner Liegenschaft (umziehen heißt: entfernen und
  neu eintragen — sonst wanderte sein Journal mit in ein anderes Haus). Das
  Top darf wechseln (Fremdschlüssel: es gehört zur Liegenschaft).
*/
create or replace function app.liegenschaft_beteiligter_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  new.name := nullif(btrim(coalesce(new.name, '')), '');
  new.telefon := nullif(btrim(coalesce(new.telefon, '')), '');
  new.email := nullif(btrim(coalesce(new.email, '')), '');
  new.hinweis := nullif(btrim(coalesce(new.hinweis, '')), '');
  if tg_op = 'UPDATE' and new.liegenschaft_id is distinct from old.liegenschaft_id then
    raise exception 'Ein Beteiligter bleibt an seiner Liegenschaft — bitte dort entfernen und hier neu eintragen'
      using errcode = '22023';
  end if;
  if new.customer_id is not null and not app.ist_dienst()
     and (tg_op = 'INSERT' or new.customer_id is distinct from old.customer_id)
     and not exists (select 1 from public.customers c where c.id = new.customer_id and c.company_id = new.company_id) then
    raise exception 'Diesen Kunden gibt es in diesem Betrieb nicht.' using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function app.liegenschaft_beteiligter_pruefen() from public, anon, authenticated;

drop trigger if exists liegenschaft_beteiligte_pruefen on public.liegenschaft_beteiligte;
create trigger liegenschaft_beteiligte_pruefen
  before insert or update on public.liegenschaft_beteiligte
  for each row execute function app.liegenschaft_beteiligter_pruefen();

-- ---------------------------------------------------------------------------
-- 5. Baustelle, Wartung und Eingang bekommen Liegenschaft und Top
-- ---------------------------------------------------------------------------

/*
  OPTIONAL, KEIN NEUER PFLICHTDATENSATZ: ohne Liegenschaft bleibt alles,
  wie es ist. Dasselbe am Angebot (unten, Abschnitt 5a).

  - Die Fremdschlüssel nennen den Betrieb mit: eine Baustelle zeigt nur auf
    eine Liegenschaft ihres Betriebs, und das Top nur, wenn es zu genau
    dieser Liegenschaft gehört. Ohne Kaskade: eine Liegenschaft mit
    Baustellen wird nicht gelöscht, sondern inaktiv (Satz im Auslöser oben).
  - Ein Top setzt die Liegenschaft voraus (Prüfregel).
  - `liegenschaft_bezeichnung` und `top_bezeichnung` setzt die Datenbank —
    wie `customer_name`: die Listen, der Monteur an seinem Einsatz und das
    Journal zeigen den Namen, ohne die Liegenschaft lesen zu müssen. Wird
    sie umbenannt, ziehen sie nach (unten).
*/
do $migration$
declare t text;
begin
  foreach t in array array['projects', 'wartungen', 'auftragseingaenge', 'quotes'] loop
    execute format('alter table public.%I
      add column if not exists liegenschaft_id uuid,
      add column if not exists top_id uuid,
      add column if not exists liegenschaft_bezeichnung text,
      add column if not exists top_bezeichnung text', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_liegenschaft');
    execute format('alter table public.%I add constraint %I foreign key (company_id, liegenschaft_id)
                      references public.liegenschaften (company_id, id)', t, t || '_liegenschaft');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_liegenschaft_top');
    execute format('alter table public.%I add constraint %I foreign key (company_id, liegenschaft_id, top_id)
                      references public.liegenschaft_tops (company_id, liegenschaft_id, id)', t, t || '_liegenschaft_top');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_top_braucht_liegenschaft');
    execute format('alter table public.%I add constraint %I check (top_id is null or liegenschaft_id is not null)',
                   t, t || '_top_braucht_liegenschaft');
    execute format('create index if not exists %I on public.%I (company_id, liegenschaft_id) where liegenschaft_id is not null',
                   t || '_liegenschaft_idx', t);
    execute format('create index if not exists %I on public.%I (company_id, liegenschaft_id, top_id) where top_id is not null',
                   t || '_top_idx', t);
  end loop;
end;
$migration$;

comment on column public.projects.liegenschaft_bezeichnung is 'Bezeichnung der Liegenschaft — setzt die Datenbank (M02c).';
comment on column public.projects.top_bezeichnung is 'Bezeichnung des Tops — setzt die Datenbank (M02c).';

-- Am Eingang schreibt das Büro über Spaltenrechte (M02b) — die beiden Verweise kommen dazu, die Namen setzt die Datenbank.
grant insert (liegenschaft_id, top_id) on public.auftragseingaenge to authenticated;
grant update (liegenschaft_id, top_id) on public.auftragseingaenge to authenticated;

/*
  DIE PRÜFUNG AUF DEM SERVER — mit einem Satz statt der Meldung des
  Fremdschlüssels: gleicher Betrieb, das Top gehört zur Liegenschaft, ein Top
  setzt die Liegenschaft voraus. Eine NEUE Zuordnung verlangt das Modul
  (V3); eine bestehende bleibt, auch wenn das Modul inzwischen aus ist, und
  lösen geht immer. Der Rücklauf bringt die Zeile, wie sie war.
*/
create or replace function app.liegenschaft_zuordnung_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  l_name text;
  t_name text;
  neu_zugeordnet boolean;
begin
  if tg_op = 'UPDATE' and new.liegenschaft_id is not distinct from old.liegenschaft_id
     and new.top_id is not distinct from old.top_id then
    return new;
  end if;
  if app.ist_dienst() and tg_op = 'INSERT' and new.liegenschaft_bezeichnung is not null then
    return new;
  end if;
  if new.liegenschaft_id is null then
    if new.top_id is not null then
      raise exception 'Ein Top gehört zu einer Liegenschaft — bitte zuerst die Liegenschaft wählen' using errcode = '23514';
    end if;
    new.liegenschaft_bezeichnung := null;
    new.top_bezeichnung := null;
    return new;
  end if;
  select l.bezeichnung into l_name from public.liegenschaften l
   where l.id = new.liegenschaft_id and l.company_id = new.company_id;
  if l_name is null then
    raise exception 'Diese Liegenschaft gibt es in diesem Betrieb nicht.' using errcode = '23503';
  end if;
  if new.top_id is not null then
    select t.bezeichnung into t_name from public.liegenschaft_tops t
     where t.id = new.top_id and t.liegenschaft_id = new.liegenschaft_id and t.company_id = new.company_id;
    if t_name is null then
      raise exception 'Dieses Top gehört nicht zu dieser Liegenschaft.' using errcode = '23503';
    end if;
  end if;
  -- Nur was NEU zugeordnet wird, verlangt das Modul — das Top zu lösen und die Liegenschaft zu behalten nicht.
  neu_zugeordnet := tg_op = 'INSERT' or new.liegenschaft_id is distinct from old.liegenschaft_id
                    or (new.top_id is not null and new.top_id is distinct from old.top_id);
  if neu_zugeordnet and not app.ist_dienst() and auth.uid() is not null then
    perform app.liegenschaften_modul_pflicht(new.company_id);
  end if;
  new.liegenschaft_bezeichnung := l_name;
  new.top_bezeichnung := t_name;
  return new;
end;
$$;

revoke all on function app.liegenschaft_zuordnung_pruefen() from public, anon, authenticated;

drop trigger if exists projects_liegenschaft on public.projects;
create trigger projects_liegenschaft
  before insert or update of liegenschaft_id, top_id on public.projects
  for each row execute function app.liegenschaft_zuordnung_pruefen();
drop trigger if exists wartungen_liegenschaft on public.wartungen;
create trigger wartungen_liegenschaft
  before insert or update of liegenschaft_id, top_id on public.wartungen
  for each row execute function app.liegenschaft_zuordnung_pruefen();
drop trigger if exists quotes_liegenschaft on public.quotes;
create trigger quotes_liegenschaft
  before insert or update of liegenschaft_id, top_id on public.quotes
  for each row execute function app.liegenschaft_zuordnung_pruefen();
drop trigger if exists auftragseingaenge_liegenschaft on public.auftragseingaenge;
create trigger auftragseingaenge_liegenschaft
  before insert or update of liegenschaft_id, top_id on public.auftragseingaenge
  for each row execute function app.liegenschaft_zuordnung_pruefen();

/*
  EINE UMBENANNTE LIEGENSCHAFT (bzw. ein umbenanntes Top) heißt auch an
  ihren Baustellen, Wartungen und Eingängen so — wie ein umbenannter Kunde
  (`eingang_kundenname_nachziehen`). Als Auslöser an der Liegenschaft: jeder
  Weg, der den Namen ändert, zieht so nach.
*/
create or replace function app.liegenschaft_namen_nachziehen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_table_name = 'liegenschaften' then
    update public.projects x set liegenschaft_bezeichnung = new.bezeichnung
     where x.company_id = new.company_id and x.liegenschaft_id = new.id and x.liegenschaft_bezeichnung is distinct from new.bezeichnung;
    update public.wartungen x set liegenschaft_bezeichnung = new.bezeichnung
     where x.company_id = new.company_id and x.liegenschaft_id = new.id and x.liegenschaft_bezeichnung is distinct from new.bezeichnung;
    update public.auftragseingaenge x set liegenschaft_bezeichnung = new.bezeichnung
     where x.company_id = new.company_id and x.liegenschaft_id = new.id and x.liegenschaft_bezeichnung is distinct from new.bezeichnung;
    update public.quotes x set liegenschaft_bezeichnung = new.bezeichnung
     where x.company_id = new.company_id and x.liegenschaft_id = new.id and x.liegenschaft_bezeichnung is distinct from new.bezeichnung;
  else
    update public.projects x set top_bezeichnung = new.bezeichnung
     where x.company_id = new.company_id and x.top_id = new.id and x.top_bezeichnung is distinct from new.bezeichnung;
    update public.wartungen x set top_bezeichnung = new.bezeichnung
     where x.company_id = new.company_id and x.top_id = new.id and x.top_bezeichnung is distinct from new.bezeichnung;
    update public.auftragseingaenge x set top_bezeichnung = new.bezeichnung
     where x.company_id = new.company_id and x.top_id = new.id and x.top_bezeichnung is distinct from new.bezeichnung;
    update public.quotes x set top_bezeichnung = new.bezeichnung
     where x.company_id = new.company_id and x.top_id = new.id and x.top_bezeichnung is distinct from new.bezeichnung;
  end if;
  return null;
end;
$$;

revoke all on function app.liegenschaft_namen_nachziehen() from public, anon, authenticated;

drop trigger if exists liegenschaften_namen on public.liegenschaften;
create trigger liegenschaften_namen
  after update of bezeichnung on public.liegenschaften
  for each row when (new.bezeichnung is distinct from old.bezeichnung)
  execute function app.liegenschaft_namen_nachziehen();
drop trigger if exists liegenschaft_tops_namen on public.liegenschaft_tops;
create trigger liegenschaft_tops_namen
  after update of bezeichnung on public.liegenschaft_tops
  for each row when (new.bezeichnung is distinct from old.bezeichnung)
  execute function app.liegenschaft_namen_nachziehen();

/*
  ÄNDERN EINES EINGANGS — Rumpf wie in `20261107300000_auftragseingang.sql`;
  neu sind Liegenschaft und Top unter den Angaben: wer sie am offenen
  Eingang ändert, hat ihn bearbeitet, und das zählt für das Modul des
  Eingangs wie jede andere Angabe. (Das Modul der Liegenschaften prüft
  `liegenschaft_zuordnung_pruefen`.)
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
     new.termin_id, new.liegenschaft_id, new.top_id)
    is distinct from
    (old.quelle, old.auftraggeber_nummer, old.neukunde_name, old.neukunde_strasse, old.neukunde_plz,
     old.neukunde_ort, old.neukunde_telefon, old.neukunde_email, old.ort, old.ansprechpartner_name,
     old.ansprechpartner_telefon, old.anliegen, old.dringlichkeit, old.wunschtermin, old.eingegangen_am,
     old.termin_id, old.liegenschaft_id, old.top_id)
    or (new.customer_id is not null and new.customer_id is distinct from old.customer_id);
  if old.stand = 'offen' and new.stand = 'offen' and inhalt_geaendert
     and not app.modul_aktiv(new.company_id, 'baustellen.auftragseingang') then
    raise exception 'Der Auftragseingang ist in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;
  -- Wer den Kunden oder die Liegenschaft umbenennt, hat am Eingang nichts bearbeitet — nur der Name zieht nach.
  if inhalt_geaendert or new.stand is distinct from old.stand or new.customer_id is distinct from old.customer_id then
    new.bearbeitet_am := now();
    new.bearbeitet_von_uid := auth.uid();
    new.bearbeitet_von_name := (select u.name from public.users u where u.id = auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function app.eingang_aendern_pruefen() from public, anon, authenticated;

/*
  EINGANG → BAUSTELLE — Rumpf wie in `20261107300000_auftragseingang.sql`;
  neu: die Baustelle übernimmt Liegenschaft und Top des Eingangs, und ohne
  Ort gilt die Anschrift der Liegenschaft vor der des Kunden (dort wird
  gearbeitet). Ist das Modul inzwischen aus, entsteht die Baustelle wie
  bisher, ohne Zuordnung — eine neue Zuordnung verlangt das Modul, der
  Eingang selbst behält seine.
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
  mit_liegenschaft boolean;
  liegenschaft_zeile text;
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
  -- M02c: Liegenschaft und Top, solange das Modul an ist.
  mit_liegenschaft := e.liegenschaft_id is not null and app.modul_aktiv(e.company_id, 'kunden.liegenschaften');
  if mit_liegenschaft then
    select l.anschrift into liegenschaft_zeile from public.liegenschaften l
     where l.id = e.liegenschaft_id and l.company_id = e.company_id;
  end if;

  insert into public.projects (company_id, project_number, customer_id, customer_name, address, status,
                               billing_mode, description, contact_name, contact_phone, liegenschaft_id, top_id)
  values (e.company_id, nummer, k.id, k.name,
          coalesce(nullif(btrim(coalesce(e.ort, '')), ''), nullif(btrim(coalesce(liegenschaft_zeile, '')), ''), k.address),
          'Aktiv', p_abrechnung, beschreibung,
          coalesce(nullif(btrim(coalesce(e.ansprechpartner_name, '')), ''), nullif(btrim(coalesce(k.contact_name, '')), '')),
          coalesce(nullif(btrim(coalesce(e.ansprechpartner_telefon, '')), ''), nullif(btrim(coalesce(k.contact_phone, '')), '')),
          case when mit_liegenschaft then e.liegenschaft_id end,
          case when mit_liegenschaft then e.top_id end)
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
  WARTUNG → BAUSTELLE — Rumpf wie in
  `20261013100000_baustelle_atomare_annahme.sql`; neu: die Baustelle
  übernimmt Liegenschaft und Top der Wartung, solange das Modul an ist (wie
  beim Eingang oben). Die Anlage steht dann im selben Haus wie ihr Einsatz.
*/
create or replace function public.wartung_einplanen(p_wartung uuid, p_nummer text, p_praefix text, p_faellig date)
returns text language plpgsql security definer set search_path = '' as $$
declare w public.wartungen; k public.customers; nummer text; jahr integer; lfd bigint; mit_liegenschaft boolean;
begin
  if app.ist_fuehrung() is not true then
    raise exception 'Wartungen einplanen darf nur die Führung' using errcode = '42501';
  end if;
  select * into w from public.wartungen where id = p_wartung
    and (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb())) for update;
  if w.id is null then raise exception 'Wartung nicht gefunden' using errcode = 'P0002'; end if;
  -- Ein alter Dialog darf nach Erledigung nicht gleich den nächsten Einsatz anlegen.
  if w.faellig_am is distinct from p_faellig then
    raise exception 'Der Wartungstermin wurde geändert. Bitte die Wartung neu öffnen.' using errcode = '40001';
  end if;
  if nullif(w.offene_baustelle, '') is not null then
    if exists(select 1 from public.projects where company_id = w.company_id and project_number = w.offene_baustelle) then
      return w.offene_baustelle;
    end if;
    raise exception 'Die eingeplante Baustelle fehlt. Bitte die Zuordnung prüfen.';
  end if;
  nummer := nullif(btrim(p_nummer), '');
  if nummer is null then
    jahr := extract(year from now() at time zone 'Europe/Vienna');
    lfd := public.naechste_nummer('projects', jahr, 0, null);
    nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
      || jahr || '-' || lpad(lfd::text, greatest(4, length(lfd::text)), '0');
  end if;
  select * into k from public.customers where id = w.customer_id and company_id = w.company_id;
  -- M02c: Liegenschaft und Top der Wartung, solange das Modul an ist.
  mit_liegenschaft := w.liegenschaft_id is not null and app.modul_aktiv(w.company_id, 'kunden.liegenschaften');
  insert into public.projects(company_id, project_number, customer_id, customer_name, address, description, status,
                              liegenschaft_id, top_id)
    values(w.company_id, nummer, w.customer_id, coalesce(k.name, w.customer_name),
      coalesce(nullif(btrim(w.address), ''), k.address),
      'Wartung: ' || btrim(w.anlage) || coalesce(' · ' || nullif(btrim(w.hinweis), ''), ''), 'Aktiv',
      case when mit_liegenschaft then w.liegenschaft_id end, case when mit_liegenschaft then w.top_id end);
  update public.wartungen set offene_baustelle = nummer where id = w.id;
  return nummer;
end; $$;
revoke all on function public.wartung_einplanen(uuid, text, text, date) from public, anon;
grant execute on function public.wartung_einplanen(uuid, text, text, date) to authenticated;


-- ---------------------------------------------------------------------------
-- 5a. Das Angebot trägt Liegenschaft und Top weiter
-- ---------------------------------------------------------------------------

/*
  OHNE DAS BRÄCHE DER WEG AB: ein Eingang mit Liegenschaft wird Angebot, das
  Angebot wird angenommen — und die Baustelle stünde ohne Liegenschaft da
  (CLAUDE.md, Grundsatz 1). Deshalb:
  - `angebot_speichern` schreibt Liegenschaft und Top (Rumpf wie in
    `20261002300000_angebot_positionen.sql`, neu nur die beiden Spalten).
    Sie zählen NICHT zum Inhalt, der nach dem Entwurf feststeht: sie stehen
    weder auf dem Angebot noch im Schnappschuss des Annahme-Links
    (`app.angebot_link_inhalt` nennt seine Felder einzeln — die Prüfsumme
    bestehender Links bleibt, Altdaten). Sie sind eine Zuordnung im
    Betrieb, wie die Baustellennummer, und lassen sich bis zur Annahme
    nachtragen. Eine neue Fassung bekommt sie über die App mit (wie Kunde
    und Positionen), solange das Modul an ist.
  - `eingang_zu_angebot` übernimmt sie (nur mit Modul, wie bei der Baustelle).
  - `app.angebot_annehmen_kern` gibt sie an die neue Baustelle weiter — für
    die Annahme im Büro und über den Link (nur mit Modul).
*/
create or replace function public.angebot_speichern(
  p_id uuid,
  p_kopf jsonb,
  p_positionen jsonb
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  alt public.quotes;
  neu public.quotes;
  kennung uuid;
  zeile jsonb;
  lauf integer := 0;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  if p_id is not null then
    select * into alt from public.quotes where id = p_id;
  end if;

  if alt.id is null then
    neu := jsonb_populate_record(null::public.quotes, p_kopf);
    -- Eine neue Fassung verweist nur auf ein Angebot DIESES Betriebs.
    if neu.vorgaenger_id is not null and not exists (
      select 1 from public.quotes v where v.id = neu.vorgaenger_id and v.company_id = betrieb
    ) then
      raise exception 'Das Angebot, das überarbeitet werden soll, gibt es in diesem Betrieb nicht'
        using errcode = '23503';
    end if;
    insert into public.quotes (
      company_id, quote_number, customer_id, customer_name, address,
      quote_date, valid_until, status, discount_mode, discount_value,
      discount_label, discount_amount, subtotal_netto, total_netto,
      total_vat, total_brutto, vat_rate, kalkulierte_stunden, notes,
      project_number, vorgaenger_id, liegenschaft_id, top_id
    ) values (
      betrieb, neu.quote_number, neu.customer_id, neu.customer_name,
      neu.address, neu.quote_date, neu.valid_until,
      coalesce(neu.status, 'Entwurf'), neu.discount_mode, neu.discount_value,
      neu.discount_label, neu.discount_amount,
      coalesce(neu.subtotal_netto, 0), coalesce(neu.total_netto, 0),
      coalesce(neu.total_vat, 0), coalesce(neu.total_brutto, 0),
      neu.vat_rate, coalesce(neu.kalkulierte_stunden, 0), neu.notes,
      neu.project_number, neu.vorgaenger_id, neu.liegenschaft_id, neu.top_id
    ) returning id into kennung;
  else
    kennung := alt.id;
    neu := jsonb_populate_record(alt, p_kopf);

    /*
      NUR DER ENTWURF ÄNDERT SEINEN INHALT. Verglichen wird Spalte für
      Spalte statt „wurde etwas mitgeschickt": die Ansicht schickt beim
      Annehmen den Status und die Baustelle, und das soll weiter gehen.
      Liegenschaft und Top gehören nicht zum Inhalt (oben, 5a).
    */
    if alt.status <> 'Entwurf' and (
         p_positionen is not null
      or (neu.quote_number, neu.customer_id, neu.customer_name, neu.address,
          neu.quote_date, neu.valid_until, neu.discount_mode, neu.discount_value,
          neu.discount_label, neu.discount_amount, neu.subtotal_netto,
          neu.total_netto, neu.total_vat, neu.total_brutto, neu.vat_rate,
          neu.kalkulierte_stunden, neu.notes)
         is distinct from
         (alt.quote_number, alt.customer_id, alt.customer_name, alt.address,
          alt.quote_date, alt.valid_until, alt.discount_mode, alt.discount_value,
          alt.discount_label, alt.discount_amount, alt.subtotal_netto,
          alt.total_netto, alt.total_vat, alt.total_brutto, alt.vat_rate,
          alt.kalkulierte_stunden, alt.notes)
    ) then
      raise exception 'Nur ein Entwurf lässt sich ändern — dieses Angebot ist „%"', alt.status
        using errcode = '55000';
    end if;

    update public.quotes set
      quote_number        = neu.quote_number,
      customer_id         = neu.customer_id,
      customer_name       = neu.customer_name,
      address             = neu.address,
      quote_date          = neu.quote_date,
      valid_until         = neu.valid_until,
      status              = neu.status,
      discount_mode       = neu.discount_mode,
      discount_value      = neu.discount_value,
      discount_label      = neu.discount_label,
      discount_amount     = neu.discount_amount,
      subtotal_netto      = neu.subtotal_netto,
      total_netto         = neu.total_netto,
      total_vat           = neu.total_vat,
      total_brutto        = neu.total_brutto,
      vat_rate            = neu.vat_rate,
      kalkulierte_stunden = neu.kalkulierte_stunden,
      notes               = neu.notes,
      project_number      = neu.project_number,
      liegenschaft_id     = neu.liegenschaft_id,
      top_id              = neu.top_id
     where id = kennung;
  end if;

  if p_positionen is not null then
    delete from public.quote_lines where quote_id = kennung;
    for zeile in select * from jsonb_array_elements(p_positionen) loop
      insert into public.quote_lines (
        company_id, quote_id, position, label, qty, unit, unit_price, netto,
        ist_arbeitszeit, art, rabatt_prozent, material_id
      ) values (
        betrieb, kennung, lauf, zeile ->> 'label', (zeile ->> 'qty')::numeric,
        coalesce(zeile ->> 'unit', ''), (zeile ->> 'unit_price')::numeric,
        (zeile ->> 'netto')::numeric, (zeile ->> 'ist_arbeitszeit')::boolean,
        coalesce(zeile ->> 'art', 'position'), (zeile ->> 'rabatt_prozent')::numeric,
        -- Ein Artikel aus einem fremden Betrieb bleibt kein Verweis.
        (select m.id from public.materials m
          where m.id = nullif(zeile ->> 'material_id', '')::uuid and m.company_id = betrieb)
      );
      lauf := lauf + 1;
    end loop;
  end if;

  return kennung;
end;
$$;

/*
  DER KERN DER ANNAHME — Rumpf wie in `20261106400000_angebot_annahme_link.sql`;
  neu: die Baustelle bekommt Liegenschaft und Top des Angebots, solange das
  Modul an ist. Im Büro und über den Link derselbe Weg.
*/
create or replace function app.angebot_annehmen_kern(p_angebot uuid, p_praefix text, p_abrechnung text)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare q public.quotes; k public.customers; nummer text; jahr integer; lfd bigint; mit_liegenschaft boolean;
begin
  select * into q from public.quotes where id = p_angebot for update;
  if q.id is null then raise exception 'Angebot nicht gefunden' using errcode = 'P0002'; end if;
  if p_abrechnung is null or p_abrechnung not in ('Regie', 'Pauschal', 'Einheitspreis') then
    raise exception 'Unbekannte Abrechnungsart' using errcode = '22023';
  end if;
  -- G15: vor dem Zähler, damit keine Baustellennummer für nichts vergeben wird.
  if q.status = 'Ersetzt' then
    raise exception 'Angebot % ist durch eine andere Fassung ersetzt', q.quote_number using errcode = '55000';
  end if;
  select project_number into nummer from public.projects
    where company_id = q.company_id and project_number = q.project_number;
  if nummer is null then
    jahr := extract(year from now() at time zone 'Europe/Vienna');
    lfd := app.naechste_nummer_kern(q.company_id, 'projects', jahr, null);
    nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
      || jahr || '-' || lpad(lfd::text, greatest(4, length(lfd::text)), '0');
    -- Hinweis 11: der Ansprechpartner aus der Kundenakte, änderbar in der Baustelle.
    select * into k from public.customers where id = q.customer_id and company_id = q.company_id;
    -- M02c: Liegenschaft und Top des Angebots, solange das Modul an ist.
    mit_liegenschaft := q.liegenschaft_id is not null and app.modul_aktiv(q.company_id, 'kunden.liegenschaften');
    insert into public.projects(company_id, project_number, customer_id, customer_name, address,
      status, billing_mode, estimated_hours, description, contact_name, contact_phone, liegenschaft_id, top_id)
    values(q.company_id, nummer, q.customer_id, q.customer_name, q.address, 'Aktiv', p_abrechnung,
      case when q.kalkulierte_stunden > 0 then q.kalkulierte_stunden end,
      coalesce(nullif(btrim(q.notes), '') || E'\n\n', '') || 'Aus Angebot ' || q.quote_number,
      nullif(btrim(coalesce(k.contact_name, '')), ''), nullif(btrim(coalesce(k.contact_phone, '')), ''),
      case when mit_liegenschaft then q.liegenschaft_id end, case when mit_liegenschaft then q.top_id end);
  end if;
  -- Der Wächter am Status (`quotes_fassung_pruefen`) hält eine zweite angenommene Fassung auf.
  update public.quotes set status = 'Angenommen', project_number = nummer where id = q.id;
  -- G15: die übrigen offenen Fassungen desselben Angebots sind damit ersetzt.
  update public.quotes set status = 'Ersetzt'
   where id in (select app.angebot_fassungen(q.id))
     and id <> q.id
     and status in ('Entwurf', 'Versendet');
  return nummer;
end; $$;

revoke all on function app.angebot_annehmen_kern(uuid, text, text) from public, anon, authenticated;

/*
  EINGANG → ANGEBOTSENTWURF — Rumpf wie in `20261107300000_auftragseingang.sql`;
  neu: das Angebot übernimmt Liegenschaft und Top des Eingangs (nur mit
  Modul), und ohne Ort gilt die Anschrift der Liegenschaft vor der des
  Kunden — wie beim Weg zur Baustelle.
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
  mit_liegenschaft boolean;
  liegenschaft_zeile text;
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
  -- M02c: Liegenschaft und Top, solange das Modul an ist.
  mit_liegenschaft := e.liegenschaft_id is not null and app.modul_aktiv(e.company_id, 'kunden.liegenschaften');
  if mit_liegenschaft then
    select l.anschrift into liegenschaft_zeile from public.liegenschaften l
     where l.id = e.liegenschaft_id and l.company_id = e.company_id;
  end if;

  angebot := public.angebot_speichern(null, jsonb_build_object(
    'quote_number', nummer,
    'customer_id', k.id,
    'customer_name', k.name,
    'address', coalesce(nullif(btrim(coalesce(e.ort, '')), ''), nullif(btrim(coalesce(liegenschaft_zeile, '')), ''), k.address),
    'quote_date', heute,
    'valid_until', heute + 30,
    'status', 'Entwurf',
    'vat_rate', coalesce((c.rates ->> 'vatRate')::numeric, 0.2),
    'kalkulierte_stunden', 0,
    'notes', btrim(e.anliegen)
      || coalesce(E'\n\nIhre Auftrags- bzw. Schadensnummer: ' || nullif(btrim(coalesce(e.auftraggeber_nummer, '')), ''), ''),
    'liegenschaft_id', case when mit_liegenschaft then e.liegenschaft_id end,
    'top_id', case when mit_liegenschaft then e.top_id end
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

-- ---------------------------------------------------------------------------
-- 6. Die Funktionen
-- ---------------------------------------------------------------------------

/*
  DIE LISTE DER LIEGENSCHAFTEN — gesucht auf dem Server über Bezeichnung,
  Anschrift und Beteiligte (freie Angaben und Name des Kunden), seitenweise
  nach Bezeichnung (Schlüssel der letzten Zeile, nicht eine Stelle: kommt
  dazwischen eine dazu, stünde sonst eine doppelt da).

  Liest mit derselben Grenze wie `liegenschaften_lesen` (im eigenen Betrieb
  jede Rolle außer dem Monteur, der Support mit Einblick); `stable`, schreibt
  also nichts. Eine Seite trägt höchstens 200 Zeilen — weit unter der
  Grenze der Schnittstelle (1000), die sonst still abschnitte.
*/
create or replace function public.liegenschaften_suche(
  p_betrieb text,
  p_suche text default null,
  p_nur_aktive boolean default true,
  p_nach_bezeichnung text default null,
  p_nach_id uuid default null,
  p_grenze integer default 50
) returns setof public.liegenschaften
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  muster text;
begin
  -- `coalesce`: ohne Betrieb und ohne Einblick sind beide Vergleiche leer — und leer heißt hier nein.
  if p_betrieb is null
     or not coalesce(p_betrieb = app.lesebetrieb() or p_betrieb = app.supportbetrieb(), false)
     or app.rolle() is not distinct from 'Mitarbeiter' then
    return;
  end if;
  if nullif(btrim(coalesce(p_suche, '')), '') is not null then
    -- Joker entschärft wie `ilikeMuster` der App: erst der Rückstrich, dann % und _.
    muster := '%' || replace(replace(replace(btrim(p_suche), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
    select l.*
      from public.liegenschaften l
     where l.company_id = p_betrieb
       and (not coalesce(p_nur_aktive, true) or l.aktiv)
       and (p_nach_id is null or (l.bezeichnung, l.id) > (p_nach_bezeichnung, p_nach_id))
       and (muster is null
            or l.bezeichnung ilike muster
            or l.anschrift ilike muster
            or exists (
                 select 1 from public.liegenschaft_beteiligte b
                   left join public.customers c on c.id = b.customer_id and c.company_id = b.company_id
                  where b.company_id = l.company_id and b.liegenschaft_id = l.id
                    and (b.name ilike muster or c.name ilike muster)))
     order by l.bezeichnung, l.id
     limit least(greatest(coalesce(p_grenze, 50), 1), 200);
end;
$$;

revoke all on function public.liegenschaften_suche(text, text, boolean, text, uuid, integer) from public, anon;
grant execute on function public.liegenschaften_suche(text, text, boolean, text, uuid, integer) to authenticated;

/*
  AUS FREIEN ANGABEN WIRD EIN KUNDE — in einem Zug: der Kunde mit Name,
  Telefon und E-Mail, der Beteiligte zeigt danach auf ihn, und seine freien
  Angaben sind leer (der Kunde trägt sie). Für Rechte und Betrieb gilt, was
  für Kunden gilt (`darf_kunden_pflegen`, wie `customers_anlegen`). Ob es den
  Namen schon gibt, fragt die App vorher — dieselbe Rückfrage wie in der
  Kundenliste. Ein zweiter Aufruf gibt denselben Kunden zurück.
*/
create or replace function public.liegenschaft_beteiligter_zu_kunde(p_beteiligter uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  b public.liegenschaft_beteiligte;
  kunde uuid;
begin
  select * into b from public.liegenschaft_beteiligte x
   where x.id = p_beteiligter
     and (x.company_id = app.lesebetrieb() or x.company_id = app.supportbetrieb())
     for update;
  if b.id is null then
    raise exception 'Beteiligten nicht gefunden' using errcode = 'P0002';
  end if;
  if app.darf_kunden_pflegen() is not true then
    raise exception 'Einen Kunden anlegen darf nur, wer Kunden pflegen darf' using errcode = '42501';
  end if;
  perform app.liegenschaften_modul_pflicht(b.company_id);
  if b.customer_id is not null then
    return b.customer_id;
  end if;
  insert into public.customers (company_id, name, contact_phone, email)
  values (b.company_id, b.name, b.telefon, b.email)
  returning id into kunde;
  update public.liegenschaft_beteiligte
     set customer_id = kunde, name = null, telefon = null, email = null
   where id = b.id;
  return kunde;
end;
$$;

revoke all on function public.liegenschaft_beteiligter_zu_kunde(uuid) from public, anon;
grant execute on function public.liegenschaft_beteiligter_zu_kunde(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Das Änderungsjournal (M01b)
-- ---------------------------------------------------------------------------

alter table public.aenderungsjournal drop constraint if exists aenderungsjournal_objektart;
alter table public.aenderungsjournal add constraint aenderungsjournal_objektart
  check (objektart in ('kunde', 'baustelle', 'angebot', 'rechnung', 'zahlung', 'wartung', 'benutzer', 'eingang',
                       'liegenschaft', 'top', 'beteiligter'));

/*
  EIN BETEILIGTER GEHT — UND MIT IHM SEINE WERTE IM JOURNAL. Wer wann ihn
  eingetragen und geändert hat, bleibt (Rechenschaft, Art. 5 Abs. 2); Name,
  Telefon, E-Mail und alle übrigen Werte werden `{"entfernt": true}`, die
  Bezeichnung behält nur die Rolle („Nutzer bzw. Mieter“). Wie
  `journal_kunde_vergessen` für einen Kunden — aber bei JEDEM Entfernen,
  nicht nur bei einem Löschwunsch: ein ausgezogener Mieter soll nicht im
  Journal weiterleben, und es gibt keinen Grund, seine Daten länger zu
  halten als den Eintrag selbst.
*/
create or replace function app.journal_beteiligter_vergessen(p_betrieb text, p_beteiligter uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.aenderungsjournal j
     set aenderungen = (select coalesce(jsonb_object_agg(e.key, '{"entfernt": true}'::jsonb), '{}'::jsonb)
                          from jsonb_each(j.aenderungen) e),
         bezeichnung = nullif(split_part(coalesce(j.bezeichnung, ''), ' · ', 1), '')
   where j.company_id = p_betrieb and j.objektart = 'beteiligter' and j.objekt_id = p_beteiligter;
end;
$$;

revoke all on function app.journal_beteiligter_vergessen(text, uuid) from public, anon, authenticated;

/*
  Rumpf wie in `20261107300000_auftragseingang.sql`; neu sind die drei
  Objektarten der Liegenschaften:
  - Bezug: Tops und Beteiligte stehen unter ihrer Liegenschaft (`bezug_id`),
    wie eine Zahlung unter ihrer Rechnung.
  - Bezeichnung: die der Liegenschaft bzw. des Tops; beim Beteiligten die
    Rolle und der Name („Hausverwaltung · Muster GmbH“) — den Namen nimmt
    `journal_beteiligter_vergessen` beim Entfernen wieder heraus.
  - Der Kunde eines Beteiligten kommt wie bei den übrigen Objekten aus
    `customer_id`: so findet die Löschung des Kunden die Werte.
  - Ein gelöschter Beteiligter verliert seine Werte (siehe oben) — auch mit
    dem Dienstschlüssel, wie ein gelöschter Kunde.
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
      bezug := case
                 when objektart = 'zahlung' then (stand ->> 'invoice_id')::uuid
                 -- M02c: Tops und Beteiligte unter ihrer Liegenschaft.
                 when objektart in ('top', 'beteiligter') then (stand ->> 'liegenschaft_id')::uuid
               end;
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
        -- M02c: die Liegenschaft und das Top mit ihrer Bezeichnung, der Beteiligte mit Rolle und Name.
        when 'liegenschaft' then stand ->> 'bezeichnung'
        when 'top' then stand ->> 'bezeichnung'
        when 'beteiligter' then app.beteiligter_rolle_text(stand ->> 'rolle')
          || coalesce(' · ' || coalesce(nullif(btrim(stand ->> 'name'), ''),
                                        (select c.name from public.customers c where c.id = (stand ->> 'customer_id')::uuid)), '')
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
  -- M02c: ebenso ein entfernter Beteiligter (oben) — nach seiner eigenen Zeile, damit auch sie ohne Namen bleibt.
  if tg_op = 'DELETE' and objektart = 'beteiligter' then
    perform app.journal_beteiligter_vergessen(old.company_id, old.id);
  end if;
  return null;
end;
$$;

revoke all on function app.journal_protokollieren() from public, anon, authenticated;

/*
  WAS OHNE PROTOKOLL BLEIBT (neben `id`, `company_id`, `created_at`,
  `updated_at` wie überall):
  - Liegenschaft: `anschrift` (rechnet die Datenbank aus den Teilen, die
    protokolliert sind).
  - Top: `liegenschaft_id` (steht als `bezug_id`; ein Top wechselt seine
    Liegenschaft nicht).
  - Beteiligter: `liegenschaft_id` (wie beim Top). `top_id` und
    `customer_id` WERDEN protokolliert — sie sind die Angabe, wo er wohnt
    bzw. wer er ist; die Akte zeigt dazu den Namen des Tops bzw. Kunden.
  - Baustelle, Wartung, Eingang, Angebot: `liegenschaft_id` und `top_id` (Kennungen;
    die Bezeichnungen stehen daneben und sind protokolliert).
*/
drop trigger if exists liegenschaften_journal on public.liegenschaften;
create trigger liegenschaften_journal
  after insert or update or delete on public.liegenschaften
  for each row execute function app.journal_protokollieren(
    'liegenschaft', '{id,company_id,created_at,updated_at,anschrift}');

drop trigger if exists liegenschaft_tops_journal on public.liegenschaft_tops;
create trigger liegenschaft_tops_journal
  after insert or update or delete on public.liegenschaft_tops
  for each row execute function app.journal_protokollieren(
    'top', '{id,company_id,created_at,updated_at,liegenschaft_id}');

drop trigger if exists liegenschaft_beteiligte_journal on public.liegenschaft_beteiligte;
create trigger liegenschaft_beteiligte_journal
  after insert or update or delete on public.liegenschaft_beteiligte
  for each row execute function app.journal_protokollieren(
    'beteiligter', '{id,company_id,created_at,updated_at,liegenschaft_id}');

/* Angebot: Ausnahmeliste wie in `20261106200000_papierkorb.sql`, dazu die beiden Kennungen (die Bezeichnungen sind protokolliert). */
drop trigger if exists quotes_journal on public.quotes;
create trigger quotes_journal
  after insert or update or delete on public.quotes
  for each row execute function app.journal_protokollieren(
    'angebot', '{id,company_id,created_at,updated_at,aussteller_stand,customer_id,project_id,vorgaenger_id,versendet_am,angenommen_am,abgelehnt_am,verworfen_am,verworfen_von_uid,verworfen_von_name,liegenschaft_id,top_id}');

/* Baustelle und Wartung: Ausnahmelisten wie in `20261106100000_aenderungsjournal.sql`, dazu die beiden Kennungen. */
drop trigger if exists projects_journal on public.projects;
create trigger projects_journal
  after insert or update or delete on public.projects
  for each row execute function app.journal_protokollieren(
    'baustelle', '{id,company_id,created_at,updated_at,customer_id,liegenschaft_id,top_id}');

drop trigger if exists wartungen_journal on public.wartungen;
create trigger wartungen_journal
  after insert or update or delete on public.wartungen
  for each row execute function app.journal_protokollieren(
    'wartung', '{id,company_id,created_at,updated_at,customer_id,liegenschaft_id,top_id}');

/* Eingang: Ausnahmeliste wie in `20261107300000_auftragseingang.sql`, dazu die beiden Kennungen. */
drop trigger if exists auftragseingaenge_journal on public.auftragseingaenge;
create trigger auftragseingaenge_journal
  after insert or update or delete on public.auftragseingaenge
  for each row execute function app.journal_protokollieren(
    'eingang', '{id,company_id,created_at,updated_at,customer_id,project_id,quote_id,termin_id,dringlichkeit_rang,erfasst_von_uid,erfasst_von_name,bearbeitet_am,bearbeitet_von_uid,bearbeitet_von_name,abgelehnt_am,abgelehnt_von_uid,abgelehnt_von_name,uebernommen_am,uebernommen_von_uid,uebernommen_von_name,liegenschaft_id,top_id}');

/*
  LESEN wie in `20261107300000_auftragseingang.sql`; neu sind die
  Liegenschaften: wer die Liegenschaft sieht (`liegenschaften_lesen`), sieht
  ihr Journal samt dem ihrer Tops und Beteiligten — auch gelöschter, denn
  die Zeile hängt an der Liegenschaft (`bezug_id`).
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
           -- M02c: die Liegenschaft, ihre Tops und Beteiligten über die Liegenschaft.
           when 'liegenschaft' then exists (select 1 from public.liegenschaften t where t.id = aenderungsjournal.objekt_id)
           when 'top' then exists (select 1 from public.liegenschaften t where t.id = aenderungsjournal.bezug_id)
           when 'beteiligter' then exists (select 1 from public.liegenschaften t where t.id = aenderungsjournal.bezug_id)
           -- Benutzer: Lohnstammdaten, nur die Spitze (oben).
           else false
         end
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Datenauskunft und Löschung
-- ---------------------------------------------------------------------------

/*
  DATENAUSKUNFT EINES KUNDEN — gezielt eingefügt wie M01b, M02a, M02b;
  wiederholbar, und ohne eindeutige Einfügestelle bricht die Migration ab:
  an welchen Liegenschaften (und Tops) er mit welcher Rolle beteiligt ist,
  mit Hinweis und Zeitraum. Sein Journal (auch das der Beteiligungen)
  kommt schon über `kunde_id` mit (M01b).

  FREIE BETEILIGTE haben keine eigene Auskunftsart (Grenze mit Grund im Kopf
  dieser Datei): über den Namen allein träfe es Namensvettern. Was über
  einen freien Beteiligten gespeichert ist, steht vollständig in der Akte
  der Liegenschaft — Name, Telefon, E-Mail, Hinweis, Zeitraum —, und dort
  wird er entfernt.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('liegenschaft_beteiligte' in quelle) = 0 then
    marke := $m$from public.uid_pruefungen u where u.company_id = betrieb and u.customer_id = p_id),$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Kunde fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M02c: seine Beteiligungen an Liegenschaften, mit Rolle und Zeitraum.
      'liegenschaft_beteiligungen', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'rolle', app.beteiligter_rolle_text(lb.rolle), 'liegenschaft', ll.bezeichnung,
                 'anschrift', ll.anschrift, 'top', lt.bezeichnung, 'hinweis', lb.hinweis,
                 'gueltig_ab', lb.gueltig_ab, 'gueltig_bis', lb.gueltig_bis, 'eingetragen_am', lb.created_at)
                 order by lb.created_at, lb.id), '[]'::jsonb)
          from public.liegenschaft_beteiligte lb
          join public.liegenschaften ll on ll.id = lb.liegenschaft_id
          left join public.liegenschaft_tops lt on lt.id = lb.top_id
         where lb.company_id = betrieb and lb.customer_id = p_id),$eintrag$);
    execute quelle;
  end if;
end;
$migration$;

/*
  LÖSCHUNG EINES KUNDEN (Art. 17): seine Beteiligungen gehen sofort — sie
  sind kein Beleg, und eine Beteiligung ohne Kunden sagte nichts mehr. Das
  gilt auch, wenn der Kunde wegen Belegen bleibt. Ihre Werte im Journal
  gehen mit (beim Löschen jedes Beteiligten, `journal_beteiligter_vergessen`;
  dazu die Zeilen von Beteiligungen, die früher auf ihn zeigten). Geht der
  Kunde ganz, nähme der Fremdschlüssel sie ohnehin mit.

  Gezielt eingefügt wie oben; wiederholbar.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('liegenschaft_beteiligte' in quelle) = 0 then
    marke := $m$where t.company_id = betrieb and t.customer_id = p_id),$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle „sofort“ fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M02c: seine Beteiligungen an Liegenschaften.
      'liegenschaft_beteiligungen', (select count(*) from public.liegenschaft_beteiligte lb
                                      where lb.company_id = betrieb and lb.customer_id = p_id),$eintrag$);

    marke := $m$delete from public.termine t where t.company_id = betrieb and t.customer_id = p_id;$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle Beteiligungen fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M02c: seine Beteiligungen gehen; ihre Werte im Journal ebenso.
      delete from public.liegenschaft_beteiligte lb where lb.company_id = betrieb and lb.customer_id = p_id;
      update public.aenderungsjournal j
         set aenderungen = (select coalesce(jsonb_object_agg(x.key, '{"entfernt": true}'::jsonb), '{}'::jsonb)
                              from jsonb_each(j.aenderungen) x),
             bezeichnung = nullif(split_part(coalesce(j.bezeichnung, ''), ' · ', 1), '')
       where j.company_id = betrieb and j.objektart = 'beteiligter' and j.kunde_id = p_id;$eintrag$);
    execute quelle;
  end if;
end;
$migration$;

/*
  AUSZUG DES BETRIEBS (`app.auszug_ausgenommen`): nichts ausgenommen.
  Liegenschaften, Tops und Beteiligte sind Geschäftsdaten des Betriebs wie
  die Kunden — der Auszug nimmt sie über `company_id` von selbst mit, die
  nächtliche Sicherung ebenso, und der Rücklauf bringt sie zurück.
*/
