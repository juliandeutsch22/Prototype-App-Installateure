-- TESTBERICHT 30.09.2026, PAKET 2c — NACHTZEIT UND ÜBERSTUNDENMODELL JE BETRIEB.
--
--   M35  Die Nachtzeit ist je Betrieb einstellbar (Vorgabe 22–6 Uhr); der
--        Nachtzuschlag gilt nur für die Stunden darin.
--   Überstundenmodell: Zeitkonto (Vorgabe, wie bisher) oder Tagesgrenze.
--
-- Gerechnet wird in der App (`lib/lohnregeln.ts`, `accounting/zuschlaege.ts`,
-- `accounting/ueberstunden.ts`) — ausgewiesen werden nur Stunden, nie Geld.
-- Hier stehen die Einstellungen und ihre Form. Für bestehende Betriebe ändert
-- sich nichts: die Vorgaben sind das bisherige Verhalten (22–6 Uhr stand fest
-- im Hinweis der Buchungsmaske, das Zeitkonto war das einzige Modell).
--
-- ENTSCHIEDEN AM 30.09.2026, nach der Lesart des Kollektivvertrags
-- Metallgewerbe; später mit der WKO abzugleichen (PLAN-TESTBERICHT).

alter table public.companies
  add column if not exists nacht_von text not null default '22:00',
  add column if not exists nacht_bis text not null default '06:00',
  add column if not exists ueberstunden_modell text not null default 'zeitkonto',
  add column if not exists ueberstunden_grenze text not null default 'tagessoll',
  add column if not exists ueberstunden_hundert_sonn_feiertag boolean not null default false;

alter table public.companies drop constraint if exists companies_nachtzeit_form;
alter table public.companies add constraint companies_nachtzeit_form check (
  nacht_von ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  and nacht_bis ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  and nacht_von <> nacht_bis
);

alter table public.companies drop constraint if exists companies_ueberstunden_form;
alter table public.companies add constraint companies_ueberstunden_form check (
  ueberstunden_modell in ('zeitkonto', 'tagesgrenze')
  and ueberstunden_grenze in ('tagessoll', 'zehn')
);

comment on column public.companies.nacht_von is
  'Beginn der Nachtzeit, HH:MM. Nur die Stunden darin tragen den Nachtzuschlag (M35).';
comment on column public.companies.nacht_bis is
  'Ende der Nachtzeit, HH:MM; vor dem Beginn heisst: über Mitternacht.';
comment on column public.companies.ueberstunden_modell is
  'zeitkonto: Gleitzeit mit Saldo (Vorgabe). tagesgrenze: Stunden über der Grenze eines Tages als Überstunden 50 %.';
comment on column public.companies.ueberstunden_grenze is
  'Bei tagesgrenze: tagessoll (über dem Tagessoll der Person) oder zehn (über 10 Stunden, bei Gleitzeit).';
comment on column public.companies.ueberstunden_hundert_sonn_feiertag is
  'Bei tagesgrenze: Arbeit an Sonn- und Feiertagen als Überstunden 100 %.';
