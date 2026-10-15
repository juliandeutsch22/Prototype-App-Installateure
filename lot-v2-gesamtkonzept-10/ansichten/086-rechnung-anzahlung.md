# 086 · Anzahlungsrechnung vorbereiten

Rechnungen · Vorschaurolle: Geschäftsführung · `rechnung-anzahlung`

**Entscheidung: beibehalten.** Anteil, Angebot und bisherige Abrechnung gemeinsam prüfen; bestehende Freigaben und Vorbelegregeln unverändert.

Aufgabe: Anzahlungsrechnung vorbereiten.

[Screenshot Desktop](../bilder/086-rechnung-anzahlung-desktop.jpg) · [Tablet](../bilder/086-rechnung-anzahlung-tablet.jpg) · [Handy](../bilder/086-rechnung-anzahlung-mobil.jpg) · [Galerie](../galerie.html#rechnung-anzahlung) · [Prototyp](../index.html#rechnung-anzahlung)

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
