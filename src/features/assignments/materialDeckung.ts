import type { AnforderungsStand, DeckungsDaten, ZulaufEintrag } from '@/lib/db/materialdeckung';
import { fmtMenge } from '@/lib/belegLayout';

/*
  DIE DECKUNGSRECHNUNG (M04b, E13; Befund 7 der Bestandsmatrix) — EINE
  Funktion für Formular, Woche, Tag, Monat und Startseite.

  Vorher rechneten drei Stellen die Fehlmenge einer Rüstliste: das Formular
  (`ruestFehlmenge.ts`), die Monatsvorschau (ohne Abzug des Angeforderten)
  und die Karte im Formular. Alle zogen vom Bestand jede Reservierung ab
  Heute ab, auch die einer späteren Liste — so meldeten zwei Baustellen, die
  um dieselbe Menge konkurrieren, beide eine Fehlmenge.

  WAS GILT (Bauplanung K02):
  - Eine Menge deckt nicht zwei Bedarfe. Was VOR dieser Liste frei ist,
    rechnet die Datenbank (`frei_vor`: nach Einsatztag, dann nach Anlage);
    innerhalb der Liste bekommen die Positionen der Reihe nach.
  - Die eigene Liste zählt nicht gegen sich selbst. Was eine verknüpfte
    Anforderung bringt, reserviert die Position nicht — sie nimmt aus dem
    Regal nur den Rest, genau wie `app.ruest_reserviert`.
  - Bestellt, zugesagt und vorhanden bleiben getrennt: der Teil der
    Anforderung zählt mit deren Stand (abgeholt, bereit, bestellt, auf der
    Liste, offen), der Zulauf für das Lager (`einkauf_posten`) deckt, was
    das Regal nicht hat — nach demselben Vorrang, bestellte mit frühem
    Termin zuerst. Was frühere Listen nicht aus dem Regal bekamen, haben sie
    vom Zulauf schon genommen.
*/

export type { AnforderungsStand, ZulaufEintrag };

/**
 * Die fünf Zustände der Linie „Lot“ und dazu „Bestand unbekannt“ als eigene
 * Textzeile (eine freie Zeile hat keinen Lagerbestand — „fehlt“ wäre eine
 * Falschaussage).
 */
export type DeckungsZustand = 'erledigt' | 'laeuft' | 'offen' | 'achtung' | 'fehler' | 'unbekannt';

/** Eine Position, wie sie die Rechnung braucht. */
export interface DeckungsEingang {
  id: string;
  materialId?: string;
  menge: number;
  /** Schon eingeladen (der Haken hat gebucht) — dann ist sie gedeckt und reserviert nichts mehr. */
  gebucht?: boolean;
  /** Der Stand der verknüpften Anforderungen laut Datenbank. */
  anf?: AnforderungsStand;
  /** Ohne Stand: nur die angeforderte Menge (sie zählt dann als „noch nicht bestellt“). */
  angefordert?: number;
}

/** Was um die Liste herum gilt. */
export interface DeckungsUmfeld {
  /** Einsatztag der Liste (JJJJ-MM-TT) — gegen ihn zählt ein Liefertermin. */
  datum: string;
  /** Frei im Hauptlager vor dieser Liste, je Artikel. Ein Artikel ohne Angabe gilt als nicht vorrätig. */
  freiVor: ReadonlyMap<string, number>;
  zulauf?: ReadonlyMap<string, readonly ZulaufEintrag[]>;
  /** Wird der Artikel im Lager geführt? Ohne Angabe: ja. */
  lagerartikel?: ReadonlyMap<string, boolean>;
}

export interface PositionsDeckung {
  id: string;
  zustand: DeckungsZustand;
  text: string;
  /** Was im Regal für diese Position da war, bevor sie zugriff (nie unter null) — „für diese Liste frei“. */
  freiDavor: number;
  /** Was dem Lager zur ganzen Menge fehlt, ohne die Anforderungen — der Hinweis „Im Lager fehlen“. */
  imLagerFehlt: number;
  /** Aus dem Regal gedeckt. */
  ausRegal: number;
  /** Vom Zulauf für das Lager gedeckt (auch der verspätete). */
  ausZulauf: number;
  /** Von niemandem gedeckt — das fordert das Formular an. */
  fehlt: number;
  /** Ein Katalogartikel, der nicht im Lager geführt wird. */
  nichtGefuehrt: boolean;
  /** Der späteste Liefertermin dessen, was rechtzeitig kommt (JJJJ-MM-TT). */
  termin: string | null;
  /** Etwas ist bestellt und hat keinen Liefertermin. */
  terminUnbekannt: boolean;
}

const runde = (n: number) => Math.round(n * 1000) / 1000;

/** „12.11.“ */
export function tagKurzText(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}.${m[1]}.` : iso;
}

/** Reihenfolge der Dringlichkeit: das Schlimmste bestimmt den Zustand. */
const RANG: Record<DeckungsZustand, number> = { fehler: 5, achtung: 4, offen: 3, laeuft: 2, erledigt: 1, unbekannt: 0 };

interface Teil {
  zustand: Exclude<DeckungsZustand, 'fehler' | 'unbekannt'>;
  text: string;
  /** Bei einer Lieferung: ihr Termin, oder `null`, wenn keiner da ist. */
  termin?: string | null;
}

function schlimmster(teile: Teil[]): Teil {
  return teile.reduce((a, b) => (RANG[b.zustand] > RANG[a.zustand] ? b : a));
}

/** Ein bestellter Teil: kommt rechtzeitig, zu spät oder ohne Termin. */
function lieferung(termin: string | null, ohneTermin: boolean, datum: string): Teil {
  if (ohneTermin || !termin) return { zustand: 'laeuft', text: 'bestellt, Liefertermin unbekannt', termin: null };
  if (termin > datum) return { zustand: 'achtung', text: `Lieferung erst am ${tagKurzText(termin)}`, termin };
  return { zustand: 'laeuft', text: `wird geliefert bis ${tagKurzText(termin)}`, termin };
}

/**
 * DIE RECHNUNG EINER LISTE: je Position Zustand, Text und Mengen.
 * Die Reihenfolge der Positionen ist die Reihenfolge, in der sie aus dem
 * Regal bekommen.
 */
export function deckeListe(positionen: readonly DeckungsEingang[], umfeld: DeckungsUmfeld): PositionsDeckung[] {
  const rest = new Map<string, number>();
  const warteschlange = new Map<string, { menge: number; bestellt: boolean; termin: string | null }[]>();
  const vorrat = (id: string) => {
    if (!rest.has(id)) rest.set(id, umfeld.freiVor.get(id) ?? 0);
    if (!warteschlange.has(id)) {
      /*
        Was frühere Listen (und Zusagen über dem Bestand) nicht aus dem Regal
        bekamen, haben sie vom Zulauf zuerst: so viel, wie das Freie vor
        dieser Liste unter null liegt.
      */
      let verbraucht = Math.max(0, -(umfeld.freiVor.get(id) ?? 0));
      const schlange: { menge: number; bestellt: boolean; termin: string | null }[] = [];
      for (const e of umfeld.zulauf?.get(id) ?? []) {
        const weg = Math.min(verbraucht, e.menge);
        verbraucht -= weg;
        if (e.menge - weg > 0) schlange.push({ ...e, menge: e.menge - weg });
      }
      warteschlange.set(id, schlange);
    }
  };

  return positionen.map((p) => {
    const leer = { freiDavor: 0, imLagerFehlt: 0, ausRegal: 0, ausZulauf: 0, fehlt: 0, nichtGefuehrt: false, termin: null, terminUnbekannt: false };
    if (!p.materialId) {
      return { id: p.id, ...leer, zustand: 'unbekannt' as const, text: 'Bestand unbekannt' };
    }
    const id = p.materialId;
    vorrat(id);
    const gefuehrt = umfeld.lagerartikel?.get(id) !== false;
    const davor = Math.max(0, rest.get(id)!);
    if (p.gebucht) {
      // Eingeladen: aus dem Regal genommen, reserviert nichts mehr.
      return { id: p.id, ...leer, freiDavor: davor, nichtGefuehrt: !gefuehrt, zustand: 'erledigt' as const, text: 'eingeladen' };
    }

    const anf = p.anf;
    const angefordert = anf ? anf.angefordert : (p.angefordert ?? 0);
    // Wie `app.ruest_reserviert`: aus dem Regal nur der Rest, den keine Anforderung bringt.
    const ausDemRegal = Math.max(0, runde(p.menge - angefordert));
    const ausRegal = Math.min(ausDemRegal, davor);
    rest.set(id, runde(rest.get(id)! - ausDemRegal));
    const regalFehlt = runde(ausDemRegal - ausRegal);

    const teile: Teil[] = [];
    if (ausRegal > 0) teile.push({ zustand: 'erledigt', text: 'gedeckt' });

    // Der Teil der Anforderungen, mit ihrem Stand.
    if (anf) {
      if (anf.abgeholt + anf.bereit > 0) teile.push({ zustand: 'erledigt', text: 'gedeckt' });
      if (anf.bestellt > 0) teile.push(lieferung(anf.termin, anf.terminOffen, umfeld.datum));
      if (anf.aufListe + anf.offen > 0) teile.push({ zustand: 'offen', text: 'angefordert, noch nicht bestellt' });
    } else if (angefordert > 0) {
      teile.push({ zustand: 'offen', text: 'angefordert, noch nicht bestellt' });
    }

    // Was das Regal nicht hat, deckt der Zulauf für das Lager — der Reihe nach.
    let offen = regalFehlt;
    let ausZulauf = 0;
    const schlange = warteschlange.get(id)!;
    while (offen > 0 && schlange.length > 0) {
      const e = schlange[0];
      const nimm = Math.min(offen, e.menge);
      offen = runde(offen - nimm);
      ausZulauf = runde(ausZulauf + nimm);
      e.menge = runde(e.menge - nimm);
      if (e.menge <= 0) schlange.shift();
      teile.push(e.bestellt ? lieferung(e.termin, !e.termin, umfeld.datum) : { zustand: 'offen', text: 'auf der Einkaufsliste, noch nicht bestellt' });
    }

    const fehlt = offen;
    if (fehlt > 0) {
      teile.push({
        zustand: 'achtung',
        text: gefuehrt ? `fehlt ${fmtMenge(fehlt)}` : `nicht im Lager geführt – ${fmtMenge(fehlt)} zu bestellen`,
      });
    }
    // Menge 0 (das Feld wird gerade getippt) hat nichts zu decken.
    const teil = teile.length > 0 ? schlimmster(teile) : { zustand: 'erledigt' as const, text: 'gedeckt' };
    const rechtzeitig = teile.filter((t) => t.zustand === 'laeuft');
    const termine = rechtzeitig.map((t) => t.termin).filter((t): t is string => !!t).sort();
    return {
      id: p.id,
      zustand: teil.zustand,
      text: teil.text,
      freiDavor: davor,
      imLagerFehlt: Math.max(0, runde(p.menge - davor)),
      ausRegal,
      ausZulauf,
      fehlt,
      nichtGefuehrt: !gefuehrt,
      termin: termine.length > 0 ? termine[termine.length - 1] : null,
      terminUnbekannt: rechtzeitig.some((t) => t.termin === null),
    };
  });
}

/** Der zusammengefasste Zustand eines Einsatzes — mit Text, ohne Farbe. */
export interface MaterialLage {
  zustand: DeckungsZustand;
  text: string;
  /** Positionen im Zustand Achtung — die Zahl „mit Fehlmenge“. */
  achtung: number;
}

/** Konnte die Rechnung nicht geladen werden, sagt der Einsatz das — statt „bereit“ zu raten. */
export const MATERIAL_FEHLER: MaterialLage = { zustand: 'fehler', text: 'Material: Stand nicht abrufbar', achtung: 0 };

const positionenWort = (n: number) => `${n} ${n === 1 ? 'Position' : 'Positionen'}`;

/** Was eine ganze Rüstliste sagt; ohne Positionen nichts. */
export function zusammenfassen(ps: readonly PositionsDeckung[]): MaterialLage | null {
  if (ps.length === 0) return null;
  const zahl = (z: DeckungsZustand) => ps.filter((p) => p.zustand === z).length;
  const achtung = zahl('achtung');
  if (achtung > 0) return { zustand: 'achtung', text: `Material fehlt: ${positionenWort(achtung)}`, achtung };
  const offen = zahl('offen');
  if (offen > 0) return { zustand: 'offen', text: `Material: ${positionenWort(offen)} noch nicht bestellt`, achtung };
  const laeuft = ps.filter((p) => p.zustand === 'laeuft');
  if (laeuft.length > 0) {
    if (laeuft.some((p) => p.terminUnbekannt)) {
      return { zustand: 'laeuft', text: 'Material bestellt, Liefertermin unbekannt', achtung };
    }
    // Der späteste Termin — bis dahin ist alles da.
    const spaetester = laeuft.map((p) => p.termin).filter((t): t is string => !!t).sort().pop();
    return {
      zustand: 'laeuft',
      text: spaetester ? `Material wird geliefert bis ${tagKurzText(spaetester)}` : 'Material wird geliefert',
      achtung,
    };
  }
  const unbekannt = zahl('unbekannt');
  if (unbekannt === ps.length) return { zustand: 'unbekannt', text: 'Material: Bestand unbekannt', achtung };
  const allesGeladen = ps.every((p) => p.zustand === 'unbekannt' || p.text === 'eingeladen');
  const grund = allesGeladen ? 'Material eingeladen' : 'Material bereit';
  return {
    zustand: 'erledigt',
    text: unbekannt > 0 ? `${grund}, ${unbekannt} ohne Lagerbestand` : grund,
    achtung,
  };
}

const einsaetzeWort = (n: number) => `${n} ${n === 1 ? 'Einsatz' : 'Einsätzen'}`;

/** Ein Tag aus den Lagen seiner Einsätze — für den Kopf des Seitenfensters „Tag“. */
export function tagZusammenfassen(lagen: readonly (MaterialLage | null)[]): MaterialLage | null {
  const da = lagen.filter((l): l is MaterialLage => !!l);
  if (da.length === 0) return null;
  const zahl = (z: DeckungsZustand) => da.filter((l) => l.zustand === z).length;
  const achtung = da.reduce((s, l) => s + l.achtung, 0);
  if (zahl('fehler') > 0) return { ...MATERIAL_FEHLER, achtung };
  if (zahl('achtung') > 0) return { zustand: 'achtung', text: `Material fehlt bei ${einsaetzeWort(zahl('achtung'))}`, achtung };
  if (zahl('offen') > 0) return { zustand: 'offen', text: `Material bei ${einsaetzeWort(zahl('offen'))} noch nicht bestellt`, achtung };
  if (zahl('laeuft') > 0) return { zustand: 'laeuft', text: `Material für ${einsaetzeWort(zahl('laeuft'))} unterwegs`, achtung };
  if (zahl('erledigt') > 0) return { zustand: 'erledigt', text: 'Material für alle Einsätze bereit', achtung };
  return { zustand: 'unbekannt', text: 'Material: Bestand unbekannt', achtung };
}

/** Schlüssel eines Einsatzes: Tag und Baustelle. */
export const einsatzSchluessel = (datum: string, baustelle: string) => `${datum}|${baustelle}`;

export interface EinsatzDeckung {
  positionen: PositionsDeckung[];
  lage: MaterialLage | null;
}

/** Je Einsatz die Rechnung — aus einer Antwort der Datenbank. */
export function deckungJeEinsatz(d: DeckungsDaten): Map<string, EinsatzDeckung> {
  const out = new Map<string, EinsatzDeckung>();
  for (const l of d.listen) {
    const positionen = deckeListe(l.positionen, {
      datum: l.datum,
      freiVor: l.freiVor,
      zulauf: d.zulauf,
      lagerartikel: d.lagerartikel,
    });
    out.set(einsatzSchluessel(l.datum, l.baustelle), { positionen, lage: zusammenfassen(positionen) });
  }
  return out;
}

/** Was das Formular über einen Artikel weiß, wenn die Datenbank nicht antwortet. */
type ArtikelKurz = { id: string; stock?: number; lagerartikel?: boolean };

/**
 * DIE RECHNUNG IM FORMULAR — dieselbe `deckeListe`, nur mit den Positionen,
 * wie sie gerade dastehen (auch ungespeicherte). Das Freie vor der Liste und
 * der Stand der Anforderungen kommen aus `materialdeckung` mit Baustelle.
 *
 * Antwortet die Datenbank nicht (oder ist ein Artikel eben erst
 * dazugekommen), gilt für ihn der Bestand — wie das Formular schon vorher
 * rechnete, wenn `lager_frei` fehlte: eine Fehlmenge ohne Reservierungen ist
 * besser als keine.
 */
export function formularDeckung(
  datum: string,
  positionen: readonly { id: string; materialId?: string; menge: number; angefordert?: number }[],
  server: DeckungsDaten | null,
  artikel: (id: string) => ArtikelKurz | undefined,
): Map<string, PositionsDeckung> {
  const gespeichert = server?.fuer?.liste ? server.listen.find((l) => l.id === server.fuer!.liste) : undefined;
  const ausDb = new Map((gespeichert?.positionen ?? []).map((p) => [p.id, p]));
  const freiVor = new Map<string, number>();
  const lagerartikel = new Map<string, boolean>();
  for (const p of positionen) {
    if (!p.materialId) continue;
    const a = artikel(p.materialId);
    freiVor.set(p.materialId, server?.fuer?.freiVor.get(p.materialId) ?? a?.stock ?? 0);
    lagerartikel.set(p.materialId, server?.lagerartikel.get(p.materialId) ?? a?.lagerartikel !== false);
  }
  const eingang: DeckungsEingang[] = positionen.map((p) => {
    const db = ausDb.get(p.id);
    // Der Stand der Anforderung gilt nur, solange die Position denselben Artikel trägt.
    const gleich = db && db.materialId === p.materialId;
    return {
      id: p.id,
      materialId: p.materialId,
      menge: p.menge,
      gebucht: gleich ? db.gebucht : false,
      ...(gleich && db.anf ? { anf: db.anf } : { angefordert: p.angefordert }),
    };
  });
  const ergebnis = deckeListe(eingang, { datum, freiVor, zulauf: server?.zulauf, lagerartikel });
  return new Map(ergebnis.map((d) => [d.id, d]));
}
