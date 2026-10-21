# Stornorechnung als E-Rechnung

[Zur Übersicht](../README.md) · [Bereich: Rechnungen](../bereiche/rechnungen.md)

**Rechnungen · Geschäftsführung · /invoices · Stornorechnung ausstellen**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/244-e-rechnung-storno-desktop.jpg) · [Tablet](../bilder/244-e-rechnung-storno-tablet.jpg) · [Mobil](../bilder/244-e-rechnung-storno-mobil.jpg)

![Stornorechnung als E-Rechnung – Desktop](../bilder/244-e-rechnung-storno-desktop.jpg)

## Aufbau

Stornorechnung als eigenen Belegvorgang erhalten; bestehende Nummern- und Archivregeln bleiben maßgeblich.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Je Zustand getrennte zulässige Aktion
- BMD-/Belegarchiv bleibt nachvollziehbar
- Bestätigung bleibt verbindlich

## Felder im Beispiel

- Empfängerart
- Auftragsreferenz
- Bestellposition
- Unsere Lieferantennummer
- Lieferantennummer beim Kunden merken

## Aktionen

- XML herunterladen

## Quellen

Quellstand: `3e49090`.
- [src/features/invoices/EbInterfaceDialog.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/invoices/EbInterfaceDialog.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
