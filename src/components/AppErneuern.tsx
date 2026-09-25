import { useState } from 'react';
import { appHartErneuern } from '@/lib/erneuerung';
import Button from './Button';

/**
 * „App erneuern" — von Hand tun, was das Löschen vom Startbildschirm tut.
 *
 * WOFÜR ES DIESEN KNOPF BRAUCHT. Aus dem Betrieb gemeldet: „bei der am
 * Homescreen gespeicherten Version funktioniert das automatische Updaten
 * nicht, ich muss sie jedes Mal löschen und neu speichern." Für diesen Fall
 * gibt es zwar inzwischen eine selbsttätige Notbremse
 * (`lib/erneuerung.ts`) — aber sie setzt voraus, dass die App überhaupt noch
 * merkt, dass sie alt ist. Läuft auf dem Telefon eine Fassung, deren
 * Erkennung selbst den Fehler hat, hilft nur noch eine Handlung von außen.
 *
 * Bisher war diese Handlung: das Symbol vom Startbildschirm werfen und die
 * App neu hinzufügen. Das ist umständlich, es sieht nach Datenverlust aus,
 * und niemand kommt von selbst darauf. Ein Knopf an der Stelle, an der die
 * Fassung steht, ist derselbe Vorgang in zwei Tipps.
 *
 * WARUM ZWEI TIPPS UND NICHT EINER. Der Knopf lädt die App neu, und wer
 * gerade eine Zeit erfasst hat, verlöre sie. Das Profilfeld wird auf dem
 * Telefon aber mit dem Daumen bedient — ein Fehlgriff ist dort keine
 * Seltenheit. Die Rückfrage nennt deshalb genau das, was auf dem Spiel
 * steht, und ausdrücklich auch das, was NICHT auf dem Spiel steht: die
 * Anmeldung und die gespeicherten Daten bleiben.
 */
export default function AppErneuern() {
  const [fragt, setFragt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  if (!fragt) {
    return (
      <Button variant="ghost" className="mt-2 w-full" onClick={() => setFragt(true)}>
        App erneuern
      </Button>
    );
  }

  return (
    <div className="mt-2 rounded-sm border border-line bg-surface-2 p-3">
      <p className="text-sm text-ink">
        Die App wird neu geladen.
        <span className="mt-1 block text-xs text-ink-muted">
          Nicht gespeicherte Eingaben gehen verloren. Anmeldung und gespeicherte Daten bleiben.
        </span>
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          loading={laeuft}
          onClick={() => {
            // Der Knopf bleibt stehen und wird nur gesperrt: nach dem
            // Räumen lädt die Seite ohnehin neu, und ein zweiter Tipp
            // während des Räumens würde die Speicher mitten im Löschen
            // ein zweites Mal durchgehen.
            setLaeuft(true);
            void appHartErneuern();
          }}
        >
          Erneuern
        </Button>
        <Button variant="ghost" disabled={laeuft} onClick={() => setFragt(false)}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
