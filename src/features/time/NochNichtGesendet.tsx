import { useCallback, useEffect, useState } from 'react';
import type { TimeEntry } from '@/types';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Zustand } from '@/components/Badge';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import { datumAT } from '@/lib/datum';
import { FACH_GELEERT } from '@/lib/sync/ausgangsfach';
import { wartendeZeitbuchungen, type WartendeBuchung } from '@/lib/db/wartendeZeiten';
import { zeitbuchungZurueckholen } from '@/lib/db/pg/ohneEmpfang';
import { grundAus } from '@/lib/fehlerGrund';
import {
  ZEIT_ENTWURF_EREIGNIS, entwurfAlsEintrag, zeitEntwuerfeLesen, zeitEntwurfEntfernen, type ZeitEntwurf,
} from '@/lib/zeitEntwuerfe';

/** „Mo 12.11. · 07:00–12:00 · PR-14 Huber“ — was die Zeile über eine Buchung sagt. */
function beschreibung(e: Partial<TimeEntry>): { titel: string; zusatz: string } {
  const zeit = e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : e.status && e.status !== 'Anwesend' ? e.status : '';
  return {
    titel: [e.date ? datumAT(e.date) : 'Änderung', zeit].filter(Boolean).join(' · '),
    zusatz: [e.projectNumber, e.customerName].filter(Boolean).join(' '),
  };
}

/**
 * NOCH NICHT BEIM SERVER (Z4, Durchsicht 15.11.2026) — oben in „Meine
 * Einträge“.
 *
 * WARTET AUF VERBINDUNG: was im Ausgangsfach liegt. Bisher stand eine
 * vorgemerkte Buchung nirgends; ohne Netz sah der Tag leer aus, und der
 * Monteur buchte darüber. „Nicht senden“ holt sie aus dem Fach und macht sie
 * zum Entwurf — der Ausweg, weil das Fach bei einer Störung ohne Obergrenze
 * wiederholt.
 *
 * NICHT ANGENOMMEN: was der Server abgelehnt hat, mit Tag und Grund. Die
 * Zeile öffnet den Entwurf im Formular; gebucht, verschwindet er.
 *
 * Steht nichts an, steht hier nichts.
 */
export default function NochNichtGesendet({
  companyId,
  uid,
  stand,
  onOeffnen,
}: {
  companyId: string;
  uid: string;
  /** Wechselt nach jedem Speichern im Formular — dann neu nachsehen. */
  stand: number;
  onOeffnen: (e: ZeitEntwurf) => void;
}) {
  const toast = useToast();
  const [wartend, setWartend] = useState<WartendeBuchung[]>([]);
  const [entwuerfe, setEntwuerfe] = useState<ZeitEntwurf[]>([]);
  const [verwerfen, setVerwerfen] = useState<ZeitEntwurf | null>(null);
  const [holt, setHolt] = useState<string | null>(null);

  const laden = useCallback(() => {
    setEntwuerfe(zeitEntwuerfeLesen(uid, companyId));
    void wartendeZeitbuchungen(companyId).then(setWartend).catch(() => setWartend([]));
  }, [companyId, uid]);

  useEffect(() => {
    laden();
    window.addEventListener(FACH_GELEERT, laden);
    window.addEventListener(ZEIT_ENTWURF_EREIGNIS, laden);
    return () => {
      window.removeEventListener(FACH_GELEERT, laden);
      window.removeEventListener(ZEIT_ENTWURF_EREIGNIS, laden);
    };
  }, [laden, stand]);

  async function nichtSenden(id: string) {
    setHolt(id);
    try {
      const geholt = await zeitbuchungZurueckholen(id);
      toast.info(geholt ? 'Nicht gesendet — die Buchung liegt jetzt als Entwurf hier.' : 'Die Buchung war inzwischen angekommen.');
      laden();
    } catch (err) {
      toast.error(grundAus(err, 'Die Buchung ließ sich nicht zurückholen.'));
    } finally {
      setHolt(null);
    }
  }

  if (wartend.length === 0 && entwuerfe.length === 0) return null;
  return (
    <div className="noch-nicht-gesendet">
      <h3 className="blatt-einzug section-label px-4 pt-3">Noch nicht beim Server</h3>
      <List>
        {wartend.map((w) => {
          const b = beschreibung(w.eintrag);
          return (
            <ListRow
              key={`w-${w.eintrag.id}`}
              title={b.titel}
              subtitle={w.art === 'aendern' ? `Änderung${b.zusatz ? ` · ${b.zusatz}` : ''}` : b.zusatz || undefined}
            >
              <Zustand stand="offen">wartet auf Verbindung</Zustand>
              <Button variant="ghost" loading={holt === w.eintrag.id} onClick={() => void nichtSenden(w.eintrag.id)}>
                Nicht senden
              </Button>
            </ListRow>
          );
        })}
        {entwuerfe.map((e) => {
          const b = beschreibung(entwurfAlsEintrag(e));
          const fremd = typeof e.daten.user_id === 'string' && e.daten.user_id !== uid;
          return (
            <ListRow
              key={`e-${e.kennung}`}
              title={<><span>{b.titel}</span><span className="sr-only"> – Entwurf öffnen</span></>}
              // Eine Buchung für jemand anderen öffnet hier nicht — sie gehört in die Mitarbeiterübersicht.
              onOeffnen={fremd ? undefined : () => onOeffnen(e)}
              subtitle={
                <>
                  {b.zusatz && <span className="block">{b.zusatz}</span>}
                  <span className="mt-1 block text-meta text-ink">
                    {e.quelle === 'abgelehnt' ? `Nicht angenommen: ${e.grund}` : e.grund}
                    {fremd && ` · für ${String(e.daten.user_name ?? 'eine andere Person')} — dort neu erfassen`}
                  </span>
                </>
              }
            >
              <Zustand stand="achtung">Entwurf</Zustand>
              <Button variant="ghost" onClick={() => setVerwerfen(e)}>Verwerfen</Button>
            </ListRow>
          );
        })}
      </List>
      <ConfirmDialog
        open={!!verwerfen}
        title="Entwurf verwerfen?"
        message={verwerfen ? `${beschreibung(entwurfAlsEintrag(verwerfen)).titel} — die Eingabe ist danach weg.` : ''}
        confirmLabel="Verwerfen"
        onConfirm={() => {
          if (verwerfen) zeitEntwurfEntfernen(verwerfen);
          setVerwerfen(null);
          laden();
        }}
        onCancel={() => setVerwerfen(null)}
      />
    </div>
  );
}
