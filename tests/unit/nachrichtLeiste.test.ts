import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { leistenPlatz, LEISTE_ABSTAND, type Kasten } from '@/features/nachrichten/leistenPlatz';
import { mitReaktion, wer } from '@/features/nachrichten/reaktionen';
import { moeglichkeiten } from '@/features/nachrichten/moeglichkeiten';
import type { KanalKopf, Nachricht } from '@/lib/db/nachrichten';

/*
  E77 (11.11.2026): die Leiste beim Darüberfahren und die Reaktionen.

  „Die Leiste darf den Text nicht verdecken“ — `leistenPlatz` gibt nur
  einen Platz zurück, an dem kein Hindernis liegt, und sonst `null` (dann
  bekommt die Leiste eine eigene Zeile). Gegenprobe je Fall: ein Hindernis
  genau dort, wo der Platz läge, schiebt die Wahl weiter oder auf `null`.
*/

const k = (links: number, oben: number, rechts: number, unten: number): Kasten => ({ links, oben, rechts, unten });
const eine = { breite: 293, hoehe: 34 };
const zwei = { breite: 174, hoehe: 67 };
const grenze = k(0, 0, 700, 900);
/** Eine eigene Blase rechts, 36 px hoch. */
const blatt = k(500, 400, 700, 436);
const platz = (x: Partial<Parameters<typeof leistenPlatz>[0]> = {}) =>
  leistenPlatz({ blatt, zeile: blatt, eigene: true, eine, zwei, hindernisse: [], grenze, ...x });
const schneidet = (a: Kasten, b: Kasten) => a.links < b.rechts && a.rechts > b.links && a.oben < b.unten && a.unten > b.oben;

describe('Wo die Leiste steht', () => {
  it('frei daneben: einzeilig auf der freien Seite, oben bündig, mit Abstand zur Blase', () => {
    expect(platz()).toEqual({ links: 500 - LEISTE_ABSTAND - 293, oben: 400, zeilen: 1 });
    // Bei den anderen ist rechts frei.
    expect(platz({ blatt: k(0, 400, 200, 436), zeile: k(0, 400, 200, 436), eigene: false })).toEqual({ links: 206, oben: 400, zeilen: 1 });
  });

  it('liegt daneben eine fremde Blase, rückt die Leiste nach unten bündig — dann zweizeilig, dann über und unter die Blase', () => {
    // Eine zweizeilige Blase; oben daneben steht eine fremde.
    const hoch = k(500, 400, 700, 480);
    expect(platz({ blatt: hoch, zeile: hoch, hindernisse: [k(0, 380, 300, 420)] })).toEqual({ links: 201, oben: 446, zeilen: 1 });
    // Beide einzeiligen Plätze belegt: zweizeilig, schmaler, dicht an der Blase.
    expect(platz({ hindernisse: [k(0, 380, 300, 480)] })).toEqual({ links: 500 - LEISTE_ABSTAND - 174, oben: 400, zeilen: 2 });
    // Die ganze freie Seite belegt: über der Blase.
    const p3 = platz({ hindernisse: [k(0, 330, 400, 470)] });
    expect(p3).toEqual({ links: 700 - 293, oben: 400 - LEISTE_ABSTAND - 34, zeilen: 1 });
  });

  it('nirgends frei — am Tablet die Regel —, dann `null`: der Verlauf macht Platz, die Leiste verdeckt nichts', () => {
    const schmal = k(0, 0, 294, 900);
    const b = k(88, 400, 294, 436);
    const oben = k(0, 340, 206, 396);
    const unten = k(88, 440, 294, 476);
    expect(leistenPlatz({ blatt: b, zeile: b, eigene: true, eine, zwei, hindernisse: [oben, unten], grenze: schmal })).toBeNull();
  });

  it('jeder Platz, der herauskommt, trifft weder die Blase noch ein Hindernis und liegt im sichtbaren Teil', () => {
    // Viele zufällige Gespräche, festgelegt durch einen einfachen Zufall mit Startwert.
    let s = 7;
    const zufall = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    for (let i = 0; i < 400; i++) {
      const breite = 220 + zufall() * 500;
      const g = k(0, 0, breite, 700);
      const eigene = zufall() > 0.5;
      const bb = 60 + zufall() * breite * 0.6;
      const oben = 100 + zufall() * 500;
      const b = eigene ? k(breite - bb, oben, breite, oben + 36 + zufall() * 60) : k(0, oben, bb, oben + 36 + zufall() * 60);
      const hindernisse = Array.from({ length: 6 }, () => {
        const y = zufall() * 700, w = 40 + zufall() * breite * 0.6;
        return zufall() > 0.5 ? k(breite - w, y, breite, y + 36) : k(0, y, w, y + 36);
      });
      const p = leistenPlatz({ blatt: b, zeile: b, eigene, eine, zwei, hindernisse, grenze: g });
      if (!p) continue;
      const gr = p.zeilen === 1 ? eine : zwei;
      const kasten = k(p.links, p.oben, p.links + gr.breite, p.oben + gr.hoehe);
      expect(schneidet(kasten, b), `Blase ${i}`).toBe(false);
      for (const h of hindernisse) expect(schneidet(kasten, h), `Hindernis ${i}`).toBe(false);
      expect(kasten.links >= 0 && kasten.rechts <= breite && kasten.oben >= 0 && kasten.unten <= 700, `sichtbar ${i}`).toBe(true);
    }
  });

  it('Gegenprobe: ohne Hindernisse wäre der erste Platz genau der, den die fremde Blase belegt', () => {
    const p = platz();
    const daneben = k(0, 380, 300, 420);
    expect(schneidet(k(p!.links, p!.oben, p!.links + 293, p!.oben + 34), daneben)).toBe(true);
  });
});

const n = (x: Partial<Nachricht> = {}): Nachricht => ({
  id: 'n1', vonUid: 'anna', vonName: 'Anna Huber', eigene: false, text: 'Hallo', gesendetAm: '2026-11-11T08:00:00Z',
  bearbeitetAm: null, geloeschtAm: null, erwaehnt: [], anhaenge: [], uebernommen: false, gemeldet: false, reaktionen: [], ...x,
});
const ICH = { uid: 'ich', name: 'Max Monteur' };
const ANNA = { uid: 'anna', name: 'Anna Huber' };

describe('Die eigene Reaktion, sofort im Verlauf', () => {
  it('setzen: neu als eigenes Kästchen, in der Reihenfolge der Leiste', () => {
    const vorher = n({ reaktionen: [{ zeichen: '🙏', anzahl: 1, meine: false, personen: [ANNA] }] });
    const r = mitReaktion(vorher, '👍', true, ICH).reaktionen;
    expect(r.map((x) => x.zeichen)).toEqual(['👍', '🙏']);
    expect(r[0]).toEqual({ zeichen: '👍', anzahl: 1, meine: true, personen: [ICH] });
    // Die alte Nachricht bleibt unberührt.
    expect(vorher.reaktionen).toHaveLength(1);
  });

  it('dazusetzen und zurücknehmen: die Zahl stimmt, die eigene Person steht zuerst', () => {
    const vorher = n({ reaktionen: [{ zeichen: '🙏', anzahl: 1, meine: false, personen: [ANNA] }] });
    const dazu = mitReaktion(vorher, '🙏', true, ICH);
    expect(dazu.reaktionen[0]).toEqual({ zeichen: '🙏', anzahl: 2, meine: true, personen: [ICH, ANNA] });
    expect(mitReaktion(dazu, '🙏', false, ICH).reaktionen[0]).toEqual({ zeichen: '🙏', anzahl: 1, meine: false, personen: [ANNA] });
    // Die letzte zurückgenommen: das Kästchen geht.
    expect(mitReaktion(n({ reaktionen: [{ zeichen: '👍', anzahl: 1, meine: true, personen: [ICH] }] }), '👍', false, ICH).reaktionen).toEqual([]);
  });

  it('gleich geblieben: zweimal setzen zählt nicht doppelt', () => {
    const einmal = mitReaktion(n(), '❤️', true, ICH);
    expect(mitReaktion(einmal, '❤️', true, ICH)).toBe(einmal);
  });

  it('wer reagiert hat: „Du“ zuerst, Gelöschte als solche', () => {
    expect(wer({ zeichen: '👍', anzahl: 2, meine: true, personen: [ICH, ANNA] }, 'ich')).toBe('Du, Anna Huber');
    expect(wer({ zeichen: '👍', anzahl: 1, meine: false, personen: [{ uid: 'x', name: '' }] }, 'ich')).toBe('Gelöschtes Konto');
  });
});

describe('Was man mit einer Nachricht tun kann (Leiste und Wahl gleich)', () => {
  const kopf = (x: Partial<KanalKopf> = {}): KanalKopf => ({
    kanal: 'k1', art: 'direkt', titel: 'Anna', name: null, projectId: null, teilnehmer: null,
    folgt: true, stumm: false, ungelesen: 0, sperre: null, ...x,
  });

  it('gelöscht: nichts; Schreibsperre: nicht reagieren, nicht bearbeiten — löschen und kopieren schon', () => {
    expect(Object.values(moeglichkeiten(n({ geloeschtAm: 'x', text: null }), kopf(), true)).some(Boolean)).toBe(false);
    expect(moeglichkeiten(n({ eigene: true }), kopf({ sperre: 'zu' }), true))
      .toEqual({ reagieren: false, bearbeiten: false, uebernehmen: true, kopieren: true, melden: false, loeschen: true });
    expect(moeglichkeiten(n(), kopf({ art: 'baustelle' }), true))
      .toEqual({ reagieren: true, bearbeiten: false, uebernehmen: false, kopieren: true, melden: true, loeschen: false });
    expect(moeglichkeiten(n({ gemeldet: true }), kopf(), true).melden).toBe(false);
  });
});

/*
  EMOJIS NUR ALS REAKTION (E77). Die Linie „Lot“ hat keine Emojis
  (`lotRegelnQuelltext.test.ts` prüft die Oberfläche); die sechs Zeichen
  stehen genau einmal als Daten in der Datenschicht.
*/
describe('Emojis nur als die sechs Reaktionen', () => {
  const dateien = (ordner: string): string[] => readdirSync(ordner).flatMap((d) => {
    const p = join(ordner, d);
    return statSync(p).isDirectory() ? dateien(p) : /\.(ts|tsx|css)$/.test(d) ? [p] : [];
  });
  const ZEICHEN = /👍|❤️|😆|😮|😢|🙏/u;
  const mitEmoji = dateien('src').filter((p) => ZEICHEN.test(readFileSync(p, 'utf8')));

  it('nur in der Datenschicht der Nachrichten', () => {
    expect(mitEmoji).toEqual([join('src', 'lib', 'db', 'pg', 'nachrichten.ts')]);
  });

  it('Gegenprobe: die Suche findet die Zeichen dort', () => {
    expect(readFileSync('src/lib/db/pg/nachrichten.ts', 'utf8')).toMatch(ZEICHEN);
  });
});

/*
  KEINE KLASSE ZWEIMAL (11.11.2026): `.wahl-liste` und `.wahl-zeile` gab es
  schon in der Lagerauswahl — die neuen Regeln hätten sie mitgestaltet. Die
  Klassen der Leiste, der Kästchen und der Wahl stehen nur in
  `lot-nachrichten.css`.
*/
describe('Die Klassen von E77 gibt es nur bei den Nachrichten', () => {
  const NEU = ['nachricht-leiste', 'leiste-reaktionen', 'leiste-handlungen', 'leiste-knopf', 'leiste-zeichen', 'nachricht-reaktionen',
    'reaktion', 'reaktion-zeichen', 'reaktion-zahl', 'nachricht-wahl-wer', 'wahl-fang', 'wahl-schwebend'];
  const stile = readdirSync('src/styles').filter((d) => d.endsWith('.css') && d !== 'lot-nachrichten.css')
    .map((d) => readFileSync(`src/styles/${d}`, 'utf8')).concat(readFileSync('src/index.css', 'utf8')).join('\n');
  const definiert = (klasse: string, css: string) => new RegExp(`\\.${klasse}(?![\\w-])`).test(css);

  it.each(NEU)('.%s steht in keiner anderen Stildatei', (klasse) => {
    expect(definiert(klasse, stile)).toBe(false);
    expect(definiert(klasse, readFileSync('src/styles/lot-nachrichten.css', 'utf8'))).toBe(true);
  });

  it('Gegenprobe: die alte Lagerauswahl wird gefunden', () => {
    expect(definiert('wahl-zeile', stile)).toBe(true);
  });
});

/*
  E78 (11.11.2026): „der Balken sollte einen leichten Ease-in bekommen“ und
  „der Kasten mit der Outline ist zu groß, plump und sieht billig aus“.
  Gegenprobe: mit dem Stand von E77 (ohne Animation, Kästchen 32 px mit
  Rahmen) ist jede dieser Prüfungen rot.
*/
describe('Die Leiste kommt sanft, die Reaktionen sind leicht (E78)', () => {
  const css = readFileSync('src/styles/lot-nachrichten.css', 'utf8');
  const regel = (sel: string) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const t = [...css.matchAll(new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))];
    expect(t, sel).toHaveLength(1);
    return t[0][1];
  };

  it('die Leiste blendet ein und rückt 4 px heran, in der Zeit eines Zustandswechsels', () => {
    expect(css).toMatch(/\.nachricht-leiste \{ z-index: 5;[^}]*animation: leiste-ein var\(--motion-state, 160ms\) var\(--ease-response, ease\) both; \}/);
    expect(css).toContain('@keyframes leiste-ein { from { opacity: 0; transform: translateY(0.25rem); } to { opacity: 1; transform: none; } }');
  });

  it('bei reduzierter Bewegung steht sie sofort da', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.nachricht-leiste \{ animation: none !important; \}/);
  });

  it('eine Stelle im Baum: über oder unter der Blase ordnet `order`', () => {
    expect(regel('.nachricht > :is(.nachricht-blatt, .nachricht-reaktionen, .nachricht-nochmal)')).toContain('order: 1;');
    expect(regel('.nachricht > .nachricht-leiste[data-seite="unten"]')).toContain('order: 2;');
    expect(regel('.nachricht > .nachricht-status')).toContain('order: 3;');
  });

  it('das Kästchen: 24 px hoch, ohne Rahmen, weich wie eine Blase; die eigene ohne Umrandung in Petrol-hell', () => {
    const r = regel('.reaktion');
    expect(r).toContain('height: 1.5rem;');
    expect(r).toContain('border: 0;');
    expect(r).toContain('border-radius: 999px;');
    expect(r).toContain('background: var(--surface-2);');
    expect(regel('.reaktion[aria-pressed="true"]')).toBe(' background: var(--petrol-hell); color: var(--accent-deep); ');
    // Getippt weiter 44 px: 24 px plus 2 × 10 px über und unter dem Feld.
    expect(regel('.reaktion::before')).toContain('inset: -0.625rem 0;');
  });
});
