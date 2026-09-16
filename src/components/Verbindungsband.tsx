import { useEffect, useState } from 'react';
import { abonniereVerbindung, verbindungSteht } from '@/lib/liveVerbindung';

/**
 * Ein schmales Band über dem Inhalt, wenn mit der Verbindung etwas ist.
 *
 * ZWEI ZUSTÄNDE, EIN BAND — und in dieser Reihenfolge, weil der eine den
 * anderen erklärt:
 *
 *   KEIN NETZ          `navigator.onLine` meldet es. Dann steht auch die
 *                      Live-Verbindung nicht; zwei Bänder übereinander
 *                      sagten dasselbe zweimal.
 *   KEINE LIVE-DATEN   Das Netz ist da, aber die Live-Verbindung ist
 *                      abgerissen und kommt nicht wieder. Geschriebenes geht
 *                      durch, nur nachgeführt wird nichts mehr von selbst.
 *
 * WARUM HIER UND NICHT IN DER ANSICHT. Vorher meldete jedes Abonnement
 * seinen Abriss an die Ansicht, die es hielt. Die setzte ihren Fehlerzustand
 * — und räumte ihn nie wieder weg, weil der geglückte Wiederaufbau nur den
 * Erfolgsrückruf auslöst. Ein kurzer Blick in einen anderen Browser-Tab
 * hinterliess also einen roten Kasten, der die Liste ERSETZTE und bis zum
 * Neuladen stand. Hier steht ein Vorbehalt, der sich von selbst
 * zurücknimmt, und die Daten bleiben stehen.
 *
 * `role="status"` UND NICHT `alert`: ein Vorbehalt unterbricht niemanden
 * mitten im Satz. `alert` ist der Meldung vorbehalten, die jemanden von
 * etwas anderem wegholen soll.
 *
 * KEIN ROT. Nichts ist kaputt, nichts ist verloren — die Zahlen auf dem
 * Schirm stimmen, sie sind nur womöglich nicht die neuesten. Rot hiesse
 * „hier ist ein Fehler", und wer das dreimal am Tag grundlos liest, liest es
 * beim vierten Mal nicht mehr.
 */
export default function Verbindungsband() {
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false,
  );
  const [liveWeg, setLiveWeg] = useState(!verbindungSteht());

  useEffect(() => {
    const an = () => setOffline(false);
    const aus = () => setOffline(true);
    window.addEventListener('online', an);
    window.addEventListener('offline', aus);
    /*
      DER ZUSTAND KANN SICH ZWISCHEN ERSTEM ZEICHNEN UND DIESEM EFFEKT
      GEÄNDERT HABEN. Ohne diese Zeile bliebe das Band in genau dem Fall aus,
      in dem es gebraucht wird — und zwar dauerhaft, weil der nächste
      Anstoss erst bei der nächsten Änderung käme.
    */
    setLiveWeg(!verbindungSteht());
    const ab = abonniereVerbindung((steht) => setLiveWeg(!steht));
    return () => {
      window.removeEventListener('online', an);
      window.removeEventListener('offline', aus);
      ab();
    };
  }, []);

  if (!offline && !liveWeg) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-warning-bg px-4 py-2 text-center text-sm font-medium text-warning"
    >
      {offline ? (
        <span>
          Keine Verbindung — Erfasstes wird gespeichert und automatisch gesendet,
          sobald wieder Netz da ist.
        </span>
      ) : (
        <>
          <span>Die Anzeige aktualisiert sich gerade nicht von selbst.</span>
          {/*
            EIN AUSWEG GEHÖRT DAZU. Ein Hinweis ohne Handgriff ist eine
            Mitteilung, die man wegklickt — und beim Neuladen baut sich jedes
            Abonnement neu auf, was genau das Richtige ist.
          */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-touch font-semibold underline underline-offset-2"
          >
            Neu laden
          </button>
        </>
      )}
    </div>
  );
}
