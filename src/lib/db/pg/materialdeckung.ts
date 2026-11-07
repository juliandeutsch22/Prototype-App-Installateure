/**
 * Materialbereitschaft und Bestellvorschläge (M04b) — auf Postgres.
 *
 * Beide Fragen gehen an je EINE Funktion der Datenbank, die ihre Antwort als
 * einen JSON-Wert gibt: die Schnittstelle deckelt Tabellen still bei 1.000
 * Zeilen, und eine Woche mit vielen Rüstlisten hätte mehr Positionen.
 */
import { derClient } from './kern';

/** Was die Anforderungen einer Rüstposition gerade sind — die Stände schließen einander aus. */
export interface AnforderungsStand {
  angefordert: number;
  /** Verbucht oder „Erledigt“. */
  abgeholt: number;
  /** Aus dem Lager zugesagt, geliefert, „Abholbereit“. */
  bereit: number;
  /** Beim Großhändler bestellt, noch nicht geliefert. */
  bestellt: number;
  /** Der späteste Liefertermin der bestellten (JJJJ-MM-TT). */
  termin: string | null;
  /** Mindestens eine bestellte hat keinen Liefertermin. */
  terminOffen: boolean;
  /** Auf der Einkaufsliste, noch nicht bestellt. */
  aufListe: number;
  /** Angelegt, noch nicht entschieden. */
  offen: number;
}

/** Ein offener eigener Posten für das Lager — was zuläuft. */
export interface ZulaufEintrag {
  menge: number;
  bestellt: boolean;
  termin: string | null;
}

export interface DeckungsListe {
  id: string;
  datum: string;
  baustelle: string;
  /** Was im Hauptlager frei ist, bevor diese Liste dran ist — je Artikel. */
  freiVor: Map<string, number>;
  positionen: { id: string; materialId?: string; menge: number; gebucht: boolean; anf?: AnforderungsStand }[];
}

export interface DeckungsDaten {
  heute: string;
  listen: DeckungsListe[];
  /** Wird der Artikel im Lager geführt? */
  lagerartikel: Map<string, boolean>;
  zulauf: Map<string, ZulaufEintrag[]>;
  /** Nur mit Baustelle: die Liste des Formulars (oder keine, wenn sie neu ist) und das Freie vor ihr. */
  fuer: { liste: string | null; freiVor: Map<string, number> } | null;
}

type Roh = Record<string, unknown>;

const zahl = (v: unknown): number => Number(v ?? 0) || 0;

function karte<T>(o: unknown, wert: (v: unknown) => T): Map<string, T> {
  return new Map(Object.entries((o ?? {}) as Roh).map(([k, v]) => [k, wert(v)]));
}

function anforderung(a: unknown): AnforderungsStand | undefined {
  if (!a) return undefined;
  const r = a as Roh;
  return {
    angefordert: zahl(r.angefordert),
    abgeholt: zahl(r.abgeholt),
    bereit: zahl(r.bereit),
    bestellt: zahl(r.bestellt),
    termin: (r.termin as string | null) ?? null,
    terminOffen: r.termin_offen === true,
    aufListe: zahl(r.auf_liste),
    offen: zahl(r.offen),
  };
}

/** Die Antwort der Datenbank in die Form der App — eigene Funktion, damit sie sich prüfen lässt. */
export function deckungAusRoh(roh: unknown): DeckungsDaten {
  const r = (roh ?? {}) as Roh;
  const fuer = r.fuer as Roh | null | undefined;
  return {
    heute: String(r.heute ?? ''),
    listen: ((r.listen ?? []) as Roh[]).map((l) => ({
      id: String(l.id),
      datum: String(l.datum),
      baustelle: String(l.baustelle),
      freiVor: karte(l.frei_vor, zahl),
      positionen: ((l.positionen ?? []) as Roh[]).map((p) => ({
        id: String(p.id),
        ...(p.material ? { materialId: String(p.material) } : {}),
        menge: zahl(p.menge),
        gebucht: p.gebucht === true,
        ...(p.anf ? { anf: anforderung(p.anf) } : {}),
      })),
    })),
    lagerartikel: karte(r.lagerartikel, (v) => v !== false),
    zulauf: karte(r.zulauf, (v) =>
      ((v ?? []) as Roh[]).map((e) => ({ menge: zahl(e.menge), bestellt: e.bestellt === true, termin: (e.termin as string | null) ?? null })),
    ),
    fuer: fuer ? { liste: (fuer.liste as string | null) ?? null, freiVor: karte(fuer.frei_vor, zahl) } : null,
  };
}

const IST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Die Eingaben der Deckungsrechnung für einen Zeitraum (höchstens 31 Tage);
 * mit `baustelle` (ein Tag) dazu das Freie für die Liste des Formulars und
 * die genannten Artikel. Eine Kennung, die kein Artikel sein kann (frei
 * getippte Zeile), geht nicht mit — sie liesse die Anfrage scheitern.
 */
export async function materialdeckung(
  von: string,
  bis: string,
  formular?: { baustelle: string; dazu: readonly string[] },
): Promise<DeckungsDaten> {
  const { data, error } = await derClient().rpc('materialdeckung', {
    p_von: von,
    p_bis: bis,
    ...(formular
      ? { p_baustelle: formular.baustelle, p_dazu: [...new Set(formular.dazu.filter((id) => IST_UUID.test(id)))] }
      : {}),
  });
  if (error) throw new Error(error.message);
  return deckungAusRoh(data);
}

/** Ein Bestellvorschlag — ohne Preis. */
export interface Bestellvorschlag {
  materialId: string;
  name: string;
  einheit: string | null;
  artikelnummer: string | null;
  mindestmenge: number | null;
  sollbestand: number | null;
  verpackungseinheit: number | null;
  /** Frei nach Zusagen und Rüstlisten (wie `lager_frei`). */
  frei: number;
  /** Für das Lager auf der Einkaufsliste oder bestellt. */
  zulauf: number;
  /** `fehlmenge`: Rüstlisten oder Zusagen sind nicht gedeckt; `mindestmenge`: darunter. */
  grund: 'fehlmenge' | 'mindestmenge';
  /** Vorgeschlagene Menge, aufgerundet. */
  menge: number;
  lieferantId: string | null;
  lieferantName: string | null;
}

const zahlOderNull = (v: unknown): number | null => (v == null ? null : Number(v));

export async function bestellvorschlaege(): Promise<Bestellvorschlag[]> {
  const { data, error } = await derClient().rpc('bestellvorschlaege');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Roh[]).map((z) => ({
    materialId: String(z.material),
    name: String(z.name ?? ''),
    einheit: (z.einheit as string | null) ?? null,
    artikelnummer: (z.artikelnummer as string | null) ?? null,
    mindestmenge: zahlOderNull(z.mindestmenge),
    sollbestand: zahlOderNull(z.sollbestand),
    verpackungseinheit: zahlOderNull(z.verpackungseinheit),
    frei: zahl(z.frei),
    zulauf: zahl(z.zulauf),
    grund: z.grund === 'fehlmenge' ? 'fehlmenge' : 'mindestmenge',
    menge: zahl(z.menge),
    lieferantId: (z.lieferant as string | null) ?? null,
    lieferantName: (z.lieferant_name as string | null) ?? null,
  }));
}

/** Was die Übernahme getan hat. */
export interface UebernahmeErgebnis {
  angelegt: number;
  /** Inzwischen nicht mehr vorzuschlagen (von jemand anderem übernommen, geliefert). */
  uebersprungen: string[];
  /** Der Vorschlag lautet inzwischen anders — nichts angelegt, neu entscheiden. */
  veraltet: string[];
}

/**
 * Die gewählten Vorschläge auf die Einkaufsliste — ein Befehl mit
 * Vorgangskennung (Vertrag M04a): wiederholt mit derselben Kennung, legt er
 * nichts doppelt an.
 */
export async function bestellvorschlaegeUebernehmen(
  vorgang: string,
  posten: { materialId: string; menge: number; lieferantId: string | null; erwartet: number }[],
): Promise<UebernahmeErgebnis> {
  const { data, error } = await derClient().rpc('bestellvorschlaege_uebernehmen', {
    p_befehl: {
      vorgang,
      aktion: 'bestellvorschlaege',
      posten: posten.map((p) => ({ artikel: p.materialId, menge: p.menge, lieferant: p.lieferantId, erwartet: { menge: p.erwartet } })),
    },
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Roh;
  const namen = (x: unknown) => ((x ?? []) as Roh[]).map((e) => String(e.name ?? ''));
  return {
    angelegt: ((r.angelegt ?? []) as unknown[]).length,
    uebersprungen: namen(r.uebersprungen),
    veraltet: namen(r.veraltet),
  };
}
