# Messung nachher (Stand 18, K4, 12., 17. und 18.10.2026)

Dasselbe Werkzeug wie vorher (`scripts/ui-umbau/messung.mjs`), derselbe
Testbestand `ui-testbestand` (`messung-vorher.md`, B1), derselbe Rechner,
am selben Tag hintereinander: zuerst „nachher“ (`main`, 3261754), dann
„vorher“ (`vor-ui-lot`, 4abb9ca — im App-Code gleich mit dem Ausgangsstand
6035627, der nur Unterlagen hinzufügt). Je Seite drei Läufe, Median,
Handy-Profil (390 × 844, langsames 4G, CPU ×4, erster Besuch).

**Wiederholt am 17.10.2026** auf dem Stand nach Lot v2 (#311, 29bc810, mit
den Migrationen aus #310) — die Tabellen unten sind diese Messung. Gegen
den 12.10. (3261754) ist sie bis auf Zehntel gleich; nur die Startseite
ist leichter (bedienbar 25,2 → 22,4 s, 4.563 → 4.008 KB, 49 → 46
Datenbankanfragen; die grösste Liste 3.000 → 2.400 Buchungen). Warum, ist
nicht untersucht — der Testbestand ist derselbe, nur fünf Tage später.

**Was die Zahlen sind.** Die Zeiten stammen aus einem gedrosselten Browser
in einem Rechenzentrum, nicht von einem Telefon. Sie taugen für den
Vergleich vorher/nachher — beide Stände liefen unter denselben Bedingungen —,
nicht als Versprechen, wie schnell ein bestimmtes Gerät ist.

**Zwei Durchgänge je Stand.** „bedienbar“ heisst hier: das Netz ruht eine
Sekunde. Seit dem Vorher-Stand holt die App gewollt Dinge im Hintergrund:
die Ansichten der eigenen Navigation im Leerlauf (#280) und die App-Hülle
über den Service Worker, der sich seit #292 auch nach `load` anmeldet.
Das hält das Netz länger wach, ohne dass jemand darauf wartet. Verglichen
wird deshalb der Durchgang **ohne Hintergrund** (`--ohne-hintergrund`:
Service Worker gesperrt, Datensparmodus an); der gewöhnliche erste Besuch
steht darunter mit. Gegenprobe des Schalters: auf „Kunden“ 164 → 31
Anfragen und 4,6 → 3,1 s, die Datenbankanfragen gleich.

## Ladezeit gezielt (19.10.2026)

Entschieden am 19.10.2026 (Rückfrage, „gezielt“): die schweren Seiten
entlasten statt alle Listen in Seiten zu 50 umzubauen, und „bedienbar“ als
**„bereit“** messen — Überschrift sichtbar und auf der Seite kein
Platzhalter mehr (`aria-busy`, Skelett, verzögerte Ladeanzeige), 300 ms lang.
„Netz ruhig“ wartet auch auf Live-Listen und ihr Nachfassen, die niemanden
aufhalten; es bleibt als eigene Spalte stehen. Testbestand am 19.10.
zweimal mit demselben Skript angelegt (beim ersten Mal räumte ein paralleler
Durchgang ihn ab); vorher und nachher ohne Hintergrund, je drei Läufe,
Median, Handy-Profil. Die Rohwerte in `messung-nachher-ohne-hintergrund.json`
und die erzeugte Tabelle unten sind seither dieser Stand; die Zahlen vom
18.10. stehen weiter im Text darunter.

**Was geändert wurde:**

- **Startseite:** „Tage ohne Buchung“ holt nur Person und Tag der Buchungen
  (`listBuchungstageInRange`), „Baustellen ohne Einsatz“ und die Auslastung
  nur Person, Tag und Baustelle der Einsätze (`listEinsatztageInRange`),
  „knapp“ nur die nötigen Spalten der Lagerartikel (`listLagerartikelKurz`).
  Dieselben Zeilen, ein Bruchteil der Daten.
- **Mitarbeiterübersicht:** die Karte „Arbeitszeitgrenzen“ holt die Buchungen
  um den Monat nicht mehr selbst — sie nimmt die der Seite; ihr Vorlauf für den
  Durchschnitt (17 Wochen) kommt erst, wenn die Liste steht. Vorher kamen die
  Buchungen des Monats dreimal (erstes Bild, Nachfassen, Karte) und teilten
  sich die Leitung mit 2 MB Vorlauf.
- **Lager:** frei und reserviert hängen am Inhalt der Live-Listen, nicht an
  ihrer Identität — ein Nachfassen mit denselben Zeilen holt nichts neu.

| Seite | bereit vorher | bereit nachher | übertragen vorher | nachher | Netz ruhig vorher → nachher |
|---|---|---|---|---|---|
| Start | 20,9 s | **9,8 s** | 3.672 KB | **1.499 KB** | 21,0 → 10,1 s |
| Planung (Tag) | 4,2 s | 4,3 s | 575 KB | 575 KB | 5,2 → 4,9 s |
| Planung (Woche) | 4,0 s | 3,9 s | 451 KB | 451 KB | 5,5 → 5,4 s |
| Lager | 7,2 s | 6,9 s | 1.521 KB | **1.341 KB** | 10,5 → 9,0 s |
| Anforderungen | 3,8 s | 3,8 s | 426 KB | 426 KB | 3,7 → 3,7 s |
| Material anfordern | 3,3 s | 3,3 s | 379 KB | 379 KB | 4,6 → 4,6 s |
| Rechnungen | 7,4 s | 7,6 s | 1.159 KB | 1.160 KB | 8,0 → 8,1 s |
| Angebote | 4,9 s | 5,0 s | 687 KB | 687 KB | 5,1 → 5,1 s |
| Baustellen | 5,3 s | 5,4 s | 782 KB | 782 KB | 5,3 → 5,4 s |
| Kunden | 3,1 s | 3,1 s | 364 KB | 364 KB | 3,0 → 3,0 s |
| Mitarbeiterübersicht | 23,7 s | **9,1 s** | 5.252 KB | **4.299 KB** | 28,7 → 23,7 s |
| Einstellungen | 2,6 s | 2,6 s | 253 KB | 253 KB | 2,6 → 2,6 s |

**Das Budget „bereit ≤ 2,5 s“ erreicht in diesem Profil keine Seite** —
Einstellungen kommt mit 2,6 s am nächsten. Schon die Überschrift steht erst
nach 2,6–3,7 s: das ist der Start der App selbst (Programmcode über
langsames 4G bei vierfach gedrosselter CPU, dann Anmeldung, Benutzer,
Betrieb und zweiter Faktor nacheinander). Darunter kommt keine Seite, egal
wie wenig sie lädt. **Benannt, nicht gebaut:** den Start der App verkürzen
(kleinere erste Programmdatei, die Abfragen nach der Anmeldung zusammenlegen)
wäre ein eigener Auftrag. Rechnungen (7,6 s) laden die Kundenliste bis 500
(Kundenart, UID, Export hängen an ihr) und die offenen Rechnungen samt
Positionen — dort ist nichts doppelt, eine Verkleinerung hiesse, jede
Verwendung der Kundenliste umzustellen; nicht in diesem Auftrag. Die Zeiten
stammen weiter aus einem gedrosselten Browser, nicht von einem Telefon.

## Gesamtmessung nach den Empfehlungen (18.10.2026)

Alle zwölf Seiten in beiden Durchgängen neu gemessen, auf dem Stand nach
#314–#318 (95ce1aa), Testbestand am 18.10. mit demselben Skript neu
angelegt. Ohne Hintergrund, je drei Läufe, Median; die erste Anzeige auf
Millisekunden genau, weil das Budget bei 1,5 s liegt.

| Seite | erste Anzeige (FCP) | Inhalt da (h1) | bedienbar (Netz ruhig) | übertragen | DB-Anfragen |
|---|---|---|---|---|---|
| Start | 1,3 → 1,8 → 1,47 s | 3,8 → 3,6 → 3,7 s | 35,5 → 22,4 → 20,8 s | 6.743 → 4.008 → 3.670 KB | 54 → 46 → 46 |
| Planung (Tag) | 1,3 → 1,9 → 1,44 s | 3,3 → 3,4 → 3,3 s | 12,9 → 5,6 → 4,8 s | 2.086 → 766 → 575 KB | 30 → 23 → 22 |
| Planung (Woche) | 1,4 → 1,8 → 1,46 s | 2,8 → 3,1 → 3,2 s | 3,1 → 5,7 → 4,3 s | 344 → 534 → 443 KB | 16 → 20 → 18 |
| Lager | 1,4 → 1,8 → 1,48 s | 2,7 → 3,1 → 3,2 s | 11,4 → 14,5 → 10,3 s | 1.907 → 2.293 → 1.518 KB | 19 → 25 → 24 |
| Anforderungen | 1,3 → 1,9 → 1,46 s | 3,1 → 3,1 → 3,2 s | 3,7 → 4,3 → 3,6 s | 397 → 573 → 426 KB | 11 → 14 → 13 |
| Material anfordern | 1,4 → 1,9 → 1,47 s | 2,8 → 3,1 → 3,1 s | 6,0 → 12,1 → 4,5 s | 849 → 1.807 → 379 KB | 17 → 25 → 18 |
| Rechnungen | 1,4 → 1,8 → 1,44 s | 3,8 → 3,7 → 3,6 s | 7,9 → 7,9 → 8,1 s | 1.141 → 1.153 → 1.154 KB | 30 → 31 → 31 |
| Angebote | 1,4 → 1,8 → 1,45 s | 2,7 → 3,1 → 3,2 s | 5,1 → 5,1 → 5,2 s | 651 → 686 → 687 KB | 11 → 12 → 12 |
| Baustellen | 1,3 → 1,8 → 1,45 s | 2,8 → 3,1 → 3,2 s | 7,6 → 8,5 → 5,5 s | 955 → 1.204 → 782 KB | 13 → 16 → 14 |
| Kunden | 1,3 → 1,8 → 1,44 s | 2,7 → 2,6 → 2,6 s | 3,0 → 3,0 → 3,1 s | 346 → 363 → 363 KB | 9 → 10 → 10 |
| Mitarbeiterübersicht | 1,4 → 1,9 → 1,44 s | 3,2 → 3,7 → 3,7 s | 119,8 → 116,9 → 29,0 s | 22.607 → 22.336 → 5.251 KB | 69 → 137 → 47 |
| Einstellungen | 1,4 → 1,9 → 1,44 s | 2,2 → 2,6 → 2,6 s | 2,3 → 2,6 → 2,6 s | 239 → 254 → 253 KB | 11 → 12 → 12 |

Lesart: vor dem Umbau (`vor-ui-lot`) → nach Lot v2 (17.10.) → nach den
Empfehlungen (18.10.). Rohwerte in `messung-nachher-ohne-hintergrund.json`
und `messung-nachher.json`; die erzeugten Tabellen beider Durchgänge stehen
unten. Die Baustellen sind leichter geworden, ohne dass an ihnen etwas
geändert wurde: ihre Baustellenliste ist eine Live-Liste (900 → 300 Zeilen,
Empfehlung 2).

**Die Budgets danach:**

| Budget | vorher | 17.10. | 18.10. |
|---|---|---|---|
| erste Anzeige ≤ 1,5 s | eingehalten (1,3–1,4 s) | verfehlt (1,8–1,9 s) | **eingehalten** auf allen zwölf Seiten (1,44–1,48 s) |
| bedienbar ≤ 2,5 s | nur „Einstellungen“ (2,3 s) | auf keiner Seite | auf keiner Seite (bestenfalls Einstellungen mit 2,6 s) |
| höchstens 50 Einträge je Anfrage | verfehlt (Seiten zu 500) | verfehlt | verfehlt, unverändert — die Datenschicht blättert weiter in Seiten zu 500 |
| kein ganzer Bestand im Browser | verfehlt | verfehlt | **teilweise:** Material anfordern holt den Katalog seitenweise (kein Artikel mehr über 50 Zeilen); die Mitarbeiterübersicht den Monat statt des Jahres (12.600 statt 35.100 Zeilen, dazu der Vorlauf der Arbeitszeitgrenzen); das Lager weiter alle Lagerartikel samt Frei-Mengen (800, je zweimal geholt) |
| nicht langsamer als vorher | — | verfehlt | **fast:** die erste Anzeige liegt 0,04–0,18 s über vorher, aber im Budget; „bedienbar“ ist schneller auf Start, Planung (Tag), Lager, Anforderungen, Material anfordern, Baustellen und Mitarbeiterübersicht, gleich auf Rechnungen, Angebote, Kunden (± 0,2 s), langsamer auf Planung (Woche, 3,1 → 4,3 s) und Einstellungen (2,3 → 2,6 s) |

Was bleibt, ist benannt, nicht entschieden: Planung (Woche) holt ihre
Einsätze als Live-Liste zweimal (erstes Bild und Nachfassen, damit keine
Zeile fehlt); „bedienbar ≤ 2,5 s“ und „höchstens 50 Einträge je Anfrage“
verlangen ein seitenweises Laden aller Listen vom Server — ein eigener
Auftrag (Stand, Abschnitt 18, G). Die Zeiten stammen weiter aus einem
gedrosselten Browser, nicht von einem Telefon.

## Vergleich vorher → nachher (ohne Hintergrund, Stand 17.10.)

| Seite | erste Anzeige (FCP) | Inhalt da (h1) | bedienbar (Netz ruhig) | übertragen | DB-Anfragen |
|---|---|---|---|---|---|
| Start | 1,3 → 1,8 s | 3,8 → 3,6 s | 35,5 → 22,4 s | 6.743 → 4.008 KB | 54 → 46 |
| Planung (Tag) | 1,3 → 1,9 s | 3,3 → 3,4 s | 12,9 → 5,6 s | 2.086 → 766 KB | 30 → 23 |
| Planung (Woche) | 1,4 → 1,8 s | 2,8 → 3,1 s | 3,1 → 5,7 s | 344 → 534 KB | 16 → 20 |
| Lager | 1,4 → 1,8 s | 2,7 → 3,1 s | 11,4 → 14,5 s | 1.907 → 2.293 KB | 19 → 25 |
| Anforderungen | 1,3 → 1,9 s | 3,1 → 3,1 s | 3,7 → 4,3 s | 397 → 573 KB | 11 → 14 |
| Material anfordern | 1,4 → 1,9 s | 2,8 → 3,1 s | 6,0 → 12,1 s | 849 → 1.807 KB | 17 → 25 |
| Rechnungen | 1,4 → 1,8 s | 3,8 → 3,7 s | 7,9 → 7,9 s | 1.141 → 1.153 KB | 30 → 31 |
| Angebote | 1,4 → 1,8 s | 2,7 → 3,1 s | 5,1 → 5,1 s | 651 → 686 KB | 11 → 12 |
| Baustellen | 1,3 → 1,8 s | 2,8 → 3,1 s | 7,6 → 8,5 s | 955 → 1.204 KB | 13 → 16 |
| Kunden | 1,3 → 1,8 s | 2,7 → 2,6 s | 3,0 → 3,0 s | 346 → 363 KB | 9 → 10 |
| Mitarbeiterübersicht | 1,4 → 1,9 s | 3,2 → 3,7 s | 119,8 → 116,9 s | 22.607 → 22.336 KB | 69 → 137 |
| Einstellungen | 1,4 → 1,9 s | 2,2 → 2,6 s | 2,3 → 2,6 s | 239 → 254 KB | 11 → 12 |

Rohwerte: `messung-vorher-ohne-hintergrund.json`,
`messung-nachher-ohne-hintergrund.json` (je Lauf jede Datenbankanfrage).

## Die Budgets (Protokoll, Abschnitt 3, B3; Stand 17.10.)

| Budget | vorher | nachher |
|---|---|---|
| erste Anzeige ≤ 1,5 s | eingehalten (1,3–1,4 s) | **verfehlt** auf allen zwölf Seiten (1,8–1,9 s) |
| bedienbar ≤ 2,5 s | nur „Einstellungen“ (2,3 s) | auf keiner Seite (bestenfalls 2,6 s) |
| höchstens 50 Einträge je Anfrage | verfehlt — die Datenschicht blättert in Seiten zu 500 (300 bei Baustellen) | verfehlt, unverändert |
| kein ganzer Bestand im Browser | verfehlt — Mitarbeiterübersicht (das ganze Jahr: 25.880 Buchungen, 22 MB), Lager und Material (jeder Artikel samt Bestand) | verfehlt — dieselben Seiten (35.100 Buchungen, 22 MB) |
| nicht langsamer als vorher | — | **verfehlt** bei der ersten Anzeige (+0,4 bis 0,6 s überall) und bei „bedienbar“ auf Planung (Woche), Lager, Anforderungen, Material anfordern, Baustellen, Einstellungen; **schneller** auf Start und Planung (Tag) |

„Inhalt da“ ist gemischt: schneller auf Start, Rechnungen, Kunden, gleich
auf Anforderungen; langsamer auf Planung (Tag und Woche), Lager, Material
anfordern, Angebote, Baustellen, Mitarbeiterübersicht, Einstellungen
(je 0,1–0,5 s).

## Woher die Unterschiede kommen (belegt, untersucht am 12.10.2026)

Die Linie „Lot“ selbst trägt wenig bei (ihr Stylesheet ist 20 statt 10 KB
gross); die grossen Unterschiede kommen aus den Ladeschritten danach, jeder
mit seinem Grund.

1. **Erste Anzeige +0,5 s: der Ladebildschirm blendet verzögert ein.**
   Vor der Prüfung der Anmeldung steht „Anmeldung wird geprüft …“. Er
   steht vorher wie nachher fast gleich früh im Dokument (1,33 s gegen
   1,46 s), wird nachher aber erst nach 200 ms eingeblendet
   (`laden-verzoegert`, #280: „ein schnelles Laden blitzt sonst nur kurz
   auf“). In der Messung zählte der Browser ihn dann nicht als erste
   Anzeige; sie fiel erst mit der Hülle der Seite (2,05 s). Die übrigen
   0,1 s: die Dateien vor dem ersten Bild sind 192 statt 174 KB, fertig
   nach 1,29 statt 1,19 s — der Datenbank-Baustein kommt seit #265 gleich
   mit (dafür beginnt danach die erste Abfrage früher), die Startdatei ist
   kleiner, das Stylesheet grösser.
2. **Mehr Anfragen auf Listen mit Live-Abo.** Seit #265 holt ein Live-Abo
   zusätzlich gleich zu Beginn („das erste Bild sofort“), damit die Liste
   nicht leer steht, bis der Kanal steht; danach folgen wie vorher das Laden
   nach dem Aufbau des Kanals und das Nachfassen (`abonnieren`, Punkt 3 —
   damit keine Zeile fehlt). Gezählt: im Wochenplan die Einsätze vorher
   einmal, nachher dreimal (290, 399 und 1.621 ms nach dem Aufruf dieselbe
   Abfrage); auf Lager und Material anfordern die Artikel vorher in zwei
   bis drei, nachher in sechs Seitenabfragen zu 500 Zeilen. Die Liste steht
   so früher da, das Netz ist aber länger beschäftigt. Bei kleinen Listen
   kostet das nichts Spürbares; bei den grossen (der ganze Artikelbestand)
   verdoppelt es die Datenmenge — 849 → 1.804 KB bei „Material anfordern“.
   Warum das Nachfassen vorher nicht in jeder Zählung als eigener Durchgang
   erscheint, ist nicht untersucht; die Zahlen sind gezählt, nicht erklärt.

3. **Mitarbeiterübersicht: das ganze Jahr, nachher dreimal geholt — und
   der Vorlauf der Arbeitszeitgrenzen.** Die Seite holt vorher wie nachher
   alle Buchungen des angezeigten Jahres (`AccountingView`: der Resturlaub
   zählt die Urlaubstage des ganzen Jahres) — rund 22 MB, beide Male als
   Live-Abo. Ungedrosselt gezählt holt vorher ein Durchgang das Jahr
   (51 Seitenabfragen zu 500 Zeilen), nachher holen es die drei Durchgänge
   aus Punkt 2 (147). Gedrosselt kamen nachher 46 volle Antworten an und 56
   ohne übertragenen Inhalt, die Datenmenge blieb deshalb bei 22 MB. Dazu
   kommt seit #271 (Durchschnitt von 48 Std. über 17 Wochen) der Vorlauf
   der Arbeitszeitgrenzen: 9.360 Zeilen, nur mit den Spalten der Arbeitszeit
   (2 MB). Daher 137 statt 69 Datenbankanfragen.

Die Verbesserungen kommen aus denselben Ladeschritten: die Startseite holt
die Belegschaft einmal statt dreimal (gezählt) und weniger Buchungen
(5.400 → 2.400 Zeilen), die Tagesplanung lädt den Materialkatalog erst mit der
Rüstliste (12,9 → 5,6 s).

## Was daraus folgt (zur Entscheidung des Betreibers)

Ein verfehltes Budget ist nach dem Protokoll (0.3) ein Haltepunkt: angehalten
und vorgelegt, nicht selbst entschieden. Empfehlung, nach Nutzen je Aufwand:

1. **Ladebildschirm beim App-Start ohne Verzögerung** — nur dieser eine
   Bildschirm, die Platzhalter der Seiten bleiben verzögert. Erwartet:
   erste Anzeige wieder um 1,4–1,5 s. Preis: auf schnellem Netz blitzt
   „Anmeldung wird geprüft“ kurz auf — genau das, was die Verzögerung
   verhindert. Klein.
2. **„Das erste Bild sofort“ nur, wo kein gemerkter Stand da ist** —
   oder für die grossen Artikellisten gar nicht. Halbiert die Datenmenge
   auf Lager und Material anfordern. Klein bis mittel; berührt die
   Live-Listen, braucht ihre Prüfungen.
3. **Ganze Bestände auf den Server verlagern** — Saldo und Urlaub der
   Mitarbeiterübersicht als Summen aus der Datenbank, Lager und Material
   seitenweise mit Suche auf dem Server. Das ist der grosse Hebel (22 MB →
   wenige hundert KB) und ein eigener Auftrag mit Datenbankänderungen;
   schon als offene Grenze benannt (Stand 18, G: „seitenweises Nachladen
   vom Server“).

Bis dahin gilt das Mengengerüst-Budget als **nicht bestanden**, vorher wie
nachher. (Nach der Umsetzung: siehe „Gesamtmessung nach den Empfehlungen“
oben — die erste Anzeige ist im Budget, die übrigen Budgets sind teilweise
oder weiter verfehlt.)

**Umgesetzt am 18.10.2026 — Empfehlung 1.** „Anmeldung wird geprüft …“
erscheint beim Start sofort; die übrigen Ladeanzeigen bleiben verzögert.
Nachgemessen ohne Hintergrund, je drei Läufe, Median:

| Seite | erste Anzeige vorher (17.10.) | nachher (18.10.) |
|---|---|---|
| Start | 1,8 s | 1,46 s |
| Angebote | 1,8 s | 1,44 s |
| Kunden | 1,8 s | 1,43 s |
| Einstellungen | 1,9 s | 1,46 s |

Das Budget „erste Anzeige ≤ 1,5 s“ ist damit auf diesen Seiten eingehalten;
die übrigen Werte der Zeilen sind unverändert. Die ganze Tabelle ist nach
den Empfehlungen 2 und 3 neu gemessen (oben).

**Umgesetzt am 18.10.2026 — Empfehlung 3, Mitarbeiterübersicht.** Sie holt
nur noch den gezeigten Monat (± 7 Tage) bzw. die Woche; die Urlaubstage
des Jahres kommen aus einer eigenen Abfrage nur der Urlaubstage. Ohne
Hintergrund, Median aus drei Läufen (Testbestand am 18.10. mit demselben
Skript neu angelegt):

| Mitarbeiterübersicht | vorher (17.10.) | nachher (18.10.) |
|---|---|---|
| übertragen | 22.336 KB | 6.203 KB |
| DB-Anfragen | 137 | 51 |
| bedienbar (Netz ruhig) | 116,9 s | 33,7 s |
| grösste Liste | 35.100 Zeilen | 13.680 Zeilen |

Was bleibt: die Buchungen des Monats kommen weiter dreimal (Live-Liste,
Empfehlung 2) und der Vorlauf der Arbeitszeitgrenzen (17 Wochen, nur die
Spalten der Arbeitszeit, rund 2 MB).

**Umgesetzt am 18.10.2026 — Empfehlung 2.** Das erste Bild einer
Live-Liste zählt beim ersten Aufbau als Laden nach `SUBSCRIBED`; es bleibt
beim ersten Bild und dem Nachfassen (zwei statt drei Durchgänge). Anders
als vorgeschlagen bleibt das erste Bild auch mit gemerktem Stand: wo
Websockets gesperrt sind, ist es die einzige frische Abfrage. Ohne
Hintergrund, Median aus drei Läufen:

| Seite | übertragen vorher → nachher | DB-Anfragen |
|---|---|---|
| Start | 4.008 → 3.671 KB | 46 → 46 |
| Planung (Tag) | 766 → 575 KB | 23 → 22 |
| Planung (Woche) | 534 → 442 KB | 20 → 18 |
| Lager | 2.293 → 1.741 KB | 25 → 22 |
| Mitarbeiterübersicht | 22.336 → 22.459 KB | 137 → 87 |

Gemessen vor dem Umbau der Mitarbeiterübersicht (Empfehlung 3, oben): ihre
Datenmenge hing am Jahr, nicht an den Durchgängen.

**Umgesetzt am 18.10.2026 — Empfehlung 3, Lager und Material anfordern.**
Das Lager holt nur die im Lager geführten Artikel; „Material anfordern“
holt den Katalog seitenweise und sucht auf dem Server. Ohne Hintergrund,
Median aus drei Läufen (Testbestand am 18.10. neu angelegt):

| Seite | übertragen vorher → nachher | ruhig vorher → nachher | Artikel-Zeilen |
|---|---|---|---|
| Material anfordern | 1.807 → 379 KB | 12,1 → 4,8 s | 3.000 → 20 je Seite |
| Lager | 2.293 → 1.518 KB | 14,5 → 11,2 s | 3.000 → 1.600 (800 Lagerartikel, zweimal) |

Gemessen auf dem Stand mit Empfehlung 2 (zwei statt drei Durchgänge).

Berichtigt im Werkzeug: eine Zählung (HEAD) bringt keine Zeilen, auch wenn
PostgREST „0-999/…“ als Bereich meldet.

## Gewöhnlicher erster Besuch (mit Vorladen und Service Worker)

<!-- messung:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 18.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, ohne Zwischenspeicher · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand`.

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bedienbar (Netz ruhig) | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 1,4 s | 3,7 s | 20,8 s | 201 | 3 662 KB | 46 | 3 321 KB | 2 040 (time_entries) |
| Planung (Tag) | `/assignments/tag` | 1,4 s | 3,7 s | 5,5 s | 177 | 657 KB | 23 | 275 KB | 600 (assignments) |
| Planung (Woche) | `/assignments/woche` | 1,4 s | 3,3 s | 6,1 s | 173 | 568 KB | 19 | 166 KB | 200 (assignments) |
| Lager | `/lager` | 1,4 s | 3,2 s | 10,7 s | 179 | 1 598 KB | 24 | 1 234 KB | 2 400 (rpc/lager_frei) |
| Anforderungen | `/anforderungen` | 1,4 s | 3,2 s | 3,8 s | 167 | 426 KB | 13 | 159 KB | 200 (material_orders) |
| Material anfordern | `/material` | 1,5 s | 3,2 s | 4,8 s | 172 | 483 KB | 18 | 118 KB | 120 (projects) |
| Rechnungen | `/invoices` | 1,5 s | 2,8 s | 7,2 s | 186 | 1 036 KB | 31 | 815 KB | 500 (customers) |
| Angebote | `/quotes` | 1,4 s | 2,8 s | 5,1 s | 167 | 678 KB | 12 | 415 KB | 500 (customers) |
| Baustellen | `/admin-projects` | 1,5 s | 3,2 s | 5,8 s | 168 | 874 KB | 14 | 502 KB | 500 (customers) |
| Kunden | `/customers` | 1,5 s | 2,7 s | 4,6 s | 164 | 481 KB | 10 | 114 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 1,4 s | 3,7 s | 29,1 s | 202 | 5 314 KB | 47 | 4 913 KB | 12 600 (time_entries) |
| Einstellungen | `/settings/meldungen` | 1,4 s | 2,6 s | 3,3 s | 166 | 253 KB | 12 | 11 KB | 3 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): time_entries 2 040 Zeilen in 5 Anfragen; assignments 1 360 Zeilen in 4 Anfragen; materials 800 Zeilen in 2 Anfragen; rpc/lager_frei 800 Zeilen in 2 Anfragen; invoice_lines 198 Zeilen; rpc/baustellen_stunden 120 Zeilen; invoices 99 Zeilen in 2 Anfragen; wartungen 93 Zeilen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): assignments 600 Zeilen in 2 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): assignments 200 Zeilen in 2 Anfragen; projects 60 Zeilen
- **Lager** (`/lager`): rpc/lager_frei 2 400 Zeilen in 6 Anfragen; materials 1 600 Zeilen in 6 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 200 Zeilen
- **Material anfordern** (`/material`): projects 120 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): customers 500 Zeilen; invoice_lines 398 Zeilen in 3 Anfragen; invoices 199 Zeilen in 3 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): customers 500 Zeilen; quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): customers 500 Zeilen; projects 300 Zeilen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 12 600 Zeilen in 30 Anfragen; rpc/baustellen_stunden 120 Zeilen
<!-- messung:ende -->

## Durchgang ohne Hintergrund (Grundlage des Vergleichs)

<!-- messung-ohne-hintergrund:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 19.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, ohne Zwischenspeicher · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand` · **ohne Hintergrund:** Service Worker gesperrt, Datensparmodus an (kein Vorladen).

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bereit (ohne Platzhalter) | Netz ruhig | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 1,4 s | 3,7 s | 9,8 s | 10,1 s | 104 | 1 499 KB | 46 | 1 149 KB | 2 040 (time_entries) |
| Planung (Tag) | `/assignments/tag` | 1,5 s | 3,4 s | 4,3 s | 4,9 s | 64 | 575 KB | 22 | 275 KB | 300 (assignments) |
| Planung (Woche) | `/assignments/woche` | 1,4 s | 3,2 s | 3,9 s | 5,4 s | 62 | 451 KB | 19 | 129 KB | 120 (assignments) |
| Lager | `/lager` | 1,4 s | 3,1 s | 6,9 s | 9,0 s | 52 | 1 341 KB | 20 | 1 057 KB | 1 600 (materials) |
| Anforderungen | `/anforderungen` | 1,5 s | 3,1 s | 3,8 s | 3,7 s | 44 | 426 KB | 13 | 159 KB | 200 (material_orders) |
| Material anfordern | `/material` | 1,5 s | 3,2 s | 3,3 s | 4,6 s | 48 | 379 KB | 18 | 118 KB | 120 (projects) |
| Rechnungen | `/invoices` | 1,5 s | 3,6 s | 7,6 s | 8,1 s | 83 | 1 160 KB | 31 | 816 KB | 500 (customers) |
| Angebote | `/quotes` | 1,5 s | 3,1 s | 5,0 s | 5,1 s | 44 | 687 KB | 12 | 415 KB | 500 (customers) |
| Baustellen | `/admin-projects` | 1,5 s | 3,2 s | 5,4 s | 5,4 s | 48 | 782 KB | 14 | 503 KB | 500 (customers) |
| Kunden | `/customers` | 1,5 s | 2,6 s | 3,1 s | 3,0 s | 31 | 364 KB | 10 | 115 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 1,4 s | 3,1 s | 9,1 s | 23,7 s | 89 | 4 299 KB | 44 | 3 960 KB | 11 520 (time_entries) |
| Einstellungen | `/settings/meldungen` | 1,4 s | 2,6 s | 2,6 s | 2,6 s | 26 | 253 KB | 12 | 11 KB | 3 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): time_entries 2 040 Zeilen in 5 Anfragen; assignments 1 360 Zeilen in 4 Anfragen; materials 800 Zeilen in 2 Anfragen; rpc/lager_frei 300 Zeilen in 2 Anfragen; invoice_lines 198 Zeilen; rpc/baustellen_stunden 120 Zeilen; invoices 99 Zeilen in 2 Anfragen; wartungen 95 Zeilen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): assignments 300 Zeilen; projects 120 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): assignments 120 Zeilen in 2 Anfragen; projects 60 Zeilen
- **Lager** (`/lager`): materials 1 600 Zeilen in 7 Anfragen; rpc/lager_frei 800 Zeilen in 2 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 200 Zeilen
- **Material anfordern** (`/material`): projects 120 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): customers 500 Zeilen; invoice_lines 398 Zeilen in 3 Anfragen; invoices 199 Zeilen in 3 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): customers 500 Zeilen; quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): customers 500 Zeilen; projects 300 Zeilen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 11 520 Zeilen in 27 Anfragen; rpc/baustellen_stunden 120 Zeilen
<!-- messung-ohne-hintergrund:ende -->
