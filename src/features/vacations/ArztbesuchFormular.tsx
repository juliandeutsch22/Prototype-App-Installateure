import { useMemo, useState, type FormEvent } from 'react';
import type { Company, Freistellung } from '@/types';
import { freistellungBeantragen, nachweisHochladen, nachweisPruefen } from '@/lib/db/freistellungen';
import { ARZTBESUCH } from '@shared/freistellung';
import { todayStr } from '@/lib/time';
import Button from '@/components/Button';
import InfoHint from '@/components/InfoHint';
import { InputField, FormGrid } from '@/components/Field';
import { ErrorState } from '@/components/States';
import Hinweiszeile from '@/components/Hinweiszeile';
import { datumAT } from '@/lib/datum';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { NachweisWahl } from './FreistellungFormular';
import { freistellungWas } from './freistellungText';
import { LoeschenKnopf } from '@/components/Symbolknoepfe';

/**
 * DER ARZTBESUCH (E35) — eine Dienstverhinderung mit Uhrzeit an einem Tag,
 * vorab oder nachträglich. Bestätigt wird vom Büro; angerechnet wird
 * höchstens, was am Tag noch zur Sollzeit fehlt.
 *
 * EIN EIGENES FORMULAR, nicht ein Anlass im Sonderurlaub: der Arztbesuch
 * hat keine Tage und keinen „Tag des Ereignisses“ — der Termin ist das
 * Ereignis. Was ihn ausmacht, sind Tag, Beginn und Ende.
 */
export default function ArztbesuchFormular({
  user,
  company,
  eigene,
  onGestellt,
}: {
  user: { uid: string; companyId: string };
  company: Company | null | undefined;
  eigene: Freistellung[];
  onGestellt: () => void;
}) {
  const toast = useToast();
  const [tag, setTag] = useState(todayStr());
  const [von, setVon] = useState('08:00');
  const [bis, setBis] = useState('10:00');
  const [notiz, setNotiz] = useState('');
  const [datei, setDatei] = useState<File | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  // Ab Werk verlangt (Spalte mit Vorgabe „ja“); nur ein ausdrückliches Nein schaltet es ab.
  const nachweisVerlangt = company?.arztbesuchNachweis !== false;

  /*
    DIE ÜBERSCHNEIDUNG SCHON IM FORMULAR — dieselbe Regel wie
    `freistellung_beantragen`: ein offener oder bestätigter eigener Antrag am
    Tag; sind beide stundenweise, zählt die Uhrzeit.
  */
  const ueberschneidung = useMemo(() => {
    if (!(bis > von)) return null;
    const andere = eigene.find((f) =>
      (f.status === 'Beantragt' || f.status === 'Bestätigt') && f.von <= tag && f.bis >= tag
      && !(f.zeitVon && f.zeitBis && (f.zeitBis.slice(0, 5) <= von || f.zeitVon.slice(0, 5) >= bis)));
    if (!andere) return null;
    const wann = andere.zeitVon && andere.zeitBis
      ? `am ${datumAT(andere.von)}, ${andere.zeitVon.slice(0, 5)}–${andere.zeitBis.slice(0, 5)}`
      : andere.von === andere.bis ? `am ${datumAT(andere.von)}` : `vom ${datumAT(andere.von)} bis ${datumAT(andere.bis)}`;
    return `Überschneidet sich mit ${freistellungWas(andere, company?.freistellungAnlaesse)} ${wann} (${andere.status}). Bitte eine andere Zeit wählen.`;
  }, [eigene, tag, von, bis, company?.freistellungAnlaesse]);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    if (!(bis > von)) {
      setFehler('Das Ende liegt vor dem Beginn.');
      return;
    }
    if (ueberschneidung) {
      setFehler(ueberschneidung);
      return;
    }
    if (datei) {
      const f = nachweisPruefen(datei);
      if (f) {
        setFehler(f);
        return;
      }
    }
    setSendet(true);
    try {
      const id = await freistellungBeantragen({
        art: 'dienstverhinderung',
        anlass: ARZTBESUCH,
        ereignisDatum: tag,
        von: tag,
        bis: tag,
        zeitVon: von,
        zeitBis: bis,
        notiz: notiz.trim() || undefined,
      });
      if (datei) {
        try {
          await nachweisHochladen(user.companyId, user.uid, id, datei);
        } catch (err) {
          // Der Antrag steht; die Bestätigung lässt sich in der Liste nachreichen.
          toast.error(grundAus(err, 'Der Arztbesuch ist gemeldet, die Bestätigung kam nicht an — bitte unten beim Antrag noch einmal hochladen.'));
        }
      }
      toast.success('Arztbesuch gemeldet');
      setNotiz('');
      setDatei(null);
      onGestellt();
    } catch (err) {
      setFehler(grundAus(err, 'Der Arztbesuch konnte nicht gemeldet werden.'));
    } finally {
      setSendet(false);
    }
  }

  return (
    <form onSubmit={absenden} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <span>Termin mit dem Weg vom Arbeitsort, vorab oder nachträglich.</span>
        <InfoHint about="Arztbesuch">
          Ein Arztbesuch in der Arbeitszeit ist bezahlt, samt dem nötigen Weg vom Arbeitsort — wenn sich der
          Termin nicht außerhalb der Arbeitszeit legen lässt. Den eigenen Hausarzt darfst du auch dann
          aufsuchen, wenn er nur während der Arbeitszeit Termine hat. Angerechnet wird höchstens, was an diesem
          Tag noch zur Sollzeit fehlt; das Büro bestätigt. Wer den ganzen Tag arbeitsunfähig ist, meldet sich
          krank. Im Wochenplan sehen die anderen nur „abwesend“ mit der Uhrzeit.
        </InfoHint>
      </div>
      <FormGrid>
        <InputField id="atag" label="Tag" type="date" pflicht required value={tag} onChange={(e) => setTag(e.target.value)} />
      </FormGrid>
      <FormGrid>
        <InputField id="avon" label="Weg vom Arbeitsort um" type="time" pflicht required value={von} onChange={(e) => setVon(e.target.value)} />
        <InputField id="abis" label="Zurück um" type="time" pflicht required value={bis} onChange={(e) => setBis(e.target.value)} />
      </FormGrid>
      {ueberschneidung && (
        <Hinweiszeile stufe="warn">
          <p>{ueberschneidung}</p>
        </Hinweiszeile>
      )}

      <InputField
        id="anotiz"
        label="Anmerkung (freiwillig, keine Diagnose)"
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <NachweisWahl id="anachweis" onWahl={setDatei} />
        {datei ? (
          <span className="flex flex-wrap items-center gap-2 text-sm text-ink">
            {datei.name}
            <LoeschenKnopf label={`${datei.name} entfernen`} onClick={() => setDatei(null)} />
          </span>
        ) : (
          <span className="text-sm text-ink-muted">
            {nachweisVerlangt ? 'Arztbestätigung — hier oder auf Papier im Büro' : 'freiwillig'}
          </span>
        )}
        <InfoHint about="Arztbestätigung">
          {nachweisVerlangt
            ? 'Der Betrieb verlangt für Arztbesuche eine Bestätigung. Ein Foto oder PDF reicht, auf Papier im Büro geht es genauso — nachreichen kannst du sie auch nach dem Termin, unten beim Antrag. '
            : 'Der Betrieb verlangt keine Bestätigung; eine hochgeladene sieht das Büro trotzdem. '}
          Darauf gehören nur Tag und Uhrzeit, keine Diagnose. Wer bestätigt, sieht sie und hakt „Nachweis geprüft“
          an; danach löscht die App die Datei. Es bleibt nur der Vermerk, wer sie wann geprüft hat.
        </InfoHint>
      </div>

      {fehler && <ErrorState message={fehler} />}

      <div className="fuss-aktionen">
        <Button type="submit" className="w-full sm:w-auto" loading={sendet}>
          Arztbesuch melden
        </Button>
      </div>
    </form>
  );
}
