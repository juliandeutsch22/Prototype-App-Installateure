-- TESTBERICHT 30.09.2026, G13 — DER URLAUBSZÄHLER IM MENÜ ZÄHLT NUR, WAS
-- DIE PERSON ENTSCHEIDEN DARF.
--
-- WAS BISHER GALT: `offene_posten` zählte jeden offenen Antrag des Betriebs,
-- auch den eigenen. Über den eigenen entscheidet nach dem Vier-Augen-Prinzip
-- jemand anderer (`vacations_vier_augen`), sobald es so jemanden gibt — das
-- Abzeichen stand dann dauerhaft auf „1“, und hinter dem Klick war nichts zu
-- tun.
--
-- JETZT: der eigene Antrag zählt nicht mit, wenn jemand anderer ihn
-- entscheiden kann — dieselbe Bedingung wie in der Regel selbst
-- (`app.entscheidet_jemand_anderer`). Ist niemand anderer da, darf die Person
-- selbst entscheiden, und dann zählt er weiter. Die beiden anderen Zahlen
-- bleiben Wort für Wort.

create or replace function public.offene_posten(p_heute date default current_date)
  returns table (urlaub bigint, anforderungen bigint, mahnungen bigint)
  language sql stable
  set search_path = ''
as $$
  select
    case when app.darf_urlaub_entscheiden(app.betrieb())
      then (select count(*) from public.vacations v
             where v.company_id = app.betrieb()
               and v.status = 'Beantragt'
               and (v.user_id is distinct from auth.uid()
                    or not app.entscheidet_jemand_anderer(v.company_id, v.user_id)))
      else 0::bigint end,

    case when app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()
      then (select count(*) from public.material_orders m
             where m.company_id = app.betrieb()
               and m.status = 'Offen')
      else 0::bigint end,

    case when app.ist_buch_oder_spitze()
      then (select count(*) from public.invoices i
             where i.company_id = app.betrieb()
               -- Wortgleich zum Teilindex `invoices_offen`; steht hier etwas
               -- anderes, greift er nicht mehr.
               and i.payment_status in ('Offen', 'Überfällig', 'Teilbezahlt')
               and i.total_brutto - i.bezahlt_betrag > 0
               and app.mahnung_faellig(i.payment_status, i.due_date, i.mahnstufe,
                                       i.gemahnt_am, i.mahnfrist, p_heute))
      else 0::bigint end
$$;
revoke all on function public.offene_posten(date) from public, anon;
grant execute on function public.offene_posten(date) to authenticated, service_role;
