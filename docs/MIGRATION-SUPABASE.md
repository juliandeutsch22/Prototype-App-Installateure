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
| `urlaubEntscheiden`, `scheinVorbereiten`, `exportCompanyData` | `security definer`-Funktionen in der Datenbank (siehe Stufe 5, dritter bis fünfter Teil) |
| `betriebAnlegen`, `voiceExtract`, `datenAusleitungJetzt`, `bilanzenNeuAufbauen` | Edge Functions |
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
| festgenagelte Signaturen der Aussenseite | 136 |
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
| Module umgestellt | 18 von 18 |
| Prüfungen `npm test` | 1649 |
| Prüfungen gegen die echte Datenbank | 427 |
| Prüfungen gegen den Firestore-Emulator | 225 |
| bewachte Abfragen | 93 |
| Mutationen seit Beginn von Stufe 3 | 56 |
| davon gefangen | 56 |
| echte Lücken, die sie aufgedeckt haben | 2 |

Die zwei Lücken: die Reihenfolgeprüfung hätte ein Speichern ohne
Sortierspalte durchgehen lassen, und die Hakenprüfung hätte nicht bemerkt,
dass ein Haken ins Leere zeigt. Beide sind geschlossen.

### Urlaub: ein Nachfilter verschwindet, eine Regel wird ehrlicher

Acht Module stehen. `listApprovedVacationsInRange` hat unter Firestore die
zweite Bedingung im Browser geprüft, weil Bereichsfilter nur auf EINEM Feld
laufen — also **nach** der Obergrenze. Die Grenze konnte damit Zeilen
wegschneiden, die der Nachfilter ohnehin verworfen hätte: die Liste war
kürzer als nötig, ohne dass es auffiel. Postgres nimmt beide Bedingungen, die
Grenze greift jetzt auf die richtige Menge.

**Und ein Befund, der keiner Datenbank anzulasten ist.** Eine Prüfung,
geschrieben nach dem Kommentar im Schema („über den eigenen Urlaub
entscheidet man nicht selbst"), schlug fehl: die Geschäftsführung genehmigt
ihren eigenen Antrag sehr wohl. Nachgesehen in `firestore.rules` — dort war
es immer schon so. `darfUrlaubEntscheiden()` fragt, WER entscheiden darf,
nicht ÜBER WESSEN Antrag.

Geändert wurde das Verhalten nicht: der Umzug soll nichts still verschieben.
Geändert wurde der Kommentar, der etwas zusagte, was die Regel nie hielt. Das
Verhalten ist jetzt festgehalten, damit es nicht unbemerkt kippt.

**Ob der Betrieb ein Vier-Augen-Prinzip für Urlaubsanträge will, ist eine
Entscheidung für den Betrieb.** Sie steht offen.

### Der Handwerksschein: aus einem Dokument werden vier Tabellen

Zeiten, Material und Fotos lagen als Arrays im Schein. Jetzt sind es eigene
Zeilen — und damit gilt dasselbe wie bei der Rüstliste, nur schärfer: Kopf und
Positionen müssen **zusammen** geschrieben werden. Ein Kopf ohne seine
Stunden wäre ein halber Beleg, und wird in genau diesem Augenblick
unterschrieben, ist er für immer halb. `public.schein_speichern` erledigt
beides in einer Transaktion.

**Die Spaltenliste dieser Funktion ist ein Riegel, kein Zufall.** Sie nennt
genau die Felder, die ein Entwurf ändern darf. `status`, die Unterschriften,
`inhalt_hash` und `unterschrieben_am` stehen nicht darauf — sie sind kein
Inhalt, sondern der Zustand des Belegs, und der wechselt über eigene Wege,
die ein Trigger beurteilt. Damit kann der Inhaltsweg einen Schein weder
unterschreiben noch stornieren, egal was ihm übergeben wird.

Eine Prüfung dazu ist zweimal umgeschrieben worden, und der Grund gehört
festgehalten: Client und Datenbank sieben beide. Über den Modulweg geprüft
blieb sie grün, egal welche der beiden Seiten ich kaputtmachte — sie sagte
also nichts. Jetzt stellt sie den Datenbankaufruf von Hand und prüft die
Spaltenliste allein.

### `null` ist nicht dasselbe wie „nicht da"

Firestore kannte nur „Feld nicht da". Postgres hat eine Spalte mit `null`. Die
App-Typen sagen `notizen?: string` und nicht `string | null`, und der Umweg
über `as T` lässt den Typprüfer diese Lüge nicht sehen.

`zeileAlsObjekt` lässt leere Spalten deshalb weg — an einer Stelle, für alle
Module. Beim SCHREIBEN bleibt `null` erhalten: „ausdrücklich geleert" ist eine
Absicht, „nicht mitgeschickt" eine andere. Gelesen bedeuten beide dasselbe.

Aufgefallen ist es an einer einzigen Prüfung, die `undefined` erwartete und
`null` bekam. Es hätte jedes der acht bereits umgestellten Module betroffen.

### Der Wächter kann jetzt zwischen einer Zeile und einer Liste unterscheiden

`getWorkSheet` holt genau eine Zeile (`.maybeSingle()`), trägt aber ein
`.select(` und verlangte damit eine Grenze. Die bequeme Antwort wäre eine
Ausnahmeliste gewesen — also eine Liste, die jemand pflegen muss. Stattdessen
kennt der Wächter jetzt den Unterschied: `.single()` und `.maybeSingle()` sind
die Entsprechung zu `getDoc(doc(…))` und können per Definition nicht wachsen.
Steht daneben ein echter Mehrzeilen-Aufruf, zählt der.

### Rechnung und Angebot: der Nummernkreis wandert in die Datenbank

Elf Module stehen. Die Rechnung ist wieder ein Kopf plus zwei Tabellen
(Positionen und Abdeckung), zusammen geschrieben — eine Rechnung ohne
Positionen wäre eine Rechnung über nichts, mit einer verbrauchten Nummer, die
sich nach § 132 BAO auch nicht mehr wegräumen lässt.

**Der Zähler in der Datenbank konnte weniger als die Datenschicht.** Er zählte
hoch, und das war alles. Drei Dinge fehlten, jedes mit einem Grund im Betrieb:

* **Altbestand.** Ein Betrieb, der die App einführt, steht nicht bei null.
  Ohne Startwert finge sein Nummernkreis wieder von vorne an — zwei Rechnungen
  mit derselben Nummer.
* **Wunschnummer.** Wer von Hand eine höhere Nummer setzt, führt bewusst
  seinen bestehenden Kreis fort. Eine verbrauchte Nummer wird abgelehnt, und
  der Fehlertext nennt die nächste freie.
* **Der Start bei 1001.** „RE-2026-0001" sieht nach der ersten Rechnung des
  Betriebs aus. Das ist eine Auskunft an jeden Kunden, die niemand geben will.

Diese Regeln standen in `lib/invoiceNumbers` und galten damit nur für den, der
durch die App ging. Jetzt stehen sie in der Datenbankfunktion. Fünf bestehende
Prüfungen erwarteten den alten Zählerstart und sind nachgezogen worden —
ausdrücklich, mit dem Grund im Kommentar, nicht stillschweigend.

**Storno und Storno-Aufhebung holen sich die betroffenen Belege aus der
Abdeckung, nicht aus dem Aufruf.** Eine unvollständige Liste hinterliesse
genau den halben Zustand, den die Klammer verhindern soll: Rechnung storniert,
Stunden weiter gesperrt — Geld, das nie wieder eingefordert wird. Die
Firestore-Fassung war hier auf 500 Schreibvorgänge je Stapel begrenzt; diese
Grenze fällt weg.

Beim Angebot ist der Unterschied zwischen „leer" und „nicht mitgeschickt" die
ganze Prüfung wert: ein Statuswechsel darf weder die Kalkulation abräumen noch
einen Nachlass löschen, den der Kunde schriftlich hat. Eine Mutation ist an
meiner ersten Fassung dieser Prüfung vorbeigekommen — sie sah nur die
Positionen an.

### Ein Schreibvorgang, der nichts trifft, ist ein Fehler

Vierzehn Module stehen. Der wichtigste Fund dieser Runde ist kein Modul,
sondern eine Eigenschaft der Taille — und er betrifft alle vierzehn.

Firestore WARF, wenn ein Dokument fehlte oder die Regeln es verwehrten. Der
Zeilenschutz antwortet anders: eine Zeile, die man nicht anfassen darf, ist
für die Anweisung schlicht nicht da. PostgREST meldet dann keinen Fehler,
sondern null geänderte Zeilen — und der Aufrufer sieht einen geglückten
Schreibvorgang.

Draussen hiesse das: die Verwaltung ändert die Wochenstunden eines
Mitarbeiters, bekommt „gespeichert" und sieht beim nächsten Laden den alten
Wert. Oder ein Urlaubsantrag wird „zurückgezogen" und steht am nächsten Tag
wieder da. Kein Fehler, keine Meldung, kein Hinweis.

`aendern` und `loeschen` zählen jetzt die betroffenen Zeilen und melden
„nichts getroffen" als Fehler. Ein Aufruf, in dem jedes Feld `undefined` war,
ist davon ausgenommen: er wollte nichts ändern und darf nicht daran
scheitern.

Aufgefallen ist es an einer einzigen Prüfung — ein Monteur, der seine eigene
Rolle hochsetzt und dafür keine Fehlermeldung bekam.

### Der Vertragswächter hatte zwei eigene Löcher

**Durchgereichte Exporte fielen heraus.** `export { x } from './y'` liefert
dem Compiler ein Alias und keinen Wert; die Prüfung liess solche Exporte
stillschweigend aus dem Vertrag fallen. Neun Namen waren betroffen, darunter
die Rechennamen der Rechnungsnummern und die Vorgaben der Belegschaft — alles
Dinge, die Ansichten importieren. Die Zahl im Wächter über dem Wächter steht
jetzt auf 143 statt 123, ohne dass ein einziger Export hinzugekommen wäre.

**Eine Zeile trug den absoluten Pfad dieses Rechners.** In einer
festgehaltenen Fassung ist das eine Zeitbombe: auf jedem anderen Rechner
fiele die Prüfung aus einem Grund, der mit der Datenschicht nichts zu tun
hat.

Zugleich ist der Vertrag auf das eingegrenzt, was er zusagt: die
AUSSENSEITE. `fs/` und `pg/` sind das Innere, das diese Stufe gerade
austauscht; es festzunageln hiesse, die Fassung bei jedem Modul nachzuziehen
— und eine Fassung, die dauernd nachgezogen wird, sagt bald gar nichts mehr.

### Wartung: noch ein Nachfilter verschwindet

`listFaelligeWartungen` filterte ruhende Vereinbarungen im Browser, weil eine
Firestore-Abfrage Dokumente nicht findet, denen das Feld ganz fehlt. Eine
Spalte kann nicht fehlen. Die Bedingung steht jetzt in der Abfrage, und damit
greift die Obergrenze auf die richtige Menge.

Eine bestehende Prüfung des Abonnements hat dabei geflattert: sie wartete auf
die ZAHL der Meldungen statt auf deren Inhalt, und das Nachfassen meldet
ohnehin einen zweiten Stand. Sie wartet jetzt auf den Inhalt.

## Stufe 3 ist durch: achtzehn Module, und `core.ts` ist leer

12.09.2026. Alle achtzehn Datenmodule sind Weichen; das Innere liegt in `fs/`
und `pg/`. Keine Ansicht ist angefasst worden.

### Ein ganzer Nachtlauf verschwindet

Die Monatsbilanzen waren in Firestore ein nächtlich vorgerechneter Bestand.
Fiel der Lauf aus, war eine fehlende Bilanz von einem Monat ohne Buchungen
nicht zu unterscheiden — und wer sie ungeprüft summierte, bekam einen zu
niedrigen Saldo, ohne Meldung, und die Zahl ging auf den Lohnzettel. Dagegen
gab es den Vollständigkeits-Marker und den Rückfall auf die direkte Rechnung.

`monthly_stats` ist eine Sicht über die Zeitbuchungen. Sie kann nicht
unvollständig sein: sie IST die direkte Rechnung, nur in der Datenbank statt
im Browser. Der Marker bleibt trotzdem stehen und antwortet „vollständig, von
Anfang an" — die Ansicht fragt ihn, und eine Weiche, die unter der einen
Datenquelle etwas anderes antwortet als unter der anderen, wäre schlimmer als
eine Zeile Code.

### Ein Spaltenname, der stillschweigend nichts geliefert hätte

`system_laeufe.ausser_haus` hiess in der App seit jeher `zielExtern`. Die
Umrechnung zwischen beiden Welten ist mechanisch; eine Spalte, die anders
heisst, fällt heraus und kommt als Feld an, nach dem niemand fragt. Die
Ansicht hätte dann nichts über den Ablageort der Sicherung gesagt — und
„nichts behauptet" sieht aus wie „in Ordnung". Die Spalte heisst jetzt wie die
Sache.

### `core.ts` trägt nur noch die Kennung

Zwanzig Ansichten importieren `WithId` von dort. Solange die Firestore-Helfer
danebenstanden, zog jede von ihnen das Firestore-SDK in ihren Typgraphen, und
der Rückbau in Stufe 7 hätte an zwanzig Stellen angefangen statt an einer. Die
Helfer liegen jetzt in `fs/core.ts`, `core.ts` erklärt eine Typzeile, und ein
Wächter hält fest, dass die Mitte der Datenschicht keine der beiden Datenbanken
kennt.

Die einzige benannte Ausnahme ist `scheinFotos.ts` — Bilder gehen in den
Speicher und nicht in die Datenbank; das zieht in Stufe 6 um. Die Ausnahme
steht mit Datum im Wächter, damit sie auffällt, wenn sie stehen bleibt.

### Stand nach Stufe 3

| | |
|---|---|
| Module umgestellt | 18 von 18 |
| Prüfungen `npm test` | 1649 |
| Prüfungen gegen die echte Datenbank | 427 |
| Prüfungen gegen den Firestore-Emulator | 225 |
| bewachte Abfragen | 93 |
| festgenagelte Signaturen der Aussenseite | 136 |
| Mutationen in Stufe 3 | 56 |
| davon gefangen | 56 |

### Was Stufe 3 NICHT umfasst

* **Die fünfzehn Cloud Functions.** Sie schreiben weiter nach Firestore; das
  ist Stufe 5.
* **Fotos und Push.** Firebase Storage und FCM bleiben bis Stufe 6.
* **Die 35 Durchstich- und 35 Abfrageprüfungen.** Sie laufen gegen den
  Firestore-Emulator und prüfen die Weichen von aussen — sie ziehen erst
  um, wenn die Datenquelle umgeschaltet wird (Stufe 8).
* **Der Rückbau.** Die Narben — der Vollständigkeits-Marker, die
  Obergrenzen, die gespiegelten Namensfelder — stehen noch. Sie fallen in
  Stufe 7, und erst dann zahlt sich der Umzug in der Oberfläche aus.

### Als Nächstes

Stufe 4: die Abonnements in der Oberfläche gegen den echten Stack fahren.
Danach die Functions.

---

## Stufe 4: die elf Abonnements, gemessen

12.09.2026. Ein Abonnement ist die einzige Stelle, an der ein Fehler nicht zu
einer Fehlermeldung führt, sondern zu **Stille**. Die Ansicht steht da und
zeigt einen Stand von vor zehn Minuten; niemand sieht einen Fehler, weil
keiner passiert ist.

Vor dieser Stufe hatten sechs der elf Abonnements eine Zustellprüfung, fünf
nicht. Jetzt haben alle elf dieselbe: eine Änderung NACH dem Anmelden kommt
an. Der erste Bestand kommt aus einer gewöhnlichen Abfrage und sagt über den
Meldeweg nichts.

### Die Mandantengrenze hält der Zeilenschutz, nicht der Kanalfilter

Eine Mutation kam durch: nimmt man dem Kanal den Filter `company_id=eq.…`
weg, bleibt „ein fremder Betrieb kommt nie an" trotzdem grün. Das ist die
richtige Antwort — der Meldeweg wertet den Zeilenschutz je Zeile UND je
Empfänger aus. Der Filter spart Meldungen, er zieht keine Grenze.

Davon hängt ab, wie gefährlich eine Änderung am Kanal ist. Wäre der Filter die
Grenze, wäre jede Änderung daran eine Sicherheitsänderung. Eine eigene Prüfung
meldet den Kanal jetzt VON HAND ohne Filter an und hält fest, dass die fremde
Zeile trotzdem nie ankommt — und die eigene sehr wohl.

Dieselbe Messung beantwortet die Frage, an der Gesundheitsdaten hängen: ein
Monteur, der ohne Personenfilter abonniert, bekommt die Krankmeldung eines
Kollegen **nicht**. Das ist eine Zusage von Supabase; eine Zusage dieser
Tragweite wird gemessen und nicht geglaubt.

### Was die Last ergeben hat

| Messung | Ergebnis |
|---|---|
| 20 Buchungen auf einmal, unmittelbarer Meldeweg | alle 20 kommen an |
| 10 Speichervorgänge an einer Rüstliste | 20 rohe Meldungen, 4 Nachladungen |

Der unmittelbare Weg trägt also auch für die langen Abonnements; eine Meldung
aus dem Datenbank-Trigger ist nicht nötig. Für die zusammengesetzten
Abonnements — Rüstliste und Rechnungsliste, die bei jeder Meldung den ganzen
Stand neu holen — zahlt sich das Zusammenfassen aus: aus zwanzig Meldungen
werden vier Nachladungen.

### Der Fund: eine Positionskennung, die zu weit reichte

Die Lastmessung hat einen Fehler aufgedeckt, der kein Testartefakt ist.

`einsatz_material_positionen.id` war betriebsweit eindeutig. Die Kennung kommt
aber vom Gerät und meint „diese Position IN DIESER Liste" — genauso ist
`geladen` abgelegt. Traf dieselbe Kennung ein zweites Mal, änderte das
Speichern die Zeile der ERSTEN Liste, ohne sie umzuhängen: **die zweite Liste
stand leer da.** Kein Fehler, keine Meldung. Der Kopf ist da, die Positionen
fehlen, und der Monteur fährt ohne Material los.

Ein Zusammentreffen ist unwahrscheinlich — die Kennung trägt einen Zeitstempel
und fünf Zufallszeichen. „Unwahrscheinlich und lautlos" ist aber die
schlechteste Kombination, die ein Fehler haben kann. Der Schlüssel ist jetzt
das Paar aus Liste und Kennung.

### Stand nach Stufe 4

| | |
|---|---|
| Abonnements mit Zustellprüfung | 11 von 11 |
| Prüfungen gegen die echte Datenbank | 446 |
| Prüfungen `npm test` | 1649 |
| Prüfungen gegen den Firestore-Emulator | 225 |
| Mutationen dieser Stufe | 4 |
| davon gefangen | 3 |

Die vierte kam durch und war der Befund über die Mandantengrenze — eine
Mutation, die nichts kaputtmacht, weil sie nur eine Abkürzung entfernt. Sie
hat eine Prüfung nach sich gezogen, die das festhält.

### Als Nächstes

Stufe 5: die fünfzehn Cloud Functions.

---

## Stufe 5, erster Teil: die Prüfsumme wird ein Trigger

12.09.2026. `scheinPruefsumme` war eine Cloud Function, die nach dem
Schreiben ansprang. Jetzt ist sie ein Trigger — und das ist mehr als ein
Ortswechsel.

### Der Gewinn ist die Lückenlosigkeit

Die Function lief NACH dem Schreibvorgang und in einem eigenen Lauf. Der
Trigger läuft in derselben Transaktion und fängt **jeden** Weg: ein Schein,
der an `schein_unterschreiben` vorbei unterschrieben wird — eine schlichte
Anweisung auf die Tabelle reicht dafür —, bekommt seine Prüfsumme trotzdem.

### Die Kanonisierung musste zeichengenau werden

Der Hash entsteht über einer Zeichenkette, und die muss auf beiden Seiten
dieselbe sein. Sonst lässt sich ein Schein, der unter Firestore
unterschrieben wurde, nach dem Umzug nicht mehr nachrechnen — und der Beleg
ist genau dort wertlos, wo er beweisen soll.

Drei Stellen, an denen Postgres und JavaScript auseinandergehen:

* **Zahlen.** `numeric(12,3)` schreibt sich als „2.500", JavaScript schreibt
  „2.5". Ohne Angleichung wäre fast jede Prüfsumme verschieden.
* **Ränder.** `trim()` schneidet in JavaScript mehr ab als Leerzeichen —
  Tabulator, Zeilenumbruch, geschütztes Leerzeichen, Byte-Order-Mark.
* **Die Reihenfolge der Fotos.** Sie ist Teil des Belegs, hatte aber keine
  Spalte. Ohne sie müsste die Datenbank nach etwas anderem sortieren, und
  sobald Hochlade- und Pfadreihenfolge auseinandergehen, stimmt die
  Prüfsumme eines alten Scheins nicht mehr.

Geprüft wird das nicht durch Hinsehen: zwölf Prüfungen rechnen denselben
Schein **in der Datenbank und in JavaScript** und vergleichen die beiden
Hashes. Drei Mutationen an der Kanonisierung fallen damit sofort auf.

### Zwei Funde beim Schreiben dieser Prüfungen

**Der Riegel wies die Prüfsumme ab.** Ein unterschriebener Schein ist zu —
das schloss den Nachtrag des Hashes ein. Unter Firestore lief die Berechnung
über das Admin-SDK und damit an den Regeln vorbei; in Postgres gibt es
diesen Weg nicht, und das ist gut so. Die Ausnahme lautet deshalb nicht „der
Trigger darf", sondern: es darf sich ausschliesslich `inhalt_hash` ändern, er
muss vorher leer gewesen sein, und der neue Wert muss der **richtige** sein.
Ein Kennzeichen „ich bin der Trigger" hätte geprüft, WER schreibt, statt WAS
geschrieben wird.

**Ein Entwurf konnte eine Prüfsumme mitbringen.** Der Nachtrag springt nur
an, wenn das Feld leer ist. Am Entwurf war jede Änderung erlaubt — er ist ja
in Arbeit. Ein Monteur konnte also am Entwurf eine ausgedachte Prüfsumme
eintragen und danach unterschreiben: der Trigger sah ein gefülltes Feld,
rechnete nicht nach, und auf dem Beleg stand eine Zahl, die der Client sich
selbst gegeben hatte. Genau das, was die Prüfsumme ausschliessen soll. Jetzt
gilt: ein Entwurf hat keine Prüfsumme, und was der Client hineinschreibt,
wird beim Speichern verworfen.

### Drei Functions fallen ersatzlos weg

`bilanzNachziehen`, `bilanzenNachtlauf` und `bilanzenNeuAufbauen` haben die
Monatsbilanzen gepflegt. Die sind jetzt eine Sicht. Es gibt nichts mehr
nachzuziehen, nichts nachts zu rechnen und nichts neu aufzubauen.

### Eine offene Zeile, benannt

Der Vergleich mit `app.schein_hash` in der Ausnahme ist die ZWEITE Sperre.
Eine Mutation hat gezeigt, dass ohne ihn nichts kaputtgeht — die erste Sperre
schliesst schon. Das Fenster „unterschrieben, Hash leer" ist von aussen nicht
erreichbar; eine Prüfung dafür gibt es deshalb nicht. Der Vergleich bleibt
trotzdem stehen: er trägt genau dann, wenn die Berechnung einmal fehlschlägt.

### Stand

| | |
|---|---|
| Functions umgestellt oder entfallen | 4 von 15 |
| Prüfungen gegen die echte Datenbank | 458 |
| Mutationen dieses Teils | 6 |
| davon gefangen | 5 |

### Als Nächstes

`syncUserClaims` und `plattformAdminClaim` als Trigger auf `auth.users`,
dann `pg_cron` für die beiden Nachtläufe und die Edge Functions.

---

## Stufe 5, zweiter Teil: die Ansprüche im Token

12.09.2026. `syncUserClaims` und `plattformAdminClaim` sind Trigger. Daran
hängt alles: `app.betrieb()`, `app.rolle()` und `app.aktiv()` lesen die
Ansprüche, und jede einzelne Richtlinie fragt diese drei.

### Das Fenster, das es nicht mehr gibt

Gemessen, nicht vermutet: **nach dem Deaktivieren konnte das bereits
ausgestellte Token bis zu einer Stunde weiterlesen und weiterschreiben.** Das
Konto war gesperrt, die Sitzung gelöscht, das Erneuern abgewiesen — aber ein
Zugangstoken trägt seine Ansprüche in sich, und darin stand `active: true`.

Unter Firestore war es genauso. Der Kommentar dort sprach von drei Riegeln;
der dritte („der `active`-Claim, den die Regeln prüfen") hat dieses Fenster
nie geschlossen, weil das alte Token den alten Anspruch trägt.

In Postgres lässt es sich schliessen, und zwar billig: `app.aktiv()` fragt
jetzt die Belegschaft statt das Token — ein Zugriff über den
Primärschlüssel. Firestore konnte das nicht; dort hätte jede Regelprüfung
eine gezählte Leseoperation gekostet.

Der Anspruch im Token bleibt die zweite Antwort: für Konten ohne Zeile in der
Belegschaft — ein Plattformkonto etwa — gilt weiter, was im Token steht.

### `infinity` ist ein gültiger Zeitstempel und trotzdem falsch

Die Kontosperre war zuerst `banned_until = 'infinity'`. Postgres nimmt das an;
der Anmeldedienst liest die Spalte in einen Zeittyp, der es nicht kennt — und
antwortete danach auf **jeden** Anmeldeversuch mit einem Serverfehler, auch
bei Konten, die gar nicht gesperrt waren. Eine Sperre, die die Anmeldung des
ganzen Betriebs lahmlegt, wäre ein teurer Weg, einen Mitarbeiter
auszusperren. Jetzt sind es hundert Jahre.

### Die Prüfung hat zwei Fragen vermischt

Das Testkonto „gesperrt" wurde bisher deaktiviert ANGELEGT und meldete sich
dann an. Das geht nicht mehr — und das ist der Punkt. Die beiden Fragen
gehören getrennt:

* Kommt ein gesperrtes Konto überhaupt herein? Nein, die Anmeldung wird
  abgewiesen.
* Greifen die Regeln bei einem Konto, das während der Sitzung deaktiviert
  wird? Ja, sofort.

Der Helfer legt jetzt aktiv an, meldet an und deaktiviert danach — der
wirkliche Ablauf.

### Ein Zwitterkonto gibt es in keine Richtung

Wäre dieselbe Kennung Plattformkonto UND in einem Betrieb, entschiede allein
die Reihenfolge der beiden Trigger, welche Ansprüche am Ende stehen — und mit
einem Betrieb im Token greift jede Leseregel. Beide Richtungen sind jetzt
gesperrt, und wer aus einem Betrieb ausscheidet und Plattformkonto wird,
nimmt dessen Ansprüche nicht mit.

Anders als bisher wird das nicht protokolliert und durchgelassen, sondern
abgelehnt. Eine Zeile, die etwas behauptet, was nicht gilt, ist schlimmer als
eine Fehlermeldung.

### Eine Zeile ist entfallen, weil sie unerreichbar war

Eine Mutation hat gezeigt, dass das Wegräumen des Plattform-Anspruchs auf der
Belegschaftsseite nie greift: der Riegel in der Gegenrichtung lässt eine
Plattformkennung gar nicht erst hinein. Sie ist gestrichen. Eine Zeile, die
nie greift, ist keine zweite Sicherung — sie ist eine Behauptung, die niemand
prüfen kann.

### Stand

| | |
|---|---|
| Functions umgestellt oder entfallen | 6 von 15 |
| Prüfungen gegen die echte Datenbank | 470 |
| Mutationen dieses Teils | 6 |
| davon gefangen | 5 |

### Als Nächstes

`pg_cron` für die beiden Nachtläufe, dann die sieben Edge Functions und die
beiden Push-Meldungen.

## Stufe 5, dritter Teil: Urlaub entscheiden

13.09.2026. `urlaubEntscheiden` war als Edge Function eingeplant. Sie ist
keine geworden: die Function tut nichts, was ausserhalb der Datenbank
passieren müsste — sie liest Zeiteinträge, schreibt Zeiteinträge und setzt
einen Status. Als `security definer`-Funktion läuft dasselbe in EINER
Transaktion statt in einem Stapel, den ein Abbruch halb stehen liesse.

### Warum das überhaupt serverseitig bleibt

Der Genehmigende muss zwei Dinge tun, die er selbst nicht darf: fremde
Zeiteinträge LESEN (um bereits gebuchte Tage nicht zu überschreiben) und
fremde Zeiteinträge SCHREIBEN. Zeiteinträge tragen Kranken- und Urlaubstage
und damit Gesundheitsdaten nach Art. 9 DSGVO.

Solange nur Buchhaltung und Leitung genehmigen durften, fiel das nicht auf —
sie dürfen beides ohnehin. Sobald die Geschäftsführung frei festlegt, WER
genehmigt (etwa eine Bürokraft), ginge es nicht mehr. Die Funktion gibt
deshalb nur vier Zahlen zurück: Status, angelegt, übersprungen, entfernt. Ein
eigener Test hält das fest.

### Die Feiertagsrechnung steht jetzt zweimal da

`shared/feiertage.ts` rechnet im Browser, `app.urlaubstage` in der Datenbank.
Das ist eine Doppelung, und sie ist gefährlich: liefen beide auseinander,
bekäme ein Monteur für eine Woche mit Feiertag fünf Tage abgezogen und hätte
trotzdem einen Tag als „nicht gebucht" offen — bemerkt würde es an einem
Urlaubskonto, das am Jahresende nicht aufgeht.

Zusammengehalten werden sie nicht durch Hinsehen: `tests/supabase/urlaub.test.ts`
lässt beide Fassungen über **zehn Jahre und vier Wochenmodelle** rechnen und
vergleicht Tag für Tag. Gauß/Butcher steht in SQL als CTE-Kette, Zeichen für
Zeichen wie in `getEasterDate`; `extract(dow)` zählt wie `getDay()`, also
Sonntag als 0.

Die Datenbankfassung steht zusätzlich als `public.urlaubstage` offen. Nicht
für die Prüfungen, sondern weil sie die Naht ist, an der der Browser eines
Tages aufhört, selbst zu rechnen.

### 480 ist keine Grenze von Postgres mehr

Die Function brach bei mehr als 480 Tagen ab, weil in einen
Firestore-Stapel 500 Schreibvorgänge passen. Postgres kennt diese Grenze
nicht. Geblieben ist die Zahl trotzdem — als Plausibilitätsprüfung: zwei
Jahre Urlaub am Stück ist ein Tippfehler im Datum, und ein Tippfehler soll
nicht hunderttausend Zeilen schreiben.

### Zwei Mutationen sind durchgekommen

**Die Berechtigungsprüfung liess sich entfernen, ohne dass ein Test rot
wurde.** Abgewiesen wurde der Mitarbeiter trotzdem — vom Trigger
`urlaub_entscheidung_geschuetzt` auf `vacations`, denn ein Trigger greift
auch bei `security definer`. Die Prüfung in der Funktion ist also zweite
Reihe, und das soll sie bleiben: sie sagt dem Abgewiesenen, woran es liegt,
statt ihn über die Zeilenregel eines Statuswechsels stolpern zu lassen.
Beobachtbar ist davon genau die Meldung — der Test prüft jetzt sie.

**Die Arbeitstage liessen sich beim Entscheidenden statt beim Antragsteller
lesen.** Kein Test merkte es, weil in allen Prüfungen beide fünf Tage die
Woche arbeiteten. Für einen Teilzeitmitarbeiter wären aus zwei Urlaubstagen
fünf geworden — auffallen würde es erst am Jahresende. Jetzt arbeitet Cäsar
Montag und Mittwoch, und der Chef, der genehmigt, fünf Tage.

### Die erste Weiche ausserhalb der Datenschicht

`callUrlaubEntscheiden` in `lib/functions.ts` schaltet jetzt selbst, und die
Ansicht merkt nichts: sie bekommt in beiden Fällen `{ data }`. Die achtzehn
Weichen in `lib/db/` hält `datenschichtVertrag.test.ts` zusammen — der prüft
aber nur Dateien unter `src/lib/db/`. Diese eine stand ungeprüft da; ein
vertauschter Zweig wäre still geblieben, bis in Stufe 8 der Schalter umgelegt
wird. `tests/unit/weichenInFunctions.test.ts` schliesst das.

### Stand

| | |
|---|---|
| Functions umgestellt oder entfallen | 7 von 15 |
| Prüfungen gegen die echte Datenbank | 485 |
| Hermetische Prüfungen | 1651 |
| Mutationen dieses Teils | 10 |
| davon sofort gefangen | 8 |
| nachgezogen | 2 |

### Als Nächstes

`scheinVorbereiten` und `exportCompanyData` sind die nächsten beiden, die in
die Datenbank gehören statt in eine Edge Function. Danach `pg_cron` für die
Nachtläufe — soweit sie ohne Storage auskommen, das erst Stufe 6 bringt.

## Stufe 5, vierter Teil: die Vorausfüllung des Handwerksscheins

13.09.2026. `scheinVorbereiten` war die zweite Edge Function auf der Liste
und ist die zweite, die keine geworden ist. Sie liest Zeiteinträge und gibt
sie zurück; dafür braucht es keinen zweiten Ort.

Der Grund, warum sie serverseitig bleibt, ist derselbe wie beim Urlaub und
hat nichts mit dem Ort zu tun: der Schein trägt die Stunden der GANZEN
Mannschaft eines Tages — der Kunde unterschreibt für alle, die dort waren,
nicht nur für den, der das Tablet hält. Die Zeiteinträge seiner Kollegen darf
ein Monteur aber nicht lesen. Zurück kommt deshalb genau der Inhalt des
Belegs: Anwesenheit, eine Baustelle, ein Tag. Ein Test stellt beides
nebeneinander — was der Monteur direkt abfragen kann (nur sich selbst) und
was er über die Funktion bekommt (die ganze Mannschaft dieses einen Tages).

### Zwei Formen, die man nicht sieht, bis sie auf dem Beleg stehen

**Die Uhrzeit.** Firestore speicherte „07:30" als Zeichenkette, und die
Ansicht stellt sie unverändert dar. Postgres gibt eine `time`-Spalte als
„07:30:00" aus. Also `to_char(…, 'HH24:MI')` — eine Zeile, die nur deshalb
da ist, weil sonst auf jedem Schein drei Zeichen zu viel stünden.

**Die Sortierung.** `localeCompare(…, 'de')` im Browser und
`collate "de-x-icu"` hier sind dieselbe ICU-Tabelle: „Öllinger" steht vor
„Ostermann", nicht hinter „Zehner". Der Test lässt beide Seiten dieselben
sieben Namen sortieren und vergleicht.

**Was leer ist, fehlt.** Die Function ließ `undefined` weg, und `undefined`
überlebt JSON nicht — die Ansicht bekam den Schlüssel gar nicht.
`jsonb_strip_nulls` hält das. Eine Ausnahme ist geblieben und ist so gewollt:
`pauseMin` steht jetzt als 0 da, wo Firestore nichts stehen hatte, weil die
Spalte `not null default 0` ist.

### Ein Test, der grün war, weil beide Seiten nichts hatten

Der erste Durchlauf war rot — und der Grund war keiner von denen, die ich
geprüft hatte: **`supabase-js` wirft bei einem fehlgeschlagenen Einfügen
nicht.** Der Fehler liegt in `error`, und wer ihn nicht liest, prüft danach
eine leere Liste gegen eine leere Datenbank. Alle Einfügungen in dieser
Prüfung gehen jetzt durch einen Helfer, der wirft.

Dahinter steckte etwas, das man wissen muss: **in einem Stapel gibt es keinen
Spaltenvorgabewert.** PostgREST bildet aus allen Zeilen eines Stapels EINE
Spaltenliste — nennt eine Zeile `is_helper`, bekommen die anderen dort
ausdrücklich `null`, und `not null default false` greift nicht mehr.

### Stand

| | |
|---|---|
| Functions umgestellt oder entfallen | 8 von 15 |
| Prüfungen gegen die echte Datenbank | 495 |
| Hermetische Prüfungen | 1653 |
| Mutationen dieses Teils | 11 |
| davon sofort gefangen | 10 |
| nachgezogen | 1 |

### Als Nächstes

`exportCompanyData` — der DSGVO-Auszug. Danach `pg_cron` für die Nachtläufe,
soweit sie ohne Storage auskommen, das erst Stufe 6 bringt.

## Stufe 5, fünfter Teil: der DSGVO-Auszug

13.09.2026. Die dritte Function, die keine Edge Function geworden ist. Sie
liest jede Tabelle eines Betriebs und gibt sie in einer Antwort zurück — das
ist genau das, was eine Datenbank kann.

### Die Liste pflegt sich jetzt selbst

Der interessanteste Teil ist nicht die Umstellung, sondern was sie ersetzt.
In Firestore stand die Sammlungsliste von Hand in `mandantendaten.ts`, und
sie umfasste einmal neun von sechzehn Sammlungen: es fehlten Kunden,
Angebote, Handwerksscheine, Urlaubsanträge und — am folgenreichsten — die
Nummernkreise. Ein Wiederanlauf aus so einem Export hätte den Rechnungszähler
bei null begonnen, und der Betrieb hätte zwei Rechnungen mit derselben Nummer
in den Büchern.

Hier kommt die Liste aus dem Katalog: **jede Tabelle mit einer Spalte
`company_id` ist dabei**, heute 26 plus der Betrieb selbst. Wer morgen eine
Tabelle anlegt, ist im Auszug, ohne daran zu denken.

Der Test darf sich dabei nicht auf dieselbe Abfrage verlassen, sonst prüfte
er sich gegen sich selbst: er fragt den Katalog über eine eigene
Datenbankverbindung und vergleicht die Schlüssel des Auszugs damit.

Zwei Tabellen fallen von selbst heraus, weil sie kein `company_id` tragen —
`betriebsanlagen` und `platform_admins` gehören der Plattform, nicht dem
Betrieb. Die Sicht `monthly_stats` ist bewusst nicht dabei: sie rechnet aus
den Zeiteinträgen, die ohnehin im Auszug stehen. In Firestore musste sie mit,
weil ihr Neuaufbau eine Function brauchte; hier kostet er nichts.

### Eine Grenze, die man nur prüfen kann, wenn man sie erreicht

Die Antwort ist bei acht Megabyte gedeckelt, und der Parameter dafür lässt
sich nur senken, nie heben. Die erste Fassung dieser Prüfung war wertlos: sie
setzte die Grenze hoch und stellte fest, dass nichts passiert — bei einem
Bestand von zwanzig Zeilen passiert auch ohne Deckel nichts. Eine Mutation,
die `least(…)` entfernte, blieb grün.

Jetzt bekommt ein eigener Betrieb zehn Megabyte Notizen, und der Aufrufer
versucht, sich zwei Gigabyte zu genehmigen. Er bekommt die Meldung, die auf
die nächtliche Ausleitung zeigt — den Weg, der keine Größengrenze hat.

### Stand

| | |
|---|---|
| Functions umgestellt oder entfallen | 9 von 15 |
| Prüfungen gegen die echte Datenbank | 504 |
| Hermetische Prüfungen | 1655 |
| Mutationen dieses Teils | 6 |
| davon sofort gefangen | 5 |
| nachgezogen | 1 |

### Als Nächstes

`pg_cron` für die beiden Nachtläufe. Der eine braucht einen Speicherort —
also zuerst Stufe 6.

## Stufe 6, erster Teil: die Fotos ziehen um

13.09.2026. Vorgezogen, weil der nächtliche Lauf einen Speicherort braucht
und der lokale Stapel einen hat. Es ist die einzige Stelle, an der diese App
Dateien vom Gerät annimmt; alles andere passt in Zeilen.

### Der Pfad ist das Empfindlichste daran

`scheine/{betrieb}/{schein}/{datei}` bleibt Zeichen für Zeichen stehen. Er
steht im Schein und geht in dessen Prüfsumme ein — die Zeile `FOTO` in
`kanonischerInhalt` führt Pfad und Hash. Würde der Umzug ihn umschreiben,
etwa das führende `scheine/` weglassen, weil der Eimer schon so heisst,
liesse sich **kein einziger unterschriebener Schein mehr nachrechnen**. Der
erste Abschnitt ist also bewusst doppelt gemoppelt.

Damit fällt auch die letzte datierte Ausnahme in `datenschichtNaht.test.ts`:
`scheinFotos.ts` war die eine Datei in der Mitte, die ein Firebase-SDK
importieren durfte. Sie ist jetzt eine Weiche wie die anderen achtzehn.

### Was sich für den Benutzer wirklich ändert

Unter Firebase kam die Bildadresse aus `getDownloadURL` und galt für immer.
Jetzt wird bei jedem Ansehen eine befristete ausgestellt — eine Stunde. Wer
so eine Adresse weitergibt, gibt keinen dauerhaften Zugang mehr weiter.

Grösse und Typ stehen am Eimer statt in einer Richtlinie: zwei Megabyte und
`image/*`. Beides fängt nicht den Normalfall ab — der Browser verkleinert auf
zwei- bis vierhundert Kilobyte —, sondern den Fehler.

### Zwei Prüfungen, die aus dem falschen Grund grün waren

**Der Speicher überlebt `supabase db reset`.** Ein Test, der einen abgewiesenen
Upload erwartet, war beim zweiten Lauf grün, weil die Datei vom ersten Lauf
noch dort lag: ohne `upsert` weist der Speicher eine vorhandene Datei mit
einem Fehler zurück, der genauso aussieht wie der einer greifenden Regel. Die
Mutation, die die Regel entfernte, blieb unbemerkt. Jeder abgewiesene Upload
bekommt jetzt einen einmaligen Namen.

**Eine Mutation ist geblieben, und sie bleibt bewusst.** Die Mandantenprüfung
an der *Löschregel* lässt sich entfernen, ohne dass etwas rot wird: der
Speicherdienst sucht vor dem Löschen das Objekt, und daran scheitert ein
fremder Betrieb schon an der Leseregel. Sie zu streichen hiesse, sich darauf
zu verlassen, dass `remove` auch morgen erst liest und die Leseregel nie
weiter wird — zwei Annahmen über fremden Code als einziges Schloss an einem
unterschriebenen Beleg. Sie steht als das da, was sie ist: ein zweites
Schloss, das heute niemand aufsperren kann.

### Stand

| | |
|---|---|
| Functions umgestellt oder entfallen | 9 von 15 |
| Prüfungen gegen die echte Datenbank | 517 |
| Hermetische Prüfungen | 1655 |
| Mutationen dieses Teils | 8 |
| davon sofort gefangen | 6 |
| nachgezogen | 1 |
| begründet stehen geblieben | 1 |

### Als Nächstes

`datenAusleitung` hat jetzt einen Speicherort — für den Lauf selbst fehlt
trotzdem eine Edge Function samt Geheimnis, denn aus SQL heraus lässt sich
keine Datei schreiben. Also wartet er auf das Projekt.

## Die Durchstiche laufen jetzt auch auf Postgres

13.09.2026. Die acht Durchstich-Ketten in `tests/durchstich.test.ts` prüfen
die Arbeitsabläufe von einem Ende zum anderen — und sie liefen ausschliesslich
gegen den Firestore-Emulator. Die Module waren einzeln gegen Postgres geprüft,
die KETTEN nicht. Das war vor dem Umschalten die grösste offene Stelle: ein
Fehler an einer Naht fällt einer Modulprüfung nicht auf, weil jede Seite für
sich stimmt.

Vier neue Dateien decken sie ab — `durchstich1` bis `durchstich4` in
`tests/supabase/`, 31 Prüfungen:

| Kette | wo |
|---|---|
| 1 Zeit → Auswertung, 2 Urlaub → Zeitkonto | `durchstich1.test.ts` |
| 3 Angebot → Nachkalkulation, 4 der eingefrorene Schein | `durchstich2.test.ts` |
| 5 Rüstliste, 6 mehrere Baustellen, 6b Anforderung → Lager | `durchstich3.test.ts` |
| 8 zwei Betriebe nebeneinander | `durchstich4.test.ts` |

Kette 7 (Storno als eine Klammer) steht nicht dabei, und das ist kein
Versehen: `modulGeld.test.ts` prüft sie bereits vollständig, einschliesslich
des Punktes, um den es geht — die betroffenen Belege kommen aus der Abdeckung
und nicht aus dem Aufruf. Eine zweite Fassung wäre Doppelung.

### Sie gehen durch die Weiche, nicht an ihr vorbei

`VITE_DATENQUELLE` steht in diesen Dateien auf `postgres`, und importiert wird
`@/lib/db/…` statt `@/lib/db/pg/…`. Damit ist mitgeprüft, dass der Schalter in
Stufe 8 die ganze Kette trägt und nicht nur die einzelnen Module. Gegengeprüft:
steht der Schalter auf Firestore, wird jede dieser Prüfungen rot.

### Zwei Stellen, an denen Postgres anders antwortet

Beide sind Verbesserungen, und beide stehen jetzt als Zusage im Test:

**Ein Schein, den es nicht gibt.** Firestore wies eine unbekannte Kennung als
ZUGRIFF ab — die Regel las `resource.data.companyId`, und bei einem fehlenden
Dokument ist `resource` null. Ein fehlender Schein kam also als Fehler zurück,
nicht als „nicht gefunden"; die Oberfläche musste beide Ausgänge gleich
behandeln. Der Zeilenschutz filtert stattdessen: ein fehlender und ein fremder
Schein kommen beide als `undefined` zurück. Aus zwei Ausgängen ist einer
geworden.

**Die Abfrage über eine fremde Kennung.** Dort ein Fehler, hier eine leere
Liste. Aus einem Datenleck ist damit ein stiller Ausfall geworden — die
Richtung, in die man sich irren will, aber eine andere Richtung. Deshalb
prüft Durchstich 8 beide: dass der eigene Betrieb seine Zeilen SIEHT und der
fremde keine.

### Stand

| | |
|---|---|
| Prüfungen gegen die echte Datenbank | 548 |
| davon Durchstiche | 41 |
| Hermetische Prüfungen | 1655 |

### Als Nächstes

Was jetzt noch offen ist, hängt am Supabase-Projekt: die Edge Functions
(`betriebAnlegen`, `voiceExtract`, der nächtliche Ausleitungslauf), die
beiden Push-Meldungen und das Umschalten selbst.

## Das Projekt steht — und `anon` bekommt nichts mehr

14.09.2026. Beim Einrichten des Projekts kam eine Frage auf, die vorher
niemand gestellt hatte: welche Häkchen gehören bei der Anlage gesetzt? Zwei
Befunde daraus.

### „Automatically expose new tables" muss AN bleiben

Nachgesehen, nicht vermutet: **keine einzige Migration vergibt Tabellenrechte.**
Sie verlassen sich darauf, dass `authenticated` sie über die
Standard-Privilegien des Schemas `public` bekommt — genau das, was dieses
Häkchen einschaltet. Aus wäre es ein harter Bruch: 27 Tabellen ohne jedes
Recht, jede Abfrage mit „permission denied for table …".

Das Häkchen ist auch nicht die Sicherheitsgrenze. Die ist der Zeilenschutz,
und `schema.test.ts` lässt keine Tabelle ohne ihn durch.

### Was dabei aufgefallen ist

Dieselbe Standardvergabe gibt auch **`anon`** volle Rechte auf jeder Tabelle —
der Rolle also, unter der jede Anfrage ohne Anmeldetoken ankommt. Der
öffentliche Schlüssel steht im ausgelieferten JavaScript; zwischen einem
Fremden ohne Konto und den Löhnen dieses Betriebs stand damit genau eine
Sache: der Zeilenschutz.

Ein Loch war das nicht — jede Richtlinie verlangt eine Anmeldung, und ohne
Token ist `auth.uid()` null. Der Punkt ist die **Reichweite eines künftigen
Fehlers**: fällt eine der siebzig Richtlinien einmal zu weit aus, ist der
Unterschied zwischen „ein angemeldeter Mitarbeiter eines anderen Betriebs"
und „jeder, der die Adresse der Seite kennt".

`20260914090000_anon_zumachen.sql` nimmt die Rechte weg und ändert die
Vorgabe für künftige Tabellen. Die Datenbankfunktionen bleiben ausdrücklich
aufrufbar: sie prüfen die Anmeldung in ihrer ersten Zeile, und wer sich
vertan hat, soll lesen können, was los ist.

**Eine Lücke bleibt, und sie steht im Kommentar.** `alter default privileges`
wirkt nur für die Rolle, unter der es gesetzt wurde; eine von Hand in der
Dashboard-Maske angelegte Tabelle entsteht als `supabase_admin`, dessen
Vorgabe `postgres` nicht ändern darf. Geschlossen wird das nicht durch SQL,
sondern durch einen Wächter in `schema.test.ts`, der jede Tabelle in `public`
prüft.

### Eine eigene frühere Begründung, die nicht hielt

In `durchstich0.test.ts` stand: „eine leere Liste ist die richtige Antwort —
ein Fehler wäre sogar gesprächiger, als er sein dürfte." Das Argument hält
nicht. Die Meldung verrät einen Tabellennamen, und der steht ohnehin im
ausgelieferten Bundle — jedes `.from('time_entries')` nennt ihn. Preisgegeben
wird nichts, was nicht schon öffentlich wäre; gewonnen wird eine ganze
Schutzebene. Zwei Prüfungen, die das alte Verhalten festhielten, sind
umgeschrieben.

### Der Weg der Migrationen ins Projekt

`.github/workflows/supabase-migrationen.yml`: auf jedem Pull Request laufen
die Migrationen gegen eine **frische** lokale Datenbank und die 552 Prüfungen
dagegen — das beantwortet die Frage, die ein Blick in die Dateien nicht
beantwortet: laufen sie in dieser Reihenfolge, von null an, ohne die Hand,
die beim Schreiben nachgeholfen hat. Erst auf `main` wandern sie ins Projekt.

Die Reihenfolge ist der Punkt: eine Migration, die einmal im Projekt liegt,
ist dort. Ein `git revert` holt sie nicht zurück.

Die App bekommt `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` schon jetzt
mit ins Bundle, benutzt aber weiter Firestore — `VITE_DATENQUELLE` steht auf
`firestore`. Der Umzug soll an EINER Variablen umgelegt werden und nicht an
einem Deploy, bei dem gleichzeitig drei neue Werte zum ersten Mal mitkommen.

### Stand

| | |
|---|---|
| Prüfungen gegen die echte Datenbank | 552 |
| Hermetische Prüfungen | 1655 |
| Mutationen dieses Teils | 2 |
| davon gefangen | 2 |

### Als Nächstes

Die drei Edge Functions und die beiden Push-Meldungen — dafür steht das
Projekt jetzt bereit.

## Die erste Edge Function: einen Betrieb anlegen

14.09.2026. Fast alles aus dem Functions-Bestand ist beim Umzug zu SQL
geworden. Das hier nicht, und der Grund ist handfest: **ein Anmeldekonto
entsteht im Anmeldedienst, nicht in einer Tabelle.** Sein Passwort wird dort
gehasht, seine Kennung dort vergeben, sein Rücksetzlink dort signiert. Von
Hand in `auth.users` zu schreiben hiesse, all das nachzubauen — und beim
nächsten Update des Dienstes wäre es falsch.

Geteilt ist die Arbeit deshalb so: die Function legt das Konto an, alles
Weitere macht `public.betrieb_anlegen` in EINER Transaktion. Ein Betrieb ohne
Administrator wäre nicht zu betreten und nicht zu reparieren — niemand könnte
sich anmelden, um den fehlenden anzulegen.

### Die Tabelle entscheidet, nicht das Token

Im Token steht `plattform_admin`, gesetzt vom Trigger auf `platform_admins`.
Ein bereits ausgestelltes Token trägt seinen Anspruch aber bis zu einer Stunde
weiter: wer heute früh entzogen wurde, legte sonst noch bis Mittag Betriebe
an. Die Function fragt deshalb die Tabelle — dieselbe Entscheidung wie bei
`app.aktiv()`, und aus demselben Grund. Ein eigener Test hält den Fall fest:
Anspruch im Token, Zeile gelöscht, Zugriff verweigert.

### Ohne Fernimport

Der naheliegende Weg wäre `import { createClient } from 'jsr:@supabase/supabase-js'`
gewesen. Er scheiterte hier am Netz — und ist trotzdem nicht deshalb
gestrichen: es sind sechs Aufrufe, die als `fetch` genauso kurz und deutlich
dastehen, und eine Function ohne Fernimport hat nichts nachzuladen. Sie
startet auch dann, wenn die Registry gerade nicht erreichbar ist, und zwischen
zwei Auslieferungen verschiebt sich unter ihr nichts.

### `supabase start` kopiert, es bindet nicht ein

Eine Kleinigkeit mit Folgen: die CLI kopiert `supabase/functions/` beim Start
in den Container. Eine neu angelegte Function ist also erst nach einem
Neustart da, und die gemeinsamen Regeln aus `shared/` müssen VOR dem Start
dort liegen. `scripts/edge-shared-uebernehmen.mjs` schreibt sie nach
`supabase/functions/_shared/` — nicht eingecheckt, bei jedem Lauf neu, also
unfähig, von der Quelle abzuweichen. Dasselbe Muster wie bei den Cloud
Functions. `stack.sh`, `npm run gemeinsames` und der Workflow rufen es auf.

Im Workflow werden die Functions NACH den Migrationen ausgeliefert: stünde
die Function vor ihrer eigenen Datenbankfunktion im Projekt, wäre das
Zeitfenster dazwischen eine Function, die bei jedem Aufruf scheitert.

### Stand

| | |
|---|---|
| Functions umgestellt oder entfallen | 10 von 15 |
| Prüfungen gegen die echte Datenbank | 560 |
| Hermetische Prüfungen | 1657 |
| Mutationen dieses Teils | 8 |
| davon gefangen | 8 |

### Als Nächstes

Der nächtliche Ausleitungslauf und die beiden Push-Meldungen. `voiceExtract`
bleibt draussen: die KI-Spracherfassung ist nicht eingeschaltet und soll es
vorerst nicht werden.

## Der nächtliche Ausleitungslauf

14.09.2026. `pg_cron` weckt eine Edge Function, die jeden Betrieb zeilenweise
als `.jsonl` wegschreibt, alte Stände wegräumt und das Ergebnis in
`system_laeufe` festhält — dieselbe Überwachung wie bisher, also bleibt die
Anzeige „Sicherung überfällig" unverändert.

### Zwei Wege in dieselbe Function

Der Zeitplan ruft mit dem **Dienstschlüssel** und nimmt alle Betriebe; der
Knopf in der Sicherungsansicht mit dem **Token eines Menschen** und nimmt nur
dessen eigenen. Zwei getrennte Fassungen wären zwei Gelegenheiten dafür, dass
die eine ausleitet, was die andere auslässt.

Die Aufbewahrungsregel — was weg darf und was nie — ist dabei nicht neu
geschrieben worden: `ausleitungPlan.ts` ist von `functions/src/` nach
`shared/` gezogen und wird jetzt von beiden Fassungen gelesen. Die elf
Prüfungen dazu laufen unverändert weiter.

### Wie ehrlich das ist

Das Ziel ist heute ein Eimer im **selben Projekt**. Gegen einen Fehlgriff,
eine kaputte Migration oder eine versehentlich geleerte Tabelle hilft das
sofort. Gegen „der Zugang zum Projekt ist weg" hilft es **nicht** — dafür muss
das Ziel ausserhalb liegen. Solange es das nicht tut, steht
`system_laeufe.ziel_extern` auf `false`, und die Ansicht schreibt „Eimer im
selben Projekt" statt eines beruhigenden Namens.

Der Eimer trägt **keine einzige Richtlinie**, und das ist der Punkt: was keine
trifft, ist zu. Auch die Geschäftsführung kommt nicht heran. Wer den Bestand
braucht, holt ihn über den DSGVO-Auszug, der die Rolle prüft und nur den
eigenen Betrieb liefert — ein Leserecht auf den Eimer wäre ein zweiter Weg an
dieselben Daten, mit eigener Regel und eigener Gelegenheit, sich zu vertun.

### Zwei Dinge, die beim Prüfen aufgefallen sind

**Eine Mutation kam durch, und sie war die gefährlichste.** Bricht die
Leseschleife nach der ersten Seite ab, ist der Stand vollständig AUSSEHEND und
unvollständig: Datei da, Lauf grün, Überwachung zufrieden, und beim
Wiederanlauf fehlen vier Fünftel der Zeiteinträge. Kein Test hatte je mehr als
tausend Zeilen. Jetzt bekommt ein eigener Betrieb 1200 Buchungen, und die
Prüfung zählt sie in der geschriebenen Datei nach.

**Mein Mutationswerkzeug hat selbst einen Fehler gehabt.** Es stellte die
Function auf der Platte wieder her, startete den Runtime aber nicht neu — und
der KOPIERT die Functions beim Start. Die nächste Prüfung lief gegen die
mutierte Fassung und wurde aus einem Grund rot, der nichts mit ihr zu tun
hatte. Zwei Minuten Verwirrung, die als Notiz mehr wert sind als still
behoben.

### Was an der Zeit auffallen wird

`pg_cron` rechnet in UTC. Eingetragen ist 01:30 UTC — im Sommer 03:30, im
Winter 02:30 Wiener Zeit. Der Lauf wandert also mit der Zeitumstellung um eine
Stunde. Für einen Nachtlauf ohne Belang; es steht in der Migration, damit es
niemand später im Protokoll entdeckt und für einen Fehler hält.

### Was noch fehlt

Adresse und Dienstschlüssel für den Zeitplan liegen im **Tresor** und nicht in
der Migration — eine Migration liegt im Git, und dort bliebe ein Schlüssel für
immer. Sie werden einmal angelegt; bis dahin tut der Lauf nichts und sagt es,
statt jede Nacht in einen Fehler zu laufen, den niemand liest.

### Stand

| | |
|---|---|
| Functions umgestellt oder entfallen | 12 von 15 |
| Prüfungen gegen die echte Datenbank | 571 |
| Hermetische Prüfungen | 1659 |
| Mutationen dieses Teils | 7 |
| davon sofort gefangen | 6 |
| nachgezogen | 1 |

### Als Nächstes

Die Anmeldung. Sie ist der letzte grosse Brocken und der, ohne den sich der
Schalter gar nicht umlegen lässt.

## Die Anmeldung zieht um

14.09.2026. Der Block, der quer lag — und der in keiner meiner früheren
Aufzählungen stand. `AuthContext.tsx` sprach direkt mit Firebase Auth und
Firestore, `provisionUser.ts` ebenso. Damit liess sich der Umzug **gar nicht
umschalten**: die Datenschicht hätte mit Postgres geredet, das Token wäre
weiter von Firebase gekommen, und keine einzige Zeilenregel hätte gegriffen.

Jetzt gibt es `lib/auth/sitzung.ts` — dieselbe Bauart wie `lib/db/`: zwei
Fassungen in `fs/` und `pg/`, eine Weiche dazwischen, und `AuthContext` kennt
keine der beiden mehr. `datenschichtNaht.test.ts` bewacht das ab sofort auch
für dieses Verzeichnis.

### Drei Unterschiede, die Folgen haben

**Es gibt keinen Zwischenspeicher.** Das Firestore-SDK legte jedes gelesene
Dokument von selbst ab, und der Start las daraus, bevor er das Netz fragte —
die Grundlage dafür, dass der Monteur im Keller sofort drin ist. Supabase tut
das nicht. Ohne Ersatz stünde bei jedem Start wieder ein Ladebalken, genau die
Sekunden, die dieses Projekt einmal mühsam weggeräumt hat. Die Postgres-Seite
führt deshalb einen eigenen, kleinen Zwischenspeicher.

**Die Sitzungsdauer wird nicht beim Anmelden gewählt, sondern am Speicher.**
`browserLocalPersistence` gibt es nicht; stattdessen entscheidet ein Adapter
bei jedem Zugriff neu, ob die Sitzung im `localStorage` oder im
`sessionStorage` landet. Das geteilte Baustellen-Tablet hängt daran: läge die
Sitzung im falschen Speicher, bliebe der nächste Monteur als sein Vorgänger
angemeldet. Zwei Prüfungen halten es fest.

**Ein Konto anlegen, ohne die eigene Sitzung zu verlieren.** Beide Anmeldungen
melden den gerade Angelegten sofort an — die Verwaltung stünde als der neue
Mitarbeiter da. Unter Firebase brauchte es dafür eine zweite App, hier einen
eigenen Client, der nichts speichert.

### Was gemessen wurde und die Meldung verbessert hat

Ein mitten in der Sitzung deaktiviertes Konto sieht **seine eigene Zeile nicht
mehr**: der Zeilenschutz filtert sie weg, die Abfrage gelingt und liefert
nichts. `active: false` ist nirgends zu sehen. Für die Anmeldung sah das
genauso aus wie „dieses Konto hat gar kein Profil" — und auf dem Bildschirm
stand „Kein Benutzerprofil für dieses Konto gefunden".

Nicht falsch, und trotzdem die schlechtere Auskunft. Wer gerade ausgeschieden
ist, soll lesen, dass sein Zugang beendet wurde, und nicht raten, ob etwas
kaputt ist. `public.mein_zustand()` sieht an der Zeilenregel vorbei und gibt
**zwei Wahrheitswerte über den Aufrufer** zurück — keinen Namen, keine Rolle,
keinen Betrieb, und nie über ein fremdes Konto.

Dabei kam ein zweiter Unterschied zum Vorschein, und der ist ein Gewinn: ein
deaktiviertes Konto kommt unter Postgres **gar nicht erst herein**. Die Sperre
aus Stufe 5 greift schon am Anmeldedienst. Firestore hatte hier noch ein
Fenster von bis zu einer Stunde.

### Ein Ausgang, für den es keine gute Lösung gibt

`provisionUser` legt erst das Anmeldekonto an und dann die Zeile in der
Belegschaft. Scheitert der zweite Schritt, bleibt ein Konto ohne Zeile zurück —
aufräumen kann der Browser es nicht, dafür bräuchte er Dienstrechte, die er
nicht haben soll.

Das ist der ehrlichere der beiden schlechten Ausgänge. Die Alternative wäre,
die Zeile zuerst zu schreiben; bei einem Fehlschlag am Konto bliebe dann eine
Belegschaftszeile ohne Anmeldung — und die **steht in der Mitarbeiterliste und
sieht richtig aus**. Ein Konto ohne Zeile fällt beim ersten Anmeldeversuch
auf; eine Zeile ohne Konto fällt niemandem auf. Die Fehlermeldung nennt
deshalb die Adresse: der zweite Versuch mit derselben scheitert an ihr.

### Stand

| | |
|---|---|
| Prüfungen gegen die echte Datenbank | 584 |
| Hermetische Prüfungen | 1667 |
| Firestore-Regeln | 225 |
| Mutationen dieses Teils | 8 |
| davon gefangen | 8 |

### Als Nächstes

Die beiden Push-Meldungen, dann Stufe 7.

## Die Push-Meldungen: neuer Auslöser, alter Versand

14.09.2026. Firebase Cloud Messaging bleibt — es hängt an keiner Datenbank
und funktioniert. Umgezogen ist nur, was den Versand ANSTÖSST: aus zwei
Firestore-Ereignissen wird ein Trigger auf `material_orders`, der eine Edge
Function ruft.

Die Entscheidungen sind nicht neu geschrieben worden. `notifyLogic.ts` ist
nach `shared/` gezogen und wird jetzt von beiden Seiten gelesen — wer etwas
bekommt, wann ein Übergang gilt, wann ein Gerät wirklich tot ist. Eine zweite
Fassung in plpgsql hätte dieselben Meldungen ergeben, bis sie es eines Tages
nicht mehr getan hätte, und bemerkt würde es daran, dass jemand eine Meldung
**nicht** bekommt.

### Was das Admin-SDK einem abgenommen hat

Zwei Dinge, und beide gehen still daneben:

**Das signierte JWT für Google.** Ohne SDK sind es dreissig Zeilen — und genau
die, bei denen ein Tippfehler zu „invalid_grant" führt und zu sonst gar
nichts. Sie stehen jetzt in `shared/fcmVersand.ts` und werden gegen einen
selbst erzeugten Schlüssel nachgerechnet: Signatur geprüft, Rumpf gelesen,
und die Gegenprobe mit veränderter Nutzlast fällt durch.

**Die Bedeutung der Fehlercodes.** Das SDK meldete
`messaging/registration-token-not-registered`, die HTTP-v1-Schnittstelle
meldet `UNREGISTERED`. Ohne Zuordnung hielte `toteTokens` jedes tote Gerät für
lebendig, und jeder Versand liefe bis in alle Ewigkeit in dieselben Fehler.
Wichtiger noch: die dort sorgfältig begründete Ausnahme für
`invalid-argument` — derselbe Code kommt auch bei einer fehlerhaften
Nachricht und beträfe dann **alle** Empfänger auf einmal — gilt nur weiter,
weil die Zuordnung sie erhält.

### Drei Befunde beim Prüfen

**Ein echter Fehler in meiner eigenen Migration.** `pg_cron` und `pg_net`
standen in EINEM Ausnahmeblock. Ein Ausnahmeblock in plpgsql macht die ganze
Anweisung rückgängig: scheitert die zweite, ist auch die erste wieder weg —
und die Meldung sprach von beiden, sodass nicht einmal zu sehen war, welche.
Genau so ist es beim ersten Einspielen passiert; `pg_net` fehlte danach, und
der Trigger stiess ins Leere. Jetzt ein Block je Erweiterung.

**`pg_net` läuft im Datenbankcontainer.** `127.0.0.1` ist dort nicht der
Stapel, sondern der Container selbst. Im Projekt fällt das nicht auf — dort
ist es die öffentliche URL —, in der Prüfung schon: `net._http_response`
enthielt „Couldn't connect to server", und bei einer Push-Meldung heisst das
schlicht, dass nichts kommt.

**Eine Mutation hat eine halbe Prüfung aufgedeckt.** Die Antwort der Function
nannte nur die Zahl der EMPFÄNGER. Wer die Meldungsart abgeschaltet hat,
bekommt aber nichts — und das ist eine Einstellung, die jemand bewusst
getroffen hat. `willMeldung` liess sich ersatzlos streichen, ohne dass etwas
rot wurde. Jetzt steht in der Antwort auch die Zahl der GERÄTE: „ein
Empfänger, null Geräte" heisst, dass niemand etwas merkt.

### Was ungeprüft bleibt, und warum

Genau eine Runde: die zu Google. Dafür braucht es ein Dienstkonto, und ohne
es wird **nicht still nichts getan** — die Function antwortet mit 503, nennt
den Namen des fehlenden Geheimnisses und gibt trotzdem `geplant` zurück.
Daran ist zu sehen, dass alles bis zum Versand richtig gelaufen ist. Eine
Push-Meldung, die nicht ankommt, merkt sonst niemand; das ist ihr
gefährlichster Zug.

### Stand

| | |
|---|---|
| Functions umgestellt oder entfallen | 14 von 15 |
| Prüfungen gegen die echte Datenbank | 598 |
| Hermetische Prüfungen | 1681 |
| Mutationen dieses Teils | 8 |
| davon sofort gefangen | 6 |
| nachgezogen | 2 |

### Als Nächstes

Stufe 7 — die Narben zurückbauen.

## Stufe 7: die Suche, und ein Knopf, der verschwindet

14.09.2026. Zwei von den Narben aus der Übersicht — und nicht alle, denn der
Rest lässt sich erst abräumen, wenn Firestore weg ist.

### Serverseitig suchen, mit Treffern in der Wortmitte

Firestore kennt keine Volltextsuche: es kann nur Anfänge einer sortierten
Spalte vergleichen. Die Ansichten luden deshalb die ersten paar hundert Zeilen
und filterten im Browser. **Wer den 501. Kunden suchte, fand ihn nicht — und
bekam darüber keine Auskunft, sondern eine leere Liste.** Genau dafür stand
über jeder Liste ein Nachladeknopf, den niemand verstand.

Postgres sucht über den ganzen Bestand und findet „uber" in „Huber".
Trigram-Indizes tragen das; ohne sie liefe dieselbe Suche als vollständiger
Tabellendurchlauf — bei zweihundert Kunden unauffällig, bei fünfzehntausend
Zeilen an dem Tag, an dem niemand damit rechnet.

Die Firestore-Seite behält ihr Verhalten. Beide hängen an derselben Weiche,
und im Kopf der Weiche steht, dass sich hinter einer Zusage zwei verschiedene
Ergebnisse verbergen — sonst wüsste es niemand.

### Der heikle Teil ist das Escaping

Eine Suche über mehrere Spalten geht in PostgREST über `or(...)`, und dessen
Syntax ist eine **Zeichenkette**: Bedingungen durch Kommas, Gruppen in
Klammern. Gemessen, nicht vermutet:

    failed to parse logic tree ((name.ilike.%Huber,%,address.ilike.%Huber,%))

Ein Kundenname wie „Huber, Franz" zerreisst also die Abfrage. Das ist der
gutmütige Ausgang — der andere ist ein Begriff, der den Filterbaum nicht
zerreisst, sondern **umbaut**. Dazu kommt, dass `%` und `_` in `ilike`
Jokerzeichen sind: wer „50%" tippt, meint das Zeichen und nicht „alles, was
mit 50 beginnt".

`pg/suche.ts` entschärft beides, und die Reihenfolge zählt — erst der
Rückstrich, dann die Joker; umgekehrt verdoppelte der zweite Durchgang, was
der erste gerade gesetzt hat. Geprüft wird es zweimal: hermetisch auf der
Zeichenebene und gegen die echte Datenbank mit Kunden, die Komma, Prozent,
Unterstrich, Klammern, Apostroph und Anführungszeichen im Namen tragen.

### Zwei Rückschritte, die ich selbst gebaut habe

Beide entstanden dadurch, dass `kunden` nicht mehr die geladene Liste ist,
sondern das **Suchergebnis**:

**„Noch keine Kunden."** Die Leermeldung unterschied am `length === 0`
zwischen „es gibt keine" und „nichts passt". Mit serverseitiger Suche läse ein
Betrieb mit vierhundert Kunden beim ersten Fehlversuch „Noch keine Kunden" —
ein Schrecken ohne Grund. Die Unterscheidung hängt jetzt am Suchbegriff.

**Der Nachladehinweis verschwand beim Tippen.** Er spricht über die geladene
Liste; gespeist mit den Treffern wäre er beim ersten Suchversuch weg, und mit
ihm die Auskunft, dass die Liste an ihrer Grenze steht. Die Zahl ohne Suche
wird jetzt getrennt gemerkt.

Und der Satz daneben — „Die Suche geht nur über diese" — ist unter Postgres
schlicht falsch. Er steht nur noch dort, wo er stimmt. Eine Auskunft, die
einmal danebenlag, wird beim nächsten Mal nicht mehr geglaubt.

### Ein Knopf, der ins Leere gerufen hätte

„Monatsbilanzen aufbauen" in den Einstellungen ruft eine Cloud Function, die
es nach dem Umschalten nicht mehr gibt. Unter Postgres ist `monthly_stats`
eine Sicht: sie rechnet bei jeder Abfrage neu, es gibt nichts aufzubauen und
nichts nachzuziehen. Der Knopf bleibt nicht stehen und wird auch nicht
stillgelegt — er ist weg, und an seiner Stelle steht, warum.

### Was von Stufe 7 offen bleibt, und warum

`listengrenzen.ts` löschen, die vierzig Firestore-Indizes fallen lassen,
`counters` zu einer Sequenz machen, `stripUndefined` entfernen: all das
zerstörte die laufende App, solange sie auf Firestore liegt. Es gehört hinter
das Umschalten, nicht davor. Was **vorher** gehen musste, ist das, was nach
dem Umschalten kaputt wäre — und das ist erledigt.

### Stand

| | |
|---|---|
| Prüfungen gegen die echte Datenbank | 611 |
| Hermetische Prüfungen | 1691 |
| Firestore-Regeln | 225 |
| Mutationen dieses Teils | 3 |
| davon gefangen | 3 |

### Als Nächstes

Stufe 8: umschalten. Alles, was danach kaputt wäre, ist umgezogen; was vorher
nicht weg durfte, fällt in Stufe 9.

---

## Stufe 8: umschalten

Drei Arbeiten, und zwei davon waren nicht im Plan — sie sind bei der
Einrichtung des echten Projekts aufgefallen.

### Der Wächter, den es vorher nicht gab

`net.http_post` wartet nicht auf die Antwort. Kommt eine 401 zurück, weil ein
Schlüssel nicht stimmt, steht das in `net._http_response`, und dort sieht
niemand hin. `system_laeufe` — die Tabelle hinter der Überwachungsansicht —
bleibt dabei **leer**, denn geschrieben wird sie von der Edge Function, und
die ist nie angelaufen.

In der Ansicht stünde also nicht „fehlgeschlagen", sondern gar nichts. Und gar
nichts sieht aus wie „noch nie gelaufen", nicht wie „seit drei Wochen kaputt".

Das ist kein gedachtes Beispiel: bei der Einrichtung ist genau das dreimal
passiert, und gefunden wurde es jedes Mal von Hand. Ein zweiter
`pg_cron`-Eintrag sieht jetzt eine Viertelstunde nach dem Anstoss nach, was
daraus geworden ist, und schreibt alles ausser 200 als Fehlschlag fest — für
jeden Betrieb, denn scheitert der Anstoss, ist der Lauf für alle ausgefallen.

Der letzte **Erfolgs**zeitpunkt bleibt dabei stehen, wo er stand.

### Die Erstanlage: Henne und Ei, zweimal übereinander

Einen Betrieb legt die Edge Function an, und die lässt nur herein, wer in
`platform_admins` steht. In diese Tabelle trägt aber niemand jemanden ein —
sie hat absichtlich keine einzige Richtlinie.

`scripts/bootstrap-postgres.mjs` durchbricht den Ring genau einmal, über
**dieselbe** Datenbankfunktion wie die Edge Function. Zwei Wege wären zwei
Fassungen derselben Vorgabewerte — Stundensätze, Steuersatz, Zahlungsziel —,
und sie liefen auseinander.

**Zwei Konten, nicht eines.** Der erste Anlauf wollte Betriebsadministrator
und Plattformverwalter auf eine Kennung legen; die Datenbank hat das
abgewiesen, und zu Recht. Gäbe es für dieselbe Kennung beides, entschiede
allein die Reihenfolge zweier Trigger, ob am Ende ein Plattformkonto oder ein
Konto *mit* Betrieb dasteht — und mit einem Betrieb im Token greift jede
Leseregel. Ein Zufall entschiede über Leserechte an fremden Kundendaten.

### Der Schalter

`VITE_DATENQUELLE` steht im Auslieferungsworkflow jetzt auf `postgres`. Die
Rückfalltür ist eine **Repository-Variable**, kein Revert: `VITE_DATENQUELLE`
auf `firestore` gesetzt, und der nächste Lauf baut wieder die alte Seite —
ohne dass jemand unter Druck einen Commit zurücknehmen muss. Sie bleibt offen,
bis Stufe 9 die Firestore-Hälfte ausbaut.

**Leer gestartet, nicht übernommen.** Im Pilotbetrieb lagen nur Testdaten. Ein
Übernahmeskript hätte denselben Aufwand an Sorgfalt getragen wie eines für
echte Daten und hätte nichts gerettet, was nicht in zehn Minuten neu erfasst
ist. Das ist eine Entscheidung, keine Auslassung — und sie steht hier, weil
sie nach dem Echtstart nicht mehr offen gestanden hätte.

### Was am Umschalten nicht hängt

Geprüft, bevor der Schalter fiel:

* **Kein Firebase-eigener Weg bleibt erreichbar.** Die einzige Ansicht, die
  noch eine Cloud Function ruft, ist die KI-Erfassung — und die ist doppelt
  aus: `standard: false` am Modul, und `VITE_ENABLE_VOICE` ist nicht gesetzt.
* **Der Knopf „Monatsbilanzen aufbauen"** stand schon in Stufe 7 hinter
  `nutztPostgres()` und ist unter Postgres gar nicht da.
* **Fehlende Zugangsdaten scheitern laut.** `supabaseClient()` wirft mit dem
  Namen dessen, was fehlt, statt sich still mit `undefined` zu verbinden.

### Stand

| | |
|---|---|
| Prüfungen gegen die echte Datenbank | 630 |
| Hermetische Prüfungen | 1726 |
| Mutationen dieses Teils | 11 |
| davon gefangen | 11 |

## Das Ausgangsfach war gebaut — und an nichts angeschlossen

Der Fahrplan hat den ganzen Umzug an eine Bedingung geknüpft: *der Schreibweg
ohne Empfang wird zuerst gebaut und bewiesen.* Gebaut war er seit Stufe 0,
bewiesen auch — sechzehn Prüfungen gegen einen erfundenen Server, zehn gegen
die echte Datenbank. **Aufgerufen hat ihn niemand.**

Die Ansichten schrieben weiter unmittelbar und zeigten dabei denselben Satz
wie unter Firestore:

> Zeit gebucht — ohne Verbindung gespeichert, wird automatisch gesendet.

Unter Firestore stimmte er: das SDK legte den Vorgang in IndexedDB ab und
sendete ihn nach. Unter Postgres stimmte davon nichts. Der Aufruf scheiterte,
die Buchung war weg, und auf dem Bildschirm stand eine Zusage, die niemand
hielt. Gemerkt hätte man es am Monatsende, wenn niemand mehr weiss, welcher
Tag es war.

**Warum keine der bestehenden Prüfungen das gefangen hat**, und das ist die
eigentliche Lehre: die Prüfungen des Ausgangsfachs rufen das Ausgangsfach.
Sie beweisen, dass die Mechanik trägt — nie, dass jemand sie benutzt. Eine
Prüfung, die ihren Prüfling selbst aufruft, kann die Frage „ruft ihn sonst
noch wer?" grundsätzlich nicht beantworten.

### Was jetzt daran hängt

`src/lib/db/pg/ohneEmpfang.ts` ist die Brücke. Darüber laufen die beiden
Vorgänge, die auf der Baustelle entstehen: die Zeitbuchung (`TimeForm`) und
die Materialanforderung (`OrderView`). `src/components/Nachsender.tsx` stösst
das Nachsenden an — beim Start, bei `online`, und beim Zurückkommen aus dem
Hintergrund, weil `online` auf Telefonen unzuverlässig ist.

**Nicht jeder Schreibvorgang gehört dazu**, und das ist keine Auslassung:
nachsenden lässt sich nur, was ohne den Server entschieden werden kann. Eine
Rechnungsnummer, ein Lagerabzug, eine Transaktion über mehrere Tabellen
brauchen den Stand von jetzt. Ebenso wenig gehören die Büroansichten dazu: dort
wäre ein stillschweigend vorgemerkter Vorgang schlimmer als eine
Fehlermeldung.

**Ohne Lager kein Versprechen.** Privates Fenster, gesperrter Speicher: dann
wird geschrieben wie bisher, und ein Fehlschlag ist ein Fehlschlag. „Wird
nachgesendet" zu melden, wo nichts gelagert werden kann, wäre dieselbe Lüge in
neuen Kleidern.

### Drei Prüfungen, weil eine die Lücke wieder zuliesse

| Prüfung | Beantwortet die Frage |
|---|---|
| `tests/supabase/ohneEmpfang.test.ts` | Trägt der Weg von der Weiche bis in die Zeile in Postgres? Das Funkloch wird echt hergestellt — der Client zeigt auf einen Port, an dem niemand horcht |
| `tests/unit/ausgangsfachNaht.test.ts` | Hängt das Fach überhaupt noch an den Ansichten? Liest den Quelltext, nicht das Verhalten — der Fehler war ein **fehlender Aufruf**, und den sieht man nur dort |
| `TimeFormVormerkung.test.tsx`, `OrderView.test.tsx` | Übersetzt die Maske den Stand in den richtigen Satz — und verspricht sie nichts, wenn die Buchung angekommen ist? |

Gegen absichtlich kaputten Code gehalten: sieben Mutationen, sechs sofort
gefallen. Die siebte ist durchgelaufen — der Rückgabewert „ohne Lager,
Schreibvorgang erfolgreich" war von keiner Prüfung berührt, weil der Fall im
Funkloch immer scheitert. Die Gegenprobe mit Empfang fehlte; sie steht jetzt
da.

## Die `in`-Grenze ist nicht weg — sie hat die Form gewechselt

Beim Umstellen stand in mehreren Modulen derselbe Vermerk: *„Die Blockbildung
von Firestore entfällt: dort waren höchstens 30 Werte je `in`-Abfrage erlaubt,
hier gibt es diese Grenze nicht."* Für Postgres stimmt das. Nur steht zwischen
der App und Postgres **PostgREST**, und dort steht die Werteliste in der
Adresse.

Gemessen gegen den örtlichen Stapel: die Annahme bricht zwischen **8135 und
8145 Zeichen** Werteliste ab, danach kommt `414 URI too long`. Bei Kennungen
sind das gut 220 Stück.

**Wen das trifft:** jede Abfrage nach dem Muster „Köpfe laden, dann die Zeilen
dazu" — die Positionen zu einem Stapel Rechnungen, die Zeilen zu einem Monat
Handwerksscheine, die Kunden zu dreihundert Baustellen. Nicht der Grenzfall,
sondern der erste Betrieb mit ordentlich Daten. Im Pilotbetrieb mit zehn
Zeilen fällt es nie auf.

Gestückelt wird jetzt an einer Stelle, in `abfragen` — **nach Länge, nicht
nach Anzahl**, denn eine Kennung wiegt 36 Zeichen und eine Baustellennummer
neun. Das Budget ist 4000 Zeichen, die Hälfte des Gemessenen: die gehostete
Anlage muss dieselbe Grenze nicht haben.

**Zusammen mit einer Grenze (`limit`) bricht es laut ab.** Jeder Block brächte
sonst seine eigenen `grenze` Zeilen mit, und zusammengelegt stünde eine andere
Auswahl da als die gefragte; das nachträglich in der App zu sortieren hiesse,
die Sortierregeln von Postgres nachzubauen — für Umlaute gehen die beiden
auseinander. Heute ruft niemand so, und wer es täte, erfährt es sofort statt
über eine Liste, die fast stimmt.

Geprüft in `tests/supabase/inGrenze.test.ts`, gegen den echten Weg: erst wird
**gemessen**, dass 400 Kennungen am Stück das `414` auslösen — ohne diese
Messung bewiese die Prüfung nur, dass zwei Wege dasselbe liefern, nicht dass
einer davon nötig ist. Drei Mutationen, drei gefallen.

## Der Durchklick: die App im echten Browser

Der Rauchtest des Betriebs hat an einem Nachmittag drei Fehler gefunden, die
keine Prüfung vorher gesehen hatte — ein roter Kasten nach jedem
Hintergrundwechsel, eine fehlende Rolle in der Auswertung, eine Fehlermeldung
mit Firebase-Wortlaut. Das ist kein Zufall und kein Versäumnis im Einzelnen,
sondern eine **Lücke der Bauart**:

| Prüfung | Sieht | Ist blind für |
|---|---|---|
| `npm test` | Bausteine mit nachgebauter Umgebung | ob jemand den Baustein benutzt |
| `npm run supabase:test` | die Datenschicht gegen die echte Datenbank | ob eine Ansicht sie ruft |
| **`npm run durchklick`** | die Naht dazwischen | Darstellung, Geräte, Netzverhalten |

Gefahren werden vier Wege, und die Auswahl ist eng: **Zeit buchen, Material
anfordern, Schein unterschreiben, Rechnung stellen.** Die Anmeldung steht
nicht daneben — jeder der vier beginnt damit, über die Maske und nicht über
eine untergeschobene Sitzung.

**Warum nicht mehr.** Ein Durchklick durch jede Ansicht kostet Stunden
Rechenzeit und flattert; eine Prüfung, die mal fällt und mal nicht, wird nach
zwei Wochen ignoriert, und dann ist sie schlimmer als keine. Deshalb steht
auch `retries: 0` — ein Wiederholungslauf versteckt genau das Flattern, das
man sehen will.

### Was der erste Anlauf gekostet — und gezeigt hat

Vier der fünf Anläufe sind an der App gescheitert, nicht an der Prüfung, und
jeder davon ist ein Stück Wissen über den echten Weg:

* Die **Baustelle ist Pflicht** bei der Zeitbuchung; ohne sie gibt der Browser
  „Please select an item in the list" und es wird nichts gebucht.
* Der **Name des Kunden in Druckbuchstaben** ist Pflicht am Schein — der Knopf
  „Unterschreiben und abschließen" bleibt sonst gesperrt.
* Die **Rolle entscheidet über die Navigation**: „Rechnungen" gibt es für die
  Verwaltung nicht, nur für Buchhaltung und Führung.
* Die **Kennung eines Zeiteintrags kommt vom Gerät** — die Spalte hat bewusst
  keine Vorgabe (das ist die Bedingung fürs Nachsenden ohne Empfang).

### Der Fehler, den der Durchklick an sich selbst gefunden hat

Beim ersten gemeinsamen Lauf war `zeitBuchen` grün, **ohne etwas zu
beweisen**: die Prüfung zählte EINE Zeile und fand die, die `rechnungStellen`
hatte liegenlassen — ihre eigene Buchung war da noch gar nicht angekommen.
Eine Prüfung, die von der Reihenfolge der Dateien abhängt, ist keine.

Seither räumt jede ihren eigenen Tisch ab, und geprüft wird nicht mehr die
ANZAHL, sondern die Zeile: Von, Bis, Pause, Baustelle.

Dieselbe Sorte Blindheit steckte in der Unterschrift. Mit demselben Strich auf
beiden Feldern konnte die Prüfung nicht sehen, dass die Ansicht zweimal
dasselbe Bild einfriert — ein Schein, auf dem der Kunde die Handschrift des
Monteurs trägt. Die Mutation ist durchgekommen; jetzt werden zwei
verschiedene Züge gezeichnet und die Bilder gegeneinander geprüft.

Vier Mutationen gehalten: drei sofort gefallen, die vierte war diese.

## Die zwei offenen Punkte, die jetzt zu sind

### Benutzer anlegen ging gar nicht

Die App legte Anmeldekonten mit `auth.signUp` an — **aus dem Browser, mit dem
öffentlichen Schlüssel**. Das verlangt im Projekt den Schalter „Allow new
users to sign up", und der steht auf aus.

**Der Schalter steht richtig.** Der öffentliche Schlüssel steht im
ausgelieferten JavaScript; eingeschaltet könnte sich jeder, der ihn dort
abliest, selbst ein Konto anlegen. Der Weg war also nicht der Schalter,
sondern die Stelle: `mitarbeiter-anlegen` hat den Dienstschlüssel und fragt
die Belegschaftstabelle, ob der Aufrufer anlegen darf.

**Was die Function bewusst nicht tut**, und das ist die wichtigste
Entscheidung daran: die Zeile in der Belegschaft schreiben. Auf `users` liegen
`users_anlegen` (verlangt `app.ist_spitze()`) und der Trigger
`users_adminrolle`; beide lesen den Anspruch aus dem Token des Aufrufers. Mit
dem Dienstschlüssel geschrieben, gälte keine der beiden Regeln mehr — aus
einer Absicherung würde ein Loch, das niemandem auffiele, weil alles weiter
funktioniert.

Dabei kamen zwei Befunde heraus, beide gegen die eigene Annahme:

* Ein deaktiviertes Konto wird mit **401** abgewiesen, nicht mit 403 — eine
  Schicht früher: `app.konto_sperren` setzt `banned_until` und löscht die
  Sitzungen. Die Prüfung wurde an die Wirklichkeit angepasst, nicht die
  Function an die Prüfung.
* Der bestehende Anmelde-Test legte als **Verwaltung** an. Über `signUp` ging
  das — obwohl diese Rolle die Profilzeile nie schreiben kann und die
  Benutzerverwaltung nicht einmal sieht. Herausgekommen wäre genau das
  Waisenkonto, vor dem `provisionUser` warnt.

### Die Push-Meldungen haben jetzt einen Wächter

`app.push_anstossen` warf die Nummer seiner Anfrage weg. Der Anstoss galt als
getan, sobald er in der Warteschlange lag; was zurückkam, landete in
`net._http_response`, und dort sah niemand hin.

**Der Fall, der wehtut**, ist nicht die einzelne verlorene Meldung, sondern
der systematische Ausfall: ein Schlüssel stimmt nicht mehr, die Adresse zeigt
ins Leere, die Function ist nicht ausgeliefert. Dann geht keine Meldung mehr
hinaus — und niemand merkt es, denn eine Push-Meldung, die nicht kommt, sieht
aus wie eine, die es nicht zu senden gab.

**Warum Push nicht in `beurteile` passt**, und warum das eine eigene
Beurteilung bekommen hat statt einer dritten Zeile in der bestehenden:

| | Nachtläufe | Push |
|---|---|---|
| Laufen | **müssen** sie, jede Nacht | **wenn** es etwas zu melden gibt |
| Gemessen wird | eine Frist (50 Stunden) | ein Anteil (wie viele kamen nicht durch) |
| Ruhiges Wochenende | ein Befund | **kein** Befund |

Dieselbe Frist über den Push-Versand gelegt, ergäbe am ruhigen Wochenende
einen Fehlalarm — und eine Warnung, die grundlos erscheint, wird nach zwei
Wochen nicht mehr gelesen. Auch dann nicht, wenn sie einmal recht hat. Der
Unterschied steckt deshalb schon im Typ: `NachtLaufArt` und `LaufArt` sind
zwei Typen, und wer `push` an `beurteile` reicht, bekommt es vom Übersetzer
gesagt und nicht vom Betrieb.

**Ein Nebenbefund aus dem Prüflauf:** seit der Versand seine Anfragen notiert,
liegen im Lauf echte Push-Merkzettel herum. Eine bestehende Prüfung zählte
`count(*)` über die ganze Merkzettel-Tabelle und verglich das mit einem
gefilterten `count` — das ging gut, solange es nur eine Art gab. Zwei
Prüfungen hingen damit an der Reihenfolge der Dateien, und das ist keine
Prüfung.

### Als Nächstes

Stufe 9: den Rückbau. Erst wenn der Betrieb ein paar Tage auf Postgres
gelaufen ist — vorher wäre die Rückfalltür zugemauert, und das ist genau
der Zeitpunkt, zu dem man sie braucht.
