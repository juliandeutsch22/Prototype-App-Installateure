# 089 · Zahlung zuordnen

Rechnungen · Vorschaurolle: Geschäftsführung · `zahlung`

**Entscheidung: beibehalten.** Richtung, Datum, Betrag und Belegbezug genügen; Teilzahlung, Guthaben, Rückzahlung und Korrekturwege bleiben erhalten.

Aufgabe: Zahlung zuordnen.

[Screenshot Desktop](../bilder/089-zahlung-desktop.jpg) · [Tablet](../bilder/089-zahlung-tablet.jpg) · [Handy](../bilder/089-zahlung-mobil.jpg) · [Galerie](../galerie.html#zahlung) · [Prototyp](../index.html#zahlung)

## Bei der Umsetzung erhalten

- Teilzahlung/Rückzahlung
- Überzahlung als Guthaben
- Skontobedingungen
- Protokoll und Korrekturwege

## Formularfelder im Entwurf

- Richtung
- Datum
- Betrag (€)
- Hinweis

## Aktionen im Entwurf

- Zahlung erfassen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/invoices/InvoicesView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/invoices/InvoicesView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
