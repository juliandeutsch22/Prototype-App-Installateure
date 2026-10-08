/**
 * Wer in der Bestandsaufnahme angemeldet wird (Umbau „Lot“, Protokoll A1).
 *
 * Eine VARIANTE ist Rolle plus alles, was über die Rolle hinaus die
 * Oberfläche verändert: Freigaben in der Benutzerakte, die Einstufung, ein
 * Schalter des Betriebs, der Supportmodus. Die Vorschau kennt sie über
 * Abfrageparameter (`tests/ui-umbau/vorschau/AuthStubBestand.tsx`).
 */
import path from 'node:path';
import type { Role } from '@/types';
import type { Zusatzrechte } from '@/app/navigation';

export interface Variante {
  /** Kurzname, auch im Dateinamen der Teilergebnisse. */
  schluessel: string;
  /** Wie in Anhang 12.1: die Rolle in Kleinbuchstaben. */
  rolle: string;
  /** Rolle, mit der Navigation und Wächter fragen; `null` beim globalen Admin. */
  navRolle: Role | null;
  /** Wie in Anhang 12.1: was über die Rolle hinaus gilt. */
  freigaben: string[];
  /** Abfrageparameter für die Vorschau. */
  parameter: string;
  zusatz: Zusatzrechte;
  schalter: { wochenplanFuerAlle?: boolean };
}

const v = (
  schluessel: string, rolle: string, navRolle: Role | null, freigaben: string[], parameter: string,
  zusatz: Zusatzrechte = {}, schalter: Variante['schalter'] = {},
): Variante => ({ schluessel, rolle, navRolle, freigaben, parameter, zusatz, schalter });

export const VARIANTEN: Variante[] = [
  v('mitarbeiter', 'mitarbeiter', 'Mitarbeiter', [], 'rolle=Mitarbeiter'),
  /*
    Der Lehrling ist ein Mitarbeiter mit Einstufung „Lehrling“. „Unter 18“
    kennt die Oberfläche nicht als Eigenschaft der Anmeldung — die Grenzen
    des KJBG zieht die Datenbank beim Buchen; das lässt sich in der Vorschau
    nicht nachbilden. Der Betriebsschalter „Wochenplan für alle“ hängt hier,
    damit die Team-Woche einmal im Bestand steht.
  */
  v('lehrling', 'mitarbeiter', 'Mitarbeiter', ['einstufung:lehrling', 'betrieb:wochenplanFuerAlle'],
    'rolle=Mitarbeiter&einstufung=lehrling&betrieb=wochenplanFuerAlle', {}, { wochenplanFuerAlle: true }),
  v('verwaltung', 'verwaltung', 'Verwaltung', [], 'rolle=Verwaltung'),
  v('verwaltung-freigaben', 'verwaltung', 'Verwaltung', ['kundenPflegen', 'katalogEinspielen', 'einkaufSehen'],
    'rolle=Verwaltung&freigaben=kundenPflegen,katalogEinspielen,einkaufSehen'),
  v('buchhaltung', 'buchhaltung', 'Buchhaltung', [], 'rolle=Buchhaltung'),
  v('buchhaltung-freigaben', 'buchhaltung', 'Buchhaltung', ['kundenPflegen'],
    'rolle=Buchhaltung&freigaben=kundenPflegen'),
  v('projektleiter', 'projektleiter', 'Projektleiter', [], 'rolle=Projektleiter'),
  v('projektleiter-freigaben', 'projektleiter', 'Projektleiter',
    ['rechnungenLesen', 'betrieb:projektleitungImEinsatzplan'],
    'rolle=Projektleiter&freigaben=rechnungenLesen&betrieb=projektleitungImEinsatzplan',
    { rechnungenLesen: true, projektleitungImEinsatzplan: true }),
  v('geschaeftsfuehrung', 'geschaeftsfuehrung', 'Geschäftsführung', [], 'rolle=Geschäftsführung'),
  v('administrator', 'administrator', 'Administrator', [], 'rolle=Administrator'),
  v('globaler-admin', 'globaler-admin', null, [], 'plattform=1'),
  v('support-ansehen', 'administrator', 'Administrator', ['support:ansehen'], 'rolle=Administrator&einblick=ansehen'),
  v('support-mitarbeiten', 'administrator', 'Administrator', ['support:mitarbeiten'],
    'rolle=Administrator&einblick=mitarbeiten'),
];

/** Die drei Breiten aus dem Protokoll (A1) — Handy, Tablet hoch, Schreibtisch. */
export const BREITEN: Array<{ breite: number; hoehe: number }> = [
  { breite: 390, hoehe: 844 },
  { breite: 834, hoehe: 1112 },
  { breite: 1440, hoehe: 900 },
];

/**
 * Feste Uhrzeit für jede Aufnahme. Die Beispieldaten rechnen „heute“ aus der
 * Uhr; ohne feste Zeit stünde in jeder Aufnahme ein anderes Datum, und vorher
 * und nachher ließen sich nicht vergleichen.
 */
export const UHR = '2026-10-07T09:00:00+02:00';

export const BASIS = process.env.BESTAND_URL ?? 'http://localhost:4319/tools/vorschau/';

/** `vorher` oder `nachher` — bestimmt den Namen der Ergebnisdatei. */
export const QUELLE = process.env.BESTAND_QUELLE ?? 'vorher';
/** Teilergebnisse je Variante und Breite; der globalTeardown führt sie zusammen. */
export const TEILE = path.resolve('test-results/ui-umbau-bestand', QUELLE);
