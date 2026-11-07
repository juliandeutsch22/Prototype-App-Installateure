import { useEffect, useMemo, useState } from 'react';
import {
  bestellvorschlaege,
  bestellvorschlaegeUebernehmen,
  type Bestellvorschlag,
} from '@/lib/db/materialdeckung';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { List, ListRow } from '@/components/ListRow';
import { ZahlWertFeld } from '@/components/ZahlFeld';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { fmtMenge } from '@/lib/belegLayout';
import { mengeFehler } from '@/lib/einheit';
import { grundAus } from '@/lib/fehlerGrund';
import { vorschlagGruppen, vorschlagGrundText } from './bestellvorschlag';

/**
 * BESTELLVORSCHLÄGE (M04b, E14/G03) über der Einkaufsliste.
 *
 * Vorgeschlagen wird, was unter die Mindestmenge fällt oder für Rüstlisten
 * und Zusagen fehlt — gerechnet in der Datenbank mit derselben Zuteilung
 * wie die Materialbereitschaft, abzüglich dessen, was schon auf der Liste
 * steht oder bestellt ist. Die Menge reicht bis zum Sollbestand, gerundet
 * auf die Verpackungseinheit; ändern lässt sie sich vor dem Übernehmen.
 *
 * ÜBERNEHMEN LEGT POSTEN AUF DIE EINKAUFSLISTE — gebündelt je Großhändler
 * steht es dann darunter, bestellt wird von dort wie bisher. Nie
 * selbsttätig: ein Vorschlag, den niemand übernimmt, bestellt nichts.
 */
export default function Bestellvorschlaege({
  stand,
  onUebernommen,
}: {
  /** Ändert sich, wenn die Einkaufsliste sich geändert hat — dann neu rechnen. */
  stand: number;
  /** Posten sind dazugekommen — die Einkaufsliste neu laden. */
  onUebernommen: () => void;
}) {
  const toast = useToast();
  const [liste, setListe] = useState<Bestellvorschlag[] | null | 'fehler'>(null);
  /** Abgewählte Vorschläge — vorgewählt ist jeder. */
  const [ab, setAb] = useState<Set<string>>(new Set());
  /** Von Hand geänderte Mengen. */
  const [mengen, setMengen] = useState<Map<string, number | null>>(new Map());
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    Promise.resolve()
      .then(() => bestellvorschlaege())
      .then((l) => {
        if (weg) return;
        setListe(l);
        setAb(new Set());
        setMengen(new Map());
      })
      .catch(() => {
        if (!weg) setListe('fehler');
      });
    return () => {
      weg = true;
    };
  }, [stand]);

  const gruppen = useMemo(() => (Array.isArray(liste) ? vorschlagGruppen(liste) : []), [liste]);
  const gewaehlt = Array.isArray(liste) ? liste.filter((v) => !ab.has(v.materialId)) : [];
  const mengeVon = (v: Bestellvorschlag) => (mengen.has(v.materialId) ? mengen.get(v.materialId) : v.menge);
  const falsch = gewaehlt
    .map((v) => ({ v, f: mengeFehler(mengeVon(v), v.einheit) }))
    .find((x) => x.f);

  async function uebernehmen() {
    if (gewaehlt.length === 0 || falsch) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await bestellvorschlaegeUebernehmen(
        crypto.randomUUID(),
        gewaehlt.map((v) => ({ materialId: v.materialId, menge: mengeVon(v)!, lieferantId: v.lieferantId, erwartet: v.menge })),
      );
      if (r.angelegt > 0) toast.success(`${r.angelegt === 1 ? '1 Vorschlag' : `${r.angelegt} Vorschläge`} auf die Einkaufsliste übernommen`);
      const nicht = [...r.uebersprungen, ...r.veraltet];
      if (nicht.length > 0) {
        toast.info(
          `Nicht übernommen, weil sich der Stand inzwischen geändert hat: ${nicht.join(', ')}. Die Vorschläge sind neu gerechnet.`,
        );
      }
      // Die Einkaufsliste lädt neu und ändert damit `stand` — die Vorschläge rechnen dann neu.
      onUebernommen();
    } catch (e) {
      setFehler(grundAus(e, 'Die Vorschläge konnten nicht übernommen werden.'));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card
      title="Bestellvorschläge"
      hint={
        <>
          Vorgeschlagen wird, was unter die Mindestmenge fällt oder für Rüstlisten und zugesagte
          Anforderungen fehlt — abzüglich dessen, was schon auf der Einkaufsliste steht oder bestellt
          ist. Die Menge reicht bis zum Sollbestand des Artikels (ohne ihn bis zur Mindestmenge),
          aufgerundet auf seine Verpackungseinheit. Der Großhändler ist derselbe Vorschlag wie auf der
          Einkaufsliste. „Übernehmen“ setzt die gewählten Vorschläge auf die Einkaufsliste; bestellt
          wird von dort wie bisher, nie von selbst.
        </>
      }
    >
      {fehler && <div className="mb-3"><ErrorState message={fehler} /></div>}
      {liste === null ? (
        <SkeletonList rows={2} />
      ) : liste === 'fehler' ? (
        <ErrorState message="Die Bestellvorschläge konnten nicht geladen werden." />
      ) : liste.length === 0 ? (
        <EmptyState>Nichts vorzuschlagen — kein Artikel unter der Mindestmenge, keine Fehlmenge.</EmptyState>
      ) : (
        <>
          {gruppen.map((g) => (
            <div key={g.lieferantId ?? 'ohne'} className="mb-4">
              <h3 className="section-label mb-1">{g.name}</h3>
              <List>
                {g.vorschlaege.map((v) => {
                  const an = !ab.has(v.materialId);
                  const m = mengeVon(v);
                  const f = an ? mengeFehler(m, v.einheit) : null;
                  return (
                    <ListRow
                      key={v.materialId}
                      title={
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={an}
                            aria-label={`${v.name} übernehmen`}
                            onChange={() =>
                              setAb((alt) => {
                                const n = new Set(alt);
                                if (n.has(v.materialId)) n.delete(v.materialId);
                                else n.add(v.materialId);
                                return n;
                              })
                            }
                          />
                          <span>{v.name}</span>
                          {v.artikelnummer && <span className="text-sm text-ink-muted">Art.-Nr. {v.artikelnummer}</span>}
                        </label>
                      }
                      subtitle={
                        <>
                          {vorschlagGrundText(v)}
                          {f && <span className="block text-danger">{f}</span>}
                        </>
                      }
                    >
                      <div className="w-28">
                        <ZahlWertFeld
                          id={`vorschlag-${v.materialId}`}
                          label={`Menge${v.einheit ? ` (${v.einheit})` : ''}`}
                          wert={m}
                          onWert={(n) => setMengen((alt) => new Map(alt).set(v.materialId, n))}
                          disabled={!an}
                        />
                      </div>
                    </ListRow>
                  );
                })}
              </List>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void uebernehmen()} loading={laeuft} disabled={gewaehlt.length === 0 || !!falsch}>
              {gewaehlt.length === 1 ? '1 Vorschlag übernehmen' : `${gewaehlt.length} Vorschläge übernehmen`}
            </Button>
            <span className="text-sm text-ink-muted">
              {fmtMenge(gewaehlt.length)} von {fmtMenge(liste.length)} gewählt — auf die Einkaufsliste, nicht bestellt.
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
