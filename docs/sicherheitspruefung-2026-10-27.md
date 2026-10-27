# Sicherheitsprüfung vor dem öffentlichen Start (27.10.2026)

Arbeitsauftrag aus dem Testbericht Runde 6, Abschnitt 8.4. Geprüft wurde der
eigene Code und der örtliche Supabase-Stapel mit Testdaten — nicht die
Produktion, keine echten Kundendaten. Die Prüfung ersetzt den externen
Sicherheitstest (Abschnitt 8.3) nicht, sie bereitet ihn vor: was sie findet,
ist vorher behoben. Was offen bleibt, steht am Ende mit Grund.

## 1. Bestand

| Objekt | Anzahl | Befund |
|---|---|---|
| Tabellen in `public` | 63 | Zeilenschutz an jeder (0 ohne RLS) |
| Zeilenschutz-Regeln | 125 | eine mit `using (true)`: `basiszinssaetze_lesen` — die Basiszinssätze der Nationalbank, öffentliche Zahlen ohne Betriebsbezug, für jede Anmeldung lesbar (Absicht) |
| Sichten | 1 | `monthly_stats`, läuft mit den Rechten des Lesers (`security_invoker`) |
| Funktionen in `public` und `app` | 414 | davon 211 mit den Rechten ihres Eigentümers (`security definer`) — jede mit festem Suchpfad |
| Auslöser | 261 | laufen nur als Auslöser; Postgres lässt sie nicht direkt aufrufen |
| Dateispeicher | 4 | alle privat; `scheinfotos` 2 MB, `freistellungsnachweise` 10 MB, `baustellendokumente` 25 MB, je mit Dateitypen; `ausleitung` schreibt nur der Dienst (keine Regel für Konten) |
| Speicher-Regeln | 10 | Betrieb im Pfad, Rolle und „nur fürs Büro“ an der Datei selbst (`baustellenDokumente.test.ts`) |
| Edge Functions | 10 | `betrieb-anlegen`, `betrieb-loeschen`, `daten-ausleitung`, `kalender`, `konto-umstellen`, `mitarbeiter-anlegen`, `notzugang-passwort`, `passwort-vergeben`, `push-melden`, `uid-pruefen` — jede prüft das Token beim Anmeldedienst und die Rolle selbst; `kalender` ist ohne Anmeldung erreichbar und verlangt ein eigenes, widerrufbares Abo-Zeichen |

## 2. Feste Prüfläufe (laufen bei jeder Migration mit)

- `tests/supabase/mandantenTrennung.test.ts` — **führt** den Zeilenschutz aus, gegen alles, was die Datenbank hat, auch künftige Tabellen:
  - Betrieb B bekommt Zeilen in **jeder** Tabelle mit `company_id`. Jede Rolle von Betrieb A (Mitarbeiter, Verwaltung, Buchhaltung, Projektleitung, Geschäftsführung, Administrator, je mit zweitem Faktor) und der Support mit Einblick nur in A versuchen, sie zu lesen, zu ändern, zu löschen und mit B als Betrieb anzulegen — erwartet und gemessen: nichts.
  - **Rollen im eigenen Betrieb:** welche Tabellen jede Rolle an Zeilen eines Kollegen bzw. des Betriebs liest, Tabelle für Tabelle festgeschrieben. Eine neue Tabelle oder geänderte Regel fällt auf und muss bewusst eingetragen werden.
  - Keine Sicht umgeht den Zeilenschutz; jede Funktion mit Eigentümerrechten hat einen festen Suchpfad, prüft den Aufrufer selbst und ist ohne Anmeldung gesperrt (mit zwei benannten Ausnahmen, siehe 3.2).
  - Jeder Speicher privat und begrenzt; Dateien eines anderen Betriebs unsichtbar.
  - Gegenproben im selben Lauf: eine offene Regel, eine Sicht ohne Leserrechte und eine neue Funktion ohne Prüfung werden gefunden.
- `tests/supabase/sitzungEndetSofort.test.ts`, `tests/supabase/abmeldenGeraete.test.ts` — Sitzungen (3.3).
- `tests/csp/rundgang.spec.ts` (`npm run pruefen:inhaltsregel`, im Auftrag „Durchklick“) — jede Seite jeder Rolle unter der durchgesetzten Inhaltsregel (3.4).
- Bestehend und weiter grün: `zweiFaktor*.test.ts` (Pflicht über die Schnittstelle nicht zu umgehen, `aal2`), `ansprueche.test.ts` und `anmeldung.test.ts` (deaktiviert = sofort aus), `einkaufGeschuetzt.test.ts`, `freigabenLagerProjektleitung.test.ts`, `baustellenDokumente.test.ts`, `regeln.test.ts`, `leseregelnGleichwertig.test.ts`, `schema.test.ts`.

## 3. Befunde und Behebung

### 3.1 Einkaufskonditionen für Rollen ohne Recht lesbar — mittel

- **Nachweis:** Rollentest „Rollen im eigenen Betrieb“, rot vor der Behebung. Über die Schnittstelle lasen
  - die Verwaltung **ohne** Freigabe „Einkaufspreise sehen“ und die Projektleitung die Preislisten der Großhändler (`material_prices`: Listenpreis, Rabatt, Einkaufspreis) — die Regel zum Schreiben (FOR ALL) gab auch das Lesen frei;
  - **jedes** Konto, auch der Monteur, die Rabattsätze (`rabattsaetze`) und die eingelesenen Katalogdateien (`datanorm_zeilen`, bei Preiskennzeichen „netto“ der Einkaufspreis selbst).
  Die Oberfläche zeigte nichts davon — gesperrt war es nicht.
- **Behebung:** `20261027600100_einkaufskonditionen_nur_mit_recht.sql`. Lesen, wer Einkaufspreise sehen darf; schreiben, wer den Katalog einspielen darf; Katalogdateien nur, wer einspielt. Die Einkaufsliste bekommt den vorgeschlagenen Großhändler über `lieferant_vorschlag` — ohne Preis.
- **Tests:** `einkaufGeschuetzt.test.ts` (Preislisten, Rabattsätze, Freigabe, Vorschlag), Rollentest. Gegenprobe ausgeführt: mit den alten Regeln rot.

### 3.2 Fünf Funktionen ohne Anmeldung aufrufbar — gering

- **Nachweis:** `mandantenTrennung.test.ts`, „sind für nicht angemeldete Aufrufer gesperrt“, rot vor der Behebung: `betrieb_auszug`, `schein_vorbereiten`, `support_freigaben_offen`, `support_notzugang`, `urlaub_entscheiden`. Jede prüft die Anmeldung im Rumpf und bricht ohne sie ab — offen lag nichts, aber die Sperre gehört an die Tür (CLAUDE.md: `revoke … from public, anon`).
- **Behebung:** `20261027600000_rpc_ohne_anmeldung_sperren.sql`.
- **Benannte Ausnahmen:** `fehler_vor_anmeldung_eintragen` (die Anmeldemaske meldet Abstürze vor der Anmeldung; schreibt nur, gibt nichts zurück, gedrosselt) und die Helfer der Zeilenschutz-Regeln (`app.rolle`, `app.ist_plattform`, `app.support_*`, `app.aktiv`) — Regeln werten sie auch für nicht angemeldete Anfragen aus; sie sagen dann „nein“ (eigene Prüfung).
- **Gegenprobe:** Freigabe an `anon` zurückgegeben → rot.

### 3.3 Abmelden: ein Gerät beendete alle, ein anderes las noch eine Stunde — mittel

- **Nachweis:** `sitzungEndetSofort.test.ts`, rot vor der Behebung. „Abmelden“ beendete beim Anmeldedienst ALLE Sitzungen des Kontos (supabase-js meldet ohne Angabe überall ab): wer sich am geteilten Baustellen-Tablet abmeldete, beendete nebenbei sein Telefon. Gleichzeitig nahm die Datenbank das Token des anderen Geräts bis zu seinem Ablauf weiter an — bis zu einer Stunde.
- **Behebung:**
  - `20261027600200_sitzung_endet_sofort.sql`: `app.aktiv` und `app.ist_plattform` fragen, ob die Sitzung des Tokens noch lebt (`app.sitzung_lebt`). Beendet heißt sofort aus — an derselben Stelle, an der das Deaktivieren schon greift.
  - „Abmelden“ meldet nur dieses Gerät ab; „Mein Konto › Auf allen Geräten abmelden“ (und auf der Plattformseite) jedes, sofort.
  - Ein Gerät, dessen Anmeldung anderswo beendet wurde, fragt beim Zurückkommen in den Vordergrund nach und zeigt die Anmeldemaske mit dem Grund — statt leerer Listen. Ohne Netz bleibt es angemeldet.
- **Tests:** `sitzungEndetSofort.test.ts` (5), `abmeldenGeraete.test.ts` (5), `AuthAnderswoAbgemeldet.test.tsx` (5), `MeinKonto.test.tsx` (+2). Gegenproben ausgeführt.

### 3.4 Inhaltsregel (CSP) nur meldend — mittel (Hinweis 13)

- **Vorher:** die strenge Regel nur als `Content-Security-Policy-Report-Only`; durchgesetzt nur `frame-ancestors`. Das Fehlerprotokoll hatte beim Durchgang durch alle Seiten keinen Verstoß.
- **Behebung:** `firebase.json` setzt die Regel durch: `default-src 'self'`, Skripte nur von der eigenen Herkunft (und `www.gstatic.com` für den Push-Dienst im Service Worker), kein `eval`, keine eingebetteten Skripte, kein eingeschleuster Stilblock (`style-src-elem 'self'`), Verbindungen nur zur eigenen Supabase-Instanz und zu Google (Push), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
- **`style-src 'unsafe-inline'` abgelöst, soweit es geht:** Stilblöcke sind gesperrt; erlaubt bleiben Stil-**Attribute** (`style-src-attr 'unsafe-inline'`). Grund: React setzt Breiten, Farben und Diagrammmaße als `style={…}`; ein Attribut kann kein Skript ausführen, nur das eigene Element gestalten.
- **Tests:** `sicherheitsKopfzeilen.test.ts` (10, Gegenprobe gegen die alte Fassung: 5 rot); Rundgang `tests/csp/rundgang.spec.ts`: jede Seite jeder Rolle (Monteur, Buchhaltung, Geschäftsführung) im fertigen Bau mit den Kopfzeilen der Auslieferung, am Schreibtisch und am Telefon (Chromium) und am iPhone (WebKit, in der CI); Gegenprobe im selben Lauf: ein eingeschleustes Skript und ein Stilblock werden gesperrt und gemeldet.

### 3.5 Bibliotheken mit bekannten Lücken — hoch (eine ausgeliefert)

- **Nachweis:** `npm audit`: `dompurify` ≤ 3.4.16 (kritisch; wird von jsPDF mit ausgeliefert), `undici` < 6.29.1 und `@grpc/grpc-js` < 1.13.6 (nur unter Node, nicht im Browser-Bau), dazu Entwicklungswerkzeuge (`vite`, `vitest`, `source-map-js`, `postcss-selector-parser`).
- **Behebung:** `dompurify` 3.4.17, `undici` 6.29.1, `@grpc/grpc-js` 1.13.7 (über `overrides`), `vite` 7.3.7, `vitest` 4.1.12, die übrigen auf die bereinigten Fassungen. `npm audit` danach: 0 — mit und ohne Entwicklungswerkzeuge.

### 3.6 Geprüft, ohne Befund

- **Dienstschlüssel im Bau:** die Ausgabe von `npm run build` enthält nur den öffentlichen Schlüssel (`role: anon`), keinen `service_role`.
- **Eingeschleuster Code in der Oberfläche:** kein `dangerouslySetInnerHTML`, kein `innerHTML`, kein `eval` im Code; React maskiert jeden Text. Links aus Daten tragen immer ihr Schema (`tel:`, `mailto:`, `https://…maps`).
- **PDF:** jsPDF schreibt Text, kein HTML. **E-Rechnung:** jedes Feld XML-maskiert (`ebinterface.ts`, `esc`). **CSV:** jede Zelle durch `csvZelle` — Zellen, die mit `=`, `+`, `-`, `@`, Tab oder Wagenrücklauf beginnen, werden entschärft.
- **Zwei-Faktor-Pflicht:** über die Schnittstelle nicht zu umgehen — mit Passwort allein (`aal1`) liefert die Datenbank keine Zeile, die Edge Functions weisen ab (`zweiFaktor*.test.ts`).
- **Deaktivierte Konten:** Anmeldung abgewiesen, laufende Sitzung sofort ohne Daten, Token nicht erneuerbar (`ansprueche.test.ts`).
- **Supportzugang und Notzugang:** nur mit offener Freigabe des Betriebs bzw. mit Grund und Rückruf; jeder Zugriff im Protokoll, das der Betrieb liest (`supportArbeitetMit.test.ts`, `zweiFaktor.test.ts`); im Mandantentest liest der Support nichts außerhalb seiner Freigabe.
- **Signierte Links:** Pläne 60 Sekunden, Scheinfotos eine Stunde, Nachweise 60 Sekunden.

## 4. Offen — mit Grund

| Punkt | Grund | Bei wem |
|---|---|---|
| Schutz gegen bekannte geleakte Passwörter, Passwortregeln, Begrenzung der Anmeldeversuche und der Zurücksetzen-Mails, Sitzungsdauer im gehosteten Projekt | Einstellungen des gehosteten Supabase-Projekts (Dashboard, teils Tarif Pro); `supabase/config.toml` erreicht das Projekt nicht. Die empfohlenen Werte stehen in `docs/DEPLOYMENT.md`, Schritt 1 | Betrieb bzw. Zugang zum gehosteten Projekt |
| Zwei-Faktor im Pilotbetrieb einschalten (8.2.3) | Entscheidung und Handgriff der Leitung unter „Mein Konto“ | Betrieb |
| Wertebereiche einzelner Zahlenfelder (Mengen, Stunden, Summen) in der Datenbank | Je Feld eine fachliche Frage — negative Werte haben teils Bedeutung (Gutschrift, Lagerabgang, Korrektur); Rechnungssummen rechnen die Funktionen des Servers. Eine pauschale Sperre träfe Altdaten und richtige Buchungen | externer Test, danach je Feld |
| Angriffsversuche (Brute Force, Last, Umgehung der Ratenbegrenzung, Sitzungsdiebstahl über fremde Geräte) | gehören nicht in einen Funktionstest; brauchen eine Freigabe und das gehostete Projekt | externer Sicherheitstest (8.3) |
| Safari am echten iPhone (Push, Kamera, Installation) unter der durchgesetzten Regel | WebKit läuft im Rundgang der CI; das echte Gerät mit Push und Kamera ist der Gerätedurchgang | Gerätedurchgang |
