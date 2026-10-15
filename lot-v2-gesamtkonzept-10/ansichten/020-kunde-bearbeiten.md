# 020 · Kundenstammdaten bearbeiten

Kunden · Vorschaurolle: Geschäftsführung · `kunde-bearbeiten`

**Entscheidung: neu geordnet.** Langes Formular in dieselben Gruppen wie Neuanlage teilen; UID-Abfrage und Löschen als separate bewusste Wege behalten.

Aufgabe: Kundenstammdaten bearbeiten.

[Screenshot Desktop](../bilder/020-kunde-bearbeiten-desktop.jpg) · [Tablet](../bilder/020-kunde-bearbeiten-tablet.jpg) · [Handy](../bilder/020-kunde-bearbeiten-mobil.jpg) · [Galerie](../galerie.html#kunde-bearbeiten) · [Prototyp](../index.html#kunde-bearbeiten)

## Bei der Umsetzung erhalten

- Ungespeichert-Warnung
- UID-Prüfung separat auslösbar
- Aktive Bezüge verhindern unzulässiges Löschen
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
- Aktiv – erscheint in Auswahlfeldern

## Aktionen im Entwurf

- Änderungen speichern
- UID prüfen
- Kunde löschen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/customers/KundenakteView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/customers/KundenakteView.tsx)
- [src/features/customers/UidVies.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/customers/UidVies.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
