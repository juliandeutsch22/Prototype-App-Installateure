/**
 * Ein Firestore zum Anfassen — für die Tests der Cloud Functions.
 *
 * WARUM ÜBERHAUPT EIN ERSATZ. Die Handler lagen als einzige Schicht des
 * Projekts ganz ohne Test da. Der Grund war handfest: sie importieren
 * `firebase-admin` und `firebase-functions`, und die stehen nur unter
 * `functions/node_modules`. Deshalb wurde bisher nur ausgelagert, was ohne
 * beides auskommt (`extractLogic`, `notifyLogic`, `ausleitungPlan`) — und
 * alles, was mit der Datenbank spricht, blieb ungeprüft. Genau dort sitzen
 * aber die Entscheidungen, die Geld und Urlaubstage bewegen.
 *
 * Der Ersatz wird über `resolve.alias` untergeschoben; am Produktivcode
 * ändert sich dadurch KEINE Zeile. Das ist der Punkt: geprüft wird der echte
 * Handler, nicht eine für den Test zurechtgelegte Kopie.
 *
 * WAS ER NICHT IST: kein Firestore. Er kennt keine Indizes, keine
 * Nebenläufigkeit und keine Regeln — die Regeln prüft der Emulatorlauf. Er
 * beantwortet genau die Abfragen, die die Functions absetzen, und tut es
 * vorhersagbar.
 */

export type Dok = Record<string, unknown>;

/** Der Platzhalter, den `serverTimestamp()` hinterlässt — sichtbar prüfbar. */
export const SERVERZEIT = Symbol.for('serverTimestamp');

type Entfernung = { entfernen: unknown[] };

export const FieldValue = {
  serverTimestamp: () => SERVERZEIT,
  arrayRemove: (...werte: unknown[]): Entfernung => ({ entfernen: werte }),
};

type Op = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in';
type Bedingung = [string, Op, unknown];

function passt(dok: Dok, [feld, op, wert]: Bedingung): boolean {
  const v = dok[feld];
  switch (op) {
    case '==':
      return v === wert;
    // Wie Firestore: `!=` liefert NUR Dokumente, die das Feld ueberhaupt
    // haben. Diese Eigenheit hat im Nachtlauf schon einmal zugeschlagen und
    // gehoert deshalb nachgebildet, nicht geglaettet.
    case '!=':
      return feld in dok && v !== wert;
    case '<':
      return (v as number) < (wert as number);
    case '<=':
      return (v as number) <= (wert as number);
    case '>':
      return (v as number) > (wert as number);
    case '>=':
      return (v as number) >= (wert as number);
    case 'array-contains':
      return Array.isArray(v) && v.includes(wert);
    case 'in':
      return Array.isArray(wert) && wert.includes(v);
  }
}

export class FakeDoc {
  constructor(
    readonly db: FakeDb,
    readonly sammlung: string,
    readonly id: string,
  ) {}
  get ref() {
    return this;
  }
  get path() {
    return `${this.sammlung}/${this.id}`;
  }
  private roh(): Dok | undefined {
    return this.db.inhalt(this.sammlung).get(this.id);
  }
  async get() {
    const d = this.roh();
    return {
      exists: d !== undefined,
      id: this.id,
      ref: this,
      data: () => (d ? { ...d } : undefined),
    };
  }
  async set(daten: Dok, optionen?: { merge?: boolean }) {
    this.db.schreibt.push({ art: 'set', pfad: this.path, daten });
    const alt = optionen?.merge ? (this.roh() ?? {}) : {};
    this.db.inhalt(this.sammlung).set(this.id, { ...alt, ...daten });
  }
  async update(daten: Dok) {
    const alt = this.roh();
    if (!alt) throw new Error(`update auf nicht vorhandenes Dokument ${this.path}`);
    this.db.schreibt.push({ art: 'update', pfad: this.path, daten });
    this.db.inhalt(this.sammlung).set(this.id, anwenden(alt, daten));
  }
  async delete() {
    this.db.schreibt.push({ art: 'delete', pfad: this.path, daten: {} });
    this.db.inhalt(this.sammlung).delete(this.id);
  }
}

/** `arrayRemove` auflösen; alles andere ersetzt schlicht. */
function anwenden(alt: Dok, neu: Dok): Dok {
  const ergebnis: Dok = { ...alt };
  for (const [k, v] of Object.entries(neu)) {
    const e = v as Entfernung;
    if (e && typeof e === 'object' && Array.isArray(e.entfernen)) {
      const liste = Array.isArray(alt[k]) ? (alt[k] as unknown[]) : [];
      ergebnis[k] = liste.filter((x) => !e.entfernen.includes(x));
    } else {
      ergebnis[k] = v;
    }
  }
  return ergebnis;
}

class FakeQuery {
  constructor(
    private readonly db: FakeDb,
    private readonly sammlung: string,
    private readonly bedingungen: Bedingung[] = [],
    private readonly grenze?: number,
    private readonly sortierung?: [string | symbol, 'asc' | 'desc'],
    private readonly ab?: unknown,
  ) {}
  where(feld: string, op: Op, wert: unknown) {
    return new FakeQuery(
      this.db,
      this.sammlung,
      [...this.bedingungen, [feld, op, wert]],
      this.grenze,
      this.sortierung,
      this.ab,
    );
  }
  orderBy(feld: string | symbol, richtung: 'asc' | 'desc' = 'asc') {
    return new FakeQuery(this.db, this.sammlung, this.bedingungen, this.grenze, [feld, richtung], this.ab);
  }
  limit(n: number) {
    return new FakeQuery(this.db, this.sammlung, this.bedingungen, n, this.sortierung, this.ab);
  }
  startAfter(wert: unknown) {
    return new FakeQuery(this.db, this.sammlung, this.bedingungen, this.grenze, this.sortierung, wert);
  }
  async get() {
    let treffer = [...this.db.inhalt(this.sammlung).entries()].filter(([, d]) =>
      this.bedingungen.every((b) => passt(d, b)),
    );
    const nachKennung = this.sortierung?.[0] === KENNUNG;
    const schluessel = (id: string, d: Dok) =>
      nachKennung || !this.sortierung ? id : String(d[this.sortierung[0] as string] ?? '');
    const richtung = this.sortierung?.[1] ?? 'asc';
    treffer.sort((a, b) => {
      const x = schluessel(a[0], a[1]);
      const y = schluessel(b[0], b[1]);
      return richtung === 'asc' ? (x < y ? -1 : x > y ? 1 : 0) : x < y ? 1 : x > y ? -1 : 0;
    });
    if (this.ab !== undefined) {
      // `startAfter` bekommt in der Ausleitung ein SNAPSHOT, keinen Wert.
      const a = this.ab as { id?: string };
      const grenze = a && typeof a === 'object' && a.id !== undefined ? a.id : String(this.ab);
      treffer = treffer.filter(([id, d]) => schluessel(id, d) > grenze);
    }
    if (this.grenze !== undefined) treffer = treffer.slice(0, this.grenze);
    const docs = treffer.map(([id, d]) => ({
      id,
      ref: new FakeDoc(this.db, this.sammlung, id),
      data: () => ({ ...d }),
    }));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeCollection extends FakeQuery {
  constructor(
    private readonly datenbank: FakeDb,
    private readonly name: string,
  ) {
    super(datenbank, name);
  }
  doc(id?: string) {
    return new FakeDoc(this.datenbank, this.name, id ?? this.datenbank.neueKennung());
  }
}

class FakeBatch {
  private readonly schritte: Array<() => Promise<void>> = [];
  constructor(private readonly db: FakeDb) {}
  set(ref: FakeDoc, daten: Dok, optionen?: { merge?: boolean }) {
    this.schritte.push(() => ref.set(daten, optionen));
  }
  update(ref: FakeDoc, daten: Dok) {
    this.schritte.push(() => ref.update(daten));
  }
  delete(ref: FakeDoc) {
    this.schritte.push(() => ref.delete());
  }
  async commit() {
    this.db.commits++;
    /*
      Ein scheiternder Batch ist kein Randfall: an ihm haengt, ob eine
      Function ihre halbfertige Arbeit wieder aufraeumt. Ohne diesen Schalter
      liesse sich genau das nicht pruefen.
    */
    if (this.db.scheitertBeimSchreiben) throw new Error('Firestore nicht erreichbar');
    for (const s of this.schritte) await s();
  }
}

export class FakeDb {
  private readonly sammlungen = new Map<string, Map<string, Dok>>();
  /** Jeder Schreibvorgang, in der Reihenfolge — die Tests lesen hier mit. */
  readonly schreibt: Array<{ art: string; pfad: string; daten: Dok }> = [];
  /** Wie oft `batch().commit()` lief: Atomarität ist eine Zusicherung. */
  commits = 0;
  /** Laesst jeden `batch().commit()` scheitern. */
  scheitertBeimSchreiben = false;
  private zaehler = 0;

  inhalt(name: string): Map<string, Dok> {
    let m = this.sammlungen.get(name);
    if (!m) this.sammlungen.set(name, (m = new Map()));
    return m;
  }
  neueKennung(): string {
    return `auto-${String(++this.zaehler).padStart(3, '0')}`;
  }
  /** Bestand setzen: `seed('users', { u1: { … } })`. */
  seed(sammlung: string, doks: Record<string, Dok>) {
    for (const [id, d] of Object.entries(doks)) this.inhalt(sammlung).set(id, d);
    return this;
  }
  /** Alles einer Sammlung, als einfaches Objekt — zum Prüfen. */
  alles(sammlung: string): Record<string, Dok> {
    return Object.fromEntries(this.inhalt(sammlung));
  }
  collection(name: string) {
    return new FakeCollection(this, name);
  }
  batch() {
    return new FakeBatch(this);
  }
  async getAll(...refs: FakeDoc[]) {
    return Promise.all(refs.map((r) => r.get()));
  }
}

let aktuelle = new FakeDb();

/** Vor jedem Test rufen: leerer Bestand, leeres Protokoll. */
export function neueDatenbank(): FakeDb {
  aktuelle = new FakeDb();
  return aktuelle;
}

export function getFirestore(): FakeDb {
  return aktuelle;
}

/**
 * `FieldPath.documentId()` — die Sortierung nach Dokument-ID.
 *
 * Die Ausleitung blättert damit seitenweise durch grosse Sammlungen. Ohne
 * diese Nachbildung liesse sich genau der Teil nicht pruefen, der bei drei
 * Jahren Zeiteintraegen ueber Erfolg und Abbruch entscheidet.
 */
export const KENNUNG = Symbol.for('documentId');

export const FieldPath = {
  documentId: () => KENNUNG,
};

/*
 * Die TYPEN, die `mandantendaten.ts` aus `firebase-admin/firestore` bezieht.
 *
 * Sie beschreiben dort die Signatur von `jedesDokument` — die Funktion nimmt
 * die Datenbank entgegen, statt sie selbst zu holen, damit beide Aufrufer
 * (Auskunft und Ausleitung) denselben Weg nehmen.
 */
export type Firestore = FakeDb;
export interface QueryDocumentSnapshot {
  id: string;
  data: () => Dok;
}

export const Timestamp = {
  now: () => ({ toMillis: () => Date.now() }),
  fromMillis: (ms: number) => ({ toMillis: () => ms }),
};
