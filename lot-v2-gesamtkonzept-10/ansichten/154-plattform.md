# 154 · Plattformverwaltung

Plattform · Vorschaurolle: Plattformadministrator · `plattform`

**Entscheidung: beibehalten.** Betriebe nach Status auflisten; Plattformrolle erhält durch die Oberfläche keinen beiläufigen Zugriff auf Betriebsdaten.

Aufgabe: Plattformverwaltung.

[Screenshot Desktop](../bilder/154-plattform-desktop.jpg) · [Tablet](../bilder/154-plattform-tablet.jpg) · [Handy](../bilder/154-plattform-mobil.jpg) · [Galerie](../galerie.html#plattform) · [Prototyp](../index.html#plattform)

## Bei der Umsetzung erhalten

- Plattformkonto hat keinen Betriebszugriff
- Einblick nur mit Freigabe/Notzugang
- Gelöschte separat
- Eigene MFA/Passwort erreichbar

## Aktionen im Entwurf

- Betrieb anlegen
- Fehler aus Betrieben
- Notzugang
- Basiszinssatz

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/plattform/PlattformView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/plattform/PlattformView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
