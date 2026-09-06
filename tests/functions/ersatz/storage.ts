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
  /**
   * Mit welchem Namen der Bucket angefordert wurde.
   *
   * `undefined` heisst „Standard-Bucket dieses Projekts" — und genau das ist
   * der Unterschied zwischen einer Sicherung, die gegen einen Fehlgriff hilft,
   * und einer, die auch den Verlust des Projekts übersteht.
   */
  readonly angefordert: Array<string | undefined> = [];
  /** Ein Schreibfehler bei Google — der Lauf muss ihn überstehen. */
  scheitertBei: string | null = null;

  constructor(readonly name: string | undefined) {}

  file(pfad: string) {
    return {
      createWriteStream: (optionen?: { contentType?: string; resumable?: boolean }) => {
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
      delete: async (optionen?: { ignoreNotFound?: boolean }) => {
        /*
          Ohne `ignoreNotFound` wirft die echte Schnittstelle, wenn die Datei
          nicht mehr da ist. Das ist kein Randfall: zwei Läufe kurz
          hintereinander räumen dieselbe Liste, und der zweite fände sie leer.
          Der Ersatz bildet das nach, statt es zu schlucken.
        */
        if (!this.dateien.has(pfad) && !optionen?.ignoreNotFound) {
          throw new Error(`Datei nicht vorhanden: ${pfad}`);
        }
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
  return {
    bucket: (name?: string) => {
      aktueller.angefordert.push(name);
      return aktueller;
    },
  };
}
