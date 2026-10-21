# Leistung bestätigen

[Zur Übersicht](../README.md) · [Bereich: Scheine](../bereiche/scheine.md)

**Scheine · Mitarbeiter · /worksheet · Unterschrift**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/054-schein-unterschrift-desktop.jpg) · [Tablet](../bilder/054-schein-unterschrift-tablet.jpg) · [Mobil](../bilder/054-schein-unterschrift-mobil.jpg)

![Leistung bestätigen – Desktop](../bilder/054-schein-unterschrift-desktop.jpg)

## Aufbau

Zusammenfassung vor beide Unterschriften setzen; erst danach der eindeutige Abschluss, offene Uploads blockieren wie im Bestand.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Zusammenfassung vor Unterschriften
- Beide Signaturen
- Danach unveränderbar
- Offene Uploads blockieren Abschluss korrekt

## Register und Filter

- 1 · Zeiten → [schein-zeiten](schein-zeiten.md)
- 2 · Material → [schein-material](schein-material.md)
- 3 · Fotos → [schein-fotos](schein-fotos.md)
- 4 · Unterschrift → [schein-unterschrift](schein-unterschrift.md)

## Felder im Beispiel

- Monteur (Name in Druckbuchstaben) (Pflichtfeld)
- Unterschrift Monteur
- Kunde (Name in Druckbuchstaben) (Pflichtfeld)
- Unterschrift Kunde

## Aktionen

- Unterschriebenen Schein abschließen

## Quellen

Quellstand: `3e49090`.
- [src/features/worksheets/WorkSheetView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/worksheets/WorkSheetView.tsx)
- [src/features/worksheets/Schrittfolge.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/worksheets/Schrittfolge.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
