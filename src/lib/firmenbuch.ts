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
const RECHTSFORM = /(?:^|[\s,])(?:GmbH|Ges\.?\s?m\.?\s?b\.?\s?H\.?|AG|KG|OG|e\.\s?U\.|FlexCo|FlexKapG|SE|eGen)(?=$|[\s,.&])/i;

/** Steht der Betrieb laut Namen im Firmenbuch? */
export function imFirmenbuch(name: string | null | undefined): boolean {
  return RECHTSFORM.test(name ?? '');
}

/**
 * Steht der Betrieb im Firmenbuch? Die eigene Angabe der Firmendaten zählt
 * (A12, 24.10.2026) — ein eingetragenes Einzelunternehmen muss „e.U.“ nicht
 * im Namen tragen, wo die App es suchte. Ohne Angabe die Rechtsform im Namen.
 */
export function firmenbuchEingetragen(company: Pick<Company, 'name' | 'imFirmenbuch'> | null | undefined): boolean {
  if (!company) return false;
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
