import type { AppUser } from '@/types';
import { bilanzMarker, listBilanzen, listBilanzenAlle, monatVon } from '@/lib/db/monatsbilanzen';
import { listEntriesInRange, listOwnEntriesInRange, listOwnEntriesSince } from '@/lib/db/timeEntries';
import {
  calcOverallSaldo, hatTagessoll, localDateStr, monatsLetzter, saldoAusBilanzen, type SaldoResult,
} from '@/lib/time';

/**
 * Das eigene Zeitguthaben — dieselbe Zahl, die die Zeiterfassung zeigt.
 *
 * Für den ZA-Antrag: wer vier Stunden frei nehmen will, soll sehen, ob sein
 * Guthaben das trägt. DIESELBE WAHL DES WEGES wie in `TimeView`: aus den
 * Monatsbilanzen, wenn sie bis zum Eintritt zurückreichen, sonst aus allen
 * Einträgen seit dem Eintritt. Der laufende Monat kommt immer aus den
 * Einträgen — dort hinkt die Bilanz sonst der letzten Buchung hinterher.
 */
export async function zeitguthabenLaden(profil: AppUser, halbeTage: boolean): Promise<SaldoResult> {
  if (!profil.appStartDate) return calcOverallSaldo(profil, [], halbeTage);
  const eintritt = profil.appStartDate;
  const marker = await bilanzMarker(profil.companyId, profil.uid).catch(() => null);
  // Mit eigenem Tagessoll je Wochentag (M5) reichen die Bilanzen nicht — siehe TimeView.
  if (marker && marker.vollstaendigAb <= monatVon(eintritt) && !hatTagessoll(profil)) {
    const jetzt = new Date();
    const monatsErster = localDateStr(new Date(jetzt.getFullYear(), jetzt.getMonth(), 1));
    const [bilanzen, laufend, eintrittsmonat] = await Promise.all([
      listBilanzen(profil.companyId, profil.uid, monatVon(eintritt)),
      listOwnEntriesSince(profil.companyId, profil.uid, monatsErster),
      // Der Eintrittsmonat ab dem Eintritt — seine Bilanz zählt auch Tage
      // davor (Prüflauf 25.09.2026, P1-15).
      listOwnEntriesInRange(profil.companyId, profil.uid, eintritt, monatsLetzter(eintritt)),
    ]);
    return saldoAusBilanzen(profil, bilanzen, laufend, halbeTage, eintrittsmonat);
  }
  return calcOverallSaldo(
    profil,
    await listOwnEntriesSince(profil.companyId, profil.uid, eintritt),
    halbeTage,
  );
}

/**
 * DER GESAMTSALDO ALLER KONTEN AUF EINMAL — für die Spalte „Gesamtsaldo“ der
 * Mitarbeiterübersicht (19.10.2026). Bis dahin stand er erst im Fenster einer
 * Person; wer Zeitausgleich plant oder Überstunden abbauen lässt, will die
 * Konten nebeneinander sehen.
 *
 * DIESELBE RECHNUNG wie `zeitguthabenLaden`, nur gebündelt geholt: die
 * Bilanzen aller Personen in einer Abfrage, der laufende Monat in einer, die
 * Eintrittsmonate in einer je Monat — statt drei Abfragen je Person. Wer ein
 * eigenes Tagessoll je Wochentag trägt, geht wie dort einzeln über alle
 * Buchungen seit dem Eintritt; die Bilanzen reichen dafür nicht. Ohne
 * Eintrittsdatum gibt es keinen Saldo und keinen Eintrag in der Karte.
 */
export async function gesamtsaldenLaden(
  companyId: string,
  personen: AppUser[],
  halbeTage: boolean,
): Promise<Map<string, number>> {
  const mitEintritt = personen.filter((p): p is AppUser & { appStartDate: string } => !!p.appStartDate);
  const einzeln = mitEintritt.filter((p) => hatTagessoll(p));
  const gebuendelt = mitEintritt.filter((p) => !hatTagessoll(p));
  const salden = new Map<string, number>();

  const einzelne = Promise.all(
    einzeln.map(async (p) => salden.set(p.uid, (await zeitguthabenLaden(p, halbeTage)).saldoH)),
  );
  if (gebuendelt.length > 0) {
    const jetzt = new Date();
    const monatsErster = localDateStr(new Date(jetzt.getFullYear(), jetzt.getMonth(), 1));
    const abMonat = gebuendelt.map((p) => monatVon(p.appStartDate)).sort()[0];
    // Je Eintrittsmonat ab dem frühesten Eintritt darin bis zum Monatsende.
    const monate = new Map<string, string>();
    for (const p of gebuendelt) {
      const m = monatVon(p.appStartDate);
      if (!monate.has(m) || p.appStartDate < monate.get(m)!) monate.set(m, p.appStartDate);
    }
    const [bilanzen, laufend, ...eintrittsmonate] = await Promise.all([
      listBilanzenAlle(companyId, abMonat),
      listEntriesInRange(companyId, monatsErster, '9999-12-31'),
      ...[...monate.values()].map((ab) => listEntriesInRange(companyId, ab, monatsLetzter(ab))),
    ]);
    const imEintrittsmonat = eintrittsmonate.flat();
    for (const p of gebuendelt) {
      const eintritt = p.appStartDate;
      const ende = monatsLetzter(eintritt);
      salden.set(
        p.uid,
        saldoAusBilanzen(
          p,
          bilanzen.filter((b) => b.userId === p.uid && b.monat >= monatVon(eintritt)),
          laufend.filter((e) => e.userId === p.uid),
          halbeTage,
          imEintrittsmonat.filter((e) => e.userId === p.uid && e.date >= eintritt && e.date <= ende),
        ).saldoH,
      );
    }
  }
  await einzelne;
  return salden;
}
