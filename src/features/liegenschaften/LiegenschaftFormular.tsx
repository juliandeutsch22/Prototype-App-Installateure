import { useState, type FormEvent } from 'react';
import { liegenschaftAendern, liegenschaftAnlegen, type LiegenschaftEingabe } from '@/lib/db/liegenschaften';
import type { Liegenschaft } from '@/types';
import AdressteileFelder from '@/components/AdressteileFelder';
import Button from '@/components/Button';
import { CheckboxField, InputField, TextareaField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { liegenschaftFehler } from './liegenschaftText';

/**
 * EINE LIEGENSCHAFT ANLEGEN ODER ÄNDERN (M02c): Bezeichnung (Pflicht), die
 * Anschrift in Teilen wie beim Kunden, Notiz; beim Ändern dazu „aktiv“ — eine
 * Liegenschaft mit Baustellen wird nicht gelöscht, sondern inaktiv gesetzt.
 */
export default function LiegenschaftFormular({
  companyId,
  liegenschaft,
  onGespeichert,
  onAbbrechen,
}: {
  companyId: string;
  /** Zum Ändern; ohne sie wird angelegt. */
  liegenschaft?: Liegenschaft;
  onGespeichert: (id: string) => void;
  onAbbrechen: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({
    bezeichnung: liegenschaft?.bezeichnung ?? '',
    strasse: liegenschaft?.strasse ?? '',
    plz: liegenschaft?.plz ?? '',
    ort: liegenschaft?.ort ?? '',
    land: liegenschaft?.land ?? 'AT',
    notiz: liegenschaft?.notiz ?? '',
    aktiv: liegenschaft?.aktiv !== false,
  });
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    const falsch = liegenschaftFehler(f);
    setFehler(falsch);
    if (falsch) return;
    const daten: LiegenschaftEingabe = { ...f };
    setSpeichert(true);
    try {
      if (liegenschaft) {
        await liegenschaftAendern(liegenschaft.id, daten);
        toast.success('Liegenschaft gespeichert');
        onGespeichert(liegenschaft.id);
      } else {
        const id = await liegenschaftAnlegen(companyId, daten);
        toast.success('Liegenschaft angelegt');
        onGespeichert(id);
      }
    } catch (err) {
      setFehler(grundAus(err, 'Die Liegenschaft konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <form onSubmit={(e) => void speichern(e)} className="formular flex flex-col gap-4"
      aria-label={liegenschaft ? 'Liegenschaft ändern' : 'Liegenschaft anlegen'} noValidate>
      <InputField id="liegenschaft-bezeichnung" label="Bezeichnung" pflicht maxLength={200}
        placeholder="z. B. Wohnhausanlage Hauptstraße 12"
        value={f.bezeichnung} onChange={(e) => setF({ ...f, bezeichnung: e.target.value })} />
      <AdressteileFelder idPrefix="liegenschaft" wert={f} onChange={(a) => setF({ ...f, strasse: a.strasse ?? '', plz: a.plz ?? '', ort: a.ort ?? '', land: a.land || 'AT' })} />
      <TextareaField id="liegenschaft-notiz" label="Notiz" rows={3} maxLength={4000}
        placeholder="z. B. Schlüssel beim Hausbesorger, Heizraum im Keller"
        value={f.notiz} onChange={(e) => setF({ ...f, notiz: e.target.value })} />
      {liegenschaft && (
        <CheckboxField id="liegenschaft-aktiv" label="Aktiv (inaktive stehen nicht mehr zur Wahl)"
          checked={f.aktiv} onChange={(e) => setF({ ...f, aktiv: e.target.checked })} />
      )}
      {fehler && <ErrorState message={fehler} />}
      {/* Der Fensterfuß wie überall (E72, R7): Linie darüber, Abbrechen gerahmt, die Hauptaktion zuletzt. */}
      <div className="planung-fuss mt-0">
        <div className="planung-fuss-knoepfe">
          <Button type="button" variant="secondary" onClick={onAbbrechen} disabled={speichert}>Abbrechen</Button>
          <Button type="submit" loading={speichert}>{liegenschaft ? 'Änderung speichern' : 'Liegenschaft anlegen'}</Button>
        </div>
      </div>
    </form>
  );
}
