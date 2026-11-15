/*
  BAUSTELLE GEFÜHRT ABSCHLIESSEN (Durchsicht 15.11.2026, A11 / F1 / V2).

  WAS DIE DURCHSICHT FAND. „Abgeschlossen“ war nur ein Auswahlfeld im
  Bearbeiten-Fenster: es prüfte keine kommenden Einsätze, keine Schein-
  Entwürfe, keine offenen Anforderungen und kein ausgegebenes, unverrechnetes
  Material. Die Baustelle fiel aus allen Auswahlfeldern, ihre Einsätze
  blieben im Plan. Umgekehrt schloss nichts eine Baustelle: weder die
  bezahlte Schlussrechnung noch die erledigte Wartung fragten danach, und
  „Aktiv“ wuchs bei Betrieben, die jede Reparatur als Baustelle führen, auf
  die Auswahlgrenze zu.

  WAS JETZT GILT.
  1. `baustelle_abschluss_lage(projekt)` — was vor dem Abschließen offen ist,
     je Art gezählt: kommende Einsätze (ab heute), Schein-Entwürfe, nicht
     erledigte Anforderungen, unterschriebene Scheine auf keiner gültigen
     Rechnung, unverrechnete Arbeitszeit, ausgegebenes unverrechnetes
     Material (dieselbe Regel wie der Rechnungsvorschlag,
     `ausgegebenes_material`), offene Rechnungen. Was Rechnungen betrifft,
     sieht nur, wer die Rechnungen dieser Baustelle lesen darf
     (Buchhaltung und Spitze, die Projektleitung der Baustelle) — sonst
     `null`, nicht 0.
  2. `baustelle_abschliessen(projekt)` — schließt ab. Kommende Einsätze
     halten es auf: sie stünden sonst auf einer abgeschlossenen Baustelle im
     Plan; umgeplant oder entfernt wird im Einsatzplan, wo auch über ihre
     Rüstliste entschieden wird. Alles andere sagt die Oberfläche vorher und
     fragt „Trotzdem abschließen“ — ein Schein-Entwurf oder eine offene
     Rechnung darf eine Baustelle überleben, aber nicht unbemerkt.
  3. Wieder öffnen bleibt das Auswahlfeld „Stand“ im Bearbeiten-Fenster.

  RECHTE. Die Führung (wie `projects_aendern`). Lesend und schreibend nur
  im eigenen Betrieb (bzw. im Supporteinblick mit „mitarbeiten“).

  ALTDATEN. Nichts wird umgeschrieben; die alte App setzt den Stand weiter
  über das Auswahlfeld.
*/

create or replace function app.baustelle_abschluss_zaehlen(p public.projects) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
  rechnungen_sichtbar boolean := (select app.ist_buch_oder_spitze()) or (select auth.uid()) = any(p.project_managers);
  material bigint;
begin
  if (select app.ist_buch_oder_spitze()) then
    select count(*) into material from public.ausgegebenes_material(p.project_number);
  end if;
  return jsonb_build_object(
    'status', p.status,
    'kommende_einsaetze', (select count(*) from public.assignments a where a.project_id = p.id and a.date >= heute),
    'naechster_einsatz', (select min(a.date) from public.assignments a where a.project_id = p.id and a.date >= heute),
    'schein_entwuerfe', (select count(*) from public.work_sheets w where w.project_id = p.id and w.status = 'Entwurf'),
    'offene_anforderungen', (select count(*) from public.material_orders m
                              where m.project_id = p.id and m.transaction_type = 'order' and m.status <> 'Erledigt'),
    'unverrechnete_scheine', case when rechnungen_sichtbar then (
       select count(*) from public.work_sheets w
        where w.project_id = p.id and w.status = 'Unterschrieben'
          and not exists (select 1 from public.invoice_coverage c
                            join public.invoices i on i.id = c.invoice_id
                           where c.art = 'work_sheet' and c.ziel_id = w.id and i.payment_status <> 'Storniert')) end,
    'unverrechnete_minuten', case when rechnungen_sichtbar then (
       select coalesce(sum(app.arbeitsminuten(t.status, t.start_time, t.end_time, t.break_duration, t.hours, t.date)), 0)::integer
         from public.time_entries t
        where t.project_id = p.id and t.status = 'Anwesend' and t.is_billed = false) end,
    'unverrechnetes_material', material,
    'offene_rechnungen', case when rechnungen_sichtbar then (
       select count(*) from public.invoices i
        where i.project_id = p.id and i.payment_status in ('Offen', 'Überfällig', 'Teilbezahlt')) end
  );
end;
$$;

revoke all on function app.baustelle_abschluss_zaehlen(public.projects) from public, anon, authenticated;

create or replace function public.baustelle_abschluss_lage(p_projekt uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  p public.projects;
begin
  if app.ist_fuehrung() is not true then
    raise exception 'Eine Baustelle schließt die Führung ab' using errcode = '42501';
  end if;
  select * into p from public.projects
   where id = p_projekt
     and (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()));
  if p.id is null then raise exception 'Baustelle nicht gefunden' using errcode = 'P0002'; end if;
  return app.baustelle_abschluss_zaehlen(p);
end;
$$;

revoke all on function public.baustelle_abschluss_lage(uuid) from public, anon;
grant execute on function public.baustelle_abschluss_lage(uuid) to authenticated;

create or replace function public.baustelle_abschliessen(p_projekt uuid) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  p public.projects;
  lage jsonb;
begin
  if app.ist_fuehrung() is not true then
    raise exception 'Eine Baustelle schließt die Führung ab' using errcode = '42501';
  end if;
  select * into p from public.projects
   where id = p_projekt
     and (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()))
   for update;
  if p.id is null then raise exception 'Baustelle nicht gefunden' using errcode = 'P0002'; end if;
  lage := app.baustelle_abschluss_zaehlen(p);
  if (lage ->> 'kommende_einsaetze')::int > 0 then
    raise exception 'Auf % % noch % ab dem % geplant — erst im Einsatzplan umplanen oder entfernen, dann abschließen',
      p.project_number,
      case when (lage ->> 'kommende_einsaetze')::int = 1 then 'ist' else 'sind' end,
      case when (lage ->> 'kommende_einsaetze')::int = 1 then 'ein Einsatz' else (lage ->> 'kommende_einsaetze') || ' Einsätze' end,
      to_char((lage ->> 'naechster_einsatz')::date, 'DD.MM.YYYY')
      using errcode = '55000';
  end if;
  if p.status <> 'Abgeschlossen' then
    update public.projects set status = 'Abgeschlossen' where id = p.id;
  end if;
  return lage || jsonb_build_object('status', 'Abgeschlossen');
end;
$$;

revoke all on function public.baustelle_abschliessen(uuid) from public, anon;
grant execute on function public.baustelle_abschliessen(uuid) to authenticated;
