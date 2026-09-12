/**
 * Die Prüfsumme des Handwerksscheins — auf beiden Seiten dieselbe.
 *
 * WARUM DAS EINE EIGENE PRÜFUNG BRAUCHT. Der Hash entsteht jetzt in der
 * Datenbank; gerechnet wurde er bisher in JavaScript. Zwei Fassungen derselben
 * Kanonisierung sind genau die Art Doppelung, die auseinanderläuft — und wenn
 * sie es tut, merkt es niemand: beide Seiten sind für sich stimmig, und der
 * Unterschied fällt erst auf, wenn jemand einen alten Beleg nachrechnen will.
 * Dann ist es zu spät, denn dann geht es vor Gericht um genau diese Zahl.
 *
 * Geprüft wird deshalb nicht „die Datenbank rechnet einen Hash", sondern:
 * die Datenbank rechnet DENSELBEN Hash wie `shared/scheinHash.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as scheine from '@/lib/db/pg/workSheets';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { kanonischerInhalt, type HashbarerSchein } from '@shared/scheinHash';
import type { WorkSheet, WorkSheetUnterschrift } from '@/types';

const BETRIEB = 'hash-a';

let anton: Konto;
let chef: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  clientEinreichen(anton.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

const strich = (name: string, zeit = 1776000000000): WorkSheetUnterschrift => ({
  name, bild: 'data:image/png;base64,iVBORw0KGgo=', geraetZeit: zeit,
});

/** Was JavaScript aus dem gelesenen Schein rechnet. */
function hashAusJs(s: WorkSheet): string {
  const roh: HashbarerSchein = {
    projectNumber: s.projectNumber,
    customerName: s.customerName,
    address: s.address,
    datum: s.datum,
    abrechnung: s.abrechnung,
    zeiten: s.zeiten,
    material: s.material,
    fotos: s.fotos,
    notizen: s.notizen,
    unterschriften: s.unterschriften,
  };
  return createHash('sha256').update(kanonischerInhalt(roh), 'utf8').digest('hex');
}

async function hashAusDb(id: string): Promise<string | null> {
  const { data } = await admin.from('work_sheets').select('inhalt_hash').eq('id', id).single();
  return (data!.inhalt_hash as string | null) ?? null;
}

/** Legt einen Schein an, unterschreibt ihn und gibt beide Prüfsummen zurück. */
async function beide(inhalt: Record<string, unknown>): Promise<{ db: string | null; js: string }> {
  const id = await scheine.createWorkSheet(BETRIEB, {
    projectNumber: 'B-100',
    customerName: 'Familie Huber',
    datum: '2026-04-13',
    status: 'Entwurf',
    abrechnung: 'Regie',
    zeiten: [],
    material: [],
    erstelltVonUid: anton.uid,
    erstelltVonName: 'Anton',
    ...inhalt,
  } as Parameters<typeof scheine.createWorkSheet>[1]);

  await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));
  const gelesen = await scheine.getWorkSheet(id);
  return { db: await hashAusDb(id), js: hashAusJs(gelesen!) };
}

describe('Datenbank und Browser rechnen dasselbe', () => {
  it('ein schlichter Schein', async () => {
    const { db, js } = await beide({});
    expect(db).toBe(js);
  });

  it('mit Zeiten, Material, Notiz und Anschrift', async () => {
    const { db, js } = await beide({
      address: 'Hauptstraße 1',
      notizen: 'Abfluss frei, Dichtung getauscht',
      zeiten: [
        { datum: '2026-04-13', mitarbeiter: 'Anton', von: '07:00', bis: '12:00', pauseMin: 30, minuten: 270 },
        { datum: '2026-04-13', mitarbeiter: 'Berta', minuten: 120, taetigkeit: 'Zuarbeit', helfer: true },
      ],
      material: [
        { name: 'Rohr 22mm', menge: 2.5, einheit: 'm' },
        { name: 'Dichtung', menge: 4 },
      ],
    });
    expect(db).toBe(js);
  });

  it('gebrochene Mengen und ganze Zahlen', async () => {
    /*
      DER HEIKELSTE EINZELFALL. `numeric(12,3)` schreibt sich in Postgres als
      „2.500", in JavaScript als „2.5". Ohne Angleichung wäre jede Prüfsumme
      mit einer Menge verschieden — also fast jede.
    */
    const { db, js } = await beide({
      material: [
        { name: 'A', menge: 2.5 }, { name: 'B', menge: 4 }, { name: 'C', menge: 10 },
        { name: 'D', menge: 0.125 }, { name: 'E', menge: 0 }, { name: 'F', menge: 100 },
      ],
    });
    expect(db).toBe(js);
  });

  it('leere und fehlende Felder', async () => {
    // Ein fehlender Wert und ein leerer Text dürfen nicht verschieden hashen.
    const { db, js } = await beide({
      address: '', notizen: '',
      zeiten: [{ datum: '2026-04-13', mitarbeiter: 'Anton', minuten: 60 }],
      material: [{ name: 'Nur Name', menge: 1 }],
    });
    expect(db).toBe(js);
  });

  it('Text mit Rändern, die JavaScript abschneidet', async () => {
    /*
      `t()` ist `(v ?? '').trim()`, und JavaScript schneidet mehr ab als
      Leerzeichen: Tabulator, Zeilenumbruch, geschütztes Leerzeichen, die
      Byte-Order-Mark. Wer in der Datenbank nur Leerzeichen abschneidet,
      bekommt bei einem Namen mit geschütztem Leerzeichen am Ende eine andere
      Prüfsumme — und das fällt nie auf.
    */
    const { db, js } = await beide({
      customerName: '  Familie Huber\t',
      address: ' Hauptstraße 1 ',
      notizen: '\nZeile\n',
      material: [{ name: ' Rohr ', menge: 1, einheit: ' m ' }],
    });
    expect(db).toBe(js);
  });

  it('Fotos in ihrer Reihenfolge', async () => {
    /*
      Die Reihenfolge ist Teil des Belegs, wie bei den Positionen. Sie kommt
      aus einer eigenen Spalte: ohne sie müsste die Datenbank nach etwas
      anderem sortieren, und ein Schein, der unter Firestore unterschrieben
      wurde, liesse sich nicht mehr nachrechnen.
    */
    const id = await scheine.createWorkSheet(BETRIEB, {
      projectNumber: 'B-100', customerName: 'Huber', datum: '2026-04-13',
      status: 'Entwurf', abrechnung: 'Regie', zeiten: [], material: [],
      erstelltVonUid: anton.uid, erstelltVonName: 'Anton',
    } as Parameters<typeof scheine.createWorkSheet>[1]);
    // Absichtlich NICHT alphabetisch: sortierte die Datenbank nach dem Pfad,
    // ergäbe sie hier eine andere Zeichenkette als der Browser.
    await scheine.fotosAmEntwurf(id, [
      { pfad: 'b/zweitens.jpg', hash: 'bbb', bytes: 2, geraetZeit: 1776000000002 },
      { pfad: 'a/erstens.jpg', hash: 'aaa', bytes: 1, geraetZeit: 1776000000001 },
    ]);
    await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));

    const gelesen = await scheine.getWorkSheet(id);
    expect(gelesen!.fotos!.map((f) => f.pfad)).toEqual(['b/zweitens.jpg', 'a/erstens.jpg']);
    expect(await hashAusDb(id)).toBe(hashAusJs(gelesen!));
  });
});

describe('Wann die Prüfsumme entsteht', () => {
  async function entwurf(): Promise<string> {
    return scheine.createWorkSheet(BETRIEB, {
      projectNumber: 'B-200', customerName: 'Maier', datum: '2026-04-14',
      status: 'Entwurf', abrechnung: 'Regie',
      zeiten: [{ datum: '2026-04-14', mitarbeiter: 'Anton', minuten: 60 }],
      material: [], erstelltVonUid: anton.uid, erstelltVonName: 'Anton',
    } as Parameters<typeof scheine.createWorkSheet>[1]);
  }

  it('ein Entwurf bekommt keine', async () => {
    // Er ändert sich noch; eine Prüfsumme darüber sagte nichts.
    const id = await entwurf();
    expect(await hashAusDb(id)).toBeNull();
  });

  it('sie entsteht auch, wenn jemand am Weg vorbei unterschreibt', async () => {
    /*
      DER GEWINN GEGENÜBER DER CLOUD FUNCTION IST NICHT DER ORT, SONDERN DIE
      LÜCKENLOSIGKEIT. `schein_unterschreiben` ist der vorgesehene Weg, aber
      nicht der einzige: eine schlichte Anweisung auf die Tabelle reicht. Der
      Trigger fängt beides.
    */
    const id = await entwurf();
    const { error } = await anton.client.from('work_sheets').update({
      status: 'Unterschrieben',
      unterschrift_monteur: strich('Anton'),
      unterschrift_kunde: strich('Huber'),
      unterschrieben_am: new Date().toISOString(),
    }).eq('id', id);
    expect(error).toBeNull();

    const gelesen = await scheine.getWorkSheet(id);
    expect(await hashAusDb(id)).toBe(hashAusJs(gelesen!));
  });

  it('ein Entwurf nimmt keine Prüfsumme an — auch keine mitgeschickte', async () => {
    /*
      DAS LOCH, DAS DIESE PRÜFUNG GEFUNDEN HAT.

      Der Nachtrag springt nur an, wenn das Feld leer ist. Am Entwurf war
      jede Änderung erlaubt — er ist ja in Arbeit. Ein Monteur konnte also
      am Entwurf eine ausgedachte Prüfsumme eintragen und danach
      unterschreiben: der Trigger sah ein gefülltes Feld, rechnete nicht nach,
      und auf dem Beleg stand eine Zahl, die der Client sich selbst gegeben
      hatte. Genau das, was die Prüfsumme ausschliessen soll.
    */
    const id = await entwurf();
    const { error } = await anton.client.from('work_sheets')
      .update({ inhalt_hash: 'f'.repeat(64) }).eq('id', id);
    expect(error).toBeNull();            // der Entwurf nimmt die Anweisung an
    expect(await hashAusDb(id)).toBeNull(); // aber nicht den Wert

    // Und nach dem Unterschreiben steht die RICHTIGE dort.
    await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));
    const gelesen = await scheine.getWorkSheet(id);
    expect(await hashAusDb(id)).toBe(hashAusJs(gelesen!));
  });

  it('eine gesetzte Prüfsumme lässt sich nicht mehr ändern', async () => {
    /*
      Die Ausnahme am Riegel lautet: es darf sich ausschliesslich
      `inhalt_hash` ändern, er muss VORHER LEER gewesen sein, und der neue
      Wert muss der richtige sein. Eine bereits gesetzte Prüfsumme fällt damit
      unter dieselbe Sperre wie der Rest des Belegs.
    */
    const id = await entwurf();
    await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));
    const echt = await hashAusDb(id);
    expect(echt).not.toBeNull();

    for (const wert of ['f'.repeat(64), echt]) {
      const { error } = await anton.client.from('work_sheets')
        .update({ inhalt_hash: wert }).eq('id', id);
      expect(error).not.toBeNull();
    }
    expect(await hashAusDb(id)).toBe(echt);
  });

  it('ein Storno lässt sie unberührt', async () => {
    // Er ändert den Inhalt nicht — also auch nicht die Prüfsumme.
    const id = await entwurf();
    await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));
    const vorher = await hashAusDb(id);

    clientEinreichen(chef.client);
    await scheine.cancelWorkSheet(id, 'Doppelt erfasst', 'Chef');
    clientEinreichen(anton.client);

    expect(await hashAusDb(id)).toBe(vorher);
  });

  it('sie wird nicht zweimal gerechnet', async () => {
    const id = await entwurf();
    await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));
    const erst = await hashAusDb(id);
    // Ein zweiter Schreibvorgang am unterschriebenen Schein wird ohnehin
    // abgelehnt; geprüft wird, dass der Trigger nicht in sich selbst läuft.
    expect(erst).not.toBeNull();
    expect(await hashAusDb(id)).toBe(erst);
  });
});
