import { useState, type FormEvent } from 'react';
import { topAendern, topAnlegen } from '@/lib/db/liegenschaften';
import type { LiegenschaftTop } from '@/types';
import Button from '@/components/Button';
import { CheckboxField, FormGrid, InputField, TextareaField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';

/**
 * EIN TOP ANLEGEN ODER ÄNDERN (M02c): Bezeichnung (Pflicht, eindeutig je
 * Liegenschaft — der Server weist ein zweites „Top 5“ ab), Stockwerk bzw.
 * Lage frei, Notiz; beim Ändern „aktiv“.
 */
export default function TopFormular({
  companyId,
  liegenschaftId,
  top,
  onGespeichert,
  onAbbrechen,
}: {
  companyId: string;
  liegenschaftId: string;
  top?: LiegenschaftTop;
  onGespeichert: () => void;
  onAbbrechen: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({
    bezeichnung: top?.bezeichnung ?? '',
    lage: top?.lage ?? '',
    notiz: top?.notiz ?? '',
    aktiv: top?.aktiv !== false,
  });
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!f.bezeichnung.trim()) {
      setFehler('Bitte eine Bezeichnung angeben, etwa „Top 5“.');
      return;
    }
    setFehler(null);
    setSpeichert(true);
    try {
      if (top) {
        await topAendern(top.id, f);
        toast.success(`${f.bezeichnung.trim()} gespeichert`);
      } else {
        await topAnlegen(companyId, liegenschaftId, f);
        toast.success(`${f.bezeichnung.trim()} angelegt`);
      }
      onGespeichert();
    } catch (err) {
      setFehler(grundAus(err, 'Das Top konnte nicht gespeichert werden.', {
        doppelt: `„${f.bezeichnung.trim()}“ gibt es in dieser Liegenschaft schon.`,
      }));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <form onSubmit={(e) => void speichern(e)} className="formular flex flex-col gap-4"
      aria-label={top ? 'Top ändern' : 'Top anlegen'} noValidate>
      <FormGrid>
        <InputField id="top-bezeichnung" label="Bezeichnung" pflicht maxLength={80} placeholder="z. B. Top 5"
          value={f.bezeichnung} onChange={(e) => setF({ ...f, bezeichnung: e.target.value })} />
        <InputField id="top-lage" label="Stockwerk bzw. Lage" maxLength={120} placeholder="z. B. 2. OG links"
          value={f.lage} onChange={(e) => setF({ ...f, lage: e.target.value })} />
      </FormGrid>
      <TextareaField id="top-notiz" label="Notiz" rows={2} maxLength={2000}
        value={f.notiz} onChange={(e) => setF({ ...f, notiz: e.target.value })} />
      {top && (
        <CheckboxField id="top-aktiv" label="Aktiv (inaktive stehen nicht mehr zur Wahl)"
          checked={f.aktiv} onChange={(e) => setF({ ...f, aktiv: e.target.checked })} />
      )}
      {fehler && <ErrorState message={fehler} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={speichert}>{top ? 'Änderung speichern' : 'Top anlegen'}</Button>
        <Button type="button" variant="ghost" onClick={onAbbrechen} disabled={speichert}>Abbrechen</Button>
      </div>
    </form>
  );
}
