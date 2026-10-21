# Urlaubsanspruch anpassen

[Zur Übersicht](../README.md) · [Bereich: Benutzer](../bereiche/benutzer.md)

**Benutzer · Geschäftsführung · /user-mgmt/:uid · Urlaubsanspruch**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/133-urlaubsanspruch-desktop.jpg) · [Tablet](../bilder/133-urlaubsanspruch-tablet.jpg) · [Mobil](../bilder/133-urlaubsanspruch-mobil.jpg)

![Urlaubsanspruch anpassen – Desktop](../bilder/133-urlaubsanspruch-desktop.jpg)

## Aufbau

Jahr, positive oder negative Anpassung und Pflichtgrund gemeinsam zeigen; Grundanspruch und bisherige Anpassung nicht vermischen.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Anpassung entfernen nur mit Bestätigung
- Urlaubsjahr getrennt
- Kein stilles Überschreiben des Grundanspruchs

## Felder im Beispiel

- Urlaubsjahr
- Tage (weniger mit Minus)
- Grund (Pflichtfeld)

## Aktionen

- Anpassung speichern
- Anpassung entfernen

## Quellen

Quellstand: `3e49090`.
- [src/features/users/UrlaubsanspruchKarte.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/users/UrlaubsanspruchKarte.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
