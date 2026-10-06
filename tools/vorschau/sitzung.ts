/* Ersatz fuer `@/lib/auth/sitzung` — die Vorschau ist immer angemeldet. */
export class InactiveUserError extends Error {}
export type Angemeldet = { uid: string; email: string };
export const beiAenderung = () => () => {};
export const anmelden = async () => {};
export const abmelden = async () => {};
export const passwortZuruecksetzen = async () => {};
export const passwortSetzen = async () => {};
export const startpasswortOffen = async () => false;
export const passwortVergeben = async () => {};
export const kontoUmstellen = async () => ({ anmeldung: 'vorschau@perl.at' });
export const beiPasswortRuecksetzung = () => () => {};
export const istPlattformAdmin = async () => false;
export const kontoAnlegen = async () => 'neu';
export const profilSchnell = async () => null;
export const profilVomServer = async () => null;
export const firmaSchnell = async () => null;
export const profilMerken = () => {};
// Runde 3, H1: die Zwei-Faktor-Anmeldung — in der Vorschau nie verlangt.
export type ZweiterFaktorBedarf = 'keiner' | 'pruefen' | 'einrichten';
export const zweiterFaktorBedarf = async (): Promise<ZweiterFaktorBedarf> => 'keiner';
export const zweiterFaktorStand = async () => ({
  angeboten: false, pflicht: false, plattform: false, betriebPflicht: false,
  eingerichtet: false, codesOffen: 0, codeZuletztVerwendet: null,
});
export const einrichtenBeginnen = async () => ({ faktorId: 'vorschau', qrCode: '', geheimnis: '' });
export const einrichtenBestaetigen = async () => [] as string[];
export const neueCodes = async () => [] as string[];
export const codePruefen = async () => {};
export const codeEinloesen = async () => {};
export const zweitenFaktorAusschalten = async () => {};
export type { NeuerFaktor, ZweiterFaktorStand } from '../../src/lib/auth/pg/zweiFaktor';
