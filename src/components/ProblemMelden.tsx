import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ConfirmDialog from './ConfirmDialog';
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
 * soll vorher wissen, wer es zu sehen bekommt. Das ist der Senklot-Support
 * und nur er — beheben kann es nur, wer die App baut, und die
 * Geschäftsführung konnte mit den Meldungen nichts anfangen.
 */
export default function ProblemMelden({
  ausloeser,
}: {
  ausloeser: (oeffnen: () => void) => ReactNode;
}) {
  const toast = useToastWennDa();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState('');

  const schliessen = useCallback(() => setOffen(false), []);

  async function senden() {
    await problemMelden(text);
    setOffen(false);
    setText('');
    toast?.success('Danke — die Meldung ist angekommen.');
  }

  return (
    <>
      {ausloeser(() => setOffen(true))}
      {/*
        IN DEN KÖRPER DER SEITE, nicht an Ort und Stelle. Am Telefon steht der
        Knopf im Profilblatt, und das ist verschoben und scrollbar — ein
        `fixed` darin bezieht sich auf das Blatt statt auf den Bildschirm. Der
        Dialog stand dadurch halb abgeschnitten im Blatt (Probelauf 24.09.).
      */}
      {createPortal(
        <ConfirmDialog
          open={offen}
          title="Problem melden"
          message="Die Meldung geht an den Senklot-Support, mit deinem Namen und deiner E-Mail-Adresse, damit er nachfragen kann. Mitgeschickt werden die Ansicht, die Fassung der App und das Gerät."
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
                className="feld"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
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
