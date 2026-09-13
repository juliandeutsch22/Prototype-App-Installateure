-- Urlaub entscheiden — in der Datenbank statt in einer Cloud Function.
--
-- WARUM DAS UEBERHAUPT SERVERSEITIG LAEUFT, und warum das so bleibt: die
-- Genehmigung muss zwei Dinge tun, die ein Genehmigender selbst nicht duerfen
-- soll — fremde Zeiteintraege LESEN (um bereits gebuchte Tage nicht zu
-- ueberschreiben) und fremde Zeiteintraege SCHREIBEN. Zeiteintraege tragen
-- Kranken- und Urlaubstage und damit Gesundheitsdaten nach Art. 9 DSGVO.
--
-- Solange nur Buchhaltung und Leitung genehmigen durften, fiel das nicht auf:
-- sie duerfen beides ohnehin. Sobald die Geschaeftsfuehrung frei festlegen
-- kann, WER genehmigt — etwa eine Buerokraft —, ginge es nicht mehr. Eine
-- Datenschutzgrenze aufzumachen, weil sonst eine Funktion nicht laeuft, ist
-- die falsche Reihenfolge.
--
-- `security definer`: die Funktion darf, was der Aufrufer nicht darf. Zu
-- sehen bekommt er nichts — sie gibt nur Zahlen zurueck.

-- ---------------------------------------------------------------------------
-- Oesterreichische Feiertage
-- ---------------------------------------------------------------------------

/*
  DIESELBE RECHNUNG WIE IN `shared/feiertage.ts`, und das ist keine Doppelung
  aus Bequemlichkeit: der Browser zeigt dem Mitarbeiter beim Antrag, wie viele
  Arbeitstage der Zeitraum kostet, und die Datenbank schreibt bei der
  Genehmigung genau diese Tage ins Zeitkonto. Liefen beide auseinander,
  bekaeme ein Monteur fuer eine Woche mit Feiertag fuenf Tage abgezogen und
  haette trotzdem einen Tag als „nicht gebucht" offen.

  Geprueft wird das nicht durch Hinsehen: `tests/supabase/urlaub.test.ts`
  rechnet mehrere Jahre in beiden Fassungen und vergleicht Tag fuer Tag.
*/
create or replace function app.ostersonntag(p_jahr integer) returns date
  language sql immutable
  set search_path = ''
as $$
  -- Gauss/Butcher, Zeichen fuer Zeichen wie in `getEasterDate`.
  with g as (
    select p_jahr % 19 as a, p_jahr / 100 as b, p_jahr % 100 as c
  ), h as (
    select a, b, c, b / 4 as d, b % 4 as e, (b + 8) / 25 as f from g
  ), i as (
    select a, b, c, d, e, f, (b - f + 1) / 3 as gg from h
  ), j as (
    select a, c, (19 * a + b - d - gg + 15) % 30 as hh, e, c / 4 as ii, c % 4 as k from i
  ), l as (
    select a, hh, (32 + 2 * e + 2 * ii - hh - k) % 7 as ll from j
  ), m as (
    select hh, ll, (a + 11 * hh + 22 * ll) / 451 as mm from l
  )
  select make_date(p_jahr,
                   ((hh + ll - 7 * mm + 114) / 31)::integer,
                   ((hh + ll - 7 * mm + 114) % 31 + 1)::integer)
    from m
$$;

create or replace function app.ist_feiertag(p_tag date) returns boolean
  language sql immutable
  set search_path = ''
as $$
  select to_char(p_tag, 'MM-DD') in
           ('01-01', '01-06', '05-01', '08-15', '10-26', '11-01', '12-08', '12-25', '12-26')
      -- Ostermontag, Christi Himmelfahrt, Pfingstmontag, Fronleichnam.
      or p_tag in (select app.ostersonntag(extract(year from p_tag)::integer) + v
                     from unnest(array[1, 39, 50, 60]) v)
$$;

/*
  Die Arbeitstage in einem Zeitraum — Wochenende und Feiertage heraus.

  `extract(dow)` zaehlt wie JavaScript: 0 ist Sonntag. Ohne Angabe gilt
  Montag bis Freitag, genau wie in der App.

  Ein verdrehter Zeitraum liefert nichts: das ist ein Tippfehler, kein Urlaub
  rueckwaerts.
*/
create or replace function app.urlaubstage(
  p_arbeitstage smallint[],
  p_von date,
  p_bis date
) returns date[]
  language sql stable
  set search_path = ''
as $$
  select coalesce(array_agg(s.t::date order by s.t), '{}')
    from generate_series(p_von, p_bis, interval '1 day') s(t)
   where p_von is not null and p_bis is not null and p_bis >= p_von
     and extract(dow from s.t)::smallint = any(
           case when coalesce(array_length(p_arbeitstage, 1), 0) = 0
                then array[1, 2, 3, 4, 5]::smallint[]
                else p_arbeitstage end)
     and not app.ist_feiertag(s.t::date)
$$;

/*
  DIESELBE RECHNUNG, OEFFENTLICH.

  Sie steht hier nicht fuer die Pruefungen, sondern weil sie die Naht ist, an
  der der Browser eines Tages aufhoert selbst zu rechnen: heute zeigt er dem
  Mitarbeiter beim Antrag, wie viele Arbeitstage der Zeitraum kostet, und
  rechnet das in `shared/feiertage.ts`. Solange beide Fassungen nebeneinander
  stehen, haelt `tests/supabase/urlaub.test.ts` sie zusammen — Tag fuer Tag
  ueber ganze Jahre.
*/
create or replace function public.urlaubstage(
  p_arbeitstage smallint[],
  p_von date,
  p_bis date
) returns date[]
  language sql stable
  set search_path = ''
as $$
  select app.urlaubstage(p_arbeitstage, p_von, p_bis)
$$;

revoke all on function public.urlaubstage(smallint[], date, date) from public;
grant execute on function public.urlaubstage(smallint[], date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Die Entscheidung
-- ---------------------------------------------------------------------------

/*
  EIN ZEITRAUM VON MEHR ALS 480 ARBEITSTAGEN IST KEIN URLAUB.

  Die Zahl stammt aus Firestore — dort passten 500 Schreibvorgaenge in einen
  Stapel. Postgres kennt diese Grenze nicht; geblieben ist sie als
  Plausibilitaetspruefung. Zwei Jahre Urlaub am Stueck ist ein Tippfehler im
  Datum, und ein Tippfehler soll nicht hunderttausend Zeilen schreiben.
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
begin
  if betrieb is null or wer is null or not app.angemeldet() then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if p_entscheidung not in ('Genehmigt', 'Abgelehnt', 'Storniert') then
    raise exception 'Unbekannte Entscheidung: %', p_entscheidung using errcode = '22023';
  end if;
  -- Eine Ablehnung ohne Begruendung ist fuer den, der sie bekommt, nicht von
  -- Willkuer zu unterscheiden. Dasselbe gilt fuer eine Ruecknahme.
  if p_entscheidung in ('Abgelehnt', 'Storniert') and length(begruendung) < 3 then
    raise exception 'Bitte einen Grund angeben' using errcode = '22023';
  end if;
  if not app.darf_urlaub_entscheiden(betrieb) then
    raise exception 'Keine Berechtigung, Urlaub zu entscheiden' using errcode = '42501';
  end if;

  select * into a from public.vacations where id = p_antrag;
  -- Mandantengrenze auch hier: die Funktion laeuft mit erhoehten Rechten und
  -- ist an den Zeilenschutz nicht gebunden.
  if a.id is null or a.company_id is distinct from betrieb then
    raise exception 'Diesen Antrag gibt es nicht' using errcode = 'P0002';
  end if;

  if p_entscheidung = 'Storniert' then
    if a.status <> 'Genehmigt' then
      raise exception 'Nur ein genehmigter Urlaub wird zurückgenommen'
        using errcode = '55000';
    end if;
    /*
      Gefunden werden die Tage ueber die Antragskennung, nicht ueber den
      Zeitraum: ein von Hand gebuchter Urlaubstag im selben Zeitraum darf
      nicht mit verschwinden.
    */
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

    -- Die Arbeitstage des BETROFFENEN, nicht die des Entscheidenden: sonst
    -- bekaeme ein Teilzeitmitarbeiter fuenf Tage abgezogen statt drei.
    select u.work_days into arbeitstage from public.users u where u.id = a.user_id;
    tage := app.urlaubstage(arbeitstage, a.von, a.bis);

    if coalesce(array_length(tage, 1), 0) = 0 then
      raise exception 'Im Zeitraum liegt kein Arbeitstag' using errcode = '55000';
    end if;
    if array_length(tage, 1) > 480 then
      raise exception 'Der Zeitraum ist zu lang' using errcode = '22023';
    end if;

    /*
      Bereits gebuchte Tage UEBERSPRINGEN, nicht ueberschreiben. Eine erfasste
      Arbeitsleistung darf eine Genehmigung nicht stillschweigend wegwerfen —
      und niemand wuerde es merken.
    */
    select coalesce(array_agg(t order by t), '{}') into offen
      from unnest(tage) t
     where not exists (
       select 1 from public.time_entries e
        where e.company_id = betrieb and e.user_id = a.user_id and e.date = t);

    insert into public.time_entries (
      id, company_id, user_id, date, status, break_duration,
      user_name, vacation_id, comment
    )
    select gen_random_uuid(), betrieb, a.user_id, t, 'Urlaub', 0,
           coalesce(a.user_name, 'Mitarbeiter'), p_antrag, 'Genehmigter Urlaub'
      from unnest(offen) t;
  end if;

  update public.vacations
     set status = p_entscheidung,
         entschieden_von_uid = wer,
         entschieden_von_name = coalesce(p_entscheider_name, 'Leitung'),
         entschieden_am = now(),
         -- Ein leerer Grund loescht keinen bestehenden: bei einer Genehmigung
         -- wird keiner mitgeschickt, und der Antrag traegt womoeglich noch die
         -- Anmerkung des Antragstellers. Die Variable heisst `begruendung`,
         -- weil `grund` auch der Spaltenname ist — Postgres koennte die beiden
         -- sonst nicht auseinanderhalten.
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
