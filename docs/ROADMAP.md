# Roadmap

Stand: 02.09.2026. Reihenfolge nach Nutzen für den Betrieb, nicht nach
Aufwand. Was den Produktivbetrieb blockiert, steht oben.

> **Diese Datei ist ein Änderungsprotokoll**, keine Übersicht: sie erzählt, was
> wann warum gebaut wurde. Wer wissen will, *was es gibt, wer was darf und
> worauf man sich verlassen kann*, findet das in
> **[docs/FUNKTIONEN.md](./FUNKTIONEN.md)** — inklusive der Lücken.

---

## Fahrplan: was die App zu einer vollständigen Betriebslösung fehlt

Maßstab ist nicht die Zahl der Funktionen, sondern eine Prüffrage: **kommt das
Büro ohne ein zweites System durch den Tag?** Heute nicht ganz — angeboten
wird in Word oder Excel, und der Steuerberater bekommt PDFs, die jemand
abtippt. Der Kreis ist an zwei Stellen offen.

Reihenfolge nach Wirkung je Aufwand:

1. **Kundenstammdaten** — ERLEDIGT, siehe unten.
2. **Digitaler Handwerksschein** — Stufe 1 ERLEDIGT, siehe unten. Stufen 2
   bis 4 (Fotos, Versand, Verbindung zur Rechnung) stehen im Fahrplan.
3. **Buchhaltungs-Übergabe** — ERLEDIGT, siehe unten. *Weiterhin vorab zu
   klären:* ob der Betrieb Barumsätze hat — dann wäre die
   Registrierkassenpflicht ein eigenes Thema.
4. **Angebot und Vorkalkulation** — ERLEDIGT, siehe unten.
5. **Nachkalkulation in Geld** — ERLEDIGT, siehe unten.

Weiter offen, aber nachrangig: Wartungsverträge und wiederkehrende Termine
(die jährliche Thermenwartung ist planbare Auslastung), Prüfungen gegen das
Arbeitszeitgesetz (Höchstarbeitszeit, Ruhezeiten — bei Notdiensten über
Mitternacht kein akademischer Punkt), Fahrzeug- und Werkzeugverwaltung.
Urlaub als Antrag mit Genehmigung ist ERLEDIGT, siehe unten.

**Was bewusst NICHT das Ziel ist:** Funktionsgleichstand mit einer dreißig
Jahre alten Handwerkersoftware. Deren Büroseite ist mächtig, und ihre Monteure
tragen trotzdem wieder Zettel ins Auto. Auf der Funktionsliste ist das Rennen
nicht zu gewinnen, auf „der Mann im Keller mit Handschuhen kommt damit klar"
schon.

## Erledigt: der Materialablauf hat Tests — und dabei fiel ein eigener Fehler auf

Nach den vier Kernansichten der nächste ganze ARBEITSABLAUF statt der nächsten
Ansicht: anfordern (`OrderView`), bearbeiten (`AdminOrdersView`), Bestand
führen (`StockView`). Drei Ansichten, ein Weg — vom Monteur im Keller bis zum
Regal. 44 neue Ansichtstests, 9 auf die Retoure.

**DER FUND: „Abgeholt" hat seit dem Sicherheits-Durchgang nichts mehr getan.**
Dort wurde der Materialstamm auf Verwaltung und Leitung eingegrenzt, mit dem
Satz „gebucht wird ohnehin nur unter Material → Lager". Der Satz war falsch.
Der Monteur bewegt den Bestand an zwei Stellen selbst — beim Abholen und bei
einer Retoure —, und beides läuft in einer Transaktion, die Anforderung UND
Bestand schreibt. Scheitert der Bestandsteil, scheitert alles: die Anforderung
blieb offen, der Knopf reagierte nicht, eine Meldung gab es nicht. Die Regel
trennt jetzt nach FELDERN statt nach Rollen — `stock` bewegt jeder im Betrieb,
Bezeichnung und Preis bleiben bei der Verwaltung. Mit `hasOnly`, nicht
`hasAny`: sonst reichte ein mitgeschicktes `stock`, um den Preis gleich mit zu
ändern. Genau dafür gibt es jetzt einen eigenen Regeltest.

Bitter daran ist nicht der Fehler, sondern dass mein damaliger Regeltest ihn
MITGESCHRIEBEN hat. Er prüfte „der Monteur ändert den Bestand nicht" und war
grün — er hielt eine Annahme fest, die ich nie am Ablauf geprüft hatte. Ein
Test schützt nur die Grenze, die man tatsächlich meint.

**Zwei weitere Befunde aus demselben Durchgang:**

- **Die Retoure war nicht atomar.** Erst der Beleg, dann in einem zweiten
  Vorgang die Gutschrift. Scheiterte der zweite, stand der Beleg schon da, mit
  `processed: true`, und der Bestand war nicht erhöht. Die Ansicht meldete
  „Die Retoure konnte nicht erfasst werden" — was nicht stimmte. Wer es noch
  einmal versuchte, legte einen ZWEITEN Beleg an. Beides läuft jetzt in einer
  Transaktion: entweder beides oder nichts.
- **Der Bestätigungsknopf beim Abholen hiess „Löschen".** Der Dialog bekam
  kein `confirmLabel` und nahm seine Vorgabe — in Rot, unter der Frage
  „Material abgeholt?". Wer das liest, tippt nicht darauf.

Geprüft: 565 ohne Emulator (53 neu), 137 dagegen (6 neu). Jeder neue Test ist
gegen den alten Stand laufen gelassen worden und fällt dort durch; bei zwei
Tests war er das zunächst NICHT — einer prüfte die Sortierung mit Daten, die
auch alphabetisch in derselben Reihenfolge standen, der andere sah den
Beleg nicht, der an der Transaktion vorbei geschrieben wurde. Beide sind
nachgeschärft, bis sie den alten Stand wirklich durchfallen lassen.

---

## Erledigt: drei Meldungen aus dem Betrieb, 02.09.2026 abends

Alle drei aus derselben Sitzung auf dem iPhone, und alle drei berechtigt.

### 1. „Die App lädt gar nicht mehr" — und mein eigener Fehler daran

Auf dem Schirm stand: **`'text/html' is not a valid JavaScript MIME type.`**

Die Ursache ist die vom Vormittag bekannte — nach einem Deploy fordert die
noch laufende Seite einen Baustein an, den es unter diesem Namen nicht mehr
gibt. Neu ist, WIE das aussieht: der Hosting-Rewrite `"source": "**"` schickt
jede unbekannte Adresse auf `index.html`, mit **Status 200 und `text/html`**.
Es gibt also gar keinen 404, an dem ein Fehler erkennbar wäre.

Daraus folgten zwei Fehler, beide meine:

- **Der Service Worker hat die Startseite unter dem Namen der
  JavaScript-Datei gespeichert.** Die Prüfung lautete `res.ok && res.status
  === 200` — und genau das war die Antwort. Danach lieferte er sie von dort
  aus, ohne das Netz noch zu fragen: der Fehler blieb stehen, bis jemand die
  App neu startete. Genau das hat der Betrieb beschrieben.
- **Die Selbstheilung lief nicht an.** Die Erkennung von Nachladefehlern kannte
  vier Formulierungen, aber nicht die von Safari. Der Monteur bekam deshalb
  die Fehlertafel mit „Erneut versuchen" — dem Knopf, von dem am Vormittag
  festgehalten wurde, dass er hier per Konstruktion nichts ausrichten kann.

Jetzt drei Lagen übereinander: der Worker erkennt eine Startseite, die als
Baustein ausgegeben wird, speichert sie **nicht** und macht daraus einen
sauberen Fehlschlag; die Erkennung kennt die Formulierungen aller drei
Browser; und `vite:preloadError` greift schon, bevor React überhaupt etwas
sieht. Der zugehörige Test enthält die gemeldete Meldung wörtlich.

### 2. „Das Erfassen einer Zeitbuchung hat lange gedauert"

Drei Kosten lagen hintereinander, und keine davon war sichtbar:

- Die **Doppelbuchungsprüfung** ist eine Abfrage, und Firestore-Abfragen haben
  keine Zeitgrenze. Auf einer zähen Verbindung wartete das Speichern
  unbegrenzt, bevor der Schreibvorgang überhaupt losging. Jetzt drei Sekunden
  Frist; läuft sie ab, wird gebucht. Die Abwägung dahinter: eine Doppelbuchung
  steht sichtbar in der Liste und ist in zehn Sekunden gelöscht, eine Zeit,
  die sich nicht buchen lässt, kostet den Monteur den Nachtrag am Abend.
- Der laufende Monat wurde **ein zweites Mal vom Server geholt**, obwohl das
  Live-Abo ihn längst geliefert hatte — sein Fenster reicht drei Monate
  zurück. Jetzt aus den vorhandenen Einträgen abgeleitet. Nebenbei stimmt der
  Saldo damit besser: die zweite Abfrage hatte keine obere Grenze und zählte
  auch Buchungen in der Zukunft mit, für die noch gar kein Soll besteht.
- Der Saldo wurde **je Buchung zweimal** gerechnet. Firestore meldet einen
  Schnappschuss zweimal — sofort aus dem lokalen Zwischenspeicher und noch
  einmal nach der Bestätigung des Servers —, mit gleichem Inhalt, aber neuem
  Array. Der Effekt hing an der Array-Identität. Jetzt am Inhalt.

### 3. „Nach der Erfassung kam die Meldung, dass keine Mitarbeiter existieren"

Die Meldung war richtig und trotzdem irreführend. Geschäftsführung,
Projektleitung und Administration führen kein Zeitkonto (`shouldShowOvertime`)
und erscheinen in der Mitarbeiterübersicht deshalb nie — auch nicht mit
eigenen Buchungen. Wer als Geschäftsführung eine Zeit bucht und danach dorthin
sieht, liest „keine aktiven Mitarbeiter" und hält es für einen Fehler.

Die Ansicht unterscheidet jetzt zwei Lagen mit zwei verschiedenen nächsten
Schritten: „noch keine Benutzer angelegt" und „kein Konto führt ein
Zeitkonto — Leitung erscheint hier nicht, Monteure legst du unter
Benutzerverwaltung an".

*Geprüft:* 512 ohne Emulator (9 neu), 131 dagegen. Jeder der neuen Tests ist
gegen den alten Code gelaufen und schlägt dort fehl — einer davon erst im
zweiten Anlauf: die erste Fassung prüfte nichts, weil ein zweiter
Schnappschuss ohne neues Abo gar nicht ausgelöst wurde.

## Erledigt: die vier Kernansichten haben Tests

Die größte Lücke der Prüftiefe, seit Längerem als Nummer eins geführt:
Zeiterfassung (meistbenutzt), Rechnungen (Geld), Einsatzplanung (löscht
Daten), Baustellen. 28 neue Tests.

**Geprüft wird die Verdrahtung, nicht die Rechnung.** Die Formeln sind längst
abgedeckt — `assemble`, `totals`, `time`, `invoiceNumbers`. Was fehlte, war
die Naht dazwischen, und genau dort lagen bisher alle gemeldeten Fehler.

Was jetzt festgehalten ist, in der Reihenfolge, in der es wehtäte:

- **Rechnungen: die Reihenfolge.** Nummer verbindlich ziehen, dann Belege
  sperren, dann anlegen. Dreht man die letzten beiden um, ist im Fehlerfall
  ein Zeiteintrag ein zweites Mal verrechenbar, und der Kunde bekommt
  dieselbe Stunde zweimal in Rechnung gestellt. Der Test hält außerdem fest,
  dass die verbindliche Nummer aus der Transaktion kommt und nicht aus dem
  Vorschlag im Feld — der ist veraltet, sobald jemand parallel abrechnet.
- **Zeiterfassung: welcher Weg zum Saldo.** Deckt der Marker den
  Eintrittsmonat nicht ab, muss die Ansicht auf die Rohdaten zurückfallen.
  Täte sie es nicht, summierte sie eine lückenhafte Bilanzreihe zu einem zu
  niedrigen Saldo — ohne Fehlermeldung, und die Zahl steht auf dem
  Lohnzettel. Dazu: ein verrechneter Eintrag ist gegen Bearbeiten und
  Löschen gesperrt.
- **Einsatzplanung: dass nichts still verschwindet.** Speichern ist ein
  „alles weg, dann alles neu" für Tag und Baustelle. Der Test hält fest, dass
  eine vorhandene Planung ins Formular kommt (sonst löschte eine Änderung am
  Kommentar die ganze Mannschaft) und dass ein leer geräumtes Formular nicht
  speichert, sondern sagt, wo das Löschen wirklich steht.
- **Baustellen: der Kundenname kommt aus dem Stammsatz**, und ein leeres
  Stundenbudget bleibt leer statt 0 — „kein Budget" und „Budget null" sind
  zwei verschiedene Aussagen, und die zweite meldete jede Baustelle sofort
  als überzogen.

**Zwei Tests haben beim Schreiben eine eigene Fehlannahme aufgedeckt.** Die
Einsatzplanung übernimmt eine bestehende Planung bereits ins Formular — der
Test war ursprünglich als „speichert mit leerer Auswahl alles weg" angelegt
und musste umgeschrieben werden, weil die Ansicht das schon verhindert. Und
die Bilanz-Rückfallprüfung ist gegen eine absichtlich verdrehte Bedingung
laufen gelassen worden: sie schlägt fehl, wie sie soll.

*Weiterhin gilt:* in all diesen Tests ist jeder Datenbankzugriff ersetzt. Ein
fehlender Index oder eine an den Regeln scheiternde Abfrage bleibt für sie
unsichtbar. Und die Unterschrift auf dem Telefon deckt weiterhin nur ein
echter Browser ab — das ist jetzt die größte verbliebene Lücke.

## Erledigt: die Daten liegen nachts nicht mehr nur an einer Stelle

Der Punkt stand seit Längerem oben auf der Liste und war der einzige, der
nicht nur die App betrifft, sondern den Betrieb: alles lag ausschliesslich in
Firestore. Fällt das Projekt aus, wird der Zugang gesperrt oder löscht jemand
versehentlich eine Sammlung, sind Rechnungen, Zeitkonten und Kundenstamm nicht
greifbar.

`datenAusleitung` schreibt jetzt jede Nacht um 02:30 den kompletten Bestand
jedes Mandanten weg — vor dem Bilanzlauf um 03:15, damit sie den Stand des
abgelaufenen Tages festhält und nicht einen, der gerade umgerechnet wird.

**Zeilenweises JSON, kein grosses Objekt.** Ein Stand je Mandant und Tag,
`ausleitung/{companyId}/{JJJJ-MM-TT}.jsonl`, eine Zeile je Dokument mit ihrer
Sammlung. So lässt er sich schreiben und wieder einlesen, ohne ihn je
vollständig im Speicher zu halten — bei 15.660 Zeiteinträgen der Unterschied
zwischen „läuft" und „bricht ohne Meldung ab". Aus demselben Grund wartet der
Schreibvorgang auf `drain`, statt blind weiterzuschreiben.

**Ein Stand je Tag, nicht je Lauf.** Läuft die Ausleitung zweimal an einem
Tag, überschreibt der zweite Lauf den ersten. Sonst wüchse der Speicher mit
jedem Wiederholungsversuch, und beim Wiederanlauf müsste jemand raten, welche
von zwei Dateien die vollständige ist.

**Der jüngste Stand wird nie gelöscht.** Aufbewahrt werden dreissig Tage —
aber wenn die Ausleitung wochenlang scheitert, wären irgendwann alle Stände
älter als die Frist, und ein Aufräumen nach reinem Alter löschte den letzten
vorhandenen. Ausgerechnet dann, wenn ohnehin niemand hinsieht. Ebenso wird
nie etwas angefasst, das nicht wie ein Stand heisst.

**Und ein Knopf dafür.** Unter Einstellungen → Datensicherung, nur für
Geschäftsführung und Administration: derselbe Lauf sofort, mit der Angabe wie
viele Datensätze geschrieben wurden und wohin. Eine Sicherung, die niemand je
ausgelöst hat, ist keine — und ob die Berechtigungen stimmen, sagt einem sonst
erst das Protokoll um halb drei nachts. Daneben steht der Download des
Bestands für eine Auskunft nach Art. 15 DSGVO; die Function dafür gab es
schon, aufgerufen hat sie nur nie jemand.

**Wie ehrlich das ist.** Ohne die Repository-Variable `AUSLEITUNG_BUCKET`
landet der Stand im Standard-Bucket DESSELBEN Google-Projekts. Gegen einen
Fehlgriff hilft das sofort; gegen „der Zugang zum Projekt ist weg" nicht.
Diese eine Zeile Konfiguration ist der Rest des Weges, und sie braucht eine
Entscheidung darüber, wohin. Der Functions-Deploy warnt, solange sie fehlt,
und prüft vorab, ob der Speicherort überhaupt erreichbar ist — nach demselben
Muster wie beim Cloud Scheduler, und aus demselben Grund: ein Fehlschlag, der
nur im Protokoll steht, ist keiner, den jemand bemerkt.

*Geprüft:* elf Tests auf die Entscheidungen (Pfade, Aufbewahrung, Zeilenform)
und vier auf die Ansicht. Der Lauf selbst ist es nicht — Cloud Functions
laufen hier weiterhin ungetestet, das bleibt die offene Stelle.

## Erledigt: sechs Stellen, an denen die Regel weiter offen stand als die Absicht

Ausgangspunkt war keine Fehlermeldung aus dem Betrieb, sondern ein Durchgang
durch `firestore.rules`, die Workflows und die vier Ansichten ohne Test. Das
Muster war jedes Mal dasselbe: ein Kommentar beschrieb eine enge Grenze, und
die Regel darunter war weiter. Genau der Fall, der bei `users` schon einmal
aufgefallen war — dort stand „nur GF/Admin" über einer Regel, die
`isLeadership()` zuliess.

**1. Deaktivieren war eine Anzeigeeinstellung.** `active` wurde ausschliesslich
in `AuthContext.loadProfile` geprüft. Die Regeln kannten das Feld an keiner
Stelle, und `syncUserClaims` setzte die Claims unabhängig davon. Wer ausschied
und auf „inaktiv" gestellt wurde, behielt ein gültiges Firebase-Konto mit
gültigen Claims: mit seinem Passwort und dem Firestore-SDK kam er unverändert
an alle Kunden, Baustellen, Scheine und seine Zeiteinträge. Die App liess ihn
nur nicht mehr hinein.

Jetzt drei Riegel, weil jeder für sich eine Lücke lässt: das Auth-Konto wird
gesperrt (wirkt erst beim nächsten Anmelden), die Token werden widerrufen
(sonst liefe ein ausgestelltes bis zu einer Stunde weiter), und `active` steht
als Claim in `signedIn()` — also unter jeder Regel der Datei, damit eine neue
Sammlung die Sperre nicht vergessen kann. Fehlt der Claim, gilt aktiv: sonst
sperrte der Deploy jeden aus, bis er sich neu angemeldet hat.

**2. Die Einsatzplanung stand jedem offen.** Begründet mit
`pickedUpMaterials` — einem Feld, das in der App an keiner Stelle vorkommt,
weder lesend noch schreibend. Die Regel gab dafür jedes Feld frei: ein Monteur
konnte sich selbst auf eine andere Baustelle setzen oder den Einsatz eines
Kollegen verschieben. Ändern ist jetzt Leitungssache; das tote Feld und
`Assignment.materials` sind aus dem Typ heraus.

**3. Der Materialstamm ebenso.** Der Kommentar nahm den Lagerstand aus, die
Regel gab das ganze Dokument frei — auch Bezeichnung und Artikelnummer.
Gebucht wird ohnehin nur unter Material → Lager, und dorthin kommt nur
Verwaltung oder Leitung.

> **NACHTRAG 02.09.2026: der letzte Satz war falsch, und die Regel dazu war
> zu eng.** Der Monteur bewegt den Bestand an zwei Stellen seines Alltags,
> beide aus der App und unter seiner eigenen Anmeldung: „Abgeholt" bei einer
> abholbereiten Anforderung zieht ab, eine Retoure in Originalverpackung
> schreibt gut. Mit der Regel oben scheiterte diese Transaktion — und weil sie
> Anforderung und Bestand zusammen schreibt, blieb auch die Anforderung offen.
> Der Knopf tat nichts, ohne Meldung. Seit dem Materialablauf-Durchgang läuft
> die Grenze zwischen den FELDERN statt zwischen den Rollen: `stock` bewegt
> jeder im Betrieb, alles andere bleibt bei Verwaltung und Leitung
> (`hasOnly(['stock'])`, nicht `hasAny`). Aufgefallen ist es erst, als der
> Materialablauf Ansichtstests bekam — der Regeltest von damals hat den
> Irrtum mitgeschrieben, weil er dieselbe falsche Annahme prüfte.

**4. Rechnungen waren frei löschbar**, auch offene und bezahlte. Die
Oberfläche bietet „Löschen" ausschliesslich beim Storno an, ein
unterschriebener Handwerksschein lässt sich gar nicht löschen, und der Zähler
auch nicht. Ausgerechnet beim Beleg fürs Finanzamt war die Grenze die
weichste. *Offen bleibt die Produktfrage,* ob ein Storno überhaupt löschbar
sein soll — buchhalterisch spricht einiges dagegen. Das entscheidet der
Auftraggeber, nicht die Regel.

**5. Der Angebotszähler durfte sinken.** Für Angebote stand dort nur
`lastSeq > 0` — also jeder Wert, auch ein kleinerer, auch mitten im Jahr.
„Nummernkreise nur steigend" galt damit für Angebote gar nicht, und zwei
Kunden konnten dieselbe Nummer bekommen. Der Neubeginn hängt jetzt am
Jahreswechsel und ist auf genau 1 festgelegt; der Rechnungskreis läuft
unverändert monoton weiter.

**6. Der Datenexport führte neun von sechzehn Sammlungen.** Es fehlten Kunden,
Angebote, Handwerksscheine, Urlaubsanträge, die verdichteten Zeitkonten — und
die **Nummernkreise**. Ein Wiederanlauf aus so einem Export hätte den
Rechnungszähler bei null begonnen: genau der Schaden, vor dem die Regeln das
Löschen der Zähler bewahren. Das Fehlen war an nichts zu merken, die Function
lief durch und gab eine wohlgeformte Datei zurück.

Die Liste ist jetzt vollständig, wird seitenweise gelesen (ein `.get()` über
drei Jahre Zeiteinträge hält alles gleichzeitig im Speicher) und bricht mit
einer verständlichen Meldung ab, statt an der 10-MB-Grenze eines Callable
stumm zu scheitern. Push-Tokens bleiben bewusst draussen. Ein statischer
Abgleich gegen `firestore.rules` meldet künftig jede vergessene Sammlung.

### Was daneben noch herauskam

**Der Functions-Deploy hörte nur auf `functions/**`.** `shared/` wird beim
Bauen dorthin kopiert, liegt aber daneben — eine Änderung an den gemeinsamen
Rechenregeln ging damit ins Hosting (`deploy.yml` hat keinen Pfadfilter) und
**nicht** in die Functions. Browser und Server hätten denselben Stundensaldo
verschieden gerechnet, bis irgendwann jemand aus anderem Grund `functions/`
anfasst. Genau die Doppelung, gegen die `shared/` gebaut wurde, eine Ebene
tiefer im Deploy — und dort fällt sie niemandem auf. Bisher ist es
Glück gewesen: jeder `shared/`-Commit hat zufällig auch `functions/` berührt.

**Der nächtliche Bilanzlauf fragte `where('active', '!=', false)`.** Firestore
liefert bei `!=` ausschliesslich Dokumente, die das Feld überhaupt haben.
Übernommene Altbestände ohne `active` fielen still heraus und bekamen nie eine
Bilanz — ihr Saldo im Zeitkonto stünde dauerhaft daneben.

## Erledigt: ein Deploy zerlegt die laufende App nicht mehr

Nachtrag zur Startgeschwindigkeit weiter unten, und eine Folge davon.

Der Service Worker warf die alten Bausteine weg, **sobald** er einen Deploy
bemerkte. Der Gedanke war richtig — sonst wächst der Speicher mit jedem
Deploy —, der Zeitpunkt war es nicht: die Hülle wird bewusst zuerst aus dem
Speicher ausgeliefert, im Browser läuft also noch die alte `index.html`. Sie
fordert ihre Bausteine unter den alten Namen an; die lagen nach dem Löschen
weder im Speicher noch auf dem Server, denn Hosting kennt nach einem Deploy
nur die neuen Namen.

Seit dem Code-Splitting lädt jede der 26 Ansichten erst beim Öffnen nach. Wer
auf „Später" getippt hat und danach den Schein aufmacht, bekam statt der
Ansicht eine Fehlermeldung — ausgelöst von der Vorkehrung, die den Deploy
sicherer machen sollte.

Und die Fehlergrenze konnte nicht helfen. Ihr erster Knopf heisst „Erneut
versuchen" und setzt den Zustand zurück; React merkt sich aber das abgelehnte
Versprechen eines `lazy`-Imports und scheitert sofort wieder, ohne das Netz
zu fragen. Der Knopf **kann** nicht wirken.

Jetzt räumt der Worker erst beim Übernehmen auf, „Jetzt laden" wartet
höchstens zwei Sekunden auf seine Bestätigung und lädt sonst trotzdem neu, und
die Fehlergrenze erkennt einen Nachladefehler und lädt einmal von selbst neu —
gesperrt für zehn Sekunden gegen die Schleife.

*Weiterhin offen:* gemessen ist das nicht. Ein echter Deploy auf einem echten
iPhone steht aus, wie die Startgeschwindigkeit selbst.

## Erledigt: verschluckte Ladefehler sichtbar machen

`catch(() => undefined)` steht seit Längerem als Falle in der Übergabe — und
lebte in genau den vier Ansichten weiter, die keinen Test haben. Am
deutlichsten in der Zeiterfassung: schlug das Laden des eigenen
Stammdatenblatts fehl, blieb `profile` null, der Saldo rechnete nicht, und die
Kachel zeigte „Kein Startdatum konfiguriert" — ein Einrichtungsfehler, den
niemand beheben kann, angezeigt für ein Netzproblem.

Am folgenreichsten in Material und Lager: dort war der Fehlerweg der **Abos**
`() => undefined`. Scheiterte die Abfrage an den Regeln, blieb die Liste
dauerhaft leer — derselbe verschluckte Fehler, der beim Handwerksschein schon
einmal als „leeres Auswahlfeld" gemeldet wurde.

Neu ist `TeilFehler`: ein Hinweis **neben** dem Inhalt, nicht an seiner
Stelle. `ErrorState` wäre hier falsch — fällt die Kundenliste aus, ist die
Rechnungsliste deswegen nicht weg.

## Erledigt: „auf dem iPhone lädt es manchmal gar nicht"

Am Schreibtisch lud die App normal, mit kurzer Verzögerung. Als
Startbildschirm-App auf dem iPhone dauerte es teilweise sehr lange — oder sie
lud überhaupt nicht. Drei Ursachen, die zusammenwirkten.

### 1. Ein einziges Paket von 1,05 MB, und nichts hielt es vor

Alle 26 Ansichten in einer Datei, **kein einziges `React.lazy`**. Der Monteur
lud die Rechnungsansicht, die Nachkalkulation und die Benutzerverwaltung mit,
bevor er seine Zeit buchen konnte.

Am Schreibtisch fällt das nicht auf. Auf dem Telefon sind es zwei getrennte
Kosten: die Übertragung über Mobilfunk **und** das Auswerten von einem
Megabyte JavaScript, was auf einem älteren Gerät für sich genommen ein bis
zwei Sekunden dauert.

Und der Punkt, der die Startbildschirm-App vom Safari-Tab unterscheidet: **es
gab keinen Service Worker, der die App-Hülle vorhielt.** Der einzige kümmerte
sich um Push, hielt nichts vor und wurde überhaupt nur registriert, wenn
jemand Meldungen eingeschaltet hatte. iOS gibt einer solchen App einen eigenen
Speicherbereich und räumt den beherzt auf — also war praktisch jeder Start ein
Kaltstart.

Bitter dabei: der Firestore-Zwischenspeicher, der eigens für den Keller
eingebaut wurde, hält **Daten** vor. Wenn die App selbst nicht lädt, ist das
gleichgültig.

**Jetzt:** jede Ansicht ein eigenes Paket, Fremdpakete getrennt, und ein
Service Worker, der die Hülle vorhält.

| | vorher | jetzt |
|---|---|---|
| Eigener Code beim Start | 1.052 kB (274 kB gepackt) | **40 kB (13 kB)** |
| React | *darin enthalten* | 165 kB (54 kB), ändert sich nie |
| Firebase-SDK | *darin enthalten* | 617 kB (141 kB), ändert sich nie |

Der Erststart wird dadurch um rund ein Fünftel kleiner — die Firebase-SDK
braucht man nun einmal beim Anmelden. Der eigentliche Gewinn liegt woanders:
**nach einem Deploy lädt das Telefon 13 kB neu statt 274 kB**, weil die
Dateinamen einen Fingerabdruck tragen und sich nur unser Teil ändert. Und ab
dem zweiten Start lädt es überhaupt nichts mehr, sondern nimmt die Hülle aus
dem Speicher.

### 2. Der Start hing an zwei Abfragen nacheinander — ohne jede Frist

```
onAuthStateChanged → await getDoc(users/{uid}) → await getCompany(…) → erst jetzt rendert etwas
```

Zwei volle Netzrunden, bevor ein Pixel erschien. Und entscheidend:
**Firestore-Abfragen haben keine Zeitgrenze.** Sie werfen keinen Fehler und
brechen nicht ab — sie warten. Kam keine Antwort, stand die App unbegrenzt auf
„Anmeldung wird geprüft …".

Das ist dieselbe Bauweise, die beim Handwerksschein das „lädt ewig"
verursacht hat. Dort steht seither eine Frist; hier stand keine, und zwar am
Anfang **jeder** Sitzung.

**Jetzt:** die Frist liegt in `lib/frist.ts`, damit sie nicht ein drittes Mal
neu erfunden wird. Nach acht Sekunden gilt der Zwischenspeicher statt weiter
zu warten. Beide Abfragen laufen außerdem gleichzeitig — die zuletzt bekannte
Firma steht lokal, also muss nicht erst das Profil zurückkommen, um zu wissen,
welches Firmendokument zu holen ist.

*Der Preis, ehrlich:* die App kann mit einem veralteten Profil hochkommen. Ein
abgeschaltetes Modul oder eine geänderte Rolle wirkt dann eine Sitzung später.
Keine Sicherheitslücke — die Regeln entscheiden serverseitig, und ein
deaktiviertes Konto kommt an keine Daten.

> **Nachtrag.** Der letzte Halbsatz stimmte zum Zeitpunkt des Schreibens
> nicht: `active` wurde ausschließlich im Browser geprüft, die Regeln kannten
> das Feld gar nicht. Ein deaktiviertes Konto kam sehr wohl an alle Daten
> seiner Firma, sobald jemand am UI vorbeiging. Seit „Die Sicherheitsgrenze
> holt nach, was die Kommentare schon behaupteten" gilt der Satz — durch drei
> Riegel: gesperrtes Auth-Konto, widerrufene Token und `active` als Claim in
> `signedIn()`.

### 3. Warum die Verbindung ausgerechnet dort tot war

iOS friert eine Startbildschirm-App beim Wegschalten ein und behält die Seite
im Speicher. Kommt der Benutzer zurück, ist der JavaScript-Zustand noch da —
die Netzverbindungen sind es nicht. Firestore merkt das nicht sofort, und eine
Abfrage, die in diesem Moment abgeht, sitzt auf einem toten Kanal (siehe
Punkt 2). Ein Browser-Tab am Schreibtisch wird stattdessen neu geladen,
deshalb sieht man es dort nie.

**Jetzt:** nach mehr als 30 Sekunden im Hintergrund wird das Netz einmal aus-
und wieder eingeschaltet. Damit wirft der Client den toten Kanal weg und baut
sofort einen neuen auf, statt auf sein eigenes Zeitfenster zu warten.

Dazu kam `persistentMultipleTabManager`. Er handelt über IndexedDB aus,
welches Fenster den Zwischenspeicher führt, und der Führende hält dafür eine
Reservierung. Wird ein Fenster ordentlich geschlossen, gibt es sie zurück —
iOS beendet eine App im Hintergrund aber **ohne Aufräumen**. Beim nächsten
Start lag die Reservierung des vorigen Laufs noch da. In einer
Startbildschirm-App gibt es ohnehin nur ein Fenster, also läuft dort jetzt die
Einfenster-Variante.

### Was man sich mit dem Service Worker einkauft

Ein Service Worker ist zäh: liefert er einmal eine alte Fassung aus, sähe der
Benutzer sie auch nach einem Deploy weiter. Drei Vorkehrungen:

1. **`index.html` wird bei jedem Aufruf zusätzlich im Hintergrund geholt und
   mit dem gespeicherten Stand verglichen.** Sie ist die einzige Datei, deren
   Name gleich bleibt; ändert sich ihr Inhalt, gab es einen Deploy. Dann
   fliegen die alten Bausteine weg und die App bietet „Jetzt laden" an — sie
   lädt **nicht** von selbst neu, weil der Monteur mitten in einem Formular
   stehen kann.
2. **Fremdes bleibt unangetastet.** Firestore, Auth und die Cloud Functions
   gehen durch, ohne angefasst zu werden.
3. **Der Worker wird geprüft, nicht gehofft.** `tests/unit/serviceWorker.test.ts`
   lädt die echte `public/sw.js` in eine Sandbox und fährt sie durch: dass
   Firestore in Ruhe gelassen wird, dass eine unvollständige Antwort nicht
   vorgehalten wird, dass ein Deploy erkannt wird, und dass der Worker auch
   dann läuft, wenn die Firebase-Bibliotheken nicht geladen werden konnten.

**Ein Fehler im ersten Entwurf, festgehalten weil er naheliegt:** Die
Fassungsnummer sollte in der Adresse des Workers stehen (`/sw.js?v=…`). Das
funktioniert nicht — die Nummer käme aus dem gerade laufenden JavaScript, also
aus der **alten** Fassung. Der Worker meldete sich unter seiner alten Adresse
an und erneuerte sich nie. Ob es etwas Neues gibt, weiß nur der Server.

**Geprüft:** 427 Rechnungstests, davon 17 neu — 7 für die Frist, 10 für den
Service Worker gegen den echten Quelltext.

## Erledigt: achtzehn Reiter für vierzehn Themen

Die Geschäftsführung sah achtzehn Reiter. Nicht weil es achtzehn Themen gäbe,
sondern weil jede neue Ansicht automatisch einen eigenen Reiter bekam — auch
dann, wenn sie zu einem bereits vorhandenen Thema gehörte. „Anforderungen" und
„Lager" sind kein eigenes Thema; sie sind zwei Blicke auf Material.

### Zwei Reiter fassen jetzt sechs Ansichten

| Reiter | darunter |
|---|---|
| **Material** | Anfordern · Anforderungen · Lager |
| **Einstellungen** | Meldungen · Sätze und Zuschläge · Module |

Vierzehn statt achtzehn für die Leitung, acht statt neun beim Monteur.

Die Unterseiten sind **eigene Routen**, keine Reiter auf einer Riesenseite:
sie laden erst beim Öffnen, sie sind verlinkbar, und der Zurück-Knopf tut das
Erwartete. Wer nur anfordert, sieht auch nur das — und wo nur eine Unterseite
übrigbleibt, fällt die Leiste weg. Ein Reiter mit genau einer Wahl ist keine
Navigation, sondern Zierrat.

Die Einstellungen stehen jetzt **jeder** Rolle offen, weil die
Meldungseinstellungen jedem gehören; was enger ist, steht als Rollenliste an
der Unterseite. Der Monteur hatte vorher „Benachrichtigungen" als einzigen
einstellungsartigen Reiter — jetzt heißt der Reiter, wonach er aussieht.

**Die alten Adressen leiten weiter.** Das ist nicht Kosmetik: in bereits
zugestellten Push-Meldungen stehen `/admin-orders` und `/order`, und die
liegen auf den Telefonen. Wer eine davon antippt, wäre sonst wortlos auf der
Startseite gelandet und hätte dann die Anforderung gesucht, die ihn hergerufen
hatte.

### Was dabei herauskam: fünf Reiter, die „Kein Zugriff" sagten

Beim Zusammenfassen fiel auf, dass **wer wohin darf, dreimal geschrieben
stand**: als `roles` in `navigation.ts`, als `RequireRole` an der Route, und
noch einmal als Knopf-Freigabe in `permissions.ts`. Drei Listen, die dasselbe
behaupten, laufen auseinander — sie waren es an sieben Stellen.

Für die Projektleitung hieß das: Baustellen, Einsatzplanung, Anforderungen,
Benutzerverwaltung und Einstellungen standen in ihrer Seitenleiste, und jeder
Klick endete in „Kein Zugriff". Sie hatte nichts falsch gemacht, sah aber
danach aus.

**Die Doppelung ist weg statt abgeglichen.** `RequireNav` liest Rolle und
Modul aus demselben Eintrag, aus dem auch der Reiter gebaut wird; ein Reiter
ins Leere müsste jetzt erst erfunden werden. Wo die Listen sich
widersprachen, war eine Entscheidung fällig:

- **Planen, Baustellen führen, Material** — darf die Projektleitung. Das ist
  ihre Arbeit, und die Firestore-Regeln erlaubten es ihr längst; nur die Route
  sperrte sie aus.
- **Rechnungen, Benutzerverwaltung, Sätze** — darf sie nicht. Wer Rollen
  vergibt, vergibt sie auch an sich: mit der Benutzerverwaltung hätte sie sich
  zur Geschäftsführung machen können. Und im Firmendokument steht der
  Stundensatz.

Die zweite Grenze **fehlte serverseitig**. `users` und `companies` ließen
`isLeadership()` zu, worin die Projektleitung steckt — beim Firmendokument mit
einer Ausnahmeliste für zwei Felder. Genau die war der Beleg, dass die Grenze
eine Stufe zu tief lag: sobald man einzelne Felder herausnehmen muss, gehört
das ganze Dokument nicht in diese Hand. Beide stehen jetzt auf `isTopLevel()`.

Ebenfalls aufgefallen: `canAccess()` war **tote Funktion**. Die Navigation
benutzte sie nicht, und der Wächter hatte die Bedingung nachgebaut. Ein Test,
der eine Funktion prüft, die niemand aufruft, prüft nichts — der Wächter ruft
sie jetzt.

### Stehender Text wieder hinter das „i"

In den neueren Ansichten war der Beipacktext zurückgekehrt: Erklärungen, die
beim ersten Mal helfen und ab dem zweiten Mal Platz kosten. Zurück hinter das
„i" gewandert sind die Erklärung der Arbeitstage im Urlaubsantrag, die Folgen
einer Genehmigung, die Herkunft des Stundenbudgets im Angebot, die Übernahme
der Altbestände in der Kundenakte und die Auswahl in der Nachkalkulation.

**Nicht** verschoben wurde, was im Moment der Entscheidung sichtbar sein muss:
die Warnung vor doppelten Kundendatensätzen vor dem Schreiben, und der Hinweis
beim Stornieren, dass der Schein erhalten bleibt. Eine Folge hinter einem
Aufklapper ist keine Warnung.

**Geprüft:** 34 statische Tests (Navigation ↔ Routen ↔ Freigaben, Umleitungen,
Unterseiten je Rolle), 5 Ansichtstests für den Unterreiter, 6 neue Regeltests
gegen den Emulator.

## Erledigt: Module — der Betrieb entscheidet, was er benutzt

**Der Anlass war Unübersichtlichkeit, nicht Sicherheit.** Die App war auf 26
Ansichten gewachsen; die Geschäftsführung sah siebzehn Reiter, von denen sie
mehrere nie anfasst. Der Wunsch war ein Panel, in dem sich einzelne Bereiche
ein- und ausschalten lassen.

### Was ein Modul ist — und was es ausdrücklich nicht ist

Ein Modul ist eine **Umfangsentscheidung des Betriebs**, keine
Rechteverwaltung. Wer die Rolle hat, dürfte die Daten ohnehin lesen; ein
abgeschaltetes Modul nimmt nur den Weg dorthin weg. Das steht so im Code
(`src/lib/module.ts`), im Panel selbst und in `docs/FUNKTIONEN.md`, weil die
Verwechslung sonst zwangsläufig kommt: „Rechnungen sind aus, also sieht der
Monteur sie nicht" ist **falsch begründet** — er sieht sie nicht, weil die
Regeln es verbieten. Wäre das Modul die Grenze, würde ein Wiedereinschalten
sie öffnen.

Neun Module: Einsatzplanung, Material, Urlaub, Scheine, Angebote, Rechnungen,
Nachkalkulation, Zeitkonten, KI-Erfassung.

**Nicht dabei — und das ist die wichtigere Entscheidung:** Zeiterfassung,
Kunden, Baustellen, Benutzerverwaltung und Einstellungen. Ein Schalter, mit
dem man die Anlage unbenutzbar macht, ist kein Freiheitsgrad, sondern eine
Falle — insbesondere der, mit dem man sich selbst aus den Einstellungen
aussperrt und ihn deshalb nie wieder umlegen kann.

### Drei Dinge, die man dabei falsch macht

1. **Nur die Navigation filtern.** Den Reiter auszublenden nimmt den Weg weg,
   nicht die Adresse: Lesezeichen, alte Links und der Zurück-Knopf führen
   weiter hinein. Deshalb prüft `canAccess()` das Modul mit, und jede
   Modulroute liegt hinter `RequireModul` — mit einer Seite, die erklärt,
   dass die Daten erhalten bleiben und die Leitung den Bereich unter
   *Module* wieder einschalten kann. Eine leere Seite oder ein Sprung auf die
   Startseite sähe wie ein Fehler aus.
2. **Abhängigkeiten übersehen.** Die Nachkalkulation braucht den Erlös, und
   der kommt aus den Rechnungen. Ohne sie meldete sie für jede Baustelle
   „keine Aussage" — eine Ansicht, die nur mitteilt, dass sie nichts
   mitteilen kann. Sie geht deshalb mit aus, und das Panel sagt es **vorher**
   (`zieheMit()`), nicht hinterher.
3. **Schalter anbieten, die nichts bewirken.** Die KI-Erfassung braucht
   hinterlegte Zugänge. Ohne sie steht sie im Panel sichtbar, aber gesperrt,
   mit dem Grund daneben — statt sich einschalten zu lassen und dann in eine
   Fehlermeldung zu führen.

### Wo die Grenze doch eine ist

Die **Liste** ist sehr wohl geschützt: `companies.modules` darf nur
Geschäftsführung und Administrator ändern, durchgesetzt in `firestore.rules`
(sieben Regeltests). Könnte die Projektleitung sie ändern, wäre die
Entscheidung der Leitung eine Empfehlung. Dasselbe gilt seit dieser Änderung
für `vacationApprovers`; beide Felder liegen jetzt hinter derselben Klausel,
und ein Test hält fest, dass sie sich **gemeinsam in einem Zug** speichern
lassen — sonst hinge das Speichern der Einstellungsseite an der Reihenfolge.

### Nebenbei repariert: die Leiste am unteren Rand

Sie nahm bisher die **ersten vier** Einträge der Rollenliste. Das war keine
Entscheidung, sondern ein Nebeneffekt der Reihenfolge: die Buchhaltung hatte
unten „Urlaub" stehen und die Rechnungen — worin sie den ganzen Tag arbeitet
— unter „Mehr". Jetzt ist je Rolle festgelegt, was untenhin gehört; für den
Monteur **Start, Zeit, Plan, Material**. Fällt ein Eintrag wegen eines
abgeschalteten Moduls weg, rückt der nächste nach, damit keine Lücke
entsteht.

Ebenfalls weggefallen: der Sonderweg für `VITE_ENABLE_VOICE`, der den
`/voice`-Eintrag per Sonderbehandlung in die Navigation schob. Er ist jetzt
ein gewöhnlicher Eintrag mit `modul: 'ki'`.

**Geprüft:** 14 Rechnungstests (Standardwerte, Abhängigkeitskaskade, kein
Schalter für den Kern, Navigation, geschlossene Adresse, Leiste je Rolle) und
7 Regeltests gegen den Emulator.

## Erledigt: Urlaub als Antrag mit Genehmigung

Urlaub war ein **Tagesstatus** in der Zeiterfassung. Jeder konnte ihn sich
selbst eintragen; genehmigt war er damit nicht, und niemand hatte den
Überblick, wer wann weg ist. Es fehlte genau das, worum es beim Urlaub geht:
ein Antrag, eine Entscheidung darüber, und für beide Seiten die Gewissheit,
woran man ist.

**Der Ablauf hat drei Beteiligte, und für alle drei muss er ehrlich sein:**

| Wer | Sieht | Darf |
|---|---|---|
| Mitarbeiter, Monteur | die eigenen Anträge mit Stand und Begründung | beantragen, offene Anträge ändern oder zurückziehen |
| Geschäftsführung, Administration, Buchhaltung | alle Anträge, plus wer im selben Zeitraum schon weg ist | genehmigen, begründet ablehnen, einen genehmigten Urlaub zurücknehmen |
| Projektleitung | den genehmigten Urlaub in der Einsatzplanung | einteilen — aber nicht entscheiden |

**Die Genehmigung schreibt die Tage ins Zeitkonto.** Das ist kein Beiwerk,
sondern der Punkt: ohne die Zeiteinträge wäre ein genehmigter Urlaub für die
Stundenrechnung unsichtbar. Der Saldo zöge für jeden Urlaubstag das Tagessoll
ab, und die Startseite meldete zwei Wochen lang „Zeit fehlt" — der Mitarbeiter
müsste seinen genehmigten Urlaub also ein zweites Mal von Hand eintragen. Die
Einträge tragen die `vacationId`, damit eine Rücknahme genau sie wieder
entfernt und keinen von Hand gebuchten Urlaubstag mit erwischt. Tage, an denen
schon gebucht war, werden übersprungen statt überschrieben: eine erfasste
Arbeitsleistung darf eine Genehmigung nicht stillschweigend wegwerfen.

**Gerechnet wird in Arbeitstagen, mit derselben Funktion wie die Pflichttage.**
`werktageImZeitraum` ist jetzt die gemeinsame Grundlage von zwei Rechnungen,
die dieselbe Frage stellen: welche Tage zählen. Liefen sie auseinander, bekäme
jemand für eine Woche mit Feiertag fünf Tage abgezogen und hätte trotzdem einen
Tag als „nicht gebucht" offen. Die Woche um den Nationalfeiertag kostet vier
Urlaubstage, nicht fünf.

**Die harte Grenze steht in `firestore.rules`, nicht in der Oberfläche.** Ein
Monteur, der seinen Antrag per Konsole auf „Genehmigt" setzt, verschafft sich
bezahlte Tage — deshalb: anlegen nur für sich selbst und nur als „Beantragt",
ändern nur solange offen und ohne den Status anzufassen, entscheiden nur
Buchhaltung, Geschäftsführung, Administration. Entschiedene Anträge werden
nicht gelöscht; sie sind der Nachweis, dass entschieden wurde.

**Sichtbar wird der Urlaub dort, wo er stört:** in der Einsatzplanung steht er
über der Mitarbeiterauswahl und als Hinweis an der einzelnen Person. Verboten
wird das Einteilen nicht — bei einem Notdienst holt man auch mal jemanden aus
dem Urlaub — aber es steht dann dabei.

**Bewusst noch nicht dabei:** halbe Urlaubstage, Resturlaub aus dem Vorjahr,
und eine Benachrichtigung an den Antragsteller, sobald entschieden wurde. Der
Anspruch aus den Stammdaten (`yearlyVacationDays`) wird angezeigt, aber nicht
erzwungen: ob jemand mehr nehmen darf, als ihm zusteht, ist eine Frage für den
Betrieb und nicht für eine Sperre.

### Nachgezogen: wer genehmigt, steht in den Einstellungen

Die Rolle allein war als Antwort zu grob. In dem einen Betrieb entscheidet die
Buchhaltung, im anderen ein Vorarbeiter, im dritten ausschließlich der Chef —
das ist eine betriebliche Festlegung und keine Eigenschaft der Software. Die
Geschäftsführung wählt die Personen jetzt unter **Einstellungen → „Wer Urlaub
genehmigt"**.

Zwei Regeln sind dabei nicht verhandelbar, und beide stehen aus demselben
Grund fest:

1. **Geschäftsführung und Administration können immer entscheiden.** Wären sie
   abwählbar, könnte eine Fehleingabe den ganzen Betrieb aussperren — und
   niemand könnte sie zurücknehmen, weil auch das Ändern der Liste ihnen
   vorbehalten ist. Die Projektleitung darf die Liste ausdrücklich *nicht*
   ändern: sonst trüge sie sich selbst ein und entschiede über die Urlaube
   derer, die sie einteilt.
2. **Ohne Festlegung bleibt es beim Ausgangszustand** (Buchhaltung plus
   Leitung). Sonst hätte das Einführen dieser Einstellung bestehenden Betrieben
   stillschweigend Rechte entzogen.

**Was diese Einstellung erzwungen hat, und warum das gut war:** die Genehmigung
lief bis dahin als Batch im Browser. Sie muss zwei Dinge tun — nachsehen, an
welchen Tagen der Antragsteller schon gebucht hat, und dann fremde
Zeiteinträge schreiben. Solange nur Buchhaltung und Leitung entschieden, fiel
das nicht auf: sie dürfen beides ohnehin. Eine Bürokraft darf es nicht, denn
Zeiteinträge tragen Kranken- und Urlaubstage und damit Gesundheitsdaten nach
Art. 9 DSGVO.

Der naheliegende Ausweg wäre gewesen, dieser Person das Lesen aller
Zeiteinträge zu erlauben. Eine Datenschutzgrenze aufzumachen, weil sonst eine
Funktion nicht läuft, ist die falsche Reihenfolge — dieselbe Überlegung wie
beim Handwerksschein. Stattdessen entscheidet jetzt die Cloud Function
`urlaubEntscheiden`; der Aufrufer schickt nur, WELCHER Antrag wie entschieden
wird, und bekommt nichts zu sehen, was er nicht ohnehin sehen darf.

Die Feiertags- und Arbeitstagsrechnung ist dafür nach `shared/feiertage.ts`
gewandert — Browser und Function verwenden buchstäblich dieselbe Datei. Zwei
Fassungen ergäben dieselbe Zahl, bis sie es eines Tages nicht mehr täten, und
bemerkt würde es an einem Urlaubskonto, das nicht aufgeht.

## Erledigt: der Schein am Telefon — Warten ohne Ende, Unterschrift ohne Wirkung

Direkt nach dem Ausrollen aus dem Betrieb gemeldet: der Schein ließ sich
anlegen, „lädt ewig", und das Unterschriftsfeld tat nichts. Zwei Fehler,
derselbe Bautyp wie oben — etwas hatte keine Grenze und keinen Ausweg.

**Das ewige Laden.** Die Vorausfüllung läuft über eine Cloud Function. Ein
Kaltstart in `europe-west3` dauert schon ohne Zutun einige Sekunden; im Keller
mit einem Balken LTE beliebig lange. Dahinter stand ein Kreisel **über dem
ganzen Formular** — auch über den Unterschriften, die mit der Vorausfüllung
nichts zu tun haben. Wer vor Ort wartete, wartete auf etwas, das er zum
Unterschreiben gar nicht braucht.

Behoben in drei Schritten, und der dritte ist der wichtige:

1. Die Vorausfüllung bekommt eine **Frist** von zwölf Sekunden. Danach steht
   da, was los ist, mit einem Knopf zum Erneut-Versuchen.
2. Die Abfrage nach schon vorhandenen Scheinen läuft **nebenher** statt im
   selben `Promise.all`. Sie ist ein Hinweis, kein Grund, das Formular
   aufzuhalten.
3. **Der Schein lässt sich auch ohne Vorausfüllung schreiben und
   unterschreiben.** Er ist ein Beleg über Arbeit, die geleistet wurde, und der
   Kunde steht daneben. Dass die Stunden nicht automatisch eintrudeln, ist
   ärgerlich — aber kein Grund, den Monteur nach Hause zu schicken. Dass der
   Schein dann ohne Stunden eingefroren wird, steht vorher dabei.

**Die Unterschrift.** Zwei Ursachen:

- `canvas.width` zu setzen **löscht** die Zeichenfläche — auch beim Schreiben
  desselben Werts. Die Anpassung hing an `window.resize`, und dieses Ereignis
  feuert auf iOS reihenweise, ohne dass sich am Feld etwas ändert: Adressleiste
  ein- und ausblenden, Tastatur für das Namensfeld darüber, Drehen. Die
  Unterschrift verschwand mitten im Zeichnen, während die App weiter behauptete,
  es sei unterschrieben. Jetzt hängt die Anpassung am `ResizeObserver` des
  Elements, greift nur bei einer **echten** Größenänderung und malt das
  Gezeichnete danach zurück.
- Ein kurzer Tipp zeichnete nichts — das Feld sah aus, als reagiere es nicht —
  und meldete trotzdem ein Bild nach oben, nämlich ein leeres. Der Schein galt
  damit als unterschrieben, obwohl nichts drinstand. Jetzt setzt schon der
  Tipp einen sichtbaren Punkt, und gemeldet wird nur, wenn tatsächlich etwas
  auf der Fläche steht.

## Erledigt: die Lücke zwischen zwei fertigen Funktionen

Aus dem Betrieb gemeldet, mit Bildschirmfotos: im Handwerksschein war das
Auswahlfeld für die Baustelle leer, und in der Kundenakte stand „noch keine
Baustelle zugeordnet", obwohl eine existierte. Beide Funktionen waren
abgenommen, beide funktionierten für sich — und trotzdem kam der Benutzer
nicht durch.

**Die gemeinsame Ursache ist ein Muster, kein Einzelfall.** An beiden Stellen
stand um die Abfrage ein `catch(() => undefined)`. Damit sahen vier
verschiedene Lagen identisch aus:

| Lage | Was der Benutzer sah | Was er hätte sehen müssen |
|---|---|---|
| lädt noch | leeres Feld | „lädt …" |
| Abfrage schlug fehl | leeres Feld | die Fehlermeldung und ein zweiter Versuch |
| keine *laufende* Baustelle | leeres Feld | der Gesamtbestand, mit Hinweis |
| gar keine Baustelle | leeres Feld | „noch keine angelegt", plus der Weg dorthin |

Ein leeres Auswahlfeld ist keine Antwort. Es ist die Abwesenheit einer
Antwort, und der Benutzer kann daraus nichts ableiten — auch nicht, ob er
selbst etwas falsch gemacht hat.

**Behoben, nicht umgangen:**

- `components/BaustellenSelect.tsx` — eine Auswahl für alle Stellen, die eine
  Baustelle brauchen. Unterscheidet die vier Lagen oben. Ohne laufende
  Baustelle weicht sie auf den Gesamtbestand aus (ein Schein wird auch für
  eine gerade abgeschlossene Baustelle nachgereicht) und sagt, dass sie das
  tut.
- Eine per Link vorgegebene Baustelle wird gezielt nachgeladen, wenn sie nicht
  in der Liste steht. Das war ein stiller Zweitfehler: der Schein hatte dann
  zwar die Nummer, aber keinen Datensatz — und sein Abschluss-Knopf sah
  anklickbar aus und tat beim Drücken nichts. Der Knopf hängt jetzt am
  Datensatz, nicht an der Nummer, und nennt den Grund, wenn er gesperrt ist.
- `db/customers.ts: listUnlinkedProjectsByName` — findet Baustellen, die den
  Namen des Kunden tragen, aber auf keinen Kundendatensatz zeigen. Genau der
  gemeldete Fall: ein von Hand angelegter Kunde, dessen Baustelle älter ist
  als die Kundenstammdaten. Die Akte zeigt sie als Vorschlag mit einem Knopf
  „Zuordnen" — sie nur anzuzeigen wäre wieder halb gewesen.
  Der Namensabgleich ist exakt; das steht auch so in der Oberfläche, mit dem
  Verweis auf die Übernahme, die nach vereinheitlichtem Schlüssel gruppiert.

**Und der Grund, warum die Lücke überhaupt entstand:** der Schein war ein
eigener Bereich ohne Anschluss. Seine erste Frage — „welche Baustelle?" —
richtete sich an einen Monteur, der gerade von genau dieser Baustelle kommt.
Jetzt stehen seine Einsätze des Tages oben als Knöpfe, bei einem einzigen wird
vorausgewählt (bei zweien bewusst nicht: eine falsche Vorauswahl ist schlimmer
als keine), und der Schein ist von dort erreichbar, wo er entsteht — aus dem
Einsatzplan, von der Startseite und aus der Baustellenliste. Adresse und
Telefonnummer der Baustelle stehen dabei, weil unterschrieben werden soll und
dafür jemand vor Ort sein muss.

**Die Lehre für alles Weitere:** eine Funktion ist nicht fertig, wenn sie für
sich läuft, sondern wenn sie an dem Punkt erreichbar ist, an dem die Arbeit
sie braucht — und wenn sie sagt, was los ist, statt leer zu bleiben.
`catch(() => undefined)` um eine Abfrage, deren Ergebnis die Ansicht trägt,
ist ab hier ein Fehler und keine Vorsichtsmaßnahme.

## Erledigt: Kundenstammdaten

Der Kunde war ein Textfeld an der Baustelle und wurde bei jedem Auftrag neu
getippt. Jetzt eine eigene Sammlung `customers` mit Verknüpfung über
`project.customerId`.

**Die Abgrenzung ist der Kern des Modells und keine Dopplung:** Beim Kunden
steht die RECHNUNGSadresse und der Haupt-Ansprechpartner, an der Baustelle die
BAUSTELLENadresse und der Ansprechpartner VOR ORT. Eine Hausverwaltung hat
zwanzig Baustellen, und der Monteur fährt nicht zur Rechnungsadresse. Die
Feldbeschriftungen sagen das jetzt auch.

- **Doppelgänger werden abgefangen.** „Hausverwaltung Nord" und
  „hausverwaltung NORD " sind derselbe Kunde; das Anlegen weist darauf hin,
  statt einen zweiten, halb gefüllten Datensatz zu erzeugen.
- **Umbenennen zieht die Baustellen nach**, in EINEM Batch. Die Baustellen
  tragen den Kundennamen als Kopie, damit ihre Listen nicht zusätzlich die
  Kundensammlung laden müssen — ohne das Nachziehen liefen Anzeige und
  Stammdaten nach der ersten Umbenennung auseinander.
- **Löschen nur ohne Baustellen** — sonst blieben Baustellen zurück, die auf
  einen Datensatz zeigen, den es nicht mehr gibt. Dieselbe Überlegung wie bei
  den Benutzern.
- **Übernahme der Altbestände mit Vorschau**, nicht als stiller
  Hintergrundlauf: die Geschäftsführung sieht, wie viele Kunden aus wie vielen
  Baustellen entstehen, bevor etwas geschrieben wird. Genau dort fällt auf,
  dass „Huber" und „Fam. Huber" derselbe Kunde sind.
- Adresse und Telefonnummer sind auch hier Handgriffe, keine Textfelder.

Geprüft: fünf Komponententests plus der vollständige Durchlauf im Browser
gegen die Emulatoren — Vorschau, Übernahme, Kundenauswahl im
Baustellenformular, Historie.

## Erledigt: Nachkalkulation

Die Budget-Ampel vergleicht Stunden gegen Stundenbudget: sie sagt, ob mehr
gearbeitet wurde als geplant. Sie sagt nicht, ob etwas übrig geblieben ist.
Eine Baustelle kann im Stundenbudget bleiben und trotzdem Verlust machen, wenn
der Preis zu niedrig kalkuliert war.

**Die entscheidende Unterscheidung:** `rates.fach` ist der
VERRECHNUNGSSATZ — der Erlös. Was die Stunde den Betrieb KOSTET (Lohn,
Lohnnebenkosten, anteilige Gemeinkosten) ist eine andere Zahl und liegt
darunter. Deshalb gibt es jetzt getrennte `costRates` in den Einstellungen.
Wer beide verwechselt, bekommt eine Marge von null und hält sie für ein
Ergebnis. Die Einstellungen zeigen den Deckungsbeitrag je Stunde direkt an und
warnen, wenn der Verrechnungssatz nicht über den Kosten liegt.

**Der Erlös kommt bevorzugt aus den Rechnungen** — was tatsächlich verrechnet
wurde, ist die belastbare Zahl. Erst wenn noch nicht abgerechnet ist, tritt
das angenommene Angebot an seine Stelle, und die Ansicht schreibt dazu „noch
nicht verrechnet". Stornierte Rechnungen zählen nicht.

**Ohne bekannten Erlös steht „keine Aussage", nicht null Prozent.** Eine Null
läse sich wie „nichts verdient" und wäre eine Behauptung über eine Baustelle,
über die nichts bekannt ist.

**Die Grenze steht unter den Zahlen, nicht im Kleingedruckten:** Es ist ein
DECKUNGSBEITRAG, kein Gewinn. Materialkosten fehlen, weil die
Materialanforderung in dieser App bewusst keinen Preis trägt. Eine Baustelle
mit dünnem Deckungsbeitrag ist im Ergebnis vermutlich negativ — deshalb steht
die Ampel schon unter zwanzig Prozent auf Gelb, obwohl die Zahl formal positiv
ist.

Nur für die Geschäftsführung: hier stehen Margen, und die Projektleitung sieht
sie nicht.

Geprüft: neun Tests plus der Durchlauf im Browser — der Zustand ohne
Kostensätze, das Setzen (Deckungsbeitrag 23,00 € je Stunde bei 65 gegen 42),
und alle drei Erlösquellen nebeneinander.

## Erledigt: Angebot und Vorkalkulation

Der fehlende Schritt vor der Baustelle. Bisher begann alles beim Auftrag, und
die kalkulierten Stunden landeten von Hand abgetippt im Baustellenformular —
die Budget-Ampel maß gegen eine Zahl ohne Herkunft.

**Ein angenommenes Angebot legt die Baustelle an und bringt sein Stundenbudget
mit.** Die Nummer bleibt zuordenbar: aus `AN-2026-0007` wird `B-2026-0007`.
Erst damit bedeutet die Ampel etwas.

**Der Haken „zählt als Arbeitszeit" ist wichtiger, als er aussieht.** Eine
Anfahrtspauschale wird oft in Stunden angesetzt und ist trotzdem keine
Arbeitszeit. Würde man einfach alle Stunden-Zeilen summieren, bekäme die
Baustelle ein zu hohes Budget und die Ampel bliebe grün, während der Auftrag
längst gerissen ist — ein Fehler, der Geld kostet und erst bei der
Nachkalkulation auffällt. Im Test: 35 h statt 38 h.

**Positionen und Summen benutzen dieselbe Rechnung wie die Rechnung selbst**
(`calcTotals`, `positionNetto`, `cent`). Zwei getrennte Rechenwege hätten
früher oder später zwei verschiedene Summen für dieselben Positionen ergeben —
eine im Angebot, eine auf der Rechnung, und der Kunde hätte beide.

**Eigener Nummernkreis mit eigenem Zähler**, in einer Transaktion gezogen.
Zwei Personen, die gleichzeitig kalkulieren, bekämen sonst dieselbe Nummer.
Der Angebotskreis beginnt zum Jahreswechsel neu bei 1; der Rechnungskreis
läuft monoton weiter — die Rules unterscheiden das ausdrücklich.

**Im Emulator gefunden:** die Rules erlaubten nur den Zähler `_invoices`. Der
Angebotszähler war damit gesperrt und das Anlegen schlug fehl — sichtbar nur,
weil gegen die echten Rules getestet wurde.

Gelöscht wird nur der Entwurf. Ein versendetes oder abgelehntes Angebot bleibt
nachvollziehbar: was dem Kunden genannt wurde, gehört nicht spurlos entfernt.

Geprüft: drei Komponententests plus der vollständige Durchlauf im Browser —
Kalkulation (€ 2.530 netto, 35 h), Anlegen, Annehmen, und die entstandene
Baustelle mit `estimatedHours: 35` und verknüpftem Kunden.

## Erledigt: Buchhaltungs-Export (Rechnungsausgangsbuch)

Der Steuerberater bekam PDFs und tippte jede Rechnung ab — Kosten, Zeit, und
jede Abtipperei eine Gelegenheit für einen Zahlendreher, ausgerechnet bei den
Zahlen für die Umsatzsteuervoranmeldung. Jetzt ein CSV mit Nummer, Datum,
Kunde, UID, Baustelle, Netto, USt-Satz, USt-Betrag, Brutto, Zahlungsstatus und
Storno.

**Warum ein dokumentiertes CSV und kein BMD- oder DATEV-Format.** Beide haben
feste Spaltenlayouts mit Konten- und Steuerschlüsseln, die sich nach dem
Kontenplan der Kanzlei richten — welche Erlöskonten dieser Betrieb bebucht,
weiß nur der Steuerberater. Ein geratenes Format wäre schlimmer als keins: es
sieht importierbar aus und bucht auf die falschen Konten. Das CSV enthält alle
Felder, die BMD, RZL und DATEV für einen Import brauchen; die Zuordnung macht
die Kanzlei einmal beim Einrichten.

**Stornierte Rechnungen gehen mit, zählen aber nicht in die Summe.** Sie
wegzufiltern wäre der naheliegende Fehler: eine stornierte Rechnung ist kein
Nichts, sondern ein Vorgang, der im Journal stehen muss — und ihr Fehlen
erzeugt eine Lücke im Nummernkreis.

**Die Lückenprüfung läuft mit.** Eine fehlende Nummer heißt: eine Rechnung
fehlt, oder sie wurde gelöscht statt storniert. Beides gehört geklärt, BEVOR
der Export die Kanzlei erreicht — die Ansicht sagt es vorher, nicht der Prüfer
hinterher. Geprüft wird je Jahr getrennt, sonst wäre der Sprung von
RE-2025-0087 auf RE-2026-0001 jedes Jahr ein Fehlalarm.

**Die UID-Nummer kommt aus den Kundenstammdaten** — ein direkter Gewinn aus
Punkt 1. Vor ihnen gab es sie im System schlicht nicht, und für Rechnungen an
Unternehmen im EU-Ausland ist sie Pflichtangabe.

Geprüft: zehn Tests plus der Durchlauf im Browser gegen die Emulatoren mit
einer absichtlich fehlenden Nummer — die Lücke wurde gemeldet, die Summe
schloss den Storno korrekt aus.

## Erledigt: Handwerksschein Stufe 1

Der Schein füllt sich aus Zeiten und Material der Baustelle, der Monteur
ergänzt Notizen, Monteur und Kunde unterschreiben am Gerät — danach ist er
eingefroren. PDF am Gerät, kein Mailversand.

**Abrechnungsart an der Baustelle**, nicht am Zeiteintrag: entschieden wird
das beim Auftrag, nicht täglich neu. Für den Monteur heißt das null
zusätzliche Tipparbeit — und ein vergessener Haken kann nicht passieren, weil
es keinen gibt. Auf einer Pauschalbaustelle sagt der Schein ausdrücklich, dass
die Stunden keine Nachverrechnungsgrundlage sind.

**Die Datenschutzgrenze war der interessanteste Teil.** Der Schein braucht die
Stunden der GANZEN Mannschaft — der Kunde unterschreibt für alle, die dort
waren. Ein Monteur darf die Zeiteinträge seiner Kollegen aber nicht lesen, weil
darin Kranken- und Urlaubstage stehen (Art. 9 DSGVO). Der naheliegende Ausweg
wäre gewesen, die Regel aufzuweichen; das hätte funktioniert und nebenbei
jedem Monteur offengelegt, wer wann wo war. Eine Datenschutzgrenze
aufzumachen, weil eine Ansicht sonst umständlich wird, ist die falsche
Reihenfolge. Stattdessen stellt eine Cloud Function genau das zusammen, was auf
den Schein gehört: Anwesenheitszeiten EINER Baustelle an EINEM Tag. Krank- und
Urlaubstage sind darin per Definition nicht enthalten.

**Unveränderbarkeit steht in den Rules, nicht in der Oberfläche.** Vom
unterschriebenen Schein führt genau ein Weg weg — der Storno, und der lässt
Zeiten, Material, Notizen und Unterschriften unangetastet. Gelöscht wird nie:
ein spurlos verschwundener Beleg wäre schlimmer als ein falscher.

**Die Prüfsumme ist der eigentliche Manipulationsschutz.** SHA-256 über den
eingefrorenen Inhalt, serverseitig gerechnet — eine vom Client mitgelieferte
Prüfsumme bewiese nichts. Die Kanonisierung schreibt die Felder in fester
Reihenfolge auf, statt das Dokument zu serialisieren: sonst hinge der Wert an
der zufälligen Feldreihenfolge und ein Neuberechnen ergäbe eine Abweichung,
obwohl sich nichts geändert hat. Getrennt wird mit einem Zeichen, das in
Freitext nicht vorkommt — mit einem Semikolon wäre eine Tätigkeit „A;B" von
zwei Feldern nicht zu unterscheiden. Elf Tests halten das fest, darunter sieben,
die je EINE Änderung am Inhalt vornehmen und eine andere Prüfsumme erwarten.

**Kein PDF/A und kein qualifizierter Zeitstempel** — beides wurde geprüft und
verworfen (Begründung unten). Das PDF nennt sich normales PDF und trägt die
Prüfsumme im Fuß.

**Offline gedacht:** Gerätezeit UND Serverzeit werden gespeichert. Eine im
Keller erfasste Unterschrift synchronisiert später; die Serverzeit wäre dann
die der Übertragung. Solange die Prüfsumme noch aussteht, sagt die Ansicht das
ausdrücklich, statt die Zeile wegzulassen — eine fehlende Prüfsumme sieht
sonst aus wie ein Fehler.

Geprüft: elf Tests zur Prüfsumme plus der vollständige Durchlauf im Browser
gegen die Emulatoren — Vorausfüllung (08:30 aus einer echten Buchung, Material
aus einer Anforderung), Unterschrift auf beiden Feldern, Einfrieren,
serverseitige Prüfsumme, PDF-Ausgabe.

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

