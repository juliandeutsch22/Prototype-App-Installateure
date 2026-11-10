/*
  URLAUB ENTSCHEIDEN SPERRT DEN ANTRAG (Befund 09.11.2026).

  `urlaub_entscheiden` las den Antrag ohne Sperre. Entschieden zwei
  Berechtigte zur selben Zeit — die Chefin am Telefon, die Buchhaltung am
  Schreibtisch —, sahen beide „Beantragt“ und gingen beide durch. Zweimal
  genehmigt hieß jeder Urlaubstag zweimal im Zeitkonto: zwei Urlaubstage je
  Kalendertag im Saldo, im Monatsbericht und im Resturlaub. Genehmigt und
  abgelehnt zugleich hieß ein abgelehnter Antrag mit gebuchten Urlaubstagen
  daneben, die keine Rücknahme mehr findet (die gibt es nur für genehmigte).

  `for update` lässt die zweite Entscheidung warten, bis die erste fertig
  ist; danach liest sie deren Ergebnis und bricht mit „bereits entschieden“
  ab. Rumpf wie in 20261004200000_freistellungen.sql, nur diese Stelle
  geändert; die Rechte wie zuletzt in 20261027600000_rpc_ohne_anmeldung_sperren.sql.
  Altdaten bleiben, wie sie sind.
*/
create or replace function public.urlaub_entscheiden(
  p_antrag uuid,
  p_entscheidung text,
  p_grund text default '',
  p_entscheider_name text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  a public.vacations;
  arbeitstage smallint[];
  tage date[];
  offen date[];
  entfernt integer := 0;
  begruendung text := btrim(coalesce(p_grund, ''));
  tagesstatus text;
begin
  if betrieb is null or wer is null or not app.angemeldet() then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if p_entscheidung not in ('Genehmigt', 'Abgelehnt', 'Storniert') then
    raise exception 'Unbekannte Entscheidung: %', p_entscheidung using errcode = '22023';
  end if;
  if p_entscheidung in ('Abgelehnt', 'Storniert') and length(begruendung) < 3 then
    raise exception 'Bitte einen Grund angeben' using errcode = '22023';
  end if;
  if not app.darf_urlaub_entscheiden(betrieb) then
    raise exception 'Keine Berechtigung, Urlaub zu entscheiden' using errcode = '42501';
  end if;

  -- Gesperrt: eine gleichzeitige zweite Entscheidung wartet hier und sieht
  -- danach den entschiedenen Stand, statt die Tage ein zweites Mal zu buchen.
  select * into a from public.vacations where id = p_antrag for update;
  if a.id is null or a.company_id is distinct from betrieb then
    raise exception 'Diesen Antrag gibt es nicht' using errcode = 'P0002';
  end if;

  if p_entscheidung = 'Storniert' then
    if a.status <> 'Genehmigt' then
      raise exception 'Nur ein genehmigter Urlaub wird zurückgenommen'
        using errcode = '55000';
    end if;
    delete from public.time_entries
     where company_id = betrieb and vacation_id = p_antrag;
    get diagnostics entfernt = row_count;
  elsif a.status <> 'Beantragt' then
    raise exception 'Über den Antrag ist bereits entschieden' using errcode = '55000';
  end if;

  if p_entscheidung = 'Genehmigt' then
    if a.user_id is null or a.von is null or a.bis is null then
      raise exception 'Dem Antrag fehlen Zeitraum oder Antragsteller' using errcode = '55000';
    end if;

    select u.work_days into arbeitstage from public.users u where u.id = a.user_id;
    tage := app.urlaubstage(arbeitstage, a.von, a.bis);

    if coalesce(array_length(tage, 1), 0) = 0 then
      raise exception 'Im Zeitraum liegt kein Arbeitstag' using errcode = '55000';
    end if;
    if array_length(tage, 1) > 480 then
      raise exception 'Der Zeitraum ist zu lang' using errcode = '22023';
    end if;

    tagesstatus := case when a.art = 'Zeitausgleich' then 'Zeitausgleich' else 'Urlaub' end;

    if a.za_von is not null then
      -- Stundenweise: frei ist der Tag, solange nichts Ganztägiges und kein
      -- zweiter ZA darauf steht. Gearbeitete Zeit daneben ist der Normalfall.
      select coalesce(array_agg(t order by t), '{}') into offen
        from unnest(tage) t
       where not exists (
         select 1 from public.time_entries e
          where e.company_id = betrieb and e.user_id = a.user_id and e.date = t
            and (e.status in ('Krank', 'Urlaub', 'Zeitausgleich', 'Berufsschule',
                              'Dienstverhinderung', 'Pflegefreistellung', 'Unbezahlt')));
    else
      /*
        Bereits gebuchte Tage UEBERSPRINGEN, nicht ueberschreiben. Eine
        erfasste Arbeitsleistung darf eine Genehmigung nicht stillschweigend
        wegwerfen — und niemand wuerde es merken.
      */
      select coalesce(array_agg(t order by t), '{}') into offen
        from unnest(tage) t
       where not exists (
         select 1 from public.time_entries e
          where e.company_id = betrieb and e.user_id = a.user_id and e.date = t);
    end if;

    /*
      NICHTS MEHR FREI, NICHTS ZU GENEHMIGEN. Bisher ging die Genehmigung
      dann durch und buchte null Tage — der Antrag zählte trotzdem als
      genommener Urlaub.
    */
    if a.art = 'Urlaub' and coalesce(array_length(offen, 1), 0) = 0 then
      raise exception 'Im Zeitraum ist jeder Arbeitstag schon gebucht — es gibt nichts zu genehmigen'
        using errcode = '55000';
    end if;

    insert into public.time_entries (
      id, company_id, user_id, date, status, start_time, end_time, break_duration,
      user_name, vacation_id, comment
    )
    select gen_random_uuid(), betrieb, a.user_id, t, tagesstatus, a.za_von, a.za_bis, 0,
           coalesce(a.user_name, 'Mitarbeiter'), p_antrag,
           case when tagesstatus = 'Zeitausgleich' then 'Genehmigter Zeitausgleich'
                else 'Genehmigter Urlaub' end
      from unnest(offen) t;
  end if;

  update public.vacations
     set status = p_entscheidung,
         entschieden_von_uid = wer,
         entschieden_von_name = coalesce(p_entscheider_name, 'Leitung'),
         entschieden_am = now(),
         grund = case when begruendung = '' then public.vacations.grund else begruendung end,
         -- Genehmigt zählen die GEBUCHTEN Tage, nicht die beantragten: ein
         -- übersprungener Tag ist kein Urlaubstag, und der Resturlaub darf
         -- auf der Urlaubsseite nicht anders aussehen als im Zeitkonto.
         -- Der 24./31.12. zählt je einen halben Tag (`app.tagesanteil`).
         tage = case when p_entscheidung = 'Genehmigt' and a.art = 'Urlaub'
                     then (select sum(app.tagesanteil(betrieb, t)) from unnest(offen) t)
                     else public.vacations.tage end
   where id = p_antrag;

  return jsonb_build_object(
    'status', p_entscheidung,
    'angelegt', coalesce(array_length(offen, 1), 0),
    'uebersprungen', coalesce(array_length(tage, 1), 0) - coalesce(array_length(offen, 1), 0),
    'entfernt', entfernt);
end;
$$;

revoke all on function public.urlaub_entscheiden(uuid, text, text, text) from public, anon;
grant execute on function public.urlaub_entscheiden(uuid, text, text, text) to authenticated;
