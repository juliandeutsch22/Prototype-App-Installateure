# 187 · Wartung bearbeiten

Wartungen · Vorschaurolle: Geschäftsführung · `wartung-neu`

**Entscheidung: neu geordnet.** Vereinbarung, Anlagendaten und Termine/Hinweise gruppieren; Fälligkeit folgt der bestehenden Intervallberechnung.

Aufgabe: Wartung bearbeiten.

[Screenshot Desktop](../bilder/187-wartung-neu-desktop.jpg) · [Tablet](../bilder/187-wartung-neu-tablet.jpg) · [Handy](../bilder/187-wartung-neu-mobil.jpg) · [Galerie](../galerie.html#wartung-neu) · [Prototyp](../index.html#wartung-neu)

## Bei der Umsetzung erhalten

- Fälligkeit aus Intervall wie bisher
- Verwaltung liest nur

## Formularfelder im Entwurf

- Kunde
- Anlage
- Standort (leer = Kundenadresse)
- Intervall
- Hersteller
- Typ
- Seriennummer
- Baujahr
- Preis je Wartung netto (€)
- Zuletzt gewartet
- Nächster Termin
- Vereinbarung läuft
- Hinweis

## Aktionen im Entwurf

- Wartung speichern

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/maintenance/WartungenView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/maintenance/WartungenView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
