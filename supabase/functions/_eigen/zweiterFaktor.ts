/**
 * Fehlt dem Aufrufer der zweite Faktor? (Runde 3, H1) — dieselbe Frage, die
 * `app.aktiv()` in jeder Zeilenregel stellt, hier für die Functions, die mit
 * dem Dienstschlüssel lesen. Im Zweifel (Datenbank antwortet nicht) gilt er
 * als fehlend: dann lieber abweisen als durchlassen.
 */
import { aalAusToken } from '../_shared/zweiFaktor.ts';

export async function zweiterFaktorFehlt(
  urlBasis: string, alsDienst: Record<string, string>, uid: string, token: string,
): Promise<boolean> {
  const r = await fetch(`${urlBasis}/rest/v1/rpc/zweiter_faktor_fehlt`, {
    method: 'POST', headers: alsDienst, body: JSON.stringify({ p_uid: uid, p_aal: aalAusToken(token) }),
  });
  if (!r.ok) {
    await r.body?.cancel();
    return true;
  }
  return (await r.json()) !== false;
}
