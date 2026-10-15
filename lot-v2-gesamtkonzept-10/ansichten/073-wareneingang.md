# 073 · Wareneingang buchen

Lager · Vorschaurolle: Verwaltung · `wareneingang`

**Entscheidung: beibehalten.** Artikel und Menge zuerst, Lieferant/Lieferschein/Bestellbezug zusammen; Pflichtlieferant und Mengenprüfung nicht ausblenden.

Aufgabe: Wareneingang buchen.

[Screenshot Desktop](../bilder/073-wareneingang-desktop.jpg) · [Tablet](../bilder/073-wareneingang-tablet.jpg) · [Handy](../bilder/073-wareneingang-mobil.jpg) · [Galerie](../galerie.html#wareneingang) · [Prototyp](../index.html#wareneingang)

## Bei der Umsetzung erhalten

- Lieferant Pflicht
- Freier Lieferant möglich
- Mengen-/Einheitenprüfung
- Bewegungsprotokoll

## Formularfelder im Entwurf

- Artikel
- Menge
- Lieferant
- Lieferschein-Nr.
- Bestellbezug

## Aktionen im Entwurf

- Einbuchen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/orders/LagerDialoge.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/orders/LagerDialoge.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
