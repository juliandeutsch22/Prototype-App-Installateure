# 160 · Notzugang – Startpasswort

Plattform · Vorschaurolle: Plattformadministrator · `plattform-notpasswort`

**Entscheidung: beibehalten.** Kontowahl und bestätigte Identität vor Reset; keine Abkürzung um den aktiven Notzugang.

Aufgabe: Notzugang – Startpasswort.

[Screenshot Desktop](../bilder/160-plattform-notpasswort-desktop.jpg) · [Tablet](../bilder/160-plattform-notpasswort-tablet.jpg) · [Handy](../bilder/160-plattform-notpasswort-mobil.jpg) · [Galerie](../galerie.html#plattform-notpasswort) · [Prototyp](../index.html#plattform-notpasswort)

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

- Startpasswort erzeugen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/plattform/NotzugangPasswort.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/plattform/NotzugangPasswort.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
