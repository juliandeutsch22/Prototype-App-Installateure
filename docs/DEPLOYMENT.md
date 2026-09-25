# Ein Projekt einrichten und die App ausliefern

> **Stand 19.09.2026.** Diese Anleitung beschrieb bis heute ein System, das es
> nicht mehr gibt: Firestore-Region, Firebase-Auth, einen Bootstrap per
> Dienstkonto und eine DSGVO-Checkliste, die auf Google als
> Auftragsverarbeiter zeigte. Wer danach ausgeliefert hätte, hätte das falsche
> Projekt eingerichtet.
>
> **Die Daten liegen in Postgres (Supabase).** Von Firebase bleiben genau zwei
> Dinge: das **Hosting** und der **Versandweg für Push-Meldungen (FCM)**.

---

## Was wo läuft

| Teil | Wo | Anmerkung |
| --- | --- | --- |
| Daten, Zeilenschutz, Auswertungen | **Supabase Postgres** | Jede Grenze steht als Richtlinie in der Datenbank, nicht im Browser |
| Anmeldung | **Supabase Auth** | Rolle und Betrieb stehen im `app_metadata`, gesetzt von zwei Triggern |
| Dateien (Scheinfotos, Pläne an der Baustelle, Logo) | **Supabase Storage** | |
| Serverlogik | **Postgres-Funktionen, Trigger, `pg_cron`** | Was früher vierzehn Cloud Functions taten |
| Konten anlegen, Startpasswort vergeben, Betrieb anlegen, Sicherung, Push-Versand | **Supabase Edge Functions** | `mitarbeiter-anlegen`, `passwort-vergeben`, `betrieb-anlegen`, `daten-ausleitung`, `push-melden` |
| Auslieferung der App | **Firebase Hosting** | Nur statische Dateien |
| Push aufs Telefon | **Firebase Cloud Messaging** | Ausgelöst von einem Postgres-Trigger, verschickt von `push-melden` |

**Warum FCM bleibt:** eine Push-Meldung braucht einen Dienst, den Apple und
Google akzeptieren. Supabase hat dafür keinen Ersatz. Das ist der einzige
Grund — und der Grund, warum Firebase in der Liste der
Unterauftragsverarbeiter stehen bleibt.

---

## 1 · Supabase-Projekt anlegen

1. Projekt in der **EU-Region** anlegen (Frankfurt). Die Region lässt sich
   später **nicht** ändern; im Zweifel neu anlegen.
2. **Nicht der kostenlose Tarif für den Produktivbetrieb.** Er pausiert das
   Projekt nach sieben Tagen ohne Zugriff — über Weihnachten steht die App.
3. Unter *Project Settings → API* liegen die drei Werte, die gleich gebraucht
   werden: **Project URL**, **anon key**, **service_role key**.

> **Der `service_role`-Schlüssel gehört nirgendwo hin, wo ein Browser ihn
> sieht.** Er hebelt den Zeilenschutz vollständig aus. Er wird an genau zwei
> Stellen gebraucht: einmal von Hand für die Erstanlage (Schritt 4) und in den
> Edge-Function-Secrets. **Nicht** in GitHub-Secrets, **nicht** in `.env`.

---

## 2 · Repository-Geheimnisse hinterlegen

*Settings → Secrets and variables → Actions → New repository secret.*

| Name | Wofür | Pflicht |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Die Adresse des Projekts | **ja** |
| `VITE_SUPABASE_ANON_KEY` | Der öffentliche Schlüssel | **ja** |
| `SUPABASE_ACCESS_TOKEN` | Migrationen und Edge Functions einspielen | **ja** |
| `SUPABASE_PROJECT_REF` | Die Projektkennung | **ja** |
| `SUPABASE_DB_PASSWORD` | Für `supabase db push` | **ja** |
| `FIREBASE_SERVICE_ACCOUNT` | Deploy auf Firebase Hosting | **ja** |
| `VITE_FIREBASE_PROJECT_ID` | Sagt dem Deploy, WOHIN — und richtet nebenbei Push ein | **ja** |
| `VITE_FIREBASE_*` (die übrigen fünf) | Push-Anmeldung im Browser | nein |
| `VITE_FIREBASE_VAPID_KEY` | Web-Push-Zertifikat | nein |

**Der anon-Schlüssel ist kein Geheimnis.** Er steht im ausgelieferten Bundle;
was die Daten schützt, ist der Zeilenschutz. Er steht trotzdem als Secret da,
damit er nicht im Quelltext liegt.

**Ohne die übrigen Firebase-Web-Werte läuft die App vollständig** — es gibt
nur keine Meldungen aufs Telefon, und die Einstellungen sagen das auch so. Der
Deploy bricht deshalb nur bei den Pflichtwerten ab. Die Projektkennung steht
dort, weil `firebase deploy` sie als `--project` braucht: ohne sie gibt es
kein Ziel, und das ist kein Push-Problem, sondern gar kein Deploy.

---

## 3 · Schema und Edge Functions einspielen

Das tut `.github/workflows/supabase-migrationen.yml` von selbst:

- **Auf jedem Pull Request:** die Migrationen laufen gegen eine **frische**
  lokale Datenbank, und die Prüfungen laufen dagegen. Das beantwortet die
  Frage, die ein Blick in die Datei nicht beantwortet — laufen sie in dieser
  Reihenfolge, von null an, ohne die Hand, die beim Schreiben nachgeholfen hat.
- **Auf `main`:** dieselben Migrationen wandern ins echte Projekt, danach die
  Edge Functions.

> **Die Prüfung steht VOR dem Einspielen, nicht daneben.** Eine Migration, die
> einmal im Projekt liegt, ist dort — es gibt kein Zurück durch ein `git
> revert`, die Tabelle ist geändert und die Daten sind es womöglich auch.

Von Hand geht es auch:

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy --project-ref <ref>
```

---

## 4 · Erstanlage: Betrieb und erster Zugang

**Henne und Ei, zweimal übereinander.** Einen Betrieb legt die Edge Function
`betrieb-anlegen` an, und die lässt nur herein, wer in `platform_admins` steht.
In `platform_admins` trägt niemanden die App ein — die Tabelle hat absichtlich
keine einzige Richtlinie. Beim allerersten Mal gibt es also weder einen Betrieb
noch jemanden, der einen anlegen dürfte.

`scripts/bootstrap-postgres.mjs` durchbricht den Ring **genau einmal**, über
dieselbe Datenbankfunktion, die auch die Edge Function ruft:

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_KEY=<service_role-Schlüssel> \
ADMIN_EMAIL=chef@betrieb.at ADMIN_NAME="Vorname Nachname" \
COMPANY_NAME="Betrieb GmbH" COMPANY_ID=betrieb \
[PLATTFORM_EMAIL=... PLATTFORM_NAME=...] \
node scripts/bootstrap-postgres.mjs
```

Das Skript **setzt kein Passwort und gibt keinen Link aus**. Der Zugang wird
über „Passwort vergessen?" auf dem Anmeldebildschirm freigeschaltet — so läuft
kein Geheimnis durch ein Protokoll, das später jeder mit Repo- oder
Terminalzugriff liest. Es ist mehrfach ausführbar.

**Zwei Konten, nicht eines.** Ein Plattformverwalter gehört zu keinem Betrieb,
und das setzt die Datenbank durch: gäbe es für dieselbe Kennung beides,
entschiede allein die Reihenfolge zweier Trigger, ob am Ende ein
Plattformkonto oder ein Konto MIT Betrieb dasteht — und mit einem Betrieb im
Token greift jede Leseregel.

---

## 5 · Die nächtliche Sicherung einrichten

Der Zeitplan liegt als `pg_cron`-Eintrag in der Datenbank; die Arbeit tut die
Edge Function `daten-ausleitung`. Ohne Ziel ausser Haus schreibt sie in den
eigenen Speicher — das hilft gegen einen Fehlgriff, **nicht** gegen einen
Ausfall des Projekts.

Unter *Project Settings → Edge Functions → Secrets* hinterlegen:

| Name | Bedeutung |
| --- | --- |
| `SICHERUNG_S3_ENDPUNKT` | Adresse des zweiten Anbieters |
| `SICHERUNG_S3_REGION` | |
| `SICHERUNG_S3_EIMER` | |
| `SICHERUNG_S3_SCHLUESSEL` | Zugangskennung |
| `SICHERUNG_S3_GEHEIMNIS` | Zugangsschlüssel |
| `FCM_DIENSTKONTO` | Dienstkonto-JSON für den Push-Versand |
| `AUSLEITUNG_TAGE` | Aufbewahrung, Vorgabe 30 |

**Alle fünf oder keines.** Halb eingerichtet gilt als Fehler, mit dem Namen des
fehlenden Feldes — eine Sicherung, die stillschweigend woanders landet als
gedacht, ist die gefährlichste Sorte.

> **Diese Zugangsdaten gehören ausschliesslich in die Edge-Function-Secrets.**
> Nicht in GitHub, nicht ins Repository, nicht in eine Chatnachricht.

**Der Schlüssel draussen darf nur anlegen** — nicht lesen, nicht löschen, nicht
überschreiben. Wer morgen dieses Projekt übernimmt, hat damit einen Schlüssel,
mit dem er die abgelegten Stände *nicht vernichten kann*.

Danach **einmal von Hand auslösen**: *Einstellungen → Datensicherung →
Sicherung jetzt erstellen*. Der Knopf sagt, wie viele Datensätze geschrieben
wurden und wohin. Eine Sicherung, die niemand je ausgelöst hat, ist keine.

---

## 6 · Die App ausliefern

`.github/workflows/deploy.yml` läuft auf `main`: Prüfungen, Bauen, Deploy auf
Firebase Hosting. Die Konfiguration wird beim **Bauen** in das Bundle gebacken,
nicht beim Deploy.

### Nachsehen, was wirklich ausgeliefert wurde

Im Kopf der App steht die Fassung (Commit und Bauzeit). Aus dem Betrieb kam
schon „keine deiner Änderungen ist in der App" — der Deploy meldete Erfolg, das
Telefon zeigte etwas anderes. Drei Möglichkeiten, und die Zeile beantwortet die
ersten zwei in einer Sekunde: der Deploy kam nicht an, der Zwischenspeicher des
Telefons hält eine alte Fassung, oder die Änderung hängt an einer Bedingung.

**Steckt ein Telefon fest:** die App vom Startbildschirm entfernen und neu
hinzufügen. Der Service Worker behält die alten Bausteine, bis die neue Fassung
vollständig da ist — das ist Absicht und macht einen halben Deploy unsichtbar
statt kaputt.

---

## 7 · Support: hineinsehen, ohne einen Generalschlüssel zu haben

**Es gibt kein Konto, das überall hineinsieht — und das ist keine Askese,
sondern die Folge einer unangenehmen Feststellung:** der Generalschlüssel
existierte längst. Er heisst `service_role`, liegt in den
Edge-Function-Secrets, umgeht jeden Zeilenschutz, erreicht jeden Mandanten und
hinterlässt keine Spur. Ihn als Supportweg zu benutzen hiesse: bei jeder
Nachfrage eines Betriebs in ALLE Betriebe schauen zu können, ohne dass es
irgendwo stünde.

Der Supportzugang ersetzt genau das.

### Die zwei Konten

| Konto | Wofür | Was es sieht |
| --- | --- | --- |
| **Plattformkonto** (`platform_admins`) | Betriebe anlegen, Support | Von sich aus: **nichts**. Erst mit einer Freigabe den einen Betrieb, der sie erteilt hat |
| **Betriebskonto** (`users`) | Arbeiten | Den eigenen Betrieb, nach Rolle |

Dieselbe Anmeldekennung kann **nie beides** sein; zwei Auslöser in der
Datenbank verhindern es in beide Richtungen. Gäbe es für eine Kennung beides,
entschiede allein die Reihenfolge der Auslöser, welche Ansprüche am Ende
stehen — und mit einem Betrieb im Token greift jede Leseregel.

### Wie die Anmeldung aussieht

**Es gibt nur eine Anmeldemaske**, dieselbe Adresse, dasselbe Formular. Was
danach erscheint, entscheidet der Anspruch im Token:

- Token **mit** `company_id` → die App, mit Navigation und Reitern nach Rolle.
- Token mit `plattform_admin` → **eine einzige Seite ohne Navigation**:
  „Betriebe anlegen", darunter „Einblick gewährt" und „Notzugang".

Kein Rollenwechsler, kein „als Betrieb X anmelden". Ein Plattformkonto
*wird* nie zu einem Betriebskonto; es bekommt nur für die Dauer einer
Freigabe Zugang zu **einem** Betrieb.

### Zwei Stufen — der Betrieb wählt beim Gewähren

| Stufe | Was der Support kann | Wie lange |
| --- | --- | --- |
| **Ansehen** (Vorgabe) | Den Betrieb sehen wie ein Administrator — alle Listen, alle Detailansichten. Ändern: nichts | bis 7 Tage |
| **Mitarbeiten** | Dasselbe, und **ändern** — wie ein Administrator | höchstens **24 Stunden** |

**Wer nichts ankreuzt, gibt kein Schreibrecht.** Die harmlosere Antwort ist
die Vorgabe; eine Maske, bei der Wegklicken das mehr erlaubt, wäre falsch
herum gebaut. Die Stufe steht mit dem Gewähren fest und lässt sich
nachträglich nicht anheben — sonst bezöge sich die Zustimmung auf etwas
anderes als das, was danach gilt.

**Der Support arbeitet in der ECHTEN App**, nicht in einem Nachbau: „Öffnen"
setzt ihn in den Betrieb, mit denselben Reitern und denselben Ansichten, die
der Betrieb sieht. Ganz oben steht dabei ein Band mit dem Namen des Betriebs
— bei „Mitarbeiten" in Rot, weil die Oberfläche sonst aussieht wie jede
andere und genau daraus der Fehler entsteht, der weh tut.

> Bis zum 21.09.2026 gab es dafür eine zweite, eigene Oberfläche mit vier
> Listen ohne Details. Sie beantwortete die Frage nicht, mit der ein Betrieb
> anruft („die Rechnung stimmt nicht" — welche Position denn?), und sie wäre
> jeder Änderung an der App hinterhergelaufen.

### Wie ein Supportfall abläuft

1. **Der Betrieb ruft an.** „Die Rechnung RE-2026-0042 stimmt nicht.“
2. **Der Betrieb gewährt** — *Einstellungen → Supportzugang*, nur
   Geschäftsführung/Administration: Grund eintragen, **Stufe** wählen
   (Ansehen oder Mitarbeiten), Dauer wählen, freigeben. Ab diesem Moment
   steht **in seiner App ein Band über dem Inhalt**, für jeden Mitarbeiter,
   mit dem Grund darin — bei „Mitarbeiten" in Rot und mit dem Zusatz, dass
   der Support auch ändern kann.
3. **Der Support meldet sich an** und sieht den Betrieb unter „Einblick
   gewährt" — mit Grund, Stufe und Frist. „Öffnen" setzt ihn **in die echte
   App** dieses Betriebs.
4. **Jeder geöffnete Bereich wird protokolliert**, und zwar *bevor* er geladen
   wird: scheitert die Meldung, beginnt der Einblick gar nicht.
5. **Der Betrieb beendet** — ein Klick, sofort wirksam — oder die Frist
   läuft ab. Beides nimmt das Leserecht in derselben Sekunde weg.

### Was ein Supportzugang nicht kann

- **Zeitbuchungen, Urlaube, Scheinfotos lesen — in BEIDEN Stufen.** Dort
  stehen Kranken- und Urlaubstage (Art. 9 DSGVO) und Aufnahmen aus
  Kundenwohnungen. Sie sind zusätzlich auch gegen Schreiben verriegelt: blind
  ändern zu können, was man nicht sehen darf, wäre die schlechteste aller
  Kombinationen.
- **Bei „Ansehen" schreiben.** Nirgends. Der Riegel liegt als Auslöser vor
  *jeder* Tabelle mit `company_id`, nicht in der Oberfläche; ein
  Schema-Wächter prüft, dass keine fehlt.
- **In einem anderen Betrieb schreiben.** Auch mit „Mitarbeiten" nicht: der
  Riegel vor jeder Tabelle liest den Betrieb aus der Zeile (bei `companies`
  aus der Kennung) und lässt nur durch, wofür GENAU dieser Betrieb
  „Mitarbeiten" gewährt hat. Bis zum Prüflauf vom 25.09.2026 fehlte er an
  `companies`; mit „Mitarbeiten" in A und „Ansehen" in B liessen sich die
  Bankdaten von B ändern.
- **Was dabei offen bleibt, sei benannt:** die Rollenfunktionen kennen keinen
  Betrieb. Wer in A „Mitarbeiten" hat und in B „Ansehen", sieht in B auch,
  was dort nur die Spitze liest (etwa Angebote) — nicht mehr, als „Ansehen"
  oben ohnehin verspricht, und nie Zeitbuchungen, Urlaube, Krankmeldungen
  oder Scheinfotos.
- **Sich selbst freigeben.** Der gewöhnliche Weg ist für ein Plattformkonto
  gesperrt.

### Der Notzugang — und wann er benutzt wird

Nur, wenn der Betrieb **selbst nicht mehr freigeben kann**: der letzte
Administrator ist weg, die Anmeldung klemmt. Er läuft ohne Zustimmung, aber
nicht heimlich — gekennzeichnet, höchstens 24 Stunden, im Protokoll des
Betriebs, mit demselben Band in seiner App, vom Betrieb jederzeit beendbar.

**Ein Notzugang ist immer „Ansehen".** Schreibrechte ohne Zustimmung wären
genau der Generalschlüssel, den dieser ganze Bau vermeiden soll. Damit bleibt
ein Fall offen und er sei hier benannt: ist der letzte Administrator eines
Betriebs weg, kann ihm auch der Support keinen neuen anlegen. Heute hilft nur
der Dienstschlüssel von Hand — schriftlich festgehalten, siehe unten.

**Der Dienstschlüssel bleibt trotzdem, was er ist.** Er liegt in den
Serverfunktionen und im nächtlichen Lauf und kann weiterhin alles. Er ist nur
nicht mehr der Supportweg. Wer ihn im Ernstfall doch braucht (Rettung einer
Datenbank, Migration von Hand), sollte das schriftlich festhalten — die
Datenbank tut es nicht.

---

## 8 · Änderungen im laufenden Betrieb einspielen

### Der Weg, kurz

```
Branch → Pull Request → grüne Prüfungen → Merge nach main → Schema → App
```

Auf `main` läuft **ein Workflow, drei Aufträge nacheinander**, nicht nebeneinander:

| Schritt | Auftrag in `supabase-migrationen.yml` | Was er tut | Dauer |
| --- | --- | --- | --- |
| 1 | „Migrationen von null an" | Migrationen **von null an** gegen eine frische Datenbank + alle Datenbankprüfungen | ~6 min |
| 2 | „Ins Projekt einspielen" | `db push` ins echte Projekt, danach die Edge Functions | ~3 min |
| 3 | „App ausliefern" | ruft `deploy.yml` auf: Typen, Lint, alle Bausteinprüfungen, Bauen, Deploy auf Firebase Hosting | ~3 min |

`deploy.yml` startet auf `main` **nicht selbst**; die Migrationen rufen es per
`workflow_call` auf, und zwar erst, wenn das Einspielen gelungen ist. Zusammen
also **gut zehn Minuten** vom Merge bis auf die Telefone.

> **Nicht per `workflow_run`.** Das stand zwei Tage lang da und ist beim ersten
> Merge nie angesprungen: GitHub liest `workflow_run` nur aus der Fassung auf
> dem **Standardbranch** des Repositorys — und der war nicht `main`. Ein Aufruf
> per `uses:` kommt aus demselben Commit und hängt an keiner Einstellung.
> `tests/unit/auslieferungsKette.test.ts` hält die Kette fest.

> **Scheitert eine Migration, geht die App gar nicht erst live.** Vorher wäre
> sie gestartet und hätte auf ein Schema getroffen, das nie kam.

> **Die Prüfung steht VOR dem Einspielen, nicht daneben.** Eine Migration, die
> einmal im Projekt liegt, ist dort — ein `git revert` holt sie nicht zurück.

Der Migrationslauf hat auf `main` deshalb **keinen Pfadfilter** mehr. Die App
geht nur über ihn live; mit Filter bliebe jede Änderung, die `supabase/` nicht
berührt, stillschweigend liegen. Der Preis
sind ein paar Minuten je Auslieferung — `db push` findet dann nichts Neues.

**Hängt die Kette einmal**, gibt es den Deploy von Hand: *Actions → „Test und
Deploy" → Run workflow* auf `main`.

### Was der Betrieb davon merkt

**Beim Kaltstart nichts:** wer die App öffnet, bekommt die neue Fassung ohne
Rückfrage. Es kann nichts verlorengehen, weil noch nichts eingegeben wurde.

**Beim Fortsetzen wird gefragt.** Wer mitten in einem Handwerksschein steht,
bekommt eine Leiste „neue Fassung“ und entscheidet selbst — ein
selbsttätiger Neustart würfe ihm die Unterschrift weg, ausgelöst von einem
Deploy, mit dem er nichts zu tun hat.

**Nachsehen, was wirklich läuft:** im Kopf der App steht die Fassung (Commit
und Bauzeit). Steckt ein Telefon fest, gibt es dort auch „App erneuern“.

### DIE REGEL, AN DER ALLES HÄNGT: abwärtskompatibel migrieren

**Eine Richtung ist seit dem 20.09.2026 zugemacht, die andere bleibt offen.**

Bis dahin gingen Datenbank und App *gleichzeitig los* — und kamen nicht
gleichzeitig an: die App nach 3 Minuten, die Migrationen nach 7. Dazwischen
lief vier Minuten lang **neue App gegen altes Schema**. Seit der Deploy hinter
den Migrationen hängt, gibt es dieses Fenster nicht mehr.

**Die Gegenrichtung lässt sich nicht zumachen.** Auf den Telefonen läuft die
alte Fassung weiter, bis jemand die App neu öffnet — im Zweifel Tage. Also
läuft dort **alte App gegen neues Schema**, und zwar so lange, wie es dauert.

Jede Änderung muss deshalb **diese Richtung aushalten**:

| Geht immer | Geht nur in zwei Schritten |
| --- | --- |
| Spalte **hinzufügen** (nullable oder mit Vorgabe) | Spalte **umbenennen** |
| Tabelle hinzufügen | Spalte **löschen** |
| Neue Funktion, neue Regel | Spalte **verpflichtend** machen |
| Prüfung **lockern** | Prüfung **verschärfen** bei Bestandsdaten |

**Zwei Schritte heisst:** erstens die neue Form daneben anlegen und beides
schreiben; zweitens — in einem späteren Deploy, wenn alle Geräte die neue
Fassung haben — die alte Form entfernen. Eine Woche dazwischen ist ein
brauchbares Mass; auf einem Telefon, das im Urlaub liegt, läuft die alte
Fassung länger.

> **Die Tabelle gilt weiter, auch mit der Kette.** Sie schützt nicht mehr vor
> den vier Minuten zwischen zwei Abläufen — die gibt es nicht mehr —, sondern
> vor dem Telefon, das seit Freitag im Auto liegt. Wer eine Spalte umbenennt
> und sich auf die Reihenfolge verlässt, hat den falschen Gegner im Blick.

### Wenn etwas schiefgeht

- **Code kaputt** → `git revert` auf `main`, der Deploy läuft von selbst
  wieder. Drei Minuten.
- **Migration kaputt** → **kein Zurück durch `git revert`.** Es braucht eine
  NEUE Migration, die zurücknimmt, was die kaputte getan hat. Deshalb laufen
  die Migrationen vorher von null an gegen eine frische Datenbank.
- **Daten kaputt** → Point-in-Time-Recovery im Supabase-Projekt (kostenpflichtiger
  Zusatz, siehe Checkliste) oder der nächtliche Stand aus der Sicherung. Der
  Rücklauf füllt eine Datenbank, er baut keine: zuerst ein frisches Projekt
  mit den Migrationen, dann der Rücklauf.

### Wann eingespielt wird

**Nicht Freitag um 16 Uhr, und nicht während der Monatsabrechnung.** Der
Vormittag ist die ungünstigste Zeit — da sind die Monteure auf der Baustelle
und buchen. Am ruhigsten ist der frühe Nachmittag: die Werkstatt ist unterwegs,
das Büro ist da und erreichbar, falls etwas auffällt.

---

## DSGVO-Checkliste vor dem echten Betrieb

- ☐ **Supabase-Projekt in der EU**, nachweisbar für den AV-Vertrag.
- ☐ **Point-in-Time-Recovery** aktiv (kostenpflichtiger Zusatz).
- ☐ **AV-Verträge**: Supabase (Datenbank, Anmeldung, Speicher), Google
  (Firebase Hosting und FCM), der Anbieter der Sicherung ausser Haus.
- ☐ **Verzeichnis der Verarbeitungstätigkeiten** und TOMs.
- ✅ **Datenexport je Betrieb**: *Einstellungen → Datensicherung → Alle Daten
  herunterladen*. Die Sammlungsliste kommt aus dem Katalog der Datenbank, nicht
  aus einer Datei, die jemand pflegt — eine vergessene Tabelle wäre sonst eine
  unvollständige Auskunft.
- ☐ **Zweiter Datenstandort**: siehe Schritt 5. Der Haken gehört gesetzt, wenn
  die Sicherung ausserhalb des Supabase-Projekts liegt.
- ☐ **§ 96 ArbVG**: reine Zeiterfassung ist unkritisch. **Kein GPS, solange
  keine Betriebsvereinbarung vorliegt** — eine Ortung nachzurüsten ist
  technisch eine Stunde und rechtlich ein halbes Jahr.
- ☐ **Firmenstammdaten** hinterlegen (Briefkopf, IBAN, UID, Logo): sie stehen
  auf jeder Rechnung und jedem Schein.

---

## Häufige Stolpersteine

- **Die App startet gar nicht** → `VITE_SUPABASE_URL` oder
  `VITE_SUPABASE_ANON_KEY` fehlt. Absichtlich ein harter Abbruch mit Meldung:
  eine App, die startet und erst beim ersten Speichern scheitert, kostet mehr
  Zeit.
- **Anmeldung geht, aber jede Liste ist leer** → im Token fehlen Betrieb oder
  Rolle. Einmal ab- und wieder anmelden; bleibt es, hat der Trigger die
  Belegschaftszeile nicht gesehen.
- **„Keine Meldungen aufs Telefon"** → auf iOS gibt es Web-Push erst ab
  iOS 16.4 und **nur**, wenn die App über „Zum Home-Bildschirm" installiert
  wurde. Im Safari-Tab bleibt es still; das ist eine Eigenheit von iOS und wird
  in den Einstellungen erklärt.
- **Die Sicherung meldet „halb eingerichtet"** → eines der fünf
  `SICHERUNG_S3_*`-Geheimnisse fehlt. Die Meldung nennt es beim Namen.
