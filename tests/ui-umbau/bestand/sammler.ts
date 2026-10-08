/**
 * Sammelt die Elemente einer Aufnahme (eine Variante, eine Breite) und bildet
 * ihre Kennungen (Umbau „Lot“, Anhang 12.1).
 *
 * DIE KENNUNG IST SEITE, EBENE, ART UND TEXT — NIE EINE KLASSE. Klassen
 * tauscht der Umbau aus; eine Kennung daraus wäre nachher eine andere, und
 * der Vergleich meldete jedes Element als verloren. Der Klickweg gehört
 * ebenfalls nicht hinein: wandert ein Knopf in ein ⋯-Menü, bleibt er
 * derselbe Knopf, und der Vergleich misst den längeren Weg (höchstens +1).
 *
 * Steht dasselbe mehrfach auf einer Seite (ein „Aus Lager“ je Zeile), zählt
 * es einmal mit `anzahl`. Behalten wird der beste Zustand (aktiv vor
 * gesperrt vor ausgeblendet) und dazu der kürzeste Weg.
 */
import type { Roh } from './erfassen';
import type { Variante } from './varianten';

export interface Element {
  id: string;
  seite: string;
  rolle: string;
  freigaben: string[];
  variante: string;
  breite: number;
  art: string;
  text: string;
  aria: string;
  ziel: string;
  zustand: Roh['zustand'];
  klickweg: string[];
  quelle: string;
  ebene?: string;
  optionen?: string[];
  inhalt?: string;
  anzahl?: number;
}

const RANG: Record<Roh['zustand'], number> = { aktiv: 0, gesperrt: 1, ausgeblendet: 2 };

/** Kleinbuchstaben, Umlaute ausgeschrieben, alles andere zu Bindestrichen. */
export function kuerzel(s: string, laenge = 60): string {
  const t = s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return t.slice(0, laenge).replace(/-+$/, '');
}

/** `/customers/:id` → `customers-id`; die Startseite heisst `start`. */
export function seitenKuerzel(seite: string): string {
  if (seite === '/') return 'start';
  return kuerzel(seite.replace(/:/g, ''), 80) || 'start';
}

/**
 * „Weitere Aktionen für Kupferrohr 22 mm“ → „Weitere Aktionen“: das ⋯-Menü
 * jeder Zeile ist dasselbe Element. Mit dem Namen der Zeile hinge die
 * Kennung an den Beispieldaten und an deren Reihenfolge.
 */
function ohneZeile(s: string): string {
  return s.replace(/^((?:Weitere )?Aktionen) für .+$/, '$1');
}

export function kennung(seite: string, r: Pick<Roh, 'art' | 'text' | 'aria' | 'ebene'>): string {
  const teile = [seitenKuerzel(seite)];
  if (r.ebene) teile.push(kuerzel(ohneZeile(r.ebene), 40));
  teile.push(r.art, kuerzel(ohneZeile(r.text)) || kuerzel(ohneZeile(r.aria)) || 'ohne-text');
  return teile.join('.');
}

export class Sammler {
  private readonly elemente = new Map<string, Element>();

  constructor(
    private readonly variante: Variante,
    private readonly breite: number,
    private readonly quelle: string,
  ) {}

  /**
   * Nimmt die Elemente EINES Schnappschusses auf. Mehrfaches innerhalb des
   * Schnappschusses zählt als `anzahl`; über Schnappschüsse hinweg bleibt die
   * grösste Zahl stehen (sonst zählte jeder erneute Blick doppelt).
   */
  aufnehmen(seite: string, roh: Roh[], klickweg: string[]): Element[] {
    const hier = new Map<string, { r: Roh; n: number }>();
    for (const r of roh) {
      const id = kennung(seite, r);
      const alt = hier.get(id);
      if (!alt) hier.set(id, { r, n: 1 });
      else {
        alt.n += 1;
        if (RANG[r.zustand] < RANG[alt.r.zustand]) alt.r = r;
      }
    }
    const neu: Element[] = [];
    for (const [id, { r, n }] of hier) {
      const da = this.elemente.get(id);
      if (!da) {
        const e: Element = {
          id, seite, rolle: this.variante.rolle, freigaben: this.variante.freigaben,
          variante: this.variante.schluessel, breite: this.breite,
          art: r.art, text: r.text, aria: r.aria, ziel: r.ziel, zustand: r.zustand,
          klickweg, quelle: this.quelle,
          ...(r.ebene ? { ebene: r.ebene } : {}),
          ...(r.optionen ? { optionen: r.optionen } : {}),
          ...(r.inhalt ? { inhalt: r.inhalt } : {}),
          ...(n > 1 ? { anzahl: n } : {}),
        };
        this.elemente.set(id, e);
        neu.push(e);
        continue;
      }
      const besser = RANG[r.zustand] < RANG[da.zustand];
      const kuerzer = RANG[r.zustand] === RANG[da.zustand] && klickweg.length < da.klickweg.length;
      if (besser || kuerzer) {
        da.zustand = r.zustand;
        da.klickweg = klickweg;
      }
      if (!da.inhalt && r.inhalt) da.inhalt = r.inhalt;
      if (r.optionen && (!da.optionen || r.optionen.length > da.optionen.length)) da.optionen = r.optionen;
      if (n > (da.anzahl ?? 1)) da.anzahl = n;
    }
    return neu;
  }

  /** Was ein Knopf auslöst, sobald es feststeht (Dialog, Menü, Navigation …). */
  zielSetzen(seite: string, r: Pick<Roh, 'art' | 'text' | 'aria' | 'ebene'>, ziel: string): void {
    const e = this.elemente.get(kennung(seite, r));
    if (e && (!e.ziel || e.ziel === 'aufklappen' || e.ziel === 'menue')) e.ziel = ziel;
  }

  alle(): Element[] {
    return [...this.elemente.values()];
  }
}
