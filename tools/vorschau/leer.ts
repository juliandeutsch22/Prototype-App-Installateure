/* Ersatz fuer Firebase, Supabase und Push — nur Namen, keine Wirkung. */
const leer = {} as never;
export const app = leer;
export const auth = leer;
export const db = leer;
export const functions = leer;
export const storage = leer;
export const verbindungBeimAufwachenErneuern = () => {};
export const getSecondaryApp = () => leer;
export const getSecondaryAuth = () => leer;
export const merkenSetzen = () => {};
export const supabaseClient = () => null;
export const getPushState = async () => 'aus' as never;
export const enablePush = async () => false;
export const disablePush = async () => {};
export default leer;
