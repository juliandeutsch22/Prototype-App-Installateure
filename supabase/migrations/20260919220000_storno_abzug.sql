-- ---------------------------------------------------------------------------
-- Was abgezogen ist, lässt sich nicht stornieren
-- ---------------------------------------------------------------------------
--
-- DER FALL: eine Anzahlung über 1.200 € ist auf der Schlussrechnung
-- abgezogen; die Schlussrechnung fordert deshalb nur den Rest. Wird die
-- Anzahlung jetzt storniert, steht sie mit null da — und die Schlussrechnung
-- fordert ihn weiterhin nicht. Die 1.200 € verschwinden lautlos: aus der
-- Forderung, aus dem Umsatz und aus der Nachkalkulation der Baustelle.
--
-- Der Abzug auf der Schlussrechnung ist eine KOPIE und bleibt stehen, auch
-- wenn die abgezogene Rechnung später storniert wird — das ist richtig so,
-- ein Beleg ist ein Dokument. Genau deshalb muss die Reihenfolge stimmen:
-- erst die Schlussrechnung stornieren, dann die Anzahlung.

create or replace function public.rechnung_stornieren(
  p_id uuid,
  p_grund text
) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  getroffen integer;
begin
  if exists (
    select 1
      from public.invoices i
     where i.company_id = app.betrieb()
       and i.id is distinct from p_id
       and i.payment_status is distinct from 'Storniert'
       and i.vorrechnungen @> jsonb_build_array(jsonb_build_object('invoiceId', p_id::text))
  ) then
    raise exception 'Diese Rechnung ist auf einer anderen abgezogen — erst diese stornieren'
      using errcode = '42501';
  end if;

  perform set_config('app.zahlstand', 'ja', true);
  update public.invoices
     set payment_status = 'Storniert',
         cancellation_note = p_grund,
         cancelled_at = now()
   where id = p_id and company_id = app.betrieb();
  /*
    `get diagnostics` LIEST DIE LETZTE ANWEISUNG, und das ist hier der Punkt:
    stünde das Zurücksetzen des Merkers davor, zählte es dessen Zeile statt
    der des UPDATE. Eine Rechnung, die es nicht gibt, ginge dann still durch —
    genau das hat `modulGeld.test.ts` gemeldet, als es einmal so dastand.
  */
  get diagnostics getroffen = row_count;
  perform set_config('app.zahlstand', '', true);

  if getroffen = 0 then
    raise exception 'Diese Rechnung gibt es nicht' using errcode = 'P0002';
  end if;

  update public.time_entries t
     set is_billed = false, invoice_number = null
    from public.invoice_coverage c
   where c.invoice_id = p_id and c.art = 'time_entry' and t.id = c.ziel_id;

  update public.material_orders m
     set is_billed = false, invoice_number = null
    from public.invoice_coverage c
   where c.invoice_id = p_id and c.art = 'material_order' and m.id = c.ziel_id;
end;
$$;
