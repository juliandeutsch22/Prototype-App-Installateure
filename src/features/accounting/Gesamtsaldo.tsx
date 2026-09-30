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
export default function Gesamtsaldo({ profil, halbeTage }: { profil: AppUser; halbeTage: boolean }) {
  const [stand, setStand] = useState<{ saldoH: number } | 'laedt' | 'fehler'>('laedt');

  useEffect(() => {
    let weg = false;
    setStand('laedt');
    zeitguthabenLaden(profil, halbeTage)
      .then((r) => { if (!weg) setStand({ saldoH: r.saldoH }); })
      .catch(() => { if (!weg) setStand('fehler'); });
    return () => { weg = true; };
  }, [profil, halbeTage]);

  if (!profil.appStartDate) return null;
  const start = Number(profil.initialOvertime ?? 0) || 0;
  const zeichen = (min: number) => `${min > 0 ? '+' : ''}${fmtMin(min)}`;

  return (
    <p className="mt-1.5 text-sm text-ink-muted" data-testid="gesamtsaldo">
      {stand === 'laedt' ? (
        'Gesamtsaldo wird geladen …'
      ) : stand === 'fehler' ? (
        'Der Gesamtsaldo konnte nicht geladen werden.'
      ) : (
        <>
          Gesamtsaldo seit {datumAT(profil.appStartDate)}:{' '}
          <b className="font-semibold text-ink">{zeichen(Math.round(stand.saldoH * 60))}</b>
          {start !== 0 && <> · darin Start-Saldo {zeichen(Math.round(start * 60))}</>}
        </>
      )}
    </p>
  );
}
