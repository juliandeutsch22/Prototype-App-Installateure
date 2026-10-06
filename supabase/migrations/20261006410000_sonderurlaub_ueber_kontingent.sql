/*
  SONDERURLAUB ÜBER DEM KONTINGENT (Testbericht Runde 3, G17)

  WAS DER BERICHT FAND. „3 Arbeitstage — vorgesehen sind 2“: die Bestätigung
  zeigte einen Hinweis und ging trotzdem ohne Begründung durch. Alle drei
  Tage standen als Sonderurlaub im Zeitkonto, ohne dass jemand gesagt hätte,
  warum der dritte bezahlt frei ist.

  WAS JETZT GILT. Liegen beim Bestätigen Arbeitstage über dem Kontingent des
  Anlasses (Kollektivvertrag bzw. Einstellung des Betriebs), verlangt die
  Datenbank eine Wahl:
  - `urlaub`: die Tage darüber werden als Urlaub gebucht — als genehmigter
    Urlaubsantrag (`vacations`) mit seinen Tagen im Zeitkonto. So zählen sie
    überall, wo Urlaub zählt: Resturlaub auf der Urlaubsseite und der
    Startseite (genehmigte Anträge), Zeitkonto, Lohn-CSV und
    Mitarbeiterübersicht (gebuchte Tage). Das darf nur, wer über Urlaub
    entscheidet (`app.darf_urlaub_entscheiden`).
  - `sonderurlaub`: alle Tage als Sonderurlaub, mit Pflichtgrund.
  Wahl, Tage darüber, Grund und der angelegte Urlaubsantrag stehen am Antrag.
  Zurücknehmen nimmt den Urlaub mit.

  WAS „DARÜBER“ IST. Gezählt werden die Arbeitstage, die dieser Antrag
  bucht, und die schon gebuchten Sonderurlaubstage bestätigter Anträge
  desselben Falls (Person, Anlass, Ereignistag). Ein noch offener zweiter
  Antrag zählt nicht — er kann abgelehnt werden. Darüber sind die letzten
  Tage dieses Antrags; die ersten deckt das Kontingent.

  Bestehende Anträge bleiben, wie sie sind: die neuen Spalten sind leer.
*/

alter table public.freistellungen
  add column if not exists ueber_kontingent text,
  add column if not exists ueber_tage numeric(5,1),
  add column if not exists ueber_grund text,
  add column if not exists ueber_urlaub_id uuid;

alter table public.freistellungen drop constraint if exists freistellungen_ueber_kontingent;
alter table public.freistellungen add constraint freistellungen_ueber_kontingent
  check (ueber_kontingent is null or ueber_kontingent in ('urlaub', 'sonderurlaub'));
alter table public.freistellungen drop constraint if exists freistellungen_ueber_urlaub_fk;
alter table public.freistellungen add constraint freistellungen_ueber_urlaub_fk
  foreign key (ueber_urlaub_id) references public.vacations(id) on delete set null;

comment on column public.freistellungen.ueber_kontingent is
  'Sonderurlaub über dem Kontingent des Anlasses: „urlaub“ (Tage darüber als Urlaub gebucht) oder „sonderurlaub“ (mit Grund bestätigt). Runde 3, G17.';

/*
  DAS KONTINGENT EINES ANLASSES im Betrieb: die Einstellung, sonst die
  Vorbelegung wie in `shared/freistellung.ts` (ANLAESSE). `null` bei „die
  notwendige Zeit“ (Vorladung, Musterung) — dort gibt es kein Darüber.
*/
create or replace function app.anlass_kontingent(p_betrieb text, p_anlass text) returns numeric
  language sql stable
  security definer
  set search_path = ''
as $$
  select case
    when p_anlass in ('vorladung', 'musterung') then null
    else coalesce(
      (select case when jsonb_typeof(c.freistellung_anlaesse -> p_anlass) = 'number'
                   then (c.freistellung_anlaesse ->> p_anlass)::numeric end
         from public.companies c where c.id = p_betrieb),
      case p_anlass
        when 'hochzeit' then 3
        when 'tod_partner' then 3
        when 'tod_kind' then 3
        when 'tod_eltern' then 2
        when 'tod_geschwister' then 1
        when 'geburt' then 2
        when 'wohnungswechsel' then 2
      end)
  end
$$;
revoke all on function app.anlass_kontingent(text, text) from public, anon, authenticated;

/*
  Die alte Fassung mit fünf Parametern geht; bliebe sie, wäre der Aufruf mit
  benannten Parametern mehrdeutig. `create or replace` für die neue, weil
  `tests/supabase/urlaubNurUeberAntrag.test.ts` die Migrationen ab dem
  Sonderurlaub ein zweites Mal einspielt.
*/
drop function if exists public.freistellung_entscheiden(uuid, text, text, boolean, jsonb);

/*
  Rumpf wie in `20261004200000_freistellungen.sql`; neu sind die beiden
  Parameter zum Kontingent und der Abschnitt „ÜBER DEM KONTINGENT“, dazu
  beim Zurücknehmen der Urlaub für die Tage darüber.

  `p_ueber_kontingent`: 'urlaub' | 'sonderurlaub' | null.
  `p_ueber_grund`: Pflicht bei 'sonderurlaub'.
*/
create or replace function public.freistellung_entscheiden(
  p_id uuid,
  p_entscheidung text,
  p_grund text default '',
  p_nachweis_geprueft boolean default false,
  p_kuerzung jsonb default null,
  p_ueber_kontingent text default null,
  p_ueber_grund text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  wer_name text;
  f public.freistellungen;
  person public.users;
  begruendung text := btrim(coalesce(p_grund, ''));
  ueber_begruendung text := btrim(coalesce(p_ueber_grund, ''));
  tage date[];
  offen date[] := '{}';
  sonder date[] := '{}';
  als_urlaub date[] := '{}';
  entfernt integer := 0;
  alter_pfad text;
  teilung boolean := false;
  gutgeschrieben numeric := null;
  tagesstatus text;
  k jsonb;
  kontingent numeric;
  schon numeric := 0;
  ueber integer := 0;
  urlaub_id uuid := null;
  wahl text := null;
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if p_entscheidung is null or p_entscheidung not in ('Bestätigt', 'Abgelehnt', 'Storniert') then
    raise exception 'Unbekannte Entscheidung: %', p_entscheidung using errcode = '22023';
  end if;
  if p_entscheidung in ('Abgelehnt', 'Storniert') and length(begruendung) < 3 then
    raise exception 'Bitte einen Grund angeben' using errcode = '22023';
  end if;
  if p_ueber_kontingent is not null and p_ueber_kontingent not in ('urlaub', 'sonderurlaub') then
    raise exception 'Unbekannte Wahl für die Tage über dem Kontingent: %', p_ueber_kontingent using errcode = '22023';
  end if;

  select * into f from public.freistellungen where id = p_id for update;
  if f.id is null or f.company_id is distinct from betrieb then
    raise exception 'Diesen Antrag gibt es nicht' using errcode = 'P0002';
  end if;
  if not app.darf_freistellung_entscheiden(f.art) then
    raise exception '%', case when f.art = 'unbezahlt'
      then 'Über unbezahlten Urlaub entscheiden Geschäftsführung oder Administration'
      else 'Sonderurlaub bestätigen Büro, Geschäftsführung oder Administration' end
      using errcode = '42501';
  end if;
  /*
    VIER AUGEN wie beim Urlaub: über den eigenen Antrag entscheidet jemand
    anderer — außer es gibt niemanden sonst, der darf.
  */
  if f.user_id = wer and exists (
       select 1 from public.users u
        where u.company_id = betrieb and u.id <> wer and u.active is not false
          and u.role = any(case when f.art = 'unbezahlt'
                                then array['Geschäftsführung', 'Administrator']
                                else array['Buchhaltung', 'Geschäftsführung', 'Administrator'] end)) then
    raise exception 'Über den eigenen Antrag entscheidet jemand anderer' using errcode = '42501';
  end if;

  select u.name into wer_name from public.users u where u.id = wer;
  select * into person from public.users where id = f.user_id;

  if p_entscheidung = 'Storniert' then
    if f.status <> 'Bestätigt' then
      raise exception 'Nur ein bestätigter Antrag wird zurückgenommen' using errcode = '55000';
    end if;
    /*
      Mit dem Sonderurlaub geht ein genehmigter Urlaub zurück — das darf, wer
      über Urlaub entscheidet (dieselbe Grenze wie `urlaub_entscheiden`;
      der Wächter an `vacations` hielte es sonst mitten im Ablauf auf).
    */
    if f.ueber_urlaub_id is not null and not app.darf_urlaub_entscheiden(betrieb) then
      raise exception 'Zu diesem Sonderurlaub gehört Urlaub für die Tage über dem Kontingent — zurücknehmen darf ihn, wer über Urlaub entscheidet'
        using errcode = '42501';
    end if;
    delete from public.time_entries where company_id = betrieb and freistellung_id = p_id;
    get diagnostics entfernt = row_count;
    delete from public.urlaubsanspruch_anpassungen where freistellung_id = p_id;
    /*
      DER URLAUB FÜR DIE TAGE DARÜBER GEHT MIT (G17). Seine Tage im
      Zeitkonto tragen auch die Kennung dieses Antrags und sind oben schon
      weg; der Antrag selbst wird zurückgenommen, damit der Resturlaub stimmt.
    */
    if f.ueber_urlaub_id is not null then
      delete from public.time_entries where company_id = betrieb and vacation_id = f.ueber_urlaub_id;
      update public.vacations
         set status = 'Storniert',
             entschieden_von_uid = wer,
             entschieden_von_name = coalesce(wer_name, 'Büro'),
             entschieden_am = now(),
             grund = 'Sonderurlaub zurückgenommen: ' || begruendung
       where id = f.ueber_urlaub_id;
    end if;
  elsif f.status <> 'Beantragt' then
    raise exception 'Über den Antrag ist bereits entschieden' using errcode = '55000';
  end if;

  if p_entscheidung = 'Bestätigt' then
    teilung := f.art = 'dienstverhinderung' and f.anlass not like 'tod\_%' and exists (
      select 1 from public.freistellungen x
       where x.company_id = betrieb and x.user_id = f.user_id and x.id <> f.id
         and x.art = 'dienstverhinderung' and x.anlass = f.anlass
         and x.ereignis_datum = f.ereignis_datum and x.status in ('Beantragt', 'Bestätigt'));
    if teilung and not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
      raise exception 'Ein geteilter Sonderurlaub (außer beim Todesfall) braucht die Freigabe durch Geschäftsführung oder Administration'
        using errcode = '42501';
    end if;
    if f.nachweis_pfad is not null and not coalesce(p_nachweis_geprueft, false) then
      raise exception 'Bitte den Nachweis ansehen und „Nachweis geprüft" anhaken' using errcode = '22023';
    end if;

    tage := app.urlaubstage(person.work_days, f.von, f.bis);
    if f.zeit_von is not null then
      select coalesce(array_agg(t order by t), '{}') into offen
        from unnest(tage) t
       where not exists (
         select 1 from public.time_entries e
          where e.company_id = betrieb and e.user_id = f.user_id and e.date = t
            and (app.ist_ganztags(e.status, e.start_time, e.end_time)
                 or e.status in ('Zeitausgleich', 'Dienstverhinderung', 'Pflegefreistellung')));
    else
      select coalesce(array_agg(t order by t), '{}') into offen
        from unnest(tage) t
       where not exists (
         select 1 from public.time_entries e
          where e.company_id = betrieb and e.user_id = f.user_id and e.date = t);
    end if;
    if coalesce(array_length(offen, 1), 0) = 0 then
      raise exception 'Im Zeitraum ist jeder Arbeitstag schon gebucht — es gibt nichts zu bestätigen'
        using errcode = '55000';
    end if;

    /*
      ÜBER DEM KONTINGENT (G17). Nur ganztägiger Sonderurlaub mit fester
      Zahl an Tagen; die stundenweise Vorladung hat „die notwendige Zeit“.
    */
    sonder := offen;
    if f.art = 'dienstverhinderung' and f.zeit_von is null then
      kontingent := app.anlass_kontingent(betrieb, f.anlass);
      if kontingent is not null then
        select count(*) into schon
          from public.time_entries e
          join public.freistellungen x on x.id = e.freistellung_id
         where x.company_id = betrieb and x.user_id = f.user_id and x.id <> f.id
           and x.art = 'dienstverhinderung' and x.anlass = f.anlass
           and x.ereignis_datum = f.ereignis_datum and x.status = 'Bestätigt'
           and e.status = 'Dienstverhinderung';
        ueber := least(array_length(offen, 1),
                       greatest(0, (schon + array_length(offen, 1) - kontingent)::integer));
      end if;
    end if;
    if ueber > 0 then
      if p_ueber_kontingent is null then
        raise exception 'Mehr Tage als vorgesehen (% darüber). Bitte wählen: die Tage darüber als Urlaub buchen oder als Sonderurlaub bestätigen — dann mit Grund.', ueber
          using errcode = '22023';
      end if;
      wahl := p_ueber_kontingent;
      if wahl = 'sonderurlaub' and length(ueber_begruendung) < 3 then
        raise exception 'Bitte begründen, warum die Tage über dem Kontingent als Sonderurlaub gelten' using errcode = '22023';
      end if;
      if wahl = 'urlaub' then
        if not app.darf_urlaub_entscheiden(betrieb) then
          raise exception 'Als Urlaub buchen darf nur, wer über Urlaub entscheidet' using errcode = '42501';
        end if;
        sonder := offen[1:array_length(offen, 1) - ueber];
        als_urlaub := offen[array_length(offen, 1) - ueber + 1:array_length(offen, 1)];
      end if;
    end if;

    tagesstatus := case f.art when 'dienstverhinderung' then 'Dienstverhinderung'
                              when 'pflegefreistellung' then 'Pflegefreistellung'
                              else 'Unbezahlt' end;
    insert into public.time_entries (
      id, company_id, user_id, date, status, start_time, end_time, break_duration,
      user_name, freistellung_id, comment)
    select gen_random_uuid(), betrieb, f.user_id, t, tagesstatus, f.zeit_von, f.zeit_bis, 0,
           f.user_name, p_id,
           case f.art when 'dienstverhinderung' then 'Sonderurlaub'
                      when 'pflegefreistellung' then 'Pflegefreistellung'
                      else 'Unbezahlter Urlaub' end
      from unnest(sonder) t;

    /*
      DIE TAGE DARÜBER ALS URLAUB: ein genehmigter Urlaubsantrag, wie ihn
      `urlaub_entscheiden` hinterlässt — Tage gezählt mit `app.tagesanteil`.
      Die Tage tragen beide Kennungen: den Urlaub für Resturlaub und
      Zeitkonto, den Sonderurlaub für das Zurücknehmen.
    */
    if coalesce(array_length(als_urlaub, 1), 0) > 0 then
      insert into public.vacations (
        company_id, user_id, user_name, von, bis, tage, status, art, notiz,
        entschieden_von_uid, entschieden_von_name, entschieden_am)
      values (betrieb, f.user_id, f.user_name, als_urlaub[1], als_urlaub[array_length(als_urlaub, 1)],
              (select sum(app.tagesanteil(betrieb, t)) from unnest(als_urlaub) t),
              'Genehmigt', 'Urlaub',
              'Sonderurlaub über dem Kontingent (' || to_char(f.von, 'DD.MM.YYYY') || '–' || to_char(f.bis, 'DD.MM.YYYY') || ')',
              wer, coalesce(wer_name, 'Büro'), now())
      returning id into urlaub_id;
      insert into public.time_entries (
        id, company_id, user_id, date, status, start_time, end_time, break_duration,
        user_name, vacation_id, freistellung_id, comment)
      select gen_random_uuid(), betrieb, f.user_id, t, 'Urlaub', null, null, 0,
             f.user_name, urlaub_id, p_id, 'Urlaub (Sonderurlaub über dem Kontingent)'
        from unnest(als_urlaub) t;
    end if;

    -- Was gutgeschrieben ist — so zählt es das Kontingent der Pflegefreistellung.
    select round(sum(case when f.zeit_von is not null
                          then extract(epoch from (f.zeit_bis - f.zeit_von)) / 60
                          else app.tagesanteil(betrieb, t) * app.tagessoll_minuten(person, t) end), 1)
      into gutgeschrieben
      from unnest(sonder) t;

    if p_kuerzung is not null and jsonb_typeof(p_kuerzung) = 'array' and jsonb_array_length(p_kuerzung) > 0 then
      if f.art <> 'unbezahlt' then
        raise exception 'Eine Kürzung des Anspruchs gibt es nur beim unbezahlten Urlaub' using errcode = '22023';
      end if;
      for k in select * from jsonb_array_elements(p_kuerzung) loop
        if (k ->> 'urlaubsjahr') is null or (k ->> 'tage') is null
           or (k ->> 'urlaubsjahr')::integer not between extract(year from f.von)::integer - 1 and extract(year from f.bis)::integer
           or (k ->> 'tage')::numeric <= 0 or (k ->> 'tage')::numeric > 366 then
          raise exception 'Die Kürzung passt nicht zum Zeitraum' using errcode = '22023';
        end if;
        insert into public.urlaubsanspruch_anpassungen (
          company_id, user_id, urlaubsjahr, tage, grund, freistellung_id, angelegt_von_uid, angelegt_von_name)
        values (betrieb, f.user_id, (k ->> 'urlaubsjahr')::integer, -round((k ->> 'tage')::numeric, 2),
                'Unbezahlter Urlaub ' || to_char(f.von, 'DD.MM.YYYY') || '–' || to_char(f.bis, 'DD.MM.YYYY'),
                p_id, wer, wer_name);
      end loop;
    end if;
  elsif p_kuerzung is not null and jsonb_typeof(p_kuerzung) = 'array' and jsonb_array_length(p_kuerzung) > 0 then
    raise exception 'Eine Kürzung gibt es nur beim Bestätigen' using errcode = '22023';
  end if;

  alter_pfad := f.nachweis_pfad;
  update public.freistellungen
     set status = p_entscheidung,
         entschieden_von_uid = wer,
         entschieden_von_name = coalesce(wer_name, 'Büro'),
         entschieden_am = now(),
         grund = case when begruendung = '' then public.freistellungen.grund else begruendung end,
         nachweis_pfad = null,
         nachweis_geprueft_von_name = case when coalesce(p_nachweis_geprueft, false)
                                           then coalesce(wer_name, 'Büro')
                                           else public.freistellungen.nachweis_geprueft_von_name end,
         nachweis_geprueft_am = case when coalesce(p_nachweis_geprueft, false)
                                     then now() else public.freistellungen.nachweis_geprueft_am end,
         teilung_freigegeben = public.freistellungen.teilung_freigegeben or teilung,
         minuten = case when p_entscheidung = 'Bestätigt' then gutgeschrieben
                        when p_entscheidung = 'Storniert' then null
                        else public.freistellungen.minuten end,
         -- Die Wahl bleibt nach dem Zurücknehmen stehen: sie ist Teil der Geschichte des Antrags.
         ueber_kontingent = case when p_entscheidung = 'Bestätigt' then wahl else public.freistellungen.ueber_kontingent end,
         ueber_tage = case when p_entscheidung = 'Bestätigt' and ueber > 0 then ueber else public.freistellungen.ueber_tage end,
         ueber_grund = case when p_entscheidung = 'Bestätigt' and wahl = 'sonderurlaub' then ueber_begruendung
                            else public.freistellungen.ueber_grund end,
         ueber_urlaub_id = case when p_entscheidung = 'Bestätigt' then urlaub_id else public.freistellungen.ueber_urlaub_id end
   where id = p_id;

  return jsonb_build_object(
    'status', p_entscheidung,
    'angelegt', coalesce(array_length(offen, 1), 0),
    'uebersprungen', coalesce(array_length(tage, 1), 0) - coalesce(array_length(offen, 1), 0),
    'entfernt', entfernt,
    'nachweis', alter_pfad,
    'ueber', ueber,
    'alsUrlaub', coalesce(array_length(als_urlaub, 1), 0));
end;
$$;

revoke all on function public.freistellung_entscheiden(uuid, text, text, boolean, jsonb, text, text) from public, anon;
grant execute on function public.freistellung_entscheiden(uuid, text, text, boolean, jsonb, text, text) to authenticated;

/*
  DER WOCHENPLAN: Tage darüber stehen als Urlaub, nicht zweimal.
  Rumpf wie in `20261004200000_freistellungen.sql`; neu ist nur, dass ein
  bestätigter Sonderurlaub mit Urlaub für die Tage darüber vor dem Beginn
  dieses Urlaubs endet — sonst stünden dieselben Tage als „Sonderurlaub“ und
  als „Urlaub“ im Plan.
*/
create or replace function public.wochenplan_abwesend(p_von date, p_bis date)
  returns table (user_id uuid, von date, bis date, grund text, zeiten text)
  language sql stable
  security definer
  set search_path = ''
as $$
  with erlaubt as (
    select exists (
             select 1 from public.companies c
              where c.id = app.betrieb()
                and (c.wochenplan_fuer_alle or app.ist_fuehrung() or app.ist_buch_oder_spitze()))
           and app.betriebsmitglied(app.betrieb()) as ok,
           (app.ist_fuehrung() or app.ist_buch_oder_spitze()) as leitung,
           app.ist_buch_oder_spitze() as buero
  ),
  frei as (
    select f.*,
           least(f.bis, coalesce((select v.von - 1 from public.vacations v
                                   where v.id = f.ueber_urlaub_id and v.status = 'Genehmigt'), f.bis)) as frei_bis
      from public.freistellungen f
     where f.company_id = app.betrieb()
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
     and v.company_id = app.betrieb()
     and v.status = 'Genehmigt'
     and v.bis >= p_von and v.von <= p_bis
     and p_bis >= p_von and p_bis - p_von <= 62
  union all
  select k.user_id, greatest(k.von, p_von), least(k.bis, p_bis),
         case when e.buero then 'Krank' end,
         null::text
    from public.krankmeldungen k, erlaubt e
   where e.ok
     and k.company_id = app.betrieb()
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
     and t.company_id = app.betrieb()
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
$$;

revoke all on function public.wochenplan_abwesend(date, date) from public, anon;
grant execute on function public.wochenplan_abwesend(date, date) to authenticated;
