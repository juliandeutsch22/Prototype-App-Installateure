# Angebot A-2026-0092

[Zur Übersicht](../README.md) · [Bereich: Angebote](../bereiche/angebote.md)

**Angebote · Geschäftsführung · /quotes/:id**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/204-angebot-versendet-desktop.jpg) · [Tablet](../bilder/204-angebot-versendet-tablet.jpg) · [Mobil](../bilder/204-angebot-versendet-mobil.jpg)

![Angebot A-2026-0092 – Desktop](../bilder/204-angebot-versendet-desktop.jpg)

## Aufbau

Annehmen ist im passenden Zustand sichtbar; PDF direkt erreichbar, neue Fassung und Ablehnung als separate Aktionen.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Angenommenes Angebot nicht als veränderbarer Entwurf darstellen
- PDF
- Bestehende Baustelle verlinken
- Neue Fassung nur für versendet/abgelehnt; Buchhaltung liest nur

## Aktionen

- Angebot annehmen
- Neue Fassung
- Als abgelehnt markieren
- PDF laden

## Quellen

Quellstand: `3e49090`.
- [src/features/quotes/AngebotView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/quotes/AngebotView.tsx)
- [src/features/quotes/AbrechnungWahl.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/quotes/AbrechnungWahl.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
