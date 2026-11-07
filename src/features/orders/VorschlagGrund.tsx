import { useEffect, useState } from 'react';
import { lieferantVorschlagGrund, type VorschlagGrund as Grund } from '@/lib/db/einkauf';
import { euroPreis } from '@/lib/betrag';
import { datumAT } from '@/lib/datum';

/**
 * WARUM DIESER GROSSHÄNDLER VORGESCHLAGEN IST (M03a, E03) — unter der Wahl
 * des Großhändlers, wenn ein Artikel auf die Einkaufsliste kommt.
 *
 * Seit dem Preisvergleich nimmt der Vorschlag den günstigsten vergleichbaren
 * Lieferanten, sonst wie bisher den zuletzt eingespielten Katalog. Damit der
 * Wechsel nicht unerklärt bleibt, steht der Grund dabei — aber nur für die,
 * die Einkaufspreise sehen dürfen (`zeigen`, von der Seite aus Rolle und
 * Modul „Lieferantenvergleich“); die Einkaufsliste bleibt sonst preisfrei.
 * Steht im Feld ein anderer Großhändler als der vorgeschlagene, sagt die
 * Zeile nichts — dann hat ein Mensch gewählt.
 */
export default function VorschlagGrund({
  materialId,
  gewaehlt,
  zeigen,
}: {
  materialId: string | null | undefined;
  /** Der Großhändler, der gerade im Feld steht. */
  gewaehlt: string;
  zeigen: boolean;
}) {
  const [grund, setGrund] = useState<{ fuer: string; wert: Grund | null } | null>(null);

  useEffect(() => {
    if (!zeigen || !materialId) return;
    let weg = false;
    lieferantVorschlagGrund(materialId)
      .then((wert) => {
        if (!weg) setGrund({ fuer: materialId, wert });
      })
      // Nur eine Auskunft: ohne sie bleibt die Wahl, wie sie ist.
      .catch(() => {
        if (!weg) setGrund({ fuer: materialId, wert: null });
      });
    return () => {
      weg = true;
    };
  }, [zeigen, materialId]);

  if (!zeigen || !materialId || grund?.fuer !== materialId || !grund.wert) return null;
  const w = grund.wert;
  if (w.supplierId !== gewaehlt) return null;
  const stand = w.stand ? `Stand ${datumAT(w.stand)}` : null;
  const zusatz = [w.einkaufspreis != null ? euroPreis(w.einkaufspreis) : null, stand].filter(Boolean).join(', ');
  return (
    <p className="mt-1 text-sm text-ink-muted" data-testid="vorschlag-grund">
      {w.grund === 'guenstigster'
        ? `Vorgeschlagen: günstigster vergleichbarer Einkaufspreis${zusatz ? ` (${zusatz})` : ''}.`
        : `Vorgeschlagen: zuletzt eingespielter Katalog${stand ? ` (${stand})` : ''} — kein vollständiger Preisvergleich.`}
    </p>
  );
}
