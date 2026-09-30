import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { darfKatalogEinspielen } from '@/lib/permissions';
import {
  subscribeMaterials,
  LOW_STOCK_THRESHOLD,
  lagerFrei,
  type LagerStand,
} from '@/lib/db/materials';
import { fmtMenge } from '@/lib/belegLayout';
import { KATALOG_GRENZE } from '@/lib/listengrenzen';
import { subscribeAllOrders } from '@/lib/db/materialOrders';
import type { WithId } from '@/lib/db/core';
import type { Material, MaterialOrder } from '@/types';
import Nachladen from '@/components/Nachladen';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Marke, Warnung } from '@/components/Badge';
import Metric, { MetricRow } from '@/components/Metric';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import MaterialCatalog from './MaterialCatalog';
import { BewegungenDialog, InventurDialog, WareneingangDialog } from './LagerDialoge';
import { useReiterImBild } from '@/components/reiterImBild';

/*
  Der Katalogimport wird erst beim Öffnen geladen. Er bringt den
  DATANORM-Leser mit, und den braucht niemand, der nur den Bestand nachsieht.
*/
const KatalogImport = lazy(() => import('@/features/materials/KatalogImport'));

type Tab = 'bestand' | 'katalog' | 'import';

const darfEinspielenFuer = (user: Parameters<typeof darfKatalogEinspielen>[0] | null | undefined) =>
  user ? darfKatalogEinspielen(user) : false;

/**
 * Lager — eigener Bereich statt versteckter vierter Reiter unter
 * „Bestellungen".
 *
 * Dort hat ihn niemand vermutet, und das ist kein Wunder: Wer Bestand
 * pflegen will, sucht nicht unter Bestellungen. Der Katalog ist derselbe
 * geblieben; neu ist die Bestandsansicht davor, die zeigt, was knapp wird
 * und wie viel bereits für offene Anforderungen reserviert ist.
 */
/**
 * Wie viele Anforderungen geladen werden.
 *
 * Ohne Grenze wurde jede Anforderung des Betriebs seit jeher abonniert, nur
 * um die aktuellen zu zeigen. Bei zwanzig Monteuren kommen im Jahr mehrere
 * tausend zusammen.
 */
const ANFORDERUNGEN_JE_SEITE = 200;

export default function StockView() {
  const { user } = useAuth();
  const toast = useToast();
  /*
    DER REITER STEHT IN DER ADRESSE (Testbericht 30.09.2026, G8): „Zurück“,
    Neuladen und ein geteilter Link landen auf demselben Reiter. Vorher
    blieb die Adresse /lager, und ein Neuladen im Katalog sprang auf den
    Bestand zurück. Ein unbekannter oder nicht erlaubter Wert gilt als Bestand.
  */
  const [params, setParams] = useSearchParams();
  const gewuenscht = params.get('reiter');
  const tab: Tab = gewuenscht === 'katalog' || (gewuenscht === 'import' && darfEinspielenFuer(user))
    ? gewuenscht
    : 'bestand';
  const setTab = (t: Tab) => {
    const neu = new URLSearchParams(params);
    if (t === 'bestand') neu.delete('reiter');
    else neu.set('reiter', t);
    setParams(neu);
  };
  // Am Telefon läuft die Reiterleiste seitlich: der gewählte Reiter bleibt im Bild.
  const reiterleiste = useReiterImBild<HTMLDivElement>(tab);
  // Die Leitung — oder die Verwaltung mit Freigabe „Katalog einspielen“ (M37).
  const darfEinspielen = user ? darfKatalogEinspielen(user) : false;
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  const [orders, setOrders] = useState<WithId<MaterialOrder>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — der Bestand steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  /**
   * Welcher Artikel im Katalog geöffnet werden soll.
   *
   * AUS DEM BETRIEB: im Lager gab es nur den Wareneingang. Alles andere —
   * eine falsche Bezeichnung, eine vertauschte Artikelnummer, ein Bestand,
   * der nach der Inventur nicht stimmt — ging nur über den Katalogreiter, wo
   * man den Artikel erneut suchen musste. Die Bearbeitung liegt weiterhin
   * dort (sie ist dieselbe und soll es bleiben), aber der Weg dorthin führt
   * jetzt direkt aus der Zeile.
   */
  const [zuBearbeiten, setZuBearbeiten] = useState<WithId<Material> | null>(null);
  /* Warum der Katalog eine Grenze braucht: siehe `lib/db/materials.ts`. */
  const [grenze, setGrenze] = useState(KATALOG_GRENZE);

  useEffect(() => {
    if (!user) return;
    const unsubM = subscribeMaterials(
      user.companyId,
      (rows) => {
        setMaterials(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
      grenze,
    );
    /**
     * Der Fehlerweg des Abos war `() => undefined`. Scheitert die Abfrage —
     * etwa an den Regeln —, blieb die Liste der Anforderungen dauerhaft leer
     * und sah aus wie „nichts angefordert". Das ist derselbe verschluckte
     * Fehler, der beim Handwerksschein schon einmal als „leeres Auswahlfeld"
     * gemeldet wurde.
     */
    const unsubO = subscribeAllOrders(
      user.companyId,
      ANFORDERUNGEN_JE_SEITE,
      setOrders,
      () => setNebenFehler('Die Anforderungen'),
    );
    return () => {
      unsubM();
      unsubO();
    };
  }, [user, grenze]);

  /**
   * Was ist zugesagt, aber noch nicht abgeholt?
   *
   * Der reine Lagerstand täuscht sonst: 20 Stück im Regal, von denen 18
   * bereits drei Monteuren zugesagt sind, sind keine 20 verfügbaren Stück.
   */
  /*
    DIE ZAHLEN DER DATENBANK (Testbericht 30.09.2026, M32, G19): zugesagte
    Anforderungen und Rüstlisten ab heute, nach derselben Regel, mit der
    „Aus Lager“ prüft. Neu geholt, sobald sich Artikel oder Anforderungen
    bewegen. Bis sie da sind — oder wenn sie ausbleiben —, rechnet die
    Ansicht wie bisher selbst.
  */
  const [stand, setStand] = useState<Map<string, LagerStand> | null>(null);
  useEffect(() => {
    if (!user) return;
    let weg = false;
    Promise.resolve()
      .then(() => lagerFrei())
      .then((k) => { if (!weg) setStand(k); })
      // Schlägt ein Nachladen fehl, bleibt der letzte Stand — besser als zurück auf die eigene Rechnung.
      .catch(() => undefined);
    return () => { weg = true; };
  }, [user, materials, orders]);

  const selbstGerechnet = useMemo(() => {
    // Rückfall auf den Namen: nicht jede Anforderung trägt eine materialId.
    // Der Altbestand kennt Positionen ohne Verweis (Prototyp: „nur wenn matId
    // bekannt"), und auch eine per Sprache erfasste Zeile kann sie verlieren.
    // Ohne diesen Weg zählte die Reservierung stillschweigend zu niedrig —
    // eine falsche Zahl im Lager ist schlimmer als gar keine.
    const byName = new Map<string, string>();
    for (const m of materials) byName.set(m.name.trim().toLowerCase(), m.id);

    const map = new Map<string, number>();
    for (const o of orders) {
      if (o.transactionType === 'return' || o.status === 'Erledigt') continue;
      const id = o.materialId || byName.get((o.materialName ?? '').trim().toLowerCase());
      if (!id) continue;
      map.set(id, (map.get(id) ?? 0) + (o.quantity ?? 0));
    }
    return map;
  }, [orders, materials]);

  const reserved = useMemo(() => {
    if (!stand) return selbstGerechnet;
    const map = new Map<string, number>();
    for (const [id, st] of stand) map.set(id, st.zugesagt + st.geplant);
    return map;
  }, [stand, selbstGerechnet]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...materials]
      .map((m) => ({
        ...m,
        reserved: reserved.get(m.id) ?? 0,
        free: (m.stock ?? 0) - (reserved.get(m.id) ?? 0),
      }))
      .filter((m) =>
        q ? [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q)) : true,
      )
      // Knappes zuerst — wer das Lager öffnet, will wissen, was fehlt.
      .sort((a, b) => a.free - b.free || a.name.localeCompare(b.name, 'de'));
  }, [materials, reserved, search]);

  const lowCount = useMemo(
    () => rows.filter((m) => m.free <= LOW_STOCK_THRESHOLD).length,
    [rows],
  );

  /*
    DER WARENEINGANG FRAGT IN EINEM DIALOG DER APP, nicht über
    `window.prompt` (Prüflauf 24.09.2026, F7) — seit dem Testbericht vom
    30.09.2026 (M29) mit Lieferant, Lieferschein und Bestellbezug. Dazu die
    Inventur mit Grund und das Bewegungsprotokoll je Artikel (M28): der
    Bestand ändert sich nur noch über Bewegungen.
  */
  const [eingang, setEingang] = useState<WithId<Material> | null>(null);
  const [inventur, setInventur] = useState<WithId<Material> | null>(null);
  const [bewegungen, setBewegungen] = useState<WithId<Material> | null>(null);

  if (!user) return null;

  return (
    // Abstände der Designlinie „Fassung 3": 12 px am Telefon, 20 px am Schreibtisch.
    <div className="space-y-3 lg:space-y-5">
      <PageHeader title="Lager" subtitle="Bestände führen und den Materialkatalog pflegen" />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <div ref={reiterleiste} className="reiterleiste flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {([
          { key: 'bestand' as Tab, label: 'Bestand' },
          { key: 'katalog' as Tab, label: 'Katalog' },
          /*
            EINSPIELEN DARF NUR, WER AUCH EINZELN EINKAUFSPREISE SETZEN DARF.
            Dieselbe Grenze steht in der Datenbank; hier wird der Reiter nur
            nicht angeboten — für die Verwaltung wäre er ein Knopf, der
            zuverlässig abweist.
          */
          ...(darfEinspielen ? [{ key: 'import' as Tab, label: 'Katalog einspielen' }] : []),
        ]).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex min-h-touch shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition sm:px-4 ${
              tab === t.key
                ? 'border-b-brand-fixed font-semibold text-ink-deep'
                : 'border-b-transparent font-medium text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} />}

      {tab === 'import' ? (
        <Suspense fallback={<SkeletonList rows={3} />}>
          <KatalogImport />
        </Suspense>
      ) : tab === 'katalog' ? (
        <MaterialCatalog
          zuBearbeiten={zuBearbeiten}
          onUebernommen={() => setZuBearbeiten(null)}
        />
      ) : (
        <>
          <MetricRow>
            <Metric label="Artikel" value={materials.length} />
            <Metric
              label="Knapp"
              tone={lowCount > 0 ? 'warning' : 'success'}
              value={lowCount}
              // „ab 5 oder weniger“ war missverständlich (G8): gemeint ist das Freie.
              hint={`höchstens ${LOW_STOCK_THRESHOLD} frei`}
            />
            <Metric
              label="Reserviert"
              value={fmtMenge([...reserved.values()].reduce((a, b) => a + b, 0))}
              hint="zugesagt und auf Rüstlisten"
            />
          </MetricRow>

          {/* Bündig: Suche gepolstert, Bestände als Zeilen von Kante zu Kante. */}
          <Card title="Bestände" buendig>
            <div className="p-4">
              <InputField
                id="stocksearch"
                label="Suche"
                placeholder="Name, Kategorie oder Art.-Nr."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              {loading ? (
                <div className="px-4 pb-4">
                  <SkeletonList rows={5} />
                </div>
              ) : rows.length === 0 ? (
                <EmptyState>
                  {materials.length === 0
                    ? 'Noch kein Material im Katalog. Der Reiter „Katalog“ legt den ersten Eintrag an.'
                    : `Kein Material passt zu „${search}“.`}
                </EmptyState>
              ) : (
                <List>
                  {rows.map((m) => {
                    const low = m.free <= LOW_STOCK_THRESHOLD;
                    return (
                      <ListRow
                        key={m.id}
                        title={m.name}
                        subtitle={
                          (m.category || m.reserved > 0) && (
                          <>
                            {m.category}
                            {m.reserved > 0 && (
                              <>
                                {m.category && ' · '}
                                <span>
                                  {fmtMenge(m.stock ?? 0)} im Lager, {fmtMenge(m.reserved)} reserviert
                                  {stand?.get(m.id)?.geplant
                                    ? ` (davon ${fmtMenge(stand.get(m.id)!.geplant)} auf Rüstlisten)`
                                    : ''}
                                </span>
                              </>
                            )}
                          </>
                          )
                        }
                      >
                        {/*
                          UNTER NULL HEISST „FEHLT", nicht „−926 frei" (Launch-
                          Check, K2): mehr angefordert, als im Regal liegt. Aus
                          dem Lager zusagen lässt die Datenbank dann nur noch,
                          was wirklich da ist — der Rest gehört auf die
                          Einkaufsliste.
                        */}
                        {m.free < 0 ? (
                          <Warnung>{fmtMenge(-m.free)} {m.unit ?? 'Stk'} fehlen</Warnung>
                        ) : low ? (
                          <Warnung>{fmtMenge(m.free)} {m.unit ?? 'Stk'} frei</Warnung>
                        ) : (
                          <Marke>{fmtMenge(m.free)} {m.unit ?? 'Stk'} frei</Marke>
                        )}
                        <Button variant="ghost" onClick={() => setEingang(m)}>
                          Wareneingang
                        </Button>
                        <Button variant="ghost" onClick={() => setInventur(m)}>
                          Inventur
                        </Button>
                        <Button variant="ghost" onClick={() => setBewegungen(m)}>
                          Bewegungen
                        </Button>
                        {/*
                          Bezeichnung, Kategorie, Artikelnummer, Einheit UND
                          der Bestand selbst — alles im Katalogformular, das
                          es laengst gibt. Ein zweites Formular hier waere
                          eine zweite Stelle, an der dieselben Regeln
                          auseinanderlaufen koennen.
                        */}
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setZuBearbeiten(m);
                            setTab('katalog');
                          }}
                        >
                          Bearbeiten
                        </Button>
                      </ListRow>
                    );
                  })}
                </List>
              )}
              <div className="px-4 pb-3 empty:hidden">
                <Nachladen
                  geladen={materials.length}
                  grenze={grenze}
                  onMehr={() => setGrenze((g) => g + KATALOG_GRENZE)}
                  einheit="Artikel"
                  sucheSatz="Nach Name und Artikelnummer wird nur in diesen gesucht."
                />
              </div>
            </div>
          </Card>
        </>
      )}

      {eingang && (
        <WareneingangDialog
          companyId={user.companyId}
          artikel={eingang}
          onAbbrechen={() => setEingang(null)}
          onFertig={(text) => {
            setEingang(null);
            toast.success(text);
          }}
        />
      )}
      {inventur && (
        <InventurDialog
          artikel={inventur}
          onAbbrechen={() => setInventur(null)}
          onFertig={(text) => {
            setInventur(null);
            toast.success(text);
          }}
        />
      )}
      {bewegungen && <BewegungenDialog artikel={bewegungen} onSchliessen={() => setBewegungen(null)} />}
    </div>
  );
}
