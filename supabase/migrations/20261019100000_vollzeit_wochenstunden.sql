-- ---------------------------------------------------------------------------
-- Mehrarbeit in Teilzeit (§ 19d AZG, 19.10.2026)
--
-- Beim Modell „Tagesgrenze“ standen alle Stunden über dem Tagessoll als
-- Überstunden da, auch bei Teilzeit. Wer weniger als die Vollzeit vereinbart
-- hat, leistet darüber aber zuerst Mehrarbeit (25 % oder Ausgleich im
-- Quartal, Abs 3a/3b), erst ab der Vollzeit Überstunden. Dafür braucht die
-- App die Vollzeit des Betriebs. Gerechnet wird in der App
-- (`accounting/ueberstunden.ts`); hier steht nur der Wert.
--
-- AB WERK 38,5: die Normalarbeitszeit des KV Metallgewerbe (Abschnitt VI
-- Pkt 1). Mehr als 40 kennt das AZG nicht (§ 3 Abs 1).
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists vollzeit_wochenstunden numeric(4, 2) not null default 38.5;

alter table public.companies drop constraint if exists companies_vollzeit_wochenstunden;
alter table public.companies add constraint companies_vollzeit_wochenstunden
  check (vollzeit_wochenstunden > 0 and vollzeit_wochenstunden <= 40);

comment on column public.companies.vollzeit_wochenstunden is
  'Bei tagesgrenze: Wochenstunden einer Vollzeit (ab Werk 38,5, KV Metallgewerbe). Darunter Teilzeit: Stunden über dem Soll bis dahin sind Mehrarbeit nach § 19d AZG.';
