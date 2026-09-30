-- TESTBERICHT 30.09.2026, G31 — DIE ANFORDERUNG AUS DER RÜSTLISTE STEHT AUF
-- DEM, DER ABHOLT.
--
-- Eine Anforderung aus der Einsatzplanung stand auf dem Namen des Planers;
-- im Lager war dann unklar, wer abholt. Die Richtlinie liess nur den eigenen
-- Namen zu. Jetzt darf die Führung (die auch einteilt, siehe
-- `assignments_schreiben`) eine Anforderung auf eine Person DESSELBEN
-- Betriebs anlegen. Alle anderen weiterhin nur auf den eigenen Namen, und
-- verrechnet ist beim Anlegen weiterhin nichts.

drop policy if exists material_orders_anlegen on public.material_orders;
create policy material_orders_anlegen on public.material_orders
  for insert with check (
    app.darf(company_id)
    and (
      user_id = auth.uid()
      or (
        app.ist_fuehrung()
        and exists (select 1 from public.users u where u.id = user_id and u.company_id = material_orders.company_id)
      )
    )
    and is_billed = false and coalesce(invoice_number, '') = ''
  );
