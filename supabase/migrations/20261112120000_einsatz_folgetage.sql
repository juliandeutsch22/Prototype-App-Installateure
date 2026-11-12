/*
  EIN EINSATZ ÜBER MEHRERE TAGE (B4/F2, E85, 12.11.2026).

  „Einsatz planen“ kannte genau einen Tag. Wer eine Woche Bad einteilte,
  speicherte fünfmal — am Handy fünf Wege durch das Formular. Diese Funktion
  übernimmt die Einteilung des ersten Tags (der wie bisher mit
  `einsatz_speichern` gespeichert wird, samt Rüstliste) auf die Folgetage,
  in einem Aufruf und mit denselben Prüfungen je Tag, die das Formular
  heute anzeigt:

  - Wochenende: ausgelassen, wenn „nur Werktage“ gewählt ist.
  - Gesetzlicher Feiertag und Betriebsurlaub: der Tag wird ausgelassen.
  - Ganztags abwesend (Urlaub, Krankenstand, Berufsschule, Freistellung —
    dieselbe Quelle wie der Wochenplan): die Person an diesem Tag nicht.
  - Schon auf einer anderen Baustelle: eingeteilt wie im Formular, aber
    genannt (vormittags hier, nachmittags dort ist Alltag).
  - Ist der Tag für diese Baustelle schon geplant, wird ERGÄNZT, nicht
    ersetzt: eine bestehende Einteilung eines anderen Tages still zu
    überschreiben wäre genau der Fehler, den das Formular beim Einzeltag
    mit seiner Warnung verhindert.

  Was an einem Tag nicht ging, steht in der Antwort je Tag — nichts wird
  still übersprungen. Die Rüstliste gilt wie bisher je Tag: eine vorhandene
  bekommt die neue Mannschaft (`uids`), eine neue entsteht hier nicht.

  GRENZE MIT GRUND: höchstens 62 Tage je Aufruf — das Fenster, in dem die
  Abwesenheiten gelesen werden (`wochenplan_abwesend`); darüber hinaus
  wüsste die Prüfung nichts mehr.

  Schreiben darf, wer Einsätze schreiben darf (`assignments_schreiben`:
  Führung). Der Betrieb kommt aus der Anmeldung (`app.arbeitsbetrieb()`).

  GRENZE MIT GRUND (Datenschutz): nicht im Einblick des Supports. Die
  Abwesenheiten der Belegschaft liest nur der Betrieb selbst
  (`wochenplan_abwesend`); ohne sie würde still jemand im Urlaub eingeteilt.
*/
create or replace function public.einsatz_folgetage(
  p_von date,
  p_bis date,
  p_baustelle text,
  p_zeilen jsonb,
  p_nur_werktage boolean default true
) returns table (
  datum date,
  ergebnis text,
  eingeteilt text[],
  abwesend text[],
  anderswo text[]
)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  tag date;
  urlaub text;
  zeile jsonb;
  uid uuid;
  name text;
  neu integer;
  vorher integer;
  rein text[];
  weg text[];
  dort text[];
begin
  if betrieb is null or not coalesce(app.ist_fuehrung(), false) then
    raise exception 'Einsätze plant die Führung' using errcode = '42501';
  end if;
  -- Im Einblick des Supports liefert die Abwesenheit nichts (sie liest nur
  -- für Mitglieder des Betriebs). Ohne sie würde hier still jemand im
  -- Urlaub eingeteilt — also nicht.
  if betrieb is distinct from app.betrieb() then
    raise exception 'Über mehrere Tage plant im Einblick nur der Betrieb selbst' using errcode = '42501';
  end if;
  if p_von is null or p_bis is null or p_bis < p_von or p_bis - p_von > 61 then
    raise exception 'Der Zeitraum geht über höchstens 62 Tage' using errcode = '22023';
  end if;
  if coalesce(btrim(p_baustelle), '') = '' or jsonb_typeof(p_zeilen) <> 'array' or jsonb_array_length(p_zeilen) = 0 then
    raise exception 'Baustelle und Mannschaft fehlen' using errcode = '22023';
  end if;

  for tag in select d::date from generate_series(p_von, p_bis, interval '1 day') d loop
    datum := tag;
    eingeteilt := '{}';
    abwesend := '{}';
    anderswo := '{}';

    if p_nur_werktage and extract(isodow from tag) in (6, 7) then
      ergebnis := 'wochenende';
      return next;
      continue;
    end if;
    if app.ist_feiertag(tag) then
      ergebnis := 'feiertag';
      return next;
      continue;
    end if;
    select b.bezeichnung into urlaub from public.betriebsurlaube b
     where b.company_id = betrieb and tag between b.von and b.bis limit 1;
    if urlaub is not null then
      ergebnis := 'betriebsurlaub';
      abwesend := array[urlaub];
      urlaub := null;
      return next;
      continue;
    end if;

    select count(*) into vorher from public.assignments a
     where a.company_id = betrieb and a.date = tag and a.project_number = p_baustelle;
    neu := 0;
    rein := '{}';
    weg := '{}';
    dort := '{}';
    for zeile in select * from jsonb_array_elements(p_zeilen) loop
      uid := (zeile ->> 'user_id')::uuid;
      name := coalesce(nullif(btrim(zeile ->> 'user_name'), ''), 'Mitarbeiter');
      if exists (select 1 from public.wochenplan_abwesend(tag, tag) w where w.user_id = uid and w.zeiten is null) then
        weg := weg || name;
        continue;
      end if;
      if exists (select 1 from public.assignments a
                  where a.company_id = betrieb and a.date = tag and a.project_number <> p_baustelle and a.user_id = uid) then
        dort := dort || name;
      end if;
      if exists (select 1 from public.assignments a
                  where a.company_id = betrieb and a.date = tag and a.project_number = p_baustelle and a.user_id = uid) then
        continue;
      end if;
      insert into public.assignments (
        company_id, date, project_number, user_id, user_name, as_helper, comment, created_by, zeit_von, zeit_bis
      ) values (
        betrieb, tag, p_baustelle, uid, zeile ->> 'user_name',
        coalesce((zeile ->> 'as_helper')::boolean, false),
        zeile ->> 'comment', zeile ->> 'created_by',
        nullif(zeile ->> 'zeit_von', '')::time, nullif(zeile ->> 'zeit_bis', '')::time
      );
      neu := neu + 1;
      rein := rein || name;
    end loop;

    if neu > 0 then
      update public.einsatz_material m
         set uids = (select coalesce(array_agg(distinct a.user_id), '{}'::uuid[]) from public.assignments a
                      where a.company_id = betrieb and a.date = tag and a.project_number = p_baustelle)
       where m.company_id = betrieb and m.date = tag and m.project_number = p_baustelle;
    end if;

    eingeteilt := rein;
    abwesend := weg;
    anderswo := dort;
    ergebnis := case
      when neu > 0 and vorher > 0 then 'ergaenzt'
      when neu > 0 then 'geplant'
      when array_length(weg, 1) = jsonb_array_length(p_zeilen) then 'alle_abwesend'
      else 'unveraendert'
    end;
    return next;
  end loop;
end;
$$;

revoke all on function public.einsatz_folgetage(date, date, text, jsonb, boolean) from public, anon;
grant execute on function public.einsatz_folgetage(date, date, text, jsonb, boolean) to authenticated;
