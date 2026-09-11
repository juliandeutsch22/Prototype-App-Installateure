import { useEffect, useMemo, useState } from 'react';
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
import Badge from '@/components/Badge';
import Metric, { MetricRow } from '@/components/Metric';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import MaterialCatalog from './MaterialCatalog';

type Tab = 'bestand' | 'katalog';

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

  const lowCount = useMemo(
    () => rows.filter((m) => m.free <= LOW_STOCK_THRESHOLD).length,
    [rows],
  );

  /** Wareneingang oder Korrektur, atomar über increment. */
  async function change(m: WithId<Material>, delta: number) {
    setBusyId(m.id);
    try {
      await adjustStock(m.id, delta);
    } catch {
      setError('Der Bestand konnte nicht geändert werden.');
    } finally {
      setBusyId(null);
    }
  }

  async function book(m: WithId<Material>) {
    const eingabe = window.prompt(`Wareneingang für „${m.name}" — wie viele ${m.unit ?? 'Stk'}?`, '1');
    if (eingabe === null) return;
    const n = Math.floor(Number(eingabe.replace(',', '.')));
    // Ohne diese Prüfung ginge eine negative oder krumme Zahl als
    // increment() durch und der Wareneingang würde den Bestand senken.
    if (!Number.isFinite(n) || n < 1) {
      setError('Bitte eine ganze Menge von mindestens 1 angeben.');
      return;
    }
    await change(m, n);
    toast.success(`${n} ${m.unit ?? 'Stk'} ${m.name} eingebucht`);
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Lager" subtitle="Bestände führen und den Materialkatalog pflegen" />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {([
          { key: 'bestand' as Tab, label: 'Bestand' },
          { key: 'katalog' as Tab, label: 'Katalog' },
        ]).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex min-h-touch shrink-0 items-center gap-2 border-b-2 px-4 py-2 text-sm transition ${
              tab === t.key
                ? 'border-b-accent-deep font-bold text-accent-deep'
                : 'border-b-transparent font-medium text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} />}

      {tab === 'katalog' ? (
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
              placeholder="Bezeichnung, Kategorie oder Artikelnummer"
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
              ) : (
                <List>
                  {rows.map((m) => {
                    const low = m.free <= LOW_STOCK_THRESHOLD;
                    return (
                      <ListRow
                        key={m.id}
                        title={m.name}
                        subtitle={
                          <>
                            {m.category || 'ohne Kategorie'}
                            {m.reserved > 0 && (
                              <>
                                {' · '}
                                <span className="tnum">
                                  {m.stock ?? 0} im Lager, {m.reserved} reserviert
                                </span>
                              </>
                            )}
                          </>
                        }
                      >
                        <Badge tone={low ? 'warning' : 'gray'}>
                          {m.free} {m.unit ?? 'Stk'} frei
                        </Badge>
                        <Button
                          variant="ghost"
                          loading={busyId === m.id}
                          onClick={() => void book(m)}
                        >
                          Wareneingang
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
    </div>
  );
}
