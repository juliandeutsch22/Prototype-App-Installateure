import { useEffect, useState } from 'react';
import type { AppUser } from '@/types';
import { zeitguthabenLaden } from '@/features/vacations/zeitguthaben';
import { datumAT } from '@/lib/datum';
import { fmtMin } from '@/lib/time';

/**
 * DER GESAMTSALDO NEBEN DEM MONATSSALDO (Testbericht 30.09.2026, M8).
 *
 * Die Mitarbeiterübersicht zeigte nur den Saldo des gewählten Monats. Wie
 * der Stand seit dem Eintritt ist — und wie viel davon der mitgebrachte
 * Start-Saldo ausmacht —, war hier nicht nachzuvollziehen; die Zahl stand
 * nur in der Zeiterfassung der Person selbst.
 *
 * DIESELBE RECHNUNG wie dort (`zeitguthabenLaden`: aus den Monatsbilanzen,
 * wenn sie reichen, sonst aus allen Buchungen seit dem Eintritt). Geladen
 * wird erst beim Aufklappen: für zwanzig Konten auf einmal wären das zwanzig
 * Abfragen, von denen niemand eine angesehen hat.
 */
export default function Gesamtsaldo({
  profil,
  halbeTage,
  saldoH,
}: {
  profil: AppUser;
  halbeTage: boolean;
  /**
   * DIE ZAHL DER SEITE, wenn sie eine hat (Testbericht Runde 6, G7). Selbst
   * geladen wurde nur beim Öffnen: nach dem Löschen eines Eintrags blieb der
   * alte Stand stehen, während die Spalte „Gesamtsaldo“ der Liste daneben
   * schon nachgerechnet hatte. Die Mitarbeiterübersicht holt ihre Salden nach
   * jeder Änderung neu; mit ihrer Zahl zeigen Fenster und Liste dasselbe.
   */
  saldoH?: number | null;
}) {
  const [geladen, setStand] = useState<{ saldoH: number } | 'laedt' | 'fehler'>('laedt');
  // `null`: die Seite holt die Zahl gerade — darauf warten statt doppelt zu laden.
  const vonAussen = saldoH === null || (typeof saldoH === 'number' && Number.isFinite(saldoH));
  const stand = saldoH === null ? 'laedt' : vonAussen ? { saldoH: saldoH as number } : geladen;

  useEffect(() => {
    if (vonAussen) return;
    let weg = false;
    setStand('laedt');
    zeitguthabenLaden(profil, halbeTage)
      .then((r) => { if (!weg) setStand({ saldoH: r.saldoH }); })
      .catch(() => { if (!weg) setStand('fehler'); });
    return () => { weg = true; };
  }, [profil, halbeTage, vonAussen]);

  if (!profil.appStartDate) return null;
  const start = Number(profil.initialOvertime ?? 0) || 0;
  const zeichen = (min: number) => `${min > 0 ? '+' : ''}${fmtMin(min)}`;

  /*
    DER WERT GROSS, „SEIT …“ KLEIN DARUNTER (Testbericht Runde 5, G6): die
    Kennzahl heißt schon „Gesamtsaldo“; „Gesamtsaldo / Gesamtsaldo seit …“
    nannte es zweimal.
  */
  if (stand === 'laedt' || stand === 'fehler') {
    return (
      <p className="pf-kennzahl-text" data-testid="gesamtsaldo">
        {stand === 'laedt' ? 'Gesamtsaldo wird geladen …' : 'Der Gesamtsaldo konnte nicht geladen werden.'}
      </p>
    );
  }
  return (
    <div data-testid="gesamtsaldo">
      <p className="pf-kennzahl-wert text-ink">{zeichen(Math.round(stand.saldoH * 60))}</p>
      <p className="pf-kennzahl-text">
        seit {datumAT(profil.appStartDate)}
        {start !== 0 && <> · darin Start-Saldo {zeichen(Math.round(start * 60))}</>}
      </p>
    </div>
  );
}
