# 192 · Zusatzrechte nach Rolle

Benutzer · Vorschaurolle: Geschäftsführung · `benutzer-zusatzrechte`

**Entscheidung: präzisiert.** Zielrolle deutlich nennen und nur passende Zusatzrechte zeigen; Kundenpflege, Katalogimport und Preisleserecht nicht verwechseln.

Aufgabe: Zusatzrechte nach Rolle.

[Screenshot Desktop](../bilder/192-benutzer-zusatzrechte-desktop.jpg) · [Tablet](../bilder/192-benutzer-zusatzrechte-tablet.jpg) · [Handy](../bilder/192-benutzer-zusatzrechte-mobil.jpg) · [Galerie](../galerie.html#benutzer-zusatzrechte) · [Prototyp](../index.html#benutzer-zusatzrechte)

## Bei der Umsetzung erhalten

- Im echten Formular nur die zur aktuellen Rolle passenden Felder
- Katalogfreigabe umfasst Einkaufspreise
- Kein Rechnungs-Schreibrecht für Projektleitung
- Projektleitung erhält ausschließlich das separate Feld Rechnungen seiner Baustellen lesen, kein Rechnungs-Schreibrecht

## Formularfelder im Entwurf

- Darf Kunden anlegen und ändern
- Darf den Katalog einspielen
- Darf Einkaufspreise sehen

## Aktionen im Entwurf

- Berechtigungen speichern

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/users/BenutzerakteView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/BenutzerakteView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
