# 056 · Stunden ohne Zeitbuchung

Scheine · Vorschaurolle: Geschäftsführung · `schein-zeit-nachtragen`

**Entscheidung: beibehalten.** Scheinleistung und tatsächliches Zeitkonto getrennt prüfen; vorhandene Buchung vor Nachtrag nachsehen.

Aufgabe: Stunden ohne Zeitbuchung.

[Screenshot Desktop](../bilder/056-schein-zeit-nachtragen-desktop.jpg) · [Tablet](../bilder/056-schein-zeit-nachtragen-tablet.jpg) · [Handy](../bilder/056-schein-zeit-nachtragen-mobil.jpg) · [Galerie](../galerie.html#schein-zeit-nachtragen) · [Prototyp](../index.html#schein-zeit-nachtragen)

## Bei der Umsetzung erhalten

- Scheinleistung und Zeitkonto getrennt
- Vor Nachtrag auf vorhandene Buchungen prüfen

## Aktionen im Entwurf

- Fehlende Buchung prüfen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/worksheets/WorkSheetsListView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/worksheets/WorkSheetsListView.tsx)
- [src/features/worksheets/fehlendeZeitbuchung.ts](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/worksheets/fehlendeZeitbuchung.ts)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
