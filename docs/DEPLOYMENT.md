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
| Dateien (Scheinfotos, Logo) | **Supabase Storage** | |
| Serverlogik | **Postgres-Funktionen, Trigger, `pg_cron`** | Was früher vierzehn Cloud Functions taten |
| Konten anlegen, Betrieb anlegen, Sicherung, Push-Versand | **Supabase Edge Functions** | `mitarbeiter-anlegen`, `betrieb-anlegen`, `daten-ausleitung`, `push-melden` |
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
  „Betriebe anlegen“, darunter „Einblick gewährt“ und „Notzugang“.

Kein Rollenwechsler, kein „als Betrieb X anmelden“. Ein Plattformkonto
*wird* nie zu einem Betriebskonto; es bekommt nur für die Dauer einer
Freigabe Leserecht auf einen Betrieb.

### Wie ein Supportfall abläuft

1. **Der Betrieb ruft an.** „Die Rechnung RE-2026-0042 stimmt nicht.“
2. **Der Betrieb gewährt** — *Einstellungen → Supportzugang*, nur
   Geschäftsführung/Administration: Grund eintragen, Dauer wählen (4 h …
   7 Tage), freigeben. Ab diesem Moment steht **in seiner App ein Band über
   dem Inhalt**, für jeden Mitarbeiter, mit dem Grund darin.
3. **Der Support meldet sich an** und sieht den Betrieb unter „Einblick
   gewährt“ — mit Grund und Frist. „Öffnen“ führt zu vier Listen: Betrieb,
   Benutzer, Baustellen, Rechnungen. **Keine Knöpfe**, weil es nichts zu
   ändern gibt.
4. **Jeder geöffnete Bereich wird protokolliert**, und zwar *bevor* er geladen
   wird: scheitert die Meldung, wird nichts gezeigt.
5. **Der Betrieb beendet** — ein Klick, sofort wirksam — oder die Frist
   läuft ab. Beides nimmt das Leserecht in derselben Sekunde weg.

### Was ein Supportzugang nicht kann

- **Schreiben.** Nirgends. Der Riegel liegt als Auslöser vor *jeder* Tabelle
  mit `company_id`, nicht in der Oberfläche; ein Schema-Wächter prüft, dass
  keine fehlt.
- **Zeitbuchungen, Urlaube, Scheinfotos lesen.** Dort stehen Kranken- und
  Urlaubstage (Art. 9 DSGVO) und Aufnahmen aus Kundenwohnungen.
- **Sich selbst freigeben.** Der gewöhnliche Weg ist für ein Plattformkonto
  gesperrt.

### Der Notzugang — und wann er benutzt wird

Nur, wenn der Betrieb **selbst nicht mehr freigeben kann**: der letzte
Administrator ist weg, die Anmeldung klemmt. Er läuft ohne Zustimmung, aber
nicht heimlich — gekennzeichnet, höchstens 24 Stunden, im Protokoll des
Betriebs, mit demselben Band in seiner App, vom Betrieb jederzeit beendbar,
und ebenso wenig schreibberechtigt.

**Der Dienstschlüssel bleibt trotzdem, was er ist.** Er liegt in den
Serverfunktionen und im nächtlichen Lauf und kann weiterhin alles. Er ist nur
nicht mehr der Supportweg. Wer ihn im Ernstfall doch braucht (Rettung einer
Datenbank, Migration von Hand), sollte das schriftlich festhalten — die
Datenbank tut es nicht.

---

## 8 · Änderungen im laufenden Betrieb einspielen

### Der Weg, kurz

```
Branch  →  Pull Request  →  grüne Prüfungen  →  Merge nach main  →  zwei Abläufe
```

Auf `main` starten **zwei Workflows**:

| Ablauf | Was er tut | Dauer |
| --- | --- | --- |
| `deploy.yml` | Typen, Lint, alle Bausteinprüfungen, Bauen, Deploy auf Firebase Hosting | ~3 min |
| `supabase-migrationen.yml` | Migrationen **von null an** gegen eine frische Datenbank + alle Datenbankprüfungen, **danach** `db push` ins echte Projekt und Edge Functions | ~7 min |

Der zweite läuft nur, wenn sich unter `supabase/**` etwas geändert hat.

> **Die Prüfung steht VOR dem Einspielen, nicht daneben.** Eine Migration, die
> einmal im Projekt liegt, ist dort — ein `git revert` holt sie nicht zurück.

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

**Datenbank und App gehen gleichzeitig los, aber sie kommen nicht gleichzeitig
an.** Gemessen am Lauf vom 20.09.2026: die App war nach 3 Minuten draußen, die
Migrationen nach 7. Dazwischen lief **neue App gegen altes Schema**. Und auf
den Telefonen läuft die alte Fassung ohnehin weiter, bis jemand die App neu
öffnet — also auch **alte App gegen neues Schema**.

Jede Änderung muss deshalb **beide Richtungen aushalten**:

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

> **Offen und bewusst benannt:** die Reihenfolge ist heute *App zuerst,
> Datenbank danach* — also genau die ungünstige. Solange alle Änderungen der
> Tabelle oben folgen, ist das harmlos. Den Deploy an die Migrationen zu
> hängen wäre die saubere Lösung und ist nicht gebaut.

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
