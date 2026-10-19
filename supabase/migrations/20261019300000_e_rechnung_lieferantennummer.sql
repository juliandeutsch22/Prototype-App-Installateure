/*
  DIE LIEFERANTENNUMMER BEIM KUNDEN (E-Rechnung, 19.10.2026).

  Wer an den Bund oder an andere Auftraggeber über e-Rechnung.gv.at
  verrechnet, gibt in jeder E-Rechnung die Nummer an, unter der der
  Empfänger den Betrieb führt (beim Bund achtstellig). Sie gilt für alle
  Rechnungen an denselben Empfänger und gehört deshalb zum Kunden, nicht zur
  einzelnen Rechnung. Lesen und Ändern regeln die bestehenden Regeln der
  Kundentabelle; kein Personenbezug.
*/
alter table public.customers
  add column if not exists lieferantennummer text
    check (lieferantennummer is null or char_length(lieferantennummer) <= 64);
