import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { syncUserClaims } from './claims.js';
export { voiceExtract } from './extract.js';
export { exportCompanyData } from './export.js';
export { notifyNewOrder, notifyOrderReady } from './notify.js';

/*
 * Alle Functions werden hier statisch exportiert — auch voiceExtract, obwohl
 * es als einziges API-Schlüssel braucht.
 *
 * Ein bedingter Import wurde versucht und wieder verworfen: Firebase
 * analysiert diese Datei vor dem Deploy, und ein dynamischer Import mit
 * top-level await lässt sich dabei nicht auswerten ("Functions codebase
 * could not be analyzed successfully").
 *
 * Praktische Folge, die man kennen muss: `defineSecret` in extract.ts wird
 * schon beim Analysieren aufgelöst, unabhängig von `--only`. Fehlt der
 * Secret Manager oder eines der beiden Secrets, scheitert deshalb der
 * GESAMTE Deploy — auch syncUserClaims, das mit der KI nichts zu tun hat.
 * Die Secrets müssen also existieren, bevor überhaupt etwas deployt werden
 * kann; notfalls mit Platzhalterwert. Siehe README, Abschnitt Cloud
 * Functions.
 */
