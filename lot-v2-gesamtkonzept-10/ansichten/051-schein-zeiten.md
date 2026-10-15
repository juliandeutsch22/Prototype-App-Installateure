# 051 · Handwerksschein – Entwurf

Scheine · Vorschaurolle: Mitarbeiter · `schein-zeiten`

**Entscheidung: präzisiert.** Mehrere Zeiten direkt ergänzen, Schrittstand erhalten; Desktop als vollständiger Arbeitsbogen, Mobil als klarer Schrittfluss.

Aufgabe: Handwerksschein – Entwurf.

[Screenshot Desktop](../bilder/051-schein-zeiten-desktop.jpg) · [Tablet](../bilder/051-schein-zeiten-tablet.jpg) · [Handy](../bilder/051-schein-zeiten-mobil.jpg) · [Galerie](../galerie.html#schein-zeiten) · [Prototyp](../index.html#schein-zeiten)

## Bei der Umsetzung erhalten

- Entwurf bleibt beim Schrittwechsel erhalten
- Mehrere Leistungszeiten
- Kein doppeltes Buchen ins Zeitkonto

## Formularfelder im Entwurf

- Baustelle
- Leistungsdatum
- Mitarbeiter
- Von
- Bis
- Pause (Minuten)
- Tätigkeit
- Als Helfer gearbeitet

## Aktionen im Entwurf

- Weiter zu Material
- Zeile hinzufügen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/worksheets/WorkSheetView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/worksheets/WorkSheetView.tsx)
- [src/features/worksheets/LeistungszeitErfassen.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/worksheets/LeistungszeitErfassen.tsx)
- [src/features/worksheets/Schrittfolge.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/worksheets/Schrittfolge.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
