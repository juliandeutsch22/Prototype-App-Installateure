-- Testbericht Runde 6, Abschnitt 8.4 Schritt 2 (27.10.2026): Rollengrenzen
-- im eigenen Betrieb, gegen die Schnittstelle geprüft statt über die
-- Oberfläche (`tests/supabase/mandantenTrennung.test.ts`, „Rollen im eigenen
-- Betrieb“).
--
-- BEFUND. Einkaufspreise liest laut Handbuch nur die Spitze, mit Freigabe
-- auch die Verwaltung (`material_einkaufspreise`, `app.darf_einkauf_sehen`).
-- Dieselben Zahlen standen aber noch an drei anderen Stellen offen:
--
--   - `material_prices` (Preislisten der Großhändler mit Listenpreis, Rabatt
--     und Einkaufspreis): lesbar für Verwaltung OHNE Freigabe und für die
--     Projektleitung — über die Regel zum Schreiben auch dort, wo die Regel
--     zum Lesen schon enger gewesen wäre (eine Regel FOR ALL gilt auch fürs
--     Lesen).
--   - `rabattsaetze` (Rabatt je Rabattgruppe eines Großhändlers): lesbar für
--     JEDES Konto, auch den Monteur. Listenpreis mal Rabatt ist der
--     Einkaufspreis.
--   - `datanorm_zeilen` (die eingelesene Katalogdatei, bei Preiskennzeichen
--     „netto“ der Einkaufspreis selbst) und `datanorm_laeufe`: lesbar für
--     jedes Konto.
--
-- Die Oberfläche zeigte nichts davon an — die Datenbank muss aber sperren.
--
-- NACHHER. Lesen, wer Einkaufspreise sehen darf; schreiben, wer den Katalog
-- einspielen darf (wie bei `material_einkaufspreise`). Die Läufe und Zeilen
-- der Katalogdatei braucht nur, wer einspielt.
--
-- Die Einkaufsliste braucht aus den Preislisten nur EINE Auskunft: bei
-- welchem Großhändler ein Artikel zuletzt einen Preis hatte (Vorschlag beim
-- Bestellen). Die gibt jetzt `lieferant_vorschlag` — ohne einen Preis.

alter policy material_prices_lesen on public.material_prices
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.darf_einkauf_sehen())) OR ((company_id) = ( SELECT app.supportbetrieb())));

alter policy material_prices_schreiben on public.material_prices
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_katalog_einspielen())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_katalog_einspielen())));

alter policy rabattsaetze_lesen on public.rabattsaetze
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.darf_einkauf_sehen())) OR ((company_id) = ( SELECT app.supportbetrieb())));

alter policy rabattsaetze_schreiben on public.rabattsaetze
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_katalog_einspielen())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_katalog_einspielen())));

alter policy datanorm_laeufe_lesen on public.datanorm_laeufe
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.darf_katalog_einspielen())) OR ((company_id) = ( SELECT app.supportbetrieb())));

alter policy datanorm_zeilen_lesen on public.datanorm_zeilen
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.darf_katalog_einspielen())) OR ((company_id) = ( SELECT app.supportbetrieb())));

/*
  Bei wem ein Artikel zuletzt einen Preis hatte. Fragen darf, wer die
  Einkaufsliste führt (dieselben Rollen wie `einkauf_posten`), und der
  Support, der den Betrieb gerade ansieht — wie beim Lesen der Tabelle. Der
  Preis selbst bleibt in der Tabelle. Der Tag ist der in Wien, wie in der App.
*/
create or replace function public.lieferant_vorschlag(p_material uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  betrieb text := app.lesebetrieb();
  lieferant uuid;
begin
  if betrieb is not null then
    if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
      raise exception 'Den Einkauf führen Verwaltung und Führung' using errcode = '42501';
    end if;
  else
    betrieb := app.supportbetrieb();
    if betrieb is null then
      raise exception 'Keine Anmeldung' using errcode = '42501';
    end if;
  end if;
  select p.supplier_id into lieferant
    from public.material_prices p
   where p.company_id = betrieb
     and p.material_id = p_material
     and p.gueltig_ab <= (now() at time zone 'Europe/Vienna')::date
   order by p.gueltig_ab desc
   limit 1;
  return lieferant;
end;
$$;

revoke execute on function public.lieferant_vorschlag(uuid) from public, anon;
grant execute on function public.lieferant_vorschlag(uuid) to authenticated;
