# 007 · Zweiten Faktor einrichten

Zugang · Vorschaurolle: Geschäftsführung · `zwei-faktor-einrichten`

**Entscheidung: präzisiert.** Verbindung mit Authenticator und anschließende Codebestätigung als zwei klar aufeinanderfolgende Abschnitte darstellen; keine verwendbaren Geheimnisse vortäuschen.

Aufgabe: Zweiten Faktor einrichten.

[Screenshot Desktop](../bilder/007-zwei-faktor-einrichten-desktop.jpg) · [Tablet](../bilder/007-zwei-faktor-einrichten-tablet.jpg) · [Handy](../bilder/007-zwei-faktor-einrichten-mobil.jpg) · [Galerie](../galerie.html#zwei-faktor-einrichten) · [Prototyp](../index.html#zwei-faktor-einrichten)

## Bei der Umsetzung erhalten

- QR/Schlüssel nur für die angemeldete Person
- Bestätigung vor Aktivierung

## Aktionen im Entwurf

- Bestätigen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/auth/ZweiFaktorEinrichten.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/auth/ZweiFaktorEinrichten.tsx)
- [src/features/settings/ZweiFaktorKarte.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/settings/ZweiFaktorKarte.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
