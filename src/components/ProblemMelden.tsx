import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ConfirmDialog from './ConfirmDialog';
import { CheckboxField } from './Field';
import { useToastWennDa } from './Toast';
import { problemMelden } from '@/lib/fehlerprotokoll';

/**
 * „Problem melden" — von überall, wo jemand hängenbleibt.
 *
 * Der Auslöser kommt von aussen, damit der Knopf an jeder Stelle so aussieht
 * wie seine Nachbarn: in der dunklen Seitenleiste anders als im Profilblatt
 * und dort anders als auf der Fehlertafel.
 *
 * WER ES LIEST, STEHT IM DIALOG, nicht hinter einem „i": wer etwas schreibt,
 * soll vorher wissen, wer es zu sehen bekommt. Das Häkchen für den Support
 * ist aus, bis jemand es setzt — die Plattform sieht in keinen Betrieb
 * hinein, und nur der Verfasser selbst kann das für seine Meldung aufheben.
 */
export default function ProblemMelden({
  ausloeser,
}: {
  ausloeser: (oeffnen: () => void) => ReactNode;
}) {
  const toast = useToastWennDa();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState('');
  const [anSupport, setAnSupport] = useState(false);

  const schliessen = useCallback(() => setOffen(false), []);

  async function senden() {
    await problemMelden(text, anSupport);
    setOffen(false);
    setText('');
    setAnSupport(false);
    toast?.success('Danke — die Meldung ist angekommen.');
  }

  return (
    <>
      {ausloeser(() => setOffen(true))}
      {/*
        IN DEN KÖRPER DER SEITE, nicht an Ort und Stelle. Am Telefon steht der
        Knopf im Profilblatt, und das ist verschoben und scrollbar — ein
        `fixed` darin bezieht sich auf das Blatt statt auf den Bildschirm. Der
        Dialog stand dadurch halb abgeschnitten im Blatt (Probelauf 25.09.).
      */}
      {createPortal(
        <ConfirmDialog
          open={offen}
          title="Problem melden"
          message="Die Geschäftsführung und die Administration deines Betriebs lesen die Meldung. Mitgeschickt werden die Ansicht, die Fassung der App und das Gerät."
          confirmLabel="Senden"
          confirmTone="primary"
          onConfirm={senden}
          onCancel={schliessen}
        >
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="problem-text" className="text-sm font-medium text-ink">
                Was ist passiert?
              </label>
              <textarea
                id="problem-text"
                rows={4}
                maxLength={2000}
                placeholder="z. B. Beim Speichern des Scheins kam eine Fehlermeldung."
                className="min-h-touch rounded border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-brand focus:ring-1 focus:ring-brand"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <CheckboxField
              id="problem-support"
              label="Auch an den Senklot-Support senden"
              checked={anSupport}
              onChange={(e) => setAnSupport(e.target.checked)}
            />
            <p className="text-xs text-ink-muted">
              Bitte keine Gesundheitsdaten und keine Daten von Kunden eintragen.
            </p>
          </div>
        </ConfirmDialog>,
        document.body,
      )}
    </>
  );
}
