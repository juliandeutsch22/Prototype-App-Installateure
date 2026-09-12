# Umzug nach Postgres

Stand: 09.09.2026, gemessen an Fassung `0e9e149`.

**Wofür dieses Dokument da ist.** Es beantwortet zwei Fragen und sonst
nichts: *soll das Hinterhaus von Firestore auf Supabase wechseln* — und
*in welcher Reihenfolge*. Es ist eine Entscheidungsvorlage, kein
Änderungsprotokoll; sobald etwas davon gebaut ist, gehört es in die
[Roadmap](./ROADMAP.md).

Alle Zahlen darin sind gezählt, nicht geschätzt. Wer sie nachrechnen will,
findet die Befehle am Ende.

---

## Befund

**Ja, unter einer Bedingung.**

Diese Empfehlung ist eine Kehrtwende. Am 09.09. stand hier noch das
Gegenteil, begründet mit der Offline-Warteschlange und der Größe der
Umbaufläche. Zwei Annahmen davon haben beim Nachsehen nicht gehalten.

**Erstens: gerechnet wurde gegen einen Echtbetrieb, den es noch nicht gibt.**
Die Roadmap stellt als Prüffrage „kommt das Büro ohne ein zweites System
durch den Tag?" und beantwortet sie mit „heute nicht ganz" — angeboten wird
in Word, der Steuerberater bekommt PDFs. Es liegen also keine
aufbewahrungspflichtigen Rechnungen in der Datenbank. **Das ist der
billigste Zeitpunkt, den dieser Umzug je haben wird.** Nach dem Echtstart
bindet § 132 BAO jede Rechnung sieben Jahre, und aus einer Umstellung wird
ein Parallelbetrieb.

**Zweitens: die Offline-Fläche war zu groß geschätzt.** Die Behauptung war,
die gesamte Datenschicht hänge an Firestores Warteschlange. Tatsächlich wird
`writeWithOfflineNotice` an genau **zwei** Stellen benutzt — in
`TimeForm.tsx` und in `OrderView.tsx`. Der offline-kritische Pfad des
Monteurs besteht aus *Anhängen*, nicht aus gleichzeitigen Änderungen an
derselben Zeile. Das ist etwas, das man bauen kann.

Die Bedingung steht dagegen fest: **der Schreibweg ohne Empfang wird zuerst
gebaut und bewiesen, nicht zuletzt.** Siehe [Stufe 0](#stufe-0--der-sperrversuch-schreiben-ohne-empfang).

---

## Was umzieht

| Bestandteil | Was daraus wird | Umfang |
|---|---|---|
| Dateien mit Firebase-Bezug | anzufassen | 46 |
| Sammlungen | Tabellen mit echten Fremdschlüsseln | 20 |
| Datenschicht `src/lib/db` | innen getauscht, außen gleich | 20 Module, 2 808 Zeilen |
| Live-Abonnements | Realtime oder Broadcast | 11 in 11 Ansichten |
| `firestore.rules` | Zeilenschutz (RLS) | 727 Zeilen |
| Prüfungen gegen die echte Datenbank | SQL-Prüfungen | 225 |
| Zusammengesetzte Indizes von Hand | entfallen weitgehend | 40 |
| Cloud Functions | Trigger, `pg_cron`, Edge Functions | 15 |
| Gemeinsame Taille der Datenschicht | der eine Hebel | 5 Funktionen |
| **Ansichten, die Firestore direkt aufrufen** | — | **0** |

Die letzte Zeile ist der Grund, warum das machbar ist. `queryTenant`,
`subscribeTenant`, `createInTenant`, `updateInTenant` und `deleteInTenant`
in `src/lib/db/core.ts` tragen den Großteil aller Zugriffe. Behalten die
zwanzig Module ihre Signaturen, wird in Stufe 3 keine einzige Ansicht
angefasst. **Die Trennlinie läuft durch die Datenschicht, nicht durch die
Oberfläche.**

---

## Das Narbengewebe

Neun Umgehungen, die es nur gibt, weil Firestore etwas nicht kann. Sie sind
der eigentliche Anlass des Umzugs — nicht die Datenbank an sich.

| Wo | Warum es sie gibt | Was an ihre Stelle tritt |
|---|---|---|
| `src/lib/listengrenzen.ts` und „Weitere laden" in jeder Liste | Firestore kann nicht zählen und nicht suchen | `count(*)` und `offset`. Der Knopf bleibt, wo er dem Menschen dient |
| `tests/unit/abfragegrenzen.test.ts` | Wächter, der jede Abfrage zwingt, eine Grenze zu tragen | entfällt vollständig |
| Suche nur über die Nummer; Aufgabe L4 seit Wochen zurückgestellt | jede Firestore-Näherung braucht ein nachzupflegendes Feld und verliert Treffer in der Wortmitte | `pg_trgm` findet „uber" in „Familie Huber", mit Index, ohne Zusatzfeld |
| 40 Indizes von Hand, `tests/unit/indexabgleich.test.ts` | der Emulator legt fehlende Indizes still selbst an, produktiv bleibt die Ansicht leer | ein fehlender Index äußert sich als langsame Abfrage, nicht als leere Liste; `EXPLAIN` sagt welcher |
| Material über den normalisierten Namen zugeordnet | es gibt keinen Verbund | ein `join` über den Fremdschlüssel |
| `monthlyStats`, `bilanzNachziehen`, `bilanzenNachtlauf` | Firestore kann nicht summieren | eine Sicht oder ein Trigger in derselben Transaktion — die Bilanz ist dann *sofort* richtig |
| Sammlung `counters` | es gibt keine Sequenzen | eine Sequenz je Betrieb |
| Nächtliche JSONL-Ausleitung | es gibt keinen Auswertungszugang | ein Lesezugang mit SQL; die Ausleitung bleibt als *Sicherung* |
| `stripUndefined()` in `core.ts` | Firestore lehnt `undefined` hart ab | eine Spalte ist `null` oder sie ist es nicht |

Die Monatsbilanz ist der bemerkenswerteste Eintrag: aus zwei Cloud
Functions und einer Sammlung wird eine Sicht, und nebenbei hört die Bilanz
auf, nur *nachträglich* richtig zu sein. Das ist keine Ersparnis, das ist
eine bessere Eigenschaft.

---

## Das eine Risiko

Firestore nimmt einen Schreibvorgang offline in den lokalen
Zwischenspeicher, sendet ihn selbsttätig nach und meldet eine späte
Ablehnung. **Supabase tut davon nichts.** Ohne Netz scheitert der Aufruf,
und damit fällt die Eigenschaft, auf der diese App steht: der Monteur bucht
seine Zeit in der Tiefgarage.

Der Kommentarkopf von `src/lib/offlineWrite.ts` beschreibt genau, was dann
passiert — er ist die Begründung dafür, dass diese Stufe zuerst kommt.

| Weg | Bewertung |
|---|---|
| **Eigene Warteschlange** — Ausgangsfach in IndexedDB, Nachsende-Arbeiter, Kennungen vom Gerät statt vom Server, `upsert` statt `insert` | **Empfohlen.** Trägt, weil die offline-kritischen Vorgänge Anhänge sind. Schätzung 400–700 Zeilen samt Prüfungen. Kein zweiter Anbieter |
| **PowerSync** | Fertige, zweiseitige Abgleichung mit lokaler SQLite-Datei und offizieller Supabase-Anbindung. Kostet Geld und will den gesamten *Lese*pfad umbauen. Tauscht die eine Abhängigkeit gegen eine andere |
| **Nichts tun** | Keine Option. Wer das aufgibt, hat die App verschlechtert und nicht modernisiert |

---

## Fahrplan

Zehn Stufen, rund 25 bis 35 Pull Requests in der Größe der letzten.

### Stufe 0 — Der Sperrversuch: schreiben ohne Empfang

*1–2 PR, gegen ein Wegwerf-Projekt.*

Eine Tabelle, ein Zeilenschutz, das Ausgangsfach. Prüffragen, wörtlich:

1. Der Monteur bucht im Flugmodus eine Zeit, schaltet das Netz ein — der
   Eintrag ist da. **Einmal, nicht zweimal.**
2. Ein Vorgang, den der Server am Ende ablehnt, erreicht den Monteur — so
   wie es `beiVorgemerktemFehlschlag` heute tut.
3. Elf Abonnements unter Zeilenschutz verhalten sich messbar, solange das
   Wegwerf-Projekt noch steht.

> **RIEGEL.** Hält Stufe 0 nicht, endet der Umzug hier. Kein „das lösen wir
> später", keine halbe Migration mit einem offenen Loch im Schreibweg des
> Monteurs.

### Stufe 1 — Schema und Zeilenschutz

*3–4 PR.*

Zwanzig Sammlungen werden zwanzig Tabellen, diesmal mit echten
Fremdschlüsseln. `company_id` auf jeder Tabelle, eine RLS-Richtlinie je
Tabelle. Der Nachfolger von `syncUserClaims` ist ein Auth-Hook, der
`company_id`, `role` und `active` in das Token schreibt: dieselbe Idee,
dieselbe Vertrauenskette — aus dem Benutzerdatensatz, nie aus der Eingabe.

### Stufe 2 — Das Prüfnetz umziehen

*4–6 PR. Der größte einzelne Block.*

225 Prüfungen laufen heute gegen eine echte Datenbank, darunter zwei
Betriebe, die am selben Tag auf derselben Baustellennummer arbeiten. Sie
sind der Grund, warum die Mandantentrennung belegt ist und nicht bloß
behauptet. **Sie werden portiert, nicht neu erfunden und nicht gekürzt.**

Nebenbefund, der dafür spricht: `platformAdmins` und `betriebsanlagen`
haben in den heutigen Regeln gar keinen Eintrag — sie sind dicht, weil
*nichts* erlaubt ist. Diese Art Beweis will man behalten.

### Stufe 3 — Die Datenschicht tauschen, die Ansichten nicht

*5–7 PR.*

Die zwanzig Module behalten ihre Signaturen; nur ihr Inneres wechselt. Die
fünf Kernfunktionen werden ein SQL-Erbauer. Keine Ansicht wird angefasst —
und das ist zugleich die Probe darauf, ob die Taille wirklich trägt.

### Stufe 4 — Die elf Abonnements

*2 PR.*

Supabase kann Zeilenänderungen direkt melden, prüft dabei aber den
Zeilenschutz je Zeile und Empfänger. Für die kleinen Abos reicht das; für
die langen — Zeiten, Anforderungen, Material — ist eine Meldung aus dem
Datenbank-Trigger der ruhigere Weg. Welcher wofür, wird gemessen.

### Stufe 5 — Die fünfzehn Functions

*4–5 PR.*

| Heute | Morgen |
|---|---|
| `scheinPruefsumme`, `bilanzNachziehen`, `syncUserClaims`, `plattformAdminClaim` | Postgres-Trigger, in derselben Transaktion |
| `bilanzenNachtlauf`, `datenAusleitung` | `pg_cron` |
| `betriebAnlegen`, `exportCompanyData`, `urlaubEntscheiden`, `scheinVorbereiten`, `voiceExtract`, `datenAusleitungJetzt`, `bilanzenNeuAufbauen` | Edge Functions |
| `notifyNewOrder`, `notifyOrderReady` | Trigger, der die Push-Function anstößt |

### Stufe 6 — Fotos, Push, Ausleitung

*1–2 PR.*

Die Scheinfotos ziehen in den Supabase-Speicher; sie sind seit jeher
optional und hatten auch bei Firebase nie eine Warteschlange, also ist hier
nichts zu verlieren. **Die Push-Nachrichten bleiben bei Firebase Cloud
Messaging** — das hängt an keiner Datenbank und funktioniert. Ein Umzug
dorthin wäre Arbeit ohne Gegenwert.

### Stufe 7 — Die Narben zurückbauen

*2–3 PR. Der eigentliche Grund für alles davor.*

Echte Suche nach Name und Adresse samt Treffern in der Wortmitte,
`listengrenzen.ts` gelöscht, die Nachladeknöpfe bleiben nur dort, wo sie dem
Menschen dienen, die vierzig Indizes fallen, die Monatsbilanz wird eine
Sicht, `counters` wird eine Sequenz, `stripUndefined` verschwindet.

Aufgabe L4 wird hier zu einer Nachmittagsarbeit.

### Stufe 8 — Umschalten

*1–2 PR.*

Weil noch keine echten Daten liegen: ein harter Schnitt, kein
Parallelbetrieb. Bestand ausleiten, einlesen, umstellen. Sollten bis dahin
echte Daten da sein, kommt ein Übernahmeskript dazu und ein Fenster, in dem
nur gelesen wird — aber das ist der schlechtere Weg, und er ist vermeidbar,
solange wir vor dem Echtstart bleiben.

### Stufe 9 — Firebase abbauen

*1 PR.*

SDK raus, Regeln raus, Indizes raus, das Functions-Projekt raus. Das
Firebase-Projekt selbst bleibt bestehen, bis für alles, was darin echt war,
die Aufbewahrungsfrist abgelaufen ist.

---

## Was dabei nicht getan wird

Vier Wege, auf denen so ein Umzug gewöhnlich scheitert.

- **Kein Parallelbetrieb mit zwei Datenbanken.** Doppelt schreiben
  verdoppelt die Fehlerfläche, und hinterher weiß niemand, welche Seite
  recht hat. Der Grund, warum wir uns das sparen dürfen, ist derselbe wie
  der Grund für den Zeitpunkt: es liegen noch keine echten Daten.
- **Keine Migration Ansicht für Ansicht.** Die Trennlinie läuft durch die
  Datenschicht. Wer sie durch die Oberfläche legt, hat am Ende beide
  Datenbanken in derselben Ansicht.
- **Das Prüfnetz wird nicht abgekürzt.** Eine Migration, die die 225
  Prüfungen „später" portiert, portiert sie nie.
- **Stufe 7 wird nicht verschoben.** Sie ist der Zweck der Übung. Wird sie
  ans Ende einer Warteschlange geschoben, haben wir die Datenbank
  gewechselt und die Narben mitgenommen.

---

## Offen, vor Stufe 1 zu klären

- **Frankfurt.** Heute läuft alles in `europe-west3`, ausdrücklich wegen der
  DSGVO. Dass Supabase eine Region in Frankfurt anbietet, gehört bestätigt,
  bevor irgendetwas angelegt wird — nicht danach.
- **Realtime unter Zeilenschutz.** Wie sich elf Abonnements bei wachsendem
  Bestand verhalten, ist eine Messung, keine Meinung. Gehört in Stufe 0.
- **Kosten.** Supabase ist ein fester Monatsbetrag, Firebase rechnet nach
  Nutzung ab. Für *einen* Betrieb ist Firebase heute vermutlich billiger.
  Planbarer ist Supabase, und ab dem dritten Betrieb dreht sich das
  Verhältnis vermutlich — vermutlich, nicht gerechnet.
- **Der Katalog.** Der Datanorm-Weg — Katalog nicht in der Datenbank,
  sondern gepackt aufs Gerät — bleibt richtig und bleibt von diesem Umzug
  unabhängig. Er wird durch Postgres leichter, nicht überflüssig.

---

## Die Zahlen nachrechnen

```bash
# Dateien mit Firebase-Bezug
grep -rl "from 'firebase/\|firebase-admin\|firebase-functions" src functions/src shared tests | wc -l

# Sammlungen in den Regeln
grep -o "match /[a-zA-Z]*" firestore.rules | sed 's|match /||' | sort -u | grep -v databases

# Datenschicht
wc -l src/lib/db/*.ts | tail -1

# Live-Abonnements (ohne den generischen Helfer subscribeTenant)
# und die Ansichten, die sie benutzen
grep -rh "^export function subscribe\|^export const subscribe" src/lib/db/*.ts \
  | grep -vc subscribeTenant
grep -rl "subscribe[A-Z]" src/features src/components | wc -l

# Indizes
python3 -c "import json;print(len(json.load(open('firestore.indexes.json'))['indexes']))"

# Ansichten, die Firestore direkt aufrufen — muss 0 bleiben
grep -rl "from 'firebase/firestore'" src/features src/components | wc -l
```

Die 225 Prüfungen gegen die echte Datenbank laufen mit:

```bash
npx --yes firebase-tools@15 emulators:exec --only firestore --project demo-ci "npm run rules:test"
```

---

## Stufe 0: Ergebnis

**Bestanden.** Gemessen am 11.09.2026 gegen einen lokalen Supabase-Stack
(Postgres 17.6, PostgREST, GoTrue) im Container.

| Prüffrage | Ergebnis |
|---|---|
| Buchung im Flugmodus, danach Netz an — Eintrag ist da, **einmal** | ja |
| Derselbe Vorgang kommt zweimal an — landet einmal | ja, über die geräteseitige Kennung und `upsert` |
| Reihenfolge: erst anlegen, dann ändern | ja, das Fach hält beim ersten Fehlschlag an |
| Späte Ablehnung erreicht den Monteur | ja, `beiVormerkungFehlgeschlagen` |
| Fremder Betrieb sieht nichts | ja, RLS |
| Monteur bucht nicht für Kollegen, Büro schon | ja |

Geprüft wodurch: 16 Prüfungen der Ablauflogik gegen einen erfundenen Server
(`tests/unit/ausgangsfach.test.ts`, Teil von `npm test`) und 10 Prüfungen
gegen die echte Datenbank (`tests/supabase/durchstich0.test.ts`,
`npm run supabase:test`). Beide Sätze sind gegen absichtlich kaputten Code
gehalten worden; von zehn Mutationen sind zunächst acht gefallen, die zwei
übrigen haben je eine echte Lücke aufgedeckt (siehe unten).

### Was der Sperrversuch gefunden hat

1. **Ein Fehler im Ausgangsfach.** Nach dem Wegräumen einer abgelehnten Zeile
   samt ihrer Nachfolger lief die Schleife auf einem veralteten Abzug weiter
   und sendete die gerade verworfene Zeile doch noch. Der Monteur hätte eine
   Meldung „verloren" bekommen und die Buchung wäre trotzdem angekommen.

2. **Ein Schloss ohne Tür.** Die Richtlinien rufen Helfer im Schema `app` auf.
   Ohne `grant usage on schema app` scheitert nicht die Prüfung, sondern der
   ganze Aufruf — und damit geht nichts mehr durch, auch das Erlaubte nicht.

3. **Eine ungeprüfte Richtlinie.** Ein `upsert` verlangt von PostgREST auch
   das Änderungsrecht. Die Änderungs-Richtlinie weist den fremden Betrieb
   schon ab, also blieb die Anlege-Richtlinie ungetestet und hätte sperrangel-
   weit offen stehen können, ohne dass eine Prüfung es merkt.

Keiner der drei Punkte wäre durch Lesen aufgefallen. Das ist das Argument
dafür, diese Stufe vor allen anderen zu machen.

### Die Warteschlange überlebt den Neustart

`src/lib/sync/lagerIndexedDB.ts`. Firestore hielt seine Warteschlange in
IndexedDB; wäre unsere nur im Arbeitsspeicher, wäre die Buchung des Monteurs
beim Wegwischen der App weg — lautlos, denn er hat ja eine Bestätigung
gesehen. Zwei Entscheidungen tragen das:

- **Die Datenbank vergibt die Folge**, nicht der Aufrufer. Zwei offene Tabs,
  die erst die höchste Nummer lesen und dann schreiben, vergeben zweimal
  dieselbe — und dann überholt beim Nachsenden das „Ändern" sein „Anlegen".
- **Gewartet wird auf das Ende der Transaktion**, nicht auf die Anfrage.
  IndexedDB meldet eine Anfrage als erfolgreich, lange bevor festgeschrieben
  ist; bricht die Transaktion danach ab, ist nichts geschrieben. Wer hier
  abkürzt, sagt „vorgemerkt" für eine Buchung, die es nie gab.

Der zweite Punkt war zunächst ungeprüft: die erste Mutation dagegen ist
durchgelaufen, weil der erzwungene Abbruch zu früh kam und schon die Anfrage
scheitern liess. Erst ein Abbruch NACH der erfolgreichen Anfrage trennt die
beiden Fassungen.

### Die Abonnements trennen die Betriebe — mit einer Fussangel

`tests/supabase/abos.test.ts`. Gemessen: eine Änderung im eigenen Betrieb
kommt unter einer Sekunde an, ein fremder Betrieb bekommt nichts. Das ist
nicht selbstverständlich, denn **Abfrage und Meldeweg sind zwei Wege mit zwei
Prüfungen**: eine Tabelle zu veröffentlichen, ohne dass eine Lese-Richtlinie
greift, schickt jede Änderung an jeden angemeldeten Empfänger, ohne dass je
eine Abfrage etwas Falsches zurückgäbe. Deshalb steht in der Migration jede
Tabelle einzeln und nie ein „alle Tabellen".

**Die Fussangel, und sie hat Folgen für Stufe 4:** `SUBSCRIBED` sagt, dass der
Kanal steht — nicht, dass das Abonnement serverseitig schon hört. Wer
unmittelbar danach schreibt, verliert die Meldung lautlos. Firestore lieferte
den ersten Bestand aus demselben Abo; hier sind Abonnieren und Bestand holen
zwei Vorgänge mit einer Lücke dazwischen. **Beim Umbau der elf Abonnements muss
deshalb zuerst abonniert und dann der Bestand geholt werden.**

Der erste Anlauf dagegen war eine feste Wartezeit. Die hat nach einem Neustart
des Stacks nicht gereicht und den Lauf flattern lassen — ein Test, der mal
fällt und mal nicht, ist schlimmer als keiner. Jetzt wird gewartet, bis eine
eigens dafür geschriebene Zeile ankommt. Für den Beweis, dass der fremde
Betrieb nichts bekommt, gilt das doppelt: ohne den Nachweis, dass sein Kanal
überhaupt lief, bewiese der Test das Gegenteil von dem, was er behauptet.

### Stand nach Stufe 0

| | |
|---|---|
| Prüfungen der Ablauflogik (in `npm test`) | 23 |
| Prüfungen gegen die echte Datenbank (`npm run supabase:test`) | 12 |
| Mutationen angesetzt | 17 |
| davon beim ersten Anlauf gefangen | 13 |
| echte Lücken, die die vier übrigen aufgedeckt haben | 4 |

Alle vier Lücken sind mit eigenen Prüfungen geschlossen und die Mutationen
danach wiederholt.


---

## Stufe 1: Schema und Zeilenschutz

**Steht.** 11.09.2026. Zwanzig Firestore-Sammlungen sind 24 Tabellen und eine
Sicht geworden, jede mit `company_id`, jede mit eingeschaltetem Zeilenschutz.

### Die vier Modellentscheidungen

**1. Zeitbuchung und Scheinzeit bleiben getrennt.** `time_entries` ist die
lebende Buchung, `work_sheet_hours` eine mit der Unterschrift eingefrorene
Kopie — mit dem Mitarbeiter als *Namen* und ohne Fremdschlüssel auf die
Buchung. Sie dürfen auseinanderlaufen; genau darauf beruht die Meldung
„Scheine warten noch auf deine Zeitbuchung". Dasselbe gilt für
`work_sheet_material`, `invoice_lines` und `quote_lines`: ein geänderter Preis
darf einen unterschriebenen Beleg nicht rückwirkend ändern.

**2. `project_number` bleibt, `project_id` kommt dazu.** Heute hängt nichts an
einer Baustellen-Id, alles an der getippten Nummer — weil der Monteur auf
„2026-014" bucht, bevor das Büro die Baustelle angelegt hat. Ein
Pflicht-Fremdschlüssel tötete diesen Ablauf. Also beides: die Nummer trägt den
Alltag, ein nullbarer Fremdschlüssel wird per Trigger aufgelöst, sobald er
passt.

**3. Lieferanten stehen auf Betriebsebene.** `material_prices` ist die
Verbindung aus Artikel, Lieferant und Gültigkeit, mit Listenpreis *und*
Einkaufspreis als getrennten Spalten. Das ist die Vorbedingung dafür, dass der
Datanorm-Import später ein Datenladen ist und keine Schemaänderung.

**4. Eine Benutzertabelle, nicht zwei.** Zugang und Person zu trennen ist
lehrbuchrichtig und kostet hier einen Verbund in fast jeder Abfrage, für einen
Fall, den es nicht gibt.

### Regeln als Richtlinien, Übergänge als Trigger

`firestore.rules` konnte alte und neue Fassung eines Dokuments vergleichen.
Eine RLS-Richtlinie kann das nicht: `using` sieht die alte Zeile, `with check`
die neue, keine von beiden sieht beide. Also die Aufteilung: **Richtlinien
sagen, wer welche Zeilen anfassen darf; Trigger sagen, was sich daran ändern
darf.** Sieben Trigger tragen das, darunter der Zustandswechsel des Scheins,
die eingefrorene Rechnung, der geschützte Verrechnungsstand und die
Urlaubsentscheidung.

### Der Wächter

`tests/supabase/schema.test.ts` kennt keine Liste von Tabellen — er fragt die
Datenbank. Eine neue Tabelle ist damit automatisch geprüft oder fällt durch.
Er verlangt: Zeilenschutz überall, in **jeder** Richtlinie eine Betriebsprüfung,
auf jeder änderbaren Betriebstabelle den Riegel gegen den Betriebswechsel,
keine Veröffentlichung ohne Leserichtlinie, vollen Datensatz in jeder Meldung,
und die beiden Plattformtabellen ohne `company_id` und ohne jede Richtlinie.

Er hat beim ersten Lauf vier eigene Versäumnisse gefunden: sieben Tabellen ohne
Riegel, eine Plattformtabelle mit einer Spalte namens `company_id`, die
fehlende Monatsbilanz-Sicht und einen Zähler ohne erklärte Ausnahme.

Und er war zunächst zu schwach: er fragte, ob *irgendeine* Richtlinie den
Betrieb prüft. Eine zweite, offene Richtlinie daneben kam damit durch — genau
so entsteht ein Leck. Jetzt wird jede Richtlinie einzeln geprüft.

### Die Monatsbilanz ist jetzt eine Sicht

Sie brauchte in Firestore zwei Sammlungen, einen Trigger und einen Nachtlauf —
alles nur, weil dort nicht summiert werden kann. Damit war sie immer nur
*irgendwann* richtig. Als Sicht ist sie immer richtig. Die Minutenrechnung
folgt `calcWorkMin` Zeile für Zeile, samt der Nacht über Mitternacht, die
früher glatt null Stunden ergab.

### Stand nach Stufe 1

| | |
|---|---|
| Tabellen | 24, dazu eine Sicht |
| Prüfungen gegen die echte Datenbank | 46 |
| Mutationen angesetzt | 18 |
| beim ersten Anlauf gefangen | 16 |
| echte Lücken durch die zwei übrigen aufgedeckt | 2 |

Die Prüfungen leeren die lokale Datenbank vor jedem Lauf. Das war nicht von
Anfang an so: der erste Satz ging beim zweiten Lauf kaputt, weil er seine
eigenen Rechnungsnummern liegen liess. Ein Test, der nur auf einer frischen
Datenbank durchgeht, ist eine Falle.

### Was Stufe 1 nicht umfasst

Die App schreibt weiterhin nach Firestore; hier steht bisher nur das Ziel.
Der Umbau der Datenschicht ist Stufe 3, und davor kommt Stufe 2: die 225
Regelprüfungen gegen den Emulator werden portiert.


---

## Stufe 2: das Prüfnetz ist umgezogen

**Vollständig.** 12.09.2026. Alle 155 Regelprüfungen aus
`tests/firestore.rules.test.ts` haben eine Entsprechung in
`tests/supabase/regeln.test.ts` — gleiche Blöcke, gleiche Titel, damit sich
beide Seiten nebeneinander lesen lassen.

Dass nichts fehlt, ist nicht abgehakt, sondern geprüft:
`tests/supabase/vollstaendigkeit.test.ts` liest beide Dateien, zieht die Titel
heraus und vergleicht sie. Eine Prüfung, die drüben steht und hier nicht,
lässt den Lauf fallen — es sei denn, sie steht als Ausnahme mit einer
Begründung von mindestens zwanzig Zeichen. Die Liste der Ausnahmen ist derzeit
leer.

### Was das Portieren zutage gefördert hat

**Der Dienstschlüssel kommt durch den Zeilenschutz, aber nicht durch Trigger.**
Der wichtigste Fund der Stufe. In Firestore umging das Admin-SDK die Regeln
vollständig; serverseitiger Code musste sich um sie nicht kümmern. In Postgres
trägt `service_role` zwar `BYPASSRLS`, aber Trigger laufen weiter. Mein Riegel
gegen die Ernennung von Administratoren sperrte damit ausgerechnet die
Funktion aus, die den **ersten** Administrator eines neuen Betriebs anlegt.

Welche Trigger den Dienstschlüssel durchlassen, ist jetzt eine Entscheidung je
Trigger: **durch** darf, was serverseitige Abläufe brauchen (ersten
Administrator anlegen, über Urlaub entscheiden, die Prüfsumme auf einen
unterschriebenen Schein schreiben, einen Katalog importieren); **nicht durch**
kommt, was den Beleg selbst schützt (der Betrieb einer Zeile, die eingefrorene
Rechnung, die eingefrorenen Scheinpositionen). Ein Server, der diese Riegel
braucht, tut etwas Falsches.

**Fünf Regeln fehlten im Schema.** Sie standen in `firestore.rules`, aber
nicht in Stufe 1: Administratoren ernennt nur ein Administrator; Module
schaltet nur die Administration; die Genehmigenden für Urlaub sind
einstellbar; der Einkaufspreis — die Marge — gehört der Geschäftsführung
allein; und auf der Rüstliste hakt nur ab, wer eingeteilt ist.

**Drei eigene Fehler.** Die Einstellungen liessen sich löschen, weil `for all`
auch DELETE umfasst. Beim Zurückholen eines verworfenen Entwurfs konnte der
Inhalt mitgeändert werden, weil der Trigger nur den Zustandswechsel prüfte und
nicht, was sonst im selben Schreibvorgang mitkam. Und mein Test aus Stufe 1
liess die Projektleitung Urlaub genehmigen — er beschrieb meinen zu groben
Trigger statt der Regel.

### Stand nach Stufe 2

| | |
|---|---|
| Prüfungen gegen die echte Datenbank | 208 |
| davon portierte Regelprüfungen | 155 |
| Mutationen angesetzt | 8 |
| gefangen | 8 |

Der Lauf ist zweimal hintereinander grün, ohne Zurücksetzen dazwischen.

### Was noch fehlt

Die 35 Durchstich- und 35 Abfrage-Prüfungen (`tests/durchstich.test.ts`,
`tests/abfragen.smoke.test.ts`) sind noch nicht portiert. Sie prüfen ganze
Abläufe und die Abfragen der Datenschicht — beides hängt an Stufe 3, weil es
ohne umgebaute Datenschicht nichts zu prüfen gibt. Sie kommen dort dazu, nicht
später.


---

## Stufe 3, erster Teil: die Taille steht

12.09.2026. Die Datenschicht hat jetzt ein zweites Inneres. Umgestellt ist
noch kein Modul — aber das Fundament, auf dem die zwanzig stehen werden, und
der Vertrag, der sie zusammenhält.

### Der Vertrag ist festgenagelt

`tests/unit/datenschichtVertrag.test.ts` liest mit dem TypeScript-Compiler
jede ausgeführte Funktion aus `src/lib/db` samt Typen und vergleicht sie mit
einer festgehaltenen Fassung: **130 Signaturen**. Verschwindet oder ändert
sich eine, fällt der Lauf. Neue dürfen dazukommen — die Schicht darf wachsen,
nur nicht schrumpfen.

Damit ist „die Ansichten werden nicht angefasst" keine Absichtserklärung mehr,
sondern eine Prüfung. Reine Typ-Exporte stehen bewusst nicht drin: sie kämen
als `any` heraus und sagten damit nichts zu; ändert sich ein Typ, bricht
ohnehin der Typprüfer an jeder Ansicht, die ihn benutzt.

### Feldnamen: mechanisch, aber bewacht

Die App spricht `camelCase`, Postgres `snake_case`. Umgerechnet wird
mechanisch — und `tests/supabase/felder.test.ts` prüft, dass **jede** echte
Spalte **jeder** echten Tabelle den Hin- und Rückweg unverändert übersteht und
dass keine zwei Spalten auf demselben Feld landen. Der Test kennt keine Liste,
er fragt die Datenbank.

### Drei Entscheidungen im Abonnement, jede aus einem Fehlschlag

Das Abonnement ist der heikelste Teil der Taille, weil Firestore hier zwei
Dinge in einem lieferte, die jetzt getrennt sind.

1. **Erst abonnieren, dann holen.** Wer zuerst holt, verliert alles, was
   dazwischen passiert.
2. **Was während des Holens hereinkommt, wird gepuffert.** Zwischen dem Abzug
   und dem Bereitmelden liegt ein Fenster.
3. **Einmal wird nachgefasst.** Der unangenehme Teil: `SUBSCRIBED` sagt, dass
   der Kanal steht, nicht dass das Abonnement serverseitig hört. Von aussen
   ist dieser Zustand nicht beobachtbar. Also wird nach 1,2 Sekunden ein
   zweites Mal geholt.

Punkt 3 ist nicht aus Vorsicht entstanden, sondern aus einem roten Lauf: ohne
ihn flatterten zwei Prüfungen. Ein Flattern im Test heisst draussen, dass die
Liste des Monteurs manchmal unvollständig ist, ohne dass es jemand merkt.

Ein erster Versuch, das Fenster künstlich aufzureissen, ist verworfen: er
verlor die Meldung an die Anlaufzeit des Abonnements statt an das Fenster und
bewies damit das Falsche. Geprüft wird jetzt mit einem **gestellten Kanal**,
der meldet, was der Test sagt, und wann der Test es sagt — damit hängen die
Prüfungen an meiner Ablauflogik und nicht an der Tagesform des Meldewegs.

### Stand

| | |
|---|---|
| Prüfungen gegen die echte Datenbank | 228 |
| festgenagelte Signaturen der Datenschicht | 130 |
| Mutationen angesetzt | 13 |
| beim ersten Anlauf gefangen | 9 |
| echte Lücken durch die vier übrigen | 4 |

Der Lauf ist viermal hintereinander grün.

### Als Nächstes

Die zwanzig Module, eines nach dem anderen, jedes mit eigenen Prüfungen gegen
die echte Datenbank. Die 35 Durchstich- und 35 Abfrageprüfungen kommen dabei
mit — sie hängen an genau dieser Schicht.

---

## Stufe 3, zweiter Teil: sieben Module stehen

12.09.2026. Umgestellt sind **Kunden, Baustellen, Zeiten, Material,
Anforderungen, Einsatzplanung und Rüstliste** — jedes nach demselben Schnitt:
`db/x.ts` ist nur noch die Weiche, `db/fs/x.ts` die Firestore-Fassung,
`db/pg/x.ts` die Postgres-Fassung. Dreizehn Module fehlen noch.

### Wo der Umzug die Sache wirklich vereinfacht

Zwei Vorgänge waren in Firestore Batches, die nur deshalb hielten, weil
niemand sie unterbrach:

* **Einteilung speichern** war „alle löschen, dann alle schreiben". Brach die
  Verbindung dazwischen ab — auf der Baustelle keine Seltenheit —, war der
  Tag für diese Baustelle leer, und niemand erfuhr davon. Jetzt ist es
  `public.einsatz_speichern`: eine Transaktion, die ganz durchgeht oder gar
  nichts tut. Geprüft wird das mit einer Zeile, die absichtlich scheitert;
  die alte Einteilung muss danach unverändert dastehen.
* **Rüstliste speichern** zieht die Mitarbeiterliste des Einsatzes mit. An
  ihr hängt die Entscheidung, ob ein Monteur abhaken darf. Liefe das
  Nachziehen getrennt, sähe ein neu eingeteilter Kollege das Material und
  käme beim Antippen nicht durch.

### Aus einem Dokument werden zwei Tabellen

Die Rüstliste lag in Firestore als ein Dokument mit einem Array darin. Jetzt
ist eine Position eine Zeile. Das ist besser und verlangt drei Dinge, die
alle drei eine eigene Prüfung haben:

1. **Die Kennung einer Position kommt vom Gerät** und wird übernommen. An ihr
   hängt die Abhakliste `geladen`. Vergäbe die Datenbank eigene Kennungen,
   verlöre jedes Speichern der Planung sämtliche Haken der Monteure — und die
   Liste sähe danach einfach unabgehakt aus.
2. **Die Kennung ist Text, kein UUID.** Sie entsteht im Browser und sieht aus
   wie `pmf3k2x9abcd`. Sie auf UUID zu zwingen hiesse, beim Umzug jede
   bestehende Position UND jeden Schlüssel in `geladen` gemeinsam
   umzuschreiben; ginge dabei ein Paar auseinander, stünde der Haken am
   falschen Artikel. Der Gewinn wäre ein hübscherer Datentyp.
3. **Die Reihenfolge steht in einer Spalte.** Im Dokument war sie der Platz
   im Array. Die Prüfung dafür sortiert bewusst um — dass frisch angelegte
   Zeilen in Schreibreihenfolge zurückkommen, beweist nichts.

### Das Abonnement der Rüstliste hört am Kopf

Es beobachtet die Kopftabelle und holt bei jeder Meldung den ganzen Tag neu.
Das trägt nur, solange **jedes** Schreiben den Kopf berührt — und genau das
steht auf dem Prüfstand: eine Änderung, die nur eine Menge betrifft, muss
ankommen. Gäbe es einen Weg, eine Position ohne den Kopf zu ändern, bliebe
die Planungsansicht stumm.

### Ein Export ist entfallen

`einsatzMaterialId` steht nicht mehr an der Weiche. Die berechenbare
Dokumentkennung ist ein Firestore-Kunstgriff; in Postgres gibt es sie nicht.
Eine Weiche, die unter einer Datenquelle etwas Falsches zurückgibt, ist
schlimmer als keine. Die Funktion lebt jetzt in `fs/einsatzMaterial.ts`, wo
sie gebraucht wird und stimmt. Der Vertragswächter hat den Wegfall gemeldet,
wie er soll; die festgehaltene Fassung ist bewusst nachgezogen worden.

### Der Wächter war blind — schon wieder

`abfragegrenzen.test.ts` prüft, dass jede Abfrage eine Grenze hat. Sein
Muster für die Postgres-Schicht verlangte eine Klammer unmittelbar hinter
`abfragen`. Die Aufrufe tragen aber fast alle eine Typangabe —
`abfragen<Assignment>(…)`. **Fünfundzwanzig Postgres-Abfragen waren damit
unbewacht**, und der Test meldete grün; die eigens eingebaute Prüfung „findet
Abfragen in `fs/` UND in `pg/`" war erfüllt, weil eine Handvoll Abfragen
ohne Typangabe durchrutschte.

Aufgefallen ist es nur, weil die Mindestzahl nachgezogen werden sollte und
dabei auffiel, dass sie sich durch zwei neue Module nicht bewegt hatte. Die
Zahl steht jetzt auf **74** statt 49. Dass alle fünfundzwanzig Abfragen
tatsächlich eine Grenze tragen, war Glück im Unglück — geprüft war es nicht.

Das ist das zweite Mal, dass dieser Wächter still weniger bewacht hat als
gedacht. Die Lehre bleibt dieselbe und steht jetzt zweimal im Kopf der Datei.

### Stand

| | |
|---|---|
| Module umgestellt | 7 von 20 |
| Prüfungen `npm test` | 1629 |
| Prüfungen gegen die echte Datenbank | 307 |
| Prüfungen gegen den Firestore-Emulator | 225 |
| bewachte Abfragen | 74 |
| Mutationen für Einsatzplanung und Rüstliste | 8 |
| davon gefangen | 8 |
| echte Lücken, die sie aufgedeckt haben | 2 |

Die zwei Lücken: die Reihenfolgeprüfung hätte ein Speichern ohne
Sortierspalte durchgehen lassen, und die Hakenprüfung hätte nicht bemerkt,
dass ein Haken ins Leere zeigt. Beide sind geschlossen.

### Als Nächstes

Urlaub, Handwerksscheine, Rechnungen, Angebote, Wartungen, Nachfassungen,
Belegschaft, Firmeneinstellungen, Voreinstellungen, Nachtläufe,
Monatsbilanzen und Scheinfotos — dann fällt `core.ts`.
