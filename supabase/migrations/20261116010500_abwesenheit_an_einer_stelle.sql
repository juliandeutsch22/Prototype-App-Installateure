/*
  DURCHSICHT 15.11.2026, P9 — ABWESENHEIT AN EINER STELLE.

  WAS DIE DURCHSICHT FAND (`analyse/3-planung-scheine.md`, N1–N3): drei
  Stellen fragten „ist die Person an dem Tag da?“ verschieden.
    - „Lieferung ohne Annahme“ zählte jeden Einsatz, auch den eines
      Kranken (App, `wochenTermine.ts` — dort behoben).
    - Die Auslastung der Woche zählte den Betriebsurlaub als verfügbar
      (App, `laden.ts` — dort behoben).
    - Das Kalender-Abo lieferte Einsätze an Tagen, an denen die Person
      ganztags abwesend ist; „Mein Einsatzplan“ blendet sie aus („das Büro
      plant ihn neu“). Zwei Auskünfte für denselben Tag — hier behoben.

  WAS JETZT GILT. Welche Abwesenheiten es gibt, steht in EINER Funktion
  (`app.abwesenheiten`): genehmigter Urlaub und Zeitausgleich, Krankenstand,
  Berufsschule, bestätigte Freistellungen (und der beantragte Arztbesuch),
  die Tage nach dem Austritt. `wochenplan_abwesend` (Wochenplan, Umplanen,
  Folgetage) liest sie und legt nur die Rechte darüber — wer den Grund sehen
  darf, und die Grenze von 62 Tagen; das Kalender-Abo liest sie ohne
  Anmeldung (es läuft mit dem Dienstschlüssel) für die eine Person des Abos.

  WAS GLEICH BLEIBT: `wochenplan_abwesend` antwortet Zeile für Zeile wie
  bisher (Rumpf aus 20261113100000_austritt.sql, nur geteilt in Daten und
  Rechte). Der Gesamtplan der Leitung zeigt weiter, wer eingeteilt ist —
  die Lücke soll die Leitung dort sehen; ausgeblendet wird nur im eigenen
  Abo der Person, wie in „Mein Einsatzplan“.

  DATENSCHUTZ: die neue Funktion ist intern (kein `grant`); sie gibt keinem
  Aufrufer etwas, was er vorher nicht bekam. Im eigenen Abo erfährt die
  Person nur, dass ein Einsatz an ihrem eigenen Abwesenheitstag fehlt.
*/

create or replace function app.abwesenheiten(p_betrieb text, p_von date, p_bis date)
  returns table (user_id uuid, von date, bis date, art text, zeiten text)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with frei as (
    select f.*,
           least(f.bis, coalesce((select v.von - 1 from public.vacations v
                                   where v.id = f.ueber_urlaub_id and v.status = 'Genehmigt'), f.bis)) as frei_bis
      from public.freistellungen f
     where f.company_id = p_betrieb
       and (f.status = 'Bestätigt' or (f.status = 'Beantragt' and f.anlass = 'arztbesuch'))
  )
  select v.user_id, greatest(v.von, p_von), least(v.bis, p_bis),
         case when v.art = 'Zeitausgleich' then 'ZA' else 'Urlaub' end,
         case when v.za_von is not null then
           to_char(v.za_von, 'HH24:MI') || '–' || to_char(v.za_bis, 'HH24:MI')
         end
    from public.vacations v
   where v.company_id = p_betrieb
     and v.status = 'Genehmigt'
     and v.bis >= p_von and v.von <= p_bis
  union all
  select k.user_id, greatest(k.von, p_von), least(k.bis, p_bis), 'Krank', null::text
    from public.krankmeldungen k
   where k.company_id = p_betrieb
     and k.bis >= p_von and k.von <= p_bis
  union all
  select t.user_id, t.date, t.date, 'Berufsschule', null::text
    from public.time_entries t
   where t.company_id = p_betrieb
     and t.status = 'Berufsschule'
     and t.date between p_von and p_bis
  union all
  select f.user_id, greatest(f.von, p_von), least(f.frei_bis, p_bis),
         case when f.anlass = 'arztbesuch' then 'Arztbesuch'
              else case f.art when 'dienstverhinderung' then 'Sonderurlaub'
                              when 'pflegefreistellung' then 'Pflegefreistellung'
                              else 'Unbezahlt' end
         end,
         case when f.zeit_von is not null then
           to_char(f.zeit_von, 'HH24:MI') || '–' || to_char(f.zeit_bis, 'HH24:MI')
         end
    from frei f
   where f.frei_bis >= p_von and f.von <= p_bis
     and f.frei_bis >= f.von
  union all
  select u.id, greatest(u.austritt + 1, p_von), p_bis, 'Ausgetreten', null::text
    from public.users u
   where u.company_id = p_betrieb
     and u.austritt is not null
     and u.austritt < p_bis
$$;

revoke all on function app.abwesenheiten(text, date, date) from public, anon, authenticated;

/*
  Rumpf wie in 20261113100000_austritt.sql — nur die Daten kommen jetzt aus
  `app.abwesenheiten`. Der Grund bleibt, wem er bisher zustand: Urlaub, ZA,
  Berufsschule, Sonderurlaub & Co., Austritt der Leitung; Krank und
  Arztbesuch dem Büro.
*/
create or replace function public.wochenplan_abwesend(p_von date, p_bis date)
  returns table (user_id uuid, von date, bis date, grund text, zeiten text)
  language sql
  stable
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
  select a.user_id, a.von, a.bis,
         case when a.art in ('Krank', 'Arztbesuch') then case when e.buero then a.art end
              else case when e.leitung then a.art end
         end,
         a.zeiten
    from erlaubt e, app.abwesenheiten(app.betrieb(), p_von, p_bis) a
   where e.ok
     and p_bis >= p_von and p_bis - p_von <= 62
$$;

revoke all on function public.wochenplan_abwesend(date, date) from public, anon;
grant execute on function public.wochenplan_abwesend(date, date) to authenticated, service_role;

/*
  DAS EIGENE KALENDER-ABO: Einsätze an ganztägigen Abwesenheitstagen fallen
  weg, wie in „Mein Einsatzplan“. Rumpf wie in
  20261110170000_wartung_abo_eingang_lager.sql, neu nur `weg`.
  Stundenweise Abwesenheit (ZA 13–17 Uhr) lässt den Einsatz stehen — der
  Vormittag ist ein Arbeitstag.
*/
create or replace function public.kalender_abruf(p_schluessel_hash text) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  abo public.kalender_abos;
  person public.users;
  von date := (now() at time zone 'Europe/Vienna')::date - 62;
  bis date := (now() at time zone 'Europe/Vienna')::date + 366;
  einsaetze jsonb;
  baustellen jsonb;
  termine jsonb;
begin
  select * into abo from public.kalender_abos a where a.schluessel_hash = p_schluessel_hash;
  if abo.id is null then
    return null;
  end if;
  select * into person from public.users u where u.id = abo.user_id and u.company_id = abo.company_id;
  if person.id is null or person.active is distinct from true
     or app.betrieb_ruht(abo.company_id)
     or not exists (select 1 from public.companies c
                     where c.id = abo.company_id and c.kalender_abo_erlaubt) then
    return null;
  end if;
  if abo.art = 'gesamt' and not app.sieht_gesamtplan(person.id) then
    return null;
  end if;
  if abo.art = 'eigen' and not app.modul_aktiv(abo.company_id, 'einsatzplanung') then
    return null;
  end if;

  update public.kalender_abos a set zuletzt_abgerufen = now() where a.id = abo.id;

  if abo.art = 'gesamt' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'datum', g.date,
             'baustelle', g.project_number,
             'kunde', g.customer_name,
             'adresse', g.address,
             'leute', g.leute)
             order by g.date, g.project_number), '[]'::jsonb)
      into baustellen
      from (
        select e.date, e.project_number, b.customer_name, b.address,
               jsonb_agg(jsonb_build_object(
                 'name', coalesce(u.name, e.user_name),
                 'helfer', coalesce(e.as_helper, false),
                 'einstufung', u.einstufung,
                 'von', to_char(e.zeit_von, 'HH24:MI'),
                 'bis', to_char(e.zeit_bis, 'HH24:MI'))
                 order by coalesce(u.name, e.user_name)) as leute
          from public.assignments e
          left join public.projects b
            on b.company_id = e.company_id and b.project_number = e.project_number
          left join public.users u on u.id = e.user_id
         where e.company_id = abo.company_id
           and e.date between von and bis
         group by e.date, e.project_number, b.customer_name, b.address
      ) g;

    select coalesce(jsonb_agg(app.termin_fuers_abo(t) order by t.datum, t.zeit_von nulls first), '[]'::jsonb)
      into termine
      from public.termine t
     where t.company_id = abo.company_id
       and t.datum between von and bis;

    return jsonb_build_object(
      'art', 'gesamt',
      'kennung', person.id,
      'betrieb', (select c.name from public.companies c where c.id = abo.company_id),
      'baustellen', baustellen,
      'termine', termine);
  end if;

  with weg as materialized (
    select a.von, a.bis from app.abwesenheiten(abo.company_id, von, bis) a
     where a.user_id = abo.user_id and a.zeiten is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'datum', e.date,
           'baustelle', e.project_number,
           'von', to_char(e.zeit_von, 'HH24:MI'),
           'bis', to_char(e.zeit_bis, 'HH24:MI'),
           'helfer', coalesce(e.as_helper, false),
           'kommentar', e.comment,
           'kunde', b.customer_name,
           'adresse', b.address,
           'ansprechpartner', b.contact_name,
           'telefon', b.contact_phone)
           order by e.date, e.zeit_von nulls first, e.project_number), '[]'::jsonb)
    into einsaetze
    from public.assignments e
    left join public.projects b
      on b.company_id = e.company_id and b.project_number = e.project_number
   where e.company_id = abo.company_id
     and e.user_id = abo.user_id
     and e.date between von and bis
     -- NEU (P9): nicht an Tagen, an denen die Person ganztags abwesend ist — wie „Mein Einsatzplan“.
     and not exists (select 1 from weg w where e.date between w.von and w.bis);

  select coalesce(jsonb_agg(app.termin_fuers_abo(t) order by t.datum, t.zeit_von nulls first), '[]'::jsonb)
    into termine
    from public.termine t
   where t.company_id = abo.company_id
     and t.datum between von and bis
     and (abo.user_id = any(t.teilnehmer)
          or (t.project_number is not null and exists (
                select 1 from public.assignments a
                 where a.company_id = t.company_id and a.date = t.datum
                   and a.project_number = t.project_number and a.user_id = abo.user_id)));

  return jsonb_build_object(
    'art', 'eigen',
    'kennung', person.id,
    'betrieb', (select c.name from public.companies c where c.id = abo.company_id),
    'einsaetze', einsaetze,
    'termine', termine);
end;
$$;

revoke all on function public.kalender_abruf(text) from public, anon, authenticated;
grant execute on function public.kalender_abruf(text) to service_role;
