# Roadmap

Stand: 01.09.2026. Reihenfolge nach Nutzen für den Betrieb, nicht nach
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

*(Der Materialkatalog hat inzwischen einen eigenen Navigationspunkt „Lager" —
er hing vorher als vierter Reiter unter „Bestellungen", wo ihn niemand
vermutet. Die Systemfrage bleibt davon unberührt.)*

---

## Erledigt (Stand 01.09.2026)

Hier standen bis zuletzt vier Punkte, die längst umgesetzt sind. Eine
Roadmap, die Erledigtes als offen führt, schickt den Nächsten in die Irre —
deshalb wandern sie hierher statt still zu verschwinden:

- **Dashboard von Zahlen zu Handlungen** — je Rolle die eine Frage, leere
  Karten verschwinden
- **Überstundensaldo bei Einführung mitten im Jahr** — Tage ohne Buchung
  werden gezählt und als Datenlücke ausgewiesen, orange statt rot
- **Offline-Betrieb** — Firestore-Persistenz mit
  `persistentMultipleTabManager`, Rückmeldung beim Speichern ohne Empfang
- **Navigation** — das Lager hat einen eigenen Punkt statt eines versteckten
  vierten Reiters unter „Bestellungen"; „wie zuletzt" in der Zeiterfassung

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

Die drei Sprach-Punkte sind heute nicht erreichbar: `voiceExtract` wird nur
mit `ENABLE_VOICE=true` deployt und ist aus. Sie werden fällig, BEVOR die
KI-Erfassung eingeschaltet wird — nicht vorher.

| Thema | Was passiert |
| --- | --- |
| Sprach-Erfassung, Teilschreibungen | Schlägt ein Schreibvorgang mitten in der Bestätigung fehl, bleibt ein halber Datensatz zurück |
| Folgetermine | Werden erfasst und gespeichert, aber nirgends angezeigt |
| Mikrofon | Läuft nach dem Abbrechen der Aufnahme weiter |
| Listen ohne Begrenzung | Zeiteinträge werden weiterhin vollständig geladen. Rechnungen sind auf 50 mit „Weitere anzeigen" begrenzt, Bestellungen ebenso |

## Offen: Team-Salden auf der Startseite

Die Startseite berechnet den Saldo jedes Mitarbeiters aus den ROHEN
Zeiteinträgen — der Saldo läuft seit dem Eintrittsdatum, ist also
naturgemäß unbegrenzt. Bei zwanzig Monteuren über drei Jahre sind das
gut 13.000 Dokumente bei jedem Aufruf.

Zwei Grenzen sind bereits gezogen und korrekt, helfen aber nur in
bestimmten Fällen:

- Das Projekt-Radar lädt gar nichts mehr, wenn keine aktive Baustelle ein
  Stundenbudget hat. Wirksam für die Projektleitung; bei der
  Geschäftsführung lädt der Team-Block ohnehin.
- Die Team-Salden laden erst ab dem frühesten Eintrittsdatum. Wirksam,
  sobald ein Betrieb Vorgeschichte hat, die vor der App liegt.

Gegen die Emulatoren war KEIN Unterschied messbar (143,3 kB vorher wie
nachher) — alle Testdaten liegen im laufenden Jahr, und beide Grenzen
greifen dort nicht. Das ist ehrlich so festzuhalten, nicht als Erfolg zu
verbuchen.

Der eigentliche Fix ist ein GEPFLEGTER Zwischenstand statt einer
Neuberechnung: ein Dokument je Mitarbeiter mit geleisteten Minuten und
gebuchten Tagen, von einem Firestore-Trigger bei jedem Schreiben auf
`timeEntries` fortgeschrieben. Die Startseite liest dann zwanzig kleine
Dokumente statt dreizehntausend.

Das ist bewusst NICHT nebenbei gemacht: es braucht einen Trigger, eine
Nachberechnung für den Bestand und eine Antwort auf die Frage, was
passiert, wenn der Zwischenstand einmal auseinanderläuft (Neuaufbau von
Hand? Nächtlicher Abgleich?). Ein falscher Saldo, den niemand mehr
gegenrechnen kann, ist schlimmer als ein langsamer richtiger.
