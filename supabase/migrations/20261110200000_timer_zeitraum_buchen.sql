/*
  ARBEITSTAG PRÜFEN: EIN ZEITRAUM, EINE BUCHUNG (E73, 10.11.2026).

  Bisher wurde jeder Arbeitsabschnitt des Timers einzeln gebucht. Wer
  mittags Pause machte, bekam für dieselbe Baustelle zwei Formulare mit je
  0 Minuten Pause — und das Formular warnte beim längeren Abschnitt vor der
  fehlenden Pause, obwohl sie aufgezeichnet war. Eine Buchung der App ist
  aber „Von, Bis, Pause, Baustelle“, so wie man sie auch von Hand schreibt.

  `zeit_timer_zeitraum_buchen` bucht deshalb einen zusammenhängenden Zeitraum
  der Sitzung — vom ersten bis zum letzten Arbeitsabschnitt, die Pausen
  dazwischen eingeschlossen — als EINE Buchung durch dieselben Trigger wie
  das Formular. Welche Abschnitte zusammengehören (gleiche Baustelle, nur
  durch Pausen getrennt), schlägt die App vor (`timerVorschlaege`); hier wird
  nur geprüft, dass nichts doppelt gebucht wird.

  Wiederholbar wie `zeit_timer_buchen`: dieselbe Eingabe aus dem
  Ausgangsfach liefert dieselbe Buchung; eine andere Eingabe für einen schon
  gebuchten Zeitraum wird abgewiesen. Die Kennung der Buchung ist die des
  ersten Arbeitsabschnitts. `zeit_timer_buchen` bleibt für Abschlüsse, die
  eine ältere Fassung der App noch im Ausgangsfach hat.
*/
create or replace function public.zeit_timer_zeitraum_buchen(p_id uuid, p_von integer, p_bis integer, p_eintrag jsonb) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  s public.zeitsitzungen; seg jsonb; erste jsonb; neu uuid; person public.users; e public.time_entries; pruefsumme text; i integer;
begin
  select * into s from public.zeitsitzungen where id = p_id for update;
  if auth.uid() is null or s.id is null or s.user_id <> auth.uid() or not app.betriebsmitglied(s.company_id) then
    raise exception 'Diese Zeitsitzung gehört einer anderen Person' using errcode = '42501';
  end if;
  if s.stand <> 'beendet' then raise exception 'Bitte die Zeitsitzung zuerst beenden' using errcode = '22023'; end if;
  if p_von is null or p_bis is null or p_von < 0 or p_bis < p_von or p_bis >= jsonb_array_length(s.segmente) then
    raise exception 'Dieser Zeitraum fehlt' using errcode = '22023';
  end if;
  erste := s.segmente -> p_von;
  if erste ->> 'art' <> 'arbeit' or (s.segmente -> p_bis) ->> 'art' <> 'arbeit' then
    raise exception 'Ein Zeitraum beginnt und endet mit Arbeit' using errcode = '22023';
  end if;
  pruefsumme := encode(sha256(convert_to(p_eintrag::text, 'UTF8')), 'hex');

  -- Schon gebucht: dieselbe Eingabe ist eine Wiederholung, eine andere ein Fehler.
  if erste ? 'buchung' then
    for i in p_von .. p_bis loop
      seg := s.segmente -> i;
      if seg ->> 'art' = 'arbeit' and (seg ->> 'buchung' is distinct from erste ->> 'buchung' or seg ->> 'eingabe_hash' is distinct from pruefsumme) then
        raise exception 'Dieser Zeitraum wurde bereits mit anderen Angaben gebucht. Bitte die vorhandene Buchung prüfen.' using errcode = '22023';
      end if;
    end loop;
    return (erste ->> 'buchung')::uuid;
  end if;
  for i in p_von .. p_bis loop
    seg := s.segmente -> i;
    if seg ->> 'art' = 'arbeit' and (seg ? 'buchung' or seg ? 'verworfen_grund') then
      raise exception 'Ein Abschnitt dieses Zeitraums ist schon gebucht oder verworfen. Bitte aktualisieren.' using errcode = '22023';
    end if;
  end loop;

  if p_eintrag is null or jsonb_typeof(p_eintrag) <> 'object' or coalesce(p_eintrag ->> 'status', 'Anwesend') <> 'Anwesend' then
    raise exception 'Ein Timer bestätigt gearbeitete Zeit' using errcode = '22023';
  end if;
  if nullif(p_eintrag ->> 'start_time', '') is null or nullif(p_eintrag ->> 'end_time', '') is null then
    raise exception 'Von und Bis fehlen' using errcode = '22023';
  end if;
  select * into person from public.users where id = s.user_id;
  neu := (erste ->> 'id')::uuid;
  e := jsonb_populate_record(null::public.time_entries, p_eintrag);
  insert into public.time_entries(id, company_id, user_id, user_name, date, status, start_time, end_time, break_duration, travel_time, project_number, customer_name, helper_name, vehicle_plate, comment, is_helper, is_emergency, is_night_work, nacht_abgewaehlt, source, zeitfelder)
    values (neu, s.company_id, s.user_id, person.name, e.date, 'Anwesend', e.start_time, e.end_time, coalesce(e.break_duration, 0), coalesce(e.travel_time, 0), coalesce(e.project_number, ''),
      coalesce(nullif(e.customer_name, ''), (select p.customer_name from public.projects p where p.company_id = s.company_id and p.project_number = e.project_number limit 1), ''),
      coalesce(e.helper_name, ''), coalesce(e.vehicle_plate, ''), coalesce(e.comment, ''), coalesce(e.is_helper, false), coalesce(e.is_emergency, false), coalesce(e.is_night_work, false), e.nacht_abgewaehlt, 'manual', e.zeitfelder);
  for i in p_von .. p_bis loop
    if (s.segmente -> i) ->> 'art' = 'arbeit' then
      s.segmente := jsonb_set(s.segmente, array[i::text], (s.segmente -> i) || jsonb_build_object('buchung', neu, 'eingabe_hash', pruefsumme));
    end if;
  end loop;
  update public.zeitsitzungen
     set segmente = s.segmente,
         abgeschlossen = not exists (select 1 from jsonb_array_elements(s.segmente) v where v ->> 'art' = 'arbeit' and not v ? 'buchung' and not v ? 'verworfen_grund'),
         aktualisiert_am = now()
   where id = p_id;
  return neu;
end $$;
revoke all on function public.zeit_timer_zeitraum_buchen(uuid, integer, integer, jsonb) from public, anon;
grant execute on function public.zeit_timer_zeitraum_buchen(uuid, integer, integer, jsonb) to authenticated;
