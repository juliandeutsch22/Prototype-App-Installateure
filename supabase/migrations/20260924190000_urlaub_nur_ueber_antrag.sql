-- URLAUB GIBT ES NUR NOCH ALS ANTRAG — und damit einen Resturlaub, nicht zwei.
--
-- Gefunden im Prüflauf vom 24.09.2026: der Monteur konnte einen Tag aus
-- seinem genehmigten Urlaub in der Zeiterfassung löschen (der Antrag blieb
-- „2 Tage genehmigt", das Zeitkonto hatte einen) und mit seinem eigenen
-- Schlüssel über die Schnittstelle einen Urlaubstag anlegen, den nie jemand
-- genehmigt hat. Danach stand auf der Urlaubsseite ein anderer Resturlaub als
-- in der Mitarbeiterübersicht — die eine zählt Anträge, die andere Tage.
--
-- Die Regel ist jetzt dieselbe wie bei Krank:
--   - einen Urlaubstag schreibt nur ein Antrag (genehmigen, Betriebsurlaub,
--     oder das Büro trägt ihn über `urlaub_eintragen` direkt als genehmigt
--     ein);
--   - einen Tag, der zu einem Antrag gehört (Urlaub oder Zeitausgleich),
--     ändert oder löscht nur der Antrag („zurücknehmen");
--   - Zeitausgleich direkt, ohne Antrag, bucht nur das Büro — der Monteur
--     beantragt ihn. So stand es schon in der Maske; jetzt steht es auch hier.
--
-- Und damit beide Zahlen gleich sind, trägt ein genehmigter Urlaubsantrag die
-- Tage, die TATSÄCHLICH gebucht wurden. Bisher blieb die beantragte Zahl
-- stehen, auch wenn beim Genehmigen schon gebuchte Tage übersprungen wurden.

-- ---------------------------------------------------------------------------
-- Übernahme des Altbestands
-- ---------------------------------------------------------------------------

/*
  Ein Urlaubstag ohne Antrag, der in einen genehmigten Urlaubsantrag
  derselben Person fällt, gehört zu diesem. Der Rest wird — wie bei Krank —
  zu genehmigten Anträgen über zusammenhängende Kalendertage. Ohne Push: ein
  genehmigter Antrag meldet beim Anlegen ohnehin nichts.
*/
update public.time_entries e
   set vacation_id = v.id
  from public.vacations v
 where e.status = 'Urlaub'
   and e.vacation_id is null
   and v.company_id = e.company_id
   and v.user_id = e.user_id
   and v.art = 'Urlaub'
   and v.status = 'Genehmigt'
   and e.date between v.von and v.bis;

do $$
declare
  insel record;
  kennung uuid;
begin
  for insel in
    select company_id, user_id, min(user_name) as user_name,
           min(date) as von, max(date) as bis, count(*) as tage, array_agg(id) as eintraege
      from (
        select e.id, e.company_id, e.user_id, e.date,
               coalesce(u.name, e.user_name, 'Unbekannt') as user_name,
               e.date - (dense_rank() over (
                 partition by e.company_id, e.user_id order by e.date))::integer as gruppe
          from public.time_entries e
          left join public.users u on u.id = e.user_id
         where e.status = 'Urlaub' and e.vacation_id is null
      ) urlaub
     group by company_id, user_id, gruppe
  loop
    insert into public.vacations (
      company_id, user_id, user_name, von, bis, tage, status, art,
      entschieden_von_name, entschieden_am)
    values (insel.company_id, insel.user_id, insel.user_name, insel.von, insel.bis,
            insel.tage, 'Genehmigt', 'Urlaub', 'Übernahme aus der Zeiterfassung', now())
    returning id into kennung;
    update public.time_entries set vacation_id = kennung where id = any(insel.eintraege);
  end loop;
end;
$$;

/*
  DIE GENEHMIGTEN TAGE AUF DAS GEBUCHTE ANGLEICHEN. Nur dort, wo überhaupt
  Tage gebucht sind: ein genehmigter Antrag ohne einen einzigen Tag stammt
  aus der Zeit vor dem Durchstich ins Zeitkonto, und was damals genommen
  wurde, weiss hier niemand besser als der Antrag selbst.
*/
-- Der Schutz entschiedener Anträge fragt nach dem Anmeldenden, und eine
-- Migration hat keinen. Für diese eine Angleichung bleibt er kurz aus.
alter table public.vacations disable trigger vacations_entscheidung;

update public.vacations v
   set tage = g.anzahl
  from (
    select vacation_id, count(*) as anzahl
      from public.time_entries
     where vacation_id is not null and status = 'Urlaub'
     group by vacation_id
  ) g
 where v.id = g.vacation_id
   and v.art = 'Urlaub'
   and v.status = 'Genehmigt'
   and v.tage is distinct from g.anzahl;

alter table public.vacations enable trigger vacations_entscheidung;

-- ---------------------------------------------------------------------------
-- Der Wächter
-- ---------------------------------------------------------------------------

/*
  NUR FÜR DIE APP. Genehmigen, Zurücknehmen, Betriebsurlaub und
  `urlaub_eintragen` laufen als Datenbankfunktionen mit den Rechten ihres
  Eigentümers; der Rücklauf aus der Sicherung mit dem Dienstschlüssel. Beide
  sind nicht `authenticated` und dürfen, was dieser Wächter der App verbietet.
*/
create or replace function app.urlaub_nur_ueber_antrag() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.vacation_id is not null then
    raise exception 'Dieser Tag gehört zu einem genehmigten Antrag — er ändert sich nur über den Antrag (Seite Urlaub, „zurücknehmen")'
      using errcode = '42501';
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if new.vacation_id is not null or new.status = 'Urlaub' then
      raise exception 'Urlaub wird beantragt und genehmigt, nicht direkt gebucht'
        using errcode = '42501';
    end if;
    if new.status = 'Zeitausgleich' and not app.ist_buch_oder_spitze() then
      raise exception 'Zeitausgleich beantragt man auf der Seite Urlaub'
        using errcode = '42501';
    end if;
  end if;

  -- Einen Zeitausgleich, den das Büro gebucht hat, nimmt auch nur das Büro
  -- wieder heraus: gelöscht stünde die freie Zeit plötzlich als Guthaben da.
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'Zeitausgleich'
     and not app.ist_buch_oder_spitze() then
    raise exception 'Einen gebuchten Zeitausgleich ändert das Büro'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists time_entries_urlaub_nur_ueber_antrag on public.time_entries;
create trigger time_entries_urlaub_nur_ueber_antrag
  before insert or update or delete on public.time_entries
  for each row execute function app.urlaub_nur_ueber_antrag();

-- ---------------------------------------------------------------------------
-- Das Büro trägt Urlaub direkt ein — als genehmigten Antrag
-- ---------------------------------------------------------------------------

/*
  WOFÜR. Nicht jeder beantragt selbst: der Monteur ohne Telefon, der Anruf
  „ich hab mir doch den Freitag frei genommen". Das Büro hat das bisher in
  der Zeiterfassung als Tagesstatus gebucht — am Antrag vorbei, und damit
  mit einem zweiten Resturlaub. Jetzt entsteht daraus ein genehmigter
  Antrag, und zwar mit genau den Tagen, die gebucht werden: Arbeitstage der
  Person, ohne Tage, an denen schon etwas steht.

  WER: Buchhaltung, Geschäftsführung, Administration — dieselben, die fremde
  Zeiten buchen dürfen. Entschieden hat, wer einträgt; das steht am Antrag.
*/
create or replace function public.urlaub_eintragen(
  p_user uuid,
  p_von date,
  p_bis date,
  p_notiz text default null,
  p_name text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  person public.users;
  tage date[];
  offen date[];
  antrag uuid;
  bemerkung text := nullif(btrim(coalesce(p_notiz, '')), '');
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if not app.ist_buch_oder_spitze() then
    raise exception 'Urlaub direkt eintragen dürfen Buchhaltung, Geschäftsführung und Administration — alle anderen beantragen ihn'
      using errcode = '42501';
  end if;
  if p_von is null or p_bis is null then
    raise exception 'Beginn und Ende angeben' using errcode = '22023';
  end if;
  if p_bis < p_von then
    raise exception 'Das Ende liegt vor dem Beginn' using errcode = '22023';
  end if;
  if p_bis - p_von > 92 then
    raise exception 'Mehr als drei Monate Urlaub am Stück sind ein Tippfehler im Datum'
      using errcode = '22023';
  end if;

  select * into person from public.users where id = p_user;
  if person.id is null or person.company_id is distinct from betrieb then
    raise exception 'Diese Person gibt es im Betrieb nicht' using errcode = 'P0002';
  end if;

  tage := app.urlaubstage(person.work_days, p_von, p_bis);
  select coalesce(array_agg(t order by t), '{}') into offen
    from unnest(tage) t
   where not exists (
     select 1 from public.time_entries e
      where e.company_id = betrieb and e.user_id = person.id and e.date = t);

  if coalesce(array_length(offen, 1), 0) = 0 then
    raise exception 'Im Zeitraum ist kein Arbeitstag mehr frei — an jedem steht schon etwas'
      using errcode = '55000';
  end if;

  insert into public.vacations (
    company_id, user_id, user_name, von, bis, tage, status, art, notiz,
    entschieden_von_uid, entschieden_von_name, entschieden_am)
  values (betrieb, person.id, person.name, p_von, p_bis, array_length(offen, 1),
          'Genehmigt', 'Urlaub', bemerkung, wer, coalesce(p_name, 'Büro'), now())
  returning id into antrag;

  insert into public.time_entries (
    id, company_id, user_id, date, status, break_duration, user_name, vacation_id, comment)
  select gen_random_uuid(), betrieb, person.id, t, 'Urlaub', 0, person.name, antrag,
         coalesce(bemerkung, 'vom Büro eingetragen')
    from unnest(offen) t;

  return jsonb_build_object(
    'id', antrag,
    'tage', array_length(offen, 1),
    'uebersprungen', coalesce(array_length(tage, 1), 0) - array_length(offen, 1));
end;
$$;

revoke all on function public.urlaub_eintragen(uuid, date, date, text, text) from public, anon;
grant execute on function public.urlaub_eintragen(uuid, date, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Genehmigen: der Antrag trägt die gebuchten Tage
-- ---------------------------------------------------------------------------

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

  select * into a from public.vacations where id = p_antrag;
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
            and (e.status in ('Krank', 'Urlaub', 'Zeitausgleich')));
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
         tage = case when p_entscheidung = 'Genehmigt' and a.art = 'Urlaub'
                     then array_length(offen, 1) else public.vacations.tage end
   where id = p_antrag;

  return jsonb_build_object(
    'status', p_entscheidung,
    'angelegt', coalesce(array_length(offen, 1), 0),
    'uebersprungen', coalesce(array_length(tage, 1), 0) - coalesce(array_length(offen, 1), 0),
    'entfernt', entfernt);
end;
$$;

revoke all on function public.urlaub_entscheiden(uuid, text, text, text) from public;
grant execute on function public.urlaub_entscheiden(uuid, text, text, text) to authenticated;
