/*
  DIE BAUSTELLENLISTE AUS DER DATENBANK (Durchsicht 15.11.2026, Budget B3:
  höchstens 50 Zeilen je Anfrage).

  Die Verwaltung der Baustellen holte die jüngsten 300 als Live-Liste und
  dazu alle laufenden (gewachsener Bestand: zusammen 720 Zeilen), um im
  Browser zu filtern, zu suchen, nach Status zu gruppieren und das
  Schriftfeld zu zählen. Gezeigt werden je Gruppe 20. Ältere laufende
  Baustellen hinter den jüngsten 300 fehlten ohne Filter der Startseite
  sogar in der Liste.

  `baustellen_liste` gibt je Statusgruppe (Aktiv, Pausiert, Abgeschlossen,
  dann übrige nach Namen) die Zahl und die ersten `p_anzahl ->> Status`
  (neueste zuerst), über ALLE Baustellen des Betriebs, nach denselben Regeln
  wie die App: Auswahl „Laufend“ (nicht abgeschlossen) / „Erledigt“ / „Alle“;
  Filter der Startseite aus der Adresse — aktiv, ohne Projektleiter
  (`ohneProjektleiter`), Ende überschritten (`endeVorbei`), Budget und ohne
  Einsatz über die Nummern `p_nummern`, die ihre eigenen Funktionen nennen;
  „Nur meine“ (Leitung oder Team); Suche im Teilwort von Kunde,
  Bezeichnung, Nummer und Adresse. Dazu die Zahlen des Schriftfelds über
  alle: aktiv und Ende überschritten, wie viele Baustellen es gibt und die
  Nummern der 300 jüngsten (Vorschlag der nächsten Nummer, wie bisher).

  `baustellen_budget_lage` zählt für das Schriftfeld über alle aktiven
  Baustellen mit Budget, wie viele über 100 % und wie viele ab `p_ab` %
  stehen, und nennt die Nummern ab `p_ab` % (Filter „Budget“). Gerechnet wie
  `budgetStand` mit `calcBudgetState`: Fachminuten aus
  `baustellen_stunden`, Prozent gerundet. Ob beide dasselbe sagen, prüft
  `tests/supabase/baustellenListe.test.ts`. Die Stunden sieht wie bisher
  nur die Leitung.

  RECHTE wie das Lesen der Baustellen: wer im Betrieb lesen darf.
*/

create or replace function public.baustellen_liste(
  p_heute date,
  p_status text default 'offen',
  p_filter text default null,
  p_nummern text[] default null,
  p_meine boolean default false,
  p_begriff text default '',
  p_anzahl jsonb default '{}'
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  ich uuid := (select auth.uid());
  begriff text := lower(btrim(coalesce(p_begriff, '')));
  ergebnis jsonb;
begin
  if betrieb is null or not app.darf(betrieb) then
    raise exception 'Kein Zugriff auf die Baustellen dieses Betriebs' using errcode = '42501';
  end if;
  if p_heute is null or p_status not in ('offen', 'archiv', 'alle')
     or (p_filter is not null and p_filter not in ('aktiv', 'ohne-leitung', 'ende-ueberschritten', 'budget', 'ohne-einsatz')) then
    raise exception 'Unbekannte Angabe für die Baustellenliste' using errcode = '22023';
  end if;

  with alle as (
    select p.* from public.projects p where p.company_id = betrieb
  ),
  treffer as (
    select a.*
      from alle a
     where case p_filter
             when 'aktiv' then a.status = 'Aktiv'
             when 'ohne-leitung' then a.status = 'Aktiv' and coalesce(cardinality(a.project_managers), 0) = 0
             when 'ende-ueberschritten' then a.status = 'Aktiv' and a.end_date is not null and a.end_date < p_heute
             when 'budget' then a.project_number = any (coalesce(p_nummern, '{}'))
             when 'ohne-einsatz' then a.project_number = any (coalesce(p_nummern, '{}'))
             else true
           end
       and (not coalesce(p_meine, false) or ich = any (coalesce(a.project_managers, '{}')) or ich = any (coalesce(a.assigned_employees, '{}')))
       and case p_status
             when 'archiv' then a.status = 'Abgeschlossen'
             when 'offen' then a.status is distinct from 'Abgeschlossen'
             else true
           end
       and (begriff = ''
            or strpos(lower(coalesce(a.customer_name, '')), begriff) > 0
            or strpos(lower(coalesce(a.bezeichnung, '')), begriff) > 0
            or strpos(lower(coalesce(a.project_number, '')), begriff) > 0
            or strpos(lower(coalesce(a.address, '')), begriff) > 0)
  ),
  gruppen as (
    select g.status,
           case g.status when 'Aktiv' then 0 when 'Pausiert' then 1 when 'Abgeschlossen' then 2 else 3 end as rang,
           count(*) as anzahl
      from (select coalesce(nullif(t.status, ''), 'Ohne Status') as status from treffer t) g
     group by g.status
  )
  select jsonb_build_object(
    'gruppen', coalesce((
      select jsonb_agg(jsonb_build_object(
               'status', g.status,
               'anzahl', g.anzahl,
               'zeilen', coalesce((
                 select jsonb_agg(to_jsonb(x) order by x.created_at desc nulls last, x.id)
                   from (select t.* from treffer t
                          where coalesce(nullif(t.status, ''), 'Ohne Status') = g.status
                          order by t.created_at desc nulls last, t.id
                          limit greatest(coalesce((p_anzahl ->> g.status)::integer, 20), 0)) x), '[]'::jsonb))
             order by g.rang, g.status collate "de-x-icu")
        from gruppen g), '[]'::jsonb),
    'aktiv', (select count(*) from alle a where a.status = 'Aktiv'),
    'ende', (select count(*) from alle a where a.status = 'Aktiv' and a.end_date is not null and a.end_date < p_heute),
    'gesamt', (select count(*) from alle),
    -- Für den Vorschlag der nächsten Nummer: die Nummern der 300 jüngsten, wie bisher die Live-Liste.
    'neueste_nummern', coalesce((select jsonb_agg(x.project_number) from (
      select a.project_number from alle a order by a.created_at desc nulls last, a.id limit 300) x), '[]'::jsonb)
  ) into ergebnis;
  return ergebnis;
end;
$$;

revoke all on function public.baustellen_liste(date, text, text, text[], boolean, text, jsonb) from public, anon;
grant execute on function public.baustellen_liste(date, text, text, text[], boolean, text, jsonb) to authenticated;

create or replace function public.baustellen_budget_lage(p_ab integer default 90)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  nummern text[];
  ergebnis jsonb;
begin
  -- Dieselbe Grenze wie `baustellen_stunden`: die Stunden der Baustellen sieht nur die Leitung.
  if not (app.betriebsmitglied(betrieb) and (app.ist_fuehrung() or app.ist_buch_oder_spitze())) then
    raise exception 'Die Stunden der Baustellen sieht nur die Leitung' using errcode = '42501';
  end if;
  select coalesce(array_agg(p.project_number), '{}') into nummern
    from public.projects p
   where p.company_id = betrieb and p.status = 'Aktiv' and coalesce(p.estimated_hours, 0) > 0;

  with fach as (
    select s.projekt, sum(s.minuten) as minuten
      from public.baustellen_stunden(nummern) s
     where s.art = 'fach'
     group by s.projekt
  ),
  stand as (
    select p.project_number,
           round((coalesce(f.minuten, 0)::numeric / 60) / p.estimated_hours * 100) as pct
      from public.projects p
      left join fach f on f.projekt = regexp_replace(btrim(p.project_number), '^PR-', '', 'i')
     where p.company_id = betrieb and p.status = 'Aktiv' and coalesce(p.estimated_hours, 0) > 0
  )
  select jsonb_build_object(
    'ueber', (select count(*) from stand where pct > 100),
    'nah', (select count(*) from stand where pct >= p_ab and pct <= 100),
    'nummern', coalesce((select jsonb_agg(project_number order by project_number) from stand where pct >= p_ab), '[]'::jsonb)
  ) into ergebnis;
  return ergebnis;
end;
$$;

revoke all on function public.baustellen_budget_lage(integer) from public, anon;
grant execute on function public.baustellen_budget_lage(integer) to authenticated;
