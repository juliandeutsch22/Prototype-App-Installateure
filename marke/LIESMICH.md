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
| `icon.svg` | App-Zeichen, quadratisch mit Verlauf |
| `favicon.svg` | **Eigens für kleine Größen gezeichnet**, nicht verkleinert |
| `*.png` | Aus den SVG erzeugt, siehe unten |

## Warum es zwei Zeichnungen gibt

`favicon.svg` ist nicht `icon.svg` in klein. Bei 16 Pixeln wird die Schnur zu
einem Grauschleier und die Öse zu einem Pixel Matsch; was dort trägt, ist der
Körper allein. Er sitzt deshalb größer im Feld und ohne Schnur. Ein bloß
verkleinertes Zeichen sähe bei 16 px nach Fehler aus.

`icon-maskable-512.png` trägt den Grund über den Rand hinaus, weil Android bis
zu 20 % wegschneidet. Ohne das köpft das System die Öse.

## Farben

Unverändert die der App — die Marke kommt aus dem Produkt, nicht neben es.

| | |
|---|---|
| Grund, tief | `#0F4552` |
| Grund, hell (Verlauf oben) | `#12889B` |
| Schnur | `#66FFB0` |
| Körper | `#FFFFFF` |

## PNG neu erzeugen

```
CHROMIUM_PFAD=/pfad/zu/chromium node marke/rastern.mjs
```

Gerastert wird mit Chromium statt mit einem eigenen Rasterer: er liegt für den
Durchklick ohnehin da, und er zeichnet die Datei genau so, wie sie später im
Browser aussieht. Ein zweiter Rasterer wäre eine zweite Wahrheit. Ohne
`CHROMIUM_PFAD` holt sich Playwright seinen eigenen.

## Noch nicht eingebaut

Die Dateien unter `public/` tragen weiterhin das alte Zeichen, und
`manifest.webmanifest` heißt weiterhin „Perl Zeiterfassung". Das ist Absicht:
der Name der Software zu wechseln ist eine Entscheidung des Betriebs, keine
Aufräumarbeit. Der Wechsel ist ein Handgriff, sobald er gewollt ist.
