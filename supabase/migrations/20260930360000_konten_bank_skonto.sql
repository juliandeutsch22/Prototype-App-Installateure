/*
  BANK- UND SKONTOKONTO IM KONTENRAHMEN (Testbericht 30.09.2026, H7 vorgebaut)

  Zahlungen, Rückzahlungen und Skonto gehen als eigener Stapel an die Kanzlei.
  Dafür braucht der Kontenrahmen zwei weitere Zwecke:
    bank    — das Bankkonto, auf dem Zahlungen ein- und ausgehen
    skonto  — gewährte Skonti als Erlösschmälerung; der Steuercode kommt aus
              dem Erlöskonto der jeweiligen Rechnung, damit die Umsatzsteuer
              im richtigen Satz berichtigt wird
  Bestehende Zeilen bleiben, wie sie sind.
*/

alter table public.buchungskonten drop constraint if exists buchungskonten_zweck_check;
alter table public.buchungskonten add constraint buchungskonten_zweck_check
  check (zweck in ('erloes', 'reverse_charge', 'anzahlung', 'debitoren', 'bank', 'skonto'));
