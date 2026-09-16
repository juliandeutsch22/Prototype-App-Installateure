/**
 * Der Vorbehalt „die Anzeige ist womöglich nicht die neueste".
 *
 * WAS HIER AUF DEM PRÜFSTAND STEHT, ist nicht das Melden, sondern das
 * ZURÜCKNEHMEN. Genau daran ist die alte Lösung gescheitert: jedes
 * Abonnement meldete seinen Abriss an die Ansicht, die Ansicht setzte ihren
 * Fehlerzustand — und niemand räumte ihn wieder weg, weil der geglückte
 * Wiederaufbau nur den Erfolgsrückruf auslöst. Ein kurzer Blick in einen
 * anderen Browser-Tab hinterliess einen roten Kasten bis zum Neuladen.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  meldeVerbindung, vergissVerbindung, verbindungSteht, abonniereVerbindung,
  verbindungZuruecksetzen,
} from '@/lib/liveVerbindung';

beforeEach(() => verbindungZuruecksetzen());

describe('Der Zustand der Live-Verbindung', () => {
  it('steht, solange sich niemand meldet', () => {
    // „Nichts gemeldet" heisst hier ausdrücklich „alles in Ordnung": das Band
    // ist ein Vorbehalt und keine Bestätigung, es hat ohne Anlass zu
    // schweigen.
    expect(verbindungSteht()).toBe(true);
  });

  it('steht nicht, sobald ein Abonnement aufgibt — und wieder, sobald es zurück ist', () => {
    meldeVerbindung('zeiten', false);
    expect(verbindungSteht()).toBe(false);

    meldeVerbindung('zeiten', true);
    expect(verbindungSteht()).toBe(true);
  });

  it('zählt dasselbe Abonnement nicht doppelt', () => {
    /*
      DER FEHLER, GEGEN DEN DAS STEHT. Mit einem Zähler statt einer Menge
      hätte ein Abonnement, das zweimal „weg" meldet, zweimal hochgezählt —
      und eine einzige Rückmeldung „wieder da" brächte ihn nie auf null. Das
      Band bliebe stehen, obwohl alles steht.
    */
    meldeVerbindung('zeiten', false);
    meldeVerbindung('zeiten', false);
    meldeVerbindung('zeiten', true);

    expect(verbindungSteht()).toBe(true);
  });

  it('bleibt unten, solange auch nur EINES noch fehlt', () => {
    meldeVerbindung('zeiten', false);
    meldeVerbindung('rechnungen', false);
    meldeVerbindung('zeiten', true);
    expect(verbindungSteht()).toBe(false);

    meldeVerbindung('rechnungen', true);
    expect(verbindungSteht()).toBe(true);
  });

  it('vergisst ein Abonnement, das abgeräumt wird — samt seinem Urteil', () => {
    /*
      Wer eine Ansicht mit abgerissenem Abonnement verlässt, nimmt das
      Abonnement mit. Ohne diese Zeile stünde das Band für immer und spräche
      über etwas, das es nicht mehr gibt.
    */
    meldeVerbindung('zeiten', false);
    vergissVerbindung('zeiten');
    expect(verbindungSteht()).toBe(true);
  });

  it('sagt den Horchern nur Bescheid, wenn sich der Gesamtzustand ändert', () => {
    const gesehen: boolean[] = [];
    abonniereVerbindung((steht) => gesehen.push(steht));

    meldeVerbindung('zeiten', false);      // true -> false: eine Meldung
    meldeVerbindung('rechnungen', false);  // bleibt unten: keine
    meldeVerbindung('zeiten', true);       // bleibt unten: keine
    meldeVerbindung('rechnungen', true);   // false -> true: eine Meldung

    /*
      Das Band zeichnet sich bei jeder Meldung neu. Meldete jedes einzelne
      Abonnement durch, flackerte es bei fünf Ansichten fünfmal — und der
      Zustand, den es anzeigt, hätte sich dabei kein einziges Mal geändert.
    */
    expect(gesehen).toEqual([false, true]);
  });

  it('ein abgemeldeter Horcher hört nichts mehr', () => {
    const gesehen: boolean[] = [];
    const ab = abonniereVerbindung((steht) => gesehen.push(steht));
    ab();

    meldeVerbindung('zeiten', false);
    expect(gesehen).toEqual([]);
  });
});
