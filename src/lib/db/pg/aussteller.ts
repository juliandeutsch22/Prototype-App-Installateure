import type { AusstellerAngaben } from '@/lib/aussteller';
import { abfragen } from './kern';

/*
  EIN STAND ÄNDERT SICH NIE — er wird einmal angelegt und nur gelesen. Was
  einmal geladen ist, bleibt deshalb gemerkt: das Belegarchiv druckt hunderte
  Rechnungen mit meist einer Handvoll Ständen, und jeder Nachdruck derselben
  Rechnung fragt sonst erneut.
*/
const gemerkt = new Map<string, AusstellerAngaben>();

/** Die Stände zu diesen Kennungen — fehlt einer, fehlt er in der Karte. */
export async function ausstellerStaende(
  companyId: string,
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, AusstellerAngaben>> {
  const gesucht = [...new Set(ids.filter((id): id is string => !!id))];
  const fehlend = gesucht.filter((id) => !gemerkt.has(id));
  if (fehlend.length > 0) {
    const zeilen = await abfragen<{ angaben: AusstellerAngaben }>('aussteller_staende', companyId, {
      wo: [{ art: 'in', feld: 'id', werte: fehlend }],
    });
    for (const z of zeilen) gemerkt.set(z.id, z.angaben);
  }
  const raus = new Map<string, AusstellerAngaben>();
  for (const id of gesucht) {
    const a = gemerkt.get(id);
    if (a) raus.set(id, a);
  }
  return raus;
}
