/**
 * Testbericht 30.09.2026, Paket 7d — Lehrlinge in der Datenbank (4.1).
 *
 *   1  Einstufung an der Person, beim Lehrling mit Lehrbeginn und Lehrzeit.
 *   2  Sätze je Stufe haben eine feste Form; die Kosten je Stufe laufen über
 *      den Einlass und bleiben, wenn eine ältere App sie nicht mitschickt.
 *   3  Den Satz einer Buchung setzt die Datenbank aus der Einstufung — offene
 *      Buchungen ziehen nach, verrechnete behalten ihren.
 *   4  Berufsschule nur über `berufsschule_eintragen`, nur bei Lehrlingen,
 *      ganztägig, in der Monatssicht und im Wochenplan.
 *
 * Gegenproben stehen jeweils daneben: ein Monteur ohne Einstufung bleibt
 * Facharbeiter, ein Nicht-Lehrling bekommt keine Berufsschule, das Büro darf
 * weiter zurück eintragen als der Lehrling selbst.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';

const BETRIEB = 'lehrlinge-7d';
let lehrling: Konto;
let monteur: Konto;
let buero: Konto;
let chefin: Konto;

async function satzVon(id: string): Promise<string | null> {
  const { data, error } = await admin.from('time_entries').select('satz').eq('id', id).single();
  if (error) throw new Error(error.message);
  return (data as { satz: string | null }).satz;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  lehrling = await konto(BETRIEB, 'Mitarbeiter', 'lehrl');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'mont7d');
  buero = await konto(BETRIEB, 'Buchhaltung', 'buero7d');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'gf7d');
  const { error } = await admin.from('users')
    .update({ einstufung: 'lehrling', lehrbeginn: '2098-09-01', lehrzeit_monate: 36 })
    .eq('id', lehrling.uid);
  if (error) throw new Error(error.message);
  await admin.from('companies').update({ wochenplan_fuer_alle: true }).eq('id', BETRIEB);
}, 60_000);

describe('1 — die Einstufung hat eine feste Form', () => {
  it('ein Lehrling ohne Lehrbeginn: abgewiesen', async () => {
    const { error } = await admin.from('users')
      .update({ einstufung: 'lehrling', lehrbeginn: null, lehrzeit_monate: 36 }).eq('id', monteur.uid);
    expect(error?.message).toMatch(/users_lehre_vollstaendig/);
  });

  it('eine Lehrzeit über vier Jahre: abgewiesen', async () => {
    const { error } = await admin.from('users')
      .update({ einstufung: 'lehrling', lehrbeginn: '2098-09-01', lehrzeit_monate: 60 }).eq('id', monteur.uid);
    expect(error?.message).toMatch(/users_lehre_vollstaendig/);
  });

  it('ein Lehrbeginn ohne Lehrling: abgewiesen — er lebte sonst unsichtbar weiter', async () => {
    const { error } = await admin.from('users')
      .update({ einstufung: 'helfer', lehrbeginn: '2098-09-01' }).eq('id', monteur.uid);
    expect(error?.message).toMatch(/users_lehre_vollstaendig/);
  });

  it('eine unbekannte Einstufung: abgewiesen', async () => {
    const { error } = await admin.from('users').update({ einstufung: 'techniker' }).eq('id', monteur.uid);
    expect(error?.message).toMatch(/users_einstufung_wert/);
  });

  it('der Lehrling ändert seine Einstufung nicht selbst', async () => {
    await lehrling.client.from('users')
      .update({ einstufung: 'facharbeiter', lehrbeginn: null, lehrzeit_monate: null }).eq('id', lehrling.uid);
    const { data } = await admin.from('users').select('einstufung').eq('id', lehrling.uid).single();
    expect((data as { einstufung: string }).einstufung).toBe('lehrling');
  });
});

describe('3 — den Satz setzt die Datenbank', () => {
  it('der Lehrling im 2. Lehrjahr bucht zum Satz lj2 — auch wenn die App etwas anderes schickt', async () => {
    const zeile = buchung(lehrling, '2099-11-02', { satz: 'facharbeiter' });
    expect((await lehrling.client.from('time_entries').insert(zeile)).error).toBeNull();
    expect(await satzVon(zeile.id)).toBe('lj2');
  });

  it('Gegenprobe: ohne Einstufung Facharbeiter, wie bisher', async () => {
    const zeile = buchung(monteur, '2099-11-02');
    expect((await monteur.client.from('time_entries').insert(zeile)).error).toBeNull();
    expect(await satzVon(zeile.id)).toBe('facharbeiter');
  });

  it('das Lehrjahr folgt dem Tag der Buchung', async () => {
    const zeile = buchung(lehrling, '2098-10-06');
    expect((await lehrling.client.from('time_entries').insert(zeile)).error).toBeNull();
    expect(await satzVon(zeile.id)).toBe('lj1');
  });

  it('offene Buchungen ziehen nach, verrechnete behalten ihren Satz', async () => {
    const helfer = await konto(BETRIEB, 'Mitarbeiter', 'wechsel');
    const offen = buchung(helfer, '2099-11-03');
    const verrechnet = buchung(helfer, '2099-11-04', { is_billed: true, invoice_number: 'RE-7D' });
    expect((await admin.from('time_entries').insert([offen, verrechnet])).error).toBeNull();
    expect(await satzVon(offen.id)).toBe('facharbeiter');

    const { error } = await chefin.client.from('users').update({ einstufung: 'helfer' }).eq('id', helfer.uid);
    expect(error).toBeNull();
    expect(await satzVon(offen.id)).toBe('helfer');
    expect(await satzVon(verrechnet.id)).toBe('facharbeiter');
  });
});

describe('2 — Sätze je Stufe', () => {
  it('eine unbekannte Stufe im Verrechnungssatz: abgewiesen', async () => {
    const { error } = await admin.from('companies')
      .update({ rates: { fach: 70, helper: 48, stufen: { lj5: 10 } } }).eq('id', BETRIEB);
    expect(error?.message).toMatch(/companies_stufensaetze/);
  });

  it('ein negativer Satz: abgewiesen; 0 heisst „nicht verrechnet“ und ist erlaubt', async () => {
    const falsch = await admin.from('companies')
      .update({ rates: { fach: 70, helper: 48, stufen: { lj1: -1 } } }).eq('id', BETRIEB);
    expect(falsch.error?.message).toMatch(/companies_stufensaetze/);
    const richtig = await admin.from('companies')
      .update({ rates: { fach: 70, helper: 48, stufen: { lj1: 0, obermonteur: 78 } } }).eq('id', BETRIEB);
    expect(richtig.error).toBeNull();
  });

  it('Kosten je Stufe laufen über den Einlass und bleiben, wenn eine ältere App sie nicht schickt', async () => {
    const lesen = async () => {
      const { data } = await chefin.client.from('betrieb_kostensaetze').select('fach, stufen').single();
      return data as { fach: number; stufen: Record<string, number> | null };
    };
    expect((await chefin.client.from('companies')
      .update({ cost_rates: { fach: 40, helper: 26, stufen: { lj1: 12 } } }).eq('id', BETRIEB)).error).toBeNull();
    expect((await lesen()).stufen).toEqual({ lj1: 12 });

    expect((await chefin.client.from('companies')
      .update({ cost_rates: { fach: 41, helper: 26 } }).eq('id', BETRIEB)).error).toBeNull();
    const danach = await lesen();
    expect(Number(danach.fach)).toBe(41);
    expect(danach.stufen).toEqual({ lj1: 12 });
  });
});

describe('4 — Berufsschule', () => {
  it('nicht an der Funktion vorbei', async () => {
    const { error } = await lehrling.client.from('time_entries')
      .insert(buchung(lehrling, '2099-11-09', { status: 'Berufsschule', start_time: null, end_time: null, break_duration: 0 }));
    expect(error?.message).toMatch(/Berufsschule wird über „Berufsschule eintragen“ erfasst/);
  });

  it('der Lehrling trägt einen Blocklehrgang ein — Mo bis Fr, fünf Tage', async () => {
    const { data, error } = await lehrling.client.rpc('berufsschule_eintragen', {
      p_user: null, p_von: '2099-11-16', p_bis: '2099-11-22', p_notiz: null,
    });
    expect(error).toBeNull();
    expect(data).toEqual({ tage: 5, angelegt: 5, uebersprungen: 0 });
  });

  it('ein zweites Mal legt nichts doppelt an', async () => {
    const { data } = await lehrling.client.rpc('berufsschule_eintragen', {
      p_user: null, p_von: '2099-11-16', p_bis: '2099-11-20', p_notiz: null,
    });
    expect(data).toEqual({ tage: 5, angelegt: 0, uebersprungen: 5 });
  });

  it('Gegenprobe: ein Monteur ohne Lehre bekommt keine Berufsschule', async () => {
    const { error } = await monteur.client.rpc('berufsschule_eintragen', {
      p_user: null, p_von: '2099-11-23', p_bis: '2099-11-23', p_notiz: null,
    });
    expect(error?.message).toMatch(/nur bei Lehrlingen/);
  });

  it('für jemand anderen trägt das Büro ein, nicht der Kollege', async () => {
    const kollege = await monteur.client.rpc('berufsschule_eintragen', {
      p_user: lehrling.uid, p_von: '2099-11-23', p_bis: '2099-11-23', p_notiz: null,
    });
    expect(kollege.error?.message).toMatch(/trägt das Büro ein/);
    const vomBuero = await buero.client.rpc('berufsschule_eintragen', {
      p_user: lehrling.uid, p_von: '2099-11-23', p_bis: '2099-11-23', p_notiz: 'Nachtrag',
    });
    expect(vomBuero.error).toBeNull();
  });

  it('selbst höchstens 14 Tage zurück — das Büro weiter', async () => {
    const selbst = await lehrling.client.rpc('berufsschule_eintragen', {
      p_user: null, p_von: '2026-01-05', p_bis: '2026-01-05', p_notiz: null,
    });
    expect(selbst.error?.message).toMatch(/Selbst eintragen geht bis 14 Tage zurück/);
    const buerosache = await buero.client.rpc('berufsschule_eintragen', {
      p_user: lehrling.uid, p_von: '2099-01-05', p_bis: '2099-01-05', p_notiz: null,
    });
    expect(buerosache.error).toBeNull();
  });

  it('gilt für den ganzen Tag — daneben keine Arbeitszeit', async () => {
    const { error } = await lehrling.client.from('time_entries').insert(buchung(lehrling, '2099-11-17'));
    expect(error?.message).toMatch(/„Berufsschule“ eingetragen|„Berufsschule"/);
  });

  it('wird nicht umgebaut, aber gelöscht', async () => {
    const { data } = await admin.from('time_entries').select('id')
      .eq('user_id', lehrling.uid).eq('date', '2099-11-20').single();
    const id = (data as { id: string }).id;
    const umbau = await lehrling.client.from('time_entries').update({ status: 'Anwesend' }).eq('id', id);
    expect(umbau.error?.message).toMatch(/nicht geändert/);
    const weg = await lehrling.client.from('time_entries').delete().eq('id', id);
    expect(weg.error).toBeNull();
  });

  it('die Monatssicht zählt die Berufsschultage', async () => {
    const { data } = await admin.from('monthly_stats').select('berufsschule_tage, anwesend_min')
      .eq('user_id', lehrling.uid).eq('monat', '2099-11').single();
    // 16.–19. (der 20. ist gelöscht) und der 23.; gearbeitet am 02.11.
    expect(Number((data as { berufsschule_tage: number }).berufsschule_tage)).toBe(5);
  });

  it('im Wochenplan: für die Leitung „Berufsschule“, für die Kollegen „abwesend“', async () => {
    const woche = { p_von: '2099-11-16', p_bis: '2099-11-22' };
    const leitung = await buero.client.rpc('wochenplan_abwesend', woche);
    const kollegen = await monteur.client.rpc('wochenplan_abwesend', woche);
    const fuer = (d: unknown) => (d as { user_id: string; grund: string | null }[])
      .filter((z) => z.user_id === lehrling.uid);
    expect(fuer(leitung.data).length).toBe(4);
    expect(fuer(leitung.data).every((z) => z.grund === 'Berufsschule')).toBe(true);
    expect(fuer(kollegen.data).length).toBe(4);
    expect(fuer(kollegen.data).every((z) => z.grund === null)).toBe(true);
  });
});
