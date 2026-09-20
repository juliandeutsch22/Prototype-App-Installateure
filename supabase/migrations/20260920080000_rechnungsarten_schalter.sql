-- ---------------------------------------------------------------------------
-- Anzahlungen und Teilrechnungen: nur, wer sie braucht, sieht sie
-- ---------------------------------------------------------------------------
--
-- WARUM EIN SCHALTER UND NICHT EINFACH DA. Die Auswahl „Art der Rechnung"
-- steht in der Maske, in der jede Rechnung dieses Betriebs entsteht — auch
-- die vierhundert im Jahr, die schlicht Rechnungen sind. Ein Betrieb, der nie
-- eine Anzahlung stellt, bekommt damit ein Feld, das er jedes Mal überliest
-- und nie braucht. Das ist kein kleiner Preis: es ist die Maske, die am
-- häufigsten geöffnet wird.
--
-- AUS IST DIE VORGABE, und zwar auch für bestehende Betriebe. Wer die Stufe
-- nicht angefordert hat, soll von ihr nichts merken.
--
-- WAS DER SCHALTER NICHT TUT: er ändert nichts an bereits ausgestellten
-- Belegen. Eine Schlussrechnung behält ihre Art, ihre Abzüge und ihre
-- Gesamtleistung, und sie druckt unverändert — auch wenn der Betrieb die
-- Arten später wieder abdreht. Ein Beleg ist ein Dokument; eine Einstellung
-- von heute kann ihn nicht rückwirkend zu etwas anderem machen. Deshalb
-- braucht das Abdrehen auch keinen Riegel: es verbirgt die Auswahl für NEUE
-- Rechnungen und sonst nichts.
alter table companies
  add column if not exists rechnungsarten boolean not null default false;

comment on column companies.rechnungsarten is
  'Zeigt die Auswahl Anzahlung/Teil/Schluss beim Anlegen einer Rechnung. '
  'Bestehende Belege bleiben davon unberührt.';
