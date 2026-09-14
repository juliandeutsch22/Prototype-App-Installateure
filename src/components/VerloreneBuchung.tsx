import { useEffect } from 'react';
import { beiVorgemerktemFehlschlag } from '@/lib/offlineWrite';
import { beiVormerkungFehlgeschlagen } from '@/lib/sync/ausgangsfach';
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
 *
 * ZWEI QUELLEN, EINE MELDUNG. Unter Firestore kommt der Fehlschlag aus dem
 * SDK (`offlineWrite`), unter Postgres aus dem eigenen Ausgangsfach
 * (`sync/ausgangsfach`). Beide werden hier gehört: welche Datenquelle gerade
 * gilt, ist für den Monteur keine Information — er will wissen, dass seine
 * Buchung fehlt. Die zweite Zeile fällt mit Stufe 9 weg.
 */
export default function VerloreneBuchung() {
  const toast = useToast();

  useEffect(() => {
    const melden = () => {
      toast.error(
        'Eine vorgemerkte Buchung konnte nicht gesendet werden. Bitte in der Übersicht nachsehen und gegebenenfalls neu erfassen.',
      );
    };
    beiVorgemerktemFehlschlag(melden);
    beiVormerkungFehlgeschlagen(melden);
    return () => {
      beiVorgemerktemFehlschlag(null);
      beiVormerkungFehlgeschlagen(null);
    };
  }, [toast]);

  return null;
}
