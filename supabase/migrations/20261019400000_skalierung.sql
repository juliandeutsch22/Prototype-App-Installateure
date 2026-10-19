/*
  WAS BEIM DREIFACHEN BESTAND NOCH MITWUCHS (Ladezeit, Nachweis 19.10.2026).

  Gemessen mit einem Testbestand, der in denselben fünf Jahren dreimal so groß
  ist (75 Leute, 120.000 Katalogartikel, 450.000 Buchungen). Vier Stellen
  wurden mit dem Betrieb langsamer, ohne dass die Seite mehr zeigt:

  1. `lager_frei` mit einer Liste von Kennungen verglich jeden Artikel des
     Betriebs mit jeder Kennung der Liste. Die Funktion bekommt einen Plan für
     alle Aufrufe, und in ihm kann `p_ids is null or m.id = any(p_ids)` den
     Schlüssel nicht nutzen: bei 2.400 Lagerartikeln und 122.400 Artikeln
     eine Sekunde (gemessen 517 ms gegen 9,7 ms). Jetzt zwei Äste, von denen
     je Aufruf genau einer läuft. Dieselbe Rechnung, dieselbe Reihenfolge.
  2. `baustellen_einsatzlage` gab jede Baustelle mit Einsatz im Fenster —
     auch abgeschlossene. „Ohne Einsatz“ fragt nur laufende.
  3. `buchungstage_je_person`: je Person EINE Zeile mit ihren Tagen, statt je
     Person und Tag einer — eine Anfrage statt mehrerer Seiten hintereinander.
  4. `arbeitszeit_vorlauf`: der Vorlauf für den Durchschnitt nach § 9 Abs 4
     AZG (16 Wochen vor dem Monat) je Person und Tag verdichtet, statt jeder
     Buchung. Mehr braucht der Durchschnitt nicht: die Arbeitsminuten des
     Tages und ob er ganztags gutgeschrieben ist. Die Minuten rechnet
     `app.arbeitsminuten` wie `calcWorkMin` (`shared/arbeitszeit.ts`), samt
     Nacht der Zeitumstellung (`app.wien_versatz_min` wie `wienVersatzMin`).
*/

-- 1. lager_frei: zwei Äste statt eines Vergleichs, der den Schlüssel nicht nutzen kann.
create or replace function public.lager_frei(p_ids uuid[] default null)
  returns table (material_id uuid, bestand numeric, zugesagt numeric, geplant numeric, frei numeric)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with artikel as (
    select m.id, m.stock
      from public.materials m
     where p_ids is not null
       and m.id = any (p_ids)
       and m.company_id = (select app.betrieb())
       and (select app.darf(app.betrieb()))
    union all
    select m.id, m.stock
      from public.materials m
     where p_ids is null
       and m.company_id = (select app.betrieb())
       and (select app.darf(app.betrieb()))
  ),
  zusage as (
    select o.material_id, sum(o.quantity) as menge
      from public.material_orders o
     where o.company_id = (select app.betrieb())
       and o.material_id is not null
       and (p_ids is null or o.material_id = any (p_ids))
       and o.transaction_type = 'order'
       and not o.processed
       and (o.beschaffung = 'lager'
            or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
            or (o.beschaffung is null and o.status = 'Abholbereit'))
     group by o.material_id
  ),
  plan as (
    select p.material_id, sum(p.menge) as menge
      from public.einsatz_material_positionen p
      join public.einsatz_material e on e.id = p.einsatz_material_id
     where e.company_id = (select app.betrieb())
       and p.material_id is not null
       and (p_ids is null or p.material_id = any (p_ids))
       and e.date >= (now() at time zone 'Europe/Vienna')::date
       and not coalesce((e.geladen -> p.id) ? 'gebucht', false)
     group by p.material_id
  )
  select a.id,
         a.stock,
         coalesce(z.menge, 0),
         coalesce(pl.menge, 0),
         a.stock - coalesce(z.menge, 0) - coalesce(pl.menge, 0)
    from artikel a
    left join zusage z on z.material_id = a.id
    left join plan pl on pl.material_id = a.id
   -- Feste Reihenfolge: wer ohne Liste seitenweise fragt, verliert keine Zeile.
   order by a.id
$$;

revoke all on function public.lager_frei(uuid[]) from public, anon;
grant execute on function public.lager_frei(uuid[]) to authenticated;

-- 2. Die Einsatzlage nur der laufenden Baustellen.
create or replace function public.baustellen_einsatzlage(p_company text, p_von date, p_heute date, p_bis date)
  returns table (project_number text, zuletzt date, naechster date)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select a.project_number,
         max(a.date) filter (where a.date < p_heute),
         min(a.date) filter (where a.date >= p_heute)
    from public.assignments a
    -- Nur laufende: „ohne Einsatz“ fragt nach keiner anderen (`ohneEinsatzListe`).
    join public.projects pr
      on pr.company_id = a.company_id and pr.project_number = a.project_number and pr.status = 'Aktiv'
   where a.company_id = p_company
     and (a.company_id = (select app.lesebetrieb()) or a.company_id = (select app.supportbetrieb()))
     and a.date between p_von and p_bis
   group by a.project_number
   order by a.project_number
$$;

revoke all on function public.baustellen_einsatzlage(text, date, date, date) from public, anon;
grant execute on function public.baustellen_einsatzlage(text, date, date, date) to authenticated;

-- 3. Die Buchungstage je Person in einer Zeile. `buchungstage` bleibt für ältere Fassungen der App.
create or replace function public.buchungstage_je_person(p_von date, p_bis date)
  returns table (user_id uuid, tage date[])
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select t.user_id, array_agg(distinct t.date order by t.date)
    from public.time_entries t
   where t.company_id = (select app.lesebetrieb())
     and (t.user_id = (select auth.uid()) or (select app.ist_buch_oder_spitze()))
     and t.date between p_von and p_bis
   group by t.user_id
   order by t.user_id
$$;

revoke all on function public.buchungstage_je_person(date, date) from public, anon;
grant execute on function public.buchungstage_je_person(date, date) to authenticated;

-- 4. Der Vorlauf für den Durchschnitt nach § 9 Abs 4 AZG.

/*
  Der Abstand der Wiener Ortszeit zu UTC in Minuten — Wort für Wort wie
  `wienVersatzMin` in `shared/arbeitszeit.ts`: 60 im Winter, 120 im Sommer,
  umgestellt am letzten Sonntag im März um 02:00 und im Oktober um 03:00.
*/
create or replace function app.wien_versatz_min(p_tag date, p_zeit time)
  returns integer
  language sql
  immutable
  set search_path = ''
as $$
  select case
    when m < 3 or m > 10 then 60
    when m > 3 and m < 10 then 120
    when m = 3 then case when t > so or (t = so and p_zeit >= time '03:00') then 120 else 60 end
    else case when t < so or (t = so and p_zeit < time '02:00') then 120 else 60 end
  end
  from (select extract(month from p_tag)::int as m,
               extract(day from p_tag)::int as t,
               -- Der letzte Sonntag des Monats: sein letzter Tag minus dessen Wochentag (So = 0).
               extract(day from ende)::int - extract(dow from ende)::int as so
          from (select (date_trunc('month', p_tag) + interval '1 month - 1 day')::date as ende) e) x
$$;

/*
  Die Arbeitsminuten einer Buchung — Wort für Wort wie `calcWorkMin`: nur
  „Anwesend“; mit Beginn und Ende die Spanne (über Mitternacht in den
  Folgetag) abzüglich des Sprungs der Uhr und der Pause; sonst die Stunden.
*/
create or replace function app.arbeitsminuten(
  p_status text, p_tag date, p_beginn time, p_ende time, p_pause numeric, p_stunden numeric
)
  returns numeric
  language sql
  immutable
  set search_path = ''
as $$
  select case
    when p_status is distinct from 'Anwesend' then 0
    when p_beginn is not null and p_ende is not null then greatest(0,
      extract(epoch from (p_ende - p_beginn)) / 60
      + case when p_ende < p_beginn then 1440 else 0 end
      - (app.wien_versatz_min(case when p_ende < p_beginn then p_tag + 1 else p_tag end, p_ende)
         - app.wien_versatz_min(p_tag, p_beginn))
      - coalesce(p_pause, 0))
    when p_stunden is not null then greatest(0, round(p_stunden * 60))
    else 0
  end
$$;

revoke all on function app.wien_versatz_min(date, time) from public, anon;
revoke all on function app.arbeitsminuten(text, date, time, time, numeric, numeric) from public, anon;
grant execute on function app.wien_versatz_min(date, time) to authenticated;
grant execute on function app.arbeitsminuten(text, date, time, time, numeric, numeric) to authenticated;

/*
  Je Person und Tag: die Arbeitsminuten (nur Buchungen über null, wie
  `grenzfaelle` sie zählt) und ob der Tag ganztags gutgeschrieben ist — wie
  `istGanztagsGutschrift`, ohne die Berufsschule: deren Tage holt die App
  weiter einzeln, weil sie für Jugendliche je Eintrag zählen. Gelesen wird,
  was `time_entries_lesen` erlaubt.
*/
create or replace function public.arbeitszeit_vorlauf(p_von date, p_bis date)
  returns table (user_id uuid, date date, minuten numeric, ganztags boolean)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select t.user_id, t.date,
         sum(x.min) filter (where x.min > 0),
         bool_or(t.status in ('Krank', 'Urlaub', 'Unbezahlt')
                 or (t.status in ('Dienstverhinderung', 'Pflegefreistellung')
                     and not (t.start_time is not null and t.end_time is not null)))
    from public.time_entries t
    cross join lateral (select app.arbeitsminuten(t.status, t.date, t.start_time, t.end_time, t.break_duration, t.hours) as min) x
   where t.company_id = (select app.lesebetrieb())
     and (t.user_id = (select auth.uid()) or (select app.ist_buch_oder_spitze()))
     and t.date between p_von and p_bis
     and t.status <> 'Berufsschule'
   group by t.user_id, t.date
   order by t.user_id, t.date
$$;

revoke all on function public.arbeitszeit_vorlauf(date, date) from public, anon;
grant execute on function public.arbeitszeit_vorlauf(date, date) to authenticated;
