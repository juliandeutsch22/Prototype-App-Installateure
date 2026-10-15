# 214 · Gemeinsamer Monatsvergleich

Auswertung · Vorschaurolle: Buchhaltung · `mitarbeiter-monatsraster`

**Entscheidung: ergänzt.** Bedingten Arbeitszustand bzw. getrennte Aufgabe explizit zeigen, ohne vorhandene Ansicht umzudeuten.

Aufgabe: Gemeinsamer Monatsvergleich.

[Screenshot Desktop](../bilder/214-mitarbeiter-monatsraster-desktop.jpg) · [Tablet](../bilder/214-mitarbeiter-monatsraster-tablet.jpg) · [Handy](../bilder/214-mitarbeiter-monatsraster-mobil.jpg) · [Galerie](../galerie.html#mitarbeiter-monatsraster) · [Prototyp](../index.html#mitarbeiter-monatsraster)

## Bei der Umsetzung erhalten

- Ist/Soll/Saldo getrennt
- Fehlende Tage/Arbeitszeitgrenzen
- Zeitkonto nur für berechtigte Personen
- Kein Zeitkonto für Administration
- Support ohne sensible Tagesdetails

## Aktionen im Entwurf

- Bericht exportieren
- Stunden je Baustelle

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/accounting/AccountingView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/accounting/AccountingView.tsx)
- [src/features/accounting/UebersichtListe.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/accounting/UebersichtListe.tsx)
- [src/features/accounting/Streifen.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/accounting/Streifen.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
