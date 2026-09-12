/**
 * Handwerksscheine auf Postgres.
 *
 * Der Schein ist der Beleg, den der Kunde in der Hand hat. Geprüft wird
 * deshalb vor allem, was nach der Unterschrift NICHT mehr geht — und dass
 * Kopf und Positionen zusammen geschrieben werden. Ein Kopf ohne seine
 * Stunden wäre ein halber Beleg, und wird in genau dem Augenblick
 * unterschrieben, ist er für immer halb.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as scheine from '@/lib/db/pg/workSheets';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { WorkSheetUnterschrift } from '@/types';

const BETRIEB = 'schein-a';

let chef: Konto;
let anton: Konto;
let berta: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
  berta = await konto(BETRIEB, 'Mitarbeiter', 'berta');
  clientEinreichen(anton.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

async function leeren(): Promise<void> {
  await admin.from('work_sheets').delete().eq('company_id', BETRIEB);
}

const entwurf = (rest: Record<string, unknown> = {}) => ({
  projectNumber: 'B-100',
  customerName: 'Familie Huber',
  address: 'Hauptstraße 1',
  datum: '2026-04-13',
  status: 'Entwurf' as const,
  abrechnung: 'Regie' as const,
  zeiten: [
    { datum: '2026-04-13', mitarbeiter: 'Anton', von: '07:00', bis: '12:00', pauseMin: 30, minuten: 270 },
    { datum: '2026-04-13', mitarbeiter: 'Berta', minuten: 120, taetigkeit: 'Zuarbeit', helfer: true },
  ],
  material: [
    { name: 'Rohr 22mm', menge: 2.5, einheit: 'm' },
    { name: 'Dichtung', menge: 4 },
  ],
  erstelltVonUid: anton.uid,
  erstelltVonName: 'Anton',
  ...rest,
});

const strich = (name: string): WorkSheetUnterschrift => ({
  name,
  bild: 'data:image/png;base64,iVBORw0KGgo=',
  geraetZeit: 1776000000000,
});

describe('Entwurf', () => {
  afterEach(() => clientEinreichen(anton.client));

  it('legt Kopf, Zeiten und Material in einem Zug an', async () => {
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    const s = await scheine.getWorkSheet(id);

    expect(s).toMatchObject({
      projectNumber: 'B-100', customerName: 'Familie Huber',
      datum: '2026-04-13', status: 'Entwurf', abrechnung: 'Regie',
      erstelltVonUid: anton.uid, erstelltVonName: 'Anton',
    });
    expect(s!.zeiten).toEqual([
      { datum: '2026-04-13', mitarbeiter: 'Anton', von: '07:00', bis: '12:00', pauseMin: 30, minuten: 270, helfer: false },
      { datum: '2026-04-13', mitarbeiter: 'Berta', minuten: 120, pauseMin: 0, taetigkeit: 'Zuarbeit', helfer: true },
    ]);
    expect(s!.material).toEqual([
      { name: 'Rohr 22mm', menge: 2.5, einheit: 'm' },
      { name: 'Dichtung', menge: 4 },
    ]);
    // Ohne Unterschrift kein Feld — ein leeres Objekt sähe aus wie ein
    // unterschriebener Schein ohne Unterschrift.
    expect(s!.unterschriften).toBeUndefined();
    expect(s!.fotos).toBeUndefined();
  });

  it('ändern ersetzt die Positionen, statt sie zu häufen', async () => {
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.updateWorkSheetDraft(id, {
      notizen: 'Abfluss frei',
      zeiten: [{ datum: '2026-04-13', mitarbeiter: 'Anton', minuten: 300 }],
      material: [],
    });

    const s = await scheine.getWorkSheet(id);
    expect(s!.notizen).toBe('Abfluss frei');
    expect(s!.zeiten).toHaveLength(1);
    expect(s!.material).toEqual([]);
  });

  it('die Reihenfolge der Zeilen steht in einer Spalte', async () => {
    /*
      Im Dokument war sie der Platz im Array. Geprüft wird durch UMSORTIEREN:
      dass frisch geschriebene Zeilen in Schreibreihenfolge zurückkommen,
      beweist nichts.
    */
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.updateWorkSheetDraft(id, {
      material: [
        { name: 'Dichtung', menge: 4 },
        { name: 'Rohr 22mm', menge: 2.5, einheit: 'm' },
      ],
    });
    const s = await scheine.getWorkSheet(id);
    expect(s!.material.map((m) => m.name)).toEqual(['Dichtung', 'Rohr 22mm']);
  });

  it('die Fotoliste geht allein hinaus und lässt den Rest stehen', async () => {
    /*
      Sie wird nach jedem Upload geschrieben, ohne dass der Monteur gespeichert
      hätte. Was er gerade tippt, gehört ihm bis dahin.
    */
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf({ notizen: 'in Arbeit' }));
    await scheine.fotosAmEntwurf(id, [
      { pfad: 'betriebe/a/1.jpg', hash: 'abc', bytes: 120_000, geraetZeit: 1776000000000 },
    ]);

    const s = await scheine.getWorkSheet(id);
    expect(s!.fotos).toEqual([
      { pfad: 'betriebe/a/1.jpg', hash: 'abc', bytes: 120_000, geraetZeit: 1776000000000 },
    ]);
    expect(s!.notizen).toBe('in Arbeit');
    expect(s!.zeiten).toHaveLength(2);
  });

  it('ein entferntes Foto verschwindet auch aus dem Schein', async () => {
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.fotosAmEntwurf(id, [
      { pfad: 'a/1.jpg', hash: 'x', bytes: 1, geraetZeit: 1776000000000 },
      { pfad: 'a/2.jpg', hash: 'y', bytes: 2, geraetZeit: 1776000000000 },
    ]);
    await scheine.fotosAmEntwurf(id, [
      { pfad: 'a/2.jpg', hash: 'y', bytes: 2, geraetZeit: 1776000000000 },
    ]);

    const s = await scheine.getWorkSheet(id);
    expect(s!.fotos!.map((f) => f.pfad)).toEqual(['a/2.jpg']);
  });

  it('über den Inhaltsweg lässt sich kein Zustand setzen', async () => {
    /*
      GEPRÜFT WIRD DIE DATENBANKFUNKTION, NICHT DER CLIENT.

      Beide sieben: `speichern()` in `pg/workSheets.ts` lässt `status` gar
      nicht erst hinaus, und die Spaltenliste in `schein_speichern` schreibt
      ihn nicht. Eine Prüfung über den Modulweg sagt deshalb nicht, welche
      der beiden hält — nimmt man eine weg, bleibt sie grün.

      Also wird hier der Aufruf von Hand gestellt, mit `status` mittendrin:
      so steht die Spaltenliste allein auf dem Prüfstand. Der Riegel gehört
      dorthin, weil der Zustand ausschliesslich über die eigenen Wege
      wechseln darf — nur dort beurteilt ihn der Trigger.
    */
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());

    const { error } = await anton.client.rpc('schein_speichern', {
      p_id: id,
      p_kopf: { status: 'Unterschrieben', notizen: 'x' },
      p_zeiten: null,
      p_material: null,
      p_fotos: null,
    });
    expect(error).toBeNull();

    const s = await scheine.getWorkSheet(id);
    expect(s!.status).toBe('Entwurf');
    expect(s!.notizen).toBe('x');
    expect(s!.unterschriften).toBeUndefined();
  });

  it('angelegt wird nur auf den eigenen Namen', async () => {
    await leeren();
    clientEinreichen(berta.client);
    /*
      Berta schickt Antons Kennung mit. Die Funktion setzt `erstellt_von_uid`
      aus der Anmeldung — was der Aufrufer schickt, zählt nicht.
    */
    const id = await scheine.createWorkSheet(BETRIEB, entwurf({ erstelltVonUid: anton.uid }));
    clientEinreichen(anton.client);
    const s = await scheine.getWorkSheet(id);
    expect(s!.erstelltVonUid).toBe(berta.uid);
  });

  it('einen Schein, den es nicht gibt, gibt es nicht — ohne Fehler', async () => {
    expect(await scheine.getWorkSheet(crypto.randomUUID())).toBeUndefined();
  });
});

describe('Unterschreiben', () => {
  afterEach(() => clientEinreichen(anton.client));

  it('friert Zustand, beide Unterschriften und die Serverzeit zusammen ein', async () => {
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));

    const s = await scheine.getWorkSheet(id);
    expect(s!.status).toBe('Unterschrieben');
    expect(s!.unterschriften!.monteur!.name).toBe('Anton');
    expect(s!.unterschriften!.kunde!.name).toBe('Huber');
    // Die Gerätezeit steckt in der Unterschrift, die Serverzeit daneben:
    // offline erfasst ist die Serverzeit die der späteren Übertragung.
    expect(s!.unterschriften!.monteur!.geraetZeit).toBe(1776000000000);
    expect(typeof s!.unterschriebenAm).toBe('number');
  });

  it('danach ist der Inhalt zu', async () => {
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));

    await expect(
      scheine.updateWorkSheetDraft(id, { notizen: 'nachträglich' }),
    ).rejects.toThrow();
    const s = await scheine.getWorkSheet(id);
    expect(s!.notizen).toBeUndefined();
  });

  it('und die Positionen ebenso', async () => {
    /*
      Der Riegel sitzt an den Positionstabellen selbst
      (`app.scheinpositionen_eingefroren`). Ohne ihn liesse die Richtlinie den
      ganzen Betrieb an die Zeilen — sie muss das, weil ein Entwurf bearbeitet
      wird.
    */
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));

    const { error } = await anton.client
      .from('work_sheet_hours')
      .update({ minuten: 999 })
      .eq('work_sheet_id', id);
    expect(error).not.toBeNull();

    const s = await scheine.getWorkSheet(id);
    expect(s!.zeiten[0].minuten).toBe(270);
  });

  it('zweimal unterschreiben geht nicht', async () => {
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));
    await expect(scheine.signWorkSheet(id, strich('Anton'), strich('Meier'))).rejects.toThrow();
  });

  it('einen Schein, den es nicht gibt, unterschreibt niemand still', async () => {
    await expect(
      scheine.signWorkSheet(crypto.randomUUID(), strich('Anton'), strich('Huber')),
    ).rejects.toThrow();
  });
});

describe('Storno', () => {
  afterEach(() => clientEinreichen(anton.client));

  async function unterschriebener(): Promise<string> {
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));
    return id;
  }

  it('nur die Führung, und nur mit Grund', async () => {
    const id = await unterschriebener();
    await expect(scheine.cancelWorkSheet(id, 'Doppelt erfasst', 'Anton')).rejects.toThrow();

    clientEinreichen(chef.client);
    await expect(scheine.cancelWorkSheet(id, '', 'Chef')).rejects.toThrow();
    await scheine.cancelWorkSheet(id, 'Doppelt erfasst', 'Chef');

    const s = await scheine.getWorkSheet(id);
    expect(s).toMatchObject({ status: 'Storniert', stornoGrund: 'Doppelt erfasst', storniertVonName: 'Chef' });
  });

  it('ist eine Klammer um den Beleg, keine Gelegenheit ihn zu ändern', async () => {
    const id = await unterschriebener();
    clientEinreichen(chef.client);
    const { error } = await chef.client
      .from('work_sheets')
      .update({ status: 'Storniert', storno_grund: 'Grund', customer_name: 'Jemand anderer' })
      .eq('id', id);
    expect(error).not.toBeNull();

    const s = await scheine.getWorkSheet(id);
    expect(s).toMatchObject({ status: 'Unterschrieben', customerName: 'Familie Huber' });
  });

  it('ein stornierter Schein bleibt stehen und auffindbar', async () => {
    const id = await unterschriebener();
    clientEinreichen(chef.client);
    await scheine.cancelWorkSheet(id, 'Doppelt erfasst', 'Chef');

    const liste = await scheine.listWorkSheetsInRange(BETRIEB, '2026-04-01', '2026-04-30');
    expect(liste.map((s) => s.id)).toContain(id);
    // Der Inhalt ist mitgekommen: ein Beleg ohne seine Stunden wäre keiner.
    expect(liste[0].zeiten).toHaveLength(2);
  });
});

describe('Entwurf verwerfen und zurückholen', () => {
  afterEach(() => clientEinreichen(anton.client));

  it('verwerfen kennzeichnet, es löscht nicht', async () => {
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.discardWorkSheetDraft(id, 'Anton');

    const s = await scheine.getWorkSheet(id);
    expect(s).toMatchObject({ status: 'Verworfen', verworfenVonName: 'Anton' });
    expect(s!.zeiten).toHaveLength(2);
  });

  it('beim Verwerfen ändert sich nur der Zustand', async () => {
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    const { error } = await anton.client
      .from('work_sheets')
      .update({ status: 'Verworfen', notizen: 'nebenbei geändert' })
      .eq('id', id);
    expect(error).not.toBeNull();
  });

  it('zurückholen ist der einzige Rückweg', async () => {
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.discardWorkSheetDraft(id, 'Anton');
    await scheine.restoreWorkSheetDraft(id);

    const s = await scheine.getWorkSheet(id);
    expect(s!.status).toBe('Entwurf');
    // Der Name des Verwerfenden bleibt stehen: ein zweites Verwerfen
    // überschreibt dieselbe Zeile, statt eine Historie zu beginnen.
    expect(s!.verworfenVonName).toBe('Anton');
  });

  it('beim Zurückholen ändert sich der Inhalt nicht', async () => {
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.discardWorkSheetDraft(id, 'Anton');

    const { error } = await anton.client
      .from('work_sheets')
      .update({ status: 'Entwurf', customer_name: 'Jemand anderer' })
      .eq('id', id);
    expect(error).not.toBeNull();
  });

  it('ein unterschriebener Schein wird nicht verworfen', async () => {
    await leeren();
    const id = await scheine.createWorkSheet(BETRIEB, entwurf());
    await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));
    await expect(scheine.discardWorkSheetDraft(id, 'Anton')).rejects.toThrow();
  });
});

describe('Listen', () => {
  afterEach(() => clientEinreichen(anton.client));

  beforeAll(async () => {
    await leeren();
    clientEinreichen(anton.client);
    const a = await scheine.createWorkSheet(BETRIEB, entwurf({ datum: '2026-01-12' }));
    await scheine.signWorkSheet(a, strich('Anton'), strich('Huber'));
    const b = await scheine.createWorkSheet(BETRIEB, entwurf({ datum: '2026-02-09', projectNumber: 'B-200' }));
    await scheine.signWorkSheet(b, strich('Anton'), strich('Maier'));
    // Ein Entwurf im selben Zeitraum — für die Prüfliste kein Befund.
    await scheine.createWorkSheet(BETRIEB, entwurf({ datum: '2026-02-16' }));
    clientEinreichen(berta.client);
    await scheine.createWorkSheet(BETRIEB, entwurf({ datum: '2026-03-09', erstelltVonName: 'Berta' }));
    clientEinreichen(anton.client);
  }, 120_000);

  it('die eigenen ab einem Tag', async () => {
    const rows = await scheine.listOwnWorkSheetsSince(BETRIEB, anton.uid, '2026-02-01');
    expect(rows.map((s) => s.datum)).toEqual(['2026-02-16', '2026-02-09']);
  });

  it('nur unterschriebene im Zeitraum — der Entwurf zählt nicht', async () => {
    const rows = await scheine.listSignedWorkSheetsInRange(BETRIEB, '2026-01-01', '2026-03-31');
    expect(rows.map((s) => s.datum)).toEqual(['2026-02-09', '2026-01-12']);
  });

  it('die Suche über den Zeitraum nimmt jeden Zustand', async () => {
    const rows = await scheine.listWorkSheetsInRange(BETRIEB, '2026-01-01', '2026-03-31');
    expect(rows).toHaveLength(4);
  });

  it('die Scheine einer Baustelle', async () => {
    const rows = await scheine.listWorkSheetsForProject(BETRIEB, 'B-200');
    expect(rows.map((s) => s.datum)).toEqual(['2026-02-09']);
  });

  it('die jüngsten, mit Obergrenze', async () => {
    expect(await scheine.listRecentWorkSheets(BETRIEB, 2)).toHaveLength(2);
  });

  it('jede Liste bringt die Positionen mit', async () => {
    /*
      Sonst wäre der Umzug ein stiller Verlust: in Firestore lagen Zeiten und
      Material IM Dokument und kamen mit jeder Abfrage mit. Eine Liste, die
      nur noch Köpfe liefert, zeigt eine Nachkalkulation ohne Stunden — und
      niemand sieht, dass etwas fehlt.
    */
    const rows = await scheine.listRecentWorkSheets(BETRIEB, 10);
    expect(rows.every((s) => s.zeiten.length === 2 && s.material.length === 2)).toBe(true);
  });
});
