# 099 · Zeit erfassen

Zeit · Vorschaurolle: Verwaltung · `zeit-buero`

**Entscheidung: beibehalten.** Kurze Büroerfassung ohne unnötige Baustellen- und Zuschlagsfelder erhalten; dieselbe verständliche Dauerrückmeldung verwenden.

Aufgabe: Zeit erfassen.

[Screenshot Desktop](../bilder/099-zeit-buero-desktop.jpg) · [Tablet](../bilder/099-zeit-buero-tablet.jpg) · [Handy](../bilder/099-zeit-buero-mobil.jpg) · [Galerie](../galerie.html#zeit-buero) · [Prototyp](../index.html#zeit-buero)

## Bei der Umsetzung erhalten

- Alle Rollen eigene Zeit
- Monteur immer volle Erfassung
- Büro keine unnötigen Baustellen-/Zuschlagsfelder
- Leitung kann erweitern
- Jugendliche/Unterricht/Nachtzeitregeln
- Abwesenheiten stunden-/tageweise

## Formularfelder im Entwurf

- Datum
- Status
- Von
- Bis
- Pause (Min.)
- Kommentar

## Aktionen im Entwurf

- Zeit buchen
- Meine Einträge

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/time/TimeView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/time/TimeView.tsx)
- [src/features/time/TimeForm.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/time/TimeForm.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
