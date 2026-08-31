# Roadmap

Stand: 31.08.2026. Reihenfolge nach Nutzen für den Betrieb, nicht nach
Aufwand. Was den Produktivbetrieb blockiert, steht oben.

---

## Wartet auf eine Entscheidung

### Lager und Warenwirtschaft

**Offene Frage: Führt Perl bereits ein Warenwirtschafts- oder
Handwerkerprogramm, in dem das Material gepflegt ist?**

Die Antwort entscheidet den ganzen Zuschnitt:

- **Kein System vorhanden** → die App wird führend. Dann braucht es
  Wareneingang buchen (heute überschreibt man die Bestandszahl von Hand),
  eine Bewegungshistorie (wer hat wann was entnommen) und eine eigene
  Lageransicht.
- **System vorhanden** → keine zweite Bestandsführung aufbauen. Zwei
  Bestände laufen unweigerlich auseinander, und dann glaubt niemand mehr
  einem von beiden. Stattdessen: Artikelstammdaten importieren, Bestände
  lesend anzeigen, gebucht wird im Hauptsystem.

Mögliche Wege je nach System: **Datanorm** (Dateiformat für
Artikelstammdaten, im Handwerk verbreitet), **IDS-Connect** (Online-Anbindung
an den SHK-Großhandel) oder schlicht ein CSV-Import.

**Unabhängig davon schon jetzt sinnvoll:** Der Materialkatalog ist heute als
vierter Reiter unter „Bestellungen" versteckt. Niemand vermutet die
Lagerverwaltung dort. Eigener Navigationspunkt, unabhängig von der
Systemfrage.

---

## Als Nächstes

### Dashboard: von Zahlen zu Handlungen

Heute zeigt es Kennzahlen zum Anschauen („Aktive Baustellen: 3") und
darunter einen Schnellzugriff, der auf dem Desktop die komplette Sidebar
dupliziert. Ziel ist die eine Frage pro Rolle:

| Rolle | Die Frage | Was hingehört |
| --- | --- | --- |
| Monteur | Wo muss ich heute hin? | Einsatz mit Adresse **und Telefonnummer**, fehlende Buchung |
| Geschäftsführung | Läuft eine Baustelle aus dem Ruder? | Projekt-Radar, aber nur gelb/rot |
| Buchhaltung | Was ist überfällig? | Rechnungen mit Betrag statt Anzahl |
| Verwaltung | Was wartet auf mich? | Offene Materialanforderungen als Liste |

Grundregel gegen beide Gefahren: **Was leer ist, verschwindet.** Karten nur
mit Inhalt zeigen; ist nichts zu tun, eine ruhige Zeile statt fünf leerer
Kacheln.

### Überstundensaldo bei Einführung mitten im Jahr

`calcOverallSaldo` rechnet das Soll für jeden Werktag ab `appStartDate` —
auch für Tage, an denen nichts erfasst wurde. Wer die App im August einführt
und als Startdatum den 1. Jänner einträgt, sieht sofort **−1300 Stunden** je
Mitarbeiter.

Die Zahl ist rechnerisch korrekt und in der Sache Unsinn. Sie steht an der
prominentesten Stelle der App, und sie ist das Erste, was die
Geschäftsführung sieht. Nötig: Startdatum per Vorgabe auf den Tag der
Kontoanlage, plus ein Hinweis, wenn zwischen Startdatum und heute Tage ganz
ohne Buchung liegen.

### Offline-Betrieb

Firestore läuft ohne aktivierte Persistenz. Im Keller, im Rohbau oder in der
Tiefgarage steht der Monteur damit vor einer leeren App, und eine Buchung
schlägt fehl statt sie nachzureichen. Für die Zielgruppe ist das kein
Randfall, sondern Alltag.

### Navigation und Beschriftungen

- „Bestellungen" enthält den Materialkatalog — umbenennen oder trennen
- Beschriftungen werden mobil abgeschnitten („Zeiterfassu…")
- Zeiterfassung: Schnellwahl („wie gestern", „07:00–16:30") statt jedes Feld
  einzeln zu tippen — mit Arbeitshandschuhen zählt jeder gesparte Griff

---

## Später

- **Lehrlingssatz**: bewusst entfernt, weil kein Eintrag und kein Nutzer die
  Qualifikation trägt. Sauberer Weg wäre eine Qualifikation am Benutzer plus
  ein dritter Abrechnungstopf.
- **Exporte um Zuschläge erweitern**: Nacht- und Notdienststunden erscheinen
  noch nicht als eigene Spalten in den Lohn-CSVs.
- **Mehrmandantenfähigkeit praktisch erproben**: technisch vorhanden und
  durch Rules-Tests belegt, aber noch nie mit einem zweiten echten Betrieb
  gelaufen.

---

## Bekannte Lücken

Gefunden bei früheren Durchsichten, bisher nicht behoben. Keine davon
blockiert den Betrieb, alle sind echt.

| Thema | Was passiert |
| --- | --- |
| Sprach-Erfassung, Teilschreibungen | Schlägt ein Schreibvorgang mitten in der Bestätigung fehl, bleibt ein halber Datensatz zurück |
| Folgetermine | Werden erfasst und gespeichert, aber nirgends angezeigt |
| Mikrofon | Läuft nach dem Abbrechen der Aufnahme weiter |
| Einsatzplanung | Ändern löscht und legt neu an, ohne Transaktion — bricht es dazwischen ab, ist die Zuweisung weg |
| Rechnungsnummern | Werden aus dem Höchststand abgeleitet; zwei gleichzeitige Rechnungen können dieselbe Nummer bekommen |
| Listen ohne Begrenzung | Zeiteinträge und Bestellungen werden vollständig geladen; nach einigen Jahren wird das langsam und teuer |
| Zeiteintrag bearbeiten | Umgeht die Doppelbuchungsprüfung, die beim Anlegen greift |
