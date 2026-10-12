# Senklot — die Marke

Das Senklot ist das älteste Werkzeug am Bau: ein Gewicht an einer Schnur, das
die Senkrechte zeigt. Wer es benutzt, **prüft** — er schätzt nicht. Dazu der
zweite Sinn, den jeder mithört: *alles im Lot.*

Der Bezug ist keiner, der nachträglich gesucht wurde: das englische *plumber*
kommt von *plumbum*, Blei — dem Werkstoff des Senklots.

## Was hier liegt

| Datei | Wofür |
|---|---|
| `logo.svg` | Wortmarke, waagrecht. Für Kopfzeilen, Briefpapier, Anmeldebildschirm |
| `icon.svg` | Das Zeichen als Fläche, 64er-Raster — die Maße für Wortmarke und Produktmarke |
| `app-zeichen.png` | **Vorlage für App-Zeichen und Favicon**: das Senklot weiß auf der Kachel in Petrol, 1254 × 1254, wie geliefert |
| `*.png` (übrige) | Aus `app-zeichen.png` erzeugt, siehe unten |

## Die Form (seit 03.10.2026)

Das Senklot besteht aus vier Teilen, wie das Werkzeug: **Schnur, Öse,
Schulter, Spitze.** Vorlage war die Zeichnung, die der Betrieb am 03.10.2026
ausgesucht hat; übernommen ist sie in Petrol statt Schwarzblau, und die gelbe
Schnur ist ebenfalls Petrol — die Marke bleibt einfarbig, damit sie auf
dunklem Grund als weißes Zeichen funktioniert (Seitenleiste, Anmeldung).

* **Fläche statt Verlauf.** Ein Verlauf datiert ein Zeichen auf das Jahr, in
  dem er gemacht wurde.
* **Die Fuge zwischen Schulter und Spitze bleibt offen.** An ihr erkennt man
  ein Senklot und nicht einen Pfeil oder eine Raute.
* **Die Schnur endet oben rund** — so in der Vorlage; unten stößt sie stumpf
  an die Öse.
* **Mittlere Schriftstärke, offene Laufweite.** Fett und eng gesetzt wirkt
  laut und altert schnell.

Die Maße stehen in `icon.svg` (64er-Raster); `logo.svg`, die Produktmarke in
der App (`src/components/ProduktMarke.tsx`) und der Kopf des Handbuchs tragen
dieselben Pfade.

## App-Zeichen und Favicon (seit 12.10.2026)

Am Startbildschirm und im Browserreiter steht seit dem 12.10.2026 das
Senklot **weiß auf einer Kachel in Petrol**, mit Verlauf und Fase — vom
Betrieb geliefert und ausgesucht. **Nur dort.** Wortmarke, Produktmarke in
der App und Kopf des Handbuchs bleiben die einfarbige Fläche aus `icon.svg`
— sie stehen klein, weiß auf Petrol oder neben Schrift, und dort trägt eine
Fläche, ein Glanzbild nicht.

`app-zeichen.png` ist die gelieferte Datei, unverändert: die Kachel auf
durchsichtigem Grund. Was an ihr nicht stimmte, bereinigt `rastern.mjs`
beim Erzeugen, nicht die Vorlage: die Kachel war innen nicht ganz deckend
(246–253 statt 255) und ringsum lagen Reste mit höchstens 2 % Deckkraft, auf
Weiß ein grauer Schleier. Die geglättete Kante der Kachel bleibt unberührt.

Wie zugeschnitten wird, steht in `rastern.mjs`. Es gibt zwei Formen:

* **Die Kachel** für den Reiter und die Zeichen `icon-192`/`icon-512`
  („any“): so, wie geliefert, die runden Ecken durchsichtig.
* **Randlos** für `apple-touch-icon.png` und `icon-maskable-512.png`: iOS
  rundet selbst ab und rechnet Durchsichtiges vorher gegen Schwarz, Android
  schneidet das maskable Zeichen in seine Form. Genommen wird das Innere der
  Kachel ohne Rand und Fase (112 px vom Rand) und ringsum mit seiner
  äußersten Zeile und Spalte verlängert, bis das Senklot nur noch bis 38 %
  der Breite von der Mitte reicht — Android garantiert einen Kreis von
  40 %. In der Verlängerung läuft der Grund eben; bei starker Vergrößerung
  sind dort feine Streifen zu erkennen, in Originalgröße und unter der Maske
  nicht.
* **Das Favicon ist die Kachel im Kleinen.** Bei 16 px ist das Senklot nur
  noch angedeutet — Schulter und Spitze als heller Fleck, die Schnur ein
  Hauch. Ab 32 px ist es klar zu erkennen.

Davor (04.–12.10.2026) war es das Senklot in Petrol mit Glanz auf Weiß, ganz
am Anfang des 04.10. kurz auf Schwarz (#238, #241); die Vorlagen stehen in
der Geschichte des Repositorys.

Bis zum 03.10.2026 war das Favicon eine eigene Zeichnung für 16 px
(`favicon.svg`, ohne Schnur, mit breiteren Fugen). Mit dem Bild als Vorlage
gibt es sie nicht mehr; sie steht in der Geschichte des Repositorys.

## Farben

Unverändert die der App — die Marke kommt aus dem Produkt, nicht neben es.

Zwei, mehr nicht.

| | |
|---|---|
| Zeichen | `#0F4552` |
| Grund | `#FFFFFF` |

Das gilt für die Fläche (Wortmarke, Produktmarke). App-Zeichen und Favicon
sind seit dem 12.10.2026 das gelieferte Bild — weiß auf Petrol, siehe oben.

### Die Platte war weiss, nicht petrol (bis 03.10.2026)

Die erste Fassung war umgekehrt: weisses Zeichen auf petrol Platte. Gewechselt
hat nicht die Farbe, sondern wer von beiden Fläche ist und wer Figur.

Der Grund ist nicht Geschmack, sondern der Ort, an dem das Zeichen steht. Ein
Startbildschirm ist voll dunkler, satter Kacheln; eine weitere konkurriert mit
ihnen, statt sich zu behaupten. Eine weisse Platte tritt zurück und lässt das
Senklot die Arbeit machen — und bei 16 Pixeln im Reiter ist der Gewinn am
grössten: eine dunkle Figur auf hellem Grund bleibt bis zum letzten Pixel eine
Figur, eine helle auf dunklem läuft an den Kanten zu.

**Und das Apple-Touch-Icon ist seither quadratisch und randlos.** iOS rundet
es selbst ab und rechnet Durchsichtigkeit vorher gegen Schwarz. Solange die
Platte petrol war, fiel das nicht auf — die weggerundeten Ecken waren dunkel
und der Rest auch. Mit weisser Platte wäre daraus ein weisses Zeichen mit vier
schwarzen Ecken geworden.

Auf dunklem Grund steht das Zeichen in `#FFFFFF` ohne Platte — so in der
Seitenleiste und über dem Anmeldeformular.

**Seit dem 12.10.2026 ist das App-Zeichen wieder weiß auf Petrol** — die
Kachel, die der Betrieb geliefert hat. Die Abwägung oben gilt weiter und
zeigt sich genau dort, wo sie vorhergesagt war: bei 16 px im Reiter läuft
das helle Senklot an den Kanten zu. Die Fläche (Wortmarke, Produktmarke)
bleibt, wie sie ist.

## PNG neu erzeugen

```
CHROMIUM_PFAD=/pfad/zu/chromium node marke/rastern.mjs
```

Gerastert wird mit Chromium statt mit einem eigenen Rasterer: er liegt für den
Durchklick ohnehin da, und er zeichnet die Datei genau so, wie sie später im
Browser aussieht. Ein zweiter Rasterer wäre eine zweite Wahrheit. Ohne
`CHROMIUM_PFAD` holt sich Playwright seinen eigenen.

## Eingebaut

Die PNG unter `public/` sind diese hier — App-Zeichen, Apple-Touch-Icon und
Favicon in drei Größen. Die 16er-Fassung steht in `index.html` ausdrücklich
da, statt sie den Browser aus der 32er rechnen zu lassen: in halben Schritten
verkleinert bleibt sie ruhiger als das, was der Browser in einem Zug daraus
macht.

Der Service Worker nimmt `/icon-192.png` als Bild der Push-Meldung und
`/favicon-64.png` als Abzeichen — beides wechselt damit mit. Android zeichnet
das Abzeichen in der Statusleiste nur aus der Durchsichtigkeit; mit der Kachel
wird es dort ein Quadrat mit runden Ecken, wie mit der weissen Platte bis
03.10.2026. Offen bleibt die Kleinigkeit von damals: ein eigenes Abzeichen
als weisse Silhouette auf durchsichtigem Grund.

Die Bilder tragen keinen Fingerabdruck im Namen, der Service Worker hält sie
trotzdem vor (`public/sw.js`, „erst Speicher, dann Netz“). Neu geholt werden
sie mit der nächsten Fassung: jeder Bau schreibt Commit und Bauzeit in das
JavaScript, damit ändert sich `index.html`, der Worker erkennt die neue
Fassung und leert nach der Übernahme seinen Speicher. Ein Wechsel nur der
Bilder ohne neuen Bau erreichte vorhandene Geräte also nicht.

Am Startbildschirm und im Reiter steht jetzt **Senklot**
(`manifest.webmanifest`, `<title>`), und über dem Anmeldeformular steht die
Produktmarke statt eines Kundenlogos — vor der Anmeldung ist der Mandant
unbekannt, und die Vorgabe zeigte bis dahin jedem zweiten Betrieb das Zeichen
des ersten.

`background_color` im Manifest ist der Grund des App-Zeichens, also
`#ffffff`: Android zeigt beim Start das Zeichen auf dieser Farbe, und auf
einer anderen stünde ein Quadrat darum.

**Was NICHT gewechselt ist:** `BrandLogo` zeigt weiter das Logo des Betriebs.
Das Logo IM Kopf der App gehört dem Betrieb, nicht dem Produkt — die App ist
mandantenfähig. Senklot ist, womit gearbeitet wird; Perl ist, wer damit
arbeitet.

## Was die Marke an der Oberfläche geändert hat

Die Haltung oben gilt nicht nur für das Zeichen. Mit ihm sind vier Verläufe
und die Mint-Familie aus `index.css` verschwunden; die dunklen Trägerflächen
sind flaches `#0F4552`.

Das war kein reiner Geschmackswechsel: ein Verlauf ist nur so lesbar wie seine
hellste Stelle, und die lag bei `#107a8c` — 5,0:1, genau dort, wo in der
Seitenleiste der Benutzername steht. Flach sind es **10,5:1** auf der ganzen
Fläche, und die Gruppenüberschriften steigen von rund 3,3:1 auf 4,9:1.

Daraus folgt eine Regel, die man vor dem Schreiben beantworten kann: **was auf
der dunklen Trägerfläche zur Bedienung gehört, ist weiß.** Die Markierung des
aktiven Eintrags in der Seitenleiste ist deshalb weiß und nicht mehr cyan.

Mit genau einer Ausnahme, und die steht hier, damit sie niemand für einen Rest
hält: der Avatar bleibt cyan. Er ist keine Bedienoberfläche, sondern ein
Mensch — auf einem Tablet, an dem mehrere arbeiten, ist „wer bin ich hier
gerade?" eine echte Frage, und ein weisser Kreis unter weisser Schrift
beantwortet sie nicht.

**Nicht angefasst:** die Rundungen der Oberfläche. Die geraden Kanten des
Senklots sind eine Aussage über das Zeichen — keine über Knöpfe und Karten.
Eine App mit scharfen Ecken wäre eine andere Entscheidung mit eigenem Preis,
und sie stünde hier ohne Begründung.
