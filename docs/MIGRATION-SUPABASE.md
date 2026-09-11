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

### Was Stufe 0 NICHT beantwortet

Das Ausgangsfach liegt bisher nur im Arbeitsspeicher. Die Fassung für den
Browser (IndexedDB, damit ein Neustart die Warteschlange nicht verliert) und
die Messung der elf Abonnements unter Zeilenschutz stehen noch aus. Beides
gehört vor Stufe 1 abgeschlossen.
