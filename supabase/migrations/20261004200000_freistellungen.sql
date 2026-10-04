-- SONDERURLAUB: Dienstverhinderung, Pflegefreistellung, unbezahlter Urlaub
-- (Plan 10.3, Entscheidungen vom 03.10.2026).
--
-- VORBILD IST DIE BERUFSSCHULE (20260930400000_lehrlinge.sql, Teil 4): ein
-- eigener Weg, auf dem die Tage ins Zeitkonto kommen, eine Sperre gegen das
-- direkte Setzen, Ganztags-Regel, Monatssicht und Wochenplan.
--
-- EIGENE TABELLE, NICHT `vacations`: Urlaubsanträge liest auch die
-- Projektleitung, und der Anlass verrät Gesundheits- und Familiendaten
-- (Todesfall, Pflege eines Kindes). Gelesen wird wie die Krankmeldung: die
-- Person selbst und das Büro samt Spitze. Der Support nie.
--
-- WER BESTÄTIGT: Dienstverhinderung und Pflegefreistellung Büro,
-- Geschäftsführung, Administration — ohne Ermessen, der Anlass wird
-- bestätigt, nicht genehmigt. Unbezahlten Urlaub entscheiden nur
-- Geschäftsführung und Administration.

-- ---------------------------------------------------------------------------
-- 1. Einstellungen des Betriebs
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists freistellung_anlaesse jsonb,
  add column if not exists kuerzung_ab_tagen integer not null default 14;

comment on column public.companies.freistellung_anlaesse is
  'Abweichende Tage je Anlass der Dienstverhinderung (Schlüssel → Arbeitstage). Leer = Vorbelegung aus shared/freistellung.ts.';
comment on column public.companies.kuerzung_ab_tagen is
  'Ab so vielen Kalendertagen unbezahltem Urlaub am Stück schlägt die App die aliquote Kürzung des Urlaubsanspruchs vor.';

create or replace function app.anlaesse_gueltig(a jsonb) returns boolean
  language sql immutable
  set search_path = ''
as $$
  select a is null or (
    jsonb_typeof(a) = 'object'
    and not exists (
      select 1 from jsonb_each(a) e
       where e.key not in ('hochzeit', 'tod_partner', 'tod_kind', 'tod_eltern', 'tod_geschwister',
                           'geburt', 'wohnungswechsel')
          or jsonb_typeof(e.value) <> 'number'
          or (e.value)::numeric not between 1 and 30))
$$;

alter table public.companies drop constraint if exists companies_freistellung_anlaesse;
alter table public.companies add constraint companies_freistellung_anlaesse
  check (app.anlaesse_gueltig(freistellung_anlaesse));
alter table public.companies drop constraint if exists companies_kuerzung_ab_tagen;
alter table public.companies add constraint companies_kuerzung_ab_tagen
  check (kuerzung_ab_tagen between 1 and 366);

-- ---------------------------------------------------------------------------
-- 2. Die Anträge
-- ---------------------------------------------------------------------------

create table if not exists public.freistellungen (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  user_id uuid not null references public.users(id),
  user_name text not null,
  art text not null,
  anlass text,
  -- Tag des Todesfalls, der Geburt, des Umzugs: bündelt geteilte Anträge zu einem Fall.
  ereignis_datum date,
  von date not null,
  bis date not null,
  zeit_von time,
  zeit_bis time,
  kind_unter12 boolean not null default false,
  zusatzwoche boolean not null default false,
  notiz text,
  status text not null default 'Beantragt',
  -- Nur bis zur Entscheidung; danach bleibt allein der Vermerk.
  nachweis_pfad text,
  nachweis_geprueft_von_name text,
  nachweis_geprueft_am timestamptz,
  teilung_freigegeben boolean not null default false,
  -- Gutgeschriebene Minuten, gesetzt beim Bestätigen (Kontingent der Pflegefreistellung).
  minuten numeric(8,1),
  entschieden_von_uid uuid,
  entschieden_von_name text,
  entschieden_am timestamptz,
  grund text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint freistellungen_art check (art in ('dienstverhinderung', 'pflegefreistellung', 'unbezahlt')),
  constraint freistellungen_status check (status in ('Beantragt', 'Bestätigt', 'Abgelehnt', 'Storniert')),
  constraint freistellungen_zeitraum check (bis >= von),
  constraint freistellungen_zeiten check (
    (zeit_von is null and zeit_bis is null)
    or (zeit_von is not null and zeit_bis is not null and zeit_bis > zeit_von and von = bis)),
  constraint freistellungen_anlass check (
    (art = 'dienstverhinderung' and anlass is not null and ereignis_datum is not null)
    or (art <> 'dienstverhinderung' and anlass is null))
);

create index if not exists freistellungen_person
  on public.freistellungen (company_id, user_id, von desc);
create index if not exists freistellungen_offen
  on public.freistellungen (company_id, status) where status = 'Beantragt';

comment on table public.freistellungen is
  'Sonderurlaub (Dienstverhinderung), Pflegefreistellung, unbezahlter Urlaub. Lesen: die Person und das Büro. Schreiben nur über Funktionen.';

alter table public.freistellungen enable row level security;
revoke all on public.freistellungen from anon, authenticated;
grant select on public.freistellungen to authenticated;

drop policy if exists freistellungen_lesen on public.freistellungen;
create policy freistellungen_lesen on public.freistellungen for select
  using (app.betriebsmitglied(company_id)
         and (user_id = auth.uid() or app.ist_buch_oder_spitze()));

drop trigger if exists freistellungen_updated_at on public.freistellungen;
create trigger freistellungen_updated_at before update on public.freistellungen
  for each row execute function app.updated_at_setzen();
drop trigger if exists freistellungen_betrieb_fest on public.freistellungen;
create trigger freistellungen_betrieb_fest before update on public.freistellungen
  for each row execute function app.betrieb_unveraenderlich();
drop trigger if exists freistellungen_support_niemals on public.freistellungen;
create trigger freistellungen_support_niemals
  before insert or update or delete on public.freistellungen
  for each row execute function app.support_niemals();

-- Die Kürzung des Anspruchs hängt am unbezahlten Urlaub, der sie ausgelöst hat.
alter table public.urlaubsanspruch_anpassungen add column if not exists freistellung_id uuid;
alter table public.urlaubsanspruch_anpassungen drop constraint if exists urlaubsanspruch_anpassungen_freistellung_fk;
alter table public.urlaubsanspruch_anpassungen add constraint urlaubsanspruch_anpassungen_freistellung_fk
  foreign key (freistellung_id) references public.freistellungen(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 3. Die Tage im Zeitkonto
-- ---------------------------------------------------------------------------

alter table public.time_entries drop constraint if exists time_entries_status_check;
alter table public.time_entries add constraint time_entries_status_check
  check (status in ('Anwesend', 'Krank', 'Urlaub', 'Zeitausgleich', 'Berufsschule',
                    'Dienstverhinderung', 'Pflegefreistellung', 'Unbezahlt'));

alter table public.time_entries add column if not exists freistellung_id uuid;
alter table public.time_entries drop constraint if exists time_entries_freistellung_fk;
alter table public.time_entries add constraint time_entries_freistellung_fk
  foreign key (freistellung_id) references public.freistellungen(id) on delete set null;
create index if not exists time_entries_freistellung
  on public.time_entries (freistellung_id) where freistellung_id is not null;

/*
  NUR ÜBER DEN ANTRAG — wie Urlaub und Berufsschule. Bestätigen und
  Stornieren laufen als Funktionen mit den Rechten ihres Eigentümers; der
  Rücklauf aus der Sicherung mit dem Dienstschlüssel. Beide sind nicht
  `authenticated`.
*/
create or replace function app.freistellung_nur_ueber_antrag() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE')
     and (old.freistellung_id is not null
          or old.status in ('Dienstverhinderung', 'Pflegefreistellung', 'Unbezahlt')) then
    raise exception 'Dieser Tag gehört zu einem bestätigten Sonderurlaub — er ändert sich nur über den Antrag (Seite Urlaub, „zurücknehmen")'
      using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (new.freistellung_id is not null
          or new.status in ('Dienstverhinderung', 'Pflegefreistellung', 'Unbezahlt')) then
    raise exception 'Sonderurlaub, Pflegefreistellung und unbezahlter Urlaub werden auf der Seite Urlaub beantragt'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function app.freistellung_nur_ueber_antrag() from public, anon, authenticated;

drop trigger if exists time_entries_freistellung_nur_ueber_antrag on public.time_entries;
create trigger time_entries_freistellung_nur_ueber_antrag
  before insert or update or delete on public.time_entries
  for each row execute function app.freistellung_nur_ueber_antrag();

/*
  GANZTÄGIG ODER STUNDENWEISE. Ganztägig steht daneben nichts, wie bei
  Krank, Urlaub und Berufsschule. Stundenweise (Behördenweg, ein Nachmittag
  Pflege) ist ein Teil des Tages wie ein stundenweiser Zeitausgleich.
  Unbezahlter Urlaub gibt es nur ganztags.
*/
create or replace function app.ist_ganztags(p_status text, p_beginn time, p_ende time) returns boolean
  language sql immutable
  set search_path = ''
as $$
  select p_status in ('Krank', 'Urlaub', 'Berufsschule', 'Unbezahlt')
      or (p_status in ('Zeitausgleich', 'Dienstverhinderung', 'Pflegefreistellung')
          and (p_beginn is null or p_ende is null))
$$;

create or replace function app.ganzer_tag_allein() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  anderer text;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.user_id is not distinct from old.user_id
     and new.date is not distinct from old.date
     and new.status is not distinct from old.status
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time then
    return new;
  end if;

  if app.ist_ganztags(new.status, new.start_time, new.end_time) then
    -- Ganztägig: daneben steht an diesem Tag gar nichts.
    select t.status into anderer
      from public.time_entries t
     where t.company_id = new.company_id
       and t.user_id = new.user_id
       and t.date = new.date
       and t.id <> new.id
     limit 1;
    if found then
      raise exception 'Für den % sind schon Einträge („%") gebucht. „%" gilt für den ganzen Tag — dafür müssen sie zuerst weg.',
        to_char(new.date, 'DD.MM.YYYY'), anderer, new.status
        using errcode = '23P01';
    end if;
  elsif new.status = 'Anwesend' then
    -- Arbeit: nicht an einem Tag, der schon ganz belegt ist.
    select t.status into anderer
      from public.time_entries t
     where t.company_id = new.company_id
       and t.user_id = new.user_id
       and t.date = new.date
       and t.id <> new.id
       and app.ist_ganztags(t.status, t.start_time, t.end_time)
     limit 1;
    if found then
      raise exception 'Für den % ist schon „%" eingetragen. Das gilt für den ganzen Tag — daneben lässt sich keine Arbeitszeit buchen.',
        to_char(new.date, 'DD.MM.YYYY'), anderer
        using errcode = '23P01';
    end if;
  end if;
  return new;
end;
$$;

/*
  EIN STUNDENWEISER ZEITAUSGLEICH ÜBERSPRINGT EINEN SONDERURLAUBSTAG wie
  einen Krank- oder Urlaubstag (Rumpf wie in 20260930400000_lehrlinge.sql,
  eine Stelle ergänzt). Sonst bräche die Genehmigung an der Ganztags-Regel ab.
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

revoke all on function public.urlaub_entscheiden(uuid, text, text, text) from public;
grant execute on function public.urlaub_entscheiden(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Hilfen: Tagessoll, Arbeitsjahr, Pflege-Kontingent
-- ---------------------------------------------------------------------------

/*
  DAS TAGESSOLL IN MINUTEN — dieselbe Regel wie `tagessollStunden` in der
  App: das eigene Tagessoll des Wochentags, sonst Wochenstunden durch
  Arbeitstage. Leere oder null Wochenstunden zählen als 40, wie dort.
*/
create or replace function app.tagessoll_minuten(p_person public.users, p_tag date) returns numeric
  language sql stable
  set search_path = ''
as $$
  select 60 * coalesce(
    (p_person.tagessoll ->> extract(dow from p_tag)::integer::text)::numeric,
    coalesce(nullif(p_person.weekly_target_hours, 0), 40)
      / (case when coalesce(cardinality(p_person.work_days), 0) = 0 then 5
              else cardinality(p_person.work_days) end)::numeric
  )
$$;

-- Das Arbeitsjahr ab dem Jahrestag des Eintritts (ohne Eintritt das Kalenderjahr).
create or replace function app.arbeitsjahr_beginn(p_eintritt date, p_tag date) returns date
  language sql immutable
  set search_path = ''
as $$
  select case
    when p_eintritt is null then make_date(extract(year from p_tag)::integer, 1, 1)
    else (
      with t as (
        select extract(month from p_eintritt)::integer as m,
               least(extract(day from p_eintritt)::integer,
                     case when extract(month from p_eintritt) = 2 then 28 else 31 end) as d)
      select case
        when to_char(p_tag, 'MM-DD') >= lpad(t.m::text, 2, '0') || '-' || lpad(t.d::text, 2, '0')
          then make_date(extract(year from p_tag)::integer, t.m, t.d)
        else make_date(extract(year from p_tag)::integer - 1, t.m, t.d)
      end from t)
  end
$$;

-- Bestätigte Minuten der ersten Woche Pflegefreistellung im Arbeitsjahr des Tages.
create or replace function app.pflege_verbraucht(p_person public.users, p_tag date) returns numeric
  language sql stable
  security definer
  set search_path = ''
as $$
  with j as (select app.arbeitsjahr_beginn(coalesce(p_person.eintritt, p_person.app_start_date), p_tag) as von)
  select coalesce(sum(f.minuten), 0)
    from public.freistellungen f, j
   where f.company_id = p_person.company_id
     and f.user_id = p_person.id
     and f.art = 'pflegefreistellung'
     and f.status = 'Bestätigt'
     and not f.zusatzwoche
     and f.von >= j.von and f.von < (j.von + interval '1 year')::date
$$;

revoke all on function app.tagessoll_minuten(public.users, date) from public, anon, authenticated;
revoke all on function app.pflege_verbraucht(public.users, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Beantragen, Nachweis, Zurückziehen
-- ---------------------------------------------------------------------------

/*
  BEANTRAGEN durch die Person selbst — Dienstverhinderung auch nachträglich.
  Was hier abgelehnt wird, ist eine HARTE Grenze; alles andere sind
  Warnungen für die Bestätigenden (`shared/freistellung.ts`).
*/
create or replace function public.freistellung_beantragen(
  p_art text,
  p_anlass text,
  p_ereignis date,
  p_von date,
  p_bis date,
  p_zeit_von time default null,
  p_zeit_bis time default null,
  p_kind_unter_12 boolean default false,
  p_zusatzwoche boolean default false,
  p_notiz text default null
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  person public.users;
  notiz text := nullif(btrim(coalesce(p_notiz, '')), '');
  tage date[];
  kennung uuid;
  andere public.freistellungen;
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  select * into person from public.users where id = wer and company_id = betrieb;
  if person.id is null then
    raise exception 'Kein Konto in diesem Betrieb' using errcode = '42501';
  end if;
  if p_art is null or p_art not in ('dienstverhinderung', 'pflegefreistellung', 'unbezahlt') then
    raise exception 'Unbekannte Art: %', p_art using errcode = '22023';
  end if;
  if p_von is null or p_bis is null then
    raise exception 'Beginn und Ende angeben' using errcode = '22023';
  end if;
  if p_bis < p_von then
    raise exception 'Das Ende liegt vor dem Beginn' using errcode = '22023';
  end if;
  if p_bis - p_von > 400 then
    raise exception 'Der Zeitraum ist zu lang' using errcode = '22023';
  end if;
  if (p_zeit_von is null) <> (p_zeit_bis is null) then
    raise exception 'Bitte Beginn und Ende der Uhrzeit angeben' using errcode = '22023';
  end if;
  if p_zeit_von is not null and (p_zeit_bis <= p_zeit_von or p_von <> p_bis) then
    raise exception 'Stundenweise geht an einem Tag, und das Ende liegt nach dem Beginn' using errcode = '22023';
  end if;

  if p_art = 'dienstverhinderung' then
    if p_anlass is null or p_anlass not in ('hochzeit', 'tod_partner', 'tod_kind', 'tod_eltern',
        'tod_geschwister', 'geburt', 'wohnungswechsel', 'vorladung', 'musterung') then
      raise exception 'Bitte den Anlass wählen' using errcode = '22023';
    end if;
    if p_ereignis is null then
      raise exception 'Bitte den Tag des Ereignisses angeben' using errcode = '22023';
    end if;
    if p_zeit_von is not null and p_anlass not in ('vorladung', 'musterung') then
      raise exception 'Stundenweise geht nur bei einer Vorladung oder der Musterung' using errcode = '22023';
    end if;
    /*
      GETEILT: ein zweiter Antrag zum selben Fall. Beim Todesfall erlaubt
      (späte Beisetzung); sonst nur mit Begründung — bestätigen kann es dann
      nur die Spitze (`freistellung_entscheiden`).
    */
    if p_anlass not like 'tod\_%' and notiz is null and exists (
         select 1 from public.freistellungen f
          where f.company_id = betrieb and f.user_id = wer and f.art = 'dienstverhinderung'
            and f.anlass = p_anlass and f.ereignis_datum = p_ereignis
            and f.status in ('Beantragt', 'Bestätigt')) then
      raise exception 'Zu diesem Anlass gibt es schon einen Antrag. Geteilt geht es nur mit einer Begründung in der Notiz.'
        using errcode = '22023';
    end if;
    if p_anlass = 'wohnungswechsel' and notiz is null and exists (
         select 1 from public.freistellungen f
          where f.company_id = betrieb and f.user_id = wer and f.art = 'dienstverhinderung'
            and f.anlass = 'wohnungswechsel'
            and extract(year from f.ereignis_datum) = extract(year from p_ereignis)
            and f.ereignis_datum <> p_ereignis
            and f.status in ('Beantragt', 'Bestätigt')) then
      raise exception 'Ein zweiter Wohnungswechsel im selben Jahr braucht eine Begründung in der Notiz (etwa ein beruflich veranlasster Ortswechsel).'
        using errcode = '22023';
    end if;
  else
    if p_anlass is not null or p_ereignis is not null then
      raise exception 'Einen Anlass gibt es nur beim Sonderurlaub' using errcode = '22023';
    end if;
  end if;

  if p_art = 'unbezahlt' and p_zeit_von is not null then
    raise exception 'Unbezahlten Urlaub gibt es nur ganztags' using errcode = '22023';
  end if;
  if p_art <> 'pflegefreistellung' and (coalesce(p_kind_unter_12, false) or coalesce(p_zusatzwoche, false)) then
    raise exception 'Kind und Zusatzwoche gibt es nur bei der Pflegefreistellung' using errcode = '22023';
  end if;
  /*
    DIE ZUSATZWOCHE (§ 16 Abs 2 UrlG): nur für ein Kind unter 12 und erst,
    wenn die erste Woche im laufenden Arbeitsjahr verbraucht ist.
  */
  if coalesce(p_zusatzwoche, false) then
    if not coalesce(p_kind_unter_12, false) then
      raise exception 'Die zweite Woche gibt es nur für ein erkranktes Kind unter 12 Jahren' using errcode = '22023';
    end if;
    if app.pflege_verbraucht(person, p_von) < 60 * coalesce(nullif(person.weekly_target_hours, 0), 40) then
      raise exception 'Die zweite Woche gibt es erst, wenn die erste Woche in diesem Arbeitsjahr verbraucht ist'
        using errcode = '22023';
    end if;
  end if;

  select * into andere from public.freistellungen f
   where f.company_id = betrieb and f.user_id = wer
     and f.status in ('Beantragt', 'Bestätigt')
     and f.von <= p_bis and f.bis >= p_von
   order by f.von limit 1;
  if andere.id is not null then
    raise exception 'Überschneidet sich mit dem Antrag vom % bis %',
      to_char(andere.von, 'DD.MM.YYYY'), to_char(andere.bis, 'DD.MM.YYYY')
      using errcode = '23P01';
  end if;

  tage := app.urlaubstage(person.work_days, p_von, p_bis);
  if coalesce(array_length(tage, 1), 0) = 0 then
    raise exception 'Im Zeitraum liegt kein Arbeitstag' using errcode = '55000';
  end if;

  insert into public.freistellungen (
    company_id, user_id, user_name, art, anlass, ereignis_datum, von, bis, zeit_von, zeit_bis,
    kind_unter12, zusatzwoche, notiz)
  values (betrieb, wer, person.name, p_art, p_anlass, p_ereignis, p_von, p_bis, p_zeit_von, p_zeit_bis,
          coalesce(p_kind_unter_12, false), coalesce(p_zusatzwoche, false), notiz)
  returning id into kennung;
  return kennung;
end;
$$;

revoke all on function public.freistellung_beantragen(text, text, date, date, date, time, time, boolean, boolean, text) from public, anon;
grant execute on function public.freistellung_beantragen(text, text, date, date, date, time, time, boolean, boolean, text) to authenticated;

/*
  DER NACHWEIS: die Person lädt ihn hoch (Pfad `betrieb/person/antrag/…`)
  und trägt ihn hier ein — oder nimmt ihn wieder heraus. Nur am eigenen,
  noch offenen Antrag.
*/
create or replace function public.freistellung_nachweis_setzen(p_id uuid, p_pfad text) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  f public.freistellungen;
begin
  if betrieb is null or wer is null or not app.angemeldet() then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  select * into f from public.freistellungen where id = p_id for update;
  if f.id is null or f.company_id is distinct from betrieb or f.user_id <> wer then
    raise exception 'Diesen Antrag gibt es nicht' using errcode = 'P0002';
  end if;
  if f.status <> 'Beantragt' then
    raise exception 'Über den Antrag ist schon entschieden' using errcode = '55000';
  end if;
  if p_pfad is not null and p_pfad not like betrieb || '/' || wer::text || '/' || p_id::text || '/%' then
    raise exception 'Der Nachweis gehört in den Ordner dieses Antrags' using errcode = '22023';
  end if;
  update public.freistellungen set nachweis_pfad = p_pfad where id = p_id;
end;
$$;

revoke all on function public.freistellung_nachweis_setzen(uuid, text) from public, anon;
grant execute on function public.freistellung_nachweis_setzen(uuid, text) to authenticated;

/*
  ZURÜCKZIEHEN, solange nicht entschieden. Die Datei muss vorher weg — die
  App löscht sie und nimmt den Pfad heraus; sonst bliebe sie verwaist liegen.
*/
create or replace function public.freistellung_zurueckziehen(p_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  f public.freistellungen;
begin
  if betrieb is null or wer is null or not app.angemeldet() then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  select * into f from public.freistellungen where id = p_id for update;
  if f.id is null or f.company_id is distinct from betrieb or f.user_id <> wer then
    raise exception 'Diesen Antrag gibt es nicht' using errcode = 'P0002';
  end if;
  if f.status <> 'Beantragt' then
    raise exception 'Über den Antrag ist schon entschieden — zurücknehmen kann ihn nur, wer bestätigt' using errcode = '55000';
  end if;
  if f.nachweis_pfad is not null then
    raise exception 'Zuerst den Nachweis entfernen' using errcode = '55000';
  end if;
  delete from public.freistellungen where id = p_id;
end;
$$;

revoke all on function public.freistellung_zurueckziehen(uuid) from public, anon;
grant execute on function public.freistellung_zurueckziehen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Entscheiden: bestätigen, ablehnen, stornieren
-- ---------------------------------------------------------------------------

/*
  WER DARF ÜBER WELCHE ART ENTSCHEIDEN — für den Angemeldeten.
*/
create or replace function app.darf_freistellung_entscheiden(p_art text) returns boolean
  language sql stable
  set search_path = ''
as $$
  select case
    when p_art = 'unbezahlt' then app.hat_rolle(array['Geschäftsführung', 'Administrator'])
    else app.hat_rolle(array['Buchhaltung', 'Geschäftsführung', 'Administrator'])
  end
$$;

/*
  BESTÄTIGEN legt die Tage an: die Arbeitstage des Zeitraums, belegte Tage
  werden übersprungen, nie überschrieben. Stundenweise mit Uhrzeit — dann
  steht Arbeit daneben, nur nichts Ganztägiges. STORNO räumt genau die Tage
  dieses Antrags weg, samt einer Kürzung des Anspruchs.

  JEDE ENTSCHEIDUNG LEERT DEN NACHWEIS-PFAD (Entscheidung 5). Den alten Pfad
  gibt die Funktion zurück; die App löscht die Datei über die Speicher-API.
  Geprüft vermerkt wird der Nachweis nur mit `p_nachweis_geprueft` — liegt
  eine Datei vor, geht Bestätigen nur so.

  `p_kuerzung` nur beim unbezahlten Urlaub: `[{"urlaubsjahr": 2026, "tage": 6.25}]`,
  je Urlaubsjahr eine Zeile, die Tage positiv — angelegt wird die Kürzung.
*/
create or replace function public.freistellung_entscheiden(
  p_id uuid,
  p_entscheidung text,
  p_grund text default '',
  p_nachweis_geprueft boolean default false,
  p_kuerzung jsonb default null
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
  tage date[];
  offen date[] := '{}';
  entfernt integer := 0;
  alter_pfad text;
  teilung boolean := false;
  gutgeschrieben numeric := null;
  tagesstatus text;
  k jsonb;
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
    delete from public.time_entries where company_id = betrieb and freistellung_id = p_id;
    get diagnostics entfernt = row_count;
    delete from public.urlaubsanspruch_anpassungen where freistellung_id = p_id;
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
      from unnest(offen) t;

    -- Was gutgeschrieben ist — so zählt es das Kontingent der Pflegefreistellung.
    select round(sum(case when f.zeit_von is not null
                          then extract(epoch from (f.zeit_bis - f.zeit_von)) / 60
                          else app.tagesanteil(betrieb, t) * app.tagessoll_minuten(person, t) end), 1)
      into gutgeschrieben
      from unnest(offen) t;

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
                        else public.freistellungen.minuten end
   where id = p_id;

  return jsonb_build_object(
    'status', p_entscheidung,
    'angelegt', coalesce(array_length(offen, 1), 0),
    'uebersprungen', coalesce(array_length(tage, 1), 0) - coalesce(array_length(offen, 1), 0),
    'entfernt', entfernt,
    'nachweis', alter_pfad);
end;
$$;

revoke all on function public.freistellung_entscheiden(uuid, text, text, boolean, jsonb) from public, anon;
grant execute on function public.freistellung_entscheiden(uuid, text, text, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Der Nachweis als Datei — nur bis zur Entscheidung
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('freistellungsnachweise', 'freistellungsnachweise', false, 10 * 1024 * 1024,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- PFAD: `{betrieb}/{person}/{antrag}/{datei}`.
create or replace function app.nachweis_antrag(objektname text) returns uuid
  language sql immutable
  set search_path = ''
as $$
  select case
    when (storage.foldername(objektname))[3]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(objektname))[3])::uuid
  end
$$;

grant execute on function app.nachweis_antrag(text) to authenticated, service_role;

/*
  LESEN: die Person und das Büro. DER SUPPORT NIE — wie Krankmeldung und
  Antrag selbst; ein Supportzugang mit Mitarbeiten zählt sonst als Spitze.
*/
drop policy if exists freistellungsnachweise_lesen on storage.objects;
create policy freistellungsnachweise_lesen on storage.objects for select to authenticated
  using (bucket_id = 'freistellungsnachweise'
         and not app.ist_plattform()
         and app.betriebsmitglied((storage.foldername(name))[1])
         and ((storage.foldername(name))[2] = auth.uid()::text or app.ist_buch_oder_spitze()));

drop policy if exists freistellungsnachweise_anlegen on storage.objects;
create policy freistellungsnachweise_anlegen on storage.objects for insert to authenticated
  with check (bucket_id = 'freistellungsnachweise'
              and not app.ist_plattform()
              and app.betriebsmitglied((storage.foldername(name))[1])
              and (storage.foldername(name))[2] = auth.uid()::text
              and exists (select 1 from public.freistellungen f
                           where f.id = app.nachweis_antrag(name)
                             and f.company_id = (storage.foldername(name))[1]
                             and f.user_id = auth.uid()
                             and f.status = 'Beantragt'));

-- LÖSCHEN: die Person, solange beantragt; danach wer bestätigt (das Büro).
drop policy if exists freistellungsnachweise_loeschen on storage.objects;
create policy freistellungsnachweise_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'freistellungsnachweise'
         and not app.ist_plattform()
         and app.betriebsmitglied((storage.foldername(name))[1])
         and (app.ist_buch_oder_spitze()
              or ((storage.foldername(name))[2] = auth.uid()::text
                  and exists (select 1 from public.freistellungen f
                               where f.id = app.nachweis_antrag(name)
                                 and f.user_id = auth.uid()
                                 and f.status = 'Beantragt'))));

/*
  NICHT IN DIE SICHERUNG AUSSER HAUS: die Datei lebt nur bis zur Entscheidung
  (Datenminimierung). Beim Löschen eines Betriebs geht sie mit.
*/
create or replace function app.datei_eimer()
  returns table (eimer text, gesichert boolean)
  language sql immutable
  set search_path = ''
as $$
  select * from (values
    ('scheinfotos'::text,            true),
    ('baustellendokumente'::text,    true),
    ('ausleitung'::text,             false),
    ('freistellungsnachweise'::text, false)
  ) as t(eimer, gesichert)
$$;

create or replace function app.datei_betrieb(p_eimer text, p_name text)
  returns text
  language sql stable
  set search_path = ''
as $$
  select case p_eimer
    when 'scheinfotos'            then app.foto_betrieb(p_name)
    when 'baustellendokumente'    then app.dokument_betrieb(p_name)
    when 'ausleitung'             then case
      when (storage.foldername(p_name))[1] = 'ausleitung'
        then (storage.foldername(p_name))[2]
    end
    when 'freistellungsnachweise' then (storage.foldername(p_name))[1]
  end
$$;

-- ---------------------------------------------------------------------------
-- 8. Monatssicht und Wochenplan
-- ---------------------------------------------------------------------------

/*
  GANZTÄGIG ZÄHLT DER TAG wie Urlaub (auch unbezahlt: neutral im Zeitkonto,
  die Lohnverrechnung zieht ihn ab). STUNDENWEISE zählen die Minuten als
  erfüllte Sollzeit, nicht als Arbeitszeit. Zwei Spalten hinten dazu — eine
  Sicht lässt sich nur so erweitern.
*/
create or replace view public.monthly_stats as
  select
    t.company_id,
    t.user_id,
    to_char(t.date, 'YYYY-MM')                                   as monat,
    sum(app.arbeitsminuten(t.status, t.start_time, t.end_time,
                           t.break_duration, t.hours, t.date))   as anwesend_min,
    count(*) filter (where t.status = 'Krank')                   as krank_tage,
    count(*) filter (where t.status = 'Urlaub')                  as urlaub_tage,
    array_agg(distinct to_char(t.date, 'YYYY-MM-DD') order by to_char(t.date, 'YYYY-MM-DD'))
                                                                 as tage,
    count(*) filter (where (t.status in ('Krank', 'Urlaub', 'Berufsschule', 'Unbezahlt')
                            or (t.status in ('Dienstverhinderung', 'Pflegefreistellung') and t.start_time is null))
                       and to_char(t.date, 'MM-DD') in ('12-24', '12-31'))
                                                                 as abwesend_halbtage,
    count(*) filter (where t.status = 'Berufsschule')            as berufsschule_tage,
    count(*) filter (where t.status = 'Unbezahlt'
                        or (t.status in ('Dienstverhinderung', 'Pflegefreistellung') and t.start_time is null))
                                                                 as freistellung_tage,
    coalesce(sum(case when t.status in ('Dienstverhinderung', 'Pflegefreistellung')
                           and t.start_time is not null and t.end_time > t.start_time
                      then extract(epoch from (t.end_time - t.start_time)) / 60 end), 0)
                                                                 as freigestellt_min
    from public.time_entries t
   group by t.company_id, t.user_id, to_char(t.date, 'YYYY-MM');

alter view public.monthly_stats set (security_invoker = on);

/*
  IM WOCHENPLAN: die Leitung sieht die Art („Sonderurlaub", „Pflege-
  freistellung", „Unbezahlt"), alle anderen „abwesend". Den Anlass nie.
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
  select f.user_id, greatest(f.von, p_von), least(f.bis, p_bis),
         case when e.leitung then
           case f.art when 'dienstverhinderung' then 'Sonderurlaub'
                      when 'pflegefreistellung' then 'Pflegefreistellung'
                      else 'Unbezahlt' end
         end,
         case when f.zeit_von is not null then
           to_char(f.zeit_von, 'HH24:MI') || '–' || to_char(f.zeit_bis, 'HH24:MI')
         end
    from public.freistellungen f, erlaubt e
   where e.ok
     and f.company_id = app.betrieb()
     and f.status = 'Bestätigt'
     and f.bis >= p_von and f.von <= p_bis
     and p_bis >= p_von and p_bis - p_von <= 62
$$;

revoke all on function public.wochenplan_abwesend(date, date) from public, anon;
grant execute on function public.wochenplan_abwesend(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Push: neuer Antrag ans Büro, Entscheidung an die Person
-- ---------------------------------------------------------------------------

create or replace function app.push_bei_freistellung() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'Beantragt' then
      perform app.push_anstossen(jsonb_build_object(
        'quelle', 'abwesenheit', 'art', 'freistellung-antrag', 'zeile', to_jsonb(new) - 'anlass' - 'notiz'));
    end if;
  elsif new.status is distinct from old.status
        and new.status in ('Bestätigt', 'Abgelehnt', 'Storniert')
        and new.entschieden_von_uid is distinct from new.user_id then
    perform app.push_anstossen(jsonb_build_object(
      'quelle', 'abwesenheit', 'art', 'freistellung-entschieden', 'zeile', to_jsonb(new) - 'anlass' - 'notiz'));
  end if;
  return null;
end;
$$;

revoke all on function app.push_bei_freistellung() from public, anon, authenticated;

drop trigger if exists freistellungen_push on public.freistellungen;
create trigger freistellungen_push
  after insert or update on public.freistellungen
  for each row execute function app.push_bei_freistellung();

-- ---------------------------------------------------------------------------
-- 10. Datenauskunft und Löschung je Person
--     (Rumpf wie in 20261004100000_urlaubsanspruch_anpassungen.sql, ergänzt)
-- ---------------------------------------------------------------------------

create or replace function public.person_auskunft(
  p_art text,
  p_id uuid,
  p_max_bytes integer default null
) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  grenze bigint := least(coalesce(p_max_bytes, 8 * 1024 * 1024), 8 * 1024 * 1024);
  person public.users;
  kunde public.customers;
  daten jsonb;
  bearbeitet jsonb;
  ergebnis jsonb;
  groesse bigint;
begin
  if betrieb is null or not app.betriebsmitglied(betrieb)
     or not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Eine Datenauskunft stellt die Geschäftsführung aus'
      using errcode = '42501';
  end if;

  if p_art = 'mitarbeiter' then
    select * into person from public.users u where u.id = p_id and u.company_id = betrieb;
    if person.id is null then
      raise exception 'Diese Person gibt es in diesem Betrieb nicht' using errcode = 'P0002';
    end if;

    daten := jsonb_build_object(
      'konto', to_jsonb(person) - array['initial_overtime', 'initial_vacation_days'],
      'anmeldung', (
        select jsonb_build_object(
                 'anmeldename', a.email, 'angelegt_am', a.created_at,
                 'zuletzt_angemeldet', a.last_sign_in_at)
          from auth.users a where a.id = p_id),
      'zeitkonto_anfang', (
        select to_jsonb(z) - array['id', 'company_id', 'user_id']
          from public.zeitkonto_anfang z where z.user_id = p_id),
      'einstellungen', (
        select to_jsonb(p) - 'push_tokens'
               || jsonb_build_object('geraete_fuer_mitteilungen', coalesce(cardinality(p.push_tokens), 0))
          from public.user_prefs p where p.user_id = p_id),
      'zeitbuchungen', (
        select coalesce(jsonb_agg(to_jsonb(t) order by t.date, t.start_time), '[]'::jsonb)
          from public.time_entries t where t.company_id = betrieb and t.user_id = p_id),
      'urlaube_und_zeitausgleich', (
        select coalesce(jsonb_agg(to_jsonb(v) order by v.von), '[]'::jsonb)
          from public.vacations v where v.company_id = betrieb and v.user_id = p_id),
      'krankmeldungen', (
        select coalesce(jsonb_agg(to_jsonb(k) order by k.von), '[]'::jsonb)
          from public.krankmeldungen k where k.company_id = betrieb and k.user_id = p_id),
      -- Ohne den Pfad einer Datei: die Datei selbst geht nie in eine Auskunft.
      'sonderurlaub_und_freistellungen', (
        select coalesce(jsonb_agg(to_jsonb(f) - array['company_id', 'nachweis_pfad'] order by f.von), '[]'::jsonb)
          from public.freistellungen f where f.company_id = betrieb and f.user_id = p_id),
      'urlaubsanspruch_anpassungen', (
        select coalesce(jsonb_agg(to_jsonb(a) - array['company_id'] order by a.urlaubsjahr, a.created_at), '[]'::jsonb)
          from public.urlaubsanspruch_anpassungen a where a.company_id = betrieb and a.user_id = p_id),
      'monatsbilanzen', (
        select coalesce(jsonb_agg(to_jsonb(m) order by m.monat), '[]'::jsonb)
          from public.monthly_stats m where m.company_id = betrieb and m.user_id = p_id),
      'einsaetze', (
        select coalesce(jsonb_agg(to_jsonb(e) order by e.date), '[]'::jsonb)
          from public.assignments e where e.company_id = betrieb and e.user_id = p_id),
      'ruestlisten', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'datum', r.date, 'baustelle', r.project_number) order by r.date), '[]'::jsonb)
          from public.einsatz_material r where r.company_id = betrieb and p_id = any(r.uids)),
      'baustellen', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'baustelle', b.project_number,
                 'als', case when p_id = any(b.project_managers) then 'Leitung' else 'Team' end)
                 order by b.project_number), '[]'::jsonb)
          from public.projects b
         where b.company_id = betrieb
           and (p_id = any(b.assigned_employees) or p_id = any(b.project_managers))),
      'materialanforderungen', (
        select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at), '[]'::jsonb)
          from public.material_orders o where o.company_id = betrieb and o.user_id = p_id),
      'scheine_erstellt', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'schein', s.id, 'datum', s.datum, 'baustelle', s.project_number,
                 'status', s.status) order by s.datum), '[]'::jsonb)
          from public.work_sheets s where s.company_id = betrieb and s.erstellt_von_uid = p_id),
      -- Nach dem Namen: die Stundenzeilen am Schein tragen keine Kennung.
      'stunden_auf_scheinen', (
        select coalesce(jsonb_agg(to_jsonb(h) - array['company_id'] order by h.datum, h.von), '[]'::jsonb)
          from public.work_sheet_hours h
         where h.company_id = betrieb and lower(btrim(h.mitarbeiter)) = lower(btrim(person.name))),
      'fehlerprotokoll', (
        select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at), '[]'::jsonb)
          from public.fehlerprotokoll f where f.company_id = betrieb and f.user_id = p_id),
      'kontoumstellungen', (
        select coalesce(jsonb_agg(to_jsonb(k) - array['company_id'] order by k.am), '[]'::jsonb)
          from public.konto_umstellungen k where k.company_id = betrieb and k.user_id = p_id),
      'kalenderabo', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'angelegt_am', a.angelegt_am, 'zuletzt_abgerufen', a.zuletzt_abgerufen)), '[]'::jsonb)
          from public.kalender_abos a where a.company_id = betrieb and a.user_id = p_id)
    );

    bearbeitet := jsonb_build_object(
      'urlaube_entschieden', (select count(*) from public.vacations v
        where v.company_id = betrieb and v.entschieden_von_uid = p_id and v.user_id <> p_id),
      'krankmeldungen_eingetragen', (select count(*) from public.krankmeldungen k
        where k.company_id = betrieb and k.gemeldet_von_uid = p_id and k.user_id <> p_id),
      'zeitbuchungen_bearbeitet', (select count(*) from public.time_entries t
        where t.company_id = betrieb and t.last_edited_by_uid = p_id and t.user_id <> p_id),
      'zahlungen_erfasst', (select count(*) from public.zahlungseingaenge z
        where z.company_id = betrieb and z.erfasst_von = p_id),
      'betriebsurlaube_angelegt', (select count(*) from public.betriebsurlaube b
        where b.company_id = betrieb and b.angelegt_von_uid = p_id),
      'einkaufsposten_angelegt', (select count(*) from public.einkauf_posten e
        where e.company_id = betrieb and e.angelegt_von_uid = p_id),
      'plaene_hochgeladen', (select count(*) from public.project_documents d
        where d.company_id = betrieb and d.hochgeladen_von = p_id),
      'kataloge_eingespielt', (select count(*) from public.datanorm_laeufe l
        where l.company_id = betrieb and l.angelegt_von = p_id),
      'supportfreigaben', (select count(*) from public.support_freigaben f
        where f.company_id = betrieb and (f.gewaehrt_von = p_id or f.widerrufen_von = p_id)),
      'lagerbewegungen_erfasst', (select count(*) from public.lagerbewegungen l
        where l.company_id = betrieb and l.erfasst_von = p_id),
      'konten_umgestellt', (select count(*) from public.konto_umstellungen k
        where k.company_id = betrieb and k.durch = p_id and k.user_id <> p_id),
      'uids_geprueft', (select count(*) from public.uid_pruefungen u
        where u.company_id = betrieb and u.durch = p_id),
      'freistellungen_entschieden', (select count(*) from public.freistellungen f
        where f.company_id = betrieb and f.entschieden_von_uid = p_id and f.user_id <> p_id),
      'urlaubsansprueche_angepasst', (select count(*) from public.urlaubsanspruch_anpassungen a
        where a.company_id = betrieb and a.user_id <> p_id
          and (a.angelegt_von_uid = p_id or a.entfernt_von_uid = p_id))
    );

    ergebnis := jsonb_build_object(
      'art', 'mitarbeiter',
      'person', person.name,
      'hinweis', 'Stunden auf Scheinen sind über den Namen zugeordnet — bei Namensgleichheit bitte vor dem Weitergeben durchsehen. Bei „als Bearbeiter" steht nur die Anzahl: der Inhalt gehört den anderen Personen.',
      'daten', daten,
      'als_bearbeiter', bearbeitet);

  elsif p_art = 'kunde' then
    select * into kunde from public.customers c where c.id = p_id and c.company_id = betrieb;
    if kunde.id is null then
      raise exception 'Diesen Kunden gibt es in diesem Betrieb nicht' using errcode = 'P0002';
    end if;

    daten := jsonb_build_object(
      'stammdaten', to_jsonb(kunde),
      'baustellen', (
        select coalesce(jsonb_agg(to_jsonb(b) - array['assigned_employees', 'project_managers']
                                  order by b.created_at), '[]'::jsonb)
          from public.projects b
         where b.company_id = betrieb
           and (b.customer_id = p_id
                or (b.customer_id is null and lower(btrim(b.customer_name)) = lower(btrim(kunde.name))))),
      'angebote', (
        select coalesce(jsonb_agg(to_jsonb(q) || jsonb_build_object('positionen', (
                 select coalesce(jsonb_agg(to_jsonb(l) - array['company_id'] order by l.position), '[]'::jsonb)
                   from public.quote_lines l where l.quote_id = q.id)) order by q.quote_date), '[]'::jsonb)
          from public.quotes q
         where q.company_id = betrieb
           and (q.customer_id = p_id
                or (q.customer_id is null and lower(btrim(q.customer_name)) = lower(btrim(kunde.name))))),
      'rechnungen', (
        select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object(
                 'positionen', (
                   select coalesce(jsonb_agg(to_jsonb(l) - array['company_id'] order by l.position), '[]'::jsonb)
                     from public.invoice_lines l where l.invoice_id = r.id),
                 'zahlungen', (
                   select coalesce(jsonb_agg(jsonb_build_object(
                            'datum', z.datum, 'betrag', z.betrag, 'art', z.art, 'hinweis', z.hinweis)
                            order by z.datum), '[]'::jsonb)
                     from public.zahlungseingaenge z where z.invoice_id = r.id))
                 order by r.invoice_date), '[]'::jsonb)
          from public.invoices r
         where r.company_id = betrieb
           and (r.customer_id = p_id
                or (r.customer_id is null and lower(btrim(r.customer_name)) = lower(btrim(kunde.name))))),
      'scheine', (
        select coalesce(jsonb_agg(
                 to_jsonb(s) - array['erstellt_von_uid', 'unterschrift_monteur']
                 || jsonb_build_object(
                   'stunden', (
                     select coalesce(jsonb_agg(to_jsonb(h) - array['company_id'] order by h.position), '[]'::jsonb)
                       from public.work_sheet_hours h where h.work_sheet_id = s.id),
                   'material', (
                     select coalesce(jsonb_agg(to_jsonb(m) - array['company_id'] order by m.position), '[]'::jsonb)
                       from public.work_sheet_material m where m.work_sheet_id = s.id),
                   'fotos', (
                     select coalesce(jsonb_agg(jsonb_build_object('ablage', f.pfad, 'bytes', f.bytes)
                                               order by f.position), '[]'::jsonb)
                       from public.work_sheet_photos f where f.work_sheet_id = s.id))
                 order by s.datum), '[]'::jsonb)
          from public.work_sheets s
         where s.company_id = betrieb
           and (s.customer_id = p_id
                or (s.customer_id is null and lower(btrim(s.customer_name)) = lower(btrim(kunde.name))))),
      'wartungen', (
        select coalesce(jsonb_agg(to_jsonb(w) order by w.faellig_am), '[]'::jsonb)
          from public.wartungen w
         where w.company_id = betrieb
           and (w.customer_id = p_id
                or (w.customer_id is null and lower(btrim(w.customer_name)) = lower(btrim(kunde.name))))),
      'uid_pruefungen', (
        select coalesce(jsonb_agg(to_jsonb(u) - array['company_id', 'durch'] order by u.am), '[]'::jsonb)
          from public.uid_pruefungen u where u.company_id = betrieb and u.customer_id = p_id)
    );

    ergebnis := jsonb_build_object(
      'art', 'kunde',
      'person', kunde.name,
      'hinweis', 'Ältere Baustellen, Angebote, Rechnungen, Scheine und Wartungen ohne Kundenkennung sind über den Namen zugeordnet — bei Namensgleichheit bitte vor dem Weitergeben durchsehen. Fotos stehen mit ihrem Ablageort darin; die Dateien selbst liegen im Speicher.',
      'daten', daten);

  else
    raise exception 'Unbekannte Art: % — erwartet „mitarbeiter" oder „kunde"', p_art
      using errcode = '22023';
  end if;

  ergebnis := ergebnis || jsonb_build_object(
    'betrieb', (select jsonb_build_object('id', c.id, 'name', c.name)
                  from public.companies c where c.id = betrieb),
    'erstellt_am', now(),
    'anzahl', (select coalesce(jsonb_object_agg(k, case jsonb_typeof(v)
                                                     when 'array' then jsonb_array_length(v)
                                                     when 'null' then 0
                                                     else 1 end), '{}'::jsonb)
                 from jsonb_each(ergebnis -> 'daten') as e(k, v)));

  groesse := octet_length(ergebnis::text);
  if groesse > grenze then
    raise exception 'Die Auskunft ist mit % MB zu groß für den Abruf in der App. Bitte die Datensicherung herunterladen und die Zeilen dieser Person daraus nehmen.',
      round(groesse / 1048576.0, 1)
      using errcode = '54000';
  end if;

  return ergebnis;
end;
$$;

revoke all on function public.person_auskunft(text, uuid, integer) from public, anon;
grant execute on function public.person_auskunft(text, uuid, integer) to authenticated;

create or replace function public.person_loeschen(
  p_art text,
  p_id uuid,
  p_nur_pruefen boolean default true
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  person public.users;
  kunde public.customers;
  sofort jsonb;
  aufbewahren jsonb;
  ganz boolean := false;
  rechtsgrund constant text := '§ 132 BAO — sieben Jahre ab Ende des Kalenderjahrs';
begin
  if betrieb is null or not app.betriebsmitglied(betrieb)
     or not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Eine Löschung nach DSGVO veranlasst die Geschäftsführung'
      using errcode = '42501';
  end if;

  if p_art = 'mitarbeiter' then
    select * into person from public.users u where u.id = p_id and u.company_id = betrieb;
    if person.id is null then
      raise exception 'Diese Person gibt es in diesem Betrieb nicht' using errcode = 'P0002';
    end if;
    if person.active is distinct from false then
      raise exception 'Zuerst das Konto deaktivieren — wer noch arbeitet, braucht Einsätze und Zeiten'
        using errcode = '55000';
    end if;

    sofort := jsonb_build_object(
      'einstellungen', (select count(*) from public.user_prefs p where p.user_id = p_id),
      'fehlerprotokoll', (select count(*) from public.fehlerprotokoll f
                           where f.company_id = betrieb and f.user_id = p_id),
      'einsaetze', (select count(*) from public.assignments e
                     where e.company_id = betrieb and e.user_id = p_id),
      'ruestlisten', (select count(*) from public.einsatz_material r
                       where r.company_id = betrieb and p_id = any(r.uids)),
      'baustellen', (select count(*) from public.projects b
                      where b.company_id = betrieb
                        and (p_id = any(b.assigned_employees) or p_id = any(b.project_managers))));

    select coalesce(jsonb_agg(z) filter (where (z ->> 'anzahl')::integer > 0), '[]'::jsonb)
      into aufbewahren
      from (
        select jsonb_build_object('was', 'Zeitbuchungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(t.date)), 'grund', rechtsgrund) as z
          from public.time_entries t where t.company_id = betrieb and t.user_id = p_id
        union all
        select jsonb_build_object('was', 'Urlaube und Zeitausgleich', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(v.bis)), 'grund', rechtsgrund)
          from public.vacations v where v.company_id = betrieb and v.user_id = p_id
        union all
        select jsonb_build_object('was', 'Krankmeldungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(k.bis)), 'grund', rechtsgrund)
          from public.krankmeldungen k where k.company_id = betrieb and k.user_id = p_id
        union all
        select jsonb_build_object('was', 'Sonderurlaub und Freistellungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(f.bis)), 'grund', rechtsgrund)
          from public.freistellungen f where f.company_id = betrieb and f.user_id = p_id
        union all
        -- Sie bestimmen den Resturlaub — Teil der Lohnverrechnung wie die Urlaube.
        select jsonb_build_object('was', 'Anpassungen des Urlaubsanspruchs', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(make_date(a.urlaubsjahr + 1, 12, 31))),
                                  'grund', rechtsgrund)
          from public.urlaubsanspruch_anpassungen a where a.company_id = betrieb and a.user_id = p_id
        union all
        select jsonb_build_object('was', 'Monatsbilanzen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis((m.monat || '-01')::date)), 'grund', rechtsgrund)
          from public.monthly_stats m where m.company_id = betrieb and m.user_id = p_id
        union all
        select jsonb_build_object('was', 'Materialanforderungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(o.created_at::date)), 'grund', rechtsgrund)
          from public.material_orders o where o.company_id = betrieb and o.user_id = p_id
      ) teile;

    if not p_nur_pruefen then
      delete from public.user_prefs p where p.user_id = p_id;
      delete from public.fehlerprotokoll f where f.company_id = betrieb and f.user_id = p_id;
      delete from public.assignments e where e.company_id = betrieb and e.user_id = p_id;
      update public.einsatz_material r
         set uids = array_remove(r.uids, p_id)
       where r.company_id = betrieb and p_id = any(r.uids);
      update public.projects b
         set assigned_employees = array_remove(b.assigned_employees, p_id),
             project_managers = array_remove(b.project_managers, p_id)
       where b.company_id = betrieb
         and (p_id = any(b.assigned_employees) or p_id = any(b.project_managers));
    end if;

    return jsonb_build_object(
      'art', 'mitarbeiter', 'person', person.name, 'geloescht', not p_nur_pruefen,
      'sofort', sofort, 'aufbewahren', aufbewahren, 'ganz', false,
      'hinweis', 'Das Konto bleibt deaktiviert. Name und Anmeldename bleiben, solange Einträge aufbewahrt werden müssen — sie stehen auf ihnen.');

  elsif p_art = 'kunde' then
    select * into kunde from public.customers c where c.id = p_id and c.company_id = betrieb;
    if kunde.id is null then
      raise exception 'Diesen Kunden gibt es in diesem Betrieb nicht' using errcode = 'P0002';
    end if;

    sofort := jsonb_build_object(
      'wartungen', (select count(*) from public.wartungen w
                     where w.company_id = betrieb and w.customer_id = p_id),
      'kontaktdaten', (select count(*) from (
                         select 1 where num_nonnulls(kunde.contact_name, kunde.contact_phone,
                                                     kunde.email, kunde.notes) > 0
                         union all
                         select 1 from public.projects b
                          where b.company_id = betrieb and b.customer_id = p_id
                            and num_nonnulls(b.contact_name, b.contact_phone) > 0) k));

    -- Über Kennung ODER Namen: im Zweifel bleibt der Kunde gesperrt.
    select coalesce(jsonb_agg(z) filter (where (z ->> 'anzahl')::integer > 0), '[]'::jsonb)
      into aufbewahren
      from (
        select jsonb_build_object('was', 'Rechnungen samt Zahlungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(r.invoice_date)), 'grund', rechtsgrund) as z
          from public.invoices r
         where r.company_id = betrieb
           and (r.customer_id = p_id or lower(btrim(r.customer_name)) = lower(btrim(kunde.name)))
        union all
        select jsonb_build_object('was', 'Scheine samt Unterschrift und Fotos', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(s.datum)), 'grund', rechtsgrund)
          from public.work_sheets s
         where s.company_id = betrieb
           and (s.customer_id = p_id or lower(btrim(s.customer_name)) = lower(btrim(kunde.name)))
        union all
        select jsonb_build_object('was', 'Angebote', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(q.quote_date)), 'grund', rechtsgrund)
          from public.quotes q
         where q.company_id = betrieb
           and (q.customer_id = p_id or lower(btrim(q.customer_name)) = lower(btrim(kunde.name)))
        union all
        -- Die Baustelle trägt Zeiten und Material der Belegschaft; sie geht
        -- mit dem letzten Beleg an ihr, frühestens sieben Jahre nach Anlage.
        select jsonb_build_object('was', 'Baustellen mit Name und Adresse', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(coalesce(b.end_date, b.created_at::date))),
                                  'grund', rechtsgrund)
          from public.projects b
         where b.company_id = betrieb
           and (b.customer_id = p_id or lower(btrim(b.customer_name)) = lower(btrim(kunde.name)))
      ) teile;

    ganz := jsonb_array_length(aufbewahren) = 0;

    if not p_nur_pruefen then
      delete from public.wartungen w where w.company_id = betrieb and w.customer_id = p_id;
      if ganz then
        delete from public.customers c where c.id = p_id;
      else
        update public.customers c
           set contact_name = null, contact_phone = null, email = null, notes = null, active = false
         where c.id = p_id;
        update public.projects b
           set contact_name = null, contact_phone = null
         where b.company_id = betrieb and b.customer_id = p_id
           and num_nonnulls(b.contact_name, b.contact_phone) > 0;
      end if;
    end if;

    return jsonb_build_object(
      'art', 'kunde', 'person', kunde.name, 'geloescht', not p_nur_pruefen,
      'sofort', sofort, 'aufbewahren', aufbewahren, 'ganz', ganz,
      'hinweis', case when ganz
        then 'Keine Belege — der Kunde geht ganz.'
        else 'Der Kunde bleibt inaktiv. Name, Adresse und UID bleiben, solange Belege aufbewahrt werden müssen — sie stehen auf ihnen.'
      end);

  else
    raise exception 'Unbekannte Art: % — erwartet „mitarbeiter" oder „kunde"', p_art
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.person_loeschen(text, uuid, boolean) from public, anon;
grant execute on function public.person_loeschen(text, uuid, boolean) to authenticated;
