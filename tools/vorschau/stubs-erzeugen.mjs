/**
 * Erzeugt fuer jedes Modul in `src/lib/db/` ein Gegenstueck mit denselben
 * Exporten, das Beispieldaten liefert statt eine Datenbank zu fragen.
 *
 * ERZEUGT UND NICHT EINGECHECKT: Bekommt die Datenschicht eine Funktion dazu,
 * fehlt sie sonst im Stub — und die Vorschau bricht mit „does not provide an
 * export named …", und zwar erst beim Oeffnen der betroffenen Ansicht.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = join(hier, '..', '..');
// Ein anderes Ziel nur für die Prüfung (vorschauErsatz.test.ts) — die laufende Vorschau bleibt unberührt.
const ziel = process.env.VORSCHAU_ZIEL ?? join(hier, 'db');
mkdirSync(ziel, { recursive: true });

/** Welche Beispieldaten ein Modul zurueckgeben soll. `*` gilt fuer alles Uebrige. */
const DATEN = {
  plattform: {
    plattformBetriebe: 'D.plattformBetriebe', geloeschteBetriebe: 'D.plattformGeloescht',
    betriebProtokoll: 'D.plattformProtokoll', leitungskontenImNotzugang: 'D.plattformKonten', leitungMitZweitemFaktor: 'D.plattformKonten',
    betriebAnlegenMitAnmeldung: "{ companyId: 'vorschau-neu', passwortLink: 'https://beispiel.invalid/nur-entwurf', hinweis: 'Vorschau: Es wurde kein Betrieb angelegt.' }",
    betriebUebergabe: "{ zeilen: 180, dateien: 12, datenLink: 'https://beispiel.invalid/daten', datenLinks: ['https://beispiel.invalid/teil-1', 'https://beispiel.invalid/teil-2'], dateienLink: 'https://beispiel.invalid/dateien', gueltigBis: '2026-10-29T10:00:00Z' }",
    notzugangPasswort: "'DEMO-KEIN-PASSWORT'",
  },
  support: { offeneFreigaben: 'D.plattformFreigaben' },
  fehlerprotokoll: { plattformFehler: 'D.plattformFehler' },
  basiszins: { listBasiszinssaetze: '[]' },
  // Rechtstexte (E45): die öffentlichen Seiten und der Hinweis in der App brauchen eine Antwort, die Plattform eine leere Liste.
  rechtstexte: { rechtstexteAktuell: 'D.rechtstexte', rechtstextVerlauf: '[]', verarbeiterAenderungen: '[]' },
  users: { listUsers: 'D.benutzer', getUserByUid: 'D.benutzer[0]' },
  // Buchungstage je Person (Start, „Die Mannschaft“): eine Liste; als NOOP stand „Nicht geladen“ (14.11.2026).
  // Die eigenen Buchungen sind im gewachsenen Bestand weiter die der Beispiele (L11): die Attrappe kennt die Person nicht.
  timeEntries: { '*': 'D.zeiten', listOwnEntriesSince: 'D.zeitenEigene', listOwnEntriesInRange: 'D.zeitenEigene', subscribeOwnEntriesInRange: 'D.zeitenEigene', arbeitszeitVorlauf: '[]', listUrlaubstage: '[]', beobachteUrlaubstage: '[]', stundenDerBaustellen: '[]', buchungstage: '[]' },
  // Auftragseingang: eine Seite und die Zählung — als NOOP stand dort nur ein Ladefehler (14.11.2026).
  auftragseingaenge: { listEingaenge: '{ zeilen: [], weiter: null }', zaehleOffeneEingaenge: '{ offen: 0, dringend: 0, notfall: 0 }' },
  projects: { '*': 'D.baustellen' },
  customers: {
    listCustomers: 'D.kunden', listCustomersByIds: 'D.kunden', searchCustomers: 'D.kunden',
    kundenNachNamen: 'D.kunden',
    listProjectsForCustomer: 'D.baustellen', listUnlinkedProjectsByName: '[]',
    listUidPruefungen: 'D.uidPruefungen',
    // Die Segmente „Ohne Kundenart“ und „Anschrift prüfen“ (K4, 13.10.2026): ohne Liste stürzte die Ansicht ab.
    kundenOhneKundenart: 'D.kunden.filter((k) => !k.kundenart)',
    kundenAdressePruefen: 'D.kunden.filter((k) => k.adressePruefen)',
  },
  company: { getCompany: 'D.firma', auszug: 'D.firma' },
  // Änderungsprotokoll der Zeitbuchungen: zwei Einträge, damit „ausblenden“ zu sehen ist (14.11.2026).
  zeitbuchungVerlauf: { listVerlaufZeitraum: 'D.zeitVerlauf', listVerlaufEintrag: 'D.zeitVerlauf' },
  // Bestellvorschläge über der Einkaufsliste: eine Liste — als NOOP stürzte „Einkauf“ ab (14.11.2026).
  materialdeckung: { bestellvorschlaege: '[]' },
  // Firmendaten eines Belegs (Ausstellerstand): die heutigen — als NOOP brach jedes Beleg-PDF mit „konnte nicht erzeugt werden“ ab (14.11.2026).
  aussteller: { belegFirma: 'D.firma', ausstellerStaende: 'new Map()' },
  materialOrders: {
    '*': 'D.bestellungen',
    // Löschen mit Gegenbuchung (09.11.2026): ohne Antwort stand „gibt es so nicht mehr“ und ein gesperrter Knopf.
    anforderungLoeschenPruefen: "{ art: 'moeglich', gegenbuchung: [], erwartet: [] }",
    anforderungLoeschen: "{ art: 'geloescht', gegenbuchung: [] }",
    // Abgeholtes am Schein (E89): eine Liste; als NOOP stürzte das Scheinformular ab (13.11.2026).
    eigeneAbgeholt: '[]',
    // Die Nachkalkulation rechnet mit dem ausgegebenen Material je Baustelle (eine Map) — als NOOP stand ein Ladefehler.
    ausgegebenesMaterialGesamt: 'new Map()',
  },
  /*
    Die Nummernsuche (M03a) liefert eine Map je Artikel; als Liste geraten
    brach das Lager beim Tippen ab (`treffer.keys`, 09.11.2026).
  */
  // Lagerbewegungen sind keine Artikel: mit `*` stand „undefined NaN Stk“ im Artikelfenster (13.11.2026).
  materials: { '*': 'D.materialien', nummernTreffer: 'new Map()', listLagerbewegungen: '[]', katalogNachIds: 'D.materialien', katalogNachNamen: 'D.materialien' },
  // Kennzeichen-Vorschläge der Fahrzeuge: eine Liste; als NOOP brach /settings/fahrzeuge ab (13.11.2026).
  lagerorte: { kennzeichenAusBuchungen: '[]' },
  // Die Zähllisten der Inventur (F14): eine leere Liste — der Reiter „Inventur“ zeigt dann „Keine offene Zählliste“.
  inventur: { inventurListen: '[]' },
  /*
    Der Arbeitstag (B7, 15.11.2026): ein gesendeter Schritt gilt als vorgemerkt —
    sonst holte die Karte gleich danach den leeren Stand und stand wieder auf
    „bereit“. So lässt sich Start, Pause und Stopp in der Vorschau zeigen
    (mit `?module=zeiterfassung.timer`).
  */
  zeitsitzungen: { timerSenden: "'queued'" },
  // Korrekturanträge (M06): eine Liste; als NOOP blieb die Zeiterfassung mit einer Fehlerseite stehen (09.11.2026).
  zeitkorrekturen: { zeitkorrekturenLaden: '[]' },
  // Der Stand des Baustellen-Threads (E64) ist ein Objekt; als NOOP stürzte die Baustellenakte ab (09.11.2026).
  nachrichten: {
    baustelleStand: '{ kanal: null, anzahl: 0, zuletzt: null, ungelesen: 0, folgt: false }',
    // Ein Posteingang und ein Gespräch zum Ansehen (09.11.2026); vorher stand dort nur „konnte nicht geladen werden“.
    postfach: '{ zeilen: D.postfach, weiter: null }',
    kanalKopf: 'D.chatKopf',
    verlauf: '{ nachrichten: D.chatVerlauf, weiter: null }',
    wartendeNachrichten: '[]',
    ungeleseneZahl: '2',
    hatGespraeche: 'true',
    meldungenOffen: '0',
    anhangAdressen: 'new Map()',
  },
  // „Zeitraum zusammenstellen“ fragt die Schlussrechnungen ohne Abzug mit; ohne Liste brach die Seite ab (K4, 17.10.2026).
  // Mahnungen sind keine Rechnungen: mit `*` standen drei Zeilen „Mahnung vom “ ohne Datum im Fenster (14.11.2026).
  invoices: { '*': 'D.rechnungen', schlussrechnungenOhneAbzug: '[]', listMahnungenZurRechnung: '[]', listMahnungenInRange: '[]' },
  /*
    Der Papierkorb (M01d) zählt und listet eigens: mit `*` wäre jede Zahl eine
    Liste, und die Seite stünde ohne Inhalt da. Leer, wie in einem Betrieb,
    der noch nichts verworfen hat.
  */
  workSheets: {
    '*': 'D.scheine', getWorkSheet: 'D.scheine[0]',
    listVerworfeneScheine: '[]', listAbgelaufeneScheine: '[]', zaehleVerworfeneScheine: '0',
    // Vorgemerkte Scheine ohne Netz (§46): leer; als NOOP stürzte die Scheinliste ab (09.11.2026).
    wartendeScheine: '[]',
    // „Neu eingegangen“ (V9): eine Liste; als NOOP stand in der Scheinliste ein Ladefehler.
    scheineNeu: '[]',
  },
  vacations: {
    listOwnVacations: 'D.urlaube',
    listOpenVacations: 'D.urlaube.filter((v) => v.status === "Beantragt")',
    listApprovedVacationsInRange: 'D.urlaube',
    listAbwesendInRange: 'D.abwesend',
  },
  // Runde 4: Termine im Wochenplan, Monat und Tag planen.
  termine: { listTermineImZeitraum: 'D.termine', listTermineDerBaustelle: 'D.termine', listTermineDesKunden: 'D.termine' },
  // Die Einsätze einer Baustelle sind geteilt (V10, 13.11.2026): als NOOP stürzte die Baustellenakte ab.
  // L9: die Markierungen im Kalender kommen als Zählung je Tag (Map), nicht als Liste.
  assignments: { '*': 'D.einsaetze', einsaetzeDerBaustelle: '{ kommend: [], vorher: [] }', beobachteEinsatzTage: 'new Map<string, number>()' },
  einsatzMaterial: { '*': 'D.ruestlisten', getEinsatzMaterial: 'D.ruestlisten[0]' },
  quotes: {
    '*': 'D.angebote', getQuote: 'D.angebote[0]', acceptQuote: "'B-2026-0042'",
    listVerworfeneAngebote: '[]', zaehleVerworfeneAngebote: '0', deleteAbgelaufeneAngebote: '0',
    /*
      A6 (Welle 2): die Liste „Offen“ zählt aus der Datenbank. Mit `*` kam die
      Liste selbst als Zahl zurück — der Leerzustand „Dein erstes Angebot.“
      erschien nie (Linkprüfung `premium.spec.ts`).
    */
    zaehleQuotes: 'D.angebote.length',
    zaehleOffeneQuotes: "D.angebote.filter((q) => q.status === 'Entwurf' || q.status === 'Versendet').length",
  },
  // Die Ausführungen sind keine Anlagen: mit `*` bekam der Verlauf Anlagen ohne `am` und brach ab (K4, 13.10.2026).
  wartungen: { '*': 'D.wartungen', wartungEinplanen: "'B-2026-0042'", listAusfuehrungen: '[]' },
  offenePosten: { ladeOffenePosten: '{ urlaub: 1, anforderungen: 2, mahnungen: 1 }' },
  laeufe: { ladeLauf: 'null' },
  monatsbilanzen: { bilanzMarker: 'null' },
  // Monatsabschluss (Z6): eine leere Liste — als NOOP blieben Zeiterfassung und Mitarbeiterübersicht weiß (15.11.2026).
  zeitkonto: { listMonatsabschluesse: '[]' },
  // Freie Zeitfelder: ein leerer Feldsatz statt `undefined` (React Query verweigert `undefined`).
  zeitfelder: { feldsatzLaden: '{ fassung: null, definitionen: [] }' },
  // Vorgemerkte Buchungen ohne Netz (Z4): keine — als NOOP stürzte „Noch nicht gesendet“ ab (15.11.2026).
  wartendeZeiten: { wartendeZeitbuchungen: '[]' },
};

/** Was sich nicht aus dem Namen ableiten laesst. */
const FEST = {
  /*
    Z6 (Welle 2): zwei reine Rechnungen über den Verlauf der Monatsabschlüsse.
    Als NOOP lieferten sie ein Versprechen statt einer Map — die
    Mitarbeiterübersicht stürzte in der Vorschau ab (Linkprüfung).
  */
  zeitkonto:
    'export const abschlussStand = (verlauf: readonly { monat: string; am: string }[]) => {\n' +
    '  const stand = new Map();\n' +
    '  for (const e of [...verlauf].sort((a, b) => (a.am < b.am ? 1 : a.am > b.am ? -1 : 0))) if (!stand.has(e.monat)) stand.set(e.monat, e);\n' +
    '  return stand;\n' +
    '};\n' +
    'export const abgeschlosseneMonate = (verlauf: readonly { monat: string; am: string; aktion: string }[], an: boolean) => {\n' +
    "  return an ? new Set([...abschlussStand(verlauf).values()].filter((e) => e.aktion === 'abgeschlossen').map((e) => e.monat)) : new Set();\n" +
    '};\n',
  benutzerVorgaben:
    'export const DEFAULT_WEEKLY_HOURS = 38.5;\n' +
    'export const DEFAULT_VACATION_DAYS = 25;\n' +
    'export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];\n',
  meldungsvorgaben: 'export const PREFS_DEFAULTS = {} as never;\n',
  // `lagerFrei` liefert eine Map je Artikel — ein Feld hätte die Startseite als „nicht geladen“ gemeldet.
  materials: 'export const LOW_STOCK_THRESHOLD = 5;\n' +
    'export const lagerFrei = () => A(new Map());\n' +
    /*
      SEIT 18.10.2026 holen Lager und „Material anfordern“ vom Server: eine
      Seite mit Gesamtzahl, die Zahl des Katalogs, eine Suche und ein Kanal,
      der Änderungen meldet. Als Liste oder NOOP geraten, stürzte die Seite
      ab (`zeilen` von einer Liste, ein Versprechen als Aufräumfunktion).
    */
    'export const katalogSeite = () => A({ zeilen: D.materialien, gesamt: D.materialien.length });\n' +
    'export const katalogAnzahl = () => A(D.materialien.length);\n' +
    'export const sucheKatalog = () => A(D.materialien);\n' +
    'export const katalogBeobachten = () => () => {};\n',
  materialOrders:
    "export const ORDER_STATUS_FLOW = ['Offen', 'In Bearbeitung', 'Abholbereit', 'Erledigt'] as const;\n",
  quelle: 'export const nutztPostgres = () => false;\n',
  monatsbilanzen: "export const monatVon = (d: string) => d.slice(0, 7);\n",
  zeitfelder: 'export const gemerkterFeldsatz = () => null;\n',
  // Ohne Wartende der Stand vom Server — gefiltert wie im Vorbild, sonst zeigte die Zeiterfassung die Buchungen aller.
  wartendeZeiten: 'export const mitWartenden = (server: Array<{ id: string; userId: string; date: string }>, _w: unknown, uid: string, imFenster: (d: string) => boolean, ohne?: string) =>\n' +
    '  server.filter((e) => e.id !== ohne && e.userId === uid && imFenster(e.date));\n',
  prefs:
    'const P = {} as never;\nexport const getPrefs = () => A(P);\nexport const subscribePrefs = SUB(P);\n',
  // Formen, die die Heuristik falsch raten wuerde (Prueflauf 25.09.2026, C11).
  workSheets: 'export const vorbereiten = () => A({ zeiten: [], material: [] });\n' +
    'export const listWorkSheetsByIds = () => A([]);\n',
  /*
    EIN SCHLÜSSEL JE MODUL: stand `invoices` zweimal da, galt nur der zweite —
    `scheineAufRechnung` fehlte, und Startseite, Scheinliste und Rechnungen
    bekamen in der Vorschau `undefined` statt einer Liste (K4, 13.10.2026).
    Die Scheinliste fragt fürs Büro, welche Scheine schon verrechnet sind.
  */
  invoices:
    'export const scheineAufRechnung = () => A([]);\n' +
    // „Nicht verrechnet“ über alle Scheine (P3): eine Liste, kein `undefined`.
    'export const scheineUnverrechnet = () => A([]);\n' +
    'export const sucheRechnungen = () => A([]);\n' +
    "export const nextInvoiceNumber = () => 'RE-2026-0234';\n" +
    'export const isInvoiceNumberTaken = () => false;\n',
  konten: 'export const buchungskonten = () => A([]);\n',
  // Ein Abo gibt eine Aufräumfunktion zurück, kein Versprechen — sonst wirft React beim Verlassen der Seite.
  nachrichten: 'export const abonniereNachrichtenStand = () => () => {};\n' +
    // Synchron, nicht als Versprechen: der Verlauf mischt die Vorgemerkten sofort ein.
    'export const vorgemerkteNachrichten = () => [];\n' +
    "export const eimerFuer = (privat: boolean) => (privat ? 'nachrichten-privat' : 'nachrichten');\n" +
    // Die sechs Reaktionen (E77) sind Werte, keine Abfragen — als Fehlerklasse (Großbuchstabe) stürzte das Gespräch ab.
    "export const REAKTIONEN = ['👍', '❤️', '😆', '😮', '😢', '🙏'] as const;\n" +
    "export const REAKTION_NAME = { '👍': 'Daumen hoch', '❤️': 'Herz', '😆': 'Lachen', '😮': 'Staunen', '😢': 'Traurig', '🙏': 'Danke' } as const;\n",
  /*
    Seit E66 lädt der Timer-Stand im Layout auf jeder Seite. `zeitsitzungenLaden`
    passt auf kein Namensmuster und bekäme `undefined` — `sitzungen.find` warf,
    und jede Seite der Vorschau blieb weiß. Ohne laufenden Arbeitstag: leer.
  */
  // E68: ohne eigene Wahl die Vorgabe der Rolle — `lade…` bekäme sonst eine Liste statt `null`.
  startseiteWahl:
    'export const ladeStartseiteWahl = () => A(null);\n',
  zeitsitzungen:
    'export const zeitsitzungenLaden = () => A([]);\n' +
    'export const letzterTimerEntwurf = () => undefined;\n' +
    'export const timerMerken = () => {};\n',
  // Die Grenzprüfung liest die Geburtsdaten als Map je Person; ein Feld liess
  // die Karte „Arbeitszeitgrenzen“ in der Vorschau mit einem Fehler stehen.
  arbeitszeitGrenzen: 'export const listGeburtsdaten = () => A(new Map<string, string>());\n',
  // Das Kalender-Abo (02.10.2026): eingerichtet, damit die Karte ihren Normalfall zeigt.
  assignments:
    'export const kalenderAboStand = () => A(D.kalenderAbo);\n' +
    "export const kalenderAboAnlegen = () => A('Beispiel-Schluessel');\n",
  // Seit B1 (29.09.2026) nicht mehr am Betrieb und am Artikel.
  kosten:
    'export const kostensaetze = () => A({ fach: 46, helper: 31 });\n' +
    'export const einkaufspreise = () => A(new Map<string, number>());\n',
};

const KOPF = `import * as D from '../daten';
/* JEDER AUFRUF WIRD GEZÄHLT (L11): \`window.__datenaufrufe\` sagt der
   Leistungsprüfung (tests/links/leistung.spec.ts), wie viele Abfragen und Abos
   eine Seite stellt — und ob es mit dem Bestand mehr werden. Der Name kommt
   aus dem Aufrufstapel; er dient nur der Meldung. */
const ZAEHLEN = (art) => {
  const g = globalThis as unknown as { __datenaufrufe?: Record<string, number> };
  const z = (g.__datenaufrufe ??= {});
  const zeile = (new Error().stack ?? '').split('\\n')[3] ?? '';
  const name = /at (?:Object\\.)?([\\w$]+)/.exec(zeile)?.[1] ?? '?';
  z.gesamt = (z.gesamt ?? 0) + 1;
  z[art] = (z[art] ?? 0) + 1;
  z[art + ':' + name] = (z[art + ':' + name] ?? 0) + 1;
};
const A = <T,>(v: T) => (ZAEHLEN('abfrage'), Promise.resolve(v));
const NOOP = () => (ZAEHLEN('schreiben'), Promise.resolve(undefined as never));
/* Der Daten-Rueckruf ist in jeder Abo-Signatur dieses Projekts das ERSTE
   Funktionsargument (danach kommt onError). Damit sind die Stubs unabhaengig
   davon, an welcher Stelle er steht. */
const SUB = (daten) => (...args) => {
  ZAEHLEN('abo');
  const cb = args.find((a) => typeof a === 'function');
  setTimeout(() => cb?.(daten), 0);
  return () => {};
};
void A; void NOOP; void SUB; void D;
`;

const quelle = join(wurzel, 'src', 'lib', 'db');
let n = 0;
/* Auch `pg/`: einzelne Ansichten importieren `@/lib/db/pg/...` direkt (etwa
   das Ausgangsfach im Layout). Der Rueckruf-Kopf importiert `../daten`; fuer
   den Unterordner wird der Pfad angepasst. */
const ORDNER = ['', 'pg'];
for (const unter of ORDNER) {
  const von = join(quelle, unter);
  if (!existsSync(von)) continue;
  mkdirSync(join(ziel, unter), { recursive: true });
  for (const datei of readdirSync(von).filter((f) => f.endsWith('.ts'))) {
  const name = basename(datei, '.ts');
  const text = readFileSync(join(von, datei), 'utf8');

  const namen = [
    ...text.matchAll(/export (?:async )?function ([A-Za-z0-9_]+)/g),
    ...text.matchAll(/export const ([A-Za-z0-9_]+)/g),
  ].map((m) => m[1]);
  const klassen = [...text.matchAll(/export class ([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  // `export { a, b } from '…'` — aber nicht `export type { … }`.
  const weiter = [];
  for (const m of text.matchAll(/export\s*\{([^}]*)\}\s*from/g)) {
    if (/export\s+type\s*\{/.test(text.slice(Math.max(0, m.index - 8), m.index + m[0].length))) continue;
    for (const teil of m[1].split(',')) {
      const t = teil.trim().split(' as ').pop().trim();
      if (/^[A-Za-z0-9_]+$/.test(t)) weiter.push(t);
    }
  }

  const fest = FEST[name] ?? '';
  const schon = new Set([...fest.matchAll(/export const ([A-Za-z0-9_]+)/g)].map((m) => m[1]));
  const daten = DATEN[name] ?? {};
  let rumpf = fest;

  for (const k of new Set(klassen)) {
    rumpf += `export class ${k} extends Error {}\n`;
    schon.add(k);
  }
  for (const x of new Set([...namen, ...weiter])) {
    if (schon.has(x)) continue;
    const wert = daten[x] ?? daten['*'] ?? '[]';
    // Auch `beobachte…` (L5, L9) ist ein Abo: es gibt eine Aufräumfunktion zurück, kein Versprechen.
    if (x.startsWith('subscribe') || x.startsWith('beobachte')) rumpf += `export const ${x} = SUB(${wert});\n`;
    // Was in DATEN ausdrücklich steht, gilt auch ohne passenden Namensanfang (etwa `stundenDerBaustellen`).
    else if (Object.hasOwn(daten, x) || /^(list|get|find|search|lade|auszug|eintraege|bilanz)/.test(x))
      rumpf += `export const ${x} = () => A(${wert});\n`;
    else if (x[0] === x[0].toUpperCase()) rumpf += `export class ${x} extends Error {}\n`;
    else rumpf += `export const ${x} = NOOP;\n`;
  }
  const kopf = unter ? KOPF.replace("'../daten'", "'../../daten'") : KOPF;
  writeFileSync(join(ziel, unter, `${name}.ts`), kopf + rumpf);
  n++;
  }
}
/* Handgeschriebene Stubs unter `fest/` legen sich ueber die erzeugten: dort
   liegt, was sich aus dem Namen nicht ableiten laesst (Ausgangsfach,
   Katalogimport). */
const fest = join(hier, 'fest');
if (existsSync(fest)) cpSync(fest, ziel, { recursive: true });
console.log(`Vorschau: ${n} Ersatzmodule erzeugt.`);
