/**
 * Der Supportzugang — gegen eine echte Datenbank.
 *
 * HIER WIRD DIE FUNKTION ANGEFASST, AUF DER ALLES STEHT. `app.darf` trägt
 * jede einzelne Leseregel dieser Datenbank; sie um einen zweiten Zweig zu
 * erweitern ist der gefährlichste Eingriff der ganzen Arbeit. Deshalb fragt
 * fast jede Prüfung hier dasselbe von der anderen Seite: sieht ein
 * Plattformkonto OHNE Freigabe wirklich nichts — und zwar auch dann nicht,
 * wenn eine Freigabe für einen ANDEREN Betrieb gilt, wenn sie abgelaufen ist
 * oder wenn sie widerrufen wurde?
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, plattformkonto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'sup-a';
const ANDERER = 'sup-b';

let chefin: Konto;
let verwaltung: Konto;
let plattform: Konto;
let anderChef: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Perl Installationen');
  await betriebAnlegen(ANDERER, 'Anderer Betrieb');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'supgf');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'supvw');
  anderChef = await konto(ANDERER, 'Geschäftsführung', 'supand');
  plattform = await plattformkonto('supplattform');
  clientEinreichen(chefin.client);

  await admin.from('customers').insert({
    company_id: BETRIEB, name: 'Familie Huber', address: 'Hauptstrasse 1',
  });
  await admin.from('customers').insert({
    company_id: ANDERER, name: 'Fremdkunde', address: 'Nebengasse 2',
  });
}, 180_000);

afterAll(() => clientEinreichen(null));
afterEach(async () => {
  clientEinreichen(chefin.client);
  await admin.from('support_zugriffe').delete().eq('company_id', BETRIEB);
  await admin.from('support_freigaben').delete().eq('company_id', BETRIEB);
  await admin.from('support_freigaben').delete().eq('company_id', ANDERER);
});

const inStunden = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();

/** Eine Freigabe, wie der Betrieb sie gibt. */
async function freigeben(stunden = 4, wer: Konto = chefin, betrieb = BETRIEB) {
  const { data, error } = await wer.client
    .from('support_freigaben')
    .insert({
      company_id: betrieb,
      gewaehrt_von: wer.uid,
      grund: 'Rechnung RE-2026-0042 stimmt nicht',
      gilt_bis: inStunden(stunden),
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** Was das Plattformkonto in diesem Betrieb sieht. */
async function siehtKunden(betrieb = BETRIEB): Promise<number> {
  const { data, error } = await plattform.client
    .from('customers').select('id').eq('company_id', betrieb);
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

describe('Ohne Freigabe sieht die Plattform nichts', () => {
  it('liest keine einzige Zeile eines Betriebs', async () => {
    /*
      DAS IST DIE ZUSAGE, DIE ES SCHON VORHER GAB, und sie muss den Umbau
      überleben. Ein Plattformkonto trägt weder `company_id` noch Rolle —
      wäre der neue Zweig zu weit, fiele diese Prüfung, und zwar als einzige.
    */
    expect(await siehtKunden()).toBe(0);
  });

  it('liest auch dann nichts, wenn ein ANDERER Betrieb freigegeben hat', async () => {
    // Der Fehler, der am leichtesten passiert: `app.support_liest` ohne den
    // Betriebsvergleich wäre ein Generalschlüssel, sobald IRGENDWER freigibt.
    await freigeben(4, anderChef, ANDERER);
    expect(await siehtKunden(BETRIEB)).toBe(0);
    expect(await siehtKunden(ANDERER)).toBe(1);
  });
});

describe('Mit Freigabe sieht sie — und nur so lange', () => {
  it('liest den freigegebenen Betrieb', async () => {
    await freigeben();
    expect(await siehtKunden()).toBe(1);
  });

  it('liest nach dem Widerruf nichts mehr', async () => {
    const id = await freigeben();
    expect(await siehtKunden()).toBe(1);

    const { error } = await chefin.client
      .from('support_freigaben')
      .update({ widerrufen_am: new Date().toISOString(), widerrufen_von: chefin.uid })
      .eq('id', id);
    expect(error).toBeNull();
    expect(await siehtKunden()).toBe(0);
  });

  it('liest nach Ablauf der Frist nichts mehr', async () => {
    /*
      Die Frist ist keine Anzeige, sondern die Grenze selbst. Die abgelaufene
      Freigabe wird hier mit dem Dienstschlüssel EINGEFÜGT und nicht aus einer
      gültigen gemacht: nachträglich verlängern oder verkürzen lässt sich eine
      Freigabe nirgends, auch nicht so.
    */
    const { error } = await admin.from('support_freigaben').insert({
      company_id: BETRIEB, gewaehrt_von: chefin.uid, grund: 'gestern',
      gilt_bis: new Date(Date.now() - 1000).toISOString(),
    });
    expect(error).toBeNull();
    expect(await siehtKunden()).toBe(0);
  });
});

describe('Ein Supportzugang schreibt nichts', () => {
  it('kommt an keine einzige Betriebstabelle zum Schreiben', async () => {
    /*
      DER RIEGEL STEHT VOR DER TABELLE UND NICHT IN DER REGEL. Die meisten
      Schreibregeln verlangen ohnehin eine Rolle — „die meisten" ist aber
      keine Zusage, und eine einzige Regel, die zum Schreiben nur `app.darf`
      prüft, machte aus dem Lesezugang einen Schreibzugang.
    */
    await freigeben();
    const schreib = await plattform.client
      .from('customers')
      .insert({ company_id: BETRIEB, name: 'Vom Support angelegt' });
    expect(schreib.error?.message).toMatch(/lesen und sonst nichts/);
  });

  it('kommt an den Materialstamm heran — und wird DORT vom Riegel gestoppt', async () => {
    /*
      DIESE PRÜFUNG IST DER GRUND FÜR DEN GANZEN RIEGEL. `materials_aendern`
      verlangt zum Schreiben nur `app.darf(company_id)` und keine Rolle — für
      einen Supportzugang ist das wahr. Ohne den Auslöser vor der Tabelle
      könnte er den Katalog eines fremden Betriebs ändern, und zwar
      fehlerfrei.
    */
    await freigeben();
    const { data } = await admin
      .from('materials')
      .insert({ company_id: BETRIEB, name: 'Eckventil', stock: 1 })
      .select('id').single();
    const id = (data as { id: string }).id;

    const aendern = await plattform.client
      .from('materials').update({ name: 'Vom Support umbenannt' }).eq('id', id);
    expect(aendern.error?.message).toMatch(/lesen und sonst nichts/);

    /*
      BEIM LÖSCHEN GREIFT SCHON DIE REGEL, nicht erst der Riegel:
      `materials_loeschen` verlangt eine Rolle. Es scheitert also still — null
      Zeilen betroffen, keine Meldung. Geprüft wird deshalb das Ergebnis.
    */
    await plattform.client.from('materials').delete().eq('id', id);
    const { data: nochDa } = await admin.from('materials').select('name').eq('id', id).single();
    expect(nochDa).toEqual({ name: 'Eckventil' });
    await admin.from('materials').delete().eq('id', id);
  });

  it('ändert und löscht auch dort nichts, wo schon die Regel ihn abweist', async () => {
    /*
      Beim Kundenstamm verlangt die Schreibregel eine Rolle, und ein
      Plattformkonto hat keine — es fällt schon dort durch, still und ohne
      Fehler (null Zeilen betroffen). Geprüft wird deshalb das Ergebnis und
      nicht die Meldung: der Kunde heisst danach noch genauso und ist noch da.
    */
    await freigeben();
    const { data } = await plattform.client
      .from('customers').select('id, name').eq('company_id', BETRIEB).single();
    const id = (data as { id: string }).id;

    await plattform.client.from('customers').update({ name: 'Umbenannt' }).eq('id', id);
    await plattform.client.from('customers').delete().eq('id', id);

    const { data: danach } = await admin
      .from('customers').select('name').eq('id', id).single();
    expect(danach).toEqual({ name: 'Familie Huber' });
  });
});

describe('Wer eine Freigabe geben darf', () => {
  it('lässt die Verwaltung nicht freigeben', async () => {
    // Einblick in den ganzen Betrieb zu gewähren ist eine Entscheidung der
    // Führung, nicht des Tagesgeschäfts.
    await expect(freigeben(4, verwaltung)).rejects.toThrow();
  });

  it('lässt niemanden im Namen eines anderen freigeben', async () => {
    const { error } = await chefin.client.from('support_freigaben').insert({
      company_id: BETRIEB, gewaehrt_von: verwaltung.uid,
      grund: 'untergeschoben', gilt_bis: inStunden(4),
    });
    expect(error).not.toBeNull();
  });

  it('lässt die Plattform sich selbst keine gewöhnliche Freigabe ausstellen', async () => {
    /*
      SONST WÄRE DER GANZE BAU EINE KULISSE. Der einzige Weg, den ein
      Plattformkonto ohne Zustimmung hat, ist der Notzugang — und der ist
      gekennzeichnet, befristet und steht im Protokoll des Betriebs.
    */
    const { error } = await plattform.client.from('support_freigaben').insert({
      company_id: BETRIEB, gewaehrt_von: plattform.uid,
      grund: 'selbst ausgestellt', gilt_bis: inStunden(4),
    });
    expect(error).not.toBeNull();
  });

  it('lässt die Plattform eine Freigabe nicht widerrufen oder verlängern', async () => {
    /*
      Die Schreibregel verlangt die Spitze DES BETRIEBS; das Plattformkonto
      fällt still durch (null Zeilen betroffen). Geprüft wird deshalb das
      Ergebnis: die Frist steht danach noch, und widerrufen ist nichts.
    */
    const id = await freigeben(4);
    await plattform.client
      .from('support_freigaben').update({ gilt_bis: inStunden(100) }).eq('id', id);
    await plattform.client
      .from('support_freigaben')
      .update({ widerrufen_am: new Date().toISOString() }).eq('id', id);

    const { data } = await admin
      .from('support_freigaben').select('widerrufen_am, gilt_bis').eq('id', id).single();
    const zeile = data as { widerrufen_am: string | null; gilt_bis: string };
    expect(zeile.widerrufen_am).toBeNull();
    expect(new Date(zeile.gilt_bis).getTime()).toBeLessThan(Date.now() + 5 * 3_600_000);
  });

  it('lässt einen fremden Betrieb nicht freigeben', async () => {
    await expect(freigeben(4, anderChef, BETRIEB)).rejects.toThrow();
  });
});

describe('Was an einer Freigabe feststeht', () => {
  it('weist eine Frist über sieben Tage ab', async () => {
    /*
      OHNE OBERGRENZE WÄRE DIE ERSTE FREIGABE „BIS 2099" DIE LETZTE. Aus dem
      befristeten Zugang würde wieder ein Dauerzugang, nur diesmal mit
      Protokoll.
    */
    await expect(freigeben(24 * 8)).rejects.toThrow(/höchstens/);
  });

  it('weist eine Frist in der Vergangenheit ab', async () => {
    await expect(freigeben(-1)).rejects.toThrow(/abgelaufen/);
  });

  it('weist eine Freigabe ohne Grund ab', async () => {
    const { error } = await chefin.client.from('support_freigaben').insert({
      company_id: BETRIEB, gewaehrt_von: chefin.uid, grund: '   ',
      gilt_bis: inStunden(4),
    });
    expect(error).not.toBeNull();
  });

  it('lässt den Grund nachträglich nicht ändern', async () => {
    // Ein Protokoll, dessen Begründung sich nachbessern lässt, ist eine
    // Erzählung.
    const id = await freigeben();
    const { error } = await chefin.client
      .from('support_freigaben').update({ grund: 'etwas ganz anderes' }).eq('id', id);
    expect(error?.message).toMatch(/nur der Widerruf/);
  });

  it('lässt die Frist nachträglich nicht verlängern', async () => {
    const id = await freigeben();
    const { error } = await chefin.client
      .from('support_freigaben').update({ gilt_bis: inStunden(6) }).eq('id', id);
    expect(error?.message).toMatch(/nur der Widerruf/);
  });

  it('lässt einen Widerruf nicht zurücknehmen', async () => {
    const id = await freigeben();
    await chefin.client.from('support_freigaben')
      .update({ widerrufen_am: new Date().toISOString(), widerrufen_von: chefin.uid })
      .eq('id', id);
    const { error } = await chefin.client
      .from('support_freigaben').update({ widerrufen_am: null }).eq('id', id);
    expect(error?.message).toMatch(/nicht zurücknehmen/);
  });
});

describe('Der Notzugang', () => {
  it('öffnet ohne Zustimmung — aber gekennzeichnet und befristet', async () => {
    /*
      EINE REIN EINVERNEHMLICHE LÖSUNG VERSAGT DORT, WOFÜR MAN SIE BRAUCHT:
      wer sich ausgesperrt hat, kann nichts mehr freigeben. Der Notzugang ist
      die benannte Ausnahme — nicht heimlich, sondern als solche im Protokoll
      des Betriebs.
    */
    const { data, error } = await plattform.client.rpc('support_notzugang', {
      p_company: BETRIEB, p_grund: 'Betrieb ausgesperrt, Administrator verloren', p_stunden: 4,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(await siehtKunden()).toBe(1);

    const { data: zeile } = await chefin.client
      .from('support_freigaben').select('notzugang, gewaehrt_von, grund').eq('id', data).single();
    expect(zeile).toMatchObject({ notzugang: true, gewaehrt_von: null });
  });

  it('lässt sich vom Betrieb widerrufen wie jede andere Freigabe', async () => {
    const { data: id } = await plattform.client.rpc('support_notzugang', {
      p_company: BETRIEB, p_grund: 'Ausgesperrt', p_stunden: 4,
    });
    await chefin.client.from('support_freigaben')
      .update({ widerrufen_am: new Date().toISOString(), widerrufen_von: chefin.uid })
      .eq('id', id);
    expect(await siehtKunden()).toBe(0);
  });

  it('gilt höchstens 24 Stunden', async () => {
    const { error } = await plattform.client.rpc('support_notzugang', {
      p_company: BETRIEB, p_grund: 'Ausgesperrt', p_stunden: 48,
    });
    expect(error?.message).toMatch(/zwischen einer und 24 Stunden/);
  });

  it('braucht einen Grund', async () => {
    const { error } = await plattform.client.rpc('support_notzugang', {
      p_company: BETRIEB, p_grund: '  ', p_stunden: 4,
    });
    expect(error?.message).toMatch(/braucht einen Grund/);
  });

  it('steht keinem Betriebskonto offen', async () => {
    // Sonst könnte sich ein Betrieb Zugang zu einem anderen verschaffen.
    const { error } = await chefin.client.rpc('support_notzugang', {
      p_company: ANDERER, p_grund: 'neugierig', p_stunden: 4,
    });
    expect(error?.message).toMatch(/nur die Plattform/);
  });
});

describe('Das Protokoll', () => {
  it('hält fest, wer wann welchen Bereich geöffnet hat — und der Betrieb liest es', async () => {
    const id = await freigeben();
    const melden = await plattform.client.from('support_zugriffe').insert({
      company_id: BETRIEB, freigabe_id: id, admin_uid: plattform.uid, bereich: 'Rechnungen',
    });
    expect(melden.error).toBeNull();

    const { data } = await chefin.client
      .from('support_zugriffe').select('bereich, admin_uid').eq('company_id', BETRIEB);
    expect(data).toEqual([{ bereich: 'Rechnungen', admin_uid: plattform.uid }]);
  });

  it('lässt sich nicht ändern und nicht löschen', async () => {
    /*
      ANGEHÄNGT WIRD, GEÄNDERT NIE. Ein Protokoll, das sich nachbessern lässt,
      beantwortet die Frage nicht, für die es da ist — und zwar gerade dann
      nicht, wenn sie gestellt wird.
    */
    const id = await freigeben();
    await plattform.client.from('support_zugriffe').insert({
      company_id: BETRIEB, freigabe_id: id, admin_uid: plattform.uid, bereich: 'Rechnungen',
    });

    const aendern = await plattform.client
      .from('support_zugriffe').update({ bereich: 'harmlos' }).eq('company_id', BETRIEB);
    const { data: danach } = await chefin.client
      .from('support_zugriffe').select('bereich').eq('company_id', BETRIEB);
    expect(aendern.error ?? danach).toEqual([{ bereich: 'Rechnungen' }]);

    await plattform.client.from('support_zugriffe').delete().eq('company_id', BETRIEB);
    const { data: nochDa } = await chefin.client
      .from('support_zugriffe').select('bereich').eq('company_id', BETRIEB);
    expect(nochDa).toHaveLength(1);
  });

  it('lässt sich ohne gültige Freigabe nicht beschreiben', async () => {
    const id = await freigeben();
    await admin.from('support_freigaben')
      .update({ widerrufen_am: new Date().toISOString() }).eq('id', id);
    const melden = await plattform.client.from('support_zugriffe').insert({
      company_id: BETRIEB, freigabe_id: id, admin_uid: plattform.uid, bereich: 'Rechnungen',
    });
    expect(melden.error).not.toBeNull();
  });
});

describe('Wie weit der Einblick reicht', () => {
  it('sieht keine Zeitbuchungen und keine Urlaube', async () => {
    /*
      DORT STEHEN KRANKEN- UND URLAUBSTAGE — Gesundheitsdaten im Sinne des
      Art. 9 DSGVO. Zu bleiben brauchen sie nicht eigens verschlossen werden:
      ihre Leseregeln verlangen die eigene Kennung oder eine Rolle, und ein
      Plattformkonto hat keine von beiden. Dass das so BLEIBT, hält diese
      Prüfung fest — sonst wäre es eine Eigenschaft, auf die sich niemand
      berufen kann.
    */
    await freigeben();
    const { data: uid } = await admin
      .from('users').select('id').eq('company_id', BETRIEB).limit(1).single();
    const { error: zeitFehler } = await admin.from('time_entries').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, user_id: (uid as { id: string }).id,
      date: '2026-04-01', status: 'Krank',
    });
    expect(zeitFehler).toBeNull();

    const zeiten = await plattform.client
      .from('time_entries').select('id').eq('company_id', BETRIEB);
    expect(zeiten.data ?? []).toEqual([]);

    const urlaube = await plattform.client
      .from('vacations').select('id').eq('company_id', BETRIEB);
    expect(urlaube.data ?? []).toEqual([]);

    // Die Gegenprobe: der Betrieb selbst sieht seine Buchung sehr wohl.
    const { data: eigene } = await chefin.client
      .from('time_entries').select('id').eq('company_id', BETRIEB);
    expect(eigene).toHaveLength(1);
    await admin.from('time_entries').delete().eq('company_id', BETRIEB);
  });

  it('sieht keine Fotos aus Kundenwohnungen', async () => {
    /*
      Sie entstehen in der Wohnung eines Kunden; wer sie ansieht, sieht mehr
      als eine Installation. Für die Fragen, mit denen ein Betrieb anruft,
      braucht es sie nicht — also sind sie zu.
    */
    await freigeben();
    const { data: wer } = await admin
      .from('users').select('id, name').eq('company_id', BETRIEB).limit(1).single();
    const { data: schein, error: scheinFehler } = await admin.from('work_sheets').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, project_number: 'B-1', customer_name: 'Huber',
      datum: '2026-04-01', status: 'Entwurf', abrechnung: 'Regie',
      erstellt_von_uid: (wer as { id: string }).id,
      erstellt_von_name: (wer as { name: string }).name,
    }).select('id').single();
    expect(scheinFehler).toBeNull();
    const { error: fotoFehler } = await admin.from('work_sheet_photos').insert({
      company_id: BETRIEB, work_sheet_id: (schein as { id: string }).id,
      pfad: 'perl/2026/foto.jpg', hash: 'abc', bytes: 1024,
      geraet_zeit: new Date().toISOString(),
    });
    expect(fotoFehler).toBeNull();

    const fotos = await plattform.client
      .from('work_sheet_photos').select('id').eq('company_id', BETRIEB);
    expect(fotos.data ?? []).toEqual([]);

    const { data: eigene } = await chefin.client
      .from('work_sheet_photos').select('id').eq('company_id', BETRIEB);
    expect(eigene).toHaveLength(1);

    await admin.from('work_sheet_photos').delete().eq('company_id', BETRIEB);
    await admin.from('work_sheets').delete().eq('company_id', BETRIEB);
  });

  it('sieht dagegen die Rechnungen — dafür ist der Zugang da', async () => {
    // Die Gegenprobe zum Ganzen: wäre auch das zu, wäre der Supportzugang
    // eine Kulisse.
    await freigeben();
    const { error } = await admin.from('invoices').insert({
      company_id: BETRIEB, invoice_number: 'RE-2026-9001', project_number: 'B-1',
      customer_name: 'Huber', invoice_date: '2026-04-01', due_date: '2026-04-15',
      total_netto: 100, total_vat: 20, total_brutto: 120, vat_rate: 0.2,
      payment_status: 'Offen',
    });
    expect(error).toBeNull();
    const { data } = await plattform.client
      .from('invoices').select('invoice_number').eq('company_id', BETRIEB);
    expect(data).toEqual([{ invoice_number: 'RE-2026-9001' }]);
    await admin.from('invoices').delete().eq('company_id', BETRIEB);
  });
});

describe('Welche Betriebe gerade Einblick gewähren', () => {
  it('nennt der Plattform nur die offenen Freigaben', async () => {
    await freigeben(4, chefin, BETRIEB);
    const { data, error } = await plattform.client.rpc('support_freigaben_offen');
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({
        company_id: BETRIEB, name: 'Perl Installationen', notzugang: false,
        grund: 'Rechnung RE-2026-0042 stimmt nicht',
      }),
    ]);
  });

  it('gibt einem Betriebskonto gar nichts heraus', async () => {
    // Sonst erführe jeder Betrieb, welche anderen Betriebe es gibt.
    await freigeben();
    const { data } = await chefin.client.rpc('support_freigaben_offen');
    expect(data).toEqual([]);
  });
});

describe('Was in einem Zugang angesehen wurde', () => {
  /*
    GEZÄHLT STATT AUFGEZÄHLT. Die Ansicht listete jeden einzelnen Aufruf; zwei
    Minuten Support ergaben vierzehn Zeilen, und nach einem halben Jahr liest
    die niemand mehr. Gezählt wird deshalb in der Datenbank — im Browser
    hiesse zählen: erst alle Zeilen holen, und genau die sind zu viele.
  */
  async function oeffnen(freigabe: string, bereich: string) {
    const { error } = await plattform.client.from('support_zugriffe').insert({
      company_id: BETRIEB, freigabe_id: freigabe, bereich,
    });
    if (error) throw new Error(error.message);
  }

  it('zählt je Bereich, statt jeden Aufruf einzeln zu nennen', async () => {
    const f = await freigeben();
    await oeffnen(f, 'Rechnungen');
    await oeffnen(f, 'Rechnungen');
    await oeffnen(f, 'Rechnungen');
    await oeffnen(f, 'Baustellen');

    const { data, error } = await chefin.client.rpc('support_bereiche', {
      p_company: BETRIEB,
    });
    expect(error).toBeNull();
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ freigabe_id: f, bereich: 'Rechnungen', anzahl: 3 }),
        expect.objectContaining({ freigabe_id: f, bereich: 'Baustellen', anzahl: 1 }),
      ]),
    );
    expect((data as unknown[]).length).toBe(2);
  });

  it('hält die Zahlen am Zugang fest, zu dem sie gehören', async () => {
    /*
      Zwei Zugänge nacheinander — der Betrieb muss unterscheiden können, was
      im Zugang „wegen der Rechnung" und was im Zugang von letzter Woche
      angesehen wurde. Eine Gesamtzahl über alles beantwortet seine Frage
      nicht.
    */
    const erster = await freigeben();
    await oeffnen(erster, 'Rechnungen');
    await plattform.client.from('support_zugriffe').select('id').limit(1);
    const { error: wf } = await chefin.client
      .from('support_freigaben')
      .update({ widerrufen_am: new Date().toISOString(), widerrufen_von: chefin.uid })
      .eq('id', erster);
    expect(wf).toBeNull();

    const zweiter = await freigeben();
    await oeffnen(zweiter, 'Benutzer');
    await oeffnen(zweiter, 'Benutzer');

    const { data } = await chefin.client.rpc('support_bereiche', { p_company: BETRIEB });
    const zeilen = data as Array<{ freigabe_id: string; bereich: string; anzahl: number }>;
    expect(zeilen.find((z) => z.freigabe_id === erster)).toMatchObject({
      bereich: 'Rechnungen', anzahl: 1,
    });
    expect(zeilen.find((z) => z.freigabe_id === zweiter)).toMatchObject({
      bereich: 'Benutzer', anzahl: 2,
    });
  });

  it('gibt einem fremden Betrieb nichts heraus', async () => {
    // Die Funktion laeuft mit den Rechten des Aufrufers: der Zeilenschutz auf
    // `support_zugriffe` bleibt in Kraft. Ohne diese Pruefung waere eine
    // `security definer`-Fassung ein Fenster in fremde Protokolle.
    const f = await freigeben();
    await oeffnen(f, 'Rechnungen');

    const { data } = await anderChef.client.rpc('support_bereiche', { p_company: BETRIEB });
    expect(data).toEqual([]);
  });
});

describe('Die Stufe „mitarbeiten"', () => {
  /*
    ZWEI STUFEN, WEIL ZWEI FÄLLE. „Die Rechnung stimmt nicht — schauen Sie
    bitte nach" ist der eine; „können Sie das bitte richtigstellen" der
    andere. Bis zum 21.09.2026 gab es nur den ersten, und die vier Listen
    ohne Details beantworteten nicht einmal den.

    Was hier geprüft wird, ist die Kante zwischen beiden: eine Lesefreigabe
    darf durch die neue Tür NICHT hindurch, und eine Schreibfreigabe darf
    nicht mehr aufmachen als den einen Betrieb, für den sie gilt.
  */
  async function freigebenMit(stufe: string, stunden = 4, betrieb = BETRIEB, wer: Konto = chefin) {
    const { data, error } = await wer.client
      .from('support_freigaben')
      .insert({
        company_id: betrieb,
        gewaehrt_von: wer.uid,
        grund: 'Rechnung RE-2026-0042 stimmt nicht',
        gilt_bis: inStunden(stunden),
        stufe,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }

  /**
   * Eine Änderung, wie der Support sie im Ernstfall macht.
   *
   * GEPRÜFT WIRD DAS ERGEBNIS, NICHT DER FEHLER. Eine vom Zeilenschutz
   * abgewiesene Änderung trifft NULL Zeilen und meldet KEINEN Fehler — der
   * erste Anlauf dieser Prüfung hielt genau deshalb ein sauberes „nichts
   * passiert" für einen Erfolg. Gelesen wird über den Dienstzugang: was der
   * Support danach selbst sieht, ist die falsche Frage.
   */
  async function kundeUmbenennen(betrieb = BETRIEB) {
    const name = `Support ${crypto.randomUUID().slice(0, 8)}`;
    const { data } = await admin
      .from('customers').select('id').eq('company_id', betrieb).limit(1);
    const id = (data ?? [])[0]?.id as string | undefined;
    if (!id) throw new Error(`Kein Kunde in ${betrieb} — die Prüfung liefe ins Leere`);

    const { error } = await plattform.client
      .from('customers').update({ contact_name: name }).eq('id', id);

    const { data: danach } = await admin
      .from('customers').select('contact_name').eq('id', id).single();
    return {
      erreicht: (danach as { contact_name: string }).contact_name === name,
      fehler: error?.message ?? null,
    };
  }

  it('ist ab Werk „ansehen" — wer nichts sagt, gibt kein Schreibrecht', async () => {
    const id = await freigeben();
    const { data } = await admin.from('support_freigaben').select('stufe').eq('id', id).single();
    expect((data as { stufe: string }).stufe).toBe('ansehen');
  });

  it('lässt eine Lesefreigabe nach wie vor nichts ändern', async () => {
    /*
      OHNE FEHLERMELDUNG, UND DAS IST RICHTIG SO: hier weist schon die
      Richtlinie ab, und eine abgewiesene Änderung trifft null Zeilen, ohne
      etwas zu melden. Der Riegel dahinter kommt gar nicht mehr zum Zug. Wer
      hier eine Meldung erwartet, prüft den zweiten Türsteher und übersieht,
      dass der erste schon zugemacht hat.
    */
    await freigebenMit('ansehen');
    const { erreicht } = await kundeUmbenennen();
    expect(erreicht).toBe(false);
  });

  it('lässt eine Schreibfreigabe ändern', async () => {
    await freigebenMit('mitarbeiten');
    const { erreicht, fehler } = await kundeUmbenennen();
    expect(fehler).toBeNull();
    expect(erreicht).toBe(true);

    expect(fehler).toBeNull();
  });

  it('macht mit einer Schreibfreigabe NUR diesen einen Betrieb auf', async () => {
    /*
      DER GEFÄHRLICHSTE FALL DER GANZEN DATEI. `app.ist_spitze()` sagt bei
      einer Schreibfreigabe „ja", und zwar ohne Betrieb — die Rollenfunktionen
      der App kennen keinen. Dass daraus kein Generalschlüssel wird, hängt
      allein daran, dass JEDE Richtlinie daneben den Betrieb der Zeile prüft.
      Genau das steht hier auf dem Prüfstand.
    */
    await freigebenMit('mitarbeiten', 4, BETRIEB);
    const fremd = await kundeUmbenennen(ANDERER);
    expect(fremd.erreicht).toBe(false);
  });

  it('endet mit dem Widerruf, wie jede andere Freigabe auch', async () => {
    const id = await freigebenMit('mitarbeiten');
    await chefin.client
      .from('support_freigaben')
      .update({ widerrufen_am: new Date().toISOString(), widerrufen_von: chefin.uid })
      .eq('id', id);

    const { erreicht } = await kundeUmbenennen();
    expect(erreicht).toBe(false);
  });

  it('gilt höchstens 24 Stunden, nicht sieben Tage', async () => {
    // Eine Woche Schreibrecht ist kein Supportfall mehr, sondern ein zweiter
    // Administrator, den niemand auf der Gehaltsliste hat.
    await expect(freigebenMit('mitarbeiten', 48)).rejects.toThrow(/höchstens/);
    await expect(freigebenMit('ansehen', 48)).resolves.toBeTruthy();
  });

  it('lässt die Stufe nachträglich nicht anheben', async () => {
    // Sonst bezöge sich die Zustimmung des Betriebs auf etwas anderes als
    // das, was danach gilt.
    const id = await freigebenMit('ansehen');
    const { error } = await chefin.client
      .from('support_freigaben').update({ stufe: 'mitarbeiten' }).eq('id', id);
    expect(error?.message).toMatch(/nur der Widerruf/);
  });

  it('lässt einen Notzugang nicht schreiben', async () => {
    // Er läuft ohne Zustimmung. Schreibrechte ohne Zustimmung wären genau der
    // Generalschlüssel, den dieser ganze Bau vermeiden soll.
    const { error } = await plattform.client.rpc('support_notzugang', {
      p_company: BETRIEB, p_grund: 'Letzter Administrator ausgesperrt', p_stunden: 4,
    });
    expect(error).toBeNull();
    const { erreicht } = await kundeUmbenennen();
    expect(erreicht).toBe(false);
  });

  it('kommt auch mit Schreibfreigabe an Zeitbuchungen und Urlaube nicht heran', async () => {
    /*
      DIE GRENZE, DIE AUCH „MITARBEITEN" NICHT VERSCHIEBT. Dort stehen
      Kranken- und Urlaubstage (Art. 9 DSGVO) und Aufnahmen aus
      Kundenwohnungen. Lesen darf der Support sie ohnehin nicht — sie
      trotzdem schreibbar zu lassen hiesse: blind ändern können, was man
      nicht sehen darf.
    */
    await freigebenMit('mitarbeiten');
    const { error } = await plattform.client.from('time_entries').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, user_id: chefin.uid,
      date: '2026-09-21', status: 'Anwesend',
    });
    expect(error?.message).toMatch(/verschlossen/);

    const { error: u } = await plattform.client.from('vacations').insert({
      company_id: BETRIEB, user_id: chefin.uid, user_name: 'Chefin',
      von: '2026-10-01', bis: '2026-10-02', tage: 2, status: 'Offen',
    });
    expect(u?.message).toMatch(/verschlossen/);
  });
});
