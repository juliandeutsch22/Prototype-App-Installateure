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
export const beiPasswortRuecksetzung = () => () => {};
export const istPlattformAdmin = async () => false;
export const kontoAnlegen = async () => 'neu';
export const profilSchnell = async () => null;
export const profilVomServer = async () => null;
export const firmaSchnell = async () => null;
export const profilMerken = () => {};
