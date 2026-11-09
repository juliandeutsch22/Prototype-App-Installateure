/*
  KRANK IM URLAUB (§ 5 UrlG; Befund 09.11.2026).

  Erkrankt jemand während des Urlaubs und dauert die Erkrankung länger als
  drei Kalendertage, werden die Werktage der Erkrankung nicht auf den Urlaub
  angerechnet — vorausgesetzt, sie wurde gemeldet und ist ärztlich bestätigt
  (§ 5 Abs 2 und 3 UrlG). Bisher übersprang `krankmeldung_speichern` die
  Urlaubstage: sie blieben verbraucht, und in der Lohn-CSV fehlten die
  Krankentage.

  Jetzt erkennt das Speichern die genehmigten Urlaubstage im Zeitraum und
  meldet sie. Umgewandelt wird erst auf ausdrückliche Bestätigung
  (`p_urlaub_anrechnen`): das prüft das Büro, weil es die Meldung und die
  Bestätigung des Arztes kennt. Dann wird der Urlaubstag zum Krankentag, der
  Antrag zählt ihn nicht mehr (`tage` um den Tagesanteil kürzer), und am
  Antrag steht, welcher Tag wann umgewandelt wurde (`krank_tage`) — ohne
  Namen, wie die übrigen Zeitpunkte am Antrag (20261012200000_verlaeufe.sql).

  WIRD DIE KRANKMELDUNG KÜRZER ODER GELÖSCHT, kommt der Urlaub an diesen
  Tagen zurück, solange der Antrag genehmigt ist; ebenso, wenn sie danach
  nicht mehr länger als drei Kalendertage dauert. Alles in einer
  Transaktion, an den Rechten des Aufrufers vorbei wie bisher.

  Altdaten bleiben: die neue Spalte beginnt leer, nichts wird nachträglich
  umgewandelt.
*/

alter table public.vacations
  add column if not exists krank_tage jsonb not null default '[]'::jsonb;

comment on column public.vacations.krank_tage is
  'Urlaubstage, die wegen Krankheit nicht angerechnet werden (§ 5 UrlG): je Tag {tag, anteil, meldung, frei, vermerk, am}. Nur über krankmeldung_speichern.';

/*
  DIE SPALTE SCHREIBT NUR DIE DATENBANK. Wer sie selbst setzen könnte,
  schriebe sich Urlaubstage zurück, ohne dass ein Krankentag dasteht.
*/
create or replace function app.urlaub_krank_tage_fest() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.krank_tage is distinct from '[]'::jsonb)
     or (tg_op = 'UPDATE' and new.krank_tage is distinct from old.krank_tage) then
    raise exception 'Krankentage im Urlaub entstehen nur über die Krankmeldung'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.urlaub_krank_tage_fest() from public, anon, authenticated;

drop trigger if exists vacations_krank_tage_fest on public.vacations;
create trigger vacations_krank_tage_fest before insert or update on public.vacations
  for each row execute function app.urlaub_krank_tage_fest();

/*
  DEN URLAUB ZURÜCKGEBEN: die umgewandelten Tage dieser Meldung, die nicht
  mehr in `p_bleiben` stehen, werden wieder Urlaub — im genehmigten Antrag,
  mit derselben Kennung des Sonderurlaubs und demselben Vermerk wie vorher.
  Ist der Antrag inzwischen zurückgenommen, bleibt der Tag leer.
*/
create or replace function app.krank_im_urlaub_zurueck(p_meldung uuid, p_bleiben date[])
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v public.vacations;
  weg date[];
  neu date[];
  zurueck numeric;
  gesamt integer := 0;
begin
  for v in
    select * from public.vacations x
     where x.krank_tage @> jsonb_build_array(jsonb_build_object('meldung', p_meldung::text))
     for update
  loop
    select coalesce(array_agg((el ->> 'tag')::date), '{}') into weg
      from jsonb_array_elements(v.krank_tage) el
     where el ->> 'meldung' = p_meldung::text
       and not ((el ->> 'tag')::date = any (coalesce(p_bleiben, '{}')));
    continue when coalesce(array_length(weg, 1), 0) = 0;

    delete from public.time_entries
     where krankmeldung_id = p_meldung and date = any (weg);

    neu := '{}';
    if v.status = 'Genehmigt' then
      with eingefuegt as (
        insert into public.time_entries (
          id, company_id, user_id, date, status, break_duration, user_name, vacation_id, freistellung_id, comment)
        select gen_random_uuid(), v.company_id, v.user_id, (el ->> 'tag')::date, 'Urlaub', 0,
               coalesce(v.user_name, 'Mitarbeiter'), v.id, nullif(el ->> 'frei', '')::uuid,
               coalesce(nullif(el ->> 'vermerk', ''), 'Genehmigter Urlaub')
          from jsonb_array_elements(v.krank_tage) el
         where el ->> 'meldung' = p_meldung::text
           and (el ->> 'tag')::date = any (weg)
           and not exists (
             select 1 from public.time_entries e
              where e.company_id = v.company_id and e.user_id = v.user_id and e.date = (el ->> 'tag')::date)
        returning date)
      select coalesce(array_agg(date), '{}') into neu from eingefuegt;
    end if;

    select coalesce(sum((el ->> 'anteil')::numeric), 0) into zurueck
      from jsonb_array_elements(v.krank_tage) el
     where el ->> 'meldung' = p_meldung::text and (el ->> 'tag')::date = any (neu);

    update public.vacations
       set tage = coalesce(tage, 0) + zurueck,
           krank_tage = (
             select coalesce(jsonb_agg(el), '[]'::jsonb)
               from jsonb_array_elements(v.krank_tage) el
              where not (el ->> 'meldung' = p_meldung::text and (el ->> 'tag')::date = any (weg)))
     where id = v.id;
    gesamt := gesamt + coalesce(array_length(neu, 1), 0);
  end loop;
  return gesamt;
end;
$$;
revoke all on function app.krank_im_urlaub_zurueck(uuid, date[]) from public, anon, authenticated;

/*
  KRANKMELDUNG SPEICHERN — Rumpf wie zuletzt (20260924120000_abwesenheiten.sql);
  neu: `p_urlaub_anrechnen`, das Zurückgeben beim Kürzen und die Auskunft
  über Urlaubstage im Zeitraum. Ein Parameter mehr heißt eine neue Signatur:
  die alte geht, damit kein Aufruf zwischen zwei Fassungen wählen muss.
*/
drop function if exists public.krankmeldung_speichern(uuid, uuid, date, date, text, text);

create or replace function public.krankmeldung_speichern(
  p_id uuid,
  p_user uuid,
  p_von date,
  p_bis date,
  p_notiz text default null,
  p_melder_name text default null,
  p_urlaub_anrechnen boolean default false
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  k public.krankmeldungen;
  person public.users;
  tage date[];
  kennung uuid;
  angelegt integer := 0;
  entfernt integer := 0;
  andere public.krankmeldungen;
  kalendertage integer := p_bis - p_von + 1;
  darf_anrechnen boolean;
  angerechnet integer := 0;
  zurueckgegeben integer := 0;
  u record;
  -- Die Tage noch einmal unter eigenem Namen: neben `vacations.tage` wäre `tage` mehrdeutig.
  zeitraum date[];
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if p_von is null or p_bis is null then
    raise exception 'Beginn und Ende angeben' using errcode = '22023';
  end if;
  if p_bis < p_von then
    raise exception 'Das Ende liegt vor dem Beginn' using errcode = '22023';
  end if;

  if p_id is not null then
    select * into k from public.krankmeldungen where id = p_id for update;
    if k.id is null or k.company_id is distinct from betrieb then
      raise exception 'Diese Krankmeldung gibt es nicht' using errcode = 'P0002';
    end if;
    select * into person from public.users where id = k.user_id;
  else
    select * into person from public.users
     where id = coalesce(p_user, wer) and company_id = betrieb;
    if person.id is null then
      raise exception 'Diesen Mitarbeiter gibt es nicht' using errcode = 'P0002';
    end if;
  end if;

  if person.id <> wer and not app.ist_buch_oder_spitze() then
    raise exception 'Eine Krankmeldung für jemand anderen erfasst das Büro'
      using errcode = '42501';
  end if;

  /*
    WER URLAUB IN KRANKENSTAND UMWANDELT: wer über Urlaub entscheidet — es
    gibt verbrauchte Urlaubstage zurück. Für sich selbst nur, wenn sonst
    niemand entscheidet (Vier-Augen-Prinzip wie beim Urlaub).
  */
  darf_anrechnen := app.darf_urlaub_entscheiden(betrieb)
    and (person.id <> wer or not app.entscheidet_jemand_anderer(betrieb, person.id));
  if coalesce(p_urlaub_anrechnen, false) then
    if not darf_anrechnen then
      raise exception 'Urlaubstage in Krankenstand umwandeln darf, wer über Urlaub entscheidet — für sich selbst nur, wenn sonst niemand entscheidet'
        using errcode = '42501';
    end if;
    if kalendertage <= 3 then
      raise exception 'Der Urlaub zählt weiter: angerechnet wird eine Erkrankung im Urlaub erst, wenn sie länger als drei Kalendertage dauert (§ 5 UrlG)'
        using errcode = '22023';
    end if;
  end if;

  tage := app.urlaubstage(person.work_days, p_von, p_bis);
  if coalesce(array_length(tage, 1), 0) = 0 then
    raise exception 'Im Zeitraum liegt kein Arbeitstag' using errcode = '55000';
  end if;
  if array_length(tage, 1) > 480 then
    raise exception 'Der Zeitraum ist zu lang' using errcode = '22023';
  end if;
  zeitraum := tage;

  -- Zwei Krankmeldungen über denselben Tag hiessen: wer den einen Zeitraum
  -- kürzt, räumt Tage weg, die der andere noch braucht.
  select * into andere from public.krankmeldungen
   where company_id = betrieb and user_id = person.id
     and id is distinct from p_id
     and von <= p_bis and bis >= p_von
   order by von limit 1;
  if andere.id is not null then
    raise exception 'Überschneidet sich mit der Krankmeldung vom % bis % — bitte dort das Ende ändern',
      to_char(andere.von, 'DD.MM.YYYY'), to_char(andere.bis, 'DD.MM.YYYY')
      using errcode = '23P01';
  end if;

  if k.id is null then
    insert into public.krankmeldungen (
      company_id, user_id, user_name, von, bis, notiz, gemeldet_von_uid, gemeldet_von_name)
    values (betrieb, person.id, person.name, p_von, p_bis, nullif(btrim(coalesce(p_notiz, '')), ''),
            wer, coalesce(p_melder_name, person.name))
    returning id into kennung;
  else
    kennung := k.id;
    update public.krankmeldungen
       set von = p_von, bis = p_bis,
           notiz = nullif(btrim(coalesce(p_notiz, '')), '')
     where id = kennung;
    /*
      Umgewandelte Urlaubstage, die nicht mehr im Zeitraum liegen — oder alle,
      wenn die Erkrankung nicht mehr länger als drei Kalendertage dauert —,
      werden wieder Urlaub.
    */
    zurueckgegeben := app.krank_im_urlaub_zurueck(
      kennung, case when kalendertage > 3 then tage else '{}'::date[] end);
  end if;

  delete from public.time_entries
   where krankmeldung_id = kennung and not (date = any(tage));
  get diagnostics entfernt = row_count;

  insert into public.time_entries (
    id, company_id, user_id, date, status, break_duration, user_name, krankmeldung_id, comment)
  select gen_random_uuid(), betrieb, person.id, t, 'Krank', 0, person.name, kennung, 'Krankmeldung'
    from unnest(tage) t
   where not exists (
     select 1 from public.time_entries e
      where e.company_id = betrieb and e.user_id = person.id and e.date = t);
  get diagnostics angelegt = row_count;

  /*
    GENEHMIGTER URLAUB IM ZEITRAUM WIRD KRANKENSTAND — nur auf ausdrückliche
    Bestätigung (oben geprüft). Urlaub, kein Zeitausgleich: der ist kein
    Urlaubsanspruch.
  */
  if coalesce(p_urlaub_anrechnen, false) then
    for u in
      select e.id as eintrag, e.date as tag, e.freistellung_id as frei, e.comment as vermerk, v.id as antrag
        from public.time_entries e
        join public.vacations v on v.id = e.vacation_id
       where e.company_id = betrieb and e.user_id = person.id and e.date = any(zeitraum)
         and e.status = 'Urlaub' and e.krankmeldung_id is null
         and v.status = 'Genehmigt' and coalesce(v.art, 'Urlaub') = 'Urlaub'
       order by e.date
    loop
      delete from public.time_entries where id = u.eintrag;
      insert into public.time_entries (
        id, company_id, user_id, date, status, break_duration, user_name, krankmeldung_id, comment)
      values (gen_random_uuid(), betrieb, person.id, u.tag, 'Krank', 0, person.name, kennung, 'Krankmeldung');
      update public.vacations
         set tage = coalesce(public.vacations.tage, 0) - app.tagesanteil(betrieb, u.tag),
             krank_tage = krank_tage || jsonb_build_array(jsonb_build_object(
               'tag', u.tag, 'anteil', app.tagesanteil(betrieb, u.tag), 'meldung', kennung::text,
               'frei', u.frei, 'vermerk', u.vermerk, 'am', now()))
       where id = u.antrag;
      angerechnet := angerechnet + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'id', kennung,
    'angelegt', angelegt,
    'entfernt', entfernt,
    -- Tage mit einem Eintrag, der nicht von dieser Meldung stammt: dort war
    -- schon gearbeitet oder Urlaub gebucht. Sie bleiben, wie sie sind.
    'uebersprungen', (
      select count(*) from unnest(tage) t
       where exists (
         select 1 from public.time_entries e
          where e.company_id = betrieb and e.user_id = person.id and e.date = t
            and e.krankmeldung_id is distinct from kennung)),
    'kalendertage', kalendertage,
    -- Genehmigte Urlaubstage, die noch im Zeitraum stehen: das Büro kann sie
    -- umwandeln, wenn die Erkrankung länger als drei Kalendertage dauert.
    'urlaub_im_zeitraum', (
      select count(*) from public.time_entries e
        join public.vacations v on v.id = e.vacation_id
       where e.company_id = betrieb and e.user_id = person.id and e.date = any(zeitraum)
         and e.status = 'Urlaub' and e.krankmeldung_id is null
         and v.status = 'Genehmigt' and coalesce(v.art, 'Urlaub') = 'Urlaub'),
    'darf_anrechnen', darf_anrechnen and kalendertage > 3,
    'urlaub_angerechnet', angerechnet,
    'urlaub_zurueck', zurueckgegeben);
end;
$$;

revoke all on function public.krankmeldung_speichern(uuid, uuid, date, date, text, text, boolean) from public, anon;
grant execute on function public.krankmeldung_speichern(uuid, uuid, date, date, text, text, boolean) to authenticated;

/*
  KRANKMELDUNG LÖSCHEN — Rumpf wie in 20260924120000_abwesenheiten.sql; neu:
  umgewandelte Urlaubstage werden wieder Urlaub, bevor die Krankentage gehen.
*/
create or replace function public.krankmeldung_loeschen(p_id uuid) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  k public.krankmeldungen;
  entfernt integer := 0;
  zurueck integer := 0;
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  select * into k from public.krankmeldungen where id = p_id for update;
  if k.id is null or k.company_id is distinct from betrieb then
    raise exception 'Diese Krankmeldung gibt es nicht' using errcode = 'P0002';
  end if;
  if k.user_id <> wer and not app.ist_buch_oder_spitze() then
    raise exception 'Eine Krankmeldung für jemand anderen löscht das Büro'
      using errcode = '42501';
  end if;
  -- Gezählt vorher: auch die Krankentage, an deren Stelle gleich wieder Urlaub steht, gehen.
  select count(*) into entfernt from public.time_entries where krankmeldung_id = p_id;
  -- Erst der Urlaub zurück: er ersetzt die umgewandelten Krankentage.
  zurueck := app.krank_im_urlaub_zurueck(p_id, '{}'::date[]);
  -- Zuerst die Tage: der Fremdschlüssel würde sie sonst nur loslösen, und
  -- sie blieben als gewöhnliche Krank-Tage stehen.
  delete from public.time_entries where krankmeldung_id = p_id;
  delete from public.krankmeldungen where id = p_id;
  return entfernt;
end;
$$;

revoke all on function public.krankmeldung_loeschen(uuid) from public, anon;
grant execute on function public.krankmeldung_loeschen(uuid) to authenticated;
