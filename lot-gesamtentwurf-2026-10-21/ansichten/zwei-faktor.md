# Zwei-Faktor-Anmeldung

[Zur Übersicht](../README.md) · [Bereich: Zugang](../bereiche/zugang.md)

**Zugang · Geschäftsführung · Anmeldeprüfung**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/005-zwei-faktor-desktop.jpg) · [Tablet](../bilder/005-zwei-faktor-tablet.jpg) · [Mobil](../bilder/005-zwei-faktor-mobil.jpg)

![Zwei-Faktor-Anmeldung – Desktop](../bilder/005-zwei-faktor-desktop.jpg)

## Aufbau

Den Code als numerische Einmalcode-Eingabe kennzeichnen; Wiederherstellung als direkter alternativer Weg bleibt sichtbar.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Siehe Quellcode und Seitenübersicht.

## Felder im Beispiel

- Code aus der App (Pflichtfeld)

## Aktionen

- Bestätigen
- Wiederherstellungscode verwenden
- Abmelden

## Quellen

Quellstand: `3e49090`.
- [src/features/auth/ZweiFaktorSeite.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/auth/ZweiFaktorSeite.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
