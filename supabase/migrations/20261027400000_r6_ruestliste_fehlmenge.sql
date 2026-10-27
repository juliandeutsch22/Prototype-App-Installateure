/*
  DIE FEHLMENGE DER RÜSTLISTE WIRD NICHT DOPPELT AUSGEGEBEN (Testbericht Runde 6, M5)

  WAS DER BERICHT FAND. Rüstliste 6 Pressfitting, „Im Lager fehlen 2“, die
  Anforderung über 2 entstand sofort — noch bevor der Einsatz gespeichert
  war. Die Verwaltung erfüllte sie „Aus Lager“, der Monteur lud die 6 ein
  (der Haken buchte 6 ab) und holte die 2 zusätzlich. Ausgegeben: 8 für 6.

  DIE URSACHE. Rüstliste und Anforderung wussten nichts voneinander. Die
  Rüstliste reservierte und buchte beim Einladen ihre ganze Menge, die
  Anforderung über die Fehlmenge reservierte und buchte beim Abholen noch
  einmal — dieselben 2 Stück zweimal. Auch „Aus Lager“ sah die 2 der
  Anforderung nicht als Teil der 6.

  WAS JETZT GILT — die Position teilt sich in zwei Wege:
  - Die Anforderung über die Fehlmenge entsteht beim SPEICHERN der Liste,
    im selben Zug (`ruestliste_speichern`, Position mit `anfordern`), und
    trägt die Position (`ruestliste_id`, `ruest_position`).
  - Was die verknüpften Anforderungen bringen (`app.ruest_angefordert`),
    kommt über deren Weg: reserviert, sobald sie zugesagt sind, gebucht beim
    Abholen. Die Rüstliste reserviert und bucht beim Einladen nur den Rest
    aus dem Regal (`ruest_reserviert`, `lager_frei`, `laden_umschalten`).
  - Damit sagt „Aus Lager“ für die Anforderung nur zu, was neben der
    Reservierung der Liste wirklich frei ist — dieselbe Prüfung wie bisher
    (`app.aus_lager_pruefen` über `app.lager_zugesagt`).
  - Was als „ausgegeben“ in den Rechnungsvorschlag geht
    (`ausgegebenes_material`), zählt die eingeladene Position ebenso nur
    mit ihrem Rest; die Anforderung steht dort schon selbst.
  - Wird die Anforderung gelöscht, zählt die Position wieder ganz.

  WAS GLEICH BLEIBT. Rüstlisten ohne Anforderung rechnen Wort für Wort wie
  bisher; ebenso alle Anforderungen, die keine Position tragen (auch alle,
  die vor dieser Fassung angelegt wurden — verknüpft wird nichts
  nachträglich). Reserviert wird weiter ab dem Einsatztag (Stand 30.09.2026,
  M32): eine Rüstliste für einen vergangenen Tag reserviert nichts mehr.

  OHNE FREMDSCHLÜSSEL. Eine Position, die aus der Liste genommen wird, lässt
  ihre Anforderung stehen; der Verweis zeigt dann ins Leere und zählt
  nirgends mehr. Ein Fremdschlüssel mit „set null“ müsste dafür Zeilen des
  Lagers ändern, auch verrechnete.

  Rümpfe der geänderten Funktionen wie zuletzt eingespielt
  (20261019400000_skalierung.sql, 20261006400000_einladen_zurueckgenommen.sql,
  20260929120000_support_arbeitet_mit.sql, 20261024100000_grenzen_material_und_lehrlinge.sql),
  geändert nur an den markierten Stellen.
*/

-- ---------------------------------------------------------------------------
-- 1. Die Verknüpfung
-- ---------------------------------------------------------------------------

alter table public.material_orders
  add column if not exists ruestliste_id uuid,
  add column if not exists ruest_position text;

comment on column public.material_orders.ruestliste_id is
  'Rüstliste (einsatz_material), deren Fehlmenge diese Anforderung bringt — Runde 6, M5';
comment on column public.material_orders.ruest_position is
  'Kennung der Position in dieser Rüstliste';

create index if not exists material_orders_ruestliste
  on public.material_orders (ruestliste_id, ruest_position) where ruestliste_id is not null;

/* Nur eine Liste des eigenen Betriebs — sonst minderte eine Anforderung fremde Reservierungen. */
create or replace function app.anforderung_ruestliste_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.ruestliste_id is null then
    new.ruest_position := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.ruestliste_id is not distinct from old.ruestliste_id
     and new.ruest_position is not distinct from old.ruest_position then
    return new;
  end if;
  if not exists (select 1 from public.einsatz_material e
                  where e.id = new.ruestliste_id and e.company_id = new.company_id) then
    raise exception 'Diese Rüstliste gibt es in diesem Betrieb nicht' using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function app.anforderung_ruestliste_pruefen() from public, anon, authenticated;

drop trigger if exists material_orders_ruestliste on public.material_orders;
create trigger material_orders_ruestliste
  before insert or update of ruestliste_id, ruest_position on public.material_orders
  for each row execute function app.anforderung_ruestliste_pruefen();

/* Was die Anforderungen zu einer Position bringen — gleich, wie weit sie sind. */
create or replace function app.ruest_angefordert(p_liste uuid, p_position text)
  returns numeric
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(sum(o.quantity), 0)
    from public.material_orders o
   where o.ruestliste_id = p_liste
     and o.ruest_position = p_position
     and o.transaction_type = 'order'
$$;

revoke all on function app.ruest_angefordert(uuid, text) from public, anon;
grant execute on function app.ruest_angefordert(uuid, text) to authenticated;

/*
  FÜR DIE ANSICHT: je Position der genannten Listen die angeforderte Menge.
  Mit Eigentümerrechten, weil der Monteur von den Anforderungen nur die
  eigenen liest — er soll an seiner Rüstliste trotzdem sehen, dass zwei
  Stück über eine Anforderung kommen.
*/
create or replace function public.ruest_angefordert(p_listen uuid[])
  returns table (einsatz_material_id uuid, position_id text, menge numeric)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select o.ruestliste_id, o.ruest_position, sum(o.quantity)
    from public.material_orders o
    join public.einsatz_material e on e.id = o.ruestliste_id
   where o.ruestliste_id = any (coalesce(p_listen, '{}'))
     and o.transaction_type = 'order'
     and e.company_id = (select app.lesebetrieb())
     and o.company_id = e.company_id
   group by o.ruestliste_id, o.ruest_position
$$;

revoke all on function public.ruest_angefordert(uuid[]) from public, anon;
grant execute on function public.ruest_angefordert(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reservieren: nur der Rest aus dem Regal
-- ---------------------------------------------------------------------------

create or replace function app.ruest_reserviert(p_material uuid)
  returns numeric
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(sum(greatest(p.menge - app.ruest_angefordert(e.id, p.id), 0)), 0)
    from public.einsatz_material_positionen p
    join public.einsatz_material e on e.id = p.einsatz_material_id
   where p.material_id = p_material
     and e.date >= (now() at time zone 'Europe/Vienna')::date
     and not coalesce((e.geladen -> p.id) ? 'gebucht', false)
$$;
revoke all on function app.ruest_reserviert(uuid) from public, anon;
grant execute on function app.ruest_reserviert(uuid) to authenticated;

-- Dieselbe Rechnung in der Übersicht des Lagers.
create or replace function public.lager_frei(p_ids uuid[] DEFAULT NULL::uuid[])
  returns TABLE(material_id uuid, bestand numeric, zugesagt numeric, geplant numeric, frei numeric)
  language sql
  stable
  security definer
  set search_path = ''
AS $$
  with artikel as (
    select m.id, m.stock
      from public.materials m
     where p_ids is not null
       and m.id = any (p_ids)
       and m.company_id = (select app.betrieb())
       and (select app.darf(app.betrieb()))
    union all
    select m.id, m.stock
      from public.materials m
     where p_ids is null
       and m.company_id = (select app.betrieb())
       and (select app.darf(app.betrieb()))
  ),
  zusage as (
    select o.material_id, sum(o.quantity) as menge
      from public.material_orders o
     where o.company_id = (select app.betrieb())
       and o.material_id is not null
       and (p_ids is null or o.material_id = any (p_ids))
       and o.transaction_type = 'order'
       and not o.processed
       and (o.beschaffung = 'lager'
            or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
            or (o.beschaffung is null and o.status = 'Abholbereit'))
     group by o.material_id
  ),
  plan as (
    -- Was eine Anforderung zu dieser Position bringt, reserviert die Anforderung (M5).
    select p.material_id, sum(greatest(p.menge - app.ruest_angefordert(e.id, p.id), 0)) as menge
      from public.einsatz_material_positionen p
      join public.einsatz_material e on e.id = p.einsatz_material_id
     where e.company_id = (select app.betrieb())
       and p.material_id is not null
       and (p_ids is null or p.material_id = any (p_ids))
       and e.date >= (now() at time zone 'Europe/Vienna')::date
       and not coalesce((e.geladen -> p.id) ? 'gebucht', false)
     group by p.material_id
  )
  select a.id,
         a.stock,
         coalesce(z.menge, 0),
         coalesce(pl.menge, 0),
         a.stock - coalesce(z.menge, 0) - coalesce(pl.menge, 0)
    from artikel a
    left join zusage z on z.material_id = a.id
    left join plan pl on pl.material_id = a.id
   -- Feste Reihenfolge: wer ohne Liste seitenweise fragt, verliert keine Zeile.
   order by a.id
$$;

revoke all on function public.lager_frei(uuid[]) from public, anon;
grant execute on function public.lager_frei(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Einladen: nur der Rest aus dem Regal
-- ---------------------------------------------------------------------------

create or replace function public.laden_umschalten(p_datum date, p_baustelle text, p_position text, p_an boolean, p_von text)
  returns numeric
  language plpgsql
  security definer
  set search_path = ''
AS $$
declare
  betrieb text := app.arbeitsbetrieb();
  heute date := (now() at time zone 'Europe/Vienna')::date;
  kopf public.einsatz_material;
  pos public.einsatz_material_positionen;
  artikel public.materials;
  eintrag jsonb;
  gebucht numeric(12,3) := 0;
  material uuid;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  select * into kopf from public.einsatz_material
   where company_id = betrieb and date = p_datum and project_number = p_baustelle
   for update;
  if kopf.id is null then
    raise exception 'Für diesen Einsatz gibt es keine Rüstliste'
      using errcode = 'P0002';
  end if;
  if not (app.ist_dienst() or app.ist_fuehrung() or auth.uid() = any(kopf.uids)) then
    raise exception 'Abhaken darf nur, wer für diesen Einsatz eingeteilt ist'
      using errcode = '42501';
  end if;

  eintrag := kopf.geladen -> p_position;

  if p_an then
    -- Schon eingeladen: nichts doppelt buchen.
    if eintrag is not null then
      return 0;
    end if;
    select * into pos from public.einsatz_material_positionen
     where id = p_position and einsatz_material_id = kopf.id;
    if pos.material_id is not null then
      select * into artikel from public.materials
       where id = pos.material_id and company_id = betrieb;
      if artikel.id is not null and artikel.lagerartikel then
        /*
          NUR DER TEIL AUS DEM REGAL (Runde 6, M5): was eine Anforderung zu
          dieser Position bringt, bucht deren Abholung. Vorher buchte der
          Haken die ganze Menge — und die Abholung der Fehlmenge noch einmal.
        */
        gebucht := least(greatest(coalesce(pos.menge, 0) - app.ruest_angefordert(kopf.id, pos.id), 0),
                         greatest(artikel.stock, 0));
        if gebucht > 0 then
          perform app.lager_kontext('entnahme',
            'Rüstliste ' || to_char(p_datum, 'DD.MM.YYYY') || ' · eingeladen von ' || coalesce(nullif(btrim(p_von), ''), '—'),
            null, null, 'Baustelle ' || p_baustelle, null);
          perform public.bestand_anpassen(artikel.id, -gebucht);
          perform app.lager_kontext_leeren();
          material := artikel.id;
        end if;
      end if;
    end if;
    update public.einsatz_material
       set geladen = geladen || jsonb_build_object(
             p_position,
             jsonb_build_object('von', p_von, 'am', (extract(epoch from now()) * 1000)::bigint)
               || case when gebucht > 0
                       then jsonb_build_object('gebucht', gebucht, 'material', material)
                       else '{}'::jsonb end)
     where id = kopf.id;
    return gebucht;
  end if;

  if eintrag is null then
    return 0;
  end if;
  /*
    NUR AM SELBEN TAG. Später ist das Material längst im Bus oder verbaut;
    was übrig bleibt, kommt über die Retoure zurück — mit Menge und Grund.
  */
  if eintrag ? 'am'
     and (to_timestamp((eintrag ->> 'am')::numeric / 1000) at time zone 'Europe/Vienna')::date <> heute
     and not app.ist_dienst() then
    raise exception 'Eingeladen lässt sich nur am selben Tag zurücknehmen. Was übrig bleibt, geht über die Retoure zurück.'
      using errcode = '55000';
  end if;
  gebucht := coalesce((eintrag ->> 'gebucht')::numeric, 0);
  material := nullif(eintrag ->> 'material', '')::uuid;
  if gebucht > 0 and material is not null
     and exists (select 1 from public.materials m where m.id = material and m.company_id = betrieb) then
    -- Eine eigene Art, keine „Retoure“ (G15): das Material war nie auf der Baustelle.
    perform app.lager_kontext('einladen_zurueck',
      'Rüstliste ' || to_char(p_datum, 'DD.MM.YYYY') || ' · eingeladen zurückgenommen',
      null, null, 'Baustelle ' || p_baustelle, null);
    perform public.bestand_anpassen(material, gebucht);
    perform app.lager_kontext_leeren();
  else
    gebucht := 0;
  end if;
  update public.einsatz_material set geladen = geladen - p_position where id = kopf.id;
  return gebucht;
end;
$$;

revoke all on function public.laden_umschalten(date, text, text, boolean, text) from public, anon;
grant execute on function public.laden_umschalten(date, text, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Speichern: die Anforderung im selben Zug
-- ---------------------------------------------------------------------------

create or replace function public.ruestliste_speichern(p_datum date, p_baustelle text, p_positionen jsonb, p_uids uuid[], p_von text)
  returns uuid
  language plpgsql
  set search_path = ''
AS $$
declare
  betrieb text := app.arbeitsbetrieb();
  kopf uuid;
  pos jsonb;
  behalten text[];
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  select e.id into kopf from public.einsatz_material e
   where e.company_id = betrieb and e.date = p_datum and e.project_number = p_baustelle;

  if jsonb_array_length(p_positionen) = 0 then
    if kopf is not null then delete from public.einsatz_material where id = kopf; end if;
    return null;
  end if;

  if kopf is null then
    insert into public.einsatz_material (company_id, date, project_number, uids, geladen, updated_by)
         values (betrieb, p_datum, p_baustelle, coalesce(p_uids, '{}'), '{}'::jsonb, p_von)
      returning id into kopf;
  else
    update public.einsatz_material
       set uids = coalesce(p_uids, uids), updated_by = p_von
     where id = kopf;
  end if;

  select coalesce(array_agg(p ->> 'id'), '{}')
    into behalten
    from jsonb_array_elements(p_positionen) p;

  delete from public.einsatz_material_positionen
   where einsatz_material_id = kopf and not (id = any(behalten));

  for pos in select * from jsonb_array_elements(p_positionen) loop
    insert into public.einsatz_material_positionen (
      id, company_id, einsatz_material_id, position, material_id, name, menge, einheit
    ) values (
      pos ->> 'id', betrieb, kopf,
      coalesce((pos ->> 'position')::integer, 0),
      nullif(pos ->> 'material_id', '')::uuid,
      pos ->> 'name', (pos ->> 'menge')::numeric, pos ->> 'einheit'
    )
    -- Das PAAR aus Liste und Kennung, nicht die Kennung allein. Sonst
    -- aktualisiert dieselbe Kennung aus einer anderen Liste deren Zeile und
    -- diese Liste bleibt leer.
    on conflict (einsatz_material_id, id) do update
       set position = excluded.position, material_id = excluded.material_id,
           name = excluded.name, menge = excluded.menge, einheit = excluded.einheit;

    /*
      DIE ANFORDERUNG ÜBER DIE FEHLMENGE ENTSTEHT MIT DER LISTE (Runde 6, M5):
      im selben Zug, mit der Position verknüpft. Vorher entstand sie beim
      Tipp auf den Knopf, noch bevor der Einsatz gespeichert war, und wusste
      nichts von der Liste. Angelegt wird mit den Rechten dessen, der plant —
      dieselbe Regel wie bisher (`material_orders_anlegen`).
    */
    if coalesce((pos -> 'anfordern' ->> 'menge')::numeric, 0) > 0 then
      insert into public.material_orders (
        id, company_id, material_id, material_name, quantity, note, project_number,
        status, transaction_type, user_id, user_name, ruestliste_id, ruest_position
      ) values (
        gen_random_uuid(), betrieb, nullif(pos ->> 'material_id', '')::uuid, pos ->> 'name',
        (pos -> 'anfordern' ->> 'menge')::numeric, nullif(pos -> 'anfordern' ->> 'note', ''), p_baustelle,
        'Offen', 'order', (pos -> 'anfordern' ->> 'user_id')::uuid, pos -> 'anfordern' ->> 'user_name',
        kopf, pos ->> 'id'
      );
    end if;
  end loop;

  update public.einsatz_material
     set geladen = (
       select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
         from jsonb_each(geladen) as g(k, v)
        where k = any(behalten))
   where id = kopf;

  return kopf;
end;
$$;

revoke all on function public.ruestliste_speichern(date, text, jsonb, uuid[], text) from public, anon;
grant execute on function public.ruestliste_speichern(date, text, jsonb, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Ausgegeben: die Position ohne den Teil der Anforderung
-- ---------------------------------------------------------------------------

create or replace function public.ausgegebenes_material(p_baustelle text, p_bis date DEFAULT NULL::date)
  returns TABLE(art text, beleg_id text, datum date, material_id uuid, name text, einheit text, menge numeric)
  language plpgsql
  stable
  security definer
  set search_path = ''
AS $$
#variable_conflict use_column
declare
  betrieb text := app.betrieb();
  schluessel text := regexp_replace(trim(coalesce(p_baustelle, '')), '^PR-', '', 'i');
  grenze date;
begin
  if not (app.betriebsmitglied(betrieb) and app.ist_buch_oder_spitze()) then
    raise exception 'Ausgegebenes Material sieht nur, wer Rechnungen schreibt' using errcode = '42501';
  end if;
  if schluessel = '' then
    return;
  end if;

  select max(coalesce(i.leistung_bis, i.invoice_date)) into grenze
    from public.invoices i
   where i.company_id = betrieb
     and i.payment_status <> 'Storniert'
     and i.art <> 'anzahlung'
     and regexp_replace(trim(coalesce(i.project_number, '')), '^PR-', '', 'i') = schluessel;

  return query
  with ausgaben as (
    select 'anforderung'::text as art, o.id::text as beleg_id,
           (coalesce(o.erledigt_am, o.updated_at) at time zone 'Europe/Vienna')::date as datum,
           o.material_id, o.material_name as name, m.unit as einheit, o.quantity as menge
      from public.material_orders o
      left join public.materials m on m.id = o.material_id and m.company_id = o.company_id
     where o.company_id = betrieb
       and o.transaction_type = 'order'
       and o.status = 'Erledigt'
       and regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i') = schluessel
    union all
    select 'retoure'::text, o.id::text,
           (o.created_at at time zone 'Europe/Vienna')::date,
           o.material_id, o.material_name, m.unit, -o.quantity
      from public.material_orders o
      left join public.materials m on m.id = o.material_id and m.company_id = o.company_id
     where o.company_id = betrieb
       and o.transaction_type = 'return'
       and regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i') = schluessel
    union all
    -- Ohne den Teil, den eine Anforderung bringt — der steht oben als „anforderung“ (M5).
    select 'ruestliste'::text, p.id, k.date,
           p.material_id, p.name, coalesce(nullif(p.einheit, ''), m.unit),
           greatest(p.menge - app.ruest_angefordert(k.id, p.id), 0)
      from public.einsatz_material k
      join public.einsatz_material_positionen p on p.einsatz_material_id = k.id
      left join public.materials m on m.id = p.material_id and m.company_id = k.company_id
     where k.company_id = betrieb
       and regexp_replace(trim(k.project_number), '^PR-', '', 'i') = schluessel
       and k.geladen ? p.id::text
  )
  select a.art, a.beleg_id, a.datum, a.material_id, a.name, a.einheit, a.menge
    from ausgaben a
   where a.menge <> 0
     and (grenze is null or a.datum > grenze)
     and (p_bis is null or a.datum <= p_bis)
   order by a.datum, a.name, a.beleg_id;
end;
$$;

revoke all on function public.ausgegebenes_material(text, date) from public, anon;
grant execute on function public.ausgegebenes_material(text, date) to authenticated;
