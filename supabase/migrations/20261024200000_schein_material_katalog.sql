/*
  KATALOGBEZUG AN DEN MATERIALZEILEN DES SCHEINS (Grenze aus T-19, 24.10.2026)

  WAS FEHLTE. Eine Materialzeile am Schein trug Name, Menge und Einheit, aber
  keine Kennung des Katalogartikels. Der Vorschlag „ausgegeben, aber auf
  keinem Schein“ (T-19) glich Schein und Ausgabe deshalb nur über den Namen
  ab: hiess der Artikel auf der Anforderung anders als auf dem Schein — etwa
  weil der Katalog dazwischen umbenannt wurde —, stand er doppelt da.

  WAS SICH ÄNDERT. `material_id` hält fest, aus welchem Katalogartikel die
  Zeile gewählt wurde; eine freie Zeile hat keine. Mehr nicht:
  - Kein Fremdschlüssel. Ein Artikel darf aus dem Katalog verschwinden, der
    unterschriebene Schein nicht — und dessen Positionen sind eingefroren
    (`app.scheinpositionen_eingefroren`), ein „on delete set null“ liefe
    dort gegen die Wand.
  - Nicht in der Prüfsumme (`app.schein_hash`, `_shared/scheinHash.ts`). Der
    Kunde unterschreibt Name, Menge und Einheit; die Kennung ist ein Verweis
    für das Büro. Bestehende Prüfsummen bleiben damit gültig.
  - Bestehende Zeilen bleiben ohne Kennung; der Abgleich fällt dort auf den
    Namen zurück wie bisher.

  `schein_speichern` bleibt, wie es war (Rumpf aus
  `20260912170000_schein.sql`); neu ist nur die Spalte beim Material.
*/
alter table public.work_sheet_material add column if not exists material_id uuid;

create or replace function public.schein_speichern(
  p_id uuid,
  p_kopf jsonb,
  p_zeiten jsonb,
  p_material jsonb,
  p_fotos jsonb
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  alt public.work_sheets;
  neu public.work_sheets;
  zeile jsonb;
  lauf integer;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  select * into alt from public.work_sheets where id = p_id;

  if alt.id is null then
    -- Anlegen. Der Zeilenschutz besteht darauf, dass es ein Entwurf auf den
    -- eigenen Namen ist; hier wird nichts zusaetzlich geprueft, sondern nur
    -- gesetzt, was der Aufrufer nicht selbst bestimmen darf.
    neu := jsonb_populate_record(null::public.work_sheets, p_kopf);
    insert into public.work_sheets (
      id, company_id, project_number, customer_id, customer_name, address,
      datum, status, abrechnung, notizen, erstellt_von_uid, erstellt_von_name
    ) values (
      p_id, betrieb, neu.project_number, neu.customer_id, neu.customer_name,
      neu.address, neu.datum, 'Entwurf', neu.abrechnung, neu.notizen,
      auth.uid(), neu.erstellt_von_name
    );
  elsif p_kopf is not null then
    /*
      `jsonb_populate_record` mit der ALTEN Zeile als Grundlage: was in
      `p_kopf` nicht vorkommt, behaelt seinen Wert. So ist ein Teilschreiben
      moeglich, ohne dass jedes Feld einzeln abgefragt werden muss.
    */
    neu := jsonb_populate_record(alt, p_kopf);
    update public.work_sheets set
      project_number = neu.project_number,
      customer_id    = neu.customer_id,
      customer_name  = neu.customer_name,
      address        = neu.address,
      datum          = neu.datum,
      abrechnung     = neu.abrechnung,
      notizen        = neu.notizen
     where id = p_id;
  end if;

  if p_zeiten is not null then
    delete from public.work_sheet_hours where work_sheet_id = p_id;
    lauf := 0;
    for zeile in select * from jsonb_array_elements(p_zeiten) loop
      insert into public.work_sheet_hours (
        company_id, work_sheet_id, position, datum, mitarbeiter,
        von, bis, pause_min, minuten, taetigkeit, helfer
      ) values (
        betrieb, p_id, lauf, (zeile ->> 'datum')::date, zeile ->> 'mitarbeiter',
        (nullif(zeile ->> 'von', ''))::time, (nullif(zeile ->> 'bis', ''))::time,
        coalesce((zeile ->> 'pause_min')::integer, 0),
        (zeile ->> 'minuten')::integer, zeile ->> 'taetigkeit',
        coalesce((zeile ->> 'helfer')::boolean, false)
      );
      lauf := lauf + 1;
    end loop;
  end if;

  if p_material is not null then
    delete from public.work_sheet_material where work_sheet_id = p_id;
    lauf := 0;
    for zeile in select * from jsonb_array_elements(p_material) loop
      insert into public.work_sheet_material (
        company_id, work_sheet_id, position, name, menge, einheit, material_id
      ) values (
        betrieb, p_id, lauf, zeile ->> 'name',
        (zeile ->> 'menge')::numeric, nullif(zeile ->> 'einheit', ''),
        -- Nur ein Verweis: was keine Kennung ist, wird weggelassen, statt den
        -- ganzen Schein am Speichern zu hindern.
        case when zeile ->> 'material_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then (zeile ->> 'material_id')::uuid end
      );
      lauf := lauf + 1;
    end loop;
  end if;

  if p_fotos is not null then
    delete from public.work_sheet_photos where work_sheet_id = p_id;
    lauf := 0;
    for zeile in select * from jsonb_array_elements(p_fotos) loop
      insert into public.work_sheet_photos (
        company_id, work_sheet_id, position, pfad, hash, bytes, geraet_zeit
      ) values (
        betrieb, p_id, lauf, zeile ->> 'pfad', zeile ->> 'hash',
        (zeile ->> 'bytes')::bigint,
        -- Als ISO-Zeichenkette, weil `objektAlsZeile` sie so liefert: die
        -- Umrechnung von Millisekunden steht an EINER Stelle, nicht an zweien.
        (zeile ->> 'geraet_zeit')::timestamptz
      );
      lauf := lauf + 1;
    end loop;
  end if;

  return p_id;
end;
$$;

revoke all on function public.schein_speichern(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.schein_speichern(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
