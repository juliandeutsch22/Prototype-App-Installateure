import { useEffect, useMemo, useState } from 'react';
import { naechsteNummernImJahr, type NaechsteNummernImJahr } from '@/lib/db/company';
import { belegNummer, hoechsteLfdImJahr } from '@/lib/praefixe';

/**
 * DER VORSCHLAG FÜR DIE NÄCHSTE BAUSTELLENNUMMER — mit dem Jahr vom Server
 * (Durchsicht 15.11.2026, Befund aus G12).
 *
 * Vergeben wird die Nummer beim Speichern vom Server, im laufenden Jahr in
 * Wien (G10). Der Vorschlag im Formular rechnete bisher mit der Uhr des
 * Geräts: ein Gerät mit falscher Uhr oder zu Silvester schlug
 * „B-2031-0001“ vor, und wer den Vorschlag stehen ließ, bekam eine ganz
 * andere Nummer. Jetzt kommen Jahr und nächste Zahl des Zählers vom Server;
 * die laufende Nummer ist die höhere aus Zähler und Liste (eine eben
 * angelegte Baustelle steht schon in der Liste, bevor der Zähler neu
 * gefragt ist).
 *
 * OHNE VERBINDUNG wie bisher: Jahr des Geräts, laufende Nummer aus der Liste
 * — und `vomServer` ist falsch, damit die Maske es als Beispiel kennzeichnet.
 * Verbindlich ist ohnehin erst die Nummer beim Speichern.
 */
export function useBaustellenVorschlag(
  nummern: readonly (string | undefined)[],
  praefix: string,
): { vorschlag: string; vomServer: boolean } {
  const [server, setServer] = useState<NaechsteNummernImJahr | null>(null);
  // Neu gefragt, wenn eine Baustelle dazukommt — dann hat der Zähler weitergezählt.
  const anzahl = nummern.length;
  useEffect(() => {
    let weg = false;
    Promise.resolve()
      .then(() => naechsteNummernImJahr())
      .then((n) => !weg && setServer(n))
      .catch(() => !weg && setServer(null));
    return () => {
      weg = true;
    };
  }, [anzahl]);

  return useMemo(() => {
    const jahr = server?.jahr ?? new Date().getFullYear();
    const ausListe = hoechsteLfdImJahr([...nummern], jahr) + 1;
    return {
      vorschlag: belegNummer(praefix, jahr, Math.max(server?.baustelle ?? 1, ausListe)),
      vomServer: server != null,
    };
  }, [server, nummern, praefix]);
}
