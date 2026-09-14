/**
 * Das Ausgangsfach im Browser — und damit über einen Neustart hinweg.
 *
 * WARUM ÜBERHAUPT DAUERHAFT. Firestore hielt seine Warteschlange in
 * IndexedDB; ein Monteur konnte im Keller buchen, die App schliessen, das
 * Handy in die Tasche stecken und oben weitermachen. Läge die Warteschlange
 * nur im Arbeitsspeicher, wäre die Buchung beim Wegwischen der App weg —
 * lautlos, denn der Monteur hat ja eine Bestätigung gesehen. Das wäre die
 * schlimmste Art, diesen Umzug zu verlieren.
 *
 * WARUM IndexedDB UND NICHT localStorage. localStorage ist begrenzt, synchron
 * und speichert nur Zeichenketten; eine Warteschlange mit Unterschriftsbildern
 * spränge daran. IndexedDB vergibt ausserdem selbst fortlaufende Schlüssel —
 * genau das, was die Reihenfolge braucht, ohne dass zwei offene Tabs sich in
 * die Quere kommen.
 */
import type { Lager, Vormerkung } from './ausgangsfach';

const DATENBANK = 'installateur-ausgangsfach';
const FACH = 'vormerkungen';
const FASSUNG = 1;

function oeffnen(): Promise<IDBDatabase> {
  return new Promise((gelingt, scheitert) => {
    const anfrage = indexedDB.open(DATENBANK, FASSUNG);
    anfrage.onupgradeneeded = () => {
      const db = anfrage.result;
      if (!db.objectStoreNames.contains(FACH)) {
        // autoIncrement vergibt die Folge. Der Schlüssel IST die Reihenfolge,
        // und weil ihn die Datenbank vergibt, kann ihn niemand doppelt raten.
        db.createObjectStore(FACH, { keyPath: 'folge', autoIncrement: true });
      }
    };
    anfrage.onsuccess = () => gelingt(anfrage.result);
    anfrage.onerror = () => scheitert(anfrage.error ?? new Error('IndexedDB nicht erreichbar'));
  });
}

function alsVersprechen<T>(anfrage: IDBRequest<T>): Promise<T> {
  return new Promise((gelingt, scheitert) => {
    anfrage.onsuccess = () => gelingt(anfrage.result);
    anfrage.onerror = () => scheitert(anfrage.error ?? new Error('IndexedDB-Vorgang gescheitert'));
  });
}

/**
 * Wartet auf das ENDE der Transaktion, nicht nur auf die Anfrage.
 *
 * Eine erfolgreiche Anfrage heisst noch nicht, dass geschrieben wurde: erst
 * `oncomplete` sagt, dass es auf der Platte liegt. Wer hier abkürzt, meldet
 * „vorgemerkt" für etwas, das eine abgebrochene Transaktion gleich wieder
 * verwirft — und genau diese Lüge soll das Ausgangsfach ja verhindern.
 */
function abgeschlossen(tx: IDBTransaction): Promise<void> {
  return new Promise((gelingt, scheitert) => {
    tx.oncomplete = () => gelingt();
    tx.onerror = () => scheitert(tx.error ?? new Error('IndexedDB-Transaktion gescheitert'));
    tx.onabort = () => scheitert(tx.error ?? new Error('IndexedDB-Transaktion abgebrochen'));
  });
}

export function lagerImBrowser(): Lager {
  return {
    async alle(): Promise<Vormerkung[]> {
      const db = await oeffnen();
      try {
        const tx = db.transaction(FACH, 'readonly');
        const zeilen = await alsVersprechen(tx.objectStore(FACH).getAll() as IDBRequest<Vormerkung[]>);
        return zeilen.sort((a, b) => a.folge - b.folge);
      } finally {
        db.close();
      }
    },

    async ablegen(v: Omit<Vormerkung, 'folge'>): Promise<number> {
      const db = await oeffnen();
      try {
        const tx = db.transaction(FACH, 'readwrite');
        const schluessel = alsVersprechen(tx.objectStore(FACH).add(v) as IDBRequest<IDBValidKey>);
        await abgeschlossen(tx);
        return Number(await schluessel);
      } finally {
        db.close();
      }
    },

    async entfernen(folge: number): Promise<void> {
      const db = await oeffnen();
      try {
        const tx = db.transaction(FACH, 'readwrite');
        tx.objectStore(FACH).delete(folge);
        await abgeschlossen(tx);
      } finally {
        db.close();
      }
    },

    async ersetzen(v: Vormerkung): Promise<void> {
      const db = await oeffnen();
      try {
        const tx = db.transaction(FACH, 'readwrite');
        tx.objectStore(FACH).put(v);
        await abgeschlossen(tx);
      } finally {
        db.close();
      }
    },
  };
}

/** Steht IndexedDB überhaupt zur Verfügung? Im privaten Modus mancher Browser nicht. */
export function lagerVerfuegbar(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}
