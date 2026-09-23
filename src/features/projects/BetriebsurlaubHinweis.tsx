import { useEffect, useState } from 'react';
import type { Betriebsurlaub } from '@/types';
import { listBetriebsurlaubeImZeitraum } from '@/lib/db/abwesenheiten';

function tag(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
}

/**
 * Fällt die Baustelle in einen Betriebsurlaub? Dann steht es beim Datum.
 *
 * EIN HINWEIS, KEINE SPERRE: eine Baustelle über Weihnachten kann richtig
 * sein (der Kunde ist verreist, gearbeitet wird davor und danach). Wer sie
 * terminiert, soll es nur nicht übersehen. Scheitert die Abfrage, steht
 * nichts da — das Speichern hängt nicht daran.
 */
export default function BetriebsurlaubHinweis({
  companyId,
  von,
  bis,
}: {
  companyId: string | undefined;
  von: string;
  bis: string;
}) {
  const [treffer, setTreffer] = useState<Betriebsurlaub[]>([]);
  const ende = bis && bis >= von ? bis : von;

  useEffect(() => {
    if (!companyId || !von) {
      setTreffer([]);
      return;
    }
    let weg = false;
    listBetriebsurlaubeImZeitraum(companyId, von, ende)
      .then((r) => {
        if (!weg) setTreffer(r);
      })
      .catch(() => {
        if (!weg) setTreffer([]);
      });
    return () => {
      weg = true;
    };
  }, [companyId, von, ende]);

  if (treffer.length === 0) return null;
  return (
    <p className="rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-warning" role="status">
      Im Zeitraum liegt Betriebsurlaub:{' '}
      {treffer.map((b) => `${b.bezeichnung} (${tag(b.von)}–${tag(b.bis)})`).join(', ')}. Terminieren
      geht trotzdem.
    </p>
  );
}
