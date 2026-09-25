-- DER SUPPORTZUGANG „MITARBEITEN" — AUF DEN BETRIEB DER FREIGABE BEGRENZT,
-- UND OHNE ZEITBUCHUNGEN UND URLAUBE.
--
-- Aus dem Prüflauf vom 25.09.2026 (P3-01, P3-02), beide hoch:
--
--   P3-01  Die Zusage „Zeitbuchungen, Urlaube und Scheinfotos bleiben in
--          BEIDEN Stufen verschlossen" hing daran, dass ein Plattformkonto
--          keine Rolle hat. Seit `20260921100000_support_mitarbeiten.sql`
--          HAT es bei „mitarbeiten" eine: `app.ist_buch_oder_spitze()` sagt
--          dann ja, und die Leseregeln von `time_entries` und `vacations`
--          fragten `app.darf` — das den Supportzweig einschliesst. Ein
--          Supportzugang las damit Kranken- und Urlaubstage (Art. 9 DSGVO),
--          die Monatsbilanz gleich mit (sie liest `time_entries` mit den
--          Rechten des Fragenden).
--   P3-02  `app.support_arbeitet()` kennt keinen Betrieb. Eine Freigabe
--          „mitarbeiten" in Betrieb A machte die Plattform deshalb in JEDEM
--          Betrieb, in den sie gerade hineinsehen darf (Betrieb B mit
--          „ansehen" oder Notzugang), zur Spitze. Geschrieben wurde dort
--          trotzdem nichts — der Riegel `support_schreibt_nicht` liest den
--          Betrieb aus der Zeile —, mit EINER Ausnahme: `companies` trägt
--          kein `company_id`, sondern `id`, und hatte keinen Riegel. Über
--          `companies_aendern` (Spitze des Betriebs) liessen sich in B IBAN,
--          Bankname, Stundensätze ändern.
--
-- WAS SICH ÄNDERT:
--   1. Zeitbuchungen und Urlaube fragen `app.betriebsmitglied` statt
--      `app.darf` — in allen Regeln, lesend wie schreibend. Für jedes
--      Mitglied des Betriebs ist das Wort für Wort dasselbe; für ein
--      Plattformkonto ist es zu, in jeder Stufe. So steht es in
--      `docs/DEPLOYMENT.md`, und jetzt stimmt es wieder.
--   2. `companies` bekommt den Riegel, den jede andere Tabelle hat — mit dem
--      Betrieb aus `id`. Schreiben darf ein Supportzugang dort nur mit einer
--      Freigabe „mitarbeiten" für GENAU diesen Betrieb.
--
-- WAS BLEIBT, und benannt sei es: mit „mitarbeiten" in A sieht die Plattform
-- in B (wo sie nur „ansehen" darf) auch, was dort nur die Spitze liest —
-- Angebote etwa. Das ist nicht mehr, als „ansehen" laut
-- `docs/DEPLOYMENT.md` ohnehin verspricht („den Betrieb sehen wie ein
-- Administrator"); was ein Supportzugang dort NIE sieht (Zeiten, Urlaube,
-- Krankmeldungen, Scheinfotos), ist davon nicht berührt, und schreiben kann
-- er in B nichts. Die Rollenfunktionen selbst an einen Betrieb zu binden,
-- hiesse jede Richtlinie umzuschreiben.

-- ---------------------------------------------------------------------------
-- 1. Zeitbuchungen — nur für den Betrieb selbst
-- ---------------------------------------------------------------------------

drop policy if exists time_entries_lesen on time_entries;
create policy time_entries_lesen on time_entries
  for select using (app.betriebsmitglied(company_id)
    and (user_id = auth.uid() or app.ist_buch_oder_spitze()));

drop policy if exists time_entries_anlegen on time_entries;
create policy time_entries_anlegen on time_entries
  for insert with check (app.betriebsmitglied(company_id)
    and (app.ist_buch_oder_spitze()
         or (user_id = auth.uid() and is_billed = false and coalesce(invoice_number, '') = '')));

drop policy if exists time_entries_aendern on time_entries;
create policy time_entries_aendern on time_entries
  for update using (app.betriebsmitglied(company_id)
    and (user_id = auth.uid() or app.ist_buch_oder_spitze()))
  with check (app.betriebsmitglied(company_id)
    and (user_id = auth.uid() or app.ist_buch_oder_spitze()));

drop policy if exists time_entries_loeschen on time_entries;
create policy time_entries_loeschen on time_entries
  for delete using (app.betriebsmitglied(company_id)
    and (user_id = auth.uid() or app.ist_buch_oder_spitze()));

-- ---------------------------------------------------------------------------
-- 2. Urlaube — ebenso
-- ---------------------------------------------------------------------------

-- Wortlaut wie in `20260916140000_offene_posten.sql`, nur der Betrieb anders.
drop policy if exists vacations_lesen on vacations;
create policy vacations_lesen on vacations
  for select using (app.betriebsmitglied(company_id)
    and (user_id = auth.uid() or app.ist_fuehrung() or app.ist_buch_oder_spitze()
         or app.darf_urlaub_entscheiden(company_id)));

-- Wortlaut wie in `20260924120000_abwesenheiten.sql`.
drop policy if exists vacations_anlegen on vacations;
create policy vacations_anlegen on vacations
  for insert with check (app.betriebsmitglied(company_id) and user_id = auth.uid()
    and status = 'Beantragt' and betriebsurlaub_id is null);

drop policy if exists vacations_aendern on vacations;
create policy vacations_aendern on vacations
  for update using (app.betriebsmitglied(company_id)
    and (user_id = auth.uid() or app.ist_fuehrung() or app.ist_buch_oder_spitze()))
  with check (app.betriebsmitglied(company_id)
    and (user_id = auth.uid() or app.ist_fuehrung() or app.ist_buch_oder_spitze()));

drop policy if exists vacations_loeschen on vacations;
create policy vacations_loeschen on vacations
  for delete using (app.betriebsmitglied(company_id) and user_id = auth.uid()
    and status = 'Beantragt');

-- ---------------------------------------------------------------------------
-- 3. Der Betrieb selbst bekommt seinen Riegel
-- ---------------------------------------------------------------------------

/*
  Dieselbe Frage wie `app.support_schreibt_nicht`, nur mit dem Betrieb aus
  `id` statt aus `company_id` — die eine Tabelle, bei der er so heisst.
*/
create or replace function app.support_schreibt_betrieb_nicht() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if not app.ist_plattform() then
    return coalesce(new, old);
  end if;
  if app.support_schreibt(coalesce(new.id, old.id)) then
    return coalesce(new, old);
  end if;
  raise exception 'Dieser Supportzugang darf lesen und sonst nichts'
    using errcode = '42501';
end;
$$;

drop trigger if exists companies_kein_support_schreiben on public.companies;
create trigger companies_kein_support_schreiben
  before insert or update or delete on public.companies
  for each row execute function app.support_schreibt_betrieb_nicht();
