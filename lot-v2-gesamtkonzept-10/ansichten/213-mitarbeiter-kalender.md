# 213 · Monatskalender

Auswertung · Vorschaurolle: Buchhaltung · `mitarbeiter-kalender`

**Entscheidung: ergänzt.** Bedingten Arbeitszustand bzw. getrennte Aufgabe explizit zeigen, ohne vorhandene Ansicht umzudeuten.

Aufgabe: Monatskalender.

[Screenshot Desktop](../bilder/213-mitarbeiter-kalender-desktop.jpg) · [Tablet](../bilder/213-mitarbeiter-kalender-tablet.jpg) · [Handy](../bilder/213-mitarbeiter-kalender-mobil.jpg) · [Galerie](../galerie.html#mitarbeiter-kalender) · [Prototyp](../index.html#mitarbeiter-kalender)

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
