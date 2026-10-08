-- Genehmigende sehen einen vollständigen Monat. Gründe bleiben so geschützt wie im Wochenplan.
-- JSON als einzelne Antwort vermeidet die Zeilengrenze bei vielen Berufsschultagen.
create or replace function public.genehmigung_abwesend(p_von date, p_bis date) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  ergebnis jsonb;
begin
  if not app.betriebsmitglied(betrieb) or not (
    app.darf_urlaub_entscheiden(betrieb) or app.support_liest(betrieb)) then
    raise exception 'Diese Übersicht ist nur für Genehmigende' using errcode = '42501';
  end if;
  if p_von is null or p_bis is null or p_bis < p_von or p_bis - p_von > 62 then
    raise exception 'Der Zeitraum darf höchstens 63 Tage umfassen' using errcode = '22023';
  end if;
  with abwesend(user_id, von, bis, grund, zeiten) as (
with erlaubt as (
    select true as ok, (app.ist_fuehrung() or app.ist_buch_oder_spitze()) as leitung,
      app.ist_buch_oder_spitze() as buero
  ),
  frei as (
    select f.*,
           least(f.bis, coalesce((select v.von - 1 from public.vacations v
                                   where v.id = f.ueber_urlaub_id and v.status = 'Genehmigt'), f.bis)) as frei_bis
      from public.freistellungen f
     where f.company_id = app.arbeitsbetrieb()
       and f.status = 'Bestätigt'
  )
  select v.user_id, greatest(v.von, p_von), least(v.bis, p_bis),
         case when e.leitung then
           case when v.art = 'Zeitausgleich' then 'ZA' else 'Urlaub' end
         end,
         case when v.za_von is not null then
           to_char(v.za_von, 'HH24:MI') || '–' || to_char(v.za_bis, 'HH24:MI')
         end
    from public.vacations v, erlaubt e
   where e.ok
     and v.company_id = app.arbeitsbetrieb()
     and v.status = 'Genehmigt'
     and v.bis >= p_von and v.von <= p_bis
     and p_bis >= p_von and p_bis - p_von <= 62
  union all
  select k.user_id, greatest(k.von, p_von), least(k.bis, p_bis),
         case when e.buero then 'Krank' end,
         null::text
    from public.krankmeldungen k, erlaubt e
   where e.ok
     and k.company_id = app.arbeitsbetrieb()
     and k.bis >= p_von and k.von <= p_bis
     and p_bis >= p_von and p_bis - p_von <= 62
  union all
  -- Berufsschule (4.1): je Tag, wie sie gebucht ist. Die Leitung sieht den
  -- Grund, alle anderen „abwesend" — wie beim Urlaub.
  select t.user_id, t.date, t.date,
         case when e.leitung then 'Berufsschule' end,
         null::text
    from public.time_entries t, erlaubt e
   where e.ok
     and t.company_id = app.arbeitsbetrieb()
     and t.status = 'Berufsschule'
     and t.date between p_von and p_bis
     and p_bis >= p_von and p_bis - p_von <= 62
  union all
  select f.user_id, greatest(f.von, p_von), least(f.frei_bis, p_bis),
         case when e.leitung then
           case f.art when 'dienstverhinderung' then 'Sonderurlaub'
                      when 'pflegefreistellung' then 'Pflegefreistellung'
                      else 'Unbezahlt' end
         end,
         case when f.zeit_von is not null then
           to_char(f.zeit_von, 'HH24:MI') || '–' || to_char(f.zeit_bis, 'HH24:MI')
         end
    from frei f, erlaubt e
   where e.ok
     and f.frei_bis >= p_von and f.von <= p_bis
     and f.frei_bis >= f.von
     and p_bis >= p_von and p_bis - p_von <= 62
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', a.user_id, 'name', u.name, 'von', a.von, 'bis', a.bis,
    'grund', a.grund, 'zeiten', a.zeiten) order by u.name, a.von, a.bis), '[]'::jsonb)
    into ergebnis from abwesend a join public.users u on u.id = a.user_id and u.company_id = betrieb;
  return ergebnis;
end;
$$;
revoke all on function public.genehmigung_abwesend(date, date) from public, anon;
grant execute on function public.genehmigung_abwesend(date, date) to authenticated;
