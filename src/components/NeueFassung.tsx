import { useEffect, useState } from 'react';
import { serviceWorkerAnmelden, neueFassungUebernehmen } from '@/lib/sw';
import Button from './Button';

/**
 * „Es gibt eine neue Fassung" — und der Benutzer entscheidet, wann.
 *
 * WARUM NICHT VON SELBST NEU LADEN. Weil der Monteur mitten in einem Formular
 * stehen kann. Ein selbsttätiger Neustart wirft ihm die halb erfasste Zeit
 * weg — und zwar genau dann, wenn wir gerade etwas ausgeliefert haben, also
 * ohne erkennbaren Zusammenhang für ihn.
 *
 * WARUM ES DEN HINWEIS ÜBERHAUPT BRAUCHT. Seit die App ihre Hülle vorhält,
 * startet sie aus dem Speicher. Das ist der ganze Zweck — kostet aber, dass
 * eine neue Fassung erst beim ÜBERNÄCHSTEN Start von allein da wäre. Der
 * Hinweis macht daraus einen Fingertipp.
 *
 * Er liegt unten, nicht oben: oben sitzt auf dem Telefon die Kopfzeile, und
 * eine Leiste, die dort erscheint, verschiebt den ganzen Inhalt nach unten,
 * während man ihn gerade liest.
 */
export default function NeueFassung() {
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    serviceWorkerAnmelden(() => setBereit(true));
  }, []);

  if (!bereit) return null;

  return (
    <div
      role="status"
      // Über der unteren Leiste, aber unterhalb von Dialogen: ein Hinweis
      // darf niemals eine Rückfrage verdecken, die beantwortet werden muss.
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm sm:rounded-lg sm:border"
    >
      <p className="text-sm text-ink">
        Eine neue Fassung der App steht bereit.
        <span className="mt-1 block text-xs text-ink-muted">
          Nicht gespeicherte Eingaben gehen beim Laden verloren.
        </span>
      </p>
      <div className="mt-3 flex gap-2">
        <Button onClick={neueFassungUebernehmen}>Jetzt laden</Button>
        <Button variant="ghost" onClick={() => setBereit(false)}>
          Später
        </Button>
      </div>
    </div>
  );
}
