import { useEffect, useMemo, useState } from 'react';
import type { Material, RuestPosition } from '@/types';
import { katalogNachIds } from '@/lib/db/materials';
import { useKatalogSuche } from '@/features/orders/useKatalogSuche';
import type { WithId } from '@/lib/db/core';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import { Marke } from '@/components/Badge';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import Hinweiszeile from '@/components/Hinweiszeile';
import { ZahlWertFeld } from '@/components/ZahlFeld';
import { mengeFehler } from '@/lib/einheit';
import { fmtMenge } from '@/lib/belegLayout';
import { imLager } from '@/features/orders/lagerartikel';

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
  /** Für die Suche auf dem Server über den ganzen Katalog. */
  companyId?: string;
  /** Die beim Öffnen geladenen Artikel — die Reserve, solange der Server nicht antwortet. */
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
  /**
   * Was je Artikel für DIESE Rüstliste verfügbar ist (Testbericht
   * 30.09.2026, M32): frei nach Zusagen und anderen Rüstlisten, die eigene
   * gespeicherte Menge wieder dazugezählt. Ohne Angabe gilt der Bestand.
   */
  verfuegbar?: Map<string, number>;
  /** Positionen, für die schon eine Anforderung angelegt wurde (G14). */
  angefordert?: Set<string>;
}

export default function RuestlistePlanen({
  companyId,
  materials,
  positionen,
  onChange,
  onAnforderung,
  anforderungLaeuft = false,
  onOffen,
  verfuegbar,
  angefordert,
}: Props) {
  const [suche, setSuche] = useState('');
  const [freierName, setFreierName] = useState('');

  const offen = freierName.trim() ? `„${freierName.trim()}“` : null;
  useEffect(() => {
    onOffen?.(offen);
  }, [offen, onOffen]);
  // Verschwindet das Feld (andere Baustelle, Modul aus), ist auch nichts offen.
  useEffect(() => () => onOffen?.(null), [onOffen]);

  /*
    ARTIKEL AUSSERHALB DER GELADENEN (19.10.2026): was die Suche vom Server
    bringt oder eine gespeicherte Zeile nennt, aber nicht unter den beim
    Öffnen geladenen Artikeln steht. Ohne sie fehlte einer solchen Zeile der
    Lagerstand — und mit ihm die Warnung, dass der Bestand nicht reicht.
  */
  const [dazu, setDazu] = useState<Map<string, WithId<Material>>>(new Map());
  const nachId = useMemo(
    () => new Map([...materials.map((m) => [m.id, m] as const), ...dazu]),
    [materials, dazu],
  );
  const fehlendeIds = positionen
    .map((p) => p.materialId)
    .filter((id): id is string => !!id && !nachId.has(id))
    .sort()
    .join('|');
  useEffect(() => {
    if (!companyId || !fehlendeIds) return;
    let weg = false;
    katalogNachIds(companyId, fehlendeIds.split('|'))
      .then((artikel) => {
        if (weg || artikel.length === 0) return;
        setDazu((alt) => new Map([...alt, ...artikel.map((m) => [m.id, m] as const)]));
      })
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, [companyId, fehlendeIds]);

  /**
   * Dieselbe Suche wie bei der Retoure — Bezeichnung, Kategorie und
   * Artikelnummer, seit 19.10.2026 auf dem Server über den ganzen Katalog
   * (`useKatalogSuche`). Wer zwei Stellen im Programm bedient, soll nicht
   * zwei verschiedene Suchen lernen müssen.
   */
  const suchStand = useKatalogSuche(companyId, suche, materials);
  const drin = new Set(positionen.map((p) => p.materialId).filter(Boolean));
  const treffer = suchStand.treffer
    // Was der Grosshändler nicht mehr führt, packt heute niemand mehr auf
    // den Wagen. Im Katalog bleibt der Artikel, hier verschwindet er.
    .filter((m) => !m.ausgelaufen)
    .filter((m) => !drin.has(m.id))
    .slice(0, 8);

  function hinzufuegen(m: WithId<Material>) {
    if (!nachId.has(m.id)) setDazu((alt) => new Map(alt).set(m.id, m));
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

  function mengeSetzen(id: string, n: number | null) {
    // Leeres Feld heisst „ich tippe gerade", nicht „null Stück" — das Feld
    // behält den Text. Gelesen wird wie überall (M15): „1,5“ ist anderthalb.
    const menge = n ?? 0;
    onChange(positionen.map((p) => (p.id === id ? { ...p, menge } : p)));
  }

  return (
    <div className="space-y-4">
      {positionen.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Noch nichts eingetragen. Der Monteur sieht am Einsatztag nur eine Liste, die hier steht.
        </p>
      ) : (
        // Zeilen mit Linien statt eines umrandeten Kastens — wie das Material am Schein.
        <ul className="divide-y divide-line border-y border-line">
          {positionen.map((p) => {
            const artikel = p.materialId ? nachId.get(p.materialId) : undefined;
            /*
              Fehlmenge nur bei einem KATALOGARTIKEL. Eine freie Zeile
              („Leihgerät Kernbohrer") hat keinen Bestand, und „0 von 1
              vorhanden" wäre dort eine Falschaussage statt einer Warnung.
            */
            const da = artikel ? (verfuegbar?.get(artikel.id) ?? artikel.stock ?? 0) : 0;
            const fehlt = artikel ? Math.max(0, Math.round((p.menge - Math.max(da, 0)) * 1000) / 1000) : 0;
            return (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-24 shrink-0">
                    <ZahlWertFeld
                      id={`rmenge-${p.id}`}
                      label="Menge"
                      wert={p.menge}
                      leerAls={0}
                      onWert={(n) => mengeSetzen(p.id, n)}
                    />
                  </div>
                  {/* Je Einheit (M27): „2,5 Stk“ fällt auf; null heisst „tippe noch“. */}
                  {p.menge > 0 && mengeFehler(p.menge, p.einheit ?? artikel?.unit) && (
                    <p className="basis-full text-sm text-danger">{mengeFehler(p.menge, p.einheit ?? artikel?.unit)}</p>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-normal text-ink">
                      {p.name}
                      {p.einheit && <span className="text-sm text-ink-muted">{p.einheit}</span>}
                      {!p.materialId && <Marke>{FREI}</Marke>}
                    </p>
                    {artikel && !imLager(artikel) && (
                      <p className="text-sm text-ink-muted">
                        Nicht im Lager geführt{artikel.category ? ` · ${artikel.category}` : ''}
                      </p>
                    )}
                    {artikel && imLager(artikel) && (
                      <p className="text-sm text-ink-muted">
                        Lager: <span>{fmtMenge(artikel.stock ?? 0)}</span>
                        {verfuegbar?.has(artikel.id) && (
                          <> · für diese Liste frei: <span>{fmtMenge(Math.max(da, 0))}</span></>
                        )}
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
                  <div className="mt-2">
                    <Hinweiszeile stufe="warn">
                      <div className="flex flex-wrap items-center gap-3">
                        <span>
                          {artikel && !imLager(artikel) ? (
                            // Ein Katalogartikel liegt nicht im Regal (M30): er muss bestellt werden.
                            <>Nicht im Lager — <strong>{fmtMenge(fehlt)}</strong> zu bestellen.</>
                          ) : (
                            <>Im Lager fehlen <strong>{fmtMenge(fehlt)}</strong>.</>
                          )}
                        </span>
                        {/*
                          NACH DEM ANLEGEN IST DER KNOPF ERLEDIGT (Testbericht
                          30.09.2026, G14): er blieb aktiv, und ein zweiter
                          Tipp legte dieselbe Anforderung noch einmal an.
                        */}
                        {onAnforderung && (angefordert?.has(p.id) ? (
                          <span className="text-sm text-ink-muted">Anforderung angelegt</span>
                        ) : (
                          <Button
                            variant="secondary"
                            loading={anforderungLaeuft}
                            disabled={anforderungLaeuft}
                            onClick={() => onAnforderung(p, fehlt)}
                          >
                            Anforderung über {fmtMenge(fehlt)} anlegen
                          </Button>
                        ))}
                      </div>
                    </Hinweiszeile>
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
          placeholder="Name, Kategorie oder Art.-Nr."
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        {suche.trim() !== '' && (
          <div className="mt-2">
            {/* Wie am Schein: „gibt es nicht" und „nicht erreicht" sind zwei verschiedene Auskünfte. */}
            {suchStand.ohneNetz && (
              <p className="mb-2 text-sm text-warning">
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
                    subtitle={[m.category, `Lager: ${fmtMenge(m.stock ?? 0)}`].filter(Boolean).join(' · ')}
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
