/*
  M8 (Durchsicht 15.11.2026): KLEINE LÜCKEN IM MATERIAL — JE TEILPUNKT.

  1. EINE FREIE ZEILE MIT KOMMAMENGE BLOCKIERTE „ABGEHOLT“. Beim Abholen und
     Liefern bekommt eine frei getippte Anforderung den Katalogartikel
     gleichen Namens (`app.katalogeintrag`); die Mengenprüfung je Einheit
     wies dann „2,5“ für einen Artikel in „Stk“ ab — jedes Mal, auch „beim
     Händler mitgenommen“. Ausweg war nur Löschen und neu Anfordern. Jetzt
     bekommt die Zeile den Artikel nur, wenn ihre Menge zu seiner Einheit
     passt (`app.katalogeintrag_passend`); sonst bleibt sie eine freie Zeile
     und wird ohne Bestandsbuchung abgeschlossen — wie jede freie Zeile ohne
     Katalogeintrag.
  2. MENGEN OHNE EINHEIT. Anforderungen trugen keine Einheit; bei „Rohr ×30“
     wusste das Lager nicht, ob Meter oder Stangen. Jetzt `einheit` an der
     Anforderung: beim Katalogartikel aus dem Artikel (die Datenbank setzt
     sie, auch für die alte App), bei der freien Zeile, was der Monteur
     angibt.
  3. EINKAUFSPREIS ZUM ZEITPUNKT DER AUSGABE. Die Nachkalkulation rechnete
     mit dem heutigen Einkaufspreis; ein neuer DATANORM-Stand änderte
     rückwirkend die Kosten abgeschlossener Baustellen. Jetzt hält die
     Datenbank den Einkaufspreis fest, wenn Ware die Baustelle erreicht:
     abgeholte Anforderung, Retoure, eingeladene Rüstlistenposition,
     unterschriebener Schein (`einkaufspreis_festgehalten`, einmal je Beleg
     und Artikel). Sichtbar nur, wer Einkaufspreise sieht — dieselbe Regel
     wie `material_einkaufspreise`; die Anforderung selbst liest auch der
     Monteur, deshalb eine eigene Tabelle und keine Spalte.
     ALTDATEN: Belege vor dieser Fassung haben keinen festgehaltenen Preis;
     für sie rechnet die Nachkalkulation wie bisher mit dem Preis aus dem
     Stamm. Nachgetragen wird nichts — der Preis von damals ist nicht bekannt.

  Die übrigen Teilpunkte (Herkunft „beim Händler“ für das Lager, Mengen mit
  Komma in den Rückfragen, der Grund gescheiterter Warenkorb-Positionen)
  liegen in der App.

  RECHTE unverändert. DATENSCHUTZ: keine Personendaten in der neuen Tabelle.
*/

-- ---------------------------------------------------------------------------
-- 1. Freie Zeile: der Artikel gleichen Namens nur mit passender Menge
-- ---------------------------------------------------------------------------

create or replace function app.katalogeintrag_passend(p_betrieb text, p_name text, p_menge numeric)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select k.id
    from (select app.katalogeintrag(p_betrieb, p_name) as id) k
    join public.materials m on m.id = k.id
   where app.menge_fehler(p_menge, m.unit) is null
$$;

/*
  Nur Funktionen der Datenbank rufen sie auf; das Schema `app` liegt nicht
  an der Schnittstelle. `einkauf_geliefert` läuft mit den Rechten des
  Aufrufers — ohne das Recht scheiterte „Geliefert“ an jeder Anforderung.
*/
revoke all on function app.katalogeintrag_passend(text, text, numeric) from public, anon;
grant execute on function app.katalogeintrag_passend(text, text, numeric) to authenticated;

/*
  Rumpf wie in 20261116060200_lagerfuehrung_am_artikel.sql (seit
  20261116060300_teilmengen.sql unter diesem Namen); neu ist nur die
  passende Zuordnung der freien Zeile.
*/
create or replace function app.anforderung_abschliessen_ganz(
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
  kommissionsartikel uuid;
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
    -- NEU (M8): eine freie Zeile bekommt den Artikel gleichen Namens nur, wenn ihre Menge zu dessen Einheit passt.
    katalog := coalesce(a.material_id, app.katalogeintrag_passend(a.company_id, a.material_name, a.quantity));
    -- Mit Eigentümerrechten hält kein Zeilenschutz mehr einen Artikel eines
    -- anderen Betriebs fern; der Fremdschlüssel prüft nur, dass es ihn gibt.
    if katalog is not null and not exists (
      select 1 from public.materials m where m.id = katalog and m.company_id = a.company_id
    ) then
      katalog := null;
    end if;
    /*
      NEU (M6): KOMMISSIONSWARE BERÜHRT KEINEN BESTAND. Ein Artikel, den das
      Lager nicht führt, kam für genau diese Anforderung (Einkaufsliste) —
      er lag nie im Regal und geht nicht aus ihm. Vorher buchte die Abholung
      Eingang und Entnahme zugleich; der Eingang machte den Artikel für immer
      zum Lagerartikel (`app.lager_folgt_bestand`), der danach mit Bestand
      null als „knapp“ dastand.
    */
    if katalog is not null and (a.kommission or not exists (
      select 1 from public.materials m where m.id = katalog and m.lagerartikel
    )) then
      kommissionsartikel := katalog;
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
         material_id = coalesce(a.material_id, katalog, kommissionsartikel, app.katalogeintrag_passend(a.company_id, a.material_name, a.quantity)),
         geliefert_am = case when a.beschaffung = 'einkauf'
                             then coalesce(a.geliefert_am, now()) else a.geliefert_am end,
         lagerort_id = ort_id,
         abgeholt_herkunft = case when a.transaction_type = 'return' then null else coalesce(p_herkunft, 'lager') end
   where id = p_order;
  perform set_config('app.ort_setzen', '', true);
  return 1;
end;
$$;

revoke all on function app.anforderung_abschliessen_ganz(uuid, text, uuid, text) from public, anon, authenticated;

/* Rumpf wie in 20261116060400_bestellung_storno_teillieferung.sql; neu ist nur die passende Zuordnung. */
create or replace function public.einkauf_geliefert(p_ids uuid[], p_ort uuid default null, p_lieferschein text default null)
  returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  p public.einkauf_posten%rowtype;
  katalog uuid;
  gebucht boolean;
  n integer := 0;
  ort public.lagerorte;
  schein text := nullif(btrim(coalesce(p_lieferschein, '')), '');
begin
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Den Wareneingang bucht die Verwaltung oder die Leitung'
      using errcode = '42501';
  end if;
  ort := app.ort_pruefen(app.arbeitsbetrieb(), p_ort, true);
  if ort.id is not null then
    perform app.lagerort_wahl_pruefen(app.arbeitsbetrieb());
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
    katalog := coalesce(a.material_id, app.katalogeintrag_passend(a.company_id, a.material_name, a.quantity));
    /*
      NEU (M6): Kommissionsware — ein Artikel, den das Lager nicht führt —
      kommt für diese Anforderung und liegt bis zur Abholung bei ihr, nicht
      im Bestand. Geführt wird ein Artikel, weil jemand es so eingestellt
      hat, nicht weil eine Lieferung kam.
    */
    if katalog is not null and exists (
      select 1 from public.materials m
       where m.id = katalog and m.company_id = a.company_id and m.lagerartikel
    ) then
      perform app.lager_kontext('eingang', null,
        (select s.name from public.suppliers s where s.id = a.supplier_id), schein,
        'Einkaufsliste · Anforderung' || coalesce(' Baustelle ' || nullif(a.project_number, ''), ''), a.id);
      if ort.id is null then
        perform public.bestand_anpassen(katalog, coalesce(a.quantity, 0));
      else
        perform app.ort_anpassen(ort.id, katalog, coalesce(a.quantity, 0), false);
      end if;
      perform app.lager_kontext_leeren();
      gebucht := true;
    else
      gebucht := false;
    end if;
    perform set_config('app.ort_setzen', case when ort.id is not null then 'ja' else '' end, true);
    update public.material_orders
       set geliefert_am = now(),
           -- NEU (M6): festgehalten, damit die Abholung nichts abbucht, was nie eingebucht wurde.
           kommission = not gebucht,
           -- NEU (M4): der Lieferschein auch an der Zeile — Kommissionsware hat keine Bewegung, die ihn trüge.
           lieferschein = coalesce(schein, lieferschein),
           -- Wer die Bestellung vergessen hat abzuhaken, hat sie trotzdem
           -- bekommen: ohne Datum sähe die Liste aus, als wäre nie bestellt.
           bestellt_am = coalesce(bestellt_am, now()),
           material_id = coalesce(a.material_id, katalog),
           status = case when status in ('Offen', 'In Bearbeitung') then 'Abholbereit' else status end,
           lagerort_id = coalesce(ort.id, lagerort_id)
     where id = a.id;
    perform set_config('app.ort_setzen', '', true);
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
        (select s.name from public.suppliers s where s.id = p.supplier_id), schein, 'Einkaufsliste · fürs Lager', null);
      if ort.id is null then
        perform public.bestand_anpassen(katalog, p.menge);
      else
        perform app.ort_anpassen(ort.id, katalog, p.menge, false);
      end if;
      perform app.lager_kontext_leeren();
    end if;
    update public.einkauf_posten
       set geliefert_am = now(),
           lieferschein = coalesce(schein, lieferschein),
           bestellt_am = coalesce(bestellt_am, now()),
           material_id = coalesce(p.material_id, katalog)
     where id = p.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.einkauf_geliefert(uuid[], uuid, text) from public, anon;
grant execute on function public.einkauf_geliefert(uuid[], uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Die Einheit an der Anforderung
-- ---------------------------------------------------------------------------

alter table public.material_orders add column if not exists einheit text;

comment on column public.material_orders.einheit is
  'M8: die Einheit der Menge — beim Katalogartikel aus dem Artikel (setzt die Datenbank), bei der freien Zeile vom Besteller.';

/*
  Beim Katalogartikel gilt seine Einheit — auch wenn die App eine andere
  schickt (die Mengenprüfung rechnet ohnehin mit ihr). Bei der freien Zeile
  bleibt, was kam, getrimmt; leer ist keine Angabe.
*/
create or replace function app.anforderung_einheit() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.material_id is not null then
    new.einheit := coalesce(
      (select nullif(btrim(m.unit), '') from public.materials m where m.id = new.material_id),
      nullif(btrim(coalesce(new.einheit, '')), ''));
  else
    new.einheit := nullif(btrim(coalesce(new.einheit, '')), '');
  end if;
  return new;
end;
$$;

revoke all on function app.anforderung_einheit() from public, anon, authenticated;

drop trigger if exists material_orders_einheit on public.material_orders;
create trigger material_orders_einheit
  before insert or update of material_id, einheit on public.material_orders
  for each row execute function app.anforderung_einheit();

-- ---------------------------------------------------------------------------
-- 3. Der Einkaufspreis zum Zeitpunkt der Ausgabe
-- ---------------------------------------------------------------------------

create table if not exists public.einkaufspreis_festgehalten (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies (id),
  beleg_art text not null check (beleg_art in ('anforderung', 'retoure', 'ruestliste', 'schein')),
  -- Die Kennung des Belegs: Anforderung/Retoure, Rüstlistenposition (`beleg_id`), Scheinzeile.
  beleg_id text not null,
  material_id uuid not null references public.materials (id) on delete cascade,
  einkaufspreis numeric(12,4) not null check (einkaufspreis >= 0),
  festgehalten_am timestamptz not null default now(),
  unique (beleg_art, beleg_id, material_id)
);

create index if not exists einkaufspreis_festgehalten_betrieb on public.einkaufspreis_festgehalten (company_id);

alter table public.einkaufspreis_festgehalten enable row level security;

drop policy if exists einkaufspreis_festgehalten_lesen on public.einkaufspreis_festgehalten;
create policy einkaufspreis_festgehalten_lesen on public.einkaufspreis_festgehalten
  for select
  using ((company_id = (select app.lesebetrieb()) and (select app.darf_einkauf_sehen()))
         or company_id = (select app.supportbetrieb()));

drop trigger if exists einkaufspreis_festgehalten_kein_support_schreiben on public.einkaufspreis_festgehalten;
create trigger einkaufspreis_festgehalten_kein_support_schreiben
  before insert or update or delete on public.einkaufspreis_festgehalten
  for each row execute function app.support_schreibt_nicht();

grant select on public.einkaufspreis_festgehalten to authenticated;

/* Den Preis von jetzt festhalten — einmal je Beleg und Artikel; ohne gepflegten Preis nichts. */
create or replace function app.einkaufspreis_festhalten(p_betrieb text, p_art text, p_beleg text, p_material uuid)
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  insert into public.einkaufspreis_festgehalten (company_id, beleg_art, beleg_id, material_id, einkaufspreis)
  select p_betrieb, p_art, p_beleg, p_material, e.einkaufspreis
    from public.material_einkaufspreise e
   where e.material_id = p_material and e.company_id = p_betrieb and e.einkaufspreis > 0
  on conflict (beleg_art, beleg_id, material_id) do nothing
$$;

revoke all on function app.einkaufspreis_festhalten(text, text, text, uuid) from public, anon, authenticated;

/* Anforderung: wenn sie abgeholt ist. Retoure: wenn sie erfasst ist. */
create or replace function app.ek_bei_anforderung() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.material_id is not null
     and ((new.transaction_type = 'order' and new.status = 'Erledigt') or new.transaction_type = 'return') then
    perform app.einkaufspreis_festhalten(new.company_id,
      case when new.transaction_type = 'return' then 'retoure' else 'anforderung' end,
      new.id::text, new.material_id);
  end if;
  return null;
end;
$$;

revoke all on function app.ek_bei_anforderung() from public, anon, authenticated;

drop trigger if exists material_orders_einkaufspreis on public.material_orders;
create trigger material_orders_einkaufspreis
  after insert or update of status, material_id on public.material_orders
  for each row execute function app.ek_bei_anforderung();

/* Rüstliste: beim Einladen festhalten, beim Zurücknehmen wieder vergessen. */
create or replace function app.ek_bei_einladen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  p record;
begin
  for p in
    select x.beleg_id, x.material_id, (new.geladen ? x.id) as jetzt, (old.geladen ? x.id) as vorher
      from public.einsatz_material_positionen x
     where x.einsatz_material_id = new.id and x.material_id is not null
  loop
    if p.jetzt and not p.vorher then
      perform app.einkaufspreis_festhalten(new.company_id, 'ruestliste', p.beleg_id::text, p.material_id);
    elsif p.vorher and not p.jetzt then
      delete from public.einkaufspreis_festgehalten f
       where f.beleg_art = 'ruestliste' and f.beleg_id = p.beleg_id::text and f.company_id = new.company_id;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function app.ek_bei_einladen() from public, anon, authenticated;

drop trigger if exists einsatz_material_einkaufspreis on public.einsatz_material;
create trigger einsatz_material_einkaufspreis
  after update of geladen on public.einsatz_material
  for each row when (new.geladen is distinct from old.geladen)
  execute function app.ek_bei_einladen();

/* Schein: beim Unterschreiben, je Zeile mit Katalogartikel. */
create or replace function app.ek_bei_unterschrift() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform app.einkaufspreis_festhalten(new.company_id, 'schein', wm.id::text, wm.material_id)
     from public.work_sheet_material wm
    where wm.work_sheet_id = new.id and wm.material_id is not null;
  return null;
end;
$$;

revoke all on function app.ek_bei_unterschrift() from public, anon, authenticated;

drop trigger if exists work_sheets_einkaufspreis on public.work_sheets;
create trigger work_sheets_einkaufspreis
  after update of status on public.work_sheets
  for each row when (old.status is distinct from 'Unterschrieben' and new.status = 'Unterschrieben')
  execute function app.ek_bei_unterschrift();

/*
  Die Ausgaben für die Nachkalkulation — Rumpf wie in
  20261110170000_wartung_abo_eingang_lager.sql; neu sind `beleg_id` und der
  festgehaltene `einkaufspreis` (nur für wer Einkaufspreise sieht, sonst
  leer). Die neue Rückgabe braucht ein `drop` — eine noch nicht neu geladene
  App liest die bisherigen Spalten unter denselben Namen.
*/
drop function if exists public.ausgegebenes_material_gesamt(text[]);

create function public.ausgegebenes_material_gesamt(p_baustellen text[])
  returns table(baustelle text, art text, datum date, material_id uuid, name text, einheit text, menge numeric,
                beleg_id text, einkaufspreis numeric)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  betrieb text := app.betrieb();
  schluessel text[];
  preise boolean := app.darf_einkauf_sehen();
begin
  if not (app.betriebsmitglied(betrieb) and app.ist_buch_oder_spitze()) then
    raise exception 'Ausgegebenes Material sieht nur, wer Rechnungen schreibt' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct lower(regexp_replace(trim(b), '^PR-', '', 'i'))), '{}'::text[]) into schluessel
    from unnest(coalesce(p_baustellen, '{}'::text[])) b
   where trim(coalesce(b, '')) <> '';
  if cardinality(schluessel) = 0 then
    return;
  end if;

  return query
  with ausgaben as (
    select lower(regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i')) as baustelle,
           'anforderung'::text as art,
           (coalesce(o.erledigt_am, o.updated_at) at time zone 'Europe/Vienna')::date as datum,
           o.material_id, o.material_name as name, m.unit as einheit, o.quantity as menge,
           o.id::text as beleg_id, 'anforderung'::text as preisart
      from public.material_orders o
      left join public.materials m on m.id = o.material_id and m.company_id = o.company_id
     where o.company_id = betrieb
       and o.transaction_type = 'order'
       and o.status = 'Erledigt'
       and lower(regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i')) = any(schluessel)
    union all
    select lower(regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i')),
           'retoure'::text,
           (o.created_at at time zone 'Europe/Vienna')::date,
           o.material_id, o.material_name, m.unit, -o.quantity,
           o.id::text, 'retoure'::text
      from public.material_orders o
      left join public.materials m on m.id = o.material_id and m.company_id = o.company_id
     where o.company_id = betrieb
       and o.transaction_type = 'return'
       and lower(regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i')) = any(schluessel)
    union all
    select lower(regexp_replace(trim(k.project_number), '^PR-', '', 'i')),
           'ruestliste'::text, k.date,
           p.material_id, p.name, coalesce(nullif(p.einheit, ''), m.unit),
           greatest(p.menge - app.ruest_angefordert(k.id, p.id), 0),
           p.beleg_id::text, 'ruestliste'::text
      from public.einsatz_material k
      join public.einsatz_material_positionen p on p.einsatz_material_id = k.id
      left join public.materials m on m.id = p.material_id and m.company_id = k.company_id
     where k.company_id = betrieb
       and lower(regexp_replace(trim(k.project_number), '^PR-', '', 'i')) = any(schluessel)
       and k.geladen ? p.id::text
  )
  select a.baustelle, a.art, a.datum, a.material_id, a.name, a.einheit, a.menge, a.beleg_id,
         case when preis_sehen then f.einkaufspreis end
    from ausgaben a
    cross join (select preise as preis_sehen) s
    left join public.einkaufspreis_festgehalten f
      on f.company_id = betrieb and f.beleg_art = a.preisart and f.beleg_id = a.beleg_id
     and f.material_id = a.material_id
   where a.menge <> 0
   order by a.baustelle, a.datum, a.name;
end;
$$;

revoke all on function public.ausgegebenes_material_gesamt(text[]) from public, anon;
grant execute on function public.ausgegebenes_material_gesamt(text[]) to authenticated;

/*
  Die festgehaltenen Preise der Scheinzeilen — je Schein und Artikel die
  Menge und ihr Preis. Nur für wer Einkaufspreise sieht (sonst keine Zeile).
*/
create or replace function public.schein_einkaufspreise(p_scheine uuid[])
  returns table (work_sheet_id uuid, material_id uuid, menge numeric, einkaufspreis numeric)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select wm.work_sheet_id, wm.material_id, wm.menge, f.einkaufspreis
    from public.work_sheet_material wm
    join public.work_sheets w on w.id = wm.work_sheet_id
    join public.einkaufspreis_festgehalten f
      on f.company_id = w.company_id and f.beleg_art = 'schein' and f.beleg_id = wm.id::text
     and f.material_id = wm.material_id
   where w.company_id = (select app.lesebetrieb())
     and (select app.darf_einkauf_sehen())
     and wm.work_sheet_id = any(coalesce(p_scheine, '{}'::uuid[]))
$$;

revoke all on function public.schein_einkaufspreise(uuid[]) from public, anon;
grant execute on function public.schein_einkaufspreise(uuid[]) to authenticated;
