/**
 * SONDERURLAUB — Dienstverhinderung, Pflegefreistellung, unbezahlter Urlaub
 * (Plan 10.3, bestätigt am 03.10.2026).
 *
 * Hier stehen die Regeln, die App und Datenbank teilen: die Anlässe mit
 * ihren Tagen, die Warnungen für die Bestätigenden und das Kontingent der
 * Pflegefreistellung. Die Datenbank prüft die harten Grenzen selbst noch
 * einmal (`freistellung_beantragen`, `freistellung_entscheiden`); was hier
 * steht und dort nicht, sind WARNUNGEN, keine Sperren.
 */

export type FreistellungArt = 'dienstverhinderung' | 'pflegefreistellung' | 'unbezahlt';
export type FreistellungStatus = 'Beantragt' | 'Bestätigt' | 'Abgelehnt' | 'Storniert';

/** Wie die Arten in der Oberfläche heißen. „Sonderurlaub" ist das Wort, das jeder kennt. */
export const ART_NAME: Record<FreistellungArt, string> = {
  dienstverhinderung: 'Sonderurlaub',
  pflegefreistellung: 'Pflegefreistellung',
  unbezahlt: 'Unbezahlter Urlaub',
};

/** Der Tagesstatus in der Zeiterfassung je Art. */
export const TAGESSTATUS: Record<FreistellungArt, 'Dienstverhinderung' | 'Pflegefreistellung' | 'Unbezahlt'> = {
  dienstverhinderung: 'Dienstverhinderung',
  pflegefreistellung: 'Pflegefreistellung',
  unbezahlt: 'Unbezahlt',
};

/** Ab so vielen Tagen zwischen Ereignis und Beginn warnt die App (Plan 10.6, fest). */
export const ZEITNAH_TAGE = 14;

/** Ab Werk: Kürzungsvorschlag ab so vielen Kalendertagen unbezahlt am Stück. */
export const KUERZUNG_AB_VORGABE = 14;

export type AnlassRegel = 'proFall' | 'einmalJeJahr' | 'notwendigeZeit';

export interface Anlass {
  schluessel: string;
  name: string;
  /** Arbeitstage — bei „notwendige Zeit" keine feste Zahl. */
  tage: number | null;
  regel: AnlassRegel;
  /** Todesfall: Begräbnis in den Tagen enthalten, Teilung erlaubt. */
  todesfall?: boolean;
}

/**
 * DIE VORBELEGUNG: KV Metallgewerbe (Arbeiter) und KV Angestellte im
 * Gewerbe — beide gleich, bestätigt am 03.10.2026.
 */
export const ANLAESSE: readonly Anlass[] = [
  { schluessel: 'hochzeit', name: 'Eigene Eheschließung oder eingetragene Partnerschaft', tage: 3, regel: 'proFall' },
  { schluessel: 'tod_partner', name: 'Tod des Ehepartners, Lebensgefährten oder eingetragenen Partners', tage: 3, regel: 'proFall', todesfall: true },
  { schluessel: 'tod_kind', name: 'Tod eigener Kinder, Adoptiv- oder Pflegekinder', tage: 3, regel: 'proFall', todesfall: true },
  { schluessel: 'tod_eltern', name: 'Tod der Eltern oder Schwiegereltern', tage: 2, regel: 'proFall', todesfall: true },
  { schluessel: 'tod_geschwister', name: 'Tod von Geschwistern, Großeltern oder Schwiegerkindern', tage: 1, regel: 'proFall', todesfall: true },
  { schluessel: 'geburt', name: 'Geburt eines eigenen Kindes', tage: 2, regel: 'proFall' },
  { schluessel: 'wohnungswechsel', name: 'Wohnungswechsel mit eigenem Hausstand', tage: 2, regel: 'einmalJeJahr' },
  { schluessel: 'vorladung', name: 'Vorladung zu Behörde, Gericht oder Amt', tage: null, regel: 'notwendigeZeit' },
  { schluessel: 'musterung', name: 'Musterung', tage: null, regel: 'notwendigeZeit' },
];

/**
 * Die Anlässe des Betriebs: die Vorbelegung, mit den Tagen, die der Betrieb
 * geändert hat (`companies.freistellung_anlaesse`, Schlüssel → Tage). Ein
 * Anlass mit „notwendiger Zeit" bekommt keine Tage.
 */
export function anlaesseDesBetriebs(abweichend?: Record<string, number> | null): Anlass[] {
  return ANLAESSE.map((a) => {
    const t = abweichend?.[a.schluessel];
    return a.tage !== null && typeof t === 'number' && Number.isFinite(t) && t > 0 ? { ...a, tage: t } : { ...a };
  });
}

export function anlassVon(schluessel: string | null | undefined, anlaesse: readonly Anlass[] = ANLAESSE): Anlass | undefined {
  return anlaesse.find((a) => a.schluessel === schluessel);
}

/** Ein Antrag, so weit die Regeln ihn brauchen. */
export interface FreistellungFuerRegeln {
  id: string;
  userId: string;
  art: FreistellungArt;
  anlass?: string | null;
  ereignisDatum?: string | null;
  von: string;
  bis: string;
  zeitVon?: string | null;
  zeitBis?: string | null;
  status: FreistellungStatus;
  zusatzwoche?: boolean | null;
  /** Gutgeschriebene Minuten — gesetzt beim Bestätigen. */
  minuten?: number | null;
}

const zaehlt = (f: FreistellungFuerRegeln) => f.status === 'Beantragt' || f.status === 'Bestätigt';

/** Derselbe Fall: dieselbe Person, derselbe Anlass, derselbe Ereignistag. */
export function selberFall(a: FreistellungFuerRegeln, b: FreistellungFuerRegeln): boolean {
  return a.art === 'dienstverhinderung' && b.art === 'dienstverhinderung'
    && a.userId === b.userId && !!a.anlass && a.anlass === b.anlass
    && !!a.ereignisDatum && a.ereignisDatum === b.ereignisDatum;
}

/** Gibt es zu diesem Fall schon einen anderen Antrag? Dann ist dieser eine Teilung. */
export function istTeilung(antrag: FreistellungFuerRegeln, andere: readonly FreistellungFuerRegeln[]): boolean {
  return andere.some((x) => x.id !== antrag.id && zaehlt(x) && selberFall(antrag, x));
}

/** Ein ISO-Datum plus `n` Tage. */
export function plusTage(iso: string, n: number): string {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
}

/** Kalendertage von–bis, beide mitgezählt. */
export function kalendertage(von: string, bis: string): number {
  const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((utc(bis) - utc(von)) / 86_400_000) + 1;
}

/** Dauert ein Zeitraum länger als einen Monat? (Sozialversicherung) */
export function laengerAlsEinMonat(von: string, bis: string): boolean {
  const j = Number(von.slice(0, 4));
  const m = Number(von.slice(5, 7));
  const t = Number(von.slice(8, 10));
  const naechster = new Date(Date.UTC(j, m, t)).toISOString().slice(0, 10);
  return bis >= naechster;
}

/**
 * DIE WARNUNGEN FÜR DIE BESTÄTIGENDEN — keine Sperren (Plan 10.3).
 *
 * @param tageVon zählt die Arbeitstage eines Antrags (mit den Arbeitstagen der Person)
 * @param andere alle anderen Anträge derselben Person
 */
export function warnungen(
  antrag: FreistellungFuerRegeln,
  andere: readonly FreistellungFuerRegeln[],
  anlaesse: readonly Anlass[],
  tageVon: (f: FreistellungFuerRegeln) => number,
): string[] {
  const raus: string[] = [];
  if (antrag.art !== 'dienstverhinderung') return raus;
  const anlass = anlassVon(antrag.anlass, anlaesse);
  if (!anlass) return raus;

  const fall = [antrag, ...andere.filter((x) => x.id !== antrag.id && zaehlt(x) && selberFall(antrag, x))];
  const teilung = fall.length > 1;

  if (anlass.tage !== null) {
    const zusammen = fall.reduce((s, f) => s + tageVon(f), 0);
    if (zusammen > anlass.tage) {
      raus.push(
        `Mehr Tage als vorgesehen: dieser Anlass hat zusammen ${zusammen} Arbeitstage, vorgesehen ${anlass.tage === 1 ? 'ist 1' : `sind ${anlass.tage}`}.`,
      );
    }
  }

  if (anlass.regel === 'einmalJeJahr' && antrag.ereignisDatum) {
    const jahr = antrag.ereignisDatum.slice(0, 4);
    const zweiter = andere.some(
      (x) => x.id !== antrag.id && zaehlt(x) && x.userId === antrag.userId && x.art === 'dienstverhinderung'
        && x.anlass === antrag.anlass && x.ereignisDatum?.slice(0, 4) === jahr && x.ereignisDatum !== antrag.ereignisDatum,
    );
    if (zweiter) {
      raus.push('Zweiter Wohnungswechsel in diesem Kalenderjahr. Vorgesehen ist einer — außer ein beruflich veranlasster Ortswechsel macht einen zweiten nötig.');
    }
  }

  /*
    ZEITNAH. Ausgenommen der spätere Teil eines geteilten Todesfalls: die
    Beisetzung darf Wochen später sein.
  */
  if (antrag.ereignisDatum && antrag.von > plusTage(antrag.ereignisDatum, ZEITNAH_TAGE)) {
    const spaeteBeisetzung = !!anlass.todesfall && teilung
      && fall.some((f) => f.id !== antrag.id && f.von < antrag.von);
    if (!spaeteBeisetzung) {
      raus.push(`Beginn mehr als ${ZEITNAH_TAGE} Tage nach dem Ereignis. Die Freistellung steht in zeitlichem Zusammenhang mit dem Anlass zu.`);
    }
  }

  if (teilung && !anlass.todesfall) {
    raus.push('Geteilt: es gibt schon einen Antrag zu diesem Anlass. Außer beim Todesfall bestätigt das nur Geschäftsführung oder Administration.');
  }
  return raus;
}

/* ------------------------------------------------------------------ */
/* Pflegefreistellung: eine Woche je Arbeitsjahr, dazu eine für Kinder  */
/* ------------------------------------------------------------------ */

/**
 * Das Arbeitsjahr, in dem `datum` liegt: ab dem Jahrestag des Eintritts.
 * Ohne Eintritt das Kalenderjahr.
 */
export function arbeitsjahr(eintritt: string | null | undefined, datum: string): { von: string; bis: string } {
  if (!eintritt) {
    const j = datum.slice(0, 4);
    return { von: `${j}-01-01`, bis: `${j}-12-31` };
  }
  const mmdd = eintritt.slice(5, 10) === '02-29' ? '02-28' : eintritt.slice(5, 10);
  const jahr = Number(datum.slice(0, 4));
  const beginn = datum.slice(5, 10) >= mmdd ? jahr : jahr - 1;
  const von = `${beginn}-${mmdd}`;
  return { von, bis: plusTage(`${beginn + 1}-${mmdd}`, -1) };
}

/** Eine Woche Pflegefreistellung in Minuten: die Wochenstunden der Person. */
export function pflegeWocheMin(wochenstunden: number | null | undefined): number {
  return (Number(wochenstunden ?? 40) || 40) * 60;
}

export interface PflegeStand {
  /** Minuten der ersten Woche, die im Arbeitsjahr noch offen sind. */
  ersteWocheRestMin: number;
  /** Minuten der Zusatzwoche (Kind unter 12), die noch offen sind. */
  zusatzwocheRestMin: number;
  /** Die Zusatzwoche gibt es erst, wenn die erste verbraucht ist. */
  zusatzwocheMoeglich: boolean;
}

/**
 * Der Stand der Pflegefreistellung — gezählt wird, was BESTÄTIGT und
 * gutgeschrieben ist (`minuten`), im Arbeitsjahr des Datums.
 */
export function pflegeStand(
  freistellungen: readonly FreistellungFuerRegeln[],
  wochenstunden: number | null | undefined,
  eintritt: string | null | undefined,
  datum: string,
): PflegeStand {
  const woche = pflegeWocheMin(wochenstunden);
  const jahr = arbeitsjahr(eintritt, datum);
  const imJahr = freistellungen.filter(
    (f) => f.art === 'pflegefreistellung' && f.status === 'Bestätigt' && f.von >= jahr.von && f.von <= jahr.bis,
  );
  const erste = imJahr.filter((f) => !f.zusatzwoche).reduce((s, f) => s + (Number(f.minuten) || 0), 0);
  const zusatz = imJahr.filter((f) => f.zusatzwoche).reduce((s, f) => s + (Number(f.minuten) || 0), 0);
  return {
    ersteWocheRestMin: Math.max(0, woche - erste),
    zusatzwocheRestMin: Math.max(0, woche - zusatz),
    zusatzwocheMoeglich: erste >= woche,
  };
}
