import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { imLager, istKnapp } from './lagerartikel';
import { useSearchParams } from 'react-router-dom';
import RowMenu from '@/components/RowMenu';
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
import { Warnung } from '@/components/Badge';
import Metric, { MetricRow } from '@/components/Metric';
import PageHeader from '@/components/PageHeader';
import BottomSheet from '@/components/BottomSheet';
import { List, ListRow } from '@/components/ListRow';
import { InputField } from '@/components/Field';
import { MehrAnzeigen, Segmente } from '@/components/LotBausteine';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import MaterialCatalog from './MaterialCatalog';
import { Bewegungsverlauf, InventurDialog, WareneingangDialog } from './LagerDialoge';

/*
  Der Katalogimport wird erst beim Öffnen geladen. Er bringt den
  DATANORM-Leser mit, und den braucht niemand, der nur den Bestand nachsieht.
*/
const KatalogImport = lazy(() => import('@/features/materials/KatalogImport'));

type Tab = 'bestand' | 'katalog' | 'import';
/** Der Filter des Bestands — „knapp“ schliesst „fehlt“ ein, wie auf der Startseite. */
type Filter = 'alle' | 'knapp' | 'fehlt';

const darfEinspielenFuer = (user: Parameters<typeof darfKatalogEinspielen>[0] | null | undefined) =>
  user ? darfKatalogEinspielen(user) : false;

/** Gruppen höchstens 20 Zeilen (Regel 4) — auch die Artikelwahl. */
const JE_SEITE = 20;

/** Gesucht wird über Name, Kategorie und Artikelnummer — wie im Katalog. */
function passtZurSuche(m: Pick<Material, 'name' | 'category' | 'articleNumber'>, text: string) {
  const q = text.trim().toLowerCase();
  return q ? [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q)) : true;
}

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
  // Die Leitung — oder die Verwaltung mit Freigabe „Katalog einspielen“ (M37).
  const darfEinspielen = user ? darfKatalogEinspielen(user) : false;
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  const [orders, setOrders] = useState<WithId<MaterialOrder>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — der Bestand steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  /*
    DER FILTER STEHT IN DER ADRESSE (Regel 7.5). „knapp“ kam schon vorher von
    der Startseite (`/lager?filter=knapp`, Nachtest 01.10.2026) und stand als
    Hinweiszeile über der Liste; jetzt ist er eines der drei Segmente.
  */
  const filterWert = params.get('filter');
  const filter: Filter = filterWert === 'knapp' || filterWert === 'fehlt' ? filterWert : 'alle';
  const setFilter = (f: Filter) => {
    const neu = new URLSearchParams(params);
    if (f === 'alle') neu.delete('filter');
    else neu.set('filter', f);
    setParams(neu, { replace: true });
  };
  /**
   * Welcher Artikel im Katalog geöffnet werden soll.
   *
   * AUS DEM BETRIEB: im Lager gab es nur den Wareneingang. Alles andere —
   * eine falsche Bezeichnung, eine vertauschte Artikelnummer, ein Bestand,
   * der nach der Inventur nicht stimmt — ging nur über den Katalogreiter, wo
   * man den Artikel erneut suchen musste. Die Bearbeitung liegt weiterhin
   * dort (sie ist dieselbe und soll es bleiben), aber der Weg dorthin führt
   * jetzt direkt aus dem Artikel.
   */
  const [zuBearbeiten, setZuBearbeiten] = useState<WithId<Material> | null>(null);
  /* Warum der Katalog eine Grenze braucht: siehe `lib/db/materials.ts`. */
  const [grenze, setGrenze] = useState(KATALOG_GRENZE);
  const [gezeigt, setGezeigt] = useState(JE_SEITE);

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
    bewegen. Bleiben sie aus, rechnet die Ansicht wie bisher selbst.

    SEIT 10.10.2026 NICHT MEHR „BIS SIE DA SIND“ (Analyse des Ladens): dann
    stand erst die eigene Rechnung, Augenblicke später die der Datenbank —
    zwei verschiedene Zahlen für „frei“ und „reserviert“. Bis zur ersten
    Antwort (oder ihrem Fehler) stehen Platzhalter.
  */
  const [stand, setStand] = useState<Map<string, LagerStand> | null>(null);
  const [standFertig, setStandFertig] = useState(false);
  useEffect(() => {
    if (!user) return;
    let weg = false;
    Promise.resolve()
      .then(() => lagerFrei(materials.map((m) => m.id)))
      .then((k) => { if (!weg) setStand(k); })
      // Schlägt ein Nachladen fehl, bleibt der letzte Stand — besser als zurück auf die eigene Rechnung.
      .catch(() => undefined)
      // Erst wenn die Artikel da sind, ist die Antwort eine über den Bestand.
      .finally(() => { if (!weg && !loading) setStandFertig(true); });
    return () => { weg = true; };
  }, [user, materials, orders, loading]);
  /** Frei und reserviert stehen erst mit der Antwort der Datenbank — oder ihrem Fehler. */
  const bestandBereit = !loading && standFertig;

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

  /** Alle Lagerartikel mit freiem und reserviertem Bestand — Grundlage für Liste und Wahl. */
  const lagerZeilen = useMemo(
    () =>
      materials
        .filter(imLager)
        .map((m) => ({
          ...m,
          reserved: reserved.get(m.id) ?? 0,
          free: (m.stock ?? 0) - (reserved.get(m.id) ?? 0),
        })),
    [materials, reserved],
  );

  const rows = useMemo(
    () =>
      lagerZeilen
        .filter((m) => passtZurSuche(m, search))
        .filter((m) =>
          filter === 'fehlt'
            ? m.free < 0
            : filter === 'knapp'
              ? istKnapp(m.free, m, LOW_STOCK_THRESHOLD)
              : true,
        )
        // Knappes zuerst — wer das Lager öffnet, will wissen, was fehlt.
        .sort((a, b) => a.free - b.free || a.name.localeCompare(b.name, 'de')),
    [lagerZeilen, search, filter],
  );

  const lowCount = useMemo(
    () => lagerZeilen.filter((m) => istKnapp(m.free, m, LOW_STOCK_THRESHOLD)).length,
    [lagerZeilen],
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
  /** Der Artikel im Seitenfenster — die Kennung, damit Bestand und Zahlen live mitgehen. */
  const [artikelId, setArtikelId] = useState<string | null>(null);
  /** Lädt das Bewegungsprotokoll neu, wenn aus dem Fenster gebucht wurde. */
  const [bewegungStand, setBewegungStand] = useState(0);
  /*
    WARENEINGANG UND INVENTUR AUS DEM SEITENKOPF fragen zuerst nach dem
    Artikel. Eine Lieferung kommt mit dem Lieferschein in der Hand, nicht mit
    der Zeile im Blick — wer sie einbucht, sucht den Artikel, statt die Liste
    nach ihm abzurollen.
  */
  const [wahl, setWahl] = useState<'eingang' | 'inventur' | null>(null);
  const [wahlSuche, setWahlSuche] = useState('');
  const [wahlGezeigt, setWahlGezeigt] = useState(JE_SEITE);

  const artikel = artikelId ? lagerZeilen.find((m) => m.id === artikelId) ?? null : null;
  const wahlTreffer = useMemo(
    () => [...lagerZeilen].filter((m) => passtZurSuche(m, wahlSuche)).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [lagerZeilen, wahlSuche],
  );

  if (!user) return null;

  const wahlOeffnen = (w: 'eingang' | 'inventur') => {
    setWahlSuche('');
    setWahlGezeigt(JE_SEITE);
    setWahl(w);
  };

  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        title="Lager"
        subtitle="Bestände führen und den Materialkatalog pflegen"
        hilfe={
          <>
            Der Bestand zeigt je Artikel, was frei ist und was schon für Anforderungen oder
            Rüstlisten reserviert ist. Eine Zeile öffnet den Artikel mit Kennzahlen,
            Bewegungsprotokoll, Wareneingang und Inventur.
          </>
        }
        action={<Button onClick={() => wahlOeffnen('eingang')}>Wareneingang</Button>}
        mehr={
          <RowMenu
            about="Lager"
            items={[
              { label: 'Inventur …', onSelect: () => wahlOeffnen('inventur') },
              /*
                EINSPIELEN DARF NUR, WER AUCH EINZELN EINKAUFSPREISE SETZEN DARF.
                Dieselbe Grenze steht in der Datenbank; hier wird der Eintrag nur
                nicht angeboten — für die Verwaltung wäre er ein Knopf, der
                zuverlässig abweist.
              */
              ...(darfEinspielen ? [{ label: 'Katalog einspielen', onSelect: () => setTab('import') }] : []),
            ]}
          />
        }
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <Segmente
        name="Bereich"
        werte={[
          { wert: 'bestand' as Tab, text: 'Bestand' },
          { wert: 'katalog' as Tab, text: 'Katalog' },
        ]}
        wert={tab}
        onChange={setTab}
      />

      {error && <ErrorState message={error} />}

      {tab === 'import' ? (
        <>
          <h2 className="text-lg font-semibold text-ink-deep">Katalog einspielen</h2>
          <Suspense fallback={<SkeletonList rows={3} />}>
            <KatalogImport />
          </Suspense>
        </>
      ) : tab === 'katalog' ? (
        <MaterialCatalog
          zuBearbeiten={zuBearbeiten}
          onUebernommen={() => setZuBearbeiten(null)}
        />
      ) : (
        <>
          <MetricRow>
            <Metric
              label="Im Lager"
              value={materials.filter(imLager).length}
              bereit={!loading}
              // Katalog und Lager sind getrennt (M30): nicht jeder Katalogartikel liegt im Regal.
              hint={`von ${materials.length} im Katalog`}
            />
            <Metric
              label="Knapp"
              tone={lowCount > 0 ? 'warning' : 'success'}
              value={lowCount}
              bereit={bestandBereit}
              // „ab 5 oder weniger“ war missverständlich (G8): gemeint ist das Freie.
              hint={`unter Mindestmenge, sonst höchstens ${LOW_STOCK_THRESHOLD} frei`}
              to={lowCount > 0 && filter !== 'knapp' ? '/lager?filter=knapp' : undefined}
            />
            <Metric
              label="Reserviert"
              value={fmtMenge([...reserved.values()].reduce((a, b) => a + b, 0))}
              bereit={bestandBereit}
              hint="zugesagt und auf Rüstlisten"
            />
          </MetricRow>

          <Card title="Bestände" buendig>
            <div className="lager-werkzeug">
              <div className="lager-suche">
                <InputField
                  id="stocksearch"
                  label="Suche"
                  placeholder="Name, Kategorie oder Art.-Nr."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Segmente
                name="Filter"
                werte={[
                  { wert: 'alle' as Filter, text: 'Alle' },
                  { wert: 'knapp' as Filter, text: 'knapp' },
                  { wert: 'fehlt' as Filter, text: 'fehlt' },
                ]}
                wert={filter}
                onChange={setFilter}
              />
            </div>
            <div>
              {!bestandBereit ? (
                <div className="px-4 pb-4">
                  <SkeletonList rows={5} />
                </div>
              ) : rows.length === 0 ? (
                <EmptyState>
                  {materials.length === 0
                    ? 'Noch kein Material im Katalog. Der Bereich „Katalog“ legt den ersten Eintrag an.'
                    : !materials.some(imLager)
                      ? 'Noch kein Artikel im Lager geführt. Im Katalog beim Artikel „Im Lager führen“ anhaken.'
                      : search.trim()
                        ? `Kein Lagerartikel passt zu „${search}“.`
                        : filter === 'fehlt'
                          ? 'Kein Artikel fehlt.'
                          : 'Kein Artikel ist knapp.'}
                </EmptyState>
              ) : (
                <List>
                  {rows.slice(0, gezeigt).map((m) => {
                    const low = istKnapp(m.free, m, LOW_STOCK_THRESHOLD);
                    const einheit = m.unit ?? 'Stk';
                    return (
                      <ListRow
                        key={m.id}
                        title={m.name}
                        onOeffnen={() => setArtikelId(m.id)}
                        subtitle={
                          [
                            m.category,
                            m.articleNumber && `Art.-Nr. ${m.articleNumber}`,
                            m.mindestmenge != null && `Mindestmenge ${fmtMenge(m.mindestmenge)}`,
                          ]
                            .filter(Boolean)
                            .join(' · ') || undefined
                        }
                        /*
                          STATUS NUR, WO ETWAS ZU TUN IST (Linie „Lot“, E3): „knapp“
                          oder „fehlen“. Unter null heisst „fehlen“, nicht „−926
                          frei“ (Launch-Check, K2): mehr angefordert, als im Regal
                          liegt. Aus dem Lager zusagen lässt die Datenbank dann
                          nur noch, was wirklich da ist — der Rest gehört auf die
                          Einkaufsliste.
                        */
                        zustand={
                          m.free < 0 ? (
                            <Warnung stufe="dringend">{fmtMenge(-m.free)} {einheit} fehlen</Warnung>
                          ) : low ? (
                            <Warnung>knapp</Warnung>
                          ) : undefined
                        }
                        wert={
                          <>
                            <span>{fmtMenge(Math.max(m.free, 0))} {einheit} frei</span>
                            <span className="text-ink-muted"> · {fmtMenge(m.reserved)} reserviert</span>
                          </>
                        }
                        pfeil
                      />
                    );
                  })}
                </List>
              )}
              <MehrAnzeigen anzahl={Math.max(0, rows.length - gezeigt)} onClick={() => setGezeigt((n) => n + JE_SEITE)} />
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

      {/*
        DER ARTIKEL IM SEITENFENSTER (Linie „Lot“, E3): Kennzahlen, das
        Bewegungsprotokoll als Lot und alle Aktionen, die bis zum Umbau als
        Knopf und im „⋯“ der Zeile standen — Wareneingang, Inventur,
        Bearbeiten. Die Rückfragen der Buchungen stehen allein; das Fenster
        tritt so lange zurück und kommt danach mit der neuen Bewegung wieder.
      */}
      <BottomSheet
        open={!!artikel && !eingang && !inventur}
        onClose={() => setArtikelId(null)}
        label="Artikel"
        auchBreit
        titel={artikel?.name ?? 'Artikel'}
      >
        {artikel && (
          <div className="space-y-5">
            {(artikel.category || artikel.articleNumber) && (
              <p className="text-sm text-ink-muted">
                {[artikel.category, artikel.articleNumber && `Art.-Nr. ${artikel.articleNumber}`].filter(Boolean).join(' · ')}
              </p>
            )}
            <dl className="fenster-zahlen">
              <div className="fenster-zahl">
                <dt>im Lager</dt>
                <dd>{fmtMenge(artikel.stock ?? 0)} {artikel.unit ?? 'Stk'}</dd>
              </div>
              <div className="fenster-zahl">
                <dt>reserviert</dt>
                <dd>{fmtMenge(artikel.reserved)}</dd>
                {stand?.get(artikel.id)?.geplant ? (
                  <p className="fenster-zahl-zusatz">davon {fmtMenge(stand.get(artikel.id)!.geplant)} auf Rüstlisten</p>
                ) : null}
              </div>
              <div className="fenster-zahl">
                <dt>frei</dt>
                <dd className={artikel.free < 0 ? 'text-danger' : undefined}>{fmtMenge(artikel.free)}</dd>
              </div>
              <div className="fenster-zahl">
                <dt>Mindestmenge</dt>
                <dd>{artikel.mindestmenge != null ? fmtMenge(artikel.mindestmenge) : '—'}</dd>
                {artikel.mindestmenge == null && (
                  <p className="fenster-zahl-zusatz">knapp ab höchstens {LOW_STOCK_THRESHOLD} frei</p>
                )}
              </div>
            </dl>

            <div className="material-aktionen">
              <Button onClick={() => setEingang(artikel)}>Wareneingang</Button>
              <Button variant="secondary" onClick={() => setInventur(artikel)}>Inventur</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  // Bearbeitet wird im Katalog — eine zweite Stelle mit denselben Regeln gibt es nicht.
                  setArtikelId(null);
                  setZuBearbeiten(artikel);
                  setTab('katalog');
                }}
              >
                Im Katalog bearbeiten
              </Button>
            </div>

            <div>
              <h3 className="section-label mb-3">Bewegungen</h3>
              <Bewegungsverlauf artikel={artikel} stand={bewegungStand} />
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={wahl !== null}
        onClose={() => setWahl(null)}
        label="Artikel wählen"
        auchBreit
        titel={wahl === 'inventur' ? 'Inventur: Artikel wählen' : 'Wareneingang: Artikel wählen'}
      >
        <div className="space-y-3">
          <InputField
            id="lager-wahl-suche"
            label="Artikel suchen"
            type="search"
            placeholder="Name, Kategorie oder Art.-Nr."
            value={wahlSuche}
            onChange={(e) => {
              setWahlSuche(e.target.value);
              setWahlGezeigt(JE_SEITE);
            }}
          />
          {wahlTreffer.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {lagerZeilen.length === 0
                ? 'Noch kein Artikel im Lager geführt. Im Katalog beim Artikel „Im Lager führen“ anhaken.'
                : 'Kein Lagerartikel passt zur Suche.'}
            </p>
          ) : (
            <ul className="wahl-liste" aria-label="Lagerartikel">
              {wahlTreffer.slice(0, wahlGezeigt).map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="wahl-zeile"
                    onClick={() => {
                      const w = wahl;
                      setWahl(null);
                      if (w === 'inventur') setInventur(m);
                      else setEingang(m);
                    }}
                  >
                    <span className="min-w-0">{m.name}</span>
                    <span className="wahl-zeile-info">
                      {fmtMenge(m.stock ?? 0)} {m.unit ?? 'Stk'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <MehrAnzeigen
            anzahl={Math.max(0, wahlTreffer.length - wahlGezeigt)}
            onClick={() => setWahlGezeigt((n) => n + JE_SEITE)}
          />
        </div>
      </BottomSheet>

      {eingang && (
        <WareneingangDialog
          companyId={user.companyId}
          artikel={eingang}
          onAbbrechen={() => setEingang(null)}
          onFertig={(text) => {
            setEingang(null);
            setBewegungStand((n) => n + 1);
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
            setBewegungStand((n) => n + 1);
            toast.success(text);
          }}
        />
      )}
    </div>
  );
}
