# 217 · Zeit für Mitarbeiter erfassen

Zeit · Vorschaurolle: Buchhaltung · `zeit-person`

**Entscheidung: ergänzt.** Bedingten Arbeitszustand bzw. getrennte Aufgabe explizit zeigen, ohne vorhandene Ansicht umzudeuten.

Aufgabe: Zeit für Mitarbeiter erfassen.

[Screenshot Desktop](../bilder/217-zeit-person-desktop.jpg) · [Tablet](../bilder/217-zeit-person-tablet.jpg) · [Handy](../bilder/217-zeit-person-mobil.jpg) · [Galerie](../galerie.html#zeit-person) · [Prototyp](../index.html#zeit-person)

## Bei der Umsetzung erhalten

- Zielperson ausdrücklich wählen
- Aus Personendetail: Person und Tag vorbelegen
- Fremdbuchung nach tatsächlichen Korrekturrechten
- Arbeitszeitgrenzen, Lehrlingsschutz und Doppelbuchung serverseitig erhalten

## Formularfelder im Entwurf

- Mitarbeiter
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

- [src/features/accounting/AccountingView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/accounting/AccountingView.tsx)
- [src/features/time/TimeForm.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/time/TimeForm.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
