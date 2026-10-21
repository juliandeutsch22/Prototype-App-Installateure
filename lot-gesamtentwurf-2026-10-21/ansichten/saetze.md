# Sätze und Kosten

[Zur Übersicht](../README.md) · [Bereich: Einstellungen](../bereiche/einstellungen.md)

**Einstellungen · Geschäftsführung · /settings/saetze**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/138-saetze-desktop.jpg) · [Tablet](../bilder/138-saetze-tablet.jpg) · [Mobil](../bilder/138-saetze-mobil.jpg)

![Sätze und Kosten – Desktop](../bilder/138-saetze-desktop.jpg)

## Aufbau

Verkaufssätze, Zuschläge, interne Kosten und Aufschläge bleiben getrennte Abschnitte; historische Werte nicht als neue Vorgabe überschreiben.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Einstufungen und Lehrjahre
- Interne Kosten nur Spitze
- Historische Belegwerte unverändert
- Warengruppenaufschläge

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

- Monteur / Facharbeiter (€/h)
- Helfer (€/h)
- Lehrling je Einstufung (€/h)
- Nachtarbeit (%)
- Notdienst (%)
- Kosten Facharbeiterstunde (€)
- Kosten Helferstunde (€)
- Kosten je Einstufung (€)
- Standard-Aufschlag (%)
- Warengruppe
- Aufschlag der Warengruppe (%)

## Aktionen

- Sätze speichern
- Auf Standardwerte zurücksetzen

## Quellen

Quellstand: `3e49090`.
- [src/features/settings/SettingsView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/settings/SettingsView.tsx)
- [src/features/settings/MaterialaufschlagFelder.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/settings/MaterialaufschlagFelder.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
