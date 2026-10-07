# Abnahmeblatt — Paket „material“ (E3 Lager, E4 Anforderungen, E5 Material anfordern)

```text
Schritt:            E3 – Lager · E4 – Anforderungen · E5 – Material anfordern
Stand / Tag:        Arbeitsbaum des Pakets „material“ auf ui-lot (Commit siehe Bericht)
Bestandsvergleich:  137 Elemente in docs/ui-umbau/zuordnung-material.json, 137 zugeordnet,
                    0 offen; kein Weg länger als +1. Das Bestandsskript (Abschnitt 2) lief
                    nicht — die Liste ist von Hand aus dem Code erhoben. OFFEN.
Rechte:             unverändert: keine Datenschicht, keine Rolle, keine Route geändert.
                    „Katalog einspielen“ weiter nur mit darfKatalogEinspielen (auch über die
                    Adresse ?reiter=import geprüft, Gegenprobe Verwaltung). Gegenproben über
                    die Schnittstelle: OFFEN (keine Datenbanktests in diesem Paket).
Prüfungen:          tsc grün, lint grün; Komponententests der Seiten 193 grün
                    (OrderView 38, AdminOrdersView 37, StockView 37, MaterialCatalog 24,
                    Einkaufsliste, KatalogImport, AusgelaufenesMaterial, ausgangsfachNaht,
                    einkauf, abschlussText) + lotGrundwerte/katalogLagerAufschlag 27 grün.
                    Browser-Wege Chromium/WebKit, Zeitraffer: OFFEN (nicht ausgeführt,
                    katalogEinspielen.spec.ts nachgezogen).
Breiten:            Vorschau 390 / 834 / 1440 hell, 834 dunkel: kein seitliches Überlaufen
                    (scrollWidth − innerWidth = 0 auf allen drei Seiten, mit offenem
                    Seitenfenster). 834 quer: OFFEN.
Belege/Exporte:     nicht berührt (bestellungPdf.ts, einkauf.ts unverändert); Prüfsummen OFFEN.
Mengengerüst:       Gruppen ≤ 20 mit „und N weitere anzeigen“ (Laufend je Gruppe, Lager,
                    Katalog, Material anfordern, Bewegungen, Artikelwahl). Seitenweise vom
                    Server: nur über die bestehende Abfragegrenze (Nachladen); Messwerte OFFEN.
Bedienbarkeit:      Kästchen mit Namen, Schrittknopf mit „Schritt: Anforderung“, Seitenfenster
                    mit Esc und Fokusfalle (BottomSheet). axe: OFFEN.
Rückgängig:         Einzel- und Sammelaktion OHNE „Rückgängig“ — siehe Lücken. Bestätigungen:
                    Abschluss/Abgeholt, Löschen, Einkaufsliste, Wareneingang, Inventur wie
                    vorher; die Sammelaktion fragt vor Abholungen mit denselben Sätzen.
Fehlerprotokoll:    Vorschau ohne JavaScript-Fehler (nur 404 einer Ressource der Vorschau).
Bildschirmfotos:    docs/ui-umbau/nachher/material/ (Vorschau, Beispieldaten)
Dokumentation:      Handbuch und FUNKTIONEN.md: OFFEN (gemeinsame Dateien, Vorschlag im Bericht)
Freigabe Betreiber: ____________________  Datum: __________   (offen, E5 der Entscheidungen)
```

## Prüfliste „drei Breiten“

- [x] Kein seitliches Überlaufen (390, 834, 1440; Anforderungen, Lager, Katalog, Material anfordern)
- [x] Keine abgeschnittene Beschriftung — Ausnahme: „Schließen“ im Kopf des Seitenfensters
      bricht bei langem Titel um (gemeinsamer Baustein, Änderungswunsch im Bericht)
- [x] Tippflächen ≥ 44 px (keine kleinen Knöpfe verwendet)
- [x] Hauptaktion am Handy im Daumenbereich: „Wareneingang“ (Lager), Warenkorb-Leiste
      (Material anfordern; klebend, ruht vor der Korbkarte und verdeckt dort kein Feld)
- [x] Seitenfenster öffnet und schliesst (Schließen, Esc über BottomSheet)
- [x] Heller Modus Standard; dunkler Modus lesbar (Lager-Seitenfenster bei 834 geprüft)
- [x] Gruppen ≤ 20, „und N weitere“
- [ ] 834 quer, WebKit, echte Geräte — offen

## Lücken (ehrlich offen)

1. **Kein „Rückgängig“ für den nächsten Schritt** (einzeln und gesammelt). „Aus Lager“ setzt
   Beschaffung, Status und `abholbereit_seit` und schickt dem Monteur die Meldung; „Abgeholt“
   zieht den Bestand ab. Keine bestehende Funktion stellt das exakt wieder her.
2. **„Als eilig markieren“ fehlt im Seitenfenster**: die Datenschicht hat keine Funktion, die
   `isUrgent` nachträglich setzt. Keine neue Funktion im Umbau.
3. **Notiz im Seitenfenster nur lesend**: die Notiz schreibt der Monteur beim Anfordern; eine
   Funktion zum Ändern gibt es nicht.
4. **Verlauf aus Zeitstempeln**: angelegt, Einkaufsliste, bestellt, geliefert, abholbereit seit.
   Ein Protokoll jedes Statuswechsels führt die Datenbank nicht.
5. **„Erledigt nach 14 Tagen“ nicht umgesetzt**: Es gibt keinen Zeitstempel des Abschlusses
   (`updated_at` verschiebt sich auch durch spätere Änderungen, etwa die Verrechnung). Erledigtes
   steht wie bisher sofort unter „Erledigt“.
6. **Seitenweise vom Server (50 je Anfrage)**: die Datenschicht kennt nur die Abfragegrenze
   (`subscribeAllOrders(max)`, `subscribeMaterials(grenze)`); „und N weitere“ zeigt mehr vom
   Geladenen, „Weitere … laden“ hebt die Grenze wie bisher. Die Suche bleibt auf das Geladene
   beschränkt (der Hinweis sagt das).
7. **Mindestmengen und Materialaufschlag im ⋯ des Lagers**: es gibt dafür keine Seitenaktion.
   Die Mindestmenge steht je Artikel (Kennzahl im Seitenfenster, Feld im Katalogformular),
   der Materialaufschlag in den Einstellungen. Nicht hinzugefügt, weil es neue Elemente wären.
8. **„Im Lager führen“ als Schritt im Katalog** nicht als eigener Knopf: es ist ein Haken im
   Formular des Artikels (eine Zeile antippen, Haken, Speichern).
