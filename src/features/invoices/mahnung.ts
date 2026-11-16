import type { Invoice, InvoiceRates, Mahnung, MahnungInhalt } from '@/types';
/*
  Stufen, „darf gemahnt werden“, Fristen und Mahnkosten stehen seit der
  Durchsicht vom 15.11.2026 in `shared/forderungen.ts` (eine Fassung für App
  und Edge Function der Startseite); hier weitergereicht.
*/
import {
  MAHNSTUFEN, naechsteStufe, darfMahnen, laufendeFrist, spesenFuer, PAUSCHALE_458, mahnkosten, FRIST_TAGE,
  type Mahnstufe, type MahnPruefung, type MahnkostenSaetze,
} from '@shared/forderungen';

export {
  MAHNSTUFEN, naechsteStufe, darfMahnen, laufendeFrist, spesenFuer, PAUSCHALE_458, mahnkosten, FRIST_TAGE,
  type Mahnstufe, type MahnPruefung, type MahnkostenSaetze,
};
import { zahlOder } from '@/lib/zahl';
import { aufStellen, cent, euroBetrag } from '@/lib/betrag';

/** TT.MM.JJJJ — hier ohne die Datumsbibliothek, die Datei bleibt ohne Oberflächen-Importe. */


export interface StufenText {
  /** Die Überschrift auf dem Beleg. */
  titel: string;
  /** Der Absatz darüber, wie der Betrieb die Sache sieht. */
  anrede: string;
  /** Der Satz, der die neue Frist nennt. */
  frist: (bis: string) => string;
}

export const TEXTE: Record<Mahnstufe, StufenText> = {
  1: {
    titel: 'Zahlungserinnerung',
    anrede:
      'vermutlich ist unsere Rechnung untergegangen — das kommt vor. Wir dürfen Sie an den ' +
      'offenen Betrag erinnern.',
    frist: (bis) => `Wir bitten um Überweisung bis ${bis}.`,
  },
  2: {
    titel: 'Mahnung',
    anrede:
      'unsere Rechnung ist trotz Erinnerung offen. Wir müssen Sie daher mahnen und ersuchen ' +
      'um Begleichung.',
    frist: (bis) => `Wir setzen eine Frist bis ${bis}.`,
  },
  3: {
    titel: 'Letzte Mahnung',
    anrede:
      'unsere Rechnung ist trotz zweimaliger Aufforderung weiterhin offen. Dies ist unsere ' +
      'letzte Mahnung.',
    frist: (bis) =>
      `Wir setzen eine letzte Frist bis ${bis}. Danach geben wir die Forderung aus der Hand.`,
  },
};









/**
 * Die Summe der Mahnspesen über alle Stufen — so viel verlangt eine Rechnung
 * höchstens, wenn sie alle drei durchläuft (Testbericht 30.09.2026, M22).
 */
export function spesenSumme(spesen: number[] | undefined): number {
  return cent((spesen ?? []).reduce((s, w) => s + (typeof w === 'number' && w > 0 ? w : 0), 0));
}

/**
 * Was die Maske zu den Mahnspesen sagt (M22): an Firmenkunden höchstens 40 €
 * je Rechnung — die Datenbank weist mehr ab (`companies_mahnspesen_grenze`);
 * an Privatkunden nur eine Warnung über 40 €, denn das Gesetz verlangt
 * „angemessen“ und nennt keinen Betrag.
 */
export function mahnspesenBefund(
  saetze: Pick<InvoiceRates, 'mahnspesen' | 'mahnspesenVerbraucher' | 'pauschale458'>,
): { firmaZuViel: number | null; privatHoch: number | null } {
  // Dieselbe Rechnung wie die Schreiben (G3); die Pauschale steht für sich.
  const firma = saetze.pauschale458 ? 0 : hoechsteMahnkosten(saetze, true);
  const privat = hoechsteMahnkosten(saetze, false);
  return {
    firmaZuViel: firma > PAUSCHALE_458 ? firma : null,
    privatHoch: privat > PAUSCHALE_458 ? privat : null,
  };
}


/**
 * Was eine Rechnung höchstens an Mahnkosten fordert, wenn sie alle drei
 * Stufen durchläuft — dieselbe Rechnung wie die Schreiben (G3). Die
 * Einstellung prüft daran ihre Grenze.
 */
export function hoechsteMahnkosten(saetze: MahnkostenSaetze | undefined, unternehmer: boolean): number {
  return cent(MAHNSTUFEN.reduce((s, stufe) => {
    const k = mahnkosten(stufe, saetze, unternehmer);
    return s + k.spesen + k.pauschale;
  }, 0));
}

/**
 * DIE MAHNFORDERUNG — EIN MODELL für Einstellung, Schreiben und Verbuchung
 * (Durchsicht 15.11.2026, G3).
 *
 * WAS VORHER WAR: drei Modelle. Die Einstellung zählte die Spesen aller
 * Stufen zusammen („je Rechnung“), das Schreiben forderte nur die seiner
 * Stufe, und die Verbuchung ließ „letzte Mahnung minus alle bisherigen
 * Mahnkosten-Eingänge“ zu. Zahlte der Kunde nach einer Teilzahlung genau den
 * Betrag aus Mahnung 3, wurde ein Teil davon Guthaben — und die Spesen der
 * Stufen 1 und 2 forderte niemand mehr.
 *
 * JETZT: Jedes Schreiben fordert die Mahnkosten der Rechnung bis zu seinem
 * Tag — die Kosten aller bisherigen Stufen, wie ihre Schreiben sie nannten,
 * dazu die eigenen und die Verzugszinsen bis zum Mahntag — und zieht ab, was
 * davon schon bezahlt ist. Diese `forderung` steht im Inhalt der Mahnung;
 * die Verbuchung (`app.mahnforderung`, `letzteMahnforderung`) nimmt genau
 * sie. Was der Brief verlangt, lässt sich also immer ganz verbuchen.
 */
export interface Mahnforderung {
  /** Kosten dieser Stufe — Spesen oder Pauschale. */
  kosten: number;
  /** Kosten der früheren Schreiben, wie sie dort standen. */
  kostenFrueher: number;
  /** Verzugszinsen bis zum Mahntag, über die ganze Zeit des Verzugs. */
  zinsen: number;
  /** Alles zusammen — was die Rechnung an Mahnkosten bis heute schuldet. */
  forderung: number;
  /** Was davon schon eingegangen ist (Eingänge der Art „Mahnkosten“). */
  bezahlt: number;
  /** Was das Schreiben noch fordert. */
  offen: number;
}

export function mahnforderungRechnen(o: {
  kosten: number;
  /** Die früheren Mahnungen dieser Rechnung — ihre Kosten zählen mit. */
  frueher: Pick<Mahnung, 'spesen' | 'inhalt'>[];
  zinsen: number;
  bezahlt: number;
}): Mahnforderung {
  const kostenFrueher = cent(o.frueher.reduce((s, m) => s + (m.inhalt?.kosten ?? m.spesen ?? 0), 0));
  const forderung = cent(kostenFrueher + o.kosten + o.zinsen);
  const bezahlt = cent(Math.max(o.bezahlt, 0));
  return {
    kosten: cent(o.kosten), kostenFrueher, zinsen: cent(o.zinsen), forderung, bezahlt,
    offen: cent(Math.max(forderung - bezahlt, 0)),
  };
}


/** Verzugszinsen gegenüber Verbrauchern, % im Jahr (§ 1000 Abs 1 ABGB). */
export const ZINS_VERBRAUCHER = 4;
/** Zwischen Unternehmern: Prozentpunkte über dem Basiszinssatz (§ 456 UGB). */
export const ZINS_AUFSCHLAG_UNTERNEHMER = 9.2;

/** Der 1. Jänner oder 1. Juli, mit dem das Halbjahr eines Tages beginnt. */
export function halbjahresbeginn(isoTag: string): string {
  return `${isoTag.slice(0, 4)}-${Number(isoTag.slice(5, 7)) <= 6 ? '01' : '07'}-01`;
}

/** Ein Basiszinssatz mit dem Halbjahr, für das er gilt (Testbericht 30.09.2026, G30). */
export interface Basiszinssatz {
  /** 1. Jänner oder 1. Juli. */
  ab: string;
  /** % — darf negativ sein. */
  satz: number;
}

/** Ein gültiger Eintrag: ein Halbjahresbeginn und eine endliche Zahl. */
function gueltig(b: Basiszinssatz | null | undefined): b is Basiszinssatz {
  return !!b && typeof b.satz === 'number' && Number.isFinite(b.satz) && /^\d{4}-(01|07)-01$/.test(b.ab);
}

/**
 * Der Verlauf der Basiszinssätze eines Betriebs — die Liste und, wo es sie
 * noch gibt, der einzelne Satz aus der Zeit davor. Je Halbjahr einer; die
 * Liste gewinnt.
 *
 * DER ZENTRALE SATZ GEWINNT ÜBER BEIDE (seit 05.10.2026). Der Basiszinssatz
 * gilt für ganz Österreich; der Betreiber pflegt ihn an einer Stelle
 * (`public.basiszinssaetze`). Was ein Betrieb selbst eingetragen hat, gilt nur
 * noch für Halbjahre, zu denen zentral nichts steht — so ändert sich bei
 * keinem Betrieb etwas, solange die zentrale Liste leer ist.
 */
export function basiszinsVerlauf(rates?: {
  basiszinssaetze?: Basiszinssatz[] | null;
  basiszinssatz?: number | null;
  basiszinssatzAb?: string | null;
} | null, zentral?: Basiszinssatz[] | null): Basiszinssatz[] {
  const je = new Map<string, number>();
  const alt = { ab: rates?.basiszinssatzAb ?? '', satz: rates?.basiszinssatz as number };
  if (gueltig(alt)) je.set(alt.ab, alt.satz);
  for (const b of rates?.basiszinssaetze ?? []) {
    if (gueltig(b)) je.set(b.ab, b.satz);
  }
  for (const b of zentral ?? []) {
    if (gueltig(b)) je.set(b.ab, b.satz);
  }
  return [...je.entries()].map(([ab, satz]) => ({ ab, satz })).sort((a, b) => a.ab.localeCompare(b.ab));
}

/** Halbjahre zur Wahl: vom nächsten bis fünfzehn Jahre zurück, das jüngste zuerst (G30). */
export function halbjahreZurWahl(heute: string): string[] {
  const jetzt = halbjahresbeginn(heute);
  const jahr = Number(jetzt.slice(0, 4));
  const raus: string[] = [];
  for (let j = jahr + 1; j >= jahr - 15; j -= 1) {
    for (const hj of [`${j}-07-01`, `${j}-01-01`]) raus.push(hj);
  }
  const naechstes = jetzt.endsWith('-01-01') ? `${jahr}-07-01` : `${jahr + 1}-01-01`;
  return raus.filter((hj) => hj <= naechstes);
}

export type Verzugszinsen =
  | { art: 'keine' }
  /** Ein Unternehmer, aber kein Basiszinssatz für das laufende Halbjahr. */
  | { art: 'fehlt' }
  | {
      art: 'berechnet';
      /** % im Jahr — bei mehreren Halbjahren der des letzten. */
      satz: number;
      tage: number;
      betrag: number;
      grundlage: '§ 1000 ABGB' | '§ 456 UGB';
      /** Gesetzt, wenn erst ab diesem Tag gerechnet wird (siehe unten). */
      ab?: string;
      /**
       * Nur wenn der Verzug über mehrere Halbjahre mit verschiedenen Sätzen
       * reicht (G30) — oder wenn zwischendurch gezahlt wurde (G3): dann trägt
       * jeder Abschnitt seinen Betrag (`rest`).
       */
      abschnitte?: { von: string; bis: string; satz: number; tage: number; rest?: number }[];
    };

/**
 * Die gesetzlichen Verzugszinsen einer Mahnung (offene Punkte B7).
 *
 * AB DER ZWEITEN STUFE. Die Zahlungserinnerung geht davon aus, dass die
 * Rechnung übersehen wurde — eine Zinsforderung darin widerspräche ihrem
 * eigenen Ton. Geschuldet sind die Zinsen trotzdem ab dem ersten Tag nach
 * dem Zahlungsziel; die Mahnung rechnet deshalb vom Ziel bis zu ihrem Datum.
 *
 * UNTERNEHMER IST, wer als Unternehmen im Kundenstamm steht oder eine UID
 * hat (Testbericht 30.09.2026, M10). Sonst gilt der Verbrauchersatz — der
 * niedrigere; zu wenig zu fordern schadet dem Betrieb weniger als zu viel.
 *
 * DER BASISZINSSATZ GILT JE HALBJAHR. Er ändert sich zum 1.1. und 1.7.
 * (maßgebend ist der am letzten Tag des Vorhalbjahres, § 456 UGB). Seit dem
 * Testbericht vom 30.09.2026 (G30) führt der Betrieb einen VERLAUF: jeder
 * Tag des Verzugs wird mit dem Satz seines Halbjahres gerechnet. Fehlt der
 * Satz für das Halbjahr der Mahnung, rechnet sie nichts — `fehlt`, und die
 * Oberfläche sagt es; eine falsche Zinsforderung ist schlechter als keine.
 * Fehlt ein früherer, wird erst ab dem ältesten lückenlos bekannten Halbjahr
 * gerechnet (`ab`), und der Beleg sagt es. Weniger zu fordern ist zulässig,
 * mehr nicht.
 *
 * NICHT GESPEICHERT. Die Zinsen stehen auf dem Beleg und in der Summe, die er
 * fordert, aber nicht im Zahlungsstand der Rechnung: sie sind keine Leistung,
 * und eine Zahlung darauf ist eine Zahlung über den Rechnungsbetrag hinaus.
 */
export function verzugszinsen(o: {
  stufe: Mahnstufe;
  rest: number;
  faellig?: string;
  bis: string;
  unternehmer: boolean;
  basiszinssatz?: number | null;
  basiszinssatzAb?: string | null;
  basiszinssaetze?: Basiszinssatz[] | null;
  /** Die zentral gepflegten Sätze; sie gewinnen je Halbjahr. */
  zentral?: Basiszinssatz[] | null;
  /**
   * Die Eingänge auf die Rechnung (ohne Mahnkosten), mit Tag (G3). Mit ihnen
   * rechnet jeder Tag des Verzugs auf den Betrag, der an ihm offen war —
   * vorher rechnete jede Mahnung den heutigen Rest über die ganze Zeit, auch
   * über die Tage, für die nach einer Teilzahlung schon Zinsen bezahlt
   * waren. Ohne sie: der heutige Rest, wie bisher.
   */
  zahlungen?: { datum: string; betrag: number }[];
}): Verzugszinsen {
  if (o.stufe < 2 || !(o.rest >= 0.01) || !o.faellig) return { art: 'keine' };
  const von = Date.parse(`${o.faellig}T00:00:00Z`);
  const bis = Date.parse(`${o.bis}T00:00:00Z`);
  if (Number.isNaN(von) || Number.isNaN(bis)) return { art: 'keine' };
  if (Math.round((bis - von) / 86_400_000) <= 0) return { art: 'keine' };

  const erster = tagNach(o.faellig);
  /*
    WAS AN EINEM TAG OFFEN WAR: der heutige Rest und alles, was erst danach
    einging. Ein Eingang zählt ab seinem Tag — an ihm selbst läuft für den
    bezahlten Teil kein Zins mehr.
  */
  const zahlungen = (o.zahlungen ?? []).filter((z) => Number.isFinite(z.betrag) && z.betrag !== 0);
  const offenAm = (tag: string) =>
    cent(Math.max(o.rest + zahlungen.filter((z) => z.datum > tag).reduce((s, z) => s + z.betrag, 0), 0));

  /*
    DER SATZ JE TAG. Verbraucher: 4 %. Unternehmer: Basiszinssatz des
    Halbjahres + 9,2 — vom Mahntag rückwärts nur, solange jedes Halbjahr
    einen Satz hat; davor wird nicht gerechnet (`ab`), fehlt er schon für das
    Halbjahr des Mahntags, gar nicht (`fehlt`).
  */
  let beginn = erster;
  let satzFuer: (tag: string) => number = () => ZINS_VERBRAUCHER;
  const grenzen = new Set<string>();
  if (o.unternehmer) {
    const saetze = new Map(basiszinsVerlauf(o, o.zentral).map((b) => [b.ab, b.satz]));
    let hj = halbjahresbeginn(o.bis);
    if (!saetze.has(hj)) return { art: 'fehlt' };
    while (hj > erster) {
      grenzen.add(hj);
      const davor = halbjahresbeginn(tagVor(hj));
      if (!saetze.has(davor)) {
        beginn = hj;
        break;
      }
      hj = davor;
    }
    satzFuer = (tag) => aufStellen(saetze.get(halbjahresbeginn(tag))! + ZINS_AUFSCHLAG_UNTERNEHMER, 2);
  }
  for (const z of zahlungen) grenzen.add(z.datum);
  const anfaenge = [beginn, ...[...grenzen].filter((t) => t > beginn && t <= o.bis)]
    .filter((t, i, a) => a.indexOf(t) === i)
    .sort();

  const abschnitte = anfaenge.map((a, i) => {
    const ende = i + 1 < anfaenge.length ? tagVor(anfaenge[i + 1]) : o.bis;
    return { von: a, bis: ende, satz: satzFuer(a), tage: tageZwischen(a, ende) + 1, rest: offenAm(a) };
  });

  const gezaehlt = abschnitte.reduce((n, a) => n + a.tage, 0);
  const betrag = cent(abschnitte.reduce((s, a) => s + a.rest * (a.satz / 100) * (a.tage / 365), 0));
  if (betrag <= 0) return { art: 'keine' };
  const ergebnis: Verzugszinsen = {
    art: 'berechnet',
    satz: abschnitte[abschnitte.length - 1].satz,
    tage: gezaehlt,
    betrag,
    grundlage: o.unternehmer ? '§ 456 UGB' : '§ 1000 ABGB',
  };
  if (beginn > erster) ergebnis.ab = beginn;
  const restWechselt = new Set(abschnitte.map((a) => a.rest)).size > 1;
  if (restWechselt) {
    ergebnis.abschnitte = zusammenlegen(abschnitte);
  } else if (new Set(abschnitte.map((a) => a.satz)).size > 1) {
    // Wie bisher (G30): je Halbjahr ein Abschnitt, ohne Betrag — er ist überall derselbe.
    ergebnis.abschnitte = abschnitte.map((a) => ({ von: a.von, bis: a.bis, satz: a.satz, tage: a.tage }));
  }
  return ergebnis;
}

/** Nebeneinanderliegende Abschnitte mit gleichem Satz und Betrag sind einer. */
function zusammenlegen<T extends { von: string; bis: string; satz: number; tage: number; rest: number }>(liste: T[]): T[] {
  const raus: T[] = [];
  for (const a of liste) {
    const vor = raus[raus.length - 1];
    if (vor && vor.satz === a.satz && vor.rest === a.rest) {
      raus[raus.length - 1] = { ...vor, bis: a.bis, tage: vor.tage + a.tage };
    } else {
      raus.push({ ...a });
    }
  }
  return raus;
}

/**
 * Der Satz, wie Beleg und Dialog ihn nennen: einer, oder je Halbjahr einer.
 * Ohne Bindestrich zwischen den Daten — das Briefpapier druckt ihn nicht.
 */
export function zinssatzText(
  z: Extract<Verzugszinsen, { art: 'berechnet' }>,
  datum: (iso: string) => string,
): string {
  const pz = (n: number) => `${n.toLocaleString('de-AT', { maximumFractionDigits: 2 })} %`;
  if (!z.abschnitte) return `${pz(z.satz)} p. a.`;
  // Seit G3 mit dem Betrag je Abschnitt, wenn zwischendurch gezahlt wurde.
  const auf = (rest?: number) => (rest !== undefined ? ` auf ${euroBetrag(rest)} €` : '');
  return `${z.abschnitte.map((a) => `${pz(a.satz)}${auf(a.rest)} vom ${datum(a.von)} bis ${datum(a.bis)}`).join(', ')} p. a.`;
}

function tagNach(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
function tagVor(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}
function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86_400_000);
}


/**
 * Was eine Mahnung an Mahnspesen und Verzugszinsen gefordert hat — das
 * Gegenstück zu `app.mahnforderung` in der Datenbank (Durchsicht 09.11.2026).
 *
 * Die Kosten stehen als Zahl im Inhalt, die Zinsen seit 09.11.2026 ebenso.
 * Ältere Mahnungen tragen die Zinsen nur als Zeile des Zahlenblocks
 * („Verzugszinsen …“ / „3,16 €“), so, wie `mahnungInhalt` sie schrieb: gelesen
 * werden Ziffern und Komma, der Tausenderpunkt fällt weg.
 */
export function mahnforderungAus(inhalt: Pick<MahnungInhalt, 'kosten' | 'zinsen' | 'zeilen' | 'forderung'>): number {
  // Seit G3 steht die ganze Forderung im Inhalt — sie gilt, wie gedruckt.
  if (typeof inhalt.forderung === 'number' && Number.isFinite(inhalt.forderung)) return cent(inhalt.forderung);
  const zinsen = inhalt.zinsen ?? (inhalt.zeilen ?? [])
    .filter(([bezeichnung, wert]) => bezeichnung.startsWith('Verzugszinsen') && /[0-9]/.test(wert))
    .reduce((s, [, wert]) => s + zahlOder(wert.replace(/[^0-9,]/g, ''), 0), 0);
  return cent((inhalt.kosten ?? 0) + (Number.isFinite(zinsen) ? zinsen : 0));
}

/**
 * Was die LETZTE Mahnung einer Rechnung an Spesen und Zinsen gefordert hat.
 * Vor dem 10.10.2026 gab es kein gespeichertes Schreiben, nur den Mahnstand an
 * der Rechnung — dann gelten dessen Mahnspesen (wie in der Datenbank).
 */
export function letzteMahnforderung(
  mahnungen: Pick<Mahnung, 'datum' | 'angelegtAm' | 'inhalt'>[],
  inv: Pick<Invoice, 'mahnstufe' | 'mahnspesen'>,
): number {
  const letzte = [...mahnungen].sort((a, b) =>
    b.datum.localeCompare(a.datum) || (b.angelegtAm ?? 0) - (a.angelegtAm ?? 0))[0];
  if (letzte) return mahnforderungAus(letzte.inhalt);
  return (inv.mahnstufe ?? 0) > 0 ? cent(inv.mahnspesen ?? 0) : 0;
}

/**
 * Wie viel eines Eingangs auf die Mahnkosten fällt, als Vorschlag: zuerst
 * der Rest der Rechnung, was darüber hinausgeht, bis zur offenen
 * Mahnforderung; erst was dann noch bleibt, ist ein Guthaben. Ein negativer
 * Eingang (Rücklastschrift) teilt nichts auf.
 */
export function mahnkostenVorschlag(betrag: number, rest: number, mahnkostenOffen: number): number {
  if (!(betrag > 0) || !(mahnkostenOffen > 0)) return 0;
  return cent(Math.min(Math.max(betrag - Math.max(rest, 0), 0), mahnkostenOffen));
}
