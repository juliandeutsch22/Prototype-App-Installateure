/** Ein Nachsender je Herkunft; auch neue Schreibvorgänge nehmen diese Sperre. */
export async function fachSperre<T>(tun: () => Promise<T>): Promise<T> {
  const name = 'installateur-ausgangsfach';
  if (navigator.locks) return await navigator.locks.request(name, tun);

  // Ältere Browser ohne Web Locks können weiterhin synchronisieren. Die
  // eigene Transaktion sperrt nur den Mutex, niemals das Fach mit den Daten.
  // Offene IDB-Anfragen halten sie bis zum Ende des Netzversuchs am Leben.
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(`${name}-sperre`, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('sperre');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('sperre', 'readwrite');
      const store = tx.objectStore('sperre');
      let begonnen = false;
      let fertig = false;
      let ergebnis: T;
      let fehler: unknown;
      let gescheitert = false;
      tx.oncomplete = () => { if (gescheitert) reject(fehler); else resolve(ergebnis); };
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Die Nachsendesperre wurde unterbrochen.'));
      const halten = () => {
        const r = store.get(0);
        r.onsuccess = () => {
          if (!begonnen) {
            begonnen = true;
            void Promise.resolve().then(tun).then((v) => { ergebnis = v; }, (e: unknown) => { gescheitert = true; fehler = e; })
              .finally(() => { fertig = true; });
          }
          if (!fertig) halten();
        };
      };
      halten();
    });
  } finally { db.close(); }
}
