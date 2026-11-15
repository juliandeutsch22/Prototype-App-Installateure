/*
  M3 / F10 (Durchsicht 15.11.2026): VERBRAUCH AM SCHEIN BUCHT DAS LAGER.

  WAS FALSCH WAR. Der Schein bewegt keinen Bestand — das ist begründet (kein
  Doppelabzug: was über eine Anforderung kam, hat die Abholung abgebucht).
  Es fehlte der Gegenweg für Verbrauch, der NICHT über eine Anforderung kam:
  Pressfittings aus dem eigenen Fahrzeug, ein Griff ins Regal ohne
  Anforderung. „Mein Fahrzeug“ zeigte nach zwei Wochen Reparaturen noch die
  umgelagerten 20 Stück; herunter ging die Zahl nur über eine Inventur.

  WIE ES JETZT IST. Nach dem Unterschreiben bietet der Schein die Differenz
  „auf dem Schein, aber nicht ausgegeben“ zur Entnahme an — je Lagerartikel,
  aus dem Hauptlager oder einem Fahrzeug (der Monteur aus seinem eigenen, das
  Lager aus jedem):
    nicht ausgegeben = auf diesem Schein − max(0, frei)
    frei = für die Baustelle ausgegeben (abgeholte Anforderungen,
           eingeladene Rüstlisten, schon am Schein gebuchter Verbrauch)
           − zurück − auf den anderen unterschriebenen Scheinen der Baustelle.
  Wer bucht, entscheidet je Zeile: abbuchen von wo, oder nicht (beim Händler
  gekauft). Entschieden wird einmal je Schein (`schein_verbrauch`, mit den
  Buchungen); danach fragt der Schein nicht mehr. Die Entnahme steht im
  Bewegungsprotokoll mit Grund „Schein …“; gebucht wird höchstens, was am Ort
  liegt (wie beim Abhaken der Rüstliste).

  RECHNUNG: unberührt — das Material steht auf dem Schein und kommt mit ihm.
  Die Retoure (M7) zählt den gebuchten Verbrauch als ausgegeben: was vom
  Fahrzeug auf die Baustelle ging, kann von dort zurückkommen.

  RECHTE: anbieten und buchen darf, wer den Schein angelegt hat, und das Lager
  (Verwaltung) und die Führung. Lesen der Tabelle: Verwaltung, Buchhaltung,
  Führung, und der Ersteller des Scheins; schreiben nur über die Funktion.
  DATENSCHUTZ: keine Personendaten in der Tabelle (wer gebucht hat, steht wie
  bei jeder Entnahme im Bewegungsprotokoll). Der Auszug des Betriebs nimmt
  sie von selbst mit (`app.auszug_tabellen`).
  ALTE APP: unberührt; sie bietet nichts an, und ein Schein ohne Entscheidung
  bietet die Buchung in der neuen App an, sobald er geöffnet wird.
*/

create table if not exists public.schein_verbrauch (
  id uuid primary key default gen_random_uuid(),
  -- Eine Entscheidung je Schein.
  work_sheet_id uuid not null unique references public.work_sheets (id) on delete cascade,
  company_id text not null references public.companies (id),
  entschieden_am timestamptz not null default now(),
  -- [{material_id, ort_id|null, menge}] — was wirklich abgebucht wurde.
  buchungen jsonb not null default '[]'::jsonb check (jsonb_typeof(buchungen) = 'array')
);

create index if not exists schein_verbrauch_betrieb on public.schein_verbrauch (company_id);

alter table public.schein_verbrauch enable row level security;

drop policy if exists schein_verbrauch_lesen on public.schein_verbrauch;
create policy schein_verbrauch_lesen on public.schein_verbrauch
  for select
  using (
    (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()))
    and ((select app.hat_rolle(array['Verwaltung', 'Buchhaltung'])) or (select app.ist_fuehrung())
         or exists (select 1 from public.work_sheets w
                     where w.id = work_sheet_id and w.erstellt_von_uid = (select auth.uid())))
  );

drop trigger if exists schein_verbrauch_kein_support_schreiben on public.schein_verbrauch;
create trigger schein_verbrauch_kein_support_schreiben
  before insert or update or delete on public.schein_verbrauch
  for each row execute function app.support_schreibt_nicht();

grant select on public.schein_verbrauch to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Was ein Schein trägt, ohne dass es ausgegeben wurde
-- ---------------------------------------------------------------------------

create or replace function app.schein_verbrauch_rechnen(p_schein uuid)
  returns table (material_id uuid, name text, einheit text, auf_schein numeric, frei numeric, vorschlag numeric)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with s as (
    select w.* from public.work_sheets w where w.id = p_schein and w.status = 'Unterschrieben'
  ),
  zeilen as (
    select wm.material_id, sum(wm.menge) as menge
      from public.work_sheet_material wm
      join s on s.id = wm.work_sheet_id
      join public.materials m on m.id = wm.material_id and m.company_id = s.company_id and m.lagerartikel
     where wm.material_id is not null and wm.menge > 0
     group by wm.material_id
  ),
  stand as (
    select z.material_id, z.menge,
      -- abgeholte Anforderungen
      (select coalesce(sum(o.quantity), 0) from public.material_orders o, s
        where o.company_id = s.company_id and o.transaction_type = 'order' and o.status = 'Erledigt'
          and o.material_id = z.material_id
          and app.baustelle_wie_js(o.project_number) = app.baustelle_wie_js(s.project_number))
      -- eingeladene Rüstlisten (ohne den Teil der Anforderung)
      + (select coalesce(sum(greatest(p.menge - app.ruest_angefordert(k.id, p.id), 0)), 0)
           from public.einsatz_material k
           join public.einsatz_material_positionen p on p.einsatz_material_id = k.id, s
          where k.company_id = s.company_id and k.geladen ? p.id and p.material_id = z.material_id
            and app.baustelle_wie_js(k.project_number) = app.baustelle_wie_js(s.project_number))
      -- schon an anderen Scheinen der Baustelle gebuchter Verbrauch
      + (select coalesce(sum((b ->> 'menge')::numeric), 0)
           from public.schein_verbrauch v
           join public.work_sheets w on w.id = v.work_sheet_id, s,
                jsonb_array_elements(v.buchungen) b
          where v.company_id = s.company_id and w.id <> s.id
            and app.baustelle_wie_js(w.project_number) = app.baustelle_wie_js(s.project_number)
            and (b ->> 'material_id')::uuid = z.material_id)
      -- zurück
      - (select coalesce(sum(o.quantity), 0) from public.material_orders o, s
          where o.company_id = s.company_id and o.transaction_type = 'return'
            and o.material_id = z.material_id
            and app.baustelle_wie_js(o.project_number) = app.baustelle_wie_js(s.project_number))
      -- auf den anderen unterschriebenen Scheinen
      - (select coalesce(sum(wm.menge), 0)
           from public.work_sheet_material wm
           join public.work_sheets w on w.id = wm.work_sheet_id, s
          where w.company_id = s.company_id and w.status = 'Unterschrieben' and w.id <> s.id
            and wm.material_id = z.material_id
            and app.baustelle_wie_js(w.project_number) = app.baustelle_wie_js(s.project_number))
      as frei
      from zeilen z
  )
  select st.material_id, m.name, coalesce(nullif(btrim(m.unit), ''), 'Stk'), st.menge, st.frei,
         greatest(st.menge - greatest(st.frei, 0), 0)
    from stand st
    join public.materials m on m.id = st.material_id
   order by m.name, st.material_id
$$;

revoke all on function app.schein_verbrauch_rechnen(uuid) from public, anon, authenticated;

/* Wer anbieten und buchen darf: der Ersteller des Scheins, das Lager, die Führung. */
create or replace function app.schein_verbrauch_darf(p_schein uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.work_sheets w
     where w.id = p_schein
       and w.company_id = (select app.lesebetrieb())
       and (w.erstellt_von_uid = (select auth.uid())
            or (select app.hat_rolle(array['Verwaltung'])) or (select app.ist_fuehrung())))
$$;

revoke all on function app.schein_verbrauch_darf(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Anbieten
-- ---------------------------------------------------------------------------

/*
  Antwort: {entschieden, gebucht: [{material_id, name, ort, menge}] (nach der
  Entscheidung), zeilen: [{material_id, name, einheit, auf_schein,
  vorschlag}] (nur mit Vorschlag über null), orte: [{id, name}] — die
  Fahrzeuge, aus denen der Aufrufer buchen darf}. Ein Schein, der nicht
  unterschrieben ist oder den der Aufrufer nicht buchen darf: null.
*/
create or replace function public.schein_verbrauch_vorschlag(p_schein uuid)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.lesebetrieb();
  v public.schein_verbrauch;
  lager boolean := app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung();
begin
  if betrieb is null or not app.schein_verbrauch_darf(p_schein)
     or not exists (select 1 from public.work_sheets w where w.id = p_schein and w.status = 'Unterschrieben') then
    return null;
  end if;
  select * into v from public.schein_verbrauch x where x.work_sheet_id = p_schein;
  if v.work_sheet_id is not null then
    return jsonb_build_object(
      'entschieden', true,
      'gebucht', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'material_id', b ->> 'material_id', 'name', m.name,
                 'einheit', coalesce(nullif(btrim(m.unit), ''), 'Stk'),
                 'ort', app.ort_name(betrieb, nullif(b ->> 'ort_id', '')::uuid),
                 'menge', (b ->> 'menge')::numeric) order by m.name)
          from jsonb_array_elements(v.buchungen) b
          join public.materials m on m.id = (b ->> 'material_id')::uuid), '[]'::jsonb),
      'zeilen', '[]'::jsonb,
      'orte', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'entschieden', false,
    'gebucht', '[]'::jsonb,
    'zeilen', coalesce((
      select jsonb_agg(jsonb_build_object(
               'material_id', r.material_id, 'name', r.name, 'einheit', r.einheit,
               'auf_schein', r.auf_schein, 'vorschlag', r.vorschlag))
        from app.schein_verbrauch_rechnen(p_schein) r
       where r.vorschlag > 0), '[]'::jsonb),
    'orte', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.bezeichnung) order by o.bezeichnung)
        from public.lagerorte o
        join public.fahrzeuge f on f.id = o.fahrzeug_id
       where o.company_id = betrieb and o.art = 'fahrzeug' and o.aktiv
         and app.modul_aktiv(betrieb, 'material.lagerorte_fahrzeuglager')
         and (lager or f.standardfahrer_uid = (select auth.uid()))), '[]'::jsonb));
end;
$$;

revoke all on function public.schein_verbrauch_vorschlag(uuid) from public, anon;
grant execute on function public.schein_verbrauch_vorschlag(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Buchen (oder bewusst nicht)
-- ---------------------------------------------------------------------------

/*
  `p_zeilen`: [{material_id, menge, ort_id|null}] — leer heißt „nichts
  abbuchen“ (entschieden). Je Zeile höchstens der Vorschlag; aus einem
  Fahrzeug nur, wer es fährt (oder das Lager/die Führung). Gebucht wird
  höchstens, was am Ort liegt. Antwort: {ergebnis: 'gebucht', gebucht: […]}
  oder {ergebnis: 'schon'} (inzwischen entschieden).
*/
create or replace function public.schein_verbrauch_buchen(p_schein uuid, p_zeilen jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.lesebetrieb();
  s public.work_sheets;
  z record;
  r record;
  ort public.lagerorte;
  gebucht numeric;
  buchungen jsonb := '[]'::jsonb;
  lager boolean := app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung();
begin
  select * into s from public.work_sheets w where w.id = p_schein for update;
  if s.id is null or not app.schein_verbrauch_darf(p_schein) then
    raise exception 'Den Verbrauch dieses Scheins bucht, wer ihn angelegt hat, oder das Lager' using errcode = '42501';
  end if;
  if s.status <> 'Unterschrieben' then
    raise exception 'Verbrauch wird nach dem Unterschreiben gebucht' using errcode = '55000';
  end if;
  if exists (select 1 from public.schein_verbrauch v where v.work_sheet_id = p_schein) then
    return jsonb_build_object('ergebnis', 'schon');
  end if;
  if p_zeilen is null or jsonb_typeof(p_zeilen) <> 'array' then
    raise exception 'Die Zeilen sind eine Liste' using errcode = '22023';
  end if;

  for z in select * from jsonb_to_recordset(p_zeilen) as x(material_id uuid, menge numeric, ort_id uuid) loop
    select * into r from app.schein_verbrauch_rechnen(p_schein) q where q.material_id = z.material_id;
    if r.material_id is null or coalesce(z.menge, 0) <= 0 or z.menge > r.vorschlag then
      raise exception 'Abgebucht wird höchstens, was der Schein über das Ausgegebene hinaus trägt (%: %)',
        coalesce(r.name, 'unbekannter Artikel'), trim_scale(coalesce(r.vorschlag, 0))
        using errcode = '23514';
    end if;
    ort := app.ort_pruefen(betrieb, z.ort_id, true);
    if ort.id is not null then
      if ort.art <> 'fahrzeug' then
        raise exception 'Abgebucht wird aus dem Hauptlager oder aus einem Fahrzeug' using errcode = '22023';
      end if;
      if not (lager or app.eigenes_fahrzeug(ort.id)) then
        raise exception 'Aus diesem Fahrzeug bucht, wer es fährt — oder das Lager' using errcode = '42501';
      end if;
      perform app.lagerort_wahl_pruefen(betrieb);
    end if;

    perform app.lager_kontext('entnahme',
      'Schein ' || to_char(s.datum, 'DD.MM.YYYY') || ' · Verbrauch ohne Anforderung',
      null, null, 'Baustelle ' || s.project_number, null);
    if ort.id is null then
      gebucht := least(z.menge, greatest((select m.stock from public.materials m where m.id = z.material_id), 0));
      if gebucht > 0 then
        perform public.bestand_anpassen(z.material_id, -gebucht);
      end if;
    else
      gebucht := least(z.menge, greatest(app.ort_sperren(ort.id, z.material_id), 0));
      if gebucht > 0 then
        perform app.ort_anpassen(ort.id, z.material_id, -gebucht, true);
      end if;
    end if;
    perform app.lager_kontext_leeren();
    if gebucht > 0 then
      buchungen := buchungen || jsonb_build_array(jsonb_build_object(
        'material_id', z.material_id, 'ort_id', ort.id, 'menge', gebucht));
    end if;
  end loop;

  insert into public.schein_verbrauch (work_sheet_id, company_id, buchungen)
  values (p_schein, s.company_id, buchungen);
  return jsonb_build_object('ergebnis', 'gebucht', 'gebucht', buchungen);
end;
$$;

revoke all on function public.schein_verbrauch_buchen(uuid, jsonb) from public, anon;
grant execute on function public.schein_verbrauch_buchen(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Die Retoure zählt gebuchten Verbrauch als ausgegeben
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20261116060500_retoure_annahme.sql; neu ist der am Schein
  gebuchte Verbrauch im Ausgegebenen (nur mit Katalogartikel — gebucht wird
  nur für Lagerartikel).
*/
create or replace function app.retoure_rahmen_rechnen(
  p_betrieb text, p_baustelle text, p_material uuid, p_name text
) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  schluessel text := app.baustelle_wie_js(p_baustelle);
  artikelname text := lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
  ausgegeben numeric;
  zurueck numeric;
  nummern text[];
  verrechnet boolean;
  vom_schein numeric := 0;
begin
  with ausgaben as (
    select o.quantity as menge,
           o.is_billed or app.ausgabe_alt_abgerechnet(p_betrieb, o.project_number,
             (coalesce(o.erledigt_am, o.updated_at) at time zone 'Europe/Vienna')::date, o.erledigt_am) is not null as verr,
           nullif(o.invoice_number, '') as nummer
      from public.material_orders o
     where o.company_id = p_betrieb
       and o.transaction_type = 'order'
       and o.status = 'Erledigt'
       and app.baustelle_wie_js(o.project_number) = schluessel
       and ((p_material is not null and o.material_id = p_material)
            or ((p_material is null or o.material_id is null)
                and lower(regexp_replace(btrim(o.material_name), '\s+', ' ', 'g')) = artikelname))
    union all
    select greatest(p.menge - app.ruest_angefordert(k.id, p.id), 0),
           exists (select 1 from public.invoice_coverage c join public.invoices i on i.id = c.invoice_id
                    where c.company_id = p_betrieb and c.art = 'ruest_position' and c.ziel_id = p.beleg_id
                      and i.payment_status <> 'Storniert')
           or app.ausgabe_alt_abgerechnet(p_betrieb, k.project_number, k.date,
                case when jsonb_typeof(k.geladen -> p.id -> 'am') = 'number'
                     then to_timestamp((k.geladen -> p.id ->> 'am')::numeric / 1000) end) is not null,
           (select i.invoice_number from public.invoice_coverage c join public.invoices i on i.id = c.invoice_id
             where c.company_id = p_betrieb and c.art = 'ruest_position' and c.ziel_id = p.beleg_id
               and i.payment_status <> 'Storniert' limit 1)
      from public.einsatz_material k
      join public.einsatz_material_positionen p on p.einsatz_material_id = k.id
     where k.company_id = p_betrieb
       and app.baustelle_wie_js(k.project_number) = schluessel
       and k.geladen ? p.id
       and ((p_material is not null and p.material_id = p_material)
            or ((p_material is null or p.material_id is null)
                and lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = artikelname))
  )
  select coalesce(sum(a.menge), 0), coalesce(bool_or(a.verr), false),
         array_remove(array_agg(distinct a.nummer), null)
    into ausgegeben, verrechnet, nummern
    from ausgaben a;

  -- NEU (M3): am Schein gebuchter Verbrauch dieser Baustelle.
  if p_material is not null then
    select coalesce(sum((b ->> 'menge')::numeric), 0) into vom_schein
      from public.schein_verbrauch v
      join public.work_sheets w on w.id = v.work_sheet_id,
           jsonb_array_elements(v.buchungen) b
     where v.company_id = p_betrieb
       and app.baustelle_wie_js(w.project_number) = schluessel
       and (b ->> 'material_id')::uuid = p_material;
  end if;
  ausgegeben := ausgegeben + vom_schein;

  select coalesce(sum(o.quantity), 0) into zurueck
    from public.material_orders o
   where o.company_id = p_betrieb
     and o.transaction_type = 'return'
     and app.baustelle_wie_js(o.project_number) = schluessel
     and ((p_material is not null and o.material_id = p_material)
          or ((p_material is null or o.material_id is null)
              and lower(regexp_replace(btrim(o.material_name), '\s+', ' ', 'g')) = artikelname));

  return jsonb_build_object(
    'ausgegeben', ausgegeben,
    'zurueck', zurueck,
    'hoechstens', greatest(ausgegeben - zurueck, 0),
    'verrechnet', verrechnet,
    'rechnungen', to_jsonb(coalesce(nummern, '{}'::text[])));
end;
$$;

revoke all on function app.retoure_rahmen_rechnen(text, text, uuid, text) from public, anon, authenticated;
