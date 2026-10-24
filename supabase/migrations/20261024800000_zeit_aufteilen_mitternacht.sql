-- ---------------------------------------------------------------------------
-- Aufteilen über Mitternacht (A10 der Durchsicht vom 24.10.2026)
--
-- Eine Nachtschicht — 20:00 bis 04:00 auf eine Baustelle gebucht — liess
-- sich nicht auf Baustellen aufteilen; der Monteur musste sie löschen und
-- jeden Teil einzeln buchen. Jetzt geht es wie am Tag: die Buchung behält
-- Beginn, Pause und den Rest, die Teile schliessen lückenlos an und enden
-- zusammen zur alten Endzeit.
--
-- WO EIN TEIL STEHT. Beginnt er vor Mitternacht, bleibt er am Tag der
-- Buchung, auch wenn er danach endet (wie jede Buchung über Mitternacht).
-- Beginnt er ab Mitternacht, steht er am Folgetag: `date` + 1, die Uhrzeit
-- wie auf der Uhr. Sonst läse jede Rechnung „01:00–03:00“ als den Morgen VOR
-- der Schicht.
--
-- Rumpf wie in 20261010500000_zeit_aufteilen.sql; geändert sind nur die
-- Sperre über Mitternacht (jetzt: Von gleich Bis ist keine Zeit) und die
-- Rechnung über 24 Std. hinaus. Rechte unverändert (`create or replace`
-- behält sie; zur Sicherheit unten noch einmal gesetzt).
-- ---------------------------------------------------------------------------

create or replace function public.zeit_aufteilen(p_id uuid, p_teile jsonb)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  e public.time_entries%rowtype;
  t jsonb;
  beginn integer;
  ende integer;
  arbeit integer;
  summe integer := 0;
  rest integer;
  pos integer;
  minuten integer;
  nummer text;
  kunde text;
  gesehen text[] := '{}';
  neu uuid;
  ids jsonb := '[]'::jsonb;
  bearbeiter text;
  bearbeiter_uid uuid := (select auth.uid());
begin
  if p_teile is null or jsonb_typeof(p_teile) <> 'array' or jsonb_array_length(p_teile) = 0 then
    raise exception 'Mindestens eine weitere Baustelle mit Stunden angeben' using errcode = '22023';
  end if;
  if jsonb_array_length(p_teile) > 10 then
    raise exception 'Höchstens zehn weitere Baustellen auf einmal' using errcode = '22023';
  end if;

  -- Was der Aufrufer nicht sehen darf, gibt es für ihn nicht (Zeilenschutz).
  select * into e from public.time_entries where id = p_id for update;
  if not found then
    raise exception 'Die Buchung gibt es nicht (mehr)' using errcode = 'P0002';
  end if;
  if e.status <> 'Anwesend' or e.start_time is null or e.end_time is null then
    raise exception 'Aufteilen lässt sich nur gearbeitete Zeit mit Von und Bis' using errcode = '22023';
  end if;
  if e.end_time = e.start_time then
    raise exception 'Von und Bis sind gleich — die Buchung hat keine Zeit' using errcode = '22023';
  end if;
  if e.is_billed then
    raise exception 'Die Buchung ist schon verrechnet und bleibt, wie sie ist' using errcode = '42501';
  end if;

  beginn := extract(hour from e.start_time)::integer * 60 + extract(minute from e.start_time)::integer;
  ende := extract(hour from e.end_time)::integer * 60 + extract(minute from e.end_time)::integer;
  -- Über Mitternacht: das Ende liegt am Folgetag.
  if ende < beginn then
    ende := ende + 1440;
  end if;
  arbeit := ende - beginn - coalesce(e.break_duration, 0);
  gesehen := array[btrim(coalesce(e.project_number, ''))];

  for t in select * from jsonb_array_elements(p_teile) loop
    nummer := btrim(coalesce(t ->> 'project_number', ''));
    minuten := (t ->> 'minuten')::integer;
    if nummer = '' then
      raise exception 'Jede weitere Zeit braucht eine Baustelle' using errcode = '22023';
    end if;
    if minuten is null or minuten < 1 then
      raise exception 'Für Baustelle % fehlen die Stunden', nummer using errcode = '22023';
    end if;
    if nummer = any(gesehen) then
      raise exception 'Baustelle % steht doppelt — eine Baustelle bekommt ihre Stunden in einer Zeile', nummer
        using errcode = '22023';
    end if;
    gesehen := gesehen || nummer;
    summe := summe + minuten;
  end loop;

  rest := arbeit - summe;
  if rest < 1 then
    raise exception 'Für die gebuchte Baustelle bleibt keine Zeit — die Teile sind zusammen so lang wie der Tag oder länger'
      using errcode = '22023';
  end if;

  if bearbeiter_uid is distinct from e.user_id then
    select u.name into bearbeiter from public.users u where u.id = bearbeiter_uid;
  end if;

  pos := beginn + coalesce(e.break_duration, 0) + rest;
  update public.time_entries
     set end_time = make_time((pos % 1440) / 60, pos % 60, 0),
         last_edited_by = coalesce(bearbeiter, last_edited_by),
         last_edited_by_uid = case when bearbeiter is null then last_edited_by_uid else bearbeiter_uid end
   where id = p_id;

  for t in select * from jsonb_array_elements(p_teile) loop
    nummer := btrim(t ->> 'project_number');
    minuten := (t ->> 'minuten')::integer;
    select p.customer_name into kunde
      from public.projects p
     where p.company_id = e.company_id and p.project_number = nummer;
    if not found then
      raise exception 'Die Baustelle % gibt es in diesem Betrieb nicht', nummer using errcode = '22023';
    end if;
    neu := gen_random_uuid();
    insert into public.time_entries (
      id, company_id, user_id, user_name, date, status, start_time, end_time, break_duration,
      project_number, customer_name, is_emergency, is_helper, vehicle_plate, nacht_abgewaehlt,
      source, last_edited_by, last_edited_by_uid
    ) values (
      neu, e.company_id, e.user_id, e.user_name, e.date + (pos / 1440), 'Anwesend',
      make_time((pos % 1440) / 60, pos % 60, 0),
      make_time(((pos + minuten) % 1440) / 60, (pos + minuten) % 60, 0), 0,
      nummer, kunde, e.is_emergency, e.is_helper, e.vehicle_plate, e.nacht_abgewaehlt,
      'manual', bearbeiter, case when bearbeiter is null then null else bearbeiter_uid end
    );
    pos := pos + minuten;
    ids := ids || to_jsonb(neu);
  end loop;

  return jsonb_build_object('gekuerzt', p_id, 'neu', ids);
end;
$$;

revoke all on function public.zeit_aufteilen(uuid, jsonb) from public, anon;
grant execute on function public.zeit_aufteilen(uuid, jsonb) to authenticated;
