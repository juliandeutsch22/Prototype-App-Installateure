#!/usr/bin/env node
/**
 * Messbasis für den Umbau „Lot“ (Phase B, B2) — vorher und nachher mit
 * demselben Werkzeug (Protokoll 0.1, Punkt 3: „gemessen, nicht vermutet“).
 *
 *   node scripts/ui-umbau/messung.mjs [vorher|nachher] [--ohne-bauen] [--laeufe=3] [--nur=/lager]
 *
 * Voraussetzungen: lokaler Stapel läuft, Testbestand angelegt
 * (`node scripts/ui-umbau/testbestand.mjs`). Das Skript baut die App gegen
 * den lokalen Stapel (`npm run build` mit `VITE_SUPABASE_URL` und dem
 * öffentlichen Anon-Schlüssel der Supabase-CLI), startet `vite preview` auf
 * Port 4320, meldet sich als Geschäftsführung des Testbetriebs an und lädt
 * jede wichtige Seite im HANDY-PROFIL: 390 × 844, Netz gedrosselt auf
 * „langsames 4G“ (150 ms Laufzeit, 1,6 Mbit/s hinunter, 750 kbit/s hinauf),
 * CPU vierfach gedrosselt, Zwischenspeicher aus — jede Messung ist ein
 * erster Besuch der Seite.
 *
 * GEMESSEN WIRD je Seite (Median aus mehreren Läufen):
 *   - erste Anzeige: First Contentful Paint des Browsers;
 *   - Inhalt da: die Überschrift der Seite (`main h1`) ist sichtbar;
 *   - bedienbar: das Netz ruht (keine offene Anfrage für 1 s) — als Annäherung,
 *     weil „Time to Interactive“ im Browser nicht direkt messbar ist;
 *   - Anfragen und übertragene Datenmenge bis dahin;
 *   - Anfragen an die Datenbank (`/rest/v1/`) mit der Zahl der Zeilen je
 *     Antwort (aus `Content-Range`, sonst aus dem Inhalt): die grösste Liste
 *     und alle Antworten mit mehr als 50 Zeilen. Das ist die Frage aus
 *     Abschnitt 3, B3: „höchstens 50 Einträge je Anfrage, kein ganzer
 *     Bestand im Browser“.
 *
 * Ergebnis: `docs/ui-umbau/messung-<quelle>.json` (Rohwerte) und der
 * erzeugte Abschnitt in `docs/ui-umbau/messung-<quelle>.md` zwischen den
 * Markierungen — der Text drumherum bleibt stehen.
 */
import { chromium } from 'playwright';
import { spawn, spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const QUELLE = process.argv.find((a) => a === 'vorher' || a === 'nachher') ?? 'vorher';
const BAUEN = !process.argv.includes('--ohne-bauen');
const LAEUFE = Number(process.argv.find((a) => a.startsWith('--laeufe='))?.split('=')[1] ?? 3);
/** Nur einzelne Seiten (zum Ausprobieren): --nur=/lager,/invoices — schreibt dann keine Ergebnisdateien. */
const NUR = process.argv.find((a) => a.startsWith('--nur='))?.split('=')[1].split(',') ?? null;
const PORT = 4320;
const ORT = `http://127.0.0.1:${PORT}`;
const API = 'http://127.0.0.1:54321';
// Öffentlicher Anon-Schlüssel der Supabase-CLI (wie playwright.config.ts) — kein Geheimnis.
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const KONTO = { email: 'gf@ui-testbestand.test', passwort: 'Testbestand-2026!' };

/** Die wichtigen Seiten aus dem Auftrag (B2). */
const SEITEN = [
  ['Start', '/'],
  ['Planung (Tag)', '/assignments/tag'],
  ['Planung (Woche)', '/assignments/woche'],
  ['Lager', '/lager'],
  ['Anforderungen', '/anforderungen'],
  ['Material anfordern', '/material'],
  ['Rechnungen', '/invoices'],
  ['Angebote', '/quotes'],
  ['Baustellen', '/admin-projects'],
  ['Kunden', '/customers'],
  ['Mitarbeiterübersicht', '/accounting'],
  ['Einstellungen', '/settings/meldungen'],
];

/** „Langsames 4G“ wie im Handy-Profil von Lighthouse. */
const NETZ = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const CPU = 4;
const GRENZE = 50;

const CHROMIUM = process.env.CHROMIUM_PFAD
  || (() => { try { return execSync('ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1').toString().trim(); } catch { return ''; } })()
  || undefined;

function bauen() {
  console.log('App bauen gegen den lokalen Stapel …');
  const r = spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_SUPABASE_URL: API, VITE_SUPABASE_ANON_KEY: ANON },
  });
  if (r.status !== 0) throw new Error('Bauen fehlgeschlagen');
}

async function warteAuf(url, ms = 30_000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    try {
      const a = await fetch(url);
      if (a.ok) return;
    } catch { /* noch nicht da */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${url} antwortet nicht`);
}

const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Zeilen einer PostgREST-Antwort: „0-49/*“ → 50, „*\/0“ → 0. */
function zeilenAus(bereich) {
  const m = /^(\d+)-(\d+)\//.exec(bereich ?? '');
  if (m) return Number(m[2]) - Number(m[1]) + 1;
  if (/^\*\//.test(bereich ?? '')) return 0;
  return null;
}

/** Tabelle und Abfrage einer Datenbankanfrage, ohne Schlüssel. */
function abfrageVon(url) {
  const u = new URL(url);
  const tabelle = u.pathname.replace(/^\/rest\/v1\//, '');
  const teile = [];
  for (const k of ['limit', 'offset', 'order']) if (u.searchParams.get(k)) teile.push(`${k}=${u.searchParams.get(k)}`);
  return { tabelle, merkmale: teile.join('&') };
}

async function anmelden(browser) {
  const kontext = await browser.newContext({ locale: 'de-AT', timezoneId: 'Europe/Vienna' });
  const seite = await kontext.newPage();
  await seite.goto(`${ORT}/`);
  await seite.getByLabel(/E-Mail/).fill(KONTO.email);
  await seite.getByLabel('Passwort').fill(KONTO.passwort);
  await seite.getByRole('button', { name: 'Anmelden' }).click();
  await seite.getByRole('button', { name: 'Anmelden' }).waitFor({ state: 'detached', timeout: 30_000 });
  await seite.waitForLoadState('networkidle');
  await seite.locator('main h1').first().waitFor({ timeout: 30_000 });
  const zustand = await kontext.storageState();
  await kontext.close();
  return zustand;
}

async function einmalMessen(browser, zustand, pfad) {
  const kontext = await browser.newContext({
    storageState: zustand, locale: 'de-AT', timezoneId: 'Europe/Vienna',
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  const seite = await kontext.newPage();
  const cdp = await kontext.newCDPSession(seite);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', NETZ);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  const anfragen = new Map();
  let offen = 0;
  let zuletzt = Date.now();
  cdp.on('Network.requestWillBeSent', (e) => {
    if (e.type === 'WebSocket' || e.request.url.startsWith('data:')) return;
    if (!anfragen.has(e.requestId)) offen += 1;
    anfragen.set(e.requestId, { url: e.request.url, methode: e.request.method, bytes: 0, zeilen: null, fertig: false });
    zuletzt = Date.now();
  });
  cdp.on('Network.responseReceived', (e) => {
    const a = anfragen.get(e.requestId);
    if (!a) return;
    const kopf = Object.fromEntries(Object.entries(e.response.headers).map(([k, v]) => [k.toLowerCase(), v]));
    a.zeilen = zeilenAus(kopf['content-range']);
    a.status = e.response.status;
  });
  const abschliessen = (e, fehler) => {
    const a = anfragen.get(e.requestId);
    if (!a || a.fertig) return;
    a.fertig = true;
    a.bytes = e.encodedDataLength ?? 0;
    if (fehler) a.fehler = true;
    offen -= 1;
    zuletzt = Date.now();
  };
  const koerper = [];
  cdp.on('Network.loadingFinished', (e) => {
    const a = anfragen.get(e.requestId);
    if (a && a.zeilen == null && a.url.includes('/rest/v1/') && a.methode !== 'OPTIONS') koerper.push(e.requestId);
    abschliessen(e, false);
  });
  cdp.on('Network.loadingFailed', (e) => abschliessen(e, true));

  const start = Date.now();
  await seite.goto(`${ORT}${pfad}`, { waitUntil: 'commit', timeout: 120_000 });
  // Inhalt da: die Überschrift der Seite.
  let inhalt = null;
  try {
    await seite.locator('main h1').first().waitFor({ state: 'visible', timeout: 90_000 });
    inhalt = Date.now() - start;
  } catch { /* bleibt null */ }
  // Bedienbar: keine offene Anfrage für eine Sekunde.
  while (Date.now() - start < 120_000) {
    if (offen <= 0 && Date.now() - zuletzt >= 1000) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const ruhig = Math.max(zuletzt - start, inhalt ?? 0);
  const fcp = await seite.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null);

  for (const id of koerper) {
    try {
      const { body } = await cdp.send('Network.getResponseBody', { requestId: id });
      const j = JSON.parse(body);
      anfragen.get(id).zeilen = Array.isArray(j) ? j.length : null;
    } catch { /* kein JSON */ }
  }
  await kontext.close();

  const alle = [...anfragen.values()].filter((a) => a.methode !== 'OPTIONS');
  const db = alle.filter((a) => a.url.includes('/rest/v1/'));
  return {
    fcp: fcp == null ? null : Math.round(fcp),
    inhalt,
    bedienbar: ruhig,
    anfragen: alle.length,
    bytes: alle.reduce((s, a) => s + a.bytes, 0),
    dbAnfragen: db.length,
    dbBytes: db.reduce((s, a) => s + a.bytes, 0),
    db: db.map((a) => ({ ...abfrageVon(a.url), zeilen: a.zeilen, bytes: a.bytes })),
  };
}

function bericht(ergebnisse) {
  const kb = (b) => `${Math.round(b / 1024).toLocaleString('de-AT')} KB`;
  const s = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);
  const zeilen = [
    `Gemessen am ${new Date().toLocaleDateString('de-AT')} · ${LAEUFE} Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×${CPU}, ohne Zwischenspeicher · angemeldet als Geschäftsführung des Testbetriebs \`ui-testbestand\`.`,
    '',
    '| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bedienbar (Netz ruhig) | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const e of ergebnisse) {
    zeilen.push(`| ${e.name} | \`${e.pfad}\` | ${s(e.fcp)} | ${s(e.inhalt)} | ${s(e.bedienbar)} | ${e.anfragen} | ${kb(e.bytes)} | ${e.dbAnfragen} | ${kb(e.dbBytes)} | ${e.groessteListe ? `${e.groessteListe.zeilen.toLocaleString('de-AT')} (${e.groessteListe.tabelle})` : '–'} |`);
  }
  zeilen.push('', `**Antworten mit mehr als ${GRENZE} Zeilen** (Budget B3: höchstens ${GRENZE} je Anfrage, kein ganzer Bestand):`, '');
  for (const e of ergebnisse) {
    if (!e.ueberGrenze.length) continue;
    zeilen.push(`- **${e.name}** (\`${e.pfad}\`): ${e.ueberGrenze.map((u) => `${u.tabelle} ${u.zeilen.toLocaleString('de-AT')} Zeilen${u.anfragen > 1 ? ` in ${u.anfragen} Anfragen` : ''}`).join('; ')}`);
  }
  if (!ergebnisse.some((e) => e.ueberGrenze.length)) zeilen.push('- keine');
  return zeilen.join('\n');
}

async function main() {
  if (BAUEN) bauen();
  if (!fs.existsSync('dist/index.html')) throw new Error('dist/ fehlt — ohne --ohne-bauen aufrufen');
  // Eigene Prozessgruppe: so lässt sich der Server am Ende gezielt beenden, ohne nach Namen zu suchen.
  const vorschau = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true });
  try {
    await warteAuf(`${ORT}/`);
    const browser = await chromium.launch({ executablePath: CHROMIUM });
    const zustand = await anmelden(browser);
    const ergebnisse = [];
    for (const [name, pfad] of SEITEN.filter(([, p]) => !NUR || NUR.includes(p))) {
      const laeufe = [];
      for (let i = 0; i < LAEUFE; i += 1) laeufe.push(await einmalMessen(browser, zustand, pfad));
      // Je Tabelle: die meisten Zeilen in einer Antwort und wie viele Anfragen sie zusammen holen.
      const letzter = laeufe[laeufe.length - 1];
      const jeTabelle = new Map();
      for (const d of letzter.db) {
        const t = jeTabelle.get(d.tabelle) ?? { tabelle: d.tabelle, zeilen: 0, anfragen: 0, groesste: 0 };
        t.zeilen += d.zeilen ?? 0;
        t.anfragen += 1;
        t.groesste = Math.max(t.groesste, d.zeilen ?? 0);
        jeTabelle.set(d.tabelle, t);
      }
      const tabellen = [...jeTabelle.values()].sort((a, b) => b.zeilen - a.zeilen);
      const e = {
        name, pfad,
        fcp: median(laeufe.map((l) => l.fcp)),
        inhalt: median(laeufe.map((l) => l.inhalt)),
        bedienbar: median(laeufe.map((l) => l.bedienbar)),
        anfragen: median(laeufe.map((l) => l.anfragen)),
        bytes: median(laeufe.map((l) => l.bytes)),
        dbAnfragen: median(laeufe.map((l) => l.dbAnfragen)),
        dbBytes: median(laeufe.map((l) => l.dbBytes)),
        groessteListe: tabellen[0] && tabellen[0].zeilen ? { tabelle: tabellen[0].tabelle, zeilen: tabellen[0].zeilen } : null,
        ueberGrenze: tabellen.filter((t) => t.groesste > GRENZE),
        tabellen,
        laeufe,
      };
      ergebnisse.push(e);
      console.log(`${name.padEnd(22)} FCP ${e.fcp} ms · h1 ${e.inhalt} ms · ruhig ${e.bedienbar} ms · ${e.anfragen} Anfragen · ${Math.round(e.bytes / 1024)} KB · DB ${e.dbAnfragen} · grösste ${e.groessteListe?.zeilen ?? 0} (${e.groessteListe?.tabelle ?? '–'})`);
    }
    await browser.close();
    if (NUR) return;

    fs.writeFileSync(path.join('docs/ui-umbau', `messung-${QUELLE}.json`), `${JSON.stringify({ quelle: QUELLE, netz: NETZ, cpu: CPU, laeufe: LAEUFE, ergebnisse }, null, 1)}\n`);
    const md = path.join('docs/ui-umbau', `messung-${QUELLE}.md`);
    const block = `<!-- messung:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->\n${bericht(ergebnisse)}\n<!-- messung:ende -->`;
    const alt = fs.existsSync(md) ? fs.readFileSync(md, 'utf8') : `# Messung ${QUELLE}\n\n<!-- messung:anfang -->\n<!-- messung:ende -->\n`;
    fs.writeFileSync(md, alt.replace(/<!-- messung:anfang[\s\S]*<!-- messung:ende -->/, block));
    console.log(`\n→ ${md}`);
  } finally {
    try { process.kill(-vorschau.pid, 'SIGTERM'); } catch { /* schon weg */ }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
