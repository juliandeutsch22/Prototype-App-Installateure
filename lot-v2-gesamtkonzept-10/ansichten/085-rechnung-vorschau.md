# 085 · Rechnung prüfen

Rechnungen · Vorschaurolle: Geschäftsführung · `rechnung-vorschau`

**Entscheidung: neu geordnet.** Belegangaben, Positionen, Steuer, Abzüge und Summen nachvollziehbar ordnen; eine klare verbindliche Erstellung am Ende.

Aufgabe: Rechnung prüfen.

[Screenshot Desktop](../bilder/085-rechnung-vorschau-desktop.jpg) · [Tablet](../bilder/085-rechnung-vorschau-tablet.jpg) · [Handy](../bilder/085-rechnung-vorschau-mobil.jpg) · [Galerie](../galerie.html#rechnung-vorschau) · [Prototyp](../index.html#rechnung-vorschau)

## Bei der Umsetzung erhalten

- Nummernprüfung und Empfänger-/Firmensperren
- Material-/Leistungspositionen bearbeitbar nach Bestandsregeln
- Reverse Charge nur bei gültigen Voraussetzungen
- Skonto/Rabatt/Rücklass
- Serverwerte maßgeblich

## Formularfelder im Entwurf

- Rechnungsnummer
- Leistungsnachweis anhängen
- Umsatzsteuer
- Bauleistung – Übergang der Steuerschuld (§ 19 Abs 1a UStG)
- UID-Nummer des Kunden
- Grund der Steuerbefreiung
- Bestellnummer des Kunden
- Rabatt – Bezeichnung
- Rabattart
- Rabattwert
- Rücklass (%)
- Fällig am

## Aktionen im Entwurf

- Rechnung verbindlich erstellen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/invoices/InvoicesView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/invoices/InvoicesView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
