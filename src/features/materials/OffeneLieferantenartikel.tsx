import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  alsNeuerArtikel,
  offeneLieferantenartikel,
  zuordnen,
  type OffenerLieferantenartikel,
  type Vorschlag,
} from '@/lib/db/lieferantenartikel';
import { useKatalogSuche } from '@/features/orders/useKatalogSuche';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Marke, Zustand } from '@/components/Badge';
import { Listenleiste, MehrAnzeigen } from '@/components/LotBausteine';
import { List, ListRow } from '@/components/ListRow';
import { InputField } from '@/components/Field';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { datumAusMs } from '@/lib/datum';
import { grundAus } from '@/lib/fehlerGrund';

/**
 * OFFENE LIEFERANTENARTIKEL (M03a, E01) — was ein Katalog nicht selbst
 * zuordnen durfte.
 *
 * Offen bleibt ein Lieferantenartikel, wenn seine Nummer im Stamm einem
 * Artikel gehört, dem schon ein ANDERER Großhändler zugeordnet ist (früher
 * hätte der Katalog diesen Artikel überschrieben), oder wenn jemand die
 * Zuordnung gelöst hat. Hier entscheidet ein Mensch: „derselbe Artikel“ wie
 * ein vorhandener, oder ein neuer.
 *
 * DIE VORSCHLÄGE kommen vom Server (gleiche Nummer bei einem anderen
 * Lieferanten, gleiche EAN, ähnliche Bezeichnung über die Suche des
 * Katalogs). Sie entscheiden nichts; gesucht werden kann jeder Artikel.
 */

const JE_SEITE = 20;

const GRUND: Record<Vorschlag['grund'], string> = {
  nummer: 'gleiche Nummer',
  ean: 'gleiche EAN',
  bezeichnung: 'ähnliche Bezeichnung',
};

export default function OffeneLieferantenartikel() {
  const { user } = useAuth();
  const toast = useToast();
  const [suche, setSuche] = useState('');
  const [begriff, setBegriff] = useState('');
  const [zeilen, setZeilen] = useState<OffenerLieferantenartikel[] | null>(null);
  const [gesamt, setGesamt] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [mehrLaedt, setMehrLaedt] = useState(false);
  const [offen, setOffen] = useState<OffenerLieferantenartikel | null>(null);
  const [neuFragen, setNeuFragen] = useState<OffenerLieferantenartikel | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [artikelSuche, setArtikelSuche] = useState('');
  const { treffer, laeuft: suchtArtikel } = useKatalogSuche(user?.companyId, artikelSuche, []);

  useEffect(() => {
    const t = setTimeout(() => setBegriff(suche.trim()), 250);
    return () => clearTimeout(t);
  }, [suche]);

  const laden = useCallback(() => {
    let weg = false;
    offeneLieferantenartikel(begriff, 0, JE_SEITE)
      .then((s) => {
        if (weg) return;
        setZeilen(s.zeilen);
        setGesamt(s.gesamt);
        setFehler(null);
      })
      .catch((e: Error) => {
        if (!weg) setFehler(e.message);
      });
    return () => {
      weg = true;
    };
  }, [begriff]);

  useEffect(() => laden(), [laden]);

  async function mehr() {
    if (!zeilen) return;
    setMehrLaedt(true);
    try {
      const s = await offeneLieferantenartikel(begriff, zeilen.length, JE_SEITE);
      setZeilen([...zeilen, ...s.zeilen.filter((z) => !zeilen.some((x) => x.id === z.id))]);
      setGesamt(s.gesamt);
    } catch (e) {
      setFehler(grundAus(e, 'Weitere Zeilen konnten nicht geladen werden.'));
    } finally {
      setMehrLaedt(false);
    }
  }

  /** Erledigt: die Zeile verschwindet aus der Liste, ohne dass die Seite von vorn lädt. */
  function erledigt(id: string) {
    setZeilen((alt) => (alt ?? []).filter((z) => z.id !== id));
    setGesamt((n) => Math.max(0, n - 1));
    setOffen(null);
    setArtikelSuche('');
  }

  async function zuordnenZu(la: OffenerLieferantenartikel, materialId: string, name: string) {
    setLaeuft(materialId);
    try {
      await zuordnen(la.id, materialId);
      toast.success(`${la.lieferant} ${la.lieferantenNr} → ${name}`);
      erledigt(la.id);
    } catch (e) {
      toast.error(grundAus(e, 'Die Zuordnung konnte nicht gespeichert werden.'));
    } finally {
      setLaeuft(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title={zeilen === null ? 'Offene Lieferantenartikel' : `Offene Lieferantenartikel (${gesamt})`}
        hint={
          <>
            Ein Katalog ordnet seine Artikel über die Nummer zu. Gehört die Nummer im Katalog schon einem
            Artikel, den ein <strong>anderer</strong> Großhändler liefert, ordnet er nicht zu — sonst
            überschriebe er dessen Bezeichnung und Preis. Hier entscheidest du: derselbe Artikel wie ein
            vorhandener, oder ein neuer. Erst dann steht sein Preis im Vergleich.
          </>
        }
        buendig
      >
        <Listenleiste
          suche={{
            id: 'offene-suche',
            wert: suche,
            onChange: setSuche,
            platzhalter: 'Bezeichnung, Nummer oder Großhändler',
          }}
        />
        <div>
          {fehler && <div className="px-4 pb-4"><ErrorState message={fehler} onRetry={laden} /></div>}
          {zeilen === null && !fehler ? (
            <div className="px-4 pb-4"><SkeletonList rows={3} /></div>
          ) : zeilen && zeilen.length === 0 ? (
            <EmptyState zeichnung={begriff ? 'suche' : 'lager'} titel={begriff ? 'Keine passenden Artikel.' : 'Nichts offen'}>
              {begriff
                ? `Kein offener Lieferantenartikel passt zu „${begriff}“.`
                : 'Jeder Artikel der eingespielten Kataloge ist einem Artikel im Katalog zugeordnet.'}
            </EmptyState>
          ) : (
            <List>
              {(zeilen ?? []).map((z) => (
                <ListRow
                  key={z.id}
                  title={z.bezeichnung || z.lieferantenNr}
                  subtitle={[z.lieferant, `Nr. ${z.lieferantenNr}`, z.einheit].filter(Boolean).join(' · ')}
                  zustand={
                    z.zuordnung === 'geloest' ? (
                      <Zustand stand="offen">gelöst</Zustand>
                    ) : (
                      <Zustand stand="offen">offen</Zustand>
                    )
                  }
                  onOeffnen={() => {
                    setArtikelSuche('');
                    setOffen(z);
                  }}
                  pfeil
                >
                  {z.vorschlaege.length > 0 && (
                    <Marke>{z.vorschlaege.length === 1 ? '1 Vorschlag' : `${z.vorschlaege.length} Vorschläge`}</Marke>
                  )}
                </ListRow>
              ))}
            </List>
          )}
          {zeilen && (
            <MehrAnzeigen anzahl={Math.max(0, gesamt - zeilen.length)} laedt={mehrLaedt} onClick={() => void mehr()} />
          )}
        </div>
      </Card>

      <BottomSheet
        open={!!offen}
        onClose={() => setOffen(null)}
        label="Lieferantenartikel zuordnen"
        titel={offen ? (offen.bezeichnung || offen.lieferantenNr) : ''}
        auchBreit
      >
        {offen && (
          <div className="space-y-5">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-ink-muted">Großhändler</dt>
              <dd>{offen.lieferant}</dd>
              <dt className="text-ink-muted">Nummer</dt>
              <dd className="font-mono">{offen.lieferantenNr}</dd>
              <dt className="text-ink-muted">Einheit</dt>
              <dd>{offen.einheit ?? '—'}</dd>
              {offen.ean && (
                <>
                  <dt className="text-ink-muted">EAN</dt>
                  <dd className="font-mono">{offen.ean}</dd>
                </>
              )}
              {offen.zuordnung === 'geloest' && (
                <>
                  <dt className="text-ink-muted">Gelöst</dt>
                  <dd>
                    {offen.bestaetigtVon ?? 'unbekannt'}
                    {offen.bestaetigtAm && `, ${datumAusMs(Date.parse(offen.bestaetigtAm))}`} — ein neuer Katalog
                    ordnet ihn nicht von selbst wieder zu.
                  </dd>
                </>
              )}
            </dl>

            <section aria-label="Vorschläge" className="space-y-2">
              <h3 className="section-label">Vorschläge</h3>
              {offen.vorschlaege.length === 0 ? (
                <p className="text-sm text-ink-muted">Kein Artikel mit gleicher Nummer, EAN oder ähnlicher Bezeichnung.</p>
              ) : (
                <List>
                  {offen.vorschlaege.map((v) => (
                    <ListRow
                      key={v.materialId}
                      title={v.name}
                      subtitle={[v.articleNumber && `Art.-Nr. ${v.articleNumber}`, GRUND[v.grund]].filter(Boolean).join(' · ')}
                    >
                      <Button
                        type="button"
                        variant="secondary"
                        loading={laeuft === v.materialId}
                        onClick={() => void zuordnenZu(offen, v.materialId, v.name)}
                      >
                        Zuordnen
                      </Button>
                    </ListRow>
                  ))}
                </List>
              )}
            </section>

            <section aria-label="Zuordnen zu" className="space-y-2">
              <h3 className="section-label">Zuordnen zu …</h3>
              <InputField
                id="offen-artikel-suche"
                label="Artikel im Katalog suchen"
                type="search"
                placeholder="Name oder Artikelnummer"
                value={artikelSuche}
                onChange={(e) => setArtikelSuche(e.target.value)}
              />
              {artikelSuche.trim() && (
                suchtArtikel && treffer.length === 0 ? (
                  <p className="text-sm text-ink-muted">Wird gesucht …</p>
                ) : treffer.length === 0 ? (
                  <p className="text-sm text-ink-muted">Kein Artikel passt.</p>
                ) : (
                  <List>
                    {treffer.slice(0, 8).map((m) => (
                      <ListRow
                        key={m.id}
                        title={m.name}
                        subtitle={[m.articleNumber && `Art.-Nr. ${m.articleNumber}`, m.unit].filter(Boolean).join(' · ')}
                      >
                        <Button
                          type="button"
                          variant="secondary"
                          loading={laeuft === m.id}
                          onClick={() => void zuordnenZu(offen, m.id, m.name)}
                        >
                          Zuordnen
                        </Button>
                      </ListRow>
                    ))}
                  </List>
                )
              )}
            </section>

            <div className="fuss-aktionen">
              <Button type="button" variant="ghost" onClick={() => setOffen(null)}>
                Schließen
              </Button>
              <Button type="button" variant="secondary" onClick={() => setNeuFragen(offen)}>
                Als neuen Artikel …
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={!!neuFragen}
        title="Als neuen Artikel anlegen?"
        confirmLabel="Anlegen"
        confirmTone="primary"
        message={
          neuFragen
            ? `„${neuFragen.bezeichnung || neuFragen.lieferantenNr}“ von ${neuFragen.lieferant} wird ein eigener Artikel im Katalog — mit seinen Preisen. Trägt schon ein anderer Artikel die Nummer ${neuFragen.lieferantenNr}, bleibt die Artikelnummer des neuen leer.`
            : ''
        }
        onCancel={() => setNeuFragen(null)}
        onConfirm={async () => {
          const la = neuFragen;
          if (!la) return;
          try {
            await alsNeuerArtikel(la.id);
            toast.success(`${la.bezeichnung || la.lieferantenNr}: als neuer Artikel angelegt`);
            erledigt(la.id);
          } catch (e) {
            toast.error(grundAus(e, 'Der Artikel konnte nicht angelegt werden.'));
          } finally {
            setNeuFragen(null);
          }
        }}
      />
    </div>
  );
}
