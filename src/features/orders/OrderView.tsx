import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { subscribeMaterials, LOW_STOCK_THRESHOLD } from '@/lib/db/materials';
import { KATALOG_GRENZE } from '@/lib/listengrenzen';
import {
  createMaterialOrderOhneEmpfang,
  subscribeOwnOrders,
  updateOrderStatus,
  createReturn,
} from '@/lib/db/materialOrders';
import { listActiveProjects } from '@/lib/db/projects';
import type { WithId } from '@/lib/db/core';
import type { Material, MaterialOrder, Project } from '@/types';
import Card from '@/components/Card';
import Nachladen from '@/components/Nachladen';
import Button from '@/components/Button';
import { Marke, Warnung } from '@/components/Badge';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, CheckboxField } from '@/components/Field';
import BaustellenSelect from '@/components/BaustellenSelect';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { vorgemerktMeldung } from '@/lib/sync/ausgangsfach';
import { LoadingState, ErrorState, EmptyState, TeilFehler } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { abschlussText } from './abschlussText';

type Tab = 'bestellen' | 'meine' | 'retoure';

interface CartLine {
  materialId: string;
  materialName: string;
  quantity: number;
  /** Baustelle je Position — sonst landen Kosten auf der falschen Rechnung. */
  projectNumber: string;
  /**
   * Nur noch in Körben, die vor dem Umbau gespeichert wurden. Die Notiz gilt
   * für die ganze Anforderung und wird beim Absenden genommen (siehe
   * `submitCart`); an der Position ging sie verloren.
   */
  note?: string;
  /** Eilzustellung — nur mit gewählter Baustelle möglich. */
  isUrgent?: boolean;
}

/**
 * Warenkorb-Schlüssel je Mandant UND Nutzer. Mit einem festen Schlüssel sah
 * auf einem geteilten Baustellen-Tablet der nächste Angemeldete den Korb
 * seines Vorgängers — und bestellte ihn unter seinem Namen auf dessen
 * Baustelle.
 */
function cartKey(companyId: string, uid: string) {
  return `perl_cart_v2:${companyId}:${uid}`;
}

/** Material bestellen, eigene Bestellungen verfolgen, Retouren erfassen. */
/** Wie viele eigene Anforderungen geladen werden — angesehen wird das Laufende. */
const EIGENE_ANFORDERUNGEN = 100;

export default function OrderView() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('bestellen');
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [myOrders, setMyOrders] = useState<WithId<MaterialOrder>[]>([]);
  const [loading, setLoading] = useState(true);
  /* Warum der Katalog eine Grenze braucht: siehe `lib/db/materials.ts`. */
  const [grenze, setGrenze] = useState(KATALOG_GRENZE);
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — der Katalog steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Warenkorb übersteht einen Reload — auf der Baustelle geht die Verbindung
  // oder die App schon mal verloren, bevor abgeschickt wurde.
  const [cart, setCart] = useState<CartLine[]>([]);
  const [projectNumber, setProjectNumber] = useState('');
  const [note, setNote] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [search, setSearch] = useState('');
  const [toPickUp, setToPickUp] = useState<WithId<MaterialOrder> | null>(null);

  // Retoure
  const [retMaterial, setRetMaterial] = useState('');
  /** Suchtext für die Artikelauswahl der Retoure. */
  const [retSuche, setRetSuche] = useState('');
  const [retQty, setRetQty] = useState('1');
  const [retCondition, setRetCondition] = useState<'neu' | 'gebraucht' | 'defekt'>('neu');
  const [retProject, setRetProject] = useState('');
  const [retReason, setRetReason] = useState('');

  useEffect(() => {
    if (!user) return;
    // Ohne Hinweis waere das Baustellenfeld leer, und der Monteur haelt seine
    // Baustelle fuer nicht angelegt.
    listActiveProjects(user.companyId)
      .then(setProjects)
      .catch(() => setNebenFehler('Die Baustellen'));
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
    // Siehe StockView: ein stumm gescheitertes Abo sieht aus wie „nichts da".
    const unsubO = subscribeOwnOrders(
      user.companyId,
      user.uid,
      EIGENE_ANFORDERUNGEN,
      setMyOrders,
      () => setNebenFehler('Deine Anforderungen'),
    );
    return () => {
      unsubM();
      unsubO();
    };
  }, [user, grenze]);

  // Korb des angemeldeten Nutzers laden, sobald er feststeht.
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(cartKey(user.companyId, user.uid));
      setCart(raw ? (JSON.parse(raw) as CartLine[]) : []);
    } catch {
      setCart([]);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(cartKey(user.companyId, user.uid), JSON.stringify(cart));
    } catch {
      // Privater Modus o. Ä. — der Korb lebt dann nur im Speicher weiter.
    }
  }, [cart, user]);

  const sortedMaterials = useMemo(
    () => [...materials].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [materials],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedMaterials;
    // Auch Kategorie und Artikelnummer durchsuchen — danach wird real gesucht.
    return sortedMaterials.filter((m) =>
      [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [sortedMaterials, search]);

  /**
   * Hat die gewaehlte Baustelle ueberhaupt jemanden, den eine Eilmeldung
   * erreicht? Wenn nicht, sagt die Oberflaeche das VOR dem Absenden — sonst
   * wartet der Monteur auf jemanden, der nie verstaendigt wurde.
   */
  const leitungDa = useMemo(() => {
    if (!projectNumber) return false;
    const p = projects.find((x) => x.projectNumber === projectNumber);
    return (p?.projectManagers ?? []).length > 0;
  }, [projects, projectNumber]);

  /**
   * DIE ARTIKELAUSWAHL DER RETOURE IST EINE SUCHE, KEIN AUSWAHLFELD.
   *
   * Ein Auswahlfeld ist bei zwanzig Artikeln bequem und bei zweihundert
   * unbrauchbar: auf dem Telefon wird daraus eine Rolliste, durch die man
   * blind scrollt, ohne tippen zu können. Gesucht wird über dieselben drei
   * Felder wie im Katalog — Bezeichnung, Kategorie, Artikelnummer —, damit
   * man nicht zwei verschiedene Suchen lernen muss.
   */
  const retTreffer = useMemo(() => {
    const q = retSuche.trim().toLowerCase();
    if (!q) return [];
    return sortedMaterials
      .filter((m) => [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [sortedMaterials, retSuche]);

  const retGewaehlt = useMemo(
    () => materials.find((m) => m.id === retMaterial) ?? null,
    [materials, retMaterial],
  );

  const activeOrders = useMemo(
    () => myOrders.filter((o) => o.status !== 'Erledigt' && o.transactionType !== 'return'),
    [myOrders],
  );
  const doneOrders = useMemo(
    () => myOrders.filter((o) => o.status === 'Erledigt' || o.transactionType === 'return'),
    [myOrders],
  );

  function addToCart(m: WithId<Material>, qty: number) {
    if (qty <= 0) return;
    setCart((prev) => {
      // Gleiches Material auf derselben Baustelle wird zusammengefasst.
      const i = prev.findIndex(
        (l) =>
          l.materialId === m.id &&
          l.projectNumber === projectNumber &&
          !!l.isUrgent === (urgent && !!projectNumber),
      );
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], quantity: copy[i].quantity + qty };
        return copy;
      }
      return [
        ...prev,
        {
          materialId: m.id,
          materialName: m.name,
          quantity: qty,
          projectNumber,
          // Ohne Baustelle gibt es keine zustaendige Projektleitung, also
          // auch keine Eilzustellung — der Haken wird dann nicht uebernommen.
          isUrgent: urgent && !!projectNumber,
        },
      ];
    });
  }

  async function submitCart() {
    if (!user || cart.length === 0) return;
    setSaving(true);
    setError(null);
    // Positionsweise absenden und nur die erfolgreichen entfernen — bei
    // Promise.all bliebe nach einem Teilfehler unklar, was schon geschrieben ist,
    // und ein zweiter Versuch erzeugte Duplikate.
    const failed: CartLine[] = [];
    // Ohne Empfang bestätigt der Server nichts; die Anforderung liegt dann im
    // lokalen Zwischenspeicher und geht später raus. Das muss der Monteur
    // erfahren, sonst tippt er sie im Keller ein zweites Mal.
    let vorgemerkt = false;
    for (const line of cart) {
      try {
        const stand = await createMaterialOrderOhneEmpfang(user.companyId, {
          materialId: line.materialId,
          materialName: line.materialName,
          quantity: line.quantity,
          // DIE NOTIZ WIRD HIER GENOMMEN, NICHT BEIM HINZUFÜGEN. Das Feld
          // erscheint erst, wenn schon etwas im Korb liegt — eine Notiz, die
          // beim Hinzufügen an die Position gehängt wurde, war also immer
          // leer, und was danach getippt wurde, ging beim Absenden still
          // verloren. Gefunden beim Probelauf.
          note: note.trim() || line.note || '',
          projectNumber: line.projectNumber,
          isUrgent: !!line.isUrgent,
          status: 'Offen',
          transactionType: 'order',
          userId: user.uid,
          userName: user.name,
          source: 'manual',
        });
        if (stand === 'queued') vorgemerkt = true;
      } catch {
        failed.push(line);
      }
    }
    setCart(failed);
    setSaving(false);
    if (failed.length === 0) {
      setNote('');
      if (vorgemerkt) toast.info(vorgemerktMeldung('Anforderung aufgegeben'));
      else toast.success('Bestellung aufgegeben');
      setTab('meine');
    } else {
      setError(
        `${failed.length} von ${failed.length + (cart.length - failed.length)} Positionen konnten nicht gesendet werden. Sie bleiben im Warenkorb.`,
      );
    }
  }

  async function submitReturn() {
    if (!user || !retMaterial) return;
    // Ohne diese Prüfung ginge eine negative Menge als increment(-n) durch und
    // eine Retoure würde den Lagerbestand VERRINGERN.
    const qty = Math.floor(Number(retQty));
    if (!Number.isFinite(qty) || qty < 1) {
      setError('Bitte eine Menge von mindestens 1 angeben.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const mat = materials.find((m) => m.id === retMaterial);
      await createReturn(user.companyId, {
        materialId: retMaterial,
        materialName: mat?.name ?? '',
        quantity: qty,
        condition: retCondition,
        note: retReason,
        projectNumber: retProject,
        userId: user.uid,
        userName: user.name,
      });
      setRetMaterial('');
      setRetSuche('');
      setRetQty('1');
      setRetReason('');
      toast.success(
        retCondition === 'neu'
          ? 'Retoure erfasst — Material wurde dem Lager gutgeschrieben'
          : 'Retoure erfasst',
      );
    } catch (err) {
      setError(grundAus(err, 'Die Retoure konnte nicht erfasst werden.'));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'bestellen', label: 'Bestellen', count: cart.length },
    { key: 'meine', label: 'Meine Bestellungen', count: activeOrders.length },
    { key: 'retoure', label: 'Retoure' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material"
        subtitle="Von der Baustelle bei der Projektleitung anfordern, Lieferung verfolgen und Rückgaben erfassen"
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex min-h-touch shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition sm:px-4 ${
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

      {error && <ErrorState message={error} />}

      {tab === 'bestellen' && (
        <>
          {/* Eine Zeile statt einer eigenen Karte: vorher stand die
              Baustellenauswahl wie eine Hürde vor dem Katalog und schob ihn
              auf dem Telefon unter den Falz. Die Notiz ist in den Warenkorb
              gewandert — sie gehört zum Absenden, nicht zum Suchen. */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[14rem] flex-1">
                <BaustellenSelect
                  id="oproject"
                  label="Für welche Baustelle?"
                  companyId={user.companyId}
                  value={projectNumber}
                  onChange={(nr, p) => {
                    setProjectNumber(nr);
                    // Den Datensatz mit aufnehmen: die Warenkorbzeilen und die
                    // Prüfung auf eine zuständige Projektleitung schlagen hier
                    // nach. Ohne ihn stünde bei einer abgeschlossenen
                    // Baustelle die nackte Nummer statt des Kundennamens.
                    if (p) setProjects((alt) => (alt.some((x) => x.projectNumber === p.projectNumber) ? alt : [...alt, p]));
                  }}
                />
              </div>
            </div>
            {/* Direkt unter der Baustelle, weil er von ihr abhaengt: ohne
                Baustelle gibt es keine zustaendige Projektleitung und damit
                niemanden, den eine Eilmeldung erreichen koennte. */}
            <div className="flex flex-wrap items-center gap-2">
              <CheckboxField
                id="ourgent"
                label="Eilzustellung"
                checked={urgent && !!projectNumber}
                disabled={!projectNumber}
                onChange={(e) => setUrgent(e.target.checked)}
              />
              <InfoHint about="Eilzustellung">
                Die Projektleitung der Baustelle wird sofort verständigt — bei der Anforderung
                und noch einmal, sobald das Material abholbereit ist. So kann sie es auf dem
                Weg mitnehmen.
              </InfoHint>
              {/* Bleibt sichtbar statt im „i" zu verschwinden: ein
                  ausgegrautes Kaestchen ohne Begruendung ist eine Sackgasse,
                  und die Zeile verschwindet, sobald eine Baustelle steht. */}
              {!projectNumber && (
                <p className="basis-full text-sm text-ink-muted">
                  Dafür zuerst die Baustelle wählen.
                </p>
              )}
            </div>
            {projectNumber && urgent && !leitungDa && (
              <p className="rounded border border-line bg-surface-2 px-3 py-2 text-sm text-warning">
                Dieser Baustelle ist keine Projektleitung zugeteilt — die Eilmeldung erreicht
                niemanden. Die Verwaltung bekommt die Anforderung trotzdem.
              </p>
            )}
          </div>

          <Card title="Katalog">
            <InputField id="search" label="Suche"
              placeholder="Bezeichnung, Kategorie oder Artikelnummer"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="mt-4">
              {loading ? (
                <LoadingState />
              ) : filtered.length === 0 ? (
                <EmptyState>
                  {materials.length === 0
                    ? 'Der Materialkatalog ist noch leer. Die Verwaltung pflegt ihn im Material-Dashboard.'
                    : 'Kein Material passt zur Suche.'}
                </EmptyState>
              ) : (
                <List>
                  {filtered.map((m) => {
                    const low = (m.stock ?? 0) <= LOW_STOCK_THRESHOLD;
                    return (
                      <ListRow
                        key={m.id}
                        title={m.name}
                        subtitle={
                          <>
                            {m.category || 'ohne Kategorie'}
                            {' · '}
                            <span className={low ? 'font-semibold text-warning' : undefined}>
                              Lager: {m.stock ?? 0} {m.unit ?? 'Stk'}
                              {low && ' (knapp)'}
                            </span>
                          </>
                        }
                      >
                        <QtyAdder material={m} onAdd={addToCart} />
                      </ListRow>
                    );
                  })}
                </List>
              )}
              {/*
                Der Monteur sucht hier den Artikel, den er braucht. Findet er
                ihn nicht, muss dastehen, ob es ihn nicht gibt oder ob die
                Liste nur nicht so weit reicht — sonst tippt er ihn von Hand
                ein, und der Katalogeintrag mit Preis und Bestand bleibt
                ungenutzt.
              */}
              <Nachladen
                geladen={materials.length}
                grenze={grenze}
                onMehr={() => setGrenze((g) => g + KATALOG_GRENZE)}
                einheit="Artikel"
                sucheSatz="Nach Name und Artikelnummer wird nur in diesen gesucht."
              />
            </div>
          </Card>

          <Card title={`Anforderung (${cart.length})`}>
            {cart.length === 0 ? (
              <EmptyState>
                Noch nichts ausgewählt. Im Katalog oben auf „+" tippen.
              </EmptyState>
            ) : (
              <>
                <div className="mb-4">
                  <InputField id="onote" label="Notiz für die Projektleitung (optional)"
                    placeholder="z. B. dringend, bis Freitag"
                    value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <List>
                  {cart.map((line, i) => (
                    <ListRow
                      key={`${line.materialId}-${i}`}
                      title={
                        <span>
                          {line.materialName}{' '}
                          <span className="tnum text-ink-muted">×{line.quantity}</span>
                        </span>
                      }
                      subtitle={
                        [
                          line.projectNumber
                            ? projects.find((p) => p.projectNumber === line.projectNumber)
                                ?.customerName ?? line.projectNumber
                            : 'ohne Baustelle',
                          line.note,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      }
                    >
                      {line.isUrgent && <Warnung stufe="dringend">Eil</Warnung>}
                      <IconButton
                        label={`${line.materialName} entfernen`}
                        tone="danger"
                        onClick={() => setCart((prev) => prev.filter((_, x) => x !== i))}
                      >
                        ✕
                      </IconButton>
                    </ListRow>
                  ))}
                </List>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button onClick={submitCart} loading={saving} className="w-full sm:w-auto">
                    Bestellung aufgeben
                  </Button>
                  <Button variant="ghost" onClick={() => setCart([])} className="w-full sm:w-auto">
                    Warenkorb leeren
                  </Button>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {tab === 'meine' && (
        <>
          <Card title={`Offen (${activeOrders.length})`}>
            {activeOrders.length === 0 ? (
              <EmptyState>Keine offenen Bestellungen.</EmptyState>
            ) : (
              <List>
                {activeOrders.map((o) => (
                  <ListRow
                    key={o.id}
                    title={
                      <span>
                        {o.materialName} <span className="tnum text-ink-muted">×{o.quantity}</span>
                      </span>
                    }
                    subtitle={[
                      o.projectNumber,
                      o.note,
                      /*
                        WARUM ES DAUERT. Liegt es nicht im Lager, wird es beim
                        Grosshändler bestellt — das sagt dem Monteur, dass er
                        nicht vergeblich ins Lager fährt.
                      */
                      o.beschaffung === 'einkauf' && !o.geliefertAm
                        ? o.bestelltAm
                          ? 'beim Grosshändler bestellt'
                          : 'nicht im Lager — wird bestellt'
                        : '',
                    ].filter(Boolean).join(' · ')}
                  >
                    {o.isUrgent && <Warnung stufe="dringend">Eil</Warnung>}
                    <StatusBadge status={o.status} />
                    {/*
                      ABGEHOLT GEHT IMMER, nicht erst ab „Abholbereit".
                      
                      Der Status ist eine Absichtserklärung der Verwaltung, kein
                      Tatsachenbericht. Wer sich das Material selbst aus dem
                      Lager nimmt oder es beim Händler mitnimmt, ist fertig —
                      unabhängig davon, ob jemand im Büro dazu gekommen ist,
                      den Status weiterzuschalten. Vorher blieb so eine
                      Anforderung ewig offen, und der Lagerabzug unterblieb.

                      Der Abschluss zieht das Material vom Lager ab; deshalb
                      geht er weiterhin durch die Rückfrage.
                    */}
                    <Button variant="accent" onClick={() => setToPickUp(o)}>
                      Abgeholt
                    </Button>
                  </ListRow>
                ))}
              </List>
            )}
          </Card>

          <Card title={`Erledigt (${doneOrders.length})`}>
            {doneOrders.length === 0 ? (
              <EmptyState>Noch nichts erledigt.</EmptyState>
            ) : (
              <List>
                {doneOrders.map((o) => (
                  <ListRow
                    key={o.id}
                    title={
                      <span>
                        {o.materialName} <span className="tnum text-ink-muted">×{o.quantity}</span>
                      </span>
                    }
                    subtitle={[o.projectNumber, o.note].filter(Boolean).join(' · ')}
                  >
                    {o.transactionType === 'return' ? (
                      <Marke>Retoure</Marke>
                    ) : (
                      <StatusBadge status={o.status} />
                    )}
                  </ListRow>
                ))}
              </List>
            )}
          </Card>
        </>
      )}

      {tab === 'retoure' && (
        <Card
          title="Material zurückgeben"
          hint="Nur unbenutztes Material in Originalverpackung wird dem Lagerbestand wieder gutgeschrieben. Gebrauchtes und defektes Material wird nur erfasst."
        >
          <div className="space-y-4">
            {retGewaehlt ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-surface-2 px-3 py-2">
                <div>
                  <span className="section-label block">Material</span>
                  <span className="font-semibold text-ink">{retGewaehlt.name}</span>
                  <span className="block text-sm text-ink-muted">
                    {retGewaehlt.category || 'ohne Kategorie'}
                    {retGewaehlt.articleNumber ? ` · ${retGewaehlt.articleNumber}` : ''}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRetMaterial('');
                    setRetSuche('');
                  }}
                >
                  Ändern
                </Button>
              </div>
            ) : (
              <div>
                <InputField
                  id="retmat"
                  label="Material"
                  type="search"
                  placeholder="Bezeichnung, Kategorie oder Artikelnummer"
                  value={retSuche}
                  onChange={(e) => setRetSuche(e.target.value)}
                />
                {retSuche.trim() !== '' && (
                  <div className="mt-2">
                    {retTreffer.length === 0 ? (
                      <p className="text-sm text-ink-muted">Kein Material passt zur Suche.</p>
                    ) : (
                      <List>
                        {retTreffer.map((m) => (
                          <ListRow
                            key={m.id}
                            title={m.name}
                            subtitle={m.category || 'ohne Kategorie'}
                          >
                            <Button
                              variant="secondary"
                              aria-label={`${m.name} zurückgeben`}
                              onClick={() => {
                                setRetMaterial(m.id);
                                setRetSuche('');
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
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InputField id="retqty" label="Menge" type="number" min="1" value={retQty}
                onChange={(e) => setRetQty(e.target.value)} />
              <SelectField id="retcond" label="Zustand" value={retCondition}
                onChange={(e) => setRetCondition(e.target.value as typeof retCondition)}>
                <option value="neu">Neu / originalverpackt</option>
                <option value="gebraucht">Gebraucht</option>
                <option value="defekt">Defekt</option>
              </SelectField>
            </div>
            <SelectField id="retproj" label="Von welcher Baustelle? (optional)" value={retProject}
              onChange={(e) => setRetProject(e.target.value)}>
              <option value="">— keine —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.projectNumber}>
                  {p.customerName} ({p.projectNumber})
                </option>
              ))}
            </SelectField>
            <InputField id="retreason" label="Grund / Notiz" value={retReason}
              onChange={(e) => setRetReason(e.target.value)} />
            <Button onClick={submitReturn} loading={saving} disabled={!retMaterial}
              className="w-full sm:w-auto">
              Retoure erfassen
            </Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={!!toPickUp}
        title="Material abgeholt?"
        // Ohne diese beiden Zeilen stand auf dem Knopf die Vorgabe des
        // Dialogs: „Löschen", in Rot. Gefragt wurde „Material abgeholt?" —
        // wer das liest, tippt nicht auf Löschen, sondern bricht ab und
        // meldet, die Abholung lasse sich nicht bestätigen.
        confirmLabel="Abgeholt"
        confirmTone="primary"
        message={
          toPickUp
            ? abschlussText(toPickUp)
            : ''
        }
        onCancel={() => setToPickUp(null)}
        onConfirm={async () => {
          if (toPickUp) {
            try {
              await updateOrderStatus(toPickUp.id, 'Erledigt');
              toast.success('Abholung bestätigt');
            } catch (err) {
              toast.error(grundAus(err, 'Die Abholung konnte nicht gebucht werden.'));
            }
          }
          setToPickUp(null);
        }}
      />
    </div>
  );
}

/** Mengenfeld mit Hinzufügen-Knopf; hält seine Menge lokal. */
/**
 * Anfordern mit einem Griff.
 *
 * Vorher: Menge ins Zahlenfeld tippen, dann „Hinzufügen" — zwei Bedienungen
 * je Artikel, auf dem Telefon mit Arbeitshandschuhen. Der Regelfall ist ein
 * Stück, deshalb fügt „+" sofort eines hinzu; die Zahl daneben zählt hoch und
 * lässt sich für größere Mengen weiter antippen.
 */
function QtyAdder({
  material,
  onAdd,
}: {
  material: WithId<Material>;
  onAdd: (m: WithId<Material>, qty: number) => void;
}) {
  const [menge, setMenge] = useState('1');
  const [added, setAdded] = useState(0);

  const zahl = Math.floor(Number(menge.replace(',', '.')));
  const gueltig = Number.isFinite(zahl) && zahl >= 1;

  function anfordern() {
    if (!gueltig) return;
    onAdd(material, zahl);
    setAdded((n) => n + zahl);
    // Nach dem Anfordern zurück auf eins: die nächste Position ist wieder
    // eine, und eine stehengebliebene 40 wäre die teurere Überraschung.
    setMenge('1');
  }

  return (
    <div className="flex items-center gap-1">
      {added > 0 && (
        <span className="tnum mr-1 text-sm font-bold text-brand" aria-live="polite">
          ×{added}
        </span>
      )}
      {/*
        MINUS UND PLUS SIND DIE HAUPTBEDIENUNG, das Feld dazwischen der
        Ausweg für grosse Mengen. Auf der Baustelle wird mit Handschuhen
        getippt: zwei grosse Ziele treffen sicherer als ein Zahlenfeld, und
        wer dreissig Meter Rohr braucht, tippt die Zahl trotzdem direkt ein,
        statt dreissig Mal zu drücken.
      */}
      <IconButton
        label={`Menge für ${material.name} verringern`}
        onClick={() => setMenge(String(Math.max(1, (gueltig ? zahl : 1) - 1)))}
        disabled={gueltig && zahl <= 1}
      >
        −
      </IconButton>
      <input
        type="number"
        inputMode="numeric"
        min="1"
        step="1"
        value={menge}
        onChange={(e) => setMenge(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`Menge ${material.unit ?? 'Stk'} für ${material.name}`}
        className={`tnum h-11 w-14 rounded border bg-surface text-center text-base font-semibold ${
          gueltig ? 'border-line text-ink' : 'border-danger text-danger'
        }`}
      />
      <IconButton
        label={`Menge für ${material.name} erhöhen`}
        onClick={() => setMenge(String((gueltig ? zahl : 0) + 1))}
      >
        +
      </IconButton>
      <Button
        variant={added > 0 ? 'primary' : 'secondary'}
        aria-label={`${material.name} anfordern`}
        disabled={!gueltig}
        onClick={anfordern}
      >
        Anfordern
      </Button>
    </div>
  );
}
