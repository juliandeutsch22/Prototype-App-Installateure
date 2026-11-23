# Bestätigung der Fassung 2 — Teil Funktion (23.11.2026)

Geprüft von einem unabhängigen Prüfer, der weder Papiere noch Plan noch Prüfberichte geschrieben
hat. Stand `main` fa6e740. Gegenstand: `plan.md` (Fassung 2), Abschnitte 1, 2, 3, 4, 8, 9.1, 9.2,
„Vorab“, Stufe A (Pakete 1–6), Paket 7, Stufe D (21–26), Stufe E (27–29), 10 (Funktion), 11, 12 —
gegen `pruefung/1` bis `7`, `pruefung/0` und `pruefung/aenderungen-fassung-2.md`.

**Womit geprüft:** die Berichte 1–7 ganz gelesen und Punkt für Punkt gegen den Plan gehalten; die
Papiere 1–7 dort, wo Plan oder Bericht auf sie verweisen (Vorschläge, §3, §4, §5); eigene
Wegwerf-Datenbank `best_f` (alle 358 Migrationen, Endstand mit `\sf`/`pg_get_functiondef`,
Auslöser aus `pg_trigger`, Regeln aus `pg_policy`); drei eigene Proben in verworfenen Transaktionen
(`s1.sql` Supportzugang und Lager, `z1.sql`/`z1b.sql` Satzklasse nach Änderung der Einstufung);
die echte `nummerImText` mit `esbuild` gebündelt (`g1.ts`); ein Zähllauf über
`scripts/funktionsinventar.mjs` ohne Entdoppeln (`inv_roh.mjs`); Dateien und Zeilen im Repo
einzeln geöffnet. Ablage: `…/scratchpad/audit/bestaetigung-f/`. Im Repository ist nur diese Datei
neu.

## 1. Urteil: bestätigt mit Auflagen

Die Fassung 2 arbeitet die Berichte 1 bis 7 sorgfältig ein. Ich habe **kein Urteil gefunden, das
vom Bericht abweicht** (107 Befunde, je Zeile verglichen), **keine Warnung „würde verschlechtern“,
die fehlt oder ins Gegenteil gedreht ist**, und in einer Stichprobe von rund 70 Datei-, Funktions-
und Zahlenangaben **nichts Erfundenes**. Die Zahlen in Abschnitt 1 gehen auf (Urteile je Bericht,
Summen, 36 neue Befunde, 45 Verdachtsfälle, 58 Ideen, 165 Grenzzeilen, Aufwand je Stufe und
gesamt). Die nachgeprüften Stellen der Pakete (Supportzugang mit `lager_frei`/`lager_knapp`,
Wächter-Kriterium, Z-1, Z-2, Zeilengrenze, A-1/P-10, G-1, G-16, P-1, M-3/M-4) stimmen mit dem
Endstand der Datenbank und dem Code überein. Der Realtime-Verdacht steht vor Paket 1.
Nicht bestätigen kann ich den Plan ohne die folgenden zehn Auflagen: an zwei Stellen behandelt
ein Paket etwas als entschieden, das nach dem Plan selbst auf die Kanzlei wartet oder nach dem
Papier eine Entscheidung braucht (1, 2); eine Regel des Auftraggebers wird ohne Entscheidungszeile
umformuliert (8); ein „bleibt gleich“ widerspricht dem eigenen Schritt (3); und an einigen Stellen
ist die Bauanleitung nicht eindeutig oder fehlt die Prüfung (4–7, 9, 10). Keine Auflage verlangt,
einen Befund zu streichen oder ein Paket neu zu schneiden.

**Auflagen**

1. **P-1 und die Kanzlei — Widerspruch.**
   *Stelle:* Paket 5, Voraussetzung und Risiko (Z. 1917–1919, 1974–1976); 10.4 (Z. 3693); K-6
   (Z. 3711); Vorspann Abschnitt 11 (Z. 3701).
   *Steht dort:* K-6 fragt, ob „ein nicht angekommener Schein samt Unterschrift auf einem
   (geteilten) Gerät liegen“ darf, betrifft „P-8, P-1“, und Abschnitt 11 „gilt nicht als
   entschieden“. Paket 5 (Stufe A) baut genau diese Ablage, nennt als Vorbehalt nur K-7 (erneutes
   Senden) und sagt im Risiko „K-6 betrifft auch dieses Paket“; 10.4 führt P-1 nur unter K-7; das
   Protokoll (A.3.2) sagt „beides wartet auf die Kanzlei“.
   *Muss dort stehen:* eine Aussage. Entweder „das Sichern wartet nicht auf K-6“ mit dem Grund
   (der Vorgang liegt samt Unterschrift schon heute im Ausgangsfach in IndexedDB,
   `src/lib/sync/lagerIndexedDB.ts`; benannte Grenze 48 in 4.10 — neu ist nur, dass er nach der
   Ablehnung nicht gelöscht wird) und K-6 so gefasst, dass es nach Dauer und Schutzregel fragt —
   oder P-1 steht in 10.4 unter K-6 und das Sichern kommt aus Stufe A heraus. Dazu: welche
   Handgriffe der Abschnitt „Nicht angekommen“ **vor** K-7 trägt. Nach Bericht 3 (3.3) hängt nur
   „unverändert erneut senden“ an der Kanzlei; „Inhalt übernehmen und neu unterschreiben lassen“
   nicht — der Plan schiebt beides hinter K-7, dann bliebe dem Monteur bis dahin nur Abtippen.

2. **G-10, Teil 2 (neuer Belegtyp) ist ohne Entscheidung eingeplant.**
   *Stelle:* Paket 24, Schritt (c) und Vorgabe G-10 (Z. 3284–3286, 3301); Abschnitt 10 und 11.
   *Steht dort:* „Teil 2: Gutschrift als Beleg — beide Teile desselben Pakets“, im Aufwand
   mitgezählt; keine Zeile in Abschnitt 10, keine Frage in Abschnitt 11.
   *Muss dort stehen:* Papier 4 nennt Stufe 2 ausdrücklich „groß, **Entscheidung nötig**“ und
   einen Vorbehalt („neuer Belegtyp mit Folgen in Zahlstand, Mahnlauf, PDF, E-Rechnung,
   Nachkalkulation und beiden Exporten“, `analyse/4-geld.md:298–303`). Bericht 0 (8 Nr. 5) sagt
   nur, die zweite Stufe dürfe nicht „später“ werden — nicht, dass sie entschieden sei. Also: eine
   Entscheidungszeile in 10.3 b) und eine Frage an die Kanzlei (Form des Belegs, Buchungssatz im
   Stapel, E-Rechnung), bis dahin „wartet“. Der Plan sagt „Gutschrift“, das Papier
   „Rechnungskorrektur“ — das Wort des Papiers verwenden (der Unterschied ist steuerlich nicht
   gleichgültig; gehört in die Frage).

3. **G-17 widerspricht „bleibt gleich: die Belegreferenz“.**
   *Stelle:* Paket 24, Schritt (f), Vorgabe und Prüfzeile G-17, „Bleibt gleich (Paket)“
   (Z. 3288, 3304, 3320, 3322–3324).
   *Steht dort:* PDF mit festem Erstellungsdatum und fester Kennung (`setCreationDate`,
   `setFileId` in `pdf.ts:144`, `stornoPdf.ts:63`, `mahnungPdf.ts:227`); zugleich bleibt „die
   Belegreferenz“ gleich.
   *Muss dort stehen:* Die Belegreferenz hasht die **ganze Datei** samt `/CreationDate` und `/ID`
   (dafür stehen Uhr und `Math.random` fest: `tests/unit/belegReferenz.test.ts:16–21, 260–261`).
   G-17 ändert also zwingend die Prüfsummen von `rechnung.pdf`, `stornorechnung.pdf`,
   `mahnung.pdf` und `belegarchiv.zip` in `docs/ui-umbau/referenz.json`. Der Schritt muss das als
   bewusste, einmalige Neuschrift (`REFERENZ_SCHREIBEN=1`) benennen, mit dem Nachweis „Textstrom
   und Aussehen gleich“, und sagen, dass die übrigen sechs Dateien Byte für Byte bleiben. Sonst
   lässt sich G-17 nicht bauen oder die Referenz wird still neu geschrieben.

4. **Paket 3, Schritt 3: drei Bauweisen sind offen.**
   *Stelle:* Z. 1836–1839, Vorgaben G-5, G-16, N-G-1 (Z. 1856, 1859, 1861).
   *Steht dort:* G-5 mit drei Wegen („Minuten in `p_kopf` … oder Datenbank zwingend vor der App
   … Einfacher: Vergleich über `updated_at`“); G-16 „(4) leeres `subtotal_netto` bestimmen“;
   N-G-1 „zur selben Härtung wie G-16“ ohne Aussage, was gebaut wird.
   *Muss dort stehen:* (a) **eine** Übergabeform für G-5: der Stand je Buchung reist in `p_kopf`
   (unbekannte Schlüssel verwirft `jsonb_populate_record`, Endstand `rechnung_anlegen` Z. 20),
   nie als neuer Schlüssel in `p_belege` (jeder Schlüssel wird als Liste gelesen, Z. 154–156 —
   von mir am Endstand nachgelesen); fehlt die Angabe (ältere App), wird nicht verglichen. Wird
   `updated_at` gewählt, gehört dazu: auch `app.satz_nachziehen` und `baustelle_umnummern` ändern
   `updated_at` — dann weist eine geänderte Einstufung jede offene Vorschau der Person ab. (b) Für
   N-G-1 die Lösung: `rechnung_ausstellen` läuft mit den Rechten des Aufrufers und ruft
   `rechnung_anlegen`, ein `revoke` geht also nicht; mindestens fünf Dateien unter
   `tests/supabase` rufen `rechnung_anlegen` direkt (Bericht 4 nennt sechs). (c) Für G-16 (4): „leer = Summe der Zeilen gilt“ oder „Prüfungen
   anpassen“. Oder alle drei als offene Fragen in 10.3.

5. **N-S-2: wie `ausgegebenes_material` im Supportzugang läuft, steht nicht da; S-13 Nr. 3 fehlt.**
   *Stelle:* Paket 1, Schritt 8 und Vorgabe N-S-2 (Z. 1740, 1761); Schritt 4.
   *Steht dort:* „der Aufruf von `ausgegebenes_material` läuft auch im Supportzugang mit
   ‚Mitarbeiten‘“.
   *Muss dort stehen:* der Weg. `app.baustelle_abschluss_zaehlen` ruft
   `public.ausgegebenes_material(…)`, das den Betrieb nur aus dem Token nimmt (am Endstand
   gelesen). Papier 6 führt `ausgegebenes_material` als für den Support **richtig verschlossen**
   („Rechnungen gehen im Supportzugang nicht“). Also: der Zähler nimmt einen Kern ohne
   Token-Bezug, der direkte Aufruf bleibt dem Support verschlossen — und eine Prüfung
   (`baustelle_abschluss_lage`/`baustelle_abschliessen` mit „Mitarbeiten“ an einer echten
   Baustelle; mit „ansehen“ weiter abgewiesen). Dazu fehlt Bericht 6, Abschnitt 3 Nr. 3:
   `baustelle_verwendung`, `baustelle_abschluss_lage`, `artikel_verwendung` weisen „ansehen“ über
   die Rolle ab. Alle drei stehen in `LESENDE_FUNKTIONEN` (`netzFrist.ts`), der Wächter aus
   Schritt 4 braucht für sie also einen Eintrag „verschlossen“ mit Grund — ebenso für
   `retoure_rahmen` (gehört nach der Vorgabe zum Schreiben, steht aber in der Leseliste).

6. **Wächter Textersatz gegen die eigenen späteren Pakete.**
   *Stelle:* Paket 1, Schritt 1 (Z. 1733); Paket 3, Schritt 3; Paket 22 (A-5); Paket 26 (S-12:
   „als Ganzes neu schreiben“).
   *Steht dort:* der Wächter schlägt an, „wenn eine Funktion nach einem Textersatz noch einmal
   definiert wird“; die Tabelle „Funktion → muss enthalten“ nennt `urlaub_entscheiden`,
   `urlaub_kuerzen`, `app.baustelle_abschluss_zaehlen`.
   *Muss dort stehen:* Paket 3 definiert `rechnung_anlegen` neu („Ausgangstext aus `\sf`“),
   Paket 26 `person_loeschen`, Paket 22 `person_auskunft` — alle drei nach einem Textersatz
   (`20261116060000:280` u. a.). Der Wächter wird dort bestimmungsgemäß rot. Die Regel dazu fehlt:
   bewusste Neudefinition vom Endstand → Eintrag mit Grund in der Ausnahmeliste, **und** die
   Tabelle „muss enthalten“ führt `rechnung_anlegen` → `ruest_position`, `material_je_ausgabe`
   (genau der Verlust, vor dem die Voraussetzung von Paket 3 warnt) sowie je ein Merkmal für
   `person_auskunft` und `person_loeschen`.

7. **Neue Befunde und Bauten aus 4.10 ohne Prüfung und „bleibt gleich“; N-P-2 ohne Schritt.**
   *Stelle:* Pakete 3, 5, 6, 21–26, 29.
   *Steht dort:* Die Tabellen „Prüfung mit Gegenprobe / Bleibt gleich“ führen nur die Kürzel der
   Papiere. Für die `N-…`-Befunde steht ein Schritt, aber (außer N-Z-1, N-S-1, N-S-4) keine
   Prüfung und kein „bleibt gleich“; N-P-2 steht in Schritt 2 von Paket 5, der Text beschreibt
   aber nur N-P-1, N-P-3, N-P-7; N-M-2 steht nur als Kürzel in der Schrittliste; N-G-6 hat
   „Lösung vor dem Bau festlegen“. Dasselbe gilt für die aus 4.10 neu eingeplanten Bauten (Nr. 5,
   11, 16, 23, 29, 30, 37, 38, 44, 47, 51), deren Bewertung laut 12.3 nicht gegengeprüft ist.
   *Muss dort stehen:* je Punkt eine Zeile (Prüfung mit Gegenprobe, „bleibt gleich“) oder der
   Satz, den der Plan sonst verwendet („vor dem Bau festzulegen“); für N-P-2 ein Schritt oder
   ausdrücklich „kein eigener Bau — der Schaden ist über P-1, S-5 und Z4 begrenzt“; für N-G-6
   und N-M-2 die Lösung oder eine Frage in 10.3.

8. **S-9 ändert eine Regel aus `CLAUDE.md` ohne Entscheidungszeile.**
   *Stelle:* 4.10 Nr. 52 (Z. 687); Paket 27, Schritte und Vorgabe S-9 (Z. 3441–3443, 3449).
   *Steht dort:* „die Grenze mit Grund in `CLAUDE.md` und `DEPLOYMENT.md`“ benennen.
   *Muss dort stehen:* `CLAUDE.md:82` sagt „Geheimnisse … nie in GitHub-Secrets“; in
   `supabase-migrationen.yml:122–158` liegen Zugangstoken und Datenbankpasswort dort. Der Plan
   behält die Praxis und ändert den Wortlaut der Regel. Das ist eine Entscheidung des
   Auftraggebers (Regel anpassen und Grenze benennen — oder die Zugangsdaten aus GitHub nehmen)
   und gehört als Zeile nach 10.3 b). Die Härtung selbst (kein `npm ci` im Auftrag `einspielen`,
   Actions auf Commit-Kennung, Umgebung, Wächter) hängt daran nicht.

9. **Abschnitt 2.1 und Regel 3: eine Grenze des Funktionsinventars fehlt.**
   *Stelle:* Z. 236, 255–260.
   *Steht dort:* „der Vergleich zählt je Datei, wie oft ein Schlüssel vorkommt“.
   *Muss dort stehen:* `inventar()` entdoppelt selbst je Datei
   (`scripts/funktionsinventar.mjs`, letzte Zeilen der Funktion: `einzeln.set(schluessel(e), e)`
   mit Datei, Art, Text, Ziel). Eigener Zähllauf ohne Entdoppeln: 2.338 Bedienstellen roh, 2.227
   nach dem Entdoppeln; 87 Schlüssel stehen mehrfach in derselben Datei (111 überzählige, z. B.
   zweimal „Hauptnavigation“ in `Layout.tsx`). Das Zählen je Datei geht also erst, wenn das
   Skript die rohe Liste liefert; sonst bleibt die Gegenprobe grün, wenn von zwei gleichen
   Knöpfen einer Datei einer wegfällt. In 2.1 als (d) und in Regel 3/Paket 8 als Schritt
   aufnehmen. (Die übrigen Angaben zu den Werkzeugen stimmen, Abschnitt 7.)

10. **Wortlaut, kleine Lücken.**
    (a) *1.4, Z. 150–151 (L-1/M-2/N-L-1):* als Tatsache geschrieben. Belegt ist die
    Datenbankhälfte; der Schnitt an PostgREST und der Wert im gehosteten Projekt sind nicht
    nachgestellt (Bericht 7: „sehr wahrscheinlich — belegt ist der Wert nicht“). Zusatz „am Code
    bestätigt; der Wert wird in Paket 1, Schritt 0 abgelesen“.
    (b) *1.5, Z. 188–190:* „nicht enthalten … G-13“ — nicht enthalten sind auch G-3 (Paket 24:
    „ohne G-3 und G-13“) und P-8 (Paket 23: „ohne P-8“).
    (c) *Paket 3, Risiko (Z. 1890):* zu G-1 fehlt die größere Folge der Hauptregel: eine
    **Teilzahlung**, deren Zweck die Nummer ohne Buchstaben-Vorsatz nennt, ist nicht mehr
    vorgewählt — bei einem Betrieb ohne Vorsatz ist das jede Teilzahlung (Bericht 4, 4.10:
    „gewollt, benannt“ — im Plan nicht benannt).
    (d) *Tabellen „Wortlaut des Papiers“:* fünf Zellen geben eine vom Prüfer widerlegte Prüfung
    oder ein widerlegtes „bleibt gleich“ wieder (A-1: „Pauschalbaustelle mit Schlussrechnung …
    ohne Migration rot“ und „Regiebaustelle zählt wie bisher“; M-6: „heutiger Stand öffnet nichts
    (rot)“; G-1: „die 32 bestehenden Fälle halten das fest“; M-3: „Einheit mit Bestand
    abgewiesen“ gegen E-F15; L-1: `tests/unit/nachkalkulationBuendel.test.ts`). Die Vorgaben
    darüber berichtigen sie — die Zellen sollten trotzdem gekennzeichnet sein („berichtigt, siehe
    Vorgabe“), sonst wird die falsche Prüfung gebaut.
    (e) *Nachtragen:* Bericht 7 zu L-12 (`ansicht()` erwartet einen Pfad, `ansichten.ts:65` —
    für das Nachladen in Paket 29); Bericht 6 zu S-11 (`connect-src https://*.googleapis.com`
    bleibt gleich weit); Bericht 3, 3.2 (`vorgemerkteScheine` trägt die Unterschriften nicht,
    `vorgemerkt.ts:79–82`); Paket 5, Schritt 5 sollte Schritt 3 des Papiers P-2 (Fehler statt
    leerer Menge über 62 Tage) ausdrücklich nennen — bisher steht er nur in der Vorgabe und unter
    „bewusst geändert“; Verdacht M-6 steht in 4.9 „vor Paket 15“, als Voraussetzung aber bei
    Paket 25; E-F27 trägt zwei Zustände („bleibt, wie es ist — zurückgestellt“); Regel 12 lässt
    aus `CLAUDE.md` weg: Support in Leseregeln (`or company_id = (select app.supportbetrieb())`)
    und Rollen/`auth.uid()` als `(select …)`.

## 2. Prüfberichte 1–7

„Richtig?“ heißt: steht an der genannten Stelle, im Sinn des Berichts, nicht abgeschwächt und
nicht zugespitzt. Vollständig für „teilweise“, Warnungen, „Zum Plan“ und Nebenbefunde; für die
bestätigten Befunde eine Stichprobe (zusammen 45 Kürzel).

### Bericht 1 — Zeit und Personal (Urteile 7 / 8 / 1 — im Plan gleich)

| Punkt | Im Plan | Richtig? | Anmerkung |
|---|---|---|---|
| Z-6 teilweise (Lücke stimmt, Risikoaussage falsch, „drei Texte“ zu stark) | 4.1; Paket 21 (a), Vorgabe Z-6 | ja | sechs Wächter namentlich; Grenzen in der Funktion mit Prüfung je Grenze; „Krankmeldung nachtragen“ als eigener Weg |
| Z-1, Warnung 2a (Einstufung; `is_night_work` kippt; Merker) | Paket 1 Schritt 3, Vorgabe Z-1, N-Z-1, E-F22 | ja | die geforderte Prüfung steht wörtlich da. Zur Wahl in E-F22 siehe Abschnitt 6 |
| Z-2, Warnung 2a (einzeln streichbarer Tag; Bestand seit 16.11.) | Paket 1 Schritt 2, Vorgabe Z-2 | ja | am Endstand nachgelesen (Abschnitt 5) |
| Z-15, Warnung 2a (Ausnahmeliste) | Paket 1 Schritt 1, Vorgabe Z-15 | ja | weitergedacht in Auflage 6 |
| Zum Plan 1 (kein Rückfall, „nachgestellt“) | 1.4, Kurztext Z-1 | ja | |
| Zum Plan 2–4 | Paket 1, Schritte 1–3, „bleibt gleich“, Aufwand m | ja | |
| Zum Plan 5 (Z-8 nicht „stundenweise“) | Kurztext Z-8, Paket 21 (b), Vorgabe | ja | beide Reihenfolgen, `zeit_timer_buchen`, Prüfung über den Altbestand |
| Zum Plan 6 (Z-14) | E-Z14 (Teil 2), Paket 21 (h), K-5 | ja | Einstellung gilt nicht als entschieden |
| Zum Plan 7 (Z-3/Z-13 dieselbe Spalte) | Paket 21 (d), (e); Vorgaben | ja | |
| Zum Plan 8–12 | Paket 21 „Bleibt gleich“; Vorgabe Z-7; Paket 5 Schritt 9; Z-4 in Paket 5 | ja | |
| Nebenbefund Einstufung | N-Z-1, Paket 1 | ja | |
| Nebenbefund `users_betriebsurlaub_nachbuchen` | N-Z-4, Paket 21 (a) | ja | ohne Prüfung (Auflage 7) |
| §5 zwei Krankmeldungen | N-Z-2, Paket 5 Schritt 6 | ja | ohne Prüfung (Auflage 7) |
| §5 Eintritt/Austritt | N-Z-3, Paket 21 (a); Grenze 3 in 4.10 | ja | „nicht sperren, festhalten“ ist der Vorschlag des Papiers (§4, Zeile 10) |
| §5 Wochenruhe, `listOpenVacations` | Verdacht Z-2, Z-8 offen | ja | |
| Stichprobe bestätigt: Z-3, Z-4, Z-5, Z-7, Z-9, Z-11, Z-13 | Vorgaben in 21 und 5 | ja | Z-4: `WHEN`-Bedingung und Satz zur 14-Tage-Regel beide da |

### Bericht 2 — Auftragskette (2 / 13 / 2)

| Punkt | Im Plan | Richtig? | Anmerkung |
|---|---|---|---|
| A-1 teilweise (Umfang, Schwere) | 4.2 (n–m), 1.4 (aus der Liste genommen), Paket 1 Schritt 8, Vorgabe | ja | vier Punkte der rechten Spalte alle da; Folge für die Warnung siehe Abschnitt 6 |
| A-14 teilweise (schwerer; Titel) | 4.2 (m), 1.4, Paket 3 Schritt 7, Vorgabe | ja | „abweisen mit Meldung“ entschieden |
| A-2 Warnungen (1)–(4) | Paket 22 (a), Vorgabe, E-F14 | ja | Verweis auf `EinsatzFormular.tsx:562–571` berichtigt |
| A-3 Warnungen (1)–(4) | Paket 3 Schritt 7, Vorgabe, „Weitere Prüfungen“ | ja | Zweig „schon angenommen“ am Endstand gelesen (Kern, Z. 22–24) |
| A-4 Berichtigung und Risiko | 4.2, Paket 3 Schritt 8, Vorgabe | ja | „kein `rpcAlle`“, zwei Abfragen |
| A-12 Lücke | Paket 18, Vorgabe A-12 | ja | (Teil Oberfläche; nur das Vorhandensein geprüft) |
| A-13 Widerspruch | E-A13 (Teil 2), Paket 22 (h), Vorgabe | ja | |
| A-17 | Liste 8.3, E-R4 | ja | bleibt, wie am 15.11. gebaut |
| Zum Plan: Paket 10 braucht A-10; A-14 zu A-3; dieselbe Funktion in 1 und 22; A-7; A-5/A-13 nach Wächter | 9.1; Paket 3; Regel 13; Vorgaben; Voraussetzung Paket 22 | ja | |
| Zum Plan 3.8 (A-4 gebaut, nicht benannt) | Schlussabsatz 4.10 | ja | |
| §5 V-2, V-3 | N-A-1 (E-F20), N-A-2, Paket 22 (k) | ja | ohne Prüfung (Auflage 7) |
| §5 V-4 entkräftet; V-1, V-5 offen | 4.9 | ja | |
| Stichprobe bestätigt: A-5, A-6, A-7, A-8, A-9, A-10, A-11, A-15, A-16 | Vorgaben Paket 22 | ja | A-9: „der Platz wartet nicht“ |

### Bericht 3 — Planung, Startseite, Scheine (3 / 9 / 0)

| Punkt | Im Plan | Richtig? | Anmerkung |
|---|---|---|---|
| 3.1 P-1 Schritt 4 (Hilfsfunktion; Anlegen und Ändern) | Paket 5 Schritt 1, Vorgabe (1), „Bleibt gleich“ | ja | `customers_lesen` schließt „Mitarbeiter“ aus — selbst gelesen |
| 3.2 P-1 Schritte 1/2 (erst sichern, dann räumen; `begrenzt`) | Vorgabe (2), (6); „Bleibt gleich“ mit den vier Prüfdateien | ja | es fehlt der Satz zu `vorgemerkt.ts:79–82` (Auflage 10 e) |
| 3.3 P-1 Schritt 3 (Unterschrift; Fotos; Fälle c, d) | Vorgabe (3)–(5), K-7 | ja, mit Auflage 1 | |
| 3.4 Auslöser e), f) | N-P-3, Vorgabe | ja | „liegen lassen“, „vor dem Bau im Stack nachstellen“ |
| 3.5 P-2 Schritt 3 | Vorgabe P-2, „bewusst geändert“ | ja | im Schritt selbst nicht genannt (Auflage 10 e) |
| Zum Plan: Paket 1 Schritt 8 „bleibt gleich“ falsch | Schritt 8, Vorgabe P-10 | ja | alle drei Fälle und die Gegenprobe |
| Zum Plan: P-11 doppelt | nur Paket 17 | ja | |
| Zum Plan: P-4 gegen L-7 (ein Weg) | Vorgaben P-4, L-7 | ja | |
| Zum Plan: P-8/P-1 Datenschutz | E-F12, K-6, K-7 | zum Teil | Auflage 1 |
| Zum Plan: P-3 Voraussetzung, „am Budgetlimit“ | Paket 29, E-F18 | ja | |
| Zum Plan: Wächter führt `baustelle_abschluss_zaehlen` | Paket 1 Schritt 1 | ja | |
| N-1 (leere 404) | N-P-1, Paket 5 | ja | ohne Prüfung |
| V-1 (Sperrseite) | N-P-2 | ja, ohne Schritt | Auflage 7 |
| V-2, V-3 | N-P-4, N-P-6, Paket 22 (a) | ja | |
| V-4 | N-P-5, E-F19, Paket 23 (g) | ja | |
| N-2 | N-P-7 | ja | als nachgestellt geführt, mit der Vorgabe „vor dem Bau über die App nachstellen“ |
| Stichprobe bestätigt: P-4, P-5, P-6, P-7, P-9, P-12 | Vorgaben 23, 5, 22 | ja | P-6: E-F16 „bleibt“; P-7: Arbeitstage zum Datum |

### Bericht 4 — Geld (7 / 9 / 1)

| Punkt | Im Plan | Richtig? | Anmerkung |
|---|---|---|---|
| G-1 teilweise (92 Nummern; breitere Ursache; Vorschlag) | 4.4 (m), 1.4, Paket 3 Schritt 1, Vorgabe, „Weitere Prüfungen“ | ja | (a)–(d) des Berichts vollständig; Folge für Teilzahlungen fehlt im Risiko (Auflage 10 c) |
| G-2 Warnung | Vorgabe G-2, N-G-5 | ja | `steuerbefreiungVorgabe`, `appendDetail`, kein `setStundenStand` |
| G-5 Warnung (`p_belege` bricht) | Vorgabe G-5, Regel 14 | ja, aber drei Wege | Auflage 4 |
| G-6 Warnung (Storno aufheben; Reihenfolge der Auslöser; Altdaten) | Vorgabe G-6 | ja | `invoices_baustelle` gibt es |
| G-14 Warnung (zwei Stellen; leerer Satz) | Paket 3 Schritt 4, Vorgabe | ja | zwei Stellen am Endstand gelesen (Z. 102, 176) |
| G-16 vier Festlegungen | Vorgabe G-16 | ja | (4) bleibt offen (Auflage 4) |
| Zum Plan 2 (Paket 1 zuerst; `\sf`; eine Migration) | Voraussetzung Paket 3, Regel 13 | ja | Textersatz in `20261116060000:280` selbst gelesen |
| Zum Plan 3 (G-4 lösen) | Paket 4 | ja | hält Stufe A nicht auf |
| Zum Plan 6 (G-10 Stufe 1) | Kurztext, Paket 24 (c) | ja | Teil 2: Auflage 2 |
| Zum Plan 7 (G-17 ohne Schritt) | Paket 24 (f) | ja | Auflage 3 |
| Zum Plan 8 (nicht angekommen) | Grenzen 29, 30, 15, 34; Paket 24 (g); E-F5; I-G1 bis I-G9 | ja | |
| Zum Plan 9, 10 | Vorgaben G-7, G-8, G-11, G-2 | ja | |
| V-4 entkräftet; V-2, V-3 Tatsache | 4.9; E-F21 | ja | |
| N-1 bis N-5 | N-G-1 bis N-G-5 | ja | N-G-1 ohne Lösung (Auflage 4) |
| Stichprobe bestätigt: G-3, G-4, G-7, G-8, G-12, G-17 | Vorgaben 24, 4 | ja | G-4: „Sonstiges“ steht in K-1 |

### Bericht 5 — Material (7 / 8 / 1)

| Punkt | Im Plan | Richtig? | Anmerkung |
|---|---|---|---|
| M-6 teilweise | 4.5 (n), Paket 25 (b), Vorgabe | ja | Prüfzeile des Papiers widerlegt (Auflage 10 d) |
| M-1 Warnung (leeres Lager) | Paket 1 Schritt 5 (fett), Vorgabe, N-S-1 | ja | selbst nachgestellt (Abschnitt 5) |
| M-3 drei Risiken | Vorgabe M-3, E-F15 | ja | |
| M-4 zwei Fallen | Vorgabe M-4, N-M-1 | ja | „abweisen nur bei echter Änderung“ |
| M-8 („ohne ausgelaufene“) | Vorgabe M-8, Reihenfolge M-11 vor M-8 | ja | |
| Zum Plan 2 (Wächter-Kriterium) | Paket 1 Schritt 4 | ja | |
| Zum Plan 3 (`ausgegebenes_material`; rund 30 Einträge) | Schritte 6, 7; Vorgabe M-16 | ja | |
| Zum Plan 8 („bleibt gleich“ Paket 4) | Paket 6, zehn Prüfdateien (die neun des Berichts und `lagerListe.test.ts`) | ja | alle zehn gibt es |
| Zum Plan 10 (M-5) | Vorgabe M-5, Paket 25 (a) | ja | „dem Auftraggeber sagen“ — siehe Abschnitt 6 |
| §5 Zählliste; Rüstlisten; Uhr | N-M-2, N-M-3, Verdacht M-5 | ja | N-M-2 ohne Beschreibung (Auflage 7) |
| Stichprobe bestätigt: M-2, M-7, M-9, M-11, M-13, M-14, M-15 | Vorgaben 1, 25, 6 | ja | M-11: vier ändern, `materialdeckung` nicht |

### Bericht 6 — Grundlagen und Sicherheit (4 / 8 / 1)

| Punkt | Im Plan | Richtig? | Anmerkung |
|---|---|---|---|
| S-13 teilweise, Nr. 1 (`schein_verrechnung`) | Vorgabe S-13, „bleibt gleich“ Projektleiter | ja | |
| S-13 Nr. 2 (vierter Rückfall) | N-S-2, Paket 1 Schritt 8 | ja, Weg fehlt | Auflage 5 |
| S-13 Nr. 3 (drei Funktionen weisen „ansehen“ ab) | — | **fehlt** | Auflage 5 |
| S-13 Nr. 4 (NULL-Rollenprüfung) | N-S-4, Regel 12, Risiko Paket 1 | ja | |
| Paket 1 Schritt 5 Nr. 1 (Vorschlag der Fassung 1 bewirkt nichts) | Absatz „Zu S-13 im Einzelnen“ | ja | deckt sich mit Papier 6, Z. 536–541, und dem Endstand |
| Nr. 2 (`lager_frei`, `lager_knapp`) | Schritt 5 | ja | |
| Nr. 3 (Warnung zur Sicherheit) | „mit ‚ansehen‘ ändert kein Aufruf eine Zeile“ | ja | |
| Schritt 4 (Kriterium) | Schritt 4, Vorgabe S-10 | ja | |
| S-2, S-5, S-6 (nicht der Vorschlag des Papiers) | Paket 5 Schritte 3, 7, 8; Vorgaben | ja | |
| S-3 (`konten_offen`) | Vorgabe S-3 | ja | Spalte gibt es noch nicht — als neu erkennbar |
| S-9 | Paket 27 | ja | Auflage 8 |
| E-S falsch gefragt | E-S (Teil 2), Paket 26 | ja | Grund der Grenze ist eigene Formulierung (Protokoll C.4) |
| S-1 (401 ohne Token) | Vorgabe S-1 | ja | |
| V-2, V-3, V-6 | N-S-3, N-S-5, N-S-1 | ja | |
| `passwort_hilfe_anfragen` | Grenze 51, Paket 26 | ja | |
| Stichprobe bestätigt: S-4, S-7, S-8, S-11, S-12 | Vorgaben 26 | ja | S-11: Zusatz zu `googleapis` fehlt (Auflage 10 e) |

### Bericht 7 — Technik (3 / 11 / 2)

| Punkt | Im Plan | Richtig? | Anmerkung |
|---|---|---|---|
| L-14 teilweise | 4.7, Paket 28, Vorgabe, „Bleibt gleich“ | ja | `monthly_stats` wird von `person_auskunft` und `person_loeschen` gelesen — selbst nachgesehen |
| L-15 teilweise | 4.7, Vorgabe L-15 | ja | „sichtbare Geschichte“ |
| L-1 Berichtigungen und Lücke | N-L-1, N-L-2, Schritte 0 und 7, Vorgabe | ja | Auflage 10 a zum Wortlaut in 1.4 |
| L-2 (sieben Hüllen) | Schritt 6, Vorgabe | ja | alle sieben Stellen geöffnet |
| L-4 („eine Datei mehr hält“) | Kurztext, Paket 2 | ja | |
| L-7 (kein Kanal aus der Datenbank; Warteschlange; elf Stellen; Ausgangsfach; Wächter) | Paket 23 (a), Vorgabe | ja | elf Stellen mit `kanalHalten` gezählt |
| L-8 (2), L-9, L-10 | Vorgaben 27, 2 | ja | |
| L-12 (Fassung des Papiers; Bausteine) | Paket 7, Paket 29 | ja | `ansicht()` fehlt (Auflage 10 e) |
| L-13 (a) | Vorgabe, „Bleibt gleich“ | ja | |
| Regel 7 gegen `CLAUDE.md` | Regel 7 neu, 2.1 | ja | |
| V-1 | Paket 23 (a) vor L-7 | ja | |
| V-2, V-4, V-6, V-7 | 4.9; N-G-6; N-L-3 | ja | |
| Stichprobe bestätigt: L-3, L-5, L-6, L-11, L-16 | Vorgaben 29, 28, 12 | ja | |

## 3. Die 32 Änderungen (mein Teil)

| Nr. | Verlangt | Im Plan | Urteil |
|---|---|---|---|
| 4 | Regel zu Sicherheit, älterer App-Fassung, Handbuch/Stand | Regeln 12, 14, 15, dazu 13 | eingearbeitet (Auflage 10 e: zwei Halbsätze aus `CLAUDE.md` fehlen) |
| 5 | L-9, L-4 Schritt 1 vor Paket 2; Fenster vor Stufe B; L-11 vor Stufe C | Pakete 2, 7, 12; 9.1 | eingearbeitet |
| 17 (M-6) | M-6 ganz ins Material-Paket | Paket 25 (b); 9.1 | eingearbeitet |
| 19 | S-9 vollständig | Paket 27 | eingearbeitet (Auflage 8) |
| 20 (G-12) | Abgleich folgt dem Schema | Paket 24 (e), Vorgabe G-12, 9.1 | eingearbeitet |
| 21 | 3.8 als Tabelle; „158“ | 4.10 (58 Zeilen), 165 nachgezählt | eingearbeitet — die 165 gehen auf (26+22+24+24+29+22+18, von mir gezählt) |
| 22 | Abschnitt Verdachtsfälle; zwei vor Paket 1 | 4.9; „Vorab“; Vorspann 4.6 | eingearbeitet; Verdacht G-4 zu Recht als erledigt geführt (Bericht 4) |
| 23 | Ideen zum Zusammenspiel | 4.11 (58), E-F26 | eingearbeitet |
| 24 | stillschweigend beantwortete Fragen | E-F1 bis E-F10 (mein Teil: E-F5, E-F6) | eingearbeitet |
| 26 | veralteter Wortlaut | Kopf, Pakete 1, 21, 24 | eingearbeitet |
| 27 | D3-6 verschieben; „nachgestellt“ | 1.4 | eingearbeitet |
| 32 | Summe; „Bauanleitung: Papier n“; Voraussetzungen | 1.5; Stufen D und E | eingearbeitet (Auflage 10 b) |

Kein Punkt ist ohne Grund nicht übernommen.

## 4. Neue Befunde, Verdachtsfälle, Grenzen, Ideen

**Neue Befunde (4.8).** 36 gezählt (Z 4, A 2, P 7, G 6, M 3, S 5, L 3, Oberfläche 6). Die 30 meines
Teils stimmen je mit ihrer Quelle überein; Urteil und Umfang sind nirgends zugespitzt (N-P-3
nennt „der Weg durch die App nur gelesen“, N-P-6 „nicht nachgestellt“, N-S-3 „an der Regel“).
Jeder ist einem Paket zugeordnet. Schritt, Prüfung, „bleibt gleich“: siehe Auflage 7. Nicht als
Befund geführt, aber im Bericht genannt: Bericht 6, Abschnitt 3 Nr. 3 (Auflage 5); Bericht 4,
Tabelle zu G-1, letzte Zeile (Abbuchung an einen Lieferanten: „offen“ statt „fremd“ — nur eine
falsche Auskunft; kann mit G-1 erledigt werden).

**Verdachtsfälle (4.9).** 45, vollständig gegen die Papiere (8, 5, 5, 6, 6, 8, 7). Stand je Zeile
mit den Berichten verglichen: 11 geklärt, 10 am Code oder als Tatsache, 2 entkräftet (A-4, G-4),
22 offen — stimmt. Verdacht S-4 (Realtime) steht vor Paket 1: im Kopf, in 1.5, 1.6, 4.6, 4.9, 9.1,
„Vorab“ und als Voraussetzung von Paket 1. Kleinigkeit: Verdacht M-6 (Auflage 10 e).

**Grenzen (4.10).** Alle Zeilen der sieben Papiere, deren Bewertung nicht mit „Ja“ beginnt (38
Zeilen, von mir ausgelesen), stehen in der Tabelle; dazu die „gültig, aber …“-Zeilen. Die Stände
aus den Berichten stimmen (Grenzen 3, 12, 13, 29, 30, 32, 51, 55). Was der Plan offen sagt und
bleibt: die Bewertungen selbst hat kein Prüfer gegengeprüft (12.3). Zu den Grenzen, die als
„zurückgestellt“ stehen bleiben, siehe Abschnitt 6.

**Ideen (4.11).** 58, vollständig (14, 7, 9, 9, 7, 7, 5). Keine eigene Idee ist eingeplant.

## 5. Pakete

**Gerüst.** Jedes Paket meines Teils hat Ziel, Punkte, Voraussetzung, Vorgaben, Prüfung und
„bleibt gleich“ (im Wortlaut des Papiers), Risiko, Aufwand. Die Schritte nennen jedes Kürzel der
Punkte-Zeile (von mir je Paket abgeglichen). Paket 4 hat keinen Schritt (wartet; Bauanleitung im
Papier) — in Ordnung.

**Voraussetzungen.** Kein Paket setzt etwas voraus, das später kommt: 3 nach 1 und 2; 5 und 6 nach
1; 7 nach 2 und 3; 22 baut auf `app.baustelle_abschluss_zaehlen` aus 1; 23 baut die Warteschlange
vor L-7; 24 nach 3 (G-2 vor G-11, G-1 vor G-12); 25 nach 6 (M-3 vor M-5); 29 nach 1 und 7.

**Kanzlei und Zurückgestelltes.** Als wartend geführt und in keinem Paket als entschieden gebaut:
G-4, G-13, G-3, Z-10, Z-12, Z-14 (Einstellung), P-8, A-9 (Inhalt), Z-11. Ausnahmen: Auflage 1
(P-1/K-6) und Auflage 2 (G-10 Teil 2).

**`CLAUDE.md`.** Regel 12 und 13 decken „Sicherheit und Daten“; die Vorgaben zu P-1, P-2, A-10,
A-16 nennen die Rechte und die Listen. Produktion wird nicht umgeschrieben (Regel 10; Z-2: nur
lesende Abfrage; A-5, G-7, G-14, M-4 je mit Altdaten-Aussage). Ausnahme: Auflage 8.

**Eigene Nachprüfungen**

| Stelle | Was ich getan habe | Ergebnis |
|---|---|---|
| Paket 1 Schritt 5 (M-1, N-S-1) | `s1.sql`: eigener Betrieb, zwei Lagerartikel, Plattformkonto mit Freigabe „ansehen“. Heutiger Stand; dann nur `lager_liste` umgestellt; dann `lager_frei` und `lager_knapp` dazu; dann Freigabe widerrufen | heute: `lager_liste` 42501, `lager_frei` 0, `lager_knapp` 0. Halber Umbau: `im_lager 0, treffer 0` ohne Fehler — das leere Lager. Ganzer Umbau: `im_lager 2, knapp 1`, `lager_frei` 2, `lager_knapp` 1 — wie der Administrator. Nach Widerruf 42501 und 0 Zeilen. **Schritt 5 und das Kriterium in Schritt 4 stimmen** |
| Paket 1 Schritt 2 (Z-2) | Endstand `urlaub_entscheiden`, `urlaub_kuerzen`; Suche über alle Funktionen | nur diese zwei rufen `app.urlaubstage(arbeitstage, …)` mit `u.work_days`; acht andere nutzen `urlaubstage_person`. Die Prüfung „kein Urlaubstag“ steht in `urlaub_kuerzen` Z. 84–85 — die Vorgabe trifft die richtige Stelle |
| Paket 1 Schritt 3 (Z-1, N-Z-1) | `app.monat_abgeschlossen_sperre`, `satz_nachziehen`, `satz_setzen`, `nacht_setzen`, `baustelle_aufloesen`; Auslöser an `time_entries` | zwei Ausnahmen (Dienst, Merker); `time_entries_abgeschlossen` läuft als erster `BEFORE`-Auslöser; `satz_setzen` und `nacht_setzen` rechnen bei jedem `UPDATE` nach, solange `old.is_billed` falsch ist; `satz_nachziehen` ohne Datumsgrenze. Der Schritt passt. Zu `satz`: Abschnitt 6 |
| Paket 1 Schritte 6/7 | Aufrufstellen und Endstand | `materialOrders.ts:473, 506`, `workSheets.ts:881` ohne `.range()`; `ausgegebenes_material` endet mit `order by a.datum, a.name, a.beleg_id`, `_gesamt` mit `a.baustelle, a.datum, a.name`, `schein_einkaufspreise` ohne Reihenfolge (Alias `wm`). `rpcAlle` gibt es noch nicht — als neu erkennbar. Stimmt |
| Paket 1 Schritt 8 (A-1, P-10, N-S-2) | Endstand `app.baustelle_abschluss_zaehlen` | zählt über `invoice_coverage` und `is_billed`; Material nur für `ist_buch_oder_spitze`; ruft `public.ausgegebenes_material`. Prüfung und „bleibt gleich“ des Plans passen dazu. Weg für N-S-2: Auflage 5 |
| Paket 1 Schritt 5 (S-13) | Endstand von `schein_verrechnung`, `retoure_rahmen`, `kommissionsartikel_im_lager`, den drei Anforderungsfunktionen; `app.lesebetrieb`, `arbeitsbetrieb`, `supportbetrieb` | der Absatz „Zu S-13 im Einzelnen“ beschreibt je Funktion die Stelle, die es am Endstand gibt; `app.lesebetrieb()` ist für ein Plattformkonto leer, `app.arbeitsbetrieb()` nur mit „mitarbeiten“ gefüllt — „ansehen“ bleibt damit draußen |
| Paket 3, G-1 | `g1.ts` mit der echten `nummerImText` | „20261112-004711“ und „AN-2026-1112“ → Stufe 1 auf `RE-2026-1112`; 14 Ziffern und TTMMJJJJ → 0; Betrieb ohne Vorsatz → Stufe 2. Beide Teile des Vorschlags sind nötig, die Vorgabe hat beide |
| Paket 3, G-5/G-16/N-G-1 | Endstand `rechnung_anlegen` (216 Zeilen), Textersatz in `20261116060000` | enthält `ruest_position` und `material_je_ausgabe`; `p_kopf` über `jsonb_populate_record`; `p_belege` je Schlüssel als Liste. Voraussetzung und Vorgabe stimmen; Übergabeform: Auflage 4 |
| Paket 3, G-14, A-3 | Endstand `app.vorrechnungen_pruefen`, `app.angebot_annehmen_kern` | zwei Stellen mit `reverse_charge`; Zweig „schon angenommen“ vor dem Anlegen. Stimmt |
| Paket 5, P-1 | `ausgangsfach.ts:174, 372–391`, `lagerIndexedDB.ts`, Regel `customers_lesen`, `schein_speichern` (`prosecdef = f`) | Sicherung synchron und nach dem Wegräumen; das Fach liegt in IndexedDB; der Monteur liest keine Kunden. Vorgabe (1), (2) stimmen |
| Paket 6, M-3/M-4 | Endstand `datanorm_uebernehmen`, `einkauf_geliefert`; Auslöser | `unit = coalesce(z.einheit, m.unit)` im `update`; `material_orders_einheit` feuert auf `material_id, einheit`; `einkauf_geliefert` setzt `material_id` immer mit und sucht über den Namen. Die Vorgaben treffen die Fallen des Berichts |
| Paket 24, G-17 | `belegReferenz.test.ts` | Auflage 3 |

**Mängel je Paket** (über die Auflagen hinaus keine):

- **Vorab:** eindeutig; setzt den lokalen Stapel voraus (in dieser Umgebung nicht vorhanden).
- **Paket 1:** Auflagen 5 und 6. Sonst baubar.
- **Paket 2:** nichts.
- **Paket 3:** Auflage 4; 10 c. N-G-4 steht unter „in einer Migration an `rechnung_anlegen`“, ist
  aber eine Begrenzung der Eingabe in der App — Wortlaut.
- **Paket 4:** wartet; nichts.
- **Paket 5:** Auflagen 1 und 7; 10 e.
- **Paket 6:** Schritt „M-3 (Einheit ändern)“ ist knapp; wie die Datenbank „von Hand mit
  Rückfrage“ von „alte App“ unterscheidet (eigene Funktion mit Bestätigung, direkter `update`
  abgewiesen), steht nicht da — aus E-F15 ableitbar, sollte aber dastehen. N-M-2: Auflage 7.
- **Paket 7:** nichts.
- **Pakete 21–23:** Auflage 7.
- **Paket 24:** Auflagen 2, 3, 7.
- **Paket 25, 26:** Auflage 7 (N-S-5: Höhe der Obergrenze fehlt).
- **Paket 27:** Auflage 8.
- **Paket 28, 29:** 10 e (L-12).

## 6. Entscheidungen

**Trennung.** Teil 1 (sechs), Teil 2 (neun), Teil 3 (5 + 33 + 18 + 12) und 10.4 (zehn Zeilen, neun
Fragen) sind sauber getrennt; die Zahlen stimmen. Das Protokoll nennt in Abschnitt C offen, wo
eine Empfehlung eigene Abwägung ist (E-S, E-F19 bis E-F21, E-F6).

**Eindeutigkeit (mein Teil).** E-M7, E-G12, E-G13, E-Z3, E-Z11, E-S, E-A13, E-Z14, E-F5, E-F6,
E-F12, E-F14 bis E-F22, E-F26, E-F28, E-F31: je eine baubare Aussage. E-F27 nennt zwei Zustände
(10 e). Keine dieser Empfehlungen nimmt eine Bedienstelle weg oder dreht eine frühere Entscheidung
still zurück; E-A13 und E-Z14 ändern die erste Entscheidung des Auftraggebers vom selben Tag und
sagen es. Ein Verhalten ändert E-F22 (Punkt 1 unten).

**Was sich der Auftraggeber vor dem Bau noch einmal ansehen sollte**

1. **E-F22 (Satz in abgeschlossenen Monaten).** Der Prüfer nennt zwei Wege und empfiehlt keinen.
   Gewählt ist „`app.satz_nachziehen` lässt abgeschlossene Monate aus“. Folge, von mir
   nachgestellt (`z1.sql`): heute zieht eine Berichtigung des Lehrbeginns die Satzklasse einer
   unverrechneten Oktoberbuchung nach (`lj2` → `lj3`); mit E-F22 bliebe sie in einem
   abgeschlossenen Oktober für immer `lj2` und würde so verrechnet. Betroffen sind Berichtigungen
   von Lehrbeginn und Lehrzeit und die erste Einstufung; ein gewöhnlicher Wechsel der Einstufung
   nicht (er gilt ab heute, der Verlauf hält die alte Klasse — `z1b.sql`). Der andere Weg (`satz`
   in die Ausnahme) hielte das heutige Verhalten. Die Begründung im Plan („dieselbe Regel wie für
   das Nacht-Kennzeichen“) setzt Lohnaufzeichnung und Verrechnungssatz gleich.
2. **E-F21 (entfernte Stundenposition sperrt die Buchungen).** „Bleibt, mit Hinweis“ ist die
   Empfehlung des Plans, nicht eines Prüfers; Papier und Bericht nennen es „fachliche
   Entscheidung“. Es geht um Stunden, die ohne Betrag als verrechnet gelten und danach gesperrt
   sind.
3. **E-F20 (Kundenseite nach der Rücknahme: „inzwischen zurückgenommen“).** Der Vorschlag stammt
   aus Papier 2, der Wortlaut aus dem Plan. Es ist ein Satz an den Kunden zu einer verbindlichen
   Erklärung — mit K-4/K-8 der Kanzlei zeigen.
4. **G-10, Teil 2** (Auflage 2) und **S-9** (Auflage 8): beide brauchen eine Zeile.
5. **A-1/P-10.** Nach dem Umbau warnt der Abschluss einer Pauschalbaustelle nicht mehr vor einem
   Schein oder Stunden, die **nach** der Schlussrechnung dazukamen (Zusatzarbeit). Der Prüfer
   schreibt „bewusst sehen … der Abschluss ist die letzte Stelle, an der es auffiele“. Im Plan
   steht das als Vorgabe, nicht als Frage.
6. **G-1.** Die Hauptregel nimmt Teilzahlungen ohne Buchstaben-Vorsatz die Vorwahl; bei einem
   Betrieb ohne Vorsatz jeder Teilzahlung (10 c). Gewollt — aber sagen.
7. **M-5.** Der Prüfer verlangt, es dem Auftraggeber zu sagen: Altpreise gelten als „fest“, die
   neue Funktion zieht im ersten Jahr fast nichts nach. Steht nur als Vorgabe im Paket.
8. **Grenzen, die als „zurückgestellt“ stehen bleiben** (E-F5, E-F27, E-F28; 4.10 Nr. 6, 14, 34,
   42, 43). Nach Grundsatz 6 bleibt eine Grenze nur mit einem der sechs Gründe; „zurückgestellt —
   neue Entscheidung nötig“ ist keiner, und für mehrere dieser Zeilen hält das Papier den
   bisherigen Grund ausdrücklich für nicht gültig („kommt später“, „einfacher“, „reicht“). Der
   Auftraggeber sollte wissen, dass er hier Grenzen ohne gültigen Grund stehen lässt, und welcher
   Grund im Grenzen-Dokument stehen soll.
9. **E-Z11.** Gilt als entschieden; K-9 fragt aber auch, „ob diese Einstellung so angeboten
   werden soll“. Der Bau beginnt nach der Auskunft — in Ordnung, nur sollte die Entscheidung
   nicht als unumkehrbar gelesen werden.
10. **E-F6.** Beantwortet die Hälfte der Frage aus dem Stand (leer bleibt leer; nicht Pflicht).

## 7. Werkzeuge und Regeln

| Aussage in 2.1 | Am Code geprüft | Ergebnis |
|---|---|---|
| Funktionsinventar: Vorher-Datei 1.941 Einträge, Stand vor V10 | `docs/ui-umbau/v10-funktionsinventar-vorher.json` | 1.941 — stimmt; heute liefert das Skript 2.227 |
| `v10-entfernt.json` mit 107 Einträgen | gezählt | 107 |
| Schlüssel Art + Text + Ziel ohne Datei; 496 teilen ihren Schlüssel; „Abbrechen“ 38, „Speichern“ 16 | `funktionsinventar.test.ts:25`; gezählt | 496, 38, 16 — stimmt |
| liest Quelltext, nicht Erreichbarkeit | Skript | stimmt |
| **nicht genannt:** entdoppelt je Datei | `inventar()`, Schluss | Auflage 9 |
| `fotos.mjs`: 35 Routen, hell, Chromium, `scrollWidth`; die genannten Routen fehlen | Datei | 35; keine der sechs geprüften Routen steht darin; kein dunkler Satz |
| Belegreferenz: zehn Dateien Byte für Byte; ruft `rechnung_anlegen` nicht | `belegReferenz.test.ts:268–272` | stimmt; Folge für G-17: Auflage 3 |
| Browserwege: Büro nicht in WebKit (`testMatch: MONTEUR_WEGE`) | `playwright.config.ts:58, 109, 124` | stimmt |

Der Plan behauptet von keinem der geprüften Werkzeuge mehr, als es leistet — mit der einen Lücke
aus Auflage 9. Die Regeln sind in den Paketen meines Teils angewandt: Regel 1 (Verdachtsfälle
werden geklärt, nicht gebaut), 9 (Wächter mit Ausnahmeliste und Gegenprobe: Schritte 1, 4, 6),
10 (Altdaten je Punkt), 12 (P-1, P-2, A-10, A-16), 13 (Pakete 3, 22), 14 (G-5, G-6, G-16, M-4,
Z-4, L-14). Regel 2 ist für die neuen Befunde nicht durchgezogen (Auflage 7).

## 8. Zahlen

| Angabe | Nachgezählt | Ergebnis |
|---|---|---|
| Urteile je Bericht 1–7 (nachgestellt / am Code / teilweise) | 7/8/1 · 2/13/2 · 3/9/0 · 7/9/1 · 7/8/1 · 4/8/1 · 3/11/2 | wie in 1.1; je Kürzel mit der Spalte „Gegenprüfung“ in 4.1–4.7 verglichen: 107 von 107 gleich |
| „33 nachgestellt“, „acht teilweise“, „kein Befund am Code widerlegt“ | 33; Z-6, A-1, A-14, G-1, M-6, S-13, L-14, L-15; 0 | stimmt |
| Arten 26 / 34 / 25 / 13 / 9 | aus 4.1–4.7 gezählt | stimmt (G-3 als Fehler) |
| 36 neue Befunde | 4.8 gezählt | 36 |
| 45 Verdachtsfälle; 11 / 10 / 2 / 22 | 4.9 gezählt | stimmt |
| 165 Grenzzeilen; 58 in der Tabelle; 58 Ideen | Papiere ausgelesen; Tabellen gezählt | stimmt |
| Teil 3: 5 / 33 / 18 / 12; zehn Punkte, neun Fragen | gezählt | stimmt |
| Aufwand A 25–34 | 6–8, 1, 6–8, 1–2, 6–8, 5–7 | 25–34 |
| vor B 4–6; B 31–42; C 75–95 | 4–6; (6–8 + 3–5), 8–10, 6–8, 6–8, 2–3; acht Pakete | stimmt |
| D 95–119 | 23–29, 13–16, 10–13, 23–28, 19–24, 7–9 | 95–119 |
| E 15–19 | 3–4, 4–5, 8–10 | 15–19 |
| gesamt „rund 245 bis 315“ | 245,5 bis 316 | stimmt |

Mehr Gewissheit als die Berichte hergeben: nur 1.4 zu L-1 (Auflage 10 a). „Rückfall“ bei S-1/M-1:
dass die Listen vor dem 18.11. für den Support lesbar waren, hat Bericht 5 nicht nachgesehen
(dort §6); die Migrationen vom 18.11. legen die Funktionen neu an — die Bezeichnung ist
vertretbar.

## 9. Erfundenes oder Falsches (Stichprobe)

Geprüft, ob es Datei, Funktion, Zeile gibt und die Aussage stimmt. **Ergebnis: nichts Erfundenes.**

| Nr. | Aussage im Plan | Ergebnis |
|---|---|---|
| 1–8 | Funktionen `app.monat_abgeschlossen_sperre`, `app.satz_nachziehen`, `app.nacht_setzen`, `app.satz_setzen`, `app.baustelle_aufloesen`, `app.urlaubstage_person`, `app.scheine_verrechnet_kern`, `app.baustelle_abschluss_zaehlen` | gibt es, Verhalten wie beschrieben |
| 9–16 | `lager_frei`, `lager_knapp`, `baustellen_liste`, `wartungen_faellig_stand`, `anforderungen_laufend`, `schein_verrechnung`, `retoure_rahmen`, `kommissionsartikel_im_lager` | gibt es; Betrieb heute aus dem Token bzw. wie beschrieben |
| 17–20 | `app.arbeitsbetrieb`, `app.lesebetrieb`, `app.support_liest`/`app.support_schreibt`, `app.verrechnung_betrieb` | gibt es; `verrechnung_betrieb` kennt nur Buchhaltung, Spitze, Support |
| 21 | `rechnung_anlegen` = Definition `20261116050400` + Textersatz `20261116060000:280` | stimmt |
| 22 | `rechnung_storno_aufheben`, Auslöser `invoices_baustelle` | gibt es |
| 23–29 | sieben Hüllen: `kern.ts:422`, `plattform.ts:112`, `nachrichten.ts:165`, `inventur.ts:98`, `invoices.ts:807`, `zeitsitzungen.ts:93`, `supabaseSender.ts:227` | alle sieben Zeilen sind `rpc` mit veränderlichem Namen (`zeitsitzungen.ts` liegt unter `src/lib/db/`) |
| 30 | `materialOrders.ts:473` | stimmt |
| 31 | `deploy.yml:55–75`: Auftrag `test` ohne Bau | stimmt |
| 32 | `leistungsbudget.json`: 260 Bausteine, 135 KB je Ansicht, `_warum` veraltet | stimmt |
| 33 | `supabase-migrationen.yml`: `npm run gemeinsames` in Zeile 154 | stimmt |
| 34 | `BaustellenSuche.tsx:82` sucht über den ganzen Betrieb | stimmt |
| 35 | `InvoicesView.test.tsx:6279`, 6.692 Zeilen; `InvoicesView.tsx` 6.574 Zeilen | stimmt |
| 36 | „371 Fälle“ | Quelle Bericht 11; statisch zähle ich 367 `it(`, davon zwei `it.each` — plausibel, nicht ausgeführt |
| 37 | `kontoauszugAbgleich.test.ts`: 32 Fälle | 32 |
| 38 | `wochenplanFuerAlle.test.ts:122–126` erwartet `[]` | stimmt |
| 39 | `scheinOhneEmpfang.test.ts`, `zeitEntwuerfe.test.ts`, `robustesAusgangsfach.test.ts`, `scheinVorgemerkt.test.ts`, `PremiumRueckmeldung.test.tsx` | gibt es |
| 40 | zehn Prüfdateien in Paket 6 „Bleibt gleich“ | gibt es alle |
| 41 | `BenutzerakteView.tsx:550` („das alte Zeitkonto bleibt abgeschlossen“) | stimmt |
| 42 | `baustelleAbschliessen.test.ts:61` `toMatchObject` | stimmt |
| 43 | `pdf.ts:144`, `stornoPdf.ts:63`, `mahnungPdf.ts:227`, `angebotPdf.ts:61`; kein `setCreationDate` in `src` | stimmt |
| 44 | `vite.config.ts:117` `vorschauKopfzeilen` | stimmt |
| 45 | elf direkte Kanäle in zehn Dateien | elf Aufrufe von `kanalHalten` an den genannten Zeilen |
| 46 | `LESENDE_FUNKTIONEN` „rund 100 Einträge“ | 99 |
| 47 | Tabellen `bank_buchungen`, `beleg_versand`, `mahnungen` | gibt es |
| 48 | `TimeForm.tsx` 1.944 Zeilen | stimmt |
| 49 | `supabase/config.toml:18` `max_rows = 1000` | stimmt |
| 50 | 817 Funktionen, 579 mit Eigentümerrechten, alle mit leerem Suchpfad (aus Bericht 6) | nachgezählt: 817 / 579 / 579 |
| 51–70 | Namen in der App: `nachDemAusstellen`, `steuerbefreiungVorgabe`, `appendDetail`, `setStundenStand`, `preisAlsText`, `sitzungAnderswoBeendet`, `AUFRUFE_OHNE_EMPFANG`, `istNetzfehler`, `begrenzt`, `getPushState`, `eigeneAenderung`, `beiEigenerAenderung`, `KOPF_SPALTEN`, `abschlussReif`, `calcOverallSaldo`, `kundenPflegen`, `aufEinkaufsliste`, `eigeneFahrzeugOrte`, `abhakOrte`, `PauschalHinweis` | gibt es alle |

Als **neu** und nicht als vorhanden verwendet (richtig so): `rpcAlle`,
`tests/unit/migrationenTextersatz.test.ts`, `tests/unit/funktionsgrenzen.test.ts`,
`urlaubMitVerlauf.test.ts`, `betrieb_zustand.konten_offen`, `zeit_monat_stand`,
`termine_der_person`. Ohne Pfad genannt, aber vorhanden: `bewegungen.spec.ts` (unter
`tests/links/`), `DEPLOYMENT.md` (unter `docs/`).

## 10. Nicht geprüft

- Abschnitte 5 bis 7, Stufen B und C, Berichte 8 bis 12 — Sache des zweiten Prüfers. Angesehen
  habe ich dort nur, ob A-12, L-11 und E-F21 an ihrer Stelle stehen.
- Die Proben der bisherigen Prüfer habe ich nicht wiederholt, außer den in Abschnitt 5 genannten.
  Nicht selbst nachgestellt: Z-1 mit eingespieltem Vorschlag, A-1/P-10 mit Rechnungen, G-16 mit
  verfälschten Summen, M-4 mit Auslöser, S-12, S-3, S-7 — dort stützt sich mein Urteil auf den
  Endstand der Funktionen und auf die Übereinstimmung von Plan und Bericht.
- Nichts gegen den Supabase-Stapel, PostgREST, Realtime, die Edge-Runtime oder im Browser; kein
  Lauf der Prüfungen des Repos. Der Verdacht S-4 ist damit weiter offen.
- Rechtsaussagen (Urlaub, Rücklass, Rechnungskorrektur, Verbraucherrecht) nicht am Gesetzestext;
  meine Anmerkung zum Wort „Gutschrift“ (Auflage 2) gehört zur Kanzlei.
- Die Bewertungen in 4.10 und die Einordnung der 58 Ideen nur auf Vollständigkeit, nicht fachlich.
- Aufwände: nur addiert, nicht nachgeschätzt.
- Die Kurztexte der bestätigten Befunde in 4.1–4.7 gegen die Papiere nur dort, wo ein Bericht sie
  berichtigt hat.
- Einmal versehentlich `git status --short` aufgerufen (nur lesend, Ausgabe leer); nichts
  geändert.
