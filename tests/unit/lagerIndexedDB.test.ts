/**
 * Das Lager im Browser — geprüft gegen eine echte IndexedDB-Umsetzung
 * (fake-indexeddb), nicht gegen einen Nachbau. Die Zusagen, um die es geht,
 * sind gerade die der Datenbank: fortlaufende Schlüssel und eine Transaktion,
 * die erst abgeschlossen ist, wenn sie abgeschlossen ist.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { lagerImBrowser, lagerVerfuegbar } from '@/lib/sync/lagerIndexedDB';
import { schreiben, nachsenden, type Sender } from '@/lib/sync/ausgangsfach';

const vormerkung = (zeile: string) => ({
  zeile,
  tabelle: 'time_entries',
  art: 'anlegen' as const,
  daten: { date: '2026-09-11' },
  versuche: 0,
  angelegt: Date.now(),
});

beforeEach(() => {
  // Jeder Test bekommt eine frische Datenbank.
  globalThis.indexedDB = new IDBFactory();
});

describe('lagerImBrowser', () => {
  it('meldet sich als verfügbar', () => {
    expect(lagerVerfuegbar()).toBe(true);
  });

  it('legt ab und liest zurück', async () => {
    const l = lagerImBrowser();
    const folge = await l.ablegen(vormerkung('z1'));
    expect(folge).toBe(1);
    const alle = await l.alle();
    expect(alle).toHaveLength(1);
    expect(alle[0]).toMatchObject({ folge: 1, zeile: 'z1' });
  });

  it('vergibt fortlaufende Folgen und gibt sie in dieser Reihenfolge zurück', async () => {
    const l = lagerImBrowser();
    await l.ablegen(vormerkung('z1'));
    await l.ablegen(vormerkung('z2'));
    await l.ablegen(vormerkung('z3'));
    expect((await l.alle()).map((v) => [v.folge, v.zeile])).toEqual([
      [1, 'z1'],
      [2, 'z2'],
      [3, 'z3'],
    ]);
  });

  it('entfernt und ersetzt gezielt', async () => {
    const l = lagerImBrowser();
    await l.ablegen(vormerkung('z1'));
    const zwei = await l.ablegen(vormerkung('z2'));
    await l.entfernen(1);
    expect((await l.alle()).map((v) => v.zeile)).toEqual(['z2']);

    await l.ersetzen({ ...vormerkung('z2'), folge: zwei, versuche: 3 });
    expect((await l.alle())[0].versuche).toBe(3);
  });

  it('meldet keinen Erfolg, wenn die Transaktion doch noch abbricht', async () => {
    /**
     * DER FALL, DEN NUR DAS ABWARTEN DES ENDES ABDECKT.
     *
     * IndexedDB meldet eine Anfrage als erfolgreich, lange bevor die
     * Transaktion festgeschrieben ist. Bricht sie danach ab — kein Platz mehr,
     * Seite im Hintergrund weggeräumt —, ist nichts geschrieben. Wer nur auf
     * die Anfrage wartet, sagt dem Monteur „vorgemerkt" für eine Buchung, die
     * es nie gab.
     *
     * Hier wird genau das erzwungen: die Anfrage geht durch, die Transaktion
     * wird abgebrochen.
     */
    // Der Abbruch muss NACH der erfolgreichen Anfrage kommen. Bricht die
    // Transaktion vorher ab, scheitert schon die Anfrage — und dann liefe der
    // Test auch dann durch, wenn das Ende gar nicht abgewartet würde.
    const echt = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...args: unknown[]) {
      const anfrage = (echt as (...a: unknown[]) => IDBRequest).apply(this, args);
      const tx = anfrage.transaction;
      anfrage.addEventListener('success', () => tx?.abort());
      return anfrage;
    } as typeof IDBObjectStore.prototype.add;

    try {
      await expect(lagerImBrowser().ablegen(vormerkung('z1'))).rejects.toThrow();
    } finally {
      IDBObjectStore.prototype.add = echt;
    }

    expect(await lagerImBrowser().alle()).toHaveLength(0);
  });

  it('überlebt einen Neustart der App', async () => {
    // Der eigentliche Punkt: eine zweite, frisch geöffnete Verbindung sieht
    // dieselbe Warteschlange. Ohne das wäre die Buchung des Monteurs beim
    // Wegwischen der App verloren — und zwar lautlos.
    const vorher = lagerImBrowser();
    await vorher.ablegen(vormerkung('z1'));
    await vorher.ablegen(vormerkung('z2'));

    const nachher = lagerImBrowser();
    expect((await nachher.alle()).map((v) => v.zeile)).toEqual(['z1', 'z2']);
  });

  it('trägt einen vollständigen Durchgang: vormerken, Neustart, nachsenden', async () => {
    const gesehen: string[] = [];
    const sender: Sender = async (v) => {
      gesehen.push(v.zeile);
      return { art: 'ok' };
    };

    await schreiben(
      { tabelle: 'time_entries', art: 'anlegen', zeile: 'z1', daten: {} },
      lagerImBrowser(),
      sender,
      () => true,
    );
    await schreiben(
      { tabelle: 'time_entries', art: 'aendern', zeile: 'z1', daten: { comment: 'x' } },
      lagerImBrowser(),
      sender,
      () => true,
    );
    expect(gesehen).toHaveLength(0);

    // App geschlossen, App geöffnet, Netz da.
    const bericht = await nachsenden(lagerImBrowser(), sender);
    expect(bericht).toEqual({ gesendet: 2, abgelehnt: 0, offen: 0 });
    expect(gesehen).toEqual(['z1', 'z1']);
    expect(await lagerImBrowser().alle()).toHaveLength(0);
  });
});
