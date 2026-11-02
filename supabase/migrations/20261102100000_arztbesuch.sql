/*
  DER ARZTBESUCH (Auftrag 02.11.2026, Entscheidung E35).

  RECHTLICH eine Dienstverhinderung aus wichtigen persönlichen Gründen
  (§ 1154b Abs 5 ABGB für Arbeiter und Lehrlinge, § 8 Abs 3 AngG für
  Angestellte; seit 1.7.2018 darf ein Kollektivvertrag Arbeiter dabei nicht
  schlechter stellen). Bezahlt ist die Zeit, die in die Normalarbeitszeit
  fällt, samt der nötigen Wegzeit vom Arbeitsort; der Termin ist, wenn es
  sich einrichten lässt, außerhalb der Arbeitszeit zu legen.

  IN DER APP ein Anlass der Dienstverhinderung (`anlass = 'arztbesuch'`) —
  derselbe Weg wie der Sonderurlaub: beantragt von der Person (vorab oder
  nachträglich), BESTÄTIGT vom Büro, nicht genehmigt; der Nachweis lebt nur
  bis zur Entscheidung. Neu sind:
  - nur mit Uhrzeit, an einem Tag (ganztägig arbeitsunfähig ist eine
    Krankmeldung, nicht ein Arztbesuch);
  - ANGERECHNET wird höchstens, was am Tag noch zur Sollzeit fehlt (bezahlt
    ist nur Zeit, die gearbeitet worden wäre). Den Vorschlag rechnet die
    Datenbank; wer bestätigt, kann ihn mit Grund ändern. Der Tag im
    Zeitkonto trägt genau die angerechnete Zeit, der Antrag den Termin;
  - Nachweis ja oder nein je Betrieb (ab Werk ja);
  - beim Ablehnen gleich die Folge: als Zeitausgleich buchen oder ohne
    Buchung (dann fehlt die Zeit im Saldo);
  - im Wochenplan schon ab dem Antrag: der Termin steht fest, auch bevor das
    Büro bestätigt. Den Anlass sieht nur das Büro, alle anderen „abwesend“.

  DIE ZEITEN EINES TAGES: bisher sperrte ein stundenweiser Sonderurlaub
  jeden weiteren an diesem Tag. Jetzt sperrt nur, was sich zeitlich
  überschneidet — zwei Termine an einem Vormittag sind möglich, eine
  Vorladung am Nachmittag nach einem Arztbesuch ebenso.
*/

-- ---------------------------------------------------------------------------
-- 1. Einstellung des Betriebs und Spalten am Antrag
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists arztbesuch_nachweis boolean not null default true;

comment on column public.companies.arztbesuch_nachweis is
  'Verlangt der Betrieb für einen Arztbesuch eine Bestätigung (Datei oder Papier)? Ab Werk ja. Dann bestätigt das Büro nur mit „Nachweis geprüft“.';

alter table public.freistellungen
  add column if not exists anrechnung_grund text,
  add column if not exists ablehnung_folge text,
  add column if not exists ablehnung_za_id uuid;

alter table public.freistellungen drop constraint if exists freistellungen_ablehnung_folge;
alter table public.freistellungen add constraint freistellungen_ablehnung_folge
  check (ablehnung_folge is null or ablehnung_folge in ('zeitausgleich', 'keine'));
alter table public.freistellungen drop constraint if exists freistellungen_ablehnung_za_fk;
alter table public.freistellungen add constraint freistellungen_ablehnung_za_fk
  foreign key (ablehnung_za_id) references public.vacations(id) on delete set null;
/*
  Ein Arztbesuch hat immer eine Uhrzeit — auch auf Ebene der Tabelle, damit
  kein anderer Weg einen ganztägigen anlegt.
*/
alter table public.freistellungen drop constraint if exists freistellungen_arztbesuch_mit_zeit;
alter table public.freistellungen add constraint freistellungen_arztbesuch_mit_zeit
  check (anlass is distinct from 'arztbesuch' or (zeit_von is not null and von = bis));

comment on column public.freistellungen.anrechnung_grund is
  'Arztbesuch: warum die angerechnete Zeit vom Vorschlag (Rest zur Sollzeit des Tages) abweicht.';
comment on column public.freistellungen.ablehnung_folge is
  'Arztbesuch abgelehnt: „zeitausgleich“ (die Zeit als genehmigter Zeitausgleich gebucht) oder „keine“ (sie fehlt im Saldo).';

-- ---------------------------------------------------------------------------
-- 2. Kontingent: der Arztbesuch hat „die notwendige Zeit“
--    (Rumpf wie in 20261006410000_sonderurlaub_ueber_kontingent.sql)
-- ---------------------------------------------------------------------------

create or replace function app.anlass_kontingent(p_betrieb text, p_anlass text) returns numeric
  language sql stable
  security definer
  set search_path = ''
as $$
  select case
    when p_anlass in ('vorladung', 'musterung', 'arztbesuch') then null
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

-- ---------------------------------------------------------------------------
-- 3. Was am Tag noch zur Sollzeit fehlt
-- ---------------------------------------------------------------------------

/*
  DIE SOLLZEIT DES TAGES (mit dem halben 24./31.12.) minus der gebuchten
  Arbeitszeit minus anderer stundenweiser Freistellungen dieses Tages.
  Zeitausgleich zählt nicht ab: er ist die eigene Zeit der Person und
  verringert ihren Saldo, nicht den Anspruch auf den Arztbesuch. Steht am
  Tag etwas Ganztägiges, fehlt nichts.
*/
create or replace function app.sollrest_minuten(p_person public.users, p_tag date, p_ausser uuid)
  returns numeric
  language sql stable
  security definer
  set search_path = ''
as $$
  select case
    when exists (select 1 from public.time_entries e
                  where e.company_id = p_person.company_id and e.user_id = p_person.id and e.date = p_tag
                    and app.ist_ganztags(e.status, e.start_time, e.end_time)) then 0
    else greatest(0,
      app.tagesanteil(p_person.company_id, p_tag) * app.tagessoll_minuten(p_person, p_tag)
      - coalesce((select sum(app.arbeitsminuten(e.status, e.start_time, e.end_time, e.break_duration, e.hours, e.date))
                    from public.time_entries e
                   where e.company_id = p_person.company_id and e.user_id = p_person.id and e.date = p_tag
                     and e.status = 'Anwesend'), 0)
      - coalesce((select sum(extract(epoch from (e.end_time - e.start_time)) / 60)
                    from public.time_entries e
                   where e.company_id = p_person.company_id and e.user_id = p_person.id and e.date = p_tag
                     and e.status in ('Dienstverhinderung', 'Pflegefreistellung')
                     and e.start_time is not null and e.end_time > e.start_time
                     and e.freistellung_id is distinct from p_ausser), 0))
  end
$$;
revoke all on function app.sollrest_minuten(public.users, date, uuid) from public, anon, authenticated;

/*
  DER VORSCHLAG FÜR DAS BÜRO, bevor es bestätigt: Termin, Sollzeit,
  Gearbeitetes, schon Freigestelltes, der Vorschlag und was sich zeitlich
  überschneidet. Dieselbe Rechnung wie beim Bestätigen.
*/
create or replace function public.arztbesuch_vorschlag(p_id uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  f public.freistellungen;
  person public.users;
  termin integer;
  soll numeric;
  rest numeric;
begin
  if betrieb is null or not app.angemeldet() or not app.betriebsmitglied(betrieb)
     or not app.darf_freistellung_entscheiden('dienstverhinderung') then
    raise exception 'Den Vorschlag sieht, wer Sonderurlaub bestätigt' using errcode = '42501';
  end if;
  select * into f from public.freistellungen where id = p_id;
  if f.id is null or f.company_id is distinct from betrieb or f.anlass is distinct from 'arztbesuch' then
    raise exception 'Diesen Arztbesuch gibt es nicht' using errcode = 'P0002';
  end if;
  select * into person from public.users where id = f.user_id;
  termin := (extract(epoch from (f.zeit_bis - f.zeit_von)) / 60)::integer;
  soll := app.tagesanteil(betrieb, f.von) * app.tagessoll_minuten(person, f.von);
  rest := app.sollrest_minuten(person, f.von, f.id);
  return jsonb_build_object(
    'termin', termin,
    'soll', round(soll),
    'gearbeitet', coalesce((select round(sum(app.arbeitsminuten(e.status, e.start_time, e.end_time, e.break_duration, e.hours, e.date)))
                              from public.time_entries e
                             where e.company_id = betrieb and e.user_id = f.user_id and e.date = f.von
                               and e.status = 'Anwesend'), 0),
    'vorschlag', least(termin, floor(rest)::integer),
    'arbeitstag', f.von = any(app.urlaubstage(person.work_days, f.von, f.von)),
    'ueberschneidung', coalesce((
      select jsonb_agg(jsonb_build_object('status', e.status,
                                          'von', to_char(e.start_time, 'HH24:MI'),
                                          'bis', to_char(e.end_time, 'HH24:MI'))
                       order by e.start_time)
        from public.time_entries e
       where e.company_id = betrieb and e.user_id = f.user_id and e.date = f.von
         and e.freistellung_id is distinct from f.id
         and e.start_time is not null and e.end_time is not null
         and e.start_time < f.zeit_bis and e.end_time > f.zeit_von), '[]'::jsonb),
    'ganztags', (select e.status from public.time_entries e
                  where e.company_id = betrieb and e.user_id = f.user_id and e.date = f.von
                    and app.ist_ganztags(e.status, e.start_time, e.end_time) limit 1));
end;
$$;

revoke all on function public.arztbesuch_vorschlag(uuid) from public, anon;
grant execute on function public.arztbesuch_vorschlag(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Beantragen (Rumpf wie in 20261004200000_freistellungen.sql)
-- ---------------------------------------------------------------------------

/*
  Neu: der Anlass „arztbesuch“ — nur mit Uhrzeit, der Tag des Ereignisses
  ist der Tag des Termins, ein zweiter am selben Tag braucht keine
  Begründung. Die Überschneidung zählt bei zwei stundenweisen Anträgen
  desselben Tages nach der Uhrzeit.
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
  ereignis date := p_ereignis;
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
        'tod_geschwister', 'geburt', 'wohnungswechsel', 'vorladung', 'musterung', 'arztbesuch') then
      raise exception 'Bitte den Anlass wählen' using errcode = '22023';
    end if;
    if p_anlass = 'arztbesuch' then
      if p_zeit_von is null then
        raise exception 'Einen Arztbesuch bitte mit Beginn und Ende eintragen — wer den ganzen Tag arbeitsunfähig ist, meldet sich krank'
          using errcode = '22023';
      end if;
      -- Das Ereignis ist der Termin selbst.
      ereignis := coalesce(ereignis, p_von);
      if ereignis <> p_von then
        raise exception 'Beim Arztbesuch ist der Tag des Ereignisses der Tag des Termins' using errcode = '22023';
      end if;
    end if;
    if ereignis is null then
      raise exception 'Bitte den Tag des Ereignisses angeben' using errcode = '22023';
    end if;
    if p_zeit_von is not null and p_anlass not in ('vorladung', 'musterung', 'arztbesuch') then
      raise exception 'Stundenweise geht nur bei einer Vorladung, der Musterung oder einem Arztbesuch' using errcode = '22023';
    end if;
    /*
      GETEILT: ein zweiter Antrag zum selben Fall. Beim Todesfall erlaubt
      (späte Beisetzung); sonst nur mit Begründung — bestätigen kann es dann
      nur die Spitze (`freistellung_entscheiden`). Zwei Arzttermine an einem
      Tag sind zwei Fälle, keine Teilung.
    */
    if p_anlass not like 'tod\_%' and p_anlass <> 'arztbesuch' and notiz is null and exists (
         select 1 from public.freistellungen f
          where f.company_id = betrieb and f.user_id = wer and f.art = 'dienstverhinderung'
            and f.anlass = p_anlass and f.ereignis_datum = ereignis
            and f.status in ('Beantragt', 'Bestätigt')) then
      raise exception 'Zu diesem Anlass gibt es schon einen Antrag. Geteilt geht es nur mit einer Begründung in der Notiz.'
        using errcode = '22023';
    end if;
    if p_anlass = 'wohnungswechsel' and notiz is null and exists (
         select 1 from public.freistellungen f
          where f.company_id = betrieb and f.user_id = wer and f.art = 'dienstverhinderung'
            and f.anlass = 'wohnungswechsel'
            and extract(year from f.ereignis_datum) = extract(year from ereignis)
            and f.ereignis_datum <> ereignis
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

  /*
    ÜBERSCHNEIDUNG: im selben Zeitraum ein offener oder bestätigter eigener
    Antrag. Sind beide stundenweise am selben Tag, zählt die Uhrzeit.
  */
  select * into andere from public.freistellungen f
   where f.company_id = betrieb and f.user_id = wer
     and f.status in ('Beantragt', 'Bestätigt')
     and f.von <= p_bis and f.bis >= p_von
     and not (f.zeit_von is not null and p_zeit_von is not null
              and (f.zeit_bis <= p_zeit_von or f.zeit_von >= p_zeit_bis))
   order by f.von limit 1;
  if andere.id is not null then
    if andere.zeit_von is not null then
      raise exception 'Überschneidet sich mit dem Antrag am % von % bis %',
        to_char(andere.von, 'DD.MM.YYYY'), to_char(andere.zeit_von, 'HH24:MI'), to_char(andere.zeit_bis, 'HH24:MI')
        using errcode = '23P01';
    end if;
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
  values (betrieb, wer, person.name, p_art, p_anlass, ereignis, p_von, p_bis, p_zeit_von, p_zeit_bis,
          coalesce(p_kind_unter_12, false), coalesce(p_zusatzwoche, false), notiz)
  returning id into kennung;
  return kennung;
end;
$$;

revoke all on function public.freistellung_beantragen(text, text, date, date, date, time, time, boolean, boolean, text) from public, anon;
grant execute on function public.freistellung_beantragen(text, text, date, date, date, time, time, boolean, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Entscheiden (Rumpf wie in 20261006410000_sonderurlaub_ueber_kontingent.sql)
-- ---------------------------------------------------------------------------

/*
  Neu sind drei Parameter und die Abschnitte „ARZTBESUCH“:
  - `p_angerechnet_min`: die angerechnete Zeit; leer = der Vorschlag. Weicht
    sie ab, braucht es `p_anrechnung_grund`.
  - `p_ablehnung_folge`: beim Ablehnen eines Arztbesuchs 'zeitausgleich'
    oder 'keine' (leer = 'keine').
  Und: ein stundenweiser Antrag überspringt einen Tag nur, wenn dort etwas
  Ganztägiges steht oder sich ein anderer stundenweiser Eintrag zeitlich
  überschneidet — nicht mehr bei jedem anderen.

  Die alte Fassung mit sieben Parametern geht; bliebe sie, wäre der Aufruf
  mit benannten Parametern mehrdeutig.
*/
drop function if exists public.freistellung_entscheiden(uuid, text, text, boolean, jsonb, text, text);

create or replace function public.freistellung_entscheiden(
  p_id uuid,
  p_entscheidung text,
  p_grund text default '',
  p_nachweis_geprueft boolean default false,
  p_kuerzung jsonb default null,
  p_ueber_kontingent text default null,
  p_ueber_grund text default null,
  p_angerechnet_min numeric default null,
  p_anrechnung_grund text default null,
  p_ablehnung_folge text default null
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
  anrechnung_begruendung text := btrim(coalesce(p_anrechnung_grund, ''));
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
  arzt boolean;
  termin integer;
  vorschlag integer;
  angerechnet integer := null;
  folge text := null;
  za_id uuid := null;
  nachweis_verlangt boolean;
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
  if p_ablehnung_folge is not null and p_ablehnung_folge not in ('zeitausgleich', 'keine') then
    raise exception 'Unbekannte Folge der Ablehnung: %', p_ablehnung_folge using errcode = '22023';
  end if;

  select * into f from public.freistellungen where id = p_id for update;
  if f.id is null or f.company_id is distinct from betrieb then
    raise exception 'Diesen Antrag gibt es nicht' using errcode = 'P0002';
  end if;
  arzt := f.anlass is not distinct from 'arztbesuch';
  if not app.darf_freistellung_entscheiden(f.art) then
    raise exception '%', case when f.art = 'unbezahlt'
      then 'Über unbezahlten Urlaub entscheiden Geschäftsführung oder Administration'
      else 'Sonderurlaub bestätigen Büro, Geschäftsführung oder Administration' end
      using errcode = '42501';
  end if;
  if not arzt and (p_angerechnet_min is not null or p_ablehnung_folge is not null) then
    raise exception 'Angerechnete Zeit und Folge der Ablehnung gibt es nur beim Arztbesuch' using errcode = '22023';
  end if;
  if p_ablehnung_folge is not null and p_entscheidung <> 'Abgelehnt' then
    raise exception 'Eine Folge gibt es nur beim Ablehnen' using errcode = '22023';
  end if;
  if p_angerechnet_min is not null and p_entscheidung <> 'Bestätigt' then
    raise exception 'Angerechnet wird nur beim Bestätigen' using errcode = '22023';
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
    teilung := f.art = 'dienstverhinderung' and f.anlass not like 'tod\_%' and not arzt and exists (
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
    /*
      ARZTBESUCH MIT NACHWEIS (Einstellung des Betriebs): bestätigt wird nur
      mit geprüfter Bestätigung — als Datei oder auf Papier gezeigt.
    */
    if arzt then
      select c.arztbesuch_nachweis into nachweis_verlangt from public.companies c where c.id = betrieb;
      if coalesce(nachweis_verlangt, true) and not coalesce(p_nachweis_geprueft, false) then
        raise exception 'Der Betrieb verlangt für Arztbesuche eine Bestätigung. Bitte die Arztbestätigung ansehen (Datei oder Papier) und „Nachweis geprüft" anhaken'
          using errcode = '22023';
      end if;
    end if;

    tage := app.urlaubstage(person.work_days, f.von, f.bis);
    if f.zeit_von is not null then
      /*
        STUNDENWEISE: frei ist der Tag, solange nichts Ganztägiges darauf
        steht und kein anderer stundenweiser Eintrag die Uhrzeit überschneidet.
        Gearbeitete Zeit daneben ist der Normalfall.
      */
      select coalesce(array_agg(t order by t), '{}') into offen
        from unnest(tage) t
       where not exists (
         select 1 from public.time_entries e
          where e.company_id = betrieb and e.user_id = f.user_id and e.date = t
            and (app.ist_ganztags(e.status, e.start_time, e.end_time)
                 or (e.status in ('Zeitausgleich', 'Dienstverhinderung', 'Pflegefreistellung')
                     and e.start_time < f.zeit_bis and e.end_time > f.zeit_von)));
    else
      select coalesce(array_agg(t order by t), '{}') into offen
        from unnest(tage) t
       where not exists (
         select 1 from public.time_entries e
          where e.company_id = betrieb and e.user_id = f.user_id and e.date = t);
    end if;
    if coalesce(array_length(offen, 1), 0) = 0 then
      raise exception '%', case when arzt
        then 'Am ' || to_char(f.von, 'DD.MM.YYYY') || ' steht schon etwas Ganztägiges oder ein Eintrag zur selben Uhrzeit — es gibt nichts zu bestätigen'
        else 'Im Zeitraum ist jeder Arbeitstag schon gebucht — es gibt nichts zu bestätigen' end
        using errcode = '55000';
    end if;

    /*
      ARZTBESUCH: ANGERECHNET WIRD HÖCHSTENS DER REST ZUR SOLLZEIT. Bezahlt
      ist nur Zeit, die gearbeitet worden wäre. Der Vorschlag kommt aus der
      Datenbank; eine Abweichung braucht einen Grund, höchstens der Termin.
    */
    if arzt then
      termin := (extract(epoch from (f.zeit_bis - f.zeit_von)) / 60)::integer;
      vorschlag := least(termin, floor(app.sollrest_minuten(person, f.von, f.id))::integer);
      angerechnet := coalesce(round(p_angerechnet_min)::integer, vorschlag);
      if angerechnet <= 0 then
        raise exception 'Am % ist die Sollzeit schon mit Arbeit erfüllt — es bleibt nichts anzurechnen. Ablehnen oder die angerechnete Zeit mit Grund angeben.',
          to_char(f.von, 'DD.MM.YYYY')
          using errcode = '22023';
      end if;
      if angerechnet > termin then
        raise exception 'Angerechnet werden höchstens die % Minuten des Termins', termin using errcode = '22023';
      end if;
      if angerechnet <> vorschlag and length(anrechnung_begruendung) < 3 then
        raise exception 'Bitte begründen, warum % statt % Minuten angerechnet werden', angerechnet, vorschlag
          using errcode = '22023';
      end if;
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
    /*
      Beim Arztbesuch trägt der Tag die angerechnete Zeit ab Beginn des
      Termins; der Termin selbst steht am Antrag. „Arztbesuch“ als Vermerk:
      Tage mit Antrag ändert niemand von Hand (`freistellung_nur_ueber_antrag`).
    */
    insert into public.time_entries (
      id, company_id, user_id, date, status, start_time, end_time, break_duration,
      user_name, freistellung_id, comment)
    select gen_random_uuid(), betrieb, f.user_id, t, tagesstatus, f.zeit_von,
           case when arzt then f.zeit_von + make_interval(mins => angerechnet) else f.zeit_bis end, 0,
           f.user_name, p_id,
           case when arzt then 'Arztbesuch'
                when f.art = 'dienstverhinderung' then 'Sonderurlaub'
                when f.art = 'pflegefreistellung' then 'Pflegefreistellung'
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
    if arzt then
      gutgeschrieben := angerechnet;
    else
      select round(sum(case when f.zeit_von is not null
                            then extract(epoch from (f.zeit_bis - f.zeit_von)) / 60
                            else app.tagesanteil(betrieb, t) * app.tagessoll_minuten(person, t) end), 1)
        into gutgeschrieben
        from unnest(sonder) t;
    end if;

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

  /*
    ARZTBESUCH ABGELEHNT: die Folge gleich mit. „zeitausgleich“ bucht die
    Zeit des Termins als genehmigten stundenweisen Zeitausgleich — wie ihn
    `urlaub_entscheiden` hinterlässt; das darf, wer über Urlaub entscheidet.
    „keine“: nichts wird gebucht, die Zeit fehlt im Saldo.
  */
  if p_entscheidung = 'Abgelehnt' and arzt then
    folge := coalesce(p_ablehnung_folge, 'keine');
    if folge = 'zeitausgleich' then
      if not app.darf_urlaub_entscheiden(betrieb) then
        raise exception 'Als Zeitausgleich buchen darf nur, wer über Urlaub entscheidet' using errcode = '42501';
      end if;
      if exists (
           select 1 from public.time_entries e
            where e.company_id = betrieb and e.user_id = f.user_id and e.date = f.von
              and (app.ist_ganztags(e.status, e.start_time, e.end_time)
                   or (e.status in ('Zeitausgleich', 'Dienstverhinderung', 'Pflegefreistellung')
                       and e.start_time < f.zeit_bis and e.end_time > f.zeit_von))) then
        raise exception 'Am % steht schon etwas zur selben Zeit — als Zeitausgleich lässt sich der Termin nicht buchen',
          to_char(f.von, 'DD.MM.YYYY')
          using errcode = '55000';
      end if;
      insert into public.vacations (
        company_id, user_id, user_name, von, bis, tage, status, art, notiz, za_von, za_bis, za_stunden,
        entschieden_von_uid, entschieden_von_name, entschieden_am, grund)
      values (betrieb, f.user_id, f.user_name, f.von, f.von, 1, 'Genehmigt', 'Zeitausgleich',
              'Arztbesuch abgelehnt — als Zeitausgleich gebucht', f.zeit_von, f.zeit_bis,
              round((extract(epoch from (f.zeit_bis - f.zeit_von)) / 3600)::numeric, 2),
              wer, coalesce(wer_name, 'Büro'), now(), begruendung)
      returning id into za_id;
      insert into public.time_entries (
        id, company_id, user_id, date, status, start_time, end_time, break_duration,
        user_name, vacation_id, comment)
      values (gen_random_uuid(), betrieb, f.user_id, f.von, 'Zeitausgleich', f.zeit_von, f.zeit_bis, 0,
              f.user_name, za_id, 'Genehmigter Zeitausgleich (Arztbesuch abgelehnt)');
    end if;
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
         ueber_urlaub_id = case when p_entscheidung = 'Bestätigt' then urlaub_id else public.freistellungen.ueber_urlaub_id end,
         anrechnung_grund = case when p_entscheidung = 'Bestätigt' and arzt and angerechnet <> vorschlag
                                 then anrechnung_begruendung
                                 else public.freistellungen.anrechnung_grund end,
         ablehnung_folge = case when p_entscheidung = 'Abgelehnt' and arzt then folge
                                else public.freistellungen.ablehnung_folge end,
         ablehnung_za_id = case when p_entscheidung = 'Abgelehnt' and arzt then za_id
                                else public.freistellungen.ablehnung_za_id end
   where id = p_id;

  return jsonb_build_object(
    'status', p_entscheidung,
    'angelegt', coalesce(array_length(offen, 1), 0),
    'uebersprungen', coalesce(array_length(tage, 1), 0) - coalesce(array_length(offen, 1), 0),
    'entfernt', entfernt,
    'nachweis', alter_pfad,
    'ueber', ueber,
    'alsUrlaub', coalesce(array_length(als_urlaub, 1), 0),
    'angerechnet', angerechnet,
    'alsZeitausgleich', za_id is not null);
end;
$$;

revoke all on function public.freistellung_entscheiden(uuid, text, text, boolean, jsonb, text, text, numeric, text, text) from public, anon;
grant execute on function public.freistellung_entscheiden(uuid, text, text, boolean, jsonb, text, text, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Wochenplan (Rumpf wie in 20261006410000_sonderurlaub_ueber_kontingent.sql)
-- ---------------------------------------------------------------------------

/*
  DER ARZTBESUCH STEHT SCHON AB DEM ANTRAG im Plan: der Termin steht fest,
  auch bevor das Büro bestätigt — wer plant, soll an diesem Vormittag
  niemanden einteilen. Den Anlass sieht nur das Büro („Arztbesuch“), wie
  bei der Krankmeldung; alle anderen, auch die Projektleitung, „abwesend“
  mit der Uhrzeit.
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
       and (f.status = 'Bestätigt' or (f.status = 'Beantragt' and f.anlass = 'arztbesuch'))
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
         case when f.anlass = 'arztbesuch' then
                case when e.buero then 'Arztbesuch' end
              when e.leitung then
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

-- ---------------------------------------------------------------------------
-- 7. Push: ein Arztbesuch heißt so (Rumpf wie in 20261004200000_freistellungen.sql)
-- ---------------------------------------------------------------------------

/*
  Der Anlass geht weiter nie mit — außer der Frage, ob es ein Arztbesuch
  ist: die Meldung ans Büro hieße sonst „Neuer Antrag auf Sonderurlaub“.
  Wie die Krankmeldung („Krankmeldung“) nennt sie nur die Art, nie eine
  Anmerkung.
*/
create or replace function app.push_bei_freistellung() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'Beantragt' then
      perform app.push_anstossen(jsonb_build_object(
        'quelle', 'abwesenheit', 'art', 'freistellung-antrag',
        'zeile', to_jsonb(new) - 'anlass' - 'notiz'
                 || jsonb_build_object('arztbesuch', new.anlass is not distinct from 'arztbesuch')));
    end if;
  elsif new.status is distinct from old.status
        and new.status in ('Bestätigt', 'Abgelehnt', 'Storniert')
        and new.entschieden_von_uid is distinct from new.user_id then
    perform app.push_anstossen(jsonb_build_object(
      'quelle', 'abwesenheit', 'art', 'freistellung-entschieden',
      'zeile', to_jsonb(new) - 'anlass' - 'notiz'
               || jsonb_build_object('arztbesuch', new.anlass is not distinct from 'arztbesuch')));
  end if;
  return null;
end;
$$;

revoke all on function app.push_bei_freistellung() from public, anon, authenticated;
