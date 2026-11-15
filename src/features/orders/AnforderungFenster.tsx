import { useState } from 'react';
import type { WithId } from '@/lib/db/core';
import type { MaterialOrder } from '@/types';
import ZahlFeld from '@/components/ZahlFeld';
import { ErrorState } from '@/components/States';
import { zahlOder, zahlAlsText } from '@/lib/zahl';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import StatusBadge from '@/components/StatusBadge';
import { Warnung } from '@/components/Badge';
import { fmtMenge } from '@/lib/belegLayout';
import { eiligMoeglich } from './eilig';
import { anforderungAenderbar } from './anforderungStand';
import { grundAus } from '@/lib/fehlerGrund';

/**
 * EINE ANFORDERUNG IM SEITENFENSTER (C7, E89): die Zeile unter „Meine
 * Anforderungen“ trägt nur noch Stand und „Abgeholt“ — „Eilig“ stand dort
 * als dritter Knopf in einer Reihe und machte jede Zeile am Handy zweizeilig.
 * Hier steht alles zur Anforderung, dazu „Als eilig markieren“, solange das
 * geht (`eiligMoeglich`, dieselbe Bedingung wie in der Datenbank).
 *
 * ÄNDERN UND ZURÜCKZIEHEN (M5, 16.11.2026): solange das Lager nicht
 * entschieden hat, woher das Material kommt, korrigiert der Besteller die
 * Menge (30 statt 3) oder zieht die Anforderung zurück — dieselbe Grenze wie
 * in der Datenbank (`anforderungAenderbar`). Vorher ging beides nicht, und
 * „Abgeholt“ buchte den Tippfehler.
 */
export default function AnforderungFenster({
  o,
  wasLaeuft,
  onEilig,
  onAbgeholt,
  onMengeAendern,
  onZurueckziehen,
  onClose,
}: {
  o: WithId<MaterialOrder>;
  /** Warum es dauert (beim Großhändler bestellt …) — dieselbe Zeile wie in der Liste. */
  wasLaeuft: string;
  onEilig: () => void;
  onAbgeholt: () => void;
  /** Neue Menge speichern — `false`: inzwischen in Arbeit. Wirft mit Grund. */
  onMengeAendern?: (menge: number) => Promise<boolean>;
  /** Zurückziehen — `false`: inzwischen in Arbeit. Wirft mit Grund. */
  onZurueckziehen?: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [art, setArt] = useState<'zeigen' | 'menge' | 'zurueck'>('zeigen');
  const [menge, setMenge] = useState(() => zahlAlsText(o.quantity));
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const aenderbar = anforderungAenderbar(o) && !!onMengeAendern && !!onZurueckziehen;

  async function ausfuehren(schritt: () => Promise<boolean>) {
    setLaeuft(true);
    setFehler(null);
    try {
      if (await schritt()) onClose();
      else setFehler('Das Lager hat die Anforderung inzwischen in Arbeit — ändern kann sie jetzt nur das Lager.');
    } catch (e) {
      setFehler(grundAus(e, 'Das hat nicht geklappt.'));
    } finally {
      setLaeuft(false);
    }
  }
  const angaben: [string, string][] = [
    ['Menge', fmtMenge(o.quantity)],
    ['Baustelle', o.projectNumber || 'ohne Baustelle'],
    ...(o.note ? [['Notiz', o.note] as [string, string]] : []),
    ...(wasLaeuft ? [['Beschaffung', wasLaeuft] as [string, string]] : []),
  ];
  return (
    <BottomSheet open onClose={onClose} label={`Anforderung ${o.materialName}`} titel={o.materialName} auchBreit>
      <div className="space-y-4">
        <p className="flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} />
          {o.isUrgent && <Warnung stufe="dringend">Eil</Warnung>}
        </p>
        <dl className="divide-y divide-line">
          {angaben.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2 text-sm">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        {art === 'menge' && (
          <ZahlFeld id="anf-menge" label="Neue Menge" value={menge} onChange={setMenge} />
        )}
        {art === 'zurueck' && (
          <p className="text-fliess">
            Die Anforderung wird zurückgezogen — das Lager bekommt sie nicht mehr zu sehen.
          </p>
        )}
        {fehler && <ErrorState message={fehler} />}
        {art === 'zeigen' ? (
          <div className="fuss-aktionen">
            {aenderbar && (
              <>
                <Button variant="ghost" onClick={() => setArt('zurueck')}>Zurückziehen …</Button>
                <Button variant="ghost" onClick={() => setArt('menge')}>Menge ändern …</Button>
              </>
            )}
            {!o.isUrgent && eiligMoeglich(o) && (
              <Button variant="ghost" onClick={onEilig}>Als eilig markieren</Button>
            )}
            <Button onClick={onAbgeholt}>Abgeholt</Button>
          </div>
        ) : (
          <div className="fuss-aktionen">
            <Button variant="ghost" onClick={() => { setArt('zeigen'); setFehler(null); }}>Abbrechen</Button>
            {art === 'menge' ? (
              <Button
                loading={laeuft}
                onClick={() => {
                  const n = zahlOder(menge, NaN);
                  if (!(n > 0)) {
                    setFehler('Die Menge muss größer als null sein.');
                    return;
                  }
                  void ausfuehren(() => onMengeAendern!(n));
                }}
              >
                Menge speichern
              </Button>
            ) : (
              <Button variant="danger" loading={laeuft} onClick={() => void ausfuehren(() => onZurueckziehen!())}>
                Zurückziehen
              </Button>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
