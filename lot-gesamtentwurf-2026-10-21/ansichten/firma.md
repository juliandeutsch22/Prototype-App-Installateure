# Firmendaten

[Zur Übersicht](../README.md) · [Bereich: Einstellungen](../bereiche/einstellungen.md)

**Einstellungen · Geschäftsführung · /settings/firma**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/137-firma-desktop.jpg) · [Tablet](../bilder/137-firma-tablet.jpg) · [Mobil](../bilder/137-firma-mobil.jpg)

![Firmendaten – Desktop](../bilder/137-firma-desktop.jpg)

## Aufbau

Anschrift, rechtliche Angaben/Bank und Darstellung gliedern; Briefkopfdaten nicht zwischen Farbfeldern verstecken.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Briefkopf-/Logo-Vorschau
- UID/IBAN-Prüfung
- Kontrastprüfung
- Bestehende PDF-Belegfarben unabhängig vom UI

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

- Firmenname (Pflichtfeld)
- Straße
- PLZ
- Ort
- Kontakt (eine Zeile)
- Logo
- UID-Nummer
- Firmenbuchnummer
- Firmenbuchgericht
- IBAN
- BIC
- Bank
- Hauptfarbe (#rrggbb)
- Schrift auf der Hauptfarbe
- Akzentfarbe (#rrggbb)
- Schrift auf der Akzentfarbe

## Aktionen

- Firmendaten speichern

## Quellen

Quellstand: `3e49090`.
- [src/features/settings/FirmendatenView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/settings/FirmendatenView.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
