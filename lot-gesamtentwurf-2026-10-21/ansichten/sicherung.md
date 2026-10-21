# Datensicherung

[Zur Übersicht](../README.md) · [Bereich: Einstellungen](../bereiche/einstellungen.md)

**Einstellungen · Geschäftsführung · /settings/sicherung**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/153-sicherung-desktop.jpg) · [Tablet](../bilder/153-sicherung-tablet.jpg) · [Mobil](../bilder/153-sicherung-mobil.jpg)

![Datensicherung – Desktop](../bilder/153-sicherung-desktop.jpg)

## Aufbau

Letzten Lauf und belegtes externes Ziel getrennt ausweisen; unbekannte Sicherungsbestandteile nicht als erfolgreich darstellen.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Erfolg/unbekannt/überfällig unterscheiden
- Externes Ziel nicht aus erfolgreichem Lauf ableiten
- Fotos/Dateien separat nachweisen
- Kein Restore-Knopf ohne bestehende Funktion
- Exportgrenzen und Teilfehler

## Register und Filter

- Übersicht → [einstellungen](einstellungen.md)
- Mein Konto → [konto](konto.md)
- Firmendaten → [firma](firma.md)
- Sätze und Kosten → [saetze](saetze.md)
- Rechnungsvorgaben → [rechnungsvorgaben](rechnungsvorgaben.md)
- Nummernkreise → [nummern](nummern.md)
- Personal → [personal](personal.md)
- Kontenrahmen → [kontenrahmen](kontenrahmen.md)
- Supportzugang → [support](support.md)
- Datensicherung → [sicherung](sicherung.md)

## Felder im Beispiel

- Zeitraum

## Aktionen

- Sicherung jetzt erstellen

## Quellen

Quellstand: `3e49090`.
- [src/features/settings/SicherungView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/settings/SicherungView.tsx)
- [src/features/settings/LaufStatus.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/settings/LaufStatus.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
