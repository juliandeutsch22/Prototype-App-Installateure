import { useEffect } from 'react';
import { nachsendenJetzt, offeneVormerkungen } from '@/lib/db/pg/ohneEmpfang';

/** Wie oft nachgesehen wird, ob etwas im Fach liegt. */
export const NACHSEHEN_MS = 60_000;

/**
 * Sendet nach, was ohne Empfang vorgemerkt wurde.
 *
 * OHNE DIESE ZEILEN WÄRE DAS AUSGANGSFACH EIN GRAB. Vormerken allein hilft
 * niemandem: die Buchung läge sicher im Gerät und käme nie an. Firestore
 * sendete selbsttätig nach; seit dem Umzug muss jemand anstossen, und das
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
 *   UND JEDE MINUTE (Prüflauf 25.09.2026, P1-06). Die drei Anlässe oben
 *   sind Ereignisse; bleibt der Monteur in der App und der Empfang kommt
 *   still zurück, gab es keines — die Buchung lag, bis er zufällig die App
 *   wechselte. Der Zeitgeber fragt nur das Fach auf dem Gerät; ans Netz geht
 *   er erst, wenn dort etwas liegt. So greift er auch gleich nach dem
 *   Vormerken, ohne dass die Stelle, die vormerkt, davon wissen muss.
 *
 * WARUM ES IHN ÜBERHAUPT GIBT: Supabase bringt kein Nachsenden mit. Das
 * Ausgangsfach hält den Vorgang, dieser Bestandteil stösst das Senden an —
 * ohne ihn läge eine Buchung im Gerät und niemand holte sie ab.
 */
export default function Nachsender() {
  useEffect(() => {
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
    const zeitgeber = window.setInterval(() => {
      void offeneVormerkungen()
        .then((n) => {
          if (n > 0) anstossen();
        })
        .catch(() => undefined);
    }, NACHSEHEN_MS);

    return () => {
      window.clearInterval(zeitgeber);
      window.removeEventListener('online', anstossen);
      document.removeEventListener('visibilitychange', beiSichtbar);
    };
  }, []);

  return null;
}
