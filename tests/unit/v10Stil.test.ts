import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
  DIE DESIGNLINIE V10 „WARMES PAPIER, KLARE ARBEIT“ (13.11.2026), soweit sie
  im Stil steht. Grundlage: style.md und der Implementierungsauftrag
  (docs/ui-umbau/entscheidungen.md, E92). Die Module ergänzen eigene Blöcke.
*/
const stil = (datei: string) => readFileSync(join('src/styles', datei), 'utf8');
const INDEX = readFileSync('src/index.css', 'utf8');
const LOT = stil('lot.css');
const ALLE_STILE = [INDEX, ...readdirSync('src/styles').filter((d) => d.endsWith('.css')).map(stil)].join('\n');
const ohneKommentare = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '');

function satz(name: 'hell' | 'dunkel'): string {
  if (name === 'hell') return INDEX.slice(INDEX.indexOf('\n:root {\n'), INDEX.indexOf('\n}\n', INDEX.indexOf('\n:root {\n')));
  const a = INDEX.indexOf("  :root[data-theme='dark'] {");
  return INDEX.slice(a, INDEX.indexOf('\n  }\n', a));
}
const wert = (s: string, name: string) => new RegExp(`\\n\\s*${name}:\\s*([^;]+);`).exec(s)?.[1]?.replace(' !important', '').trim();

describe('V10 Grundwerte', () => {
  it('Terrakotta ist die Primärfarbe, warmes Papier der Grund, das Blatt hell', () => {
    const hell = satz('hell');
    expect(wert(hell, '--brand')).toBe('#a85439');
    expect(wert(hell, '--bg')).toBe('#f4f0e8');
    expect(wert(hell, '--surface')).toBe('#fffdf8');
    expect(wert(hell, '--navi')).toBe('#292722');
    expect(wert(hell, '--auswahl')).toBe('#f3e4d8');
  });

  it('der dunkle Satz ist eine eigene warme Welt, keine Inversion — die Primäraktion bleibt Terrakotta', () => {
    const dunkel = satz('dunkel');
    expect(wert(dunkel, '--bg')).toBe('#211f1c');
    expect(wert(dunkel, '--surface')).toBe('#25221f');
    expect(wert(dunkel, '--brand')).toBe('#a85439');
    expect(wert(dunkel, '--accent-deep')).toBe('#d08a68');
    expect(wert(dunkel, '--chat-eigen')).toBe('#43362f');
  });

  it('Warnung und Fehler färben keine Flächen — ihre Hintergründe sind neutral', () => {
    const hell = satz('hell');
    for (const t of ['--warning-bg', '--danger-bg', '--info-bg', '--success-bg']) expect(wert(hell, t), t).toBe(wert(hell, '--surface'));
  });

  it('keine farbige Statuskante: kein Inset- oder Randstrich in Warn- oder Fehlerfarbe', () => {
    const funde = ohneKommentare(ALLE_STILE).split('\n').filter((z) =>
      /inset \d+px 0 0 var\(--(warning|danger|achtung|fehler)\)|border-left:[^;]*var\(--(warning|danger|achtung|fehler)\)/.test(z));
    expect(funde).toEqual([]);
  });

  it('Gegenprobe: eine Warnkante fiele auf', () => {
    expect(/inset \d+px 0 0 var\(--(warning|danger|achtung|fehler)\)/.test('.x { box-shadow: inset 3px 0 0 var(--warning); }')).toBe(true);
  });

  it('Radien nach Rolle: Zeile 8, Feld/Knopf 12, Blatt 16, Sheet/Insel 24 px', () => {
    const hell = satz('hell');
    expect(wert(hell, '--radius-sm')).toBe('0.5rem');
    expect(wert(hell, '--radius')).toBe('0.75rem');
    expect(wert(hell, '--radius-lg')).toBe('1rem');
    expect(wert(hell, '--radius-xl')).toBe('1.5rem');
  });

  it('Schriften: DM Sans, Source Serif 4 für Titel, Plex Mono für Gemessenes — alle lokal', () => {
    expect(INDEX).toContain("--schrift-text: 'DM Sans'");
    expect(INDEX).toContain("--schrift-titel: 'Source Serif 4'");
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main).toContain("@fontsource/dm-sans/latin-400.css");
    expect(main).toContain("@fontsource/source-serif-4/latin-400.css");
    expect(main).not.toMatch(/fonts\.googleapis|poppins/i);
  });
});

describe('V10 App-Hülle', () => {
  it('Kopf- und Fußleiste am Handy sind Inseln mit demselben Radius und Schatten', () => {
    const kopf = /\.kopfzeile \{[^}]*\}/.exec(LOT)![0];
    const fuss = /\.unten \{[^}]*\}/.exec(LOT)![0];
    for (const r of [kopf, fuss]) {
      expect(r).toContain('border-radius: var(--radius-xl)');
      expect(r).toContain('box-shadow: var(--shadow-insel)');
      expect(r).toContain('border: 1px solid var(--insel-kontur)');
    }
  });

  it('die Hauptaktion am Handy steht kompakt rechts, ohne Balkenfläche', () => {
    expect(LOT).toMatch(/\.daumen \{ display: flex; justify-content: flex-end;[^}]*background: none; border: 0;/);
    expect(LOT).toContain('.daumen > * { flex: none;');
  });

  it('die Meldung trägt keine rote Kante', () => {
    expect(/\.meldung-fehler \{[^}]*\}/.exec(LOT)![0]).not.toMatch(/border-left/);
  });
});

/*
  V10 NACHRICHTEN (13.11.2026; style.md „Kernseiten, Arbeitstag und
  Nachrichten“, Auftrag 11.6): eingehende Beiträge ohne Blase, nur eigene
  in einer kompakten warmen Blase; eine Eingabefläche mit Anhang links und
  rundem Sendeziel rechts; Suche im gemeinsamen Muster, Filter als Texttabs,
  Ungelesen als Zahl in Terrakotta. Gegenprobe: mit dem Stand vor dem Umbau
  (graue Blasen mit Zipfel, Petrol-Blase, Zeichen neben einer Pille,
  Filter-Pillen, gefüllte Zahl) ist jeder Test dieses Blocks rot.
*/
describe('V10 Nachrichten', () => {
  const N = stil('lot-nachrichten.css');
  const NK = ohneKommentare(N);
  const quelle = (pfad: string) => readFileSync(pfad, 'utf8');
  /** Der Körper der einen Regel mit genau diesem Selektor. */
  const regel = (sel: string) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const t = [...NK.matchAll(new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))];
    expect(t, sel).toHaveLength(1);
    return t[0][1];
  };
  /** Setzt irgendeine Regel für eingehende Beiträge (oder alle) eine Fläche an den Beitrag? */
  const blaseFuerEingehende = (css: string) => css.split('\n').some((z) => {
    const m = /^\s*([^{]*\.nachricht-blatt[^{]*)\{([^}]*)\}/.exec(z);
    if (!m) return false;
    // Nur für eigene gilt ein Selektor mit `[data-eigene]` — nicht mit `:not([data-eigene])`.
    const fuerEingehende = m[1].split(',').some((s) => !/\[data-eigene\](?!\))/.test(s));
    return fuerEingehende && /background:\s*var\(--(surface-3|surface-2|petrol|chat-eigen)\)|::before/.test(m[1] + m[2]);
  });

  it('eingehende Beiträge stehen ohne Blase und ohne Zipfel im Lesefluss', () => {
    expect(blaseFuerEingehende(NK)).toBe(false);
    expect(NK).not.toMatch(/\.nachricht-blatt[^{]*::(before|after)/);
    // Text auf der Flucht des Namens, in Lesezeilenlänge.
    expect(regel('.nachricht:not([data-eigene])')).toContain('padding-left: 2rem;');
    expect(regel('.nachricht:not([data-eigene]) > .nachricht-kopf')).toContain('margin-left: -2rem;');
    expect(regel('.nachricht-blatt')).toContain('max-width: min(42rem, 100%);');
  });

  it('Gegenprobe: die graue Blase mit Zipfel von E71 fiele auf', () => {
    expect(blaseFuerEingehende('  .nachricht-blatt { position: relative; max-width: 78%; border-radius: 1.125rem; background: var(--surface-3); color: var(--text); }')).toBe(true);
    expect(blaseFuerEingehende('  .nachricht[data-ende]:not([data-eigene]) .nachricht-blatt:not([data-weg])::before { left: -0.4375rem; }')).toBe(true);
    expect(blaseFuerEingehende('  .nachricht[data-eigene] .nachricht-blatt { background: var(--chat-eigen); }')).toBe(false);
  });

  it('nur die eigene Nachricht ist eine kompakte warme Blase: --chat-eigen, feine Kontur, 12 px', () => {
    const r = regel('.nachricht[data-eigene] .nachricht-blatt');
    expect(r).toContain('border: 1px solid var(--chat-eigen-kontur);');
    expect(r).toContain('border-radius: var(--radius);');
    expect(r).toContain('background: var(--chat-eigen);');
    expect(r).toContain('color: var(--chat-eigen-text);');
    expect(r).toMatch(/max-width: \d+%;/);
    expect(regel('.nachricht[data-eigene] .nachricht-text')).toContain('color: var(--chat-eigen-text);');
    // Dunkel: #43362F mit #F3EEE6 und der Kontur #654C3E; hell #E8DACC mit #2D2924.
    expect(wert(satz('dunkel'), '--chat-eigen-text')).toBe('#f3eee6');
    expect(wert(satz('dunkel'), '--chat-eigen-kontur')).toBe('#654c3e');
    expect(wert(satz('hell'), '--chat-eigen')).toBe('#e8dacc');
    expect(wert(satz('hell'), '--chat-eigen-text')).toBe('#2d2924');
  });

  it('der Kopf der Gruppe: Absenderzeichen, Name und Uhrzeit in Plex Mono', () => {
    expect(regel('.nachricht-zeichen')).toContain('width: 1.5rem; height: 1.5rem;');
    expect(regel('.nachricht-uhr')).toContain('font-family: var(--schrift-mono);');
    const g = quelle('src/features/nachrichten/Gespraech.tsx');
    expect(g).toContain('<div className="nachricht-kopf" aria-hidden="true">');
    expect(g).toContain('<span className="nachricht-zeichen">{kuerzel(name)}</span>');
  });

  it('eine Eingabefläche: Anhang links darin, rundes Sendeziel rechts, 44 px, Terrakotta', () => {
    const g = quelle('src/features/nachrichten/Gespraech.tsx');
    const pille = g.indexOf('<div className="eingabe-pille">');
    const anhang = g.indexOf('aria-label="Anhang"');
    const feld = g.indexOf('className="eingabe-feld"');
    const senden = g.indexOf('className="chat-senden"');
    expect(pille).toBeGreaterThan(0);
    expect(pille < anhang && anhang < feld && feld < senden).toBe(true);
    expect(regel('.eingabe-pille')).toContain('border: 1px solid var(--border-strong); border-radius: var(--radius-lg);');
    const s = regel('.chat-senden');
    expect(s).toContain('width: 2.75rem; height: 2.75rem; border-radius: 999px; background: var(--petrol);');
  });

  it('Liste: gemeinsames Suchmuster, Filter als Texttabs, Ungelesen als Zahl in Terrakotta ohne Fläche', () => {
    const p = quelle('src/features/nachrichten/Postfach.tsx');
    expect(p).toContain('<label className="suche chat-suche">');
    expect(p).toContain('className="segment chat-filter"');
    expect(p).not.toContain('className="chat-chip"');
    const z = regel('.postfach-zahl');
    expect(z).toContain('color: var(--accent-deep);');
    expect(z).not.toMatch(/background|border-radius/);
    // Das offene Gespräch ist eine Auswahl.
    expect(regel('.postfach-zeile[data-aktiv]')).toBe(' background: var(--auswahl); box-shadow: inset 0 0 0 1px var(--auswahl-kontur); ');
  });

  it('rund sind nur Kürzel und die runden Ziele; keine Hexwerte im Stil der Nachrichten', () => {
    const rund = NK.split('\n').filter((z) => z.includes('999px')).map((z) => z.trim().split('{')[0].trim());
    for (const sel of rund) expect(sel, sel).toMatch(/^\.(postfach-kuerzel, \.chat-kuerzel|nachricht-zeichen|chat-rund|chat-senden)$/);
    expect(NK).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('gleich bleibt: am Telefon steht im Gespräch keine Timer-Leiste über der Eingabe', () => {
    expect(quelle('src/features/time/TimerLeiste.tsx')).toContain("telefon: ['/', '/time', '/nachrichten/:kanal'],");
  });
});

/*
  V10 START UND ZEIT (13.11.2026; style.md „Kernseiten, Arbeitstag“, „Mobile
  Kernabläufe · E90“, Auftrag 11.1): der laufende Arbeitstag ist eine
  dunkle ruhige Fläche mit Terrakotta nur als Punkt, bereit und Pause sind
  hell und voneinander verschieden; die große Karte beschriftet ihre Knöpfe,
  die kompakte Karte und die Leiste tragen nur Symbole; die Leiste ist am
  Handy eine Insel wie Kopf und Fuß. Gegenprobe: mit dem Stand vor dem Umbau
  (ein eckiges Blatt in jedem Zustand, Linie als Zeichnung, Leiste als Balken
  mit Strich, Abschnittsköpfe in Versalien) ist jeder Test dieses Blocks rot.
*/
describe('V10 Start und Zeit', () => {
  const T = stil('lot-timer.css');
  const TK = ohneKommentare(T);
  const S = ohneKommentare(stil('lot-start.css'));
  const Z = ohneKommentare(stil('lot-zeit.css'));
  const quelle = (pfad: string) => readFileSync(pfad, 'utf8');
  /** Alle Regeln einer Stildatei als [Selektor, Körper]. */
  const regeln = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim().replace(/\s+/g, ' '), m[2]] as const);
  /** Der Körper der ersten Regel mit genau diesem Selektor (Grundregel vor ihren Breiten). */
  const koerper = (css: string, sel: string) => {
    const t = regeln(css).filter(([s]) => s === sel);
    expect(t.length, sel).toBeGreaterThan(0);
    return t[0][1];
  };

  /* Kontrast nach WCAG, aus den Grundwerten des jeweiligen Satzes. */
  const hex = (h: string) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const leucht = (h: string) => { const [r, g, b] = hex(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const kontrast = (a: string, b: string) => { const [x, y] = [leucht(a), leucht(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  /** Jede Schriftfarbe einer Zustandsregel gegen die Fläche dieses Zustands. */
  const zuWenig = (css: string, zustand: 'laeuft' | 'pause', flaeche: string, name: 'hell' | 'dunkel') => regeln(css)
    .filter(([s]) => s.includes(`[data-stand='${zustand}']`))
    .flatMap(([s, k]) => [...k.matchAll(/(?:^|[\s;])color:\s*var\((--[a-z-]+)\)/g)].map((m) => [s, m[1]] as const))
    .map(([s, v]) => [s, v, kontrast(wert(satz(name), v)!, wert(satz(name), flaeche)!)] as const)
    .filter(([, , k]) => k < 4.5)
    .map(([s, v, k]) => `${s}: ${v} ${k.toFixed(2)}:1`);

  it('drei Zustände: bereit ein helles Blatt, läuft die dunkle Fläche, Pause der warme Pausenton', () => {
    const blatt = koerper(TK, '.arbeitstag');
    // Der Umriss statt eines Rands (14.11.2026): keine Höhe, der Taktgeber hängt nichts an.
    expect(blatt).toContain('border: 0; outline: 1px solid var(--border); outline-offset: -1px; border-radius: var(--radius-lg); background: var(--surface);');
    expect(blatt).not.toMatch(/box-shadow/);
    expect(koerper(TK, ".arbeitstag[data-stand='laeuft']")).toBe(' outline-color: var(--dunkel-flaeche); background: var(--dunkel-flaeche); color: var(--auf-dunkel); ');
    expect(koerper(TK, ".arbeitstag[data-stand='pause']")).toBe(' background: var(--pause-flaeche); ');
    expect(quelle('src/features/time/ArbeitstagKarte.tsx')).toContain("data-stand={s ? (pause ? 'pause' : 'laeuft') : 'bereit'}");
  });

  it('Terrakotta ist auf der laufenden Karte nur der Punkt — keine orange Fläche', () => {
    const terrakotta = (css: string) => regeln(css)
      .filter(([s]) => s.includes("[data-stand='laeuft']"))
      .filter(([, k]) => /background(?:-color)?:[^;]*var\(--(petrol|brand|accent)\b/.test(k))
      .map(([s]) => s)
      .filter((s) => !/arbeitstag-punkt$/.test(s));
    expect(terrakotta(TK)).toEqual([]);
    // Der Punkt selbst ist aufgehellt (Token „Terrakotta auf Dunkel“), damit er auf dem Dunkel sichtbar bleibt.
    expect(koerper(TK, ".arbeitstag[data-stand='laeuft'] .arbeitstag-punkt")).toContain('var(--auf-dunkel-akzent)');
    // Gegenprobe: ein Terrakotta-Knopf auf dem Dunkel fiele auf.
    expect(terrakotta(".arbeitstag[data-stand='laeuft'] .rund-knopf-voll { background: var(--petrol); }")).toHaveLength(1);
  });

  it('jede Schrift auf dem Dunkel und dem Pausenton trägt 4,5 : 1 — in beiden Sätzen', () => {
    // Nicht leer geprüft: die Zustände setzen ihre Schrift selbst.
    expect(regeln(TK).filter(([s, k]) => s.includes("[data-stand='laeuft']") && /color:/.test(k)).length).toBeGreaterThan(8);
    for (const name of ['hell', 'dunkel'] as const) {
      expect(zuWenig(TK, 'laeuft', '--dunkel-flaeche', name), name).toEqual([]);
      expect(zuWenig(TK, 'pause', '--pause-flaeche', name), name).toEqual([]);
    }
    // Gegenprobe: Nebentext und Fehlerrot auf dem Dunkel fielen durch.
    expect(zuWenig(".arbeitstag[data-stand='laeuft'] .x { color: var(--text-muted); }", 'laeuft', '--dunkel-flaeche', 'hell')).toHaveLength(1);
    expect(zuWenig(".arbeitstag[data-stand='laeuft'] .arbeitstag-fehler { color: var(--danger); }", 'laeuft', '--dunkel-flaeche', 'hell')).toHaveLength(1);
  });

  it('große Karte mit Wort unter dem Kreis, kompakte Karte am Handy und Leiste nur mit Symbol', () => {
    expect(koerper(TK, '.rund-aktion-text')).toContain('display: none;');
    expect(TK).toMatch(/@media \(min-width: 760px\) \{ \.rund-aktion-text \{ display: block; \} \}/);
    const karte = ohneKommentare(quelle('src/features/time/ArbeitstagKarte.tsx'));
    for (const [name, wort] of [['Pause beginnen', 'Pause'], ['Weiterarbeiten', 'Weiter'], ['Stoppen und prüfen', 'Stopp']]) {
      expect(karte, wort).toMatch(new RegExp(`className="rund-aktion" aria-label="${name}"[^\\n]*\\n\\s*<span className="rund-knopf[^"]*">[^\\n]*\\n\\s*<span className="rund-aktion-text" aria-hidden="true">${wort}</span>`));
    }
    const leiste = ohneKommentare(quelle('src/features/time/TimerLeiste.tsx'));
    expect(leiste).not.toContain('rund-aktion-text');
    expect((leiste.match(/<button/g) ?? []).length).toBe((leiste.match(/<button[^>]*aria-label="/g) ?? []).length);
    // Ziele: Kreis 56 px, in der Leiste 44 px.
    expect(koerper(TK, '.rund-knopf')).toContain('width: 3.5rem; height: 3.5rem;');
    expect(koerper(TK, '.rund-knopf-klein')).toBe(' width: 2.75rem; height: 2.75rem; ');
  });

  it('Gegenprobe: ein Knopf ohne zugänglichen Namen und ein sichtbares Wort am Handy fielen auf', () => {
    const ohneName = '<button type="button" className="rund-knopf"><Icon name="pause" /></button>';
    expect((ohneName.match(/<button/g) ?? []).length).not.toBe((ohneName.match(/<button[^>]*aria-label="/g) ?? []).length);
    expect(/@media \(min-width: 760px\) \{ \.rund-aktion-text \{ display: block; \} \}/.test('.rund-aktion-text { display: block; }')).toBe(false);
  });

  it('die Uhr springt nicht und pulsiert nicht: tabellarische Ziffern, keine Animation', () => {
    for (const sel of ['.arbeitstag-uhr', '.timer-leiste-uhr']) {
      expect(koerper(TK, sel), sel).toContain('font-variant-numeric: tabular-nums;');
      expect(koerper(TK, sel), sel).toContain('white-space: nowrap;');
    }
    expect(TK).not.toMatch(/animation|@keyframes/);
    // Gegenprobe
    expect(/animation|@keyframes/.test('.arbeitstag-punkt { animation: puls 2s infinite; }')).toBe(true);
  });

  it('am Handy ist die Leiste eine Insel wie Kopf und Fuß; ohne laufenden Tag nimmt sie keinen Platz', () => {
    const insel = koerper(TK, '.timer-leiste-telefon > .timer-leiste');
    expect(insel).toContain('border: 1px solid var(--insel-kontur); border-radius: var(--radius-xl); box-shadow: var(--shadow-insel);');
    expect(koerper(TK, '.timer-leiste-telefon:empty')).toBe(' padding: 0; ');
    // Ab dem Tablet ein schwebendes Blatt an der Kante der Blätter.
    expect(koerper(TK, '.timer-leiste-breit .timer-leiste')).toContain('border-radius: var(--radius-lg); box-shadow: var(--shadow-insel);');
  });

  it('Warnung und Fehler färben im Arbeitstag, auf Start und in der Zeit keine Fläche', () => {
    const flaeche = (css: string) => regeln(css)
      .filter(([s, k]) => !/punkt/.test(s) && /background(?:-color)?:[^;]*var\(--(warning|danger|achtung|fehler)\)/.test(k))
      .map(([s]) => s);
    expect([...flaeche(TK), ...flaeche(S), ...flaeche(Z)]).toEqual([]);
    expect(koerper(TK, '.arbeitstag-fehler')).not.toMatch(/background|border/);
    expect(flaeche('.arbeitstag-fehler { background: var(--danger-bg); color: var(--danger); }')).toEqual([]);
    expect(flaeche('.arbeitstag-fehler { background: var(--danger); }')).toHaveLength(1);
  });

  it('Felder und Knöpfe der Zeit liegen ohne Schatten auf dem Blatt', () => {
    const schatten = ['src/features/time/TimeForm.tsx', 'src/features/time/TimeView.tsx', 'src/features/time/ArbeitstagKarte.tsx', 'src/features/dashboard/start/HeuteEigene.tsx']
      .filter((p) => /\bshadow-(sm|md|lg|xl)\b/.test(ohneKommentare(quelle(p))));
    expect(schatten).toEqual([]);
    expect(/\bshadow-(sm|md|lg|xl)\b/.test('rounded border shadow-sm transition')).toBe(true);
  });

  it('Abschnittsköpfe der Startseite in normaler Schreibung, nicht als gesperrte Versalien', () => {
    const k = koerper(S, '.start-seite .start-abschnitt');
    expect(k).toContain('text-transform: none;');
    expect(k).toContain('letter-spacing: 0;');
    expect(k).not.toMatch(/uppercase|letter-spacing: 0\.\d/);
  });

  it('gleich geblieben: am Handy die Wegeleiste mit Trennlinie, „Zeit von Hand“ nur am Handy, Logik am Kontext', () => {
    expect(koerper(S, '.einsatz-weg + .einsatz-weg')).toBe(' border-left: 1px solid var(--border); ');
    expect(TK).toMatch(/@media \(min-width: 760px\) \{ \.arbeitstag-hand \{ display: none; \} \}/);
    const karte = quelle('src/features/time/ArbeitstagKarte.tsx');
    expect(karte).toContain("if (await z.befehl('stop', s, laufendeBaustelle)) navigate('/time', { state: { pruefen: s.id } });");
    expect(karte).toContain('const z = useZeitsitzung();');
  });
});

/*
  V10 AUFTRÄGE (13.11.2026): Handwerksscheine, Akten (Baustelle, Kunde,
  Liegenschaft), Angebote samt öffentlicher Annahme, Wartungen. Jede Regel
  mit Gegenprobe: der Stand davor fiele mit derselben Prüfung durch.
*/
describe('V10 Aufträge', () => {
  const aDatei = (p: string) => readFileSync(p, 'utf8');
  const aRegel = (css: string, sel: string) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\n)\\s*${esc} \\{([^}]*)\\}`).exec(ohneKommentare(css))?.[1] ?? '';
  };
  const AKTEN = stil('lot-akten.css');
  const AUFTRAEGE = stil('lot-auftraege.css');
  const SCHEINE = stil('lot-scheine.css');
  const eckmarken = (k: string) => /background-image:\s*linear-gradient/.test(k);

  it('die Kontextspalte ist ruhig: keine Eckmarken, ab dem Tablet eine feine Linie — Akte und Beleg gleich', () => {
    expect(eckmarken(aRegel(AKTEN, '.akten-kontext'))).toBe(false);
    expect(eckmarken(aRegel(AUFTRAEGE, '.beleg-kontext'))).toBe(false);
    expect(eckmarken(aRegel(stil('lot-plattform.css'), '.plattform-kontext'))).toBe(false);
    expect(aRegel(stil('lot-plattform.css'), '.plattform-kontext')).toContain('border-left: 1px solid var(--border);');
    expect(AKTEN).toMatch(/@media \(min-width: 760px\) \{[^}]*\}\s*\.akten-kontext \{ padding-left: 1\.375rem; border-left: 1px solid var\(--border\); \}/);
    expect(aRegel(AUFTRAEGE, '.beleg-kontext')).toContain('padding: 0.75rem 0 1rem 1.375rem; border-left: 1px solid var(--border);');
    // Gleiche Überschriften: Versalien und Sperrung, aber nicht fett.
    expect(aRegel(AKTEN, '.akten-kontext .karte-kopf h2')).toContain('font-weight: 400;');
    expect(aRegel(AUFTRAEGE, '.beleg-kontext .karte-kopf h2')).toContain('font-weight: 400;');
    // Gegenprobe: der Stand mit Passermarken fiele auf.
    expect(eckmarken(' min-width: 0; background-color: transparent; background-image: linear-gradient(var(--border-strong), var(--border-strong)); ')).toBe(true);
  });

  it('Aktenbereiche sind Texttabs mit Unterlinie in Terrakotta, keine Segmentkästen', () => {
    const an = aRegel(AKTEN, ".akten-reiter[aria-selected='true']");
    expect(an).toContain('border-bottom-color: var(--brand);');
    expect(an).not.toMatch(/background|border-radius|box-shadow/);
    expect(aRegel(AKTEN, '.akten-reiter')).toContain('background: transparent;');
    expect(aRegel(AKTEN, '.akten-reiter')).toMatch(/transition: color var\(--motion-state/);
    // Gegenprobe: ein Segmentkasten (Fläche am gewählten Reiter) fiele auf.
    expect('border-bottom-color: var(--brand); background: var(--auswahl);').toMatch(/background|border-radius|box-shadow/);
  });

  it('Beträge, Stunden, Zeiten und Nummern der Akten stehen in Plex Mono', () => {
    for (const [css, sel] of [[AKTEN, '.akten-belegbetrag'], [AKTEN, '.akten-stunden-zahl'], [AKTEN, '.akten-termin-zeit'], [AKTEN, '.akten-termin-tag'], [AKTEN, '.akten-zeile-nummer'], [AUFTRAEGE, '.budget-prozent']] as const) {
      expect(aRegel(css, sel), sel).toContain('font-family: var(--schrift-mono);');
    }
    // Die Einheit unter dem Betrag („netto“) ist Text, nicht Gemessenes.
    expect(aRegel(AKTEN, '.akten-belegbetrag small')).toContain('font-family: var(--schrift-text);');
    // Das Datum des nächsten Termins ohne Farbkante.
    expect(aRegel(AKTEN, '.akten-termin-datum')).toContain('border-left: 1px solid var(--border-strong);');
    // Gegenprobe: die alte Zeile ohne Mono fiele auf.
    expect(' font-size: 0.875rem; font-weight: var(--gewicht-zahl); ').not.toContain('font-family: var(--schrift-mono);');
  });

  it('Schein: die gewählte Baustelle ist Auswahl (Fläche, feine Kontur, Häkchen), kein Akzentrahmen', () => {
    const an = aRegel(SCHEINE, '.schein-einsatz-an');
    expect(an).toContain('border: 1px solid var(--auswahl-kontur);');
    expect(an).toContain('background: var(--auswahl);');
    expect(an).not.toMatch(/--petrol|2px solid/);
    // Gleiche Rahmenstärke an beiden Zuständen: der Text springt beim Wählen nicht.
    expect(aRegel(SCHEINE, '.schein-einsatz')).toContain('border: 1px solid var(--border);');
    expect(aDatei('src/features/worksheets/WorkSheetView.tsx')).toContain('{projectNumber === e.projectNumber && <Icon name="haken" className="schein-einsatz-haken" />}');
    // Gegenprobe: die alte Auswahl fiele auf.
    expect(' border: 2px solid var(--petrol); background: var(--petrol-hell); ').toMatch(/--petrol|2px solid/);
  });

  it('Schein am Handy: „Entwurf“ leise links als Textaktion, der Abschluss die eine Hauptaktion rechts (E90)', () => {
    const ws = aDatei('src/features/worksheets/WorkSheetView.tsx');
    expect(ws).toContain('className="schein-entwurf-leise"');
    expect(ws).not.toMatch(/variant="ghost"\s+onClick=\{alsEntwurfSichern\}/);
    expect(aRegel(SCHEINE, '.schein-entwurf-leise')).toMatch(/min-height: 3rem;[^]*border: 0; background: none;/);
    // „Weiter zurück prüfen“: der gewählte Zeitraum ist Auswahl, kein gefüllter Hauptknopf.
    const liste = aDatei('src/features/worksheets/WorkSheetsListView.tsx');
    expect(liste).not.toContain("variant={tiefePruefung === tage ? 'primary' : 'secondary'}");
    expect(liste).toContain('aria-pressed={tiefePruefung === tage}');
    expect(aRegel(SCHEINE, ".pruef-zeitraum[aria-pressed='true']")).toContain('background: var(--auswahl);');
    // Gegenprobe: der alte Knopf fiele auf.
    expect(/variant="ghost"\s+onClick=\{alsEntwurfSichern\}/.test('<Button\n  variant="ghost"\n  onClick={alsEntwurfSichern}')).toBe(true);
  });

  it('Schein: der Hauptschritt kompakt rechts, und die Abschlusszone klebt über der Navigation', () => {
    const ws = aDatei('src/features/worksheets/WorkSheetView.tsx');
    expect(ws).toContain('<Button className="schein-abschluss-haupt" onClick={() => springe(naechster.nr)}>');
    expect(ws).toContain("unterschreibenKnopf('schein-abschluss-haupt')");
    expect(aRegel(SCHEINE, '.schein-abschluss-haupt')).toContain('justify-self: end;');
    // In einer eigenen, gleich hohen Hülle hätte `sticky` keinen Weg (so stand die Leiste bis 13.11. erst am Seitenende).
    const huelle = /<div className="space-y-3">\s*\{error && <ErrorState message=\{error\} \/>\}/;
    expect(huelle.test(ws)).toBe(false);
    // Gegenprobe: der Stand davor fiele auf.
    expect(huelle.test('<div className="space-y-3">\n          {error && <ErrorState message={error} />}')).toBe(true);
  });

  it('Unterschrift: „Neu zeichnen“ links und „Fertig“ rechts in einer Zeile unter dem Feld; der Hinweis im leeren Feld bleibt', () => {
    const pad = aDatei('src/components/SignaturePad.tsx');
    const zeile = /<div className="unterschrift-blatt-aktionen">([\s\S]*?)<\/div>/.exec(pad)?.[1] ?? '';
    expect(zeile.indexOf('Neu zeichnen')).toBeGreaterThan(-1);
    expect(zeile.indexOf('Neu zeichnen')).toBeLessThan(zeile.indexOf('Fertig'));
    expect(aRegel(SCHEINE, '.unterschrift-blatt-aktionen')).toContain('justify-content: space-between;');
    // Die Zeile steht unter der Zeichenfläche, nicht neben dem Titel.
    expect(pad.indexOf('unterschrift-blatt-aktionen')).toBeGreaterThan(pad.indexOf("zeichenflaeche('h-full w-full"));
    expect(pad).toContain('Mit dem Finger unterschreiben</span>');
    // Der Blatttitel regulär in der Titelschrift, nie 600.
    expect(aRegel(SCHEINE, '.unterschrift-blatt-titel')).toMatch(/font-family: var\(--schrift-titel\);[^]*font-weight: 400;/);
    // Gegenprobe: die alte Anordnung (Knöpfe neben dem Titel) hat keine solche Zeile.
    expect(/<div className="unterschrift-blatt-aktionen">/.test('<div className="flex gap-2"><Button>Neu zeichnen</Button><Button data-fertig="">Fertig</Button></div>')).toBe(false);
  });

  it('gleich geblieben: die Zeichenfläche hält die Geste, „Fertig“ schließt nur das Blatt', () => {
    const pad = aDatei('src/components/SignaturePad.tsx');
    expect(pad).toContain("style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}");
    expect(pad).toContain('<Button type="button" onClick={blattSchliessen} data-fertig="">');
    expect(pad).toContain('<Button type="button" variant="secondary" onClick={leeren} disabled={!hatStriche}>');
  });

  it('Wartungen: je Zeile höchstens eine gerahmte Nebenhandlung — gefüllt ist nur „Neue Wartung“', () => {
    const w = aDatei('src/features/maintenance/WartungenView.tsx');
    expect(w).toContain('<Button variant="secondary" onClick={() => einplanenFragen(w)}>Baustelle anlegen</Button>');
    expect(w).not.toContain('<Button onClick={() => einplanenFragen(w)}>Baustelle anlegen</Button>');
  });

  it('die öffentliche Annahme zeigt Datumswerte in Plex Mono und bleibt ohne App-Hülle', () => {
    const a = aDatei('src/features/angebotAnnahme/AngebotAnnahmeSeite.tsx');
    expect(a).toContain('<Angabe wort="Gültig bis"><span className="mono">{datumAT(q.validUntil)}</span></Angabe>');
    expect(a).not.toMatch(/from '@\/app\/(Layout|Navigation)'/);
  });
});

/*
  V10 MATERIAL (13.11.2026, style.md „Material · E89“, Auftrag 11.3): der
  Kreis „In die Liste“ ist eine Linie, keine gefüllte Hauptaktion je Zeile;
  Kreis und Mengensteuerung sind gleich hoch; die Zeile mit Artikel in der
  Liste trägt den Auswahlton mit feiner Kontur; die Herkunft beim Abholen ist
  die Auswahl mit Häkchen; die Aktionen im Seitenfenster stehen kompakt
  rechts. Gegenprobe: mit dem Stand davor (`IconButton rund`, Optionspunkte,
  Aktionen untereinander) sind die Prüfungen rot; die Gegenproben unten
  zeigen, dass die Muster einen Rückfall fänden.
*/
describe('V10 Material', () => {
  const MAT = ohneKommentare(stil('lot-material.css'));
  const regel = (sel: string) => new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(MAT)?.[2] ?? '';
  const quelle = (d: string) => readFileSync(d, 'utf8');
  const BESTELLEN = quelle('src/features/orders/OrderView.tsx');
  /** Ein gefüllter Kreis: eine Fläche in Primär- oder Akzentfarbe am Knopf selbst. */
  const gefuellt = (r: string) => /background(-color)?:\s*var\(--(petrol|brand|brand-fixed|accent-deep)\)/.test(r);

  it('der Kreis „In die Liste“ ist eine Linie in Terrakotta, keine gefüllte Fläche', () => {
    const kreis = regel('.korb-kreis');
    expect(kreis).toContain('background: transparent');
    expect(kreis).toContain('color: var(--accent-deep)');
    expect(gefuellt(kreis)).toBe(false);
    expect(regel('.korb-kreis::before')).toMatch(/border: 1px solid currentColor/);
    expect(BESTELLEN).not.toMatch(/<IconButton\s+rund\b/);
  });

  it('Gegenprobe: der gefüllte Petrol-Kreis von vorher fiele auf', () => {
    expect(gefuellt('flex: none; width: 3rem; height: 3rem; padding: 4px; border: 0; border-radius: 999px; background: var(--petrol); background-clip: content-box;')).toBe(true);
  });

  it('Kreis und Mengensteuerung sind gleich hoch — die Zeile springt beim Tipp nicht', () => {
    expect(regel('.korb-kreis')).toMatch(/height: 3rem/);
    expect(regel('.mengen-wahl')).toMatch(/height: 3rem/);
  });

  it('liegt der Artikel in der Liste, ist die Zeile ausgewählt: Auswahlton und feine Kontur, kein Rahmen um die Steuerung', () => {
    const zeile = regel('.zeile:has(> .zeile-rechts > .korb-menge-drin)');
    expect(zeile).toContain('background: var(--auswahl)');
    expect(zeile).toContain('var(--auswahl-kontur)');
    expect(regel('.korb-menge')).not.toMatch(/border|box-shadow|background/);
  });

  it('die Herkunft beim Abholen ist die Auswahl mit Häkchen (.wahl-option), kein Optionspunkt und kein dunkler Knopf', () => {
    const teil = BESTELLEN.slice(BESTELLEN.indexOf('name="abgeholt-herkunft"') - 600, BESTELLEN.indexOf('name="abgeholt-herkunft"') + 600);
    expect(teil).toContain('className="herkunft-wahl wahl-gruppe');
    expect(teil).toContain('className="wahl-option"');
    expect(teil).not.toContain('accent-[color:');
    // Die Wahl selbst bleibt dieselbe: „lager“ oder „haendler“ geht an den Server.
    expect(BESTELLEN).toContain("...(herkunftFragen(toPickUp) ? { herkunft } : {})");
  });

  it('Aktionen im Seitenfenster kompakt rechts, die Hauptaktion außen; nichts mehr in voller Breite untereinander', () => {
    expect(regel('.material-aktionen')).toMatch(/flex-direction: row-reverse; flex-wrap: wrap; justify-content: flex-start/);
    for (const s of ['.material-aktionen', '.material-status']) expect(regel(s), s).not.toContain('flex-direction: column');
  });

  it('Gegenprobe: die Aktionen von vorher (untereinander) fielen auf', () => {
    const alt = '.material-aktionen { display: flex; flex-direction: column; gap: 0.5rem; }';
    expect(/flex-direction: row-reverse/.test(alt)).toBe(false);
  });

  it('keine festen Farbwerte im Material — nur Tokens, damit hell und dunkel stimmen', () => {
    const dateien = [
      'src/styles/lot-material.css',
      ...['OrderView', 'AdminOrdersView', 'StockView', 'MaterialCatalog', 'Einkaufsliste', 'LagerDialoge', 'AnforderungFenster', 'RetoureFenster']
        .map((n) => `src/features/orders/${n}.tsx`),
    ];
    for (const d of dateien) expect(ohneKommentare(quelle(d)).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g), d).toBeNull();
  });
});

/*
  V10 FINANZEN UND TEAM (13.11.2026): Rechnungen, Nachkalkulation,
  Mitarbeiterübersicht, Urlaub, Benutzerverwaltung. Auftrag 11.5: Beträge
  in Plex Mono am Beleg, Status als Wort und Zeichen, Auswahl als Ton mit
  feiner Kontur, keine Statusbalken. Das Verhalten (keine Null nach einem
  Ladefehler, „Erneut versuchen“) prüfen die Ansichtstests
  (InvoicesView, RechnungDetailSpalten, NachkalkulationView).
*/
describe('V10 Finanzen und Team', () => {
  const css = (datei: string) => ohneKommentare(readFileSync(join('src/styles', datei), 'utf8'));
  const RE = css('lot-rechnungen.css');
  const UE = css('lot-uebersicht.css');
  const block = (text: string, sel: string) => {
    const i = text.indexOf(`${sel} {`);
    return i < 0 ? '' : text.slice(i, text.indexOf('}', i) + 1);
  };

  it('am Beleg stehen Beträge in Plex Mono, tabellarisch — der Stand ohne Fläche', () => {
    for (const s of ['.rechnung-stand-betrag', '.rechnung-detail-betrag', '.rechnung-detail-wert']) {
      expect(block(RE, s), s).toContain('font-family: var(--schrift-mono)');
      expect(block(RE, s), s).toContain('font-variant-numeric: tabular-nums');
    }
    expect(block(RE, '.rechnung-stand')).not.toMatch(/background/);
  });

  it('der markierte Tag im Personenfenster ist Auswahl: Ton und feine Kontur, keine Kante links', () => {
    const r = block(UE, '.pf-zeile-markiert');
    expect(r).toContain('background: var(--auswahl)');
    expect(r).toContain('inset 0 0 0 1px var(--auswahl-kontur)');
    expect(r).not.toMatch(/inset \d+px 0 0/);
  });

  it('Gegenprobe: die Petrolkante von vorher fiele auf', () => {
    const alt = '.pf-zeile-markiert { background: var(--petrol-hell); box-shadow: inset 3px 0 0 var(--petrol); }';
    expect(/inset \d+px 0 0/.test(block(alt, '.pf-zeile-markiert'))).toBe(true);
  });

  it('die offene Person trägt in der Liste die Auswahl (aria-current)', () => {
    expect(UE).toMatch(/\.ue-zeile\[aria-current='true'\][^{]*\{[^}]*background: var\(--auswahl\);[^}]*inset 0 0 0 1px var\(--auswahl-kontur\)/);
    expect(readFileSync('src/features/accounting/UebersichtListe.tsx', 'utf8')).toContain("aria-current={gewaehlt ? 'true' : undefined}");
  });

  it('eine überschrittene Grenze ist ein Zeichen, kein roter Balken; „fehlt“ ohne Farbrahmen', () => {
    for (const s of ['.mw-zelle-grenze', '.pk-tag-grenze']) {
      const regeln = UE.split('\n').filter((z) => z.includes(s));
      expect(regeln.join('\n'), s).not.toMatch(/-\d+px 0 var\(--danger\)|border-bottom: \d+px solid var\(--danger\)/);
    }
    expect(UE).toMatch(/\.mw-zelle-grenze::after, \.pk-tag-grenze::after \{[^}]*background: var\(--danger\)/);
    expect(block(UE, '.mw-zelle-fehlt')).not.toContain('1px var(--warning)');
  });

  it('Gegenprobe: der Strich von vorher fiele auf', () => {
    const alt = '  .mw-zelle-grenze { box-shadow: inset 0 -3px 0 var(--danger); }';
    expect(/-\d+px 0 var\(--danger\)/.test(alt)).toBe(true);
  });

  it('Spaltenköpfe in Versalien und Sperrung, aber nicht fett dazu (Regel 8)', () => {
    const kopf = UE.split('\n').find((z) => z.includes('.ue-kopf-person, .ue-kopf-zahl, .ue-vergleich-kopf {'))!;
    expect(kopf).toContain('text-transform: uppercase');
    expect(kopf).toContain('font-weight: 400');
  });

  it('keine festen Farbwerte in Finanzen und Team — nur Tokens, damit hell und dunkel stimmen', () => {
    const ordner = ['invoices', 'costing', 'accounting', 'vacations', 'users'].map((o) => join('src/features', o));
    const dateien = [
      ...['lot-rechnungen.css', 'lot-uebersicht.css', 'lot-verwaltung.css'].map((d) => join('src/styles', d)),
      ...ordner.flatMap((o) => readdirSync(o).filter((d) => d.endsWith('.tsx')).map((d) => join(o, d))),
    ];
    for (const d of dateien) {
      expect(ohneKommentare(readFileSync(d, 'utf8')).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g), d).toBeNull();
    }
  });
});

/*
  V10 PLANUNG (13.11.2026, style.md „Einsatzplanung · E88 bleibt fachlich
  maßgeblich“, Auftrag 11.2 und 12.2): helle Arbeitsblätter, nur der
  ausgewählte Einsatz vollflächig Terrakotta, heute dunkler Kopf über warmer
  Spalte, keine Bernsteinkanten, Namen ohne Kürzel-Kreis, Ziel und Ablegen
  über die Bewegungs-Tokens. Jede Prüfung hat ihre Gegenprobe darunter.
*/
describe('V10 Planung', () => {
  const PLANUNG = stil('lot-planung.css');
  const MONAT = stil('lot-monat.css');
  const quelle = (p: string) => readFileSync(p, 'utf8');
  /** Alle Rümpfe der Regeln, deren Selektorliste genau `sel` ist. */
  const rumpf = (css: string, sel: string) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...css.matchAll(new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))].map((t) => t[1]).join(' ');
  };
  /** Warnfarbe als Rand, Kante oder Schattenkontur — das, was V10 in der Planung nicht mehr kennt. */
  const WARNKANTE = /(border[a-z-]*:[^;]*var\(--warning\)|box-shadow:[^;]*var\(--warning\)|background: var\(--warning-bg\))/;

  it('ein Einsatz ist ein helles Blatt mit feiner Kontur, Terrakotta-Markierung und dem Radius der Arbeitszeile', () => {
    const r = rumpf(PLANUNG, '.eintrag, .eintrag-konflikt');
    expect(r).toContain('background: var(--surface);');
    expect(r).toContain('border: 1px solid var(--border-strong); border-left: 3px solid var(--petrol);');
    expect(r).toContain('border-radius: var(--radius-sm);');
  });

  it('nur der ausgewählte Einsatz ist vollflächig Terrakotta, und die Auswahl ändert die Form nicht', () => {
    const ausgewaehlt = rumpf(PLANUNG, ':is(.einsatz-halter:is(:focus-within, [data-offen]) > :is(.eintrag, .eintrag-konflikt), :is(.eintrag, .eintrag-konflikt):focus-visible)');
    expect(ausgewaehlt).toContain('background: var(--petrol); color: var(--auf-petrol);');
    expect(ausgewaehlt).not.toMatch(/border-radius|padding|width|height/);
    // Gegenprobe: keine andere Regel füllt einen Einsatz in der Woche voll (früher: die Spalte „heute“).
    const vollflaechig = ohneKommentare(PLANUNG).split('}').filter((r) => /\.eintrag\b[^{]*\{[^}]*background: var\(--(petrol|brand)\)/.test(`${r}}`));
    expect(vollflaechig).toHaveLength(1);
    expect(rumpf(MONAT, '.mo-balken')).not.toMatch(/background: var\(--(petrol|brand)\)/);
    expect(rumpf(MONAT, '.mo-balken-gewaehlt')).toContain('background: var(--petrol); color: var(--auf-petrol);');
  });

  it('heute: dunkler Tageskopf und warm vertiefte Spalte, in Woche und Monat', () => {
    expect(rumpf(PLANUNG, '.wp-kopf-heute, .wp-kopf-schmal-heute')).toContain('background: var(--dunkel-flaeche); color: var(--auf-dunkel);');
    expect(rumpf(PLANUNG, '.wp-zelle-heute')).toContain('background: var(--heute);');
    expect(rumpf(MONAT, '.mo-kopf-heute')).toContain('background: var(--dunkel-flaeche); color: var(--auf-dunkel);');
    expect(rumpf(MONAT, '.mo-hg-heute')).toContain('background: var(--heute);');
  });

  it('keine Bernsteinkante, kein Bernsteinrahmen, keine Bernsteinfläche in Planung und Monat', () => {
    const funde = ohneKommentare(`${PLANUNG}\n${MONAT}`).split('\n').filter((z) => WARNKANTE.test(z));
    expect(funde).toEqual([]);
  });

  it('Gegenprobe: der Bernsteinrahmen des Stands vor V10 fiele auf', () => {
    expect(WARNKANTE.test('.eintrag-konflikt { background: var(--warning-bg); color: var(--warning); border: 2px solid var(--warning); }')).toBe(true);
    expect(WARNKANTE.test('.mo-balken-konflikt { box-shadow: inset 0 0 0 2px var(--warning); }')).toBe(true);
  });

  it('Konflikte stehen als Text mit Warnzeichen — in der Woche, nach Baustellen und im Monat', () => {
    expect(quelle('src/features/assignments/WochenEintraege.tsx')).toMatch(/className="e-zeile e-konflikt">\s*<Icon name="warnung"/);
    expect(quelle('src/features/assignments/WochenRaster.tsx')).toMatch(/className="e-zeile e-konflikt">\s*<Icon name="warnung"/);
    expect(quelle('src/features/assignments/WochenRaster.tsx')).toMatch(/className="kopf-warnung">\s*<Icon name="warnung"/);
    expect(quelle('src/features/assignments/MonatsAnsicht.tsx')).toContain("{b.art === 'konflikt' && <Icon name=\"warnung\" size={12} />}");
  });

  it('Personennamen ohne Kürzel-Kreis', () => {
    expect(PLANUNG).not.toMatch(/\.wp-kuerzel/);
    for (const datei of ['src/features/assignments/WochenRaster.tsx', 'src/features/assignments/HandyWoche.tsx']) {
      expect(quelle(datei), datei).not.toMatch(/wp-kuerzel|kuerzel\(/);
    }
  });

  it('keine Versalien mit Sperrung bei den Einstufungen und der Ablage', () => {
    for (const sel of ['.planung-gruppe', '.tl-achse', '.planung-ablage-titel']) {
      expect(rumpf(PLANUNG, sel), sel).not.toMatch(/text-transform: uppercase|letter-spacing/);
    }
    expect(rumpf(MONAT, '.mo-gruppe')).not.toMatch(/text-transform: uppercase|letter-spacing/);
  });

  it('Drag-Ziel in der Stufe „Drücken“, Ablegen in der Stufe „bestätigt“ — beide über die Tokens', () => {
    expect(rumpf(PLANUNG, '[data-ziel-tag]')).toContain('background-color var(--motion-press) var(--ease-response)');
    expect(rumpf(PLANUNG, '[data-ziel-aktiv]')).toContain('background: var(--auswahl);');
    expect(rumpf(PLANUNG, '.zieh-schatten[data-landet]')).toContain('transform var(--motion-bestaetigt) var(--ease-response)');
    const ziehen = quelle('src/features/assignments/useZiehen.ts');
    expect(ziehen).toContain("getPropertyValue('--motion-bestaetigt')");
    // Reduzierte Bewegung: kein Flug — der Schatten landet nur ohne sie.
    expect(ziehen).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    expect(ziehen).toMatch(/if \(zelle && !ohneBewegung\(\)\)/);
    // Gegenprobe: der Schatten wandert über `transform`, nicht über `left`/`top`.
    expect(quelle('src/features/assignments/Einsatzplanung.tsx')).toContain('style={{ transform: `translate(${schatten.x + 12}px, ${schatten.y + 12}px)` }}');
  });

  it('Leiste, Schatten und Vorschau schweben — Radius und Schatten des Schwebenden; die Ablage ist ein Blatt', () => {
    expect(rumpf(PLANUNG, '.einsatz-leiste')).toContain('box-shadow: var(--shadow-lg);');
    expect(rumpf(PLANUNG, '.zieh-schatten')).toContain('box-shadow: var(--shadow-lg);');
    expect(rumpf(MONAT, '.vorschau')).toContain('box-shadow: var(--shadow-lg);');
    expect(PLANUNG).toMatch(/\.planung-ablage \{ display: flex;[^}]*border-radius: var\(--radius-lg\);/);
    expect(PLANUNG).not.toMatch(/\.planung-ablage \{[^}]*box-shadow/);
  });

  it('Markierung, Auswahl und heute sind Struktur: fester Produktton, keine Hausfarbe des Betriebs', () => {
    expect(ohneKommentare(`${PLANUNG}\n${MONAT}`)).not.toMatch(/var\(--brand(-fg)?\)/);
    // Gegenprobe: die Hausfarbe fiele auf.
    expect(/var\(--brand(-fg)?\)/.test('.x { background: var(--brand); }')).toBe(true);
  });

  it('keine festen Hexwerte in den Stilen der Planung und des Monats', () => {
    expect(ohneKommentare(`${PLANUNG}\n${MONAT}`)).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});

/*
  V10 EINSTELLUNGEN UND HÜLLE (13.11.2026): Blatt „Mehr“, Suche, Bänder,
  Meldung, Anmeldung, Plattform-Kopf, Zustände und die Musterseite.
*/
describe('V10 Einstellungen und Hülle', () => {
  const quelle = (datei: string) => readFileSync(datei, 'utf8');
  const PLATTFORM = ohneKommentare(stil('lot-plattform.css'));
  const regel = (css: string, sel: string) => new RegExp(`\\n\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[^}]*\\}`).exec(css)?.[0] ?? '';

  it('das Blatt „Mehr“ gliedert in zwei Listen — Zeilen unter Linien, keine Kachelwand', () => {
    const layout = quelle('src/app/Layout.tsx');
    expect(layout).toContain("titel: 'Planung & Arbeit'");
    expect(layout).toContain("'Vertrieb & Verwaltung'");
    expect(layout).toContain('className="mehr-liste"');
    const liste = regel(PLATTFORM, '.mehr-liste');
    expect(liste).toContain('flex-direction: column');
    expect(liste).not.toMatch(/grid|box-shadow|background/);
    expect(PLATTFORM).toContain('.mehr-punkt-aktiv { background: var(--auswahl); box-shadow: inset 0 0 0 1px var(--auswahl-kontur); }');
  });

  it('Gegenprobe: eine Kachelwand im Blatt fiele auf', () => {
    expect(/grid|box-shadow|background/.test('\n  .mehr-liste { display: grid; grid-template-columns: repeat(3, 1fr); }')).toBe(true);
  });

  it('Suchtreffer: Auswahl wie überall (Fläche und feine Kontur), Nummern in Mono', () => {
    expect(regel(PLATTFORM, '.such-treffer-an')).toContain('background: var(--auswahl); box-shadow: inset 0 0 0 1px var(--auswahl-kontur)');
    expect(regel(PLATTFORM, '.such-nummer')).toContain('font-family: var(--schrift-mono)');
    expect(quelle('src/app/Suchfenster.tsx')).toContain("t.nummer ? 'such-nebeninfo such-nummer' : 'such-nebeninfo'");
  });

  it('Bänder (Verbindung, Support, Einblick): neutrale Fläche, Linie darunter, Warnzeichen — keine farbige Fläche', () => {
    for (const datei of ['src/components/Verbindungsband.tsx', 'src/components/Supportband.tsx', 'src/components/Supportsitzung.tsx']) {
      const q = ohneKommentare(quelle(datei));
      expect(q, datei).toContain('border-b border-line');
      expect(q, datei).toContain('<Icon name="warnung"');
      expect(q, datei).not.toMatch(/bg-(amber|red|yellow|orange)-|bg-petrol|bg-auswahl/);
    }
    // Die Flächen, die sie benutzen, sind neutral (siehe „V10 Grundwerte“).
    expect(wert(satz('hell'), '--warning-bg')).toBe(wert(satz('hell'), '--surface'));
  });

  it('die Fehlermeldung trägt ein Zeichen statt einer Kante; die Uhr hält bei Zeiger und Fokus an', () => {
    const toast = quelle('src/components/Toast.tsx');
    expect(toast).toContain("t.tone === 'error' && <Icon name=\"warnung\"");
    expect(toast).toContain('if (t.dauerhaft || hover || fokus) return;');
  });

  it('Anmeldung ohne dunkles Band, Titel in der Serife; Plattform-Kopf ohne weiße Marke auf heller Insel', () => {
    const login = ohneKommentare(quelle('src/features/auth/LoginPage.tsx'));
    expect(login).not.toContain('panel-dark');
    expect(login).not.toMatch(/<ProduktMarke[^>]*\bhell\b/);
    expect(login).toMatch(/<h1 className="[^"]*font-titel/);
    const kopf = /<header className="kopfzeile">[\s\S]*?<\/header>/.exec(quelle('src/features/plattform/PlattformHuelle.tsx'))![0];
    expect(kopf).not.toMatch(/<ProduktMarke[^>]*\bhell\b/);
    expect(kopf).not.toContain('text-navi-text');
  });

  it('Gegenprobe: die weiße Marke im Kopf fiele auf', () => {
    expect(/<ProduktMarke[^>]*\bhell\b/.test('<ProduktMarke hoehe={26} hell />')).toBe(true);
  });

  it('Fehler und Teilfehler zeigen nie eine Zeichnung — die gibt es nur im echten Leerzustand', () => {
    const states = quelle('src/components/States.tsx');
    const rumpf = (name: string) => states.slice(states.indexOf(`export function ${name}`), states.indexOf('\nexport function', states.indexOf(`export function ${name}`) + 10));
    for (const name of ['ErrorState', 'TeilFehler', 'LoadingState', 'SkeletonList']) expect(rumpf(name), name).not.toMatch(/LotZeichnung|zeichnung/);
    expect(rumpf('EmptyState')).toContain('<LotZeichnung');
  });

  it('die Musterseite zeigt jeden V10-Baustein — nur echte Bausteine, kein Nachbau', () => {
    const muster = quelle('src/features/muster/MusterView.tsx') + quelle('src/features/muster/MusterV10.tsx');
    for (const titel of ['Darstellung', 'Grundwerte', 'Knöpfe', 'Felder und Auswahl', 'Auswahl als Segmente', 'Hinweise', 'Meldung', 'Laden', 'Leerer Zustand', 'Filterleere', 'Fehler', 'Bewegung']) {
      expect(muster, titel).toContain(`title="${titel}"`);
    }
    for (const zustand of ['loading', 'gespeichert', 'disabled', "wert: 'system'", 'wahl-gruppe', 'toast.error', "label: 'Rückgängig'"]) expect(muster, zustand).toContain(zustand);
    const importe = [...quelle('src/features/muster/MusterV10.tsx').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(importe.filter((i) => !/^(react|@\/components\/|@\/lib\/)/.test(i))).toEqual([]);
  });

  it('keine festen Farbwerte in den Seiten der Einstellungen, Plattform, Anmeldung und Musterseite', () => {
    const ordner = ['src/features/settings', 'src/features/modules', 'src/features/papierkorb', 'src/features/plattform', 'src/features/auth', 'src/features/recht', 'src/features/muster'];
    const funde = ordner.flatMap((o) => readdirSync(o).filter((d) => d.endsWith('.tsx')).flatMap((d) =>
      ohneKommentare(readFileSync(join(o, d), 'utf8')).split('\n')
        // Platzhalter zeigen dem Betrieb das Format seiner Hausfarbe — das ist Text, kein Stil.
        .filter((z) => /#[0-9a-fA-F]{6}\b/.test(z) && !/placeholder="#[0-9a-fA-F]{6}"/.test(z))
        .map((z) => `${o}/${d}: ${z.trim()}`)));
    expect(funde).toEqual([]);
  });

  it('Gegenprobe: ein fester Farbwert fiele auf', () => {
    expect(/#[0-9a-fA-F]{6}\b/.test('<span style={{ color: "#a85439" }} />')).toBe(true);
  });
});

describe('V10 zentrale Bausteine (Querschnitt)', () => {
  const KNOPF = readFileSync('src/components/knopf.ts', 'utf8');
  const TAILWIND = readFileSync('tailwind.config.js', 'utf8');

  it('Gefahr trägt keine rote Kante — das Wort in Fehlerrot, die Kontur jeder Nebenhandlung', () => {
    const danger = /\n\s*danger: '([^']+)'/.exec(KNOPF)![1];
    expect(danger).not.toMatch(/(^|\s)border-danger(\s|$)/);
    expect(danger).toContain('text-danger');
    expect(danger).toContain('border-line-strong');
    // Gegenprobe: der Stand vor V10 fiele auf.
    expect('border border-danger bg-surface font-semibold text-danger').toMatch(/(^|\s)border-danger(\s|$)/);
  });

  it('Zeigen ist nicht Wählen: der Hover-Ton ist ein anderer als die Auswahl, in beiden Sätzen', () => {
    for (const s of [satz('hell'), satz('dunkel')]) {
      expect(wert(s, '--hover-flaeche')).toBeTruthy();
      expect(wert(s, '--hover-flaeche')).not.toBe(wert(s, '--auswahl'));
    }
    const hoverAufAuswahl = ohneKommentare(ALLE_STILE).split('\n').filter((z) => /:hover \{ background: var\(--(petrol-hell|auswahl)\)/.test(z) && !/aria-current|data-aktiv|\[data-offen\]/.test(z));
    expect(hoverAufAuswahl).toEqual([]);
  });

  it('Terrakotta auf Dunkel ist ein Token, kein fester Wert in den Bausteinen', () => {
    expect(wert(satz('hell'), '--auf-dunkel-akzent')).toBe('#d08a68');
    expect(LOT).toContain('.meldung-knopf { pointer-events: auto; flex: none; min-height: 2.75rem; padding: 0 0.25rem; background: none; border: 0; color: var(--auf-dunkel-akzent);');
    expect(ohneKommentare(LOT)).not.toMatch(/#d08a68/i);
  });

  it('die Titelschrift ist in Tailwind gültig gequotet — sonst fiele font-titel still auf DM Sans zurück', () => {
    expect(TAILWIND).toContain(`titel: ['"Source Serif 4"'`);
  });

  it('das Optionsfeld der Auswahl deckt die ganze Fläche (Tipp, Werkzeuge, Eingabehilfen)', () => {
    expect(LOT).toContain('.wahl-option input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }');
    expect(LOT).not.toMatch(/\.wahl-option input \{[^}]*pointer-events: none/);
  });

  it('Fensterfüße stehen auch am Handy in einer Zeile — nirgends mehr gestapelt', () => {
    expect(ohneKommentare(ALLE_STILE)).not.toMatch(/(fuss|fuss-knoepfe|vorschau-fuss)[^{]*\{[^}]*flex-direction: column-reverse/);
  });
});
