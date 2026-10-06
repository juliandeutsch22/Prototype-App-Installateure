/*
  RÜSTLISTE: „EINLADEN ZURÜCKGENOMMEN“ STATT „RETOURE“ (Testbericht Runde 3, G15)

  WAS DER BERICHT FAND. Wer den Haken „eingeladen“ am selben Tag
  zurücknahm, sah im Bewegungsprotokoll des Lagers eine „Retoure“ — dasselbe
  Wort wie für Material, das von der Baustelle zurückkommt. Wer das
  Protokoll liest, hielt eine Korrektur am Morgen für eine Rückgabe.

  WAS JETZT GILT.
  - Eine eigene Art `einladen_zurueck` im Protokoll. Eine echte Retoure
    (`retoure_anlegen`, Rückgabe einer Abholung) bleibt `retoure`.
  - Bestehende Zeilen der Rücknahme werden erkannt — sie tragen seit dem
    01.10.2026 den Grund „Rüstliste TT.MM.JJJJ · eingeladen zurückgenommen“ —
    und bekommen die neue Art. Menge, Bestand danach, Grund und Zeitpunkt
    bleiben, wie sie sind; es ändert sich nur die Bezeichnung.
  - `laden_umschalten` sagt jetzt, wie viel es gebucht hat, damit die App
    „1 Stk abgebucht“ bestätigen kann (vorher kam nichts zurück und der Haken
    buchte ohne Meldung ab). Die Rückgabe ändert sich von `void` auf
    `numeric`; dafür wird die Funktion neu angelegt.
*/

alter table public.lagerbewegungen drop constraint if exists lagerbewegungen_art_check;
alter table public.lagerbewegungen add constraint lagerbewegungen_art_check check (art in (
  'anfangsbestand', 'eingang', 'entnahme', 'retoure', 'inventur', 'zugang', 'abgang', 'einladen_zurueck'));

/*
  NUR DIE BEZEICHNUNG. Erkannt am Grund, den `laden_umschalten` seit dem
  01.10.2026 schreibt; eine echte Retoure trägt diesen Grund nie.
*/
update public.lagerbewegungen
   set art = 'einladen_zurueck'
 where art = 'retoure'
   and grund like 'Rüstliste % · eingeladen zurückgenommen';

drop function if exists public.laden_umschalten(date, text, text, boolean, text);

/*
  MIT EIGENTÜMERRECHTEN, weil der Monteur den Bestand nicht selbst bewegen
  darf (`materials_felder`). Wer abhaken darf, prüft die Funktion wie der
  Wächter der Rüstliste: die Leitung oder wer für den Einsatz eingeteilt ist.

  Rückgabe: die gebuchte Menge — beim Einladen die abgebuchte, beim
  Zurücknehmen die zurückgebuchte; 0, wenn nichts zu buchen war.
*/
create function public.laden_umschalten(
  p_datum date,
  p_baustelle text,
  p_position text,
  p_an boolean,
  p_von text
) returns numeric
  language plpgsql
  security definer
  set search_path = ''
as $$
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
        gebucht := least(coalesce(pos.menge, 0), greatest(artikel.stock, 0));
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
