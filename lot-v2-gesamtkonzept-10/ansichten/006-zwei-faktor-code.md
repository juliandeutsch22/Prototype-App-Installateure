# 006 · Mit Wiederherstellungscode anmelden

Zugang · Vorschaurolle: Geschäftsführung · `zwei-faktor-code`

**Entscheidung: beibehalten.** Ein Wiederherstellungscode ist eine alternative Anmeldung; keine parallele zweite Formularspalte einführen.

Aufgabe: Mit Wiederherstellungscode anmelden.

[Screenshot Desktop](../bilder/006-zwei-faktor-code-desktop.jpg) · [Tablet](../bilder/006-zwei-faktor-code-tablet.jpg) · [Handy](../bilder/006-zwei-faktor-code-mobil.jpg) · [Galerie](../galerie.html#zwei-faktor-code) · [Prototyp](../index.html#zwei-faktor-code)

## Bei der Umsetzung erhalten

- Felder, Aktionen und Zugänge aus den verlinkten Komponenten; Berechtigungen im echten System prüfen.

## Formularfelder im Entwurf

- Wiederherstellungscode

## Aktionen im Entwurf

- Bestätigen
- Code aus der App verwenden

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/auth/ZweiFaktorSeite.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/auth/ZweiFaktorSeite.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
