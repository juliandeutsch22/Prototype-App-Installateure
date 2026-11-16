/**
 * DIE REGELN DER OFFENEN FORDERUNGEN — eine Fassung für App und Edge Function
 * (Durchsicht 15.11.2026, Budget B3).
 *
 * Zahlstand, Fälligkeit, Rücklass, „darf gemahnt werden“, Mahnkosten und der
 * Mahnlauf standen in `src/features/invoices` (`zahlstand.ts`, `mahnung.ts`,
 * `mahnlauf.ts`). Die Startseite brauchte sie über jede offene Rechnung und
 * holte dafür alle Köpfe in den Browser (gewachsener Bestand: 198). Jetzt
 * wertet die Edge Function `startseite-forderungen` mit DENSELBEN Regeln aus
 * und gibt nur Zahlen und die ersten Zeilen — die Regeln stehen deshalb hier,
 * und `src/features/invoices` reicht sie unverändert weiter. Eine zweite
 * Fassung (etwa in SQL) gibt es nicht.
 *
 * Die Felder heißen wie an der Rechnung der App (`Invoice` in `src/types`);
 * `shared/` kennt die Typen der App nicht, deshalb stehen die gelesenen hier.
 */

/** Was die Regeln von einer Rechnung lesen — Namen und Arten wie `Invoice` in `src/types`. */
export interface Invoice {
  invoiceNumber: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  totalBrutto: number;
  customerVatId?: string;
  ruecklassArt?: 'haft' | 'deckung' | null;
  ruecklassBetrag?: number | null;
  ruecklassBis?: string | null;
  ruecklassGarantieAm?: string | null;
  paymentStatus: 'Offen' | 'Überfällig' | 'Teilbezahlt' | 'Bezahlt' | 'Überzahlt' | 'Storniert';
  bezahltBetrag?: number;
  mahnstufe?: number;
  gemahntAm?: string;
  mahnfrist?: string;
}
/** Der Kopf einer Rechnung, wie ihn Startseite und Mahnlauf lesen. */
export type RechnungsKopf = Invoice;
/** Die Einstellungen des Betriebs, die die Mahnkosten bestimmen — wie `InvoiceRates`. */
interface InvoiceRates {
  mahnspesen?: number[];
  mahnspesenVerbraucher?: number[];
  pauschale458?: boolean;
}

const datumKurzAT = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—');

/**
 * Kaufmännisch auf `stellen` Nachkommastellen — wie Postgres
 * `round(numeric, stellen)` (Durchsicht 15.11.2026, G7).
 *
 * GERUNDET WIRD DER DEZIMALWERT, nicht die Gleitkommazahl. 4,25 × 72,30 ist
 * 307,275; im Speicher steht 307,27499999999998 — `Math.round(n * 100)`
 * machte daraus 307,27, die Datenbank 307,28. Deshalb zuerst auf 15 gültige
 * Stellen: so viele trägt eine Gleitkommazahl sicher, und genau so wandelt
 * Postgres `float8` in `numeric`. Danach halbe Einheiten weg von der Null
 * (−2,675 → −2,68), mit ganzen Zahlen gerechnet — ohne erneuten
 * Gleitkommafehler.
 *
 * DIE GRENZE: ein Ergebnis, das wirklich mehr als 15 gültige Stellen hat
 * (Zinsen über Tage durch 365), wird auf 15 Stellen gelesen. Dort gibt es
 * keinen exakten Dezimalwert, auf den man sich berufen könnte; Postgres
 * rechnete mit mehr Stellen und läge höchstens an einem solchen Rand anders.
 */
export function aufStellen(wert: number, stellen: number): number {
  /*
    Wie die alte Rundung mit Rechenzeichen gewandelt: ein fehlender Wert
    (undefined) wird NaN, null wird 0. Ein durchgereichtes `undefined` ließe
    `.toFixed()` dahinter abstürzen (gemessen in der E-Rechnung, 15.11.2026).
  */
  const n = +wert;
  if (!Number.isFinite(n)) return n;
  if (n === 0) return 0;
  const [ziffern, hoch] = Math.abs(n).toExponential(14).split('e');
  // Wert × 10^stellen = Mantisse (15 Ziffern, ganzzahlig) × 10^verschiebung.
  const verschiebung = Number(hoch) - 14 + stellen;
  if (verschiebung >= 0) return Math.sign(n) * Number(`${ziffern}e${hoch}`);
  const k = -verschiebung;
  // Die Mantisse ist kleiner als 10^15: ab 16 Stellen Abstand bleibt weniger als ein Zehntel.
  if (k > 15) return 0;
  const mantisse = Number(ziffern.replace('.', ''));
  const teiler = 10 ** k;
  const rest = mantisse % teiler;
  let ganz = (mantisse - rest) / teiler;
  if (rest * 2 >= teiler) ganz += 1;
  const betrag = ganz / 10 ** stellen;
  // Kein „−0“: in einer Summe oder einem Export stünde sonst „-0,00“.
  return n < 0 ? -betrag || 0 : betrag;
}

/**
 * Auf den Cent — DIE Rundung für Geld in der ganzen App. Zeile, Rabatt,
 * Umsatzsteuer, Skonto, Rücklass, Zinsen, Zahlstand, Nachkalkulation: alle
 * gehen hierüber, damit App, PDF und Datenbank denselben Cent nennen.
 * `tests/unit/geldRundungEinmal.test.ts` hält die Geldstellen davon ab,
 * wieder eigene Rundungen zu schreiben.
 */
export function cent(n: number): number {
  return aufStellen(n, 2);
}

const runde = cent;

/**
 * Was von einer Rechnung noch aussteht — und was zurückgeht.
 *
 * ZWEI ZAHLEN, WEIL ES ZWEI RICHTUNGEN SIND. „Rest" ist, was der Kunde noch
 * schuldet; „Guthaben" ist, was der Betrieb zurückzahlen muss. Sie über ein
 * Vorzeichen zusammenzulegen wäre kürzer und in jeder Anzeige eine Falle:
 * −250 € liest sich als Forderung, wenn man die Konvention nicht kennt, und
 * in einer Summe über mehrere Rechnungen hebt es sich gegenseitig auf. Eine
 * Liste offener Posten, in der eine Überzahlung eine fremde Forderung
 * wegkürzt, ist schlimmer als keine.
 *
 * DIE STORNIERTE RECHNUNG IST DER FALL, DER DAS ALLES ERKLÄRT. Die Forderung
 * ist weg, das Geld nicht: wer eine bezahlte Rechnung storniert, schuldet dem
 * Kunden den Betrag. Ohne diese Unterscheidung verschwände die Rückzahlung
 * still aus dem System — der Kunde erinnert sich, der Betrieb nicht.
 */
export interface Zahlstand {
  /** Summe aller Eingänge, wie sie die Datenbank geführt hat. */
  bezahlt: number;
  /** Was der Kunde noch schuldet. Nie negativ. */
  rest: number;
  /** Was der Betrieb zurückzahlen muss. Nie negativ. */
  guthaben: number;
}

type Rechnung = Pick<Invoice, 'totalBrutto' | 'bezahltBetrag' | 'paymentStatus'>;

export function zahlstand(inv: Rechnung): Zahlstand {
  const bezahlt = runde(inv.bezahltBetrag ?? 0);
  /*
    Eine stornierte Rechnung fordert nichts mehr. Das ist keine Anzeigefrage:
    stünde sie mit ihrem Bruttobetrag in den offenen Posten, mahnte der Lauf
    eine Forderung an, die der Betrieb selbst zurückgenommen hat.
  */
  const forderung = inv.paymentStatus === 'Storniert' ? 0 : runde(inv.totalBrutto ?? 0);
  return {
    bezahlt,
    rest: runde(Math.max(forderung - bezahlt, 0)),
    guthaben: runde(Math.max(bezahlt - forderung, 0)),
  };
}

/** Kurzform für die vielen Stellen, die nur den Rest brauchen. */
export function offenerRest(inv: Rechnung): number {
  return zahlstand(inv).rest;
}

type MitRuecklass = Rechnung & Pick<Invoice, 'dueDate' | 'ruecklassBetrag' | 'ruecklassBis' | 'ruecklassGarantieAm'>;

/**
 * Wann der Rücklass fällig ist: am vereinbarten Tag — oder am Tag der Ablöse
 * durch Bankgarantie, wenn der früher liegt (seit 10.10.2026). Dieselbe
 * Regel steht in der Datenbank (`app.mahnbar_ab`).
 */
export function ruecklassFaelligAm(inv: Pick<Invoice, 'ruecklassBis' | 'ruecklassGarantieAm'>): string | undefined {
  const bis = inv.ruecklassBis ?? undefined;
  const am = inv.ruecklassGarantieAm ?? undefined;
  if (am && (!bis || am < bis)) return am;
  return bis;
}

/**
 * Der noch offene Teil eines Rücklasses (seit 05.10.2026).
 *
 * ZAHLUNGEN TILGEN ZUERST DEN ÜBRIGEN BETRAG. Der Kunde zahlt, was die
 * Rechnung als Zahlbetrag nennt, und behält den Rücklass ein; was danach
 * offen ist, bis zu dessen Höhe, ist der Rücklass.
 */
export function offenerRuecklass(inv: Rechnung & Pick<Invoice, 'ruecklassBetrag'>): number {
  const r = runde(inv.ruecklassBetrag ?? 0);
  if (!(r > 0)) return 0;
  return runde(Math.min(zahlstand(inv).rest, r));
}

/**
 * Was heute zu mahnen ist — und ab wann es fällig war.
 *
 * OHNE RÜCKLASS: der Rest ab dem Zahlungsziel, wie bisher. MIT RÜCKLASS
 * zählt sein offener Teil erst, wenn er fällig ist; davor mahnt der Lauf
 * nur den übrigen Betrag. Ist der Rücklass dabei, gilt die spätere der
 * beiden Fälligkeiten: die Verzugszinsen rechnen dann ab ihr — zu wenig zu
 * fordern ist zulässig, zu viel nicht. Dieselbe Regel steht in der Datenbank
 * (`app.mahnbar_ab`) für die Zahl am Menüpunkt.
 */
export function mahnbar(inv: MitRuecklass, heute: string): { rest: number; faellig?: string } {
  const { rest } = zahlstand(inv);
  const r = offenerRuecklass(inv);
  if (r <= 0) return { rest, faellig: inv.dueDate };
  const haupt = runde(rest - r);
  const faelligAm = ruecklassFaelligAm(inv);
  const ruecklassFaellig = !!faelligAm && faelligAm < heute;
  if (!ruecklassFaellig) return { rest: haupt, faellig: inv.dueDate };
  if (haupt <= 0) return { rest, faellig: faelligAm };
  const spaeter = (inv.dueDate ?? '') > (faelligAm ?? '') ? inv.dueDate : faelligAm;
  return { rest, faellig: spaeter };
}

/**
 * Ist diese Rechnung überfällig — unabhängig davon, ob schon etwas kam?
 *
 * GEMELDET: „sobald eine Teilzahlung abgeschlossen wurde, lässt sich die
 * Rechnung nicht mehr mahnen". Mahnen liess sie sich — aber man sah nicht
 * mehr, dass man sollte. Der Stand ergibt sich aus den Zahlungseingängen,
 * und nach der ersten Teilzahlung heisst er „Teilbezahlt", nie wieder
 * „Überfällig". Abzeichen, Filter, die Summe „Überfällig" und die Startseite
 * fragten nur den Stand — und führten den Rest einer längst fälligen
 * Rechnung als „offen", also als etwas, das noch Zeit hat.
 *
 * DIE FRAGE IST: gibt es einen Rest, und ist das Zahlungsziel vorbei? Das
 * gilt auch für „Offen": die Liste stellt den Stand beim Öffnen um, die
 * Startseite sieht ihn womöglich vorher.
 */
export function istUeberfaellig(
  inv: Pick<Invoice, 'paymentStatus' | 'dueDate' | 'totalBrutto' | 'bezahltBetrag' | 'ruecklassBetrag' | 'ruecklassBis' | 'ruecklassGarantieAm'>,
  heute: string,
): boolean {
  // Ein noch nicht fälliger Rücklass ist kein Verzug (seit 05.10.2026).
  const m = mahnbar(inv, heute);
  if (inv.paymentStatus === 'Überfällig') return m.rest > 0;
  if (inv.paymentStatus !== 'Offen' && inv.paymentStatus !== 'Teilbezahlt') return false;
  return !!m.faellig && m.faellig < heute && m.rest > 0;
}

/**
 * Mahnwesen — was mit einer Rechnung geschieht, die nicht bezahlt wird.
 *
 * WAS ES VORHER GAB: den Status „Überfällig". Er wurde beim Öffnen der
 * Ansicht automatisch gesetzt und dann angezeigt. Mehr nicht — kein
 * Mahndatum, keine Stufe, kein Schreiben an den Kunden. Der Betrieb sah, dass
 * Geld aussteht, und musste das Mahnen selbst im Kopf führen.
 *
 * DREI STUFEN, weil im Handwerk drei üblich sind und weil sie verschiedene
 * Dinge sagen:
 *
 *   1  ZAHLUNGSERINNERUNG — geht davon aus, dass es übersehen wurde. Das ist
 *      in den meisten Fällen die Wahrheit, und ein scharfer Ton bei der
 *      ersten Nachfrage kostet Kunden, die einfach nur im Urlaub waren.
 *   2  MAHNUNG — benennt den Verzug.
 *   3  LETZTE MAHNUNG — kündigt an, dass es aus der Hand gegeben wird.
 *
 * VERZUGSZINSEN stehen seit 29.09.2026 ab der zweiten Stufe auf dem Beleg
 * (offene Punkte B7) — siehe {@link verzugszinsen}. Die Mahnspesen legt der
 * Betrieb selbst fest; sie stehen in den Einstellungen und sind je Stufe eine
 * schlichte Zahl.
 */

export const MAHNSTUFEN = [1, 2, 3] as const;

export type Mahnstufe = (typeof MAHNSTUFEN)[number];

/**
 * Welche Stufe kommt als Nächstes?
 *
 * `null` heisst: es geht nicht weiter. Nach der dritten ist Schluss — was
 * dann folgt, entscheidet nicht diese App, sondern ein Mensch mit einem
 * Anwalt oder einem Inkassobüro. Eine vierte Mahnung wäre ein Schreiben, das
 * seine eigene Ankündigung widerruft.
 */
export function naechsteStufe(inv: Pick<Invoice, 'mahnstufe'>): Mahnstufe | null {
  const jetzt = inv.mahnstufe ?? 0;
  return jetzt >= 3 ? null : ((jetzt + 1) as Mahnstufe);
}

export interface MahnPruefung {
  /** Darf gemahnt werden? */
  moeglich: boolean;
  /** Warum nicht — für die Oberfläche. */
  grund?: string;
}

/**
 * Darf diese Rechnung gemahnt werden?
 *
 * DIE FÄLLIGKEIT ENTSCHEIDET, nicht der Status. „Überfällig" wird beim Öffnen
 * der Liste gesetzt; wer die Liste heute noch nicht geöffnet hat, hätte sonst
 * eine fällige Rechnung, die sich nicht mahnen lässt. Der Status ist eine
 * Anzeige, das Datum ist die Tatsache.
 */
export function darfMahnen(
  inv: Pick<
    Invoice,
    'paymentStatus' | 'dueDate' | 'mahnstufe' | 'gemahntAm' | 'mahnfrist'
    | 'totalBrutto' | 'bezahltBetrag' | 'ruecklassBetrag' | 'ruecklassBis' | 'ruecklassGarantieAm'
  >,
  heute: string,
): MahnPruefung {
  if (inv.paymentStatus === 'Storniert') {
    return { moeglich: false, grund: 'Die Rechnung ist storniert.' };
  }
  /*
    BEIDE MÜSSEN „OFFEN" SAGEN — der Status UND die Zahl.

    „Teilbezahlt" ist mahnbar, der Kunde schuldet ja noch etwas; das ist der
    Grund für Stufe 10.1, denn vorher wurde eine Rechnung über 1.000 €, auf
    die 400 gekommen sind, über den vollen Betrag gemahnt.

    WARUM NICHT ALLEIN DIE ZAHL, obwohl sie die genauere wäre: Rechnungen aus
    der Zeit vor den Zahlungseingängen tragen „Bezahlt" und einen bezahlten
    Betrag von null — den Betrag hat damals niemand erfasst, weil es das Feld
    nicht gab. Wer hier nur rechnet, mahnt beim ersten Lauf den gesamten
    Altbestand. Die Migration trägt den Betrag zwar nach (siehe
    `20260919120000_zahlungseingaenge.sql`), aber eine Regel, die nur mit
    geglückter Migration richtig ist, ist keine Regel, sondern eine Annahme.
  */
  if (inv.paymentStatus === 'Bezahlt' || inv.paymentStatus === 'Überzahlt') {
    return { moeglich: false, grund: 'Die Rechnung ist bezahlt.' };
  }
  if (offenerRest(inv) <= 0) {
    return { moeglich: false, grund: 'Die Rechnung ist bezahlt.' };
  }
  // Offen ist nur noch ein Rücklass, der nicht fällig ist (seit 05.10.2026).
  const m = mahnbar(inv, heute);
  if (m.rest <= 0) {
    return { moeglich: false, grund: `Offen ist nur der Rücklass, fällig am ${datumKurzAT(ruecklassFaelligAm(inv))}.` };
  }
  if (!m.faellig || m.faellig >= heute) {
    return { moeglich: false, grund: 'Das Zahlungsziel ist noch nicht abgelaufen.' };
  }
  if (naechsteStufe(inv) === null) {
    return {
      moeglich: false,
      grund: 'Die dritte Mahnung ist verschickt. Was jetzt folgt, entscheidet der Betrieb.',
    };
  }
  const laeuft = laufendeFrist(inv);
  if (laeuft && laeuft >= heute) {
    return {
      moeglich: false,
      grund: `Die Frist aus der letzten Mahnung läuft noch bis ${laeuft}.`,
    };
  }
  return { moeglich: true };
}

/**
 * Bis wann die Frist aus der LETZTEN Mahnung läuft — oder `null`, wenn keine
 * läuft.
 *
 * DER FEHLER, DEN DAS BEHEBT. Geprüft wurde bisher nur das ursprüngliche
 * Zahlungsziel. Wer gestern eine Zahlungserinnerung mit einer Woche Frist
 * verschickt hat, bekam die Rechnung heute wieder im Mahnlauf angeboten — für
 * Stufe 2, sechs Tage vor Ablauf der Frist, die er selbst gesetzt hat. Das sah
 * nach Arbeit aus und war eine Aufforderung, dem Kunden die zugesagte Frist
 * wieder zu nehmen.
 *
 * Aufgefallen ist es erst durch das Abzeichen im Menü: eine Zahl, die jede
 * überfällige Rechnung jeden Tag mitzählt, leuchtet dauerhaft — und eine
 * Meldung, die immer an ist, ist keine.
 *
 * DER RÜCKFALL, wenn `mahnfrist` fehlt: das Mahndatum plus {@link FRIST_TAGE},
 * also die Frist, die der Beleg vorschlägt. Fehlt auch das, ist die Rechnung
 * fällig — die andere Wahl wäre „nie wieder fällig", und das versteckte eine
 * offene Forderung für immer.
 *
 * Dieselbe Regel steht in `app.mahnung_faellig` (Migration
 * `20260916140000_offene_posten.sql`), weil das Abzeichen zählen muss, was
 * diese Liste zeigt.
 */
export function laufendeFrist(
  inv: Pick<Invoice, 'mahnstufe' | 'gemahntAm' | 'mahnfrist'>,
): string | null {
  if (!inv.mahnstufe) return null;
  if (inv.mahnfrist) return inv.mahnfrist;
  if (!inv.gemahntAm) return null;
  return tagePlus(inv.gemahntAm, FRIST_TAGE);
}

/** `n` Tage auf einen ISO-Tag, in UTC gerechnet — ohne Sommerzeitfallen. */
function tagePlus(isoTag: string, n: number): string | null {
  const t = Date.parse(`${isoTag}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Die Mahnspesen einer Stufe.
 *
 * Der Betrieb legt sie fest; ohne Festlegung sind sie null. KEINE VORGABE mit
 * einer erfundenen Zahl: was ein Betrieb verrechnen darf, hängt am Aufwand
 * und am Vertrag, und ein voreingestellter Betrag sähe aus wie eine Auskunft
 * darüber.
 */
export function spesenFuer(stufe: Mahnstufe, spesen: number[] | undefined): number {
  const wert = spesen?.[stufe - 1];
  return typeof wert === 'number' && wert > 0 ? wert : 0;
}

/** Die Einstellungen, aus denen die Mahnkosten einer Rechnung kommen. */
export type MahnkostenSaetze = Pick<InvoiceRates, 'mahnspesen' | 'mahnspesenVerbraucher' | 'pauschale458'>;

/** Pauschale für Betreibungskosten zwischen Unternehmern (§ 458 UGB). */
export const PAUSCHALE_458 = 40;

/**
 * Was eine Mahnung an Kosten verlangt — je nachdem, an wen sie geht.
 *
 * FIRMEN- UND PRIVATKUNDEN GETRENNT, weil das Gesetz sie trennt. Gegenüber
 * einem Verbraucher sind Mahnkosten nur zu ersetzen, soweit sie angemessen
 * und zweckmässig sind (§ 1333 Abs 2 ABGB); eine hohe Pauschale je Brief hält
 * dort oft nicht. Zwischen Unternehmern steht dem Betrieb ab dem Verzug eine
 * Pauschale von 40 € zu (§ 458 UGB), die die Mahnkosten bis zu dieser Höhe
 * abdeckt — deshalb ENTWEDER die Pauschale ODER die Spesen je Stufe, nicht
 * beides. Unternehmer ist, wie bei den Verzugszinsen, wer eine UID hat.
 *
 * OHNE EIGENE SÄTZE FÜR PRIVATKUNDEN gelten die bisherigen: ein Betrieb, der
 * seine Spesen vor der Trennung eingetragen hat, verrechnet unverändert
 * weiter, bis er etwas anderes einträgt.
 *
 * Die Pauschale steht ab der Mahnung, nicht auf der Zahlungserinnerung — aus
 * demselben Grund wie die Zinsen.
 */
export function mahnkosten(
  stufe: Mahnstufe,
  saetze: MahnkostenSaetze | undefined,
  unternehmer: boolean,
): { spesen: number; pauschale: number } {
  if (unternehmer && saetze?.pauschale458) {
    /*
      EINMAL JE RECHNUNG (G3): die Pauschale steht auf der Mahnung (Stufe 2).
      Die letzte Mahnung forderte sie bisher ein zweites Mal — seit die
      Schreiben frühere Kosten mitführen, stünde sie sonst doppelt da.
    */
    return { spesen: 0, pauschale: stufe === 2 ? PAUSCHALE_458 : 0 };
  }
  const liste = unternehmer ? saetze?.mahnspesen : (saetze?.mahnspesenVerbraucher ?? saetze?.mahnspesen);
  return { spesen: spesenFuer(stufe, liste), pauschale: 0 };
}

/** Vorschlag für die neue Frist: eine Woche. Änderbar in der Oberfläche. */
export const FRIST_TAGE = 7;


/**
 * Der Mahnlauf — nicht Rechnung für Rechnung, sondern in einem Durchgang.
 *
 * WAS ES VORHER GAB: das Mahnen als Menüpunkt an der einzelnen Rechnung. Die
 * Stufen stimmten, die Belege stimmten — nur kam niemand dorthin. Wer wissen
 * wollte, was zu mahnen ist, filterte die Liste auf „Überfällig", ging sie
 * von oben nach unten durch, öffnete an jeder Zeile das Menü und prüfte im
 * Kopf, ob die dritte Mahnung schon draussen war.
 *
 * Das ist der Grund, warum Mahnwesen in kleinen Betrieben liegen bleibt: nicht
 * weil das Schreiben schwer wäre, sondern weil das ZUSAMMENSTELLEN Arbeit ist
 * und sich immer verschieben lässt.
 *
 * WAS DIESER LAUF NICHT TUT, und das gehört an den Anfang: er verschickt
 * nichts von selbst. Jede Mahnung bleibt ein bewusster Griff, weil hinter
 * jeder ein Kunde steht, den der Chef vielleicht gerade am Telefon hatte. Der
 * Lauf nimmt das Suchen ab, nicht die Entscheidung.
 */

/*
  Über die Art der Rechnung allgemein: die Rechnungsseite gibt ganze
  Rechnungen hinein und bekommt sie zurück, die Startseite nur die Köpfe
  (`listUnpaidInvoiceKoepfe`). Gelesen wird beides gleich.
*/
export interface MahnZeile<R extends RechnungsKopf = RechnungsKopf> {
  rechnung: R & { id: string };
  /** Die Stufe, die als Nächstes fällig wäre. */
  stufe: Mahnstufe;
  /** Wie viele Tage die Zahlungsfrist überschritten ist. */
  tageUeberfaellig: number;
  /**
   * Was auf diese Rechnung noch aussteht — NICHT der Rechnungsbetrag.
   *
   * Auf eine Rechnung über 1.000 €, auf die 400 gekommen sind, gehören 600 in
   * die Mahnung. Der Bruttobetrag stünde dort als Forderung, die es nicht
   * mehr gibt, und eine zu hohe Mahnung ist nicht bloss peinlich: der Kunde
   * bestreitet sie zu Recht, und der Betrieb steht mit einer offenen
   * Forderung da, die er selbst falsch beziffert hat.
   */
  offen: number;
  /** Was der Betrieb für diese Stufe verrechnet (Spesen oder Pauschale) — 0, wenn nichts hinterlegt. */
  spesen: number;
}

export interface Mahnlauf<R extends RechnungsKopf = RechnungsKopf> {
  /** Was gemahnt werden kann, dringlichstes zuerst. */
  zeilen: MahnZeile<R>[];
  /**
   * Überfällige Rechnungen, bei denen die dritte Mahnung heraus ist.
   *
   * SIE STEHEN GETRENNT DA UND WERDEN NICHT VERSCHWIEGEN. Genau bei ihnen
   * hört die App auf und ein Mensch muss entscheiden — Anwalt, Inkasso oder
   * abschreiben. Fielen sie stillschweigend aus dem Lauf, wären ausgerechnet
   * die ältesten Forderungen die unsichtbarsten.
   */
  ausgereizt: Array<R & { id: string }>;
  /** Summe dessen, was dieser Lauf einfordert — Restbeträge, nicht Brutto. */
  summeOffen: number;
  /** Summe der Spesen, die dieser Lauf verrechnen würde. */
  summeSpesen: number;
}

/** Tage zwischen zwei ISO-Tagen, in UTC gerechnet — ohne Sommerzeitfallen. */
function tageZwischen(vonIso: string, bisIso: string): number {
  const von = Date.parse(`${vonIso}T00:00:00Z`);
  const bis = Date.parse(`${bisIso}T00:00:00Z`);
  if (Number.isNaN(von) || Number.isNaN(bis)) return 0;
  return Math.round((bis - von) / 86_400_000);
}

/**
 * Was heute zu mahnen ist.
 *
 * DIE REIHENFOLGE IST DIE AUSSAGE, und sie ist nicht die der Rechnungsliste.
 * Oben steht, was am weitesten fortgeschritten ist: eine Forderung vor der
 * letzten Mahnung ist dringender als eine, die gerade erst die Frist
 * überschritten hat. Bei gleicher Stufe entscheidet das Alter, dann der
 * OFFENE Betrag — 12.000 € gehen vor 80 €, wenn beide gleich lange offen
 * sind. „Offen" heisst hier der Rest nach Teilzahlungen, nicht der
 * Rechnungsbetrag.
 *
 * Gerechnet wird gegen `heute` als Übergabewert, nicht gegen die Uhr des
 * Rechners: sonst hinge das Ergebnis daran, wann jemand die Seite geöffnet
 * hat, und wäre nicht prüfbar.
 */
export function mahnlauf<R extends RechnungsKopf>(
  invoices: Array<R & { id: string }>,
  heute: string,
  saetze: MahnkostenSaetze | undefined,
  /** Wer als Unternehmer gilt — ohne Angabe: wer auf der Rechnung eine UID trägt. */
  istUnternehmer: (inv: R) => boolean = (inv) => !!inv.customerVatId?.trim(),
): Mahnlauf<R> {
  const zeilen: MahnZeile<R>[] = [];
  const ausgereizt: Array<R & { id: string }> = [];

  for (const inv of invoices) {
    const stufe = naechsteStufe(inv);
    if (stufe === null) {
      /*
        Ausgereizt heisst NICHT „erledigt". Bezahlt oder storniert gehört hier
        nicht her — sonst stünde eine beglichene Rechnung dauerhaft unter
        „braucht eine Entscheidung", und die Liste wäre nach einem Jahr
        unbrauchbar.
      */
      if (
        inv.paymentStatus !== 'Storniert'
        && inv.paymentStatus !== 'Bezahlt'
        && inv.paymentStatus !== 'Überzahlt'
        && offenerRest(inv) > 0
      ) {
        ausgereizt.push(inv);
      }
      continue;
    }
    if (!darfMahnen(inv, heute).moeglich) continue;
    // Ohne den Rücklass, solange er nicht fällig ist (seit 05.10.2026).
    const m = mahnbar(inv, heute);
    zeilen.push({
      rechnung: inv,
      stufe,
      tageUeberfaellig: m.faellig ? tageZwischen(m.faellig, heute) : 0,
      offen: m.rest,
      spesen: (({ spesen, pauschale }) => spesen + pauschale)(mahnkosten(stufe, saetze, istUnternehmer(inv))),
    });
  }

  zeilen.sort(
    (a, b) =>
      b.stufe - a.stufe ||
      b.tageUeberfaellig - a.tageUeberfaellig ||
      b.offen - a.offen,
  );

  return {
    zeilen,
    ausgereizt,
    summeOffen: runde(zeilen.reduce((s, z) => s + z.offen, 0)),
    summeSpesen: runde(zeilen.reduce((s, z) => s + z.spesen, 0)),
  };
}

// ─────────────────────────────────────────────── Startseite: Zahlen und die ersten ──

/** Wie viele Tage vor der Fälligkeit ein Rücklass auf der Startseite steht. */
export const RUECKLASS_VORLAUF_TAGE = 30;

/** Rücklässe, die in den nächsten {@link RUECKLASS_VORLAUF_TAGE} Tagen fällig werden — der früheste zuerst. */
export function ruecklaesseBald<R extends RechnungsKopf>(rechnungen: Array<R & { id: string }>, heute: string): Array<R & { id: string }> {
  const bis = new Date(`${heute}T00:00:00Z`);
  bis.setUTCDate(bis.getUTCDate() + RUECKLASS_VORLAUF_TAGE);
  const grenze = bis.toISOString().slice(0, 10);
  return rechnungen
    // Ab der Fälligkeit steht er unter „überfällig“ und im Mahnlauf — hier nur davor.
    .filter((r) => {
      const am = ruecklassFaelligAm(r);
      return r.paymentStatus !== 'Storniert' && offenerRuecklass(r) > 0 && !!am && am >= heute && am <= grenze;
    })
    .sort((a, b) => (ruecklassFaelligAm(a) ?? '').localeCompare(ruecklassFaelligAm(b) ?? ''));
}

/**
 * WAS DIE STARTSEITE ÜBER DIE OFFENEN FORDERUNGEN SAGT (Durchsicht
 * 15.11.2026, Budget B3): die Zahlen über alle und je Abschnitt die ersten
 * `n` Zeilen — ausgewertet mit den Regeln oben. Bis dahin kamen dafür alle
 * offenen Köpfe in den Browser; jetzt rechnet die Edge Function
 * `startseite-forderungen` mit dieser Funktion und schickt nur das Ergebnis.
 */
export interface ForderungsStand<R extends RechnungsKopf = RechnungsKopf> {
  /** Der Mahnlauf: wie viele jetzt eine Mahnung brauchen, die ersten in seiner Reihenfolge. */
  mahnungen: { anzahl: number; zeilen: MahnZeile<R>[] };
  /** Überfällig, aber (noch) nicht zu mahnen — nach der Fälligkeit des Mahnbaren. */
  ueberfaelligNichtMahnbar: { anzahl: number; zeilen: Array<{ rechnung: R & { id: string }; ausgereizt: boolean }> };
  /** Rücklässe, die bald fällig werden — mit ihrer Summe. */
  ruecklassBald: { anzahl: number; summe: number; zeilen: Array<R & { id: string }> };
  /** Die Kacheln „Offen“ und „Überfällig“ und der Hinweis „N Rechnungen überfällig“. */
  kennzahlen: {
    /** Offen ohne das, was fällig ist (ein noch nicht fälliger Rücklass zählt hier). */
    offenSumme: number;
    offenAnzahl: number;
    /** Was zu mahnen ist — über alle überfälligen. */
    faelligSumme: number;
    ueberAnzahl: number;
    /** Ab wann die älteste überfällige fällig ist (bei einem Rücklass seine Fälligkeit). */
    aeltesteFaellig: string | null;
  };
}

export function forderungsStand<R extends RechnungsKopf>(
  rechnungen: Array<R & { id: string }>,
  heute: string,
  saetze: MahnkostenSaetze | undefined,
  n: number,
): ForderungsStand<R> {
  const lauf = mahnlauf(rechnungen, heute, saetze);
  const imLauf = new Set(lauf.zeilen.map((z) => z.rechnung.id));
  const ausgereizt = new Set(lauf.ausgereizt.map((r) => r.id));
  const ueber = rechnungen.filter((r) => istUeberfaellig(r, heute));
  const offen = rechnungen.filter((r) => !istUeberfaellig(r, heute));
  const nichtMahnbar = ueber
    .filter((r) => !imLauf.has(r.id))
    .sort((a, b) => (mahnbar(a, heute).faellig ?? '').localeCompare(mahnbar(b, heute).faellig ?? ''));
  const bald = ruecklaesseBald(rechnungen, heute);
  const summe = (l: typeof rechnungen) => l.reduce((s, i) => s + offenerRest(i), 0);
  // Überfällig ist nur, was zu mahnen ist; ein noch nicht fälliger Rücklass bleibt offen — dieselbe Rechnung zählt dann in beiden Kacheln.
  const faellig = ueber.reduce((s, i) => s + mahnbar(i, heute).rest, 0);
  const mitRuecklass = ueber.filter((i) => offenerRest(i) - mahnbar(i, heute).rest > 0.005).length;
  const ab = (i: R) => mahnbar(i, heute).faellig ?? i.dueDate;
  const aeltester = [...ueber].sort((a, b) => ab(a).localeCompare(ab(b)))[0];
  return {
    mahnungen: { anzahl: lauf.zeilen.length, zeilen: lauf.zeilen.slice(0, n) },
    ueberfaelligNichtMahnbar: {
      anzahl: nichtMahnbar.length,
      zeilen: nichtMahnbar.slice(0, n).map((r) => ({ rechnung: r, ausgereizt: ausgereizt.has(r.id) })),
    },
    ruecklassBald: { anzahl: bald.length, summe: bald.reduce((s, i) => s + offenerRuecklass(i), 0), zeilen: bald.slice(0, n) },
    kennzahlen: {
      offenSumme: summe(offen) + summe(ueber) - faellig,
      offenAnzahl: offen.length + mitRuecklass,
      faelligSumme: faellig,
      ueberAnzahl: ueber.length,
      aeltesteFaellig: aeltester ? ab(aeltester) : null,
    },
  };
}
