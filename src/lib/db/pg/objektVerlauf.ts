/**
 * Der Verlauf eines Geschäftsobjekts (M01b) — nur lesen.
 *
 * Gelesen wird die Sicht `objekt_verlauf`: das Änderungsjournal
 * (`20261106100000_aenderungsjournal.sql`, geschrieben ausschließlich von
 * Triggern) zusammen mit den Verläufen, die es schon gab — Mahnungen,
 * Wartungsausführungen, Kontoumstellungen, Anpassungen des Urlaubsanspruchs.
 * Jeder Teil liest mit der Regel seiner Quelle; wer das Objekt nicht sehen
 * darf, bekommt nichts.
 */
import { abfragen, type Bedingung } from './kern';

export type Objektart =
  | 'kunde' | 'baustelle' | 'angebot' | 'rechnung' | 'zahlung' | 'wartung' | 'benutzer' | 'eingang'
  // M02c: die Liegenschaft — Tops und Beteiligte stehen unter ihr (`bezugId`), ohne eigene Akte.
  | 'liegenschaft' | 'top' | 'beteiligter';

/** Was keine eigene Akte hat und im Verlauf seines Bezugs steht: Zahlung (Rechnung), Top und Beteiligter (Liegenschaft). */
export type OhneAkte = 'zahlung' | 'top' | 'beteiligter';
/** Was eine Akte mit Verlauf hat. */
export type Aktenart = Exclude<Objektart, OhneAkte>;

export type ObjektVerlaufArt =
  | 'angelegt' | 'geaendert' | 'geloescht'
  | 'gemahnt' | 'ausgefuehrt' | 'konto_umgestellt' | 'urlaubsanspruch_angepasst' | 'urlaubsanspruch_entfernt';

export interface ObjektVerlaufZeile {
  /** `journal` oder die Quelle eines vorhandenen Verlaufs (`mahnung`, …). */
  quelle: string;
  /** Text: die Kontoumstellungen tragen eine Zählnummer, alle übrigen eine UUID. */
  id: string;
  objektart: Objektart;
  objektId: string;
  /** Bei einer Zahlung die Rechnung; bei Top und Beteiligtem die Liegenschaft. */
  bezugId?: string;
  art: ObjektVerlaufArt;
  /**
   * Beim Ändern je Spalte `{ alt, neu }` (Spaltennamen der Datenbank, Werte
   * wie Postgres sie liefert) oder `{ entfernt: true }`, wenn die Werte mit
   * den Kundendaten gelöscht wurden. Beim Anlegen und Löschen leer; bei den
   * Quellen deren Angaben (Stufe, Frist, …).
   */
  aenderungen: Record<string, unknown>;
  /** Woran ein Mensch das Objekt beim Schreiben erkannte — Nummer, Name, Betrag. */
  bezeichnung?: string;
  vonName?: string;
  /** Millisekunden — `am` ist ein Zeitpunkt (`spaltentypen.ts`). */
  am: number;
  /**
   * Derselbe Zeitpunkt, wie Postgres ihn schreibt — auf die Mikrosekunde.
   * Nur für das Weiterblättern: in Millisekunden gerundet stünden zwei
   * Einträge derselben Millisekunde (eine Zahlung und was sie an der Rechnung
   * bewirkt) gleich da, und an einer Seitengrenze fiele einer heraus.
   */
  amRoh: string;
}

/** Wo die nächste Seite beginnt: nach diesem Eintrag (neueste zuerst). */
export interface VerlaufZeiger {
  am: string;
  id: string;
}

export interface VerlaufSeite {
  zeilen: ObjektVerlaufZeile[];
  /** `null`, wenn die Seite nicht voll war — dann gibt es nichts Älteres. */
  weiter: VerlaufZeiger | null;
}

/**
 * Wie viele Einträge eine Seite trägt. Kein stilles Limit: „Ältere Einträge
 * laden“ holt die nächste, solange eine volle kam.
 */
export const VERLAUF_SEITE = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ein Wert für die `or`-Bedingung, in Anführungszeichen: Zeitpunkte tragen
 * Doppelpunkte, Leerzeichen und Pluszeichen, die Kennung einer entfernten
 * Urlaubsanpassung einen Doppelpunkt. Ein Anführungszeichen darin gibt es bei
 * Werten aus der Datenbank nicht — käme eines, bricht es ab, statt die
 * Bedingung zu verbiegen.
 */
function zitiert(wert: string): string {
  if (/["\\]/.test(wert)) throw new Error(`Unbrauchbarer Wert für den Verlauf: ${wert}`);
  return `"${wert}"`;
}

/**
 * Eine Seite des Verlaufs eines Objekts, neueste zuerst.
 *
 * Bei einer RECHNUNG gehören ihre Zahlungen dazu (auch gelöschte): Zeilen
 * des Objekts selbst oder mit ihm als Bezug. Ebenso bei einer LIEGENSCHAFT
 * ihre Tops und Beteiligten (M02c).
 *
 * WEITERGEBLÄTTERT WIRD ÜBER DEN SCHLÜSSEL (`am`, dann `id`), nicht über eine
 * Stelle: kommt zwischen zwei Seiten ein neuer Eintrag dazu, verschöbe eine
 * Stelle alles um eins, und ein Eintrag stünde doppelt da.
 */
export async function listObjektVerlauf(
  companyId: string,
  objektart: Aktenart,
  objektId: string,
  nach?: VerlaufZeiger | null,
): Promise<VerlaufSeite> {
  // Die Kennung kommt aus der Adresse der Akte — in eine Bedingung nur, was eine ist.
  if (!UUID.test(objektId)) throw new Error(`Keine Kennung: ${objektId}`);

  const mitBezug = objektart === 'rechnung' || objektart === 'liegenschaft';
  const wo: Bedingung[] = mitBezug
    ? []
    : [{ art: 'gleich', feld: 'objektart', wert: objektart }, { art: 'gleich', feld: 'objektId', wert: objektId }];
  const teile: string[] = [];
  if (objektart === 'rechnung') {
    teile.push(`or(and(objektart.eq.rechnung,objekt_id.eq.${objektId}),and(objektart.eq.zahlung,bezug_id.eq.${objektId}))`);
  }
  // M02c: die Liegenschaft mit ihren Tops und Beteiligten — auch gelöschten.
  if (objektart === 'liegenschaft') {
    teile.push(`or(and(objektart.eq.liegenschaft,objekt_id.eq.${objektId}),and(objektart.in.(top,beteiligter),bezug_id.eq.${objektId}))`);
  }
  if (nach) {
    // Sortiert ist nach `am` absteigend, bei Gleichstand nach `id` aufsteigend (`kern.ts`).
    teile.push(`or(am.lt.${zitiert(nach.am)},and(am.eq.${zitiert(nach.am)},id.gt.${zitiert(nach.id)}))`);
  }

  const zeilen = await abfragen<ObjektVerlaufZeile>('objekt_verlauf', companyId, {
    wo,
    oder: teile.length > 0 ? `and(${teile.join(',')})` : null,
    sortiere: { feld: 'am', absteigend: true },
    grenze: VERLAUF_SEITE,
    spalten: '*,am_roh:am::text',
  });
  const letzte = zeilen[zeilen.length - 1];
  return {
    zeilen,
    weiter: zeilen.length === VERLAUF_SEITE && letzte ? { am: letzte.amRoh, id: letzte.id } : null,
  };
}
