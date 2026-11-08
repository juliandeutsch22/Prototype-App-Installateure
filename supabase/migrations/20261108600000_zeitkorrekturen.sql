-- Ein Antrag ergänzt die Direktbearbeitung; er sperrt sie nicht ein.
create table public.zeitkorrekturen (
  id uuid primary key,
  company_id text not null references public.companies(id),
  user_id uuid not null references public.users(id),
  eintrag_id uuid not null,
  datum date not null,
  stand text not null default 'offen' check (stand in ('offen','umgesetzt','abgelehnt','zurueckgezogen')),
  wunsch text not null check (btrim(wunsch)<>''),
  vorher jsonb not null,
  entscheidung text,
  entschieden_von uuid references public.users(id),
  angelegt_am timestamptz not null default now(),
  entschieden_am timestamptz
);
create unique index zeitkorrektur_ein_offener_antrag on public.zeitkorrekturen(eintrag_id) where stand='offen';
create index zeitkorrekturen_betrieb on public.zeitkorrekturen(company_id,stand,datum);
alter table public.zeitkorrekturen enable row level security;
revoke all on public.zeitkorrekturen from anon,authenticated;
grant select on public.zeitkorrekturen to authenticated;
grant all on public.zeitkorrekturen to service_role;
create policy zeitkorrekturen_lesen on public.zeitkorrekturen for select to authenticated using (
 company_id=(select app.lesebetrieb()) and (user_id=(select auth.uid()) or (select app.hat_rolle(array['Buchhaltung','Geschäftsführung','Administrator'])))
);
create or replace function public.zeit_korrektur_beantragen(p_id uuid,p_eintrag uuid,p_wunsch text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare e public.time_entries; a public.zeitkorrekturen;
begin
 select * into e from public.time_entries where id=p_eintrag for share;
 if e.id is null or e.user_id<>auth.uid() or not app.betriebsmitglied(e.company_id) then raise exception 'Diese Buchung gehört einer anderen Person' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(e.user_id::text || ':zeitkorrektur:' || p_eintrag::text,0));
 select * into a from public.zeitkorrekturen where id=p_id;
 if found then
   if a.user_id<>auth.uid() or a.eintrag_id<>p_eintrag or a.wunsch<>btrim(p_wunsch) then raise exception 'Diese Antragskennung ist bereits vergeben' using errcode='22023'; end if;
   return a.id;
 end if;
 if exists(select 1 from public.zeitkorrekturen x where x.eintrag_id=p_eintrag and x.stand='offen') then raise exception 'Zu dieser Buchung liegt bereits ein offener Korrekturantrag vor' using errcode='23505'; end if;
 if not app.modul_aktiv(e.company_id,'zeiterfassung.korrekturantraege') then raise exception 'Korrekturanträge sind ausgeschaltet' using errcode='22023'; end if;
 if p_wunsch is null or btrim(p_wunsch)='' then raise exception 'Bitte die gewünschte Korrektur begründen' using errcode='22023'; end if;
 insert into public.zeitkorrekturen(id,company_id,user_id,eintrag_id,datum,wunsch,vorher)
 values(p_id,e.company_id,e.user_id,e.id,e.date,btrim(p_wunsch),to_jsonb(e) || jsonb_build_object('freie_angaben',(select coalesce(jsonb_object_agg(w.feld_id::text,w.wert),'{}'::jsonb) from public.zeitbuchung_feldwerte w where w.eintrag_id=e.id)));
 return p_id;
end $$;
revoke all on function public.zeit_korrektur_beantragen(uuid,uuid,text) from public,anon;
grant execute on function public.zeit_korrektur_beantragen(uuid,uuid,text) to authenticated;

create or replace function public.zeit_korrektur_entscheiden(p_id uuid,p_stand text,p_grund text,p_eintrag jsonb default null,p_geaendert_am timestamptz default null) returns void
 language plpgsql security definer set search_path='' as $$
declare a public.zeitkorrekturen; e public.time_entries; v public.time_entries; stand_daten jsonb;
  ohne text[]:=array['updated_at','created_at','last_edited_by','last_edited_by_uid','hours','satz','zeitfelder','zeitfeld_fassung','is_billed','invoice_number','ins_budget'];
begin
 select * into a from public.zeitkorrekturen where id=p_id for update;
 if a.id is null or not app.betriebsmitglied(a.company_id) then raise exception 'Dieser Antrag gehört einem anderen Betrieb' using errcode='42501'; end if;
 if p_stand='zurueckgezogen' then
   if a.user_id<>auth.uid() then raise exception 'Nur die antragstellende Person zieht den Antrag zurück' using errcode='42501'; end if;
 elsif not app.hat_rolle(array['Buchhaltung','Geschäftsführung','Administrator']) then raise exception 'Korrekturen prüft das Büro' using errcode='42501'; end if;
 if p_stand not in ('zurueckgezogen','abgelehnt','umgesetzt') or nullif(btrim(p_grund),'') is null then raise exception 'Bitte die Entscheidung begründen' using errcode='22023'; end if;
 if a.stand<>'offen' then
   if a.stand=p_stand and a.entscheidung=btrim(p_grund) then return; end if;
   raise exception 'Der Antrag wurde inzwischen entschieden. Bitte aktualisieren.' using errcode='22023';
 end if;
 if p_stand='umgesetzt' then
   select * into e from public.time_entries where id=a.eintrag_id for update;
   if e.id is null then
     if p_eintrag is not null or not exists(select 1 from public.zeitbuchung_verlauf journal where journal.eintrag_id=a.eintrag_id and journal.company_id=a.company_id and journal.art='geloescht' and journal.am>=a.angelegt_am) then
       raise exception 'Die ursprüngliche Buchung fehlt; eine protokollierte Korrektur ist nicht nachgewiesen' using errcode='22023';
     end if;
   else
   stand_daten:=to_jsonb(e) || jsonb_build_object('freie_angaben',(select coalesce(jsonb_object_agg(w.feld_id::text,w.wert),'{}'::jsonb) from public.zeitbuchung_feldwerte w where w.eintrag_id=e.id));
   if p_eintrag is not null then
     if (p_geaendert_am is not null and e.updated_at is distinct from p_geaendert_am)
        or (p_geaendert_am is null and stand_daten-ohne <> a.vorher-ohne) then
       raise exception 'Die Buchung hat sich inzwischen geändert. Bitte neu öffnen und prüfen.' using errcode='22023';
     end if;
     v:=jsonb_populate_record(e,p_eintrag);
     -- Keine Freigabe von Rechnung, Antrag oder Identität durch JSON.
     update public.time_entries set date=v.date,status=v.status,start_time=v.start_time,end_time=v.end_time,
       break_duration=v.break_duration,travel_time=v.travel_time,project_number=v.project_number,customer_name=v.customer_name,
       helper_name=v.helper_name,vehicle_plate=v.vehicle_plate,comment=v.comment,is_helper=v.is_helper,is_emergency=v.is_emergency,
       is_night_work=v.is_night_work,nacht_abgewaehlt=v.nacht_abgewaehlt,zeitfelder=v.zeitfelder,
       last_edited_by=(select name from public.users where id=auth.uid()),last_edited_by_uid=auth.uid()
       where id=e.id returning * into e;
   end if;
   stand_daten:=to_jsonb(e) || jsonb_build_object('freie_angaben',(select coalesce(jsonb_object_agg(w.feld_id::text,w.wert),'{}'::jsonb) from public.zeitbuchung_feldwerte w where w.eintrag_id=e.id));
   if stand_daten-ohne = a.vorher-ohne then raise exception 'Die gewünschte Korrektur muss zuerst an der Buchung oder ihrem Ursprung durchgeführt werden' using errcode='22023'; end if;
   end if;
 end if;
 update public.zeitkorrekturen set stand=p_stand,entscheidung=btrim(p_grund),entschieden_von=auth.uid(),entschieden_am=now() where id=p_id;
end $$;
revoke all on function public.zeit_korrektur_entscheiden(uuid,text,text,jsonb,timestamptz) from public,anon;
grant execute on function public.zeit_korrektur_entscheiden(uuid,text,text,jsonb,timestamptz) to authenticated;

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
    ('zeiterfassung.timer_erinnerung', true, '{zeiterfassung.timer}'::text[]),
    ('zeiterfassung.korrekturantraege', false, '{}'::text[]),
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



create or replace function app.modul_kern() returns setof text
  language sql immutable security definer set search_path='' as $$ values ('baustellen'),('kunden') $$;
revoke all on function app.modul_kern() from public,anon,authenticated;

-- Ein Antrag ist Teil der Arbeitszeitnachvollziehbarkeit, wie das E50-Protokoll.
do $migration$
declare quelle text; marke text;
begin
  quelle:=pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  marke:=$m$from public.time_entries t where t.company_id = betrieb and t.user_id = p_id),$m$;
  if position('zeit_korrekturantraege' in quelle)=0 then
    if position(marke in quelle)=0 then raise exception 'Personenauskunft: Einfügestelle Zeitbuchungen fehlt'; end if;
    execute replace(quelle,marke,marke || $m$
      'zeit_korrekturantraege',(select coalesce(jsonb_agg(to_jsonb(a) order by a.angelegt_am),'[]'::jsonb) from public.zeitkorrekturen a where a.company_id=betrieb and a.user_id=p_id),$m$);
  end if;
  quelle:=pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  marke:=$m$from public.time_entries t where t.company_id = betrieb and t.user_id = p_id
        union all$m$;
  if position('Korrekturanträge zu Arbeitszeiten' in quelle)=0 then
    if position(marke in quelle)=0 then raise exception 'Personenlöschung: Einfügestelle Zeitbuchungen fehlt'; end if;
    execute replace(quelle,marke,marke || $m$
        select jsonb_build_object('was','Korrekturanträge zu Arbeitszeiten','anzahl',count(*),'bis',max(app.aufbewahrt_bis(a.datum)),'grund',rechtsgrund)
        from public.zeitkorrekturen a where a.company_id=betrieb and a.user_id=p_id
        union all$m$);
  end if;
end $migration$;

-- Erinnerungen beachten den eigenen Schalter, auch bei zuvor laufenden Sitzungen.
create or replace function app.zeit_timer_erinnern() returns void
  language plpgsql security definer set search_path = '' as $$
declare s public.zeitsitzungen;
begin
  for s in select * from public.zeitsitzungen
    where stand in ('laeuft','pause') and coalesce(erinnert_am,(segmente->0->>'von')::timestamptz) < now()-interval '10 hours'
      and app.modul_aktiv(company_id,'zeiterfassung.timer_erinnerung')
    for update skip locked loop
    update public.zeitsitzungen set erinnert_am=now() where id=s.id;
    perform app.push_anstossen(jsonb_build_object('quelle','zeit','art','timer-erinnerung','zeile',jsonb_build_object('id',s.id,'company_id',s.company_id,'user_id',s.user_id)));
  end loop;
end $$;
revoke all on function app.zeit_timer_erinnern() from public,anon,authenticated;

alter table public.user_prefs add column notify_zeiterfassung boolean not null default true;

-- Abschalten des Gesamtmoduls entfernt keine Pflichtangaben eines noch offenen
-- Timerabschlusses. Nur dessen stabile Abschnittskennung erlaubt Nachpflege.
do $migration$
declare quelle text; marke text;
begin
  quelle:=pg_get_functiondef('app.zeitfelder_pruefen()'::regprocedure);
  marke:=$m$if not app.modul_aktiv(new.company_id, 'zeiterfassung.freie_zeitfelder') then$m$;
  if position('Timerabschluss' in quelle)=0 then
    if position(marke in quelle)=0 then raise exception 'Zeitfeld-Prüfung: Einfügestelle fehlt'; end if;
    execute replace(quelle,marke,$m$-- Timerabschluss: vorhandene Sitzung darf vollständig bestätigt werden.
  if not app.modul_aktiv(new.company_id, 'zeiterfassung.freie_zeitfelder') and not (
    coalesce((select (c.modules->>'zeiterfassung.freie_zeitfelder')::boolean from public.companies c where c.id=new.company_id),true)
    and exists(select 1 from public.zeitsitzungen s cross join lateral jsonb_array_elements(s.segmente) seg
      where s.company_id=new.company_id and s.user_id=new.user_id and s.stand='beendet' and seg->>'id'=new.id::text and seg->>'art'='arbeit' and not seg ? 'buchung')
  ) then$m$);
  end if;
end $migration$;

create trigger zeitkorrekturen_support_niemals before insert or update or delete on public.zeitkorrekturen
  for each row execute function app.support_niemals();
create trigger zeitkorrekturen_betrieb_fest before update on public.zeitkorrekturen
  for each row execute function app.betrieb_unveraenderlich();
