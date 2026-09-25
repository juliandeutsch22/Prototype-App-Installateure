-- STORNO AUFHEBEN: NUR AM SELBEN TAG, UND NUR, WENN NICHTS WEITERGEWANDERT IST.
--
-- Aus dem Launch-Check (25.09.2026, K9): eine stornierte Rechnung trug im
-- „⋯" dauerhaft „Storno aufheben" — ein stornierter Beleg konnte Wochen
-- später wieder aufleben.
--
-- WARUM ES DAS AUFHEBEN ÜBERHAUPT GIBT: für den Fehlgriff. Wer die falsche
-- Zeile storniert, soll das sofort zurücknehmen können, statt eine neue
-- Rechnung mit neuer Nummer zu schreiben.
--
-- WARUM NUR AM SELBEN TAG: der Buchungsstapel für die Kanzlei bucht den
-- Storno am Stornotag als Gegenbuchung (`bmdExport.ts`). Ist er einmal
-- ausgeleitet, stünde nach dem Aufheben in der Buchhaltung ein Storno, den
-- es in der App nicht mehr gibt — und niemand erfährt es. Ab dem Folgetag
-- ist der Weg deshalb eine neue Rechnung.
--
-- UND EIN FEHLER, DER DABEI AUFGEFALLEN IST: das Aufheben setzte die
-- Stunden und das Material blind wieder auf diese Rechnung — auch wenn sie
-- inzwischen auf einer neuen standen. Dann hinge dieselbe Stunde an zwei
-- Rechnungen, und die neue verlöre ihren Nachweis.

create or replace function public.rechnung_storno_aufheben(p_id uuid)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  nummer text;
  storniert_am timestamptz;
  woanders text;
begin
  select i.invoice_number, i.cancelled_at into nummer, storniert_am
    from public.invoices i
   where i.id = p_id and i.company_id = app.betrieb() and i.payment_status = 'Storniert';
  if nummer is null then
    raise exception 'Diese Rechnung gibt es nicht, oder sie ist nicht storniert' using errcode = 'P0002';
  end if;

  if storniert_am is null
     or (storniert_am at time zone 'Europe/Vienna')::date <> (now() at time zone 'Europe/Vienna')::date then
    raise exception 'Ein Storno lässt sich nur am selben Tag aufheben — danach steht er in der Buchhaltung. Für die Leistung bitte eine neue Rechnung stellen.'
      using errcode = '42501';
  end if;

  select coalesce(t.invoice_number, m.invoice_number) into woanders
    from public.invoice_coverage c
    left join public.time_entries t on c.art = 'time_entry' and t.id = c.ziel_id
    left join public.material_orders m on c.art = 'material_order' and m.id = c.ziel_id
   where c.invoice_id = p_id
     and coalesce(t.is_billed, m.is_billed, false)
     and coalesce(t.invoice_number, m.invoice_number) is distinct from nummer
   limit 1;
  if woanders is not null then
    raise exception 'Die Leistung dieser Rechnung steht inzwischen auf %. Der Storno bleibt — sonst hinge sie an zwei Rechnungen.', woanders
      using errcode = '42501';
  end if;

  perform set_config('app.zahlstand', 'ja', true);
  update public.invoices
     set payment_status = 'Offen',
         cancellation_note = null,
         cancelled_at = null
   where id = p_id and company_id = app.betrieb();
  perform set_config('app.zahlstand', '', true);

  update public.time_entries t
     set is_billed = true, invoice_number = nummer
    from public.invoice_coverage c
   where c.invoice_id = p_id and c.art = 'time_entry' and t.id = c.ziel_id;

  update public.material_orders m
     set is_billed = true, invoice_number = nummer
    from public.invoice_coverage c
   where c.invoice_id = p_id and c.art = 'material_order' and m.id = c.ziel_id;

  -- Und jetzt das, was die Zahlungen sagen.
  perform app.zahlstand_setzen(p_id);
end;
$$;

revoke all on function public.rechnung_storno_aufheben(uuid) from public;
grant execute on function public.rechnung_storno_aufheben(uuid) to authenticated;
