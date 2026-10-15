# 129 · Benutzerdaten bearbeiten

Benutzer · Vorschaurolle: Geschäftsführung · `benutzer-daten`

**Entscheidung: Lücke geschlossen.** Anmeldekennung nicht direkt editierbar, Kontoumstellung separat; Arbeitstage/Tagessoll und zulässige Rollen vollständig erhalten.

Aufgabe: Benutzerdaten bearbeiten.

[Screenshot Desktop](../bilder/129-benutzer-daten-desktop.jpg) · [Tablet](../bilder/129-benutzer-daten-tablet.jpg) · [Handy](../bilder/129-benutzer-daten-mobil.jpg) · [Galerie](../galerie.html#benutzer-daten) · [Prototyp](../index.html#benutzer-daten)

## Bei der Umsetzung erhalten

- Zusatzrechte nur für passende Rollen
- Zeitkonto der GF personenspezifisch
- Tagessoll/Wochentage
- Ungespeicherte Änderungen

## Formularfelder im Entwurf

- Name
- Anmeldung mit (nur lesen)
- Benutzername (nur lesen)
- Rolle
- Status
- Einstufung
- Geburtsdatum
- Wochenstunden
- Urlaubstage pro Jahr
- Eintrittsdatum
- Saldo-Startdatum
- Start-Saldo (Stunden)
- Resturlaub beim Umstieg (Tage)
- Führt ein Zeitkonto

## Aktionen im Entwurf

- Änderungen speichern

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/users/BenutzerakteView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/BenutzerakteView.tsx)
- [src/features/users/EinstufungFelder.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/EinstufungFelder.tsx)
- [src/features/users/TagessollFelder.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/TagessollFelder.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
