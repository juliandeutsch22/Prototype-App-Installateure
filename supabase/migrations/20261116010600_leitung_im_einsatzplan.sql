/*
  DURCHSICHT 15.11.2026, V12 — GESCHÄFTSFÜHRUNG UND ADMINISTRATOR
  EINPLANBAR, ALS EINSTELLUNG JE BETRIEB (Entscheidung E2).

  Im kleinen Betrieb fährt der Chef mit. Bis hierher stand er nie im Plan:
  kein „Heute“ auf der Startseite, kein Kalendereintrag, keine Meldung bei
  einer Planänderung — obwohl er Scheine schreibt. Eingeteilt wurde nur der
  Außendienst und, auf Wunsch, die Projektleitung
  (`projektleitung_im_einsatzplan`, Testbericht 30.09.2026, M38).

  Dieselbe Form wie dort: ab Werk aus — ein Betrieb, der nichts ändert,
  plant wie bisher. Eingeschaltet stehen Geschäftsführung und Administrator
  in der Auswahl des Einsatzplans und bekommen „Mein Einsatzplan“.

  WAS DIE DATENBANK DAZU NICHT BRAUCHT: Einsätze, Rüstliste, Meldung und
  Kalender-Abo prüfen nur, ob jemand aktives Mitglied des Betriebs ist,
  nicht seine Rolle. Ändern darf die Einstellung, wer die Firmendaten ändert
  (Zeilenschutz der Betriebe, unverändert).
*/

alter table public.companies
  add column if not exists leitung_im_einsatzplan boolean not null default false;

comment on column public.companies.leitung_im_einsatzplan is
  'Geschäftsführung und Administrator sind im Einsatzplan einteilbar und sehen „Mein Einsatzplan“ (V12, E2). Ab Werk aus.';
