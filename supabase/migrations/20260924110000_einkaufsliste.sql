-- EINKAUFSLISTE — was nicht im Lager liegt, geht gesammelt an den Grosshändler.
--
-- GEWÜNSCHT: Der Lagerist sieht die Anforderung des Monteurs und hakt ab, was
-- im Lager da ist. Fehlt ein Artikel, kommt er auf eine Einkaufsliste; das
-- Büro schickt die gesammelte Liste je Grosshändler als PDF oder E-Mail an
-- den Vertreter.
--
-- WAS DAFÜR NEU IST, und bewusst nicht mehr:
--   - an der Anforderung: woher das Material kommt (`beschaffung`), bei wem
--     es bestellt wird (`supplier_id`), wann bestellt und wann geliefert;
--   - am Grosshändler: die Adresse, an die bestellt wird.
-- Der Status der Anforderung bleibt, wie er ist: „Abholbereit" ist weiter
-- der Moment, in dem der Monteur seine Meldung bekommt — ob die Ware aus
-- dem Regal kam oder vom Grosshändler.
--
-- DER BESTAND BLEIBT EHRLICH. Ware vom Grosshändler geht beim Eintreffen ins
-- Lager (+) und beim Abschluss wie bisher hinaus (−). Beides zusammen ist
-- null — und keine Einkaufsware zieht das Regal ins Minus, nur weil sie
-- abgeschlossen wurde.

alter table material_orders
  add column if not exists beschaffung text
    check (beschaffung in ('lager', 'einkauf')),
  add column if not exists supplier_id uuid references suppliers (id),
  add column if not exists bestellt_am timestamptz,
  add column if not exists geliefert_am timestamptz;

comment on column material_orders.beschaffung is
  'lager = aus dem Regal, einkauf = auf der Einkaufsliste. NULL: noch nicht geprüft.';

-- Die Einkaufsliste fragt genau das: was steht darauf und ist nicht da.
create index if not exists material_orders_einkauf
  on material_orders (company_id, supplier_id)
  where beschaffung = 'einkauf' and geliefert_am is null;

alter table suppliers
  add column if not exists bestell_email text;

comment on column suppliers.bestell_email is
  'Wohin Bestellungen gehen — meist der Vertreter oder das Bestellbüro.';

/*
  DER GROSSHÄNDLER MUSS ZUM BETRIEB GEHÖREN. Der Fremdschlüssel prüft nur,
  dass es ihn gibt; ein Lieferant eines anderen Mandanten wäre sonst eine
  gültige Zeile — und sein Name stünde auf unserer Bestellung.
*/
create or replace function app.anforderung_lieferant_im_betrieb() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.supplier_id is not null and not exists (
    select 1 from public.suppliers s
     where s.id = new.supplier_id and s.company_id = new.company_id
  ) then
    raise exception 'Diesen Grosshändler gibt es im Betrieb nicht' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists material_orders_lieferant on material_orders;
create trigger material_orders_lieferant before insert or update on material_orders
  for each row execute function app.anforderung_lieferant_im_betrieb();

-- ---------------------------------------------------------------------------
-- Wareneingang
-- ---------------------------------------------------------------------------

/*
  GELIEFERT: Bestand hinein, Anforderung abholbereit — in EINEM Schritt, und
  nur einmal. Gesperrt wird jede Zeile, bevor gerechnet wird; eine zweite
  Buchung derselben Lieferung findet `geliefert_am` und tut nichts.

  Mit den Rechten des Aufrufers, wie alle Lagerbewegungen: wer die
  Anforderung nicht ändern darf, erreicht sie hier auch nicht.

  Dazu die Rolle: seine EIGENE Anforderung darf der Monteur ändern (für
  „Abgeholt"), und ohne diese Prüfung hätte er sich die Ware damit auch
  selbst als eingetroffen gebucht. Den Wareneingang bucht, wer die
  Anforderungen abarbeitet — wie `permissions.ts:canProcessOrders`.
*/
create or replace function public.einkauf_geliefert(p_ids uuid[])
  returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  katalog uuid;
  n integer := 0;
begin
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Den Wareneingang bucht die Verwaltung oder die Leitung'
      using errcode = '42501';
  end if;
  for a in
    select * from public.material_orders
     where id = any(p_ids)
       and beschaffung = 'einkauf'
       and geliefert_am is null
       and not processed
     order by id
     for update
  loop
    katalog := coalesce(a.material_id, app.katalogeintrag(a.company_id, a.material_name));
    if katalog is not null then
      perform public.bestand_anpassen(katalog, coalesce(a.quantity, 0));
    end if;
    update public.material_orders
       set geliefert_am = now(),
           -- Wer die Bestellung vergessen hat abzuhaken, hat sie trotzdem
           -- bekommen: ohne Datum sähe die Liste aus, als wäre nie bestellt.
           bestellt_am = coalesce(bestellt_am, now()),
           material_id = coalesce(a.material_id, katalog),
           status = case when status in ('Offen', 'In Bearbeitung') then 'Abholbereit' else status end
     where id = a.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.einkauf_geliefert(uuid[]) from public, anon;
grant execute on function public.einkauf_geliefert(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Abschluss: Einkaufsware ohne Wareneingang
-- ---------------------------------------------------------------------------

/*
  Wie bisher — mit einem Zusatz. Wird eine Einkaufszeile abgeschlossen, ohne
  dass jemand „geliefert" gedrückt hat, bucht der Abschluss den Eingang mit.
  Sonst zöge er Ware aus dem Regal ab, die nie im Regal lag.
*/
create or replace function public.anforderung_abschliessen(p_order uuid)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  katalog uuid;
begin
  select * into a from public.material_orders where id = p_order for update;
  if not found then
    return;
  end if;

  if a.processed then
    update public.material_orders set status = 'Erledigt' where id = p_order;
    return;
  end if;

  if a.transaction_type <> 'return' then
    katalog := coalesce(a.material_id, app.katalogeintrag(a.company_id, a.material_name));
    if katalog is not null then
      if a.beschaffung = 'einkauf' and a.geliefert_am is null then
        perform public.bestand_anpassen(katalog, coalesce(a.quantity, 0));
      end if;
      perform public.bestand_anpassen(katalog, -coalesce(a.quantity, 0));
    end if;
  end if;

  update public.material_orders
     set status = 'Erledigt',
         processed = true,
         material_id = coalesce(a.material_id, katalog),
         geliefert_am = case when a.beschaffung = 'einkauf'
                             then coalesce(a.geliefert_am, now()) else a.geliefert_am end
   where id = p_order;
end;
$$;

revoke all on function public.anforderung_abschliessen(uuid) from public;
grant execute on function public.anforderung_abschliessen(uuid) to authenticated;
