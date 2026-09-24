/**
 * Wer Senklot betreibt — die Angaben für Impressum und Datenschutzerklärung.
 *
 * AN EINER STELLE, damit die geprüfte Fassung nur hier eingetragen werden
 * muss und nicht in zwei Seiten gesucht.
 *
 * NOCH NICHT AUSGEFÜLLT, UND DAS STEHT SICHTBAR DA. Die Texte der beiden
 * Seiten sind ein Entwurf; sie muss jemand mit Rechtskenntnis freigeben
 * (etwa über eine Vorlage der WKO). Solange `GEPRUEFT` falsch ist, zeigen
 * beide Seiten oben ein Band „Entwurf". Ein Platzhalter, der aussieht wie
 * eine Angabe, wäre schlimmer als eine sichtbare Lücke.
 */

/** Erst auf `true` setzen, wenn die Texte rechtlich freigegeben sind. */
export const GEPRUEFT = false;

/** Stand der Texte — mit jeder Änderung nachziehen. */
export const STAND = '24.09.2026';

const OFFEN = (was: string) => `[${was} — wird ergänzt]`;

export const BETREIBER = {
  name: OFFEN('Name bzw. Firma des Betreibers'),
  anschrift: OFFEN('Anschrift'),
  email: OFFEN('E-Mail-Adresse'),
  telefon: OFFEN('Telefonnummer'),
  uid: OFFEN('UID-Nummer, falls vorhanden'),
  firmenbuch: OFFEN('Firmenbuchnummer und -gericht, falls eingetragen'),
  gewerbe: OFFEN('Gewerbe, zuständige Behörde und Kammerzugehörigkeit'),
};

/**
 * Die Unterauftragsverarbeiter — was die App tatsächlich benutzt.
 *
 * Aus dem Code abgelesen, nicht aus einem Vertrag: Datenbank, Anmeldung und
 * Dateien liegen bei Supabase, die App selbst und die Push-Meldungen bei
 * Google (Firebase Hosting und Cloud Messaging), die Sicherung ausser Haus
 * bei einem S3-kompatiblen Anbieter, die Anmeldemails bei einem
 * Mailanbieter. Die beiden letzten sind noch nicht gewählt.
 */
export const VERARBEITER: { wer: string; wofuer: string; wo: string }[] = [
  {
    wer: 'Supabase Inc.',
    wofuer: 'Datenbank, Anmeldung und Dateispeicher (Fotos, Pläne, Unterschriften)',
    wo: 'Rechenzentrum in der EU (Frankfurt am Main) — Region im Produktivprojekt zu bestätigen',
  },
  {
    wer: 'Google Ireland Ltd. (Firebase Hosting)',
    wofuer: 'Auslieferung der App an den Browser; dabei wird die IP-Adresse verarbeitet',
    wo: 'weltweites Auslieferungsnetz, Google LLC in den USA als Mutterunternehmen',
  },
  {
    wer: 'Google Ireland Ltd. (Firebase Cloud Messaging)',
    wofuer: 'Push-Meldungen auf das Gerät, wenn sie erlaubt wurden: Gerätekennung und Text der Meldung',
    wo: 'Google LLC in den USA als Mutterunternehmen',
  },
  {
    wer: OFFEN('Anbieter der Sicherung ausser Haus'),
    wofuer: 'nächtliche Sicherung des gesamten Bestands eines Betriebs, 30 Tage aufbewahrt',
    wo: OFFEN('Standort'),
  },
  {
    wer: OFFEN('Mailanbieter'),
    wofuer: 'Einladungs- und Rücksetzmails zur Anmeldung',
    wo: OFFEN('Standort'),
  },
];
