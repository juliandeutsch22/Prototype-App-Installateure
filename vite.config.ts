import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

/**
 * Welche Fassung laeuft hier eigentlich?
 *
 * WARUM DAS NOETIG WURDE. „Es ist deployed" gegen „bei mir ist nichts da" —
 * und keiner von beiden konnte nachsehen. Die App hatte keine Stelle, an der
 * steht, welcher Stand gerade laeuft. Damit war jede Diagnose ein Ratespiel:
 * liegt es am Deploy, am Zwischenspeicher des Telefons, oder ist die
 * Aenderung schlicht an eine Bedingung geknuepft, die gerade nicht gilt?
 *
 * Die Kennung kommt aus dem Bau, nicht aus dem Programm: aus GitHub Actions
 * die Commit-Kennung, lokal die aus Git, und ein Zeitstempel dazu. Der
 * Zeitstempel ist der wichtigere Teil — eine Uhrzeit kann jeder vergleichen,
 * eine Pruefsumme muss man erst nachschlagen.
 */
function fassungsKennung(): string {
  let kurz = process.env.GITHUB_SHA?.slice(0, 7) ?? '';
  if (!kurz) {
    try {
      kurz = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      // Kein Git zur Hand (z. B. ein Bau aus einem Archiv): dann genuegt die Zeit.
      kurz = 'ohne';
    }
  }
  const zeit = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  return `${kurz} · ${zeit}`;
}

// https://vitejs.dev/config/
/**
 * Die Fassungskennung zusaetzlich als eigene Datei ausliefern.
 *
 * WARUM ES DIESE DATEI BRAUCHT, obwohl der Service Worker die `index.html`
 * schon vergleicht: weil dieser Vergleich IM WORKER laeuft. Haengt der auf
 * einem alten Stand fest — und genau das war die Ausgangslage —, faellt der
 * Deploy nie auf, und die App hat keinen zweiten Weg, es zu erfahren.
 *
 * `/fassung.txt` ist dieser zweite Weg. Sie liegt nicht unter `/assets/`,
 * wird vom Worker also nicht angefasst, und die App holt sie mit
 * `cache: 'no-store'` direkt vom Server. Was dabei zurueckkommt, ist die
 * Wahrheit ueber den ausgelieferten Stand — unabhaengig davon, was der
 * Worker glaubt.
 */
function fassungsDatei(kennung: string): Plugin {
  return {
    name: 'fassung-txt',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'fassung.txt', source: kennung });
    },
  };
}

/**
 * `preconnect` zur Datenbank (Analyse 09.10.2026, Maßnahme 8): der Browser
 * baut die Verbindung zu Supabase auf, während er noch die App lädt — statt
 * erst bei der ersten Abfrage. Nur, wenn die Adresse beim Bau bekannt ist.
 */
function datenbankVorverbinden(): Plugin {
  let adresse: string | undefined;
  return {
    name: 'datenbank-vorverbinden',
    configResolved(config) {
      adresse = config.env.VITE_SUPABASE_URL as string | undefined;
    },
    transformIndexHtml() {
      let herkunft: string;
      try {
        herkunft = new URL(adresse ?? '').origin;
      } catch {
        return [];
      }
      return [{ tag: 'link', attrs: { rel: 'preconnect', href: herkunft, crossorigin: '' }, injectTo: 'head' }];
    },
  };
}

interface Kopfzeile {
  key: string;
  value: string;
}

interface Hosting {
  hosting: { headers?: { source: string; headers: Kopfzeile[] }[] };
}

/** Die Kopfzeilen, die die Auslieferung für jede Adresse setzt — ohne Zwischenspeicher-Regel. */
export function auslieferungsKopfzeilen(konfig: Hosting): Record<string, string> {
  const alle = konfig.hosting.headers?.find((h) => h.source === '**')?.headers ?? [];
  return Object.fromEntries(
    // `no-cache` gehört zur Auslieferung, nicht zur Sicherheit; für die
    // Durchsicht in der Vorschau ist sie ohne Belang.
    alle.filter((k) => k.key.toLowerCase() !== 'cache-control').map((k) => [k.key, k.value]),
  );
}

const ABGEDECKT = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

/** Wie oben, plus die Datenbank, wenn sie nicht unter `*.supabase.co` liegt. */
export function vorschauKopfzeilen(konfig: Hosting, datenbank: string | undefined): Record<string, string> {
  const kopf = auslieferungsKopfzeilen(konfig);
  let herkunft: string;
  try {
    herkunft = new URL(datenbank ?? '').origin;
  } catch {
    return kopf;
  }
  if (ABGEDECKT.test(herkunft)) return kopf;
  const ws = herkunft.replace(/^http/, 'ws');
  for (const name of ['Content-Security-Policy', 'Content-Security-Policy-Report-Only']) {
    if (!kopf[name]) continue;
    kopf[name] = kopf[name]
      .split(';')
      .map((teil) => {
        const t = teil.trim();
        if (t.startsWith('connect-src ')) return `${t} ${herkunft} ${ws}`;
        if (t.startsWith('img-src ')) return `${t} ${herkunft}`;
        return t;
      })
      .join('; ');
  }
  return kopf;
}

/**
 * Die Sicherheits-Kopfzeilen der Auslieferung auch in `vite preview`.
 *
 * WARUM. Die Kopfzeilen stehen in `firebase.json` und wirken erst live. Eine
 * Regel, die etwas sperrt, das die App braucht, fiele dort zuerst auf — bei
 * den Betrieben. Die Vorschau des fertigen Baus (`npm run build`, dann
 * `vite preview`) soll deshalb dieselben Kopfzeilen schicken, damit man jede
 * Seite vorher durchgehen kann.
 *
 * EINE QUELLE. Gelesen wird `firebase.json`, nicht eine Abschrift: zwei
 * Fassungen derselben Regeln liefen früher oder später auseinander.
 *
 * DER EINZIGE UNTERSCHIED: die Datenbank. Live liegt sie unter
 * `*.supabase.co`, das deckt die Regel ab. Gegen den lokalen Stapel
 * (`http://127.0.0.1:54321`) meldete die Vorschau sonst jeden Abruf als
 * Verstoß, und die echten Verstöße gingen darin unter. Deshalb kommt dessen
 * Adresse dazu — nur dann, und nur dort, wo die App die Datenbank anspricht.
 *
 * NICHT IM ENTWICKLUNGSSERVER. `vite` (dev) spielt eigene Skripte in die
 * Seite und spricht über einen WebSocket mit sich selbst; jede Regel meldete
 * dort nur dieses Werkzeug.
 */
function vorschauSicherheit(): Plugin {
  let adresse: string | undefined;
  return {
    name: 'vorschau-sicherheit',
    configResolved(config) {
      adresse = config.env.VITE_SUPABASE_URL as string | undefined;
    },
    configurePreviewServer(server) {
      const kopf = vorschauKopfzeilen(
        JSON.parse(readFileSync(path.resolve(__dirname, 'firebase.json'), 'utf8')),
        adresse,
      );
      server.middlewares.use((_req, res, weiter) => {
        for (const [name, wert] of Object.entries(kopf)) res.setHeader(name, wert);
        weiter();
      });
    },
  };
}

/* ------------------------------------------------------------ Start-Stil --- */

/** Die Schriften, die die erste Seite sicher braucht: DM Sans normal und mittel. */
const VORAB_SCHRIFTEN = /(^|\/)dm-sans-latin-(400|500)-normal-[\w-]+\.woff2$/;

/**
 * Den Kopf von `index.html` für das erste Bild umschreiben (L10). Getrennt
 * von Vite, damit es sich ohne Bau prüfen lässt.
 *
 * DAS STYLESHEET SPERRT DAS ERSTE BILD NICHT MEHR. Solange ein Stylesheet im
 * Kopf aussteht, zeichnet der Browser gar nichts — auch nicht die Papierfarbe
 * am `<html>` (gemessen: erstes Bild 1,15 s, gleich ob mit oder ohne Farbe).
 * Jetzt lädt es als `media="print"` (sperrt nichts) und mit hoher Priorität
 * vorab (`preload`); `src/main.tsx` schaltet es ein und zeichnet die App
 * erst, wenn es geladen ist — ohne ungestylten Zwischenstand.
 *
 * DIE SCHRIFTEN VORAB. Ohne Hinweis entdeckt der Browser sie erst, wenn Text
 * sie braucht: nach dem ersten Inhalt, und dann tauschen sie sichtbar.
 */
export function startStilEinsetzen(html: string, schriften: string[]): string {
  let raus = html.replace(
    /<link rel="stylesheet"( crossorigin)? href="(\/assets\/[^"]+\.css)">/g,
    (_g, co: string | undefined, href: string) =>
      `<link rel="preload" as="style"${co ?? ''} href="${href}">` +
      `<link rel="stylesheet"${co ?? ''} href="${href}" media="print" data-hauptstil>`,
  );
  const vorab = schriften
    .filter((d) => VORAB_SCHRIFTEN.test(d))
    .sort()
    .map((d) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="/${d.replace(/^\//, '')}">`)
    .join('');
  if (vorab) raus = raus.replace('</title>', `</title>${vorab}`);
  return raus;
}

/**
 * Welche Bausteine, mit denen die App startet, NICHT in `index.html` stehen.
 *
 * WARUM DAS DER BAU PRÜFT (L7). Der Service Worker erkennt eine Hülle, die
 * ohne Netz starten kann, allein an `index.html`: er hält vor, was dort als
 * `src`/`href` unter `/assets/` steht (`huellenBausteine` in public/sw.js),
 * und bietet eine neue Fassung erst an, wenn das alles liegt. Fehlte dort ein
 * fest eingebundener Baustein des Einstiegs, startete die neue Fassung ohne
 * Netz nicht — weiß, bis jemand neu lädt. Mit dem Schnitt in mehrere
 * Start-Bausteine (`gemeinsam`, `react`, `supabase`) wird das an jedem Bau
 * nachgerechnet.
 */
export function startBausteineFehlen(
  html: string,
  bausteine: Array<{ datei: string; statisch: string[]; einstieg: boolean }>,
): string[] {
  const nachName = new Map(bausteine.map((b) => [b.datei, b]));
  const einstieg = bausteine.find((b) => b.einstieg);
  const genannt = new Set(Array.from(html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g), (m) => m[1]));
  const fehlen: string[] = [];
  const gesehen = new Set<string>();
  const offen = einstieg ? [einstieg.datei] : [];
  while (offen.length) {
    const d = offen.pop()!;
    if (gesehen.has(d)) continue;
    gesehen.add(d);
    if (!genannt.has(d)) fehlen.push(d);
    offen.push(...(nachName.get(d)?.statisch ?? []));
  }
  return fehlen.sort();
}

/** Die eingebetteten Skripte einer Seite (ohne `src`), Zeichen für Zeichen. */
export function eingebetteteSkripte(html: string): string[] {
  return Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))
    .filter((m) => !/\bsrc=/.test(m[1]))
    .map((m) => m[2]);
}

/** Der Eintrag, mit dem die Inhaltsregel ein eingebettetes Skript erlaubt. */
export function skriptHash(text: string): string {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/**
 * Eingebettete Skripte, die die Inhaltsregel aus `firebase.json` NICHT
 * erlaubt (L10). Live liefe ein solches Skript nicht — und das, was es tun
 * soll (den dunklen Grund vor dem ersten Bild), fiele still aus.
 */
export function skripteOhneHash(html: string, konfig: Hosting): string[] {
  const regel = auslieferungsKopfzeilen(konfig)['Content-Security-Policy'] ?? '';
  const erlaubt = (regel.split(';').map((t) => t.trim()).find((t) => t.startsWith('script-src ')) ?? '').split(/\s+/);
  return eingebetteteSkripte(html).filter((t) => !erlaubt.includes(skriptHash(t)));
}

function startStil(): Plugin {
  return {
    name: 'start-stil',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const raus = startStilEinsetzen(html, Object.keys(ctx.bundle ?? {}));
        const bausteine = Object.values(ctx.bundle ?? {}).flatMap((t) =>
          t.type === 'chunk' ? [{ datei: t.fileName, statisch: t.imports, einstieg: t.isEntry }] : []);
        const ohneHash = skripteOhneHash(raus, JSON.parse(readFileSync(path.resolve(__dirname, 'firebase.json'), 'utf8')) as Hosting);
        if (ohneHash.length) {
          throw new Error(`Eingebettetes Skript ohne passenden Hash in der Inhaltsregel (firebase.json, script-src): ${ohneHash.map(skriptHash).join(', ')}`);
        }
        const fehlen = startBausteineFehlen(raus, bausteine);
        if (fehlen.length) {
          throw new Error(`index.html nennt nicht alle Start-Bausteine (der Service Worker hielte sie nicht vor): ${fehlen.join(', ')}`);
        }
        return raus;
      },
    },
  };
}

/* ------------------------------------------------------ Leistungswächter --- */

/** Ein Baustein des Baus, so weit der Wächter ihn braucht. */
export interface Baustein {
  datei: string;
  /** Inhalt; gemessen wird die gepackte Größe, wie sie übers Netz geht. */
  inhalt: string | Uint8Array;
  statisch: string[];
  dynamisch: string[];
  einstieg: boolean;
  /** Die Quelldatei, für die der Baustein steht (bei Ansichten der Pfad unter `src/`). */
  modul: string | null;
  /** Stylesheets, die mit diesem Baustein geladen werden. */
  css: string[];
}

export interface Leistungsbudget {
  /** Gepackt vor dem ersten Bild: Einstieg, seine festen Bausteine und Stile. */
  vorErstemBildKB: number;
  /** Der Einstieg allein. */
  einstiegKB: number;
  /** Zahl der JavaScript-Bausteine. */
  bausteine: number;
  /** Größter Baustein, außer den Bibliotheken, die nur auf Abruf kommen. */
  groessterBausteinKB: number;
  /** Dateinamen-Anfänge der Bibliotheken auf Abruf (PDF, Push). */
  aufAbruf: string[];
  /** Was eine Ansicht beim ersten Öffnen über den Start hinaus holt — gepackt … */
  jeAnsichtKB: number;
  /** … und in wie vielen Dateien (= Anfragen). */
  jeAnsichtDateien: number;
  /**
   * Wie viele Bausteine den Einstieg fest einbinden. Jeder davon bekommt mit
   * jeder Änderung am Einstieg einen neuen Namen (Analyse 15.11.2026, B8).
   */
  importierenEinstieg: number;
}

export interface AnsichtMessung {
  modul: string;
  datei: string;
  kb: number;
  dateien: number;
}

export interface LeistungsMessung {
  startDateien: string[];
  vorErstemBildKB: number;
  einstiegKB: number;
  bausteine: number;
  groessterBaustein: { datei: string; kb: number };
  importierenEinstieg: number;
  ansichten: AnsichtMessung[];
}

const kb = (n: number) => Math.round((n / 1024) * 10) / 10;
const gepackt = (inhalt: string | Uint8Array) => gzipSync(inhalt, { level: 9 }).length;

/**
 * Misst einen Bau: was vor dem ersten Bild übers Netz muss, wie viele und wie
 * große Bausteine es gibt, und was jede Ansicht beim ersten Öffnen dazuholt.
 *
 * ANSICHT heißt hier: jeder Baustein, den der Start nur auf Abruf lädt
 * (`ansicht()` in `App.tsx`, die Anmeldung, Push). Gezählt wird, was er
 * FEST einbindet — sein eigenes Nachladen (PDF) kommt erst auf einen Knopf.
 */
export function leistungMessen(bausteine: Baustein[], stile: Record<string, string | Uint8Array>): LeistungsMessung {
  const nachName = new Map(bausteine.map((b) => [b.datei, b]));
  const groesse = new Map<string, number>();
  const groesseVon = (datei: string) => {
    let g = groesse.get(datei);
    if (g === undefined) {
      const inhalt = nachName.get(datei)?.inhalt ?? stile[datei];
      g = inhalt === undefined ? 0 : gepackt(inhalt);
      groesse.set(datei, g);
    }
    return g;
  };
  const huelle = (anfang: string[]) => {
    const da = new Set<string>();
    const weiter = [...anfang];
    while (weiter.length) {
      const d = weiter.pop()!;
      if (da.has(d)) continue;
      da.add(d);
      const b = nachName.get(d);
      if (!b) continue;
      weiter.push(...b.statisch, ...b.css);
    }
    // Als Liste: `tsconfig.node.json` übersetzt ohne Ziel, und dort lässt sich eine Menge nicht ausbreiten.
    return Array.from(da);
  };

  const einstieg = bausteine.find((b) => b.einstieg);
  const startListe = huelle(einstieg ? [einstieg.datei] : []);
  const start = new Set(startListe);
  const summe = (dateien: string[]) => dateien.reduce((s, d) => s + groesseVon(d), 0);

  /*
    Was der Start auf Abruf lädt, und darin wieder jede nachgeladene
    Komponente (`.tsx`: die Rechnungsverwaltung hinter `RechnungenSeite`, die
    Übersicht der Baustellenakte). Nachgeladenes Rechnen (`.ts`: PDF) kommt
    erst auf einen Knopf und zählt nicht zur Ansicht.
  */
  const ansichten: AnsichtMessung[] = [];
  const gesehen = new Set<string>();
  const offen: string[] = [];
  const vormerken = (von: string[], nurKomponenten: boolean) => {
    for (const d of von) {
      for (const z of nachName.get(d)?.dynamisch ?? []) {
        if (start.has(z) || gesehen.has(z)) continue;
        if (nurKomponenten && !nachName.get(z)?.modul?.endsWith('.tsx')) continue;
        gesehen.add(z);
        offen.push(z);
      }
    }
  };
  vormerken(startListe, false);
  while (offen.length) {
    const datei = offen.shift()!;
    const alle = huelle([datei]);
    const dazu = alle.filter((d) => !start.has(d));
    ansichten.push({ modul: nachName.get(datei)?.modul ?? datei, datei, kb: kb(summe(dazu)), dateien: dazu.length });
    vormerken(alle, true);
  }
  ansichten.sort((a, b) => b.kb - a.kb);

  const js = bausteine.map((b) => ({ datei: b.datei, kb: kb(groesseVon(b.datei)) }));
  return {
    startDateien: startListe.slice().sort(),
    vorErstemBildKB: kb(summe(startListe)),
    einstiegKB: einstieg ? kb(groesseVon(einstieg.datei)) : 0,
    bausteine: bausteine.length,
    groessterBaustein: js.sort((a, b) => b.kb - a.kb)[0] ?? { datei: '', kb: 0 },
    importierenEinstieg: einstieg ? bausteine.filter((b) => b.statisch.includes(einstieg.datei)).length : 0,
    ansichten,
  };
}

/** Die Verstöße gegen das Budget, als Sätze — leer heißt: im Budget. */
export function leistungPruefen(m: LeistungsMessung, budget: Leistungsbudget, bausteine: Baustein[]): string[] {
  const fehler: string[] = [];
  const ueber = (was: string, ist: number, grenze: number, einheit: string) => {
    if (ist > grenze) fehler.push(`${was}: ${ist} ${einheit} statt höchstens ${grenze} ${einheit}`);
  };
  ueber('Vor dem ersten Bild (gepackt)', m.vorErstemBildKB, budget.vorErstemBildKB, 'KB');
  ueber('Einstieg (gepackt)', m.einstiegKB, budget.einstiegKB, 'KB');
  ueber('JavaScript-Bausteine', m.bausteine, budget.bausteine, 'Stück');
  ueber('Bausteine, die den Einstieg fest einbinden', m.importierenEinstieg, budget.importierenEinstieg, 'Stück');
  const name = (datei: string) => datei.split('/').pop() ?? datei;
  const eigene = bausteine
    .filter((b) => !budget.aufAbruf.some((a) => name(b.datei).startsWith(a)))
    .map((b) => ({ datei: b.datei, kb: kb(gepackt(b.inhalt)) }))
    .sort((a, b) => b.kb - a.kb);
  if (eigene[0]) ueber(`Größter Baustein (${name(eigene[0].datei)})`, eigene[0].kb, budget.groessterBausteinKB, 'KB');
  for (const a of m.ansichten) {
    ueber(`Ansicht ${a.modul} holt dazu`, a.kb, budget.jeAnsichtKB, 'KB');
    ueber(`Ansicht ${a.modul} holt dazu`, a.dateien, budget.jeAnsichtDateien, 'Dateien');
  }
  return fehler;
}

/**
 * DER LEISTUNGSWÄCHTER (Plan 15.11.2026, L11). Jeder Bau misst sich selbst
 * und scheitert, wenn er über dem Budget in `leistungsbudget.json` liegt.
 *
 * WARUM IM BAU UND NICHT ALS EIGENE PRÜFUNG. Gebaut wird in der CI an zwei
 * Stellen: im Durchklick (für die Inhaltsregel, bei jedem Pull Request, der
 * Code berührt) und vor jeder Auslieferung. Hängt der Wächter am Bau, läuft
 * er dort mit, ohne einen Auftrag zu verlängern oder einen neuen zu brauchen
 * — und ein Rückschritt kann nicht ausgeliefert werden.
 *
 * Gemessen wird gepackt (gzip), wie es übers Netz geht. Die Grenzen haben
 * Luft über dem gemessenen Stand; wer sie anhebt, schreibt den Grund dazu.
 */
function leistungswaechter(): Plugin {
  let melden: (text: string) => void = () => undefined;
  return {
    name: 'leistungswaechter',
    apply: 'build',
    configResolved(config) {
      // `this.info` blendet Vite aus; die Zeile soll im Bauprotokoll stehen.
      melden = (text) => config.logger.info(text);
    },
    // Nach Vites eigener Nacharbeit (Ladehilfe, Liste der Abhängigkeiten): gemessen wird, was ausgeliefert wird.
    generateBundle: { order: 'post', handler(_optionen, bundle) {
      const budget = JSON.parse(
        readFileSync(path.resolve(__dirname, 'leistungsbudget.json'), 'utf8'),
      ) as Leistungsbudget;
      const wurzel = path.resolve(__dirname) + path.sep;
      const bausteine: Baustein[] = [];
      const stile: Record<string, string | Uint8Array> = {};
      for (const teil of Object.values(bundle)) {
        if (teil.type === 'asset') {
          if (teil.fileName.endsWith('.css')) stile[teil.fileName] = teil.source;
          continue;
        }
        bausteine.push({
          datei: teil.fileName,
          inhalt: teil.code,
          statisch: teil.imports,
          dynamisch: teil.dynamicImports,
          einstieg: teil.isEntry,
          modul: teil.facadeModuleId?.startsWith(wurzel) ? teil.facadeModuleId.slice(wurzel.length) : null,
          css: Array.from(teil.viteMetadata?.importedCss ?? []),
        });
      }
      const m = leistungMessen(bausteine, stile);
      const fehler = leistungPruefen(m, budget, bausteine);
      // `LEISTUNG_ALLES=1 npx vite build` zeigt die ganze Messung — für das Vorher/Nachher einer Änderung.
      if (process.env.LEISTUNG_ALLES) melden(JSON.stringify(m, null, 1));
      const schwerste = m.ansichten
        .slice(0, 3)
        .map((a) => `${a.modul.split('/').pop()} ${a.kb} KB/${a.dateien}`)
        .join(', ');
      melden(
        `Leistung: vor dem ersten Bild ${m.vorErstemBildKB} KB (${m.startDateien.length} Dateien), ` +
          `Einstieg ${m.einstiegKB} KB, ${m.bausteine} Bausteine, ${m.importierenEinstieg} binden den Einstieg ein; ` +
          `schwerste Ansichten: ${schwerste}`,
      );
      if (fehler.length) {
        this.error(`Leistungsbudget überschritten (leistungsbudget.json):\n  - ${fehler.join('\n  - ')}`);
      }
    } },
  };
}

/* ------------------------------------------------------ Bausteinschnitt --- */

type ModulInfo = { importedIds: readonly string[] } | null;
type SchnittMeta = { getModuleInfo: (id: string) => ModulInfo };

const EINSTIEG = path.resolve(__dirname, 'src/main.tsx');
const APP = path.resolve(__dirname, 'src/app/App.tsx');

/** Was vom Einstieg aus fest erreichbar ist — je Bau einmal gerechnet. */
let erreichbarFuer: SchnittMeta['getModuleInfo'] | null = null;
let erreichbar = new Set<string>();
function vomEinsteigErreichbar(id: string, meta?: SchnittMeta): boolean {
  if (!meta?.getModuleInfo) return false;
  if (erreichbarFuer !== meta.getModuleInfo) {
    erreichbarFuer = meta.getModuleInfo;
    erreichbar = new Set<string>();
    const offen = [EINSTIEG];
    while (offen.length) {
      const m = offen.pop()!;
      if (erreichbar.has(m)) continue;
      erreichbar.add(m);
      offen.push(...(meta.getModuleInfo(m)?.importedIds ?? []));
    }
  }
  return erreichbar.has(id);
}

/**
 * WIE DER BAU IN BAUSTEINE GESCHNITTEN WIRD (L7, 17.11.2026).
 *
 * WARUM. Jeder Baustein trägt einen Fingerabdruck im Namen, und wer einen
 * anderen fest einbindet, trägt dessen Namen in sich — ändert sich der eine,
 * bekommt auch der andere einen neuen Namen. Bis hierher lag aller
 * gemeinsame Code im Einstieg, und im Einstieg stand zugleich, unter welchem
 * Namen jede Ansicht nachgeladen wird. Gemessen: jede noch so kleine
 * Änderung — an einer Ansicht, an der Navigation, am Datenkern — benannte
 * 182 von 230 Bausteinen um, 966 KB gepackt, die jedes Telefon danach neu
 * holte.
 *
 * JETZT:
 *   - der Einstieg ist nur noch `main.tsx` und `App.tsx` (die Tabelle der
 *     Ansichten). Ihn bindet niemand ein; ändert sich eine Ansicht, ändern
 *     sich ihr Baustein und der Einstieg, sonst nichts;
 *   - was der Start fest braucht, liegt in `gemeinsam` (Hülle, Bausteine,
 *     Datenkern, Rechenregeln) — eine Datei, weil diese Teile einander
 *     gegenseitig einbinden: getrennt entstünden Kreise zwischen Bausteinen,
 *     und deren Reihenfolge beim Start ist nicht verlässlich;
 *   - Bibliotheken, die sich nur mit einem Update ändern, eigen: Supabase,
 *     Firebase und `react` (React, Router, TanStack, die Ladehilfen von Vite
 *     und Rollup — sie binden einander ein; getrennt entstünden Kreise);
 *   - alles Übrige teilt Rollup nach den Ansichten, die es brauchen — eine
 *     Änderung an den Daten der Rechnungen trifft die Bausteine der
 *     Rechnungen, nicht die App.
 *
 * Die Stile bleiben beim Einstieg (eine Datei, wie bisher); ihre Reihenfolge
 * ändert sich damit nicht.
 */
export function bausteinSchnitt(id: string, meta?: SchnittMeta): string | undefined {
  if (/\.css($|\?)/.test(id)) return undefined;
  if (id.includes('node_modules')) {
    if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase';
    // Seit dem Umzug der größte Brocken beim Start — und fast nie geändert.
    if (id.includes('/@supabase/')) return 'supabase';
    if (id.includes('/react-dom/') || id.includes('/react-router')) return 'react';
    // Was der Start sonst an Bibliotheken braucht (React selbst, TanStack): zu React — getrennt bänden sie einander im Kreis ein.
    return vomEinsteigErreichbar(id, meta) ? 'react' : undefined;
  }
  // Rollups Hilfen für CommonJS-Pakete und Vites Ladehilfe: so beständig wie die Bibliotheken.
  if (id.startsWith('\0') || id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill')) {
    return vomEinsteigErreichbar(id, meta) || id.includes('vite/') ? 'react' : undefined;
  }
  if (id === EINSTIEG || id === APP) return undefined;
  return vomEinsteigErreichbar(id, meta) ? 'gemeinsam' : undefined;
}

const KENNUNG = fassungsKennung();

export default defineConfig({
  plugins: [react(), fassungsDatei(KENNUNG), datenbankVorverbinden(), vorschauSicherheit(), startStil(), leistungswaechter()],
  define: {
    __FASSUNG__: JSON.stringify(KENNUNG),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Gemeinsame Rechenregeln fuer App und Cloud Functions.
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    /*
      DAS ZIEL BLEIBT, WIE ES UNTER VITE 5 WAR. Vite 7 hat die Vorgabe auf
      Safari 16 angehoben. Heute ergibt das noch dieselbe Ausgabe (am
      30.09.2026 nachgeprüft: jede ausgelieferte Datei liest sich als
      ES2020) — sobald aber eigener Code oder eine Bibliothek neuere Syntax
      mitbringt, liesse Vite sie für ältere iPhones stehen, und dort bliebe
      die Seite weiss. Der Betrieb hat die App gerade auf einem älteren
      iPhone geprüft; das Werkzeug zu erneuern soll daran nichts ändern.
    */
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    rollupOptions: {
      output: {
        /**
         * Fremdpakete in eigene Dateien.
         *
         * NICHT, um den ersten Aufruf kleiner zu machen — React und die
         * Firebase-SDK werden beim Start beide gebraucht, die Bytes fallen
         * so oder so an. Sondern für JEDEN WEITEREN Aufruf nach einem
         * Deploy: die Dateinamen tragen einen Inhalts-Fingerabdruck, und
         * diese beiden Pakete ändern sich fast nie. Lagen sie mit unserem
         * Code in einer Datei, lud das Telefon nach jeder noch so kleinen
         * Änderung ein knappes Megabyte neu.
         *
         * Getrennt sind es dann nur noch die paar Kilobyte, die sich
         * wirklich geändert haben.
         */
        manualChunks: bausteinSchnitt,
      },
    },
  },
});
