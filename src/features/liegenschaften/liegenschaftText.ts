/**
 * Liegenschaften, Tops, Beteiligte (M02c, A09) in Worten — und die
 * Vorschläge beim Anlegen einer Baustelle. Reine Rechnung ohne Oberfläche,
 * damit sie einzeln prüfbar ist (`tests/unit/liegenschaftText.test.ts`).
 */
import { todayStr } from '@/lib/time';
import type { BeteiligtenRolle, Customer, Liegenschaft, LiegenschaftBeteiligter, LiegenschaftTop } from '@/types';

/** Dieselben Wörter wie `app.beteiligter_rolle_text` in der Datenbank. */
export const ROLLE_TEXT: Record<BeteiligtenRolle, string> = {
  eigentuemer: 'Eigentümer',
  hausverwaltung: 'Hausverwaltung',
  betreiber: 'Betreiber',
  nutzer: 'Nutzer bzw. Mieter',
  auftraggeber: 'Auftraggeber',
  rechnungsempfaenger: 'Rechnungsempfänger',
  versicherung: 'Versicherung',
  lieferadresse: 'Lieferadresse',
};

/** „Wohnhausanlage Hauptstraße 12 · Top 5“ — was an Baustelle, Wartung und Eingang steht. */
export function liegenschaftZeile(x: { liegenschaftBezeichnung?: string | null; topBezeichnung?: string | null }): string {
  return [x.liegenschaftBezeichnung?.trim(), x.topBezeichnung?.trim()].filter(Boolean).join(' · ');
}

/** Ein Top mit Lage, wie es in der Wahl steht: „Top 5 (2. OG)“. */
export function topText(t: Pick<LiegenschaftTop, 'bezeichnung' | 'lage'>): string {
  return t.lage?.trim() ? `${t.bezeichnung} (${t.lage.trim()})` : t.bezeichnung;
}

/** Der Name eines Beteiligten — der des Kunden oder die freie Angabe. */
export function beteiligterName(
  b: Pick<LiegenschaftBeteiligter, 'customerId' | 'name'>,
  kunden: ReadonlyMap<string, Pick<Customer, 'name'>>,
): string {
  if (b.customerId) return kunden.get(b.customerId)?.name ?? 'Kunde (wird geladen)';
  return b.name?.trim() || 'ohne Namen';
}

/**
 * Gilt der Beteiligte am Tag `heute`? Ohne Zeitraum immer. Ein ausgezogener
 * Mieter (gültig bis gestern) steht in der Akte unter „Früher“ — mit dem
 * Angebot, ihn zu entfernen; geraten wird nichts.
 */
export function giltAm(b: Pick<LiegenschaftBeteiligter, 'gueltigAb' | 'gueltigBis'>, heute: string): boolean {
  if (b.gueltigAb && b.gueltigAb > heute) return false;
  if (b.gueltigBis && b.gueltigBis < heute) return false;
  return true;
}

/** Der Zeitraum in Worten: „seit 01.03.2026“, „bis 31.10.2026“ — leer ohne Angabe. */
/**
 * Der Zeitraum eines Beteiligten in Worten. Ein Beginn in der Zukunft heisst
 * „ab“, nicht „seit“: ein neuer Mieter „seit 01.12.“ lese sich, als wohne er
 * schon dort (09.11.2026, mit der Gruppe „Künftig“).
 */
export function zeitraumText(
  b: Pick<LiegenschaftBeteiligter, 'gueltigAb' | 'gueltigBis'>,
  datum: (iso: string) => string,
  heute: string = todayStr(),
): string {
  if (b.gueltigAb && b.gueltigBis) return `${datum(b.gueltigAb)} – ${datum(b.gueltigBis)}`;
  if (b.gueltigAb) return `${b.gueltigAb > heute ? 'ab' : 'seit'} ${datum(b.gueltigAb)}`;
  if (b.gueltigBis) return `bis ${datum(b.gueltigBis)}`;
  return '';
}

/**
 * IN DIESER REIHENFOLGE WIRD EIN KUNDE VORGESCHLAGEN: wer die Rechnung
 * bekommt, dann wer beauftragt, dann die Hausverwaltung. Rechnungen gehen
 * an den Kunden der Baustelle (wie bisher) — deshalb steht der
 * Rechnungsempfänger vorn, wenn er ein Kunde ist.
 */
export const KUNDEN_VORRANG: readonly BeteiligtenRolle[] = ['rechnungsempfaenger', 'auftraggeber', 'hausverwaltung'];

export interface KundenVorschlag {
  customerId: string;
  rolle: BeteiligtenRolle;
  /** Am Top eingetragen (statt an der ganzen Liegenschaft). */
  amTop: boolean;
}

export interface AnsprechpartnerVorschlag {
  name: string;
  telefon: string;
}

export interface Vorschlaege {
  /** Kunden in der Reihenfolge des Vorrangs, jeder nur einmal. */
  kunden: KundenVorschlag[];
  /** Nutzer bzw. Mieter des gewählten Tops — für „Ansprechpartner vor Ort“. */
  ansprechpartner: AnsprechpartnerVorschlag | null;
  /** Die Anschrift der Liegenschaft — für die Baustellenadresse. */
  adresse: string | null;
}

/**
 * DIE VORSCHLÄGE BEIM ANLEGEN EINER BAUSTELLE MIT LIEGENSCHAFT (M02c).
 *
 * - Kunde: Beteiligte, die Kunden sind, an der Liegenschaft oder am
 *   gewählten Top, die heute gelten — Rechnungsempfänger, Auftraggeber,
 *   Hausverwaltung, und innerhalb einer Rolle der am Top vor dem am Haus.
 * - Ansprechpartner: der Nutzer bzw. Mieter des Tops, der heute gilt
 *   (freie Angaben, sonst Name und Telefon des Kunden).
 * - Adresse: die Anschrift der Liegenschaft.
 *
 * Es bleibt Vorschlag: übernommen wird nur auf Klick.
 */
export function vorschlaege(
  l: Pick<Liegenschaft, 'anschrift'> | null,
  topId: string | null | undefined,
  beteiligte: readonly LiegenschaftBeteiligter[],
  kunden: ReadonlyMap<string, Pick<Customer, 'name' | 'contactPhone'>>,
  heute: string,
): Vorschlaege {
  const passend = beteiligte.filter((b) => giltAm(b, heute) && (!b.topId || b.topId === topId));
  const kandidaten = passend
    .filter((b): b is LiegenschaftBeteiligter & { customerId: string } => !!b.customerId && KUNDEN_VORRANG.includes(b.rolle))
    .map((b) => ({ customerId: b.customerId, rolle: b.rolle, amTop: !!b.topId }))
    .sort((a, b) => KUNDEN_VORRANG.indexOf(a.rolle) - KUNDEN_VORRANG.indexOf(b.rolle) || Number(b.amTop) - Number(a.amTop));
  // Jeder Kunde nur einmal — mit seiner vordersten Rolle.
  const kundenVorschlaege: KundenVorschlag[] = [];
  for (const k of kandidaten) if (!kundenVorschlaege.some((v) => v.customerId === k.customerId)) kundenVorschlaege.push(k);

  const nutzer = topId ? passend.find((b) => b.rolle === 'nutzer' && b.topId === topId) : undefined;
  let ansprechpartner: AnsprechpartnerVorschlag | null = null;
  if (nutzer) {
    const k = nutzer.customerId ? kunden.get(nutzer.customerId) : undefined;
    const name = (nutzer.customerId ? k?.name : nutzer.name)?.trim() ?? '';
    const telefon = (nutzer.customerId ? k?.contactPhone : nutzer.telefon)?.trim() ?? '';
    if (name || telefon) ansprechpartner = { name, telefon };
  }
  return { kunden: kundenVorschlaege, ansprechpartner, adresse: l?.anschrift?.trim() || null };
}

/** Was vor dem Speichern einer Liegenschaft fehlt — sonst `null`. */
export function liegenschaftFehler(f: { bezeichnung: string }): string | null {
  if (!f.bezeichnung.trim()) return 'Bitte eine Bezeichnung angeben, etwa „Wohnhausanlage Hauptstraße 12“.';
  return null;
}

/** Was vor dem Speichern eines Beteiligten fehlt — sonst `null`. */
export function beteiligterFehler(f: {
  rolle: string; art: 'kunde' | 'frei'; customerId: string; name: string; gueltigAb: string; gueltigBis: string;
}): string | null {
  if (!f.rolle) return 'Bitte die Rolle wählen.';
  if (f.art === 'kunde' && !f.customerId) return 'Bitte einen Kunden wählen — oder die Angaben frei eintragen.';
  if (f.art === 'frei' && !f.name.trim()) return 'Bitte einen Namen angeben.';
  if (f.gueltigAb && f.gueltigBis && f.gueltigBis < f.gueltigAb) return '„Gültig bis“ liegt vor „gültig ab“ — bitte die Daten prüfen.';
  return null;
}

/**
 * Was beim Speichern an Liegenschaft und Top mitgeht: nichts, wenn sich
 * nichts geändert hat (eine bestehende Zuordnung bleibt, wie sie ist — auch
 * wenn die Unterfähigkeit inzwischen aus ist), sonst beide, leer als `null`
 * (lösen). Ein Top ohne Liegenschaft gibt es nicht.
 */
export function zuordnungAenderung(
  neu: { liegenschaftId: string; topId: string },
  alt: { liegenschaftId?: string | null; topId?: string | null } | null | undefined,
): { liegenschaftId?: string | null; topId?: string | null } {
  const l = neu.liegenschaftId || null;
  const t = (l && neu.topId) || null;
  if (l === (alt?.liegenschaftId ?? null) && t === (alt?.topId ?? null)) return {};
  return { liegenschaftId: l, topId: t };
}
