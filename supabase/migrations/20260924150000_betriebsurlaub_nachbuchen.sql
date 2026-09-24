-- BETRIEBSURLAUB FÜR SPÄTER EINGETRETENE — und ab dem ersten Arbeitstag.
--
-- Bisher bekam den Betriebsurlaub nur, wer beim Anlegen aktiv war. Wer im
-- Oktober eintrat, stand im Dezember-Betriebsurlaub mit fehlenden Tagen da
-- und musste jeden einzeln als Urlaub beantragen, obwohl der Betrieb zu hat.
--
-- Jetzt bucht die Datenbank nach, sobald jemand dazukommt oder wieder aktiv
-- wird — dieselbe Rechnung wie beim Anlegen, an EINER Stelle. Und beide
-- Wege buchen erst ab dem Starttag in der App: ein Betriebsurlaub, der vor
-- dem Eintritt lag, ist nicht vom Urlaub dieses Menschen abzuziehen.

/*
  EIN BETRIEBSURLAUB FÜR EINE PERSON.

  Gebucht wird, was ab `p_ab` im Zeitraum liegt und an einem Arbeitstag
  dieser Person frei ist — wie beim Genehmigen. Schon gebucht (etwa beim
  zweiten Reaktivieren) heisst: nichts tun. Ohne Häkchen „vom Urlaub
  abbuchen" bucht er nie etwas.
*/
create or replace function app.betriebsurlaub_fuer_person(
  p_bu uuid,
  p_user uuid,
  p_ab date,
  out gebucht integer,
  out uebersprungen integer
)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  b public.betriebsurlaube;
  person public.users;
  beginn date;
  tage date[];
  offen date[];
  antrag uuid;
begin
  gebucht := 0;
  uebersprungen := 0;
  select * into b from public.betriebsurlaube where id = p_bu;
  select * into person from public.users where id = p_user;
  if b.id is null or person.id is null or person.company_id is distinct from b.company_id
     or not b.urlaub_abbuchen then
    return;
  end if;
  if exists (select 1 from public.vacations v
              where v.betriebsurlaub_id = b.id and v.user_id = person.id) then
    return;
  end if;

  beginn := greatest(b.von, coalesce(p_ab, b.von));
  if beginn > b.bis then
    return;
  end if;

  tage := app.urlaubstage(person.work_days, beginn, b.bis);
  select coalesce(array_agg(t order by t), '{}') into offen
    from unnest(tage) t
   where not exists (
     select 1 from public.time_entries e
      where e.company_id = b.company_id and e.user_id = person.id and e.date = t);
  uebersprungen := coalesce(array_length(tage, 1), 0) - coalesce(array_length(offen, 1), 0);
  if coalesce(array_length(offen, 1), 0) = 0 then
    return;
  end if;

  -- `tage` ist, was tatsächlich gebucht wird: der Resturlaub zählt die
  -- genehmigten Tage, und ein übersprungener Tag ist keiner.
  insert into public.vacations (
    company_id, user_id, user_name, von, bis, tage, status, art, notiz,
    entschieden_von_uid, entschieden_von_name, entschieden_am, betriebsurlaub_id)
  values (b.company_id, person.id, person.name, beginn, b.bis, array_length(offen, 1),
          'Genehmigt', 'Urlaub', b.bezeichnung, b.angelegt_von_uid,
          coalesce(b.angelegt_von_name, 'Büro'), now(), b.id)
  returning id into antrag;

  insert into public.time_entries (
    id, company_id, user_id, date, status, break_duration, user_name, vacation_id, comment)
  select gen_random_uuid(), b.company_id, person.id, t, 'Urlaub', 0, person.name, antrag, b.bezeichnung
    from unnest(offen) t;

  gebucht := array_length(offen, 1);
end;
$$;

revoke all on function app.betriebsurlaub_fuer_person(uuid, uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Anlegen: dieselbe Rechnung, ab dem Starttag jedes Einzelnen
-- ---------------------------------------------------------------------------

create or replace function public.betriebsurlaub_anlegen(
  p_von date,
  p_bis date,
  p_bezeichnung text,
  p_abbuchen boolean,
  p_name text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  titel text := btrim(coalesce(p_bezeichnung, ''));
  kennung uuid;
  andere public.betriebsurlaube;
  person record;
  ergebnis record;
  leute integer := 0;
  gebucht integer := 0;
  uebersprungen integer := 0;
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if not app.ist_buch_oder_spitze() then
    raise exception 'Betriebsurlaub legen Buchhaltung, Geschäftsführung oder Administration an'
      using errcode = '42501';
  end if;
  if p_von is null or p_bis is null then
    raise exception 'Beginn und Ende angeben' using errcode = '22023';
  end if;
  if p_bis < p_von then
    raise exception 'Das Ende liegt vor dem Beginn' using errcode = '22023';
  end if;
  if p_bis - p_von > 92 then
    raise exception 'Ein Betriebsurlaub über mehr als drei Monate ist ein Tippfehler im Datum'
      using errcode = '22023';
  end if;
  if titel = '' then titel := 'Betriebsurlaub'; end if;

  select * into andere from public.betriebsurlaube
   where company_id = betrieb and von <= p_bis and bis >= p_von
   order by von limit 1;
  if andere.id is not null then
    raise exception 'Überschneidet sich mit „%" (% bis %)', andere.bezeichnung,
      to_char(andere.von, 'DD.MM.YYYY'), to_char(andere.bis, 'DD.MM.YYYY')
      using errcode = '23P01';
  end if;

  insert into public.betriebsurlaube (
    company_id, von, bis, bezeichnung, urlaub_abbuchen, angelegt_von_uid, angelegt_von_name)
  values (betrieb, p_von, p_bis, titel, coalesce(p_abbuchen, false), wer, p_name)
  returning id into kennung;

  if coalesce(p_abbuchen, false) then
    for person in
      select u.id, u.app_start_date from public.users u
       where u.company_id = betrieb and u.active is not false
       order by u.name
    loop
      -- Ohne Starttag gilt der ganze Zeitraum — so war es vorher auch.
      select * into ergebnis from app.betriebsurlaub_fuer_person(kennung, person.id, person.app_start_date);
      uebersprungen := uebersprungen + ergebnis.uebersprungen;
      if ergebnis.gebucht > 0 then
        leute := leute + 1;
        gebucht := gebucht + ergebnis.gebucht;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'id', kennung, 'mitarbeiter', leute, 'tage', gebucht, 'uebersprungen', uebersprungen);
end;
$$;

revoke all on function public.betriebsurlaub_anlegen(date, date, text, boolean, text) from public, anon;
grant execute on function public.betriebsurlaub_anlegen(date, date, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Nachbuchen: neuer Mitarbeiter, wieder aktiv, anderer Starttag
-- ---------------------------------------------------------------------------

/*
  AB WANN. Ein neuer Mitarbeiter ab seinem Starttag in der App — ohne
  Starttag ab heute: was vor dem Anlegen lag, steckt schon im mitgebrachten
  Resturlaub. Wer nach einer Pause wieder aktiv wird, frühestens ab heute:
  die Zeit dazwischen war er nicht im Betrieb.

  NICHT BEIM RÜCKLAUF AUS DER SICHERUNG. Der spielt die gebuchten Urlaube
  selbst wieder ein; bucht die Datenbank beim Einspielen der Belegschaft
  nach, stünden sie doppelt da. Er läuft mit dem Dienstschlüssel, die App
  nie.
*/
create or replace function app.betriebsurlaub_nachbuchen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ab date;
  b record;
begin
  if app.ist_dienst() or new.active is false then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and not (old.active is false or new.app_start_date is distinct from old.app_start_date) then
    return null;
  end if;

  ab := coalesce(new.app_start_date, current_date);
  if tg_op = 'UPDATE' and old.active is false then
    ab := greatest(ab, current_date);
  end if;

  for b in
    select id from public.betriebsurlaube
     where company_id = new.company_id and urlaub_abbuchen and bis >= ab
     order by von
  loop
    perform app.betriebsurlaub_fuer_person(b.id, new.id, ab);
  end loop;
  return null;
end;
$$;

drop trigger if exists users_betriebsurlaub_nachbuchen on public.users;
create trigger users_betriebsurlaub_nachbuchen
  after insert or update of active, app_start_date on public.users
  for each row execute function app.betriebsurlaub_nachbuchen();
