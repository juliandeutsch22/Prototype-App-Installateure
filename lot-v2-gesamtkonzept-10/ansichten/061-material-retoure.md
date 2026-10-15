# 061 · Material zurückgeben

Material · Vorschaurolle: Mitarbeiter · `material-retoure`

**Entscheidung: beibehalten.** Menge, Zustand und Baustellenbezug bilden eine übersichtliche Eingabe; Rückgabe ist noch keine freigegebene Lagerware.

Aufgabe: Material zurückgeben.

[Screenshot Desktop](../bilder/061-material-retoure-desktop.jpg) · [Tablet](../bilder/061-material-retoure-tablet.jpg) · [Handy](../bilder/061-material-retoure-mobil.jpg) · [Galerie](../galerie.html#material-retoure) · [Prototyp](../index.html#material-retoure)

## Bei der Umsetzung erhalten

- Menge/Zustand
- Keine automatische Lagerfreigabe vor Prüfung

## Formularfelder im Entwurf

- Material
- Menge
- Zustand
- Von welcher Baustelle?
- Grund / Notiz

## Aktionen im Entwurf

- Retoure erfassen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/orders/OrderView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/orders/OrderView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
