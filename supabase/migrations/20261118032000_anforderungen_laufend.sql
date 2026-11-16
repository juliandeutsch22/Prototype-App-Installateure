/*
  ANFORDERUNGEN „LAUFEND“ AUS DER DATENBANK (Durchsicht 15.11.2026, Budget
  B3: höchstens 50 Zeilen je Anfrage).

  „Laufend“ holte den ganzen Arbeitsstand — jede noch nicht abgeholte
  Anforderung, im gewachsenen Bestand 160 — als Live-Liste, um im Browser zu
  gruppieren (Offen, In Bearbeitung, Abholbereit), zu zählen und nach den
  Filtern der Startseite zu sieben. Gezeigt werden je Gruppe 20.

  `anforderungen_laufend` gibt je Gruppe die Zahl und die ersten
  `p_anzahl ->> Status` Zeilen (Eil zuerst, dann die älteste), dazu die
  Baustellen aller offenen Anforderungen (Auswahl „Baustelle“) und die Zahl
  der noch nicht bestellten auf der Einkaufsliste (Reiter „Einkauf“). Die
  Filter der Startseite wie in der App (`anforderungStand.ts`,
  `passtZuFilter`): offen; eil (Offen oder In Bearbeitung); seit über drei
  Wiener Kalendertagen abholbereit; bestellt und Liefertermin vorbei;
  bestellt und heute erwartet. Ob beide dasselbe sagen, prüft
  `tests/supabase/anforderungenLaufend.test.ts` gegen die Regeln der App.

  RECHTE wie das Lesen der Anforderungen (`material_orders_lesen`): im
  eigenen Betrieb die eigenen, Verwaltung, Buchhaltung und Führung alle;
  der Support-Einblick alle. Sonst ein Fehler statt einer leeren Liste.
*/

create or replace function public.anforderungen_laufend(
  p_heute date,
  p_jetzt timestamptz,
  p_filter text default null,
  p_projekt text default null,
  p_anzahl jsonb default '{}'
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  alle boolean;
  ergebnis jsonb;
begin
  if betrieb is null or not app.darf(betrieb) then
    raise exception 'Kein Zugriff auf die Anforderungen dieses Betriebs' using errcode = '42501';
  end if;
  if p_heute is null or p_jetzt is null
     or (p_filter is not null and p_filter not in ('offen', 'eil', 'abholbereit-alt', 'bestellt-ueberfaellig', 'lieferung-heute')) then
    raise exception 'Unbekannte Angabe für die laufenden Anforderungen' using errcode = '22023';
  end if;
  alle := app.support_liest(betrieb) or app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung();

  with offen as (
    select o.*
      from public.material_orders o
     where o.company_id = betrieb
       and o.transaction_type = 'order'
       and o.status in ('Offen', 'In Bearbeitung', 'Abholbereit')
       and (alle or o.user_id = (select auth.uid()))
  ),
  gefiltert as (
    select o.*
      from offen o
     where (p_projekt is null or o.project_number = p_projekt)
       and case p_filter
             when 'offen' then o.status = 'Offen'
             when 'eil' then coalesce(o.is_urgent, false) and o.status in ('Offen', 'In Bearbeitung')
             when 'abholbereit-alt' then o.status = 'Abholbereit' and o.abholbereit_seit is not null
               and (p_jetzt at time zone 'Europe/Vienna')::date - (o.abholbereit_seit at time zone 'Europe/Vienna')::date > 3
             when 'bestellt-ueberfaellig' then o.bestellt_am is not null and o.geliefert_am is null
               and o.liefertermin is not null and o.liefertermin < p_heute
             when 'lieferung-heute' then o.bestellt_am is not null and o.geliefert_am is null and o.liefertermin = p_heute
             else true
           end
  ),
  gruppen as (
    select s.status, s.reihe,
           (select count(*) from gefiltert g where g.status = s.status) as anzahl,
           coalesce((
             select jsonb_agg(to_jsonb(x) order by coalesce(x.is_urgent, false) desc, x.created_at, x.id)
               from (select g.* from gefiltert g where g.status = s.status
                      order by coalesce(g.is_urgent, false) desc, g.created_at, g.id
                      limit greatest(coalesce((p_anzahl ->> s.status)::integer, 20), 0)) x), '[]'::jsonb) as zeilen
      from (values ('Offen', 1), ('In Bearbeitung', 2), ('Abholbereit', 3)) s(status, reihe)
  )
  select jsonb_build_object(
    'gruppen', (select jsonb_agg(jsonb_build_object('status', g.status, 'anzahl', g.anzahl, 'zeilen', g.zeilen) order by g.reihe) from gruppen g),
    'projekte', coalesce((select jsonb_agg(p order by p) from (select distinct o.project_number as p from offen o where nullif(o.project_number, '') is not null) x), '[]'::jsonb),
    'zu_bestellen', (select count(*) from offen o where o.beschaffung = 'einkauf' and o.geliefert_am is null and o.bestellt_am is null)
  ) into ergebnis;
  return ergebnis;
end;
$$;

revoke all on function public.anforderungen_laufend(date, timestamptz, text, text, jsonb) from public, anon;
grant execute on function public.anforderungen_laufend(date, timestamptz, text, text, jsonb) to authenticated;
