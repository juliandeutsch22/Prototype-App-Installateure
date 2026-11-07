import { Warnung, Zustand } from '@/components/Badge';
import { angabenText, type ZeitfeldAnzeige, type ZeitfeldWert } from '@/lib/zeitfelder';

/**
 * DIE FREIEN ANGABEN EINER BUCHUNG ALS TEXT (M06b) — in „Meine Einträge“ und
 * im Tagesnachweis der Mitarbeiterübersicht: „Kostenstelle: Wien ·
 * Kilometer: 12 km“, dazu was offen ist. „Nachpflege“ (Pflicht beim Buchen,
 * ohne Wert — eine vorgemerkte Buchung mit älterer Fassung) ist eine
 * Warnung; „fehlt“ (ergänzt das Büro) ist offen, kein Fehler.
 */
export default function ZeitfeldAngaben({
  definitionen,
  werte,
  offen,
}: {
  definitionen: readonly ZeitfeldAnzeige[];
  werte: Record<string, ZeitfeldWert> | undefined;
  offen?: { fehlt: string[]; nachpflege: string[] };
}) {
  const zeilen = angabenText(definitionen, werte);
  const nachpflege = offen?.nachpflege ?? [];
  const fehlt = offen?.fehlt ?? [];
  if (zeilen.length === 0 && nachpflege.length === 0 && fehlt.length === 0) return null;
  return (
    <span className="zeitfeld-angaben mt-1 block text-sm text-ink-muted">
      {zeilen.length > 0 && <span className="block">{zeilen.join(' · ')}</span>}
      {nachpflege.length > 0 && (
        <span className="block"><Warnung>Nachpflege: {nachpflege.join(', ')}</Warnung></span>
      )}
      {fehlt.length > 0 && (
        <span className="block"><Zustand stand="offen">fehlt: {fehlt.join(', ')}</Zustand></span>
      )}
    </span>
  );
}
