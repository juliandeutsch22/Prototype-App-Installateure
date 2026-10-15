# 155 · Neuer Betrieb

Plattform · Vorschaurolle: Plattformadministrator · `plattform-neu`

**Entscheidung: neu geordnet.** Betriebskennung und ersten Zugang getrennt gliedern; einmalige Übergabe und Testbetriebsstatus bleiben explizit.

Aufgabe: Neuer Betrieb.

[Screenshot Desktop](../bilder/155-plattform-neu-desktop.jpg) · [Tablet](../bilder/155-plattform-neu-tablet.jpg) · [Handy](../bilder/155-plattform-neu-mobil.jpg) · [Galerie](../galerie.html#plattform-neu) · [Prototyp](../index.html#plattform-neu)

## Bei der Umsetzung erhalten

- Einmalige Übergabe Link/Startpasswort
- Betriebskennung eindeutig
- Keine wiederverwendbaren Geheimnisse im Mockup

## Formularfelder im Entwurf

- Name des Betriebs
- Kennung
- Erster Administrator
- Anmeldung mit
- Dessen E-Mail
- Benutzername
- Testbetrieb

## Aktionen im Entwurf

- Betrieb anlegen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/plattform/PlattformView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/plattform/PlattformView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
