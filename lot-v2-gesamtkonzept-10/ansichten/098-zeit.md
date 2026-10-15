# 098 · Zeit erfassen

Zeit · Vorschaurolle: Mitarbeiter · `zeit`

**Entscheidung: neu geordnet.** Einsatz/Tag, Arbeitszeit und weitere Angaben gruppieren; Dauer direkt an Von/Bis/Pause zeigen und lokale Eingaben erhalten.

Aufgabe: Zeit erfassen.

[Screenshot Desktop](../bilder/098-zeit-desktop.jpg) · [Tablet](../bilder/098-zeit-tablet.jpg) · [Handy](../bilder/098-zeit-mobil.jpg) · [Galerie](../galerie.html#zeit) · [Prototyp](../index.html#zeit)

## Bei der Umsetzung erhalten

- Alle Rollen eigene Zeit
- Monteur immer volle Erfassung
- Büro keine unnötigen Baustellen-/Zuschlagsfelder
- Leitung kann erweitern
- Jugendliche/Unterricht/Nachtzeitregeln
- Abwesenheiten stunden-/tageweise

## Formularfelder im Entwurf

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

## Aktionen im Entwurf

- Zeit buchen
- Meine Einträge
- Auf Baustellen aufteilen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/time/TimeView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/time/TimeView.tsx)
- [src/features/time/TimeForm.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/time/TimeForm.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
