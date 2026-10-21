# Mein Konto

[Zur Übersicht](../README.md) · [Bereich: Einstellungen](../bereiche/einstellungen.md)

**Einstellungen · Geschäftsführung · /settings/meldungen**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/135-konto-desktop.jpg) · [Tablet](../bilder/135-konto-tablet.jpg) · [Mobil](../bilder/135-konto-mobil.jpg)

![Mein Konto – Desktop](../bilder/135-konto-desktop.jpg)

## Aufbau

Benachrichtigungspräferenzen in einem tatsächlich abschließbaren Formular halten; Passwort und MFA bleiben eigene Vorgänge.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Nur rollenpassende Meldungsthemen
- Push pro Gerät
- Passwort und MFA getrennt
- Zwei-Faktor-Pflicht nur berechtigte Spitze setzt sie

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

- Neue Materialanforderung
- Mein Material ist abholbereit
- Eilzustellung für meine Baustellen
- Urlaub, Zeitausgleich und Krankmeldungen

## Aktionen

- Einstellungen speichern
- Testmeldung

## Quellen

Quellstand: `3e49090`.
- [src/features/settings/NotificationSettings.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/settings/NotificationSettings.tsx)
- [src/features/settings/ZweiFaktorKarte.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/settings/ZweiFaktorKarte.tsx)
- [src/features/settings/PushStatus.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/settings/PushStatus.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
