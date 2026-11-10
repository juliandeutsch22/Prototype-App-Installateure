/*
  MATERIALABLAUF: NACHTRAG ZU 20261110120000_material_ablauf_luecken.sql
  (Gegenprüfung 09.11.2026)

  1. EINE GLEICHZEITIGE WIEDERHOLUNG DER RETOURE SCHRIEB DOPPELT GUT.
     `retoure_anlegen` fragte nach dem Einfügen `found` ab — erst nach einem
     `perform set_config(…)`, und `perform` setzt `found` selbst. Die
     Abfrage war also immer „eingefügt“: zwei gleichzeitige Wiederholungen
     (beide an der Vorprüfung vorbei, die zweite wartet am Schlüssel und
     fügt nichts ein) schrieben beide gut. Jetzt zählt die Zeilenzahl des
     Einfügens selbst, festgehalten unmittelbar danach.

  2. EINE ABGERECHNETE ANFORDERUNG LÄSST SICH NICHT MEHR NEU DATIEREN.
     Von Hand „Erledigt“ → „Offen“ → wieder abgeholt setzte `erledigt_am`
     neu: die schon verrechnete Ausgabe stand nach dem Stichtag ein zweites
     Mal im Rechnungsvorschlag. Und zurückgesetzt ließ sie sich mit
     Gegenbuchung löschen, weil das Löschen „schon abgerechnet“ nur bei
     „Erledigt“ prüfte — die verrechnete Ware lag wieder im Regal. Jetzt:
     - Der Weg aus „Erledigt“ ist zu, solange die Ausgabe abgerechnet ist
       (auf einer Rechnung, oder ihr Tag reicht bis zum Stichtag der letzten
       gültigen Rechnung der Baustelle). Geprüft an der Tabelle, also für
       „Status von Hand“ (`anforderung_status_setzen`) wie für jedes
       Schreiben an ihr vorbei. Eine Stelle für die Frage „abgerechnet?“:
       `app.material_abgerechnet`, auch für das Löschen.
     - Das Löschen prüft „abgerechnet“ bei jeder verbuchten Anforderung,
       nicht nur bei „Erledigt“.
     - `erledigt_am` bleibt bei einer verbuchten Zeile beim Zurücksetzen
       stehen: es ist der Tag, an dem die Ware ging, und das Löschen misst
       daran. Wird sie wieder abgeholt, gilt wie bisher der neue Zeitpunkt —
       sie stand ja in keinem Rechnungsvorschlag, solange sie zurückgesetzt
       war. Gelesen wird `erledigt_am` sonst nur bei „Erledigt“
       (`ausgegebenes_material`, Verlauf in der Ansicht).

  3. DIE FEHLMENGE EINER EINGELADENEN RÜSTLISTE LÖSCHT SICH NICHT MEHR WEG.
     Eine Anforderung über die Fehlmenge einer Rüstliste (`ruestliste_id`,
     `ruest_position`) mindert, was das Einladen bucht und was die Position
     als ausgegeben zählt (20261027400000_r6_ruestliste_fehlmenge.sql).
     Gelöscht, nachdem die Position eingeladen ist, zählte die Position
     wieder ganz — im Rechnungsvorschlag mehr als aus dem Regal ging. Jetzt
     weist das Löschen dann mit Grund ab; vor dem Einladen wie bisher.

  4. VERBUCHT OHNE BEWEGUNG HEISST „NICHTS GEBUCHT“ — WENN DAS PROTOKOLL LIEF.
     Abgeholt bei leerem Regal klemmt die Entnahme bei null; das Protokoll
     schreibt keine Bewegung über null. Das Löschen wies solche Zeilen für
     immer ab („nicht belegt“). Ist die Zeile angelegt worden, als das
     Bewegungsprotokoll des Betriebs schon lief, ist eine fehlende Bewegung
     der Beleg dafür, dass nichts gebucht wurde: gelöscht wird ohne
     Gegenbuchung. Davor bleibt es bei der Abweisung (Altdaten).

  5. KEINE GEGENBUCHUNG AN EINEN STILLGELEGTEN ORT.
     `app.ort_anpassen` prüft „aktiv“ nicht; die Gegenbuchung hätte Ware in
     ein stillgelegtes Fahrzeug oder Lager gelegt, wo sie niemand mehr sieht.
     Jetzt weist das Löschen mit Grund ab.

  RECHTE unverändert. DATENSCHUTZ: keine neue Tabelle, keine neuen
  Personendaten.

  Rümpfe wie in 20261110120000_material_ablauf_luecken.sql
  (`retoure_anlegen`, `app.loeschen_gegenbuchung`,
  `app.verbuchte_anforderung_loeschen`) und
  20261024100000_grenzen_material_und_lehrlinge.sql
  (`app.erledigt_am_setzen`), geändert nur an den markierten Stellen.
*/

-- ---------------------------------------------------------------------------
-- 1. Retoure: die Zeilenzahl des Einfügens, nicht `found` nach `perform`
-- ---------------------------------------------------------------------------

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
    personname, true, p_beleg ->> 'source', ort.id
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

  if katalog is not null and (p_beleg ->> 'condition') = 'neu' then
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
-- 2. Abgerechnet? — eine Stelle für Löschen und Zurücksetzen
-- ---------------------------------------------------------------------------

/*
  Warum diese Zeile als abgerechnet gilt — oder `null`. Ohne Satzzeichen am
  Ende; der Aufrufer sagt die Folge.

  Der Rechnungsvorschlag der Baustelle endet beim letzten abgerechneten Tag
  (`ausgegebenes_material`): eine Ausgabe bis dahin ist auf einer Rechnung.
  Gemessen wird am Tag, an dem die Ware ging (`erledigt_am`; ältere Zeilen
  haben ihn nicht, dann wie im Rechnungsvorschlag `updated_at`), bei einer
  Retoure am Tag ihrer Erfassung. Eine verbuchte Anforderung zählt auch,
  wenn sie inzwischen zurückgesetzt ist — sie kann auf einer Rechnung
  stehen, die vor dem Zurücksetzen geschrieben wurde.
*/
create or replace function app.material_abgerechnet(a public.material_orders)
  returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  grenze date;
  datum date;
begin
  if a.is_billed or coalesce(a.invoice_number, '') <> '' then
    return 'Steht schon auf einer Rechnung' || coalesce(' (' || nullif(a.invoice_number, '') || ')', '');
  end if;
  if not ((a.transaction_type = 'order' and (a.status = 'Erledigt' or a.processed))
          or a.transaction_type = 'return') then
    return null;
  end if;
  select max(coalesce(i.leistung_bis, i.invoice_date)) into grenze
    from public.invoices i
   where i.company_id = a.company_id
     and i.payment_status <> 'Storniert'
     and i.art <> 'anzahlung'
     and regexp_replace(trim(coalesce(i.project_number, '')), '^PR-', '', 'i')
         = regexp_replace(trim(coalesce(a.project_number, '')), '^PR-', '', 'i')
     and regexp_replace(trim(coalesce(a.project_number, '')), '^PR-', '', 'i') <> '';
  datum := case when a.transaction_type = 'order'
                then (coalesce(a.erledigt_am, a.updated_at) at time zone 'Europe/Vienna')::date
                else (a.created_at at time zone 'Europe/Vienna')::date end;
  if grenze is not null and datum <= grenze then
    return 'Schon abgerechnet — die Rechnung der Baustelle ' || a.project_number || ' reicht bis '
           || to_char(grenze, 'DD.MM.YYYY');
  end if;
  return null;
end;
$$;

revoke all on function app.material_abgerechnet(public.material_orders) from public, anon, authenticated;

/*
  Rumpf wie in 20261024100000_grenzen_material_und_lehrlinge.sql. Neu:
  - der Riegel: aus „Erledigt“ zurück nur, solange die Ausgabe nicht
    abgerechnet ist (an der Tabelle, damit kein Weg vorbeiführt; der
    Dienstschlüssel bleibt außen vor — Rücklauf einer Sicherung);
  - eine verbuchte Zeile behält beim Zurücksetzen ihr `erledigt_am`.
  Mit Eigentümerrechten, weil die Prüfung Rechnungen liest, die die
  Verwaltung nicht sieht.
*/
create or replace function app.erledigt_am_setzen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  grund text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'Erledigt' then
      new.erledigt_am := case when app.ist_dienst() then coalesce(new.erledigt_am, now()) else now() end;
    else
      new.erledigt_am := null;
    end if;
    return new;
  end if;

  -- NEU: abgerechnet zurückgesetzt und wieder abgeholt stünde die Ausgabe ein zweites Mal im Rechnungsvorschlag.
  if old.status = 'Erledigt' and new.status is distinct from 'Erledigt' and not app.ist_dienst() then
    grund := app.material_abgerechnet(old);
    if grund is not null then
      raise exception '%. Zurückgesetzt käme die Ware ein zweites Mal auf eine Rechnung — stimmt die Ausgabe nicht, geht das über ein Storno der Rechnung.', grund
        using errcode = '55000';
    end if;
  end if;

  if new.status = 'Erledigt' and old.status is distinct from 'Erledigt' then
    new.erledigt_am := now();
  elsif new.status is distinct from 'Erledigt' then
    -- NEU: verbucht bleibt der Tag, an dem die Ware ging — das Löschen misst daran.
    new.erledigt_am := case when new.processed then old.erledigt_am end;
  else
    new.erledigt_am := old.erledigt_am;
  end if;
  return new;
end;
$$;

revoke all on function app.erledigt_am_setzen() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fehlmenge einer eingeladenen Rüstliste
-- ---------------------------------------------------------------------------

/*
  Gehört die Anforderung zur Fehlmenge einer Position, die schon eingeladen
  ist? Dann der Grund, sonst `null`. Das Einladen hat nur den Rest aus dem
  Regal gebucht, und der Rechnungsvorschlag zählt die Position nur mit dem
  Rest — ohne die Anforderung zählte sie wieder ganz.
*/
create or replace function app.ruest_eingeladen(a public.material_orders)
  returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  kopf public.einsatz_material;
begin
  if a.ruestliste_id is null or a.ruest_position is null or a.transaction_type <> 'order' then
    return null;
  end if;
  select * into kopf from public.einsatz_material e
   where e.id = a.ruestliste_id and e.company_id = a.company_id;
  if kopf.id is null or not coalesce(kopf.geladen ? a.ruest_position, false) then
    return null;
  end if;
  return 'Gehört zur Rüstliste vom ' || to_char(kopf.date, 'DD.MM.YYYY')
         || coalesce(' (Baustelle ' || nullif(kopf.project_number, '') || ')', '')
         || ', und die Position ist schon eingeladen — gelöscht zählte sie wieder ganz, und Lager und '
         || 'Rechnungsvorschlag stimmten nicht mehr überein. Am selben Tag erst das Einladen zurücknehmen; '
         || 'was nicht gebraucht wurde, geht sonst über die Retoure zurück.';
end;
$$;

revoke all on function app.ruest_eingeladen(public.material_orders) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4./5. Die Gegenbuchung beim Löschen
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20261110120000_material_ablauf_luecken.sql. Neu:
  - „abgerechnet“ aus `app.material_abgerechnet` (auch zurückgesetzt);
  - die Fehlmenge einer eingeladenen Rüstliste (`app.ruest_eingeladen`);
  - ohne Bewegung, aber angelegt, als das Protokoll lief: nichts gebucht;
  - kein stillgelegter Ort.
*/
create or replace function app.loeschen_gegenbuchung(a public.material_orders)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  wirkung boolean;
  plan jsonb;
  z record;
  da numeric;
  abgerechnet text;
  ruest text;
  protokoll_seit timestamptz;
begin
  -- NEU: eine Stelle für „abgerechnet“ — auch für eine verbuchte, inzwischen zurückgesetzte Anforderung.
  abgerechnet := app.material_abgerechnet(a);
  if abgerechnet is not null then
    return jsonb_build_object('moeglich', false, 'grund', abgerechnet ||
      case when a.is_billed or coalesce(a.invoice_number, '') <> ''
           then ' — gelöscht stimmten Rechnung und Lager nicht mehr überein.'
           else '. Eine Korrektur des Bestands geht über die Inventur.' end);
  end if;

  -- NEU: die Fehlmenge einer eingeladenen Rüstliste.
  ruest := app.ruest_eingeladen(a);
  if ruest is not null then
    return jsonb_build_object('moeglich', false, 'grund', ruest);
  end if;

  if not a.processed then
    return jsonb_build_object('moeglich', true, 'gegenbuchung', '[]'::jsonb);
  end if;

  plan := coalesce((
    select jsonb_agg(jsonb_build_object(
             'material_id', b.material_id,
             'name', m.name,
             'einheit', coalesce(nullif(btrim(m.unit), ''), 'Stk'),
             'ort_id', b.lagerort_id,
             'ort', app.ort_name(a.company_id, b.lagerort_id),
             'menge', -b.summe)
           order by b.material_id, b.lagerort_id nulls first)
      from (select l.material_id, l.lagerort_id, sum(l.menge) as summe
              from public.lagerbewegungen l
             where l.material_order_id = a.id
               and l.art = case when a.transaction_type = 'return' then 'retoure' else 'entnahme' end
             group by l.material_id, l.lagerort_id
            having sum(l.menge) <> 0) b
      join public.materials m on m.id = b.material_id
  ), '[]'::jsonb);

  /*
    OHNE BELEG KEINE GEGENBUCHUNG. Eine verbuchte Anforderung mit
    Katalogartikel, eine „neu“ zurückgegebene Retoure: sie haben den Bestand
    bewegt — oder nichts, weil das Regal leer war (die Entnahme klemmt bei
    null, und über null schreibt das Protokoll keine Bewegung).

    NEU: Lief das Bewegungsprotokoll des Betriebs schon, als die Zeile
    angelegt wurde, ist die fehlende Bewegung der Beleg: nichts gebucht,
    nichts zurückzubuchen. Gemessen am Anlegen, nicht am Abholtag — gebucht
    wird nie vor dem Anlegen, also lief das Protokoll dann sicher auch beim
    Buchen; `erledigt_am` und `updated_at` können später liegen als die
    Buchung und bewiesen nichts. Der Beginn ist die erste Bewegung des
    Betriebs: sie entsteht frühestens, als das Protokoll eingespielt war.
    Davor (Altdaten) lässt sich nicht sagen, um wie viel — zurückgebucht
    wird dann nicht geraten.
  */
  wirkung := a.material_id is not null
             and (a.transaction_type = 'order' or a.condition = 'neu');
  if wirkung and jsonb_array_length(plan) = 0 then
    select min(l.created_at) into protokoll_seit
      from public.lagerbewegungen l
     where l.company_id = a.company_id;
    if protokoll_seit is null or a.created_at <= protokoll_seit then
      return jsonb_build_object('moeglich', false, 'grund',
        'Zu dieser Buchung steht keine Bewegung im Protokoll — was sie im Bestand bewirkt hat, ist nicht belegt. '
        || 'Eine Korrektur des Bestands geht über die Inventur.');
    end if;
  end if;

  for z in select * from jsonb_to_recordset(plan)
             as x(material_id uuid, name text, einheit text, ort_id uuid, ort text, menge numeric)
  loop
    -- NEU: an einen stillgelegten Ort bucht nichts — die Ware läge dort, wo sie niemand mehr sieht.
    if z.ort_id is not null
       and exists (select 1 from public.lagerorte o where o.id = z.ort_id and not o.aktiv) then
      return jsonb_build_object('moeglich', false, 'grund',
        z.ort || ' ist stillgelegt — zuerst wieder in Betrieb nehmen, dann löschen.');
    end if;
    -- Eine Gutschrift zurücknehmen geht nur, solange die Ware noch am Ort liegt.
    if z.menge < 0 then
      da := case when z.ort_id is null
                 then (select m.stock from public.materials m where m.id = z.material_id)
                 else (select b.menge from public.lagerbestaende b
                        where b.lagerort_id = z.ort_id and b.material_id = z.material_id) end;
      if coalesce(da, 0) < -z.menge then
        return jsonb_build_object('moeglich', false, 'grund',
          z.ort || ': dort liegen nur noch ' || trim_scale(coalesce(da, 0)) || ' ' || z.einheit || ' ' || z.name
          || ' — die Gutschrift über ' || trim_scale(-z.menge) || ' lässt sich nicht zurückbuchen. '
          || 'Eine Korrektur des Bestands geht über die Inventur.');
      end if;
    end if;
  end loop;

  return jsonb_build_object('moeglich', true, 'gegenbuchung', plan);
end;
$$;

revoke all on function app.loeschen_gegenbuchung(public.material_orders) from public, anon, authenticated;

/*
  DER RIEGEL — Rumpf wie in 20261110120000_material_ablauf_luecken.sql.
  Neu: auch eine unverbuchte Anforderung über die Fehlmenge einer
  eingeladenen Rüstliste löscht nur `anforderung_loeschen` (und das weist
  sie mit Grund ab) — an der Tabelle vorbei zählte die Position wieder ganz.
*/
create or replace function app.verbuchte_anforderung_loeschen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ruest text;
begin
  if app.ist_dienst()
     or app.lager_wert('app.anforderung_loeschen') is not distinct from old.id::text then
    return old;
  end if;
  if old.processed then
    raise exception 'Eine verbuchte Anforderung oder Retoure löscht man in der App über „löschen“ — dabei wird der Bestand zurückgebucht'
      using errcode = '42501';
  end if;
  ruest := app.ruest_eingeladen(old);
  if ruest is not null then
    raise exception '%', ruest using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function app.verbuchte_anforderung_loeschen() from public, anon, authenticated;
