# 135 · Mein Konto

Einstellungen · Vorschaurolle: Geschäftsführung · `konto`

**Entscheidung: Lücke geschlossen.** Benachrichtigungspräferenzen in einem tatsächlich abschließbaren Formular halten; Passwort und MFA bleiben eigene Vorgänge.

Aufgabe: Mein Konto.

[Screenshot Desktop](../bilder/135-konto-desktop.jpg) · [Tablet](../bilder/135-konto-tablet.jpg) · [Handy](../bilder/135-konto-mobil.jpg) · [Galerie](../galerie.html#konto) · [Prototyp](../index.html#konto)

## Bei der Umsetzung erhalten

- Nur rollenpassende Meldungsthemen
- Push pro Gerät
- Passwort und MFA getrennt
- Zwei-Faktor-Pflicht nur berechtigte Spitze setzt sie

## Aktionen im Entwurf

- Einstellungen speichern
- Testmeldung

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/settings/NotificationSettings.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/settings/NotificationSettings.tsx)
- [src/features/settings/ZweiFaktorKarte.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/settings/ZweiFaktorKarte.tsx)
- [src/features/settings/PushStatus.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/settings/PushStatus.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
