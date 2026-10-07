# Abnahme — Paket „scheine“ (E6 Liste der Handwerksscheine, E8 Schein)

```text
Schritt:            E6 – Handwerksscheine (Liste) · E8 – Schein (Formular, am Handy Schrittfolge mit Kundenmodus)
Stand / Tag:        Arbeitsbaum des Pakets „scheine“ auf ui-lot (Commit siehe Bericht)
Bestandsvergleich:  63 Elemente in docs/ui-umbau/zuordnung-scheine.json, 63 zugeordnet, 0 offen;
                    weg_neu − weg_alt ≤ 1 bei jedem Eintrag (siehe „Offen“ zum Storno eines verrechneten Scheins)
Rechte:             unverändert — „Neuer Schein“ nur canWriteWorkSheet (Test P4-04), Weiterbearbeiten/
                    Verwerfen/Wieder aufnehmen nur darfDiesen (P3-10), Stornieren nur isGF, „Stunden ohne
                    Buchung“ nur canEditTime; Gruppe „Nicht verrechnet“ nur canInvoice (dieselben Rollen,
                    denen die Startseite „Nicht verrechnet“ zeigt). Gegenproben in den Komponententests.
Prüfungen:          tsc grün · lint grün · WorkSheetsListView 55/55 · WorkSheetView 80/80 · scheinRollen grün
                    Browser-Wege Chromium/WebKit: OFFEN (nicht ausgeführt, Vorgabe des Auftrags)
                    Zeitraffer: OFFEN
Breiten:            390 / 834 / 1440 in der Vorschau (Port 5218), hell und dunkel — kein seitliches Überlaufen;
                    834 quer: OFFEN
Belege/Exporte:     worksheetPdf.ts unberührt; Prüfsummen-Vergleich: OFFEN (nicht ausführbar ohne Testbestand)
Mengengerüst:       Vorschau mit 29 Scheinen angesehen (Gruppen ≤ 20, „und N weitere“); Messung: OFFEN
Bedienbarkeit:      Segmente mit aria-pressed, Seitenfenster als Dialog mit Fokusfalle (BottomSheet),
                    Einsatz-Auswahl mit aria-pressed, Warnung am Notizfeld per aria-describedby; axe: OFFEN
Rückgängig:         keine neue Rückgängig-Meldung; Bestätigungen unverändert (Verwerfen-Rückfrage, Storno mit Pflichtgrund)
Fehlerprotokoll:    keine Laufzeitfehler in der Vorschau
Bildschirmfotos:    nur im Arbeitsbereich angesehen, nicht eingecheckt — OFFEN für docs/ui-umbau/nachher/
Dokumentation:      Handbuch und FUNKTIONEN.md: OFFEN (Hauptsitzung)
Freigabe Betreiber: offen                 Datum: __________
```

## Was sich geändert hat

**Liste (E6)**

- Seitenkopf mit „Neuer Schein“ als Hauptaktion (am Handy im Daumenbereich) und einer Einleitung in
  „Hilfe zu dieser Seite“.
- Suche über der Liste, daneben die Segmente „Offen | Alle“ (Adresse: `?ansicht=`). „Offen“ ist
  Standard: Entwürfe, für Rollen mit Rechnungen zusätzlich „Nicht verrechnet“ (älteste zuerst),
  auf Wunsch „Verworfen“. Die Suche geht über alle Scheine; solange gesucht wird, sind die Segmente
  ausgeblendet. Mit `markiert` (nach dem Unterschreiben, von der Startseite) steht die Liste in
  „Alle“ und das Fenster des Scheins ist offen.
- Ganze Zeile öffnet den Schein im Seitenfenster (Handy: Blatt von unten) mit allen Angaben und
  allen Aktionen; in der Zeile bleibt genau ein Schritt (Weiterbearbeiten, Wieder aufnehmen, sonst
  PDF). Der Storno mit Pflichtgrund steht im Fenster statt in einer Karte unter der Liste.
- Gruppen höchstens 20 Zeilen, dann „und N weitere anzeigen“; „Weitere Scheine laden“ unverändert.

**Schein (E8)**

- Eine Spalte, höchstens 560 px; Seitenkopf mit Ortszeile und Hilfe.
- Schrittfolge, Zusammenfassung, Unterschriften (Kundenmodus) und Aktionsleiste im Daumenbereich
  unverändert; am Schreibtisch Fusszeile „Als Entwurf speichern | Unterschreiben und abschließen“.
- Hinweise höchstens eine Zeile (Pauschal/Einheitspreis, zweiter Schein am Tag), der volle Text
  hinter dem „i“ bzw. in der Seitenhilfe. Am Notizfeld bleibt die Warnung zur Gesundheit als eine
  sichtbare Zeile.
- Zeitzeilen als Zeilen der Linie; Einsatz-Auswahl mit Petrol-Rand statt Vollfläche.

## Offen / ehrlich benannt

- **Storno eines schon verrechneten Scheins:** vorher 1 Klick in der Zeile, jetzt „Alle“ → Zeile →
  „Stornieren“. Die zusätzliche Stufe „Alle“ ist die Folge von Regel 7.1 (Arbeitsstand als Standard);
  innerhalb einer Ansicht ist der Weg +1. Gleiches gilt fürs PDF eines unterschriebenen Scheins für
  den Monteur (Ansicht „Alle“ oder Suche). Zur Entscheidung des Betreibers.
- Rollen mit Rechnungen holen in „Offen“ jetzt beim Öffnen 60 statt 50 Scheine und fragen ab, welche
  davon verrechnet sind (dieselbe Abfrage und Zahl wie Startseite und Rechnungen).
- In der Vorschau liefert der Stub `scheineAufRechnung` nichts (NOOP); für die Fotos wurde der
  erzeugte, nicht eingecheckte Stub vorübergehend auf `[]` gesetzt.
- Der Test „ergibt in Schritten und auf einer Seite denselben Beleg“ lief unter Last (neun Pakete
  parallel) schon vor dem Umbau über 5 s hinaus; mit `--testTimeout=20000` grün.
