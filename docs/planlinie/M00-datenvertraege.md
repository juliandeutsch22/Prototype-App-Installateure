# M00 — Datenverträge und Migrationsverfahren (Verbindlich ab M01)

Stand: 2026-11-06. Gilt für alle Pakete; je Paket wird der konkrete Schemaentwurf gegen das zusammengesetzte aktuelle Schema (228 Migrationen) geprüft.

## 1. Schreibbefehle (kritische Aktionen)

- Serverseitig, an vorhandene atomare RPCs angebunden. Kein Command-Bus-Neubau.
- Befehl = Zielkennung + erwartete Revision + typisierte Aktion + stabile Vorgangskennung (UUID vom Aufrufer) + geprüfte Werte + Grund bei Korrektur/Übersteuerung.
- Ablauf: Sitzung/Mandant (`app.lesebetrieb()`) → sperren → Stand prüfen → validieren → atomar schreiben → Journal + Integrationsereignis in derselben Transaktion → Ergebnis.
- Idempotenz: (company_id, vorgangskennung) eindeutig; gleicher Payload → bestehendes Ergebnis; gleiche Kennung + anderer Payload → Konflikt (Fachfehler). Kein „exactly once“ über Netz behaupten.
- Unklarer Ausgang: Status der Vorgangskennung abfragen, niemals blind neue Kennung.
- SQL + Storage nicht transaktional: Zwischenzustände `fachlich_gespeichert` / `dokument_fehlgeschlagen` mit Nachholjob; keine Nummern-/Bestandsrücknahme bei PDF-Fehler.

## 2. Änderungsjournal (M01, U04/K06)

- Tabelle `aenderungsjournal`: nur serverseitig über `security definer`-Funktion; kein Client-Insert/Update/Delete (wie `zeitbuchung_verlauf`, E50).
- Felder: Betrieb, Objekttyp/-kennung, Aktion, Akteur (Kennung + Name zum Zeitpunkt), Serverzeit (`clock_timestamp()`), fachlicher Grund, Vorgangskennung, geänderte Inhalte (alt/neu je Feld, wo sinnvoll).
- Bestehende Verläufe (zeitbuchung_verlauf, Lagerbewegungen, Wartungsausführungen, Supportprotokoll) bleiben führend in ihrem Fachbereich und werden in der Journalansicht **eingeblendet**, nicht dupliziert.
- Lesen: wie das jeweilige Fachobjekt; Ausgangsregel M01: Führung/Buchhaltung (`app.ist_buch_oder_spitze()`), Support nie (`app.support_niemals()`).

## 3. Kennungen, Snapshots, Herkunft

- Stabile IDs getrennt von sichtbaren Nummern; `company_id` (text) unverändert; mandantenkonsistente FKs.
- Ausgestellte Dokumente = unveränderliche Snapshots (Adresse, Steuersatz, Artikeltexte, Preise). Mutable Stammdaten referenzieren, belegrelevante Inhalte beim Ausstellen einfrieren.
- Herkunft je Zeile: manuell / Importlauf / Lieferantenposition / Quelldatei / Herkunftsleistung. „Unbekannt“ ist zulässiger Migrationszustand.

## 4. Mengen und Geld (invariant)

- K02: physische Deckung und termingerechte Prognose getrennt; Fehlmenge = max(0, Bedarf − einmalig gezählte Deckung); fremde Reservierungen/verspätete Zugänge zählen nie.
- E10: Umlagerung mengenneutral + atomar; bestellt ≠ zugesagt ≠ physisch vorhanden.
- M12: Summe bestätigter Zuordnungen je Umsatz ≤ Umsatzbetrag (Server-Constraint).
- M13: eine Quelle höchstens einmal in ausgestellten Rechnungen (Entwurfsreservierung + eindeutiger ausgestellter Bezug).
- Geld/Rundung ausschließlich über bestehende Rechnungsmathematik; Zeitzone Europe/Vienna.

## 5. Migrationsverfahren je Änderung

1. Neue additive Migration, Dateiname `YYYYMMDDHHMMSS_bereich.sql`, Kommentarkopf im Bestandsstil (Was fehlte / Was sich ändert / Altdaten / Datenschutz).
2. Backfill mit „unbekannt“, nie erfundene Verifikation/Freigabe/Zahlung.
3. Alte PWA-Versionen: neue Pflicht nur serverseitig mit Nachpflege-/Klärzustand; keine harten Brüche für Altclients.
4. Rücknahme: neue Migration kann deaktiviert werden, ohne Daten zu löschen; Modul-/Feature-Voreinstellungen migrieren mit unverändertem Verhalten.
5. DB-Test (`vitest.supabase.config.ts`) je neuer Regel: positiv, negativ (fremder Mandant, fehlendes Recht, direkter Schreibzugriff), erhaltend.
