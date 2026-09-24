-- Wer ein Zeitkonto führt — entschieden am 24.09.2026 (Prüflauf F12, F17).
--
-- Monteure, Verwaltung und Buchhaltung führen eines, die Projektleitung jetzt
-- auch: sie bucht ihre Zeit wie alle anderen und hat ein Soll. Die
-- Administration führt keines — sie ist eine Funktion, kein Arbeitsverhältnis
-- mit Stundensoll. Die Geschäftsführung ist je Betrieb verschieden: der
-- angestellte Geschäftsführer hat ein Soll, der Inhaber meist nicht. Das legt
-- die Geschäftsführung deshalb selbst fest, je Person.
--
-- Die Spalte wirkt nur für die Geschäftsführung; für alle anderen Rollen
-- entscheidet die Rolle. Gerechnet wird der Saldo in der App
-- (`src/lib/permissions.ts`, `fuehrtZeitkonto`), die Datenbank kennt kein
-- Soll — deshalb genügt hier die Spalte. Ändern darf sie, wer `users` ändern
-- darf: Geschäftsführung und Administration.

alter table public.users
  add column if not exists fuehrt_zeitkonto boolean not null default false;

comment on column public.users.fuehrt_zeitkonto is
  'Nur für die Geschäftsführung: führt diese Person ein Zeitkonto mit Soll '
  'und Saldo? Andere Rollen: durch die Rolle festgelegt.';
