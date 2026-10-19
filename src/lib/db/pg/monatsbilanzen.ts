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
import { abfragen, derClient, SEITE } from './kern';

const BILANZEN = 'monthly_stats';

export interface Monatsbilanz {
  monat: string;
  anwesendMin: number;
  krankTage: number;
  urlaubTage: number;
  /** Krank- und Urlaubstage am 24. oder 31. Dezember — siehe `tagesAnteil`. */
  abwesendHalbtage: number;
  /** Berufsschultage (4.1) — erfüllen das Tagessoll wie Krank und Urlaub. */
  berufsschuleTage: number;
  /** Ganztägige Freistellungen (Sonderurlaub, Pflege, unbezahlt) — erfüllen das Tagessoll. */
  freistellungTage: number;
  /** Minuten stundenweiser Freistellung — erfüllte Sollzeit, keine Arbeitszeit. */
  freigestelltMin: number;
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
  return rows.map(alsBilanz);
}

function alsBilanz(r: Monatsbilanz): Monatsbilanz {
  return {
    monat: r.monat,
    anwesendMin: Number(r.anwesendMin ?? 0),
    krankTage: Number(r.krankTage ?? 0),
    urlaubTage: Number(r.urlaubTage ?? 0),
    abwesendHalbtage: Number(r.abwesendHalbtage ?? 0),
    berufsschuleTage: Number(r.berufsschuleTage ?? 0),
    freistellungTage: Number(r.freistellungTage ?? 0),
    freigestelltMin: Number(r.freigestelltMin ?? 0),
    tage: r.tage ?? [],
  };
}

/**
 * Die Bilanzen ALLER Personen ab einem Monat, in einer Abfrage — für den
 * Gesamtsaldo in der Mitarbeiterübersicht (19.10.2026). Je Person einzeln
 * wären das bei zwanzig Konten zwanzig Abfragen für eine Spalte. Es kommt
 * nur, was `time_entries_lesen` zeigt: wer die Übersicht sieht, sieht alle
 * Buchungen.
 *
 * ÜBER `monatsbilanzen_alle`, JE PERSON EINE ZEILE (Nachweis mit dreifachem
 * Bestand, 19.10.2026): seitenweise über die Sicht rechnete jede Seite die
 * Bilanzen aller Buchungen neu — acht Seiten zu je fünf Sekunden.
 */
export async function listBilanzenAlle(
  companyId: string,
  abMonat: string,
  seite = SEITE,
): Promise<Array<Monatsbilanz & { userId: string }>> {
  void companyId;
  type Zeile = { user_id: string; bilanzen: Array<Record<string, unknown>> | null };
  const personen: Zeile[] = [];
  for (let ab = 0; ; ab += seite) {
    const { data, error } = await derClient().rpc('monatsbilanzen_alle', { p_ab_monat: abMonat }).range(ab, ab + seite - 1);
    if (error) throw new Error(error.message);
    const teil = (data ?? []) as Zeile[];
    personen.push(...teil);
    if (teil.length < seite) break;
  }
  return personen.flatMap((p) => (p.bilanzen ?? []).map((b) => ({
    ...alsBilanz({
      monat: String(b.monat),
      anwesendMin: b.anwesend_min,
      krankTage: b.krank_tage,
      urlaubTage: b.urlaub_tage,
      abwesendHalbtage: b.abwesend_halbtage,
      berufsschuleTage: b.berufsschule_tage,
      freistellungTage: b.freistellung_tage,
      freigestelltMin: b.freigestellt_min,
      tage: b.tage,
    } as Monatsbilanz),
    userId: p.user_id,
  })));
}
