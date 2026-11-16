/**
 * Wiederkehrende Wartungen — auf Postgres.
 *
 * Die Tabelle bleibt klein: eine Vereinbarung je Anlage, nicht je Termin. Ein
 * Betrieb mit dreihundert gewarteten Thermen hat dreihundert Zeilen, und zwar
 * dauerhaft — eine Ausführung rückt den Termin weiter. Festgehalten wird sie
 * seit 12.10.2026 (17 G) zusätzlich in `wartung_ausfuehrungen`, je Anlage
 * eine Zeile pro Wartung; das schreibt die Datenbank selbst.
 */
import type { Wartung, WartungAusfuehrung } from '@/types';
import { naechsterTermin } from '@/features/maintenance/wartungsplan';
import { abfragen, anlegen, aendern, derClient, loeschen, type WithId } from './kern';
import { zeileAlsObjekt } from './felder';

const WARTUNGEN = 'wartungen';
const AUSFUEHRUNGEN = 'wartung_ausfuehrungen';

/**
 * Jede Ausführung einer Wartung, die jüngste zuerst (17 G). Geschrieben
 * werden sie nur von der Datenbank — hier wird nur gelesen.
 */
export function listAusfuehrungen(companyId: string, wartungId: string): Promise<WithId<WartungAusfuehrung>[]> {
  return abfragen<WartungAusfuehrung>(AUSFUEHRUNGEN, companyId, {
    wo: [{ art: 'gleich', feld: 'wartungId', wert: wartungId }],
    sortiere: { feld: 'am', absteigend: true },
  });
}

/**
 * Alle Vereinbarungen, nach Termin.
 *
 * Sortiert nach `faelligAm` statt nach Name: diese Liste beantwortet „was
 * kommt", nicht „wo steht Huber". Zum Nachschlagen gibt es die Suche in der
 * Ansicht.
 */
export function listWartungen(companyId: string, max = 500) {
  return abfragen<Wartung>(WARTUNGEN, companyId, {
    sortiere: { feld: 'faelligAm' },
    grenze: max,
  });
}

/**
 * Was bis zu einem Stichtag fällig ist.
 *
 * HIER VERSCHWINDET EIN NACHFILTER, UND SEIN GRUND GLEICH MIT. In Firestore
 * lief der Ruht-Filter im Browser, weil eine Abfrage Dokumente nicht findet,
 * denen das Feld ganz fehlt: eine Vereinbarung ohne `aktiv` wäre
 * stillschweigend aus der Liste der fälligen Wartungen verschwunden, und das
 * ist der eine Fall, in dem Schweigen teuer ist.
 *
 * Eine Spalte kann nicht fehlen. `aktiv` trägt `not null default true`, also
 * gehört die Bedingung in die Abfrage — und damit greift die Obergrenze
 * endlich auf die richtige Menge statt auf eine, aus der danach noch etwas
 * herausfällt.
 */
export function listFaelligeWartungen(companyId: string, bis: string, max = 200) {
  return abfragen<Wartung>(WARTUNGEN, companyId, {
    wo: [
      { art: 'bis', feld: 'faelligAm', wert: bis },
      { art: 'gleich', feld: 'aktiv', wert: true },
    ],
    sortiere: { feld: 'faelligAm' },
    grenze: max,
  });
}

/**
 * Die Wartungen, deren Baustelle diese ist (Testbericht Runde 6, M9) — für
 * den vereinbarten Preis auf der Rechnung.
 *
 * Eingeplant steht die Baustelle an der Wartung (`offeneBaustelle`); nach
 * „Erledigt“ wandert sie in die Ausführung, und die nächste Ausführung
 * überschreibt `letzteBaustelle`. Deshalb beide Wege: was eingeplant ist,
 * und jede Ausführung, die auf dieser Baustelle stattfand. Die Nummer gilt
 * mit und ohne „PR-“, wie bei den Rechnungen einer Baustelle.
 */
export type WartungDerBaustelle = WithId<Wartung> & {
  /** Der jüngste Tag, an dem sie auf dieser Baustelle ausgeführt wurde — der Leistungstag. */
  ausgefuehrtAm: string | null;
  /**
   * Wie viele Durchgänge der Wartung auf dieser Baustelle liegen (M01e): jede
   * Ausführung hier, und einer mehr, solange sie hier eingeplant ist. So
   * viele gültige Rechnungen der Baustelle dürfen sie tragen — dieselbe Zahl
   * zählt die Datenbank (`app.wartung_durchgaenge`). Meist einer; mehrere,
   * wenn jemand die Wartung jedes Jahr auf dieselbe Baustelle erledigt.
   */
  durchgaenge: number;
};

export async function wartungenDerBaustelle(companyId: string, projectNumber: string): Promise<WartungDerBaustelle[]> {
  const blank = (projectNumber ?? '').trim().replace(/^PR-/i, '');
  if (!blank) return [];
  const formen = [...new Set([projectNumber.trim(), blank, `PR-${blank}`])];
  const [eingeplant, ausgefuehrt] = await Promise.all([
    abfragen<Wartung>(WARTUNGEN, companyId, { wo: [{ art: 'in', feld: 'offeneBaustelle', werte: formen }] }),
    abfragen<WartungAusfuehrung>(AUSFUEHRUNGEN, companyId, { wo: [{ art: 'in', feld: 'baustelle', werte: formen }] }),
  ]);
  const schon = new Set(eingeplant.map((w) => w.id));
  const fehlen = [...new Set(ausgefuehrt.map((a) => a.wartungId))].filter((id) => !schon.has(id));
  const weitere = fehlen.length > 0
    ? await abfragen<Wartung>(WARTUNGEN, companyId, { wo: [{ art: 'in', feld: 'id', werte: fehlen }] })
    : [];
  const zuletzt = new Map<string, string>();
  const ausfuehrungen = new Map<string, number>();
  for (const a of ausgefuehrt) {
    if (a.am && (zuletzt.get(a.wartungId) ?? '') < a.am) zuletzt.set(a.wartungId, a.am);
    ausfuehrungen.set(a.wartungId, (ausfuehrungen.get(a.wartungId) ?? 0) + 1);
  }
  return [...eingeplant, ...weitere].map((w) => ({
    ...w,
    ausgefuehrtAm: zuletzt.get(w.id) ?? null,
    durchgaenge: (ausfuehrungen.get(w.id) ?? 0) + (schon.has(w.id) ? 1 : 0),
  }));
}

/** Die Vereinbarungen EINES Kunden — für die Kundenakte. */
export function listWartungenForCustomer(companyId: string, customerId: string, max = 100) {
  return abfragen<Wartung>(WARTUNGEN, companyId, {
    wo: [{ art: 'gleich', feld: 'customerId', wert: customerId }],
    grenze: max,
  });
}

export type NewWartung = Omit<Wartung, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>;

export function createWartung(companyId: string, w: NewWartung): Promise<string> {
  return anlegen(WARTUNGEN, companyId, w);
}

export function updateWartung(id: string, data: Partial<NewWartung>): Promise<void> {
  return aendern(WARTUNGEN, id, data);
}

export function deleteWartung(id: string): Promise<void> {
  return loeschen(WARTUNGEN, id);
}

/**
 * Eine Wartung als erledigt eintragen — und damit den nächsten Termin setzen.
 *
 * DAS IST DER SCHRITT, AN DEM DIE VEREINBARUNG LEBT. Ohne ihn wäre die Liste
 * nach dem ersten Frühjahr eine Sammlung überfälliger Zeilen, die niemand
 * mehr ernst nimmt. Beides geschieht in EINEM Schreibvorgang: ein Zustand
 * „gewartet, aber ohne nächsten Termin" darf nicht entstehen.
 *
 * Das Intervall wird MITGEGEBEN, nicht aus der Zeile nachgelesen. Wer beim
 * Eintragen der erledigten Wartung zugleich das Intervall ändert (aus zwei
 * Jahren wird eines), erwartet, dass der neue Termin schon danach rechnet.
 */
export async function wartungErledigt(
  id: string,
  args: { erledigtAm: string; intervallMonate: number; projectNumber?: string },
): Promise<void> {
  /*
    `async`, damit auch das synchrone Werfen ankommt: ein unbrauchbares Intervall
    lässt `naechsterTermin` werfen, und zwar SYNCHRON. Ohne `async` käme der
    Fehler nicht als abgelehntes Versprechen zurück, sondern flöge an jedem
    `.catch()` vorbei — ein Aufrufer, der nicht `await` benutzt, sähe einen
    Absturz statt einer Meldung.
  */
  const faellig = naechsterTermin(args.erledigtAm, args.intervallMonate);
  /*
    Über die Datenbankfunktion und nicht als Änderung der Zeile (A13): ein
    leeres Baustellenfeld heißt „ohne Baustelle“. Als Zeilenänderung fiel
    das Feld weg, die Spalte behielt die Baustelle der vorigen Wartung, und
    die neue Ausführung stand auf ihr. Die Funktion leert im selben Schritt
    die eingeplante Baustelle — sie ist mit dem Eintrag gewesen.
  */
  const { error } = await derClient().rpc('wartung_erledigt_eintragen', {
    p_wartung: id,
    p_am: args.erledigtAm,
    p_faellig: faellig,
    p_intervall: args.intervallMonate,
    p_baustelle: args.projectNumber?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Den Tag der letzten Wartung BERICHTIGEN, statt eine weitere einzutragen
 * (Stand 18, G3). War „zuletzt gewartet“ ein Tippfehler, stünde der falsche
 * Tag sonst als zweite Ausführung im Verlauf. Die Datenbank ersetzt die
 * Ausführung am bisherigen Tag durch die am richtigen und setzt den Tag —
 * in einem Schritt (`wartung_tag_berichtigen`).
 */
export async function wartungTagBerichtigen(id: string, am: string): Promise<void> {
  const { error } = await derClient().rpc('wartung_tag_berichtigen', { p_wartung: id, p_am: am });
  if (error) throw new Error(error.message);
}

/**
 * Die Baustelle vormerken, die für die anstehende Wartung angelegt wurde.
 *
 * Getrennt von `wartungErledigt`, weil es der Schritt DAVOR ist: hier ist noch
 * nichts gewartet, es steht nur fest, wohin gefahren wird. Wer beides in eine
 * Funktion legte, müsste beim Anlegen schon ein Ausführungsdatum erfinden —
 * und der nächste Termin rückte, bevor jemand da war.
 */
export function wartungEingeplant(id: string, projectNumber: string): Promise<void> {
  return updateWartung(id, { offeneBaustelle: projectNumber.trim() });
}

/**
 * Wartungen suchen — serverseitig, mit Treffern in der Wortmitte.
 *
 * Die Wartungen sind das Einzige im Bestand, das in die ZUKUNFT zeigt:
 * welche Anlage wann wieder fällig wird. Eine, die sich nicht finden lässt,
 * ist ein verlorener Auftrag und nicht nur eine unbequeme Liste.
 */
export function searchWartungen(
  companyId: string, begriff: string, max = 500,
): Promise<WithId<Wartung>[]> {
  return abfragen<Wartung>(WARTUNGEN, companyId, {
    suche: { spalten: ['customer_name', 'anlage', 'address'], begriff },
    sortiere: { feld: 'faelligAm' },
    grenze: max,
  });
}

/** Baustelle und Zuordnung entstehen in derselben Transaktion. */
export async function wartungEinplanen(id: string, nummer: string | null, praefix: string, faellig: string): Promise<string> {
  const { data, error } = await derClient().rpc('wartung_einplanen', {
    p_wartung: id, p_nummer: nummer, p_praefix: praefix, p_faellig: faellig,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Eine Wartung — für den Sprung „Erledigt“ von der Startseite (A9). `null`, wenn es sie nicht (mehr) gibt. */
export async function getWartung(companyId: string, id: string): Promise<WithId<Wartung> | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const zeilen = await abfragen<Wartung>(WARTUNGEN, companyId, { wo: [{ art: 'gleich', feld: 'id', wert: id }], grenze: 1 });
  return zeilen[0] ?? null;
}

/**
 * Eingeplante Wartungen, die erledigt aussehen (A9): ein unterschriebener
 * Schein auf ihrer Baustelle oder eine abgeschlossene Baustelle — mit dem
 * Tag als Vorschlag. Nur für die Führung; für alle anderen leer.
 */
export interface WartungErledigtVorschlag {
  wartungId: string;
  anlage: string;
  kunde: string;
  baustelle: string;
  baustelleId: string;
  /** `JJJJ-MM-TT` */
  am: string;
  grund: 'schein' | 'abgeschlossen';
}

export async function wartungErledigtVorschlaege(): Promise<WartungErledigtVorschlag[]> {
  const { data, error } = await derClient().rpc('wartung_erledigt_vorschlaege');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((z) => ({
    wartungId: String(z.wartung),
    anlage: String(z.anlage ?? ''),
    kunde: String(z.kunde ?? ''),
    baustelle: String(z.baustelle ?? ''),
    baustelleId: String(z.baustelle_id ?? ''),
    am: String(z.am ?? ''),
    grund: z.grund === 'schein' ? 'schein' : 'abgeschlossen',
  }));
}

/** Die fälligen Wartungen der Startseite: je Abschnitt die Zahl und die ersten (`wartungen_faellig_stand`). */
export interface WartungenStand {
  /** Aktiv, fällig bis zum Stichtag, ohne offene Baustelle. */
  ohne: { anzahl: number; ueberfaellig: number; zeilen: WithId<Wartung>[] };
  /** Dasselbe mit offener Baustelle — ohne die mit Vorschlag „erledigt?“. */
  eingeplant: { anzahl: number; ueberfaellig: number; zeilen: WithId<Wartung>[] };
}

/**
 * ZAHL UND DIE ERSTEN STATT ALLER FÄLLIGEN (Durchsicht 15.11.2026, Budget
 * B3). Die Startseite holte jede fällige Wartung bis zum Stichtag — bis zu
 * 200, darüber wurden Zahl und Abschnitte still zu niedrig. Die Datenbank
 * zählt und gibt je Abschnitt die ersten `anzahl` nach dem Fälligkeitstag.
 */
export async function wartungenFaelligStand(
  heute: string,
  bis: string,
  anzahl: number,
  ohne: readonly string[] = [],
): Promise<WartungenStand> {
  const { data, error } = await derClient().rpc('wartungen_faellig_stand', {
    p_heute: heute, p_bis: bis, p_anzahl: anzahl, p_ohne: [...ohne],
  });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, { anzahl?: number; ueberfaellig?: number; zeilen?: Record<string, unknown>[] } | undefined>;
  const teil = (t: (typeof d)[string]) => ({
    anzahl: Number(t?.anzahl ?? 0),
    ueberfaellig: Number(t?.ueberfaellig ?? 0),
    zeilen: (t?.zeilen ?? []).map((z) => zeileAlsObjekt<WithId<Wartung>>(WARTUNGEN, z)),
  });
  return { ohne: teil(d.ohne), eingeplant: teil(d.eingeplant) };
}
