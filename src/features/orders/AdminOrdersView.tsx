import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { postenNeuLaden } from '@/app/offenePosten';
import {
  subscribeAllOrders,
  updateOrderStatus,
  deleteOrder,
  ORDER_STATUS_FLOW,
} from '@/lib/db/materialOrders';
import type { WithId } from '@/lib/db/core';
import {
  listGrosshaendler,
  ausLager,
  aufEinkaufsliste,
  listLagerPosten,
  lieferantVorschlag,
  type Grosshaendler,
} from '@/lib/db/einkauf';
import Einkaufsliste from './Einkaufsliste';
import { aufEinkaufsliste as aufDerListe } from './einkauf';
import type { EinkaufPosten, MaterialOrder } from '@/types';
import Card from '@/components/Card';
import Nachladen from '@/components/Nachladen';
import { Marke, Warnung } from '@/components/Badge';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField } from '@/components/Field';
import RowMenu from '@/components/RowMenu';
import Button from '@/components/Button';
import { byNewest, dayKey, dayHeading } from '@/lib/timestamps';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { abschlussText } from './abschlussText';

type Tab = 'aktiv' | 'einkauf' | 'retouren' | 'archiv';

const CONDITION_LABEL: Record<string, string> = {
  neu: 'Neu / OVP',
  gebraucht: 'Gebraucht',
  defekt: 'Defekt',
};

/** Material-Dashboard: Bestellungen abarbeiten, Retouren sichten, Katalog pflegen. */
/**
 * Wie viele Anforderungen geladen werden.
 *
 * Ohne Grenze wurde jede Anforderung des Betriebs seit jeher abonniert, nur
 * um die aktuellen zu zeigen. Bei zwanzig Monteuren kommen im Jahr mehrere
 * tausend zusammen.
 */
const ANFORDERUNGEN_JE_SEITE = 200;

export default function AdminOrdersView() {
  const { user, company } = useAuth();
  const toast = useToast();
  /*
    DIE GROSSHÄNDLER — für „Nicht auf Lager" und die Einkaufsliste. Scheitert
    das Laden, bleibt die Liste leer und die Zeile kommt „ohne Grosshändler"
    auf die Einkaufsliste; zugeordnet wird dann dort.
  */
  const [grosshaendler, setGrosshaendler] = useState<WithId<Grosshaendler>[]>([]);
  const [ghStand, setGhStand] = useState(0);
  /**
   * Die eigenen Posten des Büros auf der Einkaufsliste. Kein Live-Abo: sie
   * ändern sich nur hier, und nach jeder Aktion wird neu geladen. Scheitert
   * das Laden, fehlen sie auf der Liste — das sagt die Liste dann auch.
   */
  const [lagerPosten, setLagerPosten] = useState<WithId<EinkaufPosten>[]>([]);
  const [lagerFehler, setLagerFehler] = useState(false);
  const [lagerStand, setLagerStand] = useState(0);
  /** „Nicht auf Lager" — bei welchem Grosshändler eingekauft wird. */
  const [einkaufFragen, setEinkaufFragen] = useState<{ o: WithId<MaterialOrder>; bei: string } | null>(null);
  const [orders, setOrders] = useState<WithId<MaterialOrder>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<WithId<MaterialOrder> | null>(null);
  const [tab, setTab] = useState<Tab>('aktiv');
  const [projectFilter, setProjectFilter] = useState('');
  const [suche, setSuche] = useState('');
  /**
   * Wie viele erledigte Anforderungen gezeigt werden.
   *
   * Nach einem Jahr sind das mehrere hundert, und sie standen als eine
   * einzige Liste untereinander. Wer darin etwas sucht, scrollt — und
   * findet nichts. Jetzt: Tagesgruppen, ein Suchfeld und ein Anfang von
   * fünfzig Zeilen, der sich erweitern lässt.
   */
  const [limit, setLimit] = useState(50);
  /**
   * Wie viele Anforderungen ÜBERHAUPT geholt werden.
   *
   * Das darüber ist die ANZEIGE-Grenze: sie sagt, wie viele der geholten
   * Zeilen untereinander stehen, und lässt sich am Knopf erweitern. Diese
   * hier ist die ABFRAGE-Grenze, und die stand fest bei zweihundert.
   *
   * Der Unterschied fällt erst im Archiv auf: es wächst mit jeder erledigten
   * Anforderung, und ab der zweihundertsten fehlten die ältesten — die Suche
   * fand sie nicht, und nichts unterschied das von „gibt es nicht". Genau
   * derselbe Fehler wie bei den Baustellen im September.
   */
  const [holgrenze, setHolgrenze] = useState(ANFORDERUNGEN_JE_SEITE);
  /** Bestätigung vor dem Abschluss — dabei wird das Lager reduziert. */
  const [toComplete, setToComplete] = useState<WithId<MaterialOrder> | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeAllOrders(
      user.companyId,
      holgrenze,
      (rows) => {
        setOrders(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [user, holgrenze]);

  useEffect(() => {
    if (!user) return;
    let weg = false;
    void listGrosshaendler(user.companyId)
      .then((g) => {
        if (!weg) setGrosshaendler(g);
      })
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, [user, ghStand]);

  useEffect(() => {
    if (!user) return;
    let weg = false;
    void listLagerPosten(user.companyId)
      .then((p) => {
        if (weg) return;
        setLagerPosten(p);
        setLagerFehler(false);
      })
      .catch(() => {
        if (!weg) setLagerFehler(true);
      });
    return () => {
      weg = true;
    };
  }, [user, lagerStand]);

  const purchases = useMemo(() => orders.filter((o) => o.transactionType !== 'return'), [orders]);
  /** Wie viele Anforderungen auf der Einkaufsliste noch nicht bestellt sind. */
  const zuBestellen = useMemo(
    () =>
      purchases.filter((o) => aufDerListe(o) && !o.bestelltAm).length +
      lagerPosten.filter((p) => !p.bestelltAm && !p.geliefertAm).length,
    [purchases, lagerPosten],
  );
  const returns = useMemo(() => orders.filter((o) => o.transactionType === 'return'), [orders]);

  const projectOptions = useMemo(
    () => [...new Set(purchases.map((o) => o.projectNumber).filter(Boolean))].sort() as string[],
    [purchases],
  );

  const rows = useMemo(() => {
    const base =
      tab === 'retouren'
        ? returns
        : tab === 'archiv'
          ? purchases.filter((o) => o.status === 'Erledigt')
          : purchases.filter((o) => o.status !== 'Erledigt');
    const nachProjekt = projectFilter
      ? base.filter((o) => o.projectNumber === projectFilter)
      : base;
    const q = suche.trim().toLowerCase();
    if (!q) return nachProjekt;
    return nachProjekt.filter((o) =>
      [o.materialName, o.userName, o.projectNumber, o.note].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [tab, purchases, returns, projectFilter, suche]);

  /**
   * Offene Anforderungen nach Arbeitsschritt gruppiert, Eilfälle oben.
   *
   * Vorher lagen Offen, In Bearbeitung und Abholbereit in einer Liste — man
   * musste jede Zeile lesen, um zu wissen, was als Nächstes zu tun ist. Und
   * eine Eilzustellung ging zwischen zwanzig gewöhnlichen Zeilen unter,
   * obwohl genau sie den Anlass zum Handeln gibt.
   */
  const aktivGruppen = useMemo(() => {
    if (tab !== 'aktiv') return [];
    const reihenfolge: MaterialOrder['status'][] = ['Offen', 'In Bearbeitung', 'Abholbereit'];
    return reihenfolge
      .map((status) => ({
        titel: status,
        zeilen: rows
          .filter((o) => o.status === status)
          // Eil zuerst, dann die ältesten: wer am längsten wartet, steht oben.
          .sort((a, b) => Number(!!b.isUrgent) - Number(!!a.isUrgent) || byNewest(b, a)),
      }))
      .filter((g) => g.zeilen.length > 0);
  }, [tab, rows]);

  /** Erledigtes und Retouren nach Tag gruppiert, neueste zuerst. */
  const tagesGruppen = useMemo(() => {
    if (tab === 'aktiv') return [];
    const sortiert = [...rows].sort(byNewest);
    const map = new Map<string, WithId<MaterialOrder>[]>();
    for (const o of sortiert.slice(0, limit)) {
      const k = dayKey(o.createdAt);
      const list = map.get(k) ?? [];
      list.push(o);
      map.set(k, list);
    }
    return [...map.entries()].map(([k, zeilen]) => ({ titel: dayHeading(k), zeilen }));
  }, [tab, rows, limit]);

  const activeCount = purchases.filter((o) => o.status !== 'Erledigt').length;

  async function setStatus(o: WithId<MaterialOrder>, next: MaterialOrder['status']) {
    if (next === o.status) return;
    setBusyId(o.id);
    try {
      await updateOrderStatus(o.id, next);
      // Das Abzeichen im Menü zählt mit — „Offen" ist genau das, was es zählt.
      void postenNeuLaden();
      toast.success(`Status: ${next}`);
    } catch (err) {
      // Ohne diesen Zweig blieb ein fehlgeschlagenes Update unbemerkt: der
      // Status sprang nicht um, der Nutzer sah aber keinerlei Hinweis.
      toast.error(grundAus(err, 'Der Status konnte nicht geändert werden.'));
    } finally {
      setBusyId(null);
    }
  }

  async function nimmAusLager(o: WithId<MaterialOrder>) {
    setBusyId(o.id);
    try {
      await ausLager(o.id);
      void postenNeuLaden();
      toast.success(`${o.materialName}: aus dem Lager — abholbereit`);
    } catch (err) {
      toast.error(grundAus(err, 'Das konnte nicht gespeichert werden.'));
    } finally {
      setBusyId(null);
    }
  }

  async function fragEinkauf(o: WithId<MaterialOrder>) {
    // Vorschlag: bei wem der Artikel zuletzt einen Preis hatte. Ein Vorschlag
    // — der Lagerist sieht ihn und kann ihn ändern.
    let vorschlag: string | null = null;
    try {
      vorschlag = o.materialId ? await lieferantVorschlag(o.companyId, o.materialId) : null;
    } catch {
      vorschlag = null;
    }
    const bekannt = vorschlag && grosshaendler.some((g) => g.id === vorschlag) ? vorschlag : '';
    setEinkaufFragen({ o, bei: bekannt || (grosshaendler.length === 1 ? grosshaendler[0].id : '') });
  }

  if (!user) return null;

  /*
    „LAUFEND", NICHT „OFFEN". Der Reiter zählt alles, was noch nicht erledigt
    ist — offen, in Bearbeitung, abholbereit. Das Abzeichen im Menü zählt nur
    die noch unberührten, die auf jemanden warten. Hiessen beide „offen",
    stünde im Menü 1 und am Reiter 3, und eine der beiden Zahlen sähe falsch
    aus (Prüflauf 24.09.2026, F13).
  */
  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'aktiv', label: 'Laufend', count: activeCount },
    { key: 'einkauf', label: 'Einkauf', count: zuBestellen },
    { key: 'retouren', label: 'Retouren', count: returns.length },
    { key: 'archiv', label: 'Erledigt' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Anforderungen"
        subtitle="Materialanforderungen der Monteure bearbeiten und Rückgaben sichten"
      />

      {/* Aktiver Reiter mit Akzentkante unten — gleiche Markierung wie in
          Unterreiter. */}
      <div className="reiterleiste flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex min-h-touch shrink-0 items-center gap-2 border-b-2 px-3 py-2 sm:px-4 text-sm transition ${
              tab === t.key
                ? 'border-b-accent-deep font-bold text-accent-deep'
                : 'border-b-transparent font-medium text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && <Marke>{t.count}</Marke>}
          </button>
        ))}
      </div>

      {tab === 'einkauf' && company ? (
        <>
          {lagerFehler && (
            <ErrorState message="Das eigene Material auf der Einkaufsliste konnte nicht geladen werden — die Liste zeigt nur die Anforderungen." />
          )}
          <Einkaufsliste
            company={company}
            meinUid={user.uid}
            meinName={user.name}
            anforderungen={purchases}
            lagerPosten={lagerPosten}
            grosshaendler={grosshaendler}
            onGrosshaendlerGeaendert={() => setGhStand((n) => n + 1)}
            onLagerGeaendert={() => setLagerStand((n) => n + 1)}
          />
        </>
      ) : (
        <Card
          title={tab === 'retouren' ? 'Retouren' : tab === 'archiv' ? 'Erledigt' : 'Offene Bestellungen'}
          action={
            tab !== 'retouren' && projectOptions.length > 0 ? (
              <SelectField id="ofilter" label="" className="py-1 text-sm" value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}>
                <option value="">Alle Baustellen</option>
                {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </SelectField>
            ) : undefined
          }
        >
          {orders.length >= 10 && (
            <div className="mb-4">
              <InputField
                id="osuche"
                label="Suche"
                type="search"
                placeholder="Material, Besteller, Baustelle oder Notiz"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
              />
            </div>
          )}
          {loading ? (
            <SkeletonList rows={4} />
          ) : error ? (
            <ErrorState message={error} />
          ) : rows.length === 0 ? (
            <EmptyState>
              {suche
                ? `Nichts passt zu „${suche}".`
                : tab === 'retouren'
                  ? 'Keine Retouren erfasst.'
                  : tab === 'archiv'
                    ? 'Noch nichts erledigt.'
                    : 'Aktuell keine offenen Bestellungen.'}
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {(tab === 'aktiv' ? aktivGruppen : tagesGruppen).map((g) => (
                <div key={g.titel}>
                  {/* Ueberschrift je Gruppe: erst dadurch wird aus der Liste
                      eine Ordnung, die man ueberfliegen kann. */}
                  <h3 className="section-label mb-1 flex items-center justify-between">
                    <span>{g.titel}</span>
                    <span className="font-normal text-ink-muted">{g.zeilen.length}</span>
                  </h3>
                  <List>
                    {g.zeilen.map((o) => (
                      <ListRow
                        key={o.id}
                        title={
                          <span>
                            {o.materialName}{' '}
                            <span className="text-ink-muted">×{o.quantity}</span>
                          </span>
                        }
                        subtitle={
                          <>
                            {o.userName}
                            {o.projectNumber && ` · ${o.projectNumber}`}
                            {o.condition && ` · ${CONDITION_LABEL[o.condition] ?? o.condition}`}
                            {/*
                              DIE NOTIZ BEKOMMT EINE EIGENE ZEILE. Angehängt an
                              Name und Baustelle, im selben Grau, ging sie unter —
                              gemeldet als „wird nirgends angezeigt". Sie ist oft
                              das Einzige, was die Projektleitung wirklich lesen
                              muss („bis Donnerstag", „Kiste im Keller").
                            */}
                            {o.note && (
                              <span className="mt-1 block text-ink">
                                <span className="font-medium">Notiz:</span> {o.note}
                              </span>
                            )}
                          </>
                        }
                      >
                        {o.isUrgent && <Warnung stufe="dringend">Eil</Warnung>}
                        {o.beschaffung === 'lager' && <Marke>aus Lager</Marke>}
                        {o.beschaffung === 'einkauf' && (
                          <Marke>
                            {o.geliefertAm
                              ? 'geliefert'
                              : o.bestelltAm
                                ? 'bestellt'
                                : 'Einkaufsliste'}
                            {o.supplierId && grosshaendler.find((g) => g.id === o.supplierId)
                              ? ` · ${grosshaendler.find((g) => g.id === o.supplierId)!.name}`
                              : ''}
                          </Marke>
                        )}
                        {/*
                          DER LAGERIST HAKT AB. Liegt es im Regal, ist es gleich
                          abholbereit (und der Monteur bekommt die Meldung); fehlt
                          es, kommt es auf die Einkaufsliste. Nur solange noch
                          niemand nachgesehen hat.
                        */}
                        {o.transactionType !== 'return' &&
                          !o.beschaffung &&
                          (o.status === 'Offen' || o.status === 'In Bearbeitung') && (
                            <>
                              <Button
                                variant="secondary"
                                loading={busyId === o.id}
                                onClick={() => void nimmAusLager(o)}
                              >
                                Aus Lager
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={busyId === o.id}
                                onClick={() => void fragEinkauf(o)}
                              >
                                Nicht auf Lager
                              </Button>
                            </>
                          )}
                        {o.transactionType === 'return' ? (
                          <Marke>Retoure</Marke>
                        ) : (
                          <StatusBadge status={o.status} />
                        )}

                        {/*
                          STATUS UND LÖSCHEN IM „⋯". Vorher standen je Zeile bis
                          zu sechs Bedienelemente über zwei unruhige Zeilen, und
                          der Zustand doppelt: als Punkt und als Auswahl
                          (Prüflauf 24.09.2026, D11). Sichtbar bleibt, was der
                          Lagerist täglich tut; die freie Statuswahl bleibt
                          erhalten — eine versehentlich abgeschlossene
                          Anforderung lässt sich weiter zurückholen.
                        */}
                        <RowMenu
                          about={o.materialName}
                          items={[
                            ...(o.transactionType !== 'return' && busyId !== o.id
                              ? ORDER_STATUS_FLOW.filter((st) => st !== o.status).map((st) => ({
                                  label: `Auf „${st}" setzen`,
                                  onSelect: () => {
                                    if (st === 'Erledigt') setToComplete(o);
                                    else void setStatus(o, st);
                                  },
                                }))
                              : []),
                            { label: 'Löschen', onSelect: () => setToDelete(o), danger: true },
                          ]}
                        />
                      </ListRow>
                    ))}
                  </List>
                </div>
              ))}

              {tab !== 'aktiv' && rows.length > limit && (
                <Button variant="secondary" onClick={() => setLimit((n) => n + 50)}>
                  Weitere anzeigen ({rows.length - limit})
                </Button>
              )}

              {/*
                Und darunter die ABFRAGE-Grenze. „Weitere anzeigen" oben holt
                nichts nach — es zeigt nur mehr von dem, was schon da ist. Wer
                im Archiv sucht und nichts findet, muss den Unterschied
                erfahren.
              */}
              <Nachladen
                geladen={orders.length}
                grenze={holgrenze}
                onMehr={() => setHolgrenze((g) => g + ANFORDERUNGEN_JE_SEITE)}
                einheit="Anforderungen"
                sucheSatz="Nach Artikel, Person, Baustelle und Notiz wird nur in diesen gesucht."
              />
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={!!einkaufFragen}
        title="Auf die Einkaufsliste?"
        confirmLabel="Auf die Liste"
        confirmTone="primary"
        message={
          einkaufFragen
            ? `„${einkaufFragen.o.materialName}" ×${einkaufFragen.o.quantity} ist nicht im Lager und wird beim Grosshändler bestellt.`
            : ''
        }
        onCancel={() => setEinkaufFragen(null)}
        onConfirm={async () => {
          const f = einkaufFragen;
          setEinkaufFragen(null);
          if (!f) return;
          try {
            await aufEinkaufsliste(f.o.id, f.bei || null);
            void postenNeuLaden();
            toast.success('Auf der Einkaufsliste');
          } catch (err) {
            toast.error(grundAus(err, 'Das konnte nicht gespeichert werden.'));
          }
        }}
      >
        {einkaufFragen && (
          <SelectField
            id="einkauf-bei"
            label="Grosshändler"
            value={einkaufFragen.bei}
            onChange={(e) => setEinkaufFragen({ ...einkaufFragen, bei: e.target.value })}
          >
            <option value="">— später zuordnen —</option>
            {grosshaendler.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </SelectField>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!toComplete}
        title="Bestellung abschließen?"
        confirmLabel="Abschließen"
        confirmTone="primary"
        message={
          toComplete
            ? abschlussText(toComplete)
            : ''
        }
        onCancel={() => setToComplete(null)}
        onConfirm={async () => {
          if (toComplete) await setStatus(toComplete, 'Erledigt');
          setToComplete(null);
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Eintrag löschen?"
        message={toDelete ? `„${toDelete.materialName}" ×${toDelete.quantity} wird entfernt.` : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await deleteOrder(toDelete.id);
            // Auch das Löschen nimmt einen offenen Posten weg.
            void postenNeuLaden();
            toast.success('Eintrag gelöscht');
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
