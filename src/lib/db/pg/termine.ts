/**
 * Termine, die kein Einsatz sind — auf Postgres (Plan 10.4).
 *
 * Gelesen und geschrieben wird direkt; wer was sieht und darf, entscheidet
 * der Zeilenschutz (`termine_lesen`, `termine_schreiben`). Die Leitung und
 * die Verwaltung bekommen damit alle Termine des Betriebs, ein Monteur nur
 * die, an denen er teilnimmt oder an deren Tag er auf der Baustelle steht.
 */
import type { Termin } from '@/types';
import { abfragen, aendern, anlegen, loeschen } from './kern';

const TERMINE = 'termine';

export type TerminEingabe = Pick<
  Termin,
  'art' | 'datum' | 'zeitVon' | 'zeitBis' | 'projectNumber' | 'customerId' | 'teilnehmer' | 'notiz'
>;

/** Die Termine eines Zeitraums, nach Tag und Uhrzeit. */
export async function listTermineImZeitraum(companyId: string, von: string, bis: string) {
  const zeilen = await abfragen<Termin>(TERMINE, companyId, {
    wo: [
      { art: 'ab', feld: 'datum', wert: von },
      { art: 'bis', feld: 'datum', wert: bis },
    ],
    sortiere: { feld: 'datum' },
    grenze: 2000,
  });
  return zeilen.sort(nachZeit);
}

/** Die Termine einer Baustelle — für die Baustellenakte. */
export async function listTermineDerBaustelle(companyId: string, projectNumber: string) {
  const zeilen = await abfragen<Termin>(TERMINE, companyId, {
    wo: [{ art: 'gleich', feld: 'projectNumber', wert: projectNumber }],
    sortiere: { feld: 'datum' },
    grenze: 500,
  });
  return zeilen.sort(nachZeit);
}

/**
 * Die Termine eines Kunden — beim Kunden selbst und auf seinen Baustellen.
 * Zwei Abfragen statt einer mit „oder": die Bedingungen der Datenschicht
 * kennen nur „und", und ein Termin hängt nie an beidem.
 */
export async function listTermineDesKunden(companyId: string, customerId: string, baustellen: string[]) {
  const [beimKunden, aufBaustellen] = await Promise.all([
    abfragen<Termin>(TERMINE, companyId, {
      wo: [{ art: 'gleich', feld: 'customerId', wert: customerId }],
      grenze: 500,
    }),
    baustellen.length > 0
      ? abfragen<Termin>(TERMINE, companyId, {
          wo: [{ art: 'in', feld: 'projectNumber', werte: baustellen }],
          grenze: 500,
        })
      : Promise.resolve([] as Termin[]),
  ]);
  return [...beimKunden, ...aufBaustellen].sort(nachZeit);
}

export function terminAnlegen(companyId: string, t: TerminEingabe): Promise<string> {
  return anlegen(TERMINE, companyId, bereinigt(t));
}

export function terminAendern(id: string, t: TerminEingabe): Promise<void> {
  return aendern(TERMINE, id, bereinigt(t));
}

export function terminLoeschen(id: string): Promise<void> {
  return loeschen(TERMINE, id);
}

/**
 * Leere Felder als `null`, nicht als Leertext: die Datenbank verlangt GENAU
 * eines von Baustelle und Kunde, und eine leere Uhrzeit ist keine.
 */
function bereinigt(t: TerminEingabe): Record<string, unknown> {
  const leer = (w: string | null | undefined) => (w && w.trim() ? w.trim() : null);
  return {
    art: t.art,
    datum: t.datum,
    zeitVon: leer(t.zeitVon),
    zeitBis: leer(t.zeitBis),
    projectNumber: leer(t.projectNumber),
    customerId: leer(t.customerId),
    teilnehmer: [...new Set(t.teilnehmer)],
    notiz: leer(t.notiz),
  };
}

/** Tag, dann Uhrzeit; ohne Uhrzeit zuerst — „irgendwann am Tag" steht oben. */
export function nachZeit(a: Termin, b: Termin): number {
  return a.datum.localeCompare(b.datum) || (a.zeitVon ?? '').localeCompare(b.zeitVon ?? '');
}
