# 143 · Urlaubsjahr und Übertrag

Einstellungen · Vorschaurolle: Geschäftsführung · `personal-urlaub`

**Entscheidung: präzisiert.** Verfallsdatum nur beim passenden Übertragsmodell zeigen; Urlaubsjahr und Kalenderjahr bleiben fachlich getrennt.

Aufgabe: Urlaubsjahr und Übertrag.

[Screenshot Desktop](../bilder/143-personal-urlaub-desktop.jpg) · [Tablet](../bilder/143-personal-urlaub-tablet.jpg) · [Handy](../bilder/143-personal-urlaub-mobil.jpg) · [Galerie](../galerie.html#personal-urlaub) · [Prototyp](../index.html#personal-urlaub)

## Bei der Umsetzung erhalten

- Jahresübergreifende Anträge
- Urlaubsjahr vs Kalenderjahr
- Kein stiller Bestandsumbau
- Verfallstag nur bei gewähltem Stichtagsmodell sichtbar; rechtlicher Hinweis bleibt in der Hilfe

## Formularfelder im Entwurf

- Urlaubsjahr beginnt am
- Monat
- Wie Resturlaub übertragen wird
- Verfällt am
- Verfallsmonat

## Aktionen im Entwurf

- Urlaubsübertrag speichern

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/settings/SettingsView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/settings/SettingsView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
