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
import KuerzenDialog from '@/features/vacations/UrlaubKuerzen';

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
/**
 * Statt „Bearbeiten" und „Löschen" bei einem Tag aus einem bestätigten
 * Sonderurlaub (Plan 10.3): er ändert sich nur über den Antrag — auf der
 * Seite Urlaub, ohne das Modul Urlaub auf der Seite Sonderurlaub (A15,
 * 24.10.2026).
 */
export function FreistellungKnopf() {
  const navigate = useNavigate();
  const urlaubAn = useModul('urlaub');
  return (
    <Button variant="ghost" onClick={() => navigate(urlaubAn ? '/vacations' : '/sonderurlaub')}>
      Antrag
    </Button>
  );
}

export default function AntragKnopf({ eintrag }: { eintrag: Pick<TimeEntry, 'status' | 'vacationId'> & { date?: string } }) {
  const navigate = useNavigate();
  const urlaubAn = useModul('urlaub');
  const { user, company } = useAuth();
  const wort = eintrag.status === 'Zeitausgleich' ? 'ZA-Antrag' : 'Urlaubsantrag';
  if (urlaubAn) {
    /*
      GENAU DIESER ANTRAG (Z1, Durchsicht 15.11.2026): der Sprung führte auf
      die Urlaubsseite ohne Bezug — den Antrag einer anderen Person gab es
      dort gar nicht. Jetzt öffnet die Seite ihn, mit Verlauf und, für die,
      die entscheiden, „Kürzen“ und „Zurücknehmen“.
    */
    return (
      <Button
        variant="ghost"
        onClick={() => navigate(eintrag.vacationId ? `/vacations?antrag=${encodeURIComponent(eintrag.vacationId)}` : '/vacations')}
      >
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
      tag={eintrag.date}
    />
  );
}

function Zuruecknehmen({
  companyId,
  antragId,
  entscheiderName,
  za,
  tag,
}: {
  companyId: string;
  antragId: string;
  entscheiderName: string;
  za: boolean;
  /** Der Tag, an dem der Knopf steht — beim Kürzen als zu streichender Tag vorbelegt. */
  tag?: string;
}) {
  const toast = useToast();
  const [laedt, setLaedt] = useState(false);
  const [antrag, setAntrag] = useState<WithId<Vacation> | null>(null);
  const [grund, setGrund] = useState('');
  /*
    KÜRZEN AM TAG (Z1). Ohne das Modul Urlaub gibt es keine Liste
    „Genehmigt, noch nicht vorbei“ — gekürzt wird deshalb hier, mit diesem
    Tag als Vorschlag zum Streichen. „Zurücknehmen“ bleibt, wie es war.
  */
  const [zuKuerzen, setZuKuerzen] = useState<WithId<Vacation> | null>(null);
  const [laedtKuerzen, setLaedtKuerzen] = useState(false);

  /*
    DER ANTRAG WIRD ERST BEIM TIPPEN GELADEN. Eine Liste trägt Dutzende
    solcher Tage; je Zeile eine Abfrage, nur damit der Knopf dasteht, wäre
    Verschwendung. Erst hier wird klar, welcher Zeitraum mitgeht — und ob
    der Tag zum Betriebsurlaub gehört, der nicht für eine Person
    zurückgenommen wird.
  */
  async function oeffnen(wozu: 'zuruecknehmen' | 'kuerzen' = 'zuruecknehmen') {
    (wozu === 'kuerzen' ? setLaedtKuerzen : setLaedt)(true);
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
      if (wozu === 'kuerzen') {
        // Ein Tag allein und der stundenweise Zeitausgleich werden ganz zurückgenommen.
        if (a.von >= a.bis || a.zaVon) {
          toast.info('Dieser Antrag umfasst nur einen Tag — er wird nicht gekürzt, sondern ganz zurückgenommen.');
          return;
        }
        setZuKuerzen(a);
        return;
      }
      setGrund('');
      setAntrag(a);
    } catch (err) {
      toast.error(grundAus(err, 'Der Antrag konnte nicht geladen werden.'));
    } finally {
      setLaedt(false);
      setLaedtKuerzen(false);
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
      <Button variant="ghost" loading={laedtKuerzen} onClick={() => void oeffnen('kuerzen')}>
        Kürzen
      </Button>
      {zuKuerzen && (
        <KuerzenDialog
          antrag={zuKuerzen}
          tag={tag}
          entscheiderName={entscheiderName}
          onCancel={() => setZuKuerzen(null)}
          onFertig={() => setZuKuerzen(null)}
        />
      )}
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
