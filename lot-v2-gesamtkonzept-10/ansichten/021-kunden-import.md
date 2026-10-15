# 021 · Kunden aus Datei übernehmen

Kunden · Vorschaurolle: Geschäftsführung · `kunden-import`

**Entscheidung: beibehalten.** Datei, Vorschau und Übernahme bilden einen nachvollziehbaren Ablauf; fehlerhafte und vorhandene Zeilen nicht als gültige neue Kunden tarnen.

Aufgabe: Kunden aus Datei übernehmen.

[Screenshot Desktop](../bilder/021-kunden-import-desktop.jpg) · [Tablet](../bilder/021-kunden-import-tablet.jpg) · [Handy](../bilder/021-kunden-import-mobil.jpg) · [Galerie](../galerie.html#kunden-import) · [Prototyp](../index.html#kunden-import)

## Bei der Umsetzung erhalten

- Vorschau vor Übernahme
- Vorhandene/fehlerhafte Zeilen getrennt
- Teilresultate sichtbar
- Verwaltung/Buchhaltung nur mit kundenPflegen; sonst lesend ohne Pflegeaktionen

## Formularfelder im Entwurf

- CSV-Datei

## Aktionen im Entwurf

- Gültige Zeilen übernehmen
- Vorlage herunterladen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/customers/KundenImport.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/customers/KundenImport.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
