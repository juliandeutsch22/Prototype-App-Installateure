import type { Client } from 'pg';
import { admin, API } from './helfer';

/** Nur der feste Namensraum dieser Suite, nie ein pauschaler Storage-Reset. */
export async function pruefFotosRaeumen(db: Client): Promise<void> {
  const ziel = new URL(API);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(ziel.hostname)) {
    throw new Error('Prüfdateien werden ausschließlich im lokalen Stack aufgeräumt.');
  }
  const { rows } = await db.query<{ name: string }>(
    `select name from storage.objects where bucket_id = 'scheinfotos' and name like 'scheine/pd-loeschen/%'`,
  );
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await admin.storage.from('scheinfotos').remove(rows.slice(i, i + 100).map((r) => r.name));
    if (error) throw new Error(error.message);
  }
}
