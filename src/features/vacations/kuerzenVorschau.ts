import type { Vacation } from '@/types';
import { kuerzen } from '@/lib/db/vacations';
import { zeitraumText } from './abwesenheitText';

/**
 * KÜRZEN EINES GENEHMIGTEN URLAUBS (Z1) — die Vorschau in der Maske.
 *
 * Entschieden wird in der Datenbank (`urlaub_kuerzen`); hier steht nur, was
 * die Maske vorher sagen kann: welche Zeiträume bleiben, und was keine
 * Kürzung wäre. Ein gestrichener Tag mitten im Urlaub teilt den Antrag —
 * die Vorschau zeigt dann beide Teile. Teile ohne Arbeitstag (nur ein
 * Wochenende) lässt die Datenbank fallen; die Vorschau rechnet in
 * Kalendertagen und sagt das nicht voraus.
 */

/** Ein Kalendertag weiter, als 'YYYY-MM-DD' — ohne Zeitzone. */
function naechster(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Die zusammenhängenden Zeiträume, die nach dem Kürzen bleiben. */
export function kuerzenTeile(von: string, bis: string, streichen: readonly string[]): { von: string; bis: string }[] {
  const weg = new Set(streichen);
  const teile: { von: string; bis: string }[] = [];
  let laufend: { von: string; bis: string } | null = null;
  for (let t = von; t <= bis; t = naechster(t)) {
    if (weg.has(t)) {
      laufend = null;
      continue;
    }
    if (laufend) laufend.bis = t;
    else {
      laufend = { von: t, bis: t };
      teile.push(laufend);
    }
  }
  return teile;
}

/** „02.08.2027 – 04.08.2027 und 06.08.2027 – 11.08.2027“. */
export function teileText(teile: readonly { von: string; bis: string }[]): string {
  return teile.map((t) => zeitraumText(t.von, t.bis)).join(' und ');
}

/** Warum das (noch) keine Kürzung ist — oder `null`. Dieselben Fälle weist die Datenbank ab. */
export function kuerzenFehler(
  antrag: Pick<Vacation, 'von' | 'bis'>,
  von: string,
  bis: string,
  streichen: readonly string[],
): string | null {
  if (!von || !bis || von > bis) return 'Bitte einen gültigen Zeitraum wählen (Beginn vor Ende).';
  if (von < antrag.von || bis > antrag.bis) {
    return `Gekürzt wird innerhalb des genehmigten Zeitraums (${zeitraumText(antrag.von, antrag.bis)}).`;
  }
  if (streichen.some((t) => t < von || t > bis)) return 'Der gestrichene Tag liegt nicht im Zeitraum.';
  const teile = kuerzenTeile(von, bis, streichen);
  if (teile.length === 0) return 'Es bliebe kein Tag — dann bitte ganz zurücknehmen.';
  if (teile.length === 1 && teile[0].von === antrag.von && teile[0].bis === antrag.bis) {
    return 'Der Zeitraum ist unverändert.';
  }
  return null;
}

/** Was die Maske zum Kürzen hält — kontrolliert, damit auch der Dialog am Tag sie einbetten kann. */
export interface KuerzenStand {
  von: string;
  bis: string;
  /** Ein Tag, der gestrichen wird — leer heißt keiner. */
  streichen: string;
}

export function kuerzenAnfang(antrag: Pick<Vacation, 'von' | 'bis'>, tag?: string): KuerzenStand {
  // Vom Tag aus geöffnet, ist das Naheliegende: genau diesen Tag streichen.
  return { von: antrag.von, bis: antrag.bis, streichen: tag && tag >= antrag.von && tag <= antrag.bis ? tag : '' };
}

/** Kürzen senden; die Meldung sagt, was im Zeitkonto geschah. */
export async function kuerzenSenden(
  antrag: Pick<Vacation, 'von' | 'bis'> & { id: string },
  stand: KuerzenStand,
  grund: string,
  name: string,
): Promise<string> {
  const streichen = stand.streichen ? [stand.streichen] : [];
  const fehler = kuerzenFehler(antrag, stand.von, stand.bis, streichen);
  // Geworfen, damit der Dialog offen bleibt und es selbst sagt.
  if (fehler) throw new Error(fehler);
  if (grund.trim().length < 3) throw new Error('Bitte einen Grund angeben — mindestens drei Zeichen.');
  const r = await kuerzen({ vacationId: antrag.id, von: stand.von, bis: stand.bis, streichen, grund: grund.trim(), name });
  return `Gekürzt — ${r.entfernt} ${r.entfernt === 1 ? 'Tag' : 'Tage'} aus dem Zeitkonto entfernt${r.teile > 1 ? `, in ${r.teile} Anträge geteilt` : ''}`;
}

