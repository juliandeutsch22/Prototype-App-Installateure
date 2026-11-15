import type { Invoice, WorkSheet } from '@/types';

/**
 * Welche unterschriebenen Scheine noch auf keiner Rechnung stehen.
 *
 * DIE LETZTE OFFENE STELLE IM KREIS. Der Weg vom Einsatz zum Geld war
 * durchgehend gebaut — Zeit buchen, Schein unterschreiben, Rechnung daraus
 * zusammenstellen —, aber niemand konnte sagen, WAS davon noch nicht durch
 * ist. Die Rechnung merkt sich, welche Scheine sie verbraucht hat
 * (`linkedWorkSheets`); gelesen wurde das bisher nur beim Zusammenstellen der
 * nächsten Rechnung, um nichts doppelt zu verrechnen.
 *
 * Die Umkehrung fehlte, und sie ist die betrieblich wichtigere: geleistete,
 * unterschriebene Arbeit, für die nie jemand eine Rechnung geschrieben hat.
 * Das ist kein Buchhaltungsfehler, den man später sieht — es ist Geld, das
 * schlicht nie eingefordert wird, und im Handwerk der klassische Weg, wie ein
 * gut ausgelasteter Betrieb trotzdem knapp bei Kasse ist.
 *
 * WARUM DER STORNO EINER RECHNUNG DIE SCHEINE WIEDER FREIGIBT: er nimmt die
 * Forderung zurück, also ist die Leistung wieder unverrechnet. Ein Feld am
 * Schein müsste dafür jemand zurücksetzen; hier fällt es von selbst an.
 */

/** Tage zwischen zwei ISO-Tagen, in UTC — ohne Sommerzeitfallen. */
function tageZwischen(vonIso: string, bisIso: string): number {
  const von = Date.parse(`${vonIso}T00:00:00Z`);
  const bis = Date.parse(`${bisIso}T00:00:00Z`);
  if (Number.isNaN(von) || Number.isNaN(bis)) return 0;
  return Math.round((bis - von) / 86_400_000);
}

/**
 * Ab wann eine unverrechnete Leistung auffällig ist, in Tagen.
 *
 * Vier Wochen. Kürzer wäre Lärm — zwischen Einsatz und Rechnung liegt im
 * Handwerk regelmässig ein Monatsabschluss. Länger hiesse, dass ein
 * vergessener Schein erst auffällt, wenn der Kunde ihn selbst nicht mehr
 * erinnert.
 */
export const AUFFAELLIG_AB_TAGEN = 28;

/**
 * Die unverrechneten Scheine als Zeilen mit ihrem Alter, ÄLTESTE ZUERST —
 * das ist die Aussage. Eine Leistung von vorgestern ist normal, eine von vor
 * drei Monaten ist ein Befund.
 *
 * WELCHE SCHEINE UNVERRECHNET SIND, sagt die Datenbank (`scheine_unverrechnet`,
 * Durchsicht 15.11.2026, P3): über ALLE unterschriebenen Scheine, nach den
 * Regeln, die vorher hier standen — eine gültige Rechnung verrechnet, ein
 * Storno gibt frei, eine verrechnete Pauschale enthält, ein Schein ohne
 * Material im abgerechneten Zeitraum ist abgerechnet. Bis dahin suchten
 * Startseite, Rechnungen und Scheinliste nur unter den 60 jüngsten; ab etwa
 * fünf Monteuren fiel ein Schein heraus, bevor er „über 4 Wochen“ alt werden
 * konnte. Zähler, Liste und Schwelle haben jetzt eine Quelle.
 */
export function unverrechnetZeilen<S extends { datum: string; id: string }>(
  scheine: S[],
  heute: string,
): Array<{ schein: S; tage: number }> {
  return scheine
    .map((schein) => ({ schein, tage: tageZwischen(schein.datum, heute) }))
    .sort((a, b) => b.tage - a.tage || a.schein.id.localeCompare(b.schein.id));
}

/** Die Nummer einer Baustelle ohne „PR-“ und Schreibung — wie `norm` der Rechnung. */
function baustelleNorm(n?: string): string {
  return (n ?? '').trim().toLowerCase().replace(/^pr-/, '');
}

/** Ob ein Schein etwas trägt, das nur über ihn auf eine Rechnung kommt. */
function traegtMaterial(s: Pick<WorkSheet, 'material'>): boolean {
  return (s.material ?? []).some((z) => z.menge > 0 && !!z.name?.trim());
}

/**
 * Scheine ohne Material, deren Tag eine gültige Rechnung derselben
 * Baustelle schon abgerechnet hat (Gesamtanalyse 12.11.2026, A1).
 *
 * WARUM ES DIESE REGEL BRAUCHT. Bis zum 12.11.2026 verknüpfte eine Rechnung
 * nur die Scheine, deren MATERIAL sie brachte. Ein Schein nur mit Stunden —
 * bei Regie und Reparaturen der häufigste Fall — stand danach auf keiner
 * Rechnung und galt für immer als „nicht verrechnet“, obwohl seine Stunden
 * über die Buchungen längst auf der Rechnung standen. Neue Rechnungen
 * verknüpfen ihn jetzt (`assembleInvoice`); für die schon ausgestellten
 * entscheidet diese Regel, ohne eine Zeile der Produktion umzuschreiben.
 *
 * WARUM DAS STIMMT. Ein Schein ohne Material bringt selbst nichts auf eine
 * Rechnung: die Stunden kommen aus den Buchungen, die ihren eigenen
 * Verrechnungsstand tragen. Ist eine Buchung noch offen, steht sie als
 * unverrechnete Stunde da; fehlt sie ganz, meldet es die Scheinliste unter
 * „Stunden ohne Buchung“. Liegt sein Tag im Zeitraum einer Rechnung, die
 * Belege dieser Baustelle verbraucht hat, ist er abgerechnet.
 *
 * NUR RECHNUNGEN, DIE BELEGE VERBRAUCHT HABEN: keine Anzahlung, keine
 * Teilrechnung auf eine Pauschale, keine reine Wartungsrechnung — sie
 * rechnen keinen Tag ab. Ein Storno gibt den Schein wieder frei. Der
 * Zeitraum endet mit „Leistung bis“, ohne sie am Rechnungsdatum; ohne
 * „Leistung von“ gilt alles bis dahin (wie `nachgetrageneScheine`).
 */
export function inAbgerechnetemZeitraum(
  scheine: ReadonlyArray<Pick<WorkSheet, 'status' | 'projectNumber' | 'datum' | 'material'> & { id: string }>,
  rechnungen: ReadonlyArray<Pick<Invoice, 'projectNumber' | 'paymentStatus' | 'art' | 'leistungVon' | 'leistungBis' | 'invoiceDate'
    | 'linkedEntries' | 'linkedOrders' | 'linkedWorkSheets'>>,
): string[] {
  const zeitraeume = new Map<string, Array<{ von?: string; bis: string }>>();
  for (const r of rechnungen) {
    if (r.paymentStatus === 'Storniert' || (r.art ?? 'einzel') === 'anzahlung') continue;
    const belege = (r.linkedEntries?.length ?? 0) + (r.linkedOrders?.length ?? 0) + (r.linkedWorkSheets?.length ?? 0);
    const bis = r.leistungBis || r.invoiceDate;
    const nr = baustelleNorm(r.projectNumber);
    if (belege === 0 || !bis || !nr) continue;
    const liste = zeitraeume.get(nr) ?? [];
    liste.push({ von: r.leistungVon || undefined, bis });
    zeitraeume.set(nr, liste);
  }
  return scheine
    .filter((s) => {
      if (s.status !== 'Unterschrieben' || !s.datum || traegtMaterial(s)) return false;
      return (zeitraeume.get(baustelleNorm(s.projectNumber)) ?? [])
        .some((z) => s.datum <= z.bis && (!z.von || s.datum >= z.von));
    })
    .map((s) => s.id);
}

/**
 * „Nicht verrechnete Leistung“ als EINE ZEILE JE BAUSTELLE (Gesamtanalyse
 * 12.11.2026, A2).
 *
 * Vorher stand dieselbe Arbeit zweimal da: der Schein und die Stunden, die
 * auf ihm stehen — mit demselben Knopf „Baustelle wählen“, und die Zahl im
 * Titel zählte sie doppelt. Verrechnet wird eine Baustelle, nicht ein Schein
 * (`assembleInvoice` nimmt alles Offene der Baustelle); deshalb steht sie
 * hier einmal, mit allem, was offen ist. Gemessen wird am ältesten offenen
 * Beleg, älteste Baustelle zuerst.
 */
export interface OffeneBaustelle<S, H> {
  /** Die Baustellennummer, wie sie am ältesten Beleg steht. */
  projectNumber: string;
  kunde: string;
  scheine: S[];
  /** Ältester Tag unter den Scheinen. */
  aeltesterSchein: string | null;
  stunden: H | null;
  tage: number;
}

export function nichtVerrechnetJeBaustelle<
  S extends Pick<WorkSheet, 'projectNumber' | 'customerName' | 'datum'>,
  H extends { projectNumber: string; kunde: string; aeltester: string },
>(
  scheine: Array<{ schein: S; tage: number }>,
  stunden: Array<{ stunden: H; tage: number }>,
): Array<OffeneBaustelle<S, H>> {
  const nach = new Map<string, OffeneBaustelle<S, H>>();
  const holen = (nummer: string, kunde: string) => {
    const k = baustelleNorm(nummer);
    let b = nach.get(k);
    if (!b) {
      b = { projectNumber: nummer, kunde, scheine: [], aeltesterSchein: null, stunden: null, tage: 0 };
      nach.set(k, b);
    }
    if (!b.kunde && kunde) b.kunde = kunde;
    return b;
  };
  for (const z of scheine) {
    const b = holen(z.schein.projectNumber, z.schein.customerName ?? '');
    b.scheine.push(z.schein);
    if (!b.aeltesterSchein || z.schein.datum < b.aeltesterSchein) b.aeltesterSchein = z.schein.datum;
    b.tage = Math.max(b.tage, z.tage);
  }
  for (const z of stunden) {
    const b = holen(z.stunden.projectNumber, z.stunden.kunde);
    b.stunden = z.stunden;
    b.tage = Math.max(b.tage, z.tage);
  }
  return [...nach.values()].sort((a, b) => b.tage - a.tage || a.projectNumber.localeCompare(b.projectNumber));
}

/** Wie viele davon schon auffällig lange offen sind. */
export function auffaellige<Z extends { tage: number }>(zeilen: Z[]): Z[] {
  return zeilen.filter((z) => z.tage >= AUFFAELLIG_AB_TAGEN);
}

/**
 * Regiebaustellen mit gebuchten, noch nicht verrechneten Stunden (23.10.2026).
 *
 * DIE ZWEITE HÄLFTE VON „NICHT VERRECHNET“. Eine Baustelle über Wochen hat
 * nicht für jede Buchung einen Schein; die Rechnung nimmt diese Stunden
 * längst, aufgefallen sind sie aber nirgends. Gemessen wird am ÄLTESTEN
 * offenen Tag — dieselbe Frist wie bei den Scheinen (`AUFFAELLIG_AB_TAGEN`).
 * Älteste zuerst.
 */
export function unverrechneteStundenZeilen<S extends { aeltester: string }>(
  baustellen: S[],
  heute: string,
): Array<{ stunden: S; tage: number }> {
  return baustellen
    .map((stunden) => ({ stunden, tage: tageZwischen(stunden.aeltester, heute) }))
    .sort((a, b) => b.tage - a.tage);
}
