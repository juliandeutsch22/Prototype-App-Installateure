import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/Button';
import { Marke } from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthContext';
import { useModul } from '@/lib/useModule';
import { darfUrlaubEntscheiden } from '@/lib/permissions';
import { entscheiden, getVacation } from '@/lib/db/vacations';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT } from '@/lib/datum';
import type { TimeEntry, Vacation } from '@/types';
import type { WithId } from '@/lib/db/core';

/**
 * Statt „Bearbeiten" und „Löschen" bei einem Tag aus einem genehmigten Antrag.
 *
 * Die Datenbank lässt diesen Tag nur über den Antrag ändern („zurücknehmen"
 * auf der Seite Urlaub). Zwei Knöpfe anzubieten, die dann abgewiesen werden,
 * wäre die Sackgasse, die bei Krank schon einmal da war.
 *
 * OHNE DAS MODUL URLAUB gibt es die Seite nicht — Urlaub trägt das Büro aber
 * weiter über die Zeiterfassung ein, und daraus wird ein genehmigter Antrag.
 * Zurücknehmen liess er sich dann nirgends. Wer Urlaub entscheiden darf,
 * nimmt ihn deshalb hier am Tag zurück, mit demselben Aufruf und demselben
 * Pflichtgrund wie auf der Urlaubsseite. Alle anderen sehen, woher der Tag
 * kommt.
 */
export default function AntragKnopf({ eintrag }: { eintrag: Pick<TimeEntry, 'status' | 'vacationId'> }) {
  const navigate = useNavigate();
  const urlaubAn = useModul('urlaub');
  const { user, company } = useAuth();
  const wort = eintrag.status === 'Zeitausgleich' ? 'ZA-Antrag' : 'Urlaubsantrag';
  if (urlaubAn) {
    return (
      <Button variant="ghost" onClick={() => navigate('/vacations')}>
        {wort}
      </Button>
    );
  }
  const darf = !!user && darfUrlaubEntscheiden(user.role, user.uid, company?.vacationApprovers);
  if (!darf || !user || !eintrag.vacationId) return <Marke>aus {wort}</Marke>;
  return (
    <Zuruecknehmen
      companyId={user.companyId}
      antragId={eintrag.vacationId}
      entscheiderName={user.name}
      za={eintrag.status === 'Zeitausgleich'}
    />
  );
}

function Zuruecknehmen({
  companyId,
  antragId,
  entscheiderName,
  za,
}: {
  companyId: string;
  antragId: string;
  entscheiderName: string;
  za: boolean;
}) {
  const toast = useToast();
  const [laedt, setLaedt] = useState(false);
  const [antrag, setAntrag] = useState<WithId<Vacation> | null>(null);
  const [grund, setGrund] = useState('');

  /*
    DER ANTRAG WIRD ERST BEIM TIPPEN GELADEN. Eine Liste trägt Dutzende
    solcher Tage; je Zeile eine Abfrage, nur damit der Knopf dasteht, wäre
    Verschwendung. Erst hier wird klar, welcher Zeitraum mitgeht — und ob
    der Tag zum Betriebsurlaub gehört, der nicht für eine Person
    zurückgenommen wird.
  */
  async function oeffnen() {
    setLaedt(true);
    try {
      const a = await getVacation(companyId, antragId);
      if (!a) {
        toast.error('Den Antrag zu diesem Tag gibt es nicht mehr.');
        return;
      }
      if (a.betriebsurlaubId) {
        toast.info('Dieser Tag gehört zum Betriebsurlaub — er wird nicht für eine Person zurückgenommen.');
        return;
      }
      setGrund('');
      setAntrag(a);
    } catch (err) {
      toast.error(grundAus(err, 'Der Antrag konnte nicht geladen werden.'));
    } finally {
      setLaedt(false);
    }
  }

  async function bestaetigen() {
    if (!antrag) return;
    if (grund.trim().length < 3) {
      // Geworfen, damit der Dialog offen bleibt und es selbst sagt.
      throw new Error('Bitte einen Grund angeben — mindestens drei Zeichen.');
    }
    await entscheiden({ vacationId: antrag.id, entscheidung: 'Storniert', grund: grund.trim(), entscheiderName });
    setAntrag(null);
    toast.success(za ? 'Zeitausgleich zurückgenommen' : 'Urlaub zurückgenommen');
  }

  const zeitraum = antrag
    ? antrag.von === antrag.bis ? datumAT(antrag.von) : `${datumAT(antrag.von)} – ${datumAT(antrag.bis)}`
    : '';

  return (
    <>
      <Button variant="ghost" loading={laedt} onClick={() => void oeffnen()}>
        Zurücknehmen
      </Button>
      {antrag && (
        <ConfirmDialog
          open
          title={`${za ? 'Zeitausgleich' : 'Urlaub'} von ${antrag.userName} zurücknehmen?`}
          message={`${zeitraum} — alle Tage dieses Antrags verschwinden aus dem Zeitkonto; der Grund geht an ${antrag.userName}.`}
          confirmLabel="Zurücknehmen"
          onConfirm={bestaetigen}
          onCancel={() => setAntrag(null)}
        >
          <InputField
            id={`zuruecknehmen-grund-${antragId}`}
            label="Grund"
            pflicht
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
          />
        </ConfirmDialog>
      )}
    </>
  );
}
