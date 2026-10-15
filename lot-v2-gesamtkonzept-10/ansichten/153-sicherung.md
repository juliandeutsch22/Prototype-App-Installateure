# 153 · Datensicherung

Einstellungen · Vorschaurolle: Geschäftsführung · `sicherung`

**Entscheidung: beibehalten.** Letzten Lauf und belegtes externes Ziel getrennt ausweisen; unbekannte Sicherungsbestandteile nicht als erfolgreich darstellen.

Aufgabe: Datensicherung.

[Screenshot Desktop](../bilder/153-sicherung-desktop.jpg) · [Tablet](../bilder/153-sicherung-tablet.jpg) · [Handy](../bilder/153-sicherung-mobil.jpg) · [Galerie](../galerie.html#sicherung) · [Prototyp](../index.html#sicherung)

## Bei der Umsetzung erhalten

- Erfolg/unbekannt/überfällig unterscheiden
- Externes Ziel nicht aus erfolgreichem Lauf ableiten
- Fotos/Dateien separat nachweisen
- Kein Restore-Knopf ohne bestehende Funktion
- Exportgrenzen und Teilfehler

## Aktionen im Entwurf

- Sicherung jetzt erstellen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/settings/SicherungView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/settings/SicherungView.tsx)
- [src/features/settings/LaufStatus.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/settings/LaufStatus.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
