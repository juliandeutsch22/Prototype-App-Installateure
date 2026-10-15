# 063 · Anforderung bearbeiten

Material · Vorschaurolle: Verwaltung · `anforderung-detail`

**Entscheidung: präzisiert.** Die häufige nächste Aktion sichtbar, weitere Aktionen nur passend zum Status; Lagerverfügbarkeit und Anforderungsmenge getrennt lesen.

Aufgabe: Anforderung bearbeiten.

[Screenshot Desktop](../bilder/063-anforderung-detail-desktop.jpg) · [Tablet](../bilder/063-anforderung-detail-tablet.jpg) · [Handy](../bilder/063-anforderung-detail-mobil.jpg) · [Galerie](../galerie.html#anforderung-detail) · [Prototyp](../index.html#anforderung-detail)

## Bei der Umsetzung erhalten

- Bestellen/Liefern/Abholbereit/Abschließen nur passend zum Status
- Lagerreservierung bleibt korrekt

## Formularfelder im Entwurf

- Großhändler
- Notiz

## Aktionen im Entwurf

- Annehmen
- Auf die Einkaufsliste
- Als abholbereit markieren
- Anforderung abschließen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/orders/AdminOrdersView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/orders/AdminOrdersView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
