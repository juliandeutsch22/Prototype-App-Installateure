import { useState } from 'react';
import { FormGrid, InputField } from '@/components/Field';
import { ZahlWertFeld } from '@/components/ZahlFeld';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import type { Materialaufschlag } from '@/lib/aufschlag';

interface Zeile { wg: string; prozent: number | null }

function alsZeilen(a?: Materialaufschlag): Zeile[] {
  return Object.entries(a?.warengruppen ?? {}).map(([wg, prozent]) => ({ wg, prozent }));
}

/** Nur vollständige Zeilen werden zum Aufschlag; eine leere Warengruppe gibt es nicht. */
function alsAufschlag(standard: number | null | undefined, zeilen: Zeile[]): Materialaufschlag {
  const warengruppen: Record<string, number> = {};
  for (const z of zeilen) {
    if (z.wg.trim() && z.prozent != null) warengruppen[z.wg.trim()] = z.prozent;
  }
  return {
    ...(standard != null ? { standard } : {}),
    ...(Object.keys(warengruppen).length ? { warengruppen } : {}),
  };
}

/**
 * MATERIALAUFSCHLAG (Testbericht 30.09.2026, M31): ein Standard in Prozent
 * je Betrieb, abweichend je Warengruppe aus DATANORM. Daraus schlägt der
 * Katalog den Verkaufspreis vor — er bleibt überschreibbar.
 */
export default function MaterialaufschlagFelder({
  wert,
  onWert,
}: {
  wert?: Materialaufschlag;
  onWert: (a: Materialaufschlag) => void;
}) {
  const [zeilen, setZeilen] = useState<Zeile[]>(() => alsZeilen(wert));
  const standard = wert?.standard ?? null;

  const zeilenSetzen = (neu: Zeile[]) => {
    setZeilen(neu);
    onWert(alsAufschlag(standard, neu));
  };

  return (
    <div className="space-y-3">
      <FormGrid>
        <ZahlWertFeld
          id="aufschlag-standard"
          label="Standard-Aufschlag (%)"
          placeholder="leer = kein Vorschlag"
          wert={standard}
          onWert={(n) => onWert(alsAufschlag(n, zeilen))}
        />
      </FormGrid>
      {zeilen.length > 0 && <p className="section-label">Abweichend je Warengruppe</p>}
      {zeilen.map((z, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <InputField
              id={`aufschlag-wg-${i}`}
              label="Warengruppe"
              placeholder="z. B. 1201"
              value={z.wg}
              onChange={(e) => zeilenSetzen(zeilen.map((x, j) => (j === i ? { ...x, wg: e.target.value } : x)))}
            />
          </div>
          <div className="w-32">
            <ZahlWertFeld
              id={`aufschlag-prozent-${i}`}
              label="Aufschlag (%)"
              wert={z.prozent}
              onWert={(n) => zeilenSetzen(zeilen.map((x, j) => (j === i ? { ...x, prozent: n } : x)))}
            />
          </div>
          <IconButton
            label={`Warengruppe ${z.wg || i + 1} entfernen`}
            tone="danger"
            onClick={() => zeilenSetzen(zeilen.filter((_, j) => j !== i))}
          >
            ✕
          </IconButton>
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={() => setZeilen([...zeilen, { wg: '', prozent: null }])}>
        Warengruppe hinzufügen
      </Button>
    </div>
  );
}
