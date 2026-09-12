/**
 * Urlaubsanträge auf Postgres.
 *
 * Zwei Dinge stehen im Mittelpunkt. Erstens die Rechte: beantragen darf
 * jeder, aber nur für sich; entscheiden darf nur die Führung, und niemand
 * über den eigenen Antrag. Zweitens die Überlappung — ein Urlaub, der vor
 * dem gefragten Zeitraum beginnt und in ihn hineinragt, ist genau der, der
 * die Einsatzplanung stört, und war unter Firestore am schwersten zu finden.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as urlaub from '@/lib/db/pg/vacations';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'urlaub-a';

let chef: Konto;
let anton: Konto;
let berta: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
  berta = await konto(BETRIEB, 'Mitarbeiter', 'berta');
  clientEinreichen(anton.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

async function leeren(): Promise<void> {
  await admin.from('vacations').delete().eq('company_id', BETRIEB);
}

const antrag = (k: Konto, von: string, bis: string, rest: Record<string, unknown> = {}) => ({
  userId: k.uid,
  userName: k.rolle,
  von,
  bis,
  tage: 5,
  status: 'Beantragt' as const,
  ...rest,
});

/** Setzt den Status so, wie es sonst die serverseitige Entscheidung tut. */
async function entscheiden(id: string, status: string): Promise<void> {
  const { error } = await admin.from('vacations').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

describe('Beantragen', () => {
  it('legt an und findet den eigenen Antrag wieder', async () => {
    await leeren();
    const id = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-07-06', '2026-07-10'));
    const eigene = await urlaub.listOwnVacations(BETRIEB, anton.uid);
    expect(eigene.map((v) => v.id)).toEqual([id]);
    expect(eigene[0]).toMatchObject({ von: '2026-07-06', bis: '2026-07-10', tage: 5, status: 'Beantragt' });
  });

  it('nur für sich selbst', async () => {
    await leeren();
    // Anton beantragt auf Bertas Namen — das lehnt die Richtlinie ab.
    await expect(
      urlaub.createVacation(BETRIEB, antrag(berta, '2026-07-06', '2026-07-10')),
    ).rejects.toThrow();
  });

  it('und nur als „Beantragt"', async () => {
    await leeren();
    /*
      Sonst genehmigte sich jeder seinen Urlaub selbst, indem er ihn gleich
      genehmigt anlegt — der Trigger für den Statuswechsel griffe nie, weil
      es gar keinen Wechsel gäbe.
    */
    await expect(
      urlaub.createVacation(BETRIEB, antrag(anton, '2026-07-06', '2026-07-10', { status: 'Genehmigt' })),
    ).rejects.toThrow();
  });

  it('die eigene Liste zeigt nur die eigenen Anträge, jüngste zuerst', async () => {
    await leeren();
    await urlaub.createVacation(BETRIEB, antrag(anton, '2026-03-02', '2026-03-06'));
    await urlaub.createVacation(BETRIEB, antrag(anton, '2026-08-03', '2026-08-07'));
    clientEinreichen(berta.client);
    await urlaub.createVacation(BETRIEB, antrag(berta, '2026-05-04', '2026-05-08'));
    clientEinreichen(anton.client);

    /*
      GELESEN WIRD ALS CHEF, und das ist der Punkt. Als Anton verdeckt der
      Zeilenschutz Bertas Antrag ohnehin — der Personenfilter der Abfrage
      wäre dann ungeprüft, und ein Wegfall fiele nicht auf. Wer alles sehen
      darf, zeigt, ob die Abfrage selbst eingrenzt.
    */
    clientEinreichen(chef.client);
    const eigene = await urlaub.listOwnVacations(BETRIEB, anton.uid);
    clientEinreichen(anton.client);
    expect(eigene.map((v) => v.von)).toEqual(['2026-08-03', '2026-03-02']);
  });

  it('hält die Obergrenze ein', async () => {
    await leeren();
    for (let i = 1; i <= 4; i += 1) {
      const tag = `2026-09-0${i}`;
      await urlaub.createVacation(BETRIEB, antrag(anton, tag, tag));
    }
    expect(await urlaub.listOwnVacations(BETRIEB, anton.uid, 2)).toHaveLength(2);
  });
});

describe('Zurückziehen', () => {
  it('den eigenen, noch nicht entschiedenen Antrag', async () => {
    await leeren();
    const id = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-07-06', '2026-07-10'));
    await urlaub.deleteVacation(id);
    expect(await urlaub.listOwnVacations(BETRIEB, anton.uid)).toEqual([]);
  });

  it('nicht mehr, sobald entschieden ist', async () => {
    /*
      Ein genehmigter Urlaub steht in der Planung und im Zeitkonto. Liesse er
      sich still löschen, verschwände er aus dem Kalender, und die gebuchten
      Urlaubstage blieben stehen.
    */
    await leeren();
    const id = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-07-06', '2026-07-10'));
    await entscheiden(id, 'Genehmigt');

    await urlaub.deleteVacation(id);
    expect(await urlaub.listOwnVacations(BETRIEB, anton.uid)).toHaveLength(1);
  });

  it('nicht den eines Kollegen', async () => {
    await leeren();
    clientEinreichen(berta.client);
    const id = await urlaub.createVacation(BETRIEB, antrag(berta, '2026-07-06', '2026-07-10'));
    clientEinreichen(anton.client);

    await urlaub.deleteVacation(id);
    clientEinreichen(berta.client);
    expect(await urlaub.listOwnVacations(BETRIEB, berta.uid)).toHaveLength(1);
    clientEinreichen(anton.client);
  });
});

describe('Entscheiden', () => {
  // Schlägt eine Prüfung fehl, bevor sie den Client zurückstellt, liefen alle
  // folgenden unter der falschen Anmeldung — und meldeten Fehler, die keine
  // sind. Das Zurückstellen gehört deshalb hierher, nicht ans Ende jeder
  // einzelnen Prüfung.
  afterEach(() => clientEinreichen(anton.client));

  it('ein Mitarbeiter genehmigt seinen eigenen Antrag nicht', async () => {
    await leeren();
    const id = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-07-06', '2026-07-10'));
    const { error } = await anton.client.from('vacations').update({ status: 'Genehmigt' }).eq('id', id);
    expect(error).not.toBeNull();
  });

  it('ein Mitarbeiter genehmigt auch fremde Anträge nicht', async () => {
    await leeren();
    const id = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-07-06', '2026-07-10'));

    clientEinreichen(berta.client);
    const { error } = await berta.client.from('vacations').update({ status: 'Genehmigt' }).eq('id', id);
    // Berta sieht den Antrag gar nicht — die Änderung trifft nichts und der
    // Status bleibt stehen. Geprüft wird deshalb das Ergebnis, nicht der Fehler.
    expect(error).toBeNull();
    clientEinreichen(anton.client);
    const [nachher] = await urlaub.listOwnVacations(BETRIEB, anton.uid);
    expect(nachher.status).toBe('Beantragt');
  });

  it('zurückziehen darf der Antragsteller selbst', async () => {
    await leeren();
    const id = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-07-06', '2026-07-10'));
    const { error } = await anton.client.from('vacations').update({ status: 'Storniert' }).eq('id', id);
    expect(error).toBeNull();
    const [nachher] = await urlaub.listOwnVacations(BETRIEB, anton.uid);
    expect(nachher.status).toBe('Storniert');
  });

  it('ein entschiedener Antrag ist auch für den Antragsteller zu', async () => {
    await leeren();
    const id = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-07-06', '2026-07-10'));
    await entscheiden(id, 'Genehmigt');

    const { error } = await anton.client.from('vacations').update({ status: 'Storniert' }).eq('id', id);
    expect(error).not.toBeNull();
  });

  it('die Geschäftsführung entscheidet auch über den eigenen Antrag', async () => {
    /*
      DAS IST KEINE ZUSAGE, SONDERN EIN BEFUND.

      Die Regel `app.darf_urlaub_entscheiden` fragt, WER entscheiden darf —
      nicht, ÜBER WESSEN Antrag. Die Geschäftsführung darf immer, also auch
      über den eigenen. Genauso war es in `firestore.rules`
      (`darfUrlaubEntscheiden()`), und der Umzug soll das Verhalten nicht
      still verändern.

      Festgehalten wird es hier, damit es nicht unbemerkt kippt — in die eine
      wie in die andere Richtung. Ob der Betrieb ein Vier-Augen-Prinzip will,
      ist eine Entscheidung für den Betrieb, nicht für die Migration.
    */
    await leeren();
    clientEinreichen(chef.client);
    const id = await urlaub.createVacation(BETRIEB, antrag(chef, '2026-07-06', '2026-07-10'));
    const { error } = await chef.client.from('vacations').update({ status: 'Genehmigt' }).eq('id', id);
    expect(error).toBeNull();
  });

  it('die offenen Anträge sind die Arbeitsliste der Führung', async () => {
    await leeren();
    const offen = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-07-06', '2026-07-10'));
    const erledigt = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-10-05', '2026-10-09'));
    await entscheiden(erledigt, 'Genehmigt');

    clientEinreichen(chef.client);
    const liste = await urlaub.listOpenVacations(BETRIEB);
    expect(liste.map((v) => v.id)).toEqual([offen]);
  });

  it('ein Mitarbeiter sieht in der offenen Liste nur sich selbst', async () => {
    /*
      Nicht die Liste entscheidet das, sondern der Zeilenschutz: wer weder
      Führung noch Buchhaltung ist, sieht ausschliesslich die eigenen
      Anträge. Ein Urlaubsgesuch ist nichts, was Kollegen etwas angeht.
    */
    await leeren();
    await urlaub.createVacation(BETRIEB, antrag(anton, '2026-07-06', '2026-07-10'));
    clientEinreichen(berta.client);
    await urlaub.createVacation(BETRIEB, antrag(berta, '2026-07-13', '2026-07-17'));

    const liste = await urlaub.listOpenVacations(BETRIEB);
    expect(liste.map((v) => v.userId)).toEqual([berta.uid]);
  });
});

describe('Genehmigter Urlaub im Zeitraum', () => {
  let hineinragend = '';

  beforeAll(async () => {
    await leeren();
    clientEinreichen(anton.client);
    // Beginnt VOR dem gefragten Zeitraum und ragt hinein.
    hineinragend = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-06-24', '2026-07-03'));
    // Mittendrin.
    const drin = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-07-06', '2026-07-10'));
    // Komplett danach.
    const danach = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-09-07', '2026-09-11'));
    // Komplett davor.
    const davor = await urlaub.createVacation(BETRIEB, antrag(anton, '2026-05-04', '2026-05-08'));
    // Im Zeitraum, aber nur beantragt — kein Urlaub, auf den man planen darf.
    await urlaub.createVacation(BETRIEB, antrag(anton, '2026-07-20', '2026-07-24'));

    for (const id of [hineinragend, drin, danach, davor]) await entscheiden(id, 'Genehmigt');
    clientEinreichen(chef.client);
  }, 60_000);

  afterAll(() => clientEinreichen(anton.client));

  it('findet den Urlaub, der vor dem Zeitraum beginnt', async () => {
    const rows = await urlaub.listApprovedVacationsInRange(BETRIEB, '2026-07-01', '2026-07-31');
    expect(rows.map((v) => v.id)).toContain(hineinragend);
  });

  it('nimmt nur Genehmigtes und nur Überlappendes', async () => {
    const rows = await urlaub.listApprovedVacationsInRange(BETRIEB, '2026-07-01', '2026-07-31');
    expect(rows.map((v) => v.von).sort()).toEqual(['2026-06-24', '2026-07-06']);
  });

  it('die Ränder zählen mit', async () => {
    // Der Zeitraum endet am ersten Urlaubstag: ein Tag Überlappung ist eine.
    const rows = await urlaub.listApprovedVacationsInRange(BETRIEB, '2026-06-01', '2026-06-24');
    expect(rows.map((v) => v.von)).toEqual(['2026-06-24']);
  });

  it('die Obergrenze greift auf die richtige Menge', async () => {
    /*
      DER GEWINN DES UMZUGS. Unter Firestore lief die zweite Bedingung im
      Browser — nach der Obergrenze. Eine Grenze von 1 konnte dort eine Zeile
      liefern, die der Nachfilter danach verwarf: Ergebnis leer, obwohl es
      einen passenden Urlaub gab. Hier steht beides in der Abfrage.
    */
    const rows = await urlaub.listApprovedVacationsInRange(BETRIEB, '2026-07-01', '2026-07-31', 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].von).toBe('2026-06-24');
  });
});
