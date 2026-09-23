-- ABWESENHEITEN: Zeitausgleich, Krankmeldung, Betriebsurlaub.
--
-- DREI DINGE, EIN GRUNDSATZ. Was im Zeitkonto zählt, steht weiterhin als
-- Zeiteintrag in `time_entries` — der Saldo, die Monatsbilanz, der
-- Stundennachweis und der Lohnexport lesen nur dort. Neu sind die Wege, auf
-- denen diese Einträge entstehen: ein ZA-Antrag, eine Krankmeldung, ein
-- Betriebsurlaub. Jeder Weg merkt sich, welche Einträge er angelegt hat, und
-- räumt beim Zurücknehmen genau diese wieder weg — nie einen von Hand
-- gebuchten Tag im selben Zeitraum.

-- ---------------------------------------------------------------------------
-- Zeitausgleich als Tagesstatus
-- ---------------------------------------------------------------------------

/*
  ZEITAUSGLEICH ZÄHLT NULL STUNDEN IST — und genau das ist er.

  Das Soll eines Tages kommt aus den Arbeitstagen, nicht aus den Einträgen.
  Ein ZA-Tag steht also mit vollem Soll und ohne Ist da und senkt den Saldo
  um einen Tag; vier Stunden ZA neben vier Stunden Arbeit senken ihn um vier.
  `app.arbeitsminuten` gibt für alles ausser „Anwesend" null zurück, und
  `calcWorkMin` im Browser ebenso — an der Rechnung ändert sich nichts.

  Stundenweise: mit Von/Bis (etwa 13:00–17:00). Ganztags: ohne Zeiten.
*/
alter table public.time_entries drop constraint if exists time_entries_status_check;
alter table public.time_entries add constraint time_entries_status_check
  check (status in ('Anwesend', 'Krank', 'Urlaub', 'Zeitausgleich'));

-- ---------------------------------------------------------------------------
-- Der Antrag kennt seine Art
-- ---------------------------------------------------------------------------

alter table public.vacations
  add column if not exists art text not null default 'Urlaub',
  -- Stundenweiser Zeitausgleich: an EINEM Tag, von–bis.
  add column if not exists za_von time,
  add column if not exists za_bis time,
  -- Wie viele Stunden der ZA kostet — für die Anzeige beim Genehmigen.
  add column if not exists za_stunden numeric(6,2),
  /*
    Das Zeitguthaben, wie es der Antragsteller beim Antrag sah.

    Nur eine AUSKUNFT für den Genehmigenden, keine Prüfung: der Saldo wird im
    Browser aus dem Zeitkonto gerechnet, und wer genehmigt, darf fremde
    Zeitkonten nicht immer lesen. Nachprüfen kann es die Buchhaltung in der
    Mitarbeiterübersicht.
  */
  add column if not exists saldo_bei_antrag numeric(8,2),
  add column if not exists betriebsurlaub_id uuid;

alter table public.vacations drop constraint if exists vacations_art_check;
alter table public.vacations add constraint vacations_art_check
  check (art in ('Urlaub', 'Zeitausgleich'));

alter table public.vacations drop constraint if exists vacations_za;
alter table public.vacations add constraint vacations_za check (
  (art = 'Urlaub' and za_von is null and za_bis is null and za_stunden is null)
  or (art = 'Zeitausgleich' and (
        (za_von is null and za_bis is null)
        or (za_von is not null and za_bis is not null and za_bis > za_von and von = bis)))
);

-- ---------------------------------------------------------------------------
-- Krankmeldungen
-- ---------------------------------------------------------------------------

/*
  EIGENE TABELLE, NICHT DIE URLAUBSTABELLE — wegen der Leserechte.

  Urlaubsanträge liest auch die Projektleitung, und wer Urlaub genehmigen
  darf. Eine Krankmeldung ist ein Gesundheitsdatum (Art. 9 DSGVO); sie liest
  nur die Person selbst und das Büro (Buchhaltung, Geschäftsführung,
  Administration) — dieselbe Grenze wie bei den Zeiteinträgen. Der Support
  nie. Die Projektleitung sieht im Wochenplan „abwesend".

  Eine Diagnose gehört hier NICHT hinein; die Oberfläche sagt das bei der
  Anmerkung.
*/
create table if not exists public.krankmeldungen (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  user_id uuid not null references public.users(id),
  user_name text not null,
  von date not null,
  bis date not null,
  notiz text,
  gemeldet_von_uid uuid,
  gemeldet_von_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint krankmeldungen_zeitraum check (bis >= von)
);

create index if not exists krankmeldungen_person
  on public.krankmeldungen (company_id, user_id, von desc);
create index if not exists krankmeldungen_zeitraum_idx
  on public.krankmeldungen (company_id, bis);

alter table public.krankmeldungen enable row level security;

drop policy if exists krankmeldungen_lesen on public.krankmeldungen;
create policy krankmeldungen_lesen on public.krankmeldungen for select
  using (app.betriebsmitglied(company_id)
         and (user_id = auth.uid() or app.ist_buch_oder_spitze()));
-- Geschrieben wird ausschliesslich über die beiden Funktionen unten: sie
-- legen die Krank-Tage im Zeitkonto gleich mit an und räumen sie wieder weg.

grant select on public.krankmeldungen to authenticated;

drop trigger if exists krankmeldungen_updated_at on public.krankmeldungen;
create trigger krankmeldungen_updated_at before update on public.krankmeldungen
  for each row execute function app.updated_at_setzen();
drop trigger if exists krankmeldungen_betrieb_fest on public.krankmeldungen;
create trigger krankmeldungen_betrieb_fest before update on public.krankmeldungen
  for each row execute function app.betrieb_unveraenderlich();
drop trigger if exists krankmeldungen_support_niemals on public.krankmeldungen;
create trigger krankmeldungen_support_niemals before insert or update or delete on public.krankmeldungen
  for each row execute function app.support_niemals();

alter table public.time_entries add column if not exists krankmeldung_id uuid;
alter table public.time_entries drop constraint if exists time_entries_krankmeldung_fk;
alter table public.time_entries add constraint time_entries_krankmeldung_fk
  foreign key (krankmeldung_id) references public.krankmeldungen(id) on delete set null;
create index if not exists time_entries_krankmeldung
  on public.time_entries (krankmeldung_id) where krankmeldung_id is not null;

-- ---------------------------------------------------------------------------
-- Betriebsurlaub
-- ---------------------------------------------------------------------------

/*
  Lesen darf ihn jeder im Betrieb: dass der Betrieb zu hat, ist kein
  persönliches Datum. Anlegen und Löschen nur über die Funktionen unten.
*/
create table if not exists public.betriebsurlaube (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  von date not null,
  bis date not null,
  bezeichnung text not null,
  urlaub_abbuchen boolean not null default false,
  angelegt_von_uid uuid,
  angelegt_von_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint betriebsurlaube_zeitraum check (bis >= von),
  constraint betriebsurlaube_bezeichnung check (length(btrim(bezeichnung)) > 0)
);

create index if not exists betriebsurlaube_zeitraum_idx
  on public.betriebsurlaube (company_id, bis);

alter table public.betriebsurlaube enable row level security;

drop policy if exists betriebsurlaube_lesen on public.betriebsurlaube;
create policy betriebsurlaube_lesen on public.betriebsurlaube for select
  using (app.darf(company_id));

grant select on public.betriebsurlaube to authenticated;

drop trigger if exists betriebsurlaube_updated_at on public.betriebsurlaube;
create trigger betriebsurlaube_updated_at before update on public.betriebsurlaube
  for each row execute function app.updated_at_setzen();
drop trigger if exists betriebsurlaube_betrieb_fest on public.betriebsurlaube;
create trigger betriebsurlaube_betrieb_fest before update on public.betriebsurlaube
  for each row execute function app.betrieb_unveraenderlich();
drop trigger if exists betriebsurlaube_kein_support_schreiben on public.betriebsurlaube;
create trigger betriebsurlaube_kein_support_schreiben before insert or update or delete on public.betriebsurlaube
  for each row execute function app.support_schreibt_nicht();

alter table public.vacations drop constraint if exists vacations_betriebsurlaub_fk;
alter table public.vacations add constraint vacations_betriebsurlaub_fk
  foreign key (betriebsurlaub_id) references public.betriebsurlaube(id) on delete set null;
create index if not exists vacations_betriebsurlaub
  on public.vacations (betriebsurlaub_id) where betriebsurlaub_id is not null;

/*
  DEN BEZUG ZUM BETRIEBSURLAUB SETZT NUR DIE FUNKTION.

  Ein Antrag mit gesetztem `betriebsurlaub_id` würde beim Löschen des
  Betriebsurlaubs mit weggeräumt — samt seinen Urlaubstagen. Das darf sich
  niemand selbst in einen Antrag schreiben.
*/
drop policy if exists vacations_anlegen on public.vacations;
create policy vacations_anlegen on public.vacations for insert
  with check (app.darf(company_id) and user_id = auth.uid()
              and status = 'Beantragt' and betriebsurlaub_id is null);

create or replace function app.betriebsurlaub_bezug_fest() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then return new; end if;
  if new.betriebsurlaub_id is distinct from old.betriebsurlaub_id then
    raise exception 'Der Bezug zum Betriebsurlaub ist nicht änderbar' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists vacations_betriebsurlaub_fest on public.vacations;
create trigger vacations_betriebsurlaub_fest before update on public.vacations
  for each row execute function app.betriebsurlaub_bezug_fest();

-- ---------------------------------------------------------------------------
-- Die Entscheidung über einen Antrag — jetzt mit Art
-- ---------------------------------------------------------------------------

/*
  WIE BISHER, mit zwei Unterschieden:

  1. Ein genehmigter ZA-Antrag bucht „Zeitausgleich" statt „Urlaub".
  2. Stundenweiser ZA bucht EINEN Eintrag mit Von/Bis. Er darf neben
     gearbeiteter Zeit stehen (vormittags gearbeitet, nachmittags ZA) —
     übersprungen wird er nur, wo schon ein ganztägiger Eintrag oder ein
     anderer ZA steht.

  Alles andere ist Zeile für Zeile die Fassung vom 13.09.2026.
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
         grund = case when begruendung = '' then public.vacations.grund else begruendung end
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
-- Krankmeldung erfassen und ändern
-- ---------------------------------------------------------------------------

/*
  EINE FUNKTION FÜR ANLEGEN UND ÄNDERN, weil beides dieselbe Rechnung ist:
  welche Arbeitstage gehören jetzt dazu? Was nicht mehr dazugehört, geht aus
  dem Zeitkonto; was neu dazukommt und frei ist, kommt hinein. „Wieder gesund
  ab Donnerstag" ist damit dasselbe wie „doch bis Montag".

  OHNE GENEHMIGUNG: krank ist man, das beantragt niemand. Selbst melden darf
  jeder; für jemand anderen meldet das Büro (etwa nach einem Anruf).

  SECURITY DEFINER aus demselben Grund wie beim Urlaub: das Büro schreibt
  fremde Zeiteinträge, und die Prüfung „ist der Tag schon gebucht?" liest
  sie. Zurück kommen nur Zahlen.
*/
create or replace function public.krankmeldung_speichern(
  p_id uuid,
  p_user uuid,
  p_von date,
  p_bis date,
  p_notiz text default null,
  p_melder_name text default null
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

  tage := app.urlaubstage(person.work_days, p_von, p_bis);
  if coalesce(array_length(tage, 1), 0) = 0 then
    raise exception 'Im Zeitraum liegt kein Arbeitstag' using errcode = '55000';
  end if;
  if array_length(tage, 1) > 480 then
    raise exception 'Der Zeitraum ist zu lang' using errcode = '22023';
  end if;

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
            and e.krankmeldung_id is distinct from kennung)));
end;
$$;

revoke all on function public.krankmeldung_speichern(uuid, uuid, date, date, text, text) from public, anon;
grant execute on function public.krankmeldung_speichern(uuid, uuid, date, date, text, text) to authenticated;

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
  -- Zuerst die Tage: der Fremdschlüssel würde sie sonst nur loslösen, und
  -- sie blieben als gewöhnliche Krank-Tage stehen.
  delete from public.time_entries where krankmeldung_id = p_id;
  get diagnostics entfernt = row_count;
  delete from public.krankmeldungen where id = p_id;
  return entfernt;
end;
$$;

revoke all on function public.krankmeldung_loeschen(uuid) from public, anon;
grant execute on function public.krankmeldung_loeschen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Betriebsurlaub anlegen und löschen
-- ---------------------------------------------------------------------------

/*
  MIT HÄKCHEN „Urlaubskonto belasten": jeder aktive Mitarbeiter bekommt einen
  genehmigten Urlaub über den Zeitraum — gezählt in SEINEN Arbeitstagen,
  bereits gebuchte Tage übersprungen, wie bei jeder Genehmigung. Damit steht
  der Betriebsurlaub im Resturlaub, im Zeitkonto und im Lohnexport, ohne
  dass eine dieser Stellen ihn eigens kennen müsste.

  OHNE HÄKCHEN wird nichts gebucht: der Zeitraum sperrt die Planung und
  steht im Wochenplan. Wie die Tage abgegolten werden (Zeitausgleich, frei
  gegeben), entscheidet der Betrieb dann selbst.

  Wer später eintritt, bekommt den Betriebsurlaub nicht nachgebucht — die
  Oberfläche sagt das.
*/
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
  tage date[];
  offen date[];
  antrag uuid;
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
      select u.id, u.name, u.work_days from public.users u
       where u.company_id = betrieb and u.active is not false
       order by u.name
    loop
      tage := app.urlaubstage(person.work_days, p_von, p_bis);
      select coalesce(array_agg(t order by t), '{}') into offen
        from unnest(tage) t
       where not exists (
         select 1 from public.time_entries e
          where e.company_id = betrieb and e.user_id = person.id and e.date = t);
      uebersprungen := uebersprungen
        + coalesce(array_length(tage, 1), 0) - coalesce(array_length(offen, 1), 0);
      continue when coalesce(array_length(offen, 1), 0) = 0;

      -- `tage` ist, was tatsächlich gebucht wird: der Resturlaub zählt die
      -- genehmigten Tage, und ein übersprungener Tag ist keiner.
      insert into public.vacations (
        company_id, user_id, user_name, von, bis, tage, status, art, notiz,
        entschieden_von_uid, entschieden_von_name, entschieden_am, betriebsurlaub_id)
      values (betrieb, person.id, person.name, p_von, p_bis, array_length(offen, 1),
              'Genehmigt', 'Urlaub', titel, wer, coalesce(p_name, 'Büro'), now(), kennung)
      returning id into antrag;

      insert into public.time_entries (
        id, company_id, user_id, date, status, break_duration, user_name, vacation_id, comment)
      select gen_random_uuid(), betrieb, person.id, t, 'Urlaub', 0, person.name, antrag, titel
        from unnest(offen) t;

      leute := leute + 1;
      gebucht := gebucht + array_length(offen, 1);
    end loop;
  end if;

  return jsonb_build_object(
    'id', kennung, 'mitarbeiter', leute, 'tage', gebucht, 'uebersprungen', uebersprungen);
end;
$$;

revoke all on function public.betriebsurlaub_anlegen(date, date, text, boolean, text) from public, anon;
grant execute on function public.betriebsurlaub_anlegen(date, date, text, boolean, text) to authenticated;

/*
  LÖSCHEN NIMMT ALLES ZURÜCK, was der Betriebsurlaub gebucht hat — und nur
  das. Gefunden wird es über den Bezug, nicht über den Zeitraum: ein
  eigener Urlaub im selben Zeitraum bleibt stehen.

  Die Urlaube werden GELÖSCHT, nicht storniert: sie waren nie ein Antrag,
  und „storniert" stünde sonst in jeder persönlichen Antragsliste.
*/
create or replace function public.betriebsurlaub_loeschen(p_id uuid) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  b public.betriebsurlaube;
  tage integer := 0;
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

  delete from public.time_entries
   where company_id = betrieb
     and vacation_id in (select v.id from public.vacations v where v.betriebsurlaub_id = p_id);
  get diagnostics tage = row_count;
  delete from public.vacations where betriebsurlaub_id = p_id;
  get diagnostics leute = row_count;
  delete from public.betriebsurlaube where id = p_id;

  return jsonb_build_object('tage', tage, 'mitarbeiter', leute);
end;
$$;

revoke all on function public.betriebsurlaub_loeschen(uuid) from public, anon;
grant execute on function public.betriebsurlaub_loeschen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Wochenplan: wer fehlt — und für wen auch warum
-- ---------------------------------------------------------------------------

/*
  WER DEN GRUND SIEHT:

    Urlaub, Zeitausgleich    Leitung und Büro (planen und genehmigen)
    Krank                    nur das Büro (Art. 9 DSGVO); die Projektleitung
                             sieht „abwesend", wie die Kollegen
    Kollegen                 nie — nur „abwesend"

  `zeiten` bekommt jeder: „ab 13:00 weg" ist kein Grund, sondern die
  Auskunft, dass jemand vormittags da ist.

  Der Rückgabetyp ändert sich — deshalb erst weg, dann neu.
*/
drop function if exists public.wochenplan_abwesend(date, date);

create function public.wochenplan_abwesend(p_von date, p_bis date)
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
$$;

revoke all on function public.wochenplan_abwesend(date, date) from public, anon;
grant execute on function public.wochenplan_abwesend(date, date) to authenticated;
