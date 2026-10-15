# 018 · Neuer Kunde

Kunden · Vorschaurolle: Geschäftsführung · `kunde-neu`

**Entscheidung: neu geordnet.** Kunde und Rechnungsangaben, Kontakt und weitere Angaben gruppieren; Dublettenprüfung und Nummernregeln bleiben bestehen.

Aufgabe: Neuer Kunde.

[Screenshot Desktop](../bilder/018-kunde-neu-desktop.jpg) · [Tablet](../bilder/018-kunde-neu-tablet.jpg) · [Handy](../bilder/018-kunde-neu-mobil.jpg) · [Galerie](../galerie.html#kunde-neu) · [Prototyp](../index.html#kunde-neu)

## Bei der Umsetzung erhalten

- Kunden pflegen nur mit Berechtigung
- Gleicher Name erfordert bewusste Bestätigung
- Verwaltung/Buchhaltung nur mit kundenPflegen; sonst lesend ohne Pflegeaktionen

## Formularfelder im Entwurf

- Name oder Firma
- Rechnungsadresse
- Kundennummer
- Ansprechpartner
- Telefon
- E-Mail
- Kundenart
- UID-Nummer
- Notiz

## Aktionen im Entwurf

- Kunde anlegen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/customers/CustomersView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/customers/CustomersView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
