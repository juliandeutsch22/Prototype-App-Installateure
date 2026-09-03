import { useMemo, useState } from 'react';
import type { Material, RuestPosition } from '@/types';
import type { WithId } from '@/lib/db/core';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import Badge from '@/components/Badge';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';

/**
 * Die Rüstliste eines Einsatzes zusammenstellen — was in den Bus soll.
 *
 * SIE SAGT „NIMM DAS MIT", NICHT „DAS MUSS BESORGT WERDEN". Das Zweite ist
 * die Materialanforderung, und die beiden zu vermischen wäre teuer: die
 * Verwaltung bekäme eine Arbeitsliste voller Dinge, die im Regal stehen, und
 * der Lagerstand würde zweimal abgezogen. Diese Ansicht bewegt den Bestand
 * deshalb nicht — sie zeigt ihn nur an.
 *
 * WAS SIE DAFÜR ZEIGT: reicht der Bestand für die geplante Menge? Das ist die
 * Frage, die der Planer sonst erst am Einsatztag beantwortet bekommt, wenn
 * der Monteur vor einem leeren Fach steht.
 */

/** Wie eine Zeile ohne Katalogartikel gekennzeichnet wird. */
const FREI = 'frei';

/**
 * Eine neue, stabile Kennung.
 *
 * An ihr hängt der Haken „eingeladen". Wäre sie die Listenposition, rückte
 * der Haken mit, sobald jemand eine Zeile davor einfügt — und der Monteur
 * lädt die falsche Kiste ein.
 */
function neueKennung(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

interface Props {
  materials: WithId<Material>[];
  positionen: RuestPosition[];
  onChange: (next: RuestPosition[]) => void;
  /** Fehlmenge melden — der Knopf dazu steht hier, ausgelöst wird es oben. */
  onAnforderung?: (position: RuestPosition, fehlmenge: number) => void;
  /** Läuft gerade eine Anforderung? Dann keinen zweiten Tipp annehmen. */
  anforderungLaeuft?: boolean;
}

export default function RuestlistePlanen({
  materials,
  positionen,
  onChange,
  onAnforderung,
  anforderungLaeuft = false,
}: Props) {
  const [suche, setSuche] = useState('');
  const [freierName, setFreierName] = useState('');

  const nachId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  /**
   * Dieselbe Suche wie bei der Retoure — Bezeichnung, Kategorie und
   * Artikelnummer. Wer zwei Stellen im Programm bedient, soll nicht zwei
   * verschiedene Suchen lernen müssen.
   */
  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return [];
    const drin = new Set(positionen.map((p) => p.materialId).filter(Boolean));
    return materials
      .filter((m) => !drin.has(m.id))
      .filter((m) =>
        [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [materials, suche, positionen]);

  function hinzufuegen(m: WithId<Material>) {
    onChange([
      ...positionen,
      { id: neueKennung(), materialId: m.id, name: m.name, menge: 1, einheit: m.unit },
    ]);
    setSuche('');
  }

  function freiHinzufuegen() {
    const name = freierName.trim();
    if (!name) return;
    onChange([...positionen, { id: neueKennung(), name, menge: 1 }]);
    setFreierName('');
  }

  function mengeSetzen(id: string, roh: string) {
    // Leeres Feld heisst „ich tippe gerade", nicht „null Stück". Eine 0 hier
    // hart zu erzwingen risse die Zahl unter dem Finger weg.
    const n = Number(roh);
    const menge = roh.trim() === '' || Number.isNaN(n) ? 0 : n;
    onChange(positionen.map((p) => (p.id === id ? { ...p, menge } : p)));
  }

  return (
    <div className="space-y-4">
      {positionen.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Noch nichts eingetragen. Der Monteur sieht am Einsatztag nur eine Liste, die hier steht.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded border border-line">
          {positionen.map((p) => {
            const artikel = p.materialId ? nachId.get(p.materialId) : undefined;
            /*
              Fehlmenge nur bei einem KATALOGARTIKEL. Eine freie Zeile
              („Leihgerät Kernbohrer") hat keinen Bestand, und „0 von 1
              vorhanden" wäre dort eine Falschaussage statt einer Warnung.
            */
            const fehlt = artikel ? Math.max(0, p.menge - (artikel.stock ?? 0)) : 0;
            return (
              <li key={p.id} className="p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-24 shrink-0">
                    <InputField
                      id={`rmenge-${p.id}`}
                      label="Menge"
                      type="number"
                      min="0"
                      step="any"
                      value={String(p.menge)}
                      onChange={(e) => mengeSetzen(p.id, e.target.value)}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {p.name}
                      {p.einheit && <span className="text-sm text-ink-muted">{p.einheit}</span>}
                      {!p.materialId && <Badge tone="gray">{FREI}</Badge>}
                    </p>
                    {artikel && (
                      <p className="text-sm text-ink-muted">
                        Lager: <span className="tnum">{artikel.stock ?? 0}</span>
                        {artikel.category ? ` · ${artikel.category}` : ''}
                      </p>
                    )}
                  </div>
                  <IconButton
                    label={`${p.name} von der Rüstliste nehmen`}
                    tone="danger"
                    onClick={() => onChange(positionen.filter((x) => x.id !== p.id))}
                  >
                    ✕
                  </IconButton>
                </div>

                {/*
                  DER BESTAND REICHT NICHT — und das ist eine Feststellung,
                  keine Sperre. Der Planer weiss vielleicht, dass morgen eine
                  Lieferung kommt oder das Teil schon im Bus liegt. Deshalb
                  steht hier ein ANGEBOT und keine selbsttätige Bestellung:
                  eine Schreibung in die Arbeitsliste eines anderen, auf
                  Grundlage einer Vermutung, wäre genau der Vertrauensverlust,
                  den diese App sich nicht leisten kann.
                */}
                {fehlt > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
                    <span>
                      Im Lager fehlen <strong className="tnum">{fehlt}</strong>.
                    </span>
                    {onAnforderung && (
                      <Button
                        variant="secondary"
                        loading={anforderungLaeuft}
                        onClick={() => onAnforderung(p, fehlt)}
                      >
                        Anforderung über {fehlt} anlegen
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <InputField
          id="rsuche"
          label="Artikel aus dem Lager"
          type="search"
          placeholder="Bezeichnung, Kategorie oder Artikelnummer"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        {suche.trim() !== '' && (
          <div className="mt-2">
            {treffer.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Kein Artikel passt zur Suche. Was nicht im Lager geführt wird, kann unten als
                freie Zeile dazu.
              </p>
            ) : (
              <List>
                {treffer.map((m) => (
                  <ListRow
                    key={m.id}
                    title={m.name}
                    subtitle={[m.category || 'ohne Kategorie', `Lager: ${m.stock ?? 0}`].join(' · ')}
                  >
                    <Button
                      variant="secondary"
                      aria-label={`${m.name} auf die Rüstliste`}
                      onClick={() => hinzufuegen(m)}
                    >
                      Wählen
                    </Button>
                  </ListRow>
                ))}
              </List>
            )}
          </div>
        )}
      </div>

      {/*
        Freie Zeilen, weil nicht alles im Katalog steht: ein Leihgerät, eine
        Handvoll Dichtungen aus dem Bestand, das Werkzeug für genau diesen
        Einsatz. Ohne sie müsste der Planer den Katalog vollschreiben, damit
        er einen Satz an den Monteur loswird.
      */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <InputField
            id="rfrei"
            label="Freie Zeile (nicht im Lager geführt)"
            placeholder="z. B. Leihgerät Kernbohrer"
            value={freierName}
            onChange={(e) => setFreierName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              // Sonst schickt die Eingabetaste das ganze Formular ab, statt
              // die Zeile anzulegen.
              e.preventDefault();
              freiHinzufuegen();
            }}
          />
        </div>
        <Button variant="secondary" onClick={freiHinzufuegen} disabled={freierName.trim() === ''}>
          Hinzufügen
        </Button>
      </div>
    </div>
  );
}
