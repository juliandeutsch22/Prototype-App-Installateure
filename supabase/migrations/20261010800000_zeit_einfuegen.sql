-- ---------------------------------------------------------------------------
-- Eine Zeit zwischen bestehende Buchungen einfügen (10.10.2026)
--
-- WOZU. Der Monteur bucht morgens den Tag auf die Baustelle aus dem
-- Einsatzplan, fährt zwischendurch zu einem Notfall und schreibt dort einen
-- Handwerksschein. Trägt er dessen Zeit am Abend nach, fällt sie mitten in
-- die Tagesbuchung — bisher hiess das: Tagesbuchung von Hand zerlegen. Jetzt
-- kürzt oder teilt diese Funktion die anderen Buchungen und legt die neue
-- dazwischen an:
--
--   A 07:00–16:00 (Pause 30) + B 10:00–12:00
--   → A 07:00–10:00 (Pause 30), B 10:00–12:00, A 12:00–16:00
--
-- Die Pause bleibt als Zahl am längeren Teil. Dieselbe Rechnung steht in
-- `src/features/time/einfuegen.ts`; die Maske zeigt damit vor dem Buchen,
-- was geschieht.
--
-- NUR, WAS SICH EINDEUTIG ZERLEGEN LÄSST: nicht in eine Buchung derselben
-- Baustelle, keine verrechnete, keine über Mitternacht, keine, die die neue
-- Zeit ganz bedeckt (sie verschwände), und nur, wenn die Pause in einen Teil
-- passt. Alles andere bleibt bei den Sperren der Zeitbuchungen.
--
-- IN EINER TRANSAKTION. Gekürzte Buchungen ohne die neue wären verlorene
-- Stunden — es geht alles durch oder nichts.
--
-- MIT DEN RECHTEN DES AUFRUFERS (`security invoker`, wie `zeit_aufteilen`):
-- Zeilenschutz und alle Auslöser der Zeitbuchungen greifen wie beim
-- Buchen von Hand — Überschneidung (auch mit dem Vortag), ganzer Tag,
-- Jugendschutz, Eintritt, Satz und Nacht.
-- ---------------------------------------------------------------------------

create or replace function public.zeit_einfuegen(p_neu jsonb)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  besitzer uuid := nullif(p_neu ->> 'user_id', '')::uuid;
  tag date := nullif(p_neu ->> 'date', '')::date;
  nb integer;
  ne integer;
  nummer text := btrim(coalesce(p_neu ->> 'project_number', ''));
  e public.time_entries%rowtype;
  von integer;
  bis integer;
  pause integer;
  name text;
  vorne boolean;
  hinten boolean;
  geaendert jsonb := '[]'::jsonb;
  dazu jsonb := '[]'::jsonb;
  neu uuid := gen_random_uuid();
  betrieb text;
  bearbeiter text;
  bearbeiter_uid uuid := (select auth.uid());
  anzahl integer := 0;
begin
  if p_neu is null or jsonb_typeof(p_neu) <> 'object' or besitzer is null or tag is null then
    raise exception 'Person und Tag der neuen Zeit fehlen' using errcode = '22023';
  end if;
  if nullif(p_neu ->> 'start_time', '') is null or nullif(p_neu ->> 'end_time', '') is null then
    raise exception 'Einfügen lässt sich nur eine Zeit mit Von und Bis' using errcode = '22023';
  end if;
  nb := extract(hour from (p_neu ->> 'start_time')::time)::integer * 60 + extract(minute from (p_neu ->> 'start_time')::time)::integer;
  ne := extract(hour from (p_neu ->> 'end_time')::time)::integer * 60 + extract(minute from (p_neu ->> 'end_time')::time)::integer;
  if ne <= nb then
    raise exception 'Eine Zeit über Mitternacht lässt sich nicht einfügen — bitte die andere Buchung anpassen' using errcode = '22023';
  end if;
  if nummer = '' then
    raise exception 'Die neue Zeit braucht eine Baustelle' using errcode = '22023';
  end if;

  if bearbeiter_uid is distinct from besitzer then
    select u.name into bearbeiter from public.users u where u.id = bearbeiter_uid;
  end if;

  -- Was der Aufrufer nicht sehen darf, gibt es für ihn nicht (Zeilenschutz).
  for e in
    select * from public.time_entries t
     where t.user_id = besitzer and t.date = tag and t.status = 'Anwesend'
       and app.arbeitsspanne(t.date, t.start_time, t.end_time)
           && tsrange(tag + make_time(nb / 60, nb % 60, 0), tag + make_time(ne / 60, ne % 60, 0))
     order by t.start_time
     for update
  loop
    anzahl := anzahl + 1;
    betrieb := e.company_id;
    von := extract(hour from e.start_time)::integer * 60 + extract(minute from e.start_time)::integer;
    bis := extract(hour from e.end_time)::integer * 60 + extract(minute from e.end_time)::integer;
    name := to_char(e.start_time, 'HH24:MI') || '–' || to_char(e.end_time, 'HH24:MI')
            || coalesce(' (' || nullif(e.project_number, '') || ')', '');
    if btrim(coalesce(e.project_number, '')) = nummer then
      raise exception 'Auf derselben Baustelle ist % schon gebucht — bitte diese Buchung ändern, statt die Zeit einzufügen', name
        using errcode = '22023';
    end if;
    if e.is_billed then
      raise exception '% ist schon verrechnet und bleibt, wie sie ist — einfügen geht dort nicht', name using errcode = '42501';
    end if;
    if bis <= von then
      raise exception '% geht über Mitternacht — dort lässt sich nichts einfügen', name using errcode = '22023';
    end if;
    if nb <= von and bis <= ne then
      raise exception 'Die neue Zeit bedeckt % ganz — bitte diese Buchung zuerst löschen oder ändern', name using errcode = '22023';
    end if;

    vorne := von < nb;
    hinten := ne < bis;
    pause := coalesce(e.break_duration, 0);

    if vorne and hinten then
      -- Geteilt: die Pause bleibt am längeren Teil (gleich lang: am vorderen).
      if (nb - von) >= (bis - ne) then
        if pause >= nb - von then
          raise exception 'Die Pause von % Min. aus % passt in keinen der verbleibenden Teile — bitte die Pause dort anpassen', pause, name
            using errcode = '22023';
        end if;
      elsif pause >= bis - ne then
        raise exception 'Die Pause von % Min. aus % passt in keinen der verbleibenden Teile — bitte die Pause dort anpassen', pause, name
          using errcode = '22023';
      end if;
      update public.time_entries
         set end_time = make_time(nb / 60, nb % 60, 0),
             break_duration = case when (nb - von) >= (bis - ne) then pause else 0 end,
             last_edited_by = coalesce(bearbeiter, last_edited_by),
             last_edited_by_uid = case when bearbeiter is null then last_edited_by_uid else bearbeiter_uid end
       where id = e.id;
      insert into public.time_entries (
        id, company_id, user_id, user_name, date, status, start_time, end_time, break_duration,
        project_number, customer_name, is_emergency, is_helper, vehicle_plate, nacht_abgewaehlt,
        source, last_edited_by, last_edited_by_uid
      ) values (
        gen_random_uuid(), e.company_id, e.user_id, e.user_name, e.date, 'Anwesend',
        make_time(ne / 60, ne % 60, 0), e.end_time,
        case when (nb - von) >= (bis - ne) then 0 else pause end,
        e.project_number, e.customer_name, e.is_emergency, e.is_helper, e.vehicle_plate, e.nacht_abgewaehlt,
        'manual', bearbeiter, case when bearbeiter is null then null else bearbeiter_uid end
      );
      dazu := dazu || to_jsonb(e.id);
    else
      if pause >= (case when vorne then nb - von else bis - ne end) then
        raise exception 'Die Pause von % Min. aus % passt in keinen der verbleibenden Teile — bitte die Pause dort anpassen', pause, name
          using errcode = '22023';
      end if;
      update public.time_entries
         set start_time = case when vorne then start_time else make_time(ne / 60, ne % 60, 0) end,
             end_time = case when vorne then make_time(nb / 60, nb % 60, 0) else end_time end,
             last_edited_by = coalesce(bearbeiter, last_edited_by),
             last_edited_by_uid = case when bearbeiter is null then last_edited_by_uid else bearbeiter_uid end
       where id = e.id;
    end if;
    geaendert := geaendert || to_jsonb(e.id);
  end loop;

  if anzahl = 0 then
    raise exception 'Die Zeit überschneidet sich mit keiner Buchung — es gibt nichts einzufügen' using errcode = '22023';
  end if;

  -- Die neue Zeit, so wie die Maske sie sonst angelegt hätte. Nur diese
  -- Spalten: Verrechnung, Satz, Stunden und Nacht setzt nicht der Aufrufer.
  insert into public.time_entries (
    id, company_id, user_id, user_name, date, status, start_time, end_time, break_duration, travel_time,
    project_number, customer_name, vehicle_plate, helper_name, comment, is_helper, is_emergency,
    is_night_work, nacht_abgewaehlt, source, last_edited_by, last_edited_by_uid
  ) values (
    neu, betrieb, besitzer, p_neu ->> 'user_name', tag, 'Anwesend',
    (p_neu ->> 'start_time')::time, (p_neu ->> 'end_time')::time,
    coalesce(nullif(p_neu ->> 'break_duration', '')::integer, 0),
    nullif(p_neu ->> 'travel_time', '')::integer,
    nummer, nullif(p_neu ->> 'customer_name', ''), nullif(p_neu ->> 'vehicle_plate', ''),
    nullif(p_neu ->> 'helper_name', ''), nullif(p_neu ->> 'comment', ''),
    coalesce((p_neu ->> 'is_helper')::boolean, false), coalesce((p_neu ->> 'is_emergency')::boolean, false),
    coalesce((p_neu ->> 'is_night_work')::boolean, false), nullif(p_neu ->> 'nacht_abgewaehlt', ''),
    'manual', bearbeiter, case when bearbeiter is null then null else bearbeiter_uid end
  );

  return jsonb_build_object('neu', neu, 'geaendert', geaendert, 'geteilt', dazu);
end;
$$;

comment on function public.zeit_einfuegen(jsonb) is
  'Fügt eine gearbeitete Zeit zwischen bestehende Buchungen anderer Baustellen ein: kürzt oder teilt sie und legt die neue an, in einem Zug. Mit den Rechten des Aufrufers.';

revoke all on function public.zeit_einfuegen(jsonb) from public, anon;
grant execute on function public.zeit_einfuegen(jsonb) to authenticated;
