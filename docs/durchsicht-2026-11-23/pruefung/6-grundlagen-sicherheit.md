# Gegenprüfung: 6 — Grundlagen und Sicherheit — 23.11.2026

Geprüft von einem unabhängigen Prüfer. Stand `main` fa6e740. Am Repository nichts geändert außer
dieser Datei.

**Womit geprüft:** eigene Wegwerf-Datenbank `pruef_s` (Postgres 16, alle 358 Migrationen am
Endstand, nachgebaute Supabase-Hüllen). Eigene Grundlage, nicht die des Autors: zwei Betriebe
(„alfa“, „beta“) mit je Administrator und Monteur, in Alfa dazu Buchhaltung, Projektleiter,
Verwaltung; zwei Plattformkonten; je Betrieb Baustellen, Lagerartikel, Anforderungen, Wartungen,
Scheine, Rechnungen, ein Angebot, ein Urlaubsantrag, ein Auftragseingang. Jeder Aufruf als
`authenticated` mit nachgestellten Ansprüchen in einer verworfenen Transaktion; die Freigabe legt
der Administrator über die Tabellenregel an, den Zugriff meldet das Plattformkonto selbst (wie die
App). Die Vorschläge zu S-1 und S-13 habe ich in der Datenbank **eingespielt** (Textersatz am
Endstand, wie eine Migration es täte) und davor/danach verglichen. Dateien und Zeilen im Code
einzeln geöffnet. Nicht verfügbar: Anmeldedienst, Speicher-Schnittstelle, Edge-Runtime, Realtime,
FCM — dort steht „am Code“. Keine Testdatei gelaufen.

Die Skripte und Ausgaben liegen unter
`/tmp/claude-0/-workspace-Prototype-App-Installateure/d2c6c62f-de1f-5d7d-8a7e-91e7b4244a5a/scratchpad/audit/pruef-s/`
(`10_s1.sql`, `20_gegenfaelle.sql`, `21_gegenfaelle2.sql`, `30_schreiben.sql`,
`31_ansehen_schreibt.sql`, `40_s13.sql`, `50_stichprobe.sql`, `51_stichprobe_support.sql`,
`60_s3.sql`, `70_s7.sql`, `71_v2.sql`, `80_s12.sql`, `90_forderungen.sql`, je mit `.out`).

## 1. Ergebnis in Zahlen

| Urteil | Anzahl |
|---|---|
| bestätigt (nachgestellt) | 4 (S-1, S-3, S-7, S-12) |
| bestätigt (am Code) | 8 (S-2, S-4, S-5, S-6, S-8, S-9, S-10, S-11) |
| teilweise | 1 (S-13) |
| widerlegt | 0 |
| nicht prüfbar | 0 |

Dazu die Aussage des Plans „kein Befund, bei dem ein Konto Daten eines anderen Betriebs lesen oder
schreiben kann“: **bestätigt (nachgestellt)** für eine eigene Stichprobe von 40 Funktionen
(Abschnitt 2a). Der Vorschlag `coalesce(app.betrieb(), app.supportbetrieb())` ist für die vier
Listenfunktionen **sicher** (17 Gegenfälle, Abschnitt 2b) — aber so, wie er in S-1 und im Plan
steht, **unvollständig** (Lager bleibt leer) und für drei weitere Funktionen im Plan **falsch
wiedergegeben** (Abschnitt 4).

## 2. Je Befund

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag: Risiko „verschlimmbessern“, fehlendes „bleibt gleich“, Widerspruch |
|---|---|---|---|
| S-1 | **bestätigt (nachgestellt)** | `10_s1.sql`: Plattformkonto (`aal2`), Freigabe „ansehen“ für Alfa, Zugriff gemeldet → `select count(*)` auf `projects`/`materials`/`material_orders`/`wartungen` liefert 2/2/2/1 (wie der Administrator); `baustellen_liste`, `lager_liste`, `anforderungen_laufend`, `wartungen_faellig_stand` je `42501 Kein Zugriff auf …`. Migrationen `20261118033000:51/56`, `…030000:56/60`, `…032000:39/43`, `…031000:38/41` stimmen. `startseite-forderungen/index.ts:38–47, 63–64` (401 ohne Betrieb im Token), `laden.ts:541` ohne `still(…)`, Zusage `SupportzugangView.tsx:207` gelesen. `supportAnsehenListen.test.ts` hat einen einzigen `rpc`-Aufruf (`lauf_festhalten`). | **Unvollständig, wie er dasteht.** Mit dem Vorschlag wörtlich („vier Funktionen, sonst unverändert“) eingespielt: Baustellen, Anforderungen, Wartungen = Prüfsumme wie Administrator; **`lager_liste` antwortet ohne Fehler mit `im_lager=0`, 0 Zeilen** — sie verbindet per `join` mit `public.lager_frei(…)`, das den Betrieb weiter nur aus dem Token nimmt. Aus einer Fehlermeldung würde ein stilles „Lager ist leer“. Erst mit `lager_frei` (und `lager_knapp`) in derselben Migration ist das Ergebnis gleich dem des Administrators (Lauf 2 in `20_gegenfaelle.sql`). S-13 nennt die beiden nur als „fraglich, gleich mitziehen“; der Plan nennt sie gar nicht. — Für Konten der Betriebe ändert sich nichts: 35 Vergleiche (5 Konten × 7 Aufrufe) Prüfsumme des ganzen Ergebnisses vor/nach gleich; `revoke`/`grant` bleiben (anon weiter `permission denied`). — Function: der Teil „Betrieb aus dem Rumpf, gelesen mit dem Token“ ist an den Tabellenregeln nachgestellt (`90_forderungen.sql`): fremder Administrator und Plattform ohne Einblick lesen mit der Angabe „alfa“ 0 Rechnungen und 0 Betriebszeilen, Plattform im Einblick Alfa liest Alfa und mit der Angabe „beta“ nichts. Die Function selbst lief nicht. Neu dabei: ein Konto ohne Betrieb im Token bekäme mit einer Angabe im Rumpf 200 mit leeren Zahlen statt 401 — unschädlich, aber die bestehende Prüfung „ohne Anmeldung nichts“ muss weiter 401 liefern (Fall ohne Token). |
| S-2 | **bestätigt (am Code)** | `sitzung.ts:197–244`: `passwortSetzen` ruft nur `auth.updateUser`. Endstand: `app.push_anmeldungen_entfernen` wird nur von `app.konto_sperren`, `app.sitzungen_beenden`, `push_geraete_abmelden`, `push_geraete_vergessen` gerufen; auf `auth.users`/`auth.sessions` liegt kein Auslöser. Text `PasswortAendern.tsx:101` stimmt. Dass der Anmeldedienst die anderen Sitzungen beendet, steht in `stand-2026-10-03.md:3206` („gemessen“) — hier nicht nachstellbar. | Der Vorschlag (neue Funktion, die die Marke dieses Geräts behält) ist richtig. Der **Plan** schreibt stattdessen „`app.push_anmeldungen_entfernen`, Weg wie K2“ — diese Funktion leert **alle** Marken des Kontos, auch die des Geräts, an dem gerade geändert wird; dann hängt „dieses Gerät bekommt weiter Meldungen“ allein an `pushAbgleichen`. Fehlendes „bleibt gleich“: `getPushState` dieses Geräts bleibt „bereit“ (steht im Papier, nicht im Plan). |
| S-3 | **bestätigt (nachgestellt)** | `60_s3.sql`: Betrieb „gamma“ mit zwei Konten gelöscht (`betrieb_loeschen_pruefen` → `…_ausfuehren`); zweiter `betrieb_loeschen_pruefen` → `P0002 Den Betrieb „gamma“ gibt es nicht`; beide Zeilen in `auth.users` stehen weiter (gesperrt, ohne Ansprüche); `betrieb_protokoll.angaben` trägt nur `"konten": 2`. `betrieb-loeschen/index.ts:137–151` und `BetriebVerwalten.tsx:327–328` gelesen. Die Schleife gegen den Anmeldedienst lief nicht. | Vorschlag schlüssig. Plan-Kurztext „Kennungen stehen im **Protokoll**“ weicht ab: das Papier will sie in `betrieb_zustand.konten_offen`, wo sie nach dem Entfernen wieder leer sind; im Protokoll blieben Kennungen gelöschter Personen auf Dauer stehen. |
| S-4 | **bestätigt (am Code)** | `support_notzugang` (Endstand) legt nur die Freigabe an; auf `support_freigaben` genau drei Auslöser (`_betrieb_fest`, `_fest`, `_frist`), keiner meldet; keine `push…`-Funktion nennt den Support; `push-melden/index.ts` ebenso; Startseite nennt den Notzugang nur in `regeln.ts:924`; sichtbar unter `SupportzugangView.tsx:162`, `:297`. | Der Push-Text soll „ohne Inhalt“ sein und zugleich den Grund tragen — der Grund ist Freitext der Plattform („Anruf Hr. Maier“) und stünde am Sperrbildschirm. Entweder ohne Grund oder bewusst entscheiden. Fehlendes „bleibt gleich“: Monteure und Büro ohne Leitungsrolle bekommen nichts. |
| S-5 | **bestätigt (am Code)** | `ohneEmpfang.ts:74–78` sichert nur `time_entries`; `VerloreneBuchung.tsx:62–70`: letzter Zweig ohne Grund und Inhalt; Nachricht mit Grund, Text verloren; `materialOrders.ts:133` merkt über `fachAnlegen` vor; `supabaseSender.ts:28–50` (42501, 23xxx, 22xxx endgültig). | Eine Datei `VerloreneBuchung.test.tsx` gibt es nicht — die bestehenden Fälle stehen in `tests/components/PremiumRueckmeldung.test.tsx`; die müssen unverändert grün bleiben. Plan-Kurztext „dieselbe Sicherung“ (wie P-1, Entwurf auf dem Gerät) ist nicht der Vorschlag des Papiers (Meldung mit Inhalt und Grund, „Erneut anfordern“ belegt den Warenkorb vor; Nachricht zurück ins Eingabefeld). |
| S-6 | **bestätigt (am Code)** | `AuthContext.tsx:535–557` (nur `visibilitychange`/`focus`, feste Meldung „auf einem anderen Gerät beendet“), `:572–601` (Minutentakt nur für Zwei-Faktor-Rollen); `app.ansprueche_aus_belegschaft` Endstand: `if tg_op = 'UPDATE' and new.active and new.role is distinct from old.role then perform app.sitzungen_beenden(new.id)`. `mein_zustand()` gibt es und läuft auch mit beendeter Sitzung (prüft nur `auth.uid()`). | „Sofort nach 42501“: 42501 ist auch jede gewöhnliche fachliche Abweisung (in meinen Proben z. B. „Zurückziehen kann, wer angefordert hat“). Abgemeldet werden darf nur, wenn `sitzungAnderswoBeendet` es bestätigt — steht so im Papier, muss als Prüfung dazu („abgewiesener Aufruf bei lebender Sitzung meldet nicht ab“). Plan-Kurztext „Hörer am Anmeldezustand“ ist ein anderer Weg; der Kommentar `AuthContext.tsx:528–533` hält fest, dass die App es über den Anmeldezustand erst beim Erneuern des Tokens merkt. |
| S-7 | **bestätigt (nachgestellt)** | `70_s7.sql` gegen die Regeln auf `storage.objects`: Buchhaltung Alfa (nicht Ersteller, nicht Führung) legt eine Datei in den Ordner des fremden Entwurfs (1), überschreibt (1) und löscht (1) die Datei des Monteurs; dieselbe Person an `work_sheet_photos`: `42501` bzw. 0 Zeilen. Monteur Beta: liest 0, Anlegen `42501`. Nachgestellt an der Regel, nicht an der Speicher-Schnittstelle. | Die Ausnahme „oder es gibt ihn noch nicht“ lässt weiter jedes Konto des Betriebs Dateien unter beliebiger Schein-Kennung ablegen — das ist der Rest der Lücke und gehört benannt. Siehe V-2 (Abschnitt 5): Anlegen prüft den Stand des Scheins gar nicht. |
| S-8 | **bestätigt (am Code)** | `shared/benutzername.ts:21–25`; `mitarbeiter-anlegen/index.ts:189–200`; `handbuch.html:5385` nennt den Benutzernamen; `grenzen-durchsicht-2026-10-24.md` enthält weder Benutzername noch E-Mail über alle Betriebe. | Kein Einwand. Ein von der Function geprüfter „freier Vorschlag“ sagt nicht mehr als die heutige 409. |
| S-9 | **bestätigt (am Code)** | `.github/workflows/supabase-migrationen.yml`: `:82`, `:116` `supabase/setup-cli@v1`; `:122`, `:132–133`, `:138–139`, `:158` Secrets; im Auftrag `einspielen` `:151` `npm ci`, **`:154`** (nicht `:153`) `npm run gemeinsames`, danach `:158`. `CLAUDE.md:82`, `DEPLOYMENT.md:84`, `:96–98` stimmen. | Die offene Frage des Papiers ist geklärt: `scripts/edge-shared-uebernehmen.mjs` importiert nur `node:fs`, `node:path`, `node:url` — im Auftrag `einspielen` kann `npm ci` **ganz entfallen** (einfacher und sicherer als `--ignore-scripts`). Der Plan nennt nur `--ignore-scripts`; die festgelegten Actions, die Umgebung und der Wächter fehlen im Kurztext. |
| S-10 | **bestätigt (am Code)** | `supportAnsehenListen.test.ts` 111 Zeilen, ein `rpc`; `LESENDE_FUNKTIONEN` (`netzFrist.ts:85`) enthält die vier Funktionen, dazu `lager_frei`, `lager_knapp`, `schein_verrechnung`, `retoure_rahmen`, `kollegen`. Zählung im Endstand: 59 für Konten ausführbare Funktionen mit Eigentümerrechten nennen `app.betrieb()` und keine der Support-Funktionen (Papier: 58). | **Das Kriterium „darf nicht 42501 antworten“ reicht nicht** (nachgestellt): `lager_frei` und `lager_knapp` antworten dem Support heute mit 0 Zeilen, `lager_liste` nach dem Vorschlag S-1 mit einer leeren Liste — alle drei wären im Wächter grün. Der Wächter muss mit angelegten Zeilen „gleiches Ergebnis wie der Administrator“ prüfen. Die Liste hat rund 100 Einträge, je Funktion braucht es gültige Angaben — „Aufwand klein“ ist knapp. |
| S-11 | **bestätigt (am Code)** | `firebase.json:41` (`https://*.supabase.co wss://*.supabase.co`, `img-src … https://*.supabase.co`); `sicherheitspruefung-2026-10-27.md:64`. | Fehlendes „bleibt gleich“: `vite.config.ts:117` (`vorschauKopfzeilen`) und `sicherheitsKopfzeilen.test.ts` lesen `firebase.json` direkt; Zeile 151 erwartet, dass die Vorschau mit `https://abc.supabase.co` genau die Kopfzeilen der Datei schickt. Wird `firebase.json` zur erzeugten Datei, muss die Prüfung die **erzeugte** Fassung prüfen, sonst ist die ausgelieferte Kopfzeile ungeprüft. Den Baustein „Host aus der Umgebung in die Regel“ gibt es schon (`vorschauKopfzeilen` für den lokalen Stapel) — denselben nehmen. Außerdem bleibt `connect-src https://*.googleapis.com` genauso weit (nicht nachgesehen, welche Hosts Push braucht). |
| S-12 | **bestätigt (nachgestellt)** | `80_s12.sql`: Monteur Alfa mit einem unterschriebenen Schein, deaktiviert; Probelauf `person_loeschen('mitarbeiter', …, true)`: „aufbewahren“ = Urlaube, Materialanforderungen; im ganzen Bericht kommt kein Schein vor; `person_auskunft` führt `scheine_erstellt` mit 1. Endstand gelesen: Zweig „mitarbeiter“ (Zeilen 22–237 von 398) nennt `work_sheets`, `mahnungen`, `project_documents`, `lieferantenartikel`, `zeitfeld_definitionen`, `wartung_ausfuehrungen`, `quotes`, `auftragseingaenge`, `angebot_links` nicht; 17 Einträge unter „aufbewahren“. | Kein Einwand. „Als Ganzes neu schreiben“ ist nach Z-15 (Textersatz) der richtige Weg; der Vergleich „alle bisherigen Einträge unverändert“ gehört als eigene Prüfung hinein. |
| S-13 | **teilweise** | Kern nachgestellt mit echten Zeilen (`40_s13.sql`, `51_stichprobe_support.sql`), siehe Abschnitt 3. | Zwei Vorschläge lösen ihr Ziel nicht, einer verschlechtert — siehe Abschnitt 3. |

### 2a. Eigene Stichprobe „fremder Betrieb“ (`50_stichprobe.sql`)

Statisch am Endstand: 817 Funktionen in `public`/`app`, 579 mit Eigentümerrechten, **alle 579** mit
`search_path=""`; 0 Tabellen in `public` ohne Zeilenschutz; 0 Tabellenrechte für `anon`; 0 mal
TRUNCATE/TRIGGER/REFERENCES für `authenticated`. Von den 131 in den Migrationen ab `20261115…`
angelegten oder geänderten Funktionen in `public` sind 122 für Konten ausführbar (deckt sich mit dem Papier), für
`anon` nur `passwort_hilfe_anfragen` (gewollt). Die zehn neuen Tabellen: Zeilenschutz an, je eine
Leseregel über `app.lesebetrieb()`, `rechnungsversuche_ohne_beleg` ohne Regel.

40 Funktionen aus dieser Menge, jede mit **Kennungen des Betriebs Alfa** (Person, Artikel,
Baustelle, Schein, Rechnung, Angebot, Urlaubsantrag, Anforderung, Eingang) aufgerufen als
Administrator Beta, Monteur Beta und Plattformkonto ohne Freigabe; zur Kontrolle als Administrator
Alfa: `arbeitszeit_aendern`, `urlaubsanspruch_aendern`, `zeitsitzung_beenden_fuer`,
`zeitkonto_salden`, `zeitkonto_monate`, `zweiter_faktor_von`, `zweiter_faktor_zuruecksetzen`,
`austritt_folgen`, `artikel_verwendung`, `baustelle_verwendung`, `schein_verbrauch_vorschlag`,
`schein_einkaufspreise`, `scheine_verrechnet`, `schein_verrechnung`, `ausgegebenes_material`,
`ausgegebenes_material_gesamt`, `lager_frei`, `lager_liste`, `lager_eingang`,
`kunden_zusammenfuehren(_vorschau)`, `anforderung_abschliessen`, `einkauf_stornieren`,
`retoure_anlegen`, `materialdeckung`, `urlaub_entscheiden`, `person_auskunft_start`,
`passwort_anfrage_verwerfen`, `angebot_links_stand`, `angebot_annehmen_mit_ziel`,
`guthaben_umbuchen`, `eingang_ablehnen`, `eingang_zu_baustelle`, `einsatz_umplanen`,
`einsatz_entfernen`, `beleg_versand_vorbereiten`, `rechnung_ersetzen`, `artikel_auslaufen`,
`inventur_artikel_hinzufuegen`, `kontoauszug_verbuchen`; dazu aus den anderen Proben die vier
Listen, die drei Anforderungs-/Rückgabefunktionen, `retoure_rahmen`,
`kommissionsartikel_im_lager`, `baustelle_abschliessen`, die Wartungsfunktionen.

Ergebnis: jedes fremde Konto bekommt „gibt es nicht“ (P0002), 42501, eine leere Menge oder
„veraltet“. **Prüfsumme über alle 88 Tabellen mit `company_id` für den Betrieb Alfa vor und nach
den 120 fremden Aufrufen gleich**, ebenso die Anmeldekonten von Alfa. Bei 24 der 40 liefert die
Kontrolle als eigener Administrator ein Ergebnis oder eine fachliche Meldung nach der
Zugriffsprüfung (der fremde Aufruf scheitert also am Zugriff, nicht an meinen Angaben); bei den
übrigen 16 scheitern beide an den Angaben oder liefern beide leer — dort trägt nur die Prüfsumme.

### 2b. Gegenfälle zum Vorschlag `coalesce(app.betrieb(), app.supportbetrieb())`

Mit beiden Flicken eingespielt (vier Listen + `lager_frei`/`lager_knapp`), je alle sieben lesenden
Aufrufe (`20_gegenfaelle.sql`, `21_gegenfaelle2.sql`):

| Gegenfall | Ergebnis |
|---|---|
| Plattformkonto 2, Freigabe für Alfa offen, aber kein gemeldeter Zugriff | 42501 / 0 Zeilen |
| Plattformkonto mit `aal1` | 42501 / 0 Zeilen |
| Konto ohne Betrieb und ohne Plattformmarke im Token | 42501 / 0 Zeilen |
| Sitzung beendet (`session_id` mit abgelaufenem `not_after`) | 42501 / 0 Zeilen |
| Freigabe **widerrufen** (vom Administrator über die Regel) | 42501 / 0 Zeilen |
| Freigabe **abgelaufen** (`gilt_bis` in der Vergangenheit) | 42501 / 0 Zeilen |
| Plattformkonto nicht mehr in `platform_admins`, Marke noch im Token | 42501 / 0 Zeilen |
| Betrieb ruht (`betrieb_zustand.deaktiviert_am`) | 42501 / 0 Zeilen |
| Konto des Betriebs deaktiviert, altes Token | 42501 / 0 Zeilen |
| `anon` | `permission denied for function …` (Rechte bleiben bei `create or replace`) |
| Administrator und Monteur **Beta** | nur Beta, Prüfsumme unverändert |
| Monteur Alfa in `anforderungen_laufend` | weiter nur seine (1 von 2) |
| Jüngster gemeldeter Zugriff Beta (gültig), älterer Alfa | nur Beta |
| … Beta widerrufen, Alfa noch offen | fällt auf Alfa zurück (gültige Freigabe), nie Beta |
| Token mit Betrieb „beta“ **und** Plattformmarke, Einblick Alfa (kann es nicht geben) | Funktionen 42501 (der Betrieb des Tokens gewinnt, das Konto ist dort nicht aktiv) |
| Administrator Beta meldet sich selbst einen Zugriff auf die Freigabe von Alfa / legt eine Freigabe für Alfa an / ruft `support_notzugang('alfa')` | 42501 (Regel) / 42501 (Regel) / „Einen Notzugang öffnet nur die Plattform“ |
| Plattformkonto meldet Zugriff unter fremder `admin_uid` oder unter falschem Betrieb; verlängert die Freigabe oder stellt sie auf „mitarbeiten“ | 42501 / 42501 / 0 Zeilen geändert |

Die sechs Funktionen lesen nur Tabellen, deren Leseregel den Support schon kennt (`projects`,
`materials`, `material_orders`, `wartungen`, `lagerbestaende`, `einsatz_material`,
`einsatz_material_positionen`) — der Support sieht durch sie nichts, was er über die Tabelle nicht
schon sähe.

**Stufe „ansehen“ gegen schreibende Funktionen** (`30_schreiben.sql`, `31_ansehen_schreibt.sql`,
`51_stichprobe_support.sql`): nach 40 Aufrufen als Plattformkonto mit „ansehen“ ist die Prüfsumme
über den Betrieb unverändert; mit „mitarbeiten“ (Gegenprobe) ändert sie sich. Zeit, Urlaub,
zweiter Faktor, Auskunft, Rechnungen, Kontoauszug bleiben in **beiden** Stufen zu. **Aber:** bei
`anforderung_status_setzen`, `anforderung_loeschen`, `wartung_tag_berichtigen`,
`wartung_erledigt_eintragen`, `lager_inventur`, `lager_eingang` hält die Rollenprüfung der Funktion
„ansehen“ **nicht** auf — erst der Auslöser `…_kein_support_schreiben` an der Tabelle („Dieser
Supportzugang darf lesen und sonst nichts“). Grund: `app.hat_rolle`, `app.ist_fuehrung`,
`app.ist_spitze`, `app.ist_buch_oder_spitze` geben für ein Plattformkonto ohne „mitarbeiten“
**NULL** zurück (gemessen), und `if not (… or app.ist_fuehrung()) then raise` lässt NULL durch.
34 Tabellen in `public` haben diesen Auslöser nicht (u. a. `project_documents`, `mahnungen`,
`angebot_links`, `work_sheet_photos`, `time_entries`, `vacations`, `krankmeldungen`). Heute
schreibt dadurch nichts; für den Umbau ist es die eigentliche Gefahr (Abschnitt 4, Warnung 3).

## 3. Nicht bestätigt — im Einzelnen

### S-13 — teilweise

**Was das Papier sagt:** Übersicht der 122 Funktionen; drei weitere falsch für den Support
(`schein_verrechnung`, `retoure_rahmen`, `kommissionsartikel_im_lager`), drei Rückfälle für
„Mitarbeiten“ (`anforderung_aus_lager`, `anforderung_zurueckziehen`, `retoure_annehmen`, „mit
leeren Angaben nicht messbar“), der Rest „richtig“; Vorschlag je Funktion.

**Was stimmt (nachgestellt mit echten Zeilen):**
- `schein_verrechnung`: „ansehen“ 42501, „mitarbeiten“ Ergebnis; `scheine_unverrechnet_stand` geht
  in beiden Stufen.
- `retoure_rahmen`: „Nicht angemeldet“ in beiden Stufen; `kommissionsartikel_im_lager`: abgewiesen
  auch mit „mitarbeiten“.
- Die drei Rückfälle: mit „mitarbeiten“ je `{"ergebnis": "veraltet"}`, obwohl die Zeile da ist und
  der Administrator `geaendert`/`zurueckgezogen`/`angenommen` bekommt — damit **bestätigt
  (nachgestellt)**, nicht nur „nach Code“. Mit dem Vorschlag des Papiers gehen alle drei mit
  „mitarbeiten“ und bleiben mit „ansehen“ zu.
- `lager_frei`, `lager_knapp`: 0 Zeilen; Auftragseingänge mit „mitarbeiten“: „Eingänge bearbeitet
  nur das Büro“; Umplanen: „… geht im Einblick nicht“; Zeit/Urlaub/Konto/Rechnungen zu.

**Was nicht stimmt:**
1. **Vorschlag `schein_verrechnung` → `app.verrechnung_betrieb()` löst das Ziel nicht und
   verschlechtert.** Eingespielt: „ansehen“ bleibt abgewiesen (die Rollenprüfung danach,
   `ist_fuehrung or ist_buch_oder_spitze`, ist für „ansehen“ falsch). Und der **Projektleiter**
   des Betriebs, der heute `{"verrechnet": false, …}` bekommt, bekommt `42501 Ob ein Schein
   verrechnet ist, sieht nur, wer Rechnungen schreibt` — `app.verrechnung_betrieb()` kennt nur
   Buchhaltung, Spitze und Support. Das wäre ein Rückfall für eine Rolle des Betriebs. Richtig
   wäre: Betrieb `coalesce(app.arbeitsbetrieb(), app.lesebetrieb(), app.supportbetrieb())` und die
   Rollenprüfung um `app.support_liest(betrieb)` ergänzen; „bleibt gleich“: Projektleiter,
   Verwaltung, Monteur wie heute (je eigener Fall).
2. **Zeile „richtig“ für `baustelle_abschliessen` und `baustelle_abschluss_lage` ist falsch.** Mit
   einer echten Baustelle scheitern beide für den Support mit „Mitarbeiten“:
   `42501 Ausgegebenes Material sieht nur, wer Rechnungen schreibt`.
   `app.baustelle_abschluss_zaehlen` ruft für Buchhaltung/Spitze/Support
   `public.ausgegebenes_material(…)`, das den Betrieb nur aus dem Token nimmt. Das ist ein
   **vierter Rückfall für „Mitarbeiten“**, den die Messung mit leeren Angaben nicht sehen konnte.
   Die Methode des Papiers („gewertet ist nur, ob die Prüfung des Zugriffs abweist“) trägt die
   Spalte „richtig“ für schreibende Funktionen mit inneren Aufrufen nicht.
3. „‚ansehen‘: Lesendes geht“ gilt in der letzten Tabellenzeile nicht für `baustelle_verwendung`,
   `baustelle_abschluss_lage` und (aus derselben Familie) `artikel_verwendung`: alle drei weisen
   „ansehen“ über die Rolle ab. Vertretbar (Vorschau einer Handlung), aber die Zeile sagt es anders.
4. Das genannte Risiko („versehentlich `app.support_liest` → auch ‚ansehen‘ schriebe“) ist enger als
   die Lage: schon heute kommen sechs Funktionen mit „ansehen“ an ihrer Rollenprüfung vorbei
   (Abschnitt 2b); gehalten wird nur am Auslöser der Tabelle.

**Zu ändern im Papier:** Vorschlag zu `schein_verrechnung` ersetzen; Tabellenzeile
`baustelle_abschliessen`/`baustelle_abschluss_lage` auf „Rückfall für ‚mitarbeiten‘“ (Ursache
`ausgegebenes_material`); „drei Rückfälle“ → vier; die drei Anforderungs-Rückfälle als gemessen
führen; Risiko um die NULL-Rollenprüfung ergänzen. **Im Plan:** Abschnitt 4.

## 4. Zum Plan

**Abschnitt 3.6, Tabelle:** Kurztexte S-1 bis S-12 stimmen mit dem Papier überein. S-13: „drei
weitere falsch, drei Rückfälle“ → nach dieser Prüfung drei falsch, **vier** Rückfälle. Der Satz
„Kein Befund, bei dem ein Konto Daten eines anderen Betriebs lesen oder schreiben kann“ hält der
eigenen Stichprobe stand.

**Paket 1, Schritt 5 — so nicht bauen:**
1. „`schein_verrechnung`, `retoure_rahmen`, `kommissionsartikel_im_lager` nehmen
   `coalesce(app.betrieb(), app.supportbetrieb())`“ ist **nicht** der Vorschlag des Papiers und
   **bewirkt nichts**: eingespielt bleibt der Support in allen drei abgewiesen, in beiden Stufen
   (`40_s13_*.out`, Spalte „PLAN: gleich“) — die Prüfungen dahinter (`app.betriebsmitglied`, Rolle)
   schließen ihn weiter aus. Die beiden letzten gehören außerdem zum **Schreiben**
   (`kommissionsartikel_im_lager` ändert `materials`; `retoure_rahmen` ist das Fenster vor
   `retoure_anlegen`) und brauchen `app.arbeitsbetrieb()`/`app.support_schreibt`, nicht den
   lesenden `app.supportbetrieb()`. Der Schritt muss je Funktion sagen, was das Papier sagt — für
   `schein_verrechnung` die Berichtigung aus Abschnitt 3.
2. `lager_frei` und `lager_knapp` fehlen. Ohne sie zeigt das Lager dem Support nach dem Umbau „0
   Artikel“ statt einer Fehlermeldung.
3. **Warnung zur Sicherheit:** In dieser Migration darf keine Funktion, die schreibt, den Betrieb
   über `app.supportbetrieb()` bekommen und sich dann auf `if not app.ist_fuehrung()` o. ä.
   verlassen (NULL für „ansehen“). Jede Rollenprüfung in den angefassten Funktionen als
   `… is not true` oder mit `coalesce(…, false)` schreiben (Muster in `baustelle_abschliessen`,
   `artikel_auslaufen`). Als „bleibt gleich“ gehört hinein: **„mit ‚ansehen‘ ändert kein Aufruf
   eine Zeile des Betriebs“** — geprüft mit echten Zeilen je angefasster Funktion, nicht mit
   leeren Angaben.
4. `baustelle_abschliessen`/`baustelle_abschluss_lage` im Supportzugang fehlen (vierter Rückfall).
   **Schritt 8** desselben Pakets (A-1, P-10) schreibt genau `app.baustelle_abschluss_zaehlen` neu
   — dort den Aufruf von `ausgegebenes_material` mitnehmen, sonst wird die Funktion zweimal
   angefasst.

**Paket 1, Schritt 4 (Wächter):** „darf nicht 42501 antworten“ fängt die stillen Fälle nicht
(leere Liste, 0 Zeilen). Kriterium: mit angelegten Zeilen dasselbe Ergebnis wie der Administrator.
Gegenprobe wie beschrieben (vier Funktionen heute rot) stimmt; dazu wären `lager_frei`/`lager_knapp`
mit dem strengeren Kriterium heute ebenfalls rot.

**Paket 3:** S-2 „`app.push_anmeldungen_entfernen`, Weg wie K2“ leert auch das eigene Gerät — das
Papier will eine eigene Funktion mit Ausnahme. S-6 „Hörer am Anmeldezustand“ ist nicht der
Vorschlag (Minutentakt für alle + Nachsehen nach abgewiesenem Aufruf). S-5 „dieselbe Sicherung“
ist nicht der Vorschlag (kein Entwurf, sondern Meldung mit Inhalt/Grund und vorbelegter Warenkorb).

**Paket 22:** S-3 „im Protokoll“ statt `betrieb_zustand.konten_offen` (siehe S-3). Sonst passend.

**Paket 23:** S-9 auf `--ignore-scripts` verkürzt; `npm ci` kann im Auftrag `einspielen` ganz weg,
und festgelegte Actions/Umgebung/Wächter fehlen im Text.

**Entscheidung E-S** ist falsch gefragt („sollen Scheine und Auftragseingänge im Einblick sichtbar
sein? ‚Nur ansehen‘: ja“): **sichtbar sind beide schon** (`work_sheets_lesen`,
`auftragseingaenge_lesen` kennen `app.supportbetrieb()`). Offen ist laut Papier, ob der Support mit
**„Mitarbeiten“ Scheine schreiben und Eingänge bearbeiten** darf (`schein_speichern` u. a. und
`eingang_*` weisen ihn ab, die Tabellenregel `work_sheets_anlegen` ließe ihn zu) — und ob „Umplanen
geht im Einblick nicht“ in die Grenzen-Übersicht kommt.

**Reihenfolge und Voraussetzungen:** Pakete 1, 3, 22, 23 passen. Kein Vorschlag entfernt eine
bestehende Funktion; verschlechtern würde nur der Vorschlag zu `schein_verrechnung` (Projektleiter).

## 5. Geklärte Verdachtsfälle

- **V-2 — bestätigt (nachgestellt, an der Regel):** `scheinfotos_anlegen` prüft den Stand des
  Scheins nicht. `71_v2.sql`: am **unterschriebenen** Schein legt ein Kollege (Buchhaltung) eine
  Datei unter freiem Namen an (1); Überschreiben und Löschen einer vorhandenen Datei 0 Zeilen. Der
  Dateiname ist `<hash>.jpg` (`scheinFotos.ts:49`); `Fotostreifen.tsx:71` zeigt den gespeicherten
  Hash, ein Vergleich der geladenen Bytes mit dem Hash ist mir im Code nicht begegnet. Gehört zu
  S-7 dazu: die Regel fürs Anlegen braucht zusätzlich „Schein offen oder noch nicht da“.
- **V-3 — am Code:** `uid_pruefung_vorbereiten` (Endstand) zählt und begrenzt nichts; in
  `uid-pruefen/index.ts` nur die Zeitgrenze für VIES. Die Begrenzung fehlt.
- **V-6 — geklärt:** `lagerKnapp` (`materials.ts:477`) hat im Client keinen Aufrufer mehr (die
  Startseite nimmt `lager_liste` mit Filter „knapp“, `laden.ts:498–512`). `lager_frei` wird
  weiter gerufen: `OrderView.tsx:153`, `EinsatzFormular.tsx`, und **innerhalb** von `lager_liste`
  und `lager_knapp` — daher die Folge unter S-1.
- **Abschnitt 4 des Papiers, `passwort_hilfe_anfragen`:** die 200 je Stunde zählen ohne
  `company_id` über alle Betriebe (Endstand, Zeile 15–16) — stimmt.
- V-1, V-4, V-5, V-7, V-8: nicht angefasst.

## 6. Nicht geprüft

- Alles, was Anmeldedienst, Speicher-Schnittstelle, Edge-Runtime, Realtime oder FCM braucht: dass
  ein Passwortwechsel die anderen Sitzungen beendet (S-2), die Schleife über die Konten in
  `betrieb-loeschen` und ihre Zeitgrenze (S-3, V-1), die Function `startseite-forderungen` selbst
  (S-1, nur ihre Abfragen gegen die Regeln), `push-melden`.
- Die Zählung des Papiers „50 / 16 / 16 / 40“ nach Quelle des Betriebs und die 34 Fälle der vier
  bestehenden Prüfdateien: nicht einzeln nachgezählt (122 ausführbare Funktionen seit dem 15.11.
  stimmen).
- Die Zeilen „richtig“ der S-13-Tabelle habe ich an 40 Funktionen mit echten Zeilen nachgestellt,
  nicht an allen 122; `inventur_*`, `katalog_*`, `kunden_einspielen`, `schein_speichern`,
  `rechnung_anlegen`/`_ausstellen`, `nachricht_meldung_*` ohne eigene Probe.
- Abschnitte 4 (Grenzen), 5 (Ideen) und 6 (✔-Punkte) des Papiers nur dort, wo sie einen Befund
  stützen (K7b-Regeln, K11, `passwort_hilfe_anfragen`).
- Keine Testdatei gelaufen. Einmal versehentlich `git status --short` (nur lesend) aufgerufen;
  nichts geändert.
