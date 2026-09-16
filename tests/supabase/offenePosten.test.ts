/**
 * Die drei Zahlen hinter den Abzeichen im Menü.
 *
 * WAS HIER WIRKLICH AUF DEM PRÜFSTAND STEHT, ist nicht das Zählen — das ist
 * ein `count(*)`. Es ist die ROLLENGRENZE: wer einen Posten nicht entscheiden
 * darf, bekommt ihn gar nicht erst gezählt. Fällt sie, zeigt das Menü dem
 * Monteur eine Zahl, an der er nichts tun kann, und die Buchhaltung eines
 * fremden Betriebs seine Forderungen.
 *
 * Die Grenze steht zweimal — als `case` in der Funktion und im Zeilenschutz
 * der Tabellen. Geprüft wird das ERGEBNIS, damit eine Lücke in einer der
 * beiden auffällt und nicht von der anderen stillschweigend aufgefangen wird.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'posten-b';
const FREMD = 'posten-f';
const HEUTE = '2026-09-16';

let chef: Konto;
let buch: Konto;
let verw: Konto;
let anton: Konto;
let fremdChef: Konto;

/** Was `offene_posten` diesem Konto sagt. */
async function posten(k: Konto, heute = HEUTE) {
  const { data, error } = await k.client.rpc('offene_posten', { p_heute: heute });
  if (error) throw new Error(error.message);
  const z = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  return {
    urlaub: Number(z.urlaub),
    anforderungen: Number(z.anforderungen),
    mahnungen: Number(z.mahnungen),
  };
}

async function antrag(betrieb: string, uid: string, status = 'Beantragt') {
  const { error } = await admin.from('vacations').insert({
    company_id: betrieb, user_id: uid, user_name: 'Wer auch immer',
    von: '2026-10-01', bis: '2026-10-05', tage: 5, status,
  });
  if (error) throw new Error(error.message);
}

async function anforderung(betrieb: string, uid: string, status = 'Offen') {
  const { error } = await admin.from('material_orders').insert({
    id: crypto.randomUUID(), company_id: betrieb, material_name: 'Kupferrohr 18',
    quantity: 3, status, transaction_type: 'order', user_id: uid,
  });
  if (error) throw new Error(error.message);
}

let nummer = 0;
async function rechnung(betrieb: string, f: Record<string, unknown> = {}) {
  const { error } = await admin.from('invoices').insert({
    company_id: betrieb, invoice_number: `R-${betrieb}-${++nummer}`,
    project_number: 'P1', customer_name: 'Kunde',
    invoice_date: '2026-07-01', due_date: '2026-08-01',
    total_netto: 100, total_vat: 20, total_brutto: 120,
    payment_status: 'Überfällig', ...f,
  });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  buch = await konto(BETRIEB, 'Buchhaltung', 'buch');
  verw = await konto(BETRIEB, 'Verwaltung', 'verw');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
  fremdChef = await konto(FREMD, 'Geschäftsführung', 'fremd');

  await antrag(BETRIEB, anton.uid);
  await antrag(BETRIEB, anton.uid);
  // Ein entschiedener Antrag ist kein offener Posten mehr.
  await antrag(BETRIEB, anton.uid, 'Genehmigt');

  await anforderung(BETRIEB, anton.uid);
  await anforderung(BETRIEB, anton.uid, 'Abholbereit');

  // Fällig: überfällig, nie gemahnt.
  await rechnung(BETRIEB);
  // Nicht fällig: bezahlt.
  await rechnung(BETRIEB, { payment_status: 'Bezahlt' });
  // Nicht fällig: das Zahlungsziel läuft noch.
  await rechnung(BETRIEB, { payment_status: 'Offen', due_date: '2026-12-01' });

  // Der fremde Betrieb hat von allem etwas — nichts davon darf hier zählen.
  await antrag(FREMD, fremdChef.uid);
  await anforderung(FREMD, fremdChef.uid);
  await rechnung(FREMD);
}, 180_000);

describe('Was die Geschäftsführung sieht', () => {
  it('zählt alle drei Arten — und nur die offenen', async () => {
    expect(await posten(chef)).toEqual({ urlaub: 2, anforderungen: 1, mahnungen: 1 });
  });

  it('und nichts aus einem fremden Betrieb', async () => {
    // Der fremde Betrieb hat je einen offenen Posten jeder Art. Stünde hier
    // eine höhere Zahl, wäre die Mandantentrennung gebrochen — und zwar an
    // einer Stelle, an der niemand sie vermutet.
    expect(await posten(fremdChef)).toEqual({ urlaub: 1, anforderungen: 1, mahnungen: 1 });
  });
});

describe('Wer welche Zahl gar nicht erst bekommt', () => {
  it('der Monteur bekommt keine — auch nicht seine eigenen Anträge', async () => {
    /*
      SEINE ANTRÄGE STEHEN AUF „BEANTRAGT" UND SIND TROTZDEM KEIN OFFENER
      POSTEN FÜR IHN. Ein Abzeichen heisst „hier liegt eine Entscheidung für
      dich"; seine Anträge liegen bei jemand anderem. Zählte der Zeilenschutz
      allein, stünde hier eine 2 — er DARF seine eigenen ja lesen.
    */
    expect(await posten(anton)).toEqual({ urlaub: 0, anforderungen: 0, mahnungen: 0 });
  });

  it('die Buchhaltung zählt Mahnungen und Urlaub, aber keine Anforderungen', async () => {
    expect(await posten(buch)).toEqual({ urlaub: 2, anforderungen: 0, mahnungen: 1 });
  });

  it('die Verwaltung zählt Anforderungen, aber keine Mahnungen', async () => {
    // Rechnungen darf sie nicht einmal lesen; eine Zahl darüber wäre eine
    // Auskunft über Geld, die ihr nicht zusteht.
    expect(await posten(verw)).toEqual({ urlaub: 0, anforderungen: 1, mahnungen: 0 });
  });
});

describe('Wer Urlaub entscheiden darf, zählt ihn — und liest ihn', () => {
  it('eine eingetragene Genehmigende aus der Verwaltung sieht die Anträge', async () => {
    /*
      DIE LÜCKE, DIE ERST DAS ABZEICHEN SICHTBAR GEMACHT HAT. Seit dem 13.09.
      legt der Betrieb fest, WER genehmigt — auch eine Bürokraft. Entscheiden
      durfte sie seitdem; LESEN durfte sie die Anträge nicht, denn die
      Leserichtlinie kannte nur Leitung und Buchhaltung. Die Ansicht zeigte
      ihr also „Wartet auf Entscheidung" und darin nichts.

      Ohne Abzeichen fällt das nicht auf — eine leere Liste heisst auch
      „gerade nichts da". Mit Abzeichen wäre es eine Lüge: null, wo zwei
      warten.
    */
    await admin.from('companies')
      .update({ vacation_approvers: [verw.uid] }).eq('id', BETRIEB);

    const { data } = await verw.client.from('vacations').select('id').eq('status', 'Beantragt');
    expect(data).toHaveLength(2);
    expect((await posten(verw)).urlaub).toBe(2);
  });

  it('und wer nicht auf der Liste steht, zählt ihn nicht mehr', async () => {
    /*
      DIE ANDERE RICHTUNG GEHÖRT DAZU. Steht eine Liste da, entscheidet die
      Buchhaltung NICHT mehr — sonst wäre die Einstellung eine Erweiterung
      und keine Festlegung. Die Geschäftsführung bleibt unabwählbar; ein
      Betrieb, der sich selbst aussperrt, wäre ein schlechter Tausch.
    */
    expect((await posten(buch)).urlaub).toBe(0);
    expect((await posten(chef)).urlaub).toBe(2);

    await admin.from('companies').update({ vacation_approvers: [] }).eq('id', BETRIEB);
    expect((await posten(buch)).urlaub).toBe(2);
  });
});

describe('Wann eine Mahnung fällig ist', () => {
  /*
    EIN EIGENER BETRIEB FÜR DIESEN ABSCHNITT. Die Zahl oben wächst sonst mit
    jeder hier angelegten Rechnung, und dann prüfte dieser Abschnitt die
    Reihenfolge der Prüfungen statt der Regel.

    GEZÄHLT WIRD ÜBER ECHTE ZEILEN und nicht über die Regel allein: `p_stufe`
    und `mahnstufe` müssen dieselbe Spalte treffen. Eine Regel, die für sich
    stimmt und an der falschen Spalte hängt, wäre genau der Fehler, den eine
    isolierte Prüfung durchliesse.
  */
  const MAHN = 'posten-m';
  let mahnChef: Konto;

  beforeAll(async () => {
    await betriebAnlegen(MAHN);
    mahnChef = await konto(MAHN, 'Geschäftsführung', 'mahnchef');
  }, 120_000);

  it('überfällig und nie gemahnt: fällig', async () => {
    await rechnung(MAHN);
    expect((await posten(mahnChef)).mahnungen).toBe(1);
  });

  it('nicht, solange die Frist aus der letzten Mahnung läuft', async () => {
    /*
      Wer gestern eine Zahlungserinnerung mit einer Woche Frist verschickt
      hat, hat heute nichts zu tun. Ohne diese Regel zählte das Abzeichen
      jede überfällige Rechnung jeden Tag mit — und wäre damit dauerhaft an.
    */
    await rechnung(MAHN, {
      mahnstufe: 1, gemahnt_am: '2026-09-15', mahnfrist: '2026-09-22',
    });
    expect((await posten(mahnChef)).mahnungen).toBe(1);

    // Einen Tag nach Ablauf der Frist ist sie wieder dran.
    expect((await posten(mahnChef, '2026-09-23')).mahnungen).toBe(2);
  });

  it('der letzte Tag der Frist gehört noch dem Kunden', async () => {
    expect((await posten(mahnChef, '2026-09-22')).mahnungen).toBe(1);
  });

  it('ohne eingetragene Frist gelten die sieben Tage des Belegs', async () => {
    // Eine ältere Mahnung trägt womöglich keine Frist — die Spalte kam
    // später dazu. Der Beleg schlägt sieben Tage vor, und die hat der Kunde
    // schwarz auf weiss gelesen.
    await rechnung(MAHN, { mahnstufe: 1, gemahnt_am: '2026-09-10' });

    expect((await posten(mahnChef, '2026-09-17')).mahnungen).toBe(1);
    expect((await posten(mahnChef, '2026-09-18')).mahnungen).toBe(2);
  });

  it('ohne Frist und ohne Mahndatum bleibt die Forderung sichtbar', async () => {
    /*
      Ein Altbestand oder ein halb geschriebener Datensatz. „Im Zweifel läuft
      eine Frist" hiesse: die Rechnung verschwindet lautlos für immer aus dem
      Mahnlauf. Der Rückfall ist deshalb das ursprüngliche Zahlungsziel.
    */
    await rechnung(MAHN, { mahnstufe: 2 });
    expect((await posten(mahnChef)).mahnungen).toBe(2);
  });

  it('nach der dritten Mahnung nicht mehr — dann entscheidet ein Mensch', async () => {
    await rechnung(MAHN, {
      mahnstufe: 3, gemahnt_am: '2026-08-01', mahnfrist: '2026-08-08',
    });
    expect((await posten(mahnChef)).mahnungen).toBe(2);
  });
});
