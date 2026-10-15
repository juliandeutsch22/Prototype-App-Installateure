# 029 · Neue Baustelle

Baustellen · Vorschaurolle: Geschäftsführung · `baustelle-neu`

**Entscheidung: neu geordnet.** Baustelle, Kontakt/Auftrag und Abrechnung/Planung gruppieren; keine Felder streichen und keine freie Nummernvergabelogik erfinden.

Aufgabe: Neue Baustelle.

[Screenshot Desktop](../bilder/029-baustelle-neu-desktop.jpg) · [Tablet](../bilder/029-baustelle-neu-tablet.jpg) · [Handy](../bilder/029-baustelle-neu-mobil.jpg) · [Galerie](../galerie.html#baustelle-neu) · [Prototyp](../index.html#baustelle-neu)

## Bei der Umsetzung erhalten

- Kunde und eindeutige Nummer
- Abrechnungsart und Budget
- Kontakt und geplante Laufzeit

## Formularfelder im Entwurf

- Projektnummer
- Kunde
- Bezeichnung
- Baustellenadresse
- Status
- Abrechnung
- Stundenbudget (kalkuliert)
- Beginn
- Ende (geplant)
- Ansprechpartner vor Ort
- Telefon vor Ort
- Beschreibung / Auftragsumfang

## Aktionen im Entwurf

- Baustelle anlegen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/projects/AdminProjectsView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/projects/AdminProjectsView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
