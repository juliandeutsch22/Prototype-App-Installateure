/**
 * Wohin die Zeilen der Startseite führen (Nachtest 01.10.2026, Paket B).
 *
 * Jede Zeile und jedes „und N weitere →“ landet auf der FACHSEITE, schon
 * gefiltert. Die Filter liest die jeweilige Seite aus der Adresse; hier steht
 * an einer Stelle, wie sie heißen — sonst führt ein Tippfehler auf eine
 * ungefilterte Liste, und niemand merkt es.
 *
 * Direkt auf Unterseiten (`/assignments/tag`, `/settings/saetze`): die
 * Weiterleitung von `/assignments` auf den ersten Reiter verliert die
 * Adressparameter.
 */

const q = (wert: string) => encodeURIComponent(wert);

export const ZIEL = {
  /** Zeiterfassung, die Liste der Tage ohne Buchung oben. */
  zeitFehlend: '/time?filter=fehlend',
  /** Zeiterfassung, das Formular mit diesem Tag vorbelegt. */
  zeitTag: (tag: string) => `/time?datum=${tag}`,
  zeit: '/time',
  meineAbholbereit: '/material?reiter=meine&status=Abholbereit',
  anforderungen: (filter: AnforderungsFilter) => `/anforderungen?filter=${filter}`,
  lagerKnapp: '/lager?filter=knapp',
  rechnungen: '/invoices',
  rechnungenUeberfaellig: `/invoices?status=${q('Überfällig')}`,
  rechnungenSicht: (sicht: RechnungsSicht) => `/invoices?sicht=${sicht}`,
  rechnung: (nummer: string) => `/invoices?suche=${q(nummer)}`,
  scheine: (filter: ScheinFilter) => `/worksheets?filter=${filter}`,
  schein: (id: string) => `/worksheets?markiert=${q(id)}`,
  luecken: (monat?: string) => `/accounting?filter=luecken${monat ? `&monat=${monat}` : ''}`,
  urlaubsantraege: '/vacations?reiter=antraege',
  tag: (datum: string, filter?: 'unbesetzt') =>
    `/assignments/tag?datum=${datum}${filter ? `&filter=${filter}` : ''}`,
  woche: '/assignments/woche',
  baustellen: (filter: BaustellenFilter) => `/admin-projects?filter=${filter}`,
  baustelle: (nummer: string) => `/admin-projects?baustelle=${q(nummer)}`,
  wartungenOhneBaustelle: '/wartungen?filter=faellig-ohne-baustelle',
  einstellungen: (reiter: 'saetze' | 'rechnung' | 'konten' | 'firma') => `/settings/${reiter}`,
  einsatzplan: '/my-schedule',
  benutzerverwaltung: '/user-mgmt',
  /** Die Akte einer Person. */
  benutzer: (uid: string) => `/user-mgmt/${q(uid)}`,
} as const;

export const ANFORDERUNGS_FILTER = [
  'offen',
  'eil',
  'abholbereit-alt',
  'bestellt-ueberfaellig',
  'lieferung-heute',
] as const;
export type AnforderungsFilter = (typeof ANFORDERUNGS_FILTER)[number];

export const BAUSTELLEN_FILTER = [
  'aktiv',
  'budget',
  'ohne-einsatz',
  'ohne-leitung',
  'ende-ueberschritten',
] as const;
export type BaustellenFilter = (typeof BAUSTELLEN_FILTER)[number];

export const SCHEIN_FILTER = ['nicht-verrechnet', 'nicht-verrechnet-alt'] as const;
export type ScheinFilter = (typeof SCHEIN_FILTER)[number];

export const RECHNUNGS_SICHTEN = ['mahnung-faellig', 'bezahlt-heute', 'bezahlt-monat'] as const;
export type RechnungsSicht = (typeof RECHNUNGS_SICHTEN)[number];

/** Ein bekannter Wert aus der Adresse — sonst `null`, und die Seite zeigt alles. */
export function bekannt<T extends string>(liste: readonly T[], wert: string | null): T | null {
  return wert && (liste as readonly string[]).includes(wert) ? (wert as T) : null;
}

/** Ob eine Ziel-Adresse zu einer Seite gehört, die diese Rolle sieht — Grundpfad ohne Parameter. */
export function grundpfad(ziel: string): string {
  const ohne = ziel.split('?')[0];
  const teile = ohne.split('/').filter(Boolean);
  return teile.length === 0 ? '/' : `/${teile[0]}`;
}
