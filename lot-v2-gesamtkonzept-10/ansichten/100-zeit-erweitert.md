# 100 · Erweiterte Zeiterfassung

Zeit · Vorschaurolle: Geschäftsführung · `zeit-erweitert`

**Entscheidung: neu geordnet.** Vollständige Erfassung nach denselben Gruppen wie beim Monteur; aktive Zuschläge nicht in eingeklappten Pflichtangaben verstecken.

Aufgabe: Erweiterte Zeiterfassung.

[Screenshot Desktop](../bilder/100-zeit-erweitert-desktop.jpg) · [Tablet](../bilder/100-zeit-erweitert-tablet.jpg) · [Handy](../bilder/100-zeit-erweitert-mobil.jpg) · [Galerie](../galerie.html#zeit-erweitert) · [Prototyp](../index.html#zeit-erweitert)

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
