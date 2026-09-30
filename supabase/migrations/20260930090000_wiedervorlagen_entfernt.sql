/*
  WIEDERVORLAGEN ENTFERNT (offene Punkte, Handbuch „Abgeschaltet“).

  `follow_ups` hatte genau einen Eingang: die KI-Spracherfassung. Die ist am
  19.09.2026 ersatzlos entfernt worden; seither schrieb und las keine Ansicht
  die Tabelle. Ein Bereich, den niemand erreicht, ist Ballast, den jede
  Änderung mitschleppt — hier zuletzt beim Umnummern einer Baustelle.

  WAS MIT VORHANDENEN ZEILEN GESCHIEHT: sie gehen mit der Tabelle. Sichtbar
  waren sie nirgends; in den Sicherungen von vorher stehen sie weiter, und der
  Rücklauf spielt eine solche Sicherung trotzdem ein — er übergeht die
  Tabelle mit einer Meldung (`scripts/ruecklaufPlan.mjs`,
  `ENTFERNTE_TABELLEN`).

  Zuerst verliert das Umnummern seine Zeile für die Wiedervorlagen — sonst
  scheiterte es nach dem Entfernen an einer Tabelle, die es nicht mehr gibt.
  Die Fassung aus 20260926114500, ohne diese eine Anweisung.
*/

create or replace function public.baustelle_umnummern(p_projekt uuid, p_neu text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  p public.projects;
  neu text := btrim(coalesce(p_neu, ''));
  alt text;
  gesperrt text[] := '{}';
  n integer;
  bewegt jsonb := '{}';
begin
  if betrieb is null or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  -- Dieselbe Grenze wie `projects_aendern`: wer die Baustelle nicht ändern
  -- darf, darf auch ihre Nummer nicht ändern.
  if not app.ist_fuehrung() then
    raise exception 'Die Nummer einer Baustelle ändert nur die Leitung' using errcode = '42501';
  end if;
  if neu = '' then
    raise exception 'Ohne Projektnummer geht es nicht' using errcode = '22023';
  end if;

  select * into p from public.projects
   where id = p_projekt and company_id = betrieb
   for update;
  if p.id is null then
    raise exception 'Diese Baustelle gibt es nicht' using errcode = 'P0002';
  end if;
  alt := p.project_number;
  if alt = neu then
    return jsonb_build_object('geaendert', false);
  end if;

  if exists (select 1 from public.projects
              where company_id = betrieb and project_number = neu) then
    raise exception 'Die Nummer „%" ist schon vergeben', neu using errcode = '23505';
  end if;

  -- Was die Nummer festhält — gesammelt, damit die Meldung ALLE Gründe nennt.
  select count(*) into n from public.invoices
   where company_id = betrieb and project_number = alt;
  if n > 0 then gesperrt := gesperrt || format('%s Rechnung(en)', n); end if;

  select count(*) into n from public.work_sheets
   where company_id = betrieb and project_number = alt
     and status in ('Unterschrieben', 'Storniert');
  if n > 0 then gesperrt := gesperrt || format('%s unterschriebene(r) Schein(e)', n); end if;

  select count(*) into n from public.time_entries
   where company_id = betrieb and project_number = alt and is_billed;
  if n > 0 then gesperrt := gesperrt || format('%s verrechnete Buchung(en)', n); end if;

  select count(*) into n from public.material_orders
   where company_id = betrieb and project_number = alt and is_billed;
  if n > 0 then gesperrt := gesperrt || format('%s verrechnete Anforderung(en)', n); end if;

  if array_length(gesperrt, 1) > 0 then
    raise exception 'Die Nummer steht schon auf Belegen und bleibt: %',
      array_to_string(gesperrt, ', ') using errcode = '55000';
  end if;

  -- ZUERST die Baustelle, DANN die Zeilen: `baustelle_aufloesen` sucht die
  -- Kennung über die neue Nummer und soll sie dort auch finden.
  update public.projects set project_number = neu where id = p.id;

  update public.time_entries set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('buchungen', n);

  update public.assignments set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('einsaetze', n);

  update public.einsatz_material set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('ruestlisten', n);

  -- Entwürfe UND verworfene Entwürfe. Der verworfene blieb bisher auf der
  -- alten Nummer stehen — wer ihn zurückholte, hatte einen Schein zu einer
  -- Baustelle, die es so nicht mehr gibt. `schein_zustandswechsel` lässt an
  -- ihm genau diese eine Änderung zu, und nur aus dieser Funktion heraus.
  -- Unterschriebene und stornierte Scheine halten die Nummer ohnehin fest
  -- (siehe oben): der Kunde hat sie so unterschrieben.
  update public.work_sheets set project_number = neu
   where company_id = betrieb and project_number = alt and status in ('Entwurf', 'Verworfen');
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('scheine', n);

  update public.material_orders set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('anforderungen', n);

  update public.quotes set project_number = neu
   where company_id = betrieb and project_number = alt;
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('angebote', n);

  -- Die Wartungen merken sich die letzte und die offene Baustelle als Text.
  -- Blieb dort die alte Nummer, führte „zur Baustelle" aus der Wartung ins
  -- Leere.
  update public.wartungen
     set letzte_baustelle = case when letzte_baustelle = alt then neu else letzte_baustelle end,
         offene_baustelle = case when offene_baustelle = alt then neu else offene_baustelle end
   where company_id = betrieb and (letzte_baustelle = alt or offene_baustelle = alt);
  get diagnostics n = row_count; bewegt := bewegt || jsonb_build_object('wartungen', n);

  return jsonb_build_object('geaendert', true, 'alt', alt, 'neu', neu, 'bewegt', bewegt);
end;
$$;

revoke all on function public.baustelle_umnummern(uuid, text) from public, anon;
grant execute on function public.baustelle_umnummern(uuid, text) to authenticated;

drop table if exists public.follow_ups;
