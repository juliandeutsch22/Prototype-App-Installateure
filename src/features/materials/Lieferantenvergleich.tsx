import { useCallback, useEffect, useState } from 'react';
import {
  artikelVergleich,
  loesen,
  preisverlauf,
  zuordnen,
  type Vergleich,
  type VergleichZeile,
  type VerlaufZeile,
} from '@/lib/db/lieferantenartikel';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Zustand } from '@/components/Badge';
import { Kurzzeile, LotVerlauf, MehrAnzeigen } from '@/components/LotBausteine';
import { ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { euroPreis } from '@/lib/betrag';
import { datumAT, datumAusMs } from '@/lib/datum';
import { fmtMenge } from '@/lib/belegLayout';
import { grundAus } from '@/lib/fehlerGrund';

/**
 * DIE LIEFERANTEN IM ARTIKELBLATT (M03a, E02–E04) — je Großhändler sein
 * Preisstand, ob er mit den anderen vergleichbar ist, und welcher der
 * günstigste ist.
 *
 * VERGLICHEN WIRD NUR BEI VERIFIZIERTER IDENTITÄT, und warum ein Lieferant
 * nicht mitzählt, steht in seiner Zeile: „derselbe Artikel?“ bestätigt ein
 * Mensch, eine gleiche EAN oder ein einziger Lieferant genügt auch. Entschieden
 * wird das in der Datenbank (`app.lieferanten_stand`) — dieselbe Regel, nach
 * der der Vorschlag der Einkaufsliste und der Einkaufspreis gehen; hier wird
 * nur gezeigt.
 *
 * Nur für die, die Einkaufspreise sehen dürfen (die Seite fragt das vorher);
 * der Server lehnt alle anderen ab.
 */

/** Wie viele Einträge des Verlaufs zuerst stehen (Regel 4). */
const VERLAUF_ZUERST = 10;

const DURCH: Record<string, string> = {
  bestaetigt: 'als derselbe Artikel bestätigt',
  automatisch: 'eigene Nummer — Ursprung des Artikels',
  bestand: 'Bestand, ein Lieferant',
  einziger: 'einziger Lieferant',
  ean: 'gleiche EAN',
};

function preisText(z: Pick<VergleichZeile, 'einkaufspreis' | 'listenpreis' | 'rabattProzent'>): string {
  if (z.einkaufspreis != null) return euroPreis(z.einkaufspreis);
  if (z.listenpreis != null) return `Liste ${euroPreis(z.listenpreis)}`;
  return 'ohne Preis';
}

export default function Lieferantenvergleich({
  materialId,
  einheit,
  darfZuordnen,
  zuordnenAn,
  verlaufAn,
  onGeaendert,
}: {
  materialId: string;
  /** Die Einheit des Stammartikels — der Preis steht je dieser Einheit. */
  einheit?: string | null;
  /** Darf Zuordnungen bestätigen und lösen (wer Kataloge einspielt). */
  darfZuordnen: boolean;
  /** Modul „Kataloge mehrerer Großhändler“: die Aktionen zur Zuordnung. */
  zuordnenAn: boolean;
  /** Modul „Preisverlauf“: der Verlauf je Lieferant. */
  verlaufAn: boolean;
  /** Eine Zuordnung hat sich geändert — der Einkaufspreis kann ein anderer sein. */
  onGeaendert?: () => void;
}) {
  const toast = useToast();
  const [vergleich, setVergleich] = useState<Vergleich | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [loesenFragen, setLoesenFragen] = useState<VergleichZeile | null>(null);

  const laden = useCallback(() => {
    let weg = false;
    artikelVergleich(materialId)
      .then((v) => {
        if (!weg) {
          setVergleich(v);
          setFehler(null);
        }
      })
      .catch((e: Error) => {
        if (!weg) setFehler(e.message);
      });
    return () => {
      weg = true;
    };
  }, [materialId]);

  useEffect(() => laden(), [laden]);

  async function bestaetigen(z: VergleichZeile) {
    if (!z.lieferantenartikelId) return;
    setLaeuft(z.lieferantenartikelId);
    try {
      await zuordnen(z.lieferantenartikelId, materialId);
      toast.success(`${z.lieferant}: als derselbe Artikel bestätigt`);
      laden();
      onGeaendert?.();
    } catch (e) {
      toast.error(grundAus(e, 'Die Zuordnung konnte nicht bestätigt werden.'));
    } finally {
      setLaeuft(null);
    }
  }

  if (fehler) return <ErrorState message={fehler} onRetry={laden} />;
  if (!vergleich) return <SkeletonList rows={2} />;

  const { zeilen } = vergleich;
  return (
    <section aria-label="Lieferanten" className="space-y-3">
      <h3 className="section-label">Lieferanten ({zeilen.length})</h3>
      {zeilen.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Für diesen Artikel liegt von keinem Großhändler ein Preis vor — er wurde von Hand angelegt
          oder sein Katalog noch nicht eingespielt.
        </p>
      ) : (
        <div>
          {zeilen.map((z) => (
            <Kurzzeile
              key={`${z.supplierId}-${z.lieferantenartikelId ?? 'alt'}`}
              name={
                <span className="flex flex-wrap items-center gap-x-2">
                  <span>{z.lieferant}</span>
                  {z.guenstigster ? (
                    <Zustand stand="gut">günstigster</Zustand>
                  ) : z.ausgelaufen ? (
                    <Zustand stand="ruht">ausgelaufen</Zustand>
                  ) : !z.vergleichbar ? (
                    <Zustand stand={z.zuPruefen ? 'achtung' : 'offen'}>
                      {z.zuPruefen ? 'zu prüfen' : 'nicht vergleichbar'}
                    </Zustand>
                  ) : z.veraltet ? (
                    <Zustand stand="achtung">veraltet</Zustand>
                  ) : null}
                </span>
              }
              wert={<span className="font-mono">{preisText(z)}</span>}
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-ink-muted">Nummer</dt>
                <dd>{z.lieferantenNr ?? '—'}</dd>
                {z.bezeichnung && (
                  <>
                    <dt className="text-ink-muted">Bezeichnung</dt>
                    <dd>{z.bezeichnung}</dd>
                  </>
                )}
                <dt className="text-ink-muted">Einheit</dt>
                <dd>
                  {z.einheit ?? '—'}
                  {z.preiseinheit && z.preiseinheit > 1 && ` (in der Datei je ${fmtMenge(z.preiseinheit)})`}
                </dd>
                {z.listenpreis != null && (
                  <>
                    <dt className="text-ink-muted">Listenpreis</dt>
                    <dd className="font-mono">
                      {euroPreis(z.listenpreis)}
                      {z.rabattProzent != null && ` − ${fmtMenge(z.rabattProzent)} %`}
                    </dd>
                  </>
                )}
                <dt className="text-ink-muted">Einkaufspreis</dt>
                <dd className="font-mono">
                  {z.einkaufspreis != null ? `${euroPreis(z.einkaufspreis)}${einheit ? ` je ${einheit}` : ''}` : '—'}
                </dd>
                <dt className="text-ink-muted">Stand</dt>
                <dd>{z.stand ? datumAT(z.stand) : '—'}{z.veraltet && ` — älter als ${vergleich.fristTage} Tage`}</dd>
                {z.ean && (
                  <>
                    <dt className="text-ink-muted">EAN</dt>
                    <dd className="font-mono">{z.ean}</dd>
                  </>
                )}
                <dt className="text-ink-muted">Identität</dt>
                <dd>
                  {z.verifiziertDurch
                    ? DURCH[z.verifiziertDurch]
                    : 'nicht verifiziert'}
                  {z.zuordnung === 'bestaetigt' && z.bestaetigtVon && z.bestaetigtAm &&
                    ` (${z.bestaetigtVon}, ${datumAusMs(Date.parse(z.bestaetigtAm))})`}
                </dd>
                {z.grund && (
                  <>
                    <dt className="text-ink-muted">Vergleich</dt>
                    <dd>nicht vergleichbar: {z.grund}</dd>
                  </>
                )}
              </dl>

              {darfZuordnen && zuordnenAn && z.lieferantenartikelId && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {z.zuordnung !== 'bestaetigt' && (
                    <Button
                      type="button"
                      variant="secondary"
                      loading={laeuft === z.lieferantenartikelId}
                      onClick={() => void bestaetigen(z)}
                    >
                      Derselbe Artikel
                    </Button>
                  )}
                  <Button type="button" variant="ghost" onClick={() => setLoesenFragen(z)}>
                    Zuordnung lösen …
                  </Button>
                </div>
              )}

              {verlaufAn && <Verlauf materialId={materialId} supplierId={z.supplierId} lieferant={z.lieferant} />}
            </Kurzzeile>
          ))}
        </div>
      )}
      {vergleich.basisGrund && zeilen.length > 0 && (
        <p className="text-sm text-ink-muted">Kein „günstigster“: {vergleich.basisGrund}.</p>
      )}

      <ConfirmDialog
        open={!!loesenFragen}
        title="Zuordnung lösen?"
        confirmLabel="Lösen"
        message={
          loesenFragen ? (
            <>
              „{loesenFragen.bezeichnung ?? loesenFragen.lieferantenNr}“ von {loesenFragen.lieferant} gehört
              danach zu keinem Artikel mehr und steht unter „Offene Lieferantenartikel“. Seine Preise gehen
              mit ihm; der Einkaufspreis dieses Artikels richtet sich nach den übrigen Lieferanten — liefert
              keiner einen, bleibt der bisherige. Ein neuer Katalog ordnet ihn nicht von selbst wieder zu.
            </>
          ) : undefined
        }
        onCancel={() => setLoesenFragen(null)}
        onConfirm={async () => {
          const z = loesenFragen;
          if (!z?.lieferantenartikelId) return;
          try {
            await loesen(z.lieferantenartikelId);
            toast.success(`${z.lieferant}: Zuordnung gelöst`);
            laden();
            onGeaendert?.();
          } catch (e) {
            toast.error(grundAus(e, 'Die Zuordnung konnte nicht gelöst werden.'));
          } finally {
            setLoesenFragen(null);
          }
        }}
      />
    </section>
  );
}

/**
 * DER PREISVERLAUF EINES LIEFERANTEN (E04) — erst auf Wunsch geholt: ein
 * Artikelblatt wird oft nur wegen Name oder Bestand geöffnet.
 */
function Verlauf({ materialId, supplierId, lieferant }: { materialId: string; supplierId: string; lieferant: string }) {
  const [zeilen, setZeilen] = useState<VerlaufZeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [gezeigt, setGezeigt] = useState(VERLAUF_ZUERST);

  async function holen() {
    setLaedt(true);
    setFehler(null);
    try {
      setZeilen(await preisverlauf(materialId, supplierId, 200));
    } catch (e) {
      setFehler(grundAus(e, 'Der Preisverlauf konnte nicht geladen werden.'));
    } finally {
      setLaedt(false);
    }
  }

  if (!zeilen) {
    return (
      <div className="mt-3">
        {fehler && <p className="mb-2 text-sm text-danger" role="alert">{fehler}</p>}
        <Button type="button" variant="ghost" loading={laedt} onClick={() => void holen()}>
          Preisverlauf zeigen
        </Button>
      </div>
    );
  }
  if (zeilen.length === 0) return <p className="mt-3 text-sm text-ink-muted">Noch kein Preisverlauf.</p>;
  return (
    <div className="mt-3">
      <LotVerlauf
        name={`Preisverlauf ${lieferant}`}
        punkte={zeilen.slice(0, gezeigt).map((v, i) => ({
          jetzt: i === 0,
          titel: (
            <span className="font-mono">
              {v.einkaufspreis != null ? euroPreis(v.einkaufspreis) : v.listenpreis != null ? `Liste ${euroPreis(v.listenpreis)}` : 'ohne Preis'}
              {v.aenderungProzent != null &&
                (v.aenderungProzent === 0 ? ' · unverändert' : ` · ${v.aenderungProzent > 0 ? '+' : '−'}${fmtMenge(Math.abs(v.aenderungProzent))} %`)}
            </span>
          ),
          zeit: `${datumAT(v.gueltigAb)}${v.gueltigBis ? ` bis ${datumAT(v.gueltigBis)}` : ''}`,
        }))}
      />
      <MehrAnzeigen anzahl={Math.max(0, zeilen.length - gezeigt)} onClick={() => setGezeigt((n) => n + VERLAUF_ZUERST)} />
    </div>
  );
}
