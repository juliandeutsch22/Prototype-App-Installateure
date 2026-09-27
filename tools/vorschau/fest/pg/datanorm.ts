/* Vorschau: Katalogimport ohne Datenbank. */
export type Lauf = Record<string, unknown>;
export type Lieferant = { id: string; name: string };
export type UebernahmeBericht = Record<string, unknown>;
export const laeufe = async () => [];
export const laufAnlegen = async () => 'lauf-1';
export const lieferantAnlegen = async () => 'l-1';
export const lieferanten = async () => [{ id: 'l-1', name: 'Großhandel Muster' }];
export const rabattsaetze = async () => [];
export const rabattsatzSetzen = async () => undefined;
export const uebernehmen = async () => ({ neu: 0, geaendert: 0 });
export const zeilenSchicken = async () => undefined;
