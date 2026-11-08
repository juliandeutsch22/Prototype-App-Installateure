import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import { STANDARD_ZEITFELDER, standardZeitfeldAktiv, type StandardZeitfelder as Auswahl } from '@/lib/standardZeitfelder';
import { grundAus } from '@/lib/fehlerGrund';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { CheckboxField } from '@/components/Field';
import { useToast } from '@/components/Toast';

export default function StandardZeitfelder({ darf }: { darf: boolean }) {
  const { user, company, reloadCompany } = useAuth();
  const [felder, setFelder] = useState<Auswahl>(company?.zeitStandardfelder ?? {});
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => { setFelder(company?.zeitStandardfelder ?? {}); }, [company?.zeitStandardfelder]);
  const geaendert = STANDARD_ZEITFELDER.some(({ id }) => standardZeitfeldAktiv(felder, id) !== standardZeitfeldAktiv(company?.zeitStandardfelder, id));
  async function speichern() {
    if (!user || !darf) return;
    setSpeichert(true); setFehler(null);
    try {
      await updateCompany(user.companyId, { zeitStandardfelder: felder });
      await reloadCompany();
      toast.success('Standard-Zeitfelder gespeichert');
    } catch (e) { setFehler(grundAus(e, 'Die Standardfelder konnten nicht gespeichert werden.')); }
    finally { setSpeichert(false); }
  }
  return <Card title="Standardfelder" hint="Die Schalter ändern die Buchungsmaske. Vorhandene Angaben und ihre Wirkung auf Abrechnung und Budget bleiben erhalten. Datum, Person, Stand, Von/Bis und Pause sind notwendige Grundlagen der Zeitrechnung. Nachtzeiten werden weiterhin automatisch ermittelt. Die bestehenden Rollenrechte gelten zusätzlich: ein aktiviertes Feld erweitert keine Berechtigung.">
    <p className="text-sm text-ink-muted">Datum, Person, Stand, Arbeitszeit und Pause bleiben als Grundlage aktiv.</p>
    <div className="divide-y divide-line">
      {STANDARD_ZEITFELDER.map(({ id, name, grund }) => <div key={id} className="py-3">
        <CheckboxField id={`standard-${id}`} label={name} checked={standardZeitfeldAktiv(felder, id)} disabled={!darf || speichert}
          onChange={(e) => setFelder((alt) => ({ ...alt, [id]: e.target.checked }))} />
        <p className="mt-1 text-sm text-ink-muted">{grund}</p>
      </div>)}
    </div>
    {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}
    {darf && <Button variant="secondary" disabled={!geaendert || speichert} onClick={() => void speichern()}>{speichert ? 'Speichert …' : 'Standardfelder speichern'}</Button>}
  </Card>;
}
