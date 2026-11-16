-- ===========================================================================
-- DIE SUCHEN ÜBER POSTGREST NEHMEN IHREN INDEX (Durchsicht 15.11.2026,
-- Nacharbeit L3, Befund 1)
-- ===========================================================================
--
-- Mit Zeilenschutz darf Postgres `ilike` nicht über einen Index auswerten:
-- `texticlike` ist nicht „leakproof“, und eine solche Bedingung darf erst
-- NACH der Leseregel laufen. Jede Suche der App über `or(…ilike…)` lief
-- deshalb als Durchlauf über alle Zeilen ALLER Betriebe der Tabelle — auch
-- die Kunden, Baustellen und Wartungen, deren Indizes je Spalte
-- 20260914220000 genau dafür angelegt hatte. Gemessen in der Begleitprüfung
-- und im Bericht (Kunden, Rechnungen, Baustellen, Anforderungen).
--
-- DAS MUSTER, ANDERS ALS BEI DER KATALOGSUCHE (L3), UND WARUM. Dort liefert
-- eine Funktion mit den Rechten ihres Eigentümers die Zeilen selbst und
-- prüft die Leseregel von `materials` nach — die ist einfach (Betrieb). Die
-- Regeln dieser acht Tabellen sind es nicht: Rechnungen liest die
-- Buchhaltung, die Spitze, der Support und eine Projektleitung mit Freigabe
-- für ihre Baustellen; Anforderungen der Monteur nur die eigenen; Kunden,
-- Angebote, Auftragseingänge der Monteur gar nicht. Sie in acht Funktionen
-- nachzubauen hieße, acht zweite Fassungen zu führen, die auseinanderlaufen
-- können — und jeder Fehler darin gäbe Zeilen heraus.
--
-- Stattdessen zwei Stufen:
--   1. `app.suche_treffer` (Rechte des Eigentümers) findet über den Index die
--      KENNUNGEN der Zeilen, deren Spalten passen — nur im eigenen Betrieb
--      bzw. dem des Supportzugangs, und nur in den Spalten der Liste unten.
--      Sie gibt keine Zeile heraus, und sie steht nicht auf der Schnittstelle
--      (Schema `app`).
--   2. `public.suche_<tabelle>` läuft mit den Rechten des AUFRUFERS: die
--      Zeilen kommen über die Tabelle selbst, also mit ihrer Leseregel und
--      ihren Spaltenrechten, unverändert. Gefragt wird nach Kennungen — ein
--      Vergleich, den Postgres auch mit Zeilenschutz über den Primärschlüssel
--      auswertet.
-- Die App ruft sie wie eine Tabelle (Filter, Reihenfolge, Grenze, Zählung
-- über PostgREST), nur ohne die `or`-Bedingung. Gleiche Treffer, gleiche
-- Reihenfolge, gleiche Zahl: `tests/supabase/sucheMitIndex.test.ts`, je
-- Tabelle und Rolle.
--
-- AUSNAHME VON „security definer“ für die acht `suche_…`: gerade die Rechte
-- des Aufrufers sind ihr Zweck (Sicherheit: die Leseregel gilt, statt
-- nachgebaut zu werden). Fester Suchpfad wie überall.
--
-- SPERREN BEIM ANLEGEN (ohne `concurrently`, `db push` spielt in einer
-- Transaktion ein): jeder Index sperrt seine Tabelle für Schreibende, solange
-- er sie einmal liest — bei zehntausenden Zeilen Bruchteile einer Sekunde.
-- ===========================================================================

create extension if not exists pg_trgm;

/*
  JE GESUCHTER SPALTE EIN TRIGRAMM-INDEX — die Spalten der Suchen in
  `pg/customers.ts`, `projects.ts`, `wartungen.ts`, `workSheets.ts`,
  `materialOrders.ts`, `auftragseingaenge.ts`, `invoices.ts`, `quotes.ts`.
  Wer dort eine Spalte dazunimmt, nimmt sie in die Liste von
  `app.suche_treffer` und hierher auf. Die übrigen gibt es seit 20260914220000.
*/
create index if not exists customers_suche_contact_phone on public.customers using gin (contact_phone gin_trgm_ops);
create index if not exists customers_suche_email on public.customers using gin (email gin_trgm_ops);
create index if not exists projects_suche_bezeichnung on public.projects using gin (bezeichnung gin_trgm_ops);
create index if not exists work_sheets_suche_customer_name on public.work_sheets using gin (customer_name gin_trgm_ops);
create index if not exists work_sheets_suche_notizen on public.work_sheets using gin (notizen gin_trgm_ops);
create index if not exists material_orders_suche_material_name on public.material_orders using gin (material_name gin_trgm_ops);
create index if not exists material_orders_suche_user_name on public.material_orders using gin (user_name gin_trgm_ops);
create index if not exists material_orders_suche_project_number on public.material_orders using gin (project_number gin_trgm_ops);
create index if not exists material_orders_suche_note on public.material_orders using gin (note gin_trgm_ops);
create index if not exists auftragseingaenge_suche_nummer on public.auftragseingaenge using gin (nummer gin_trgm_ops);
create index if not exists auftragseingaenge_suche_kunde_name on public.auftragseingaenge using gin (kunde_name gin_trgm_ops);
create index if not exists auftragseingaenge_suche_ort on public.auftragseingaenge using gin (ort gin_trgm_ops);
create index if not exists auftragseingaenge_suche_anliegen on public.auftragseingaenge using gin (anliegen gin_trgm_ops);
create index if not exists auftragseingaenge_suche_auftraggeber_nummer on public.auftragseingaenge using gin (auftraggeber_nummer gin_trgm_ops);
create index if not exists invoices_suche_invoice_number on public.invoices using gin (invoice_number gin_trgm_ops);
create index if not exists invoices_suche_storno_nummer on public.invoices using gin (storno_nummer gin_trgm_ops);
create index if not exists invoices_suche_customer_name on public.invoices using gin (customer_name gin_trgm_ops);
create index if not exists invoices_suche_project_number on public.invoices using gin (project_number gin_trgm_ops);
create index if not exists quotes_suche_quote_number on public.quotes using gin (quote_number gin_trgm_ops);
create index if not exists quotes_suche_customer_name on public.quotes using gin (customer_name gin_trgm_ops);
create index if not exists quotes_suche_address on public.quotes using gin (address gin_trgm_ops);
create index if not exists quotes_suche_project_number on public.quotes using gin (project_number gin_trgm_ops);

/*
  DIE KENNUNGEN DER TREFFER. `p_begriff`: `%begriff%` (getrimmt, Joker
  entschärft wie `ilikeMuster`) in einer der Spalten. `p_muster`: fertige
  Muster der App (`kundenNachNamen`), je Muster in der ersten Spalte. Nur
  die Spalten der Liste; eine andere ist ein Fehler, keine Suche.
*/
create or replace function app.suche_treffer(p_tabelle text, p_spalten text[], p_begriff text, p_muster text[] default null)
  returns uuid[]
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  erlaubt constant jsonb := '{"customers": ["name", "address", "contact_name", "contact_phone", "email"], "projects": ["project_number", "customer_name", "bezeichnung", "address"], "wartungen": ["customer_name", "anlage", "address"], "work_sheets": ["customer_name", "notizen"], "material_orders": ["material_name", "user_name", "project_number", "note"], "auftragseingaenge": ["nummer", "kunde_name", "ort", "anliegen", "auftraggeber_nummer"], "invoices": ["invoice_number", "storno_nummer", "customer_name", "project_number"], "quotes": ["quote_number", "customer_name", "address", "project_number"]}';
  betriebe text[] := array_remove(array[app.lesebetrieb(), app.supportbetrieb()], null);
  begriff text := btrim(coalesce(p_begriff, ''));
  bedingung text;
  treffer uuid[];
begin
  if not erlaubt ? coalesce(p_tabelle, '') then
    raise exception 'Keine Suche über %', p_tabelle using errcode = '22023';
  end if;
  if coalesce(cardinality(p_spalten), 0) = 0
     or exists (select 1 from unnest(p_spalten) s where not (erlaubt -> p_tabelle) ? s) then
    raise exception 'Keine Suche über diese Spalten' using errcode = '22023';
  end if;
  -- Ohne Anmeldung kein Betrieb, also nichts zu finden (die Leseregel gäbe ohnehin nichts heraus).
  if cardinality(betriebe) = 0 then
    return '{}';
  end if;

  if p_muster is not null then
    if cardinality(p_muster) > 200 then
      raise exception 'Höchstens 200 Muster je Anfrage' using errcode = '22023';
    end if;
    -- Je Muster eine Abfrage über den Index — ein `ilike any(…)` könnte ihn nicht nutzen.
    execute format(
      'select coalesce(array_agg(distinct x.id), ''{}'') from unnest($2) mu(m)
         cross join lateral (select t.id from public.%I t where t.company_id = any($1) and t.%I ilike mu.m) x',
      p_tabelle, p_spalten[1])
      into treffer using betriebe, p_muster;
    return treffer;
  end if;

  if begriff = '' then
    raise exception 'Ohne Suchbegriff keine Suche' using errcode = '22023';
  end if;
  select string_agg(format('t.%I ilike $2', s), ' or ') into bedingung from unnest(p_spalten) s;
  -- `execute … using`: Postgres plant mit dem Muster, nicht mit einem allgemeinen Plan.
  execute format('select coalesce(array_agg(t.id), ''{}'') from public.%I t where t.company_id = any($1) and (%s)',
                 p_tabelle, bedingung)
    into treffer
    using betriebe, '%' || replace(replace(replace(begriff, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return treffer;
end;
$$;

-- Die Suchfunktionen laufen mit den Rechten des Aufrufers und rufen diese — angemeldete Konten brauchen das Recht.
revoke all on function app.suche_treffer(text, text[], text, text[]) from public, anon;
grant execute on function app.suche_treffer(text, text[], text, text[]) to authenticated;

create or replace function public.suche_customers(p_spalten text[], p_begriff text default null, p_muster text[] default null)
  returns setof public.customers
  language sql
  stable
  set search_path = ''
as $$
  select t.* from public.customers t
   where t.id in (select unnest(app.suche_treffer('customers', p_spalten, p_begriff, p_muster)))
$$;

revoke all on function public.suche_customers(text[], text, text[]) from public, anon;
grant execute on function public.suche_customers(text[], text, text[]) to authenticated;

create or replace function public.suche_projects(p_spalten text[], p_begriff text default null, p_muster text[] default null)
  returns setof public.projects
  language sql
  stable
  set search_path = ''
as $$
  select t.* from public.projects t
   where t.id in (select unnest(app.suche_treffer('projects', p_spalten, p_begriff, p_muster)))
$$;

revoke all on function public.suche_projects(text[], text, text[]) from public, anon;
grant execute on function public.suche_projects(text[], text, text[]) to authenticated;

create or replace function public.suche_wartungen(p_spalten text[], p_begriff text default null, p_muster text[] default null)
  returns setof public.wartungen
  language sql
  stable
  set search_path = ''
as $$
  select t.* from public.wartungen t
   where t.id in (select unnest(app.suche_treffer('wartungen', p_spalten, p_begriff, p_muster)))
$$;

revoke all on function public.suche_wartungen(text[], text, text[]) from public, anon;
grant execute on function public.suche_wartungen(text[], text, text[]) to authenticated;

create or replace function public.suche_work_sheets(p_spalten text[], p_begriff text default null, p_muster text[] default null)
  returns setof public.work_sheets
  language sql
  stable
  set search_path = ''
as $$
  select t.* from public.work_sheets t
   where t.id in (select unnest(app.suche_treffer('work_sheets', p_spalten, p_begriff, p_muster)))
$$;

revoke all on function public.suche_work_sheets(text[], text, text[]) from public, anon;
grant execute on function public.suche_work_sheets(text[], text, text[]) to authenticated;

create or replace function public.suche_material_orders(p_spalten text[], p_begriff text default null, p_muster text[] default null)
  returns setof public.material_orders
  language sql
  stable
  set search_path = ''
as $$
  select t.* from public.material_orders t
   where t.id in (select unnest(app.suche_treffer('material_orders', p_spalten, p_begriff, p_muster)))
$$;

revoke all on function public.suche_material_orders(text[], text, text[]) from public, anon;
grant execute on function public.suche_material_orders(text[], text, text[]) to authenticated;

create or replace function public.suche_auftragseingaenge(p_spalten text[], p_begriff text default null, p_muster text[] default null)
  returns setof public.auftragseingaenge
  language sql
  stable
  set search_path = ''
as $$
  select t.* from public.auftragseingaenge t
   where t.id in (select unnest(app.suche_treffer('auftragseingaenge', p_spalten, p_begriff, p_muster)))
$$;

revoke all on function public.suche_auftragseingaenge(text[], text, text[]) from public, anon;
grant execute on function public.suche_auftragseingaenge(text[], text, text[]) to authenticated;

create or replace function public.suche_invoices(p_spalten text[], p_begriff text default null, p_muster text[] default null)
  returns setof public.invoices
  language sql
  stable
  set search_path = ''
as $$
  select t.* from public.invoices t
   where t.id in (select unnest(app.suche_treffer('invoices', p_spalten, p_begriff, p_muster)))
$$;

revoke all on function public.suche_invoices(text[], text, text[]) from public, anon;
grant execute on function public.suche_invoices(text[], text, text[]) to authenticated;

create or replace function public.suche_quotes(p_spalten text[], p_begriff text default null, p_muster text[] default null)
  returns setof public.quotes
  language sql
  stable
  set search_path = ''
as $$
  select t.* from public.quotes t
   where t.id in (select unnest(app.suche_treffer('quotes', p_spalten, p_begriff, p_muster)))
$$;

revoke all on function public.suche_quotes(text[], text, text[]) from public, anon;
grant execute on function public.suche_quotes(text[], text, text[]) to authenticated;
