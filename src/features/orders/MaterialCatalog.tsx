import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  subscribeMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  LOW_STOCK_THRESHOLD,
} from '@/lib/db/materials';
import type { WithId } from '@/lib/db/core';
import type { Material } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import IconButton from '@/components/IconButton';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

const empty = {
  name: '',
  category: '',
  stock: '0',
  articleNumber: '',
  unit: 'Stk',
  purchasePrice: '',
};

/**
 * Materialkatalog (Verwaltung/GF). Ohne diese Pflege bleibt die Bestellansicht
 * für einen neuen Betrieb dauerhaft leer — der Katalog ist die Grundlage von
 * Bestellungen, Lagerbestand und Materialabrechnung.
 */
export default function MaterialCatalog() {
  const { user } = useAuth();
  const toast = useToast();
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<WithId<Material> | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeMaterials(
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
    return unsub;
  }, [user]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = [...materials].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (!q) return rows;
    return rows.filter((m) =>
      [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [materials, search]);

  const lowStock = useMemo(
    () => materials.filter((m) => (m.stock ?? 0) <= LOW_STOCK_THRESHOLD).length,
    [materials],
  );

  function startEdit(m: WithId<Material>) {
    setEditId(m.id);
    setForm({
      name: m.name,
      category: m.category ?? '',
      stock: String(m.stock ?? 0),
      articleNumber: m.articleNumber ?? '',
      unit: m.unit ?? 'Stk',
      purchasePrice: m.purchasePrice != null ? String(m.purchasePrice) : '',
    });
  }
  function reset() {
    setEditId(null);
    setForm(empty);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const data = {
        name: form.name.trim(),
        category: form.category.trim(),
        stock: Number(form.stock) || 0,
        articleNumber: form.articleNumber.trim(),
        unit: form.unit.trim() || 'Stk',
        purchasePrice: form.purchasePrice === '' ? undefined : Number(form.purchasePrice) || 0,
      };
      if (editId) await updateMaterial(editId, data);
      else await createMaterial(user.companyId, data);
      toast.success(editId ? 'Material gespeichert' : 'Material angelegt');
      reset();
    } catch {
      setError('Das Material konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <Card title={editId ? 'Material bearbeiten' : 'Neues Material'}>
        <form onSubmit={submit} className="space-y-4">
          <FormGrid>
            <InputField id="mname" label="Bezeichnung" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <InputField id="mcat" label="Kategorie" placeholder="z. B. Sanitär" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <InputField id="mart" label="Artikelnummer" value={form.articleNumber}
              onChange={(e) => setForm({ ...form, articleNumber: e.target.value })} />
            <InputField id="munit" label="Einheit" placeholder="Stk" value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <InputField id="mstock" label="Lagerbestand" type="number" min="0" value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })} required />
            <InputField id="mprice" label="Einkaufspreis (€)" type="number" min="0" step="0.01"
              value={form.purchasePrice}
              onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
          </FormGrid>
          {error && <ErrorState message={error} />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              {editId ? 'Änderungen speichern' : 'Material anlegen'}
            </Button>
            {editId && (
              <Button type="button" variant="ghost" onClick={reset} className="w-full sm:w-auto">
                Abbrechen
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card
        title={`Katalog (${materials.length})`}
        action={
          lowStock > 0 ? <Badge tone="warning">{lowStock} knapp</Badge> : undefined
        }
      >
        <InputField
          id="msearch"
          label="Suche"
          placeholder="Bezeichnung, Kategorie oder Artikelnummer"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mt-4">
          {loading ? (
            <LoadingState />
          ) : visible.length === 0 ? (
            <EmptyState>
              {materials.length === 0
                ? 'Noch kein Material angelegt. Lege oben den ersten Katalogeintrag an.'
                : 'Kein Material passt zur Suche.'}
            </EmptyState>
          ) : (
            <List>
              {visible.map((m) => {
                const low = (m.stock ?? 0) <= LOW_STOCK_THRESHOLD;
                return (
                  <ListRow
                    key={m.id}
                    title={m.name}
                    subtitle={
                      [m.category, m.articleNumber && `Art.-Nr. ${m.articleNumber}`]
                        .filter(Boolean)
                        .join(' · ') || undefined
                    }
                  >
                    <Badge tone={low ? 'warning' : 'gray'}>
                      {m.stock ?? 0} {m.unit ?? 'Stk'}
                    </Badge>
                    <Button variant="ghost" onClick={() => startEdit(m)}>Bearbeiten</Button>
                    <IconButton label={`${m.name} löschen`} tone="danger" onClick={() => setToDelete(m)}>
                      ✕
                    </IconButton>
                  </ListRow>
                );
              })}
            </List>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Material löschen?"
        message={
          toDelete
            ? `„${toDelete.name}" wird aus dem Katalog entfernt. Bereits erfasste Bestellungen bleiben erhalten.`
            : ''
        }
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            if (editId === toDelete.id) reset();
            await deleteMaterial(toDelete.id);
            toast.success('Material gelöscht');
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
