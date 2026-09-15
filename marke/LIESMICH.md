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
| `icon.svg` | App-Zeichen, quadratisch: Senklot in Petrol auf weisser Platte |
| `favicon.svg` | **Eigens für kleine Größen gezeichnet**, nicht verkleinert |
| `*.png` | Aus den SVG erzeugt, siehe unten |

## Die Haltung

Modern, ruhig, zeitlos. Das heisst hier konkret:

* **Fläche statt Verlauf.** Ein Verlauf datiert ein Zeichen auf das Jahr, in
  dem er gemacht wurde.
* **Gerade Kanten statt Rundungen.** Die erste Fassung hatte weiche Flanken
  und las sich als Blatt. Vier Geraden machen daraus wieder ein Werkzeug.
* **Zwei Farben, nicht drei.** Weiss auf Petrol. Der Mint-Akzent an der
  Schnur war ein Detail zu viel.
* **Stumpfe Linienenden.** Ein runder Abschluss macht die Schnur weich, und
  weich ist das Gegenteil von genau.
* **Mittlere Schriftstärke, offene Laufweite.** Fett und eng gesetzt wirkt
  laut und altert schnell.

Die breiteste Stelle des Körpers sitzt im oberen Drittel, das Verhältnis liegt
bei etwa 1:2,3. Daran — und nicht an der Silhouette allein — erkennt man ein
Senklot; breiter wird daraus eine Raute, schmaler ein Pfeil.

## Warum es zwei Zeichnungen gibt

`favicon.svg` ist nicht `icon.svg` in klein. Bei 16 Pixeln wird die Schnur zu
einem Grauschleier und die Öse zu einem Pixel Matsch; was dort trägt, ist der
Körper allein. Er sitzt deshalb größer im Feld und ohne Schnur. Ein bloß
verkleinertes Zeichen sähe bei 16 px nach Fehler aus.

`icon-maskable-512.png` trägt den Grund über den Rand hinaus, weil Android bis
zu 20 % wegschneidet. Ohne das köpft das System die Öse.

## Farben

Unverändert die der App — die Marke kommt aus dem Produkt, nicht neben es.

Zwei, mehr nicht.

| | |
|---|---|
| Zeichen | `#0F4552` |
| Grund | `#FFFFFF` |

### Die Platte ist weiss, nicht petrol

Die erste Fassung war umgekehrt: weisses Zeichen auf petrol Platte. Gewechselt
hat nicht die Farbe, sondern wer von beiden Fläche ist und wer Figur.

Der Grund ist nicht Geschmack, sondern der Ort, an dem das Zeichen steht. Ein
Startbildschirm ist voll dunkler, satter Kacheln; eine weitere konkurriert mit
ihnen, statt sich zu behaupten. Eine weisse Platte tritt zurück und lässt das
Senklot die Arbeit machen — und bei 16 Pixeln im Reiter ist der Gewinn am
grössten: eine dunkle Figur auf hellem Grund bleibt bis zum letzten Pixel eine
Figur, eine helle auf dunklem läuft an den Kanten zu.

**Die Schnur steht seither auf 1,8 statt 1,6.** Eine helle Linie auf dunklem
Grund wirkt breiter als sie ist, eine dunkle auf hellem schmaler; dasselbe
Mass hätte nach dem Tausch dünner ausgesehen. Korrigiert wird das Auge, nicht
die Zahl.

**Und das Apple-Touch-Icon ist seither quadratisch und randlos.** iOS rundet
es selbst ab und rechnet Durchsichtigkeit vorher gegen Schwarz. Solange die
Platte petrol war, fiel das nicht auf — die weggerundeten Ecken waren dunkel
und der Rest auch. Mit weisser Platte wäre daraus ein weisses Zeichen mit vier
schwarzen Ecken geworden.

Auf dunklem Grund steht das Zeichen in `#FFFFFF` ohne Platte — so in der
Seitenleiste und über dem Anmeldeformular.

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
da, statt sie den Browser aus der 32er rechnen zu lassen: genau dafür gibt es
die zweite Zeichnung.

Der Service Worker nimmt `/icon-192.png` als Bild der Push-Meldung und
`/favicon-64.png` als Abzeichen — beides wechselt damit mit.

Am Startbildschirm und im Reiter steht jetzt **Senklot**
(`manifest.webmanifest`, `<title>`), und über dem Anmeldeformular steht die
Produktmarke statt eines Kundenlogos — vor der Anmeldung ist der Mandant
unbekannt, und die Vorgabe zeigte bis dahin jedem zweiten Betrieb das Zeichen
des ersten.

`background_color` im Manifest steht auf `#ffffff` und nicht mehr auf dem
Grund der App: der Startbildschirm zeigt das Zeichen auf dieser Farbe, und mit
weisser Platte wäre auf `#eef6f8` ein schwach sichtbares Quadrat darum
gestanden.

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

**Nicht angefasst:** die Rundungen der Oberfläche. „Gerade Kanten statt
Rundungen" ist eine Aussage über den Körper des Senklots, der mit weichen
Flanken als Blatt las — keine über Knöpfe und Karten. Eine App mit scharfen
Ecken wäre eine andere Entscheidung mit eigenem Preis, und sie stünde hier
ohne Begründung.
