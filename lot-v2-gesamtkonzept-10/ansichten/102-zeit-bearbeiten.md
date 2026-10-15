# 102 · Zeitbuchung bearbeiten

Zeit · Vorschaurolle: Mitarbeiter · `zeit-bearbeiten`

**Entscheidung: beibehalten.** Zeitfelder und Korrekturvermerk vor Speichern; fremde und verrechnete Buchungen weiter nach bestehenden Rechten schützen.

Aufgabe: Zeitbuchung bearbeiten.

[Screenshot Desktop](../bilder/102-zeit-bearbeiten-desktop.jpg) · [Tablet](../bilder/102-zeit-bearbeiten-tablet.jpg) · [Handy](../bilder/102-zeit-bearbeiten-mobil.jpg) · [Galerie](../galerie.html#zeit-bearbeiten) · [Prototyp](../index.html#zeit-bearbeiten)

## Bei der Umsetzung erhalten

- Bearbeitungsvermerk nach Bestand
- Fremdbuchung nur mit Korrekturrecht
- Löschen bestätigt

## Formularfelder im Entwurf

- Datum
- Baustelle
- Von
- Bis
- Pause (Min.)
- Bearbeitungsvermerk

## Aktionen im Entwurf

- Änderungen speichern
- Eintrag löschen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/time/TimeView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/time/TimeView.tsx)
- [src/features/time/TimeForm.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/time/TimeForm.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
