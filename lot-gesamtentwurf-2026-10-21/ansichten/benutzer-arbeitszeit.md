# Arbeitszeit und Urlaub

[Zur Übersicht](../README.md) · [Bereich: Benutzer](../bereiche/benutzer.md)

**Benutzer · Geschäftsführung · /user-mgmt/:uid**

Gestaltungsentwurf mit fiktiven Beispieldaten. Aktionen und Datenänderungen sind lokal simuliert, ohne Backend.

[Desktop](../bilder/236-benutzer-arbeitszeit-desktop.jpg) · [Tablet](../bilder/236-benutzer-arbeitszeit-tablet.jpg) · [Mobil](../bilder/236-benutzer-arbeitszeit-mobil.jpg)

![Arbeitszeit und Urlaub – Desktop](../bilder/236-benutzer-arbeitszeit-desktop.jpg)

## Aufbau

Personendaten, Arbeitstage und Zugang getrennt lesen; fehlende Wege zu Zugang, Zusatzrechten und Lehrlingseinstufung ergänzen.

## Vorhandene Funktionen für die spätere Umsetzung erhalten

- Geburtsdatum vertraulich
- Start-Saldo und Gültigkeit
- Kontoänderung und Zugang getrennt

## Register und Filter

- Profil → [benutzerakte](benutzerakte.md)
- Arbeitszeit und Urlaub → [benutzer-arbeitszeit](benutzer-arbeitszeit.md)
- Zugang und Rechte → [benutzer-zugang](benutzer-zugang.md)

## Aktionen

- Bearbeiten
- Urlaub anpassen
- Datenauskunft

## Quellen

Quellstand: `3e49090`.
- [src/features/users/BenutzerakteView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/users/BenutzerakteView.tsx)
- [src/features/users/GeburtsdatumKarte.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/users/GeburtsdatumKarte.tsx)
- [src/features/users/UrlaubsanspruchKarte.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/3e49090d4054ebbd3ecbce6ab583bb944c2c0770/src/features/users/UrlaubsanspruchKarte.tsx)

Die Screens zeigen die vorgesehenen Bedienwege. Reale Speicherung, vollständige Rollenprüfung, Berechnungen, Exporte, Benachrichtigungen und Integrationen müssen bei einer Umsetzung gegen die App geprüft werden.
