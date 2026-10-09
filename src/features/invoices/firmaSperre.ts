import { ibanFehler } from '@shared/iban';
import type { Company } from '@/types';

/**
 * WAS AN DEN FIRMENDATEN JEDE NEUE RECHNUNG SPERRT.
 *
 * Eine Stelle für den Knopf „Rechnung erstellen“ und die Startseite (Testbericht
 * Runde 5, M2): dort stand die Sperre leise unter „Diese Woche“, während keine
 * einzige Rechnung entstehen konnte. Getrennt geprüft, liefen beide früher
 * oder später auseinander.
 *
 * Nur, was wirklich sperrt: die Anschrift (ohne sie hat die Rechnung keinen
 * Aussteller) und eine IBAN, die es so nicht geben kann (die Datenbank weist
 * sie ebenso ab, `invoices_iban`). Eine FEHLENDE IBAN sperrt nicht — manche
 * Betriebe kassieren bar —, das Firmenbuch auch nicht: beides ist eine Warnung.
 */
export function firmaSperrtRechnung(company: Pick<Company, 'addressLine' | 'iban'> | null | undefined): string[] {
  const sperrt: string[] = [];
  if (!company?.addressLine?.trim()) sperrt.push('Anschrift');
  if (ibanFehler(company?.iban)) sperrt.push('gültige IBAN');
  return sperrt;
}
