import { ruhetag, tagLang } from './wochenTermine';

/*
  UMPLANEN IM WOCHENPLAN (E88): Verschieben, Kopieren und Entfernen eines
  Einsatzes — per Ziehen, über die Leiste am Einsatz oder das Fenster
  „Verschieben“. Hier steht, was sich ohne Bildschirm rechnen lässt: der
  nächste Werktag, die Meldungen und wohin ein Ablegen zielt.
*/

/** Was gezogen wird: ein Einsatz aus dem Raster oder eine Baustelle aus „Noch einzuplanen“. */
export type Last =
  | { art: 'einsatz'; id: string; tag: string; person: string; nummer: string; titel: string }
  | { art: 'baustelle'; nummer: string; titel: string };

/** Eine Zelle, auf die abgelegt wird: Tag und Person. */
export interface Ziel {
  tag: string;
  person: string;
}

/**
 * DER NÄCHSTE WERKTAG nach einem Tag: Montag bis Freitag, kein gesetzlicher
 * Feiertag. Betriebsurlaub kennt nur der Server — er weist ab und sagt es.
 */
export function naechsterWerktag(tag: string): string {
  const d = new Date(`${tag}T12:00:00`);
  for (let i = 0; i < 14; i += 1) {
    d.setDate(d.getDate() + 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!ruhetag(iso)) return iso;
  }
  // Vierzehn Ruhetage am Stück gibt es im Kalender nicht; der Rückfall hält die Funktion trotzdem endlich.
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Die Zelle unter einem Punkt: das nächste Element mit `data-ziel-tag` und `data-ziel-person`. */
export function zielAus(el: Element | null): Ziel | null {
  const zelle = el?.closest<HTMLElement>('[data-ziel-tag][data-ziel-person]');
  if (!zelle) return null;
  return { tag: zelle.dataset.zielTag!, person: zelle.dataset.zielPerson! };
}

/** Ändert das Ablegen etwas? Auf die eigene Zelle ohne Kopieren ist kein Umplanen. */
export function aendertEtwas(last: Last, ziel: Ziel, kopieren: boolean): boolean {
  if (last.art === 'baustelle') return true;
  return kopieren || last.tag !== ziel.tag || last.person !== ziel.person;
}

/**
 * DIE MELDUNG NACH DEM UMPLANEN: was mit wem wohin ging. Steht die Person
 * dort auch auf einer anderen Baustelle, sagt es der Nachsatz — erlaubt,
 * aber eine Planung, die man sehen soll.
 */
export function umplanText(a: {
  kopieren: boolean;
  titel: string;
  vonPerson: string;
  nachPerson: string;
  nachTag: string;
  anderswo: boolean;
}): string {
  const wohin = a.vonPerson === a.nachPerson ? tagLang(a.nachTag) : `${a.nachPerson}, ${tagLang(a.nachTag)}`;
  const was = `${a.titel} ${a.kopieren ? 'kopiert' : 'verschoben'}: ${wohin}`;
  return a.anderswo ? `${was} — steht dort auch auf einer anderen Baustelle` : was;
}
