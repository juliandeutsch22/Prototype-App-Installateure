import type { Company } from '@/types';

/**
 * Die Firmendaten, die auf einem Beleg stehen — Briefkopf, Absender (auch in
 * Teilen, wie die E-Rechnung sie braucht), Bankverbindung, UID, Firmenbuch,
 * Logo.
 *
 * WARUM FESTGEHALTEN (seit 24.10.2026). Ein Beleg muss sich so wieder
 * erzeugen lassen, wie er ausgestellt wurde (§ 132 BAO). Mit den heutigen
 * Firmendaten zeigte der Nachdruck einer alten Rechnung nach einem Umzug
 * oder Bankwechsel etwas anderes als das Original beim Kunden. Die
 * Datenbank hält beim Ausstellen fest, welcher Stand galt
 * (`aussteller_staende`).
 */
export const AUSSTELLER_FELDER = [
  'name', 'addressLine', 'strasse', 'plz', 'ort', 'land', 'contactLine', 'logoUrl', 'bankName',
  'iban', 'bic', 'vatId', 'companyRegister', 'firmenbuchgericht',
] as const;

export type AusstellerAngaben = Partial<Record<(typeof AUSSTELLER_FELDER)[number], string | null>>;

/**
 * Die heutigen Firmendaten mit den Angaben des Belegs darüber.
 *
 * ALLE Felder des Stands gelten, auch die leeren: hatte der Betrieb damals
 * keine Bank eingetragen, zeigt der Nachdruck keine, die erst später kam.
 * Alles andere (Sätze, Einstellungen) kommt wie bisher von heute — es steht
 * nicht als Absender auf dem Beleg.
 *
 * Ohne Stand (Belege von vor dem 24.10.2026, Entwürfe) bleiben die heutigen
 * Daten: welche damals galten, weiß niemand, und erfunden wird nichts.
 */
export function mitAussteller(company: Company, angaben?: AusstellerAngaben | null): Company {
  if (!angaben) return company;
  const raus: Company = { ...company };
  const ziel = raus as unknown as Record<string, unknown>;
  for (const feld of AUSSTELLER_FELDER) {
    const wert = angaben[feld];
    if (wert === null || wert === undefined || wert === '') delete ziel[feld];
    else ziel[feld] = wert;
  }
  // `name` ist Pflicht im Typ; ein Stand ohne Namen kann es nicht geben, der
  // Betrieb hat immer einen. Zur Sicherheit bleibt dann der heutige.
  if (!raus.name) raus.name = company.name;
  return raus;
}
