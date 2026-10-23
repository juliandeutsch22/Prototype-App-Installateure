import { useEffect, useState } from 'react';
import type { Material } from '@/types';
import type { WithId } from '@/lib/db/core';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
import IconButton from '@/components/IconButton';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { EmptyState } from '@/components/States';
import { neueKennung, type MaterialZeile } from './materialZeilen';
import { useKatalogSuche } from '@/features/orders/useKatalogSuche';
import { ZahlWertFeld } from '@/components/ZahlFeld';

/**
 * Das verbaute Material am Handwerksschein — vom Monteur selbst eingetragen.
 *
 * WARUM NICHTS MEHR VORAUSGEFÜLLT WIRD. Aus dem Betrieb: „der Schein ist
 * größtenteils für private Kunden mit kleineren Aufträgen und Reparaturen, da
 * ist es schwierig, das schon im Voraus zu sagen." Genau daran scheiterte die
 * Vorausfüllung: sie las die MaterialANFORDERUNGEN der Baustelle, also das
 * vorab Bestellte. Bei einer Reparatur bestellt niemand vorab — was verbaut
 * wird, entscheidet sich vor Ort am offenen Rohr.
 *
 * WAS AUF DEM SCHEIN STEHT, UNTERSCHREIBT DER KUNDE. Eine Liste, die aus
 * einer Vorabbestellung stammt, führt genau die Auseinandersetzung herbei,
 * die der Beleg verhindern soll: „das haben Sie doch gar nicht eingebaut."
 * Eingetragen wird deshalb, was tatsächlich verbaut wurde, und zwar von dem,
 * der es verbaut hat.
 *
 * ZWEI WEGE HINEIN, weil zwei Fälle vorkommen. Der Artikel aus dem Lager
 * bringt Bezeichnung und Einheit richtig mit — das ist der Regelfall und
 * steht deshalb oben. Die freie Zeile ist für alles, was nicht im Katalog
 * geführt wird: das beim Händler geholte Ersatzteil, eine Handvoll
 * Dichtungen. Ohne sie müsste der Monteur auf der Baustelle den Katalog
 * pflegen, um eine Zeile loszuwerden.
 *
 * DER BESTAND WIRD DABEI NICHT BEWEGT. Das tut die Materialanforderung mit
 * „Abgeholt", und zwar einmal. Hier ein zweites Mal abzuziehen, hiesse den
 * Lagerstand für jeden geschriebenen Schein zu verfälschen.
 */

interface Props {
  /** Für die Suche auf dem Server über den ganzen Katalog. */
  companyId?: string;
  /** Die beim Öffnen geladenen Artikel — die Reserve, solange der Server nicht antwortet. */
  materials: WithId<Material>[];
  zeilen: MaterialZeile[];
  onChange: (next: MaterialZeile[]) => void;
  /**
   * Meldet eine eingetippte, aber noch nicht hinzugefügte freie Zeile oder
   * `null`. Der Schein sperrt damit das Unterschreiben — siehe dort.
   */
  onOffen?: (offen: string | null) => void;
}

export default function MaterialErfassen({ companyId, materials, zeilen, onChange, onOffen }: Props) {
  const [suche, setSuche] = useState('');
  const [freierName, setFreierName] = useState('');

  // Nur die freie Zeile: ein Suchbegriff ist noch keine Absicht, ein
  // eingetippter Artikelname schon.
  const offen = freierName.trim() ? `„${freierName.trim()}“` : null;
  useEffect(() => {
    onOffen?.(offen);
  }, [offen, onOffen]);
  // Verschwindet das Feld (andere Baustelle, Modul aus), ist auch nichts offen.
  useEffect(() => () => onOffen?.(null), [onOffen]);

  /**
   * Dieselbe Suche wie bei der Retoure und der Rüstliste — Bezeichnung,
   * Kategorie und Artikelnummer, seit 19.10.2026 auf dem Server über den
   * ganzen Katalog (`useKatalogSuche`). Wer drei Stellen im Programm bedient,
   * soll nicht drei verschiedene Suchen lernen müssen.
   */
  const suchStand = useKatalogSuche(companyId, suche, materials);
  const treffer = suchStand.treffer
    /*
      Ausgelaufene Artikel bleiben im Katalog, werden hier aber nicht mehr
      vorgeschlagen: was der Grosshändler nicht mehr führt, kann heute
      niemand mehr verbauen. Auf alten Scheinen steht er weiterhin.
    */
    .filter((m) => !m.ausgelaufen)
    .slice(0, 8);

  function hinzufuegen(name: string, einheit?: string, materialId?: string) {
    onChange([
      ...zeilen,
      { id: neueKennung(), name, menge: 1, einheit, ...(materialId ? { materialId } : {}) },
    ]);
  }

  function mengeSetzen(id: string, n: number | null) {
    // Ein leeres Feld heisst „ich tippe gerade", nicht „null Stück" — das
    // Feld behält den Text, hier steht dann 0 und die Zeile bleibt markiert.
    // Gelesen wird wie überall (M15): „1,5“ ist anderthalb, nicht nichts.
    const menge = n ?? 0;
    onChange(zeilen.map((z) => (z.id === id ? { ...z, menge } : z)));
  }

  return (
    <div className="space-y-4">
      {zeilen.length === 0 ? (
        <EmptyState>
          Noch kein Material eingetragen. Was verbaut wurde, kommt hier dazu — der Schein lässt
          sich auch ohne unterschreiben.
        </EmptyState>
      ) : (
        // Zeilen mit Trennlinie, kein Kasten in der Karte (Designlinie „Fassung 3").
        <ul className="divide-y divide-line">
          {zeilen.map((z) => (
            <li key={z.id} className="flex flex-wrap items-end gap-3 py-3 first:pt-0">
              <div className="w-24 shrink-0">
                <ZahlWertFeld
                  id={`wsmenge-${z.id}`}
                  label="Menge"
                  wert={z.menge}
                  leerAls={0}
                  onWert={(n) => mengeSetzen(z.id, n)}
                />
              </div>
              <p className="min-w-0 flex-1 font-normal text-ink-deep">
                {z.name}
                {z.einheit && <span className="ml-2 text-sm text-ink-muted">{z.einheit}</span>}
              </p>
              <IconButton
                label={`${z.name} vom Schein nehmen`}
                tone="danger"
                onClick={() => onChange(zeilen.filter((x) => x.id !== z.id))}
              >
                ✕
              </IconButton>
              {/* Unterschrieben wird erst mit einer Menge über null — der
                  Schein sperrt den Abschluss und sagt es hier, am Feld. */}
              {!(z.menge > 0) && (
                <div className="w-full">
                  <Hinweiszeile stufe="warn">
                    <p>Bitte eine Menge größer als 0 eintragen.</p>
                  </Hinweiszeile>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div>
        <InputField
          id="wsmsuche"
          label="Artikel aus dem Lager"
          type="search"
          placeholder="Name, Kategorie oder Art.-Nr."
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        {suche.trim() !== '' && (
          <div className="mt-2">
            {/*
              OHNE VERBINDUNG ZUM KATALOG sucht das Feld nur in den beim
              Öffnen geladenen Artikeln. „Wird nicht im Lager geführt“ wäre
              dann die falsche Erklärung: der Monteur tippte den Artikel von
              Hand ein, und auf der Rechnung stünde er später ohne Preis.
            */}
            {suchStand.ohneNetz && (
              <p className="mb-2 text-sm text-ink-deep">
                Keine Verbindung zum Katalog — gesucht nur in den beim Öffnen geladenen Artikeln.
                Den Artikel kann es trotzdem geben.
              </p>
            )}
            {treffer.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {suchStand.laeuft
                  ? 'Sucht im Katalog …'
                  : 'Kein Artikel passt zur Suche. Was nicht im Lager geführt wird, kann unten als freie Zeile dazu.'}
              </p>
            ) : (
              <List>
                {treffer.map((m) => (
                  <ListRow
                    key={m.id}
                    title={m.name}
                    subtitle={[m.category, m.articleNumber].filter(Boolean).join(' · ') || undefined}
                  >
                    <Button
                      variant="secondary"
                      aria-label={`${m.name} auf den Schein`}
                      onClick={() => {
                        hinzufuegen(m.name, m.unit, m.id);
                        setSuche('');
                      }}
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

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <InputField
            id="wsmfrei"
            label="Freie Zeile (nicht im Lager geführt)"
            placeholder="z. B. Eckventil 1/2 Zoll"
            value={freierName}
            onChange={(e) => setFreierName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              // Sonst schickt die Eingabetaste das ganze Formular ab, statt
              // die Zeile anzulegen.
              e.preventDefault();
              const name = freierName.trim();
              if (!name) return;
              hinzufuegen(name);
              setFreierName('');
            }}
          />
        </div>
        <Button
          variant="secondary"
          disabled={freierName.trim() === ''}
          onClick={() => {
            const name = freierName.trim();
            if (!name) return;
            hinzufuegen(name);
            setFreierName('');
          }}
        >
          Hinzufügen
        </Button>
      </div>
    </div>
  );
}
