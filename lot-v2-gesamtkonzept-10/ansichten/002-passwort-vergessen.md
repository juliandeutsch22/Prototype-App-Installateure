# 002 · Passwort zurücksetzen

Zugang · Vorschaurolle: Mitarbeiter · `passwort-vergessen`

**Entscheidung: beibehalten.** E-Mail-Rücksetzung und Startpasswort für Benutzerkonten verständlich trennen, ohne die Existenz eines Kontos zu verraten.

Aufgabe: Passwort zurücksetzen.

[Screenshot Desktop](../bilder/002-passwort-vergessen-desktop.jpg) · [Tablet](../bilder/002-passwort-vergessen-tablet.jpg) · [Handy](../bilder/002-passwort-vergessen-mobil.jpg) · [Galerie](../galerie.html#passwort-vergessen) · [Prototyp](../index.html#passwort-vergessen)

## Bei der Umsetzung erhalten

- Keine Auskunft, ob ein Konto existiert
- Benutzerkonten erhalten keinen Mail-Link

## Formularfelder im Entwurf

- E-Mail

## Aktionen im Entwurf

- Link anfordern
- Zur Anmeldung

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/auth/LoginPage.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/auth/LoginPage.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
