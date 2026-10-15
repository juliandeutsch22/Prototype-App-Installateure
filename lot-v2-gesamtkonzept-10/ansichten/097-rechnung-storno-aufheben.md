# 097 · Storno aufheben

Rechnungen · Vorschaurolle: Geschäftsführung · `rechnung-storno-aufheben`

**Entscheidung: präzisiert.** Den tatsächlich zulässigen Beispielzustand ausdrücklich zeigen: heute storniert und noch keine Stornorechnung vergeben.

Aufgabe: Storno aufheben.

[Screenshot Desktop](../bilder/097-rechnung-storno-aufheben-desktop.jpg) · [Tablet](../bilder/097-rechnung-storno-aufheben-tablet.jpg) · [Handy](../bilder/097-rechnung-storno-aufheben-mobil.jpg) · [Galerie](../galerie.html#rechnung-storno-aufheben) · [Prototyp](../index.html#rechnung-storno-aufheben)

## Bei der Umsetzung erhalten

- Je Zustand getrennte zulässige Aktion
- BMD-/Belegarchiv bleibt nachvollziehbar
- Bestätigung bleibt verbindlich

## Formularfelder im Entwurf

- Grund

## Aktionen im Entwurf

- Storno aufheben

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/invoices/InvoicesView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/invoices/InvoicesView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
