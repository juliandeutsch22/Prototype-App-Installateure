/*
  M7 (Durchsicht 15.11.2026): RETOURE — GUTSCHRIFT ERST NACH DER ANNAHME IM
  LAGER; HÖCHSTMENGE AUS DEM AUSGEGEBENEN; HINWEIS, WENN SCHON VERRECHNET.

  WAS FALSCH WAR. Eine Retoure „neu“ des Monteurs schrieb sofort und
  unbegrenzt gut (`retoure_anlegen`): „10 Stk neu“, ausgegeben waren 4, im
  Regal kam nie etwas an — der Bestand stieg um 10, „Aus Lager“ sagte die 10
  dem Nächsten zu, und der Rechnungsvorschlag der Baustelle sank um 10. Den
  Reiter „Retouren“ sah niemand als Arbeit an. Und wer verrechnetes Material
  zurückbrachte, erfuhr nicht, dass der Kunde es schon bezahlt hat.

  WIE ES JETZT IST.
  - Meldet der Monteur „neu“ ins Lager, wartet die Retoure auf die Annahme
    (`processed = false`, keine Gutschrift). Das Lager nimmt sie an
    (`retoure_annehmen`) — mit der Menge, die wirklich ankam, und dem
    Zustand, den es am Regal sieht; erst dann wird gutgeschrieben. Kam nichts
    an, löscht das Lager die Retoure (ohne Gegenbuchung, es war nichts
    gebucht). Erfasst das Lager selbst, oder bringt der Fahrer Restmaterial
    in sein eigenes Fahrzeug, wird wie bisher sofort gutgeschrieben — dort
    nimmt der an, der erfasst.
  - Mit Baustelle höchstens, was für sie ausgegeben wurde, abzüglich dessen,
    was schon zurück ist (`app.retoure_rahmen_rechnen`; abgeholte
    Anforderungen und eingeladene Rüstlisten, je Katalogartikel, ohne ihn
    über den Namen). Ohne Baustelle keine Grenze — die Annahme prüft.
  - `retoure_rahmen` sagt dem Formular vorher, wie viel höchstens geht und ob
    die Ware schon verrechnet ist (verknüpft mit einer gültigen Rechnung, M2,
    oder nach der Altregel gedeckt). Die Rechnungsnummern nur, wer Rechnungen
    sieht.

  RECHNUNGSVORSCHLAG: unverändert zählt eine Retoure ab ihrer Erfassung —
  jetzt aber höchstens bis zum Ausgegebenen.
  RECHTE: Annehmen wie Löschen — Verwaltung und Führung.
  ALTE APP: `retoure_anlegen` unverändert in Namen und Parametern; eine noch
  nicht neu geladene Lager-App sieht wartende Retouren unter „Retouren“, kann
  sie aber erst nach dem Neuladen annehmen.
  DATENSCHUTZ: keine neue Tabelle. Wer angenommen hat, steht wie bei jeder
  Gutschrift im Bewegungsprotokoll (`erfasst_von`), nicht an der Retoure.
*/

alter table public.material_orders
  add column if not exists angenommen_am timestamptz,
  add column if not exists gemeldete_menge numeric(12,3);

comment on column public.material_orders.angenommen_am is
  'M7: wann das Lager die Retoure angenommen hat (Gutschrift). Leer bei einer wartenden Retoure (processed = false) und bei Altdaten.';
comment on column public.material_orders.gemeldete_menge is
  'M7: was der Monteur gemeldet hat, wenn das Lager weniger angenommen hat.';

-- ---------------------------------------------------------------------------
-- 1. Was für eine Baustelle ausgegeben und schon zurück ist
-- ---------------------------------------------------------------------------

/*
  Je Artikel: mit Katalogartikel die Zeilen dieses Artikels und die freien
  Zeilen gleichen Namens; ohne ihn alle Zeilen gleichen Namens. Der Name wie
  in der App angeglichen (klein, Leerraum zusammengezogen). Ausgegeben:
  abgeholte Anforderungen und eingeladene Rüstlistenpositionen (ohne den
  Teil, den eine Anforderung bringt — der steht als Anforderung da), wie im
  Rechnungsvorschlag. `verrechnet`: eine dieser Ausgaben steht auf einer
  gültigen Rechnung oder ist nach der Altregel gedeckt.
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

/*
  Für das Formular: was höchstens zurück kann, und ob die Ware schon
  verrechnet ist. Jedes Mitglied des Betriebs (der Monteur erfasst seine
  Retoure selbst); die Rechnungsnummern nur, wer Rechnungen sieht.
*/
create or replace function public.retoure_rahmen(p_baustelle text, p_material uuid, p_name text)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  r jsonb;
begin
  if betrieb is null or not app.betriebsmitglied(betrieb) then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_baustelle, '')), '') is null then
    return null;
  end if;
  r := app.retoure_rahmen_rechnen(betrieb, p_baustelle,
         (select m.id from public.materials m where m.id = p_material and m.company_id = betrieb), p_name);
  if not (app.ist_buch_oder_spitze() or app.hat_rolle(array['Verwaltung'])) then
    r := r - 'rechnungen';
  end if;
  return r;
end;
$$;

revoke all on function public.retoure_rahmen(text, uuid, text) from public, anon;
grant execute on function public.retoure_rahmen(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Erfassen: Grenze und Warten auf die Annahme
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20261110150000_material_ablauf_nachtrag.sql. Neu: die
  Höchstmenge mit Baustelle und das Warten auf die Annahme (siehe oben).
*/
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
  person uuid := nullif(p_beleg ->> 'user_id', '')::uuid;
  personname text;
  ort public.lagerorte;
  eingefuegt integer;
  lager_nimmt boolean := app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung();
  wartet boolean;
  rahmen jsonb;
  menge numeric := (p_beleg ->> 'quantity')::numeric;
begin
  if betrieb is null
     or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb))
     or person is null then
    raise exception 'Eine Retoure legt man im eigenen Betrieb an'
      using errcode = '42501';
  end if;

  /*
    FÜR JEMAND ANDEREN nur das Lager und die Führung — sie nehmen am Regal
    entgegen, was ein anderer hereinbringt. Die Person muss zum Betrieb
    gehören; sonst stünde eine Retoure auf einer fremden Kennung.
  */
  if person is distinct from auth.uid() then
    if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
      raise exception 'Eine Retoure für jemand anderen erfasst das Lager'
        using errcode = '42501';
    end if;
    if not exists (select 1 from public.users u where u.id = person and u.company_id = betrieb) then
      raise exception 'Diese Person gehört nicht zu diesem Betrieb'
        using errcode = '42501';
    end if;
  end if;

  -- Eine Wiederholung derselben Retoure — nichts noch einmal.
  if app.retoure_wiederholt(neu, p_beleg, betrieb, person) then
    return neu;
  end if;

  personname := coalesce((select u.name from public.users u where u.id = person), p_beleg ->> 'user_name');

  -- M04a: der Zielort.
  ort := app.ort_pruefen(betrieb, nullif(p_beleg ->> 'lagerort_id', '')::uuid, true);
  if ort.id is not null then
    if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung() or app.eigenes_fahrzeug(ort.id)) then
      raise exception 'An diesen Ort bucht das Lager zurück — der Fahrer in sein eigenes Fahrzeug'
        using errcode = '42501';
    end if;
    perform app.lagerort_wahl_pruefen(betrieb);
    if coalesce((p_beleg ->> 'quantity')::numeric, 0) <= 0 then
      raise exception 'Die Menge muss größer als null sein.' using errcode = '23514';
    end if;
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

  if coalesce(menge, 0) <= 0 then
    raise exception 'Die Menge muss größer als null sein.' using errcode = '23514';
  end if;

  /*
    NEU (M7): HÖCHSTENS, WAS FÜR DIE BAUSTELLE AUSGEGEBEN WURDE. Eine Retoure
    mit Baustelle mindert deren Rechnungsvorschlag; mehr zurück, als
    ausgegeben wurde, kann nicht von dort kommen. Gesperrt je Baustelle,
    damit zwei gleichzeitige Retouren nicht beide durchgehen. Ohne Baustelle
    gilt keine Grenze — dann prüft das Lager bei der Annahme.
  */
  if nullif(btrim(coalesce(p_beleg ->> 'project_number', '')), '') is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'retoure:' || betrieb || ':' || app.baustelle_wie_js(p_beleg ->> 'project_number'), 0));
    rahmen := app.retoure_rahmen_rechnen(betrieb, p_beleg ->> 'project_number', katalog, p_beleg ->> 'material_name');
    if menge > (rahmen ->> 'hoechstens')::numeric then
      raise exception 'Für die Baustelle % wurden % ausgegeben, % sind schon zurück — mehr als % kann von dort nicht zurückkommen. Stammt die Ware von woanders, ohne Baustelle erfassen.',
        p_beleg ->> 'project_number', trim_scale((rahmen ->> 'ausgegeben')::numeric),
        trim_scale((rahmen ->> 'zurueck')::numeric), trim_scale((rahmen ->> 'hoechstens')::numeric)
        using errcode = '23514';
    end if;
  end if;

  /*
    NEU (M7): GUTGESCHRIEBEN WIRD, WAS JEMAND AM ORT ANNIMMT. Erfasst das
    Lager (oder die Leitung) selbst, hat es die Ware am Regal gesehen; bringt
    der Fahrer Restmaterial in sein eigenes Fahrzeug, ist er der, der sie
    dort annimmt. Sonst — der Monteur meldet „neu“ ins Lager — wartet die
    Retoure auf die Annahme (`retoure_annehmen`): bis dahin keine Gutschrift
    (`processed = false`).
  */
  wartet := katalog is not null and (p_beleg ->> 'condition') = 'neu'
            and not lager_nimmt and not (ort.id is not null and app.eigenes_fahrzeug(ort.id));

  perform set_config('app.ort_setzen', case when ort.id is not null then 'ja' else '' end, true);
  insert into public.material_orders (
    id, company_id, material_id, material_name, quantity, note,
    project_number, status, is_urgent, transaction_type, condition,
    user_id, user_name, processed, source, lagerort_id
  ) values (
    neu, betrieb, katalog, p_beleg ->> 'material_name',
    (p_beleg ->> 'quantity')::numeric, p_beleg ->> 'note',
    p_beleg ->> 'project_number', 'Erledigt',
    coalesce((p_beleg ->> 'is_urgent')::boolean, false), 'return',
    p_beleg ->> 'condition', person,
    personname, not wartet, p_beleg ->> 'source', ort.id
  )
  on conflict (id) do nothing;
  /*
    NEU: festgehalten, BEVOR das nächste `perform` läuft — `perform` setzt
    `found` selbst (eine Zeile von `set_config`), die Frage „eingefügt?“
    war danach immer ja.
  */
  get diagnostics eingefuegt = row_count;
  perform set_config('app.ort_setzen', '', true);

  -- Ohne neue Zeile keine Gutschrift — eine gleichzeitige Wiederholung war schneller.
  if eingefuegt = 0 then
    if app.retoure_wiederholt(neu, p_beleg, betrieb, person) then
      return neu;
    end if;
    raise exception 'Die Retoure ließ sich nicht anlegen' using errcode = '40001';
  end if;

  if katalog is not null and (p_beleg ->> 'condition') = 'neu' and not wartet then
    perform app.lager_kontext('retoure', null, null, null,
      coalesce('Baustelle ' || nullif(p_beleg ->> 'project_number', ''), 'Retoure') || ' · ' || coalesce(personname, ''), neu);
    if ort.id is null then
      perform public.bestand_anpassen(katalog, (p_beleg ->> 'quantity')::numeric);
    else
      perform app.ort_anpassen(ort.id, katalog, (p_beleg ->> 'quantity')::numeric, false);
    end if;
    perform app.lager_kontext_leeren();
  end if;

  return neu;
end;
$$;

revoke all on function public.retoure_anlegen(jsonb) from public, anon;
grant execute on function public.retoure_anlegen(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Annehmen
-- ---------------------------------------------------------------------------

/*
  Das Lager nimmt eine wartende Retoure an: `p_menge` (höchstens die
  gemeldete) und `p_zustand` so, wie die Ware am Regal ist. Nur „neu“ mit
  Katalogartikel wird gutgeschrieben — an den Ort, den die Retoure nennt,
  sonst ins Hauptlager. Weniger als gemeldet ändert die Menge der Retoure
  (die gemeldete bleibt daneben stehen); steht sie schon auf einer
  Rechnung, nur ganz — sonst stimmten Rechnung und Retoure nicht mehr
  überein. Antwort: {ergebnis: 'angenommen', gutgeschrieben} oder
  {ergebnis: 'veraltet'} (weg, fremd, schon angenommen).
*/
create or replace function public.retoure_annehmen(
  p_id uuid, p_menge numeric default null, p_zustand text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  menge numeric;
  zustand text;
  gut numeric := 0;
begin
  select * into a from public.material_orders where id = p_id for update;
  if a.id is null
     or not coalesce(a.company_id = (select app.lesebetrieb()), false)
     or a.transaction_type <> 'return'
     or a.processed then
    return jsonb_build_object('ergebnis', 'veraltet');
  end if;
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Eine Retoure nimmt das Lager an' using errcode = '42501';
  end if;
  menge := coalesce(p_menge, a.quantity);
  zustand := coalesce(nullif(p_zustand, ''), a.condition);
  if zustand not in ('neu', 'gebraucht', 'defekt') then
    raise exception 'Zustand ist „neu“, „gebraucht“ oder „defekt“' using errcode = '22023';
  end if;
  if menge <= 0 or menge > a.quantity then
    raise exception 'Angenommen wird zwischen null und der gemeldeten Menge (%). Kam nichts an, die Retoure löschen.', trim_scale(a.quantity)
      using errcode = '22023';
  end if;
  if menge < a.quantity and (a.is_billed or coalesce(a.invoice_number, '') <> '') then
    raise exception 'Die Retoure steht schon auf der Rechnung % — sie lässt sich nur ganz annehmen. Die Abweichung geht über die Inventur.', a.invoice_number
      using errcode = '23514';
  end if;

  if zustand = 'neu' and a.material_id is not null then
    perform app.lager_kontext('retoure', null, null, null,
      coalesce('Baustelle ' || nullif(a.project_number, ''), 'Retoure') || ' · ' || coalesce(a.user_name, '') || ' · angenommen', a.id);
    if a.lagerort_id is null then
      perform public.bestand_anpassen(a.material_id, menge);
    else
      perform app.ort_anpassen(a.lagerort_id, a.material_id, menge, false);
    end if;
    perform app.lager_kontext_leeren();
    gut := menge;
  end if;

  update public.material_orders
     set processed = true,
         angenommen_am = now(),
         condition = zustand,
         gemeldete_menge = case when menge < a.quantity then a.quantity else gemeldete_menge end,
         quantity = menge
   where id = a.id;
  return jsonb_build_object('ergebnis', 'angenommen', 'gutgeschrieben', gut);
end;
$$;

revoke all on function public.retoure_annehmen(uuid, numeric, text) from public, anon;
grant execute on function public.retoure_annehmen(uuid, numeric, text) to authenticated;
