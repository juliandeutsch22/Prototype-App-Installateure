# 092 · Mahnlauf prüfen

Rechnungen · Vorschaurolle: Geschäftsführung · `mahnlauf`

**Entscheidung: Lücke geschlossen.** Die ausdrücklich ausgewählten Rechnungen müssen als Auswahl sichtbar sein; Detailprüfung und Teilfehler bleiben je Rechnung möglich.

Aufgabe: Mahnlauf prüfen.

[Screenshot Desktop](../bilder/092-mahnlauf-desktop.jpg) · [Tablet](../bilder/092-mahnlauf-tablet.jpg) · [Handy](../bilder/092-mahnlauf-mobil.jpg) · [Galerie](../galerie.html#mahnlauf) · [Prototyp](../index.html#mahnlauf)

## Bei der Umsetzung erhalten

- Einzeln auswählbar
- Teilfehler pro Rechnung
- Wiederholung erzeugt keine Doppelmahnung

## Aktionen im Entwurf

- Ausgewählte Mahnungen erzeugen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/invoices/InvoicesView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/invoices/InvoicesView.tsx)
- [src/features/invoices/mahnlauf.ts](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/invoices/mahnlauf.ts)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
