# 017 · Kunden

Kunden · Vorschaurolle: Geschäftsführung · `kunden`

**Entscheidung: beibehalten.** Kundenname und Kontakt tragen die Liste; Import und Zuordnung bleiben seltenere Seitenaktionen, Pflegeberechtigungen getrennt.

Aufgabe: Kunden.

[Screenshot Desktop](../bilder/017-kunden-desktop.jpg) · [Tablet](../bilder/017-kunden-tablet.jpg) · [Handy](../bilder/017-kunden-mobil.jpg) · [Galerie](../galerie.html#kunden) · [Prototyp](../index.html#kunden)

## Bei der Umsetzung erhalten

- Kundenpflegerecht je Benutzer
- Dublettenprüfung
- Import
- Übernahme bestehender Baustellen
- Verwaltung/Buchhaltung nur mit kundenPflegen; sonst lesend ohne Pflegeaktionen

## Aktionen im Entwurf

- Neuer Kunde
- Kunden importieren
- Baustellen zuordnen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/customers/CustomersView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/customers/CustomersView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
