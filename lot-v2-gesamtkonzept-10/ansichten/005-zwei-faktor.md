# 005 · Zwei-Faktor-Anmeldung

Zugang · Vorschaurolle: Geschäftsführung · `zwei-faktor`

**Entscheidung: präzisiert.** Den Code als numerische Einmalcode-Eingabe kennzeichnen; Wiederherstellung als direkter alternativer Weg bleibt sichtbar.

Aufgabe: Zwei-Faktor-Anmeldung.

[Screenshot Desktop](../bilder/005-zwei-faktor-desktop.jpg) · [Tablet](../bilder/005-zwei-faktor-tablet.jpg) · [Handy](../bilder/005-zwei-faktor-mobil.jpg) · [Galerie](../galerie.html#zwei-faktor) · [Prototyp](../index.html#zwei-faktor)

## Bei der Umsetzung erhalten

- Felder, Aktionen und Zugänge aus den verlinkten Komponenten; Berechtigungen im echten System prüfen.

## Formularfelder im Entwurf

- Code aus der App

## Aktionen im Entwurf

- Bestätigen
- Wiederherstellungscode verwenden
- Abmelden

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/auth/ZweiFaktorSeite.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/auth/ZweiFaktorSeite.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
