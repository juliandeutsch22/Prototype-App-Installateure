import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { canProcessOrders } from '@/lib/permissions';
import { scheinVerbrauchBuchen, scheinVerbrauchVorschlag, type VerbrauchStand } from '@/lib/db/workSheets';
import { fmtMenge } from '@/lib/belegLayout';
import { grundAus } from '@/lib/fehlerGrund';
import Button from '@/components/Button';
import InfoHint from '@/components/InfoHint';
import { List, ListRow } from '@/components/ListRow';
import { SelectField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';

/** Die Wahl je Zeile: Hauptlager (''), ein Fahrzeug (seine Kennung) oder nicht abbuchen. */
const NICHT = 'nicht';

/**
 * VERBRAUCH AM SCHEIN BUCHT DAS LAGER (M3/F10, 16.11.2026).
 *
 * Der Schein bewegt keinen Bestand — was über eine Anforderung kam, hat die
 * Abholung abgebucht. Was er darüber hinaus trägt, kam aus dem Fahrzeug oder
 * ohne Anforderung aus dem Regal; bisher sank dafür kein Bestand, und „Mein
 * Fahrzeug“ stimmte nur bis zur nächsten Reparatur. Nach dem Unterschreiben
 * steht hier je Lagerartikel die Differenz „auf dem Schein, aber nicht
 * ausgegeben“ mit der Wahl, woher sie kam — oder dass sie nicht vom Lager
 * war (beim Händler gekauft). Entschieden wird einmal je Schein; danach
 * steht nur noch, was abgebucht wurde.
 *
 * Erscheint im Fenster des Scheins: dorthin führt das Unterschreiben, und
 * ein ohne Netz unterschriebener Schein bietet es an, sobald er geöffnet
 * wird. Wer den Schein nicht buchen darf, sieht nichts.
 */
export default function VerbrauchAmSchein({ scheinId }: { scheinId: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const [stand, setStand] = useState<VerbrauchStand | null>(null);
  const [ladeFehler, setLadeFehler] = useState(false);
  const [wahl, setWahl] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [neu, setNeu] = useState(0);

  useEffect(() => {
    let weg = false;
    setLadeFehler(false);
    scheinVerbrauchVorschlag(scheinId)
      .then((s) => {
        if (weg) return;
        setStand(s);
        /*
          VORGABE: der Monteur mit genau einem eigenen Fahrzeug hat es am
          ehesten von dort — Material ohne Anforderung liegt im Bus. Sonst
          (und für das Lager) das Hauptlager.
        */
        const vorgabe = user && !canProcessOrders(user.role) && s?.orte.length === 1 ? s.orte[0].id : '';
        setWahl(Object.fromEntries((s?.zeilen ?? []).map((z) => [z.materialId, vorgabe])));
      })
      .catch(() => { if (!weg) setLadeFehler(true); });
    return () => { weg = true; };
  }, [scheinId, user, neu]);

  if (ladeFehler) {
    return <ErrorState message="Ob Material vom Lager abzubuchen ist, ließ sich nicht prüfen." onRetry={() => setNeu((n) => n + 1)} />;
  }
  if (!stand) return null;

  if (stand.entschieden) {
    if (stand.gebucht.length === 0) return null;
    return (
      <section aria-label="Vom Lager abgebucht" className="space-y-2">
        <p className="section-label">Vom Lager abgebucht</p>
        <List>
          {stand.gebucht.map((g) => (
            <ListRow key={`${g.materialId}-${g.ort}`} title={g.name} subtitle={g.ort} wert={`${fmtMenge(g.menge)} ${g.einheit}`} />
          ))}
        </List>
      </section>
    );
  }
  if (stand.zeilen.length === 0) return null;

  async function buchen(nichts: boolean) {
    if (!stand) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const zeilen = nichts
        ? []
        : stand.zeilen
          .filter((z) => (wahl[z.materialId] ?? '') !== NICHT)
          .map((z) => ({ materialId: z.materialId, menge: z.vorschlag, ortId: wahl[z.materialId] || null }));
      const ok = await scheinVerbrauchBuchen(scheinId, zeilen);
      toast.success(!ok
        ? 'Inzwischen hat jemand anderes entschieden — der Schein zeigt jetzt den Stand.'
        : zeilen.length === 0 ? 'Nichts vom Lager abgebucht' : 'Vom Lager abgebucht');
      setNeu((n) => n + 1);
    } catch (e) {
      setFehler(grundAus(e, 'Das Abbuchen hat nicht geklappt.'));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <section aria-label="Verbrauch vom Lager abbuchen" className="space-y-3">
      <p className="flex flex-wrap items-center gap-1">
        <span className="section-label">Nicht über eine Anforderung gekommen</span>
        <InfoHint about="Verbrauch am Schein">
          Der Schein trägt mehr, als für diese Baustelle ausgegeben wurde (abgeholt, eingeladen, minus
          Zurückgegebenes und was andere Scheine schon tragen). Kam es aus dem Fahrzeug oder ohne
          Anforderung aus dem Regal, wird es hier abgebucht — sonst stimmt der Bestand nicht mehr.
          „Nicht abbuchen“, wenn es woanders herkam, etwa beim Händler gekauft.
        </InfoHint>
      </p>
      <List>
        {stand.zeilen.map((z) => (
          <ListRow
            key={z.materialId}
            title={z.name}
            subtitle={`auf dem Schein ${fmtMenge(z.aufSchein)} ${z.einheit} · nicht ausgegeben ${fmtMenge(z.vorschlag)} ${z.einheit}`}
          >
            <SelectField
              id={`verbrauch-${z.materialId}`}
              label=""
              aria-label={`Woher kam ${z.name}?`}
              value={wahl[z.materialId] ?? ''}
              onChange={(e) => setWahl({ ...wahl, [z.materialId]: e.target.value })}
            >
              <option value="">Hauptlager</option>
              {stand.orte.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
              <option value={NICHT}>Nicht abbuchen</option>
            </SelectField>
          </ListRow>
        ))}
      </List>
      {fehler && <ErrorState message={fehler} />}
      <div className="fuss-aktionen">
        <Button variant="ghost" disabled={laeuft} onClick={() => void buchen(true)}>
          Nichts abbuchen
        </Button>
        <Button loading={laeuft} onClick={() => void buchen(false)}>
          Abbuchen
        </Button>
      </div>
    </section>
  );
}
