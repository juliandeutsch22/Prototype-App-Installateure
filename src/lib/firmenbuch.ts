import type { Company } from '@/types';

/**
 * FIRMENBUCH AUF DEN BELEGEN (Runde 3, M8; § 14 UGB).
 *
 * Wer im Firmenbuch steht — GmbH, AG, KG, OG, eingetragenes Unternehmen —,
 * muss auf Geschäftsbriefen und Rechnungen Firmenbuchnummer und
 * Firmenbuchgericht nennen. Die Belege zeigten nur „FN 123456a“, das Gericht
 * fehlte, und nichts sagte es.
 *
 * Die Rechtsform steht in keinem eigenen Feld; sie steht im Namen des
 * Betriebs, so wie er im Firmenbuch eingetragen ist. Ein Einzelunternehmer
 * ohne Eintragung trägt keine — dann verlangt hier nichts etwas.
 */
/*
  DIE MUSTER STEHEN AUCH IN DER DATENBANK (`app.firmenbuch_pflichtform`,
  `app.firmenbuch_gesperrt`, Runde 7, 6.1) — dort halten sie den Haken fest,
  wenn jemand an der App vorbei schreibt. `tests/supabase/firmenbuchHaken.test.ts`
  vergleicht beide Fassungen; wer hier ein Muster ändert, ändert es dort mit.
  Groß und klein zählen nicht — so hat die App es immer gelesen.
*/
const VOR = String.raw`(?:^|[\s,])`;
const NACH = String.raw`(?=$|[\s,.&])`;
const muster = (kern: string) => new RegExp(`${VOR}(?:${kern})${NACH}`, 'i');

/**
 * Rechtsformen, die es nur mit Eintragung gibt, mit ihrem Wort für den Satz
 * „Eine … ist immer im Firmenbuch eingetragen“. Die Reihenfolge zählt:
 * „GmbH & Co KG“ vor „GmbH“, sonst hieße es „Eine GmbH“.
 */
const PFLICHTFORMEN: [string, RegExp][] = [
  ['GmbH & Co KG', muster(String.raw`GmbH\s*(?:&|und)\s*Co\.?\s*KG`)],
  ['GmbH', muster(String.raw`GmbH|Ges\.?\s?m\.?\s?b\.?\s?H\.?`)],
  ['FlexCo', muster('FlexCo')],
  ['FlexKapG', muster('FlexKapG')],
  ['AG', muster('AG')],
  ['SE', muster('SE')],
  ['KG', muster('KG')],
  ['OG', muster('OG')],
  ['Genossenschaft', muster(String.raw`eGen|eingetragene\s+Genossenschaft`)],
];

/** Das eingetragene Einzelunternehmen — eingetragen, aber nicht von der Rechtsform her zwingend erkennbar. */
const EINGETRAGENES_UNTERNEHMEN = muster(String.raw`e\.\s?U\.`);

/** „in Gründung“ / „i. G.“ — auch in Klammern. */
const IN_GRUENDUNG = /(?:^|[\s,(])(?:in\s+Gründung|i\.\s?G\.?)(?=$|[\s,.)])/i;

/** Die Rechtsform im Namen, die es nur mit Eintragung gibt — oder `null`. */
export function firmenbuchPflichtform(name: string | null | undefined): string | null {
  const n = name ?? '';
  return PFLICHTFORMEN.find(([, m]) => m.test(n))?.[0] ?? null;
}

/**
 * IST DER HAKEN FEST? (Testbericht Runde 7, 6.1) Bei einer GmbH, AG, KG …
 * gibt es keinen richtigen Fall ohne Eintragung — abgewählt schaltete der
 * Haken nur die Mahnung zu Firmenbuchnummer und -gericht ab. Ausnahme: der
 * Betrieb ist erst in Gründung. Liefert die Rechtsform für den Satz neben
 * dem Haken, sonst `null` (frei wählbar).
 */
export function firmenbuchGesperrt(name: string | null | undefined): string | null {
  return inGruendung(name) ? null : firmenbuchPflichtform(name);
}

/** Steht „in Gründung“ / „i. G.“ im Namen? */
export function inGruendung(name: string | null | undefined): boolean {
  return IN_GRUENDUNG.test(name ?? '');
}

/** Steht der Betrieb laut Namen im Firmenbuch? */
export function imFirmenbuch(name: string | null | undefined): boolean {
  return firmenbuchPflichtform(name) !== null || EINGETRAGENES_UNTERNEHMEN.test(name ?? '');
}

/**
 * Steht der Betrieb im Firmenbuch? Die eigene Angabe der Firmendaten zählt
 * (A12, 24.10.2026) — ein eingetragenes Einzelunternehmen muss „e.U.“ nicht
 * im Namen tragen, wo die App es suchte. Ohne Angabe die Rechtsform im Namen.
 */
export function firmenbuchEingetragen(company: Pick<Company, 'name' | 'imFirmenbuch'> | null | undefined): boolean {
  if (!company) return false;
  // Fest bei GmbH, AG, KG … (Runde 7, 6.1): ein abgewählter Altwert zählt nicht.
  if (firmenbuchGesperrt(company.name)) return true;
  return company.imFirmenbuch ?? imFirmenbuch(company.name);
}

/** Was für § 14 UGB fehlt — leer, wenn alles da ist oder der Betrieb nicht im Firmenbuch steht. */
export function firmenbuchFehlt(
  company: Pick<Company, 'name' | 'companyRegister' | 'firmenbuchgericht' | 'imFirmenbuch'> | null | undefined,
): string[] {
  if (!company || !firmenbuchEingetragen(company)) return [];
  const fehlt: string[] = [];
  if (!company.companyRegister?.trim()) fehlt.push('Firmenbuchnummer');
  if (!company.firmenbuchgericht?.trim()) fehlt.push('Firmenbuchgericht');
  return fehlt;
}

/**
 * Die Zeile im Belegfuß: „FN 123456a, Landesgericht Wiener Neustadt“. Ohne
 * „FN“ eingetragen, wird es davorgesetzt.
 */
export function firmenbuchZeile(company: Pick<Company, 'companyRegister' | 'firmenbuchgericht'>): string {
  const roh = company.companyRegister?.trim() ?? '';
  const fn = roh && !/^FN\b/i.test(roh) ? `FN ${roh}` : roh;
  const gericht = company.firmenbuchgericht?.trim() ?? '';
  return [fn, gericht].filter(Boolean).join(', ');
}
