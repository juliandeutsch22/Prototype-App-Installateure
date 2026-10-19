import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Customer } from '@/types';
import type { WithId } from '@/lib/db/core';
import { kundenNachNamen, listCustomersByIds } from '@/lib/db/customers';

/**
 * GENAU DIE KUNDEN, DIE EINE ANSICHT BRAUCHT (Ladezeit, 19.10.2026).
 *
 * Die Rechnungen holten für die UID-Vorbelegung, den Mahnlauf und den Export
 * die ersten 500 Kunden des Betriebs. Mit den Jahren wurde das mehr, und
 * darüber hinaus fehlte ein Kunde still: keine UID im Export, beim Mahnen als
 * Verbraucher gerechnet. Jetzt nennt die Ansicht, welche Kunden sie meint —
 * nach Kennung (verknüpfte Baustellen) und nach Namen (Belege aus der Zeit
 * vor der Verknüpfung) —, und genau die werden geholt. Was schon geholt ist,
 * bleibt; ein neuer Name holt nur ihn dazu.
 *
 * Die Namen werden in der Datenbank ohne Rücksicht auf Schreibweise gesucht
 * (`kundenNachNamen`); die Ansicht vergleicht danach genau, wie bisher.
 */
export function useKundenFuer(
  companyId: string | undefined,
  ids: readonly (string | undefined | null)[],
  namen: readonly (string | undefined | null)[],
  beiFehler?: () => void,
): [WithId<Customer>[], Dispatch<SetStateAction<WithId<Customer>[]>>] {
  const [kunden, setKunden] = useState<WithId<Customer>[]>([]);
  const gefragt = useRef({ ids: new Set<string>(), namen: new Set<string>() });
  const fehler = useRef(beiFehler);
  fehler.current = beiFehler;
  const aktiv = useRef(true);
  // Auch nach dem doppelten Einhängen im Entwicklungsmodus wieder an.
  useEffect(() => { aktiv.current = true; return () => { aktiv.current = false; }; }, []);

  // Am Inhalt, nicht an der Identität der Listen: jede Zeichnung der Ansicht baut neue.
  const idSchluessel = [...new Set(ids.filter((x): x is string => !!x))].sort().join('\n');
  const namenSchluessel = [...new Set(namen.map((n) => (n ?? '').trim().toLowerCase()).filter(Boolean))].sort().join('\n');

  useEffect(() => {
    if (!companyId) return;
    const neueIds = idSchluessel ? idSchluessel.split('\n').filter((x) => !gefragt.current.ids.has(x)) : [];
    const neueNamen = namenSchluessel ? namenSchluessel.split('\n').filter((n) => !gefragt.current.namen.has(n)) : [];
    if (neueIds.length === 0 && neueNamen.length === 0) return;
    for (const x of neueIds) gefragt.current.ids.add(x);
    for (const n of neueNamen) gefragt.current.namen.add(n);
    /*
      Nicht verworfen, wenn sich die Liste inzwischen geändert hat: dazugelegt
      wird nur, und was einmal geholt ist, stimmt auch für den nächsten Stand.
    */
    Promise.all([
      neueIds.length ? listCustomersByIds(companyId, neueIds) : Promise.resolve([]),
      neueNamen.length ? kundenNachNamen(companyId, neueNamen) : Promise.resolve([]),
    ])
      .then(([a, b]) => {
        if (!aktiv.current) return;
        setKunden((alt) => [...new Map([...alt, ...a, ...b].map((k) => [k.id, k])).values()]);
      })
      .catch(() => {
        // Beim nächsten Stand noch einmal versuchen.
        for (const x of neueIds) gefragt.current.ids.delete(x);
        for (const n of neueNamen) gefragt.current.namen.delete(n);
        if (aktiv.current) fehler.current?.();
      });
  }, [companyId, idSchluessel, namenSchluessel]);

  return [kunden, setKunden];
}

/**
 * DER EINE GEWÄHLTE KUNDE — für Formulare mit der Kundenauswahl.
 *
 * Gewählt wird über die Suche (`KundenAuswahl`), die den Datensatz gleich
 * mitgibt (`setzen`). Beim Bearbeiten steht nur die Kennung fest; dann wird
 * genau dieser Kunde geholt, nicht die Liste aller.
 */
export function useKunde(
  companyId: string | undefined,
  id: string,
): [WithId<Customer> | null, (k: WithId<Customer> | null) => void] {
  const [kunde, setKunde] = useState<WithId<Customer> | null>(null);
  const passend = kunde && kunde.id === id ? kunde : null;
  useEffect(() => {
    if (!companyId || !id || passend) return;
    let weg = false;
    listCustomersByIds(companyId, [id])
      .then((rows) => { if (!weg) setKunde(rows.find((k) => k.id === id) ?? null); })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [companyId, id, passend]);
  return [passend, setKunde];
}
