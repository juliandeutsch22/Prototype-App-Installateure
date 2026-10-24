-- ---------------------------------------------------------------------------
-- Einfügen auch beim Bearbeiten und über Mitternacht (A11 der Durchsicht
-- vom 24.10.2026)
--
-- 1. BEIM BEARBEITEN. Wer eine bestehende Buchung so ändert, dass sie in
--    Buchungen anderer Baustellen hineinreicht, bekam die Sperre „überschneidet
--    sich“ und musste löschen und neu anlegen. Jetzt nimmt `zeit_einfuegen`
--    die Kennung der geänderten Buchung (`p_id`): die anderen werden gekürzt
--    oder geteilt wie beim Anlegen, und die geänderte Buchung bekommt ihre
--    neuen Werte — in einem Zug.
--
-- 2. ÜBER MITTERNACHT. Gerechnet wird in Minuten ab Mitternacht des Tages
--    der neuen Zeit: eine Buchung vom Vortag beginnt im Minus, eine vom
--    Folgetag ab 1440. Mitgeprüft werden daher Vortag, Tag und Folgetag. Ein
--    Teil steht an dem Tag, an dem er beginnt (wie beim Aufteilen, A10) —
--    sonst läse jede Rechnung „01:00–04:00“ als den Morgen VOR der Schicht.
--
-- Sonst wie in 20261010800000_zeit_einfuegen.sql: nicht in dieselbe
-- Baustelle, keine verrechnete, keine ganz bedeckte, die Pause bleibt am
-- längeren Teil; eine Transaktion; mit den Rechten des Aufrufers, damit
-- Zeilenschutz und alle Auslöser der Zeitbuchungen greifen.
--
-- Die alte Fassung mit einem Wert fällt weg: zwei Fassungen nebeneinander
-- machten den Aufruf mit benannten Werten mehrdeutig. Wer nur `p_neu`
-- schickt (eine ältere App), legt wie bisher neu an.
-- ---------------------------------------------------------------------------

drop function if exists public.zeit_einfuegen(jsonb);

/*
  Ein Stück in Minuten ab Mitternacht von `p_tag` als Tag und Uhrzeiten. Der
  Tag ist der, an dem das Stück beginnt; endet es am nächsten, steht das Ende
  vor dem Beginn — so liest jede Rechnung eine Buchung über Mitternacht.
*/
create or replace function app.einfuegen_stueck(p_tag date, p_von integer, p_bis integer,
  out tag date, out beginn time, out ende time)
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  select p_tag + floor(p_von / 1440.0)::integer,
         make_time((((p_von % 1440) + 1440) % 1440) / 60, (((p_von % 1440) + 1440) % 1440) % 60, 0),
         make_time((((p_bis % 1440) + 1440) % 1440) / 60, (((p_bis % 1440) + 1440) % 1440) % 60, 0)
$$;

revoke all on function app.einfuegen_stueck(date, integer, integer) from public, anon;
grant execute on function app.einfuegen_stueck(date, integer, integer) to authenticated;

create or replace function public.zeit_einfuegen(p_neu jsonb, p_id uuid default null)
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
  alt public.time_entries%rowtype;
  von integer;
  bis integer;
  versatz integer;
  pause integer;
  name text;
  vorne boolean;
  hinten boolean;
  stueck record;
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
  if ne = nb then
    raise exception 'Von und Bis sind gleich — die Zeit hat keine Dauer' using errcode = '22023';
  end if;
  -- Über Mitternacht: das Ende liegt am Folgetag.
  if ne < nb then
    ne := ne + 1440;
  end if;
  if nummer = '' then
    raise exception 'Die neue Zeit braucht eine Baustelle' using errcode = '22023';
  end if;

  -- Die geänderte Buchung: dieselbe Person, gearbeitet, nicht verrechnet.
  if p_id is not null then
    select * into alt from public.time_entries where id = p_id for update;
    if not found then
      raise exception 'Die Buchung gibt es nicht (mehr)' using errcode = 'P0002';
    end if;
    if alt.user_id is distinct from besitzer then
      raise exception 'Die Buchung gehört jemand anderem' using errcode = '22023';
    end if;
    if alt.is_billed then
      raise exception 'Die Buchung ist schon verrechnet und bleibt, wie sie ist' using errcode = '42501';
    end if;
  end if;

  if bearbeiter_uid is distinct from besitzer then
    select u.name into bearbeiter from public.users u where u.id = bearbeiter_uid;
  end if;

  -- Was der Aufrufer nicht sehen darf, gibt es für ihn nicht (Zeilenschutz).
  for e in
    select * from public.time_entries t
     where t.user_id = besitzer and t.date between tag - 1 and tag + 1 and t.status = 'Anwesend'
       and t.id is distinct from p_id
       and app.arbeitsspanne(t.date, t.start_time, t.end_time)
           && tsrange(tag + make_interval(mins => nb), tag + make_interval(mins => ne))
     order by t.date, t.start_time
     for update
  loop
    anzahl := anzahl + 1;
    betrieb := e.company_id;
    versatz := (e.date - tag) * 1440;
    von := versatz + extract(hour from e.start_time)::integer * 60 + extract(minute from e.start_time)::integer;
    bis := versatz + extract(hour from e.end_time)::integer * 60 + extract(minute from e.end_time)::integer;
    if bis <= von then
      bis := bis + 1440;
    end if;
    name := to_char(e.start_time, 'HH24:MI') || '–' || to_char(e.end_time, 'HH24:MI')
            || case when e.date < tag then ' am Vortag' when e.date > tag then ' am Folgetag' else '' end
            || coalesce(' (' || nullif(e.project_number, '') || ')', '');
    if btrim(coalesce(e.project_number, '')) = nummer then
      raise exception 'Auf derselben Baustelle ist % schon gebucht — bitte diese Buchung ändern, statt die Zeit einzufügen', name
        using errcode = '22023';
    end if;
    if e.is_billed then
      raise exception '% ist schon verrechnet und bleibt, wie sie ist — einfügen geht dort nicht', name using errcode = '42501';
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
      select * into stueck from app.einfuegen_stueck(tag, von, nb);
      update public.time_entries
         set end_time = stueck.ende,
             break_duration = case when (nb - von) >= (bis - ne) then pause else 0 end,
             last_edited_by = coalesce(bearbeiter, last_edited_by),
             last_edited_by_uid = case when bearbeiter is null then last_edited_by_uid else bearbeiter_uid end
       where id = e.id;
      select * into stueck from app.einfuegen_stueck(tag, ne, bis);
      insert into public.time_entries (
        id, company_id, user_id, user_name, date, status, start_time, end_time, break_duration,
        project_number, customer_name, is_emergency, is_helper, vehicle_plate, nacht_abgewaehlt,
        source, last_edited_by, last_edited_by_uid
      ) values (
        gen_random_uuid(), e.company_id, e.user_id, e.user_name, stueck.tag, 'Anwesend',
        stueck.beginn, stueck.ende,
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
      -- Bleibt nur der hintere Teil, kann er am Folgetag beginnen: dann wandert die Buchung dorthin.
      if vorne then
        select * into stueck from app.einfuegen_stueck(tag, von, nb);
      else
        select * into stueck from app.einfuegen_stueck(tag, ne, bis);
      end if;
      update public.time_entries
         set date = stueck.tag,
             start_time = stueck.beginn,
             end_time = stueck.ende,
             last_edited_by = coalesce(bearbeiter, last_edited_by),
             last_edited_by_uid = case when bearbeiter is null then last_edited_by_uid else bearbeiter_uid end
       where id = e.id;
    end if;
    geaendert := geaendert || to_jsonb(e.id);
  end loop;

  if anzahl = 0 then
    raise exception 'Die Zeit überschneidet sich mit keiner Buchung — es gibt nichts einzufügen' using errcode = '22023';
  end if;

  if p_id is null then
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
  else
    -- Die geänderte Buchung bekommt ihre neuen Werte — erst jetzt, da die
    -- anderen Platz gemacht haben. Dieselben Spalten wie beim Anlegen.
    neu := p_id;
    update public.time_entries
       set date = tag,
           start_time = (p_neu ->> 'start_time')::time,
           end_time = (p_neu ->> 'end_time')::time,
           break_duration = coalesce(nullif(p_neu ->> 'break_duration', '')::integer, 0),
           travel_time = nullif(p_neu ->> 'travel_time', '')::integer,
           project_number = nummer,
           customer_name = nullif(p_neu ->> 'customer_name', ''),
           vehicle_plate = nullif(p_neu ->> 'vehicle_plate', ''),
           helper_name = nullif(p_neu ->> 'helper_name', ''),
           comment = nullif(p_neu ->> 'comment', ''),
           is_helper = coalesce((p_neu ->> 'is_helper')::boolean, false),
           is_emergency = coalesce((p_neu ->> 'is_emergency')::boolean, false),
           is_night_work = coalesce((p_neu ->> 'is_night_work')::boolean, false),
           nacht_abgewaehlt = nullif(p_neu ->> 'nacht_abgewaehlt', ''),
           last_edited_by = coalesce(bearbeiter, last_edited_by),
           last_edited_by_uid = case when bearbeiter is null then last_edited_by_uid else bearbeiter_uid end
     where id = p_id;
  end if;

  return jsonb_build_object('neu', neu, 'geaendert', geaendert, 'geteilt', dazu);
end;
$$;

comment on function public.zeit_einfuegen(jsonb, uuid) is
  'Fügt eine gearbeitete Zeit zwischen bestehende Buchungen anderer Baustellen ein — neu oder als Änderung der Buchung p_id —, auch über Mitternacht: kürzt oder teilt die anderen, in einem Zug. Mit den Rechten des Aufrufers.';

revoke all on function public.zeit_einfuegen(jsonb, uuid) from public, anon;
grant execute on function public.zeit_einfuegen(jsonb, uuid) to authenticated;
