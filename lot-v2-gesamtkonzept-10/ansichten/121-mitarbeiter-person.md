# 121 · Max Mustermann

Auswertung · Vorschaurolle: Buchhaltung · `mitarbeiter-person`

**Entscheidung: neu geordnet.** Tagesliste mit allen Buchungen zuerst, Gesamtsaldo und Urlaub klar getrennt; Kalender als alternative Detailansicht erhalten.

Aufgabe: Max Mustermann.

[Screenshot Desktop](../bilder/121-mitarbeiter-person-desktop.jpg) · [Tablet](../bilder/121-mitarbeiter-person-tablet.jpg) · [Handy](../bilder/121-mitarbeiter-person-mobil.jpg) · [Galerie](../galerie.html#mitarbeiter-person) · [Prototyp](../index.html#mitarbeiter-person)

## Bei der Umsetzung erhalten

- Gesamtsaldo vs Monatssaldo
- Arbeitszeitgrenzen
- Unterricht/Jugendliche
- Fremdkorrektur mit Vermerk

## Aktionen im Entwurf

- Zeit für Person erfassen
- Monat als CSV
- Bericht für Zeitraum
- Arbeitszeitgrenzen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/accounting/PersonFenster.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/accounting/PersonFenster.tsx)
- [src/features/accounting/Gesamtsaldo.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/accounting/Gesamtsaldo.tsx)
- [src/features/accounting/ArbeitszeitGrenzenKarte.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/accounting/ArbeitszeitGrenzenKarte.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
