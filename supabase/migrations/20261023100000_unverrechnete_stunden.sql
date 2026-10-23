/*
  UNVERRECHNETE STUNDEN DER REGIEBAUSTELLEN (Auftrag 23.10.2026)

  WAS FEHLTE. „Nicht verrechnet“ (Rechnungen, Startseite) kannte nur
  unterschriebene Handwerksscheine. Eine Regiebaustelle über Wochen hat aber
  nicht für jede Buchung einen Schein; gebuchte, nie verrechnete Stunden
  fielen dort nirgends auf — obwohl die Rechnung sie längst nimmt.

  WAS DIESE FUNKTION GIBT. Je Regiebaustelle nur Summe und Zeitraum der
  Arbeitsminuten, die noch auf keiner Rechnung stehen: keine Personen, kein
  Zeitkonto. Minuten wie überall (`app.arbeitsminuten` mit Tag), nur
  „Anwesend“, wie `assembleInvoice`. Pauschale und Einheitspreis rechnen nach
  dem Angebot ab — ihre Stunden sind kein offenes Geld.

  WER. Wer Rechnungen schreibt: Buchhaltung und Spitze (`ist_buch_oder_spitze`).
  Allen anderen ein Fehler statt einer leeren Liste: leer hiesse „alles
  verrechnet“, eine falsche Entwarnung.

  DIE NUMMERN. Gruppiert nach der Nummer ohne „PR-“, wie `baustellen_stunden`
  und `normProjectNumber`; eine Buchung ohne passende Baustelle fällt heraus —
  verrechnen lässt sie sich ohnehin nur über eine Baustelle.
*/
create or replace function public.unverrechnete_stunden()
  returns table (projekt text, kunde text, minuten integer, aeltester date, juengster date)
  language plpgsql stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (app.betriebsmitglied(app.betrieb()) and app.ist_buch_oder_spitze()) then
    raise exception 'Unverrechnete Stunden sieht nur, wer Rechnungen schreibt' using errcode = '42501';
  end if;

  return query
  with regie as (
    -- Die Nummer, wie sie an der Baustelle steht: mit ihr wählt die
    -- Rechnung die Baustelle aus.
    select regexp_replace(trim(p.project_number), '^PR-', '', 'i') as schluessel,
           max(p.project_number) as projekt,
           max(p.customer_name) as kunde
      from public.projects p
     where p.company_id = app.betrieb()
       and coalesce(p.billing_mode, 'Regie') = 'Regie'
     group by 1
  ),
  zeilen as (
    select regexp_replace(trim(t.project_number), '^PR-', '', 'i') as schluessel,
           app.arbeitsminuten(t.status, t.start_time, t.end_time,
                              t.break_duration, t.hours, t.date) as minuten,
           t.date
      from public.time_entries t
     where t.company_id = app.betrieb()
       and t.status = 'Anwesend'
       and t.is_billed = false
  )
  select r.projekt, r.kunde, sum(z.minuten)::integer, min(z.date), max(z.date)
    from zeilen z
    join regie r on r.schluessel = z.schluessel
   where z.minuten > 0
   group by r.projekt, r.kunde
   order by min(z.date), r.projekt;
end;
$$;

revoke all on function public.unverrechnete_stunden() from public, anon;
grant execute on function public.unverrechnete_stunden() to authenticated;

-- Verrechnete Buchungen sammeln sich über die Jahre; gesucht wird nur der
-- offene Rest.
create index if not exists time_entries_unverrechnet
  on public.time_entries (company_id, project_number)
  where is_billed = false and status = 'Anwesend';
