-- Laufende Anwesenheit ist noch keine Arbeitszeitbuchung. Erst die Bestätigung
-- schreibt durch dieselben Trigger wie das bisherige Formular.
create table public.zeitsitzungen (
  id uuid primary key,
  company_id text not null references public.companies(id),
  user_id uuid not null references public.users(id),
  stand text not null check (stand in ('laeuft','pause','beendet','verworfen')),
  revision integer not null default 0,
  segmente jsonb not null default '[]',
  befehle jsonb not null default '[]',
  grund text,
  abgeschlossen boolean not null default false,
  aktualisiert_am timestamptz not null default now(),
  weiterlaufen_am timestamptz,
  erinnert_am timestamptz
);
create unique index zeitsitzung_eine_laufende on public.zeitsitzungen(user_id) where stand in ('laeuft','pause');
create index zeitsitzungen_person on public.zeitsitzungen(company_id,user_id,aktualisiert_am desc);
alter table public.zeitsitzungen enable row level security;
revoke all on public.zeitsitzungen from anon, authenticated;
grant select on public.zeitsitzungen to authenticated;
grant all on public.zeitsitzungen to service_role;
create policy zeitsitzungen_lesen on public.zeitsitzungen for select to authenticated using (
  company_id = (select app.lesebetrieb()) and (user_id = (select auth.uid()) or (select app.hat_rolle(array['Buchhaltung','Geschäftsführung','Administrator'])))
);

create or replace function public.zeit_timer_befehl(p_id uuid, p_befehl uuid, p_revision integer, p_art text, p_zeit timestamptz, p_baustelle text default '') returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  s public.zeitsitzungen; betrieb text := app.betrieb(); person uuid := auth.uid();
  cmd jsonb := jsonb_build_object('id',p_befehl,'art',p_art,'zeit',p_zeit,'baustelle',coalesce(p_baustelle,''),'revision',p_revision);
  alt jsonb; letzter jsonb; idx integer; neuer_stand text;
begin
  if person is null or not app.betriebsmitglied(betrieb) then raise exception 'Nicht angemeldet' using errcode='42501'; end if;
  if p_id is null or p_befehl is null or p_zeit is null or p_revision is null or not isfinite(p_zeit) or p_art is null or p_art not in ('start','pause','weiter','wechsel','stop','verwerfen','weiterlaufen') then
    raise exception 'Unvollständiger Timer-Befehl' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(person::text || ':zeitsitzung',0));
  select * into s from public.zeitsitzungen where id=p_id for update;
  if found then
    if s.company_id<>betrieb or s.user_id<>person then raise exception 'Diese Zeitsitzung gehört einer anderen Person' using errcode='42501'; end if;
    select v into alt from jsonb_array_elements(s.befehle) v where v->>'id'=p_befehl::text;
    if alt is not null then
      if alt - 'empfangen' <> cmd then raise exception 'Eine Befehlskennung darf nicht anders wiederverwendet werden' using errcode='22023'; end if;
      return to_jsonb(s);
    end if;
    if s.revision<>p_revision then raise exception 'Die Zeitsitzung wurde inzwischen auf einem anderen Gerät geändert. Bitte aktualisieren.' using errcode='22023'; end if;
  elsif p_art<>'start' or p_revision<>0 then
    raise exception 'Die Zeitsitzung fehlt. Bitte aktualisieren.' using errcode='22023';
  end if;
  if p_art='start' then
    if s.id is not null then raise exception 'Die Zeitsitzung wurde bereits gestartet' using errcode='22023'; end if;
    if not app.modul_aktiv(betrieb,'zeiterfassung.timer') then raise exception 'Start/Stopp ist ausgeschaltet' using errcode='22023'; end if;
    if exists(select 1 from public.zeitsitzungen where user_id=person and stand in ('laeuft','pause')) then raise exception 'Es läuft bereits eine Zeitsitzung. Bitte aktualisieren.' using errcode='22023'; end if;
    insert into public.zeitsitzungen(id,company_id,user_id,stand,segmente) values(p_id,betrieb,person,'laeuft',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'art','arbeit','von',p_zeit,'baustelle',coalesce(p_baustelle,'')))) returning * into s;
  else
    if s.stand not in ('laeuft','pause') and p_art<>'verwerfen' then raise exception 'Diese Zeitsitzung läuft nicht mehr' using errcode='22023'; end if;
    if s.stand='verworfen' then raise exception 'Diese Zeitsitzung wurde bereits verworfen' using errcode='22023'; end if;
    if p_art='verwerfen' then
      if exists(select 1 from jsonb_array_elements(s.segmente) seg where seg ? 'buchung') then raise exception 'Bereits gebuchte Abschnitte bleiben erhalten. Eine solche Sitzung lässt sich nicht verwerfen.' using errcode='22023'; end if;
      if btrim(coalesce(p_baustelle,''))='' then raise exception 'Bitte begründen, warum die Sitzung verworfen wird' using errcode='22023'; end if;
      s.stand:='verworfen'; s.grund:=btrim(p_baustelle);
    elsif p_art='weiterlaufen' then
      s.erinnert_am:=now(); s.weiterlaufen_am:=now();
    else
      idx:=jsonb_array_length(s.segmente)-1; letzter:=s.segmente->idx;
      if p_zeit <= (letzter->>'von')::timestamptz then raise exception 'Der nächste Zeitpunkt muss nach dem letzten Beginn liegen' using errcode='22023'; end if;
      if p_art='pause' and s.stand<>'laeuft' or p_art='weiter' and s.stand<>'pause' or p_art='wechsel' and s.stand<>'laeuft' then
        raise exception 'Dieser Schritt passt nicht zum aktuellen Timer-Stand' using errcode='22023';
      end if;
      s.segmente:=jsonb_set(s.segmente,array[idx::text],letzter || jsonb_build_object('bis',p_zeit));
      if p_art='stop' then s.stand:='beendet';
      else
        neuer_stand:=case when p_art='pause' then 'pause' else 'laeuft' end;
        s.segmente:=s.segmente || jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'art',case when neuer_stand='pause' then 'pause' else 'arbeit' end,'von',p_zeit,'baustelle',coalesce(p_baustelle,'')));
        s.stand:=neuer_stand;
      end if;
    end if;
  end if;
  s.revision:=s.revision+1;
  s.befehle:=s.befehle || jsonb_build_array(cmd || jsonb_build_object('empfangen',now()));
  update public.zeitsitzungen set stand=s.stand, revision=s.revision, segmente=s.segmente, befehle=s.befehle, grund=s.grund, aktualisiert_am=now(),erinnert_am=s.erinnert_am,weiterlaufen_am=s.weiterlaufen_am where id=p_id returning * into s;
  return to_jsonb(s);
end $$;
revoke all on function public.zeit_timer_befehl(uuid,uuid,integer,text,timestamptz,text) from public, anon;
grant execute on function public.zeit_timer_befehl(uuid,uuid,integer,text,timestamptz,text) to authenticated;

create or replace function public.zeit_timer_buchen(p_id uuid,p_segment integer,p_eintrag jsonb) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare s public.zeitsitzungen; seg jsonb; neu uuid; person public.users; e public.time_entries;
begin
  select * into s from public.zeitsitzungen where id=p_id for update;
  if auth.uid() is null or s.id is null or s.user_id<>auth.uid() or not app.betriebsmitglied(s.company_id) then raise exception 'Diese Zeitsitzung gehört einer anderen Person' using errcode='42501'; end if;
  if s.stand<>'beendet' then raise exception 'Bitte die Zeitsitzung zuerst beenden' using errcode='22023'; end if;
  if p_segment is null or p_segment<0 or p_segment>=jsonb_array_length(s.segmente) then raise exception 'Dieser Abschnitt fehlt' using errcode='22023'; end if;
  seg:=s.segmente->p_segment;
  if seg->>'art'<>'arbeit' then raise exception 'Eine Pause ist keine Arbeitszeitbuchung' using errcode='22023'; end if;
  if seg ? 'buchung' then
    if seg->>'eingabe_hash' is distinct from encode(sha256(convert_to(p_eintrag::text,'UTF8')),'hex') then raise exception 'Dieser Abschnitt wurde bereits mit anderen Angaben gebucht. Bitte die vorhandene Buchung prüfen.' using errcode='22023'; end if;
    return (seg->>'buchung')::uuid;
  end if;
  if p_eintrag is null or jsonb_typeof(p_eintrag)<>'object' or coalesce(p_eintrag->>'status','Anwesend')<>'Anwesend' then raise exception 'Ein Timer bestätigt gearbeitete Zeit' using errcode='22023'; end if;
  select * into person from public.users where id=s.user_id;
  neu:=(seg->>'id')::uuid;
  e:=jsonb_populate_record(null::public.time_entries,p_eintrag);
  if nullif(p_eintrag->>'start_time','') is null or nullif(p_eintrag->>'end_time','') is null then raise exception 'Von und Bis fehlen' using errcode='22023'; end if;
  insert into public.time_entries(id,company_id,user_id,user_name,date,status,start_time,end_time,break_duration,travel_time,project_number,customer_name,helper_name,vehicle_plate,comment,is_helper,is_emergency,is_night_work,nacht_abgewaehlt,source,zeitfelder)
    values(neu,s.company_id,s.user_id,person.name,e.date,'Anwesend',e.start_time,e.end_time,coalesce(e.break_duration,0),coalesce(e.travel_time,0),coalesce(e.project_number,''),coalesce(nullif(e.customer_name,''),(select p.customer_name from public.projects p where p.company_id=s.company_id and p.project_number=e.project_number limit 1),''),coalesce(e.helper_name,''),coalesce(e.vehicle_plate,''),coalesce(e.comment,''),coalesce(e.is_helper,false),coalesce(e.is_emergency,false),coalesce(e.is_night_work,false),e.nacht_abgewaehlt,'manual',e.zeitfelder);
  s.segmente:=jsonb_set(s.segmente,array[p_segment::text],seg || jsonb_build_object('buchung',neu,'eingabe_hash',encode(sha256(convert_to(p_eintrag::text,'UTF8')),'hex')));
  update public.zeitsitzungen set segmente=s.segmente, abgeschlossen=not exists(select 1 from jsonb_array_elements(s.segmente) v where v->>'art'='arbeit' and not v ? 'buchung'), aktualisiert_am=now() where id=p_id;
  return neu;
end $$;
revoke all on function public.zeit_timer_buchen(uuid,integer,jsonb) from public,anon;
grant execute on function public.zeit_timer_buchen(uuid,integer,jsonb) to authenticated;

create or replace function app.modul_register()
  returns table (kennung text, standard boolean, abhaengig_von text[])
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  values
    ('baustellen', true, '{}'::text[]),
    ('baustellen.auftragseingang', true, '{}'::text[]),
    ('kunden', true, '{}'::text[]),
    ('kunden.liegenschaften', false, '{}'::text[]),
    ('zeiterfassung', true, '{}'::text[]),
    ('zeiterfassung.freie_zeitfelder', true, '{}'::text[]),
    ('zeiterfassung.timer', false, '{}'::text[]),
    ('einsatzplanung', true, '{}'::text[]),
    ('material', true, '{}'::text[]),
    ('material.katalogversionen', true, '{}'::text[]),
    ('material.lieferantenvergleich', true, '{}'::text[]),
    ('material.katalogpreisverlauf', true, '{}'::text[]),
    ('material.lagerorte_fahrzeuglager', true, '{}'::text[]),
    ('material.materialbereitschaft', true, '{}'::text[]),
    ('material.bestellvorschlaege', true, '{}'::text[]),
    ('urlaub', true, '{}'::text[]),
    ('scheine', true, '{}'::text[]),
    ('angebote', true, '{}'::text[]),
    ('angebote.online_annahme', true, '{}'::text[]),
    ('rechnungen', true, '{}'::text[]),
    ('nachkalkulation', true, '{rechnungen}'::text[]),
    ('wartung', true, '{}'::text[]),
    ('zeitkonten', true, '{}'::text[])
$$;

revoke all on function app.modul_register() from public, anon, authenticated;


-- Eine Erinnerung ist ein Hinweis, kein arbeitszeitwirksamer Abschluss.
create or replace function app.zeit_timer_erinnern() returns void
  language plpgsql security definer set search_path = '' as $$
declare s public.zeitsitzungen;
begin
  for s in select * from public.zeitsitzungen
    where stand in ('laeuft','pause') and coalesce(erinnert_am,(segmente->0->>'von')::timestamptz) < now()-interval '10 hours'
    for update skip locked loop
    update public.zeitsitzungen set erinnert_am=now() where id=s.id;
    perform app.push_anstossen(jsonb_build_object('quelle','zeit','art','timer-erinnerung','zeile',jsonb_build_object('id',s.id,'company_id',s.company_id,'user_id',s.user_id)));
  end loop;
end $$;
revoke all on function app.zeit_timer_erinnern() from public,anon,authenticated;
select cron.schedule('zeit-timer-erinnerung','*/15 * * * *','select app.zeit_timer_erinnern()');

-- Arbeitszeitbezug: gleicher Aufbewahrungsweg wie Buchungen, keine Löschkaskade.
do $migration$
declare quelle text; marke text;
begin
  quelle:=pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  marke:=$m$from public.time_entries t where t.company_id = betrieb and t.user_id = p_id),$m$;
  if position('zeit_sitzungen' in quelle)=0 then
    if position(marke in quelle)=0 then raise exception 'Personenauskunft: Einfügestelle Zeitbuchungen fehlt'; end if;
    execute replace(quelle,marke,marke || $m$
      'zeit_sitzungen',(select coalesce(jsonb_agg(to_jsonb(s) order by s.aktualisiert_am),'[]'::jsonb) from public.zeitsitzungen s where s.company_id=betrieb and s.user_id=p_id),$m$);
  end if;
  quelle:=pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  marke:=$m$from public.time_entries t where t.company_id = betrieb and t.user_id = p_id
        union all$m$;
  if position('Zeitsitzungen mit Verlauf' in quelle)=0 then
    if position(marke in quelle)=0 then raise exception 'Personenlöschung: Einfügestelle Zeitbuchungen fehlt'; end if;
    execute replace(quelle,marke,marke || $m$
        select jsonb_build_object('was','Zeitsitzungen mit Verlauf','anzahl',count(*),'bis',max(app.aufbewahrt_bis((s.aktualisiert_am at time zone 'Europe/Vienna')::date)),'grund',rechtsgrund)
        from public.zeitsitzungen s where s.company_id=betrieb and s.user_id=p_id
        union all$m$);
  end if;
end $migration$;

create trigger zeitsitzungen_support_niemals before insert or update or delete on public.zeitsitzungen
  for each row execute function app.support_niemals();
create trigger zeitsitzungen_betrieb_fest before update on public.zeitsitzungen
  for each row execute function app.betrieb_unveraenderlich();
