import type { Material } from '@/types';
import type { WithId } from '@/lib/db/core';
import type { LagerListe, LagerListeFrage, LagerZeile } from '@/lib/db/materials';

/**
 * DIE LAGERLISTE DER DATENBANK, NACHGEBILDET (seit 15.11.2026 rechnet
 * `lager_liste` sie; die Regeln selbst prüft
 * `tests/supabase/lagerListe.test.ts` gegen die Datenbank).
 *
 * Für die Komponentenprüfungen: aus den Mustern der Prüfung und dem Stand je
 * Artikel (Zugesagtes, Geplantes — wie `lager_frei`) dieselbe Antwort —
 * gesucht, gefiltert, sortiert, die gezeigte Seite und die Zahlen über alle.
 */
export async function lagerListeNachgebildet(
  f: LagerListeFrage,
  quellen: {
    materialien: WithId<Material>[];
    stand: (ids: string[]) => Promise<Map<string, unknown>>;
    /** Am weiteren Ort: Kennung des Artikels → Menge dort. */
    amOrt?: (ort: string) => Promise<Map<string, number>>;
  },
): Promise<LagerListe> {
  const gefuehrt = quellen.materialien.filter((m) => m.lagerartikel !== false);
  const stand = (await quellen.stand(gefuehrt.map((m) => m.id))) as Map<string, { zugesagt?: number; geplant?: number }>;
  const alle: LagerZeile[] = gefuehrt.map((m) => {
    const s = stand.get(m.id);
    const reserved = (s?.zugesagt ?? 0) + (s?.geplant ?? 0);
    return { ...m, reserved, geplant: s?.geplant ?? 0, free: (m.stock ?? 0) - reserved };
  });
  const knapp = (m: LagerZeile, wert: number) =>
    !m.ausgelaufen && (m.mindestmenge != null ? wert < m.mindestmenge : wert <= f.grenze);
  const am = f.ort && quellen.amOrt ? await quellen.amOrt(f.ort) : null;
  const q = (f.begriff ?? '').trim().toLowerCase();
  const filter = f.filter ?? 'alle';
  const treffer = alle
    .filter((m) => !f.nur || f.nur.includes(m.id))
    .filter((m) => !f.ort || (am?.get(m.id) ?? 0) !== 0)
    .filter((m) => !q || [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q)) || (f.treffer ?? []).includes(m.id))
    .filter((m) => !!f.ort || filter === 'alle' || (filter === 'knapp' && knapp(m, m.free)) || (filter === 'fehlt' && m.free < 0))
    .map((m) => (am ? { ...m, amOrt: am.get(m.id) ?? 0 } : m))
    .sort((a, b) =>
      ((f.reihenfolge ?? 'frei') === 'frei' ? a.free - b.free : 0)
      || a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id));
  return {
    zeilen: treffer.slice(0, f.anzahl),
    treffer: treffer.length,
    imLager: alle.length,
    knapp: alle.filter((m) => knapp(m, m.free)).length,
    knappBestand: alle.filter((m) => knapp(m, m.stock ?? 0)).length,
    fehlt: alle.filter((m) => m.free < 0).length,
    reserviert: alle.reduce((s, m) => s + m.reserved, 0),
    warengruppen: [...new Set(gefuehrt.map((m) => m.warengruppe?.trim()).filter((w): w is string => !!w))]
      .sort((a, b) => a.localeCompare(b, 'de')),
  };
}
