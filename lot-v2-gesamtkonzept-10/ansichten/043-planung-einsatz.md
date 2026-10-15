# 043 · Einsatz planen

Planung · Vorschaurolle: Geschäftsführung · `planung-einsatz`

**Entscheidung: Lücke geschlossen.** Mannschaft als Mehrfachauswahl, Helferzuordnung und Rüstliste gemeinsam bearbeiten; vorhandene Einteilung vor dem Speichern übernehmen.

Aufgabe: Einsatz planen.

[Screenshot Desktop](../bilder/043-planung-einsatz-desktop.jpg) · [Tablet](../bilder/043-planung-einsatz-tablet.jpg) · [Handy](../bilder/043-planung-einsatz-mobil.jpg) · [Galerie](../galerie.html#planung-einsatz) · [Prototyp](../index.html#planung-einsatz)

## Bei der Umsetzung erhalten

- Doppelbelegung
- Lehrlinge korrekt einstufen
- Gespeicherte Einteilung bleibt bei Fehler sichtbar

## Formularfelder im Entwurf

- Tag
- Baustelle
- Max Mustermann
- Anton Berger
- Daniel Novak
- Max als Helfer einsetzen
- Beginn (optional)
- Ende (optional)
- Kommentar / Aufgabe

## Aktionen im Entwurf

- Einsatz und Rüstliste speichern
- Material planen
- Einsatz löschen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/assignments/EinsatzFenster.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/assignments/EinsatzFenster.tsx)
- [src/features/assignments/EinsatzFormular.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/assignments/EinsatzFormular.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
