import { PassThrough } from 'node:stream';

/**
 * `firebase-admin/storage` als Ersatz — mit einem ECHTEN Schreibstrom.
 *
 * Der Strom ist hier kein Beiwerk. Die Ausleitung schreibt zeilenweise und
 * wartet auf `drain`, statt blind weiterzuschreiben; ohne das puffert Node
 * alles, was schneller aus Firestore kommt, als es hinausgeht — bei einem
 * grossen Mandanten fast den ganzen Bestand. Mit einem PassThrough läuft
 * genau dieser Weg durch, samt `finish` und `error`.
 */

export interface AbgelegteDatei {
  pfad: string;
  inhalt: string;
  contentType?: string;
}

export class FakeBucket {
  readonly dateien = new Map<string, AbgelegteDatei>();
  readonly geloescht: string[] = [];
  /** Ein Schreibfehler bei Google — der Lauf muss ihn überstehen. */
  scheitertBei: string | null = null;

  constructor(readonly name: string | undefined) {}

  file(pfad: string) {
    return {
      createWriteStream: (optionen?: { contentType?: string }) => {
        const strom = new PassThrough();
        const teile: Buffer[] = [];
        strom.on('data', (t: Buffer) => teile.push(t));
        if (this.scheitertBei === pfad) {
          queueMicrotask(() => strom.emit('error', new Error('Bucket nicht erreichbar')));
        } else {
          strom.on('end', () => {
            this.dateien.set(pfad, {
              pfad,
              inhalt: Buffer.concat(teile).toString('utf8'),
              contentType: optionen?.contentType,
            });
          });
        }
        return strom;
      },
      // Die Ausleitung reicht `{ ignoreNotFound: true }` durch; hier gibt es
      // nichts zu ignorieren, weil ein fehlender Eintrag ohnehin nichts tut.
      delete: async () => {
        this.geloescht.push(pfad);
        this.dateien.delete(pfad);
      },
    };
  }

  async getFiles({ prefix }: { prefix: string }) {
    return [[...this.dateien.keys()].filter((n) => n.startsWith(prefix)).map((name) => ({ name }))];
  }

  /** Bestehende Stände vortäuschen, ohne sie zu schreiben. */
  vorhanden(...pfade: string[]) {
    for (const p of pfade) this.dateien.set(p, { pfad: p, inhalt: '' });
    return this;
  }
}

let aktueller = new FakeBucket(undefined);

export function neuerBucket(): FakeBucket {
  aktueller = new FakeBucket(undefined);
  return aktueller;
}

export function getStorage() {
  // Das Ziel steht in `AUSLEITUNG_BUCKET`; welcher Name ankommt, ist für die
  // Tests gleichgültig — es gibt hier nur einen Bucket.
  return { bucket: () => aktueller };
}
