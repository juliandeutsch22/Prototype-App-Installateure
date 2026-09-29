/*
  DER 24. UND 31. DEZEMBER ALS HALBE TAGE (Handbuch „Was noch fehlt").

  Kollektivvertrag Metallgewerbe, Abschnitt VI Punkt 23 — er gilt auch für
  die Innung der Sanitär-, Heizungs- und Lüftungstechniker: an beiden Tagen
  endet die Normalarbeitszeit um 12 Uhr, und Urlaub an beiden zusammen
  zählt als EIN Urlaubstag. Bis hierher zählte die App beide als volle Tage:
  das Soll war um einen halben Tag je Termin zu hoch, der Urlaub um einen
  halben Tag zu teuer.

  EINE EINSTELLUNG, AB WERK AN. Ein Betrieb ohne diesen Kollektivvertrag
  schaltet sie ab (`companies.dezember_halbtage`).

  WAS DIE DATENBANK DAVON RECHNET: nur den Urlaubsverbrauch — `vacations.tage`
  entsteht hier (Eintragen, Genehmigen, Betriebsurlaub). Soll, Gutschrift und
  Zuschlag rechnet die App aus den Buchungen (`shared/feiertage.ts`,
  `tagesAnteil`); die Monatssicht liefert ihr dafür die Zahl der Krank- und
  Urlaubstage an diesen beiden Terminen, gezählt, nicht bewertet — wie
  bisher bei Krank und Urlaub überhaupt.

  Nimmt jemand nur einen der beiden Tage, zählt er einen halben Urlaubstag.
  Der Vertrag spricht nur von beiden zusammen; anders ginge es aber nicht
  auf, denn auch das Soll dieses Tages ist ein halbes.
*/

/*
  WIEDERHOLBAR. Die Angleichung des Bestands ganz unten rechnet um einen
  halben Tag je Termin — ein zweiter Lauf zöge ihn ein zweites Mal ab. Sie
  läuft deshalb nur in dem Lauf, der die Spalte anlegt; alles andere hier ist
  `create or replace` und darf beliebig oft laufen (die Prüfungen spielen
  frühere Migrationen erneut ein und diese danach).
*/
select set_config('senklot.dezember_neu', (not exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'companies'
     and column_name = 'dezember_halbtage'))::text, false);

alter table public.companies
  add column if not exists dezember_halbtage boolean not null default true;

comment on column public.companies.dezember_halbtage is
  '24. und 31. Dezember als halbe Tage (KV Metallgewerbe): Soll bis 12 Uhr, beide '
  'Urlaubstage zusammen einer, Arbeit danach mit 100 % Zuschlag ausgewiesen.';

-- ---------------------------------------------------------------------------
-- Der Anteil eines Tages — dieselbe Regel wie `tagesAnteil` in der App
-- ---------------------------------------------------------------------------

create or replace function app.tagesanteil(p_betrieb text, p_tag date) returns numeric
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select case
    when to_char(p_tag, 'MM-DD') in ('12-24', '12-31')
     and coalesce((select c.dezember_halbtage from public.companies c where c.id = p_betrieb), true)
    then 0.5
    else 1
  end::numeric
$$;

-- Nur für die Funktionen hier; einen Betrieb abfragen soll darüber niemand.
revoke all on function app.tagesanteil(text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Die Monatssicht — die Fassung aus 20260928130000, eine Spalte mehr
-- ---------------------------------------------------------------------------

create or replace view public.monthly_stats as
  select
    t.company_id,
    t.user_id,
    to_char(t.date, 'YYYY-MM')                                   as monat,
    sum(app.arbeitsminuten(t.status, t.start_time, t.end_time,
                           t.break_duration, t.hours, t.date))   as anwesend_min,
    count(*) filter (where t.status = 'Krank')                   as krank_tage,
    count(*) filter (where t.status = 'Urlaub')                  as urlaub_tage,
    -- Die Tage MIT Buchung, aufsteigend. Noetig fuer die Lueckenrechnung:
    -- „an welchen Werktagen fehlt eine Buchung?" laesst sich aus Summen nicht
    -- beantworten.
    array_agg(distinct to_char(t.date, 'YYYY-MM-DD') order by to_char(t.date, 'YYYY-MM-DD'))
                                                                 as tage,
    -- Krank- und Urlaubstage am 24./31.12. — gezählt; ob sie halb wiegen,
    -- entscheidet die Einstellung erst in der App.
    count(*) filter (where t.status in ('Krank', 'Urlaub')
                       and to_char(t.date, 'MM-DD') in ('12-24', '12-31'))
                                                                 as abwesend_halbtage
    from public.time_entries t
   group by t.company_id, t.user_id, to_char(t.date, 'YYYY-MM');

alter view public.monthly_stats set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Eintragen, Genehmigen, Betriebsurlaub: `tage` mit dem halben Tag.
-- Die Fassungen aus 20260924190000, 20260924220000 und 20260924120000;
-- geändert ist nur, was `tage` wird.
-- ---------------------------------------------------------------------------

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
  wert numeric;
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

  -- Was die Tage vom Anspruch verbrauchen: der 24./31.12. je einen halben.
  select sum(app.tagesanteil(betrieb, t)) into wert from unnest(offen) t;

  insert into public.vacations (
    company_id, user_id, user_name, von, bis, tage, status, art, notiz,
    entschieden_von_uid, entschieden_von_name, entschieden_am)
  values (betrieb, person.id, person.name, p_von, p_bis, wert,
          'Genehmigt', 'Urlaub', bemerkung, wer, coalesce(p_name, 'Büro'), now())
  returning id into antrag;

  insert into public.time_entries (
    id, company_id, user_id, date, status, break_duration, user_name, vacation_id, comment)
  select gen_random_uuid(), betrieb, person.id, t, 'Urlaub', 0, person.name, antrag,
         coalesce(bemerkung, 'vom Büro eingetragen')
    from unnest(offen) t;

  return jsonb_build_object(
    'id', antrag,
    'tage', wert,
    'uebersprungen', coalesce(array_length(tage, 1), 0) - array_length(offen, 1));
end;
$$;

revoke all on function public.urlaub_eintragen(uuid, date, date, text, text) from public, anon;
grant execute on function public.urlaub_eintragen(uuid, date, date, text, text) to authenticated;

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

revoke all on function public.urlaub_entscheiden(uuid, text, text, text) from public;
grant execute on function public.urlaub_entscheiden(uuid, text, text, text) to authenticated;

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
  -- Ausgenommen: arbeitet in dieser Zeit, bekommt also keinen Urlaub gebucht
  -- — auch nicht beim Nachbuchen nach einem Wiedereintritt.
  if person.id = any(b.ausgenommen) then
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
  values (b.company_id, person.id, person.name, beginn, b.bis,
          (select sum(app.tagesanteil(b.company_id, t)) from unnest(offen) t),
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

create or replace function public.betriebsurlaub_anlegen(
  p_von date,
  p_bis date,
  p_bezeichnung text,
  p_abbuchen boolean,
  p_name text default null,
  p_ausgenommen uuid[] default '{}'
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
  ausnahmen uuid[];
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

  /*
    NUR PERSONEN AUS DIESEM BETRIEB. Eine fremde Kennung in der Liste bewirkte
    nichts — sie stünde aber da und sähe aus wie eine Ausnahme. Doppelte
    fallen weg.
  */
  select coalesce(array_agg(distinct u.id), '{}') into ausnahmen
    from public.users u
   where u.company_id = betrieb and u.id = any(coalesce(p_ausgenommen, '{}'));
  if coalesce(array_length(ausnahmen, 1), 0) <> coalesce(array_length(
       array(select distinct x from unnest(coalesce(p_ausgenommen, '{}')) x), 1), 0) then
    raise exception 'Ausgenommen werden kann nur, wer zum Betrieb gehört'
      using errcode = '22023';
  end if;

  insert into public.betriebsurlaube (
    company_id, von, bis, bezeichnung, urlaub_abbuchen, angelegt_von_uid, angelegt_von_name,
    ausgenommen)
  values (betrieb, p_von, p_bis, titel, coalesce(p_abbuchen, false), wer, p_name, ausnahmen)
  returning id into kennung;

  if coalesce(p_abbuchen, false) then
    for person in
      select u.id, u.app_start_date from public.users u
       where u.company_id = betrieb and u.active is not false
         and not (u.id = any(ausnahmen))
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

  /*
    Gemeldet werden die URLAUBSTAGE, nicht die Buchungen: sie unterscheiden
    sich um den halben 24. und 31. Dezember. `gebucht` zählt weiter die
    Buchungen — für die Frage, wer überhaupt etwas bekommen hat.
  */
  return jsonb_build_object(
    'id', kennung, 'mitarbeiter', leute,
    'tage', (select coalesce(sum(v.tage), 0) from public.vacations v where v.betriebsurlaub_id = kennung),
    'uebersprungen', uebersprungen);
end;
$$;

revoke all on function public.betriebsurlaub_anlegen(date, date, text, boolean, text, uuid[]) from public, anon;
grant execute on function public.betriebsurlaub_anlegen(date, date, text, boolean, text, uuid[]) to authenticated;

create or replace function public.betriebsurlaub_loeschen(p_id uuid) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  b public.betriebsurlaube;
  tage numeric := 0;
  buchungen integer := 0;
  leute integer := 0;
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if not app.ist_buch_oder_spitze() then
    raise exception 'Betriebsurlaub löschen Buchhaltung, Geschäftsführung oder Administration'
      using errcode = '42501';
  end if;
  select * into b from public.betriebsurlaube where id = p_id for update;
  if b.id is null or b.company_id is distinct from betrieb then
    raise exception 'Diesen Betriebsurlaub gibt es nicht' using errcode = 'P0002';
  end if;

  -- Die Urlaubstage, wie sie am Antrag stehen — mit dem halben 24./31.12.
  select coalesce(sum(v.tage), 0) into tage
    from public.vacations v where v.betriebsurlaub_id = p_id;
  delete from public.time_entries
   where company_id = betrieb
     and vacation_id in (select v.id from public.vacations v where v.betriebsurlaub_id = p_id);
  get diagnostics buchungen = row_count;
  delete from public.vacations where betriebsurlaub_id = p_id;
  get diagnostics leute = row_count;
  delete from public.betriebsurlaube where id = p_id;

  return jsonb_build_object('tage', tage, 'mitarbeiter', leute);
end;
$$;

revoke all on function public.betriebsurlaub_loeschen(uuid) from public, anon;
grant execute on function public.betriebsurlaub_loeschen(uuid) to authenticated;
-- ---------------------------------------------------------------------------
-- Umschalten rechnet den Urlaub nach
-- ---------------------------------------------------------------------------

/*
  WARUM NACHRECHNEN UND NICHT NUR KÜNFTIG. Das Zeitkonto rechnet die App bei
  jeder Anzeige aus den Buchungen — mit der Einstellung von JETZT, auch für
  vergangene Jahre. `vacations.tage` dagegen steht fest am Antrag. Bliebe er
  beim Umschalten stehen, zeigte die Urlaubsseite einen anderen Resturlaub als
  die Mitarbeiterübersicht, und keiner der beiden wüsste davon.

  Nachgerechnet wird um den Unterschied, nicht neu gezählt: je Urlaubstag am
  24./31.12. ein halber Tag hin oder zurück. Genehmigt zählen die gebuchten
  Tage (wie beim Genehmigen), beantragt die Arbeitstage des Zeitraums (wie
  beim Antrag). Was sonst an einem Antrag steht, bleibt unberührt.
*/
create or replace function app.dezember_urlaub_nachziehen(p_betrieb text, p_halbe boolean)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  schritt numeric := case when p_halbe then -0.5 else 0.5 end;
  genehmigt integer;
  beantragt integer;
begin
  update public.vacations v
     set tage = v.tage + schritt * h.anzahl
    from (select e.vacation_id, count(*) as anzahl
            from public.time_entries e
           where e.company_id = p_betrieb
             and e.status = 'Urlaub'
             and e.vacation_id is not null
             and to_char(e.date, 'MM-DD') in ('12-24', '12-31')
           group by e.vacation_id) h
   where v.id = h.vacation_id
     and v.company_id = p_betrieb
     and v.status = 'Genehmigt'
     and v.art = 'Urlaub';
  get diagnostics genehmigt = row_count;

  update public.vacations v
     set tage = v.tage + schritt * h.anzahl
    from (select a.id, count(*) as anzahl
            from public.vacations a
            join public.users u on u.id = a.user_id
            cross join lateral unnest(app.urlaubstage(u.work_days, a.von, a.bis)) t
           where a.company_id = p_betrieb
             and a.status = 'Beantragt'
             and a.art = 'Urlaub'
             and to_char(t, 'MM-DD') in ('12-24', '12-31')
           group by a.id) h
   where v.id = h.id;
  get diagnostics beantragt = row_count;

  return genehmigt + beantragt;
end;
$$;

revoke all on function app.dezember_urlaub_nachziehen(text, boolean) from public, anon, authenticated;

/*
  Nach dem Ändern der Einstellung. Umschalten darf nur die Spitze
  (`companies_aendern`), und die darf auch entschiedene Anträge ändern
  (`vacations_entscheidung`). Ein Supportzugang kann diese eine Einstellung
  deshalb nicht umschalten: Urlaube schreibt er nie (`support_niemals`).
*/
create or replace function app.dezember_halbtage_geaendert() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform app.dezember_urlaub_nachziehen(new.id, new.dezember_halbtage);
  return null;
end;
$$;

revoke all on function app.dezember_halbtage_geaendert() from public, anon, authenticated;

drop trigger if exists companies_dezember_halbtage on public.companies;
create trigger companies_dezember_halbtage
  after update of dezember_halbtage on public.companies
  for each row
  when (old.dezember_halbtage is distinct from new.dezember_halbtage)
  execute function app.dezember_halbtage_geaendert();

-- ---------------------------------------------------------------------------
-- Der Bestand: die neue Spalte steht überall auf „an"
-- ---------------------------------------------------------------------------

-- Der Schutz entschiedener Anträge fragt nach dem Anmeldenden, und eine
-- Migration hat keinen (wie in 20260924190000). Für diese eine Angleichung
-- bleibt er kurz aus.
alter table public.vacations disable trigger vacations_entscheidung;
select app.dezember_urlaub_nachziehen(c.id, true)
  from public.companies c
 where c.dezember_halbtage and current_setting('senklot.dezember_neu', true) = 'true';
alter table public.vacations enable trigger vacations_entscheidung;
select set_config('senklot.dezember_neu', '', false);
