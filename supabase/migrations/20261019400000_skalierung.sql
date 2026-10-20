/*
  WAS BEIM DREIFACHEN BESTAND NOCH MITWUCHS (Ladezeit, Nachweis 19.10.2026).

  Gemessen mit einem Testbestand, der in denselben fünf Jahren dreimal so groß
  ist (75 Leute, 120.000 Katalogartikel, 450.000 Buchungen). Diese Stellen
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
     AZG (16 Wochen vor dem Monat) je Person und Tag verdichtet, eine Zeile
     je Person, statt jeder Buchung. Mehr braucht der Durchschnitt nicht:
     die Arbeitsminuten des Tages und ob er ganztags gutgeschrieben ist,
     gerechnet wie `calcWorkMin` (`shared/arbeitszeit.ts`) samt Nacht der
     Zeitumstellung.
  5. `monthly_stats` rief je Buchung eine Funktion, die Postgres nicht
     einbetten kann — fünf Sekunden für die Bilanzen aller Personen. Jetzt
     dieselbe Rechnung in der Abfrage.
  6. `monatsbilanzen_alle`: die Bilanzen aller Personen in einer Anfrage,
     statt seitenweise über die Sicht, die je Seite alles neu rechnete.
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
  Je Person EINE Zeile (wie `buchungstage_je_person`: eine Anfrage statt
  Seiten hintereinander), darin je Tag: die Arbeitsminuten (nur Buchungen über null, wie
  `grenzfaelle` sie zählt) und ob der Tag ganztags gutgeschrieben ist — wie
  `istGanztagsGutschrift`, ohne die Berufsschule: deren Tage holt die App
  weiter einzeln, weil sie für Jugendliche je Eintrag zählen. Gelesen wird,
  was `time_entries_lesen` erlaubt.

  Die Minuten rechnet sie Wort für Wort wie `calcWorkMin`
  (`shared/arbeitszeit.ts`): nur „Anwesend“; mit Beginn und Ende die Spanne
  (über Mitternacht in den Folgetag) abzüglich des Sprungs der Uhr und der
  Pause; sonst die Stunden. Der Sprung wie `wienVersatzMin`: 60 Minuten
  Abstand zu UTC im Winter, 120 im Sommer, umgestellt am letzten Sonntag im
  März um 02:00 und im Oktober um 03:00.

  BEWUSST IN DER ABFRAGE, NICHT ALS EIGENE FUNKTION: eine Hilfsfunktion mit
  `set search_path` kann Postgres nicht in die Abfrage einbetten und ruft sie
  für jede Buchung einzeln — beim Testbestand sechs Sekunden für 16 Wochen
  statt Millisekunden (gemessen 19.10.2026).
*/
create or replace function public.arbeitszeit_vorlauf(p_von date, p_bis date)
  returns table (user_id uuid, tage date[], minuten numeric[], ganztags boolean[])
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select j.user_id,
         array_agg(j.date order by j.date),
         array_agg(j.minuten order by j.date),
         array_agg(j.ganztags order by j.date)
    from (
  select t.user_id, t.date,
         sum(m.min) filter (where m.min > 0) as minuten,
         bool_or(t.status in ('Krank', 'Urlaub', 'Unbezahlt')
                 or (t.status in ('Dienstverhinderung', 'Pflegefreistellung')
                     and not (t.start_time is not null and t.end_time is not null))) as ganztags
    from public.time_entries t
    -- Der Tag des Endes: über Mitternacht der Folgetag.
    cross join lateral (
      select t.end_time < t.start_time as ueber_nacht,
             case when t.end_time < t.start_time then t.date + 1 else t.date end as ende_tag
    ) n
    -- Monat, Tag und letzter Sonntag des Monats für Beginn und Ende (letzter Tag minus dessen Wochentag, So = 0).
    cross join lateral (
      select extract(month from t.date)::int as m_b,
             extract(day from t.date)::int as t_b,
             extract(day from (date_trunc('month', t.date) + interval '1 month - 1 day'))::int
               - extract(dow from (date_trunc('month', t.date) + interval '1 month - 1 day'))::int as so_b,
             extract(month from n.ende_tag)::int as m_e,
             extract(day from n.ende_tag)::int as t_e,
             extract(day from (date_trunc('month', n.ende_tag) + interval '1 month - 1 day'))::int
               - extract(dow from (date_trunc('month', n.ende_tag) + interval '1 month - 1 day'))::int as so_e
    ) k
    cross join lateral (
      select case
               when k.m_b < 3 or k.m_b > 10 then 60
               when k.m_b > 3 and k.m_b < 10 then 120
               when k.m_b = 3 then case when k.t_b > k.so_b or (k.t_b = k.so_b and t.start_time >= time '03:00') then 120 else 60 end
               else case when k.t_b < k.so_b or (k.t_b = k.so_b and t.start_time < time '02:00') then 120 else 60 end
             end as v_beginn,
             case
               when k.m_e < 3 or k.m_e > 10 then 60
               when k.m_e > 3 and k.m_e < 10 then 120
               when k.m_e = 3 then case when k.t_e > k.so_e or (k.t_e = k.so_e and t.end_time >= time '03:00') then 120 else 60 end
               else case when k.t_e < k.so_e or (k.t_e = k.so_e and t.end_time < time '02:00') then 120 else 60 end
             end as v_ende
    ) v
    cross join lateral (
      select case
               when t.status is distinct from 'Anwesend' then 0
               when t.start_time is not null and t.end_time is not null then greatest(0,
                 extract(epoch from (t.end_time - t.start_time)) / 60
                 + case when n.ueber_nacht then 1440 else 0 end
                 - (v.v_ende - v.v_beginn)
                 - coalesce(t.break_duration, 0))
               when t.hours is not null then greatest(0, round(t.hours * 60))
               else 0
             end as min
    ) m
   where t.company_id = (select app.lesebetrieb())
     and (t.user_id = (select auth.uid()) or (select app.ist_buch_oder_spitze()))
     and t.date between p_von and p_bis
     and t.status <> 'Berufsschule'
   group by t.user_id, t.date
    ) j
   group by j.user_id
   order by j.user_id
$$;

revoke all on function public.arbeitszeit_vorlauf(date, date) from public, anon;
grant execute on function public.arbeitszeit_vorlauf(date, date) to authenticated;

/*
  5. DIE MONATSBILANZEN RECHNEN DIE MINUTEN IN DER ABFRAGE.

  `monthly_stats` rief für jede Buchung `app.arbeitsminuten` — eine
  Funktion mit `set search_path`, die Postgres nicht einbetten kann. Beim
  dreifachen Bestand (450.000 Buchungen) kostete das für die Bilanzen
  aller Personen fünf Sekunden je Abfrage, eingebettet 0,15 s (gemessen
  19.10.2026). Die Rechnung ist Wort für Wort die der Funktion (Stand
  `20260928130000`): mit Beginn, Ende und Tag die Spanne in Wiener Zeit
  (über Mitternacht in den Folgetag, die Nacht der Zeitumstellung mit
  ihrer echten Länge) auf ganze Minuten, abzüglich der Pause; ohne Beginn
  oder Ende die Stunden; nur „Anwesend“. Die Spalten bleiben, wie sie sind
  — `create or replace view` lehnt jede andere Art ab.
*/
create or replace view public.monthly_stats as
  select
    t.company_id,
    t.user_id,
    to_char(t.date, 'YYYY-MM')                                   as monat,
    sum(case
          when t.status <> 'Anwesend' then 0
          when t.start_time is null or t.end_time is null then
            case when t.hours is not null then greatest(0, round(t.hours * 60)::integer) else 0 end
          else greatest(0, (
            extract(epoch from (
              ((case when t.end_time < t.start_time then t.date + 1 else t.date end) + t.end_time)
                at time zone 'Europe/Vienna'
              - (t.date + t.start_time) at time zone 'Europe/Vienna'
            )) / 60
          )::integer - coalesce(t.break_duration, 0))
        end)                                                     as anwesend_min,
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
  6. DIE BILANZEN ALLER PERSONEN IN EINER ANFRAGE (Gesamtsaldo der
  Mitarbeiterübersicht). Seitenweise über die Sicht rechnete jede Seite
  die Bilanzen ALLER Buchungen neu — beim dreifachen Bestand acht Seiten.
  Jetzt einmal, je Person eine Zeile mit ihren Monaten. Gelesen wird, was
  `time_entries_lesen` erlaubt (die Sicht prüft als Funktion des
  Eigentümers nicht selbst).
*/
create or replace function public.monatsbilanzen_alle(p_ab_monat text)
  returns table (user_id uuid, bilanzen jsonb)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.user_id, jsonb_agg(to_jsonb(m) - 'company_id' - 'user_id' order by m.monat)
    from public.monthly_stats m
   where m.company_id = (select app.lesebetrieb())
     and (m.user_id = (select auth.uid()) or (select app.ist_buch_oder_spitze()))
     and m.monat >= p_ab_monat
   group by m.user_id
   order by m.user_id
$$;

revoke all on function public.monatsbilanzen_alle(text) from public, anon;
grant execute on function public.monatsbilanzen_alle(text) to authenticated;
