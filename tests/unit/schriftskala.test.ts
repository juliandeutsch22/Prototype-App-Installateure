import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
  DIE SCHRIFTSKALA NACH ROLLEN (E97, 17.11.2026). „Die Schriftgrößen sind
  abgesehen von den Überschriften sehr uneinheitlich“ — gemessen standen in
  der Baustellenakte für denselben Leersatz 14 und 16 px, für die
  Beschriftung über einem Wert 12 und 13, für den Wert 13, 14 und 15, dazu
  im ganzen Stil ein Dutzend Zwischenwerte (9 bis 11,5, 14, 17 px).

  Jetzt vier Stufen mit je einer Rolle (index.css, `--groesse-*`), und jede
  Schriftgröße außerhalb der Titel nimmt eine davon. Diese Prüfung hält den
  Stil fest; was der Browser je Seite wirklich zeichnet, misst
  `tests/links/schriftskala.spec.ts`.

  Gegenprobe: mit dem Stand vor E97 sind alle Prüfungen hier rot (freie
  Werte in jeder Datei, `text-sm` an 660 Stellen, Tailwinds `sm` vorhanden,
  keine Grundschrift am `body`).
*/

const INDEX = readFileSync('src/index.css', 'utf8');
const STILE = ['src/index.css', ...readdirSync('src/styles').filter((d) => d.endsWith('.css')).map((d) => join('src/styles', d))];
const ohneKommentare = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, (k) => k.replace(/[^\n]/g, ' '));

/** Jede `font-size` im Stil, mit Datei, Selektor und Wert. */
function schriftgroessen() {
  const aus: { datei: string; selektor: string; wert: string }[] = [];
  for (const datei of STILE) {
    const s = ohneKommentare(readFileSync(datei, 'utf8'));
    for (const regel of s.matchAll(/([^{};]*)\{([^{}]*)\}/g)) {
      const selektor = regel[1].replace(/\s+/g, ' ').trim();
      for (const d of regel[2].matchAll(/font-size:\s*([^;}]+)/g)) aus.push({ datei: datei.split('/').pop()!, selektor, wert: d[1].trim() });
    }
  }
  return aus;
}

/*
  WAS EINE EIGENE GRÖSSE BEHALTEN DARF — je mit Grund. Titel (die
  Überschriften gehören nicht zur Skala), große Kennwerte und die Uhr (eine
  Zahl, die man aus Abstand lesen soll), Zeichen (Emoji, @, +/−, ›),
  Namenskürzel im Kreis und die beiden Navigationsleisten mit ihren
  Beschriftungen unter Symbolen (dort entscheidet die Breite der Leiste).
*/
const EIGENE_GROESSE: Record<string, string> = {
  // Titel
  '.titel-karte': 'Titel', '.karte-kopf h2': 'Titel', '.seitenkopf h1': 'Titel', '.akten-kopf .seitenkopf h1': 'Titel',
  '.gespraech-kopf .seitenkopf h1': 'Titel', '.fenster-titel': 'Titel', '.chat-kopf-titel': 'Titel', '.kopfzeile-titel': 'Titel',
  '.unterschrift-blatt-titel': 'Titel', '.start-leer h2': 'Titel', '.lot-erstnutzung h2': 'Titel', '.lot-ablage-text h3': 'Titel',
  '.start-seite .start-karte-kopf h2': 'Titel',
  '.akten-hauptteil .karte-kopf .titel-karte': 'Titel',
  '.vorschau-titel': 'Titel', '.ue-titel-gross': 'Titel', '.planung-titel': 'Titel', '.planung-ablage-titel': 'Titel',
  '.start-einsatz-titel': 'Titel', '.start-einsatz-erster .start-einsatz-titel': 'Titel', '.arbeitstag-start-titel': 'Titel',
  '.antrag-zeitraum': 'Titel', '.anmelde-buehne-satz': 'Titel',
  // Kennwerte und Uhr
  '.arbeitstag-uhr': 'Uhr', '.arbeitstag-uhr small': 'Uhr', '.timer-leiste-uhr': 'Uhr', '.akten-termin-tag': 'Kennwert',
  '.budget-prozent': 'Kennwert', '.nachkalk-db': 'Kennwert', '.fenster-zahl dd': 'Kennwert', '.pf-kennzahl-wert': 'Kennwert',
  '.ue-vergleich .ue-zahl-stark': 'Kennwert', '.rechnung-stand-betrag': 'Kennwert', '.schriftfeld .lage-wert': 'Kennwert',
  // Zeichen und Kürzel
  '.leiste-zeichen': 'Zeichen', '.nachricht-leiste[data-gross] .leiste-zeichen': 'Zeichen', '.reaktion-zeichen': 'Zeichen',
  '.eingabe-at': 'Zeichen', '.mengen-schritt': 'Zeichen', '.plattform-zeilenpfeil': 'Zeichen',
  '.postfach-kuerzel, .chat-kuerzel': 'Kürzel', '.chat-kopf .chat-kuerzel': 'Kürzel', '.neu-zeile .postfach-kuerzel': 'Kürzel',
  // Navigation
  '.navi-punkt, .navi-punkt-aktiv': 'Navigation', '.unten-punkt, .unten-punkt-aktiv': 'Navigation', '.navi-person-name': 'Navigation',
};

const passtZu = (selektor: string) => Object.keys(EIGENE_GROESSE).some((k) => selektor === k || selektor.endsWith(k));

describe('E97 Schriftskala', () => {
  it('vier Stufen mit Rollen: 12, 13, 15 und 16 px', () => {
    const wert = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(INDEX)?.[1].trim();
    expect(wert('--groesse-klein')).toBe('0.75rem');
    expect(wert('--groesse-begleit')).toBe('0.8125rem');
    expect(wert('--groesse-inhalt')).toBe('0.9375rem');
    expect(wert('--groesse-feld')).toBe('1rem');
  });

  it('was keine eigene Größe hat, ist Inhalt (15 px) — nicht die 16 px des Browsers', () => {
    const body = /\nbody \{[\s\S]*?\n\}/.exec(ohneKommentare(INDEX))![0];
    expect(body).toMatch(/font-size:\s*var\(--groesse-inhalt\)/);
  });

  it('Felder stehen ausdrücklich bei 16 px, auch wo sie erben — sonst zoomte iOS mit der Grundschrift von 15 px beim Antippen', () => {
    expect(ohneKommentare(INDEX)).toMatch(/\ninput,\nselect,\ntextarea \{\s*font-size:\s*var\(--groesse-feld\);\s*\}/);
    // Jede Regel für ein Eingabefeld im Stil nimmt die Feldgröße — auch die Suchfelder (Nachrichten stand bei 15 px).
    const felder = schriftgroessen().filter((g) => /(^|[\s,>(])(input|textarea|select)\b|\.(eingabe-feld|mengen-feld|zaehl-zeile-feld|suchfeld|ue-suche)\b/.test(g.selektor));
    expect(felder.length).toBeGreaterThan(8);
    for (const g of felder) expect(g.wert, `${g.datei} ${g.selektor}`).toBe('var(--groesse-feld)');
  });

  it('jede Schriftgröße im Stil nimmt eine Stufe der Skala — freie Werte nur für Titel, Kennwerte, Zeichen und Navigation', () => {
    const frei = schriftgroessen().filter((g) => !g.wert.startsWith('var(--groesse-') && !passtZu(g.selektor));
    expect(frei.map((g) => `${g.datei}: ${g.selektor} → ${g.wert}`)).toEqual([]);
  });

  it('die Ausnahmen sind wirklich größer als der Inhalt oder Navigation — keine Zwischenstufe versteckt sich dort', () => {
    const rem = (w: string) => (w.endsWith('rem') ? parseFloat(w) : NaN);
    for (const g of schriftgroessen().filter((x) => !x.wert.startsWith('var(--groesse-'))) {
      const grund = Object.entries(EIGENE_GROESSE).find(([k]) => g.selektor === k || g.selektor.endsWith(k))?.[1];
      if (grund === 'Navigation' || grund === 'Kürzel' || grund === 'Zeichen') continue;
      expect(rem(g.wert), `${g.datei} ${g.selektor}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('Tailwind kennt nur die Stufen der Skala: kein `sm` (14 px), auch nicht über `extend`', () => {
    const konfig = ohneKommentare(readFileSync('tailwind.config.js', 'utf8')).replace(/\/\/.*$/gm, '');
    const theme = konfig.slice(konfig.indexOf('theme: {'));
    const extend = theme.indexOf('extend: {');
    const block = /\n {4}fontSize: \{([\s\S]*?)\n {4}\},/.exec(theme);
    // Die Skala steht direkt unter `theme`, vor `extend` — sonst blieben Tailwinds eigene Stufen dabei.
    expect(block).not.toBeNull();
    expect(theme.indexOf(block![0])).toBeLessThan(extend);
    expect(theme.slice(extend)).not.toMatch(/fontSize/);
    const stufen = [...block![1].matchAll(/^\s*'?([\w-]+)'?:/gm)].map((m) => m[1]).sort();
    expect(stufen).toEqual(['2xl', '3xl', 'base', 'fliess', 'lg', 'meta', 'xl', 'xs']);
    expect(block![1]).toMatch(/meta: \['var\(--groesse-begleit\)'/);
    expect(block![1]).toMatch(/fliess: \['var\(--groesse-inhalt\)'/);
    expect(block![1]).toMatch(/xs: \['var\(--groesse-klein\)'/);
    expect(block![1]).toMatch(/base: \['var\(--groesse-feld\)'/);
  });

  it('keine Klasse `text-sm` im Code — sie stand an 660 Stellen für Begleitung und Inhalt zugleich', () => {
    const dateien: string[] = [];
    const gehe = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) gehe(p);
        else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\./.test(e.name)) dateien.push(p);
      }
    };
    gehe('src');
    const treffer = dateien.filter((d) => /\btext-sm\b/.test(readFileSync(d, 'utf8')));
    expect(treffer).toEqual([]);
  });
});
