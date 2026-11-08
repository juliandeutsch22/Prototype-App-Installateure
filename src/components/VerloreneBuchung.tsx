import { useEffect } from 'react';
import { beiVormerkungFehlgeschlagen } from '@/lib/sync/ausgangsfach';
import { useToast } from '@/components/Toast';
import { FOTO_TABELLE, SCHEIN_TABELLE } from '@/features/worksheets/vorgemerkt';
import { NACHRICHT_TABELLE } from '@/lib/db/nachrichten';

/**
 * Sagt Bescheid, wenn eine vorgemerkte Buchung doch nicht durchgekommen ist.
 *
 * WARUM ES DAS BRAUCHT. „Ohne Verbindung gespeichert, wird automatisch
 * gesendet" ist ein Versprechen, das die App dem Monteur im Keller gibt. Das
 * Ausgangsfach hält es fast immer — aber nicht, wenn der Server den Vorgang
 * am Ende ablehnt: eine Richtlinie, die nicht greift, ein inzwischen
 * gesperrtes Konto. Solche Schreibvorgänge sind endgültig verloren, und
 * bisher erfuhr das niemand: der Fehler wurde verschluckt, damit kein
 * unbehandelter Abbruch übrig bleibt.
 *
 * Eine Zeitbuchung, die scheinbar gespeichert wurde und in Wahrheit fehlt,
 * ist genau die Sorte Fehler, wegen der man einer App nicht mehr traut. Die
 * Meldung kann sie nicht retten — aber sie sagt, dass man nachsehen muss.
 *
 * OHNE FRIST: Die Meldung darf nicht wegblinken, bevor jemand
 * sie gelesen hat, und es gibt nichts zu tun ausser nachzusehen. Deshalb ein
 * Hinweis, der stehen bleibt, bis sie bewusst mit „Gelesen“ bestätigt wird (innerhalb dieser Sitzung).
 *
 * EINE QUELLE, SEIT STUFE 9. Bis zum Abbau von Firestore kam derselbe
 * Fehlschlag auch aus dem SDK (`lib/offlineWrite.ts`); diesen Weg gibt es
 * nicht mehr, und die Datei mit ihm. Gehört wird jetzt nur noch das eigene
 * Ausgangsfach.
 */
export default function VerloreneBuchung() {
  const toast = useToast();

  useEffect(() => {
    /*
      DER SCHEIN SAGT, WARUM (E49). Bei einer Buchung genügt „nachsehen und
      neu erfassen“. Ein vorgemerkter Schein scheitert fast nur daran, dass
      derselbe Entwurf inzwischen anderswo unterschrieben oder verworfen
      wurde — das steht im Grund des Servers, und ohne ihn wüsste niemand,
      welcher Stand jetzt gilt.
    */
    const melden = ({ tabelle, grund: roh }: { tabelle: string; grund: string }) => {
      const grund = /[.!?]$/.test(roh.trim()) ? roh.trim() : `${roh.trim()}.`;
      toast.wichtig(
        tabelle === SCHEIN_TABELLE
          ? `Ein vorgemerkter Handwerksschein konnte nicht gesendet werden: ${grund} Bitte unter Handwerksscheine nachsehen.`
          : tabelle === FOTO_TABELLE
            ? `Ein vorgemerktes Foto konnte nicht hochgeladen werden: ${grund} Der Schein verzeichnet es, die Datei fehlt.`
            : tabelle === NACHRICHT_TABELLE
              ? `Eine vorgemerkte Nachricht konnte nicht gesendet werden: ${grund} Bitte im Gespräch nachsehen und neu schreiben.`
              : 'Eine vorgemerkte Buchung konnte nicht gesendet werden. Bitte in der Übersicht nachsehen und gegebenenfalls neu erfassen.',
      );
    };
    beiVormerkungFehlgeschlagen(melden);
    return () => beiVormerkungFehlgeschlagen(null);
  }, [toast]);

  return null;
}
