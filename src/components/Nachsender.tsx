import { useEffect } from 'react';
import { nutztPostgres } from '@/lib/db/quelle';
import { nachsendenJetzt } from '@/lib/db/pg/ohneEmpfang';

/**
 * Sendet nach, was ohne Empfang vorgemerkt wurde.
 *
 * OHNE DIESE ZEILEN WÄRE DAS AUSGANGSFACH EIN GRAB. Vormerken allein hilft
 * niemandem: die Buchung läge sicher im Gerät und käme nie an. Firestore
 * sendete selbsttätig nach — unter Postgres muss jemand anstossen, und das
 * ist hier.
 *
 * DREI ANLÄSSE, und jeder deckt einen Fall ab, den die anderen nicht sehen:
 *
 *   BEIM START, weil die App zwischendurch geschlossen war. Der Monteur bucht
 *   im Keller, steckt das Telefon ein, fährt weiter; die App wird beendet.
 *   Ohne diesen Anlass läge die Buchung bis zum nächsten Netzwechsel.
 *
 *   BEI `online`, der übliche Fall: das Netz kommt wieder.
 *
 *   BEIM ZURÜCKKOMMEN AUS DEM HINTERGRUND, weil `online` auf Telefonen
 *   unzuverlässig ist. Ein Gerät, das im Funkloch stand und wieder Empfang
 *   hat, meldet das Ereignis nicht immer — die Rückkehr zur App aber schon.
 *
 * WARUM NUR UNTER POSTGRES: unter Firestore erledigt das SDK das Nachsenden
 * selbst, und ein zweiter Nachsender daneben wäre eine zweite Warteschlange
 * für dieselbe Zusage. Diese Abfrage fällt mit Stufe 9 weg.
 */
export default function Nachsender() {
  useEffect(() => {
    if (!nutztPostgres()) return;

    /*
      FEHLER WERDEN HIER GESCHLUCKT, UND ZWAR ABSICHTLICH. Der Nachsendelauf
      meldet einen endgültig verlorenen Vorgang über
      `beiVormerkungFehlgeschlagen` — das ist die Meldung, die den Monteur
      angeht. Was hier zusätzlich schiefgehen kann (kein Lager, kein Netz),
      ist kein Ereignis: dann bleibt eben alles liegen und wird beim nächsten
      Anlass erneut versucht.
    */
    const anstossen = () => { void nachsendenJetzt().catch(() => undefined); };

    anstossen();
    window.addEventListener('online', anstossen);
    const beiSichtbar = () => {
      if (document.visibilityState === 'visible') anstossen();
    };
    document.addEventListener('visibilitychange', beiSichtbar);

    return () => {
      window.removeEventListener('online', anstossen);
      document.removeEventListener('visibilitychange', beiSichtbar);
    };
  }, []);

  return null;
}
