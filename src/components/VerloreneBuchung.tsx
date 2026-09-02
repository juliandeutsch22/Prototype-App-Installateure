import { useEffect } from 'react';
import { beiVorgemerktemFehlschlag } from '@/lib/offlineWrite';
import { useToast } from '@/components/Toast';

/**
 * Sagt Bescheid, wenn eine vorgemerkte Buchung doch nicht durchgekommen ist.
 *
 * WARUM ES DAS BRAUCHT. „Ohne Verbindung gespeichert, wird automatisch
 * gesendet" ist ein Versprechen, das die App dem Monteur im Keller gibt.
 * Firestore hält es fast immer — aber nicht, wenn der Server den Vorgang am
 * Ende ablehnt. Solche Schreibvorgänge sind endgültig verloren, und bisher
 * erfuhr das niemand: der Fehler wurde verschluckt, damit kein unbehandelter
 * Abbruch übrig bleibt.
 *
 * Eine Zeitbuchung, die scheinbar gespeichert wurde und in Wahrheit fehlt,
 * ist genau die Sorte Fehler, wegen der man einer App nicht mehr traut. Die
 * Meldung kann sie nicht retten — aber sie sagt, dass man nachsehen muss.
 *
 * OHNE FRIST UND OHNE KNOPF: Die Meldung darf nicht wegblinken, bevor jemand
 * sie gelesen hat, und es gibt nichts zu tun ausser nachzusehen. Deshalb ein
 * Hinweis, der stehen bleibt, bis die App neu geladen wird.
 */
export default function VerloreneBuchung() {
  const toast = useToast();

  useEffect(() => {
    beiVorgemerktemFehlschlag(() => {
      toast.error(
        'Eine vorgemerkte Buchung konnte nicht gesendet werden. Bitte in der Übersicht nachsehen und gegebenenfalls neu erfassen.',
      );
    });
    return () => beiVorgemerktemFehlschlag(null);
  }, [toast]);

  return null;
}
