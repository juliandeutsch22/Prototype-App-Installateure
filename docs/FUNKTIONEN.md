# Funktionsübersicht

Stand: 20.09.2026.

> **DER VORBEHALT VON HIER IST EINGELÖST.** Diese Datei war in der
> Firestore-Zeit geschrieben und sprach von Sammlungen, vom Emulator, von
> `firestore.rules` und von Cloud Functions. Mit dem Abbau von Firestore
> (19.09.2026) stehen hier die richtigen Namen: **Tabellen**, **Zeilenschutz
> (RLS)**, **Datenbankfunktionen**, **Trigger**, **Edge Functions**, und der
> Emulatorlauf heisst `npm run supabase:test` und läuft gegen eine echte
> Postgres-Datenbank.
>
> **Die Zahlen in der Spalte „Geprüft wodurch" sind nachgezählt**, nicht
> übernommen: sie stammen aus dem Prüflauf vom 19.09.2026. Wo ein Bereich
> mehrere Prüfdateien hat, stehen sie einzeln.

> **ZIELMARKT IST ÖSTERREICH.** Das ist keine Nebensache, sondern steckt in
> den Funktionen: UStG statt deutschem UStG, Bauleistung nach § 19 Abs 1a UStG,
> Urlaubsanspruch nach UrlG, die Empfänger-UID ab 10.000 € nach § 11 Abs 1a
> UStG, der Datumsaufbau und die Schnittstelle zur Buchhaltung (**BMD/RZL**,
> nicht DATEV). Eine deutsche Fassung wäre kein Sprachschalter, sondern eigene
> Arbeit — SKR03/SKR04, § 13b UStG, Bundesurlaubsgesetz. Was hier steht, gilt
> für Österreich.

**Wofür dieses Dokument da ist.** Die Roadmap ist inzwischen ein
Änderungsprotokoll: sie erzählt, was wann warum gebaut wurde, und sie ist
dafür auch richtig. Was sie nicht mehr beantwortet, ist die Frage, mit der man
vor der App sitzt — *was gibt es, wer darf was, und worauf kann ich mich
verlassen?* Diese Datei beantwortet genau das, und zwar auch da, wo die
Antwort unangenehm ist.

Eine Zeile je Bereich. Die Spalte **Geprüft wodurch** ist die wichtigste; sie
unterscheidet vier Stufen:

| Stufe | Was sie wert ist |
|---|---|
| **Datenbank** | Läuft gegen eine echte Postgres-Instanz (`npm run supabase:test`). Prüft Zeilenschutz, Datenbankfunktionen, Trigger, tatsächliches Verhalten. Belastbar. |
| **Browser** | Der Weg im echten Chromium gegen den laufenden Stapel (`npm run durchklick`). Fünf Wege, nicht mehr — siehe unten. |
| **Rechnung** | Reine Funktionstests der Formeln. Sagen, dass die Mathematik stimmt — nicht, dass die App läuft. |
| **Ansicht** | Rendern und Klicken, **aber jeder Datenbankzugriff ist ersetzt**. Findet Bedienfehler, keine Datenfehler. |
| **—** | Nicht automatisch geprüft. |

---

## Außendienst

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Zeiterfassung** | Tag buchen: Status, Von–Bis, Pause, Baustelle, Zuschläge; **eigene Zuschlagsstunden als Kachel**. Schlank für das Büro, voll für den Monteur. **Seit 24.09.2026 ist „Krank" eine Krankmeldung:** die Maske legt sie an (auf Wunsch über mehrere Tage, „Krank bis"); ein Tag einer Meldung wird nur über sie geändert — in der Liste führt „Krankmeldung" zu „Ende ändern" und „Löschen", auch ohne Modul Urlaub. Die Datenbank lässt Krank-Tage nur über die Krankmeldungs-Funktionen schreiben (`app.krank_nur_ueber_meldung`); alte Krank-Tage ohne Meldung wurden zu Meldungen zusammengefasst. **Seit 24.09.2026 (Prüflauf, Paket 1):** Urlaub bucht niemand mehr als Tagesstatus. Der Monteur bekommt „Urlaub" nicht angeboten (er beantragt ihn); das Büro trägt ihn mit „Urlaub bis" ein, und daraus wird über `urlaub_eintragen` ein genehmigter Antrag mit den freien Arbeitstagen. Ein Tag aus einem genehmigten Antrag (Urlaub oder ZA) trägt in der Liste den Knopf „Urlaubsantrag" statt Bearbeiten/Löschen; der Wächter `time_entries_urlaub_nur_ueber_antrag` lässt ihn nur über den Antrag ändern, Zeitausgleich ohne Antrag bucht und entfernt nur das Büro. Die Liste lädt **ein Jahr voraus**, damit kommende Krank-, Urlaubs- und ZA-Tage sichtbar sind; der Saldo zählt nichts nach heute. Eine leere Uhrzeit geht als `null` in die Datenbank — vorher scheiterte jeder Tag ohne Zeiten (Urlaub, ganztägiger ZA) mit „bitte erneut versuchen". | alle (eigene); Buchhaltung/GF auch fremde | `timeEntries` | Rechnung (44), Datenbank (13), Ansicht (8), Browser (Zeit buchen) | Der Ansichtstest prüft die Verdrahtung — welcher Weg zum Saldo, verrechnete Einträge gesperrt —, nicht das Formular **Seit 24.09.2026 Status „Zeitausgleich“** (ganztags oder mit Von/Bis): direkt buchen darf ihn das Büro, der Monteur beantragt ihn auf der Urlaubsseite. Stundenweiser ZA darf neben gearbeiteter Zeit stehen, aber nicht über ihr; Monatsauswertung, Stundennachweis und Lohn-CSV (Spalte „Zeitausgleich(Std)“ hinten angehängt) zeigen die ZA-Stunden |
| **Mein Einsatzplan** | Monatskalender der eigenen Einsätze, Kontaktdaten, Sprung zu Zeit und Schein; **seit 23.09.2026 auf Wunsch des Betriebs eine zweite Seite „Team-Woche“**: wer an welchem Tag auf welcher Baustelle ist, nur lesen | Mitarbeiter | `assignments`, `projects`, `vacations` (Team-Woche: nur über `wochenplan_abwesend`) | Ansicht (5 + 3 Team-Woche + 3 Schalter), Datenbank (9: Schalter aus/an, Büro, Support, Fremdbetrieb, nur Genehmigtes, Spannenbegrenzung), Einzel (3: Reiter am Schalter), Browser (aus → keine Seite, Adresse leitet um; an → breit und mobil) | Der Schalter „Alle Mitarbeiter sehen den Wochenplan (nur lesen)“ steht unter Einstellungen → Sätze und Kosten und ist **ab Werk aus**. Die Einsätze der Kollegen durfte der Monteur schon vorher lesen; **die Urlaube der anderen weiterhin nicht** — der Zeilenschutz von `vacations` ist unverändert. Die Team-Woche fragt stattdessen eine eigene Datenbankfunktion, die nur Wer/Von/Bis genehmigter Abwesenheit herausgibt (höchstens gut zwei Monate auf einmal); in der Ansicht steht „abwesend“, ohne Grund, Tageszahl oder Antragsstand. Keine „frei“-Angabe, nichts anklickbar. Der Support bekommt nichts |
| **Meine Baustellen** | Die Baustellen, denen der Monteur zugeordnet ist, mit Route und Telefonnummer | Mitarbeiter | `projects` | Ansicht (7) | Abgeschlossene fallen heraus, pausierte bleiben; ein fehlender Ansprechpartner wird angemahnt statt verschwiegen |
| **Material anfordern** | Warenkorb, Eilzustellung, eigene Anforderungen | Mitarbeiter, Verwaltung, Leitung | `materials`, `materialOrders` | Rechnung (25, Meldungen), Ansicht (21), **Datenbank (17, echte Transaktion)**, Browser (Material anfordern) | Der Lagerabzug läuft gegen eine echte Datenbank — auch **zwei gleichzeitige** Abschlüsse derselben Anforderung, der Fall, den kein Nachbau prüfen kann |
| **Urlaub** | Beantragen, entscheiden, Stand sehen. Genehmigung schreibt die Tage ins Zeitkonto. **Seit 24.09.2026:** der eigene **Resturlaub** steht oben als Kennzahl (dazu, was noch beantragt ist), im Antrag steht, was danach bleibt; Genehmigende sehen bei jedem Urlaubsantrag den Resturlaub der Person vorher und nachher. Ein Betriebsurlaub mit Abbuchung wird **ab dem Starttag** jedes Mitarbeiters gebucht und neuen oder wieder aktiven Mitarbeitern automatisch nachgebucht (`users_betriebsurlaub_nachbuchen`, nicht beim Rücklauf aus der Sicherung). **Seit 24.09.2026: ein Resturlaub statt zwei.** Jeder Urlaubstag im Zeitkonto gehört zu einem Antrag (alte Tage ohne Antrag wurden übernommen), und ein genehmigter Antrag trägt die TATSÄCHLICH gebuchten Tage — übersprungene zählen nicht mehr. Ist beim Genehmigen jeder Tag schon gebucht, wird nicht genehmigt. Vorher zeigten Urlaubsseite und Mitarbeiterübersicht verschiedene Zahlen. | alle (Antrag); Entscheider laut Einstellung | `vacations`, `timeEntries`, `companies` | Datenbank (19 Regeln + 15 Entscheidung + 6 Anfangsbestand + 16 Urlaubsjahr und Übertrag), Rechnung (22), Ansicht (15) | Die Tage der ECHTEN Datenbankfunktion laufen durch die ECHTE Saldorechnung — die Naht ist geprüft, nicht nur die beiden Hälften. **Seit dem 16.09.2026 liest die Anträge auch, wer sie entscheiden darf** — eine eingetragene Genehmigende aus der Verwaltung durfte entscheiden und sah eine leere Liste. **Seit 20.09.2026 ist auch der BEGINN des Urlaubsjahres einstellbar** (Vorgabe 1. Jänner). Bis dahin entstand der neue Anspruch fest am 1. Jänner — ein Betrieb mit einem anderen Urlaubsjahr bekam ihn ein halbes Jahr zu früh, und der Übertrag wurde im falschen Moment gemessen; auf dem Bildschirm stand eine Zahl, die richtig aussah. Der Urlaubstab benennt das laufende Jahr dann ausgeschrieben („Im Urlaubsjahr 2026/27“). **Benannte Grenze:** das Arbeitsjahr je Mitarbeiter (Jahrestag des Eintritts, § 2 Abs 2 UrlG) bildet die App NICHT ab — dort bedeutete „das Jahr“ für jede Person etwas anderes, und die Jahresauswertung verlöre ihren Sinn. Wer so rechnet, kann den Urlaubsteil dieser App nicht verwenden **Seit 24.09.2026 Urlaub, Zeitausgleich, Krankmeldung, Betriebsurlaub:** Der Antrag hat eine **Art**. *Zeitausgleich* ganztags oder stundenweise (an einem Tag, Von–Bis); der Antrag zeigt das eigene Zeitguthaben — grün „ausreichend“, sonst eine Warnung, aber keine Sperre — und schickt es mit (`saldo_bei_antrag`); die Genehmigenden sehen „ZA – 4 Std. (13:00–17:00)“ und das Guthaben beim Antrag. Genehmigt bucht die Datenbank den Tagesstatus **Zeitausgleich**: null Stunden Ist bei vollem Soll, also sinkt das Guthaben um genau die freie Zeit; Resturlaub und Urlaubsstand zählen ZA nicht. *Krankmeldung* ohne Genehmigung (`krankmeldungen`, `krankmeldung_speichern`/`_loeschen`): Krank an den Arbeitstagen, gebuchte Tage bleiben; „Ende ändern“ rechnet das Zeitkonto nach; lesen nur Person und Büro (Art. 9 DSGVO), Support nie. *Betriebsurlaub* (Reiter für Buchhaltung/GF/Admin, `betriebsurlaube`): mit Häkchen „Urlaubskonto aller aktiven Mitarbeiter belasten“ je aktivem Mitarbeiter ein genehmigter Urlaub in seinen Arbeitstagen (gebuchte Tage übersprungen, nicht abgezogen); Löschen nimmt genau das zurück. Ohne Häkchen nur Planungssperre. Wochenplan/Tagesplanung zeigen alles aus `wochenplan_abwesend`: den Grund sieht die Leitung (Urlaub/ZA), Krank nur das Büro, Kollegen „abwesend“; Betriebsurlaub als grauer Block, niemand „frei“; Tagesplanung und Baustellendaten warnen. Push: Antrag → wer entscheidet, Entscheidung → Antragsteller, Krankmeldung → Büro (abschaltbar in Mein Konto). Geprüft: Datenbank (21 Abwesenheiten + 5 Push), Ansicht (25 Urlaub + 7 Reiter + 6 ZA-Zeiterfassung + 21 Wochenplan/Planung), Browser (Probelauf 30). **Benannte Grenzen:** (die beiden früheren — kein Nachbuchen für später Eingetretene, Krank von Hand ohne Meldung — sind seit 24.09.2026 behoben, geprüft in `krankUndNachbuchen.test.ts`) das Guthaben beim Antrag ist eine Auskunft aus dem Browser des Antragstellers, keine serverseitige Prüfung |
| **Handwerksscheine** | „Neuer Schein“ steht seit 23.09.2026 wie in allen Listen im Kopf der Seite; Zeiten vorausfüllen **oder vor Ort selbst eintragen**, Material von Hand erfassen, **Fotos (freiwillig)**, als Entwurf sichern und wieder öffnen, Entwurf verwerfen und zurückholen, unterschreiben, einfrieren, Storno mit Grund, PDF | Mitarbeiter, Büro, Leitung | `workSheets`, `timeEntries` (serverseitig), **Storage** | Datenbank (27 Schein + 13 Fotos + 10 Vorbereiten + 12 Prüfsumme), Rechnung (20), Ansicht (31), Liste (18), PDF-Zustand (3), Browser (Schein unterschreiben) | ein verworfener Entwurf bleibt in der Datenbank — gelöscht wird kein Schein (es gibt keine Löschrichtlinie), das schützt den unterschriebenen Beleg. **Leistungszeit vor Ort:** Der Monteur trägt Von/Bis/Pause selbst ein, wenn er noch nichts gebucht hat — das ist die Zeit BEIM KUNDEN, ohne Anfahrt, also genau die Zahl, die später auf der Rechnung steht. Danach erscheint der Einsatz in der Zeiterfassung als **offener Nachtrag**, weil die Rechnung ihre Stunden aus den Zeiteinträgen rechnet und eine nie gebuchte Stunde nie verrechnet wird. Gebucht wird **nicht automatisch**: der Schein kennt weder Anfahrt noch Fahrzeug (Kennzeichen) noch Zuschläge, und ein zu niedriger Eintrag, der vollständig aussieht, wäre schlimmer als ein Hinweis. **Fotos sind nie Voraussetzung:** das Ausgangsfach hält einen Schreibvorgang ohne Empfang vor, der Dateispeicher nicht — wäre eines Bedingung, hinge der Beleg an einem Balken Empfang. Sie gehen über ihren **Inhalts-Hash** in die Prüfsumme ein; ein später ausgetauschtes Bild fällt damit auf. **Stunden ohne Buchung:** In der Scheinliste steht für Buchhaltung/Leitung, welche unterschriebenen Scheine Zeit tragen, zu der es keine Anwesenheit in der Zeiterfassung gibt — je Person und Tag, älteste zuerst, ab zwei Tagen und ohne Grenze nach oben. Das schliesst die Lücke des Nachtrags: der erinnert nur an die EIGENEN Zeilen, weil ein Monteur fremde Zeiteinträge weder lesen noch schreiben darf (Kranken- und Urlaubstage, Art. 9 DSGVO) — die von Hand eingetragene Kollegenzeile hätte sonst niemanden, der an sie erinnert wird. Unterschieden wird „keine Buchung gefunden“ (Stunden fehlen ganz) von „auf eine andere Baustelle gebucht“ (Arbeitszeit erfasst, Zuordnung falsch); nur das erste zählt in die Summe. Verglichen werden Tag und Name, nicht die Minuten. Geprüft wird zunächst über die geladenen Scheine; **„Weiter zurück prüfen“** (30 Tage / 90 Tage / 1 Jahr) holt gezielt die unterschriebenen Scheine des Zeitraums — auf Anforderung, weil jeder davon rund 70 KB Unterschriftsbilder trägt, mit Obergrenze 150 und sichtbarer Ansage, sobald sie greift. Über der Liste steht jedes Mal, worauf sich das Ergebnis stützt. **Fotos werden sofort an den Schein geschrieben**, nicht erst beim Speichern: sonst blieb eine Datei im Storage zurück, auf die kein Dokument zeigt — Kosten, und ein Bild aus einer fremden Wohnung ohne Beleg für seine Aufbewahrung. **Suche:** Baustellennummer und Zeitraum gehen serverseitig und finden damit auch Scheine ausserhalb der geladenen Liste; nach Kundenname oder Notiz wird nur im geladenen Bestand gesucht. Der Grund dafür war Firestore (keine Volltextsuche); **seit dem Umzug gilt er nicht mehr** — `customer_name` und `notizen` stehen als Spalten am Schein, nachgezogen ist es noch nicht. Die Ansicht sagt beides an und nennt den Ausweg |

## Verwaltung

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Kunden** | Stammdaten, Dublettenschutz, Übernahme der Altbestände; **Kundenakte** je Kunde mit allen Angaben, Baustellen, Wartungen und Angeboten, **dort auch bearbeitbar** **Seit 24.09.2026 zeigt die Kundenakte die Rechnungen des Kunden** (für Buchhaltung und Spitze) — gefunden über seine Baustellen und, wo sie steht, die Kundenkennung; nicht über den Namen. **Seit 24.09.2026 Kunden aus einer Datei** (CSV aus Altprogramm oder Excel, Strichpunkt/Komma/Tabulator, UTF-8 oder Windows-1252): erst ein **Probelauf** — welche Spalten wofür genommen werden, welche nicht, wie viele neu, schon vorhanden (entscheidet die Datenbank über den ganzen Bestand, Schreibweise egal), fehlerhaft (ohne Namen, E-Mail ohne @, UID in falscher Form, doppelt in der Datei — je mit Zeile und Grund) —, dann die Übernahme in **einer Transaktion** (`kunden_einspielen`, alle oder keiner, höchstens 5000). Adresse aus Straße/PLZ/Ort, Telefonspalten zusammengefasst, Kundennummer des Altsystems in die Notiz. Vorlage zum Herunterladen. Importieren darf, wer Kunden anlegen darf. | Buchhaltung, Verwaltung, Leitung | `customers`, `projects`, `quotes`, `wartungen` | Datenbank (10 Kunden + 13 Suche), Liste (6), Akte (23), Import: Datenbank (5), Leser (10), Ansicht (5 + 1) | — |
| **Angebote** | Positionen kalkulieren, Arbeitszeit getrennt ausweisen (der Haken folgt der Einheit, bis man ihn selbst setzt), beim Annehmen Baustelle mit Stundenbudget anlegen — ist die aus der Angebotsnummer abgeleitete Baustellennummer vergeben, kommt die nächste aus dem Zähler. **Angebotsseite** (`/quotes/:id`) mit Positionen, Summen, Anmerkungen und allen Statusschritten; **PDF** im Layout der Rechnung, an die Anschrift aus dem Kundenstamm. Beim Annehmen werden die **Anmerkungen zum Auftragsumfang** der Baustelle; die Baustellenakte verlinkt zurück aufs Angebot | Buchhaltung, Leitung (ändern nur Leitung) | `quotes`, `projects`, `counters` | Ansicht (14 Liste + 11 Seite), PDF (8), Datenbank (33: Geld, darin der Zähler — steigend, Neubeginn nur zum Jahreswechsel — und der Verweis über `project_id`, der ein Umbenennen der Baustelle übersteht), Browser (anlegen → Seite → PDF → annehmen → Baustellenakte → Monteur) | Die kalkulierten Stunden stehen NICHT auf dem PDF — sie sind die Messlatte der Budget-Ampel. Ein Angebot lässt sich nach dem Anlegen nicht bearbeiten, nur neu anlegen **Seit 24.09.2026 lässt sich ein Entwurf bearbeiten** — aus der Liste oder der Angebotsseite („Bearbeiten"), in derselben Maske wie beim Anlegen, mit dem Steuersatz des Angebots und einem bestehenden Rabatt. Ob eine Position als Arbeitszeit zählt, steht jetzt an der Position (`quote_lines.ist_arbeitszeit`); bei älteren Angeboten wird der Haken aus der Einheit abgeleitet, und die Maske sagt das samt der bisher gespeicherten Stunden. **Was beim Kunden liegt, ändert sich nicht mehr:** `angebot_speichern` weist bei einem versendeten, angenommenen oder abgelehnten Angebot jede Änderung an Positionen, Preisen, Kunde, Anschrift und Anmerkungen ab; Status und Baustelle dürfen sich weiter ändern. |
| **Baustellen** | Anlegen und suchen; **Baustellenakte** je Baustelle mit allen Angaben, Team, Projektleitung, Abrechnungsart und der **Stundenübersicht** (ganze Laufzeit gegen das Budget, Stunden je Mitarbeiter), **dort auch bearbeitbar** | Leitung | `projects`, `timeEntries` | Liste (23), Akte (21), Entwurf (10), Übersicht (8), Datenbank (15) | Der Kundenname kommt aus dem Stammsatz; leeres Stundenbudget bleibt leer statt 0. Die Übersicht zeigt **kein Geld** — Erlös und Marge bleiben in der Nachkalkulation. **Löschen und „Schein nachtragen" liegen seit 18.09.2026 im Zeilenmenü** — als eigene Schaltflächen passten sie auf 375 px nicht mehr in die Zeile **Seit 24.09.2026 nimmt eine geänderte Projektnummer alles mit:** Zeitbuchungen, Einsätze, Rüstlisten, Schein-Entwürfe, Anforderungen, Angebote und Wiedervorlagen, in einem Schritt (`baustelle_umnummern`, nach Rückfrage). Vorher blieben sie auf der alten Nummer stehen, und die Baustelle zeigte null Stunden. **Die Nummer bleibt, sobald sie auf einem Beleg steht** — Rechnung (auch storniert), unterschriebener oder stornierter Schein, verrechnete Buchung oder Anforderung; die Meldung nennt alle Gründe. Ein verworfener Schein behält die alte Nummer (der Papierkorb ändert sich nicht); wird er zurückgeholt, lässt sich seine Nummer im Schein ändern. Buchungen, die offline im Ausgangsfach liegen und erst nach dem Umnummern ankommen, landen auf der alten Nummer. |
| **Pläne und Dokumente an der Baustelle** | PDF und Bilder bis 25 MB in der Baustellenakte hochladen und löschen; der Monteur sieht sie unter „Meine Baustellen" und am Einsatz im Einsatzplan, zum Antippen | hochladen/löschen: Leitung (wer die Baustelle ändern darf); sehen: das Büro und die Monteure, die im Team oder in der Leitung der Baustelle stehen **oder dort eingeteilt sind** | `project_documents`, Eimer `baustellendokumente` | Datenbank (19: an Zeile UND Datei — Büro, Team, Einsatz, Unbeteiligter, Fremdbetrieb, Support, Löschen, Sicherung), Einzel (6: Aufräumen bei Fehlschlag, Reihenfolge), Ansicht (4 Akte + 2 Meine Baustellen + 2 Einsatzplan), Browser (hochladen → öffnen → Monteur im Team → Monteur erst nach Einteilung → löschen) | Die Pläne hängen an der **Kennung** der Baustelle, nicht an ihrer Nummer. Eine Baustelle mit Plänen lässt sich nicht löschen (die Zeilen mitzulöschen liesse die Dateien verwaist zurück) — die Liste sagt das jetzt und rät zu „Abgeschlossen"; vorher blieb bei jeder Baustelle mit Buchungen der Dialog wortlos offen. **Der Support sieht sie nicht**, auch nicht mit „Mitarbeiten": ein Grundriss zeigt eine fremde Wohnung. Die Adressen zum Öffnen gelten eine Stunde und werden erneuert, solange die Ansicht offen ist. Gesichert werden die Pläne wie die Scheinfotos ausser Haus. CAD-Dateien (DWG) nimmt der Eimer nicht — sie gehören als PDF exportiert hoch |
| **Anforderungen** | Eingehende Materialanforderungen bearbeiten, Status setzen; **seit 24.09.2026 hakt das Lager ab** („Aus Lager“ / „Nicht auf Lager“) und der Reiter **Einkauf** sammelt, was beim Grosshändler zu bestellen ist **Seit 24.09.2026 setzen Verwaltung, Projektleitung, Geschäftsführung und Administration eigenes Material auf die Einkaufsliste** („Material dazusetzen": Artikel aus dem Katalog gesucht oder freier Text, Menge, Einheit, Grosshändler) — eigene Tabelle `einkauf_posten`, auf der Liste mit Kommission „Lager" neben den Anforderungen; „Geliefert" bucht ins Lager. | Verwaltung, Leitung | `materialOrders`, `suppliers` | Rechnung (Meldungen), Ansicht (24 + 12 Einkaufsliste), Einkauf (9), Datenbank (7 Einkauf), Browser (Einkauf, Probelauf 29) | **Aus Lager** macht die Anforderung gleich abholbereit — der Monteur bekommt dieselbe Meldung wie bisher. **Nicht auf Lager** setzt sie auf die Einkaufsliste, beim gewählten Grosshändler (Vorschlag: bei wem der Artikel zuletzt einen Preis hatte; „später zuordnen“ geht auch). Die Liste fasst je Grosshändler gleiche Artikel zu EINER Zeile zusammen (drei Monteure × 2 Eckventile = 6 Stk), die Baustellen stehen als Kommission daneben. Von dort: **PDF** (Beleglayout, bewusst ohne Preise — die sagt der Grosshändler), **E-Mail an die Bestelladresse** (öffnet das Mailprogramm mit fertigem Text; ab rund 1800 Zeichen sagt die Mail „siehe Anhang“, damit kein Mailprogramm Zeilen still abschneidet), **Als bestellt markieren**. Unter „Bestellt — noch nicht da“ bucht **Geliefert** die Ware ins Lager und macht die Anforderung abholbereit (`einkauf_geliefert`, zweimal gedrückt bucht nicht zweimal). Wird eine Einkaufszeile abgeschlossen, ohne dass „Geliefert“ gedrückt wurde, bucht der Abschluss Eingang und Abgang zugleich — der Bestand bleibt, wo er war. Zurück von der Liste geht nur, solange nicht bestellt. Die Grosshändler (Name, Kundennummer, Bestelladresse, Kontakt) werden im selben Reiter gepflegt; aus dem Katalogimport angelegte fehlen meist nur die Adresse. Der Monteur sieht an seiner Anforderung „nicht im Lager — wird bestellt“ bzw. „beim Grosshändler bestellt“. **Bekannte Lücke:** die App VERSENDET keine Mail selbst — sie öffnet das Mailprogramm des Geräts. Ein Versand aus der App bräuchte ein Mailkonto (SMTP-Zugang) des Betriebs als Geheimnis beim Server |
| **Lager** | Bestand, Mindestmenge, Katalogpflege mit Verkaufs- und **Einkaufspreis**, **DATANORM-Katalog einspielen** | Verwaltung, Leitung; **Einkaufspreis und Katalogimport nur GF/Admin** | `materials`, `material_prices`, `suppliers`, `rabattsaetze`, `datanorm_laeufe` | Datenbank (17 Lager + 16 Katalogimport), Ansicht (12 + 5 Katalog + 13 Import + 3 ausgelaufen), Leser (24), Browser (Katalog einspielen) | Der Bestandsabzug ist jetzt gegen eine **echte Transaktion** geprüft, gleichzeitige Zugriffe eingeschlossen. Die Grenze beim Einkaufspreis läuft zwischen den FELDERN, nicht zwischen den Ansichten — sie schützt das Ändern, **nicht das Lesen**: der Zeilenschutz gibt eine Zeile ganz oder gar nicht heraus. **Seit 20.09.2026 lässt sich der Artikelkatalog des Grosshändlers als DATANORM-Datei einspielen** — in zwei Schritten: erst der PROBELAUF, der zeigt, was erkannt wurde, was ohne Preis blieb und welche Zeilen mit Nummer und Grund NICHT verstanden wurden; geschrieben wird erst auf den zweiten Klick. Der Leser verschweigt nichts: jede Zeile wird ein Artikel, landet unter „nicht verstanden“ oder wird nach Satzart gezählt. Cent und Preiseinheit werden herausgerechnet (aus „2350“ bei Preiseinheit 100 werden 0,235 € je Stück, nicht 2350 €). **Listenpreis ist nicht Einkaufspreis:** DATANORM liefert die Rabatt*gruppe*, nicht den Satz — den hat der Betrieb ausgehandelt, und er wird im Probelauf je Gruppe abgefragt und gespeichert. Ohne Satz bleibt der Einkaufspreis LEER und die Nachkalkulation meldet die Lücke weiter; ein Listenpreis als Einkauf gebucht liesse jede Baustelle schlechter aussehen, als sie ist. **Der Zeichensatz wird erkannt und genannt** (UTF-8, Windows-1252, CP850 — DATANORM stammt aus der DOS-Zeit, und CP850 kennt weder Node noch ein Browser). **Gelöscht wird nie ein Artikel:** ein Löschsatz markiert ihn `ausgelaufen`; er bleibt im Katalog, weil er auf alten Scheinen und Rechnungen steht, wird dort gekennzeichnet und für neue Erfassungen nicht mehr angeboten. **Der Verkaufspreis wird nie angefasst.** **Übernommen wird alles oder nichts** — die Zeilen gehen in Blöcken in ein Zwischenlager, die Übernahme schreibt sie in EINER Transaktion und räumt danach auf; am Lauf bleibt das Protokoll, wer wann welchen Katalog eingespielt hat. **Die gefährlichste Lage ist ein verschobenes Feldlayout**, weil es formal aufgehen kann: dann stünde die Lieferantennummer als Artikelnummer im Katalog. Zwei Spuren verraten es — die A-Sätze scheitern reihenweise (mindestens drei UND ein Viertel), oder alle Artikel teilen sich dieselbe Nummer. In beiden Fällen ist die Übernahme gesperrt. **Bekannte Lücke:** geprüft ist der Leser gegen die NORM, nicht gegen eine echte Datei von Perls Grosshändler. Ob die Feldreihenfolge passt, entscheidet der erste Probelauf an echten Daten |
| **Einsatzplanung** | Kalender, Mitarbeiter je Tag und Baustelle, Urlaubswarnung; die **Tagesübersicht zeigt je Baustelle Aufgabe und Rüstliste** (samt „eingeladen“) und hat einen **Bearbeiten**-Knopf, der die Planung ins Formular holt — vorher ging Bearbeiten nur über den Wochenplan oder durch erneutes Wählen der Baustelle | Leitung | `assignments`, `vacations` | Datenbank (24: Einteilung, Rüstliste, Abhaken), Ansicht (8) | Geprüft ist auch der gefährliche Teil: eine vorhandene Planung kommt ins Formular, statt beim Speichern gelöscht zu werden |
| **Benutzerverwaltung** | Anlegen und suchen; **Benutzerakte** je Person mit Rolle, Wochenstunden, Arbeitstagen, Eintritt, Start-Saldo und Resturlaub, **dort auch bearbeitbar**, dazu Passwort-Mail und Sperren; **seit 23.09.2026 Anmeldung wahlweise mit Benutzername statt E-Mail** | Leitung (Admins nur durch Admins) | `users`, Edge Functions `mitarbeiter-anlegen` und `passwort-vergeben` | Datenbank (19 Belegschaft + 13 Rechte + 7 Konto anlegen + 11 Benutzername), Liste (27), Akte (23), Entwurf (20), Regeln (Benutzername 22, Anmeldeschicht 6, Anmeldemaske 3), Browser (Benutzername: anlegen → erstes Anmelden → eigenes Passwort → am nächsten Tag ohne Rückfrage → neues Startpasswort) | **Benutzername:** Beim Anlegen „Anmeldung mit: Benutzername" wählen. Der Anmeldedienst kennt nur Adressen, also bekommt das Konto die Kunstadresse `name@benutzer.senklot.invalid` — `.invalid` ist reserviert und wird nie zugestellt. Die App zeigt überall nur den Namen. Erlaubt sind a–z, Ziffern, Punkt, Bindestrich, Unterstrich (3–40 Zeichen); der Name gilt über alle Betriebe, ein vergebener wird mit „gibt es schon" abgewiesen. Keine Willkommensmail: das **Startpasswort** steht einmal auf dem Schirm und wird persönlich weitergegeben; beim ersten Anmelden fragt die App nach einem eigenen (das gilt jetzt für jedes neu angelegte Konto, auch mit E-Mail). **„Passwort vergessen"** gibt es für Benutzernamen nicht per Mail — die Anmeldemaske sagt das, statt „Mail versendet" vorzutäuschen (der Anmeldedienst nähme die Anfrage kommentarlos an); stattdessen vergibt die Geschäftsführung/Administration in der Akte ein **neues Startpasswort**. Das geht **nur für Benutzernamen-Konten**: bei einem Konto mit Adresse könnte sich das Büro sonst still hineinsetzen. Bereits angemeldete Geräte bleiben dabei angemeldet — ein verlorenes Telefon sperrt „Konto deaktivieren". **Nicht gebaut:** ein Konto nachträglich zwischen E-Mail und Benutzername umstellen. **Seit 20.09.2026 wird beim Anlegen gefragt, ob die Person neu eintritt oder schon im Betrieb ist.** Vorher bekamen beide Fälle dieselben Felder mit derselben Vorbelegung — und die stimmte nur für einen: wer bei einem Neueintritt das Feld „Resturlaub“ leer liess, was naheliegt, weil ja nichts mitzubringen ist, bekam den VOLLEN Jahresanspruch ab Tag eins. Wer am 1. Oktober anfing, hatte 25 Tage statt rund sechs; das stand nirgends und fiel erst auf, wenn jemand Urlaub einreicht, den er nicht hat. **Die Frage steht ausserhalb des eingeklappten Teils** — sonst entschiede sie, wer ihn nie öffnet, stillschweigend falsch. Beim Neueintritt entfällt der Überstundensaldo (wer eintritt, bringt keine mit), und für das angebrochene erste Urlaubsjahr wird der aliquote Anspruch VORGESCHLAGEN, mit offengelegter Rechnung („25 × 3 von 12 Monaten“) und änderbar. **Bewusst ein Vorschlag:** ob im ersten Arbeitsjahr aliquot oder nach sechs Monaten voll gerechnet wird (§ 2 Abs 2 UrlG), entscheidet der Kollektivvertrag — eine erzwungene Zahl wäre eine Rechtsauskunft, die diese App nicht geben kann |
| **Einstellungen** | Verrechnungs- und Kostensätze, Urlaubs-Genehmigende, Monatsbilanzen aufbauen, **Kontenrahmen**, **Supportzugang** | Leitung; Genehmigende nur GF/Admin; Kontenrahmen auch Buchhaltung; Supportzugang nur GF/Admin | `companies`, `buchungskonten`, `support_freigaben` | Datenbank (23 + 11 Kontenrahmen + 33 Supportzugang), Ansicht (6 + 9 Kontenrahmen + 12 Supportzugang) | **Seit 20.09.2026 gibt es den SUPPORTZUGANG, und er ersetzt etwas, das vorher undeklariert war.** Der globale Administrator konnte bisher einen Betrieb anlegen und danach nie wieder etwas über ihn erfahren — eine starke Zusage, die stimmte. Rief der Betrieb aber an, weil eine Rechnung nicht stimmt, war der einzige Weg hinein der DIENSTSCHLÜSSEL: er umgeht jeden Zeilenschutz, erreicht jeden Mandanten und hinterlässt keine Spur. Der Generalschlüssel existierte also längst; er war nur nirgends begrenzt. **Jetzt gilt: der Betrieb GEWÄHRT den Einblick** — befristet (höchstens sieben Tage, die Frist steht in der Datenbank), begründet (der Grund lässt sich nachträglich nicht ändern), jederzeit widerrufbar (und ein Widerruf lässt sich nicht zurücknehmen) und **nur lesend**. Der Lesezugriff hängt an `app.support_liest`, das nur für DIESEN Betrieb und nur bei gültiger Freigabe wahr wird; das Schreiben verhindert ein Auslöser auf JEDER Tabelle mit `company_id`, und ein Schema-Wächter prüft, dass keine fehlt. **Wie weit der Einblick reicht, in einem Satz:** Geschäftsdaten ja, personenbezogene Daten der Mitarbeiter nein. Zeitbuchungen und Urlaube (Kranken- und Urlaubstage, Art. 9 DSGVO) waren durch ihre Rollenprüfungen ohnehin zu und bleiben es nachweislich; Scheinfotos aus Kundenwohnungen wurden geschlossen (**seit 23.09.2026 auch im Speicher selbst** — vorher war nur die Tabelle zu, und wer die Kennung eines Scheins kannte, konnte den Ordner der Bilder auflisten und laden; ebenso zu sind die Pläne an der Baustelle); Rechnungen, Positionen, Belegdeckung und Zahlungseingänge sind ausdrücklich offen, weil der Zugang sonst an der häufigsten Frage vorbeigebaut wäre. Angebote bleiben zu. **Sichtbar ist er für jeden im Betrieb:** solange ein Zugang offen ist, steht ein Band über der App — mit dem Grund. Das ist der Unterschied zwischen einem Supportzugang und einem Generalschlüssel. **Protokolliert** wird, WER wann WELCHEN Bereich geöffnet hat (nicht jede Zeile — eine Leseregel, die schreibt, ist keine Leseregel); angehängt wird, geändert nie. **Der NOTZUGANG** ist die benannte Ausnahme: eine rein einvernehmliche Lösung versagt dort, wofür man sie braucht — wer sich ausgesperrt hat, kann nichts mehr freigeben. Er läuft ohne Zustimmung, aber nicht heimlich: gekennzeichnet, höchstens 24 Stunden, im Protokoll, mit demselben Band, vom Betrieb widerrufbar und ebenso wenig schreibberechtigt. **Bekannte Lücke:** der Dienstschlüssel existiert weiter und kann weiterhin alles — er ist jetzt nur nicht mehr der Supportweg |
| **Module** | Bereiche für den Betrieb ein- und ausschalten; zeigt vorher, was mit abgeschaltet wird | **nur Administration** | `companies.modules` | Rechnung (15), Datenbank (23), Ansicht (11) | Enger als der Rest der Einstellungen. Enger als der Rest der Einstellungen: ein abgeschaltetes Modul nimmt allen den Weg zu ihrer Arbeit, und zwar unsichtbar — das ist Einrichtung, keine Führung |
| **Datensicherung** | Nächtliche Ausleitung des ganzen Bestands an einen zweiten Ort — **samt der Fotos am Handwerksschein und der Pläne an der Baustelle**; Sicherung von Hand anstoßen; Bestand herunterladen (DSGVO); **Zustand des letzten Laufs**; Rücklauf als Werkzeug für die Hand (`scripts/ruecklauf.mjs`) | **nur GF/Admin** | alle Tabellen mit `company_id`, `system_laeufe`, `ausleitung_dateien`, Eimer `scheinfotos` und `baustellendokumente` | Rechnung (23 Aufräum-, Pfad- und Fristregeln), Zielspeicher und Signatur (24 inkl. AWS-Testvektoren), Ansicht (14), Datenbank (12 Ausleitung + 14 Dateien + 8 Wächter + 2 Rücklauf) | Ohne eingerichteten Zielspeicher liegt die Sicherung im selben Projekt — gegen einen Fehlgriff hilft das, gegen „der Zugang ist weg" nicht. **Die Fotos gehen nur ausser Haus**, weil sie im eigenen Projekt schon liegen; das Dienstkonto dort darf nur anlegen, deshalb führt `ausleitung_dateien` Buch und der Rücklauf holt die Dateien nicht selbst zurück |
| **Fehlerprotokoll und „Problem melden"** | **Seit 24.09.2026.** Abstürze (Fehlergrenze) und unbehandelte Fehler (Klick, Versprechen) gehen in die eigene Tabelle `fehlerprotokoll` statt nur in die Konsole — **geputzt**: keine Formularinhalte, Text in Anführungszeichen, E-Mail-Adressen und Ziffernfolgen entfernt, Ansicht ohne Kennungen und Suchbegriff. Nachladefehler, fehlendes Netz und fremde Skripte gelten als Rauschen. Gebremst im Browser (derselbe Fehler einmal in 10 Min., höchstens 20 je Seite) und in der Datenbank (30 je Konto und Stunde). „Problem melden" in Seitenleiste, Profilblatt und auf der Fehlertafel: Beschreibung plus Ansicht, Fassung, Gerät und der Fehler von eben. Einstellungen → **Fehler** zeigt Meldungen und gleiche Fehler gebündelt. Wer und wann setzt die Datenbank; niemand ändert oder löscht; nach **90 Tagen** gelöscht (pg_cron). Die **Plattform** sieht über `fehlerprotokoll_plattform` die technischen Fehler aller Betriebe ohne Person, eine Meldung nur mit Häkchen „auch an den Support" (aus bis gesetzt) | schreiben alle; lesen GF/Admin; Plattform eng begrenzt | `fehlerprotokoll` | Datenbank (11), Rechnung (11 Putzen/Bremsen + 3 Bündeln), Ansicht (5 + 2 Fehlergrenze + 2 Plattform + 1 Hülle), Browser (Probelauf 32) | Ein Nachladefehler, bei dem auch das Neuladen nicht half, geht nicht ins Protokoll (er gilt als Rauschen). Fehler ohne Anmeldung (Anmeldeseite) werden nicht erfasst — der Zeilenschutz lässt nur Betriebsmitglieder schreiben. Die Einstellungsleiste der Administration (8 Unterseiten) scrollt bei 1280 px um 23 px seitlich |
| **Datenschutz und Impressum** | **Seit 24.09.2026** öffentliche Seiten `/datenschutz` und `/impressum`, verlinkt an der Anmeldung, in der Seitenleiste und im Profilblatt. Die Datenschutzerklärung beschreibt, was die App tatsächlich verarbeitet, und listet die Unterauftragsverarbeiter (Supabase; Google für Hosting und Push; Sicherung ausser Haus; Mailanbieter). Alle Angaben zum Betreiber stehen an einer Stelle (`src/features/recht/betreiber.ts`) | jeder, auch ohne Anmeldung | — | Ansicht (4 + 1 Anmeldung) | **Entwurf:** die Texte sind nicht rechtlich geprüft, die Betreiberangaben, der Anbieter der Sicherung und der Mailanbieter fehlen noch (in eckigen Klammern). Solange `GEPRUEFT` falsch ist, steht ein Band „Entwurf" über beiden Seiten |

## Büro und Auswertung

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Rechnungen** | Aus Baustelle zusammenstellen — Stunden UND Material aus den unterschriebenen Handwerksscheinen —, Leistungszeitraum, Bauleistung mit Übergang der Steuerschuld (§ 19 Abs 1a UStG), Nummernkreis, Status, **Mahnwesen in drei Stufen mit Mahnlauf** (überfällig heisst: Ziel abgelaufen und Rest offen — auch nach einer Teilzahlung; die Startseite verlinkt die Summe auf die gefilterte Liste), PDF (seit 23.09.2026 als Geschäftsbrief: keine Farbflächen, Empfänger im Kuvertfenster, Bank, UID und Firmenbuch in der Fusszeile jeder Seite — dasselbe Layout für Leistungsnachweis, Mahnung und Angebot, `src/lib/belegLayout.ts`), Buchhaltungs-Export mit Lückenprüfung. **Zahlungseingänge** mit Datum, Betrag und Art; der Zahlungsstand wird daraus abgeleitet. **Anzahlung, Teilrechnung und Schlussrechnung** — die Schlussrechnung zieht die Anzahlungen samt Umsatzsteuer ab. **Gelöscht wird keine Rechnung** — die Korrektur ist der Storno **Seit 24.09.2026 sucht die Liste über ALLE Rechnungen** (Nummer, Kunde, Baustelle, auf dem Server, bis 100 Treffer), nicht nur über die geladenen; `?suche=` in der Adresse füllt die Suche. | Buchhaltung, Leitung | `invoices`, `counters`, `timeEntries`, `workSheets`, `materials` | Rechnung (143 + 17 Buchungsstapel), Datenbank (31 Geld + 15 Belege + 13 offene Posten + 11 Zahlungen + 18 Rechnungsarten + 11 Kontenrahmen), Ansicht (56 + 9 Kontenrahmen), Browser (Rechnung stellen bis zur Teilzahlung; Anzahlung bis Schlussrechnung mit Abzug) | Geprüft ist die Reihenfolge — Nummer ziehen, Belege sperren, dann anlegen; sie ist beim Anlegen die Sicherung selbst, denn ein Abbruch lässt Belege gesperrt zurück statt doppelt frei. **Storno und Storno-Aufhebung laufen dagegen als EIN Aufruf** (`rechnung_stornieren`): sie schrieben vorher erst die Rechnung und dann die Belege, und ein Abbruch dazwischen sperrte Stunden für immer oder gab sie doppelt frei. **Vor dem Anlegen steht der Abgleich gegen die unterschriebenen Scheine** — „Ein Schein bestätigt 04:00, verrechnet werden 08:00"; als Warnung erst ab einer Stunde UND einem Viertel darüber. Gekappt wird nichts: Vorfertigung in der Werkstatt zählt auf die Baustelle und steht auf keinem Schein. **Der Buchhaltungs-Export holt seinen Zeitraum selbst vom Server** — er filterte vorher die geladene Arbeitsliste und lieferte für ältere Monate eine leere Datei, die wie ein Erfolg aussah; die Lückenprüfung meldete dann Lücken, die keine sind. Ebenso rechnen **Mahnlauf und unverrechnete Leistung über die offenen Forderungen**, nicht über die Liste: die ältesten Forderungen fallen als erste aus einer Liste, die nach Anlagedatum abschneidet — und genau die gehören gemahnt. **Nicht verrechnete Leistung** steht als eigene Karte da: unterschriebene Scheine, die auf keiner gültigen Rechnung stehen und älter als vier Wochen sind. Wird eine Rechnung storniert, tauchen ihre Scheine dort wieder auf — der Storno nimmt die Forderung zurück, also steht die Leistung wieder offen. Der **Mahnlauf** stellt zusammen, was heute zu mahnen ist, dringlichstes zuerst; verschickt wird weiterhin einzeln und bewusst. Nach der dritten Mahnung hört die App auf — diese Forderungen stehen **getrennt als „braucht eine Entscheidung“** da, statt aus dem Lauf zu fallen. Material ohne Preis im Katalog steht mit 0,00 € da und wird ausgewiesen: eine erfundene Zahl wäre schlimmer als eine sichtbare Lücke. **Der Zahlungsstand ist seit 19.09.2026 abgeleitet, nicht gesetzt:** „Bezahlt", „Teilbezahlt" und „Überzahlt" ergeben sich aus den Zahlungseingängen, und die Datenbank weist einen Haken von Hand ab. Mahnlauf, offene Posten und Startseite rechnen mit dem REST — vorher wurde eine Rechnung über 1.000 €, auf die 400 gekommen waren, über den vollen Betrag gemahnt. Eine stornierte Rechnung mit Zahlung führt ein **Guthaben** des Kunden, statt die Zahlung verschwinden zu lassen. **Seit 20.09.2026 kennt die Rechnung ihre Art — aber nur, wenn der Betrieb es einschaltet:** der Haken „Wir stellen Anzahlungs-, Teil- und Schlussrechnungen" steht in den Einstellungen und ist ab Werk AUS. Ohne ihn sieht die Rechnungsmaske genau so aus wie vorher; bereits ausgestellte Belege behalten ihre Art und drucken unverändert, auch wenn er später wieder weggeht. Eingeschaltet gilt: Anzahlung, Teilrechnung, Schlussrechnung. Die Schlussrechnung weist jede abgezogene Vorrechnung einzeln aus — mit Entgelt UND Steuer, denn wer eine Steuer ausweist, schuldet sie (§ 11 Abs 12 UStG); ohne den Abzug stünde dieselbe Steuer zweimal auf Belegen desselben Betriebs. `total_*` bleibt dabei die RESTFORDERUNG, die volle Leistung steht getrennt in `gesamt_*`: offene Posten, Mahnlauf, Zahlungsstand und Nachkalkulation rechnen damit unverändert richtig weiter. **Abgezogen wird nur, was keine Belege verbraucht hat** — eine Teilrechnung über einen abgeschlossenen Bauabschnitt hat ihre Stunden mitgenommen und steht in der Schlussrechnung gar nicht mehr; sie zusätzlich abzuziehen hiesse, dem Kunden die eigene Leistung zu schenken. Die Datenbank rechnet nach (Gesamtleistung − Abzüge = Rechnungsbetrag), verlangt, dass die Kopie die Originalbeträge trägt, und weist eine Rechnung ins Minus ab, statt sie auf null zu kappen. Eine abgezogene Anzahlung lässt sich nicht stornieren, solange der Abzug gilt. **Dabei kam ein alter Fehler heraus:** eine Rechnung OHNE Leistungszeitraum liess sich gar nicht anlegen — der Leerstring ist kein Datum. Sie scheiterte an der schlechtesten Stelle, nämlich nachdem die Nummer gezogen und die Belege gesperrt waren; zurück blieben eine verbrauchte Nummer und Zeiteinträge, die auf eine Rechnung verwiesen, die es nicht gibt. Zu treffen war das schon vorher, denn das Feld ist änderbar und der fehlende Zeitraum wird nur gemeldet, nicht erzwungen. **Seit 20.09.2026 gibt es neben dem Rechnungsausgangsbuch den BUCHUNGSSTAPEL FÜR BMD.** Der Unterschied ist die ganze Gefahr: das Journal BESCHREIBT Rechnungen, der Stapel BUCHT sie — Soll- und Habenkonto je Vorgang, brutto mit Steuercode. Eine falsch kontierte Zeile importiert sich fehlerfrei und fällt frühestens beim Jahresabschluss auf. Deshalb rät er nicht: jedes Konto kommt aus dem **Kontenrahmen des Betriebs** (Einstellungen → Kontenrahmen, gepflegt von Administrator, Geschäftsführung UND Buchhaltung — sie ist die Rolle, die mit der Kanzlei spricht). **Fehlt ein Konto, entsteht keine Datei**, sondern eine Liste dessen, was fehlt, im Klartext samt Steuersatz. Ein Vorschlag nach dem österreichischen Einheitskontenrahmen lässt sich einsetzen, ist aber ausdrücklich ein Vorschlag und keine Vorbelegung. Gebucht wird: Debitorensammelkonto im Soll, Erlöskonto je Steuersatz im Haben; Bauleistung nach § 19 Abs 1a UStG auf ein EIGENES Konto (das ist nicht dasselbe wie 0 %); eine **Anzahlung auf das Konto der erhaltenen Anzahlungen** (eine Verbindlichkeit, kein Erlös) und mit der Schlussrechnung von dort in den Erlös umgebucht — ohne diese Umbuchung bliebe das Konto für immer stehen und der Umsatz wäre um die Anzahlung zu niedrig; ein **Storno als Gegenbuchung am Stornotag**, auch wenn die Rechnung aus einem früheren Monat stammt. Eine Rechnung OHNE Steuersatz (Altbestand) wird nicht als 0 % gelesen, sondern beim Namen genannt. **Nicht gebaut:** eigene Kontonummern je Kunde — die offene-Posten-Verwaltung bleibt bei der Kanzlei; und der erste Stapel gehört vor dem Import von ihr geprüft. **Bekannte Lücken:** Skonto und Verzugszinsen rechnen weiterhin nicht; eine Gutschrift (Schlussrechnung ins Minus) gibt es nicht; mitten im Projekt zählt die Nachkalkulation eine Anzahlung als Erlös, deren Kosten erst entstehen — am Ende stimmt sie, bis dahin ist sie eine Momentaufnahme |
| **Wartungen** | Wiederkehrende Wartungsvereinbarungen je Anlage; **aus einer fälligen Wartung mit einem Griff eine Baustelle** (Nummer nach dem Schema des Betriebs, aus dem Zähler); erledigt eintragen rückt den nächsten Termin nach; Hinweis auf der Startseite, wenn etwas ansteht | Lesen alle, ändern nur die Leitung | `wartungen`, `customers`, `projects` | Rechnung (35), Ansicht (14), Datenbank (19: Betrieb, darin die Wartungen), statischer Abgleich (Export) | Die Baustelle entsteht mit Kunde, **Anlagen**adresse und Anlage in der Beschreibung; eingeteilt wird sie danach im Einsatzplan, den Termin vereinbart weiterhin ein Mensch am Telefon. Die Projektnummer ist ein **Vorschlag, kein Zähler** — Baustellennummern vergibt der Betrieb frei; gegen Doppelvergabe wird beim Speichern geprüft |
| **Mitarbeiterübersicht** | Zeitkonten, Salden, Monats- und Mitarbeiterexport, Stundennachweis — **mit Nacht- und Notdienststunden** **Seit 24.09.2026:** „Soll bisher" zieht nur die Krank- und Urlaubstage ab, die in den Pflichttagen bis gestern liegen — eine Krankmeldung bis Monatsende machte das Soll vorher zu klein und den Saldo zu gut; ein Krank-Tag am Wochenende zählt nicht mehr. Tage aus einem Antrag führen zum Antrag statt zu Bearbeiten/Löschen. | Buchhaltung, GF, Admin (**nicht** Projektleitung) | `time_entries`, Sicht `monthly_stats` | Rechnung (20), Ansicht (4), Zuschläge (14), Nachweis (5) | Das Zusammenspiel Bilanz ↔ Rohdaten stand hier zuletzt als ungetestet — das stimmt nicht: `tests/unit/monatsbilanz.test.ts` prüft, dass beide Wege denselben Saldo ergeben, `TimeView.test.tsx` die Umschaltung samt Vollständigkeits-Marker. Eine Doku, die zu pessimistisch lügt, ist dasselbe Problem wie eine, die zu optimistisch lügt. **Zuschläge:** Die Rechnung bildet aus `isNightWork`/`isEmergency` seit jeher Positionen mit Aufschlag — der Kunde zahlt ihn. Die Lohnausleitung kannte die Felder bis 08.09.2026 gar nicht: verrechnet, aber nicht ausgewiesen, obwohl der Zuschlag ein Anspruch nach Kollektivvertrag ist. Jetzt je Zeile als Kennzeichen und je Mitarbeiter als Summe, dazu **„davon beides“** — Nacht und Notdienst schliessen einander nicht aus, und wer die zwei Zahlen addiert, zählt den Rohrbruch um zwei Uhr früh doppelt. **Gerechnet wird kein Geld:** die Höhe steht im Kollektivvertrag und hängt an Einstufung, Uhrzeit und Anlass — sie hier zu schätzen hiesse, eine Zahl zu erfinden, die in einem Lohnzettel landet |
| **Nachkalkulation** | Erlös gegen Personal- **und Materialkosten** je Baustelle, Deckungsbeitrag | GF, Admin | `projects`, `timeEntries`, `invoices`, `quotes`, `workSheets`, `materials` | Rechnung (23), Ansicht (13) | Geprüft ist auch die Verdrahtung: es rechnet mit den KOSTEN-, nicht den Verrechnungssätzen — der Fehler, den keine Formelprüfung findet. Material zählt seit 07.09.2026 mit, soweit ein **Einkaufspreis** hinterlegt ist; Artikel ohne Preis werden **beim Namen genannt statt geschätzt**, und die Ampel bleibt so lange gelb |

## Grundlagen

| Bereich | Was es tut | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|
| **Mandantentrennung** | `company_id` auf jeder Zeile, vom Zeilenschutz erzwungen und serverseitig gesetzt | Datenbank (159 Richtlinienprüfungen je Tabelle + 13 Rechte + Durchstich 0: zwei Betriebe, gleicher Tag, gleiche Baustellennummer) | **Die Grenze liegt nicht mehr in der Abfrage, sondern unter ihr.** Unter Firestore musste jede Abfrage ihren Filter selbst mitführen — vergass ihn eine, war die Trennung weg. Der Zeilenschutz kennt keinen solchen Fall: eine Zeile, die man nicht sehen darf, ist nicht vorhanden, auch ohne Filter. `tests/supabase/schema.test.ts` fragt die Datenbank nach ihren Tabellen, statt eine Liste zu pflegen. **Nicht belegt:** die Auslieferung an einen echten zweiten Betrieb |
| **Deaktivierte Konten** | Gesperrtes Anmeldekonto und der Aktiv-Zustand in `app.angemeldet()` — also unter jeder Richtlinie | Datenbank (13 Rechte + 12 Ansprüche) | Ein bereits ausgestelltes Token bleibt bis zu einer Stunde gültig; deshalb hängt die Sperre nicht am Token allein, sondern zusätzlich an `app.konto_sperren()` |
| **Wachstumsbremse** | Test verbietet jede Abfrage ohne Grenze in `lib/db` | Rechnung (40) | Prüft die Form der Abfrage, nicht ihre Laufzeit |
| **Nummernkreise** | Vorsätze für Rechnungen, Angebote, Baustellen und den Fuhrpark — einstellbar je Betrieb, mit Vorschau der nächsten Nummer. Die Baustellennummer wird seit 18.09.2026 vorgeschlagen (Zähler wie bei Rechnung und Angebot) und bleibt überschreibbar | Rechenregeln (21), Datenbank (13) | Gelten **ab jetzt, nicht rückwirkend** — eine ausgestellte Rechnung lässt sich nach § 132 BAO nicht mehr ändern. Geprüft wird die Form auch serverseitig (`companies_praefix_*`): der Vorsatz landet im Dateinamen des PDFs und in der Buchhaltungs-CSV. `WZ-` beim Kennzeichen stand dreifach fest im Code — der Kenner eines bestimmten Bezirks auf jedem Zeiteintrag |
| **Module** | Umfangsentscheidung des Betriebs: was ausgeschaltet ist, verschwindet aus Navigation, Startseite, Querverweisen **und** aus der Adresszeile | Rechnung (14), Datenbank (23) | **Keine Sicherheitsgrenze.** Wer die Rolle hat, dürfte die Daten ohnehin — ein Modul nimmt nur den Weg weg, nicht das Recht. Der Zeilenschutz bleibt die einzige Grenze. |
| **Anlegen in Listenansichten** | Kunden, Baustellen, Angebote, Benutzer und Wartungen: die Liste steht zuerst, das Anlege-Formular klappt über den Knopf in der Kopfzeile auf | je Ansicht 2 Prüfungen | Gemessen am Telefon: die Liste begann bei bis zu **1590 px**, jetzt bei **256–431 px**. **Zeiterfassung und Urlaub bleiben ausgenommen** — dort ist das Formular der Zweck, und die Zeitbuchung ist der häufigste Vorgang der App |
| **Darstellung am Telefon** | Nachgemessen bei **375 px** (iPhone XS): kein Element ragt über den Rand, Listenzeilen tragen höchstens vier Elemente rechts, Unterzeilen brechen nur **zwischen** den Feldern | Eurozeichen (9), Zeilenbreite (1) | Gemessen, nicht behauptet — eine wegwerfbare Playwright-Sonde über sechs Ansichten. Zwei Befunde waren gar keine Umbrüche: ein **doppeltes Eurozeichen** (`fmtEUR` gibt es in acht Dateien, vier stellen das Zeichen voran, vier nicht — wer abschreibt, erwischt die falsche Hälfte) und das **✕ allein in der zweiten Zeile**, die einzige unumkehrbare Aktion am auffälligsten Platz. **Nicht behoben:** die dritte Kennzahl-Karte steht allein — drei Spalten schnitten „€ 22 104,60" ab, und `col-span-2` änderte nachgemessen nichts |
| **Navigation** | Wer wohin darf, steht **nur** in `navigation.ts`; `RequireNav` liest Rolle und Modul aus demselben Eintrag, aus dem der Reiter gebaut wird. **Abzeichen für offene Posten** an drei Einträgen (Urlaub, Anforderungen, Rechnungen), aus EINER Abfrage `offene_posten()` | Statisch (29), Ansicht (14), Datenbank (13), Zähler (5), Posten (7) | Gezählt wird serverseitig und rollengerecht: wer einen Posten nicht entscheiden darf, bekommt ihn gar nicht erst gezählt |
| **Monatsbilanzen** | Verdichtete Zeitkonten als **Sicht** `monthly_stats` — sie rechnet bei der Abfrage | Rechnung (8), Datenbank (23: Einstellungen, darin die Monatszahlen) | **Es gibt nichts mehr nachzuziehen.** Bis zum Umzug war es eine abgelegte Zahl mit Trigger und Nachtlauf; beide sind weg, und mit ihnen die Sorte Fehler, bei der die abgelegte Zahl und die Rohdaten auseinanderlaufen |
| **Offline-Betrieb und Live-Verbindung** | Ausgangsfach (`lib/sync/`) für Zeit und Materialanforderung, Hinweis beim Speichern ohne Verbindung; **ein schmales Band über dem Inhalt**, wenn kein Netz da ist ODER die Live-Verbindung abgerissen ist und nicht wiederkommt | Rechnung (7), Verbindungszustand (7), Band (8), Wiederaufbau (9) | Das Band ist ein **Vorbehalt und kein Fehler**: `role="status"`, gelb, mit „Neu laden" daneben, und die Daten bleiben stehen. Es nimmt sich selbst zurück — der alte Hinweis konnte das nicht und blieb nach einem Tab-Wechsel bis zum Neuladen stehen. Der Zustand liegt an EINER Stelle, weil alle Abonnements an derselben WebSocket-Verbindung hängen; eine Ansicht kann ihn damit nicht vergessen. Alle vier Abonnement-Wege bauen die Verbindung wieder auf (fünf Stufen bis 15 s) und zählen im Hintergrund gar nicht erst mit. Im echten Browser mit gekapptem Socket nachgemessen: Band nach 38 s, vorher nach 0,2 s |
| **Startgeschwindigkeit** | Ansichten einzeln nachladbar, Service Worker hält die App-Hülle vor, Frist auf jedem Start-Zugriff | Rechnung (27: Frist, Service Worker und Fehlergrenze gegen den echten Quelltext) | **Auf keinem echten iPhone gemessen** — die Ursachen sind aus dem Code belegt, die Wirkung ist es nicht |
| **Fassungswechsel** | Der Worker behält die alten Bausteine, bis die neue Fassung übernommen wird; ein fehlgeschlagenes Nachladen lädt einmal von selbst neu | Rechnung (11 Sandbox + 9 Fehlergrenze) | Nicht auf einem echten Gerät über einen echten Deploy gefahren |
| **Meldungen (Push)** | Wer wird wann benachrichtigt; ausgelöst vom Trigger `material_orders_push`, zugestellt von der Edge Function `push-melden` | Rechnung (25), Datenbank (14 Auslöser und Empfängerkreis + 6 Wächter) | Die Zustellung selbst ist ungetestet — die Edge Function hat nie ein Test ausgeführt, siehe unten |

## Abgeschaltet oder ohne Weg dorthin

| Was | Zustand |
|---|---|
| **KI-Spracherfassung** (`/voice`) | **Am 19.09.2026 ersatzlos entfernt.** Sie war vollständig gebaut und dauerhaft aus: ohne Schlüssel führte der Knopf nur in eine Fehlermeldung, und Sprachaufnahmen von Mitarbeitern gehen an US-Anbieter — das braucht vorher Auftragsverarbeitungsverträge, die niemand geschlossen hat. Ein abgeschalteter Bereich, den niemand einschalten wird, ist Ballast, den jede spätere Änderung mitschleppt. |
| **Wiedervorlagen** (`follow_ups`) | Tabelle, Richtlinien und Datenschicht existieren; geschrieben wurde nur aus der KI-Erfassung. Mit deren Entfernung ist der Bereich **unerreichbar** — keine Ansicht liest oder schreibt ihn. Entweder bekommt er einen echten Eingang (Wiedervorlage aus Angebot oder Mahnung) oder er fällt weg; das ist eine Produktentscheidung. |

---

## Die ehrliche Bilanz zur Prüftiefe

2465 automatische Prüfungen klingen nach viel. Aufgeschlüsselt (Lauf vom
19.09.2026):

| Art | Anzahl | Aussagekraft |
|---|---|---|
| **Gegen eine echte Postgres-Datenbank** (`npm run supabase:test`) | **740** | **Am höchsten — Zeilenschutz, Datenbankfunktionen, Trigger und Nebenläufigkeit, wie sie produktiv laufen** |
| **Im echten Browser** (`npm run durchklick`) | **4** | **Hoch für die Naht: vier ganze Wege, gegen den laufenden Stapel. Findet, was kein Ansichtstest sieht** |
| **Statischer Abgleich** (Navigation ↔ Routen 35, Abfragegrenzen 52, Exportumfang 12, Ausgangsfach-Naht 4, Pflichtfelder 3, Bau-Umgebung 3, Datenschicht-Vertrag 2) | **111** | **Hoch — fängt Widersprüche zwischen Listen, die dasselbe behaupten** |
| **Service Worker in einer Sandbox** | **20** | **Hoch — der echte Quelltext, nicht ein Nachbau** |
| Reine Rechnung (der Rest von `tests/unit`) | 871 | Hoch für die Formeln, **null** für die App |
| Ansichten, Datenbank ersetzt | 719 | Findet Bedienfehler, **keine** Datenfehler |
| *Zusammen `npm test`* | *1721* | |

> Die Tabelle ADDIERT SICH, und das ist Absicht: eine Aufschlüsselung, in der
> Zeilen fehlen, liest sich wie eine vollständige und ist keine. Datenbank-
> und Browserlauf stehen getrennt, weil sie einen laufenden Stapel brauchen
> und deshalb nicht im selben Befehl stecken.

**Was in dieser Tabelle NICHT mehr steht**, und warum das eine gute Nachricht
ist: bis zum 19.09.2026 stand hier eine Zeile „Cloud Functions mit ersetztem
Firestore (109)" — der echte Handler lief, aber die Aussenwelt war nachgebaut,
und Indizes, Nebenläufigkeit und Regeln konnte dieser Ersatz nicht prüfen. Die
Arbeit dieser Functions macht jetzt die Datenbank, und sie wird gegen eine
echte Datenbank geprüft. **Die vier verbliebenen Edge Functions haben diese
Lücke aber geerbt** — siehe unten.

**Die Nachtläufe melden sich seit dem 07.09.2026.** Die Ausleitung (02:30)
hält fest, ob sie durchgegangen ist; bleibt der letzte Erfolg zwei Nächte aus,
steht das auf der Startseite der Leitung. Es war der einzige Mangel dieser
App, bei dem der Schaden mit der Zeit WÄCHST statt aufzufallen: die Sicherung
konnte wochenlang ausfallen, und bemerkt hätte man es an dem Tag, an dem man
sie braucht.

> **DEN BILANZLAUF GIBT ES UNTER POSTGRES NICHT MEHR** (03:15, bis 16.09.2026
> hier mitgeführt). In Firestore musste die Monatsbilanz vorgerechnet und
> abgelegt werden — mit einem Trigger zum Nachziehen und einem nächtlichen
> Lauf zum Ausgleichen. Unter Postgres ist `monthly_stats` eine SICHT: sie
> rechnet bei jeder Abfrage neu, es gibt nichts nachzuziehen, keinen Lauf und
> keinen Eintrag in `cron`.
>
> Die Startseite fragte trotzdem weiter nach ihm, bekam „noch nie
> durchgelaufen" — was stimmt, weil es ihn nicht gibt — und meldete
> Geschäftsführung und Administration **dauerhaft** „Ein nächtlicher Lauf
> steht aus". Eine Warnung, die niemand abstellen kann, ist schlimmer als
> keine: sie bringt einem bei, die Stelle zu übersehen, an der eines Tages
> die ausgefallene Sicherung steht.

> **„Unbekannt" ist nicht „gut".** Ein Betrieb ohne Aufzeichnung sieht in den
> Daten genauso aus wie einer, bei dem nie etwas lief — und beides heisst: es
> gibt keine Sicherung, von der jemand weiss. Beide Fälle melden sich.
>
> Geschrieben wird der Zustand **ausschliesslich vom Server**
> (es gibt keine Schreibrichtlinie). Eine Überwachung, die der Überwachte selbst
> beschreiben kann, überwacht nichts.

**Pflichtfelder tragen seit dem 07.09.2026 einen Stern.** Vorher erfuhr man
erst nach dem Absenden, dass etwas fehlt — bei einem Formular mit acht Feldern
heisst das: ausfüllen, abschicken, Meldung lesen, suchen.

> Der Stern steht **neben** dem Label, nicht darin: im Label wäre er Teil von
> dessen Text, und das Feld hiesse „Von \*" statt „Von". Die zweite Hälfte der
> Kennzeichnung ist `aria-required` am Feld selbst — ein Stern allein ist
> Farbe und Form und für einen Vorleser nichts.
>
> `tests/unit/pflichtfelder.test.ts` gleicht ab: **jedes Feld mit `required`
> trägt auch den Stern.** Beide Angaben stehen nebeneinander am selben
> Element, und man kann die eine ohne die andere setzen — beim nächsten neuen
> Formular ist genau das die naheliegende Nachlässigkeit.

**Die internen Kostensätze standen als Hausnummer im Formular.** Gemeldet
wurde: „Die Nachkalkulation sagt, man muss in den Einstellungen den Betrag
festlegen, ich finde aber kein Feld." Das Feld war da — es zeigte 42 und 28,
sichtbar, aber nirgends gespeichert.

> Daraus wurden zwei Fehler auf einmal. Die Nachkalkulation meldete
> „Kostensätze fehlen", während daneben zwei ausgefüllte Felder standen. Und
> wer aus einem beliebigen anderen Grund auf Speichern drückte — etwa um das
> Zahlungsziel zu ändern —, schrieb die erfundene Zahl fest: ab da beruhte
> jede Marge des Betriebs auf 42 €, die niemand entschieden hatte.
>
> Jetzt bleiben die Felder leer, bis der Betrieb sie füllt, und mitgeschrieben
> werden sie nur, wenn **beide** dastehen. Der Unterreiter heisst „Sätze und
> **Kosten**", damit man sie dort auch vermutet.

**Gelöscht wird nur mit Rückfrage — seit dem 07.09.2026 ausnahmslos.** Eine
Prüfung über alle Löschwege der App fand zwei ohne: „Rechnung löschen" im
Zeilenmenü einer stornierten Rechnung, und „Antrag zurückziehen" beim Urlaub.

> **Das Löschen einer Rechnung gibt es nicht mehr**, auch nicht für die
> stornierte — weder in der Oberfläche noch serverseitig
> (es gibt keine Löschrichtlinie). Nicht bloss mit einer Rückfrage versehen,
> sondern gestrichen: § 132 BAO verlangt sieben Jahre Aufbewahrung, und die
> gezogene Nummer hinterliesse eine Lücke im Kreis, die der
> Buchhaltungs-Export danach zu Recht meldet — ohne dass noch jemand wüsste,
> warum. Der **Storno** ist die vorgesehene Korrektur: er bleibt stehen,
> trägt seinen Grund und lässt sich wieder aufheben.
>
> **„Antrag zurückziehen"** fragt jetzt nach und nennt den Zeitraum. Betroffen
> ist nur der eigene, noch nicht entschiedene Antrag; der Schaden eines
> Fehlgriffs ist gering. Die Ausnahme im Verhalten war das Problem — auf einen
> Löschknopf ohne Rückfrage neben elf mit stellt sich niemand ein.
>
> Zwei Dinge bleiben ganz unlöschbar und waren es schon: der unterschriebene
> **Handwerksschein** und das **Benutzerkonto** (nur deaktivierbar, sonst
> verlören seine Buchungen ihren Besitzer).

**Die Auswertung steht jetzt an zwei Stellen, und das mit Absicht.** Bis zum
07.09.2026 gab es sie nur unter der Mitarbeiterübersicht — dort beantwortet
sie eine Monatsfrage über alle Baustellen („wohin gingen die Stunden im
September?"), und daran hängt auch der CSV-Export. Die Frage, die man beim
Blick auf eine Baustelle tatsächlich hat, ist eine andere: „wie steht DIESE
Baustelle?", über ihre ganze Laufzeit. Sie steht jetzt im Baustellen-Tab,
aufklappbar je Zeile.

> Beide rechnen aus derselben Quelle (`listEntriesForProjects`) und können
> nicht auseinanderlaufen. Genau daran ist die Auswertung schon einmal
> gescheitert: sie verglich Monatsstunden mit einem Budget, das für den
> ganzen Auftrag kalkuliert war, und meldete eine ausgereizte Baustelle als
> halb offen.
>
> **Ohne Geld.** Erlös, Kosten und Deckungsbeitrag bleiben in der
> Nachkalkulation und damit bei der Geschäftsführung; die Baustellenübersicht
> sieht auch die Projektleitung.
>
> Zugleich ist der blaue Kopfbereich der Projektauswertung weg — dieselbe
> Entscheidung, die in der Mitarbeiterübersicht längst getroffen war und hier
> stehengeblieben ist. Helferstunden sind keine Warnung mehr, sondern eine
> Angabe; eine Pille bekommt nur noch, was eine Ausnahme ist („über Budget").

**Die Naht zwischen der Urlaubs-Function und dem Zeitkonto, seit dem
07.09.2026.** Hier stand, es gebe „keinen Durchstich" — das war zu pauschal.
Beide Hälften waren geprüft: die Function mit 24 eigenen Tests, und
`durchstich.test.ts` prüfte, dass fünf Urlaubstage den Saldo nicht ins Minus
ziehen.

> **Nur bemerkte keine die andere.** Der Durchstich STELLTE NACH, was die
> Function schreibt, statt sie aufzurufen. Dazwischen lag eine Annahme, die
> niemand nachrechnete: dass die Datensätze der Function genau die Form haben,
> die die Saldorechnung erwartet. Hiesse das Feld einmal `'Urlaub'` und einmal
> `'Urlaubstag'`, blieben beide Testreihen grün — und der Monteur stünde nach
> seinem Urlaub mit vierzig Minusstunden da.
>
> Jetzt läuft die ECHTE Ausgabe der Function durch die ECHTE Rechnung: Saldo,
> offene Werktage, Monatsbilanz. Und nach der Rücknahme steht der Saldo wieder
> dort, wo er ohne Urlaub stünde.

**Die UID des Kunden landete nur bei Reverse Charge auf der Rechnung.**
Gefunden bei einer Durchsicht am 07.09.2026: die App lud sie aus dem
Kundenstamm, zeigte sie im Formular — und warf sie beim Speichern weg, sobald
der Haken aus war (`customerVatId: reverseCharge ? … : ''`).

> **Über 10.000 € brutto an ein Unternehmen ist sie Pflichtangabe**
> (§ 11 Abs 1 Z 2 UStG). Ihr Fehlen trifft nicht den Aussteller, sondern den
> KUNDEN: ihm steht der Vorsteuerabzug erst zu, wenn sämtliche
> Rechnungsmerkmale vorliegen. Wird die UID binnen eines Monats nachgereicht,
> wirkt die Berichtigung zurück, später erst ab dem Tag der Ergänzung.
>
> Das Feld steht jetzt AUSSERHALB des Reverse-Charge-Blocks — es gehört zum
> Empfänger, nicht zur Steuerschuld — und die UID wandert immer in die
> Rechnung. Über der Grenze wird **gewarnt, nicht gesperrt**: ob der Empfänger
> Unternehmer ist, steht in keinem Datenfeld, und eine Rechnung über 12.000 €
> an eine Privatperson ist vollkommen in Ordnung. Bei Reverse Charge bleibt
> es bei der Sperre — dort belegt die UID den Übergang der Steuerschuld.

**Die Kundenakte, seit dem 07.09.2026.** Gemeldet wurde: „Man kann Kunden
zwar eine Mail, Notiz, UID und weiteres hinzufügen, diese Daten scheinen
jedoch nirgendwo auf." Das stimmte — das Formular nahm sieben Felder
entgegen, die Liste zeigte drei. E-Mail, UID-Nummer und Notiz wurden erfasst
und danach nie wieder gezeigt.

> **Am teuersten war die UID.** Sie gehört auf jede Rechnung an ein
> Unternehmen, und wer sie nachsehen wollte, musste in die
> Bearbeitungsmaske — also genau dorthin, wo man sie versehentlich ändert,
> während man sie nachliest.
>
> Die Akte ist eine eigene Seite (`/customers/:id`), kein Aufklappen mehr.
> Die Historie hing bisher IN der Nebenzeile einer Listenzeile, mit `span`
> gebaut, weil ein Absatz keine Blöcke verträgt. Um Stammdaten und Wartungen
> erweitert wäre daraus vollends eine Ansicht in der Verkleidung einer Zeile.
> Und eine Seite hat eine Adresse: von der Baustelle oder der Rechnung lässt
> sich später darauf verlinken, auf ein Aufklappen nicht.
>
> Mitgenommen: `listWartungenForCustomer` war geschrieben und nie verdrahtet —
> jetzt stehen die Wartungen des Kunden in seiner Akte. Und die
> Kontakt-Regeln (`mapsUrl`, `telUrl`, der neue `mailUrl`) haben endlich
> eigene Tests; im Modul stand seit jeher, sie seien genau dafür ausgelagert.

**Bearbeitet wird seit dem 15.09.2026 in der Akte selbst.** Die
Stammdatenkarte IST das Formular — kein Umschalten in einen Bearbeiten-Modus,
und kein Rücksprung in die Kundenliste, aus der man gerade gekommen ist. Wer
ändern darf, tippt direkt; wer nur lesen darf, sieht dieselben Felder als
Liste. Die Grenze ist dieselbe wie in der Kundenliste (`isGF`:
Geschäftsführung, Projektleitung, Administration) — eine zweite Regel an
derselben Sache wäre der Anfang zweier verschiedener Antworten. Die
Speicherleiste erscheint erst, wenn sich wirklich etwas geändert hat.

> Dabei gefunden: der Angebotsblock der Akte suchte die Angebote über den
> KUNDENNAMEN, die Abfrage filtert aber auf die Kennung. Unter Postgres
> scheiterte er an jedem Kunden, unter Firestore blieb er still leer. Er hat
> nie funktioniert; jetzt tut er es, und eine Prüfung hält das Argument fest.

**Die Baustelle hat seit dem 15.09.2026 dieselbe Akte** (`/admin-projects/:id`).
Sie hatte vorher gar keine eigene Seite: bearbeitet wurde sie über der Liste,
die Stundenauswertung klappte in der Listenzeile auf. Aus „Übersicht" und
„Bearbeiten" ist ein Verweis geworden — „Akte"; das Formular über der Liste
legt nur noch an.

> Zwei Fehler kamen dabei heraus. **Die Abrechnungsart (Regie/Pauschal) war
> nirgends änderbar** — der Handwerksschein liest sie, geschrieben wurde sie
> nur beim Umwandeln eines Angebots; jede von Hand angelegte Baustelle galt
> stillschweigend als Regie. Und **eine Baustelle ohne Datumsangaben liess
> sich seit dem Postgres-Umstieg gar nicht anlegen**: ein leeres Datumsfeld
> liefert `''`, und das nimmt eine `date`-Spalte nicht an. Gefunden hat das
> der Durchklick im echten Browser — im Ansichtstest ist die Datenschicht
> ersetzt, und eine Nachbildung nimmt jede Zeichenkette an.

**Der Benutzer hat seit dem 15.09.2026 dieselbe Akte** (`/user-mgmt/:uid`).
Vorher führte „Bearbeiten" in das ANLEGE-Formular ganz oben, wo die
Zeitkonto-Felder erst noch aufzuklappen waren; Passwort-Mail und Sperren
lagen in einem Zeilenmenü. Aus drei Wegen ist einer geworden. Die
Zeitkonto-Felder stehen in der Akte offen — im Anlege-Formular bleiben sie
eingeklappt, weil die Vorgaben dort meistens stimmen.

> Auch ein Administrator, den die aufrufende Rolle nicht ändern darf, hat
> jetzt eine Akte: vorher stand in seiner Zeile „nur durch Administrator"
> ohne einen Weg zur Person. Ansehen darf man sie, ändern nicht.

**Jede Ansicht der App hat seit dem 07.09.2026 einen Ansichtstest.** Zuletzt
offen waren Nachkalkulation, Module, Meine Baustellen, Firmendaten,
Einstellungen und die KI-Erfassung. Fünf weitere standen hier noch als
ungetestet und waren es längst nicht mehr — die Tabelle oben hinkte der
Wirklichkeit nach und ist nachgezogen.

> **Was ein Ansichtstest wert ist, bleibt begrenzt.** Er rendert und klickt,
> aber jeder Datenbankzugriff ist ersetzt: er findet Bedienfehler und
> Verdrahtungsfehler, keine Datenfehler. Der wertvollste Fund dieser Runde ist
> genau ein Verdrahtungsfehler-Test: die Nachkalkulation muss mit den
> KOSTEN-, nicht den Verrechnungssätzen rechnen. Die Formel dafür war immer
> richtig; geprüft war nie, welche Zahl hineingeht.
>
> Nebenbei aufgefallen und behoben: in den Firmendaten trugen zwei Felder die
> gleiche Beschriftung „Schrift darauf". Auf dem Bildschirm ordnet die Nähe
> das zu, eine Sprachausgabe liest die Beschriftung ohne ihre Umgebung.

**Wiederkehrende Wartungen seit dem 07.09.2026.** Die jährliche
Thermenwartung ist der einzige Umsatz eines Installateurs, der sich ein Jahr
im Voraus planen lässt. Geführt wurde sie bisher im Kalender oder im Kopf —
und dort geht sie nicht auffällig verloren, sondern still: sie fällt in einem
vollen Frühjahr niemandem ein, und der Kunde beschwert sich nicht, dass
niemand gekommen ist. Er wechselt beim nächsten Gebrechen den Betrieb.

> **Der Bereich lebt an einem einzigen Schritt: „erledigt eintragen".** Damit
> rückt der nächste Termin nach — gerechnet ab dem Tag der AUSFÜHRUNG, nicht
> ab dem geplanten Termin, weil das Wartungsintervall ab der letzten
> tatsächlichen Wartung läuft. Ohne diesen Schritt wäre die Liste nach einem
> Jahr eine Sammlung roter Zeilen, die niemand mehr ernst nimmt.
>
> Die Terminrechnung schlägt am Monatsende an: der 31. August plus sechs
> Monate ist der 28. Februar, nicht der 3. März. Ohne diesen Anschlag wandert
> der Termin bei jedem Durchlauf ein Stück, und nach ein paar Jahren steht
> die Sommerwartung im Herbst.
>
> Seit dieser Änderung laufen die Tests in `Europe/Vienna` statt in UTC. Ein
> Test, der eine Zeitumstellung prüft, prüfte auf einem Bauserver in UTC
> nichts — dort gibt es keine. `wartungsplan.test.ts` stellt eigens fest, dass
> die Einstellung wirkt.

**Mahnwesen seit dem 07.09.2026.** Vorher gab es den Status „Überfällig" — er
wurde beim Öffnen der Liste gesetzt und angezeigt, mehr nicht. Kein
Mahndatum, keine Stufe, kein Schreiben; der Betrieb führte das Mahnen im Kopf.
Jetzt drei Stufen mit eigenem Text und eigenem Beleg, änderbarer Frist und
Mahnspesen aus den Einstellungen.

**Die eigene Frist zählt seit dem 16.09.2026 mit.** Bis dahin prüfte der
Mahnlauf nur das ursprüngliche Zahlungsziel. Wer gestern eine
Zahlungserinnerung mit einer Woche Frist verschickt hatte, bekam die Rechnung
heute wieder angeboten — für Stufe 2, sechs Tage vor Ablauf der Frist, die er
selbst gesetzt hat. Am Bildschirm sah das aus wie Arbeit; in Wirklichkeit war
es eine Aufforderung, dem Kunden die zugesagte Frist wieder zu nehmen.

> **Aufgefallen ist es erst durch das Abzeichen im Menü.** Solange es eine
> Liste war, sah niemand den Unterschied zwischen „steht da, weil es dran ist"
> und „steht da, weil es überfällig ist". Als ZAHL wäre es eine Zahl, die
> jeden Tag leuchtet, solange auch nur eine Rechnung offen ist — und eine
> Meldung, die immer an ist, ist keine. Die Regel steht jetzt an zwei Orten
> (`mahnung.ts:laufendeFrist` und `app.mahnung_faellig`), weil das Abzeichen
> zählen muss, was die Liste zeigt; `tests/unit/mahnfrist.test.ts` hält beide
> aneinander, bis auf die Zahl der Tage.

> **Verzugszinsen werden bewusst NICHT gerechnet.** Zwischen Unternehmern sind
> es 9,2 Prozentpunkte über dem Basiszinssatz (§ 456 UGB) — und der ändert
> sich halbjährlich. Eine hier hinterlegte Zahl veraltet still und steht danach
> auf jeder Mahnung falsch; eine falsch berechnete Zinsforderung ist schlechter
> als keine.

**Reverse Charge seit dem 07.09.2026.** Erbringt der Betrieb eine Bauleistung
an einen anderen Bauunternehmer — als Subunternehmer —, geht die
Umsatzsteuerschuld auf den Empfänger über (§ 19 Abs 1a UStG). Ein Haken je
RECHNUNG, nicht am Kunden: derselbe Baumeister kann ein Werkzeug kaufen (20 %)
und eine Installation beauftragen (Übergang). Ohne die UID des Empfängers
lässt sich die Rechnung nicht anlegen — ohne sie ist der Übergang nicht
belegt.

> **Vorgefunden wurde eine Falle, und zwar ZWEIMAL:** im USt-Feld stand
> „0 % (Reverse Charge)" — einmal in den Einstellungen, einmal in einer
> zweiten Fassung desselben Formulars in der Rechnungsansicht. Das setzte nur
> den Satz auf null; weder der Pflichthinweis noch die UID kamen auf den
> Beleg, und als Vorgabe hätte es für JEDE Rechnung gegolten, auch die an
> Privatkunden.
>
> Beim Beheben ist mir die zweite Stelle durchgegangen — aufgefallen ist es
> erst beim Durchsuchen des ausgelieferten Bundles. Dagegen hilft kein
> Ansichtstest, sondern ein statischer Abgleich über ALLE Dateien
> (`tests/unit/reverseChargeKeinSatz.test.ts`), dasselbe Muster wie bei
> Navigation ↔ Routen.

**Die Rechnung schliesst den Kreis erst seit dem 07.09.2026.** Bis dahin
verrechnete diese App ausschliesslich STUNDEN — bei einem Installateur schnell
die halbe Rechnungssumme, die das Büro von Hand nachtippte. Und der
Leistungszeitraum, Pflichtangabe nach § 11 Abs 1 Z 4 UStG, fehlte auf jedem
Beleg. Beides ist jetzt vorbereitet und beides bleibt änderbar: Material aus
den unterschriebenen Scheinen lässt sich in der Vorschau bearbeiten und
entfernen, der Zeitraum ist vorbelegt und überschreibbar.

> **Was ein Automatismus hier NICHT heissen darf.** Eine Rechnung ist selten
> genau das, was die Belege hergeben — eine Anfahrt kommt dazu, eine Stunde
> wird erlassen, ein Pauschalposten ersetzt drei Zeilen. Wer das nicht in der
> App tun kann, tut es danach in Word, und dann stimmt die Rechnung im System
> nicht mehr mit der überein, die der Kunde bekommen hat.

**Die Ansichtstests sind seit dem 19.09.2026 vollständig: alle 28 Ansichten
haben einen eigenen.** Angefangen hat es mit den vier wichtigsten
(Zeiterfassung, Rechnungen, Einsatzplanung, Baustellen), danach kam der ganze
MATERIALABLAUF über drei Ansichten hinweg — anfordern, bearbeiten, Bestand
führen —, zuletzt die kleineren.

**Warum der Materialablauf als GANZES geprüft wurde und nicht Ansicht für
Ansicht:** der Fehler, den er zutage gefördert hat, lag in keiner der drei
Ansichten. Er lag in der Regel darunter — der Monteur durfte den Lagerbestand
nicht mehr bewegen, seit der Materialstamm eingegrenzt wurde, und damit tat
sein „Abgeholt"-Knopf nichts. Wer eine Ansicht allein prüft, sieht so etwas
nie.

**Und die Einschränkung gilt unverändert:** in jedem dieser Tests ist jeder
Datenbankzugriff ersetzt. Sie prüfen die Verdrahtung — welche Zahl in welche
Kachel geht, in welcher Reihenfolge geschrieben wird, was passiert, wenn ein
Ladevorgang scheitert. Eine an den Richtlinien scheiternde Abfrage finden sie
weiterhin nicht; dafür sind die Datenbanktests da, und für die Naht dazwischen
der Durchklick im echten Browser.

**Warum das nicht theoretisch ist.** Jeder Fehler, der bisher aus dem Betrieb
gemeldet wurde, lag in den Nähten, die ersetzte Datenbankzugriffe per
Konstruktion nicht sehen:

| Gemeldet | Ursache | Wird jetzt abgefangen? |
|---|---|---|
| Kundenakte ohne Baustellen | fehlender Firestore-Index | **Gegenstandslos** — Postgres kennt keine Pflichtindizes; eine Abfrage ohne Index ist langsam, nicht leer. Dafür prüft `schema.test.ts`, dass jede Mandantentabelle einen Index mit `company_id` oder einem Fremdschlüssel als führender Spalte hat. |
| Projektleitung: fünf Reiter mit „Kein Zugriff" | drei Listen behaupteten dasselbe und waren auseinandergelaufen (`navigation.ts`, `RequireRole`, `permissions.ts`) | **Ja** — der Abgleich Navigation ↔ Routen. Und die Doppelung selbst ist weg: `RequireNav` liest aus derselben Liste. |
| Leeres Auswahlfeld beim Schein | verschluckter Fehler | **Teilweise** — die Datenbanktests finden eine Abfrage, die am Zeilenschutz scheitert; eine schlicht leere Menge finden sie nicht. |
| „Lädt ewig" (Schein) | Serveraufruf ohne Frist | **Ja** — die Frist liegt in `lib/frist.ts` und ist geprüft |
| „iPhone lädt gar nicht" | Start hing an zwei Abfragen ohne Zeitgrenze; kein Vorhalten der App-Hülle | **Teilweise** — Frist und Service Worker sind geprüft, die Wirkung auf einem echten Gerät ist es nicht |
| Unterschrift ohne Wirkung | `canvas.width` löscht die Fläche | **Ja, seit dem Durchklick** — „Schein unterschreiben" läuft in einem echten Chromium. Auf einem echten iPhone bleibt es die Bestätigung des Betriebs vom 07.09.2026. |

**Der Nebenläufigkeitstest verdient seinen Platz, und das ist nachgemessen.**
Der Lagerabzug läuft als Durchstich gegen eine echte Datenbank, mit zwei
GLEICHZEITIGEN Abschlüssen derselben Anforderung. Der Fall ist keine Theorie:
Verwaltung und Projektleitung arbeiten dieselbe Liste ab, oft am selben
Vormittag; ohne Transaktion ginge der Bestand zweimal herunter, und beide
Klicks meldeten Erfolg.

> Ersetzt man die Transaktion durch ein schlichtes Lesen-dann-Schreiben,
> bleibt die Gegenprobe „zweimal nacheinander" GRÜN — das `processed`-Flag
> steht beim zweiten Klick ja schon. Nur der gleichzeitige Fall fällt durch.
> Genau dafür ist er da.

## Was am Prüfnetz noch fehlt

1. **Die vier Edge Functions laufen ungetestet.** Was sie tun, ist geprüft —
   aber an der Datenbank, nicht an der Function: `betrieb-anlegen` und
   `mitarbeiter-anlegen` an der Datenbankfunktion darunter, die Ausleitung an
   ihren Entscheidungen (welcher Pfad, was darf gelöscht werden, wie sieht
   eine Zeile aus), die Push-Meldung am Auslöser und am Empfängerkreis. Das
   Lesen und Schreiben der Function selbst hat nie ein Test ausgeführt. Das
   ist die grösste verbliebene Lücke.

2. **Ein zweiter Betrieb in der echten Auslieferung.** Die Mandantentrennung
   ist gegen eine echte Datenbank geprüft, einschliesslich zweier Betriebe
   nebeneinander. Was fehlt, ist der Betrieb, der tatsächlich bei jemand
   anderem läuft.

3. **Ein echtes Telefon.** Der Durchklick läuft in Chromium; Chromium ist
   nicht Safari, und ein Laptopfenster ist kein iPhone. Die Unterschrift ist
   im Mechanismus nachgewiesen und vom Betrieb einmal bestätigt — automatisch
   abgesichert gegen Rückfall ist sie auf iOS nicht.

4. **Nebenläufigkeit ausserhalb des Lagerabzugs.** Zwei gleichzeitige
   Rechnungsläufe auf derselben Baustelle etwa. Der Nummernkreis ist
   abgesichert (`for update`), der Rest ist es nicht nachgewiesen.

5. **Dass die nächtlichen Auslöser in Produktion feuern.** Dafür gibt es die
   Überwachung, die es MELDET, wenn ein Lauf ausbleibt — aber keinen Test, der
   es vorher zusichert.

> **Eine Lehre aus der Navigation, die bleibt.** Von 18 Reitern auf 14 zu
> verdichten war zur Hälfte richtig: die Einstellungen (Sätze, Module,
> Sicherung) richtet man einmal ein — das ist wirklich ein Bereich. Material
> dagegen ist seit 03.09.2026 wieder getrennt, auf klare Ansage aus dem
> Betrieb: es sind drei Blicke auf dasselbe THEMA, aber drei verschiedene
> TÄTIGKEITEN von drei verschiedenen Leuten. **Die richtige Frage ist nicht,
> ob etwas thematisch zusammengehört, sondern ob es dieselbe Person in
> derselben Situation tut.**

## Eine Ungereimtheit, die noch offen ist

Die **Nachkalkulation** ist bewusst Geschäftsführungssache, weil sie Margen
zeigt. Die **Angebote** stehen dagegen auch der Projektleitung offen — und
darin steht die Vorkalkulation mit den Kostensätzen, also die Marge des
einzelnen Auftrags. Entweder ist die eine Grenze zu eng oder die andere zu
weit; entschieden ist es nicht. Das ist eine Produktfrage, keine
Programmierfrage: sie hängt daran, ob die Projektleitung im Betrieb
mitkalkulieren soll.
