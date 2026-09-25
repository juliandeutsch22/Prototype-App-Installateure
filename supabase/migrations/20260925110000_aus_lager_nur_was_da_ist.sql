-- „AUS LAGER" NUR, WAS DA IST.
--
-- Aus dem Launch-Check (25.09.2026, K2): 999 Stück Rohr bei 74 im Regal
-- liessen sich als „aus Lager — abholbereit" setzen; das Lager zeigte danach
-- „−926 Stk frei", und der Monteur bekam die Meldung, er könne Ware abholen,
-- die es nicht gibt. Unter null ging erst der Abschluss nicht — da stand der
-- Monteur schon vor dem leeren Regal.
--
-- Geprüft wird beim Abhaken, nicht erst beim Abschluss. Und hier statt in
-- der Maske: zwei Lageristen, die gleichzeitig dieselben 74 Stück zweimal
-- zusagen, sieht nur die Datenbank.

/*
  WAS SCHON ZUGESAGT IST. Ware im Regal, die bereits jemandem gehört:

    - aus Lager abgehakt, noch nicht abgeschlossen;
    - vom Grosshändler geliefert, noch nicht abgeholt — sie liegt im Regal,
      ist aber für genau diese Anforderung gekommen;
    - von Hand auf „Abholbereit" gesetzt, ohne Beschaffung (der Weg vor der
      Einkaufsliste, und das „⋯" kann ihn weiter gehen).

  Was noch niemand geprüft hat, ist NICHT zugesagt: eine offene Anforderung
  ist ein Wunsch, kein Anspruch aufs Regal.
*/
create or replace function app.lager_zugesagt(p_material uuid, p_ausser uuid)
  returns numeric
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(sum(o.quantity), 0)
    from public.material_orders o
   where o.material_id = p_material
     and o.id <> p_ausser
     and o.transaction_type = 'order'
     and not o.processed
     and (o.beschaffung = 'lager'
          or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
          or (o.beschaffung is null and o.status = 'Abholbereit'))
$$;

revoke all on function app.lager_zugesagt(uuid, uuid) from public, anon;
grant execute on function app.lager_zugesagt(uuid, uuid) to authenticated;

/*
  DER RIEGEL. Der Artikel wird gesperrt, bevor gerechnet wird — dieselbe
  Sperre, die der Abschluss über `bestand_anpassen` nimmt. Zwei gleichzeitige
  Zusagen rechnen damit nacheinander, nicht beide gegen denselben Stand.

  OHNE KATALOGEINTRAG keine Prüfung: eine Anforderung, deren Artikel es im
  Katalog nicht gibt, hat keinen Bestand, gegen den sich prüfen liesse. Ob
  sie im Regal liegt, weiss dann nur der Lagerist.
*/
create or replace function app.aus_lager_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  katalog uuid;
  bestand numeric;
  einheit text;
  zugesagt numeric;
  frei numeric;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if new.beschaffung is distinct from 'lager'
     or old.beschaffung is not distinct from 'lager'
     or new.transaction_type <> 'order' then
    return new;
  end if;

  katalog := coalesce(new.material_id, app.katalogeintrag(new.company_id, new.material_name));
  if katalog is null then
    return new;
  end if;

  select m.stock, coalesce(nullif(m.unit, ''), 'Stk')
    into bestand, einheit
    from public.materials m
   where m.id = katalog and m.company_id = new.company_id
   for update;
  if not found then
    return new;
  end if;

  zugesagt := app.lager_zugesagt(katalog, new.id);
  frei := coalesce(bestand, 0) - zugesagt;
  if frei < coalesce(new.quantity, 0) then
    raise exception 'Im Lager sind nur % % frei (% im Regal, % schon zugesagt) — angefordert sind %. „Nicht auf Lager" setzt die Anforderung auf die Einkaufsliste.',
      trim_scale(greatest(frei, 0)), einheit,
      trim_scale(coalesce(bestand, 0)), trim_scale(zugesagt),
      trim_scale(coalesce(new.quantity, 0))
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists material_orders_aus_lager on public.material_orders;
create trigger material_orders_aus_lager
  before update of beschaffung on public.material_orders
  for each row execute function app.aus_lager_pruefen();
