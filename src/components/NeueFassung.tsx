import { useEffect, useRef, useState } from 'react';
import {
  serviceWorkerAnmelden,
  neueFassungUebernehmen,
  darfStillUebernehmen,
} from '@/lib/sw';
import { fassungBeobachten } from '@/lib/fassungPruefen';
import { appHartErneuern, darfHartErneuern, uebernahmeAufraeumen } from '@/lib/erneuerung';
import { FASSUNG } from '@/lib/fassung';
import Button from './Button';

/**
 * „Es gibt eine neue Fassung" — beim Kaltstart still, sonst auf Nachfrage.
 *
 * WAS AUS DEM BETRIEB GEMELDET WURDE: „damit die Änderungen greifen, muss ich
 * die App auf dem iPhone immer vom Startbildschirm löschen und neu
 * hinzufügen." Das ist die härteste Form von „ein Update kommt nicht an", und
 * sie machte das Ausliefern im laufenden Betrieb praktisch unmöglich.
 *
 * ZWEI LÜCKEN LAGEN HINTEREINANDER. Die Prüfung selbst hing an einem
 * Seitenaufruf, den eine Startbildschirm-App fast nie macht (behoben in
 * `lib/sw.ts` und `public/sw.js`). Und selbst wenn sie lief, musste jemand
 * eine Leiste am unteren Rand bemerken und antippen — mitten in der Arbeit,
 * auf einer Baustelle.
 *
 * DIE UNTERSCHEIDUNG, DIE DAS LÖST: beim KALTSTART kann nichts verlorengehen.
 * Die App ist gerade erst erschienen, niemand hat etwas eingegeben — also
 * wird die neue Fassung ohne Rückfrage übernommen. Wer die App öffnet,
 * arbeitet damit auf dem aktuellen Stand, ohne je etwas zu tippen.
 *
 * BEIM FORTSETZEN WIRD WEITER GEFRAGT. Dort kann jemand mitten in einem
 * Handwerksschein stehen, und ein selbsttätiger Neustart würfe ihm die
 * Unterschrift weg — ausgelöst von einem Deploy, mit dem er nichts zu tun
 * hat. Diese Abwägung bleibt, sie war von Anfang an richtig.
 */

export default function NeueFassung() {
  const [bereit, setBereit] = useState(false);
  const gestartet = useRef(Date.now());
  const angefasst = useRef(false);
  /**
   * Läuft gerade eine stille Übernahme? Dann ist die Seite im Begriff, neu
   * zu laden — und es darf nichts mehr gemeldet werden.
   */
  const uebernimmtGerade = useRef(false);

  useEffect(() => {
    /*
      ZUERST: hat der letzte Wechsel gewirkt?

      Läuft jetzt eine andere Fassung als die, von der aus zuletzt gewechselt
      wurde, ist der normale Weg in Ordnung und die Notbremse wird entschärft.
      Das muss VOR jeder Prüfung stehen — sonst schlüge sie gleich beim
      ersten erfolgreichen Wechsel zu.
    */
    uebernahmeAufraeumen(FASSUNG);

    /**
     * „Angefasst" heisst: irgendeine echte Eingabe. Ein reines Scrollen zählt
     * bewusst NICHT — wer nur überfliegt, verliert durch ein Neuladen nichts,
     * und genau dieser Fall ist auf dem Telefon der häufigste.
     */
    const merken = () => {
      angefasst.current = true;
    };
    for (const art of ['pointerdown', 'keydown'] as const) {
      window.addEventListener(art, merken, { once: true, passive: true });
    }

    /**
     * ZWEI QUELLEN FÜR DIESELBE NACHRICHT, und das ist Absicht.
     *
     * Der Service Worker vergleicht die `index.html` — das setzt voraus,
     * dass er selbst aktuell ist und sein Vergleich läuft. Hängt er auf
     * einem alten Stand fest, erfährt die App nie etwas. Genau das war die
     * Ausgangslage auf dem Telefon.
     *
     * Deshalb fragt die App zusätzlich SELBST beim Server nach
     * (`lib/fassungPruefen.ts`) — ohne Worker, ohne Zwischenspeicher. Meldet
     * sich einer von beiden, wird gehandelt.
     */
    const melden = () => {
      /*
        DIE LEISTE BLITZTE BEIM START KURZ AUF — gemeldet aus dem Betrieb:
        „beim Öffnen erscheint die Update-Meldung mit ‚Jetzt laden‘ nur ganz
        kurz während dem ‚Anmeldung wird geprüft‘-Bildschirm. Man sieht nicht
        einmal genau, was da steht, und kann auch nichts klicken."

        Die Ursache steckte in der Verdopplung oben. BEIDE Quellen melden beim
        Start, und `darfStillUebernehmen` trägt einen Einmal-Merker je
        Sitzung: der erste Aufruf übernimmt still und verbraucht ihn, der
        zweite findet ihn gesetzt, bekommt ein „nein" — und zeigt die Leiste.
        Sekunden später lädt der Neustart aus dem ersten Aufruf die Seite neu
        und sie ist wieder weg.

        Zwei Quellen zu haben ist richtig; zweimal auf dieselbe Nachricht zu
        REAGIEREN ist es nicht. Läuft die Übernahme schon, ist hier nichts
        mehr zu tun.
      */
      if (uebernimmtGerade.current) return;

      if (darfStillUebernehmen(gestartet.current, angefasst.current)) {
        uebernimmtGerade.current = true;
        void neueFassungUebernehmen().catch(() => {
          /*
            Kommt der Neustart nicht zustande, muss die Leiste doch kommen.
            Ein stiller Verzicht wäre der schlechteste Ausgang: die App bliebe
            auf dem alten Stand, und niemand hätte je die Wahl gehabt.
          */
          uebernimmtGerade.current = false;
          setBereit(true);
        });
        return;
      }
      setBereit(true);
    };

    /**
     * DIE NOTBREMSE HAENGT AN DER SERVERPRUEFUNG, nicht am Service Worker.
     *
     * Nur sie vergleicht die eingebaute Kennung der LAUFENDEN App mit dem,
     * was der Server ausliefert. Sagt sie „hier läuft etwas Altes", ist das
     * eine Tatsache und kein Verdacht — sie hängt an keinem Zwischenspeicher
     * und an keinem Worker, der festgefahren sein könnte.
     *
     * Der Worker meldet dagegen nur, dass sich die `index.html` gegenüber
     * SEINEM Vorrat geändert hat. Das ist ein guter Hinweis, aber keine
     * Aussage über die laufende App — und auf einen Hinweis hin alles
     * wegzuräumen wäre zu viel.
     */
    const meldenVomServer = () => {
      if (darfHartErneuern(FASSUNG)) {
        void appHartErneuern();
        return;
      }
      melden();
    };

    serviceWorkerAnmelden(melden);
    const abmelden = fassungBeobachten(meldenVomServer);

    return () => {
      abmelden();
      for (const art of ['pointerdown', 'keydown'] as const) {
        window.removeEventListener(art, merken);
      }
    };
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
        <Button onClick={() => void neueFassungUebernehmen()}>Jetzt laden</Button>
        <Button variant="ghost" onClick={() => setBereit(false)}>
          Später
        </Button>
      </div>
    </div>
  );
}
