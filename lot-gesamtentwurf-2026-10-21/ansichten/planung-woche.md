# Einsatzplanung

[Zur Übersicht](../README.md) · [Bereich: Planung](../bereiche/planung.md)

**Planung · Geschäftsführung · /assignments/woche**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/040-planung-woche-desktop.jpg) · [Tablet](../bilder/040-planung-woche-tablet.jpg) · [Mobil](../bilder/040-planung-woche-mobil.jpg)

![Einsatzplanung – Desktop](../bilder/040-planung-woche-desktop.jpg)

## Aufbau

Bewährte dunkle Einsatzflächen, kompakter Kopf und inhaltsabhängige Zeilen; feste Namen und Tagesköpfe sowie Personen-/Baustellensicht erhalten.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Personen-/Baustellenansicht
- Tag/Woche/Monat
- Abwesenheiten und Verfügbarkeit
- Einteilung bearbeiten/löschen
- Materialbedarf
- Kalender-Abo

## Register und Filter

- Woche → [planung-woche](planung-woche.md)
- Monat → [planung-monat](planung-monat.md)
- Tag → [planung-tag](planung-tag.md)

## Aktionen

- Einsatz planen
- Kalender abonnieren

## Quellen

Quellstand: `3e49090`.
- [src/features/assignments/WochenplanView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/assignments/WochenplanView.tsx)
- [src/features/assignments/MonatsAnsicht.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/assignments/MonatsAnsicht.tsx)
- [src/features/assignments/AssignmentsView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/assignments/AssignmentsView.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
