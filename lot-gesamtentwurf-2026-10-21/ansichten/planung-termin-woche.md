# Termin aus der Woche anlegen

[Zur Übersicht](../README.md) · [Bereich: Planung](../bereiche/planung.md)

**Planung · Geschäftsführung · /assignments · Einsatzfenster**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/259-planung-termin-woche-desktop.jpg) · [Tablet](../bilder/259-planung-termin-woche-tablet.jpg) · [Mobil](../bilder/259-planung-termin-woche-mobil.jpg)

![Termin aus der Woche anlegen – Desktop](../bilder/259-planung-termin-woche-desktop.jpg)

## Aufbau

Mannschaft als Mehrfachauswahl, Helferzuordnung und Rüstliste gemeinsam bearbeiten; vorhandene Einteilung vor dem Speichern übernehmen.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Doppelbelegung
- Lehrlinge korrekt einstufen
- Gespeicherte Einteilung bleibt bei Fehler sichtbar

## Felder im Beispiel

- Art
- Tag
- Beginn
- Ende
- Bezug
- Baustelle
- Kunde
- Max Mustermann
- Anton Berger
- Franz Hinterleitner
- Notiz

## Aktionen

- Termin anlegen
- Material planen
- Einsatz löschen

## Quellen

Quellstand: `3e49090`.
- [src/features/assignments/WochenplanView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/assignments/WochenplanView.tsx)
- [src/features/termine/TerminFormular.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/termine/TerminFormular.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
