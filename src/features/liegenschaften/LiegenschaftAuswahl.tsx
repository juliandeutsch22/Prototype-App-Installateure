import { useEffect, useState } from 'react';
import { getLiegenschaft, listLiegenschaften, listTops } from '@/lib/db/liegenschaften';
import type { Liegenschaft, LiegenschaftTop } from '@/types';
import { InputField, SelectField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import Button from '@/components/Button';
import { topText } from './liegenschaftText';

/** So viele Treffer zeigt die Suche — wer mehr braucht, tippt weiter. */
export const LIEGENSCHAFT_TREFFER = 8;

export interface LiegenschaftWahl {
  liegenschaftId: string;
  topId: string;
  /** Die gewählte Liegenschaft, wenn sie geladen ist — für Vorschläge (Anschrift). */
  liegenschaft: Liegenschaft | null;
}

/**
 * LIEGENSCHAFT UND TOP WÄHLEN (M02c) — an Baustelle, Wartung und Eingang.
 *
 * Freiwillig: ohne Liegenschaft bleibt alles wie bisher. Gesucht wird auf
 * dem Server (Bezeichnung, Anschrift, Beteiligte), nur aktive; die Tops der
 * gewählten Liegenschaft stehen danach zur Wahl („ganze Liegenschaft“ oder
 * ein Top). Wie die Kundenauswahl: nach der Wahl steht sie mit Anschrift da,
 * „Andere Liegenschaft“ und „Ohne Liegenschaft“ daneben.
 *
 * Nur zeigen, wenn die Unterfähigkeit an ist — das entscheidet der Aufrufer.
 */
export default function LiegenschaftAuswahl({
  companyId,
  idPrefix,
  liegenschaftId,
  topId,
  onChange,
  disabled,
}: {
  companyId: string;
  idPrefix: string;
  liegenschaftId: string;
  topId: string;
  onChange: (w: LiegenschaftWahl) => void;
  disabled?: boolean;
}) {
  const [geladen, setGeladen] = useState<Liegenschaft | null>(null);
  const [tops, setTops] = useState<LiegenschaftTop[] | null>(null);
  const [topsFehler, setTopsFehler] = useState(false);
  const [suchen, setSuchen] = useState(!liegenschaftId);
  const [begriff, setBegriff] = useState('');
  const [antwort, setAntwort] = useState<{ fuer: string; treffer: Liegenschaft[] } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const gewaehlt = geladen && geladen.id === liegenschaftId ? geladen : null;

  // Eine vorgegebene Liegenschaft (Bearbeiten): einzeln nachladen.
  useEffect(() => {
    if (!liegenschaftId || gewaehlt) return;
    let weg = false;
    getLiegenschaft(companyId, liegenschaftId)
      .then((l) => { if (!weg) setGeladen(l); })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [companyId, liegenschaftId, gewaehlt]);

  // Die Tops der gewählten Liegenschaft — alle, eine Grenze schnitte still eines aus der Wahl.
  useEffect(() => {
    setTops(null);
    setTopsFehler(false);
    if (!liegenschaftId) return;
    let weg = false;
    listTops(companyId, liegenschaftId)
      .then((t) => { if (!weg) setTops(t); })
      .catch(() => { if (!weg) setTopsFehler(true); });
    return () => { weg = true; };
  }, [companyId, liegenschaftId]);

  useEffect(() => {
    if (!liegenschaftId) setSuchen(true);
  }, [liegenschaftId]);

  const q = begriff.trim();
  useEffect(() => {
    if (!q) return;
    let weg = false;
    const t = setTimeout(() => {
      listLiegenschaften(companyId, { suche: q, nurAktive: true, grenze: LIEGENSCHAFT_TREFFER })
        .then((s) => {
          if (weg) return;
          setAntwort({ fuer: q, treffer: s.zeilen });
          setFehler(null);
        })
        .catch(() => { if (!weg) setFehler(q); });
    }, 300);
    return () => { weg = true; clearTimeout(t); };
  }, [companyId, q]);

  const treffer = antwort && antwort.fuer === q ? antwort.treffer : [];
  const laeuft = !!q && (!antwort || antwort.fuer !== q) && fehler !== q;

  if (liegenschaftId && !suchen) {
    // Inaktive Tops nur, wenn eines davon schon gewählt ist — sonst stünde eine aufgelassene Wohnung zur Wahl.
    const angeboten = (tops ?? []).filter((t) => t.aktiv !== false || t.id === topId);
    return (
      <div className="flex flex-col gap-3" role="group" aria-labelledby={`${idPrefix}-beschriftung`}>
        <div className="flex flex-col gap-1.5">
          <span id={`${idPrefix}-beschriftung`} className="text-meta font-semibold text-ink-deep">Liegenschaft</span>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="min-w-[9rem]">
              <p>{gewaehlt?.bezeichnung ?? 'Wird geladen …'}</p>
              {gewaehlt?.anschrift && <p className="text-sm text-ink-muted">{gewaehlt.anschrift}</p>}
            </div>
            <span className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" groesse="klein" disabled={disabled}
                onClick={() => { setBegriff(''); setSuchen(true); }}>
                Andere Liegenschaft
              </Button>
              <Button type="button" variant="ghost" groesse="klein" disabled={disabled}
                onClick={() => onChange({ liegenschaftId: '', topId: '', liegenschaft: null })}>
                Ohne Liegenschaft
              </Button>
            </span>
          </div>
        </div>
        {topsFehler ? (
          <p className="text-sm text-ink-deep">Die Tops konnten nicht geladen werden.</p>
        ) : (
          <SelectField
            id={`${idPrefix}-top`}
            label="Top"
            value={topId}
            disabled={disabled || tops === null}
            onChange={(e) => onChange({ liegenschaftId, topId: e.target.value, liegenschaft: gewaehlt })}
          >
            <option value="">Ganze Liegenschaft</option>
            {angeboten.map((t) => (
              <option key={t.id} value={t.id}>{topText(t)}</option>
            ))}
          </SelectField>
        )}
      </div>
    );
  }

  return (
    <div>
      <InputField
        id={`${idPrefix}-suche`}
        label="Liegenschaft (freiwillig)"
        type="search"
        placeholder="Bezeichnung, Anschrift oder Beteiligte"
        value={begriff}
        onChange={(e) => setBegriff(e.target.value)}
        onKeyDown={(e) => {
          // Die Eingabetaste schickte sonst das ganze Formular ab.
          if (e.key === 'Enter') e.preventDefault();
        }}
        disabled={disabled}
        autoComplete="off"
      />
      {liegenschaftId && gewaehlt && (
        <div className="mt-1">
          <Button type="button" variant="ghost" groesse="klein" onClick={() => { setBegriff(''); setSuchen(false); }}>
            Bei {gewaehlt.bezeichnung} bleiben
          </Button>
        </div>
      )}
      {q !== '' && (
        <div className="mt-2">
          {fehler === q ? (
            <p className="text-sm text-ink-deep">Die Suche ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.</p>
          ) : treffer.length === 0 ? (
            <p className="text-sm text-ink-muted">{laeuft ? 'Sucht …' : 'Keine aktive Liegenschaft passt zur Suche.'}</p>
          ) : (
            <List>
              {treffer.map((l) => (
                <ListRow
                  key={l.id}
                  title={l.bezeichnung}
                  subtitle={l.anschrift || undefined}
                  onOeffnen={() => {
                    setGeladen(l);
                    setBegriff('');
                    setSuchen(false);
                    onChange({ liegenschaftId: l.id, topId: '', liegenschaft: l });
                  }}
                />
              ))}
            </List>
          )}
        </div>
      )}
    </div>
  );
}
