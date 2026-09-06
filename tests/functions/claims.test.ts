import { describe, it, expect, beforeEach } from 'vitest';
import { syncUserClaims } from '../../functions/src/claims';
import { authAufrufe, authLeeren, authScheitertBei } from './ersatz/auth';
import { protokoll, protokollLeeren, type SchreibEreignis } from './ersatz/funktionen';

/**
 * Die Custom Claims — das Fundament der ganzen Zugriffskontrolle.
 *
 * `firestore.rules` prüft `companyId`, `role` und `active` aus dem Token.
 * Diese Function ist die EINZIGE Stelle, die sie setzt. Ist sie falsch,
 * stimmen die Regeln trotzdem — sie prüfen dann nur die falschen Werte.
 *
 * Sie war bisher ungetestet, und ihre Wirkung ist von außen unsichtbar: sie
 * passiert bei Google, nicht in der Datenbank. Deshalb schreibt der Ersatz
 * mit, was gerufen wurde.
 */

function ereignis(nachher: Record<string, unknown> | null, docId = 'u1') {
  return {
    data: {
      after: nachher
        ? { exists: true, data: () => nachher }
        : { exists: false, data: () => undefined },
    },
    params: { userId: docId },
  } as SchreibEreignis<Record<string, unknown>>;
}

const AKTIV = { uid: 'monteur', companyId: 'perl', role: 'Mitarbeiter' };

beforeEach(() => {
  authLeeren();
  protokollLeeren();
});

describe('Claims setzen', () => {
  it('überträgt Mandant und Rolle ins Token', async () => {
    await syncUserClaims(ereignis(AKTIV));
    expect(authAufrufe).toContainEqual({
      art: 'claims',
      uid: 'monteur',
      daten: { companyId: 'perl', role: 'Mitarbeiter', active: true },
    });
  });

  it('behandelt ein fehlendes active-Feld als aktiv', async () => {
    /*
      Dieselbe Lesart wie überall sonst in der App (`u.active !== false`).
      Übernommene Altbestände tragen das Feld nicht — ein Import dürfte
      niemanden aussperren, der nie deaktiviert wurde.
    */
    await syncUserClaims(ereignis(AKTIV));
    const claims = authAufrufe.find((a) => a.art === 'claims');
    expect((claims?.daten as { active: boolean }).active).toBe(true);
    expect(authAufrufe).toContainEqual({ art: 'update', uid: 'monteur', daten: { disabled: false } });
  });

  it('tut nichts, wenn das Dokument gelöscht wurde', async () => {
    await syncUserClaims(ereignis(null));
    expect(authAufrufe).toHaveLength(0);
  });

  it('setzt nichts ohne uid, companyId oder Rolle — und sagt es', async () => {
    // Halbe Claims wären schlimmer als keine: die Regeln lesen dann einen
    // undefinierten Mandanten und lassen niemanden mehr hinein, ohne Grund.
    await syncUserClaims(ereignis({ companyId: 'perl', role: 'Mitarbeiter' }));
    await syncUserClaims(ereignis({ uid: 'x', role: 'Mitarbeiter' }));
    await syncUserClaims(ereignis({ uid: 'x', companyId: 'perl' }));
    expect(authAufrufe).toHaveLength(0);
    expect(protokoll.filter((p) => p.stufe === 'warn')).toHaveLength(3);
  });
});

describe('Ein deaktiviertes Konto', () => {
  /*
    DREI RIEGEL, und jeder für sich lässt eine Lücke:

      1. Das Auth-Konto sperren — wirkt absolut, aber erst beim nächsten
         Anmeldeversuch.
      2. Die Sitzungstoken widerrufen — ohne das liefe ein ausgestelltes
         Token noch bis zu einer Stunde weiter.
      3. Der `active`-Claim, den die Regeln prüfen.

    Vorher stand die Prüfung ausschliesslich im Browser. Ein ausgeschiedener
    Mitarbeiter behielt damit ein gültiges Konto: mit seinem Passwort und dem
    Firestore-SDK kam er unverändert an Kunden, Baustellen und Scheine.
  */
  it('wird gesperrt, verliert seine Token und den active-Claim', async () => {
    await syncUserClaims(ereignis({ ...AKTIV, active: false }));
    expect(authAufrufe).toEqual([
      { art: 'claims', uid: 'monteur', daten: { companyId: 'perl', role: 'Mitarbeiter', active: false } },
      { art: 'update', uid: 'monteur', daten: { disabled: true } },
      { art: 'revoke', uid: 'monteur' },
    ]);
  });

  it('behält bei einer Wiedereinstellung keinen Riegel zurück', async () => {
    /*
      Ohne `disabled: false` käme ein wieder eingestellter Mitarbeiter nie
      mehr herein — und niemand fände den Grund, weil im Firestore alles
      richtig aussähe.
    */
    await syncUserClaims(ereignis({ ...AKTIV, active: true }));
    expect(authAufrufe).toContainEqual({ art: 'update', uid: 'monteur', daten: { disabled: false } });
    expect(authAufrufe.some((a) => a.art === 'revoke')).toBe(false);
  });
});

describe('Wenn Google nicht erreichbar ist', () => {
  it('bringt den Trigger nicht zum Absturz, sondern protokolliert', async () => {
    // Ein geworfener Fehler liesse den Trigger wiederholen — bei einem
    // dauerhaften Ausfall endlos.
    authScheitertBei('claims');
    await expect(syncUserClaims(ereignis(AKTIV))).resolves.toBeUndefined();
    expect(protokoll.some((p) => p.stufe === 'error')).toBe(true);
  });
});
