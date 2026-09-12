-- Den Handwerksschein schreiben: Kopf und Positionen in einem Zug.
--
-- In Firestore war der Schein EIN Dokument; Zeiten, Material und Fotos lagen
-- als Arrays darin, und ein Schreibvorgang erfasste alles zusammen. Hier sind
-- es vier Tabellen. Getrennt geschrieben gaebe es einen Augenblick, in dem
-- der Kopf steht und die Stunden fehlen — und wenn der Monteur in genau
-- diesem Augenblick unterschreibt, ist ein halber Beleg eingefroren.

/*
  WAS DIESE FUNKTION NICHT KANN, UND ZWAR MIT ABSICHT.

  Sie schreibt den INHALT eines Entwurfs. Die Spaltenliste unten nennt genau
  die Felder, die ein Entwurf aendern darf. `status`, die Unterschriften,
  `inhalt_hash` und `unterschrieben_am` stehen nicht darauf — sie sind kein
  Inhalt, sondern der Zustand des Belegs, und der wechselt ueber eigene Wege
  (`signWorkSheet`, `cancelWorkSheet`, …), die der Trigger
  `app.schein_zustandswechsel` beurteilt.

  Damit kann diese Funktion einen Schein weder unterschreiben noch
  stornieren, egal was ihr uebergeben wird.

  `null` fuer eine der drei Listen heisst UNBERUEHRT LASSEN, nicht „leeren".
  Die Fotoliste wird nach jedem Upload einzeln geschrieben, ohne dass der
  Monteur seinen Entwurf gespeichert haette; eine leere Liste waere dort das
  Gegenteil dessen, was gemeint ist.
*/
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
        company_id, work_sheet_id, position, name, menge, einheit
      ) values (
        betrieb, p_id, lauf, zeile ->> 'name',
        (zeile ->> 'menge')::numeric, nullif(zeile ->> 'einheit', '')
      );
      lauf := lauf + 1;
    end loop;
  end if;

  if p_fotos is not null then
    delete from public.work_sheet_photos where work_sheet_id = p_id;
    for zeile in select * from jsonb_array_elements(p_fotos) loop
      insert into public.work_sheet_photos (
        company_id, work_sheet_id, pfad, hash, bytes, geraet_zeit
      ) values (
        betrieb, p_id, zeile ->> 'pfad', zeile ->> 'hash',
        (zeile ->> 'bytes')::bigint,
        -- Als ISO-Zeichenkette, weil `objektAlsZeile` sie so liefert: die
        -- Umrechnung von Millisekunden steht an EINER Stelle, nicht an zweien.
        (zeile ->> 'geraet_zeit')::timestamptz
      );
    end loop;
  end if;

  return p_id;
end;
$$;

revoke all on function public.schein_speichern(uuid, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.schein_speichern(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Unterschreiben
-- ---------------------------------------------------------------------------

/*
  BEIDE UNTERSCHRIFTEN, DER ZUSTAND UND DIE SERVERZEIT IN EINEM SCHREIBVORGANG.

  Getrennt gaebe es einen Augenblick, in dem der Schein unterschrieben und
  noch aenderbar ist — genau das Fenster, das es nicht geben darf.

  Die Serverzeit kommt vom Server, die Geraetezeit steckt in den
  Unterschriften. Beide werden gebraucht: offline im Keller erfasst, ist die
  Serverzeit die der spaeteren Uebertragung und nicht die der Unterschrift.
*/
create or replace function public.schein_unterschreiben(
  p_id uuid,
  p_monteur jsonb,
  p_kunde jsonb
) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  getroffen integer;
begin
  update public.work_sheets
     set status = 'Unterschrieben',
         unterschrift_monteur = p_monteur,
         unterschrift_kunde = p_kunde,
         unterschrieben_am = now()
   where id = p_id and company_id = app.betrieb();

  get diagnostics getroffen = row_count;
  if getroffen = 0 then
    raise exception 'Diesen Schein gibt es nicht' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.schein_unterschreiben(uuid, jsonb, jsonb) from public;
grant execute on function public.schein_unterschreiben(uuid, jsonb, jsonb) to authenticated;
