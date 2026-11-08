alter table public.companies add column timer_erinnerung_min integer not null default 600 check (timer_erinnerung_min>0);
create or replace function app.zeit_timer_erinnern() returns void
  language plpgsql security definer set search_path = '' as $$
declare s public.zeitsitzungen;
begin
  for s in select z.* from public.zeitsitzungen z join public.companies c on c.id=z.company_id
    join public.users u on u.id=z.user_id and u.company_id=z.company_id and u.active
    where z.stand in ('laeuft','pause') and coalesce(z.erinnert_am,(z.segmente->0->>'von')::timestamptz) < now()-make_interval(mins=>c.timer_erinnerung_min)
      and not app.betrieb_ruht(z.company_id) and app.modul_aktiv(z.company_id,'zeiterfassung.timer_erinnerung')
    for update of z skip locked loop
    update public.zeitsitzungen set erinnert_am=now() where id=s.id;
    perform app.push_anstossen(jsonb_build_object('quelle','zeit','art','timer-erinnerung','zeile',jsonb_build_object('id',s.id,'company_id',s.company_id,'user_id',s.user_id)));
  end loop;
end $$;
revoke all on function app.zeit_timer_erinnern() from public,anon,authenticated;

-- Ein Fehlstart oder ein Abschnitt unter einer Minute darf keinen offenen
-- Rest erzwingen. Der Grund bleibt statt einer erfundenen Arbeitsminute.
create or replace function public.zeit_timer_abschnitt_verwerfen(p_id uuid,p_segment integer,p_grund text) returns void
  language plpgsql security definer set search_path='' as $$
declare s public.zeitsitzungen; seg jsonb;
begin
 select * into s from public.zeitsitzungen where id=p_id for update;
 if auth.uid() is null or s.id is null or s.user_id<>auth.uid() or not app.betriebsmitglied(s.company_id) then raise exception 'Diese Zeitsitzung gehört einer anderen Person' using errcode='42501'; end if;
 if s.stand<>'beendet' or p_segment is null or p_segment<0 or p_segment>=jsonb_array_length(s.segmente) then raise exception 'Bitte einen beendeten Arbeitsabschnitt wählen' using errcode='22023'; end if;
 seg:=s.segmente->p_segment;
 if seg->>'art'<>'arbeit' or seg ? 'buchung' then raise exception 'Dieser Abschnitt ist bereits gebucht oder eine Pause' using errcode='22023'; end if;
 if nullif(btrim(p_grund),'') is null then raise exception 'Bitte begründen, warum der Abschnitt nicht gebucht wird' using errcode='22023'; end if;
 if seg ? 'verworfen_grund' then
   if seg->>'verworfen_grund'=btrim(p_grund) then return; end if;
   raise exception 'Der Abschnitt wurde inzwischen verworfen' using errcode='22023';
 end if;
 s.segmente:=jsonb_set(s.segmente,array[p_segment::text],seg || jsonb_build_object('verworfen_grund',btrim(p_grund),'verworfen_am',now()));
 update public.zeitsitzungen set segmente=s.segmente,abgeschlossen=not exists(select 1 from jsonb_array_elements(s.segmente) v where v->>'art'='arbeit' and not v ? 'buchung' and not v ? 'verworfen_grund'),aktualisiert_am=now() where id=p_id;
end $$;
revoke all on function public.zeit_timer_abschnitt_verwerfen(uuid,integer,text) from public,anon;
grant execute on function public.zeit_timer_abschnitt_verwerfen(uuid,integer,text) to authenticated;

do $migration$
declare quelle text; marke text;
begin
 quelle:=pg_get_functiondef('public.zeit_timer_buchen(uuid,integer,jsonb)'::regprocedure);
 marke:=$m$if seg ? 'buchung' then$m$;
 if position('Dieser Abschnitt wurde verworfen' in quelle)=0 then
   if position(marke in quelle)=0 then raise exception 'Timer-Buchung: Einfügestelle fehlt'; end if;
   quelle:=replace(quelle,marke,$m$if seg ? 'verworfen_grund' then raise exception 'Dieser Abschnitt wurde verworfen' using errcode='22023'; end if;
   $m$ || marke);
   quelle:=replace(quelle,$m$v->>'art'='arbeit' and not v ? 'buchung'$m$,$m$v->>'art'='arbeit' and not v ? 'buchung' and not v ? 'verworfen_grund'$m$);
   execute quelle;
 end if;
end $migration$;

create or replace function app.zeitkorrektur_melden() returns trigger
  language plpgsql security definer set search_path='' as $$
begin
  if app.ist_dienst() then return new; end if;
  if tg_op='INSERT' then
    perform app.push_anstossen(jsonb_build_object('quelle','zeit','art','korrektur-antrag','zeile',jsonb_build_object('id',new.id,'user_id',new.user_id,'company_id',new.company_id)));
  elsif old.stand='offen' and new.stand in ('umgesetzt','abgelehnt') then
    perform app.push_anstossen(jsonb_build_object('quelle','zeit','art','korrektur-entschieden','zeile',jsonb_build_object('id',new.id,'user_id',new.user_id,'company_id',new.company_id)));
  end if;
  return new;
end $$;
revoke all on function app.zeitkorrektur_melden() from public,anon,authenticated;
create trigger zeitkorrekturen_melden after insert or update on public.zeitkorrekturen for each row execute function app.zeitkorrektur_melden();
