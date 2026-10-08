-- Dieselben Leserechte, die sitzungsabhängigen Prüfungen aber einmal je Abfrage.
-- Andernfalls überschreitet ein mehrjähriges Archiv das Anweisungszeitlimit.
-- app.betriebsmitglied(b) = app.angemeldet() AND app.betrieb() IS NOT NULL AND app.betrieb() = b.
-- app.darf(b) = app.betriebsmitglied(b) OR app.support_liest(b).
alter policy invoices_lesen on public.invoices using (
  (company_id = (select app.betrieb()) and (select app.angemeldet())
    and (select app.ist_buch_oder_spitze()))
  or app.support_liest(company_id)
  or (company_id = (select app.betrieb()) and (select app.angemeldet())
    and (select app.darf_rechnungen_lesen())
    and exists (select 1 from public.projects p where p.id = invoices.project_id
      and p.company_id = invoices.company_id and (select auth.uid()) = any(p.project_managers)))
);
alter policy invoice_lines_lesen on public.invoice_lines using (
  (company_id = (select app.betrieb()) and (select app.angemeldet())
    and (select app.ist_buch_oder_spitze()))
  or app.support_liest(company_id)
  or ((select app.darf_rechnungen_lesen())
    and exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id))
);
alter policy invoice_coverage_lesen on public.invoice_coverage using (
  (company_id = (select app.betrieb()) and (select app.angemeldet())
    and (select app.ist_buch_oder_spitze()))
  or app.support_liest(company_id)
);
