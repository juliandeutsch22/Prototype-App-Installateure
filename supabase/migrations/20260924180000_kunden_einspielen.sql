-- KUNDEN AUS EINER DATEI — prüfen und übernehmen an EINER Stelle.
--
-- Der Kundenstamm eines Betriebs liegt beim Umstieg in einem Altprogramm oder
-- einer Excel-Liste. Ihn von Hand abzutippen kostet Tage und bringt
-- Tippfehler; ihn blind einzuspielen bringt doppelte Kunden.
--
-- Der Browser liest die Datei und prüft jede Zeile (siehe
-- `src/features/customers/kundenCsv.ts`). Was nur die Datenbank wissen
-- kann, steht hier: welche Namen es im Betrieb SCHON gibt. Dieselbe Funktion
-- beantwortet das im Probelauf und hält sich bei der Übernahme daran — gäbe
-- es zwei Stellen, die „doppelt" beurteilen, liefen sie auseinander.

/*
  DERSELBE ABGLEICH WIE IN DER KUNDENLISTE: Gross-/Kleinschreibung und
  Leerraum zählen nicht. „Familie  Huber" und „familie huber" sind derselbe
  Kunde, „Huber" und „Fam. Huber" nicht — das kann keine Regel entscheiden.
*/
create or replace function app.kunden_schluessel(p_name text) returns text
  language sql
  immutable
  set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'))
$$;

/*
  `p_nur_pruefen` (Vorgabe): nichts schreiben, nur sagen, welche Zeilen
  (Stelle in der Liste, ab 0) schon als Kunde bestehen.

  Übernahme: in EINER Transaktion alle Zeilen, die es noch nicht gibt —
  auch nicht weiter oben in derselben Liste. Scheitert eine, ist keine
  geschrieben; ein halb eingespielter Kundenstamm wäre schwerer aufzuräumen
  als gar keiner.

  MIT DEN RECHTEN DES AUFRUFERS: anlegen darf, wer auch einzeln anlegen
  darf. Die Prüfung vorab ist nur für die verständliche Meldung da; die
  Grenze zieht der Zeilenschutz der Kundentabelle.
*/
create or replace function public.kunden_einspielen(p_kunden jsonb, p_nur_pruefen boolean default true)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  vorhanden jsonb;
  angelegt integer := 0;
  gesamt integer;
begin
  if betrieb is null or not app.betriebsmitglied(betrieb) or not app.ist_fuehrung() then
    raise exception 'Kunden übernehmen dürfen Projektleitung, Geschäftsführung und Administration'
      using errcode = '42501';
  end if;
  if p_kunden is null or jsonb_typeof(p_kunden) <> 'array' then
    raise exception 'Erwartet wird eine Liste von Kunden' using errcode = '22023';
  end if;
  gesamt := jsonb_array_length(p_kunden);
  if gesamt > 5000 then
    raise exception 'Höchstens 5000 Kunden auf einmal' using errcode = '22023';
  end if;

  with bestand as (
    select distinct app.kunden_schluessel(c.name) as schluessel
      from public.customers c
     where c.company_id = betrieb
  ), zeilen as (
    select (e.stelle - 1)::integer as nr, app.kunden_schluessel(e.k ->> 'name') as schluessel
      from jsonb_array_elements(p_kunden) with ordinality as e(k, stelle)
  )
  select coalesce(jsonb_agg(z.nr order by z.nr), '[]'::jsonb) into vorhanden
    from zeilen z
    join bestand b on b.schluessel = z.schluessel;

  if p_nur_pruefen then
    return jsonb_build_object('vorhanden', vorhanden);
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_kunden) k
     where app.kunden_schluessel(k ->> 'name') = ''
  ) then
    raise exception 'Jeder Kunde braucht einen Namen' using errcode = '22023';
  end if;

  insert into public.customers (
    company_id, name, address, contact_name, contact_phone, email, vat_id, notes, active)
  select betrieb,
         btrim(z.k ->> 'name'),
         nullif(btrim(coalesce(z.k ->> 'address', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'contactName', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'contactPhone', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'email', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'vatId', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'notes', '')), ''),
         true
    from (
      -- Kommt ein Name in der Liste zweimal, zählt der erste.
      select distinct on (app.kunden_schluessel(e.k ->> 'name')) e.k, e.stelle
        from jsonb_array_elements(p_kunden) with ordinality as e(k, stelle)
       where not ((e.stelle - 1)::integer in (select jsonb_array_elements_text(vorhanden)::integer))
       order by app.kunden_schluessel(e.k ->> 'name'), e.stelle
    ) z
   order by z.stelle;
  get diagnostics angelegt = row_count;

  return jsonb_build_object('angelegt', angelegt, 'uebersprungen', gesamt - angelegt);
end;
$$;

revoke all on function public.kunden_einspielen(jsonb, boolean) from public, anon;
grant execute on function public.kunden_einspielen(jsonb, boolean) to authenticated;
grant execute on function app.kunden_schluessel(text) to authenticated;
