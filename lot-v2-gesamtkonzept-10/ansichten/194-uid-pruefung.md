# 194 · UID-Nummer prüfen

Kunden · Vorschaurolle: Geschäftsführung · `uid-pruefung`

**Entscheidung: beibehalten.** Nummer, letzte Prüfung und bewusst ausgelöste Abfrage erhalten; Netzfehler bleiben unbekannt statt ungültig.

Aufgabe: UID-Nummer prüfen.

[Screenshot Desktop](../bilder/194-uid-pruefung-desktop.jpg) · [Tablet](../bilder/194-uid-pruefung-tablet.jpg) · [Handy](../bilder/194-uid-pruefung-mobil.jpg) · [Galerie](../galerie.html#uid-pruefung) · [Prototyp](../index.html#uid-pruefung)

## Bei der Umsetzung erhalten

- Nur bestehende Prüfrechte
- Firmen-UID erforderlich
- Keine Echtheitszusage bei Netzfehler
- Prüfergebnis mit Zeit und Person

## Formularfelder im Entwurf

- UID-Nummer des Kunden

## Aktionen im Entwurf

- Bei VIES prüfen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/customers/UidVies.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/customers/UidVies.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
