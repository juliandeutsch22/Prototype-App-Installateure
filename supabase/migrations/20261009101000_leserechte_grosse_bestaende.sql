-- Identische Leserechte, aber sitzungsabhängige Bedingungen als InitPlans.
-- app.betriebsmitglied(b) = app.angemeldet() AND app.betrieb() IS NOT NULL AND app.betrieb() = b.
-- app.darf(b) = app.betriebsmitglied(b) OR app.support_liest(b).
-- app.support_liest prüft selbst app.ist_plattform; die zusätzliche Abfrage
-- verhindert deren korrelierte Auswertung für gewöhnliche Betriebskonten.
alter policy time_entries_lesen on public.time_entries using (
  company_id = (select app.betrieb()) and (select app.angemeldet())
  and (user_id = (select auth.uid()) or (select app.ist_buch_oder_spitze()))
);
alter policy work_sheets_lesen on public.work_sheets using (
  (company_id = (select app.betrieb()) and (select app.angemeldet()))
  or ((select app.ist_plattform()) and app.support_liest(company_id))
);
alter policy material_orders_lesen on public.material_orders using (
  ((company_id = (select app.betrieb()) and (select app.angemeldet()))
    or ((select app.ist_plattform()) and app.support_liest(company_id)))
  and (user_id = (select auth.uid())
    or (select app.hat_rolle(array['Verwaltung', 'Buchhaltung']))
    or (select app.ist_fuehrung()))
);
