/**
 * Monatsbilanzen — auf Postgres eine SICHT, kein Bestand.
 *
 * HIER VERSCHWINDET EIN GANZER NACHTLAUF. In Firestore wurden die Bilanzen
 * nächtlich vorgerechnet und abgelegt; sie konnten deshalb unvollständig
 * sein, und eine fehlende Bilanz war von einem Monat ohne Buchungen nicht zu
 * unterscheiden. Wer sie ungeprüft summierte, bekam einen zu niedrigen Saldo
 * — ohne Fehlermeldung, und die Zahl ging auf den Lohnzettel. Dagegen gab es
 * den Vollständigkeits-Marker und den Rückfall auf die direkte Rechnung.
 *
 * `monthly_stats` ist eine Sicht über `time_entries`. Sie kann nicht
 * unvollständig sein: sie IST die direkte Rechnung, nur in der Datenbank
 * statt im Browser. Der Marker bleibt trotzdem stehen — die Ansicht fragt
 * ihn, und eine Weiche, die unter der einen Datenquelle etwas anderes
 * antwortet als unter der anderen, wäre schlimmer als eine Zeile Code.
 *
 * Der Zeilenschutz greift durch: die Sicht trägt `security_invoker = on`,
 * also sieht ein Monteur seine eigenen Buchungen und die Buchhaltung alle.
 */
import { abfragen } from './kern';

const BILANZEN = 'monthly_stats';

export interface Monatsbilanz {
  monat: string;
  anwesendMin: number;
  krankTage: number;
  urlaubTage: number;
  tage: string[];
}

/** 'YYYY-MM' aus einem ISO-Datum. */
export function monatVon(datum: string): string {
  return datum.slice(0, 7);
}

/**
 * Ab welchem Monat die Bilanzen dieses Mitarbeiters lückenlos vorliegen.
 *
 * IMMER. Eine Sicht rechnet bei jeder Abfrage neu; es gibt keinen Lauf, der
 * ausfallen könnte, und keine Lücke, die entstehen könnte. Der Monat `0000-01`
 * liegt vor jedem echten — die Prüfung der Ansicht („deckt der Marker den
 * Eintrittsmonat ab?") geht damit auf, ohne dass sie etwas von der
 * Datenquelle wissen muss.
 */
export async function bilanzMarker(
  companyId: string,
  uid: string,
): Promise<{ vollstaendigAb: string } | null> {
  void companyId;
  void uid;
  return { vollstaendigAb: '0000-01' };
}

/**
 * Die Bilanzen eines Mitarbeiters ab einem Monat.
 *
 * Begrenzt über die Person und einen Monatsbereich. Die Menge wächst mit den
 * Dienstjahren, aber nur um zwölf Zeilen im Jahr statt um zweihundertzwanzig.
 */
export async function listBilanzen(
  companyId: string,
  uid: string,
  abMonat: string,
): Promise<Monatsbilanz[]> {
  const rows = await abfragen<Monatsbilanz>(BILANZEN, companyId, {
    wo: [
      { art: 'gleich', feld: 'userId', wert: uid },
      { art: 'ab', feld: 'monat', wert: abMonat },
    ],
    sortiere: { feld: 'monat' },
  });
  return rows.map((r) => ({
    monat: r.monat,
    anwesendMin: Number(r.anwesendMin ?? 0),
    krankTage: Number(r.krankTage ?? 0),
    urlaubTage: Number(r.urlaubTage ?? 0),
    tage: r.tage ?? [],
  }));
}
