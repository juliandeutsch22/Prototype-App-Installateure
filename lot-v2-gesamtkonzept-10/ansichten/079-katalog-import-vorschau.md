# 079 · Katalogimport prüfen

Lager · Vorschaurolle: Administrator · `katalog-import-vorschau`

**Entscheidung: beibehalten.** Probelauf mit verständlichen Ausnahmen vor Übernahme erhalten; Feldmapping und nicht verstandene Zeilen bleiben erreichbar.

Aufgabe: Katalogimport prüfen.

[Screenshot Desktop](../bilder/079-katalog-import-vorschau-desktop.jpg) · [Tablet](../bilder/079-katalog-import-vorschau-tablet.jpg) · [Handy](../bilder/079-katalog-import-vorschau-mobil.jpg) · [Galerie](../galerie.html#katalog-import-vorschau) · [Prototyp](../index.html#katalog-import-vorschau)

## Bei der Umsetzung erhalten

- Freigabe katalogEinspielen
- Lieferant wählen
- Mapping abweichender Felder
- Vorschau/Probelauf/Übernahme getrennt
- Resultat neu/aktualisiert/ausgelaufen/ohne Preis

## Aktionen im Entwurf

- Gültige Artikel übernehmen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/materials/KatalogImport.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/materials/KatalogImport.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
