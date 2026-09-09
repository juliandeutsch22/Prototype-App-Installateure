import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { betriebAnlegen, plattformAdminClaim } from '../../functions/src/plattform';
import { neueDatenbank, type FakeDb } from './ersatz/firestore';
import {
  authAufrufe,
  authLeeren,
  authScheitertBei,
  konten,
  kontoAnlegen,
} from './ersatz/auth';
import { HttpsError, protokollLeeren, type AufrufKontext, type SchreibEreignis } from './ersatz/funktionen';
import type { NeuerBetrieb } from '../../shared/plattform';

/**
 * Der globale Administrator — ein Konto, das Betriebe ANLEGEN kann und in
 * keinen HINEINSIEHT.
 *
 * Die zweite Hälfte dieser Zusage steht nicht hier, sondern in
 * `tests/rules/plattform.rules.test.ts`: dort wird gegen eine echte Datenbank
 * geprüft, dass ein Token mit diesem Claim an kein einziges Dokument kommt.
 * Hier geht es um die erste Hälfte — legt er einen Betrieb vollständig an,
 * und weist er alles ab, was er nicht anlegen darf?
 */

let db: FakeDb;

const EINGABE: NeuerBetrieb = {
  name: 'Perl Installationen',
  companyId: 'perl',
  adminEmail: 'petra@perl.at',
  adminName: 'Petra Perl',
};

beforeEach(() => {
  db = neueDatenbank();
  authLeeren();
  protokollLeeren();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-09T08:00:00'));
});
afterEach(() => {
  vi.useRealTimers();
  void db;
});

function anlegen(daten: Partial<NeuerBetrieb>, claims: Record<string, unknown> | null = { plattformAdmin: true }) {
  return betriebAnlegen({
    data: daten,
    auth: claims ? { uid: 'global', token: claims } : undefined,
  } as AufrufKontext<Partial<NeuerBetrieb>>) as Promise<{
    companyId: string;
    ersterAdminUid: string;
    passwortLink: string;
  }>;
}

describe('Betrieb anlegen — wer darf', () => {
  it('weist jeden ab, der den Claim nicht trägt', async () => {
    // Auch die Geschäftsführung eines Betriebs nicht: sie ist Chefin IHRES
    // Betriebs, nicht der Plattform.
    await expect(anlegen(EINGABE, null)).rejects.toThrow(HttpsError);
    await expect(anlegen(EINGABE, { companyId: 'perl', role: 'Administrator' })).rejects.toThrow(
      HttpsError,
    );
    // Ein Claim mit dem RICHTIGEN Namen und dem falschen Wert zählt nicht.
    await expect(anlegen(EINGABE, { plattformAdmin: 'ja' })).rejects.toThrow(HttpsError);
  });

  it('schreibt nichts, wenn abgewiesen wird', async () => {
    await expect(anlegen(EINGABE, { companyId: 'perl' })).rejects.toThrow();
    expect(db.alles('companies')).toEqual({});
    expect(authAufrufe).toHaveLength(0);
  });
});

describe('Betrieb anlegen — was geprüft wird', () => {
  it('lehnt eine unbrauchbare Kennung ab', async () => {
    /*
      Die Kennung wird zur Dokument-Id und steht als Feld in jedem Datensatz.
      Ein Schrägstrich zerlegte den Pfad, ein Leerzeichen macht jede spätere
      Abfrage von Hand zur Fehlerquelle.
    */
    for (const companyId of ['', 'a', 'perl gmbh', 'perl/2', '9perl', 'perl_2']) {
      await expect(anlegen({ ...EINGABE, companyId })).rejects.toThrow(HttpsError);
    }
  });

  it('nimmt Grossbuchstaben an, statt sie abzuweisen', async () => {
    // Wer „Perl" eintippt, meint dieselbe Kennung wie „perl". Gespeichert
    // wird ohnehin nur die kleingeschriebene Form — es kann also gar nicht
    // zwei geben, die gleich aussehen.
    await expect(anlegen({ ...EINGABE, companyId: 'Perl' })).resolves.toMatchObject({
      companyId: 'perl',
    });
  });

  it('lehnt eine unvollständige Adresse ab', async () => {
    await expect(anlegen({ ...EINGABE, adminEmail: 'perl.at' })).rejects.toThrow(HttpsError);
  });

  it('lehnt eine vergebene Kennung ab', async () => {
    // Ein zweiter Betrieb auf derselben Kennung würde seine Daten mit dem
    // bestehenden vermischen — und zwar unbemerkt, weil jede Abfrage genau
    // nach dieser Kennung filtert.
    db.seed('companies', { perl: { name: 'Perl Installationen' } });
    await expect(anlegen(EINGABE)).rejects.toThrow(/vergeben/);
    // Und es entsteht kein Konto, das dann ohne Betrieb dastünde.
    expect(authAufrufe.filter((a) => a.art === 'anlegen')).toHaveLength(0);
  });

  it('lehnt eine Adresse ab, zu der es schon ein Konto gibt', async () => {
    /*
      Die Berechtigungen hängen an der Anmeldekennung, nicht am Betrieb.
      Bekäme dieselbe Person ein zweites users-Dokument in einem zweiten
      Betrieb, entschiede allein die Reihenfolge der Trigger, in welchem sie
      landet — sie stünde eines Morgens im falschen Betrieb, ohne dass jemand
      etwas geändert hätte.
    */
    kontoAnlegen({ uid: 'schon-da', email: 'petra@perl.at' });
    await expect(anlegen(EINGABE)).rejects.toThrow(/gehört zu genau einem Betrieb/);
    expect(db.alles('companies')).toEqual({});
  });
});

describe('Betrieb anlegen — was entsteht', () => {
  it('legt Firma, ersten Administrator und Protokoll an', async () => {
    const ergebnis = await anlegen(EINGABE);

    expect(db.alles('companies').perl).toMatchObject({ name: 'Perl Installationen' });
    // Mit Vorgabesätzen: ein Betrieb ohne Stundensatz könnte keine Rechnung
    // schreiben, und die Zahl steht in den Einstellungen sofort zur Änderung.
    expect(db.alles('companies').perl.rates).toMatchObject({ fach: 65, vatRate: 0.2 });

    const nutzer = db.alles('users')[ergebnis.ersterAdminUid];
    expect(nutzer).toMatchObject({
      companyId: 'perl',
      role: 'Administrator',
      active: true,
      email: 'petra@perl.at',
    });

    // Das Protokoll hält fest, WER angelegt hat — und keine Geschäftsdaten.
    expect(db.alles('betriebsanlagen').perl).toMatchObject({
      companyId: 'perl',
      angelegtVon: 'global',
      ersterAdminUid: ergebnis.ersterAdminUid,
    });
  });

  it('normalisiert Kennung und Adresse', async () => {
    // Zwei Schreibweisen derselben Adresse ergäben sonst zwei Konten.
    const ergebnis = await anlegen({
      ...EINGABE,
      companyId: '  PERL  ',
      adminEmail: ' Petra@Perl.AT ',
    });
    expect(ergebnis.companyId).toBe('perl');
    expect(db.alles('users')[ergebnis.ersterAdminUid].email).toBe('petra@perl.at');
  });

  it('gibt einen Rücksetzlink zurück, kein Passwort', async () => {
    const ergebnis = await anlegen(EINGABE);
    expect(ergebnis.passwortLink).toMatch(/petra%40perl.at/);
    // Das Konto bekommt sehr wohl ein Passwort — ohne eines gäbe es keinen
    // Passwort-Anbieter und damit keinen Rücksetzlink. Nur erfährt es niemand.
    const angelegt = authAufrufe.find((a) => a.art === 'anlegen');
    expect((angelegt?.daten as { password?: string }).password).toBeTruthy();
    expect(JSON.stringify(ergebnis)).not.toContain(
      (angelegt?.daten as { password: string }).password,
    );
  });

  it('räumt das Konto weg, wenn die Datenbank nicht mitspielt', async () => {
    /*
      Sonst bliebe ein Auth-Konto ohne Betrieb zurück — und die nächste
      Anlage mit derselben Adresse scheiterte an genau diesem Rest, ohne dass
      irgendwo stünde, warum.
    */
    db.scheitertBeimSchreiben = true;
    await expect(anlegen(EINGABE)).rejects.toThrow();
    expect(authAufrufe.some((a) => a.art === 'loeschen')).toBe(true);
    expect(konten.size).toBe(0);
  });
});

function claimEreignis(uid: string, da: boolean) {
  return {
    data: {
      after: { exists: da, data: () => (da ? {} : undefined) },
    },
    params: { uid },
  } as unknown as SchreibEreignis<Record<string, unknown>>;
}

describe('Der Plattform-Claim', () => {
  it('setzt genau einen Claim — und keine companyId', async () => {
    /*
      DAS IST DIE ZUSAGE. Jede Leseregel verlangt
      `resource.data.companyId == request.auth.token.companyId`; ein Token
      ohne companyId erfüllt das nirgends. Käme hier je eine dazu, sähe dieses
      Konto einen ganzen Betrieb.
    */
    kontoAnlegen({ uid: 'global' });
    await plattformAdminClaim(claimEreignis('global', true));

    const gesetzt = authAufrufe.find((a) => a.art === 'claims');
    expect(gesetzt?.daten).toEqual({ plattformAdmin: true });
  });

  it('nimmt ihn beim Löschen zurück und widerruft die Token', async () => {
    // Ohne Widerruf liefe ein bereits ausgestelltes Token bis zu einer Stunde
    // weiter — beim Entziehen ist genau das der Punkt.
    kontoAnlegen({ uid: 'global', customClaims: { plattformAdmin: true } });
    await plattformAdminClaim(claimEreignis('global', false));

    expect(authAufrufe.find((a) => a.art === 'claims')?.daten).toEqual({});
    expect(authAufrufe.some((a) => a.art === 'revoke')).toBe(true);
  });

  it('verweigert ihn einer Kennung, die schon zu einem Betrieb gehört', async () => {
    /*
      `setCustomUserClaims` ERSETZT die Claims, und `syncUserClaims` schreibt
      sie bei jeder Änderung am users-Dokument neu. Gäbe es für dieselbe
      Kennung beides, entschiede allein die Reihenfolge, welche Claims am Ende
      stehen — mal ein Plattformkonto, mal eines MIT companyId. Ein Zufall
      entschiede damit über Leserechte an fremden Kundendaten.
    */
    db.seed('users', { chefin: { uid: 'chefin', companyId: 'perl', role: 'Geschäftsführung' } });
    kontoAnlegen({ uid: 'chefin' });
    await plattformAdminClaim(claimEreignis('chefin', true));

    expect(authAufrufe).toHaveLength(0);
  });

  it('bringt den Trigger nicht zu Fall, wenn Google nicht antwortet', async () => {
    // Ein geworfener Fehler liesse Firebase endlos wiederholen.
    kontoAnlegen({ uid: 'global' });
    authScheitertBei('claims');
    await expect(plattformAdminClaim(claimEreignis('global', true))).resolves.toBeUndefined();
  });
});
