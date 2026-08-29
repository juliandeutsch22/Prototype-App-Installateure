import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { subscribeMaterials, LOW_STOCK_THRESHOLD } from '@/lib/db/materials';
import {
  createMaterialOrder,
  subscribeOwnOrders,
  updateOrderStatus,
  createReturn,
} from '@/lib/db/materialOrders';
import { listActiveProjects } from '@/lib/db/projects';
import type { WithId } from '@/lib/db/core';
import type { Material, MaterialOrder, Project } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

type Tab = 'bestellen' | 'meine' | 'retoure';

interface CartLine {
  materialId: string;
  materialName: string;
  quantity: number;
  /** Baustelle und Notiz je Position — sonst landen Kosten auf der falschen Rechnung. */
  projectNumber: string;
  note: string;
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
export default function OrderView() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('bestellen');
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [myOrders, setMyOrders] = useState<WithId<MaterialOrder>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Warenkorb übersteht einen Reload — auf der Baustelle geht die Verbindung
  // oder die App schon mal verloren, bevor abgeschickt wurde.
  const [cart, setCart] = useState<CartLine[]>([]);
  const [projectNumber, setProjectNumber] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [toPickUp, setToPickUp] = useState<WithId<MaterialOrder> | null>(null);

  // Retoure
  const [retMaterial, setRetMaterial] = useState('');
  const [retQty, setRetQty] = useState('1');
  const [retCondition, setRetCondition] = useState<'neu' | 'gebraucht' | 'defekt'>('neu');
  const [retProject, setRetProject] = useState('');
  const [retReason, setRetReason] = useState('');

  useEffect(() => {
    if (!user) return;
    listActiveProjects(user.companyId).then(setProjects).catch(() => undefined);
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
    );
    const unsubO = subscribeOwnOrders(user.companyId, user.uid, setMyOrders, () => undefined);
    return () => {
      unsubM();
      unsubO();
    };
  }, [user]);

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
        (l) => l.materialId === m.id && l.projectNumber === projectNumber && l.note === note,
      );
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], quantity: copy[i].quantity + qty };
        return copy;
      }
      return [
        ...prev,
        { materialId: m.id, materialName: m.name, quantity: qty, projectNumber, note },
      ];
    });
    toast.success(`${m.name} ×${qty} im Warenkorb`);
  }

  async function submitCart() {
    if (!user || cart.length === 0) return;
    setSaving(true);
    setError(null);
    // Positionsweise absenden und nur die erfolgreichen entfernen — bei
    // Promise.all bliebe nach einem Teilfehler unklar, was schon geschrieben ist,
    // und ein zweiter Versuch erzeugte Duplikate.
    const failed: CartLine[] = [];
    for (const line of cart) {
      try {
        await createMaterialOrder(user.companyId, {
          materialId: line.materialId,
          materialName: line.materialName,
          quantity: line.quantity,
          note: line.note,
          projectNumber: line.projectNumber,
          status: 'Offen',
          transactionType: 'order',
          userId: user.uid,
          userName: user.name,
          source: 'manual',
        });
      } catch {
        failed.push(line);
      }
    }
    setCart(failed);
    setSaving(false);
    if (failed.length === 0) {
      setNote('');
      toast.success('Bestellung aufgegeben');
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
      setRetQty('1');
      setRetReason('');
      toast.success(
        retCondition === 'neu'
          ? 'Retoure erfasst — Material wurde dem Lager gutgeschrieben'
          : 'Retoure erfasst',
      );
    } catch {
      setError('Die Retoure konnte nicht erfasst werden.');
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

      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex min-h-touch shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-sm transition ${
              tab === t.key
                ? 'border-b-accent font-bold text-brand'
                : 'border-b-transparent font-medium text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && <Badge tone="gray">{t.count}</Badge>}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} />}

      {tab === 'bestellen' && (
        <>
          <Card title="Für welche Baustelle?" accent="brand">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField id="oproject" label="Baustelle" value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}>
                <option value="">— keine —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.projectNumber}>
                    {p.customerName} ({p.projectNumber})
                  </option>
                ))}
              </SelectField>
              <InputField id="onote" label="Notiz" value={note}
                onChange={(e) => setNote(e.target.value)} />
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Auswahl gilt für alles, was du jetzt hinzufügst. Für eine andere Baustelle einfach
              umstellen und weiter hinzufügen.
            </p>
          </Card>

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
            </div>
          </Card>

          <Card title={`Warenkorb (${cart.length})`} accent={cart.length > 0 ? 'accent' : 'none'}>
            {cart.length === 0 ? (
              <EmptyState>Noch nichts ausgewählt.</EmptyState>
            ) : (
              <>
                <List>
                  {cart.map((line, i) => (
                    <ListRow
                      key={`${line.materialId}-${i}`}
                      title={
                        <span>
                          {line.materialName}{' '}
                          <span className="font-mono text-ink-muted">×{line.quantity}</span>
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
                        {o.materialName} <span className="font-mono text-ink-muted">×{o.quantity}</span>
                      </span>
                    }
                    subtitle={[o.projectNumber, o.note].filter(Boolean).join(' · ')}
                  >
                    <StatusBadge status={o.status} />
                    {/* Der Abschluss zieht das Material vom Lager ab. */}
                    {o.status === 'Abholbereit' && (
                      <Button variant="accent" onClick={() => setToPickUp(o)}>
                        Abgeholt
                      </Button>
                    )}
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
                        {o.materialName} <span className="font-mono text-ink-muted">×{o.quantity}</span>
                      </span>
                    }
                    subtitle={[o.projectNumber, o.note].filter(Boolean).join(' · ')}
                  >
                    {o.transactionType === 'return' ? (
                      <Badge tone="info">Retoure</Badge>
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
        <Card title="Material zurückgeben" accent="brand">
          <div className="space-y-4">
            <SelectField id="retmat" label="Material" value={retMaterial}
              onChange={(e) => setRetMaterial(e.target.value)} required>
              <option value="">— bitte wählen —</option>
              {sortedMaterials.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </SelectField>
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
            <p className="rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-ink-muted">
              Nur unbenutztes Material in Originalverpackung wird dem Lagerbestand wieder
              gutgeschrieben. Gebrauchtes und defektes Material wird nur erfasst.
            </p>
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
        message={
          toPickUp
            ? `„${toPickUp.materialName}" ×${toPickUp.quantity} wird als erledigt gebucht und vom Lagerbestand abgezogen.`
            : ''
        }
        onCancel={() => setToPickUp(null)}
        onConfirm={async () => {
          if (toPickUp) {
            try {
              await updateOrderStatus(toPickUp.id, 'Erledigt');
              toast.success('Abholung bestätigt');
            } catch {
              toast.error('Die Abholung konnte nicht gebucht werden.');
            }
          }
          setToPickUp(null);
        }}
      />
    </div>
  );
}

/** Mengenfeld mit Hinzufügen-Knopf; hält seine Menge lokal. */
function QtyAdder({
  material,
  onAdd,
}: {
  material: WithId<Material>;
  onAdd: (m: WithId<Material>, qty: number) => void;
}) {
  const [qty, setQty] = useState('1');
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min="1"
        aria-label={`Menge ${material.name}`}
        className="min-h-touch w-20 rounded-sm border border-line px-3 py-2 text-ink"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />
      <Button
        variant="secondary"
        onClick={() => {
          onAdd(material, Number(qty) || 0);
          setQty('1');
        }}
      >
        Hinzufügen
      </Button>
    </div>
  );
}
