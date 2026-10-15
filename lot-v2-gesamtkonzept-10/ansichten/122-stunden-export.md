# 122 · Stundenbericht exportieren

Auswertung · Vorschaurolle: Buchhaltung · `stunden-export`

**Entscheidung: beibehalten.** Person, Zeitraum und vorhandenes Ausgabeformat genügen; keine neue Berechnung oder unbeabsichtigte Einschränkung des Berichts.

Aufgabe: Stundenbericht exportieren.

[Screenshot Desktop](../bilder/122-stunden-export-desktop.jpg) · [Tablet](../bilder/122-stunden-export-tablet.jpg) · [Handy](../bilder/122-stunden-export-mobil.jpg) · [Galerie](../galerie.html#stunden-export) · [Prototyp](../index.html#stunden-export)

## Bei der Umsetzung erhalten

- Bestehende PDF-/CSV-Berechnungen
- Zeitraum und Person
- Personen ohne Zeitkonto korrekt behandeln

## Formularfelder im Entwurf

- Mitarbeiter
- Von
- Bis
- Ausgabe

## Aktionen im Entwurf

- Bericht herunterladen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/accounting/ExportDialog.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/accounting/ExportDialog.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
