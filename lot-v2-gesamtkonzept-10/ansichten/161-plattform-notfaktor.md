# 161 · Notzugang – zweiter Faktor

Plattform · Vorschaurolle: Plattformadministrator · `plattform-notfaktor`

**Entscheidung: beibehalten.** Dieselbe Identitätsprüfung wie beim Notpasswort; zweiter Faktor wird nicht durch bloße Kontokenntnis zurückgesetzt.

Aufgabe: Notzugang – zweiter Faktor.

[Screenshot Desktop](../bilder/161-plattform-notfaktor-desktop.jpg) · [Tablet](../bilder/161-plattform-notfaktor-tablet.jpg) · [Handy](../bilder/161-plattform-notfaktor-mobil.jpg) · [Galerie](../galerie.html#plattform-notfaktor) · [Prototyp](../index.html#plattform-notfaktor)

## Bei der Umsetzung erhalten

- Aktiver Notzugang nötig
- Identitätsprüfung bleibt ausdrücklich
- Kein echtes Kennwort/Code in der Vorschau

## Formularfelder im Entwurf

- Konto
- Grund
- Rückruf an (Firmenbuch / Gewerberegister)
- Identität durch Rückruf an diese Nummer bestätigt – nicht an die Nummer des Anrufers.

## Aktionen im Entwurf

- Zweiten Faktor zurücksetzen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/plattform/NotzugangZweiFaktor.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/plattform/NotzugangZweiFaktor.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
