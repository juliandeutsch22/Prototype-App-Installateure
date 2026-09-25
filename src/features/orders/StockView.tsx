import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  subscribeMaterials,
  adjustStock,
  LOW_STOCK_THRESHOLD,
} from '@/lib/db/materials';
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
import { Reiter, Reiterleiste } from '@/components/Reiter';
import { List, ListRow } from '@/components/ListRow';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import MaterialCatalog from './MaterialCatalog';
import ConfirmDialog from '@/components/ConfirmDialog';
import { AB_TABELLE, useAbBreite } from '@/lib/useAbBreite';

/*
  Der Katalogimport wird erst beim Öffnen geladen. Er bringt den
  DATANORM-Leser mit, und den braucht niemand, der nur den Bestand nachsieht.
*/
const KatalogImport = lazy(() => import('@/features/materials/KatalogImport'));

type Tab = 'bestand' | 'katalog' | 'import';

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
  const [tab, setTab] = useState<Tab>('bestand');
  const darfEinspielen = user?.role === 'Geschäftsführung' || user?.role === 'Administrator';
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  const [orders, setOrders] = useState<WithId<MaterialOrder>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — der Bestand steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
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
  const reserved = useMemo(() => {
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

  /** Am Schreibtisch der Bestand als Tabelle, am Telefon als Liste. */
  const schreibtisch = useAbBreite(AB_TABELLE);

  const lowCount = useMemo(
    () => rows.filter((m) => m.free <= LOW_STOCK_THRESHOLD).length,
    [rows],
  );

  /*
    DER WARENEINGANG FRAGT IN EINEM DIALOG DER APP, nicht über
    `window.prompt`: der liess sich nicht gestalten und tat, wo der Browser
    ihn unterdrückt, beim Klick gar nichts (Prüflauf 24.09.2026, F7). Und
    ein Fehlschlag meldete sich vorher unten auf der Seite, während oben
    trotzdem „eingebucht" stand — jetzt bleibt der Dialog offen und sagt es.
  */
  const [eingang, setEingang] = useState<WithId<Material> | null>(null);
  const [eingangMenge, setEingangMenge] = useState('1');

  function book(m: WithId<Material>) {
    setEingangMenge('1');
    setEingang(m);
  }

  /** Wareneingang, atomar über increment. */
  async function eingangBuchen() {
    if (!eingang) return;
    const m = eingang;
    const n = Math.floor(Number(eingangMenge.replace(',', '.')));
    // Ohne diese Prüfung ginge eine negative oder krumme Zahl als
    // increment() durch und der Wareneingang würde den Bestand senken.
    if (!Number.isFinite(n) || n < 1) {
      throw new Error('Bitte eine ganze Menge von mindestens 1 angeben.');
    }
    setBusyId(m.id);
    try {
      await adjustStock(m.id, n);
    } finally {
      setBusyId(null);
    }
    setEingang(null);
    toast.success(`${n} ${m.unit ?? 'Stk'} ${m.name} eingebucht`);
  }

  if (!user) return null;

  /*
    ZEILENINHALT EINMAL, ZWEI FORMEN. Am Telefon steht der Bestand als
    Listenzeile, am Schreibtisch als Tabelle mit Lager, Reserviert und Frei
    in eigenen Spalten (siehe `useAbBreite`). Marke und Knöpfe sind
    dieselben — geschrieben nur einmal, damit die Formen nicht
    auseinanderlaufen.
  */
  const freiMarke = (m: (typeof rows)[number]) =>
    /*
      UNTER NULL HEISST „FEHLT", nicht „−926 frei" (Launch-Check, K2): mehr
      angefordert, als im Regal liegt. Aus dem Lager zusagen lässt die
      Datenbank dann nur noch, was wirklich da ist — der Rest gehört auf die
      Einkaufsliste.
    */
    m.free < 0 ? (
      <Warnung>{-m.free} {m.unit ?? 'Stk'} fehlen</Warnung>
    ) : m.free <= LOW_STOCK_THRESHOLD ? (
      <Warnung>{m.free} {m.unit ?? 'Stk'} frei</Warnung>
    ) : (
      <Marke>{m.free} {m.unit ?? 'Stk'} frei</Marke>
    );

  const bestandKnoepfe = (m: (typeof rows)[number]) => (
    <>
      <Button variant="ghost" loading={busyId === m.id} onClick={() => book(m)}>
        Wareneingang
      </Button>
      {/*
        Bezeichnung, Kategorie, Artikelnummer, Einheit UND der Bestand
        selbst — alles im Katalogformular, das es laengst gibt. Ein zweites
        Formular hier waere eine zweite Stelle, an der dieselben Regeln
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
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Lager" subtitle="Bestände führen und den Materialkatalog pflegen" />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <Reiterleiste>
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
          <Reiter key={t.key} aktiv={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Reiter>
        ))}
      </Reiterleiste>

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
              hint={`ab ${LOW_STOCK_THRESHOLD} oder weniger`}
            />
            <Metric
              label="Reserviert"
              value={[...reserved.values()].reduce((a, b) => a + b, 0)}
              hint="offen angefordert"
            />
          </MetricRow>

          <Card title="Bestände">
            <InputField
              id="stocksearch"
              label="Suche"
              placeholder="Name, Kategorie oder Art.-Nr."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="mt-4">
              {loading ? (
                <SkeletonList rows={5} />
              ) : rows.length === 0 ? (
                <EmptyState>
                  {materials.length === 0
                    ? 'Noch kein Material im Katalog. Der Reiter „Katalog" legt den ersten Eintrag an.'
                    : `Kein Material passt zu „${search}".`}
                </EmptyState>
              ) : schreibtisch ? (
                <div className="tabelle-rahmen">
                  <table className="tabelle">
                    <thead className="tabelle-kopfzeile">
                      <tr>
                        <th className="tabelle-kopf">Material</th>
                        <th className="tabelle-kopf">Kategorie</th>
                        <th className="tabelle-kopf-zahl">Im Lager</th>
                        <th className="tabelle-kopf-zahl">Reserviert</th>
                        <th className="tabelle-kopf">Frei</th>
                        <th className="tabelle-kopf-zahl">
                          <span className="sr-only">Aktionen</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((m) => (
                        <tr key={m.id} className="tabelle-zeile">
                          <td className="tabelle-name">{m.name}</td>
                          <td className="tabelle-zelle">{m.category}</td>
                          <td className="tabelle-zahl">{m.stock ?? 0}</td>
                          <td className="tabelle-zahl">{m.reserved}</td>
                          <td className="tabelle-zelle">{freiMarke(m)}</td>
                          <td className="tabelle-aktionen">
                            <div className="tabelle-knoepfe">{bestandKnoepfe(m)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <List>
                  {rows.map((m) => (
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
                                {m.stock ?? 0} im Lager, {m.reserved} reserviert
                              </span>
                            </>
                          )}
                        </>
                        )
                      }
                    >
                      {freiMarke(m)}
                      {bestandKnoepfe(m)}
                    </ListRow>
                  ))}
                </List>
              )}
              <Nachladen
                geladen={materials.length}
                grenze={grenze}
                onMehr={() => setGrenze((g) => g + KATALOG_GRENZE)}
                einheit="Artikel"
                sucheSatz="Nach Name und Artikelnummer wird nur in diesen gesucht."
              />
            </div>
          </Card>
        </>
      )}

      {eingang && (
        <ConfirmDialog
          open
          title={`Wareneingang: ${eingang.name}`}
          message="Die Menge kommt zum Bestand dazu."
          confirmLabel="Einbuchen"
          confirmTone="primary"
          onConfirm={eingangBuchen}
          onCancel={() => setEingang(null)}
        >
          <InputField
            id="eingang-menge"
            label={`Menge (${eingang.unit ?? 'Stk'})`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            pflicht
            value={eingangMenge}
            onChange={(e) => setEingangMenge(e.target.value)}
          />
        </ConfirmDialog>
      )}
    </div>
  );
}
