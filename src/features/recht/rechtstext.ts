/**
 * Die Rechtstexte als Daten — Form, Platzhalter und die schlichte Schreibweise.
 *
 * SEIT 04.11.2026 STEHEN DIE TEXTE NICHT MEHR IM QUELLTEXT, sondern in der
 * Datenbank (`rechtstexte`), gepflegt vom Betreiber in der Plattform. Diese
 * Datei ist die eine Stelle, die weiß, wie ein Text aufgebaut ist und wie er
 * zu lesen ist — die öffentliche Seite, die Vorschau im Editor und die
 * Prüfungen benutzen dieselbe.
 *
 * SCHREIBWEISE, BEWUSST KLEIN. Kein HTML: was der Betreiber tippt, wird nie
 * als Markup in die Seite gegeben, sondern hier zerlegt und von React als
 * Text gesetzt — ein Rechtstext kann so keinen Schadcode in eine öffentliche
 * Seite tragen.
 *   - Leerzeile trennt Absätze; ein einfacher Zeilenumbruch bleibt einer.
 *   - Ein Absatz, dessen Zeilen alle mit „- “ beginnen, ist eine Aufzählung.
 *   - `**fett**`.
 *   - `[Text](https://…)` ist ein Verweis; erlaubt sind nur https:, mailto:
 *     und tel: — alles andere bleibt sichtbarer Text.
 *   - `{Name}`, `{Anschrift}` … setzen die Betreiberangaben ein; eine Zeile,
 *     die nur `{Unterauftragsverarbeiter}` enthält, setzt die Liste ein.
 */

export type RechtstextArt = 'betreiber' | 'impressum' | 'datenschutz';

export interface Betreiber {
  name: string;
  anschrift: string;
  email: string;
  telefon: string;
  uid: string;
  firmenbuch: string;
  gewerbe: string;
}

export interface Abschnitt {
  titel: string;
  text: string;
}

export interface Verarbeiter {
  /** Anbieter */
  wer: string;
  /** Zweck */
  wofuer: string;
  /** Standort */
  wo: string;
}

export interface TextInhalt {
  abschnitte: Abschnitt[];
  /** Nur in der Datenschutzerklärung. */
  verarbeiter?: Verarbeiter[];
}

/** Eine geltende (veröffentlichte) Fassung, wie `rechtstexte_aktuell()` sie liefert. */
export interface Fassung<T> {
  nummer: number;
  inhalt: T;
  veroeffentlichtAm: string;
  geprueft: boolean;
  hinweisen: boolean;
  neueVerarbeiter: string[];
}

export interface GeltendeTexte {
  betreiber?: Fassung<Betreiber>;
  impressum?: Fassung<TextInhalt>;
  datenschutz?: Fassung<TextInhalt>;
}

/**
 * Die Betreiberangaben: Feld, Platzhalter im Text, Beschriftung im Formular und
 * was auf der Seite steht, solange das Feld leer ist. Die Klammertexte sind
 * dieselben wie bis 04.11.2026 im Quelltext — ein leeres Feld sieht aus wie
 * vorher.
 */
export const BETREIBER_FELDER: ReadonlyArray<{
  feld: keyof Betreiber;
  platzhalter: string;
  beschriftung: string;
  offen: string;
  mehrzeilig?: boolean;
}> = [
  { feld: 'name', platzhalter: '{Name}', beschriftung: 'Name bzw. Firma', offen: 'Name bzw. Firma des Betreibers' },
  { feld: 'anschrift', platzhalter: '{Anschrift}', beschriftung: 'Anschrift', offen: 'Anschrift', mehrzeilig: true },
  { feld: 'email', platzhalter: '{E-Mail}', beschriftung: 'E-Mail-Adresse', offen: 'E-Mail-Adresse' },
  { feld: 'telefon', platzhalter: '{Telefon}', beschriftung: 'Telefonnummer', offen: 'Telefonnummer' },
  { feld: 'uid', platzhalter: '{UID-Nummer}', beschriftung: 'UID-Nummer', offen: 'UID-Nummer, falls vorhanden' },
  { feld: 'firmenbuch', platzhalter: '{Firmenbuch}', beschriftung: 'Firmenbuchnummer und -gericht', offen: 'Firmenbuchnummer und -gericht, falls eingetragen' },
  { feld: 'gewerbe', platzhalter: '{Gewerbe}', beschriftung: 'Gewerbe, Behörde und Kammer', offen: 'Gewerbe, zuständige Behörde und Kammerzugehörigkeit' },
];

export const VERARBEITER_PLATZHALTER = '{Unterauftragsverarbeiter}';

export const LEERER_BETREIBER: Betreiber = { name: '', anschrift: '', email: '', telefon: '', uid: '', firmenbuch: '', gewerbe: '' };

/** Wie eine offene Angabe auf der Seite steht — und woran sie im Text erkannt wird. */
export const offenText = (was: string) => `[${was} — wird ergänzt]`;
const OFFEN_MUSTER = /\[[^\]\n]*— wird ergänzt\]/g;

// ---------------------------------------------------------------------------
// Zerlegen
// ---------------------------------------------------------------------------

/** Ein Stück Fließtext. */
export type Stueck =
  | { art: 'text'; text: string }
  | { art: 'fett'; teile: Stueck[] }
  | { art: 'verweis'; text: string; ziel: string }
  | { art: 'umbruch' }
  /** Eine Betreiberangabe; `leer`, wenn das Feld nicht ausgefüllt ist. */
  | { art: 'angabe'; text: string; leer: boolean };

export type Block =
  | { art: 'absatz'; teile: Stueck[] }
  | { art: 'liste'; punkte: Stueck[][] }
  | { art: 'verarbeiter' };

const VERWEIS_ZIEL = /^(https:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:\+?[0-9][0-9 /-]*)$/;
const PLATZHALTER = /\{[^{}\n]{1,40}\}/g;

function betreiberText(feld: (typeof BETREIBER_FELDER)[number], betreiber: Betreiber, alleinInZeile: boolean): Stueck[] {
  const wert = (betreiber[feld.feld] ?? '').trim();
  if (!wert) return [{ art: 'angabe', text: offenText(feld.offen), leer: true }];
  const zeilen = wert.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  // Allein in der Zeile steht eine Anschrift untereinander, mitten im Satz durch Komma getrennt.
  if (!alleinInZeile || zeilen.length === 1) return [{ art: 'angabe', text: zeilen.join(', '), leer: false }];
  return zeilen.flatMap((z, i) => (i === 0 ? [] : [{ art: 'umbruch' } as Stueck]).concat([{ art: 'angabe', text: z, leer: false }]));
}

/** Platzhalter einer Zeile einsetzen; unbekannte bleiben, wie sie getippt sind. */
function platzhalterEinsetzen(text: string, betreiber: Betreiber, alleinInZeile: boolean): Stueck[] {
  const teile: Stueck[] = [];
  let rest = 0;
  for (const m of text.matchAll(PLATZHALTER)) {
    const feld = BETREIBER_FELDER.find((f) => f.platzhalter === m[0]);
    if (!feld) continue;
    if (m.index! > rest) teile.push({ art: 'text', text: text.slice(rest, m.index) });
    teile.push(...betreiberText(feld, betreiber, alleinInZeile));
    rest = m.index! + m[0].length;
  }
  if (rest < text.length) teile.push({ art: 'text', text: text.slice(rest) });
  return teile;
}

/** Verweise und Platzhalter einer Zeile, ohne Fettdruck. */
function zeileOhneFett(text: string, betreiber: Betreiber, alleinInZeile: boolean): Stueck[] {
  const teile: Stueck[] = [];
  const verweis = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let rest = 0;
  for (const m of text.matchAll(verweis)) {
    if (!VERWEIS_ZIEL.test(m[2])) continue;
    if (m.index! > rest) teile.push(...platzhalterEinsetzen(text.slice(rest, m.index), betreiber, alleinInZeile));
    teile.push({ art: 'verweis', text: m[1], ziel: m[2] });
    rest = m.index! + m[0].length;
  }
  if (rest < text.length) teile.push(...platzhalterEinsetzen(text.slice(rest), betreiber, alleinInZeile));
  return teile;
}

/** Eine Zeile: Fettdruck, Verweise, Platzhalter. */
export function zeileZerlegen(text: string, betreiber: Betreiber): Stueck[] {
  const alleinInZeile = BETREIBER_FELDER.some((f) => f.platzhalter === text.trim());
  const teile: Stueck[] = [];
  const fett = /\*\*([^*\n]+?)\*\*/g;
  let rest = 0;
  for (const m of text.matchAll(fett)) {
    if (m.index! > rest) teile.push(...zeileOhneFett(text.slice(rest, m.index), betreiber, alleinInZeile));
    teile.push({ art: 'fett', teile: zeileOhneFett(m[1], betreiber, false) });
    rest = m.index! + m[0].length;
  }
  if (rest < text.length) teile.push(...zeileOhneFett(text.slice(rest), betreiber, alleinInZeile));
  return teile;
}

/** Der Text eines Abschnitts als Blöcke. */
export function textZerlegen(text: string, betreiber: Betreiber): Block[] {
  const bloecke: Block[] = [];
  const absaetze = text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/);
  for (const roh of absaetze) {
    const zeilen = roh.split('\n').map((z) => z.replace(/\s+$/, '')).filter((z) => z.trim() !== '');
    if (zeilen.length === 0) continue;
    if (zeilen.length === 1 && zeilen[0].trim() === VERARBEITER_PLATZHALTER) {
      bloecke.push({ art: 'verarbeiter' });
    } else if (zeilen.every((z) => /^\s*- /.test(z))) {
      bloecke.push({ art: 'liste', punkte: zeilen.map((z) => zeileZerlegen(z.replace(/^\s*- /, ''), betreiber)) });
    } else {
      bloecke.push({
        art: 'absatz',
        teile: zeilen.flatMap((z, i) => (i === 0 ? [] : [{ art: 'umbruch' } as Stueck]).concat(zeileZerlegen(z.trim(), betreiber))),
      });
    }
  }
  return bloecke;
}

// ---------------------------------------------------------------------------
// Prüfen
// ---------------------------------------------------------------------------

/**
 * WAS NOCH OFFEN IST — leere Betreiberangaben, die der Text benutzt, und
 * eckige Klammern „… — wird ergänzt]“ im Text oder in der Liste. Solange hier
 * etwas steht, trägt die Seite das Band „Entwurf“, und „geprüft“ geht nicht.
 */
export function offeneAngaben(inhalt: TextInhalt, betreiber: Betreiber): string[] {
  const offen = new Set<string>();
  const texte = [
    ...inhalt.abschnitte.flatMap((a) => [a.titel, a.text]),
    ...(inhalt.verarbeiter ?? []).flatMap((v) => [v.wer, v.wofuer, v.wo]),
  ];
  for (const t of texte) {
    for (const m of t.matchAll(OFFEN_MUSTER)) offen.add(m[0]);
    for (const f of BETREIBER_FELDER) {
      if (t.includes(f.platzhalter) && !betreiber[f.feld].trim()) offen.add(offenText(f.offen));
    }
  }
  return [...offen];
}

/**
 * WAS DER EDITOR VOR DEM VERÖFFENTLICHEN BEMÄNGELT — Fehler, die die Seite
 * falsch aussehen ließen: ein unbekannter Platzhalter (vertippt), die Liste
 * der Verarbeiter an der falschen Stelle oder gar nicht, ein Verweis mit
 * einem nicht erlaubten Ziel.
 */
export function textFehler(art: 'impressum' | 'datenschutz', inhalt: TextInhalt): string[] {
  const fehler: string[] = [];
  const bekannt = new Set<string>(BETREIBER_FELDER.map((f) => f.platzhalter));
  if (art === 'datenschutz') bekannt.add(VERARBEITER_PLATZHALTER);
  let listen = 0;
  inhalt.abschnitte.forEach((a, i) => {
    const wo = `Abschnitt ${i + 1}${a.titel.trim() ? ` („${a.titel.trim()}“)` : ''}`;
    if (!a.titel.trim()) fehler.push(`${wo}: die Überschrift fehlt.`);
    if (!a.text.trim()) fehler.push(`${wo}: der Text fehlt.`);
    for (const m of `${a.titel}\n${a.text}`.matchAll(PLATZHALTER)) {
      if (!bekannt.has(m[0])) fehler.push(`${wo}: ${m[0]} ist kein bekannter Platzhalter.`);
    }
    for (const m of a.text.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g)) {
      if (!VERWEIS_ZIEL.test(m[2])) fehler.push(`${wo}: der Verweis „${m[1]}“ führt nicht auf https:, mailto: oder tel:.`);
    }
    for (const zeile of a.text.split(/\r?\n/)) {
      if (zeile.includes(VERARBEITER_PLATZHALTER)) {
        if (zeile.trim() !== VERARBEITER_PLATZHALTER) fehler.push(`${wo}: ${VERARBEITER_PLATZHALTER} steht allein in einer Zeile.`);
        else listen += 1;
      }
    }
  });
  if (art === 'datenschutz') {
    if (listen === 0) fehler.push(`Die Liste der Unterauftragsverarbeiter steht nirgends — ${VERARBEITER_PLATZHALTER} fehlt im Text.`);
    if (listen > 1) fehler.push(`${VERARBEITER_PLATZHALTER} steht mehr als einmal im Text.`);
    const namen = (inhalt.verarbeiter ?? []).map((v) => v.wer.trim());
    (inhalt.verarbeiter ?? []).forEach((v, i) => {
      if (!v.wer.trim() || !v.wofuer.trim() || !v.wo.trim()) fehler.push(`Unterauftragsverarbeiter ${i + 1}: Anbieter, Zweck und Standort ausfüllen.`);
    });
    if (new Set(namen).size !== namen.length) fehler.push('Ein Unterauftragsverarbeiter steht doppelt in der Liste.');
  }
  if (inhalt.abschnitte.length === 0) fehler.push('Ein Rechtstext braucht mindestens einen Abschnitt.');
  return fehler;
}

/** Welche Unterauftragsverarbeiter sind neu gegenüber der veröffentlichten Fassung? Wie `rechtstext_veroeffentlichen`. */
export function neueVerarbeiter(entwurf: Verarbeiter[], vorher: Verarbeiter[]): string[] {
  const alt = new Set(vorher.map((v) => v.wer));
  return entwurf.filter((v) => !alt.has(v.wer)).map((v) => v.wer);
}

/** Der „Stand“ einer Seite: die jüngere der beiden Fassungen, die sie zeigt — Text und Betreiberangaben. */
export function standVon(text: Fassung<unknown>, betreiber?: Fassung<unknown>): string {
  return betreiber && Date.parse(betreiber.veroeffentlichtAm) > Date.parse(text.veroeffentlichtAm)
    ? betreiber.veroeffentlichtAm
    : text.veroeffentlichtAm;
}

/** Was sich gegenüber der geltenden Fassung ändert — für die Rückfrage vor dem Veröffentlichen. */
export function aenderungenText(vorher: TextInhalt | undefined, jetzt: TextInhalt): string[] {
  if (!vorher) return ['Erste Fassung.'];
  const zeilen: string[] = [];
  const alt = new Map(vorher.abschnitte.map((a) => [a.titel.trim(), a.text]));
  const neu = new Map(jetzt.abschnitte.map((a) => [a.titel.trim(), a.text]));
  const hinzu = [...neu.keys()].filter((t) => !alt.has(t));
  const weg = [...alt.keys()].filter((t) => !neu.has(t));
  const geaendert = [...neu.keys()].filter((t) => alt.has(t) && alt.get(t) !== neu.get(t));
  if (geaendert.length) zeilen.push(`Geändert: ${geaendert.map((t) => `„${t}“`).join(', ')}.`);
  if (hinzu.length) zeilen.push(`Neuer Abschnitt: ${hinzu.map((t) => `„${t}“`).join(', ')}.`);
  if (weg.length) zeilen.push(`Entfällt: ${weg.map((t) => `„${t}“`).join(', ')}.`);
  const reihenfolge = (i: TextInhalt) => i.abschnitte.map((a) => a.titel.trim()).filter((t) => alt.has(t) && neu.has(t)).join('\n');
  if (!hinzu.length && !weg.length && reihenfolge(vorher) !== reihenfolge(jetzt)) zeilen.push('Die Reihenfolge der Abschnitte ändert sich.');
  if (jetzt.verarbeiter || vorher.verarbeiter) {
    const v1 = vorher.verarbeiter ?? [];
    const v2 = jetzt.verarbeiter ?? [];
    const dazu = neueVerarbeiter(v2, v1);
    const ab = neueVerarbeiter(v1, v2);
    const anders = v2.filter((v) => v1.some((a) => a.wer === v.wer && (a.wofuer !== v.wofuer || a.wo !== v.wo))).map((v) => v.wer);
    if (dazu.length) zeilen.push(`Neue Unterauftragsverarbeiter: ${dazu.join(', ')}.`);
    if (ab.length) zeilen.push(`Nicht mehr eingesetzt: ${ab.join(', ')}.`);
    if (anders.length) zeilen.push(`Zweck oder Standort geändert: ${anders.join(', ')}.`);
  }
  return zeilen.length ? zeilen : ['Inhaltlich gleich wie die geltende Fassung.'];
}

/** Welche Betreiberangaben sich ändern. */
export function betreiberAenderungen(vorher: Betreiber | undefined, jetzt: Betreiber): string[] {
  const felder = BETREIBER_FELDER.filter((f) => (vorher?.[f.feld] ?? '').trim() !== jetzt[f.feld].trim()).map((f) => f.beschriftung);
  return felder.length ? [`Geändert: ${felder.join(', ')}.`] : ['Inhaltlich gleich wie die geltende Fassung.'];
}
