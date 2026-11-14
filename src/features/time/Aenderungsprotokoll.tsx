import { useState } from 'react';
import { LotVerlauf } from '@/components/LotBausteine';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import Icon from '@/components/Icon';
import { alleAusblenden, alleZeigen, einenAusblenden, istAusgeblendet, lesen, type Ausgeblendet } from '@/lib/ausgeblendet';
import { datumAT } from '@/lib/datum';
import type { VerlaufZeile } from '@/lib/db/zeitbuchungVerlauf';
import { PROTOKOLL_SEIT, verlaufEintrag } from './verlaufText';
import type { ZeitfeldAnzeige } from '@/lib/zeitfelder';

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
  felder = [],
  ausblendbar,
}: {
  titel: string;
  /** Holt die Zeilen — erst beim ersten Aufklappen. Die Kennung (`id`) braucht nur, wer ausblenden lässt. */
  laden: () => Promise<(VerlaufZeile & { id?: string })[]>;
  /** Über mehrere Buchungen: dann steht der Tag der Buchung vor jeder Zeile. */
  mitTag?: boolean;
  /** `pf`: im Fenster einer Person, wie „Abwesenheiten und Zeitkonto“ darüber. */
  stil?: 'weiteres' | 'pf';
  /** Die Definitionen der freien Zeitfelder — damit `feld:<Kennung>` mit Namen dasteht (M06b). */
  felder?: readonly ZeitfeldAnzeige[];
  /**
   * EINTRÄGE WEGKLICKEN (14.11.2026, Auftrag: „die Meldungen beim
   * Änderungsprotokoll sollte man weg-x-en können“). Nur in der eigenen
   * Übersicht, die man wie Mitteilungen liest — nie im Verlauf einer Buchung
   * oder im Fenster des Büros, dort ist das Protokoll die Aufzeichnung.
   * Ausgeblendet wird auf diesem Gerät (`lib/ausgeblendet.ts`), gelöscht nichts.
   */
  ausblendbar?: { liste: string; uid: string };
}) {
  const [zeilen, setZeilen] = useState<(VerlaufZeile & { id?: string })[] | null>(null);
  const [aus, setAus] = useState<Ausgeblendet>(() => (ausblendbar ? lesen(ausblendbar.liste, ausblendbar.uid) : { bis: 0, einzeln: {} }));
  const [ausgeblendeteZeigen, setAusgeblendeteZeigen] = useState(false);
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

  // Ohne Kennung aus der Datenbank (ältere Aufrufer) ein Schlüssel aus Buchung, Zeitpunkt und Art.
  const kennung = (z: VerlaufZeile & { id?: string }) => z.id ?? `${z.eintragId}:${z.am}:${z.art}`;
  const weg = (z: VerlaufZeile & { id?: string }) => !!ausblendbar && istAusgeblendet(aus, kennung(z), z.am);
  const sichtbar = zeilen ? (ausgeblendeteZeigen ? zeilen : zeilen.filter((z) => !weg(z))) : null;
  const zahlWeg = zeilen ? zeilen.filter(weg).length : 0;

  return (
    <details
      className={stil === 'pf' ? 'pf-kontodetails' : 'weiteres'}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && stand === 'zu') holen();
      }}
    >
      <summary className="weiteres-kopf">{titel}</summary>
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
            {ausblendbar && (zahlWeg > 0 || (sichtbar?.length ?? 0) > 1) && (
              <p className="protokoll-ausgeblendet">
                {zahlWeg > 0 && (
                  <>
                    <span>{zahlWeg === 1 ? '1 Eintrag' : `${zahlWeg} Einträge`} auf diesem Gerät ausgeblendet</span>
                    <button type="button" className="link" onClick={() => setAusgeblendeteZeigen((x) => !x)}>
                      {ausgeblendeteZeigen ? 'wieder verbergen' : 'zeigen'}
                    </button>
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setAus(alleZeigen(ausblendbar.liste, ausblendbar.uid));
                        setAusgeblendeteZeigen(false);
                      }}
                    >
                      alle wieder einblenden
                    </button>
                  </>
                )}
                {!ausgeblendeteZeigen && (sichtbar?.length ?? 0) > 1 && (
                  <button
                    type="button"
                    className="link"
                    // Der neueste sichtbare Eintrag ist die Grenze: was danach kommt, steht wieder da.
                    onClick={() => setAus(alleAusblenden(ausblendbar.liste, ausblendbar.uid, Math.max(...sichtbar!.map((z) => z.am))))}
                  >
                    alle ausblenden
                  </button>
                )}
              </p>
            )}
            {sichtbar && sichtbar.length === 0 && (
              <p className="text-sm text-ink-muted">Alle Einträge sind ausgeblendet. Neue Änderungen erscheinen hier wieder.</p>
            )}
            <LotVerlauf
              name={titel}
              punkte={(sichtbar ?? []).map((z) => {
                const e = verlaufEintrag(z, felder);
                const titelText = mitTag ? `Buchung vom ${datumAT(z.datum)} · ${e.titel}` : e.titel;
                return {
                  schluessel: kennung(z),
                  titel: titelText,
                  zeit: e.zeit,
                  text: (
                    <ul className="verlauf-angaben">
                      {e.zeilen.map((l) => <li key={l}>{l}</li>)}
                    </ul>
                  ),
                  aktion: ausblendbar && !weg(z) ? (
                    <IconButton
                      label={`Ausblenden: ${titelText}`}
                      onClick={() => setAus(einenAusblenden(ausblendbar.liste, ausblendbar.uid, kennung(z), z.am))}
                    >
                      <Icon name="schliessen" size={18} />
                    </IconButton>
                  ) : undefined,
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
