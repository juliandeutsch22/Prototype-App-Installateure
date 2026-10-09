import type { Abwesenheit } from '@/lib/db/vacations';
import type { Assignment, Project, Termin } from '@/types';
import { baustellenTitel } from '@/lib/baustellenTitel';
import { getAustrianHolidayName, isWeekend } from '@/lib/time';
import { terminKopf } from '@/features/termine/terminText';
import { einsatzZeit } from './einsatzZeit';
import { ganztagsWeg } from './besetzung';
import { artWort, lieferungOhneAnnahme } from './monatsBalken';
import { kurzname } from './kurzname';

/*
  WAS DIE VORSCHAU ZEIGT (Runde 4, Auftrag 5.3) — als reine Rechnung, damit
  sich prüfen lässt, dass sie dasselbe sagt wie das Seitenfenster „Einsatz
  bearbeiten“. Die Regeln stehen deshalb hier wie dort:
  - Zeit und Aufgabe aus der ERSTEN Zeile des Paars aus Tag und Baustelle
    (das Formular übernimmt `existing[0]`),
  - eingeteilt ist, wer eine Zeile hat, in der Reihenfolge der Zeilen,
  - fehlen tut, wer ganztags weg ist (`ganztagsWeg`, wie in der Woche),
  - Termine derselben Baustelle am selben Tag wie „Am selben Tag auf dieser
    Baustelle“ im Formular (`terminKopf`).
*/

/** Was die Vorschau von einer Baustelle braucht. */
export type ProjektKurz = Pick<Project, 'id' | 'customerName' | 'bezeichnung' | 'address'>;

/** Für wen bzw. was die Vorschau offen ist. */
export type VorschauZiel =
  | { art: 'person'; uid: string; name: string; tag: string; nummer?: string }
  | { art: 'baustelle'; nummer: string; name: string; tag: string }
  | { art: 'tag'; tag: string };

/** Was über einen Tag geladen ist. */
export interface TagesDaten {
  einsaetze: Assignment[];
  urlaube: Abwesenheit[];
  termine: Termin[];
  /** Bezeichnung des Betriebsurlaubs an diesem Tag, sonst `null`. */
  zu: string | null;
  /** Hat der Betrieb an diesem Tag für DIESE Person zu (Ausgenommene arbeiten)? */
  zuFuer: (uid: string) => boolean;
}

/** Ein Einsatz in der Vorschau: eine Baustelle an diesem Tag. */
export interface EinsatzTeil {
  nummer: string;
  titel: string;
  zeit: string;
  /** `undefined`: wird noch geladen; `null`: keine Adresse hinterlegt. */
  adresse: string | null | undefined;
  leuteName: 'Mit dabei' | 'Eingeteilt';
  leute: string;
  aufgabe: string | null;
  termine: string[];
  fehlen: string[];
  projektId: string | null;
}

export interface TerminTeil {
  termin: Termin;
  titel: string;
  unter: string;
  ohneAnnahme: boolean;
}

export interface VorschauInhalt {
  /** „Dienstag, 13.10.2026“, am Feiertag mit Namen. */
  ueber: string;
  titel: string;
  einsaetze: EinsatzTeil[];
  abwesenheiten: { titel: string; unter: string }[];
  termine: TerminTeil[];
  /** „Frei – noch kein Einsatz an diesem Tag.“ — nur wenn sonst nichts dasteht. */
  frei: string | null;
  /** Sicht „Tag“: wer an diesem Tag abwesend ist (Grund nach den Rechten). */
  abwesend: string[];
}

const WOCHENTAG_LANG = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', { weekday: 'long' });

/** „Dienstag, 13.10.2026“ bzw. „Montag, 26.10.2026 · Nationalfeiertag“. */
export function vorschauDatum(tag: string): string {
  const d = new Date(`${tag}T00:00:00`);
  const datum = d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const feiertag = getAustrianHolidayName(d);
  return `${WOCHENTAG_LANG(tag)}, ${datum}${feiertag ? ` · ${feiertag}` : ''}`;
}

const ddmm = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });

/** „13.10.–16.10.“ bzw. „13.10.“ */
export function zeitraum(von: string, bis: string): string {
  return von === bis ? ddmm(von) : `${ddmm(von)}–${ddmm(bis)}`;
}

/**
 * Ein Einsatz (Baustelle an einem Tag) für die Vorschau. `ohne` ist die
 * Person, aus deren Zeile die Vorschau geöffnet wurde: sie steht nicht unter
 * „Mit dabei“.
 */
export function einsatzTeil(
  tag: string,
  nummer: string,
  daten: Pick<TagesDaten, 'einsaetze' | 'urlaube' | 'termine'>,
  /** `undefined`: noch nicht geladen; `null`: nicht zu finden. */
  projekt: ProjektKurz | null | undefined,
  nameVon: (a: Pick<Assignment, 'userId' | 'userName'>) => string,
  ohne?: string,
): EinsatzTeil {
  const zeilen = daten.einsaetze.filter((a) => a.date === tag && a.projectNumber === nummer);
  const erste = zeilen[0];
  const leute = zeilen
    .filter((a) => a.userId !== ohne)
    .map((a) => {
      const zusatz = [a.asHelper ? 'Helfer' : null, ganztagsWeg(daten.urlaube, a.userId, tag) ? 'fehlt' : null].filter(Boolean);
      return zusatz.length > 0 ? `${nameVon(a)} (${zusatz.join(', ')})` : nameVon(a);
    });
  const fehlen = zeilen.flatMap((a) => {
    const weg = ganztagsWeg(daten.urlaube, a.userId, tag);
    if (!weg) return [];
    // Ohne sichtbaren Grund nur „abwesend“ — die Datenbank entscheidet, wer ihn sieht.
    return [`${nameVon(a)} ist an diesem Tag ${weg.grund ? `abwesend (${artWort(weg.grund)})` : 'abwesend'} – neu einteilen?`];
  });
  const termine = daten.termine
    .filter((t) => t.datum === tag && t.projectNumber === nummer)
    .map((t) => `Am selben Tag: ${terminKopf(t)}`);
  const titel = projekt ? baustellenTitel(projekt) || nummer : nummer;
  return {
    nummer,
    titel,
    zeit: (erste && einsatzZeit(erste)) || 'ganzer Tag, ohne Uhrzeit',
    adresse: projekt === undefined ? undefined : projekt?.address?.trim() || null,
    leuteName: ohne ? 'Mit dabei' : 'Eingeteilt',
    leute: leute.length > 0 ? leute.join(', ') : ohne ? 'allein' : '–',
    aufgabe: erste?.comment?.trim() || null,
    termine,
    fehlen,
    projektId: projekt?.id ?? null,
  };
}

function terminTeil(t: Termin, einsaetze: Assignment[], bezug: (t: Termin) => string): TerminTeil {
  return { termin: t, titel: terminKopf(t), unter: bezug(t), ohneAnnahme: lieferungOhneAnnahme(t, einsaetze) };
}

/** Die Baustellen eines Tages in der Reihenfolge ihrer ersten Zeile — ohne Doppel. */
function nummernAm(einsaetze: Assignment[], tag: string, uid?: string): string[] {
  return [...new Set(einsaetze.filter((a) => a.date === tag && (!uid || a.userId === uid)).map((a) => a.projectNumber))];
}

/**
 * Der ganze Inhalt der Vorschau für ein Ziel. `projekt` liefert die Baustelle
 * (Kunde, Bezeichnung, Adresse) aus dem, was geladen ist; `bezug` den Ort
 * eines Termins (`bezugText`).
 */
export function vorschauInhalt(
  ziel: VorschauZiel,
  daten: TagesDaten,
  projekt: (nummer: string) => ProjektKurz | null | undefined,
  nameVon: (a: Pick<Assignment, 'userId' | 'userName'>) => string,
  bezug: (t: Termin) => string,
  personen: { uid: string; name: string }[] = [],
): VorschauInhalt {
  const tag = ziel.tag;
  const d = new Date(`${tag}T00:00:00`);
  const feiertag = getAustrianHolidayName(d);
  const ruhetag = feiertag ?? (isWeekend(d) ? WOCHENTAG_LANG(tag) : null);
  const termineDesTages = daten.termine.filter((t) => t.datum === tag);
  const leer: VorschauInhalt = { ueber: vorschauDatum(tag), titel: '', einsaetze: [], abwesenheiten: [], termine: [], frei: null, abwesend: [] };

  if (ziel.art === 'person') {
    let nummern = nummernAm(daten.einsaetze, tag, ziel.uid);
    // Der angeklickte Einsatz zuerst (Auftrag 5.3).
    if (ziel.nummer && nummern.includes(ziel.nummer)) nummern = [ziel.nummer, ...nummern.filter((n) => n !== ziel.nummer)];
    const eigene = daten.urlaube.filter((v) => v.userId === ziel.uid && v.von <= tag && v.bis >= tag);
    const abwesenheiten = eigene.map((v) => ({
      titel: [artWort(v.grund), v.zeiten].filter(Boolean).join(' '),
      unter: v.zeiten ? `${zeitraum(v.von, v.bis)} · stundenweise, einplanbar` : zeitraum(v.von, v.bis),
    }));
    const ganztags = eigene.some((v) => !v.zeiten);
    if (!ganztags && daten.zuFuer(ziel.uid)) abwesenheiten.push({ titel: 'Betriebsurlaub', unter: daten.zu ?? '' });
    const einsaetze = nummern.map((n) => einsatzTeil(tag, n, daten, projekt(n), nameVon, ziel.uid));
    const termine = termineDesTages.filter((t) => t.teilnehmer.includes(ziel.uid)).map((t) => terminTeil(t, daten.einsaetze, bezug));
    const weg = ganztags || (!eigene.length && daten.zuFuer(ziel.uid));
    const frei =
      einsaetze.length > 0 || weg
        ? null
        : ruhetag
          ? `${ruhetag} – kein Einsatz.`
          : 'Frei – noch kein Einsatz an diesem Tag.';
    return { ...leer, titel: ziel.name, einsaetze, abwesenheiten, termine, frei };
  }

  if (ziel.art === 'baustelle') {
    const einsaetze = nummernAm(daten.einsaetze, tag).includes(ziel.nummer)
      ? [einsatzTeil(tag, ziel.nummer, daten, projekt(ziel.nummer), nameVon)]
      : [];
    // Ohne Einsatz stehen die Termine der Baustelle für sich (etwa die Lieferung, die niemand annimmt).
    const termine =
      einsaetze.length > 0
        ? []
        : termineDesTages.filter((t) => t.projectNumber === ziel.nummer).map((t) => terminTeil(t, daten.einsaetze, bezug));
    const frei = einsaetze.length > 0 || termine.length > 0 ? null : 'Kein Einsatz an diesem Tag.';
    // Im Kopf die Kurzform: der volle Name steht gleich darunter im Abschnitt.
    return { ...leer, titel: kurzname(ziel.name) || ziel.name, einsaetze, termine, frei };
  }

  // Sicht „Tag“ (Handy, „Alle Personen“; Kopf eines Tages): alle Einsätze, alle Termine.
  const einsaetze = nummernAm(daten.einsaetze, tag)
    .map((n) => einsatzTeil(tag, n, daten, projekt(n), nameVon))
    .sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
  const termine = termineDesTages.map((t) => terminTeil(t, daten.einsaetze, bezug));
  const namen = new Map(personen.map((p) => [p.uid, p.name]));
  const abwesend = daten.urlaube
    .filter((v) => namen.has(v.userId) && v.von <= tag && v.bis >= tag)
    .map((v) => {
      const text = [v.grund ? artWort(v.grund) : null, v.zeiten].filter(Boolean).join(' ');
      return text ? `${namen.get(v.userId)} (${text})` : (namen.get(v.userId) as string);
    });
  const frei =
    einsaetze.length > 0 || termine.length > 0 ? null : daten.zu ? `Betriebsurlaub – ${daten.zu}.` : 'Nichts geplant.';
  return { ...leer, titel: 'Alle Einsätze', einsaetze, termine, frei, abwesend };
}

/**
 * DIE RÜSTLISTE IN EINER ZEILE: „3 Positionen · 1 mit Fehlmenge“ bzw.
 * „keine“. Die Fehlmenge je Position ist dieselbe wie im Formular
 * (`RuestlistePlanen` mit `verfuegbar` aus `EinsatzFormular`): frei laut
 * `lager_frei()`, die eigene gespeicherte Menge ab heute wieder dazu — sonst
 * reservierte sich die Liste selbst weg —, Fehlmenge nur bei einem
 * Katalogartikel. Ohne Lagerstand (Abfrage fehlgeschlagen) nennt die Zeile
 * nur die Positionen, statt eine Fehlmenge zu raten.
 */
export function ruestZeile(
  positionen: { materialId?: string; menge: number }[] | undefined,
  frei: Map<string, { frei: number }> | null,
  tag: string,
  heute: string,
): string {
  if (!positionen || positionen.length === 0) return 'keine';
  const n = positionen.length;
  const text = `${n} ${n === 1 ? 'Position' : 'Positionen'}`;
  if (!frei) return text;
  const eigene = new Map<string, number>();
  if (tag >= heute) {
    for (const p of positionen) if (p.materialId) eigene.set(p.materialId, (eigene.get(p.materialId) ?? 0) + p.menge);
  }
  const mitFehlmenge = positionen.filter((p) => {
    const stand = p.materialId ? frei.get(p.materialId) : undefined;
    if (!p.materialId || !stand) return false;
    const da = stand.frei + (eigene.get(p.materialId) ?? 0);
    return Math.max(0, Math.round((p.menge - Math.max(da, 0)) * 1000) / 1000) > 0;
  }).length;
  return mitFehlmenge > 0 ? `${text} · ${mitFehlmenge} mit Fehlmenge` : text;
}
