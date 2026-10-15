# 039 · Termin planen

Planung · Vorschaurolle: Geschäftsführung · `termin`

**Entscheidung: Lücke geschlossen.** Teilnehmerauswahl ergänzen und Baustellen-/Kundenbezug alternativ zeigen; beide Bezüge gleichzeitig als Pflichtfelder wären irreführend.

Aufgabe: Termin planen.

[Screenshot Desktop](../bilder/039-termin-desktop.jpg) · [Tablet](../bilder/039-termin-tablet.jpg) · [Handy](../bilder/039-termin-mobil.jpg) · [Galerie](../galerie.html#termin) · [Prototyp](../index.html#termin)

## Bei der Umsetzung erhalten

- Baustellen- oder Kundenbezug
- Teilnehmerauswahl
- Lieferzeitfenster
- Schreibrecht und Validierung aus TerminFormular.tsx

## Formularfelder im Entwurf

- Art
- Tag
- Beginn
- Ende
- Bezug
- Baustelle
- Kunde
- Max Mustermann
- Anton Berger
- Franz Hinterleitner
- Notiz

## Aktionen im Entwurf

- Termin speichern
- Termin löschen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/termine/TerminFenster.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/termine/TerminFenster.tsx)
- [src/features/termine/TerminFormular.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/termine/TerminFormular.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
