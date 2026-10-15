# 031 · Baustellenstammdaten

Baustellen · Vorschaurolle: Geschäftsführung · `baustelle-daten`

**Entscheidung: neu geordnet.** Stammdaten nach derselben Ordnung wie Neuanlage gliedern; Team, Projektleitung und Warnung bei Nummernänderung erhalten.

Aufgabe: Baustellenstammdaten.

[Screenshot Desktop](../bilder/031-baustelle-daten-desktop.jpg) · [Tablet](../bilder/031-baustelle-daten-tablet.jpg) · [Handy](../bilder/031-baustelle-daten-mobil.jpg) · [Galerie](../galerie.html#baustelle-daten) · [Prototyp](../index.html#baustelle-daten)

## Bei der Umsetzung erhalten

- Warnung bei Nummernänderung
- Ungespeicherte Angaben
- Bisher zugeordnete deaktivierte Personen bleiben sichtbar

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
- Team
- Projektleitung

## Aktionen im Entwurf

- Änderungen speichern
- Baustelle löschen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/projects/BaustellenakteView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/projects/BaustellenakteView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
