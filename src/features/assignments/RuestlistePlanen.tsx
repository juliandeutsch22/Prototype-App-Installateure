import { useEffect, useMemo, useState } from 'react';
import type { Material, RuestPosition } from '@/types';
import { katalogAbgeschnitten } from '@/lib/listengrenzen';
import type { WithId } from '@/lib/db/core';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import { Marke } from '@/components/Badge';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import Meldung from '@/components/Meldung';
import { EmptyState } from '@/components/States';

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
  /**
   * Meldet eine eingetippte, aber noch nicht hinzugefügte freie Zeile oder
   * `null` — dieselbe Naht wie am Handwerksschein (`MaterialErfassen`).
   */
  onOffen?: (offen: string | null) => void;
}

export default function RuestlistePlanen({
  materials,
  positionen,
  onChange,
  onAnforderung,
  anforderungLaeuft = false,
  onOffen,
}: Props) {
  const [suche, setSuche] = useState('');
  const [freierName, setFreierName] = useState('');

  const offen = freierName.trim() ? `„${freierName.trim()}"` : null;
  useEffect(() => {
    onOffen?.(offen);
  }, [offen, onOffen]);
  // Verschwindet das Feld (andere Baustelle, Modul aus), ist auch nichts offen.
  useEffect(() => () => onOffen?.(null), [onOffen]);

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
      // Was der Grosshändler nicht mehr führt, packt heute niemand mehr auf
      // den Wagen. Im Katalog bleibt der Artikel, hier verschwindet er.
      .filter((m) => !m.ausgelaufen)
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
        <EmptyState>
          Noch nichts eingetragen. Der Monteur sieht am Einsatztag nur eine Liste, die hier steht.
        </EmptyState>
      ) : (
        /*
          OHNE RAHMEN, wie das Material am Handwerksschein (Linie, 2: kein
          Kasten in der Karte). Die geplanten Zeilen und die Treffer der
          Suche laufen trotzdem nicht ineinander — zwischen ihnen steht das
          beschriftete Suchfeld.
        */
        <List>
          {positionen.map((p) => {
            const artikel = p.materialId ? nachId.get(p.materialId) : undefined;
            /*
              Fehlmenge nur bei einem KATALOGARTIKEL. Eine freie Zeile
              („Leihgerät Kernbohrer") hat keinen Bestand, und „0 von 1
              vorhanden" wäre dort eine Falschaussage statt einer Warnung.
            */
            const fehlt = artikel ? Math.max(0, p.menge - (artikel.stock ?? 0)) : 0;
            return (
              <ListRow
                key={p.id}
                vorne={
                  <div className="w-20">
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
                }
                title={
                  <>
                    {p.name}
                    {p.einheit && <span className="text-sm text-ink-muted">{p.einheit}</span>}
                    {!p.materialId && <Marke>{FREI}</Marke>}
                  </>
                }
                subtitle={
                  artikel && (
                    <>
                      Lager: <span>{artikel.stock ?? 0}</span>
                      {artikel.category ? ` · ${artikel.category}` : ''}
                    </>
                  )
                }
                /*
                  DER BESTAND REICHT NICHT — und das ist eine Feststellung,
                  keine Sperre. Der Planer weiss vielleicht, dass morgen eine
                  Lieferung kommt oder das Teil schon im Bus liegt. Deshalb
                  steht hier ein ANGEBOT und keine selbsttätige Bestellung:
                  eine Schreibung in die Arbeitsliste eines anderen, auf
                  Grundlage einer Vermutung, wäre genau der Vertrauensverlust,
                  den diese App sich nicht leisten kann.
                */
                unten={
                  fehlt > 0 && (
                    <Meldung ton="warnung">
                      <div className="flex flex-wrap items-center gap-3">
                        <span>
                          Im Lager fehlen <strong>{fehlt}</strong>.
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
                    </Meldung>
                  )
                }
              >
                <IconButton
                  label={`${p.name} von der Rüstliste nehmen`}
                  tone="danger"
                  onClick={() => onChange(positionen.filter((x) => x.id !== p.id))}
                >
                  ✕
                </IconButton>
              </ListRow>
            );
          })}
        </List>
      )}

      <div>
        <InputField
          id="rsuche"
          label="Artikel aus dem Lager"
          type="search"
          placeholder="Name, Kategorie oder Art.-Nr."
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        {suche.trim() !== '' && (
          <div className="mt-2">
            {treffer.length === 0 ? (
              <EmptyState>
                Kein Artikel passt zur Suche. Was nicht im Lager geführt wird, kann unten als
                freie Zeile dazu.
                {/* Wie am Schein: „gibt es nicht" und „nicht geladen" sind
                    zwei verschiedene Auskünfte. */}
                {katalogAbgeschnitten(materials) && (
                  <strong className="mt-1 block text-warning">
                    Der Katalog wurde nur bis zur Obergrenze geladen — den Artikel kann es
                    trotzdem geben.
                  </strong>
                )}
              </EmptyState>
            ) : (
              <List>
                {treffer.map((m) => (
                  <ListRow
                    key={m.id}
                    title={m.name}
                    subtitle={[m.category, `Lager: ${m.stock ?? 0}`].filter(Boolean).join(' · ')}
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
