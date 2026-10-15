# 159 · Notzugang öffnen

Plattform · Vorschaurolle: Plattformadministrator · `plattform-notzugang`

**Entscheidung: beibehalten.** Kennung, Dauer und Grund bilden einen geschützten Vorgang; Notpasswort und Faktorreset bleiben eigenständige Wege.

Aufgabe: Notzugang öffnen.

[Screenshot Desktop](../bilder/159-plattform-notzugang-desktop.jpg) · [Tablet](../bilder/159-plattform-notzugang-tablet.jpg) · [Handy](../bilder/159-plattform-notzugang-mobil.jpg) · [Galerie](../galerie.html#plattform-notzugang) · [Prototyp](../index.html#plattform-notzugang)

## Bei der Umsetzung erhalten

- Befristung und Protokoll
- Keine automatische Einsicht nur durch Kenntnis der Kennung
- Kontrollierte Notfallrechte

## Formularfelder im Entwurf

- Kennung des Betriebs
- Stunden (1–24)
- Grund

## Aktionen im Entwurf

- Notzugang öffnen
- Startpasswort zurücksetzen
- Zweiten Faktor zurücksetzen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/plattform/PlattformView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/plattform/PlattformView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
