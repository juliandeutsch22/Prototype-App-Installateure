import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { syncUserClaims } from './claims.js';
export { exportCompanyData } from './export.js';
export { datenAusleitung, datenAusleitungJetzt } from './ausleitung.js';
export { notifyNewOrder, notifyOrderReady } from './notify.js';
export {
  bilanzNachziehen,
  bilanzenNachtlauf,
  bilanzenNeuAufbauen,
} from './monatsbilanz.js';
export { scheinPruefsumme } from './scheinPruefsumme.js';
export { scheinVorbereiten } from './scheinVorbereiten.js';
export { urlaubEntscheiden } from './urlaubEntscheiden.js';

/*
 * Die KI-Spracherfassung wird über eine GENERIERTE Datei eingebunden
 * (scripts/voice-entry.mjs, läuft als prebuild).
 *
 * Grund: `defineSecret` in extract.ts löst Firebase schon beim Analysieren
 * des Codes auf, unabhängig von `--only`. Ein statischer Export von
 * voiceExtract verlangt damit bei JEDEM Deploy die beiden API-Schlüssel im
 * Secret Manager — auch beim Deploy von syncUserClaims, das mit der KI nichts
 * zu tun hat. Und ohne syncUserClaims bekommt ein neu angelegter Benutzer
 * keine Berechtigungen.
 *
 * Ein bedingter dynamischer Import wurde versucht und verworfen: die Analyse
 * scheitert daran ("Functions codebase could not be analyzed successfully").
 * Sie braucht statische Exporte. Also entscheidet der Build.
 *
 * Einschalten: ENABLE_VOICE=true beim Bauen setzen (im Workflow als Eingabe),
 * vorher die beiden Secrets anlegen. Siehe README, Abschnitt Cloud Functions.
 */
export * from './voice-entry.js';
