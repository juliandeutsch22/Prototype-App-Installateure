-- K7, Teil 2 (Durchsicht 15.11.2026): Support „Nur ansehen“ sieht, was ihm zugesagt ist.

/*
  DIE ZUSAGE (Supportzugang, „Nur ansehen“): „Er sieht den Betrieb wie ein
  Administrator und kann nichts ändern. Ausgenommen bleiben Zeitbuchungen,
  Urlaube, Krankenstände, Angebote und Scheinfotos.“

  GEMESSEN (Durchsicht, und am 16.11.2026 nachgemessen über alle Betriebe
  des Prüfstapels): mit „ansehen“ blieben Einkaufsliste, Sicherungsläufe,
  Lagerbewegungen, Materialanforderungen, Schreibbefehle (Umlagerungen),
  Kontoumstellungen und Termine leer. Der Support sah „keine Sicherung
  gelaufen“ statt eines Laufs, und eine leere Einkaufsliste — ein Supportfall
  dazu ließ sich nur mit „mitarbeiten“ ansehen.

  URSACHE: diese Regeln prüften den Betrieb des Supports zwar mit, verlangten
  danach aber eine Rolle (`ist_fuehrung`, `ist_spitze`, `hat_rolle`). Darin
  steckt nur `support_arbeitet()` — die Stufe „mitarbeiten“.

  JETZT wie bei Rechnungen, Mahnungen, Preisen und Lieferantenartikeln: der
  eigene Betrieb mit Rolle ODER der Betrieb des laufenden Einblicks. Für
  Konten des Betriebs ändert sich nichts — `app.supportbetrieb()` ist für sie
  immer leer. Geschrieben wird weiter nirgends (`support_schreibt_nicht`).
  Die Ausnahmen der Zusage bleiben, wie sie sind; ebenso das
  Änderungsjournal, das der Support bewusst nicht sieht (E50).
*/

alter policy einkauf_posten_lesen on public.einkauf_posten
  using (((company_id = (select app.lesebetrieb()))
          and ((select app.hat_rolle(array['Verwaltung'::text])) or (select app.ist_fuehrung())))
         or company_id = (select app.supportbetrieb()));

alter policy system_laeufe_lesen on public.system_laeufe
  using (((company_id = (select app.lesebetrieb())) and (select app.ist_spitze()))
         or company_id = (select app.supportbetrieb()));

alter policy lagerbewegungen_lesen on public.lagerbewegungen
  using (((company_id = (select app.lesebetrieb()))
          and ((select app.hat_rolle(array['Verwaltung'::text, 'Buchhaltung'::text])) or (select app.ist_fuehrung())))
         or company_id = (select app.supportbetrieb()));

alter policy material_orders_lesen on public.material_orders
  using (((company_id = (select app.lesebetrieb()))
          and ((user_id = (select auth.uid()))
               or (select app.hat_rolle(array['Verwaltung'::text, 'Buchhaltung'::text]))
               or (select app.ist_fuehrung())))
         or company_id = (select app.supportbetrieb()));

alter policy befehle_vorgaenge_lesen on public.befehle_vorgaenge
  using (((company_id = (select app.lesebetrieb()))
          and ((von_uid = (select auth.uid()))
               or (select app.hat_rolle(array['Verwaltung'::text, 'Buchhaltung'::text]))
               or (select app.ist_fuehrung())))
         or company_id = (select app.supportbetrieb()));

alter policy konto_umstellungen_lesen on public.konto_umstellungen
  using (((company_id = (select app.lesebetrieb())) and (select app.ist_spitze()))
         or company_id = (select app.supportbetrieb()));

alter policy termine_lesen on public.termine
  using (((company_id = (select app.lesebetrieb()))
          and ((select app.ist_fuehrung())
               or (select app.hat_rolle(array['Verwaltung'::text]))
               or ((select auth.uid()) = any (teilnehmer))
               or ((project_number is not null) and exists (
                     select 1 from public.assignments a
                      where a.company_id = termine.company_id and a.date = termine.datum
                        and a.project_number = termine.project_number
                        and a.user_id = (select auth.uid())))))
         or company_id = (select app.supportbetrieb()));
