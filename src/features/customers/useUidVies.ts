import { useEffect, useRef, useState } from 'react';
import type { Customer, UidPruefung } from '@/types';
import { listUidPruefungen, uidBeiViesPruefen } from '@/lib/db/customers';
import { beiViesPruefbar } from '@shared/vies';
import { uidFehler, uidNormalisieren } from '@/lib/uid';
import { grundAus } from '@/lib/fehlerGrund';

/** Der Prüfstand gehört zur Akte, damit ein Fensterwechsel keine laufende Abfrage verliert. */
export default function useUidVies(kunde: (Customer & { id: string }) | null, aktiviert = true) {
  const [liste, setListe] = useState<UidPruefung[] | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const companyId = kunde?.companyId;
  const id = kunde?.id;
  const uid = uidNormalisieren(kunde?.vatId);
  const pruefbar = !!uid && !uidFehler(uid) && beiViesPruefbar(uid);
  const bezug = `${companyId}|${id}`;
  const aktuell = useRef(bezug);
  aktuell.current = bezug;

  useEffect(() => {
    if (!aktiviert || !companyId || !id) return;
    let weg = false;
    setListe(null);
    setLaeuft(false);
    setFehler(null);
    setHinweis(null);
    if (pruefbar) listUidPruefungen(companyId, id)
      .then((z) => { if (!weg) setListe(z); })
      .catch(() => { if (!weg) setListe([]); });
    return () => { weg = true; };
  }, [companyId, id, pruefbar, aktiviert]);

  async function pruefen() {
    if (!id || !pruefbar || laeuft) return;
    setLaeuft(true);
    setFehler(null);
    setHinweis(null);
    try {
      const { pruefung, hinweis: h } = await uidBeiViesPruefen(id);
      // Bei einem Wechsel zur nächsten Kundenakte gehört die Antwort weiter
      // zum vorherigen Kunden; sie darf dessen Nachfolger nicht überblenden.
      if (aktuell.current !== bezug) return;
      setListe((l) => [pruefung, ...(l ?? [])]);
      setHinweis(h ?? null);
    } catch (e) {
      if (aktuell.current === bezug) setFehler(grundAus(e, 'VIES ließ sich nicht fragen.'));
    } finally {
      if (aktuell.current === bezug) setLaeuft(false);
    }
  }

  return { liste, laeuft, fehler, hinweis, pruefen };
}

export type UidViesStand = ReturnType<typeof useUidVies>;
