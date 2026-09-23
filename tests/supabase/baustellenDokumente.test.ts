/**
 * Pläne und Dokumente an der Baustelle — gegen die echte Datenbank.
 *
 * GEMELDET: „Baustellen sollte man Dokumente oder Bilder hinzufügen können,
 * für Baupläne oder ähnliches, damit der Monteur Zugriff darauf hat — bei
 * seinen zugeteilten Baustellen."
 *
 * Geprüft wird die ganze Matrix, und zwar an BEIDEN Türen: an der Zeile in
 * `project_documents` und an der Datei im Eimer. Eine Regel, die nur an einer
 * der beiden steht, ist keine — das hat die Lücke bei den Scheinfotos gezeigt.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, plattformkonto, type Konto } from './helfer';
import * as dok from '@/lib/db/pg/baustellenDokumente';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'plan-a';
const ANDERER = 'plan-b';
const EIMER = 'baustellendokumente';

let chef: Konto;
let leitung: Konto;
let buch: Konto;
let verwaltung: Konto;
let imTeam: Konto;
let eingeteilt: Konto;
let unbeteiligt: Konto;
let fremd: Konto;
let plattform: Konto;

let baustelle: string;
let andereBaustelle: string;

const pdf = (name = 'Grundriss EG.pdf') =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], name, {
    type: 'application/pdf',
  });

async function baustelleAnlegen(betrieb: string, nummer: string, team: string[] = []) {
  const { data, error } = await admin.from('projects').insert({
    company_id: betrieb, project_number: nummer, customer_name: 'Familie Huber',
    status: 'Aktiv', assigned_employees: team,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Plan A');
  await betriebAnlegen(ANDERER, 'Plan B');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'plangf');
  leitung = await konto(BETRIEB, 'Projektleiter', 'planpl');
  buch = await konto(BETRIEB, 'Buchhaltung', 'planbu');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'planvw');
  imTeam = await konto(BETRIEB, 'Mitarbeiter', 'planteam');
  eingeteilt = await konto(BETRIEB, 'Mitarbeiter', 'planeinsatz');
  unbeteiligt = await konto(BETRIEB, 'Mitarbeiter', 'planandere');
  fremd = await konto(ANDERER, 'Geschäftsführung', 'planfremd');
  plattform = await plattformkonto('planplattform');

  baustelle = await baustelleAnlegen(BETRIEB, 'B-PLAN-1', [imTeam.uid]);
  andereBaustelle = await baustelleAnlegen(BETRIEB, 'B-PLAN-2');
  // Nur für einen Tag eingeteilt, nicht im Team — der Alltag der Tagesplanung.
  const { error } = await admin.from('assignments').insert({
    company_id: BETRIEB, date: '2026-09-24', project_number: 'B-PLAN-1', user_id: eingeteilt.uid,
  });
  if (error) throw new Error(error.message);
}, 180_000);

afterAll(async () => {
  clientEinreichen(null);
  const { data } = await admin.from('project_documents').select('pfad').eq('company_id', BETRIEB);
  const pfade = (data ?? []).map((d) => (d as { pfad: string }).pfad);
  if (pfade.length) await admin.storage.from(EIMER).remove(pfade);
  await admin.from('project_documents').delete().eq('company_id', BETRIEB);
  await admin.from('assignments').delete().eq('company_id', BETRIEB);
  await admin.from('projects').delete().in('company_id', [BETRIEB, ANDERER]);
  await admin.from('support_freigaben').delete().eq('company_id', BETRIEB);
});

/** Hochladen als `wer`, über denselben Weg wie die App. */
async function hochladen(wer: Konto, projekt = baustelle, datei = pdf()) {
  clientEinreichen(wer.client);
  return dok.dokumentHochladen(BETRIEB, projekt, datei, 'Test');
}

/** Sieht `wer` die Zeile UND kommt er an die Datei? */
async function sieht(wer: Konto, pfad: string): Promise<{ zeile: boolean; datei: boolean }> {
  const { data } = await wer.client.from('project_documents').select('id').eq('pfad', pfad);
  const laden = await wer.client.storage.from(EIMER).download(pfad);
  return { zeile: (data ?? []).length === 1, datei: !!laden.data && !laden.error };
}

describe('Wer hochlädt', () => {
  it('die Führung lädt hoch — Zeile und Datei entstehen zusammen', async () => {
    const d = await hochladen(chef);
    expect(d.pfad).toMatch(new RegExp(`^baustellen/${BETRIEB}/${baustelle}/[0-9a-f-]{36}\\.pdf$`));
    expect(d.dateiname).toBe('Grundriss EG.pdf');
    expect(d.mime).toBe('application/pdf');
    expect(await sieht(chef, d.pfad)).toEqual({ zeile: true, datei: true });

    const p = await hochladen(leitung);
    expect(await sieht(leitung, p.pfad)).toEqual({ zeile: true, datei: true });
  });

  it('der Monteur, die Buchhaltung und die Verwaltung laden nicht hoch', async () => {
    for (const wer of [imTeam, buch, verwaltung]) {
      await expect(hochladen(wer)).rejects.toThrow();
    }
  });

  it('nicht in eine Baustelle eines anderen Betriebs — und es bleibt keine Datei liegen', async () => {
    const fremdeBaustelle = await baustelleAnlegen(ANDERER, 'B-FREMD-1');
    clientEinreichen(chef.client);
    await expect(dok.dokumentHochladen(BETRIEB, fremdeBaustelle, pdf(), 'Test')).rejects.toThrow();
    const liste = await admin.storage.from(EIMER).list(`baustellen/${BETRIEB}/${fremdeBaustelle}`);
    expect(liste.data ?? []).toEqual([]);
  });

  it('nimmt nur PDF und Bilder, und höchstens 25 MB', () => {
    expect(dok.dateiPruefen({ name: 'plan.dwg', type: '', size: 10 })).toMatch(/nur PDF und Bilder/);
    expect(dok.dateiPruefen({ name: 'plan.pdf', type: '', size: 26 * 1024 * 1024 })).toMatch(/höchstens 25 MB/);
    expect(dok.dateiPruefen({ name: 'plan.PDF', type: '', size: 10 })).toBeNull();
    expect(dok.dateiPruefen({ name: 'foto.jpg', type: 'image/jpeg', size: 10 })).toBeNull();
  });

  it('der Eimer lehnt einen anderen Typ selbst ab — nicht nur die App', async () => {
    const { error } = await chef.client.storage.from(EIMER).upload(
      `baustellen/${BETRIEB}/${baustelle}/${crypto.randomUUID()}.txt`,
      new Blob(['hallo'], { type: 'text/plain' }),
      { contentType: 'text/plain' },
    );
    expect(error).not.toBeNull();
  });
});

describe('Wer die Pläne sieht', () => {
  let pfad: string;
  beforeAll(async () => {
    pfad = (await hochladen(chef)).pfad;
  });

  it('das Büro — Führung, Buchhaltung, Verwaltung', async () => {
    for (const wer of [chef, leitung, buch, verwaltung]) {
      expect(await sieht(wer, pfad)).toEqual({ zeile: true, datei: true });
    }
  });

  it('der Monteur im Team der Baustelle', async () => {
    expect(await sieht(imTeam, pfad)).toEqual({ zeile: true, datei: true });
  });

  it('der Monteur, der dort nur für einen Tag eingeteilt ist', async () => {
    expect(await sieht(eingeteilt, pfad)).toEqual({ zeile: true, datei: true });
  });

  it('NICHT der Monteur, der mit der Baustelle nichts zu tun hat', async () => {
    expect(await sieht(unbeteiligt, pfad)).toEqual({ zeile: false, datei: false });
    // Auch nicht über das Auflisten des Ordners.
    const liste = await unbeteiligt.client.storage.from(EIMER).list(`baustellen/${BETRIEB}/${baustelle}`);
    expect(liste.data ?? []).toEqual([]);
  });

  it('NICHT ein anderer Betrieb', async () => {
    expect(await sieht(fremd, pfad)).toEqual({ zeile: false, datei: false });
  });

  it('NICHT der Support — auch nicht mit Freigabe', async () => {
    const { error } = await chef.client.from('support_freigaben').insert({
      company_id: BETRIEB, gewaehrt_von: chef.uid, grund: 'Rechnung prüfen',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(error).toBeNull();
    expect(await sieht(plattform, pfad)).toEqual({ zeile: false, datei: false });
    // Die Gegenprobe, dass die Freigabe wirkt: Baustellen sieht er.
    const { data } = await plattform.client.from('projects').select('id').eq('company_id', BETRIEB);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('die Liste liefert jedem genau seine Pläne', async () => {
    await hochladen(chef, andereBaustelle);
    clientEinreichen(imTeam.client);
    const sichtbar = await dok.listDokumente(BETRIEB, [baustelle, andereBaustelle]);
    expect(new Set(sichtbar.map((d) => d.projectId))).toEqual(new Set([baustelle]));

    clientEinreichen(chef.client);
    const alle = await dok.listDokumente(BETRIEB, [baustelle, andereBaustelle]);
    expect(new Set(alle.map((d) => d.projectId))).toEqual(new Set([baustelle, andereBaustelle]));
  });

  it('gibt Adressen aus, unter denen sich die Datei öffnen lässt', async () => {
    clientEinreichen(eingeteilt.client);
    const adressen = await dok.dokumentAdressen([{ pfad }]);
    const url = adressen.get(pfad);
    expect(url).toBeTruthy();
    const antwort = await fetch(url!);
    expect(antwort.status).toBe(200);
  });
});

describe('Die Zeile passt zur Datei', () => {
  it('lässt keinen Pfad zu, der eine andere Baustelle nennt', async () => {
    const { error } = await chef.client.from('project_documents').insert({
      company_id: BETRIEB, project_id: baustelle,
      pfad: `baustellen/${BETRIEB}/${andereBaustelle}/x.pdf`,
      dateiname: 'x.pdf', mime: 'application/pdf', bytes: 10,
    });
    expect(error?.message).toMatch(/project_documents_pfad_passt/);
  });

  it('lässt eine Baustelle eines anderen Betriebs nicht zu', async () => {
    const fremdeBaustelle = await baustelleAnlegen(ANDERER, 'B-FREMD-2');
    const { error } = await chef.client.from('project_documents').insert({
      company_id: BETRIEB, project_id: fremdeBaustelle,
      pfad: `baustellen/${BETRIEB}/${fremdeBaustelle}/x.pdf`,
      dateiname: 'x.pdf', mime: 'application/pdf', bytes: 10,
    });
    expect(error).not.toBeNull();
  });
});

describe('Löschen', () => {
  it('darf der Monteur nicht — weder Zeile noch Datei', async () => {
    const d = await hochladen(chef);
    clientEinreichen(imTeam.client);
    await expect(dok.dokumentLoeschen(d)).rejects.toThrow();
    await imTeam.client.storage.from(EIMER).remove([d.pfad]);
    expect(await sieht(chef, d.pfad)).toEqual({ zeile: true, datei: true });
  });

  it('nimmt Zeile und Datei zusammen weg', async () => {
    const d = await hochladen(chef);
    clientEinreichen(leitung.client);
    expect(await dok.dokumentLoeschen(d)).toEqual({ dateiBlieb: false });
    expect(await sieht(chef, d.pfad)).toEqual({ zeile: false, datei: false });
  });

  it('eine Baustelle mit Plänen lässt sich nicht löschen', async () => {
    /*
      Die Zeilen mitzulöschen liesse die Dateien im Speicher zurück, ohne
      dass je wieder jemand sie findet.
    */
    const { error } = await chef.client.from('projects').delete().eq('id', baustelle);
    expect(error?.message).toMatch(/project_documents|foreign key/);
  });
});

describe('Die Sicherung', () => {
  it('nimmt die Pläne mit hinaus', async () => {
    const d = await hochladen(chef);
    const { data, error } = await admin.rpc('sicherungs_dateien', { p_betrieb: BETRIEB, p_grenze: 1000 });
    expect(error).toBeNull();
    expect((data as { eimer: string; pfad: string }[]).some(
      (z) => z.eimer === EIMER && z.pfad === d.pfad,
    )).toBe(true);
  });
});
