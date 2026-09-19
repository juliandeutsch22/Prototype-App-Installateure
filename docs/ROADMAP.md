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
2. **Digitaler Handwerksschein** — Stufen 1, 2 und 4 ERLEDIGT, siehe unten.
   Offen bleibt Stufe 3 (automatischer Versand): sie braucht einen
   Mailanbieter und ein Geheimnis in der Function, was nur der Betrieb selbst
   einrichten kann. Der Fallback — das PDF vom Gerät aus teilen — steht seit
   Stufe 1 und trägt den Alltag ohnehin besser.
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

## Erledigt: ein Erscheinungsbild statt einer Sammlung von Einzelfällen

Die Oberfläche war nicht hässlich, sie war UNEINIG. Marineblau mit rotem
Akzent aus dem alten Prototyp, daneben ein blaues „info", das dem Markenblau
so nahe kam, dass ein Hinweiskasten und ein aktiver Reiter dieselbe Farbe
trugen. Die Reiter in „Material" unterstrichen sich im Akzent, die Reiter in
„Einstellungen" in der Marke — zwei Regeln für dieselbe Sache. Und: Karten,
Kästen und Leisten hatten jede ihre eigene Kante.

### Was jetzt gilt

Eine Farbwelt aus tiefem Tintenblau-Türkis mit Cyan und Mint als Kante.
Dunkle Flächen tragen die Navigation (Seitenleiste, mobile Kopfleiste,
Tableiste, Anmeldekopf), helle Flächen tragen die Arbeit. Hauptaktionen tragen
einen Verlauf, Nebenaktionen eine Fläche — die Rangordnung ist erkennbar,
bevor die Beschriftung gelesen ist.

Sämtliche Werte stehen EINMAL in `src/index.css` und werden über
`tailwind.config.js` als Rolle angeboten. Deshalb war für die ganze Umstellung
keine Ansicht anzufassen, in der es um Rechnungen, Zeiten oder Scheine geht:
sie lesen alle `bg-surface`, `border-line`, `text-ink-muted`. Die drei
tragenden Flächen (`.panel`, `.panel-dark`, `.edge-accent`) stehen in
`@layer components` — als freies CSS stünden sie nach den Utilities und
schlügen jedes `rounded-sm` und jedes `fixed` an der Aufrufstelle.

### Kontrast ist nicht verhandelt worden

Gearbeitet wird draußen, im Sommer mit Sonne auf dem Display. `--text-muted`
liegt auf allen drei Flächen über 7:1 (AAA). Die leuchtenden Töne sind Kante
und Fläche, nie Text — #12b0c6 erreicht auf Weiß 2,6:1. Und weil ein Verlauf
nur so lesbar ist wie seine hellste Stelle, endet `--grad-brand` bei #107a8c
(5,0:1) statt, wie die Vorlage, bei #12889b (4,2:1). Genau dort steht in der
Seitenleiste der Benutzername.

### Was diese Umstellung erst möglich gemacht hat

Dass die Farbrollen in `tailwind.config.js` Funktionen sind, die bei einer
Abtönung ein `color-mix` liefern — das kam mit der Deckkraft-Reparatur und
war hier die Voraussetzung: der halbdurchsichtige Marker auf der dunklen
Leiste (`bg-white/10`), die getönte Kante an den Hinweiskästen und der
Abdunkler hinter jedem Dialog hängen alle daran. **Nicht zurück auf Strings
setzen.**

### Zwei Dinge, die dabei zwingend mitgehen mussten

- **Die Aufnahmetaste ist rot.** Sie war „Akzent", und der Akzent war rot.
  Seit der Akzent im Türkis der Marke liegt, wären Ruhe und Aufnahme zwei
  Türkistöne gewesen, und der Zustand hinge allein am Quadrat in der Mitte.
- **Der Avatar trägt die leuchtende Kante, nicht den Akzent.** Auf der nun
  dunklen Kopfleiste erreichte ein Kreis in `--accent` 2,1:1 gegen seinen
  Träger — er verschwände. Der Sinn dieses Punktes ist, dass man auf einem
  geteilten Baustellen-Tablet mit einem Blick sieht, wer angemeldet ist.

Funktional ist nichts angefasst worden: die Testreihe, die Typprüfung und
der Lint sind unverändert grün.

### Nachgeschärft nach dem ersten Blick darauf

Fünf Punkte aus dem Betrieb, und vier davon dieselbe Ursache.

**Ein roter Strich unter den Reitern.** Der Pilotbetrieb hat `#d51f26` als
Akzentfarbe in seinen Stammdaten, und die Reitermarkierung kam aus
`--accent`. Also stand mitten auf einer türkisen Seite ein roter Unterstrich.
Daraus ist eine Regel geworden, die mehr trägt als diesen einen Strich: **die
Marke färbt, was handelt — Knöpfe, Abzeichen, Links. Die Oberfläche färbt,
was Struktur ist** — Trägerflächen, Kanten, Reitermarkierung, Kästchen,
Kalender, und dafür gibt es feste Töne, an die `applyBranding` nicht
herankommt. Ohne diese Trennung wäre nach dem Reiterstrich der Zähler im
Kalender der nächste rote Punkt gewesen.

**Zu viele Verläufe.** Auf jedem Knopf, auf jeder Karte, auf dem Seitengrund.
Nebeneinander war das kein Rang mehr, sondern Unruhe. Jetzt: Verlauf nur auf
den grossen dunklen Trägerflächen und auf der Markenkante, alles andere
einfarbig.

**Der Avatar.** Ein Verlauf auf 32 px ist kein Verlauf, sondern ein Fleck mit
zwei Farben. Jetzt ein Ton.

**Die Kästchen.** Sie sahen aus wie aus einer anderen App, und das stimmte
auch: `accent-color` färbt den Haken und sonst nichts — Grösse, Rundung und
Rahmen blieben die des Betriebssystems, neben Feldern mit 14 px Rundung. Ein
eigenes `.checkbox` mit `appearance: none` und einem Haken als SVG. Es bleibt
ein echtes `<input type="checkbox">`; Tastatur und Vorlesehilfe merken
nichts davon.

**Die Ränder der Startbildschirm-App.** Der erste Anlauf setzte das
Tintenblau auf `html` — sah auf kurzen Seiten richtig aus und legte unter jede
längere Seite ein dunkles Band, weil `body` genau einen Bildschirm hoch ist
und alles darunter dem `html` gehört. Jetzt malt die App die Streifen selbst:
Kopf- und Tableiste rechnen `env(safe-area-inset-*)` in ihr Innenmaß ein.
**Für eine bereits installierte App hilft das nicht rückwirkend** — iOS und
Android merken sich die `theme_color` aus dem Manifest beim Hinzufügen. Dafür
muss sie einmal vom Startbildschirm entfernt und neu abgelegt werden.

**Die Ladeplatzhalter.** Sie liefen von `--surface-2` über `--border` und
zurück — `--border` ist die Farbe der Trennstriche, ein Balken darin sah aus
wie ein sehr dicker Strich. Und sie PENDELTEN: beim Zusehen wusste man nie, ob
die Bewegung vorwärts oder rückwärts läuft. Jetzt ein eigener Türkiston, über
den ein schmaler Lichtstreifen einmal von links nach rechts wandert, und
Pillenform statt Kästchen. Der Ladekreis dreht im selben Türkis wie die
übrigen Markierungen.

**Eine weisse Fuge zwischen Navigation und Inhalt.** Am Rand jeder dunklen
Leiste — rechts an der Seitenleiste, unter der Kopfleiste, über der
Tableiste. Sie sitzt HINTER der Markenkante, nicht statt ihr: die Kante
gehört zur Leiste, der weisse Streifen trennt sie vom Arbeitsbereich.
Dieselbe Trennung, nur rund, liegt als schmaler Ring um das Profil-Abzeichen.

Zuerst lag an Kopf- und Tableiste zusätzlich die leuchtende Markenkante über
der Fuge. Zwei Streifen übereinander waren zwei Trennungen für eine Sache,
und am Telefon sah die Leiste damit anders aus als die Seitenleiste am
Schreibtisch. Jetzt eine Trennung, überall dieselbe. Die leuchtende Kante
steht noch dort, wo sie allein steht: am Anmeldekopf und als kurzer Strich
unter der Seitenüberschrift.

---

## Erledigt: die Benutzerverwaltung hat Tests — und zwei stille Fehler weniger

Die Ansicht, an der hängt, wer im Betrieb was darf und wer überhaupt
hereinkommt. Beides geht still schief: eine falsch vergebene Rolle merkt
niemand, bis jemand etwas sieht, das er nicht sehen soll, und eine falsch
gesetzte Zahl im Zeitkonto steht am Monatsende auf dem Lohnzettel.

**DER TEUERSTE FUND: eine eingetragene NULL wurde zur Vorgabe.**

```
weeklyTargetHours: Number(form.weeklyTargetHours) || DEFAULT_WEEKLY_HOURS
```

In JavaScript ist die Null unwahr. Beide Felder erlauben ausdrücklich
`min="0"` — wer null Wochenstunden einträgt (geringfügig Beschäftigte, ein
ruhendes Dienstverhältnis, die Chefin selbst) bekam **vierzig**. Danach
produziert jeder Monat rund 170 Minusstunden, ohne dass irgendwo eine Meldung
erschienen wäre. Dasselbe bei null Urlaubstagen, aus denen fünfundzwanzig
wurden. Der Rückfall bei einem LEER gelassenen Feld ist richtig und bleibt —
leer heißt „nicht entschieden", und ein Zeitkonto ohne Sollstunden rechnet gar
nicht. Nur die Null ist eine Entscheidung.

**Der zweite: der Bestätigungsknopf beim Sperren hieß „Löschen".** In Rot,
unter der Frage „Benutzer deaktivieren?" — in einer Ansicht, die per
Entscheidung **nie** etwas löscht, weil sonst Zeiteinträge, Bestellungen und
Einsätze verwaisen. Der Kommentar zwei Zeilen darüber sagt das ausdrücklich.
Derselbe fehlende `confirmLabel` wie beim Materialabholen; das ist jetzt
zweimal aufgetreten und steht deshalb als eigene Falle in der Übergabe.

**Was die 18 Tests festhalten**, sind die Grenzen, die sonst nur im Kopf
stehen: dass die Geschäftsführung die Rolle Administrator gar nicht erst
angeboten bekommt (dieselbe Grenze wie in `firestore.rules` — eine Oberfläche,
die etwas anbietet, das der Server ablehnt, ist ein Knopf, der nichts tut);
dass sie einen Administrator nicht anfassen kann, weil sie sonst den letzten
Superuser sperren könnte; dass das **eigene** Konto keine Deaktivierung
angeboten bekommt; und dass das Formular beim Bearbeiten die bestehenden Werte
übernimmt — startete es leer, überschriebe eine Namenskorrektur die
Wochenstunden mit der Vorgabe.

Dazu der Weg, der sonst niemandem auffällt: geht die Willkommens-Mail nicht
raus, wird das Startpasswort einmalig angezeigt. Ohne ihn stünde das Konto in
der Liste und der neue Mitarbeiter käme nie hinein.

Geprüft: 590 ohne Emulator (18 neu), 148 dagegen. Acht Mutationen gegen den
alten Stand gefahren, alle gefangen.

Bleiben **6 von 27** Ansichten ohne eigenen Test.

---

## Erledigt: das Verrechnet-Kennzeichen gehört der Buchhaltung, 02.09.2026

Nachgang zum Materialstamm-Fund. Wenn eine Regel an einer Stelle zu eng war,
ist die Frage naheliegend, wo sie zu weit ist — also alle Grenzen aus dem
Sicherheits-Durchgang noch einmal durchgegangen, diesmal entlang der Frage:
**welche Ansicht schreibt in eine Sammlung, die ihr nicht gehört?** Genau
diese Konstellation hatte beim Material zugeschlagen.

**Vier Verdachtsfälle geprüft, drei entkräftet:**

- `markBilled` schreibt aus der Rechnungsansicht in fremde Sammlungen — aber
  nur in `timeEntries` und `materialOrders`, nie in `workSheets`. Der
  unterschriebene Schein wäre nach seiner Regel nicht beschreibbar gewesen;
  der Weg existiert schlicht nicht. Nachgesehen statt behauptet.
- Die Buchhaltung darf Materialanforderungen ändern — steht so in der Regel.
- `updateUserProfile` schickt nur die geänderten Felder. Bei einem Update ist
  `request.resource.data` aber das ZUSAMMENGEFÜHRTE Dokument, `companyId` und
  `role` sind also da. Kein Problem.

**Der vierte war echt.** Die Regel für `timeEntries` und `materialOrders`
lautete sinngemäß „der Eigentümer darf seinen eigenen Beleg ändern" — ohne
Einschränkung, welches FELD. Damit konnte ein Monteur an seinem eigenen
Zeiteintrag `isBilled: true` setzen.

Was daran hängt: die Rechnungsstellung sammelt nur, was **nicht** verrechnet
ist. Ein selbst gesetztes Kennzeichen nimmt die eigene Arbeitszeit aus der
Rechnung — still, ohne Fehlermeldung, und niemandem fällt es auf, weil die
Zeile im Zeitkonto ganz normal weitersteht. Der Kunde zahlt sie nie. Über die
Oberfläche ist das nicht erreichbar; die Formulare schicken `isBilled` und
`invoiceNumber` überhaupt nie mit. Über das SDK schon, und der Server zählt —
dieselbe Begründung wie beim deaktivierten Konto.

Der Kommentar an dieser Regel behauptete sogar, das sei erledigt: „Vorher
konnte jeder jede Bestellung ändern — inklusive des Verrechnet-Kennzeichens."
Das stimmte zur Hälfte. FREMDE Belege waren dicht, die EIGENEN nicht.

**Elf neue Regeltests, und die Aufteilung ist der Punkt:** vier prüfen, dass
der Riegel hält, **sieben prüfen, dass er keinen echten Arbeitsweg kostet** —
Zeit korrigieren, Zeit buchen, Abholung bestätigen, Material anfordern, fremde
Einträge durch die Buchhaltung korrigieren. Genau diese zweite Hälfte fehlte
beim Materialstamm, und deshalb tat dort ein Knopf drei Wochen lang nichts.

Sie hat sich sofort bezahlt gemacht: zwei der sieben schlugen beim ersten Lauf
fehl. Nicht wegen der Regel — mein Testdatensatz trug die falsche
Benutzerkennung. Ohne diese Hälfte hätte ich den Fehlschlag nie gesehen.

Geprüft: 572 ohne Emulator, **148 dagegen** (11 neu). Die vier Riegel-Tests
schlagen gegen die vorherigen Regeln fehl, die sieben Gegenproben bestehen
unter beiden Ständen — so gehört es: sie sichern Bestehendes, sie erlauben
nichts Neues.

---

## Erledigt: das Unterschreiben mit dem Finger, 02.09.2026

Zum dritten Mal gemeldet, und diesmal mit dem entscheidenden Zusatz: **am PC
geht es, auf dem iPhone nicht, Android ungetestet.** Genau diese Verteilung
war der Hinweis — es liegt nicht an der Zeichenlogik, sondern am Eingabeweg.

**Diesmal nicht geraten, sondern gemessen.** Die echte Komponente lief in
einem echten Browser mit echter Fingereingabe (Chromium über das CDP, nicht
jsdom). Der Befund:

| Lauf | gezeichnete Pixel |
|---|---|
| ungestört | 8285 |
| mit Abbruch der Zeigergeste | **36** |

36 Pixel sind ein Punkt. Genau so wurde es beschrieben: „das Feld reagiert
nicht". Und schlimmer — das Feld meldete diesen Punkt trotzdem als fertige
Unterschrift nach oben. Ein Schein wäre damit mit einem praktisch leeren
Unterschriftsfeld eingefroren worden.

**DER MESSWERT, AUF DEM DER UMBAU BERUHT:** in derselben Geste, in der nach
dem Abbruch kein einziges `pointermove` mehr kam, kamen noch **neun
`touchmove`** an. Die Berührungsspur läuft weiter, wenn die Zeigerspur schon
abgeräumt ist. Der Finger zeichnet deshalb jetzt über `touchstart`/`touchmove`;
Maus und Stift laufen unverändert über die Zeigerereignisse.

Drei Änderungen, jede einzeln begründet:

1. **Berührungsereignisse statt Zeigerereignisse für den Finger** — der Kern.
2. **`setPointerCapture` ist raus.** Es sollte den Strich über den Feldrand
   halten und steht zugleich im Verdacht, den Abbruch auf WebKit überhaupt
   auszulösen. Dieselbe Aufgabe erledigen jetzt Listener am Fenster, solange
   ein Strich läuft — im Browser nachgeprüft, auch beim Loslassen weit
   außerhalb des Feldes.
3. **Die Listener hängen nativ am Element**, nicht über React. React meldet
   Berührungsereignisse an der Wurzel als *passiv* an, und dort ist
   `preventDefault()` wirkungslos — ohne das scrollt die Seite unter dem
   Finger weg, statt dass er zeichnet.

Dazu `touch-action: none` zusätzlich fest am Element statt nur als Klasse. Im
Probestand ohne diese eine Eigenschaft brach der Browser die Geste nach dem
ersten Zug ab; eine Klasse kann ein Build verlieren, diese Zeile nicht. (Im
aktuellen Build ist sie nachweislich drin — das war die erste Hypothese, und
sie war falsch. Nachgesehen statt angenommen.)

**Zwei eigene Fehlmessungen auf dem Weg dorthin**, beide in der Übergabe
festgehalten: der erste Probestand lud die Stylesheets nicht und zeigte den
Fehler deshalb aus dem falschen Grund; und Vite lieferte aus dem
Zwischenspeicher, sodass zwei Läufe für zwei verschiedene Codestände
identische Zahlen ergaben. Ohne Neustart hätte ich „behoben" gemeldet, ohne
etwas gemessen zu haben.

**Was offen bleibt:** geprüft ist das in Chromium mit Fingereingabe, nicht in
Safari auf einem iPhone. Ein iOS-Gerät steht mir nicht zur Verfügung. Der
Mechanismus ist nachgewiesen und die Ursache beseitigt — die Bestätigung am
Gerät steht aus.

Geprüft: 572 ohne Emulator (12 auf das Unterschriftsfeld, 9 davon fallen gegen
den vorherigen Stand durch), 137 gegen den Emulator.

---

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
DECKUNGSBEITRAG, kein Gewinn. Gemeinkosten fehlen, soweit sie nicht schon im
Stundenkostensatz stecken. Eine Baustelle mit dünnem Deckungsbeitrag ist im
Ergebnis vermutlich negativ — deshalb steht die Ampel schon unter zwanzig
Prozent auf Gelb, obwohl die Zahl formal positiv ist.

**Material zählt seit dem 07.09.2026 mit** (siehe unten). Bis dahin fehlte es
ganz, und bei einem Installateur ist es schnell die Hälfte der
Rechnungssumme: der ausgewiesene Deckungsbeitrag war systematisch zu hoch,
und zwar in der teuersten Richtung — eine Baustelle sah tragfähig aus, die es
nicht war.

Nur für die Geschäftsführung: hier stehen Margen, und die Projektleitung sieht
sie nicht.

Geprüft: neun Tests plus der Durchlauf im Browser — der Zustand ohne
Kostensätze, das Setzen (Deckungsbeitrag 23,00 € je Stunde bei 65 gegen 42),
und alle drei Erlösquellen nebeneinander.

## Erledigt: Leistungszeit am Schein, Nachtrag in der Zeiterfassung (08.09.2026)

Aus dem Betrieb: der Monteur stellt den Schein beim Kunden aus, oft bevor er
die Zeit gebucht hat — bei einer Reparatur zwischendurch hat er vorher gar
nichts erfasst.

**Er konnte auf dem Schein auch nichts eintragen.** Die Zeilen kamen
ausschliesslich aus der Zeiterfassung; war dort nichts gebucht, stand auf dem
Beleg „Für diesen Tag ist auf dieser Baustelle keine Zeit gebucht" — und der
Kunde unterschrieb einen Zettel, der nur Material dokumentierte.

### Das war nicht nur unschön, es kostete Geld

**Die Rechnung rechnet ihre Stunden aus den ZEITEINTRÄGEN, nicht vom Schein.**
Der Schein liefert nur das Material. Eine Stunde, die nie gebucht wird, wird
also nie verrechnet — nicht „später korrigiert", sondern nie. Und es fehlt
zugleich die Arbeitszeitaufzeichnung, die der Betrieb nach § 26 AZG führen
muss.

### Ein glücklicher Umstand hat den Zuschnitt vereinfacht

`calcWorkMin` lässt die Wegzeit ausdrücklich draussen — `travelTime` zählt
nicht zur Arbeitszeit. Die „Zeit beim Kunden ohne Anfahrt" ist damit **genau
dieselbe Größe**, die die Rechnung später abrechnet. Schein und Rechnung sagen
dasselbe; die Diskrepanz, vor der sonst zu warnen gewesen wäre, gibt es nicht.

### Der Nachtrag ist abgeleitet, nicht gespeichert

In der Zeiterfassung steht ganz oben, welche unterschriebenen Scheine noch
ohne Zeiteintrag sind, mit einem Griff ins Formular — Datum, Baustelle, Von,
Bis und Pause vorbelegt. Es gibt **kein Feld „noch nachzutragen"**, das jemand
setzen und wieder löschen müsste: der Hinweis ergibt sich aus dem Vergleich
und verschwindet von selbst.

**Gebucht wird nicht automatisch**, und das ist die wichtigste Entscheidung
hier. Der Schein kennt die Zeit beim Kunden. Er kennt nicht die Anfahrt, nicht
das Fahrzeug (Kennzeichen), nicht die Zuschläge und nicht den Rest des
Arbeitstags. Ein automatisch erzeugter Eintrag wäre eine zu niedrige
Arbeitszeitaufzeichnung, die vollständig aussieht — und niemand sähe je wieder
hin.

**Die Minuten werden nicht verglichen.** Der Arbeitstag ist regelmässig länger
als die Zeit beim Kunden; ein Wächter, der jede Abweichung meldet, schlüge
ständig zu Recht an und würde nach einer Woche weggeklickt. Verglichen wird
nur, OB für Tag und Baustelle etwas gebucht ist.

**Vierzehn Tage lang.** Länger würde zur Dauerliste — wer den Tag auf eine
andere Baustelle gebucht hat, behielte den Hinweis für immer. Den langen
Schwanz fängt das Büro über „nicht verrechnete Leistung".

### Was der Test gefunden hat, und es war kein Testfehler

Meine erste Fassung wies „Bis vor Von" als Vertipper zurück. Das wäre falsch
gewesen: `calcWorkMin` behandelt eine Endzeit vor der Startzeit als Einsatz
**über Mitternacht** — Bereitschaft und Notdienst gibt es in diesem Gewerbe,
und 22:00–06:00 muss acht Stunden ergeben, nicht null. Die Sperre hätte die
Notdienstnacht unbezahlt gelassen.

Der Preis der richtigen Formel: aus dem Vertipper „11:00 bis 08:00" werden
stillschweigend einundzwanzig Stunden, auf einem Zettel, den der Kunde gleich
unterschreibt. Deshalb wird ab vierzehn Stunden **nachgefragt statt gesperrt**
— eine durchgemachte Nacht gibt es wirklich, aber sie gehört bestätigt.

### Die Kollegen — nachgereicht

Der Schein gilt für die ganze Mannschaft, aber ein Monteur darf die
Zeiteinträge seiner Kollegen weder lesen noch schreiben — dort stehen Kranken-
und Urlaubstage (Art. 9 DSGVO). Der Hinweis betrifft deshalb nur seine EIGENE
Zeit. Die Liste fürs Büro stand hier als offene Lücke; sie ist inzwischen
gebaut, siehe „Stunden ohne Buchung" weiter unten.

Geprüft: 14 Rechen-Tests, 19 in der Zeiterfassung, 7 am Schein, 3 am
Formular — und 15 absichtlich kaputte Fassungen, die alle aufgefallen sind.
Zwei davon erst im zweiten Anlauf: was die Vorbelegung im echten Formular
bewirkt, prüfte zunächst niemand, weil dort ein Doppelgänger stand.

## Erledigt: Der Ansichten-Durchgang (08.09.2026)

Zwei Durchgänge über zwei verschiedene Dimensionen, weil ein Durchgang über
EINE Form alles findet ausser dem, was anders gebaut ist:

1. **die Datenschicht** — alle 47 Abfragen auf Grenzen, Live-Abos und
   verschluckte Fehler,
2. **die drei Zustände jeder Ansicht** — laden, Fehler, leer.

Drei echte Befunde, drei benannte Wachstumsrisiken.

### Befund 1: Die Baustellenliste schnitt still bei 300 ab

`AdminProjectsView` holte über `subscribeRecentProjects(…, 300)` und schwieg
dazu. Ab der 301. Baustelle fielen die **ältesten** heraus, ohne dass
irgendwo etwas stand — die Baustelle von vor drei Jahren war in der
Verwaltung schlicht nicht auffindbar, und nichts unterschied das von „gibt es
nicht".

**Warum „Sichtbare Grenzen" das übersehen hat:** die Ansicht verwendet ein
LIVE-ABO. Der Durchgang damals suchte nach einmal ladenden Listen, und diese
passte nicht ins Muster. Ein Durchgang, der nach einer Form sucht, findet
alles ausser dem, was anders gebaut ist.

Buchen war nie betroffen — die Baustellenauswahl hängt an
`listActiveProjects` und kennt keine Grenze. Betroffen war die Verwaltung,
also genau die Stelle, an der jemand gezielt nachschlägt.

### Befund 2: Scheiterte die Forderungsabfrage, logen zwei Karten

`listUnpaidInvoices` scheiterte still, und sie trägt **zwei** Karten:

| Karte | Was sie dann sagte |
| --- | --- |
| Mahnlauf | rechnete über eine leere Liste und verschwand — sieht aus wie „nichts zu mahnen", ist aber „ich weiss es nicht" |
| Nicht verrechnete Leistung | meldete Scheine als unverrechnet, die längst auf einer offenen Rechnung stehen — eine falsche Anschuldigung, der jemand nachgeht |

Der Kommentar daneben rechtfertigte das Schweigen mit „Zusatzangabe". Für die
Scheine stimmt das; für die Forderungen nicht — sie sind die Grundlage.

Jetzt steht eine Zeile über beiden Karten, und beide ziehen sich zurück. Eine
Karte, die auf halber Grundlage rechnet, ist schlimmer als keine: sie wird
geglaubt.

### Befund 3: Die Startseite lud ewig, wenn eine Abfrage scheiterte

Nachgereicht am selben Tag, beim zweiten Durchgang — diesmal nicht über die
Datenschicht, sondern über die drei Zustände jeder Ansicht: laden, Fehler,
leer. **Die Startseite war die einzige ganz ohne Fehlerzustand.**

Sie lädt in drei Blöcken über `Promise.allSettled`, dessen Ergebnis verworfen
wurde. Warf ein Block, wurde sein `setLaden(false)` nie erreicht:

- der Kreisel blieb **für immer** stehen,
- und die Warnungen dieses Blocks — fehlende Tage ohne Buchung, offene
  Anforderungen, überfällige Rechnungen — erschienen **einfach nie**.

Ein ewiger Kreisel behauptet zwar nichts Falsches (`nothingToShow` verlangt,
dass nichts mehr lädt). Aber er erklärt auch nichts, und wer sich an eine
Startseite gewöhnt, die dauernd lädt, sieht auch dann nicht hin, wenn sie
etwas zu sagen hat.

Jetzt fängt jeder Block für sich, der Ladezustand endet **immer**, und wer
nicht kam, steht unten mit Namen da — nach allem, was sehr wohl geladen
wurde. Die Blöcke bleiben getrennt: fällt die Betriebssicht aus, sieht der
Monteur trotzdem, wo er heute hin muss.

### Benannt, nicht gebaut: drei Wachstumsrisiken

**Der Materialkatalog wird vollständig geladen, in sechs Ansichten, vier
davon als Live-Abo.** `subscribeMaterials` hat gar keine Grenze. Heute
harmlos (ein paar hundert handgepflegte Artikel), aber es wächst ohne jedes
Signal — und es ist der **harte Vorläufer für Datanorm**: ein
Großhandelskatalog hat 50.000 bis 500.000 Artikel. Bevor importiert wird,
braucht der Katalog eine Grenze und die Ansichten eine Suche, die nicht über
das Geladene läuft.

**`listCustomers` hat einen Standardwert von 500 ohne Ansage.** Vier
Auswahlfelder ziehen daraus. Weniger schlimm als eine Liste, weil man einen
gesuchten Namen vermisst statt ihn zu übersehen — aber dieselbe Klasse. Bei
einem Fünf-Mann-Betrieb sind 500 Kunden über zehn Jahre.

**`listActiveProjects` hat gar keine Grenze** und hängt an sieben Stellen,
darunter die Baustellenauswahl jedes Monteurs. Begrenzt ist sie nur durch
Disziplin beim Abschliessen von Baustellen — nicht durch Code.

Für alle drei gilt derselbe ehrliche Auslöser wie bei der Suche: **wenn
„Weitere laden" regelmässig erscheint**, nicht eine geratene Zahl.

## Erledigt: Zwei Betriebe arbeiten nebeneinander (08.09.2026)

Aus der Frage, wie die Software an mehrere Betriebe ausgeliefert wird. Die
Mandantentrennung galt als belegt — 214 Regeltests gegen eine echte Datenbank.
Beim Nachsehen stellte sich heraus, dass sie die falsche Frage beantworten.

**Regeltests fragen: darf diese Rolle DIESES DOKUMENT?** Das ist richtig für
einen Zugriff und unvollständig für eine AUSWERTUNG. Wo über viele Dokumente
summiert wird — Zeitkonto, Nummernkreis, Mahnlauf, „Stunden ohne Buchung" —
entscheidet nicht die Regel, sondern ob die ABFRAGE ihren Mandantenfilter
mitführt. Fehlt er, liefert die Datenbank willig fremde Zeilen, und die Regel
hat nichts dagegen: sie prüft nur, was zurückkommt, und zurück kommt ja etwas,
das der Aufrufer lesen dürfte, wenn es ihm gehörte.

**Ein solcher Fehler ist im Ein-Betrieb-Betrieb unsichtbar.** Er erscheint am
Tag, an dem der zweite Kunde dazukommt — als fremde Stunden auf einem
Lohnzettel oder als Rechnungsnummer, die schon vergeben ist.

Bis hierher kam `andere-firma` in den Durchstichen genau zweimal vor, beide
Male als einzelnes fremdes Dokument, an dem eine Regel scheitert. Zwei
Betriebe, die gleichzeitig ARBEITEN, gab es nicht.

### Was „Durchstich 8" prüft

Zwei Betriebe, **derselbe Tag, dieselbe Baustellennummer** — der harte Fall,
und der realistische: „B-2026-0001" vergibt jeder Betrieb, der bei eins
anfängt.

| Geprüft | Warum gerade das |
| --- | --- |
| Zeitraum-Abfrage | Die Grundlage jedes Zeitkontos und jeder Lohn-CSV |
| Baustellen-Abfrage | Fragt nach Nummern, nicht nach Zeitraum — dort fiele ein fehlender Filter am wenigsten auf |
| Nummernkreis | Der teuerste Fall: ein gemeinsamer Zähler risse eine Lücke in den Kreis des anderen |
| Offene Forderungen | Grundlage des Mahnlaufs |
| Stunden ohne Buchung | Zwei Sammlungen, zwei Abfragen, zwei Gelegenheiten für einen vergessenen Filter |
| Eigene Einträge des Monteurs | Filtert auf `erstelltVonUid` — ohne Mandantenfilter davor eine Abfrage über den ganzen Bestand |

### Die Gegenprobe, und sie ist der eigentliche Beleg

Wird der Mandantenfilter aus `queryTenant` entfernt, fallen **19 Tests**,
davon **fünf der sechs neuen**. Der sechste bleibt grün — zu Recht: der
Nummernkreis trennt über die Dokumentkennung
(`counters/{companyId}_invoices`), nicht über einen Abfragefilter. Für ihn
gibt es deshalb eine eigene Gegenprobe: ein gemeinsamer Zähler, und genau
dieser eine Test fällt.

**Was damit NICHT belegt ist:** dass die Auslieferung an einen echten zweiten
Betrieb funktioniert. Der Bootstrap ist nie für einen zweiten Mandanten
gelaufen, und die betrieblichen Fragen — AV-Vertrag als Auftragsverarbeiter,
Impressum, getrenntes Produktivprojekt — sind davon unberührt. Geprüft ist
das, was Code ist.

## Erledigt: Der Storno geht ganz durch oder gar nicht (08.09.2026)

Beim Suchen nach weiteren Schwachstellen gefunden — und es ist dieselbe
Lücke, die beim Lagerabzug schon einmal geschlossen wurde, nur an einer
Stelle, die noch niemand angesehen hatte.

`cancelInvoice` schrieb erst die Rechnung, dann die Freigabe der Belege; die
Freigabe selbst war ein `Promise.all` einzelner Schreibvorgänge. Bricht die
Verbindung dazwischen ab — im Funkloch der Normalfall —, bleibt ein Zustand
stehen, den niemand sieht und den nichts wieder einrenkt:

| Bricht ab bei | Folge |
| --- | --- |
| Storno | Rechnung storniert, Stunden weiter gesperrt. Sie stehen auf keiner gültigen Rechnung und lassen sich auf keine neue nehmen — **Geld, das nie wieder eingefordert wird**. |
| Storno-Aufhebung | Rechnung offen, Stunden frei. Dieselbe Stunde kann **ein zweites Mal verrechnet** werden. |

Beide Wege laufen jetzt als **ein `writeBatch`**. Bewusst kein
`runTransaction`: gelesen wird nichts, und ein Stapel wird zusätzlich offline
vorgehalten und nachgeschickt — was eine Transaktion nicht tut.

**Das Anlegen bleibt absichtlich, wie es war.** Dort ist die Reihenfolge
selbst die Sicherung: Nummer ziehen, Belege sperren, dann anlegen. Bricht es
ab, sind Belege gesperrt, zu denen es keine Rechnung gibt — die harmlose
Richtung. Ein gemeinsamer Stapel bräuchte die Kennung der Rechnung, bevor sie
existiert, und würde den einzigen Weg berühren, auf dem Rechnungsnummern
entstehen.

### Wie man Atomarität prüft, ohne den Strom abzuschalten

Ein Beleg, den die REGEL ablehnt — hier ein Zeiteintrag einer fremden Firma.
Ein Stapel fällt daran ganz; zwei getrennte Schreibvorgänge hätten die
Rechnung längst geändert, bevor der zweite scheitert. Genau diesen Unterschied
misst „Durchstich 7" gegen den Emulator, und die Probe bestätigt es: mit der
alten Fassung fällt exakt dieser Test.

## Erledigt: Rechnung gegen unterschriebenen Schein (08.09.2026)

Die Rechnung nimmt alle unverrechneten Stunden der Baustelle. Der Kunde hat
aber einen Schein über die Zeit **bei ihm** in der Hand — ohne Anfahrt, ohne
Vorbereitung in der Werkstatt, ohne den zweiten Weg zum Grosshändler.

Beides darf auseinandergehen, und zwar völlig zu Recht: vorgefertigt wird auf
die Baustelle gebucht, und das ist geleistete Arbeit. **Nur sagte es
niemandem**, wenn die Rechnung deutlich über dem liegt, was auf dem Papier in
der Kundenmappe steht — und die Reklamation kommt erst, wenn sie schon
draussen ist.

In der Vorschau steht jetzt eine Zeile: „Ein Schein bestätigt 04:00,
verrechnet werden 08:00". Ruhig, solange es passt; als Warnung, sobald die
Abweichung **beide** Schwellen reisst — mindestens eine Stunde UND mindestens
ein Viertel über dem Bestätigten. Jede Bedingung allein wäre Lärm: ein Viertel
mehr ist bei einem Einstundeneinsatz eine Viertelstunde, eine Stunde mehr auf
einer Vierzigstundenbaustelle nichts.

**Gekappt wird nichts.** Eine Rechnung auf die Scheinstunden zu begrenzen
würde geleistete Arbeit verschenken — der teurere Fehler. Die Zahl wird
gezeigt, entschieden wird im Büro.

Ohne unterschriebenen Schein steht gar nichts da: „Sie verrechnen 40 Stunden,
bestätigt sind 0" wäre bei jeder Baustelle ohne Schein zu lesen.

## Erledigt: Die Sicherung sagt, wo sie liegt (08.09.2026)

Stand seit Langem als bekannte Lücke da: ohne gesetzten `AUSLEITUNG_BUCKET`
schreibt die nächtliche Ausleitung in denselben Google-Projektbereich wie die
Daten. Gegen einen Fehlgriff hilft das sofort, gegen „der Zugang zum Projekt
ist weg" gar nicht.

**Die Lücke ist nicht geschlossen — sie ist sichtbar geworden**, und das ist
hier der ehrliche Schritt: das Ziel zu setzen ist eine Sache der Einrichtung,
keine des Codes. Bis heute stand diese halbe Wirkung allein in
`docs/DEPLOYMENT.md`; eine Sicherung, deren Grenze man nur durch Lesen einer
Datei erfährt, hält man für ganz.

Die Ausleitung schreibt jetzt `zielExtern` in ihren Laufstatus, und die
Sicherungsansicht sagt es unter der Zustandszeile. Nicht gelb — es ist eine
Einrichtungsgrenze, kein Fehler; gelb neben einem „lief durch" hiesse, da sei
etwas kaputt. Und nur bei `false`: ein Lauf aus einer älteren Fassung, die das
Feld nicht schreibt, ist kein Befund.

## Erledigt: Scheine serverseitig suchen (08.09.2026)

Der echte Kern der Archiv-Frage von heute. Das Suchfeld in der Scheinliste
filterte den GELADENEN Bestand im Browser — die jüngsten fünfzig. Ein Schein
vom März war damit nicht auffindbar, egal was jemand eintippte, **und das Feld
sagte nichts dazu**: es lieferte einfach kein Ergebnis. Dieselbe Fehlerform
wie beim Buchhaltungs-Export damals, eine leere Antwort, die wie ein Befund
aussieht.

### Was serverseitig geht — und was nicht, samt Begründung in der Ansicht

Firestore kann keine Volltextsuche. Nach einem Kundennamen liesse sich nur mit
einem zusätzlich gepflegten Feld (`nameLower`) suchen, und bis das auf jedem
Altbestand nachgetragen wäre, fände die Suche alte Scheine **stillschweigend**
nicht — genau das Verhalten, das hier beseitigt werden soll. Deshalb die
Trennung, und sie steht in der Oberfläche:

| Begriff | Weg |
| --- | --- |
| `2026-042`, `B-001`, `PR-2026-042` | Baustellennummer, serverseitig und exakt |
| `2026-03-14`, `2026-09`, `09.2026`, `2026` | Zeitraum, serverseitig |
| `Huber`, freier Text | nur im geladenen Bestand — und die Ansicht sagt es und nennt den Ausweg |

Das deckt ab, wonach im Büro tatsächlich gesucht wird, und behauptet für den
Rest nichts.

### Die Entscheidungen, die im Kleingedruckten stecken

**`2026-09` gilt als Monat, nicht als Baustellennummer.** Zweideutig, und
bewusst so entschieden: die Nummernvergabe füllt auf drei Stellen auf
(`2026-042`), eine zweistellige Nummer ist die unwahrscheinlichere Lesart —
und wer sie doch meint, sieht die Scheine des Monats, in dem sie liegt.

**`2026-13` ist kein Monat** und fällt auf die Baustellenlesart durch. Als
Zeitraum gedeutet käme eine Abfrage heraus, die nie etwas findet — und das
sähe aus wie „gibt es nicht".

**Das Serverergebnis wird nicht noch einmal gefiltert.** Sonst fiele ein
Treffer weg, dessen Nummer anders geschrieben ist (`PR-2026-042`) — also
gerade der alte Schein, um den es geht.

**Es gilt für genau den Begriff, mit dem es geholt wurde.** Tippt jemand
weiter, verschwindet es. Stehen zu bleiben hiesse, Scheine unter einem
Suchbegriff zu zeigen, zu dem sie nicht passen.

**Ein Fehler wird gemeldet, nicht als leeres Ergebnis ausgegeben.** Wer sucht,
wartet auf eine Antwort; „nichts gefunden" wäre die falsche, wenn gar nicht
gesucht wurde.

Obergrenze 150 wie bei der tiefen Prüfung, aus demselben Grund (rund 70 KB je
unterschriebenem Schein) — und sie wird angesagt, sobald sie greift.

Geprüft: 10 Rechen-Tests am Suchbegriff, 8 in der Ansicht — und 15 absichtlich
kaputte Fassungen. Eine entwischte zuerst und war ein Fehler in der PROBE,
nicht in den Tests: `setError((e as Error).message)` steht zweimal in der
Datei, und die Mutation traf den Lader statt die Suche. Gezielt wiederholt,
fiel sie auf.

## Nicht gebaut, und das ist eine Rücknahme: Unterschriftsbilder in den Storage

Ich hatte das selbst als grössten verbleibenden Hebel für die Ladezeit
vorgeschlagen. Beim Nachsehen ist es die falsche Idee, und zwar aus genau dem
Grund, der schon die Fotos freiwillig gemacht hat: **Firebase Storage kennt
keine Warteschlange für Offline-Schreibvorgänge**, Firestore schon.

Ein Foto darf deshalb fehlen. **Eine Unterschrift nicht.** Läge sie im
Storage, liesse sich im Keller ohne Empfang kein Schein mehr unterschreiben —
und das ist der Kernfall, für den die Funktion gebaut wurde. Der Vorschlag
hätte den Hauptzweck beschädigt, um eine Liste schneller zu machen.

**Die rettbare Variante**, falls das Gewicht später wirklich drückt: die
Bilder in ein Unterdokument INNERHALB von Firestore verschieben
(`workSheets/{id}/anhang/…`), geschrieben im selben `writeBatch`. Das bleibt
offline-fähig und nimmt die rund 70 KB trotzdem aus jeder Listenabfrage. Es
ändert die Dokumentform, braucht dauerhaft zwei Lesearten für alte und neue
Scheine und rührt an der Prüfsumme — ein eigenes Projekt, kein Nebenbei.

## Erledigt: Zuschlagsstunden im eigenen Zeitkonto (08.09.2026)

Die zweite Hälfte des Zuschlags-Befunds. Nacht und Notdienst gehen seither in
die Lohnausleitung ein — sichtbar waren sie damit aber nur, wenn das Büro eine
CSV zog. Der Mann selbst sah in seinem Zeitkonto nichts davon und konnte nicht
prüfen, ob überhaupt gezählt wird, was er gearbeitet hat.

Jetzt eine Kachel „Zuschlag" neben Saldo und Wochensumme, mit der
Aufschlüsselung im Beipacktext: „Nacht 08:00 · Notdienst 08:00 · 04:00 beides
· letzte 3 Monate".

**Der Wert ist die Vereinigung, nicht die Summe.** Der Rohrbruch um zwei Uhr
früh trägt beide Kennzeichen; addiert stünde er doppelt da, und niemand sähe
der Kachel an, warum sie mehr zeigt, als der Mann gearbeitet hat.

**Gerechnet wird aus den Einträgen, die ohnehin geladen sind** — kein
zusätzliches Feld, keine zweite Abfrage, kein Nachtlauf, und damit nichts, was
auseinanderlaufen kann. Die Kachel gilt für genau das Fenster, das die Liste
zeigt, und das steht im Beipacktext. `calcMonthStats` und die Monatsbilanzen
bleiben unberührt: Saldo, Soll und Ist ändern sich durch diese Erweiterung
nicht.

**Die Kachel bleibt weg, wenn keine Zuschlagsstunden anfielen.** Bei den
allermeisten stünde dort dauerhaft „0:00" und nähme auf dem Telefon die
Breite, die Saldo und Wochensumme brauchen.

## Nachgesehen, nicht gebaut: Archiv für alte Scheine (08.09.2026)

Aus dem Betrieb kam der Vorschlag, Scheine nach einer gewissen Zeit in ein
Archiv rutschen zu lassen, das nur bei einer Suche geladen wird. Der Gedanke
stimmt für viele Systeme, für dieses nicht — und das gehört begründet, statt
es einfach zu bauen.

**Firestore rechnet nach Ergebnisgröße ab, nicht nach Sammlungsgröße.**
`listRecentWorkSheets` trägt `orderBy('createdAt','desc')` und `limit(50)`. Ob
zwanzig oder zwanzigtausend Scheine in der Sammlung liegen, ändert an Kosten
und Tempo nichts: die alten werden schon heute nicht geladen.

Ein Archiv-Kennzeichen brächte also keine Beschleunigung, kostete aber ein
Feld, das jemand pflegen muss, einen zweiten Abfrageweg — und **eine neue Art,
wie ein Schein still aus der Liste verschwindet**. Genau diese Fehlerform
haben wir in „Sichtbare Grenzen" überall herausgenommen.

Es rührt auch nicht an das, was wirklich wiegt: fünfzig Scheine sind 3,5 MB
**wegen der Unterschriftsbilder im Dokument**, und die wiegen gleich viel,
egal wie alt die Sammlung ist.

### Was an dem Vorschlag echt ist

**Die Suche erreicht die alten Scheine nicht.** `WorkSheetsListView` filtert
die geladenen fünfzig im Browser; ein Schein vom März ist nicht auffindbar,
egal was man eintippt. Dieselbe Klasse wie der Buchhaltungs-Export damals. Die
Lösung ist eine serverseitige Suche nach Baustelle, Kunde oder Zeitraum — das
halbe Werkzeug steht mit `listSignedWorkSheetsInRange` bereits.

**Aufbewahrung und Löschung nach Fristablauf** (§ 132 BAO, sieben Jahre) ist
die einzige Form von „Archiv", die sich verteidigen liesse — eine rechtliche
Frage, keine Geschwindigkeitsfrage, und nicht dringend. Zu beachten:
`allow delete: if false` — Scheine lassen sich derzeit bewusst gar nicht
löschen.

## Nachgesehen: Wer sieht welche Scheine? (08.09.2026)

Gefragt, ob ein Monteur nur seine eigenen Scheine sieht. **Nein:**
`firestore.rules` erlaubt `read: if ownsExisting()` — das prüft nur den
Mandanten, nicht den Ersteller —, und die Liste holt ohne Benutzerfilter. Nur
der Nachtrag in der Zeiterfassung ist auf die eigenen begrenzt
(`listOwnWorkSheetsSince`), und zwar aus Gewicht, nicht aus Datenschutz.

Die Unstimmigkeit, die daraus entsteht und die man kennen sollte: seit die
Leistungszeit auf dem Schein steht, kann ein Monteur über einen fremden Schein
sehen, wie lange ein Kollege an dem Tag gearbeitet hat — obwohl ihm dessen
Zeiteintrag verschlossen ist. Der Grund für die Sperre dort sind Kranken- und
Urlaubstage (Art. 9 DSGVO); reine Arbeitsstunden auf einem gemeinsamen Auftrag
sind eine andere Kategorie.

**Bewusst so gelassen.** Das Büro braucht ohnehin alle, ein Monteur muss den
Schein eines Kollegen zur selben Baustelle nachschlagen können, und die
PDF-Ausgabe hängt daran. Eine Einschränkung wäre eine Änderung mit echtem
Risiko für einen Gewinn, der sich nicht benennen lässt.

## Erledigt: Der Zuschlag wurde verrechnet, aber nicht ausgewiesen (08.09.2026)

Beim Suchen nach der nächsten Schwachstelle gefunden, und es ist eine
**Asymmetrie**, kein vergessenes Feature.

`features/invoices/assemble.ts` bildet aus `isNightWork` und `isEmergency`
eigene Rechnungspositionen mit Aufschlag — „Facharbeiterstunden (Notdienst
+50 %, Nachtarbeit +…)". Der Kunde zahlt den Zuschlag also. Die
Lohnausleitung dagegen kannte die beiden Felder **überhaupt nicht**: weder die
Monats-CSV noch die Mitarbeiter-CSV noch der Stundennachweis führten eine
Spalte dafür, und `calcMonthStats` kommt bis heute ohne sie aus.

Der Nacht- und der Notdienstzuschlag sind ein **Anspruch des Arbeitnehmers
nach Kollektivvertrag**. Er kann nur abgerechnet werden, wenn die Stunden in
der Lohnverrechnung als solche ankommen. Eine Ausleitung, die sie verschweigt,
sieht dabei vollständig aus — die Gesamtstunden stimmen ja.

### Was jetzt ausgewiesen wird

- **Monats-CSV**: je Zeile die Spalten `Nacht` und `Notdienst`; je Mitarbeiter
  `Nacht(Std)`, `Notdienst(Std)` und `davon beides(Std)`.
- **Mitarbeiter-CSV**: dieselben Kennzeichen je Zeile, dazu ein Summenblock,
  der **immer** dasteht — auch mit null Stunden. Die Datei wird maschinell
  gelesen, und eine fehlende Spalte bedeutet dort etwas anderes als eine
  leere, nämlich „diese Auswertung kennt das Thema nicht".
- **Stundennachweis (PDF)**: eine schmale Spalte „Zuschlag" mit `N`, `ND` oder
  `N+ND`, und darunter die Summen samt Legende — hier nur, wenn welche
  angefallen sind; auf einem Nachweis ohne Zuschlagsstunden wäre die Zeile
  Zierrat.

### „davon beides" ist keine Zierde

Nacht und Notdienst schliessen einander nicht aus: der Rohrbruch um zwei Uhr
früh ist beides. Wer die zwei Zahlen addiert, zählt diese Stunden doppelt —
und niemand sähe es der Datei an. Die Überschneidung steht deshalb als eigene
Spalte daneben, statt sich auf eine Fussnote zu verlassen.

### Was bewusst nicht passiert

**Gerechnet wird kein Geld.** Die Höhe des Zuschlags steht im
Kollektivvertrag und hängt an Einstufung, Uhrzeit und Anlass; sie hier zu
schätzen hiesse, eine Zahl zu erfinden, die dann in einem Lohnzettel landet.
Ausgewiesen werden die STUNDEN — die Bewertung macht die Lohnverrechnung, die
den Vertrag kennt.

Geprüft: 14 Rechen- und Ausleitungstests, 5 am PDF — und 15 absichtlich
kaputte Fassungen, die alle aufgefallen sind. Ein bestehender Test musste
mitwandern: er zählte die Spalten **vom Ende her** und mass nach jeder
Erweiterung etwas anderes; er sucht sie jetzt über die Kopfzeile.

## Erledigt: Keine Foto-Waisen mehr im Storage (08.09.2026)

Der Entwurf entsteht mit dem ersten Foto, das Bild geht sofort in den Storage
— der **Verweis** darauf entstand aber erst, wenn der Monteur den Entwurf
speicherte. Wer fotografierte und dann das Fenster schloss, hinterliess eine
Datei, auf die kein Dokument zeigt.

Das kostet dauerhaft, und es ist zugleich ein Bild aus einer fremden Wohnung
**ohne Beleg, der seine Aufbewahrung rechtfertigt** — die unangenehmere Hälfte
des Befunds.

Die Liste wird jetzt nach jedem Upload und nach jedem Entfernen sofort ans
Dokument geschrieben (`fotosAmEntwurf`), und zwar mit einer **ausdrücklich
übergebenen** Liste statt aus dem Zustand der Ansicht: React verarbeitet
`setFotos` erst nach dem laufenden Durchlauf, und ein Schreibvorgang von dort
liesse ausgerechnet das eben hochgeladene Bild weg. Dafür führt die Ansicht
einen Spiegel der Liste als `useRef` — derselbe Grund wie bei den selbst
erfassten Zeilen.

Beim Entfernen zuerst das Dokument, dann der Storage: andersherum stünde
zwischendurch ein Eintrag da, der auf eine gelöschte Datei zeigt — und genau
der ginge beim Unterschreiben in die Prüfsumme ein.

Ein gescheiterter Upload wird **nicht** festgeschrieben. `fuerDenSchein` lässt
nur die tatsächlich hochgeladenen durch; ein Verweis auf eine Datei, die es
nicht gibt, wäre schlimmer als kein Verweis.

## Erledigt: Die Bürosicht prüft jetzt so weit zurück, wie das Büro will (08.09.2026)

Nachgezogen an der eigenen Einschränkung von heute Vormittag: „Stunden ohne
Buchung" verglich nur die **geladenen fünfzig** Scheine der Anzeigeliste. Das
stand ehrlich in der Karte, war aber halb — gerade der Schein von vor vier
Monaten ist der teure, und der lag ausserhalb.

Neu: `listSignedWorkSheetsInRange` holt gezielt die unterschriebenen Scheine
eines gewählten Zeitraums (30 Tage, 90 Tage, 1 Jahr), samt Index
`companyId + status + datum`.

**Auf Anforderung, nicht bei jedem Aufruf**, und das ist der springende Punkt:
ein unterschriebener Schein trägt zwei Unterschriftsbilder als PNG im
Dokument, rund 70 KB je Stück. Ein Jahr wären schnell zwanzig Megabyte. Als
bewusster Griff am Bürorechner ist das vertretbar, als stiller Nebeneffekt
beim Öffnen eines Reiters nicht. Die Obergrenze liegt bei 150 Scheinen und
steht sichtbar da, sobald sie erreicht ist — dieselbe Regel wie überall seit
„Sichtbare Grenzen".

Über der Liste steht jedes Mal, **worauf sich das Ergebnis stützt**. Ohne das
hiesse „nichts offen" mal „im letzten Monat" und mal „im letzten Jahr", ohne
dass es jemand unterscheiden könnte.

### Eine Abkehr von der ersten Fassung

Die Karte verschwindet nicht mehr, wenn nichts offen ist. Vorher war sie ein
reiner Befund, und ein leerer Kasten „alles gebucht" wäre Rauschen gewesen.
Jetzt trägt sie eine **Handlung**: weiter zurück prüfen. Verschwände sie bei
null Befunden, gäbe es keinen Weg mehr zu der Prüfung, die den alten Schein
überhaupt erst findet. Ohne Befund bleibt sie knapp.

### Was dabei zur Geschwindigkeit herauskam

Aus dem Betrieb kam die Frage, ob es hilft, überall nur die ersten x Einträge
zu laden und einen Reiter erst beim Aufrufen. **Beides ist längst gebaut:**
jede Ansicht steckt in `lazy(() => import(...))` — 30 Chunks statt einem —,
und jede Liste hat seit „Sichtbare Grenzen" eine Obergrenze, die sie auch
ansagt.

Der verbleibende Hebel ist nicht die ANZAHL, sondern das GEWICHT: die
Unterschriftsbilder liegen als PNG im Firestore-Dokument. Sie in den Storage
zu verlagern und nur die Adresse zu speichern, machte die Scheinlisten um
Faktor 30 leichter — greift aber in einen eingefrorenen Beleg samt Prüfsumme
ein und ist deshalb nichts, was nebenbei mitläuft. Steht als Vorschlag, nicht
als Plan.

## Erledigt: Stunden ohne Buchung — die Bürosicht (08.09.2026)

Nachgereicht zur Leistungszeit: die Lücke, die dort ausdrücklich offen stand.

### Die Kollegenzeile hat niemanden, der an sie erinnert wird

Der Nachtrag in der Zeiterfassung deckt nur die **eigenen** Zeilen des
Monteurs ab. Das ist keine Nachlässigkeit, sondern eine Grenze, die bleiben
muss: in `timeEntries` stehen Kranken- und Urlaubstage, also Gesundheitsdaten
nach Art. 9 DSGVO. Die Firestore-Regel lässt einen Monteur deshalb nur an die
eigenen Einträge (`resource.data.userId == request.auth.uid || isBuchOrTop()`),
und das ist richtig so.

Trägt er auf dem Schein die Zeile „Kollege Huber, 07:00–15:30" ein, sieht die
danach niemand wieder: **er** sieht fremde Buchungen nicht, **Huber** sieht den
Schein nicht, den ein anderer geschrieben hat. Die Stunde steht unterschrieben
beim Kunden — und wird nie gebucht. Also nie verrechnet (die Rechnung nimmt
ihre Stunden aus den Zeiteinträgen, der Schein liefert nur das Material) und
nie aufgezeichnet (§ 26 AZG: dort stünde ein Tag, an dem der Mann
nachweislich beim Kunden war und laut Aufzeichnung nicht gearbeitet hat).

### Die Liste steht dort, wo jemand sie abarbeiten kann

In den **Handwerksscheinen**, über der Liste, und nur für `canEditTime`
(Buchhaltung, Geschäftsführung, Administrator) — genau die Rolle, die fremde
Zeiteinträge lesen **und** anlegen darf. Für alle anderen wird die Abfrage gar
nicht erst abgeschickt: sie bliebe an den Regeln hängen und hinterliesse nur
einen Fehler in einer Ansicht, die sie sonst benutzen können.

Verglichen wird je **Person und Tag**, nicht je Schein: auf einem Schein kann
die Zeile des Monteurs gebucht sein und die des Kollegen nicht — und das ist
der häufige Fall.

### Zwei Befunde, die nicht dasselbe sind

- **Keine Buchung gefunden** — an diesem Tag ist für diese Person gar keine
  Anwesenheit erfasst. Die Stunden fehlen vollständig. Nur diese zählen in die
  Summe „steht unterschrieben beim Kunden und in keiner Zeiterfassung".
- **Auf eine andere Baustelle gebucht** — es gibt eine Buchung, sie hängt am
  falschen Auftrag. Die Arbeitszeit ist aufgezeichnet, falsch ist nur die
  Zuordnung; die entscheidet aber, wem die Stunde verrechnet wird. Das kommt
  regelmässig vor, wenn jemand den ganzen Tag auf die Hauptbaustelle bucht.

Beides in eine Zahl zu werfen machte die Summe unbrauchbar.

### Was bewusst nicht geprüft wird

**Die Minuten.** Sie dürfen abweichen: der Schein bestätigt die Zeit beim
Kunden, der Eintrag umfasst den Arbeitstag samt Anfahrt. Ein Wächter, der jede
Abweichung meldet, schlüge ständig zu Recht an — und wäre nach einer Woche
weggeklickt.

**Urlaub und Krankenstand** gelten nicht als Buchung. Steht der Mann laut
Schein beim Kunden und laut Zeiterfassung im Urlaub, ist die Arbeitszeit ebenso
wenig aufgezeichnet; der Widerspruch gehört gesehen, nicht überdeckt.

### Die eine Grenze, die offen benannt ist

Der Schein trägt den Namen als **Text**, wie ihn der Monteur auf der Baustelle
tippt; der Zeiteintrag trägt ihn aus dem Benutzerkonto. Gross- und
Kleinschreibung und doppelte Leerzeichen werden ausgeglichen — „F. Huber"
findet „Franz Huber" aber nicht. Geraten wird hier nicht. Die Ansicht sagt
deshalb **„keine Buchung gefunden"**, nicht „nicht gebucht".

Nach unten zwei Tage Karenz (gebucht wird am Ende des Arbeitstags, oft erst am
Morgen darauf), nach oben **keine** Grenze — anders als beim Nachtrag des
Monteurs. Der soll an das erinnert werden, was er noch weiss; das Büro muss
auch den Schein von vor drei Monaten finden, denn genau der ist der teure.

Geprüft: 15 Rechen-Tests, 7 in der Ansicht — und 18 absichtlich kaputte
Fassungen, die alle aufgefallen sind.

## Erledigt: Fotobereich am Schein neu geordnet (08.09.2026)

Aus dem Betrieb, nach dem ersten Blick auf die neue Fotofunktion: „der Bereich
für die Fotos in der Schein-Erstellung sieht optisch gar nicht gut aus."

Er sass im Kopf der Karte **Unterschriften**, unmittelbar über „Monteur (Name
in Druckbuchstaben)": ein unterstrichener Link in Akzentfarbe und darunter drei
Zeilen graues Kleingedrucktes. Beides las sich wie eine **Fehlermeldung zu
genau diesem Feld** — und das ausgerechnet an der Stelle, an der ein Kunde
gerade unterschreiben soll.

Jetzt: eine **eigene Karte** mit Zähler im Titel („Fotos (2/8)"), ein echter
Knopf statt des Links, dessen Beschriftung dem Stand folgt („Foto aufnehmen" /
„Weiteres Foto" / „Höchstens 8 Fotos"), ein Satz sichtbarer Text — und der
ganze Rest im „i": wozu Bilder gut sind, dass sie am Gerät auf 1600 px
verkleinert werden, dass sie über ihren Inhalts-Hash in die Prüfsumme eingehen
und deshalb nach dem Unterschreiben unveränderlich sind, dass Storage ohne Netz
nichts vorhält, und was man nicht fotografieren soll.

Ein Test hält die Trennung fest: im Abschnitt der Unterschriften darf kein
Dateifeld mehr vorkommen. Sonst fällt das beim nächsten Umbau still zurück.

## Erledigt: Was nach Jahren passiert (08.09.2026)

Aus dem Betrieb kam die Frage, ob die App mit den Jahren langsamer wird und ob
der Offline-Speicher daran schuld ist. Beim Nachsehen kam etwas Dringenderes
heraus als Geschwindigkeit.

### Serverseitig wird nichts langsamer

Die Antwortzeit von Firestore hängt an der ERGEBNISgrösse, nicht an der
Sammlungsgrösse. „Die letzten fünfzig Rechnungen" ist bei hunderttausend
genauso schnell wie bei hundert — solange ein Index da ist. Deshalb gibt es
den Index-Abgleich als Test, und deshalb ist Archivieren hier keine Antwort,
sondern SQL-Denken.

### Was tatsächlich wächst: der lokale Zwischenspeicher

Ohne lokale Indizes durchsucht das SDK bei jeder Abfrage den
zwischengespeicherten Bestand der Sammlung, und der wächst mit jedem Monat.
Das ist die Bremse, die man für „zu viel Offline-Speicher" hält.

Die naheliegende Antwort — den Speicher kleiner machen — wäre die falsche:
sie nähme dem Monteur im Keller die Daten weg und liesse die Abfrage trotzdem
suchen. Die richtige ist, das Suchen überflüssig zu machen. Eine Zeile:
`enablePersistentCacheIndexAutoCreation`. Welche Indizes entstehen, entscheidet
das SDK anhand der Abfragen, die tatsächlich laufen — eine von Hand gepflegte
Liste wäre eine zweite Wahrheit neben `firestore.indexes.json`.

**Der Offline-Speicher bleibt.** Er ist nicht der Grund für lange Ladezeiten;
ohne ihn wäre jeder Wechsel zwischen zwei Ansichten wieder ein Netzweg, und im
Keller, im Rohbau und in der Tiefgarage stünde eine leere App. Für einen
Installateur ist fehlender Empfang kein Randfall, sondern der Arbeitsplatz.

### Das eigentliche Problem war kein Geschwindigkeitsproblem

**Jede Liste hatte eine Obergrenze, und keine einzige sagte, wenn sie erreicht
war.** Der 501. Kunde existierte für die App schlicht nicht — nicht in der
Kundenliste, nicht im Rechnungsformular, nicht bei den Wartungen. Und nichts
sagte es.

Am teuersten war es beim **Buchhaltungs-Export**: er filterte die geladene
Rechnungsliste nach Datum, und die reicht voreingestellt fünfzig Rechnungen
zurück. Ein Export für einen älteren Monat lieferte damit eine LEERE Datei —
eine, die wie ein erfolgreicher Export aussah, mit „0 Rechnungen" und ohne
einen Hinweis. Schlimmer noch meldete die Lückenprüfung im Nummernkreis
Lücken, die keine sind, weil die fehlenden Nummern nicht geladen waren. Ein
Befund, den es nicht gibt, kostet in einer Kanzlei einen halben Tag.

Dasselbe traf **Mahnlauf** und **unverrechnete Leistung**: beide rechneten über
die Arbeitsliste, die nach Anlagedatum abschneidet — und sahen damit
ausgerechnet die ältesten Forderungen nicht. Die fallen als erste heraus.

**Drei Regeln, in dieser Reihenfolge, und sie gelten überall:**

1. **Jede Liste ist eine Arbeitsliste, kein Archiv.** Begrenzt wird nach
   Zustand oder Zeitraum, nicht nach Stückzahl. Eine Grenze von 500 ist
   willkürlich und läuft irgendwann über; „was offen ist" läuft nie über.
2. **Wo eine Grenze bleibt, muss sie sichtbar sein.** Dafür gibt es jetzt
   `components/Nachladen` — „200 von möglicherweise mehr geladen. Die Suche
   geht nur über diese." Der zweite Satz ist der wichtigere: ohne ihn sucht
   jemand einen alten Kunden, findet nichts und schliesst daraus, es gebe ihn
   nicht.
3. **Auswertungen rechnen nicht über das, was zufällig geladen ist,** sondern
   holen ihren Zeitraum selbst.

Angewandt auf: Kunden (500 → 200 mit Nachladen), Wartungen (dito),
Handwerksscheine (100 → 50 — jeder wiegt rund 70 KB wegen der beiden
Unterschriftsbilder), Buchhaltungs-Export, Mahnlauf, unverrechnete Leistung.

> **Der Abfragegrenzen-Test hat sofort angeschlagen**, als die neue
> Zeitraum-Abfrage dazukam — zu Recht: er kannte `invoiceDate` noch nicht.
> Und der Index-Abgleich verlangte den passenden Index, bevor die Abfrage in
> Produktion mit „The query requires an index" gescheitert wäre. Beide Tests
> haben genau das getan, wofür sie gebaut wurden.

### Was NICHT umgesetzt wurde, und warum

Die serverseitige Präfix-Suche für Kunden, Baustellen und Wartungen. Sie
bräuchte ein normalisiertes Feld (`nameLower`) auf JEDEM Datensatz, auch auf
allen bestehenden — Firestore kann nicht ohne Rücksicht auf Gross- und
Kleinschreibung suchen. Bis zur Nachbefüllung fände die Suche die alten
Kunden NICHT.

Das wäre genau der stille Ausfall, den diese Änderung gerade beseitigt, nur an
einer neuen Stelle. Mit dem sichtbaren Nachladen ist die Gefahr weg; wer einen
alten Kunden sucht und nicht findet, liest jetzt, dass die Liste an ihrer
Grenze steht. **Wieder aufgreifen, wenn ein Betrieb über etwa tausend Kunden
kommt** — dann lohnt die Nachbefüllung, und sie gehört mit einem sichtbaren
Fortschritt und einer Prüfung „wie viele haben das Feld noch nicht" gebaut.

## Erledigt: Handwerksschein Stufe 2 und 4 (08.09.2026)

### Stufe 2 — Fotos, und zwar freiwillig

Der Schein sagt, was gemacht wurde; das Foto sagt, wie es aussah. Bei einem
Wasserschaden im Keller, einer verkalkten Therme oder einer Leitung, die
hinter der Wand anders lag als geplant, ist das Bild das einzige, was sich
später nicht wegdiskutieren lässt.

**Sie sind freiwillig, und das ist eine Entscheidung, keine Sparsamkeit.**
Firestore hält einen Schreibvorgang offline vor und schickt ihn nach; Firebase
Storage tut das NICHT. Wäre auch nur ein Foto Bedingung, hinge der ganze Beleg
an einem Balken Empfang — und der Monteur stünde mit einem Kunden vor sich da,
der unterschreiben will.

Was die App stattdessen tut: sie sagt VOR dem Unterschreiben, wenn ein Bild
noch nicht oben ist. Das Bild bleibt im Formular liegen, mit einem Knopf zum
Nachreichen; erst der zweite Griff auf „Unterschreiben" geht ohne es hinaus.
Ein Bild, das dabei still verschwindet, wäre die schlechteste aller Antworten.

**Die Beweiskraft hängt an einem Umweg.** Die Prüfsumme des Scheins sieht nur
Firestore, nicht die Bilddatei im Storage. Ohne Gegenmassnahme liesse sich das
Bild nach der Unterschrift austauschen, ohne dass irgendetwas auffiele — der
Beleg wäre genau dort löcherig, wo er beweisen soll. Deshalb bildet der Client
beim Hochladen einen **Inhalts-Hash**, der im Schein steht und in die
Prüfsumme eingeht. Er ist zugleich der Dateiname: dasselbe Bild landet damit
immer am selben Ort, und ein wiederholter Upload nach einem Abbruch schreibt
dorthin, wo der erste hinwollte, statt eine halbe Leiche zurückzulassen.

Weiteres, das dazugehört:

- **Verkleinert wird am Gerät** — längere Kante 1600 Bildpunkte, JPEG 0,72.
  Aus vier Megabyte werden ein paar hundert Kilobyte. Das Original hochzuladen
  wäre auf einer Baustelle mit halbem Balken keine Übertragung, sondern ein
  Abbruch. Die EXIF-Drehung wird dabei berücksichtigt, sonst läge jedes
  iPhone-Hochformat im Beleg auf der Seite.
- **Das Storage-SDK wird erst beim ersten Foto geladen.** Es ist ein eigenes
  Bündel; die meisten Aufrufe dieser App kommen nie in die Nähe eines Fotos.
- **Höchstens acht je Schein.** Nicht aus technischer Not — ein Beleg mit
  dreissig Bildern hilft niemandem.
- **Storage-Regeln** neu: nur der eigene Mandant, nur Bilder, höchstens 2 MB,
  alles andere zu. Überschreiben ist erlaubt, damit ein abgebrochener Upload
  wiederholbar bleibt; der Schutz gegen das Austauschen sitzt im Hash.
- **Im PDF stehen die Fotos nicht.** Eingebettet wüchse es um ein bis zwei
  Megabyte je Bild — und erzeugt wird es auf dem Gerät des Monteurs, um dort
  geteilt zu werden. Ein Beleg, der sich nicht verschicken lässt, ist kein
  Beleg. Er nennt stattdessen ihre Zahl; die Bilder stehen in der Scheinliste,
  mit dem Hash daneben.

> **Eine Regel musste dabei nachgezogen werden.** `nurStorno()` vergleicht die
> Felder, die sich beim Stornieren NICHT ändern dürfen. Die Fotoliste gehörte
> dazu, sonst liesse sich der Nachweis beim Storno stillschweigend
> umschreiben. Dabei fiel eine ältere Schwäche auf: die Regel las `notizen`
> und `unterschriften` direkt, und ein Zugriff auf ein FEHLENDES Feld bricht
> in Firestore-Regeln ab — ein unterschriebener Schein ohne Notiz liess sich
> also nie stornieren, ohne dass irgendetwas gesagt hätte, warum. Jetzt steht
> überall `get` mit Standardwert.

### Stufe 4 — was noch auf keiner Rechnung steht

Die Verbindung zur Rechnung war zur Hälfte schon da: die Rechnung merkt sich,
welche Scheine sie verbraucht hat. Gelesen wurde das nur, um beim
Zusammenstellen der nächsten nichts doppelt zu verrechnen.

**Die Umkehrung fehlte, und sie ist die betrieblich wichtigere.** Niemand
konnte sagen, welche unterschriebene Leistung noch auf keiner Rechnung steht.
Das ist kein Buchhaltungsfehler, den man später sieht — es ist Geld, das
schlicht nie eingefordert wird, und im Handwerk der klassische Weg, wie ein
gut ausgelasteter Betrieb trotzdem knapp bei Kasse ist.

Jetzt steht das in den Rechnungen als eigene Karte, älteste zuerst, mit einem
Knopf, der die Baustelle oben auswählt. Von Hand abzutippen war genau die
Reibung, die dazu führt, dass es liegen bleibt.

**Erst ab vier Wochen.** Ein Schein von vorgestern gehört nicht gemeldet —
zwischen Einsatz und Rechnung liegt regelmässig ein Monatsabschluss, und eine
Liste, die das anmahnt, sieht sich nach zwei Wochen niemand mehr an.

**Ein Storno gibt die Scheine wieder frei.** Wer eine Rechnung storniert,
nimmt die Forderung zurück; die Leistung steht dann wieder offen. Zählte der
Storno als Verrechnung, verschwände genau die Arbeit aus der Liste, die am
ehesten vergessen wird.

### Stufe 3 bleibt offen, und der Grund gehört genannt

Der automatische Versand braucht einen Mailanbieter, ein hinterlegtes Konto
und ein Geheimnis in der Function — Dinge, die nur der Betrieb selbst
einrichten kann. **Der Fallback steht seit Stufe 1 und trägt den Alltag
ohnehin besser:** das PDF wird vom Gerät aus geteilt, per Mail oder Messenger,
ohne dass eine Adresse hinterlegt sein muss. Genau daran scheitert
automatischer Versand in der Praxis — die Adresse hat vor Ort niemand zur
Hand.

Was ein automatischer Versand zusätzlich brächte, ist der Nachweis, DASS und
WANN verschickt wurde. Das ist ein echter Gewinn und der Grund, warum die
Stufe im Fahrplan bleibt; ohne Zugangsdaten ist sie von hier aus aber nicht zu
bauen, und eine halbe Fassung mit einem erfundenen Absender wäre schlimmer als
keine.

Geprüft: 20 Rechen-Tests zu den Fotos, 9 zur unverrechneten Leistung, 9 in der
Scheinansicht, 4 in der Scheinliste, 6 in den Rechnungen, 3 gegen den
Emulator — und 26 absichtlich kaputte Fassungen, die alle aufgefallen sind.

## Erledigt: Zwei Lücken, die die Übersicht selbst benannt hat (07.09.2026)

In der Funktionsübersicht standen sie seit Monaten als offen: **Nebenläufigkeit**
und **die echten Firestore-Indizes im Function-Pfad**. Beide sind jetzt
geschlossen — die eine ganz, die andere dort, wo sie am teuersten war.

### Der Lagerabzug gegen eine echte Transaktion

Der Abzug lief schon immer in einer Firestore-Transaktion, geprüft war er nur
gegen einen Ersatz-Firestore. Der kann eine Transaktion nachbauen, aber nicht
das, wofür sie da ist: dass zwei gleichzeitige Zugriffe sich nicht in die
Quere kommen.

Der Fall ist keine Theorie. Verwaltung und Projektleitung arbeiten dieselbe
Anforderungsliste ab, oft am selben Vormittag. Klicken beide „Erledigt", ginge
der Bestand ohne Absicherung zweimal herunter — und **niemandem fiele es auf**,
weil beide Klicks Erfolg melden.

Sieben Durchstiche gegen den Emulator: Abzug, zweimal nacheinander, zweimal
gleichzeitig, Stopp bei null statt Minus, kein Abzug bei „Abholbereit",
Retoure in neuem Zustand zurückgebucht, beschädigte Ware nicht.

> **Der gleichzeitige Fall verdient seinen eigenen Test.** Ersetzt man die
> Transaktion durch ein schlichtes Lesen-dann-Schreiben, bleibt „zweimal
> nacheinander" grün — das `processed`-Flag steht beim zweiten Klick ja schon.
> Nur der gleichzeitige fällt durch. Das habe ich ausprobiert, nicht
> angenommen.

### Der Index-Abgleich liest jetzt auch die Cloud Functions

Er sah bisher nur `src/lib/db`. Die Functions fragen Firestore genauso ab, mit
dem Admin-SDK und derselben Indexpflicht — und ihr Ausfall ist der stillere:
eine Function scheitert ins Protokoll, das niemand liest, und die Bilanzen
blieben stehen. Der Emulator hilft nicht, er legt Indizes bei Bedarf selbst an.

**Dabei ist eine Regel korrigiert worden, und das ist die eigentliche
Geschichte.** Der Abgleich verlangte einen zusammengesetzten Index, sobald
eine Abfrage mehr als ein Feld einschränkt. Für `lib/db` fiel das nie auf,
weil dort ohnehin überall einer steht. Auf die Functions angewandt meldete er
sofort zwei Abfragen als indexlos — `users` auf `companyId + uid` und
`companyId + role`. Beide laufen einwandfrei: Firestore bedient mehrere
GLEICHHEITSfilter aus den Einzelfeld-Indizes, die es für jedes Feld ohnehin
anlegt.

Die bequeme Antwort wäre gewesen, die zwei Indizes anzulegen und weiterzugehen.
Sie kosteten dann bei jedem Schreibvorgang in `users` Leistung, für nichts —
und der Test nebenan warnt ausdrücklich vor Indizes auf Vorrat. Also zählt
jetzt, was über Gleichheit hinausgeht: Bereich, `array-contains`, Sortierung.
Zwei Tests halten beide Seiten der Regel fest, damit die Lockerung nicht beim
nächsten Mal weiter gelockert wird.

> Die Gegenprobe hat mir dabei noch eine Lücke gezeigt: eine Fassung, die
> Bereichsoperatoren nicht mehr beachtet, rutschte zunächst durch — kein Test
> verlangte, dass die Abfrage des Bilanzlaufs indexpflichtig IST. Jetzt tut es
> einer.

### Nebenbei gefunden, bewusst nicht behoben

Zwei Indizes, die keine Abfrage mehr braucht: `invoices: companyId +
invoiceNumber` und `materials: companyId + name`. Sie kosten Schreibleistung.
Entfernt sind sie nicht — einen Index zu löschen wirkt sofort in Produktion,
und greift doch etwas darauf zu, das der Abgleich nicht sieht, steht die
Ansicht leer da. Das gehört mit Blick auf die echte Datenbank entschieden.

### Was offen bleibt

Der Beweis, dass die nächtlichen Auslöser in Produktion tatsächlich feuern.
Dafür gibt es seit Ü1 die Überwachung — sie MELDET einen ausgefallenen Lauf,
aber kein Test sichert vorher zu, dass er läuft. Ein Cloud-Scheduler-Eintrag
lässt sich von hier aus nicht prüfen, nur beobachten.

## Erledigt: Der Mahnlauf (07.09.2026)

Das Mahnen gab es schon — als Menüpunkt an der einzelnen Rechnung. Die Stufen
stimmten, die Belege stimmten. **Nur kam niemand dorthin.**

Wer wissen wollte, was zu mahnen ist, filterte die Rechnungsliste auf
„Überfällig", ging sie von oben nach unten durch, öffnete an jeder Zeile das
Menü und prüfte im Kopf, ob die dritte Mahnung schon draussen war. Genau daran
bleibt Mahnwesen in kleinen Betrieben liegen: nicht das Schreiben ist die
Arbeit, das ZUSAMMENSTELLEN ist es — und das lässt sich immer verschieben.

Jetzt steht über der Rechnungsliste eine Karte mit dem, was heute gemahnt
werden kann, samt Summe und den Mahnspesen, die der Lauf verrechnen würde.
Der Knopf in der Zeile öffnet denselben Dialog wie bisher.

**Die Reihenfolge ist die Aussage**, und sie ist nicht die der Rechnungsliste
darunter: oben steht, was am weitesten fortgeschritten ist. Eine Forderung vor
der letzten Mahnung ist dringender als eine, die gerade erst die Frist
überschritten hat. Bei gleicher Stufe entscheidet das Alter, dann der Betrag.

**Was der Lauf NICHT tut:** er verschickt nichts von selbst. Jede Mahnung
bleibt ein bewusster Griff, weil hinter jeder ein Kunde steht, den der Chef
vielleicht gerade am Telefon hatte. Der Lauf nimmt das Suchen ab, nicht die
Entscheidung. Auch ein Stapel-PDF gibt es nicht: zwölf gleichzeitige
Downloads sind im Browser keine Erleichterung.

**Nach der dritten Mahnung hört die App auf.** Diese Forderungen stehen
getrennt als „braucht eine Entscheidung" da, mit Nummer und Kundennamen.
Fielen sie stillschweigend aus dem Lauf, wären ausgerechnet die ältesten
Forderungen die unsichtbarsten. Was folgt — Anwalt, Inkasso oder abschreiben —
entscheidet ein Mensch.

**Verzugszinsen stehen weiterhin auf keiner Mahnung.** Der gesetzliche Satz
hängt zwischen Unternehmern am Basiszinssatz (§ 456 UGB) und ändert sich
halbjährlich; eine hinterlegte Zahl veraltete still und stünde danach auf
jedem Schreiben falsch. Eine falsch gerechnete Zinsforderung ist schlechter
als keine.

Die Karte erscheint nur, wenn es etwas zu tun gibt — eine dauerhaft sichtbare
leere Mahnliste wäre ein Vorwurf ohne Anlass.

Geprüft: 12 Rechen-Tests, 7 in der Ansicht — und 12 absichtlich kaputte
Fassungen, die alle aufgefallen sind.

## Erledigt: Aus der fälligen Wartung wird eine Baustelle (07.09.2026)

Die Wartungsliste sagte, was fällig ist — und hörte dort auf. Alles Weitere
lief von Hand: Baustelle anlegen, Kundennamen abtippen, Adresse abtippen,
einplanen, und nach getaner Arbeit die Projektnummer in den Erledigt-Dialog
zurücktippen. Vier Wege durch die App für einen Vorgang, der aus der Liste
heraus einer sein sollte.

**Schlimmer als die Tipparbeit war, dass die Liste den Fortschritt nicht
kannte.** Wer sie am Montag durchgeht und drei Baustellen anlegt, sieht am
Dienstag dieselben drei Zeilen im selben Rot: „fällig" hiess sowohl „noch
nichts passiert" als auch „steht längst im Einsatzplan". Beim zweiten
Durchgang entsteht die Baustelle ein zweites Mal.

Jetzt steht an jeder anstehenden Wartung ein Knopf. Die Baustelle entsteht mit
Kunde, Standort und der Anlage in der Beschreibung, die Wartung merkt sie sich
als `offeneBaustelle` und zeigt sie als eingeplant an — mit Verweis auf die
Baustelle. Beim Eintragen der erledigten Wartung wandert der Wert nach
`letzteBaustelle` und wird geleert, in EINEM Schreibvorgang: sonst zeigte die
Liste die Wartung bis zum nächsten Termin als eingeplant, obwohl der Einsatz
vorbei ist.

**Die Anlagenadresse gewinnt immer.** Eine Hausverwaltung hat eine
Rechnungsadresse und zwanzig Heizungen an zwanzig anderen; gewönne die
Kundenadresse, führe der Monteur ins Büro der Verwaltung.

**Die Projektnummer ist ein Vorschlag, kein Zähler** — und das ist ein
bewusster Unterschied zur Rechnung. Rechnungsnummern kommen aus `counters`,
weil eine Lücke dort ein Mangel der Buchhaltung ist (§ 11 UStG).
Projektnummern vergibt der Betrieb frei; in manchen hängt die Nummer am
Auftrag des Kunden. Ein Zähler würde diese Freiheit stillschweigend
abschaffen. Weil es keiner ist, kann der Vorschlag doppelt sein — deshalb wird
beim Speichern noch einmal geprüft, ob die Nummer frei ist. Zwei Baustellen
mit derselben Nummer wären der teuerste Fehler dieser Kette: Zeiten, Scheine
und Rechnungen hängen an der Nummer, nicht an der Dokument-ID.

**Was NICHT passiert, und das gehört gesagt:** es wird niemand eingeteilt und
niemand angerufen. Der Termin mit dem Kunden ist ein Gespräch, kein
Datenbankfeld. Die Abrechnungsart bleibt ebenfalls offen — was im
Wartungsvertrag steht, weiss diese App nicht, und eine Vorbelegung stünde auf
jedem Handwerksschein dieser Baustelle.

Geprüft: 15 Rechen-Tests, 13 in der Ansicht, 1 auf der Nutzlast — und 15
absichtlich kaputte Fassungen, die alle aufgefallen sind. Eine davon fiel
zunächst nicht auf (die eingeplante Baustelle blieb nach dem Erledigen
stehen), weil der Mutationslauf die Datei mit dem passenden Test gar nicht
mitlaufen liess; das war ein Fehler im Prüflauf, nicht im Test.

## Erledigt: Material in der Nachkalkulation (07.09.2026)

Die Nachkalkulation rechnete Erlös minus Personalkosten. Material kam darin
nicht vor — bei einem Installateur schnell die Hälfte der Rechnungssumme. Der
ausgewiesene Deckungsbeitrag war damit systematisch zu hoch, und zwar in der
teuersten Richtung: eine Baustelle sah tragfähig aus, die es nicht war. Dass
es als Einschränkung darunterstand, machte die Zahl nicht richtig.

**Die Mengen kommen aus den UNTERSCHRIEBENEN Handwerksscheinen** — das ist,
was nachweislich verbaut wurde, vom Kunden bestätigt. Die Materialanforderung
wäre die falsche Quelle: sie sagt, was bestellt wurde, nicht was auf dieser
Baustelle geblieben ist. Gezählt werden alle Scheine der Baustelle, auch die
schon verrechneten — für die Frage „hat sie etwas verdient" zählt alles
Verbaute, unabhängig davon, auf welcher Rechnung es gelandet ist.

**Die Preise kommen aus einem neuen Feld `einkaufspreis` im Materialstamm.**
Der Verkaufspreis daneben bestimmt den Erlös, dieser die Kosten; wer beide
verwechselt, bekommt für jedes Material einen Deckungsbeitrag von null und
hält ihn für ein Ergebnis — dieselbe Falle wie beim Stundensatz.

**Setzen darf ihn nur die Geschäftsführung**, obwohl den Katalog sonst die
Verwaltung pflegt. Er ist Margendaten; die Grenze läuft deshalb zwischen den
FELDERN, nicht zwischen den Rollen, und steht hart in `firestore.rules`. Was
sie NICHT kann, und das gehört gesagt: das Lesen verhindern. Firestore gibt
ein Dokument ganz oder gar nicht heraus, und den Katalog muss jeder im Betrieb
lesen dürfen — der Monteur fordert daraus an. Geschützt ist das Ändern.

**Fehlt ein Einkaufspreis, wird nichts geschätzt.** Der Artikel wird beim
Namen genannt, fliesst nicht in die Kosten ein, und die Ampel bleibt gelb,
auch bei fetter Marge. Ein angenommener Preis wäre eine erfundene Zahl in
einer Auswertung, auf der jemand Preisentscheidungen trifft — und sie wäre
nicht als erfunden erkennbar. Ein zu hoher Deckungsbeitrag, der SAGT, dass ihm
etwas fehlt, ist besser als ein falscher, der schweigt.

Im Bestand ist das der Regelfall: Verkaufspreise sind gepflegt,
Einkaufspreise noch nirgends. Die Ansicht sagt das dann Baustelle für
Baustelle, statt still zu tun, als sei kein Material verbaut worden.

Geprüft: 14 Rechen-Tests, 13 in der Ansicht, 5 im Katalogformular, 15 gegen
den Emulator — und 19 absichtlich kaputte Fassungen, die alle aufgefallen
sind. Zwei davon fielen beim ersten Anlauf NICHT auf (Verkaufs- statt
Einkaufspreis; die Projektleitung legt Material mit Einkaufspreis an); erst
diese beiden Tests fehlten, nicht die Prüfungen.

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

**Stufe 2 — Fotos. ERLEDIGT am 08.09.2026**, siehe oben. Storage eingerichtet,
eigene Rules, Komprimierung am Gerät, Inhalts-Hash in der Prüfsumme. Der
Offline-Upload ist NICHT gebaut und wird es auch nicht: Storage kennt keine
Warteschlange, und eine selbstgebaute wäre ein Subsystem für einen Zweck, den
die Freiwilligkeit besser löst. Die Fotos sind optional, und wenn eines nicht
hochgeht, sagt die App es vor dem Unterschreiben.

**Stufe 3 — automatischer Versand.** Mailanbieter, Function, Secrets. Dazu ein
Fallback, weil der Kunde oft keine E-Mail-Adresse dabeihat: PDF direkt teilen
oder QR-Code. Ans Büro geht es immer.

**Stufe 4 — Verbindung zur Rechnung. ERLEDIGT am 08.09.2026**, siehe oben. Die
Rechnung verwies schon immer auf die verbrauchten Scheine; neu ist die
Umkehrung — welche unterschriebene Leistung noch auf KEINER Rechnung steht.
Das ist die Hälfte, an der im Handwerk das Geld hängen bleibt.

## Erledigt: der Resturlaub stimmt ab dem ersten Tag (15.09.2026)

**Gemeldet als Frage, gefunden als Fehler.** Der Resturlaub wurde gerechnet
als „Jahresanspruch minus Urlaubstage, die IN DER APP stehen". Vor dem
Startdatum gibt es dort keine.

Ein Betrieb steigt im September um, Petra hat von ihren 25 Tagen schon 18
genommen — die App zeigte ihr **25 Tage Resturlaub**. Dieselbe Zahl sah der
Genehmigende, und dieselbe Zahl stand in der Lohn-CSV der Buchhaltung. Eine
falsche Auskunft an drei Stellen gleichzeitig.

Beim Überstundensaldo war dieselbe Frage von Anfang an beantwortet
(`initial_overtime`). Beim Urlaub wurde sie übersehen.

### Was jetzt gilt

`users.initial_vacation_days` — **Resturlaub am Startdatum**, also die Zahl,
die im Büro ohnehin auf der Liste steht. Daraus:

| | |
| --- | --- |
| Im Jahr des Startdatums | Anspruch = Anfangsbestand, gezählt wird ab dem Startdatum |
| In jedem anderen Jahr | Anspruch = Jahresanspruch, gezählt wird das ganze Jahr |
| Ohne Angabe | genau wie vorher — voller Jahresanspruch |

**Nur ab dem Startdatum gezählt**, weil der Anfangsbestand alles davor schon
abdeckt: ein nachgetragener Urlaubstag von vorher wäre sonst zweimal weg.

**`null` ist nicht `0`.** „Nicht angegeben" heisst voller Jahresanspruch,
„null Tage" heisst aufgebraucht. Die erste Fassung der Prüfzeile verwechselte
beides — `Number(null)` ist `0` und damit endlich —, und jeder Betrieb ohne
ausgefülltes Feld hätte im Umstiegsjahr überall einen Anspruch von 0 gesehen.
Gefunden hat das die Prüfung, nicht der Kopf.

### Eine Regel, zwei Quellen

`urlaubsStand` in `lib/time.ts` ist die einzige Stelle. Die Mitarbeiteransicht
zählt **genehmigte Anträge**, die Buchhaltung zählt **Urlaubstage in der
Zeiterfassung** — zwei verschiedene Fragen, die getrennt bleiben. Die Regel
darüber ist eine; stünde sie zweimal, sagten die beiden Ansichten nach der
ersten Änderung verschiedene Zahlen.

Nebenbei: `lib/time.ts` liest die Vorgabe von 25 Tagen jetzt aus
`benutzerVorgaben.ts`, statt sie zweimal als nackte Zahl zu führen. Dort stand
dazu bisher nur ein Satz, dass die beiden übereinstimmen MÜSSEN.

### Der Übertrag — nachgereicht am 15.09.2026

Stand hier zuerst als „nicht gebaut". Der Resturlaub sprang am 1. Jänner auf
den vollen Jahresanspruch zurück; was übrig war, verschwand. In Österreich
verfällt nicht verbrauchter Urlaub aber nicht am Jahresende — er verjährt
erst zwei Jahre nach dem Jahr, in dem er entstand (§ 4 Abs 5 UrlG). Diese
Lücke traf jeden 1. Jänner.

**Der Betrieb stellt die Regel ein** (`companies.urlaub_uebertrag`), und zwar
die Geschäftsführung oder die Administration — dieselbe Grenze wie bei den
Genehmigenden, gezogen vom Zeilenschutz:

| | |
| --- | --- |
| `verjaehrung` (Vorgabe) | Rest wird übertragen, verjährt nach zwei Jahren |
| `stichtag` | Rest wird übertragen, verfällt an `urlaub_stichtag` ('MM-DD') |

**Die Vorgabe ist das Gesetz, nicht das bisherige Verhalten.** „Kein Übertrag"
als dritte Wahl anzubieten hiesse, einen Fehler zur Einstellung zu erklären.

**Gerechnet wird in Jahrgängen**, weil ein blosser Saldo nicht sagen kann,
welche Tage alt sind: wer 2026 zehn Tage übrig hatte und 2027 wieder zehn,
dem verfallen Ende 2028 die von 2026. Verbraucht wird der älteste zuerst —
das ist die für den Mitarbeiter günstige Reihenfolge. Und was verfällt, wird
**genannt**, nicht lautlos abgezogen.

**Zwei Befunde in der eigenen Migration**, beide nur sichtbar, weil die
Bedingungen wirklich ausprobiert wurden:

* `stichtag` OHNE Datum ging durch. `urlaub_stichtag ~ '...'` ergibt bei
  `null` nicht `false`, sondern `null` — und eine Prüfbedingung, die `null`
  ergibt, gilt in SQL als erfüllt. Die Regel wäre ohne Zeitpunkt gespeichert
  worden und stillschweigend zu „verfällt nie" geworden.
* `'02-31'` ging durch. Ein Verfallstag, den es nicht gibt, tritt nie ein —
  derselbe stille Ausfall. Jetzt prüft die Bedingung die Tage je Monat; der
  29. Februar steht bewusst nicht zur Wahl.

### Was weiterhin NICHT gebaut ist

**Ein gespeicherter Vortrag je Jahr.** Der Übertrag wird bei jeder Anzeige
aus dem Verlauf gerechnet, nicht als Zahl fortgeschrieben. Das ist richtig,
solange der Verlauf kurz ist — er beginnt am Startdatum des Mitarbeiters —
und hat den Vorteil, dass eine nachträglich korrigierte Buchung sofort
durchschlägt. Bei einem Betrieb mit vielen Jahren Historie wäre ein
festgehaltener Jahresvortrag die billigere und für die Buchhaltung
nachvollziehbarere Fassung.

## Erledigt: die Kundenakte wird in der Akte bearbeitet (15.09.2026)

**Der Weg war ein Kreis.** Die Akte zeigte den Kunden, zum Ändern schickte sie
zurück in die Kundenliste — aus der Detailansicht heraus, um etwas zu ändern,
das in der Detailansicht steht. Wer danach zurückkam, stand wieder in der
Liste und musste den Kunden erneut suchen. Drei Klicks und ein verlorener
Platz, jedes Mal.

### Was jetzt gilt

Die Stammdatenkarte ist das Formular. Kein Umschalten in einen
„Bearbeiten-Modus": wer ändern darf, tippt direkt; wer nicht darf, sieht
dieselben Felder als Liste.

| | |
| --- | --- |
| Geschäftsführung, Projektleitung, Administration | Formular, Speicherleiste erscheint bei der ersten Änderung |
| Buchhaltung, Verwaltung, Mitarbeiter | Nur-Lesen, dieselben Felder, dieselbe Reihenfolge |

Die Grenze ist `isGF` — dieselbe, die schon die Kundenliste zieht. Eine
zweite Regel an derselben Sache wäre der Anfang zweier verschiedener
Antworten auf dieselbe Frage.

**Die Speicherleiste erscheint erst, wenn sich wirklich etwas geändert hat**,
und sie steht IN der Karte, nicht am Seitenende. Ein dauerhaft sichtbarer
Knopf lädt zum Speichern ohne Änderung ein; jeder dieser Schreibvorgänge
zieht den Kundennamen über alle Baustellen nach.

**Verglichen wird Feld für Feld, nicht über `JSON.stringify`.** Die
Reihenfolge der Schlüssel in einem Objekt ist kein Vertrag — ein umsortiertes
Feld hätte die Leiste dauerhaft eingeblendet, und niemand hätte den Grund
gesehen.

**Der Entwurf folgt dem geladenen Kunden nur, wenn dieser sich geändert hat.**
Liefe er bei jedem Zeichnen mit, überschriebe die Ansicht die halb getippte
Eingabe — der Fehler, der sich erst beim Tippen mit langsamer Verbindung
zeigt.

**Ohne Namen wird nicht gespeichert**, und das steht als Satz da, nicht als
rotes Feld: am Namen hängen Baustellen und Rechnungen.

**Wie viele Baustellen mitgewandert sind, wird genannt** — dieselbe Meldung,
die schon die Kundenliste gab. Eine Änderung an fremden Datensätzen lautlos
durchzuführen, wäre der Punkt, an dem die App mehr tut, als sie sagt.

Die Kontaktzeile (anrufen, mailen) folgt dem Entwurf, nicht dem gespeicherten
Stand: wer eine Nummer korrigiert, will sie danach prüfen können, ohne vorher
zu speichern.

### Ein Fehler, der beim Bauen aufgefallen ist

Der Angebotsblock der Akte rief `listQuotesForCustomer(companyId, kundeName)`
auf — die Abfrage filtert aber auf `customerId`, und `quotes.customer_id` ist
eine `uuid`. **Unter Postgres scheiterte sie an jedem Kunden**, und die Akte
meldete „die Angebote konnten nicht geladen werden". Unter Firestore kam
einfach nichts zurück, was wie „noch kein Angebot" aussah. Der Abschnitt hat
also nie funktioniert; der Umzug hat aus einer stillen Leere eine sichtbare
Meldung gemacht. Jetzt wird die Kennung übergeben, und eine Prüfung hält das
Argument fest.

### Warum zuerst nur der Kunde

Baustelle, Benutzer und Einsatz tragen dasselbe Muster — aber ob es trägt,
zeigt sich am ersten Fall, nicht an vier gleichzeitig gebauten. Baustelle
folgt als nächstes; das Gerüst steht dann.

**Der Einsatz bleibt bewusst aussen vor.** Er wird in der Planung bearbeitet,
wo er neben den anderen Einsätzen desselben Tages steht — eine eigene Akte
nähme ihm genau diesen Zusammenhang.

## Erledigt: die Baustelle bekommt eine Akte (15.09.2026)

Dasselbe Muster wie beim Kunden, einen Tag später — nur war hier mehr zu
tun, als es aussah. **Die Baustelle hatte gar keine eigene Seite.** Bearbeitet
wurde sie in einem Formular über der Liste, ihre Stundenauswertung klappte IN
der Listenzeile auf: genau die Konstruktion, die bei den Kunden am 07.09.
schon einmal aufgelöst wurde — eine Ansicht in der Verkleidung einer Zeile.

### Was jetzt gilt

`/admin-projects/:id` — die Akte. Stammdaten als Formular für alle, die
ändern dürfen (`isGF`, dieselbe Grenze wie die Liste), als Liste für alle
anderen. Darunter die Stundenauswertung, die vorher aufklappte, und die
Verweise auf Kundenakte und Handwerksschein.

Aus „Übersicht" und „Bearbeiten" in der Listenzeile wird **ein** Verweis:
„Akte". Das Formular über der Liste **legt nur noch an**.

**Die Adresse trägt die Kennung, nicht die Projektnummer.** Dafür gibt es
`listProjectsByIds` neu in beiden Datenschichten. Begründen wollte ich das
zuerst mit einer doppelt vergebenen Nummer — die Datenbank lässt das gar
nicht zu (`projects_nummer_je_betrieb`), der Test ist daran gescheitert. Der
richtige Grund: **die Nummer ist änderbar, die Kennung nicht.** Wird ein
Zahlendreher korrigiert, führte ein Lesezeichen auf die Akte ins Leere. Die
Prüfung zeigt genau das: anlegen, umnummerieren, über die Kennung weiterhin
da, über die alte Nummer weg.

**Der Pfad heisst `/admin-projects/:id` und nicht `/projects/:id`.** Das war
mein erster Entwurf, und `navigation-routen.test.ts` hat ihn zurückgewiesen:
ein Wächter für `/admin-projects` und eine Route `/projects/:id` sind zwei
unverbundene Zeichenketten, und niemand sieht ihnen an, dass sie
zusammengehören. Unter dem Pfad der Liste erbt die Akte die Entscheidung — wie
die Kundenakte unter `/customers`.

### Zwei Fehler, die dabei aufgefallen sind

**Die Abrechnungsart war nirgends änderbar.** Der Handwerksschein LIEST
`billingMode` — auf einer Regiebaustelle sind die bestätigten Stunden die
Rechnungsgrundlage, auf einer Pauschalbaustelle belegt derselbe Schein nur,
DASS gearbeitet wurde. Geschrieben wurde die Angabe aber nur beim Umwandeln
eines Angebots. Wer sie korrigieren musste, konnte es nicht; jede von Hand
angelegte Baustelle galt stillschweigend als Regie. Sie steht jetzt in der
Akte.

**Eine Baustelle ohne Datumsangaben liess sich gar nicht anlegen.** Ein leeres
Datumsfeld liefert `''`, und Postgres nimmt das für eine `date`-Spalte nicht
an („invalid input syntax for type date"). Die Maske meldete „Die Baustelle
konnte nicht gespeichert werden." — bei einem kurzfristigen Auftrag ohne
geplanten Beginn also immer. **Das war schon im Betrieb**, seit dem Umstieg
auf Postgres; unter Firestore ging `''` klaglos durch.

> Gefunden hat das der Durchklick im echten Browser, und nur der konnte es:
> im Ansichtstest ist die Datenschicht ersetzt, und eine Nachbildung nimmt
> jede Zeichenkette an. Die Regel steht jetzt in `pg/projects.ts` — beim
> Anlegen wird das Feld weggelassen, beim Ändern auf `null` gesetzt. Der
> Unterschied ist nicht kosmetisch: wer ein eingetragenes Enddatum LEERT,
> will es los sein, und ein weggelassenes Feld bliebe stehen.

### Warum nicht gleich auch die Benutzer

Dasselbe Muster trägt, das ist jetzt zweimal gezeigt. Die Benutzerakte ist der
nächste Schritt. **Der Einsatz bekommt weiterhin keine Akte:** er wird in der
Planung bearbeitet, wo er neben den anderen Einsätzen desselben Tages steht —
eine eigene Seite nähme ihm genau diesen Zusammenhang.

## Erledigt: die Benutzerakte — und damit trägt das Muster dreimal (15.09.2026)

Der dritte und letzte Schritt des Plans. `/user-mgmt/:uid` nach demselben
Zuschnitt wie Kunde und Baustelle.

**Was vorher war.** Wer ein Zeitkonto korrigieren wollte, klickte in der Liste
auf „Bearbeiten", wurde nach ganz oben in das ANLEGE-Formular gescrollt und
musste dort erst noch „Zeitkonto-Einstellungen anzeigen" aufklappen — genau
die Felder, deretwegen er gekommen war. Danach stand er wieder in einer Liste
von fünfundzwanzig Namen. Passwort-Mail und Sperren lagen zusätzlich in einem
Zeilenmenü, also an einer dritten Stelle.

### Was jetzt gilt

Aus drei Wegen wird einer: „Akte". Darin die Stammdaten als Formular, die
Zeitkonto-Felder **offen** statt aufklappbar, und der Zugang (Passwort-Mail,
Sperren) als eigene Karte.

**Die Zeitkonto-Felder sind hier offen, im Anlege-Formular bleiben sie
eingeklappt.** Das ist kein Widerspruch: beim Anlegen sind sie vorbelegt und
stimmen meistens; in der Akte sind sie der Grund, warum jemand die Seite
öffnet.

**Auch ein Administrator, den die aufrufende Rolle nicht ändern darf, hat
jetzt eine Akte.** Vorher stand in seiner Zeile „nur durch Administrator" —
ohne Weg zur Person. Ansehen darf man sie; die Akte sagt dort, warum nichts zu
ändern ist. Ändern nicht, sonst könnte die Geschäftsführung den letzten
Superuser deaktivieren und käme nie mehr an die Rollenvergabe.

### Eine Regel, zwei Masken

Die Umrechnung zwischen Formularfeld und Datensatz steht jetzt in
`features/users/benutzerEntwurf.ts` — vorher in `UserMgmtView`. Die Akte
schreibt dieselben Felder; zwei Auslegungen von „leer" wären zwei verschiedene
Wochenstunden für denselben Menschen, und die Zahl steht auf dem Lohnzettel.

Mit umgezogen ist die Feinheit, die dort schon einmal teuer war: `Number(x) ||
VORGABE` macht aus einer **eingetippten Null** die Vorgabe. Wer null
Wochenstunden hat — geringfügig, ruhendes Dienstverhältnis, die Chefin
selbst — bekäme vierzig, und jeder Monat produzierte danach rund 170
Minusstunden. Dasselbe beim Resturlaub, wo „nicht angegeben" (voller
Jahresanspruch) und „null Tage" (aufgebraucht) zwei verschiedene Aussagen
sind.

### Die Zusicherungen sind nicht weggefallen, sie sind umgezogen

Sechs Prüfungen standen an der Liste und stehen jetzt an der Akte: bestehende
Werte übernehmen statt leer starten, das Profil ändern statt einen zweiten
Zugang anlegen, das eigene Konto nicht sperren können, erst nach Rückfrage
schreiben und nur den Status, die Richtung bei einem deaktivierten Konto
umdrehen, und einen Administrator nur durch einen Administrator ändern lassen.
In der Liste steht dafür neu die Grenze: sie führt in die Akte, und anlegen
kann sie, ändern nicht.

### Was die Akte NICHT zeigt

**Den Urlaubs- und Zeitkontostand dieser Person.** Beides gibt es — in der
Mitarbeiterübersicht und in der Buchhaltung —, und es in der Akte zu
wiederholen hiesse, dieselbe Zahl an einer dritten Stelle zu rechnen. Ob sie
hier fehlt, entscheidet der Betrieb im Gebrauch; zwei Quellen für eine Zahl
sind teurer als ein Klick.

**Der Einsatz bekommt weiterhin keine Akte.** Er wird in der Planung
bearbeitet, wo er neben den anderen Einsätzen desselben Tages steht — eine
eigene Seite nähme ihm genau diesen Zusammenhang.

## Erledigt: kein fremdes Logo mehr — der Betrieb steht in seiner eigenen App (15.09.2026)

**Gemeldet als Frage, gefunden als Fehler.** Gefragt war, ob in der
Seitenleiste das Senklot-Zeichen stehen sollte oder das Logo des Betriebs.
Die Antwort ist das Logo des Betriebs — und beim Nachsehen stellte sich
heraus, dass dort etwas Schlimmeres stand: ein **fest verdrahteter Ersatz auf
`/perl-logo.png`**.

Ein zweiter Betrieb, der noch kein eigenes Logo hinterlegt hat, sah damit das
Zeichen des ERSTEN — jeden Tag, in seiner eigenen Seitenleiste. Das ist kein
Schönheitsfehler, sondern eine falsche Aussage darüber, wessen Betrieb man
vor sich hat. Und es ist die Sorte Fehler, die erst beim zweiten Kunden
auffällt, also genau dann, wenn er am teuersten ist.

Der bisherige Ausweg stand im Kommentar: der zweite Kunde setze eben
`VITE_PORTAL_LOGO`. Das ist aber eine **Bauzeit**-Variable, also ein eigener
Build je Betrieb — das Gegenteil dessen, was der Schritt zum echten
Mehrmandanten-Betrieb erreichen soll. Die Variable ist ersatzlos weg.

### Wo welche Marke steht

| | |
| --- | --- |
| Anmeldung, App-Zeichen, Startbildschirm | **Senklot** — dort ist der Betrieb noch unbekannt, und die App gehört dem Produkt |
| Seitenleiste und mobile Kopfleiste | **Der Betrieb**: sein hinterlegtes Logo, sonst sein Name als Schriftzug |
| Fuss der Seitenleiste | **Senklot**, klein und gedämpft |

**Warum der Betrieb oben steht.** Die Seitenleiste ist der Arbeitsplatz von
Perls Leuten. Ihnen zwanzigmal am Tag zu sagen, in welcher Software sie
sitzen, bringt ihnen nichts; zu sehen, WESSEN Betrieb das ist, schon —
spätestens, wenn jemand für zwei Firmen arbeitet.

**Warum die Produktmarke trotzdem vorkommt.** Wenn ein Monteur anruft und
sagt „die App tut nicht", ist „Senklot" das Wort, mit dem er sucht und mit
dem das Büro den Support anspricht. Sie steht deshalb am Fuss, hinter dem
Abmelden — dort konkurriert sie mit nichts. **Gedämpft, aber nicht blass:**
`white/60` gegen die dunkle Fläche sind rund 4,9:1. Eine Beschriftung, die
man erraten muss, hilft im Supportfall niemandem.

**Kein Ersatzbild, auch kein neutrales.** Ohne hinterlegtes Logo steht der
NAME da. Ein Platzhalter sagt nichts, wo etwas zu sagen wäre; ein fremdes
Logo sagt etwas Falsches. Und solange der Betrieb noch lädt, steht dort gar
nichts — einen Namen zu raten wäre ausgerechnet beim Wechsel zwischen zwei
Mandanten das Falsche.

### Was das für Perl heisst

**Steht in den Firmendaten kein Logo, zeigt die Seitenleiste ab jetzt
„Perl Installationen" als Schriftzug statt des Bildes.** Das ist die
richtige Anzeige — und zugleich der Hinweis auf eine Lücke, die es schon
vorher gab: dasselbe Logo fehlt dann nämlich auch auf Rechnung, Stundenbericht
und Handwerksschein, weil die ihre Grafik aus `companies.logoUrl` holen und
nie aus der Datei. Einmal unter **Einstellungen → Firmendaten** hochladen
richtet beides zugleich.

Die Datei `public/perl-logo.png` bleibt liegen — sie wird von keinem Code mehr
benutzt, ist aber der bequemste Weg, an das Bild zu kommen
(`…/perl-logo.png` im Browser öffnen, speichern, hochladen).

## Erledigt: die Sicherung verlässt das Haus (15.09.2026)

Die letzte Lücke, bei der ein Ausfall **unwiederbringlich** gewesen wäre. Die
nächtliche Ausleitung schrieb bisher in den Speicher desselben Supabase-
Projekts, in dem auch die Daten liegen. Gegen einen Fehlgriff, eine kaputte
Migration oder eine versehentlich geleerte Tabelle half das sofort — gegen
„der Zugang zum Projekt ist weg" gar nicht.

### Was jetzt gilt

Der Stand geht **zuerst** in den eigenen Speicher und **danach** ausser Haus,
in einen S3-kompatiblen Eimer bei einem anderen Anbieter. Die Reihenfolge ist
Absicht: scheitert der Weg nach draussen, liegt der Stand wenigstens drinnen.
Andersherum stünde man am Ende mit gar nichts da.

Fünf Secrets, alle oder keines — Endpunkt, Region, Eimer, Schlüssel,
Geheimnis. Die Einzelheiten stehen in der README.

**DAS DIENSTKONTO DARF NUR ANLEGEN.** Nicht lesen, nicht löschen, nicht
überschreiben. Wer morgen dieses Projekt übernimmt, hat damit einen
Schlüssel, mit dem er die abgelegten Stände **nicht vernichten kann** — das
ist der halbe Zweck einer Sicherung ausser Haus, und ein Schlüssel mit
Vollzugriff hätte ihn weggenommen. Weil nicht überschrieben werden darf,
trägt der Pfad draussen die Uhrzeit; drinnen liegt weiterhin ein Stand je Tag.

### Drei Entscheidungen, die im Code begründet stehen

**`AUSLEITUNG_ZIEL_EXTERN` ist ersatzlos weg.** Die Variable setzte **nur die
Meldung** in der Überwachung und bewegte keine Datei: eingeschaltet legte sie
den ehrlichen Hinweis still, ohne dass etwas ausser Haus lag — das Gegenteil
dessen, wofür die Anzeige gebaut wurde. Gemeldet wird jetzt der tatsächliche
Versuch.

**Ein Fehlschlag nach draussen ist ein Fehlschlag.** Ihn als Erfolg mit
Fussnote zu melden wäre die bequeme Fassung und die falsche: genau das
Ausbleiben der Sicherung ist der stille Ausfall, gegen den das Ganze gebaut
ist. Ist gar kein Ziel eingerichtet, ist das etwas anderes — eine benannte
Lücke, kein Fehler, und der Lauf gilt als erfolgreich.

**Halb eingerichtet gilt als Fehler**, mit dem Namen des fehlenden Feldes und
Status 503. Wer vier von fünf Feldern setzt, würde sonst als „nicht
eingerichtet" behandelt: die App meldete brav „liegt im selben Projekt", und
niemand käme auf die Idee, nach dem fünften zu suchen.

### Die Signatur — und warum sie selbst geschrieben ist

Die S3-Schnittstelle verlangt eine SigV4-Signatur. Ein SDK dafür wäre ein
Paket von einigen hundert Kilobyte für dreissig Zeilen Rechnung, die sich
exakt nachprüfen lässt — und es müsste in Deno UND im Node-Testlauf laufen.
Stattdessen `shared/s3Signatur.ts`, das nichts importiert ausser Web Crypto.

**Geprüft wird gegen die veröffentlichten Testvektoren von AWS**
(`aws-sig-v4-test-suite`, Fall `get-vanilla`): bekannter Schlüssel, bekannte
Zeit, bekannte Anfrage, erwartete Kopfzeile Zeichen für Zeichen. Stimmt sie,
stimmt die ganze Kette — kanonische Anfrage, Geltungsbereich,
Schlüsselableitung, Signatur. Eine falsch gerechnete Signatur ergibt sonst
ein 403 ohne einen Hinweis darauf, welcher der acht Schritte danebenlag.

> Die erste Fassung dieser Prüfung war zu schwach: sie verglich nur die FORM
> („sieht aus wie eine Signatur"). Damit die Kopfzeile exakt vergleichbar
> wurde, legt der Signierer jetzt nichts mehr von sich aus dazu — er
> signiert, was man ihm gibt. Der Inhaltshash kommt vom Aufrufer, der ihn
> ohnehin braucht.

**Warum die S3-Schnittstelle und nicht die von Google.** Der Google-eigene
Weg verlangt ein Dienstkonto-JSON, ein selbst signiertes JWT und einen Tausch
gegen ein Token — drei Schritte, die alle ablaufen können. Vor allem aber ist
die S3-Schnittstelle nicht anbietereigen: derselbe Code trägt morgen zu
Cloudflare R2, Wasabi oder Hetzner. Bei einer Sicherung ist das keine
Kleinigkeit — sie soll den Anbieter überleben, gegen dessen Ausfall sie
gebaut ist.

### Was hier NICHT geprüft ist, und was das heisst

Geprüft sind Signatur, Adresse, Kopfzeilen, die Pfadform und die
Unterscheidung „kein Ziel / halbes Ziel / Ziel". **Nicht geprüft ist, ob der
echte Eimer den Aufruf annimmt** — das kann keine Prüfung hier beantworten,
sondern nur der Eimer selbst. Deshalb trägt die Fehlermeldung die Antwort des
Zielspeichers im Klartext mit: zwischen abgelaufenem Schlüssel, falschem
Eimer und fehlender Berechtigung soll nachts niemand raten müssen.

**Der Rücklauf** stand hier zuerst als offen — er ist am 16.09.2026
nachgereicht, siehe unten.

### Ein Befund über den Bau selbst

`shared/` wird an ZWEI Ziele kopiert, und beide verlangen etwas anderes: Deno
braucht die Endung `.ts`, die alten Cloud Functions unter NodeNext ein `.js`.
Deshalb steht in der Quelle **keine** Endung, und jeder der beiden Generatoren
ergänzt seine eigene.

Meine neuen Dateien sind die ersten in `shared/`, die einander importieren —
und ich hatte `./s3Signatur.ts` geschrieben, weil ich gerade an Deno dachte.
Örtlich fiel das nicht auf: `npm test`, `tsc`, der Durchklick, alle grün. Es
brach in einem eigenen CI-Auftrag, der die Cloud Functions gegen die echten
Firebase-Typen übersetzt.

Die Regel gibt es also längst; sie stand nur in einem Kommentar. Jetzt hält
sie `tests/unit/gemeinsameImporte.test.ts` fest — samt der Gegenprobe, dass
das Muster überhaupt noch Importe findet.

## Erledigt: der Rücklauf — und damit ist es wirklich eine Sicherung (16.09.2026)

**Erst am 16.09. um 09:21 ist zum ersten Mal ein Stand wirklich ausser Haus
gelandet** (`senklot-sicherung/ausleitung/perl/2026-09-16/092128.jsonl`,
10 Zeilen). Damit war die halbe Strecke gewonnen — und die andere Hälfte
offen: niemand wusste, ob die abgelegten Dateien überhaupt etwas taugen.

Jetzt gibt es den Weg zurück, und `tests/supabase/ruecklauf.test.ts` geht ihn
bei **jedem** Prüflauf einmal ganz durch: einen Betrieb anlegen, ihn mit der
echten Edge Function ausleiten, die Datei aus dem Speicher holen, **den
Betrieb vollständig löschen** — samt Anmeldekonten —, mit dem echten Werkzeug
zurückspielen und vergleichen. Nichts daran ist nachgebildet.

### Der Befund, der die ganze Bauform bestimmt hat

`public.users.id` verweist auf `auth.users(id)`. Die **Anmeldekonten stehen
nicht in der Sicherung**: sie tragen kein `company_id` und fallen damit aus
der Ausleitung heraus. Ohne sie lässt sich keine einzige Profilzeile
einfügen — und ohne Profilzeilen hängt der ganze Rest in der Luft.

Der Rücklauf baut sie deshalb aus den Profilen neu, **unter derselben
Kennung**; die Admin-Schnittstelle nimmt eine vorgegebene Kennung an (das habe
ich ausprobiert, bevor ich darauf gebaut habe). Damit lösen sich alle
Fremdschlüssel der Sicherung wieder auf. Bekämen die Konten neue Kennungen,
zeigte jede Zeiteintragung, jeder Schein und jede Zuordnung ins Leere.

**Die Passwörter kommen nicht zurück.** Sie stehen als Hash in `auth.users`
und damit nicht in der Sicherung. Jeder wiederhergestellte Zugang braucht
einmal „Passwort vergessen" — keine Lücke, sondern die Folge davon, dass eine
Sicherung keine Passwörter mitnimmt.

### Drei Entscheidungen

**Ein Werkzeug für die Hand, keine Edge Function.** Der Ernstfall ist „das
Projekt ist weg" — eine Function IN diesem Projekt wäre dann ebenfalls weg.
Ein Rücklauf läuft auf dem Rechner eines Menschen, gegen ein frisches Projekt,
mit einem Schlüssel, den dieser Mensch in dem Moment in der Hand hat.

**Der Trockenlauf ist die Vorgabe.** Ein Werkzeug, das beim ersten
unbedachten Aufruf schreibt, wird irgendwann unbedacht aufgerufen. Und in ein
Ziel, in dem es den Betrieb schon gibt, schreibt es gar nicht erst.

**Eingefügt wird in RUNDEN, nicht in fester Reihenfolge.** Die Tabellen hängen
über Fremdschlüssel aneinander. Eine einprogrammierte Reihenfolge wäre die
naheliegende Lösung und die schlechteste: sie veraltet bei der nächsten neuen
Tabelle, unbemerkt, weil sie erst im Ernstfall gebraucht wird. Stattdessen:
alles versuchen, was scheitert in die nächste Runde, und wenn eine Runde
nichts mehr schafft, ehrlich abbrechen statt halb einzuspielen.

### Zwei eigene Fehler, beide von Prüfungen gefunden

**Der Messpunkt war falsch.** Der erste Durchstich meldete eine fehlende Zeile
in `system_laeufe`. Die Ausleitung hält ihren EIGENEN Lauf dort fest, und zwar
NACH dem Schreiben der Datei — die Datei kann ihn gar nicht enthalten. Wer
erst danach misst, hält ein richtiges Ergebnis für falsch. Gemessen wird jetzt
davor.

**Der Rücklauf schrieb eine Wahrheit doppelt.** Er setzte beim Anlegen der
Konten auch Betrieb, Rolle und Zustand im Token. Eine Mutation, die das
wegliess, überlebte — und das war kein Loch in der Prüfung, sondern eine
Antwort: der Auslöser `users_ansprueche` setzt diese Angaben aus der
Profilzeile und sperrt ein inaktives Konto gleich mit. Zwei Quellen für
dieselbe Wahrheit laufen auseinander; die im Werkzeug wäre die schlechtere
gewesen, weil sie einer Datei glaubt statt der Datenbank. Sie ist weg.

### Was weiterhin offen ist

**Der Rücklauf spielt in ein Projekt mit fertigem Schema.** Er setzt voraus,
dass die Migrationen dort schon gelaufen sind — er baut keine Datenbank, er
füllt eine. Für den Ernstfall heisst das: erst ein frisches Supabase-Projekt
mit `supabase db push`, dann der Rücklauf.

**Die Fotos holt der Rücklauf nicht zurück.** Sie liegen seit dem
16.09.2026 ausser Haus (siehe unten), aber das Dienstkonto dort darf nur
anlegen — mit seinem Schlüssel lässt sich nichts herunterladen. Wer
wiederherstellt, holt die Dateien mit seinem eigenen Zugang aus dem Eimer und
legt sie unter demselben Objektnamen in den Speicher des neuen Projekts. Das
ist ein Handgriff, keine Automatik, und er gehört genannt, bevor ihn jemand im
Ernstfall entdeckt.

---

## Erledigt: Die Dateien gehen mit (16.09.2026)

**Die Ausleitung schrieb Tabellenzeilen — und die Fotos am Handwerksschein
sind keine.** Die Zeile in `work_sheet_photos` nennt nur einen Pfad; das Bild
selbst lag ausschliesslich im Speicher dieses Projekts. Ein Schein wäre nach
einem Wiederanlauf zurückgekommen und seine Beweisfotos nicht — und genau die
sind der Grund, warum es den Schein gibt. Ein Kunde, der eine Leistung
bestreitet, lässt sich mit dem Verweis auf eine nicht mehr vorhandene Datei
nicht überzeugen.

**Nur ausser Haus, und das ist keine Sparsamkeit.** Die Bilder liegen bereits
im Speicher dieses Projekts; sie in den Eimer nebenan zu kopieren verdoppelte
den Platz und schützte gegen nichts — fällt das Projekt aus, fällt beides aus.
Ohne eingerichteten Zielspeicher geschieht deshalb gar nichts, und das ist
eine benannte Lücke und keine ausgelassene Arbeit.

**Buch geführt wird in der Datenbank, weil der Zielspeicher es nicht kann.**
Das Dienstkonto dort darf anlegen und sonst nichts — nicht lesen, nicht
auflisten, nicht löschen. Das ist der Sinn der Übung: wer den Schlüssel
erbeutet, kann die Sicherung nicht vernichten. Der Preis steht in
`ausleitung_dateien`: die Frage „liegt diese Datei schon draussen?"
beantwortet nur die eigene Datenbank. Die Tabelle trägt `company_id` und geht
damit selbst mit in die Sicherung — ein wiederhergestellter Betrieb weiss
also, was bereits draussen liegt.

**Gefragt wird der SPEICHER, nicht die Zeilen.** Ginge die Liste über
`work_sheet_photos`, fiele jede Datei heraus, deren Zeile fehlt — und genau
die bräuchte man am dringendsten. Eine Waise kostet ein paar Kilobyte und
wird mitgesichert.

**Eine Handvoll je Lauf.** Eine Edge Function hat eine Wanduhr; ein Betrieb
mit Jahren an Fotos bräche sonst in jeder Nacht an derselben Stelle ab.
`AUSLEITUNG_DATEIEN_JE_LAUF` (200) und `AUSLEITUNG_DATEIEN_BYTES_JE_LAUF`
(64 MB) begrenzen einen Lauf, die Reihenfolge liegt fest, und die Ansicht
sagt, wie viele noch fehlen. Ein Rückstand arbeitet sich so Nacht für Nacht
ab, statt nie.

**Der Stolperdraht für neue Eimer.** `app.datei_eimer()` führt JEDEN Eimer des
Projekts — mit `true` oder mit `false`. Ein neuer Eimer, den niemand einträgt,
fiele sonst stillschweigend aus der Sicherung, und bemerkt würde es am Tag des
Wiederanlaufs. `tests/supabase/ausleitungDateien.test.ts` vergleicht die Liste
mit `storage.buckets` und fällt bei jedem Eimer, zu dem niemand eine
Entscheidung getroffen hat.

### Zwei Funde auf dem Weg

**Die Signatur rechnete am Pfad des Endpunkts vorbei.** `putAnfrage` signierte
bisher nur `<eimer>/<pfad>`. Bei Google Cloud Storage ist der Endpunkt ein
blosser Hostname, und dann fällt das nie auf. Steht dort aber ein Pfad —
`…/storage/v1/s3` bei Supabase, `…/s3` hinter einem Vorschaltserver —,
rechnete die Signatur über etwas anderes als der Server über die empfangene
Adresse: ein 403 ohne Begründung, das nach einem falschen Schlüssel aussieht.
Der Pfadteil des Endpunkts geht jetzt mit ein.

**Und damit liess sich der Transport endlich wirklich prüfen.** Bis hierher
war die Signatur nur gegen die veröffentlichten AWS-Testvektoren gerechnet —
das ist viel, aber es ist Papier. Der Supabase-Speicher selbst spricht die
S3-Schnittstelle; `tests/supabase/ausleitungDateien.test.ts` schiebt ein Bild
jetzt gegen einen ECHTEN S3-Dienst hinaus, lädt es zurück und vergleicht Byte
für Byte — und weist daneben nach, dass derselbe Dienst eine falsch gerechnete
Signatur abweist. Ohne das zweite wäre das erste wertlos.

### Was hier weiterhin offen ist

**Die Reihenfolge IN der Edge Function ist nicht integrierend geprüft.** Jede
Schnittstelle, die sie anspricht, ist es — die Liste, das Herunterladen, der
signierte PUT, der Vermerk. Was fehlt, ist der Zielspeicher in der Umgebung
der Function selbst; der liegt ausserhalb, und im lokalen Stapel gibt es ihn
nicht. Diese letzte Handbreit beantwortet der Knopf in den Einstellungen.

---

## Erledigt: Zwei Befunde aus dem Betrieb (16.09.2026)

### Die Kennzahlen-Leiste fluchtete nicht

**Sechzehn Bildpunkte, und sie waren zu sehen.** Die Leiste mit „Offen /
Überfällig / Bezahlt" hat keinen Rahmen und deshalb keine eigene Polsterung —
ihre erste Beschriftung stand genau dort, wo die KANTE der Karte darunter
liegt, und damit links neben deren Titel. Zwei Beschriftungen untereinander,
die knapp nicht übereinander stehen, sehen nicht nach einer Entscheidung aus,
sondern nach einem Versehen; auf dem Telefon, wo die Karte fast die ganze
Breite einnimmt, umso mehr.

Das Mass steht jetzt als EIN Wert (`GUTER_RAND`) und gilt für die Leiste, für
ihren Ladeplatzhalter und für den Kartenkörper. Die Leiste steckt in fünf
Ansichten — Startseite, Zeiten, Rechnungen, Lager, Mitarbeiterübersicht —,
und alle fünf fluchten damit auf einen Schlag. `tests/components/Metric.test.tsx`
hält die Masse zusammen; eine erste Fassung dieser Prüfung ging an einer
LEEREN Polsterung vorbei (jede Zeichenkette enthält die leere), was die
Mutation gezeigt hat.

### Ein Tab-Wechsel sah aus wie ein Ausfall

**Der Befund.** Ein kurzer Blick in einen anderen Browser-Tab, und die
Zeiterfassung zeigte einen roten Kasten: „Das hat nicht geklappt — Die
Live-Verbindung für time_entries steht nicht (CLOSED)". Er ersetzte die
Liste, ging nie wieder weg und nannte einen Tabellennamen.

Drei Fehler übereinander, und der dritte war der eigentliche:

1. **Er ging nie wieder weg.** Die Ansicht setzte ihren Fehlerzustand; der
   geglückte Wiederaufbau ruft nur den Erfolgsrückruf, und der räumte ihn
   nicht weg. Die Verbindung stand längst wieder.
2. **Er verdeckte die Daten.** `error` ersetzt in den meisten Ansichten den
   ganzen Inhalt. Die Liste war da und richtig; zu sehen war sie nicht.
3. **Die Leiter der Wartezeiten lief in zwei Zehntelsekunden ab.** Das war im
   echten Browser zu messen und sonst nirgends: `removeChannel` meldet den
   Kanal ab — und das Abmelden ruft denselben Rückruf noch einmal auf,
   SYNCHRON, mitten aus der Behandlung heraus. Die Behandlung lief also in
   sich selbst, fünf Ebenen tief, und die unterste meldete den Ausfall. Die
   dreissig Sekunden, die davor schützen sollten, gab es nie. Gemessen: der
   Hinweis stand nach 0,2 Sekunden da; nach dem Umbau nach 38.

**Was jetzt steht.** Der Zustand der Live-Verbindung liegt an EINER Stelle
(`src/lib/liveVerbindung.ts`) und nicht in jeder Ansicht — alle Abonnements
hängen ohnehin an derselben WebSocket-Verbindung. Gemeldet wird ein
Vorbehalt, kein Fehler, und er nimmt sich selbst zurück; eine Ansicht kann
das gar nicht mehr vergessen. Angezeigt wird er als schmales Band über dem
Inhalt, in derselben Form wie der Hinweis bei fehlendem Empfang —
`role="status"`, gelb, mit „Neu laden" daneben. Die Daten bleiben stehen.

**Und der Wiederaufbau gilt jetzt für alle vier Abonnement-Wege.** Es gab ihn
nur in `abonnieren`. Die Einstellungen, die Rechnungen und die Rüstliste
meldeten einen Abriss SOFORT als Fehler — ein Wiederaufbau, den drei von vier
Wegen nicht haben, ist keiner. `kanalHalten` ist jetzt die eine Stelle, und
sie zählt im Hintergrund gar nicht erst mit: liegt der Tab hinten, ist ein
geschlossener Kanal zu erwarten und ein Wiederaufbau zwecklos.

**Was `onError` noch bedeutet:** ein gescheitertes LADEN. Dann hat die
Ansicht keine Daten, und das gehört dorthin, wo die Daten stehen sollten. Ein
Verbindungsabriss lässt die Daten stehen — das ist ein Vorbehalt und kein
Fehler.

---

## Erledigt: Der Bilanzlauf, den es nicht gibt (16.09.2026)

**Auf der Startseite stand dauerhaft „Ein nächtlicher Lauf steht aus".** Für
Geschäftsführung und Administration, jeden Tag, mit einem Weg zu den
Monatsbilanzen — auf eine Karte, die selbst erklärt, dass dort nichts
anzustossen ist.

Die Meldung war nicht falsch, sie war **veraltet**. In Firestore musste die
Monatsbilanz vorgerechnet und abgelegt werden: eine Sammlung, ein Trigger zum
Nachziehen, ein nächtlicher Lauf zum Ausgleichen, ein Marker für die
Vollständigkeit. Unter Postgres ist `monthly_stats` eine SICHT — sie rechnet
bei jeder Abfrage neu, kann nicht unvollständig sein, und deshalb gibt es
weder einen Lauf noch einen Eintrag in `cron`. Die Einstellungen sagen das
seit Stufe 8 auch so. Nur die Startseite fragte weiter nach ihm, bekam „noch
nie durchgelaufen" — was stimmt — und meldete es.

**Eine Warnung, die niemand abstellen kann, ist schlimmer als keine.** Sie
bringt einem bei, die Stelle zu übersehen; und an derselben Stelle steht eines
Tages die ausgefallene SICHERUNG. Genau das war der Grund, sie überhaupt zu
bauen.

Gefunden hat sie kein Test, sondern der Betrieb — ein Fund für Aufgabe O2
(„weitere Firestore↔Postgres-Bedeutungsreste"). Welche Läufe es gibt,
entscheidet jetzt die Datenquelle, und beide Zweige sind geprüft. Mit Stufe 9
fällt die Fallunterscheidung weg.

### Nebenbei: „1 Tage fehlen"

In der Mitarbeiterübersicht stand die Zahl mit der falschen Form daneben. Es
ist eine Kleinigkeit und trotzdem keine: wer eine Zahl anzeigt, die mit dem
Wort daneben nicht zusammenpasst, hat offensichtlich nicht hingesehen — und
der Leser fragt sich, wo sonst noch nicht. Die Fallunterscheidung stand an
drei Stellen, an einer davon richtig; jetzt steht sie als `tageWort` an einer.

---

## Erledigt: Abzeichen nach Aufgabe statt nach Stimmung (16.09.2026)

**Eine Form erledigte fünf Aufgaben, und dadurch keine davon gut.** Die
gefüllte Pille mit acht Farbtönen trug Status, Rolle, Eigenschaft, Zahl mit
Urteil und neutrale Notiz. Gelb hiess damit gleichzeitig „Helfer" (eine
Tatsache), „Krank" (ein Status), „knapp" (ein Engpass) und „bitte prüfen"
(eine Aufforderung) — eine Farbe, die vier Dinge heisst, heisst nichts. Und
alles wog gleich viel: „40 h Budget" schrie so laut wie „über Budget".

**Jetzt entscheidet die Aufgabe über die Form:**

| Form | Wofür | Aussehen |
| --- | --- | --- |
| **Marke** | eine Tatsache ohne Urteil | keine Fläche, keine Farbe — die Stimme der Kartentitel |
| **Zustand** | ein Wert aus einer kleinen Menge | ein Punkt in der Farbe des Werts, daneben das Wort |
| **Warnung** | hier liegt etwas für dich | die gefüllte Pille — und NUR noch hier, zwei Stufen |

Dass die gefüllte Pille jetzt nur noch eines bedeutet, ist die eigentliche
Wirkung. Fünfzig Fundstellen in dreissig Ansichten sind einzeln eingeordnet
worden; der Übersetzer hat dazu gezwungen, weil der alte Standard-Export weg
ist. **Die Rollen haben ihre sechs Farben verloren** — eine Legende, die
niemand auswendig lernt, und „Buchhaltung" sagt, was „Gelb" nicht sagt.

Ein paar Entscheidungen, die dabei fielen und die nicht offensichtlich sind:

- **„Überfällig" ist ein Zustand, keine Warnung.** Der Status sagt, WO etwas
  steht; was zu tun ist, steht daneben („3 Tage" am Mahnlauf). Stünde beides
  als Pille da, riefe die Zeile zweimal dasselbe.
- **„Abgelehnt" und „Storniert" sind nicht mehr rot.** Entschieden ist
  entschieden; Rot schickte jemanden auf eine Liste, an der er nichts ändern
  kann.
- **„Notdienst" war rot** — die Farbe für „hier ist etwas kaputt" — und ist
  eine Angabe zur Abrechnung.
- **„Heute" am eigenen Einsatzplan war rot** und ist der Einsatz, der gerade
  läuft.

### Gelb und Rot gehörten nicht zu dieser App — gemessen

Jeder Strukturton der Oberfläche liegt zwischen 187° und 194° (Türkis);
selbst das Grün ist mit 63 % Sättigung in dieses Band gezogen, Türkis liegt
bei 65 %. Die beiden Warnfarben kamen unverändert aus der Tailwind-Vorgabe und
standen bei **96 % und 93 %** — die zwei gesättigtsten Flächen der ganzen App.

Dazu ein zweiter Fehler, der die Rangfolge umdrehte: das Gelb war mit 89 %
Helligkeit **dunkler** als das Rot mit 94 %. Die harmlosere Farbe wog optisch
schwerer als die dringende.

| | vorher | jetzt | Text auf Fläche |
| --- | --- | --- | --- |
| warning | `#fef3c7` S 96 % | `#f7f0d9` S 66 % | 4,51 → **4,76:1** |
| danger | `#fee2e2` S 93 % | `#f8dbd8` S 68 % | 5,30 → **5,48:1** |

**Der Kontrast steigt dabei, er sinkt nicht** — eine Farbe, die hübscher und
schlechter lesbar ist, wäre in dieser App die falsche Richtung, denn
gearbeitet wird draussen. `tests/unit/warnfarben.test.ts` hält beides fest:
das Sättigungsband und die Lesbarkeit.

---

## Erledigt: Menü-Hinweise für offene Posten (16.09.2026)

**Die Navigation sagte, WO etwas liegt, aber nie, DASS dort etwas liegt.** Wer
entscheidet, ob ein Urlaubsantrag wartet, musste den Reiter öffnen; wer es
nicht tat, erfuhr es nicht. Genau daran bleibt in kleinen Betrieben liegen,
was keinen Ort hat, an dem es sich meldet.

### Drei Zahlen, und die Begründung, warum nicht mehr

Aufgenommen ist nur, was **drei Bedingungen zugleich** erfüllt:

1. **Es ist normalerweise null.** Eine Zahl, die immer leuchtet, ist keine
   Meldung mehr, sondern Tapete — und nimmt den anderen die Wirkung mit.
2. **Jeder Eintrag ist eine Entscheidung**, kein Zustand.
3. **Sie hat einen klaren Besitzer.** Wer sie nicht entscheiden darf, bekommt
   sie gar nicht erst gezählt.

| Menüpunkt | Zahl | Wer sie sieht |
| --- | --- | --- |
| **Urlaub** | Anträge im Zustand „Beantragt" | wer laut Einstellung entscheidet |
| **Anforderungen** | Materialanforderungen „Offen" | Büro und Leitung |
| **Rechnungen** | Rechnungen, bei denen heute eine Mahnung fällig wäre | Buchhaltung und Spitze |

**„Nicht eingetragene Zeiten" steht bewusst NICHT dabei**, obwohl danach
gefragt war. Sie sind am Monatsende bei jedem offen, und niemand kann sie
wegentscheiden — das Abzeichen wäre dauerhaft an und hätte die beiden anderen
mit entwertet.

**Eine Abfrage, nicht drei.** `public.offene_posten(p_heute)` liefert alle
drei Zahlen in einer Zeile; nachgeladen wird bei jedem Seitenwechsel, beim
Zurückkommen in den Tab und auf Zuruf, sobald jemand einen Posten erledigt
hat. Die Rollengrenze steht **zweimal** — als `case` in der Funktion und im
Zeilenschutz der drei Tabellen; fällt eine, hält die andere.

> **Was es NICHT ist: eine Live-Anzeige.** Entscheidet die Kollegin am anderen
> Schreibtisch einen Antrag, sieht man es hier erst beim nächsten
> Seitenwechsel. Drei weitere Abonnements über den WebSocket kosten dauerhaft
> Verbindung für eine Zahl, die niemand sekundengenau braucht. Die Lücke steht
> im Kopf von `app/offenePosten.ts`, damit sie niemand für einen Fehler hält.

### Die vierte Form — und warum sie die Regel von gestern nicht bricht

Die Regel aus dem Abschnitt darüber lautet: eine gefüllte Pille IN EINER LISTE
ist eine Warnung. Der **Zähler** im Menü ist die Ausnahme, und sie ist das
Gegenstück zur Regel: in einer Liste kämpft die Pille mit Namen, Nummer und
Betrag um denselben Blick — im Menü steht neben dem Wort nichts.

**Nicht gelb und nicht rot.** Drei wartende Urlaubsanträge sind kein Fehler
und kein Verzug, sondern Arbeit, die jemandem gehört. Die Farbe ist die der
Marke: auf der dunklen Seitenleiste `accent-bright` mit dunkler Zahl (6,4:1,
die Fläche selbst 4,0:1 gegen die Leiste), auf den hellen Blättern von unten
`accent-deep` mit weisser Zahl (5,2:1).

**Null ist kein Abzeichen**, und diese Entscheidung steht an genau einer
Stelle. Sie stand zwischendurch an vieren — nachgemessen fiel eine Mutation,
die den Zähler bei null zeichnen liess, dadurch nur in EINER Prüfung auf, weil
die Hülle sie vorher abfing. Vier Wächter für eine Regel heisst, dass drei
davon nie geprüfte Behauptungen sind.

### Zwei Lücken, die erst dadurch sichtbar wurden

**Wer Urlaub entscheiden darf, durfte ihn nicht lesen.** Seit dem 13.09. legt
der Betrieb fest, WER genehmigt — auch eine Bürokraft oder ein Vorarbeiter.
Die Leserichtlinie kannte weiter nur Leitung und Buchhaltung: eine eingetragene
Genehmigende aus der Verwaltung bekam das Recht zu entscheiden und eine LEERE
Liste dazu. Ohne Abzeichen fällt das nicht auf, weil eine leere Liste auch
heisst „gerade nichts da". Mit Abzeichen wäre es eine Lüge gewesen: null, wo
drei warten.

**Der Mahnlauf ignorierte die Frist, die der Betrieb selbst gesetzt hat.**
Siehe `docs/FUNKTIONEN.md`, Abschnitt Mahnwesen. Ohne diese Korrektur wäre das
Abzeichen dauerhaft an gewesen — jede unbezahlte überfällige Rechnung hätte
bis zur dritten Mahnung jeden Tag darin gestanden.

### Nebenbei: der Knopf „Mehr" war falsch markiert

Er las die Adresse aus `location` des Fensters statt aus dem Router. Die ändert
sich zwar, löst aber kein Neuzeichnen aus — der Knopf blieb also so markiert
(oder unmarkiert), wie er beim letzten Zeichnen aus anderem Grund gerade war.
Aufgefallen ist es erst, als der Seitenwechsel für die Abzeichen ohnehin
gebraucht wurde.

---

## Erledigt: die Vorsätze gehören dem Betrieb (18.09.2026)

**Vier fest verdrahtete Zeichenfolgen, verstreut über sechs Dateien.**

| | wo sie stand | was daran falsch war |
| --- | --- | --- |
| `RE-` | `invoiceNumbers.ts` **und** `db/pg/invoices.ts` | zwei Quellen für dieselbe Wahrheit — der Vorschlag konnte eine andere Nummer zeigen, als die Rechnung danach trug |
| `AN-` | `db/pg/quotes.ts` und `db/fs/quotes.ts` | dieselbe Doppelung |
| `B-` | **nirgends vergeben** | die Baustellennummer tippt ein Mensch; automatisch entstand sie nur beim Annehmen eines Angebots, per Textersetzung |
| `WZ-` | **dreifach** in `TimeForm.tsx` | der Kenner eines bestimmten Bezirks, auf jedem Zeiteintrag — und von dort im Lohnexport |

**Das Kennzeichen ist derselbe Fehler wie das fest verdrahtete Firmenlogo vom
15.09.**: eine Aussage über einen bestimmten Betrieb im Quelltext, die erst
beim zweiten Kunden auffällt — also genau dann, wenn sie am teuersten ist.

### Warum es mehr war als vier Einstellungen

**Ein Baustellen-Vorsatz allein hätte nichts bewirkt.** Es gab keinen
Nummerngenerator für Baustellen, also niemanden, der ihn anwendet. Deshalb
bekommt die Baustelle denselben gesperrten Zähler wie Rechnung und Angebot —
und das Formular schlägt die nächste Nummer vor, **überschreibbar**: manche
Betriebe führen die Nummer des Bauträgers oder des Architekten.

Gerechnet wird der Vorschlag örtlich, vergeben wird er serverseitig — dasselbe
Vorgehen wie bei den Rechnungen und aus demselben Grund: würde beim Öffnen der
Maske eine Nummer aus dem Zähler gezogen, verbrauchte jedes Abbrechen eine.

### Drei Entscheidungen, die im Code begründet stehen

**`null` heisst „nicht festgelegt", leer heisst „ausdrücklich keiner".** Ohne
diesen Unterschied käme ein Betrieb seinen Vorsatz nie los — jede leere Eingabe
fiele auf die Vorgabe zurück. Deshalb steht in der Spalte auch kein `default`:
eine Vorgabe dort wäre dieselbe Aussage wie ein fest verdrahteter Wert, nur an
einer anderen Stelle.

**Das Kennzeichen hat als einziges KEINE Vorgabe.** `WZ` als Vorgabe zu
behalten hiesse, ihn jedem neuen Betrieb aufzustempeln. Die bestehenden
Bestände übernimmt die Migration aus den DATEN — `where exists (select 1 from
time_entries where vehicle_plate like 'WZ-%')` statt `where company_id =
'perl'`; eine Betriebskennung im Quelltext wäre genau der behobene Fehler.

**Vier Spalten und kein JSON-Feld**, obwohl `rates` und `modules` daneben JSON
sind. Deren Begründung („Einstellungen, nach denen niemand filtert") trifft
auch hier zu; was dazukommt, ist die harte Formprüfung. Der Wert landet im
Dateinamen des Rechnungs-PDFs und in der CSV für den Steuerberater, und ein
`check` auf einer typisierten Spalte ist die einzige Sperre, an der auch ein
direkter Schreibzugriff nicht vorbeikommt.

### Was das Auslesen trägt

`lfdNummerVon` liest die **Ziffern am Ende**, nicht den Vorsatz. Ein Betrieb,
der im Juli von `RE-` auf `R-` umstellt, hat einen lückenlosen Zahlenkreis in
zwei Schreibweisen — würde der Vorsatz mitgeprüft, finge die Zählung wieder bei
1001 an und risse genau die Lücke, die der Steuerberater erklären lassen will.

### Zwei eigene Fehler, beide von Prüfungen gefunden

**Ein regulärer Ausdruck hat einen Kommentar geschlossen.** `\s*/` im
Kopfkommentar von `praefixe.ts` enthält `*/` — der Übersetzer las ab dort Code.
Zwanzig Fehlermeldungen für ein Zeichen.

**Das Feld zeigte den Vorschlag und hielt ihn nicht.** `value={form.projectNumber
|| nummernVorschlag}` sieht richtig aus und ist es nicht: das Feld wird
kontrolliert gezeichnet, im Zustand stand die leere Zeichenkette. Wer tippte,
bekam `B-2026-00012026-042`. Gefunden hat das `AdminProjectsView.test.tsx`,
nicht das Nachdenken — der Vorschlag gehört in den Zustand.

---

## Erledigt: die Liste zuerst, das Formular auf Klick (18.09.2026)

**Gefragt war, ob das lange Anlege-Formular oben in jedem Reiter Sinn ergibt.
Gemessen** am Telefon (390 × 780 px, davon nach Kopf- und Fussleiste rund
590 px sichtbar), bis zur ersten vorhandenen Zeile:

| Ansicht | vorher | jetzt |
| --- | --- | --- |
| Baustellen | **1590 px** (2,7 Bildschirme) | **276 px** |
| Angebote | 1332 px | 256 px |
| Kunden | 1175 px | 431 px |
| Benutzer | 932 px | 385 px |
| *Wartungen* | *276 px* | *unverändert* |

**Die letzte Zeile ist der eigentliche Befund: `WartungenView` machte es
bereits richtig** — Knopf im `PageHeader`, Formular klappt auf, Listen oben.
Es war also keine Geschmacksfrage, sondern eine **Inkonsistenz**: eine von
sechs Ansichten hatte das Muster, fünf nicht. Und `PageHeader` trägt den
`action`-Platz dafür seit jeher.

### Warum das Schnelligkeits-Argument nicht trägt

Das offene Formular sparte beim Anlegen **einen Klick** und kostete beim
Nachschauen **jedes Mal bis zu drei Wischer** — und Nachschauen ist in diesen
Ansichten der Normalfall. Man öffnet Kunden, um einen Kunden zu *finden*.

Dazu ein Schaden, der nicht in Pixeln zu messen ist: eine Maske ganz oben
sieht aus wie der **Zweck** der Seite. Wer die Baustellenliste sucht, sah
zuerst ein leeres Formular.

**Kein schwebender +-Knopf.** Er verdeckt am Telefon die letzte Listenzeile,
und unten liegt bereits die Leiste mit fünf Symbolen. Er wäre die erste
schwebende Schaltfläche dieser App — eine Sonderform für einen Fall, den der
Kopfzeilen-Knopf löst.

### Zwei Ansichten bleiben, wie sie sind

**Zeiterfassung und Urlaub.** Dort ist das Formular der Zweck: der Monteur
öffnet die Zeiterfassung, um zu buchen, nicht um zu blättern. Ein zusätzlicher
Klick wäre dort echter Verlust — und die Zeitbuchung ist der häufigste Vorgang
der ganzen App. Das ist die Trennlinie, die die Frage beantwortet: *steht man
vor der Ansicht, um etwas anzulegen, oder um etwas nachzusehen?*

### Eine Verschlechterung, die dabei fast entstanden wäre

In der Benutzerverwaltung trägt `error` **zwei** Dinge: das gescheiterte Laden
der Liste und das gescheiterte Anlegen — angezeigt wurde er aber nur **im
Formular**. Solange das immer offen stand, fiel das nicht auf. Zugeklappt wäre
ein Ladefehler unsichtbar geworden: die Liste bliebe leer, und niemand erführe,
warum. Gefunden hat das `UserMgmtView.test.tsx`; der Fehler steht jetzt
ausserhalb des Formulars, wo er hingehört.

---

## Erledigt: was auf 375 px umbrach — und das Plus am Knopf (18.09.2026)

**Gemeldet mit zwei Bildschirmfotos vom iPhone XS: „manche Dinge brechen noch
komisch um."** Statt zu raten, nachgemessen — eine wegwerfbare
Playwright-Sonde bei **375 px** über sechs Ansichten, die jedes Element meldet,
das über den Rand ragt.

**Kein einziges tat das.** Waagrecht scrollte nichts. Die Meldung war also
richtig und die naheliegende Erklärung falsch: es waren **drei verschiedene
Sachen**, von denen nur eine überhaupt ein Umbruch war.

### 1. Ein Eurozeichen zu viel — und der Grund dafür trägt weiter

Auf der Mahnlauf-Karte stand **„€ 22 104,60 € offen"**. Sechs Stellen in
`InvoicesView` hängten ein zweites Zeichen an einen Betrag, der es schon trug.

Der Grund ist nicht Unachtsamkeit, sondern **der Name**: `fmtEUR` gibt es in
**acht** Dateien, vier stellen das Zeichen voran, vier nicht. Wer aus der
Nachbardatei abschreibt, schreibt die falsche Hälfte ab — und auf einen
einzelnen Betrag geschaut fällt das nie auf, nur auf dem Beleg.

Zusammengelegt wurden die acht **nicht**: zwei erzeugen PDFs, und die
Startseite rundet auf ganze Euro. Stattdessen eine Prüfung
(`tests/unit/eurozeichen.test.ts`), die für jede Fassung mit vorangestelltem
Zeichen jede Aufrufstelle danach absucht — samt einem Wächter über den
Wächter, der meldet, wenn die acht Kopien einmal verschwinden und die Prüfung
damit ihre Grundlage verliert.

### 2. Das ✕ stand allein in der zweiten Zeile

In der Baustellenliste lagen rechts **fünf** Elemente: Budget-Marke, Zustand,
„Schein", „Akte" und das ✕. Das letzte passte nicht mehr und rutschte allein
nach unten — **ausgerechnet die einzige unumkehrbare Aktion stand damit am
auffälligsten da.**

Nur das ✕ ins Zeilenmenü zu verschieben half nicht: nachgemessen rutschte
danach das Menü selbst. **Fünf passen auf 375 px nicht, gleich welches zuletzt
kommt.** Also geht „Schein nachtragen" mit — es ist der Ausnahmefall, der
Monteur hat den Schein vor Ort vergessen, und als eigener Verweis stand er
gleichauf mit der Akte, die man täglich braucht.

Die Regel dafür stand längst in `ListRow`: *„Wo es mehr als zwei Aktionen gibt,
gehört alles Seltene in ein RowMenu."* Sie war nur nicht befolgt. Ein Test hält
die Zahl jetzt fest.

### 3. Das Datum brach mitten durch

In der Rechnungsliste stand die Unterzeile als ein einziger Fluss — der Umbruch
fiel dorthin, wo gerade Platz war, auch **mitten in ein ISO-Datum**. Jetzt
darf sie nur noch **zwischen** den Feldern brechen.

### Was nicht behoben wurde, und warum

Die Kennzahlen-Leiste zeigt drei Karten in zwei Spalten; die dritte steht
allein. Ein `col-span-2` auf die letzte war der naheliegende Griff — **gemessen
änderte er nichts** (die Karte ist ohnehin so breit), und drei Spalten
schneiden „€ 22 104,60" ab. Also blieb die Klasse draussen und ein Kommentar
drin: eine Klasse, die etwas behauptet, was sie nicht tut, ist schlimmer als
keine.

### Das Plus

Vor „Neuer Kunde", „Neue Baustelle", „Neues Angebot", „Neuer Benutzer" und
„Neue Wartung" steht jetzt ein Pluszeichen — zwei Striche, das einzige Zeichen
der Sammlung, das kein Gegenstand ist. Es ist `aria-hidden`; der Knopf heisst
weiter „Neuer Kunde", und die über zwanzig Tests, die ihn über genau diesen
Namen finden, sind der Wächter dafür.

---

## Erledigt: Der Zahlungseingang — die Wurzel von Stufe 10 (19.09.2026)

Bis hierher war „Bezahlt" ein Haken. Kein Datum, kein Betrag, keine
Teilzahlung. Das ist mehr als eine fehlende Angabe: **der Mahnlauf rechnete
mit dem Bruttobetrag.** Wer auf eine Rechnung über 1.000 € vierhundert
überweist, wurde über 1.000 € gemahnt — und eine zu hohe Mahnung bestreitet
der Kunde zu Recht.

### Eine eigene Tabelle, kein Feld an der Rechnung

`zahlungseingaenge(rechnung, datum, betrag, art, hinweis)`. Teilzahlungen sind
im Handwerk der Normalfall — Anzahlung, Abschlag, Rest —, und ein Betrag am
Beleg könnte immer nur den letzten festhalten.

**Negative Beträge sind erlaubt, null ist es nicht.** Eine Rückzahlung ist
derselbe Vorgang mit umgekehrtem Vorzeichen; ohne sie bliebe eine überzahlte
Rechnung für immer überzahlt. Ein Eingang über null ist dagegen kein Vorgang,
sondern ein Vertipper.

### Der Stand wird abgeleitet, nicht gesetzt

`app.zahlstand_setzen` rechnet aus den Eingängen: **Offen → Teilbezahlt →
Bezahlt → Überzahlt**, und „Storniert" bleibt „Storniert". Dazu zwei neue
Zustände, beide eine Tatsache und keine Stimmung: „Teilbezahlt" ist weder
offen noch bezahlt, und „Überzahlt" ist der Fall, den man nicht sehen will und
deshalb sehen muss — es steht eine Rückzahlung aus.

**Der Haken verschwindet in der DATENBANK, nicht nur in der Oberfläche.**
`app.rechnung_eingefroren` weist einen Schreibversuch auf „Bezahlt",
„Teilbezahlt" oder „Überzahlt" ab, ebenso jede Änderung am bezahlten Betrag.
Was der Aufrufer weiterhin darf: „Offen" und „Überfällig" (das hängt am Datum,
nicht am Geld) und den Storno. Stünde die Grenze nur in der Ansicht, wäre sie
beim nächsten Formular wieder weg — und danach behaupteten zwei Quellen
denselben Stand.

### Drei Fallen, die dabei zugeschnappt sind

1. **Der Altbestand.** Rechnungen aus der Zeit vor der Tabelle tragen
   „Bezahlt" und einen bezahlten Betrag von null. Der Mahnlauf rechnet ab
   jetzt mit dem Rest — ohne Nachtrag hätte der erste Lauf **den gesamten
   Altbestand gemahnt.** Die Migration trägt die Summe nach; zusätzlich
   verlangt `darfMahnen`, dass Status UND Zahl „offen" sagen. Eine Regel, die
   nur mit geglückter Migration richtig ist, ist keine Regel, sondern eine
   Annahme. **Zahlungseingänge erfindet die Migration dabei nicht** — ein
   Eingang trägt ein Datum, und das weiss hier niemand.
2. **Die Mahnung auf eine angezahlte Rechnung.** `mahnungFesthalten` schrieb
   „Überfällig" mit. Bei einer teilbezahlten Rechnung weist die Datenbank das
   jetzt ab — die Mahnung wäre erzeugt und nirgends festgehalten worden.
   Gefunden hat es der Datenbanklauf, nicht das Nachdenken.
3. **`get diagnostics` liest die LETZTE Anweisung.** Beim Umbau von
   `rechnung_stornieren` stand das Zurücksetzen des Merkers zwischen dem
   UPDATE und der Zeilenzählung — damit hätte ein Storno auf eine Rechnung,
   die es nicht gibt, still durchgelaufen. Gemeldet von einer Prüfung, die es
   seit dem 08.09.2026 gibt.

### Was noch mitkam

- **Der Buchhaltungs-Export** führt „Bezahlt" und „Offener Rest" als eigene
  Spalten. Zwei und nicht eine: bei einer stornierten Rechnung mit Zahlung ist
  der Rest null UND der bezahlte Betrag positiv — dort liegt ein Guthaben.
- **Dabei gefunden:** die Summenzeile des Exports stand unter den falschen
  Spalten (Netto unter „UID-Nummer", Brutto unter „USt-Satz %"). Sie richtet
  sich jetzt nach der Kopfzeile aus, nicht nach abgezählten Strichen.
- Die Kennzahlen der Rechnungsansicht und die Forderungen auf der Startseite
  rechnen mit dem Rest; „Bezahlt" ist dort die Summe des tatsächlich
  eingegangenen Geldes, auch aus Teilzahlungen.
- Die Mahnung nennt „Bereits bezahlt" als eigene Zeile und fordert den Rest.
  Nur den Rest zu nennen sähe aus wie eine Mahnung über eine andere Rechnung;
  nur das Brutto wäre falsch.

### Geprüft

11 neue Datenbankprüfungen, davon sechs, die gegen absichtlich kaputte
Datenbank fallen (Ableitung, beide Riegel, der Wächter über den Betrieb, das
Storno-Aufheben). Vier Ansichtstests, alle vier gegen kaputten Code geprüft.
Der Durchklick „Rechnung stellen" geht jetzt bis zur Teilzahlung durch — Zeit
buchen, abrechnen, Geld erfassen, und der Stand steht in der Datenbank.

**Offen aus 10.1:** Skonto und Verzugszinsen rechnen weiterhin nicht. Beide
brauchen jetzt nur noch das, was hier entstanden ist — der Zahlungszeitpunkt
steht fest.

---

## Erledigt: Firebase abgebaut — ein Datenmodell statt zwei (19.09.2026)

Stufe 9 des Fahrplans, in zwei Zügen. Bedingung des Auftraggebers: *„wenn
Funktionen dadurch nicht beschädigt oder verloren gehen, zieh durch, ansonsten
lassen wir das hybride Datenbankmodell vorerst."* Sie war erfüllt, und zwar
nachweislich:

- **Produktiv lief die Firestore-Seite längst nicht mehr.** `deploy.yml` baute
  seit Stufe 8 mit `VITE_DATENQUELLE` auf `postgres`. Was hier entfernt wurde,
  war ausgelieferter, aber toter Code.
- **Alle vierzehn Cloud Functions haben einen Ersatz mit Prüfung.** Nachgesehen
  eine nach der anderen: Urlaubsentscheidung, Scheinvorbereitung,
  Ansprüche ins Token, Monatszahlen, Push, Schein-Prüfsumme, Betriebsauszug,
  nächtliche Ausleitung, Betrieb anlegen. Für jede steht der Nachweis in
  `tests/supabase/`.

### Was rausging

Die Datenschicht (20 Weichen) zeigt jetzt direkt auf `pg/`; `db/fs/` (20
Dateien), `auth/fs/`, `lib/db/quelle.ts`, `lib/functions.ts` und `lib/features.ts`
sind weg. Dazu `functions/` mit vierzehn Functions, `firestore.rules`,
`firestore.indexes.json`, `storage.rules`, zwei Workflows und die
Emulator-Prüfungen. `lib/firebase.ts` ist von 137 auf 57 Zeilen geschrumpft
und lädt seither **faul**: ohne Firebase-Werte startet die App vollständig,
nur ohne Push.

**Die KI-Spracherfassung ging in derselben Bewegung raus** — ersatzlos, wie
geplant. Ein abgeschalteter Bereich, den niemand einschalten wird, ist Ballast.
Zurück bleibt eine Folge, die hier benannt und nicht verschwiegen wird: die
**Wiedervorlagen** (`follow_ups`) hatten nur dort ihren Eingang. Tabelle,
Richtlinien und Datenschicht stehen, aber keine Ansicht schreibt mehr hinein.
Entweder bekommt der Bereich einen echten Eingang oder er fällt weg; das ist
eine Produktentscheidung. Steht in `UEBERGABE.md` §6.

### Was dabei NICHT verlorengehen durfte

Zwei Prüfungen hingen an Firestore-Dateien und hätten beim Löschen still an
Wert verloren:

- **`vollstaendigkeit.test.ts`** las die Titel aller 155 Regelprüfungen aus
  `tests/firestore.rules.test.ts`, um zu beweisen, dass jede davon einen
  Postgres-Nachfolger hat. Die Datei geht weg, die Beweislast nicht: die 155
  Titel liegen jetzt eingefroren in `tests/supabase/regelnAusFirestore.txt`.
  Ein Vergleich gegen eine gelöschte Datei wäre grün geworden, weil es nichts
  mehr zu vergleichen gab — genau die Sorte Grün, die nichts festhält.
- **Vier Unit-Tests auf Firestore-Nutzlasten** (Retoure, Scheinzustand,
  Wartung erledigt, Indexabgleich) prüften, welche Felder geschrieben werden.
  Postgres prüft dasselbe stärker — gegen eine echte Datenbank. Eine
  Aussage fehlte dort: dass bei **zwei gleichnamigen Artikeln** gar nichts
  zurückgebucht wird (`app.katalogeintrag` mit `having count(*) = 1` liefert
  NULL). Sie ist nach `tests/supabase/modulLager.test.ts` übernommen worden.

Neu dazu kam eine Indexregel in `schema.test.ts`: jede Mandantentabelle
braucht einen Index mit `company_id` oder einem Fremdschlüssel als führender
Spalte. Die erste Fassung war zu streng und meldete acht Kindtabellen, die
ihren Index korrekt am Elternschlüssel hatten — korrigiert, nicht aufgeweicht.

### Der tote Schalter

`VITE_DATENQUELLE` war die Rückfalltür für Stufe 8. Mit der Firestore-Seite
ist sie eine Zusage, die niemand mehr einlösen kann. Sie steht deshalb nirgends
mehr — und `tests/unit/bauUmgebung.test.ts` hält fest, dass sie nicht
zurückkommt. **Ein Schalter, der nichts mehr schaltet, ist gefährlicher als
keiner:** der Nächste legt ihn im Ernstfall um und wundert sich.

Dieselbe Prüfung fand beim Schreiben einen echten Fehler: die Vorabprüfung des
Deploys hielt `VITE_FIREBASE_PROJECT_ID` für einen reinen Push-Wert. Sie steht
aber im Deploy als `--project` und entscheidet, **wohin** veröffentlicht wird.
Ohne sie wäre die Prüfung durchgelaufen, der Build gelungen und der letzte
Schritt gescheitert. Jetzt ist sie Pflicht, und ein Test vergleicht die
Prüfliste mit dem, was die Deploy-Schritte tatsächlich brauchen.

### Die Dokumentation

`README.md` (626 → 211 Zeilen), `docs/DEPLOYMENT.md`, `docs/UEBERGABE.md` und
`docs/FUNKTIONEN.md` beschrieben durchgehend das alte System — bis hin zu Einrichtungsschritten, die
ins falsche Projekt führen. Alle drei neu geschrieben. Die teuer bezahlten
Fallen aus der Firestore-Zeit sind dabei **nicht** gelöscht worden: vier davon
stehen in `UEBERGABE.md` §4 als eigener Block, jede mit dem, was heute an ihrer
Stelle steht. Eine Falle verliert ihren Wert nicht dadurch, dass die Technik
gewechselt hat.

`FUNKTIONEN.md` trug seit dem 16.09.2026 einen Vorbehalt ganz oben: die Datei
sei in der Firestore-Zeit geschrieben und werde **mit Stufe 9** umgeschrieben.
Das ist eingelöst — samt der Spalte „Geprüft wodurch", deren Zahlen jetzt aus
dem Prüflauf vom 19.09.2026 stammen und nicht aus dem Gedächtnis.

### Zwei Sätze, die seit dem Umzug nicht mehr stimmten

Beim Durchgehen der Kommentare fielen zwei Begründungen auf, die auf Firestore
zeigten und deshalb keine mehr sind:

- **`lib/frist.ts`** begründete die fehlende Frist bei Schreibvorgängen damit,
  dass Firestore sie lokal annimmt und nachreicht. Das leistet heute das
  Ausgangsfach — dieselbe Zusage, anderer Mechanismus.
- **Die Scheinsuche** sagte, nach einem Kundennamen lasse sich nicht
  serverseitig suchen, weil Firestore keine Volltextsuche kann. `customer_name`
  und `notizen` stehen als Spalten am Schein, und die Kunden-, Baustellen- und
  Wartungssuche macht genau das bereits über `ilike`. **Der Grund ist weg, die
  Einschränkung noch da** — nachgezogen ist es nicht. Das steht jetzt so in der
  Ansicht und als offener Punkt in `FUNKTIONEN.md`; es ist ein kleiner
  Handgriff, aber einer mit eigener Prüfung, und der gehört nicht in denselben
  Zug wie ein Abbau.

Dazu ist `lib/offlineWrite.ts` gefallen: die Hülle, die auf Firestores
Bestätigung wartete. Ihre einzige lebende Zeile war ein Fehlerkanal, den nichts
mehr speiste; `tests/unit/ausgangsfachNaht.test.ts` hält jetzt fest, dass sie
nicht zurückkommt. **Ein zweiter Weg, der dasselbe verspricht, wäre genau der,
den niemand mehr nachsendet.**

### Geprüft

1710 Unit- und Ansichtstests (141 Dateien), 728 Datenbanktests (50 Dateien),
vier Wege im echten Browser, Lint, Typprüfung und Bau — alles grün. Kein
`firebase/firestore`, `firebase/auth` oder `firebase/functions` mehr in `src/`,
`tests/` oder `shared/`.

---

## Der Weg zum Start in Österreich (Abgleich vom 18.09.2026)

Dieser Abschnitt ist die Antwort auf eine durchgesehene Liste offener Punkte
für einen Start in Österreich. Er steht hier und nicht in FUNKTIONEN.md, weil
er **Vorhaben** beschreibt und keine Wirklichkeit.

**Zuerst der Abgleich mit dem Code, nicht mit dem Handbuch.** Fünf Punkte der
Liste sehen im Licht des Quelltextes anders aus:

| Punkt | Wirklichkeit im Code |
| --- | --- |
| „Warnt erst ab 14 Stunden" | **Die Zeiterfassung warnt ab 12 h** (`LANGER_TAG_MIN`, § 9 AZG). Die 14 h sind die Rückfrage an der *Leistungszeit des Handwerksscheins* — eine andere Zahl mit einem anderen Zweck. Offen sind 60 h/Woche und die 11 h Ruhezeit. |
| „Nummernkreise pro Jahr bzw. Präfix wählbar" | **Erledigt am 18.09.** `number_counters` zählt je Jahr, vier Vorsätze sind einstellbar. Offen bleibt das Briefpapier. |
| „UID muss über 10.000 € auf der Rechnung stehen" | **Erledigt.** Offen ist das *Prüfen* der UID — und dafür ist VIES nicht das Werkzeug (siehe A4). |
| „Änderungsprotokoll der Zeiteinträge" | Es gibt `lastEditedBy/At` — den **letzten** Bearbeiter, keine Historie. Der vorletzte Stand ist unwiederbringlich weg. |
| „Wegzeit als Lohnart" | Die Wegzeit **wird erfasst und exportiert** (beide CSVs). Offen ist ihre *Bewertung* nach KV. |

**Und ein Befund, der in der Liste fehlt und sie zugleich ordnet:**

> ### Es gibt keinen Zahlungseingang.
>
> `paymentStatus` kennt „Bezahlt", aber **kein Datum und keinen Betrag**. Den
> Haken setzt ein Mensch. Damit fehlt die Grundlage für vier Punkte der Liste
> auf einmal: **Skonto** braucht den Zahlungstag, **Anzahlungen** brauchen
> Teilbeträge, **Verzugszinsen** brauchen die Dauer des Verzugs, und die
> **offenen Posten** rechnen heute mit dem Bruttobetrag statt mit dem, was
> wirklich aussteht.
>
> Der Zahlungseingang ist deshalb **kein eigener Punkt, sondern die Wurzel von
> A2, A3 und A6.** Er kommt zuerst, sonst baut man dreimal daneben.

---

### Einstellbar, und wo nicht — der Maßstab für alles Folgende

**Nachtrag vom 19.09.** Die Vorgabe lautet: nichts soll entweder-oder sein,
sondern je Betrieb einstellbar. Das ist richtig und hat eine Grenze. Die
Punkte fallen in drei Fächer, und das dritte ist der Grund, warum es diesen
Absatz gibt:

| Fach | Wofür | Beispiele |
| --- | --- | --- |
| **Modul** (an/aus) | Was ein Betrieb gar nicht hat | E-Rechnung, Wartungsprotokolle, Dokumentenablage |
| **Einstellung** (ein Wert) | Was jeder hat, aber anders | Urlaubsjahr, Zahlungsarten, Mahnspesen, Vorsätze |
| **Fest** | Wo „anders" schlicht „falsch" heisst | Die Zwölfstundengrenze, die USt auf den Rücklass, die Steuerschuld kraft Rechnungslegung |

Die Zwölfstundengrenze ist **kein Geschmack, sondern § 9 AZG**. Sie
einstellbar zu machen hiesse, einem Betrieb anzubieten, sie falsch zu setzen —
und dann steht die App im Prüfbericht. Dasselbe beim Rücklass: „Umsatzsteuer
auf den vollen Betrag" ist keine Vorliebe, und ein Schalter dafür wäre ein
Schalter für eine falsche Umsatzsteuervoranmeldung.

Und der Preis, der bei jeder Einstellung mitläuft: **ein Schalter ist ein
Zweig, der in beiden Stellungen geprüft, dokumentiert und im Support
beantwortet werden muss.** Zehn Schalter sind tausend Kombinationen. Deshalb
nur dort, wo Betriebe sich wirklich unterscheiden — und dort dann vollständig,
nicht halb.

---

### Die Reihenfolge, und warum sie so ist

Nicht nach Aufwand und nicht nach Vorschriftennähe, sondern danach, **was
woraufliegt**. Drei Ketten:

1. **Zahlungseingang → Anzahlung/Teil/Schluss → Rücklass/Skonto → Mahnwesen
   B2B/B2C.** Jedes Glied braucht das vorige. Wer die Teilrechnung vor dem
   Zahlungseingang baut, baut sie ein zweites Mal.
2. **Firebase-Abbau → alles andere.** Jede Änderung am Datenmodell muss heute
   in *zwei* Zweigen nachgezogen werden (`db/fs` und `db/pg`, 20 Dateien). Das
   ist doppelte Arbeit für einen Zweig, der nie wieder läuft.
3. **Betriebsbereitschaft → zweiter Betrieb → Abo.** Eine eigene Domain
   nachträglich zu wechseln, nachdem der erste Monteur die App auf den
   Startbildschirm gelegt hat, heisst: er behält die alte.

---

### Stufe 9 — Firebase abbauen (**ERLEDIGT am 19.09.2026**, siehe oben)

Unverändert wie bisher geplant, mit **einer Ergänzung**: die KI-Erfassung geht
in derselben Bewegung raus. Ein abgeschalteter Bereich, den niemand
einschalten wird, ist Ballast, den jede spätere Änderung mitschleppt — und
ein toter Pfad, der noch kompiliert, ist der, den jemand versehentlich wieder
anschliesst.

Dazu gehört ein Fund von heute: **`docs/DEPLOYMENT.md` beschreibt ein System,
das es nicht mehr gibt.** Firestore-Region, Firebase-Auth, Bootstrap über ein
Dienstkonto, und eine DSGVO-Checkliste, die auf Google als Auftragsverarbeiter
zeigt. Wer danach ausliefert, richtet das falsche Projekt ein.

---

### Stufe 10 — Rechnung, wie Österreich sie verlangt

Die grösste **funktionale** Lücke, nicht die grösste rechtliche: ein Betrieb,
der Baustellen abwickelt und keine Teilrechnung stellen kann, kann die App für
Baustellen nicht verwenden.

#### 10.1 Zahlungseingang (die Wurzel) — **ERLEDIGT am 19.09.2026**, siehe oben

Eine eigene Tabelle `zahlungseingaenge(rechnung, datum, betrag, art, hinweis)`
statt eines Feldes an der Rechnung. Begründung: Teilzahlungen sind der
Normalfall, und ein Betrag am Beleg könnte nur den letzten festhalten.

- `paymentStatus` wird **abgeleitet** statt gesetzt: offen / teilbezahlt /
  bezahlt / überzahlt. Der Haken von Hand verschwindet.
- Die Ansicht „offene Posten" und der Mahnlauf rechnen ab dann mit
  **Restbetrag**, nicht mit Brutto.
- **Die Falle:** eine stornierte Rechnung mit Zahlungseingang. Das Geld ist
  da, die Forderung nicht mehr — das muss als Guthaben stehenbleiben und darf
  nicht verschwinden.
- **Fertig heisst:** eine Rechnung über 1.000 €, auf die 400 € eingehen,
  erscheint im Mahnlauf mit 600 € und nicht mit 1.000 €.

#### 10.2 Anzahlungs-, Teil- und Schlussrechnung

`Invoice.art: 'einzel' | 'anzahlung' | 'teil' | 'schluss'` und
`vorrechnungen: string[]` an der Schlussrechnung.

- Die Schlussrechnung zieht die **bereits verrechneten Teilentgelte samt USt**
  ab und weist sie einzeln aus. Ohne diesen Abzug schuldet der Betrieb die
  Steuer zweimal (§ 11 Abs 12 UStG — Steuerschuld kraft Rechnungslegung).
- **Die Anzahlung verbraucht nichts.** Sie ist ein freier Betrag ohne
  Zeiteinträge und ohne Scheine. Täte sie es, wären die Stunden als
  `isBilled` markiert und die Schlussrechnung fände sie nicht mehr.
- **Die Falle, die niemand sieht:** die Nachkalkulation summiert heute
  Rechnungsbeträge. Mit Anzahlung *und* Schlussrechnung stünde derselbe Erlös
  zweimal da und die Baustelle sähe doppelt so gut aus, wie sie ist. Der
  Deckungsbeitrag ist die Zahl, wegen der jemand diese Ansicht öffnet.
- **Fertig heisst:** eine Baustelle mit 3.000 € Anzahlung und 10.000 €
  Gesamtleistung zeigt in der Nachkalkulation 10.000 € Erlös, die
  Schlussrechnung fordert 7.000 €, und die Summe der offenen Posten ist zu
  keinem Zeitpunkt grösser als die Gesamtleistung.

#### 10.3 Haft- und Deckungsrücklass, Skonto

Alle drei mindern **den Zahlungsbetrag, nicht das Entgelt**. Genau daran
scheitert die naheliegende Umsetzung:

- Ein Rücklass als „Rabatt" gebucht würde die **Umsatzsteuer kürzen** — und
  die ist auf den vollen Betrag geschuldet. Das ist kein Schönheitsfehler,
  das ist eine falsche UVA.
- Skonto mindert das Entgelt **erst, wenn es gezogen wird** (§ 16 UStG). Auf
  der Rechnung steht deshalb eine Bedingung („bei Zahlung binnen 10 Tagen
  3 %"), gebucht wird beim Zahlungseingang — was 10.1 voraussetzt.
- **Die Hälfte, die alle weglassen:** der Haftrücklass wird nach Ablauf der
  Gewährleistung fällig. Ohne Wiedervorlage merkt ihn niemand an, und 3 %
  jeder Baustelle bleiben beim Kunden liegen. Die Erinnerung ist der
  eigentliche Wert.
- **Fertig heisst:** eine Rechnung mit 5 % Deckungsrücklass weist volle 20 %
  USt aus, der Mahnlauf mahnt den Rücklass nicht, und drei Jahre später steht
  er als fälliger Posten auf der Startseite.

#### 10.4 Unternehmer oder Verbraucher — und was daran hängt

`Customer.istUnternehmer` fehlt, und an dieser einen Angabe hängen drei
Regeln, die heute alle gleich behandelt werden:

- **Mahnspesen:** B2B trägt § 458 UGB (40 € Pauschale zusätzlich zu den
  tatsächlichen Kosten). Beim **Verbraucher sind pauschale Mahnspesen
  regelmäßig unwirksam** — § 1333 Abs 2 ABGB verlangt Angemessenheit und ein
  Verhältnis zur Forderung. Dieselbe Staffel für beide anzuwenden ist die
  Sorte Fehler, die einen Konsumentenschutzbrief auslöst.
- **Reverse Charge** ist bei einem Verbraucher von vornherein ausgeschlossen —
  heute lässt sich der Haken bei jedem Kunden setzen.
- **Das Zahlungsziel** darf sich unterscheiden.

> **NACHTRAG 19.09. — Verzugszinsen werden NICHT gerechnet.** Eine frühere
> Fassung dieses Abschnitts schlug es vor; zu Ende gedacht trägt es nicht.
> B2B sind es 9,2 Prozentpunkte über dem Basiszinssatz (§ 456 UGB), B2C 4 %
> (§ 1000 ABGB) — und der Basiszinssatz ändert sich halbjährlich, wobei der
> Satz zu Beginn des Halbjahres gilt, in dem der Verzug eintrat. Das braucht
> eine Tabelle `(gueltigAb, satz)` und eine Halbjahreslogik, **für eine Zahl,
> die nach der bestehenden Entscheidung ohnehin auf keiner Mahnung steht.**
> Was bleibt, ist das Kennzeichen am Kunden: ein Feld, drei Wirkungen.

#### 10.5 UID prüfen — und warum VIES die Frage nicht beantwortet

Zwei verschiedene Dinge, die leicht verwechselt werden:

- **Ist die UID gültig?** Das beantwortet VIES.
  **NACHTRAG 19.09. — wird trotzdem nicht gebaut.** Eine frühere Fassung
  empfahl die Abfrage; zu Ende gedacht kostet sie eine Edge Function, einen
  Zwischenspeicher, drei Zustände in der Oberfläche („nicht geprüft" muss von
  „geprüft und ungültig" unterscheidbar bleiben) und einen Ausfallweg, weil
  VIES regelmäßig nicht antwortet — für fünf Eingaben im Jahr, und ohne die
  entscheidende Frage zu beantworten. Gebaut wird stattdessen eine
  **Formatprüfung** (ATU plus acht Stellen plus Prüfziffer): zwanzig Zeilen,
  die den Fehler fangen, der wirklich vorkommt — den Tippfehler.
- **Ist der Empfänger Bauleister?** Davon hängt § 19 Abs 1a ab, und **das sagt
  VIES nicht.** Das ist eine Erklärung des Kunden. Sie gehört als solche
  festgehalten: wer sie wann abgegeben hat, mit Feld für das Schreiben des
  Kunden. Eine geprüfte UID als Beleg für Reverse Charge auszugeben wäre eine
  Sicherheit, die nicht besteht.

#### 10.6 Zwei billige Felder jetzt, damit später keine Wanderung nötig ist

`auftragsreferenz` (Bestellnummer des Kunden) und `lieferantennummer`. Beide
sind in **ebInterface** Pflicht- bzw. Schlüsselfelder. Sie jetzt mitzunehmen
kostet eine Migration; sie später nachzurüsten heisst, durch alle bestehenden
Rechnungen zu wandern.

---

### Stufe 11 — Arbeitszeit und Urlaub, wie das Gesetz sie verlangt

#### 11.1 Die Grenzen, die noch fehlen

12 h/Tag steht. Es fehlen **60 h/Woche** (§ 9 AZG), **11 h Ruhezeit** zwischen
zwei Arbeitstagen (§ 12 AZG) und die **36 h Wochenruhe** (§ 3 ARG).

- **Die Falle:** die Ruhezeit wird über Mitternacht gerechnet. Genau die
  Nächte, um die es geht — Notdienst —, sind die, bei denen `endTime <
  startTime` gilt. Die bestehende Mitternachtslogik muss die Grundlage sein,
  nicht eine zweite Rechnung daneben.
- **Und der wichtigere Teil:** die Warnung gehört **ins Büro**, nicht nur in
  die Maske des Monteurs. Das Arbeitsinspektorat fragt den Arbeitgeber. Also
  eine Liste „Grenzwerte überschritten" in der Mitarbeiterübersicht, je Fall
  mit **Begründungsfeld** — Notdienst und Gefahr in Verzug sind zulässige
  Ausnahmen, aber nur begründet.

#### 11.2 Das Änderungsprotokoll

Append-only, geschrieben von einem **Datenbank-Trigger**, nicht vom Browser.
Ein Protokoll, das der Client schreibt, beweist nichts.

- Alt- und Neuwert, wer, wann, aus welcher Rolle.
- Zeilenschutz: einfügen darf nur der Trigger, lesen nur Buchhaltung und
  Leitung, löschen niemand.
- **Die Lücke, die man dabei übersieht:** die nächtliche Ausleitung muss das
  Protokoll mitnehmen. Sonst überlebt der Bestand einen Rücklauf und der
  Nachweis nicht — und der Nachweis ist der Grund, warum es das Protokoll
  gibt.

#### 11.3 Urlaub nach UrlG

Drei Abweichungen, alle in dieselbe Richtung — **die App gibt zu viel**:

- **Aliquot im Eintrittsjahr.** Heute bekommt jeder den vollen
  Jahresanspruch. Nach § 2 Abs 2 UrlG entsteht er im ersten Arbeitsjahr
  aliquot. Wer im November eintritt, hat nicht 25 Tage.
- **Urlaubsjahr = Arbeitsjahr oder Kalenderjahr.** Das Gesetz sagt
  Arbeitsjahr, die Praxis rechnet oft auf Kalenderjahr um. Die App rechnet
  still auf Kalenderjahr. Das gehört zur Einstellung, nicht zur Annahme.
- **Werktage gegen Arbeitstage.** 25 Arbeitstage stimmen bei der
  Fünftagewoche und nur dort. `workDays` steht je Person längst da — der
  Anspruch gehört daraus gerechnet (fünf Wochen), statt eine Zahl zu setzen.
- **Sechste Woche nach 25 Dienstjahren:** braucht Vordienstzeiten, die
  niemand erfasst hat. Deshalb **vorschlagen und begründen, nicht rechnen** —
  der Anspruch bleibt je Person überschreibbar, wie heute.

#### 11.4 Lohnarten für den KV — die Daten, nicht die Beträge

Was die App liefern kann, ohne sich zu verheben: **die Grundlagen je Lohnart**
in die Ausleitung, mit einer Zuordnung zu den Lohnartennummern der
Lohnverrechnung. Was sie **nicht** tun darf: Kollektivvertragsbeträge rechnen.
Dieselbe Begründung wie beim Nachtzuschlag — eine geschätzte Zahl, die in
einem Lohnzettel landet, ist schlimmer als keine.

- **Kilometergeld** braucht ein Feld, das es nicht gibt: gefahrene Kilometer.
- **Taggeld** braucht Abwesenheitsdauer (aus Von/Bis ableitbar) und die
  Reiseart; die Regel selbst gehört in die Betriebseinstellungen.
- **Durchrechnung und Gleitzeit bleiben draussen.** Sie schreiben die
  Saldenrechnung neu — Durchrechnungszeitraum, Übertragsgrenzen, Verfall. Das
  an den heutigen Monatssaldo anzuflanschen wäre genau die halbe Sache, die
  hier nichts verloren hat. Eigene Stufe, wenn ein Betrieb danach fragt.

---

### Stufe 12 — Betriebsbereit (die Stufe ohne sichtbare Funktion)

Nichts davon sieht ein Monteur. Alles davon merkt man erst, wenn es fehlt.

| Punkt | Was wirklich zu tun ist | Warum es blockiert |
| --- | --- | --- |
| **Eigene Domain** | Domain + Absenderdomain, *vor* dem ersten Startbildschirm-Symbol | Ein späterer Wechsel lässt jede installierte App auf der alten Adresse stehen |
| **SMTP mit SPF/DKIM/DMARC** | Eigener Versender | Der Supabase-Standardversand ist stark gedrosselt — und „Passwort vergessen" ist nach **jedem** Rücklauf für **jeden** Zugang Pflicht |
| **Tarif, Region, PITR** | Pro-Tarif, EU-Region nachweisbar, kein Pausieren | Der kostenlose Tarif **pausiert nach sieben Tagen ohne Zugriff**. Über Weihnachten steht die App |
| **2FA** | TOTP für Leitung, Verwaltung, Buchhaltung | Nur wirksam, wenn der **Zeilenschutz** die Stufe prüft (`aal2`), nicht das Formular. Sonst ist es Zierde |
| **Migrations-Probelauf** | **NACHTRAG 19.09.:** kein zweites Projekt, sondern ein Skript — Kopie des Produktivbestands, Migration darüber, Testlauf. Ein Staging-Projekt verdoppelt Konfiguration und Migrationstanz; das Risiko liegt aber nicht im Code (2 766 Prüfungen, davon 725 gegen eine echte Datenbank), sondern in Migrationen gegen ECHTE DATEN — und genau die hat ein leeres Staging-Projekt nicht | Heute läuft jede Migration zuerst beim Kunden |
| **Fehler-Tracking** | Sentry EU, Statusseite, Uptime | **Mit vorher eingerichteter Feldbereinigung** — ein Tracker, der Kundennamen und Adressen mitschickt, ist selbst ein Datenschutzproblem |
| **CSP und Kopfzeilen** | Erst `report-only`, dann scharf | Eine zu enge Richtlinie bricht die App still — auf dem Telefon sieht man nur eine leere Seite |
| **DSGVO-Paket** | AV-Vertrag, Unterauftragsverarbeiter, TOMs, Verarbeitungsverzeichnis | Ohne AV-Vertrag darf ein zweiter Betrieb die App nicht einsetzen |
| **§ 96 ArbVG** | Reine Zeiterfassung ist unkritisch | **Als Sperre festhalten:** kein GPS, solange keine Betriebsvereinbarung vorliegt. Eine Ortung nachzurüsten ist technisch eine Stunde und rechtlich ein halbes Jahr |

#### 12.x Die Warteschlange und der Fassungswechsel

Der Punkt aus der Liste, der am leichtesten übersehen wird und am teuersten
ist: eine Vormerkung im Ausgangsfach trägt heute **`daten: Record<string,
unknown>` ohne jede Fassungsangabe**. Wird zwischen Erfassung und Nachsenden
eine Schemaänderung eingespielt, geht die Buchung still verloren.

- Jede Vormerkung bekommt die **Fassung** der App, die sie erzeugt hat.
- Migrationen bleiben für eine Fassung **additiv** — neue Spalten dürfen nicht
  sofort Pflicht werden.
- Und der ehrliche Teil: passt eine Vormerkung nicht mehr, wird sie **nicht
  stillschweigend verworfen**, sondern dem Monteur mit ihrem Inhalt gezeigt.
  Eine verlorene Zeitbuchung, von der niemand erfährt, ist der Fehler, wegen
  dem man einer App nicht mehr traut.

#### 12.y Aufbewahrung — was die Sicherung nicht leistet

§ 132 BAO verlangt **sieben Jahre**, bei Grundstücken reichen die Fristen der
Vorsteuerberichtigung deutlich weiter (§ 18 Abs 10 UStG, bis 22 Jahre).

**Die nächtliche Ausleitung erfüllt das nicht** — sie hält dreissig Stände und
rollt. Das ist eine Sicherung gegen Ausfall und kein Archiv. Was fehlt, ist
ein **Jahresabschluss-Export**: einmal je Jahr, unveränderlich, in sich
vollständig (Belege als PDF plus Journal als CSV), unabhängig davon, ob der
Betrieb die App noch benutzt. Er ist zugleich die Antwort auf „Kündigung mit
Datenexport" aus Punkt C.

#### 12.z Der Praxistest auf echten Geräten

Steht seit Wochen als offen im Handbuch und bleibt es, bis es jemand tut:
Push unter iOS **nur vom Startbildschirm aus** (seit iOS 16.4), Kamera,
Unterschrift, Fassungswechsel über einen echten Deploy, Startzeit im
Mobilfunknetz. Drei Geräte, eine Stunde, ein geschriebenes Ergebnis.

---

### Stufe 13 — Der zweite Betrieb, in echt

- **Erstanlage im Live-Projekt** einmal ganz durchspielen. Im Code ist der
  schärfste Fall geprüft; die Auslieferung ist es nie.
- **Supportzugang.** Der globale Administrator sieht bewusst in keinen
  Betrieb — und damit kann beim Anruf niemand helfen. Die Lösung ist **kein
  Generalschlüssel**, sondern ein Zugang, den *der Betrieb* erteilt: befristet,
  mit Grund, jederzeit widerrufbar, jeder Zugriff protokolliert und für den
  Betrieb einsehbar, und im Supportfenster ein Band, das dauerhaft sagt, in
  wessen Daten man gerade sieht.
- **Datenübernahme per CSV.** Der Unterschied zwischen brauchbar und
  gefährlich ist der **Probelauf**: erst ein Bericht („412 Zeilen, 3
  Dubletten, 2 ohne Pflichtfeld"), dann alles oder nichts. Und:
  übernommene Rechnungen bekommen eine **eigene Herkunft** und ziehen **keine
  Nummer aus dem laufenden Kreis** — sonst reisst der Import genau die Lücke
  in die Nummerierung, die niemand erklären will.
- **Briefpapier.** Ränder und ein Schalter „Kopf und Fuss weglassen" für
  vorgedrucktes Papier. Kleine Sache, und das Erste, was ein Betrieb sieht.

---

### Stufe 14 — Abrechnung des Abos (erst wenn es jemanden zu verrechnen gibt)

Bewusst **nach** dem zweiten Betrieb. Die ersten Betriebe von Hand zu
verrechnen kostet eine Stunde im Monat; Stripe zu bauen, bevor das
Preismodell feststeht, kostet eine Woche und wird danach umgebaut.

Wenn es kommt, zählen drei Dinge:

- **Die Lizenzzählung muss ein Monatsstand sein**, kein Blick auf jetzt —
  sonst wird für den Stichtag deaktiviert. Dasselbe Muster wie die
  Monatsbilanz.
- **Die Sperre gehört in den Zeilenschutz**, nicht in die Oberfläche.
- **Der Export bleibt immer offen.** Wer nicht zahlt, verliert den Zugang zum
  Arbeiten, nicht den zu seinen Daten. Das ist Artikel 20 DSGVO und im Übrigen
  Anstand.

---

### Stufe 15 — Wettbewerbsfähigkeit

In dieser Reihenfolge, nach Nutzen je Aufwand:

1. **Dokumentenablage je Baustelle.** Der Speicher, die Regeln und der Schutz
   vor verwaisten Dateien stehen von den Scheinfotos her schon. Das ist die
   billigste der vier und die, nach der am häufigsten gefragt wird.
2. **Wartungsprotokolle als Checkliste.** Am nächsten an dem, was es gibt:
   Wartung, Schein, Unterschrift, PDF. **Wichtig:** je Betrieb eine *Vorlage*
   und kein festes Formular — der Inhalt von Abgasmessung und
   Gasgeräteprüfung steht in landesrechtlichen Verordnungen, und ein
   mitgeliefertes Formular würde eine Vollständigkeit behaupten, für die
   niemand geradesteht.
3. **IDS-Connect/OCI.** Der eigentliche Wettbewerbsvorteil, aber er braucht
   je Betrieb einen Händlervertrag und Zugangsdaten. OCI ist der einfachere
   Weg und würde zuerst gebaut.
4. **ÖNORM A 2063 und Aufmaß.** Nur sinnvoll, wenn öffentlich ausgeschrieben
   angeboten wird. **Erst bauen, wenn ein Betrieb es verlangt** — sonst ist es
   die aufwendigste Funktion für den seltensten Fall.

---

### Was du entscheiden musst, bevor ich anfange

| Frage | Warum sie jetzt fällt |
| --- | --- |
| **Wird über Senklot bar oder mit Karte vor Ort kassiert?** | Wenn ja, braucht es eine RKSV-Lösung: Signatureinheit, DEP, Startbeleg, FinanzOnline. Das ist eine eigene Stufe in der Grössenordnung von Stufe 10. Wenn nein, baue ich die **Sperre**: eine Zahlungsart, die Barzahlung ausschliesst, und ein PDF, das nie wie ein Barbeleg aussieht. Beides ist sauber — nur „nicht daran denken" ist es nicht, denn die Belegerteilungspflicht (§ 132a BAO) gilt ab dem ersten Euro bar |
| **Rechnet Perl an den Bund oder an Gemeinden?** | Nur dann ist ebInterface/Peppol ein Startthema. Die beiden Felder aus 10.6 nehme ich so oder so mit |
| **Urlaubsjahr: Kalenderjahr oder Arbeitsjahr?** | Bestimmt, ob 11.3 eine Einstellung oder eine Umstellung wird |
| **Gilt bei Perl Normalarbeitszeit, Gleitzeit oder Durchrechnung?** | Entscheidet, ob die Saldenrechnung bleiben kann, wie sie ist |
| **Soll ich die Stufen 10 und 11 vor oder nach Stufe 12 bauen?** | 10/11 machen die App *richtiger*, 12 macht sie *auslieferbar*. Meine Empfehlung: **erst 9, dann 12, dann 10, dann 11** — weil ein Fehler in Stufe 12 den Betrieb lahmlegt, ein Fehler in Stufe 10 dagegen auffällt und sich korrigieren lässt |

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
- ~~**Exporte um Zuschläge erweitern**~~: erledigt am 08.09.2026 — Nacht und
  Notdienst stehen jetzt in beiden CSVs und im Stundennachweis, samt der
  Überschneidung „davon beides". Siehe oben.
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
| ~~Sicherung im selben Haus~~ | **Erledigt am 15.09.2026.** Die Ausleitung legt den Stand zusätzlich in einen S3-kompatiblen Eimer bei einem anderen Anbieter, sobald die fünf `SICHERUNG_S3_*`-Secrets gesetzt sind. `AUSLEITUNG_ZIEL_EXTERN` ist weg — die Variable setzte nur die Meldung und bewegte keine Datei. Gemeldet wird jetzt der tatsächliche Erfolg. **Offen bleibt der Rücklauf:** eine Sicherung, die nie zurückgespielt wurde, ist keine |
| ~~Listen ohne Begrenzung~~ | **Erledigt.** Stand hier zuletzt falsch: alle Abfragen in `timeEntries.ts` sind zeitraumbegrenzt. Übrig ist `listOwnEntriesSince` als Rückfall, wenn die Monatsbilanzen unvollständig sind — je Person, nicht je Betrieb. Eine Doku, die Erledigtes als offen führt, schickt den Nächsten in die Irre |

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

