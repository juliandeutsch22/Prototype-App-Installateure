# M00 — Bestandsmatrix (84 IDs + N01/N02)

Stand: 2026-11-06 · main `b1e00cc` · Zielumfang: **empfohlener Zielumfang** (Auftraggeberentscheidung 2026-11-06, Entscheidungsregister E-001).

Lesart: „Anker“ = tatsächlich gelesene bzw. in der Vorplanung (`62db192`) verifizierte Anschlussstelle. **Vor Beginn jedes Pakets wird die Zeile am dann aktuellen main erneut geprüft.** „Neu“ = kein gleichwertig durchgängiger Ablauf gefunden — kein behaupteter Defekt. Rollen gemäß `src/lib/permissions.ts`; harte Durchsetzung = RLS.

| ID | Funktion | Empfehlung | Bestand / Anker (Code, SQL) | Paket |
|---|---|---|---|---|
| A01 | Auftragsübersicht mit Bearbeitungsphasen | Ändern | dashboard/assignments; Auftragslisten in projects | M07 |
| A02 | Aufträge auf dem Board verschieben | Integrieren | assignments (Planungsbefehle) | M07 |
| A03 | Eingangsauftrag ohne Angebot | Behalten | customers/, projects/, db/pg/projects.ts | M02 |
| A09 | Liegenschaften, Tops und Beteiligte | Integrieren | customers/, projects/ (Objektmodell neu) | M02 |
| A11 | strukturierte Eingangsaufträge | Integrieren | customers/, projects/ | M02 |
| A06 | Angebotsannahme per Link und Unterschrift | Integrieren | quotes/angebotAnnehmen.ts, db/pg/quotes.ts | M02 |
| E01 | parallele Großhändlerkataloge | Behalten | datanorm.ts, materials/datanorm.ts | M03 |
| E04 | Einkaufspreisverlauf und Warnungen | Integrieren | material_prices, datanorm.ts | M03 |
| E05 | Katalogversion kontrolliert aktivieren | Integrieren | datanorm.ts (Versionszeiger neu) | M03 |
| E06 | veraltete Katalogstände | Integrieren | datanorm.ts | M03 |
| E07 | Verkaufs- und Aufschlagsregeln | Integrieren | datanorm.ts, quotes Kalkulation | M03 |
| E02 | verifizierter Einkaufspreisvergleich | Integrieren | datanorm.ts (Identität neu) | M03 |
| E03 | günstigsten vergleichbaren Preis kennzeichnen | Integrieren | datanorm.ts | M03 |
| A07 | Zielpreiskalkulation | Integrieren | costing/, db/pg/kosten.ts | M03 |
| A08 | Angebotsentwürfe nach Einkaufspreisen nachrechnen | Integrieren | quotes/fassungen.ts, datanorm Preisstände | M03 |
| G06 | Preisänderungsregel | Integrieren | quotes/, datanorm.ts | M03 |
| E10 | Lagerorte und Fahrzeuglager | Integrieren | materials.ts, stock/Lagerbewegungen | M04 |
| E11 | scannergestützte Kommissionierung | Integrieren | materials.ts, LagerDialoge.tsx | M04 |
| E12 | scannergestützte Inventur | Integrieren | materials.ts (Inventur-Bestand) | M04 |
| E13 | Materialampel | Integrieren | einsatzMaterial.ts, ruestFehlmenge.ts | M04 |
| E14 | regelbasierte Bestellvorschläge | Integrieren | einkauf.ts, ruestFehlmenge.ts | M04 |
| E16 | Restmaterial zurückgeben oder abrechnen | Integrieren | materials.ts (Retoure-Bestand) | M04 |
| G03 | Fehlbestandsvorschlag | Integrieren | einsatzMaterial.ts, einkauf.ts | M04 |
| E08 | Lieferantenangebote gegenüberstellen | Integrieren | einkauf.ts | M05 |
| E09 | Preisanfrage an mehrere Lieferanten | Integrieren | einkauf.ts (Anfrage neu) | M05 |
| R01 | eigenständiger Kundenlieferschein | Integrieren | orders/bestellungPdf.ts (Kundenlieferschein neu) | M05 |
| R02 | Teillieferung und Restmengen | Integrieren | einkauf.ts | M05 |
| R03 | Lieferscheinbewegung und Storno | Integrieren | materials.ts, Lagerbewegungen | M05 |
| Z01 | Korrekturantrag für Zeitbuchung | Integrieren | timeEntries.ts, zeitbuchungVerlauf.ts | M06 |
| Z02 | zusätzliche Durchrechnungs-/Ausgleichsmodelle | Integrieren | arbeitszeitGrenzen.ts, monatsbilanzen.ts | M06 |
| Z03 | Schlechtwetter, Fahrzonen und Zulagen | Integrieren | timeEntries.ts (Zulagen neu) | M06 |
| B02 | durchgehender Start-/Stopp-Ablauf | Integrieren | time/, db/pg/timeEntries.ts; Offline E49 | M06 |
| Z04 | optionales automatisches Ausstempeln | Optional | timeEntries.ts (Timer) | M06 |
| Z05 | Qualifikationen und Erinnerungen | Integrieren | users.ts (Qualifikationen neu) | M07 |
| B05 | Aufgaben | Integrieren | projects/ (Aufgaben neu) | M07 |
| B06 | Planung per Drag-and-drop | Integrieren | assignments/, db/pg/assignments.ts | M07 |
| B07 | Ersatzkräfte vorschlagen | Integrieren | assignments/, abwesenheiten.ts | M07 |
| B08 | Qualifikations-/Materialhinweise beim Einteilen | Integrieren | assignments/ + einsatzMaterial.ts | M07 |
| B04 | Arbeitsvorbereitung mit Freigaben | Integrieren | assignments/ (Freigaben neu) | M07 |
| G10 | Konflikte und Ersatzkräfte | Integrieren | assignments/, abwesenheiten.ts | M07 |
| A04 | Meilensteine und Zahlungsplan | Integrieren | invoices (Anzahlung/Teil/Schluss) | M07 |
| B03 | digitale Besichtigung | Integrieren | baustellenDokumente.ts (Besichtigung neu) | M08 |
| A05 | ÖNORM A 2063: Import, Kalkulation und Export | Integrieren | quotes/fassungen.ts (LV-Struktur neu) | M08 |
| R10 | Aufmaß in Rechnung übernehmen | Integrieren | invoices/assemble.ts (Aufmaß neu) | M08 |
| W01 | Wartungs-/Prüfchecklisten | Integrieren | wartungen.ts, maintenance/ | M09 |
| W02 | Abweichungen von Prüfwerten | Integrieren | wartungen.ts (Prüfwerte neu) | M09 |
| W03 | Prüfbericht als PDF | Integrieren | wartungen.ts, jsPDF-Belegwege | M09 |
| W04 | Wartungsabrechnung vormerken | Integrieren | invoices/wartungPosition.ts | M09 |
| W05 | Wartungsvereinbarung online unterschreiben | Integrieren | wartungen.ts + A06-Annahmevertrag | M09 |
| W06 | Fuhrpark und Fristen | Integrieren | Fuhrpark neu, Fahrzeugkennung mit E10 | M09 |
| W07 | Fahrtenbuch und Kilometer | Optional | Fuhrpark neu | M09 |
| W08 | Maschinen und Geräte | Integrieren | Betriebsmittel neu | M09 |
| G11 | nächste Wartung | Integrieren | wartungen.ts, features/maintenance/ | M09 |
| B01 | „Mein Tag“ | Integrieren | dashboard/start/HeuteEigene.tsx | M10 |
| B09 | projektbezogener Chat und Direktnachrichten | Integrieren | plattform/ (Chat neu), FCM | M10 |
| B10 | Bautagesbericht | Integrieren | worksheets/, workSheets.ts | M10 |
| B11 | Arbeitsbericht aus vorhandenen Daten | Integrieren | worksheets/, invoices/assemble.ts | M10 |
| B12 | Mängelverfolgung | Integrieren | projects/ (Mängel neu) | M10 |
| B13 | Abnahme mit Signaturen | Integrieren | worksheets/ + E49 Offline-Signatur | M10 |
| B15 | SharePoint-Dokumentanbindung | Optional | baustellenDokumente.ts (SharePoint-Adapter neu) | M10 |
| R06 | Eingangsrechnungsverwaltung | Integrieren | invoices.ts (Eingangsbelege neu) | M11 |
| R07 | Rechnung, Bestellung und Wareneingang abgleichen | Integrieren | einkauf.ts + materials.ts (Wareneingang) | M11 |
| R08 | Dublettenwarnung | Integrieren | invoices.ts (Eingang neu) | M11 |
| R09 | Kontierungsvorschläge | Integrieren | konten.ts (Kanzleiprofil neu) | M11 |
| E15 | Lieferantenrechnungsabgleich | Integrieren | einkauf.ts (Abgleich neu) | M11 |
| G09 | Rechnungsduplikatregel | Integrieren | invoices.ts (Eingang neu) | M11 |
| R04 | CAMT-Import | Integrieren | zahlungen.ts (CAMT neu) | M12 |
| R05 | Zahlungszuordnungsvorschläge | Integrieren | zahlungen.ts, offenePosten.ts | M12 |
| G08 | Bankzuordnung | Integrieren | zahlungen.ts | M12 |
| G07 | Skonto-/Fälligkeits-Erinnerung | Integrieren | zahlungen.ts, basiszins.ts, offenePosten.ts | M12 |
| G01 | offene Regie und gültige Scheine finden | Ändern | invoices/assemble.ts, ausgegebenesMaterial.ts | M13 |
| G02 | Rechnungsvorschau vorbereiten | Integrieren | invoices/assemble.ts | M13 |
| G04 | Mehrmengenhinweis bei Schlussrechnung | Integrieren | invoices/assemble.ts | M13 |
| G05 | Budgetwarnung | Integrieren | costing/, projects/ | M13 |
| A10 | Sammelabrechnung | Integrieren | invoices/assemble.ts | M13 |
| B14 | Kosten-/Deckungsbeitragsprognose | Integrieren | costing/, kosten.ts, monatsbilanzen.ts | M13 |
| R11 | Arbeitsberichte mit Rechnungen verbinden | Integrieren | workSheets.ts + invoices/assemble.ts | M13 |
| R12 | Zahlungserinnerung/Mahnung direkt versenden | Integrieren | offenePosten.ts (Versandadapter neu) | M14 |
| U03 | automatischer Wochenbericht | Integrieren | offenePosten.ts (Wochenbericht neu) | M14 |
| U01 | anpassbare Startseite | Integrieren | dashboard/, prefs.ts | M15 |
| U02 | Menüfolge und Favoriten | Integrieren | app/navigation.ts, NaviLot.tsx, prefs.ts | M15 |
| U04 | detailliertes Änderungsprotokoll | Integrieren | zeitbuchungVerlauf.ts (E50), Lager-/Wartungsverläufe | M01 |
| U05 | ausgewählte Ansichten und Versand protokollieren | Integrieren | support.ts, fehlerprotokoll.ts (Ereignisprotokoll neu) | M01 |
| U06 | Papierkorb für zulässige Entwürfe | Integrieren | 20261104100000_schein_entwurf_loeschen.sql | M01 |

## Ergänzungen

| ID | Inhalt | Anker | Paket |
|---|---|---|---|
| N01 | Frei konfigurierbare Zeitfelder (Pflicht/Bedingungen/Versionen) | `timeEntries.ts`, `zeitbuchungVerlauf.ts` (E50), `felder.ts`, `spaltentypen.ts` | M06 |
| N02 | Durchgängige Modul-/Unterfähigkeitenschalter | `src/lib/module.ts` (9 Module), `app/navigation.ts`, Trigger `companies_einstellungen` | M01 + alle |

## Delta 62db192 → b1e00cc

- E48 `659f7fd`: Plattform Lot-Linie, verborgene Akten-Reiter → UI-Muster in M02/M07 erneut prüfen.
- E49 `4d10245`: Handwerksschein offline (Fotos, Signatur) → B02/B13 und Offline-Matrix daran anschließen.
- E50 `b1e00cc`: `zeitbuchung_verlauf` → M01-Journal integriert diesen Verlauf (kein zweites Zeitprotokoll).