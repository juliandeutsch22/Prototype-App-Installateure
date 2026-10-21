# Urlaub

[Zur Übersicht](../README.md) · [Bereich: Urlaub](../bereiche/urlaub.md)

**Urlaub · Buchhaltung · /vacations**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/238-urlaub-buero-desktop.jpg) · [Tablet](../bilder/238-urlaub-buero-tablet.jpg) · [Mobil](../bilder/238-urlaub-buero-mobil.jpg)

![Urlaub – Desktop](../bilder/238-urlaub-buero-desktop.jpg)

## Aufbau

Resturlaub und Antragsstand klar trennen; Antragsarten als direkte Wege ergänzen, ohne Krankmeldung zum Urlaub zu machen.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Jede Rolle eigener Antrag
- Sonderurlaub/Pflege/unbezahlt
- Betriebsurlaub/Übertrag/Verfall
- Eigene Krankmeldungen ändern

## Register und Filter

- Anträge → [urlaub-buero](urlaub-buero.md)
- Krankenstände → [krankenstaende](krankenstaende.md)
- Betriebsurlaub → [betriebsurlaub](betriebsurlaub.md)

## Aktionen

- Antrag stellen
- Krank melden

## Quellen

Quellstand: `3e49090`.
- [src/features/vacations/VacationsView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/vacations/VacationsView.tsx)
- [src/features/vacations/FreistellungListe.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/vacations/FreistellungListe.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
