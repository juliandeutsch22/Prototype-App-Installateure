# 202 · Zeit erfassen

Zeit · Vorschaurolle: Geschäftsführung · `zeit-leitung`

**Entscheidung: präzisiert.** Kurze Erfassung bleibt Standard, vollständige Erfassung direkt zuschaltbar; Administration bekommt kein künstliches Zeitkonto.

Aufgabe: Zeit erfassen.

[Screenshot Desktop](../bilder/202-zeit-leitung-desktop.jpg) · [Tablet](../bilder/202-zeit-leitung-tablet.jpg) · [Handy](../bilder/202-zeit-leitung-mobil.jpg) · [Galerie](../galerie.html#zeit-leitung) · [Prototyp](../index.html#zeit-leitung)

## Bei der Umsetzung erhalten

- Einfache Erfassung als Standard
- Leitung kann volle Erfassung zuschalten
- Administration ohne künstliches Zeitkonto

## Formularfelder im Entwurf

- Datum
- Status
- Von
- Bis
- Pause (Min.)

## Aktionen im Entwurf

- Zeit buchen
- Erweiterte Erfassung
- Meine Einträge

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/time/TimeView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/time/TimeView.tsx)
- [src/features/time/TimeForm.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/time/TimeForm.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
