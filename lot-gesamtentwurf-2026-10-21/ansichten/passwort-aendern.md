# Passwort ändern

[Zur Übersicht](../README.md) · [Bereich: Zugang](../bereiche/zugang.md)

**Zugang · Geschäftsführung · /settings/meldungen · Passwort**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/004-passwort-aendern-desktop.jpg) · [Tablet](../bilder/004-passwort-aendern-tablet.jpg) · [Mobil](../bilder/004-passwort-aendern-mobil.jpg)

![Passwort ändern – Desktop](../bilder/004-passwort-aendern-desktop.jpg)

## Aufbau

Aktuelles und neues Passwort bilden einen einzigen geschützten Vorgang; verständliche Feldbezeichnungen und klare Abschlussaktion erhalten.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Passwortbestätigung
- Bei normaler Änderung aktuelles Passwort
- Kein Überspringen beim Startpasswort

## Felder im Beispiel

- Aktuelles Passwort (Pflichtfeld)
- Neues Passwort (Pflichtfeld)
- Noch einmal (Pflichtfeld)

## Aktionen

- Passwort ändern

## Quellen

Quellstand: `3e49090`.
- [src/features/auth/PasswortAendern.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/auth/PasswortAendern.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
