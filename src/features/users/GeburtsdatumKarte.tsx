import { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { getGeburtsdatum, setGeburtsdatum } from '@/lib/db/arbeitszeitGrenzen';
import { istJugendlich } from '@/features/accounting/arbeitszeitGrenzen';
import { todayStr } from '@/lib/time';

/**
 * Das Geburtsdatum — nur für die Schutzregeln für Jugendliche (KJBG).
 *
 * EIGENE KARTE MIT EIGENEM SPEICHERN, nicht in den Stammdaten: es liegt in
 * einer eigenen Tabelle, die nur die Person selbst sowie Büro und Leitung
 * lesen. In den Stammdaten stünde es neben Angaben, die jeder im Betrieb
 * sieht, und ein gemeinsames Speichern müsste zwei Tabellen auf einmal
 * schreiben.
 */
export default function GeburtsdatumKarte({
  companyId,
  uid,
  onStand,
}: {
  companyId: string;
  uid: string;
  /**
   * Meldet das gespeicherte Datum — geladen und nach jedem Speichern. Die
   * Akte fragt damit vor dem Speichern nach, wenn die Person unter 18 ist und
   * das Soll darüber liegt (Runde 3, M2).
   */
  onStand?: (datum: string | null) => void;
}) {
  const toast = useToast();
  const [gespeichert, setGespeichert] = useState<string | null | undefined>(undefined);
  const [wert, setWert] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    let weg = false;
    getGeburtsdatum(companyId, uid)
      .then((d) => {
        if (weg) return;
        setGespeichert(d);
        setWert(d ?? '');
        onStand?.(d);
      })
      .catch(() => { if (!weg) setGespeichert(null); });
    return () => { weg = true; };
    // Nur beim Laden der Person melden — nicht, weil die Akte neu zeichnet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, uid]);

  if (gespeichert === undefined) return null;
  const geaendert = wert !== (gespeichert ?? '');

  async function speichern() {
    setLaeuft(true);
    try {
      await setGeburtsdatum(companyId, uid, wert || null);
      setGespeichert(wert || null);
      onStand?.(wert || null);
      toast.success(wert ? 'Geburtsdatum gespeichert' : 'Geburtsdatum entfernt');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card
      title="Geburtsdatum"
      hint="Nur für die Schutzregeln für Jugendliche unter 18 (KJBG): Die Mitarbeiterübersicht prüft damit Tages- und Wochenarbeitszeit, Ruhezeit, Nachtruhe und Wochenfreizeit. Sehen können es die Person selbst sowie Büro und Leitung. Bei einer Löschung nach DSGVO wird es entfernt."
    >
      <div className="flex flex-wrap items-end gap-3">
        <InputField
          id="geburtsdatum"
          label="Geburtsdatum"
          type="date"
          value={wert}
          onChange={(e) => setWert(e.target.value)}
        />
        {geaendert && (
          <Button variant="secondary" disabled={laeuft} onClick={() => void speichern()}>
            Speichern
          </Button>
        )}
      </div>
      {gespeichert && istJugendlich(gespeichert, todayStr()) && (
        <p className="mt-2 text-sm text-ink-muted">Unter 18 — es gelten die Grenzen des KJBG.</p>
      )}
    </Card>
  );
}
