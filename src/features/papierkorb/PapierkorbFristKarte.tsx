import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import { leseZahl } from '@/lib/zahl';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';

/** Höchstens zehn Jahre — darüber wäre es kein Hinweis mehr, und die Spalte ist eine ganze Zahl. */
const FRIST_HOECHSTENS = 3650;

/**
 * DIE FRIST DES PAPIERKORBS (M01d): nach wie vielen Tagen die Startseite der
 * Spitze auf Verworfenes hinweist. Leer heißt kein Hinweis.
 *
 * HIER UND NICHT UNTER „PERSONAL“ ODER „NUMMERNKREISE“: Wer die Frist sucht,
 * sucht sie beim Papierkorb; die Übersicht der Einstellungen findet sie über
 * ihre Stichworte. Schreiben darf sie die Spitze wie jede
 * Betriebseinstellung (`companies_aendern`) — die Seite zeigt das Feld nur
 * ihr.
 *
 * SIE LÖSCHT NICHTS. Was über ihr liegt, wird markiert; gelöscht wird erst
 * mit „Abgelaufene endgültig löschen“, nach Rückfrage.
 */
export default function PapierkorbFristKarte() {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();
  const [wert, setWert] = useState('');
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    setWert(company?.papierkorbFristTage ? String(company.papierkorbFristTage) : '');
  }, [company]);

  async function speichern() {
    if (!user) return;
    setFehler(null);
    const g = leseZahl(wert);
    if (g.fehler || (g.wert !== null && (!Number.isInteger(g.wert) || g.wert < 1 || g.wert > FRIST_HOECHSTENS))) {
      setFehler(`Bitte ganze Tage zwischen 1 und ${FRIST_HOECHSTENS} — oder leer lassen für keinen Hinweis.`);
      return;
    }
    setSpeichert(true);
    try {
      await updateCompany(user.companyId, { papierkorbFristTage: g.wert });
      await reloadCompany();
      toast.success(g.wert === null ? 'Kein Hinweis mehr zum Papierkorb' : `Hinweis nach ${g.wert} Tagen gespeichert`);
    } catch (err) {
      setFehler(grundAus(err, 'Die Frist konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <Card
      title="Frist"
      hint="Liegt ein verworfener Entwurf länger als diese Zahl an Tagen im Papierkorb, steht er hier als „über der Frist“, und die Startseite der Geschäftsführung weist darauf hin. Gelöscht wird dadurch nichts — das geschieht erst mit „Abgelaufene endgültig löschen“. Scheine, die vor dem 06.11.2026 verworfen wurden, tragen keinen Zeitpunkt; für sie zählt die Frist ab diesem Tag."
    >
      <div className="formular flex flex-col gap-4">
        <InputField
          id="papierkorbFrist"
          label="Papierkorb: Hinweis nach … Tagen (leer = kein Hinweis)"
          inputMode="numeric"
          value={wert}
          onChange={(e) => setWert(e.target.value)}
        />
        {fehler && <ErrorState message={fehler} />}
        <div className="fuss-aktionen">
          <Button type="button" loading={speichert} onClick={() => void speichern()}>Speichern</Button>
        </div>
      </div>
    </Card>
  );
}
