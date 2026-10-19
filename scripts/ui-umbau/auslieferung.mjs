/**
 * Nachbau der echten Auslieferung für die Messung (Ladezeit, 19.10.2026).
 *
 * WARUM. Bis hierher maß `messung.mjs` gegen `vite preview` und den lokalen
 * Supabase-Stapel. Beide liefern anders aus als die echte App:
 *
 *   - die Datenbank antwortet lokal UNKOMPRIMIERT — draussen packt Supabase
 *     jede Antwort mit gzip (geprüft am 19.10.2026: `content-encoding: gzip`
 *     an der REST-Schnittstelle des Projekts). Eine Monatsliste Buchungen
 *     sind lokal 432 KB, gepackt 24 KB;
 *   - `vite preview` spricht HTTP/1.1 mit höchstens sechs Verbindungen und
 *     lässt jede Programmdatei bei jedem Besuch neu bestätigen — Firebase
 *     Hosting spricht HTTP/2 und liefert `/assets/**` als `immutable`
 *     (`firebase.json`): ein wiederkehrender Besuch fragt gar nicht erst.
 *
 * Gemessen wurde damit eine Leitung, die es draussen nicht gibt. Dieser
 * Nachbau stellt beides wie draussen hin — HTTP/2 über TLS, gepackt, mit den
 * Kopfzeilen aus `firebase.json` — und lässt die Drosselung (langsames 4G,
 * CPU ×4) unverändert; die bleibt bewusst streng.
 *
 *   App:       https://127.0.0.1:4321  (dist/, Rückfall auf index.html)
 *   Datenbank: https://127.0.0.1:54330 (vor dem lokalen Stapel auf :54321)
 *
 * Das Zertifikat ist selbst ausgestellt; der Browser der Messung startet mit
 * `--ignore-certificate-errors`. Nur für die lokale Messung — nichts davon
 * wird ausgeliefert.
 */
import http from 'node:http';
import http2 from 'node:http2';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const APP_PORT = 4321;
export const API_PORT = 54330;
const STAPEL = { host: '127.0.0.1', port: 54321 };

const ARTEN = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};
const PACKBAR = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/;

function zertifikat() {
  const ordner = path.join(os.tmpdir(), 'senklot-auslieferung');
  const key = path.join(ordner, 'key.pem');
  const cert = path.join(ordner, 'cert.pem');
  if (!fs.existsSync(cert)) {
    fs.mkdirSync(ordner, { recursive: true });
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30',
      '-keyout', key, '-out', cert, '-subj', '/CN=127.0.0.1',
      '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ], { stdio: 'ignore' });
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

/** Die Kopfzeilen aus firebase.json: `no-cache` überall, `/assets/**` für ein Jahr unveränderlich. */
function zwischenspeicherRegel(pfad) {
  return pfad.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
}

function appServer(dist, tls) {
  // Gepackte Fassungen je Datei einmal bilden — Firebase hält sie ebenso vor.
  const vorrat = new Map();
  const lesen = (datei) => {
    let v = vorrat.get(datei);
    if (!v) {
      const roh = fs.readFileSync(datei);
      const art = ARTEN[path.extname(datei)] ?? 'application/octet-stream';
      v = {
        roh,
        art,
        etag: `"${crypto.createHash('sha1').update(roh).digest('hex').slice(0, 16)}"`,
        br: PACKBAR.test(art) ? zlib.brotliCompressSync(roh) : null,
        gzip: PACKBAR.test(art) ? zlib.gzipSync(roh, { level: 9 }) : null,
      };
      vorrat.set(datei, v);
    }
    return v;
  };
  return http2.createSecureServer({ ...tls, allowHTTP1: true }, (req, res) => {
    const pfad = decodeURIComponent(new URL(req.url, 'https://x').pathname);
    let datei = path.join(dist, pfad);
    if (!datei.startsWith(dist) || !fs.existsSync(datei) || fs.statSync(datei).isDirectory()) {
      datei = path.join(dist, 'index.html');
    }
    const v = lesen(datei);
    const kopf = { 'content-type': v.art, 'cache-control': zwischenspeicherRegel(pfad), etag: v.etag, vary: 'accept-encoding' };
    if (req.headers['if-none-match'] === v.etag) {
      res.writeHead(304, kopf);
      res.end();
      return;
    }
    const annahme = String(req.headers['accept-encoding'] ?? '');
    let inhalt = v.roh;
    if (v.br && /\bbr\b/.test(annahme)) { inhalt = v.br; kopf['content-encoding'] = 'br'; }
    else if (v.gzip && /\bgzip\b/.test(annahme)) { inhalt = v.gzip; kopf['content-encoding'] = 'gzip'; }
    kopf['content-length'] = inhalt.length;
    res.writeHead(200, kopf);
    res.end(inhalt);
  });
}

const OHNE_WEITERGABE = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection', 'host']);

function apiServer(tls) {
  const server = http2.createSecureServer({ ...tls, allowHTTP1: true }, (req, res) => {
    const kopf = {};
    for (const [k, w] of Object.entries(req.headers)) {
      if (k.startsWith(':') || OHNE_WEITERGABE.has(k)) continue;
      kopf[k] = w;
    }
    // Der Stapel soll roh antworten — gepackt wird hier, wie es draussen die Kante tut.
    delete kopf['accept-encoding'];
    kopf.host = `${STAPEL.host}:${STAPEL.port}`;
    const weiter = http.request({ ...STAPEL, method: req.method, path: req.url, headers: kopf }, (antwort) => {
      const zurueck = {};
      for (const [k, w] of Object.entries(antwort.headers)) {
        if (OHNE_WEITERGABE.has(k)) continue;
        zurueck[k] = w;
      }
      const art = String(antwort.headers['content-type'] ?? '');
      const annahme = String(req.headers['accept-encoding'] ?? '');
      if (PACKBAR.test(art) && /\bgzip\b/.test(annahme) && !antwort.headers['content-encoding']) {
        delete zurueck['content-length'];
        zurueck['content-encoding'] = 'gzip';
        res.writeHead(antwort.statusCode ?? 502, zurueck);
        antwort.pipe(zlib.createGzip()).pipe(res);
      } else {
        res.writeHead(antwort.statusCode ?? 502, zurueck);
        antwort.pipe(res);
      }
    });
    weiter.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(weiter);
  });
  // Die Live-Verbindung (Websocket) läuft über HTTP/1.1 — wie bei Chrome ohne erweitertes CONNECT.
  server.on('upgrade', (req, socket, kopfDaten) => {
    const ziel = net.connect(STAPEL.port, STAPEL.host, () => {
      const zeilen = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const k = req.rawHeaders[i];
        zeilen.push(`${k}: ${k.toLowerCase() === 'host' ? `${STAPEL.host}:${STAPEL.port}` : req.rawHeaders[i + 1]}`);
      }
      ziel.write(`${zeilen.join('\r\n')}\r\n\r\n`);
      if (kopfDaten?.length) ziel.write(kopfDaten);
      ziel.pipe(socket);
      socket.pipe(ziel);
    });
    const zu = () => { ziel.destroy(); socket.destroy(); };
    ziel.on('error', zu);
    socket.on('error', zu);
  });
  return server;
}

/** Startet beide Seiten; gibt eine Funktion zum Beenden zurück. */
export async function auslieferungStarten(dist = path.resolve('dist')) {
  const tls = zertifikat();
  const app = appServer(dist, tls);
  const api = apiServer(tls);
  // Offene Sitzungen halten `close` sonst auf, bis der Browser sie fallen lässt.
  const offen = new Set();
  for (const s of [app, api]) {
    s.on('session', (sitzung) => { offen.add(sitzung); sitzung.on('close', () => offen.delete(sitzung)); });
    s.on('connection', (sock) => { offen.add(sock); sock.on('close', () => offen.delete(sock)); });
  }
  await Promise.all([
    new Promise((r) => app.listen(APP_PORT, '127.0.0.1', r)),
    new Promise((r) => api.listen(API_PORT, '127.0.0.1', r)),
  ]);
  return async () => {
    for (const o of offen) o.destroy();
    await Promise.all([new Promise((r) => app.close(r)), new Promise((r) => api.close(r))]);
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await auslieferungStarten();
  console.log(`App https://127.0.0.1:${APP_PORT} · Datenbank https://127.0.0.1:${API_PORT}`);
}
