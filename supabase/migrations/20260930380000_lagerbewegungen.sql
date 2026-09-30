/*
  DER BESTAND ÄNDERT SICH NUR ÜBER BEWEGUNGEN (Testbericht 30.09.2026, M28, M29)

  WAS DER BERICHT FAND. Unter „Bearbeiten“ liess sich der Lagerbestand ohne
  Grund und ohne Spur überschreiben, und der Wareneingang war nur eine Zahl:
  kein Lieferant, kein Lieferschein, kein Bezug zur Bestellung.

  WAS JETZT GILT.
  - Jede Änderung des Bestands steht im Bewegungsprotokoll
    (`lagerbewegungen`): Art, Menge mit Vorzeichen, Bestand danach, wer,
    wann, und je nach Art Grund, Lieferant, Lieferschein und Bezug.
    Geschrieben wird es von einem Auslöser an `materials` — kein Weg am
    Protokoll vorbei.
  - Ein Überschreiben des Bestands an der Tabelle vorbei weist die Datenbank
    ab. Der Bestand ändert sich über Wareneingang (`lager_eingang`, mit
    Lieferant), Abholung, Retoure, Einkaufsliste und Inventur
    (`lager_inventur`, mit Grund). Ein neuer Artikel darf mit Anfangsbestand
    angelegt werden; auch der steht im Protokoll.
  - `bestand_anpassen` bleibt für die Abläufe der Datenbank; einen Abgang
    bucht es nur, wenn ein solcher Ablauf ihn angesagt hat.

  Der Dienstschlüssel (Rücklauf einer Sicherung, Prüfungen) bleibt aussen
  vor: er schreibt keine Bewegungen, und ihn hält der Wächter nicht auf.
  Bestehende Bestände bleiben, wie sie sind.
*/

create table if not exists public.lagerbewegungen (
  id                uuid primary key default gen_random_uuid(),
  company_id        text not null references public.companies (id),
  material_id       uuid not null references public.materials (id) on delete cascade,
  art               text not null check (art in (
                      'anfangsbestand', 'eingang', 'entnahme', 'retoure', 'inventur', 'zugang', 'abgang')),
  /* Die Veränderung, mit Vorzeichen. Bei einer bestätigten Inventur null. */
  menge             numeric(12,3) not null,
  bestand_nachher   numeric(12,3) not null,
  grund             text,
  lieferant         text,
  lieferschein      text,
  bezug             text,
  material_order_id uuid references public.material_orders (id) on delete set null,
  erfasst_von       uuid,
  erfasst_von_name  text,
  created_at        timestamptz not null default now()
);

create index if not exists lagerbewegungen_artikel
  on public.lagerbewegungen (material_id, created_at desc);
create index if not exists lagerbewegungen_betrieb
  on public.lagerbewegungen (company_id, created_at desc);

alter table public.lagerbewegungen enable row level security;

/*
  LESEN: wer das Lager führt — Verwaltung und Leitung — und die Buchhaltung.
  SCHREIBEN: niemand direkt. Die Zeilen entstehen im Auslöser; geändert oder
  gelöscht wird ein Protokoll nicht.
*/
drop policy if exists lagerbewegungen_lesen on public.lagerbewegungen;
create policy lagerbewegungen_lesen on public.lagerbewegungen for select
  using (app.darf(company_id)
         and (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung()));

grant select on public.lagerbewegungen to authenticated;

drop trigger if exists lagerbewegungen_kein_support_schreiben on public.lagerbewegungen;
create trigger lagerbewegungen_kein_support_schreiben before insert or update or delete on public.lagerbewegungen
  for each row execute function app.support_schreibt_nicht();

-- ---------------------------------------------------------------------------
-- Was die nächste Buchung ist — für den Auslöser
-- ---------------------------------------------------------------------------

create or replace function app.lager_kontext(
  p_art text, p_grund text, p_lieferant text, p_lieferschein text, p_bezug text, p_auftrag uuid
) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  perform set_config('app.lager_art', coalesce(p_art, ''), true);
  perform set_config('app.lager_grund', coalesce(p_grund, ''), true);
  perform set_config('app.lager_lieferant', coalesce(p_lieferant, ''), true);
  perform set_config('app.lager_lieferschein', coalesce(p_lieferschein, ''), true);
  perform set_config('app.lager_bezug', coalesce(p_bezug, ''), true);
  perform set_config('app.lager_auftrag', coalesce(p_auftrag::text, ''), true);
end;
$$;

create or replace function app.lager_kontext_leeren() returns void
  language sql
  set search_path = ''
as $$
  select app.lager_kontext(null, null, null, null, null, null);
$$;

-- Das Schema `app` liegt nicht an der Schnittstelle; aufrufen können diese
-- Helfer nur die Abläufe der Datenbank. `authenticated` braucht das Recht,
-- weil `einkauf_geliefert` und `bestand_anpassen` mit den Rechten des
-- Aufrufers laufen.
revoke all on function app.lager_kontext(text, text, text, text, text, uuid) from public, anon;
revoke all on function app.lager_kontext_leeren() from public, anon;
grant execute on function app.lager_kontext(text, text, text, text, text, uuid) to authenticated;
grant execute on function app.lager_kontext_leeren() to authenticated;

/* Ein leerer Eintrag ist keiner. */
create or replace function app.lager_wert(p_schluessel text) returns text
  language sql
  stable
  set search_path = ''
as $$
  select nullif(btrim(coalesce(current_setting(p_schluessel, true), '')), '');
$$;

-- ---------------------------------------------------------------------------
-- Der Wächter: kein Bestand an der Bewegung vorbei
-- ---------------------------------------------------------------------------

create or replace function app.bestand_nur_ueber_bewegung() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.stock is distinct from old.stock
     and not app.ist_dienst()
     and app.lager_wert('app.lager_buchung') is null then
    raise exception 'Der Bestand ändert sich nur über Wareneingang, Abholung, Retoure oder Inventur — so steht jede Änderung im Bewegungsprotokoll'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists materials_bestand_nur_ueber_bewegung on public.materials;
create trigger materials_bestand_nur_ueber_bewegung before update of stock on public.materials
  for each row execute function app.bestand_nur_ueber_bewegung();

-- ---------------------------------------------------------------------------
-- Das Protokoll
-- ---------------------------------------------------------------------------

create or replace function app.lagerbewegung_schreiben() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  delta numeric(12,3);
  art text;
  auftrag uuid;
begin
  if app.ist_dienst() then
    return null;
  end if;
  if tg_op = 'INSERT' then
    delta := coalesce(new.stock, 0);
    art := 'anfangsbestand';
  else
    delta := coalesce(new.stock, 0) - coalesce(old.stock, 0);
    art := coalesce(app.lager_wert('app.lager_art'), case when delta > 0 then 'zugang' else 'abgang' end);
  end if;
  if delta = 0 then
    return null;
  end if;
  auftrag := nullif(app.lager_wert('app.lager_auftrag'), '')::uuid;
  if auftrag is not null and not exists (select 1 from public.material_orders o where o.id = auftrag) then
    auftrag := null; -- die Anforderung entsteht womöglich erst danach in derselben Buchung
  end if;
  insert into public.lagerbewegungen (
    company_id, material_id, art, menge, bestand_nachher,
    grund, lieferant, lieferschein, bezug, material_order_id, erfasst_von, erfasst_von_name
  ) values (
    new.company_id, new.id, art, delta, coalesce(new.stock, 0),
    app.lager_wert('app.lager_grund'), app.lager_wert('app.lager_lieferant'),
    app.lager_wert('app.lager_lieferschein'), app.lager_wert('app.lager_bezug'), auftrag,
    auth.uid(), (select u.name from public.users u where u.id = auth.uid())
  );
  return null;
end;
$$;

revoke all on function app.lagerbewegung_schreiben() from public, anon, authenticated;

drop trigger if exists materials_lagerbewegung on public.materials;
create trigger materials_lagerbewegung after insert or update of stock on public.materials
  for each row execute function app.lagerbewegung_schreiben();

-- ---------------------------------------------------------------------------
-- bestand_anpassen — der gemeinsame Weg der Abläufe
-- ---------------------------------------------------------------------------

create or replace function public.bestand_anpassen(p_material uuid, p_delta numeric)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  angesagt boolean := app.lager_wert('app.lager_art') is not null;
begin
  if p_material is null or coalesce(p_delta, 0) = 0 then return; end if;
  /*
    EIN ABGANG NUR MIT ANSAGE. Abholung und Inventur sagen ihn an; ein
    direkter Aufruf mit Minus war der Weg, den Bestand ohne Grund zu senken.
  */
  if p_delta < 0 and not angesagt then
    raise exception 'Abgänge bucht das Lager über Abholung oder Inventur — mit Grund im Bewegungsprotokoll'
      using errcode = '42501';
  end if;
  if not angesagt then
    perform set_config('app.lager_art', 'eingang', true);
  end if;
  perform set_config('app.lager_buchung', 'ja', true);
  update public.materials
     set stock = greatest(0, stock + p_delta)
   where id = p_material;
  perform set_config('app.lager_buchung', '', true);
  if not angesagt then
    perform set_config('app.lager_art', '', true);
  end if;
  -- Kein Fehler, wenn es den Artikel nicht gibt: Ad-hoc-Material hat keinen
  -- Katalogeintrag, und das ist erlaubt.
end;
$$;

-- ---------------------------------------------------------------------------
-- Wareneingang mit Lieferant, Lieferschein und Bezug (M29)
-- ---------------------------------------------------------------------------

create or replace function public.lager_eingang(
  p_material uuid, p_menge numeric, p_lieferant text, p_lieferschein text, p_bezug text
) returns numeric
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  artikel public.materials%rowtype;
  fehler text;
  neu numeric;
begin
  select * into artikel from public.materials where id = p_material for update;
  if artikel.id is null or not app.darf(artikel.company_id) then
    raise exception 'Diesen Artikel gibt es nicht' using errcode = '42501';
  end if;
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Den Wareneingang bucht die Verwaltung oder die Leitung' using errcode = '42501';
  end if;
  fehler := app.menge_fehler(p_menge, artikel.unit);
  if fehler is not null then
    raise exception '%', fehler using errcode = '23514';
  end if;
  if nullif(btrim(coalesce(p_lieferant, '')), '') is null then
    raise exception 'Von welchem Lieferanten kommt die Ware?' using errcode = '23514';
  end if;
  perform app.lager_kontext('eingang', null, btrim(p_lieferant),
    nullif(btrim(coalesce(p_lieferschein, '')), ''), nullif(btrim(coalesce(p_bezug, '')), ''), null);
  perform set_config('app.lager_buchung', 'ja', true);
  update public.materials set stock = stock + p_menge where id = p_material returning stock into neu;
  perform set_config('app.lager_buchung', '', true);
  perform app.lager_kontext_leeren();
  return neu;
end;
$$;

revoke all on function public.lager_eingang(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.lager_eingang(uuid, numeric, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Inventur: der gezählte Bestand, mit Grund (M28)
-- ---------------------------------------------------------------------------

create or replace function public.lager_inventur(p_material uuid, p_bestand numeric, p_grund text)
  returns numeric
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  artikel public.materials%rowtype;
  grund text := nullif(btrim(coalesce(p_grund, '')), '');
begin
  select * into artikel from public.materials where id = p_material for update;
  if artikel.id is null or not app.darf(artikel.company_id) then
    raise exception 'Diesen Artikel gibt es nicht' using errcode = '42501';
  end if;
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Die Inventur bucht die Verwaltung oder die Leitung' using errcode = '42501';
  end if;
  if grund is null then
    raise exception 'Ohne Grund keine Korrektur — etwa „Inventur 31.12.“ oder „Bruch“' using errcode = '23514';
  end if;
  if p_bestand is null or p_bestand < 0 then
    raise exception 'Der gezählte Bestand ist null oder mehr' using errcode = '23514';
  end if;
  if p_bestand > 0 and app.menge_fehler(p_bestand, artikel.unit) is not null then
    raise exception '%', app.menge_fehler(p_bestand, artikel.unit) using errcode = '23514';
  end if;

  if p_bestand = artikel.stock then
    -- Gezählt und gestimmt: auch das gehört ins Protokoll.
    insert into public.lagerbewegungen (
      company_id, material_id, art, menge, bestand_nachher, grund, erfasst_von, erfasst_von_name
    ) values (
      artikel.company_id, artikel.id, 'inventur', 0, artikel.stock, grund,
      auth.uid(), (select u.name from public.users u where u.id = auth.uid())
    );
    return artikel.stock;
  end if;

  perform app.lager_kontext('inventur', grund, null, null, null, null);
  perform set_config('app.lager_buchung', 'ja', true);
  update public.materials set stock = p_bestand where id = p_material;
  perform set_config('app.lager_buchung', '', true);
  perform app.lager_kontext_leeren();
  return p_bestand;
end;
$$;

revoke all on function public.lager_inventur(uuid, numeric, text) from public, anon;
grant execute on function public.lager_inventur(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Die Abläufe sagen an, was sie buchen
-- ---------------------------------------------------------------------------

create or replace function public.anforderung_abschliessen(p_order uuid)
  returns void
  language plpgsql
  security definer
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

  if not (app.betriebsmitglied(a.company_id) or app.support_schreibt(a.company_id))
     or not (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung()
             or a.user_id = auth.uid()) then
    return;
  end if;

  if a.processed then
    update public.material_orders set status = 'Erledigt' where id = p_order;
    return;
  end if;

  if a.transaction_type <> 'return' then
    katalog := coalesce(a.material_id, app.katalogeintrag(a.company_id, a.material_name));
    -- Mit Eigentümerrechten hält kein Zeilenschutz mehr einen Artikel eines
    -- anderen Betriebs fern; der Fremdschlüssel prüft nur, dass es ihn gibt.
    if katalog is not null and not exists (
      select 1 from public.materials m where m.id = katalog and m.company_id = a.company_id
    ) then
      katalog := null;
    end if;
    if katalog is not null then
      if a.beschaffung = 'einkauf' and a.geliefert_am is null then
        perform app.lager_kontext('eingang', null, null, null, 'Anforderung, beim Abholen geliefert', a.id);
        perform public.bestand_anpassen(katalog, coalesce(a.quantity, 0));
      end if;
      perform app.lager_kontext('entnahme', null, null, null,
        coalesce('Baustelle ' || nullif(a.project_number, ''), 'Anforderung') || ' · ' || coalesce(a.user_name, ''), a.id);
      perform public.bestand_anpassen(katalog, -coalesce(a.quantity, 0));
      perform app.lager_kontext_leeren();
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

create or replace function public.retoure_anlegen(p_beleg jsonb)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  neu uuid := coalesce((p_beleg ->> 'id')::uuid, gen_random_uuid());
  betrieb text := p_beleg ->> 'company_id';
  katalog uuid := nullif(p_beleg ->> 'material_id', '')::uuid;
begin
  if betrieb is null
     or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb))
     or (p_beleg ->> 'user_id') is null
     or (p_beleg ->> 'user_id')::uuid is distinct from auth.uid() then
    raise exception 'Eine Retoure legt man im eigenen Betrieb und auf den eigenen Namen an'
      using errcode = '42501';
  end if;

  -- Ein Katalogartikel eines anderen Betriebs bekäme sonst die Gutschrift.
  if katalog is not null and not exists (
    select 1 from public.materials m where m.id = katalog and m.company_id = betrieb
  ) then
    katalog := null;
  end if;

  if katalog is null and (p_beleg ->> 'condition') = 'neu' then
    katalog := app.katalogeintrag(betrieb, p_beleg ->> 'material_name');
  end if;

  insert into public.material_orders (
    id, company_id, material_id, material_name, quantity, note,
    project_number, status, is_urgent, transaction_type, condition,
    user_id, user_name, processed, source
  ) values (
    neu, betrieb, katalog, p_beleg ->> 'material_name',
    (p_beleg ->> 'quantity')::numeric, p_beleg ->> 'note',
    p_beleg ->> 'project_number', 'Erledigt',
    coalesce((p_beleg ->> 'is_urgent')::boolean, false), 'return',
    p_beleg ->> 'condition', (p_beleg ->> 'user_id')::uuid,
    p_beleg ->> 'user_name', true, p_beleg ->> 'source'
  );

  if katalog is not null and (p_beleg ->> 'condition') = 'neu' then
    perform app.lager_kontext('retoure', null, null, null,
      coalesce('Baustelle ' || nullif(p_beleg ->> 'project_number', ''), 'Retoure') || ' · ' || coalesce(p_beleg ->> 'user_name', ''), neu);
    perform public.bestand_anpassen(katalog, (p_beleg ->> 'quantity')::numeric);
    perform app.lager_kontext_leeren();
  end if;

  return neu;
end;
$$;

create or replace function public.einkauf_geliefert(p_ids uuid[])
  returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  p public.einkauf_posten%rowtype;
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
      perform app.lager_kontext('eingang', null,
        (select s.name from public.suppliers s where s.id = a.supplier_id), null,
        'Einkaufsliste · Anforderung' || coalesce(' Baustelle ' || nullif(a.project_number, ''), ''), a.id);
      perform public.bestand_anpassen(katalog, coalesce(a.quantity, 0));
      perform app.lager_kontext_leeren();
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

  for p in
    select * from public.einkauf_posten
     where id = any(p_ids)
       and geliefert_am is null
     order by id
     for update
  loop
    katalog := coalesce(p.material_id, app.katalogeintrag(p.company_id, p.material_name));
    if katalog is not null then
      perform app.lager_kontext('eingang', null,
        (select s.name from public.suppliers s where s.id = p.supplier_id), null, 'Einkaufsliste · fürs Lager', null);
      perform public.bestand_anpassen(katalog, p.menge);
      perform app.lager_kontext_leeren();
    end if;
    update public.einkauf_posten
       set geliefert_am = now(),
           bestellt_am = coalesce(bestellt_am, now()),
           material_id = coalesce(p.material_id, katalog)
     where id = p.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
