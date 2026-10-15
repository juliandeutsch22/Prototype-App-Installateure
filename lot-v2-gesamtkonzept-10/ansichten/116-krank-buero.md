# 116 · Krankmeldung erfassen

Urlaub · Vorschaurolle: Buchhaltung · `krank-buero`

**Entscheidung: beibehalten.** Person und Zeitraum sind der Vorgang; dieselben vertraulichen Angaben und Rechte wie im Bestand verwenden.

Aufgabe: Krankmeldung erfassen.

[Screenshot Desktop](../bilder/116-krank-buero-desktop.jpg) · [Tablet](../bilder/116-krank-buero-tablet.jpg) · [Handy](../bilder/116-krank-buero-mobil.jpg) · [Galerie](../galerie.html#krank-buero) · [Prototyp](../index.html#krank-buero)

## Bei der Umsetzung erhalten

- Felder, Aktionen und Zugänge aus den verlinkten Komponenten; Berechtigungen im echten System prüfen.

## Formularfelder im Entwurf

- Mitarbeiter
- Krank ab
- Voraussichtlich bis
- Anmerkung (freiwillig, keine Diagnose)

## Aktionen im Entwurf

- Krankmeldung speichern

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/vacations/Krankmeldungen.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/vacations/Krankmeldungen.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
