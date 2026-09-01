# Roadmap

Stand: 01.09.2026. Reihenfolge nach Nutzen für den Betrieb, nicht nach
Aufwand. Was den Produktivbetrieb blockiert, steht oben.

---

## Digitaler Handwerksschein (Regiebericht) — Fahrplan

**Bewertung: lohnt sich**, aber nicht wegen der Unterschrift. Der Wert liegt
darin, dass die Kette ZEIT → SCHEIN → RECHNUNG geschlossen wird. Ein Schein,
der nur ein PDF erzeugt und dann nirgends hinführt, ist digitalisiertes
Papier. Regiestunden sind die am häufigsten bestrittene Rechnungsposition;
Zeiten, Material, Baustellen und PDF-Erzeugung liegen bereits vor.

### Offene Voraussetzung (blockiert Stufe 1)

**Wie unterscheidet der Betrieb Regie- von Pauschalarbeit?** Steht das im
Vertrag je Baustelle oder wird es je Einsatz entschieden? Davon hängt ab, ob
es ein Feld an der Baustelle oder am Zeiteintrag wird. Ohne diese
Unterscheidung weiß niemand, welche Stunden überhaupt auf den Schein gehören.
*In Klärung.*

### Bewusst NICHT umgesetzt: biometrische Touch-Daten

Vorgeschlagen waren Schreibgeschwindigkeit und Druckverlauf. Drei Gründe
dagegen:

- **Technisch großteils Fiktion.** `PointerEvent.pressure` liefert auf
  kapazitiven Touchscreens ohne Stift konstant 1.0 oder 0. Ein „Druckverlauf"
  entsteht auf einem normalen Tablet nicht — das Feld sähe aus wie Beweis und
  wäre keiner.
- **Rechtlich teuer.** Zur Identifizierung erhobene Handschrift-Dynamik ist
  biometrisches Datum nach Art. 9 DSGVO: ausdrückliche Einwilligung plus
  Datenschutz-Folgenabschätzung. Beim Kunden an der Tür kaum wirksam
  einzuholen — und bei Ablehnung dürfte er nicht unterschreiben.
- **Nutzen gering.** Der Streitfall ist praktisch nie „die Unterschrift ist
  gefälscht", sondern „so viele Stunden waren das nicht". Dagegen hilft der
  eingefrorene INHALT, nicht die Strichdynamik.

Unterschriftsbild plus Audit-Trail ergeben eine einfache elektronische
Signatur, und die genügt für Rapport- und Arbeitsscheine.

### Zwei Begriffe, präzisiert

- **„Zeitstempel":** ein qualifizierter Zeitstempel nach eIDAS kommt von einem
  Vertrauensdiensteanbieter und kostet. `serverTimestamp()` ist das nicht und
  wird hier auch nicht so genannt. Was wirklich schützt und fast nichts
  kostet: der **Hash des eingefrorenen Inhalts**. Damit lässt sich beweisen,
  dass das vorgelegte PDF genau das ist, was unterschrieben wurde.
- **„PDF/A":** verlangt eingebettete Schriften, XMP-Metadaten und einen
  OutputIntent — mit jsPDF im Browser nicht seriös herstellbar. Es wird ein
  normales PDF erzeugt und auch so genannt.

### Die zentrale Architekturentscheidung

**Der Schein KOPIERT die Zeiteinträge, er referenziert sie nicht.** Die
Buchhaltung kann einen Zeiteintrag nachträglich korrigieren — bei einer
Referenz änderte sich der unterschriebene Schein rückwirkend.

Bemerkenswert im Kontrast zu den Monatsbilanzen: dort wird bewusst NICHT der
abgeleitete Saldo gespeichert, weil er sich mit der Konfiguration ändern
SOLL. Hier wird bewusst der volle Inhalt gespeichert, weil er sich nicht mehr
ändern DARF. Dieselbe Frage, entgegengesetzte Antwort — der Unterschied ist,
ob die Wahrheit veränderlich bleibt oder im Moment der Unterschrift
festgeschrieben wird.

Unveränderbarkeit ist in den Rules durchsetzbar: Änderung nur solange
`status == 'entwurf'`, danach kein `update`, nie ein `delete`. Korrekturen
ausschließlich über Nachtrags- oder Stornoschein — dasselbe Muster wie bei den
Rechnungen.

### Was in der ersten Skizze fehlte

- **Offline.** Der Monteur steht im Keller. Eine offline erfasste Unterschrift
  synchronisiert später; `serverTimestamp()` wäre dann die
  Synchronisationszeit, nicht die Unterschriftszeit — genau die Beweiskraft
  wäre dahin. Lösung: BEIDE Zeiten speichern, Gerätezeit und Serverzeit, und
  eine Abweichung sichtbar machen. Offline zu sperren wäre untauglich, der
  Keller ist der Normalfall.
- **Name in Druckbuchstaben** neben der Unterschrift. Ein Strich ohne
  zuordenbaren Namen ist wenig wert.
- **GPS ortet den MITARBEITER.** Das ist Mitarbeiterüberwachung: abschaltbar
  je Betrieb, nur zum Unterschrifts-Ereignis, nie laufend.
- **IP-Adresse** ist im Mobilfunk die des Carrier-NAT und als Beweis nahezu
  wertlos. Die Geräte-Kennung ist brauchbarer.

### Stufen

**Stufe 1 — der Schein.** Vorausfüllung aus Zeiten und Material, Notizen,
Unterschrift von Monteur und Kunde, eingefrorener Schnappschuss,
serverseitig gerechneter Hash, PDF am Gerät, Sichtbarkeit im Büro. Ersetzt den
Papierschein vollständig. Die Unterschriftsbilder passen als PNG (~10 KB)
direkt ins Dokument — **Stufe 1 braucht kein Firebase Storage**, das spart ein
ganzes Subsystem.

**Stufe 2 — Fotos.** Storage ist im Projekt bisher gar nicht eingerichtet:
eigene Rules, clientseitige Komprimierung (Handyfotos sind 3–5 MB),
Offline-Upload. Die teuerste Einzelposition — und die am wenigsten kritische.

**Stufe 3 — automatischer Versand.** Mailanbieter, Function, Secrets. Dazu ein
Fallback, weil der Kunde oft keine E-Mail-Adresse dabeihat: PDF direkt teilen
oder QR-Code. Ans Büro geht es immer.

**Stufe 4 — Verbindung zur Rechnung.** Die Rechnung verweist auf
unterschriebene Scheine; die Buchhaltung sieht, welche Regiestunden gedeckt
sind. Erst hier wird aus dem Schein Geld.

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

## Skalierbarkeit: die Regel und die eine verbleibende Ausnahme

**Die Regel: keine Abfrage ohne Grenze.** Zwölf Abfragen wuchsen unbegrenzt
mit dem Bestand des Betriebs — sie luden alles und filterten im Browser ein
paar Zeilen heraus. Gemessen mit 15.660 Zeiteinträgen stand die Startseite
nach 29,7 Sekunden; nach der Begrenzung nach 3,6.

Jede Abfrage braucht jetzt eine von drei Grenzen:

1. **einen Zeitraum** — `where('date', '>=', …)`
2. **eine feste Obergrenze** — `limit(n)`, mit „Ältere laden" in der Ansicht
3. **einen Gleichheitsfilter auf eine kleine Menge** — Status, Baustellennummer

| Abfrage | vorher | jetzt |
| --- | --- | --- |
| eigene Zeiteinträge | alles seit Eintritt | Fenster (Startseite 35 Tage, Zeitkonto 3 Monate) |
| Zeiteinträge fürs Radar | alle des Betriebs | nur Baustellen mit Budget |
| Zeiteinträge für eine Rechnung | alle des Betriebs | nur die eine Baustelle |
| eigene Einsätze | alle jemals | Monat bzw. ab heute mit `limit` |
| Rechnungen | alle jemals | die 50 jüngsten, nachladbar |
| Materialanforderungen | alle jemals | nur offene, bzw. 200 jüngste |
| Baustellen | alle, im Browser gefiltert | Statusfilter auf dem Server |
| Baustellen für Namensauflösung | alle | nur die vorkommenden Nummern |

**Die Bremse.** Einzeln repariert kommen solche Abfragen zurück: die
unbegrenzte Variante ist kürzer, sie funktioniert im Test mit dreißig
Datensätzen tadellos, und sie fällt erst nach Jahren auf — beim Kunden, der
die App am längsten benutzt. `tests/unit/abfragegrenzen.test.ts` prüft
deshalb die Datenschicht als Ganzes und nennt beim Fehlschlag die Funktion.
Ausnahmen sind möglich, aber nur mit Begründung im Test — etwa die
Belegschaft, die mit Einstellungen wächst und nicht mit der Zeit.

### Erledigt: der persönliche Saldo ohne die ganze Historie

Der Saldo läuft seit dem ersten Arbeitstag und war die einzige Zahl im
Programm, die wirklich jede Buchung brauchte — nach zehn Dienstjahren rund
2.200 Dokumente bei jedem Aufruf des Zeitkontos. Jetzt: **eine Bilanz je
Mitarbeiter und Monat**, aus 2.640 Dokumenten werden 120.

Umgesetzt wie im Entwurf beschrieben:

- **Neu berechnen statt hochzählen.** Der Trigger liest den betroffenen Monat
  komplett neu (rund 20 Dokumente) und schreibt das Ergebnis. Firestore-Trigger
  laufen mindestens einmal, nicht genau einmal — ein `+= delta` verzählte sich
  beim Wiederholungslauf unbemerkt. Zweimal laufen ändert hier nichts.
- **Nur das Ist gespeichert, nie der Saldo.** Gearbeitete Minuten, die ANZAHL
  der Krank- und Urlaubstage, die gebuchten Daten. Das Soll bleibt abgeleitet;
  ändert die Geschäftsführung jemandes Wochenstunden, stimmt der Saldo
  rückwirkend, ohne dass eine einzige Bilanz neu geschrieben wird.
- **Drift heilt von selbst.** Ein nächtlicher Lauf rechnet den laufenden und
  den Vormonat neu. Eine Abweichung kann höchstens einen Tag alt werden.
- **Eine Quelle für die Rechenformel.** `shared/arbeitszeit.ts` wird von der
  App importiert und beim Build in die Functions kopiert. Die Kopie ist nicht
  eingecheckt und wird jedes Mal neu geschrieben — sie kann nicht abweichen.
  Zwei von Hand gepflegte Fassungen derselben Formel wären hier der
  gefährlichste Fehler gewesen.

**Der Vollständigkeits-Marker ist der wichtigste Teil.** Eine fehlende Bilanz
ist von einem Monat ohne Buchungen nicht zu unterscheiden. Ohne Prüfung
ergäbe ein lückenhafter Bestand einen zu niedrigen Saldo — lautlos, und die
Zahl steht auf dem Lohnzettel. Das Zeitkonto benutzt die Bilanzen deshalb nur,
wenn ein Marker bestätigt, dass sie ab dem Eintrittsmonat lückenlos vorliegen.
Sonst rechnet es direkt aus den Buchungen: langsamer und richtig.

Geprüft wird die eine Eigenschaft, auf die es ankommt: der Saldo aus Bilanzen
muss auf die Minute dem aus Einzelbuchungen entsprechen — gegen fünfzehn
zufällig erzeugte Verläufe mit Teilzeit, Eintritt zur Monatsmitte, Feiertagen,
Krankentagen und Nachtschichten. Gegengeprüft: ein eingebauter Rechenfehler
lässt den Test ausschlagen.

Der Erstaufbau steht als Knopf in den Einstellungen. Er liest einmal die
gesamte Buchungsgeschichte — genau das, was danach vermieden wird — und
gehört deshalb zu einem ruhigen Zeitpunkt angestoßen.

## Startseite: was gemessen wurde und was noch offen ist

**Gemessen, nicht geschaetzt.** Mit 20 Monteuren und drei Jahren Buchungen —
15.660 Zeiteintraege — gegen die Emulatoren:

| | vorher | nachher |
| --- | --- | --- |
| Startseite steht nach | 29,7 s | 3,6 s |

Zwei unbegrenzte Abfragen waren die Ursache, beide sind jetzt begrenzt:

- **Team-Block**: las jeden Zeiteintrag seit dem fruehesten Eintritt, weil
  der Saldo seit Eintritt laeuft. Zeigt jetzt den LAUFENDEN MONAT — rund 440
  Dokumente, und das bleibt so, auch in zehn Jahren. Der Monat beantwortet
  ausserdem die Frage besser, die hier gestellt wird: wer hat noch nicht
  gebucht?
- **Projekt-Radar**: las ebenfalls alle Eintraege des Betriebs. Laedt jetzt
  nur die Eintraege der Baustellen MIT Budget. Abgeschlossene Baustellen
  fallen weg, und die machen mit der Zeit den Grossteil aus.

**Die Grenze des Radars, ehrlich benannt:** eine einzelne, lange laufende
Baustelle mit vielen Stunden laedt weiterhin ihre gesamte Historie. Bei der
ersten Messung lagen alle 15.660 Eintraege auf EINER aktiven Baustelle — dort
brachte die Begrenzung nichts. Das ist unrealistisch (drei Jahre, eine
Baustelle), aber es zeigt, wo die Loesung endet.

### Was noch fehlt: der Gesamtsaldo auf einen Blick

Der Saldo SEIT EINTRITT steht jetzt nicht mehr auf der Startseite. Wird er
dort vermisst, ist der naechste Schritt kein Nachladen, sondern ein
gepflegter Stand. Drei Entwurfsentscheidungen, die dabei wesentlich sind:

- **Neu berechnen statt hochzaehlen.** Firestore-Trigger laufen MINDESTENS
  einmal, nicht GENAU einmal. Ein `+= delta` verzaehlt sich beim
  Wiederholungslauf, unbemerkt und dauerhaft. Ein Trigger, der den
  betroffenen Monat komplett neu rechnet (rund 20 Dokumente), ist von Natur
  aus wiederholbar.
- **Nur das Ist speichern, nie den Saldo.** Der Saldo haengt an
  Wochenstunden, Arbeitstagen, Eintrittsdatum und Feiertagen. Aendert die
  Geschaeftsfuehrung jemandes Wochenstunden, aendert sich rueckwirkend jeder
  Tag; ein gespeicherter Saldo waere ab dem Moment falsch. Das Soll bleibt
  abgeleitet und kostet nichts.
- **Drift automatisch heilen.** Kein Knopf zum Neuaufbau, sondern Bausteine,
  die klein genug sind, dass ein naechtlicher Lauf den laufenden und den
  Vormonat einfach neu rechnet. Dann kann eine Abweichung hoechstens einen
  Tag alt werden.

Die Saldo-Rechnung liegt heute in `src/lib/time.ts` und damit im Client. Ein
Server-Job braucht sie ebenfalls — sie zu KOPIEREN waere der gefaehrlichste
Teil der Uebung: zwei Implementierungen derselben Zahl, und die geht auf den
Lohnzettel. Der erste Schritt waere deshalb, sie an einen Ort zu legen, den
beide Seiten benutzen koennen.

