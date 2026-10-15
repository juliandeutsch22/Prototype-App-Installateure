# 156 · Betrieb verwalten

Plattform · Vorschaurolle: Plattformadministrator · `plattform-betrieb`

**Entscheidung: beibehalten.** Lebenszyklus, Grund und Protokoll sind der Arbeitskontext; keinen neuen pauschalen Löschknopf anbieten.

Aufgabe: Betrieb verwalten.

[Screenshot Desktop](../bilder/156-plattform-betrieb-desktop.jpg) · [Tablet](../bilder/156-plattform-betrieb-tablet.jpg) · [Handy](../bilder/156-plattform-betrieb-mobil.jpg) · [Galerie](../galerie.html#plattform-betrieb) · [Prototyp](../index.html#plattform-betrieb)

## Bei der Umsetzung erhalten

- Stilllegen→Übergabe→Löschfrist→Löschen
- Testbetrieb-Ausnahme nur wie Bestand
- Kennungsbestätigung
- Kein neuer pauschaler Löschknopf

## Formularfelder im Entwurf

- Grund (steht im Protokoll)
- Frist (Tage)
- Zur Löschbestätigung die Kennung eintippen

## Aktionen im Entwurf

- Nächsten zulässigen Schritt prüfen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/plattform/BetriebVerwalten.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/plattform/BetriebVerwalten.tsx)
- [src/features/plattform/PlattformView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/plattform/PlattformView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
