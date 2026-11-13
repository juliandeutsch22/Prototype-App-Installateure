/*
  „ABGEHOLT“ MIT HERKUNFT (C7, E89, 13.11.2026).

  Seit E82 steht fest, was „Abgeholt“ bei „Offen“ bucht: einen Abgang vom
  Lager. Das stimmt, wenn der Monteur selbst ins Regal gegriffen hat — nicht,
  wenn er die Ware beim Händler um die Ecke mitgenommen hat. Dann zog die App
  Bestand ab, der nie das Lager verlassen hatte, und die nächste Inventur
  fand mehr als gebucht.

  Neu: `p_herkunft` ('lager' wie bisher, oder 'haendler'). Beim Händler wird
  nichts abgebucht; die Anforderung ist erledigt wie sonst auch, zählt also
  weiter als Ausgabe für die Baustelle (Rechnungsvorschlag, Nachkalkulation)
  — verbaut ist sie ja. Die Herkunft steht an der Anforderung
  (`abgeholt_herkunft`), damit Lager und Büro sehen, warum der Bestand
  gleich blieb. Ohne Angabe gilt 'lager': alle bisherigen Aufrufer bleiben,
  wie sie sind.
*/
alter table public.material_orders
  add column if not exists abgeholt_herkunft text
  check (abgeholt_herkunft in ('lager', 'haendler'));

comment on column public.material_orders.abgeholt_herkunft is
  'Woher die abgeholte Ware kam: aus dem Lager (abgebucht) oder beim Händler mitgenommen (nicht abgebucht), C7/E89.';

drop function if exists public.anforderung_abschliessen(uuid, text, uuid);

create or replace function public.anforderung_abschliessen(
  p_order uuid, p_status text default null, p_ort uuid default null, p_herkunft text default null)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  katalog uuid;
  ort public.lagerorte;
  ort_id uuid;
begin
  select * into a from public.material_orders where id = p_order for update;
  if not found then
    return 0;
  end if;

  if not (app.betriebsmitglied(a.company_id) or app.support_schreibt(a.company_id))
     or not (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung()
             or a.user_id = auth.uid()) then
    return 0;
  end if;

  -- Ein anderer war schneller: nichts abbuchen, nichts überschreiben.
  if p_status is not null and a.status is distinct from p_status then
    return 0;
  end if;

  if p_herkunft is not null and p_herkunft not in ('lager', 'haendler') then
    raise exception 'Herkunft ist „lager“ oder „haendler“' using errcode = '22023';
  end if;
  /*
    BEIM HÄNDLER MITGENOMMEN (C7, E89) geht nur, solange das Büro nichts
    bereitgestellt hat und nichts beim Großhändler bestellt ist: liegt die
    Ware schon abholbereit im Lager oder ist sie unterwegs, kam sie nicht
    vom Händler um die Ecke.
  */
  if p_herkunft = 'haendler' and (
       a.transaction_type = 'return' or a.processed
       or a.status not in ('Offen', 'In Bearbeitung')
       or (a.beschaffung = 'einkauf' and (a.bestellt_am is not null or a.geliefert_am is not null))) then
    raise exception 'Beim Händler mitgenommen geht nur, solange nichts bereitgestellt oder bestellt ist' using errcode = '23514';
  end if;

  if a.processed then
    if a.status = 'Erledigt' then
      return 0;
    end if;
    update public.material_orders set status = 'Erledigt' where id = p_order;
    return 1;
  end if;

  -- M04a: der Quellort.
  if p_ort is null then
    ort_id := a.lagerort_id;
  else
    ort := app.ort_pruefen(a.company_id, p_ort, true);
    ort_id := ort.id;
    if ort_id is not null
       and not (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung() or app.eigenes_fahrzeug(ort_id)) then
      raise exception 'Aus diesem Ort bucht das Lager ab — der Besteller nur aus seinem eigenen Fahrzeug'
        using errcode = '42501';
    end if;
    if ort_id is not null then
      perform app.lagerort_wahl_pruefen(a.company_id);
    end if;
  end if;

  -- Vom Händler: das Lager hat nichts ausgegeben, also wird nichts abgebucht (und keine Lieferung erwartet).
  if a.transaction_type <> 'return' and coalesce(p_herkunft, 'lager') = 'lager' then
    katalog := coalesce(a.material_id, app.katalogeintrag(a.company_id, a.material_name));
    -- Mit Eigentümerrechten hält kein Zeilenschutz mehr einen Artikel eines
    -- anderen Betriebs fern; der Fremdschlüssel prüft nur, dass es ihn gibt.
    if katalog is not null and not exists (
      select 1 from public.materials m where m.id = katalog and m.company_id = a.company_id
    ) then
      katalog := null;
    end if;
    if katalog is not null then
      if ort_id is null then
        if a.beschaffung = 'einkauf' and a.geliefert_am is null then
          perform app.lager_kontext('eingang', null, null, null, 'Anforderung, beim Abholen geliefert', a.id);
          perform public.bestand_anpassen(katalog, coalesce(a.quantity, 0));
        end if;
        perform app.lager_kontext('entnahme', null, null, null,
          coalesce('Baustelle ' || nullif(a.project_number, ''), 'Anforderung') || ' · ' || coalesce(a.user_name, ''), a.id);
        perform public.bestand_anpassen(katalog, -coalesce(a.quantity, 0));
        perform app.lager_kontext_leeren();
      else
        -- Dieselben Buchungen am Quellort.
        if a.beschaffung = 'einkauf' and a.geliefert_am is null then
          perform app.lager_kontext('eingang', null, null, null, 'Anforderung, beim Abholen geliefert', a.id);
          perform app.ort_anpassen(ort_id, katalog, coalesce(a.quantity, 0), false);
        end if;
        perform app.lager_kontext('entnahme', null, null, null,
          coalesce('Baustelle ' || nullif(a.project_number, ''), 'Anforderung') || ' · ' || coalesce(a.user_name, ''), a.id);
        perform app.ort_anpassen(ort_id, katalog, -coalesce(a.quantity, 0), true);
        perform app.lager_kontext_leeren();
      end if;
    end if;
  end if;

  perform set_config('app.ort_setzen', 'ja', true);
  update public.material_orders
     set status = 'Erledigt',
         processed = true,
         material_id = coalesce(a.material_id, katalog, app.katalogeintrag(a.company_id, a.material_name)),
         geliefert_am = case when a.beschaffung = 'einkauf'
                             then coalesce(a.geliefert_am, now()) else a.geliefert_am end,
         lagerort_id = ort_id,
         abgeholt_herkunft = case when a.transaction_type = 'return' then null else coalesce(p_herkunft, 'lager') end
   where id = p_order;
  perform set_config('app.ort_setzen', '', true);
  return 1;
end;
$$;
revoke all on function public.anforderung_abschliessen(uuid, text, uuid, text) from public, anon;
grant execute on function public.anforderung_abschliessen(uuid, text, uuid, text) to authenticated;
