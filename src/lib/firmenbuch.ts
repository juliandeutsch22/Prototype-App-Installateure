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

/** Was für § 14 UGB fehlt — leer, wenn alles da ist oder der Betrieb nicht im Firmenbuch steht. */
export function firmenbuchFehlt(company: Pick<Company, 'name' | 'companyRegister' | 'firmenbuchgericht'> | null | undefined): string[] {
  if (!company || !imFirmenbuch(company.name)) return [];
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
