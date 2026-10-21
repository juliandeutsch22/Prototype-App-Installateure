# Katalog einspielen

[Zur Übersicht](../README.md) · [Bereich: Lager](../bereiche/lager.md)

**Lager · Administrator · /lager · DATANORM-Import**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/078-katalog-import-desktop.jpg) · [Tablet](../bilder/078-katalog-import-tablet.jpg) · [Mobil](../bilder/078-katalog-import-mobil.jpg)

![Katalog einspielen – Desktop](../bilder/078-katalog-import-desktop.jpg)

## Aufbau

Datei und Lieferant vor dem Probelauf zeigen; noch nicht geprüfte Importzahlen nicht vor Auswahl der Datei als Ergebnis darstellen.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Freigabe katalogEinspielen
- Lieferant wählen
- Mapping abweichender Felder
- Vorschau/Probelauf/Übernahme getrennt
- Resultat neu/aktualisiert/ausgelaufen/ohne Preis

## Felder im Beispiel

- Lieferant
- Name des Lieferanten
- DATANORM-Datei

## Aktionen

- Probelauf starten

## Quellen

Quellstand: `3e49090`.
- [src/features/materials/KatalogImport.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/materials/KatalogImport.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
