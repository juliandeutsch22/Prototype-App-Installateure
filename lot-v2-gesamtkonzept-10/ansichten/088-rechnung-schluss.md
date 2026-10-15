# 088 · Schlussrechnung vorbereiten

Rechnungen · Vorschaurolle: Geschäftsführung · `rechnung-schluss`

**Entscheidung: beibehalten.** Vorbelege, Anzahlungsabzug und Schlussbetrag vor Erstellung nachvollziehen; bestehende Besteuerung nicht neu interpretieren.

Aufgabe: Schlussrechnung vorbereiten.

[Screenshot Desktop](../bilder/088-rechnung-schluss-desktop.jpg) · [Tablet](../bilder/088-rechnung-schluss-tablet.jpg) · [Handy](../bilder/088-rechnung-schluss-mobil.jpg) · [Galerie](../galerie.html#rechnung-schluss) · [Prototyp](../index.html#rechnung-schluss)

## Bei der Umsetzung erhalten

- Betriebsfreigabe für Teil-/Schlussrechnungen
- Keine doppelte Verrechnung
- Vorbelege und Anzahlungsabzüge
- Kein neuer Berechnungsweg

## Formularfelder im Entwurf

- Baustelle
- Anteil vom angenommenen Angebot (%)
- Bestellnummer des Kunden

## Aktionen im Entwurf

- Vorschau erstellen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/invoices/InvoicesView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/invoices/InvoicesView.tsx)
- [src/features/invoices/anzahlung.ts](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/invoices/anzahlung.ts)
- [src/features/invoices/vorrechnungen.ts](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/invoices/vorrechnungen.ts)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
