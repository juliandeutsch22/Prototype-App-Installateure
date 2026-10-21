# Zeit erfassen

[Zur Übersicht](../README.md) · [Bereich: Zeit](../bereiche/zeit.md)

**Zeit · Mitarbeiter · /time**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/098-zeit-desktop.jpg) · [Tablet](../bilder/098-zeit-tablet.jpg) · [Mobil](../bilder/098-zeit-mobil.jpg)

![Zeit erfassen – Desktop](../bilder/098-zeit-desktop.jpg)

## Aufbau

Einsatz/Tag, Arbeitszeit und weitere Angaben gruppieren; Dauer direkt an Von/Bis/Pause zeigen und lokale Eingaben erhalten.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Alle Rollen eigene Zeit
- Monteur immer volle Erfassung
- Büro keine unnötigen Baustellen-/Zuschlagsfelder
- Leitung kann erweitern
- Jugendliche/Unterricht/Nachtzeitregeln
- Abwesenheiten stunden-/tageweise

## Felder im Beispiel

- Baustelle
- Datum
- Status
- Von
- Bis
- Pause (Min.)
- Wegzeit (Min.)
- Fahrzeug
- Name des Helfers
- Einsatz als Helfer
- Notdienst / Störungseinsatz
- Nicht als Nachtarbeit zählen
- Grund
- Kommentar

## Aktionen

- Zeit buchen
- Meine Einträge
- Auf Baustellen aufteilen

## Quellen

Quellstand: `3e49090`.
- [src/features/time/TimeView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/time/TimeView.tsx)
- [src/features/time/TimeForm.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/time/TimeForm.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
