-- ===========================================================================
-- AUCH DIE MONATSBILANZEN AUS DEN ZWISCHENSTÄNDEN (Durchsicht 15.11.2026,
-- Nacharbeit L13, Befund 4)
-- ===========================================================================
--
-- `zeitkonto_monate` (Zeiterfassung, Monatsauswertung, Export) rechnete jeden
-- gefragten Monat neu, auch wenn sein Stand längst gespeichert ist. Jetzt
-- nimmt es dieselben Zwischenstände wie `zeitkonto_salden`: gespeicherte
-- Monate des Zeitraums bis zur ersten Lücke, ab dort die Rechnung.
--
-- DIE MONATSLISTE BRAUCHT ETWAS, DAS DIE SUMME NICHT BRAUCHT: welche Monate
-- die Rechnung überhaupt ergab. Der Speicher hält jeden Monat ab dem
-- Saldo-Start, auch einen ohne Ergebnis (mit null) — für den Saldo gleich,
-- in der Liste stünde er als zusätzliche Zeile. `ergebnis` hält das fest;
-- gelesen werden nur Monate, die die Rechnung auch geliefert hätte. Die
-- bisherigen Stände kennen den Unterschied nicht und werden verworfen — sie
-- sind gerechnet, nicht eingegeben, und das stündliche Füllen legt sie neu an.
--
-- Gleiches Ergebnis: `zeitkontoZwischenstand.test.ts` vergleicht
-- `zeitkonto_monate` Zeile für Zeile mit der Rechnung ohne Speicher.
-- ===========================================================================

alter table app.zeitkonto_monatsstand add column if not exists ergebnis boolean not null default true;

comment on column app.zeitkonto_monatsstand.ergebnis is
  'Hat app.zeitkonto_rechnung für diesen Monat eine Zeile geliefert? false = Monat ohne Ergebnis, nur damit die Stände lückenlos sind.';

delete from app.zeitkonto_monatsstand;

-- Das Füllen schreibt mit, ob die Rechnung eine Zeile ergab (gezielter Textersatz).
do $migration$
declare
  quelle text := pg_get_functiondef('app.zeitkonto_zwischenstand_fuellen(text)'::regprocedure);
  stellen text[] := array[
    '(user_id, monat, company_id, soll_min, ist_min, gutschrift_min, pflichttage, ohne_buchung, rechenstand)',
    'coalesce(r.pflichttage, 0), coalesce(r.ohne_buchung, 0), stand',
    'rechenstand = excluded.rechenstand, gerechnet_am = now();'];
  stelle text;
begin
  if position('ergebnis' in quelle) > 0 then
    return;
  end if;
  foreach stelle in array stellen loop
    if position(stelle in quelle) = 0 then
      raise exception 'zeitkonto_zwischenstand_fuellen: Stelle fehlt: %', stelle;
    end if;
  end loop;
  quelle := replace(quelle, stellen[1],
    '(user_id, monat, company_id, soll_min, ist_min, gutschrift_min, pflichttage, ohne_buchung, rechenstand, ergebnis)');
  quelle := replace(quelle, stellen[2],
    'coalesce(r.pflichttage, 0), coalesce(r.ohne_buchung, 0), stand, r.user_id is not null');
  quelle := replace(quelle, stellen[3],
    'rechenstand = excluded.rechenstand, ergebnis = excluded.ergebnis, gerechnet_am = now();');
  /*
    WER NOCH GAR KEINEN STAND HAT, RECHNET MIT ALLEN ANDEREN IN EINEM AUFRUF:
    nach `ab` gruppiert, bekäme beim ersten Füllen jede Person mit eigenem
    Eintrittsmonat einen eigenen Aufruf der Rechnung (50 Personen: 2,3 s statt
    0,7 s). Die Rechnung beginnt je Person ohnehin beim Saldo-Start.
  */
  foreach stelle in array array[
    E'      select u.id, u.company_id, x.ab\n',
    E'      select p.ab, array_agg(p.id) as ids from personen p group by p.ab\n'] loop
    if position(stelle in quelle) = 0 then
      raise exception 'zeitkonto_zwischenstand_fuellen: Stelle fehlt: %', stelle;
    end if;
  end loop;
  quelle := replace(quelle, E'      select u.id, u.company_id, x.ab\n',
    E'      select u.id, u.company_id, x.ab, date_trunc(''month'', u.app_start_date)::date as erster\n');
  quelle := replace(quelle, E'      select p.ab, array_agg(p.id) as ids from personen p group by p.ab\n',
    E'      select case when p.ab = p.erster then ''0001-01-01''::date else p.ab end as ab, array_agg(p.id) as ids\n'
    || E'        from personen p group by 1\n');
  execute quelle;
end;
$migration$;

/*
  DAS LESEN, JETZT FÜR EINEN ZEITRAUM. Dieselben Spalten wie
  `app.zeitkonto_rechnung(p_personen, p_von, p_bis)` und dieselben Zeilen.
  Je Person: gespeichert sind die Monate des Zeitraums bis vor `ab`, dem
  ersten Monat im Zeitraum ohne gültigen Stand (sonst dem Monat nach dem
  letzten vergangenen); ab dort die Rechnung wie bisher — für alle Personen
  mit demselben `ab` in einem Aufruf. `p_von` und `p_bis` sind Monatserster
  bzw. Monatsletzter, wie `zeitkonto_monate` sie bildet; ohne Angabe alles
  (`zeitkonto_salden`).
*/
drop function if exists app.zeitkonto_monate_gemerkt(uuid[]);
create or replace function app.zeitkonto_monate_gemerkt(
  p_personen uuid[], p_von date default '0001-01-01', p_bis date default '9999-12-31'
) returns table (user_id uuid, monat date, soll_min numeric, ist_min numeric, gutschrift_min numeric,
                 pflichttage numeric, ohne_buchung integer)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with stand as (select app.zeitkonto_rechenstand() as s),
  grenze as (
    select (date_trunc('month', (now() at time zone 'Europe/Vienna')::date) - interval '1 month')::date as letzter
  ),
  personen as (
    select u.id,
           greatest(date_trunc('month', u.app_start_date)::date, date_trunc('month', p_von)::date) as erster,
           least(gr.letzter, date_trunc('month', p_bis)::date) as bis
      from public.users u, grenze gr
     where u.id = any(p_personen) and u.app_start_date is not null
  ),
  mit_ab as (
    select p.id, p.erster, coalesce(
             (select min(g)::date
                from generate_series(p.erster, p.bis, interval '1 month') g
               where not exists (select 1 from app.zeitkonto_monatsstand z, stand st
                                  where z.user_id = p.id and z.monat = g::date and z.rechenstand = st.s)),
             greatest(p.erster, (p.bis + interval '1 month')::date)) as ab
      from personen p
  ),
  /*
    Wer im Zeitraum noch gar keinen Stand hat, rechnet mit allen anderen ab
    dem Anfang des Zeitraums in einem Aufruf — je Person beginnt die Rechnung
    ohnehin beim Saldo-Start (siehe das Füllen).
  */
  gruppen as (
    select case when m.ab = m.erster then date_trunc('month', p_von)::date else m.ab end as ab,
           array_agg(m.id) as ids
      from mit_ab m group by 1
  )
  select z.user_id, z.monat, z.soll_min, z.ist_min, z.gutschrift_min, z.pflichttage, z.ohne_buchung
    from app.zeitkonto_monatsstand z
    join mit_ab m on m.id = z.user_id, stand st
   where z.monat >= date_trunc('month', p_von)::date and z.monat < m.ab
     and z.rechenstand = st.s and z.ergebnis
  union all
  select r.user_id, r.monat, r.soll_min, r.ist_min, r.gutschrift_min, r.pflichttage, r.ohne_buchung
    from gruppen g, lateral app.zeitkonto_rechnung(g.ids, g.ab, p_bis) r
   where g.ab <= p_bis
$$;

revoke all on function app.zeitkonto_monate_gemerkt(uuid[], date, date) from public, anon, authenticated;

/*
  `zeitkonto_monate` NIMMT DIE ZWISCHENSTÄNDE — gezielter Textersatz an der
  einen Stelle, an der es die Rechnung aufruft; Leserecht (`zeitkonto_lesbar`),
  Rundung und Reihenfolge bleiben.
*/
do $migration$
declare
  quelle text := pg_get_functiondef('public.zeitkonto_monate(date, date, uuid)'::regprocedure);
  alt text := 'from app.zeitkonto_rechnung(app.zeitkonto_lesbar(p_user)';
begin
  if position(alt in quelle) > 0 then
    execute replace(quelle, alt, 'from app.zeitkonto_monate_gemerkt(app.zeitkonto_lesbar(p_user)');
  elsif position('app.zeitkonto_monate_gemerkt(' in quelle) = 0 then
    raise exception 'zeitkonto_monate: die Stelle mit app.zeitkonto_rechnung fehlt';
  end if;
end;
$migration$;
