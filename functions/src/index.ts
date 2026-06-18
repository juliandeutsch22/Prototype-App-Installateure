import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { syncUserClaims } from './claims.js';
export { voiceExtract } from './extract.js';
export { exportCompanyData } from './export.js';
