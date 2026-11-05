import { useState } from 'react';
import { LotVerlauf } from '@/components/LotBausteine';
import Button from '@/components/Button';
import { datumAT } from '@/lib/datum';
import type { VerlaufZeile } from '@/lib/db/zeitbuchungVerlauf';
import { PROTOKOLL_SEIT, verlaufEintrag } from './verlaufText';

/**
 * DAS ÄNDERUNGSPROTOKOLL ZUM AUFKLAPPEN (E50, 05.11.2026).
 *
 * Auftrag: „es sollte über einen Klick sichtbar sein und nicht generell auf
 * der Seite, damit nicht zu viel Text entsteht.“ Deshalb zugeklappt, und
 * geladen wird erst beim Aufklappen — eine Liste von Buchungen holt sonst für
 * jede Zeile ein Protokoll, das fast nie jemand ansieht.
 *
 * `<details>` und kein eigener Zustand für das Auf und Zu: Tastatur und
 * Vorlesehilfe macht der Browser richtig (wie `WeitereAngaben`).
 */
export default function Aenderungsprotokoll({
  titel,
  laden,
  mitTag = false,
  stil = 'weiteres',
}: {
  titel: string;
  /** Holt die Zeilen — erst beim ersten Aufklappen. */
  laden: () => Promise<VerlaufZeile[]>;
  /** Über mehrere Buchungen: dann steht der Tag der Buchung vor jeder Zeile. */
  mitTag?: boolean;
  /** `pf`: im Fenster einer Person, wie „Abwesenheiten und Zeitkonto“ darüber. */
  stil?: 'weiteres' | 'pf';
}) {
  const [zeilen, setZeilen] = useState<VerlaufZeile[] | null>(null);
  const [stand, setStand] = useState<'zu' | 'laedt' | 'fehler' | 'da'>('zu');

  const holen = () => {
    setStand('laedt');
    laden()
      .then((z) => {
        setZeilen(z);
        setStand('da');
      })
      .catch(() => setStand('fehler'));
  };

  const ohneAnfang = !mitTag && !!zeilen && zeilen.length > 0 && zeilen[0].art !== 'angelegt';

  return (
    <details
      className={stil === 'pf' ? 'pf-kontodetails' : 'weiteres'}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && stand === 'zu') holen();
      }}
    >
      <summary className={stil === 'pf' ? undefined : 'weiteres-kopf'}>{titel}</summary>
      <div className={stil === 'pf' ? 'pf-text' : 'weiteres-inhalt'}>
        {stand === 'laedt' && <p className="text-sm text-ink-muted">Wird geladen …</p>}
        {stand === 'fehler' && (
          <div className="text-sm">
            <p className="text-danger">Das Änderungsprotokoll ließ sich nicht laden.</p>
            {/* `type="button"`: im Formular einer Buchung schickte der Knopf sonst das Formular ab. */}
            <Button type="button" variant="ghost" onClick={holen}>Erneut versuchen</Button>
          </div>
        )}
        {stand === 'da' && zeilen && zeilen.length === 0 && (
          <p className="text-sm text-ink-muted">
            Keine Änderung aufgezeichnet. Aufgezeichnet wird seit {datumAT(PROTOKOLL_SEIT)}.
          </p>
        )}
        {stand === 'da' && zeilen && zeilen.length > 0 && (
          <>
            <LotVerlauf
              name={titel}
              punkte={zeilen.map((z) => {
                const e = verlaufEintrag(z);
                return {
                  titel: mitTag ? `Buchung vom ${datumAT(z.datum)} · ${e.titel}` : e.titel,
                  zeit: e.zeit,
                  text: (
                    <ul className="verlauf-angaben">
                      {e.zeilen.map((l) => <li key={l}>{l}</li>)}
                    </ul>
                  ),
                };
              })}
            />
            {ohneAnfang && (
              <p className="mt-2 text-xs text-ink-muted">
                Vor dem {datumAT(PROTOKOLL_SEIT)} wurde nichts aufgezeichnet; die erste Änderung zeigt den Stand davor als alten Wert.
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
