# 137 · Firmendaten

Einstellungen · Vorschaurolle: Geschäftsführung · `firma`

**Entscheidung: neu geordnet.** Anschrift, rechtliche Angaben/Bank und Darstellung gliedern; Briefkopfdaten nicht zwischen Farbfeldern verstecken.

Aufgabe: Firmendaten.

[Screenshot Desktop](../bilder/137-firma-desktop.jpg) · [Tablet](../bilder/137-firma-tablet.jpg) · [Handy](../bilder/137-firma-mobil.jpg) · [Galerie](../galerie.html#firma) · [Prototyp](../index.html#firma)

## Bei der Umsetzung erhalten

- Briefkopf-/Logo-Vorschau
- UID/IBAN-Prüfung
- Kontrastprüfung
- Bestehende PDF-Belegfarben unabhängig vom UI

## Formularfelder im Entwurf

- Firmenname
- Straße
- PLZ
- Ort
- Kontakt (eine Zeile)
- Logo
- UID-Nummer
- Firmenbuchnummer
- Firmenbuchgericht
- IBAN
- BIC
- Bank
- Hauptfarbe (#rrggbb)
- Schrift auf der Hauptfarbe
- Akzentfarbe (#rrggbb)
- Schrift auf der Akzentfarbe

## Aktionen im Entwurf

- Firmendaten speichern

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/settings/FirmendatenView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/settings/FirmendatenView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
