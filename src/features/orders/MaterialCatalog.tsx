import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { isTopLevel } from '@/lib/permissions';
import {
  subscribeMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  LOW_STOCK_THRESHOLD,
} from '@/lib/db/materials';
import { KATALOG_GRENZE } from '@/lib/listengrenzen';
import type { WithId } from '@/lib/db/core';
import type { Material } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Marke, Warnung } from '@/components/Badge';
import IconButton from '@/components/IconButton';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, FormGrid, Pflichthinweis } from '@/components/Field';
import InfoHint from '@/components/InfoHint';
import Nachladen from '@/components/Nachladen';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';

/**
 * Die ueblichen Mengeneinheiten im Sanitaer- und Heizungsbau.
 *
 * Als Vorschlagsliste, nicht als Zwang: ein Betrieb fuehrt auch Sonderposten,
 * und ein Auswahlfeld, das die passende Einheit nicht kennt, ist schlimmer
 * als ein freies Feld.
 */
const EINHEITEN = ['Stk', 'm', 'lfm', 'm²', 'kg', 'l', 'Pkg', 'Rolle', 'Sack', 'Paar'];

const empty = {
  name: '',
  category: '',
  stock: '0',
  articleNumber: '',
  unit: 'Stk',
  verkaufspreis: '',
  einkaufspreis: '',
};

/**
 * Materialkatalog (Verwaltung/GF). Ohne diese Pflege bleibt die Bestellansicht
 * für einen neuen Betrieb dauerhaft leer.
 *
 * DER VERKAUFSPREIS steht hier, seit Material auf die Rechnung kommt. Bis
 * dahin war der Katalog bewusst preisfrei — Materialanforderungen sind interne
 * Logistik, der Monteur sagt der Projektleitung, was er braucht, und ein Preis
 * hätte dort nur abgelenkt.
 *
 * Er ändert daran nichts: der Monteur sieht ihn nicht, und die Anforderung
 * trägt ihn auch weiterhin nicht. Gebraucht wird er an genau einer Stelle —
 * wenn das Büro aus den unterschriebenen Handwerksscheinen eine Rechnung
 * stellt. Fehlt er, steht die Zeile dort mit 0,00 € und will ausgefüllt
 * werden; das ist besser als eine erfundene Zahl.
 *
 * DER EINKAUFSPREIS steht seit dem 07.09.2026 daneben, aber nur für die
 * Geschäftsführung. Er ist die Kostenseite und damit Margendaten; die
 * Nachkalkulation rechnete ohne ihn und wies einen Deckungsbeitrag aus, der
 * systematisch zu hoch war. Dass die Verwaltung diesen Katalog pflegt und den
 * Einkaufspreis trotzdem nicht setzen darf, ist kein Widerspruch: die Grenze
 * läuft zwischen den FELDERN, nicht zwischen den Ansichten, und steht hart in
 * `firestore.rules`. Was sie nicht kann, ist das Lesen verhindern — Firestore
 * gibt ein Dokument ganz oder gar nicht heraus.
 */
/**
 * @param zuBearbeiten Ein Artikel, der beim Öffnen sofort im Formular stehen
 *   soll — so kommt man aus der Bestandsliste mit einem Griff hierher, statt
 *   den Artikel im Katalog noch einmal suchen zu müssen.
 */
export default function MaterialCatalog({
  zuBearbeiten,
  onUebernommen,
}: {
  zuBearbeiten?: WithId<Material> | null;
  onUebernommen?: () => void;
} = {}) {
  const { user } = useAuth();
  /** Den Einkaufspreis setzt nur die Geschäftsführung — er ist Margendaten. */
  const darfKosten = user ? isTopLevel(user.role) : false;
  const toast = useToast();
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<WithId<Material> | null>(null);
  /*
    Wie viele Artikel geholt werden. Der Katalog lief bis hierher ohne jede
    Grenze — warum das eine Sicherung braucht und warum sie heute nirgends
    greift, steht in `lib/db/materials.ts`.
  */
  const [grenze, setGrenze] = useState(KATALOG_GRENZE);

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
      grenze,
    );
    return unsub;
  }, [user, grenze]);

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

  /**
   * Von aussen zum Bearbeiten hereingereicht.
   *
   * `onUebernommen` meldet zurueck, dass es angekommen ist — sonst wuerde
   * derselbe Artikel bei jedem Neuzeichnen erneut ins Formular gesetzt und
   * eine begonnene Aenderung dabei verworfen.
   */
  useEffect(() => {
    if (!zuBearbeiten) return;
    startEdit(zuBearbeiten);
    onUebernommen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zuBearbeiten]);

  function startEdit(m: WithId<Material>) {
    setEditId(m.id);
    setForm({
      name: m.name,
      category: m.category ?? '',
      stock: String(m.stock ?? 0),
      articleNumber: m.articleNumber ?? '',
      unit: m.unit ?? 'Stk',
      verkaufspreis: m.verkaufspreis != null ? String(m.verkaufspreis) : '',
      einkaufspreis: m.einkaufspreis != null ? String(m.einkaufspreis) : '',
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
      /*
        LEER HEISST „NICHT GEPFLEGT", NICHT NULL.

        Ein Preis von 0,00 € und ein fehlender Preis sind für die Rechnung
        dasselbe Ergebnis, aber nicht dieselbe Aussage: der eine ist eine
        Entscheidung, der andere eine Lücke. Die Rechnung weist genau die
        Lücken aus — deshalb geht ein leeres Feld als 0 hinein und wird dort
        als „ohne Preis" behandelt.
      */
      const preis = form.verkaufspreis.trim().replace(',', '.');
      const ek = form.einkaufspreis.trim().replace(',', '.');
      const data = {
        name: form.name.trim(),
        category: form.category.trim(),
        stock: Number(form.stock) || 0,
        articleNumber: form.articleNumber.trim(),
        unit: form.unit.trim() || 'Stk',
        verkaufspreis: preis === '' ? 0 : Math.max(0, Number(preis) || 0),
        /*
          DER EINKAUFSPREIS WANDERT NUR MIT, WENN DIE ROLLE IHN SETZEN DARF.

          Serverseitig lässt die Regel eine Änderung dieses Feldes nur der
          Geschäftsführung durch. Das Formular der Verwaltung kennt den Wert
          gar nicht und trüge eine 0 ein, wo der Chef 3,50 hinterlegt hat —
          gescheitert wäre dann ihr GANZES Speichern, der Knopf täte nichts,
          und niemand wüsste warum. Sie schickt das Feld deshalb nicht mit.
        */
        ...(darfKosten
          ? { einkaufspreis: ek === '' ? 0 : Math.max(0, Number(ek) || 0) }
          : {}),
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
              onChange={(e) => setForm({ ...form, name: e.target.value })} required pflicht />
            <InputField id="mcat" label="Kategorie" placeholder="z. B. Sanitär" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <InputField id="mart" label="Artikelnummer" value={form.articleNumber}
              onChange={(e) => setForm({ ...form, articleNumber: e.target.value })} />
            {/*
              DIE EINHEIT IST DAS WORT HINTER DER ZAHL — mehr nicht.
              
              Aus dem Betrieb kam die Frage, wofür das Feld überhaupt da ist,
              und im Bestand stand daraufhin „100 20cm frei". Das ist die
              richtige Frage zur falschen Zeit gewesen: das Feld sagte nirgends,
              was es will, und eine Abmessung ist dort das Naheliegendste.
              Jetzt schlägt es die üblichen Einheiten vor und erklärt sich.
            */}
            <div>
              <InputField
                id="munit"
                label="Einheit"
                placeholder="Stk"
                list="einheiten"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
              <datalist id="einheiten">
                {EINHEITEN.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-muted">
                Das Wort hinter der Zahl — „100 Stk", „30 m".
                <InfoHint about="die Einheit">
                  Sie beschriftet nur die Menge: im Katalog, im Lager und beim Wareneingang.
                  Auf Rechnungen und Angeboten wirkt sie nicht — dort trägt jede Position ihre
                  eigene Einheit. <strong>Eine Abmessung gehört nicht hierher</strong>: aus „20cm"
                  wird im Bestand „100 20cm frei". Die Größe gehört in die Bezeichnung
                  („Kupferrohr 20 cm") oder in die Artikelnummer.
                </InfoHint>
              </p>
            </div>
            <InputField id="mstock" label="Lagerbestand" type="number" min="0" value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })} required pflicht />
            <InputField
              id="mpreis"
              label="Verkaufspreis netto je Einheit (€)"
              type="number"
              min="0"
              step="0.01"
              placeholder="leer = nicht gepflegt"
              value={form.verkaufspreis}
              onChange={(e) => setForm({ ...form, verkaufspreis: e.target.value })}
            />
            {/*
              Der EINKAUFSPREIS steht nur der Geschäftsführung offen: er ist
              die Grundlage der Nachkalkulation, also Margendaten, und die
              sieht auch die Projektleitung nicht. Die harte Grenze steht in
              `firestore.rules` — hier wird das Feld nur nicht angeboten.
            */}
            {darfKosten && (
              <InputField
                id="mek"
                label="Einkaufspreis netto je Einheit (€)"
                type="number"
                min="0"
                step="0.01"
                placeholder="leer = nicht gepflegt"
                value={form.einkaufspreis}
                onChange={(e) => setForm({ ...form, einkaufspreis: e.target.value })}
              />
            )}
          </FormGrid>
          <Pflichthinweis />
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
          lowStock > 0 ? <Warnung>{lowStock} knapp</Warnung> : undefined
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
            <SkeletonList rows={4} />
          ) : visible.length === 0 ? (
            <EmptyState
              action={
                materials.length === 0 ? (
                  <Button onClick={() => document.getElementById('mname')?.focus()}>
                    Erstes Material anlegen
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setSearch('')}>
                    Suche zurücksetzen
                  </Button>
                )
              }
            >
              {materials.length === 0
                ? 'Noch kein Material im Katalog. Was der Monteur anfordern kann, muss hier stehen.'
                : `Kein Material passt zu „${search}".`}
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
                    {low ? (
                      <Warnung>{m.stock ?? 0} {m.unit ?? 'Stk'}</Warnung>
                    ) : (
                      <Marke>{m.stock ?? 0} {m.unit ?? 'Stk'}</Marke>
                    )}
                    <Button variant="ghost" onClick={() => startEdit(m)}>Bearbeiten</Button>
                    <IconButton label={`${m.name} löschen`} tone="danger" onClick={() => setToDelete(m)}>
                      ✕
                    </IconButton>
                  </ListRow>
                );
              })}
            </List>
          )}
          {/*
            Steht unter der Liste, nicht im Kopf: erst wer bis ans Ende
            gescrollt und nichts gefunden hat, braucht die Auskunft.
          */}
          <Nachladen
            geladen={materials.length}
            grenze={grenze}
            onMehr={() => setGrenze((g) => g + KATALOG_GRENZE)}
            einheit="Artikel"
            sucheSatz="Nach Name, Kategorie und Artikelnummer wird nur in diesen gesucht."
          />
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
