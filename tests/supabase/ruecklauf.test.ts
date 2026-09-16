/**
 * DER DURCHSTICH, DER DIE SICHERUNG ERST ZU EINER MACHT.
 *
 * Bis hierher gab es den Weg hinaus — nächtliche Ausleitung, Eimer ausser
 * Haus — und keinen zurück. Das heisst im Klartext: niemand wusste, ob die
 * abgelegten Dateien überhaupt etwas taugen. Eine Sicherung, die nie
 * zurückgespielt wurde, ist keine.
 *
 * Diese Prüfung geht den ganzen Weg, und zwar mit den ECHTEN Teilen:
 *
 *   1. Ein Betrieb mit Daten wird angelegt.
 *   2. Die echte Edge Function leitet ihn aus — dieselbe, die nachts läuft.
 *   3. Die Datei wird aus dem Speicher geholt, so wie ein Mensch sie holte.
 *   4. Der Betrieb wird GELÖSCHT. Vollständig, samt Anmeldekonten.
 *   5. Das echte Werkzeug `scripts/ruecklauf.mjs` spielt ihn zurück.
 *   6. Verglichen wird, was danach dasteht.
 *
 * Nichts davon ist nachgebildet. Genau deshalb beantwortet es die Frage, die
 * keine Rechenprüfung beantworten kann: kommt der Betrieb wieder?
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admin, API, ANON, SERVICE, betriebAnlegen, konto, buchung, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';

const lauf = promisify(execFile);
const BETRIEB = 'ruecklauf';

let chef: Konto;
let monteur: Konto;

/**
 * Alles eines Betriebs löschen — in Runden, weil die Fremdschlüssel eine
 * Reihenfolge erzwingen, die sich hier niemand merken will.
 */
async function betriebLoeschen(betrieb: string, tabellen: string[]): Promise<void> {
  let offen = [...tabellen];
  while (offen.length > 0) {
    const gescheitert: string[] = [];
    for (const t of offen) {
      const { error } = await admin.from(t).delete().eq('company_id', betrieb);
      if (error) gescheitert.push(t);
    }
    if (gescheitert.length === offen.length) {
      throw new Error(`Aufräumen kam nicht weiter: ${gescheitert.join(', ')}`);
    }
    offen = gescheitert;
  }
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Rücklauf GmbH');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'monteur');

  // Etwas Bestand, der über mehrere Tabellen und über einen Fremdschlüssel
  // hinweg zusammenhängt — sonst prüfte der Rücklauf nur flache Zeilen.
  const { data: kunde } = await admin.from('customers')
    .insert({ company_id: BETRIEB, name: 'Familie Huber', address: 'Hauptstrasse 1' })
    .select('id').single();
  await admin.from('projects').insert({
    company_id: BETRIEB, project_number: 'R-2026-001', customer_id: kunde!.id,
    customer_name: 'Familie Huber', status: 'Aktiv',
  });
  await admin.from('time_entries').insert([
    { ...buchung(monteur, '2026-09-01'), project_number: 'R-2026-001' },
    { ...buchung(monteur, '2026-09-02'), status: 'Urlaub' },
  ]);
}, 180_000);

afterAll(() => clientEinreichen(null));

describe('Aus der Sicherung wird wieder ein Betrieb', () => {
  it('geht den ganzen Weg: ausleiten, löschen, zurückspielen', async () => {
    /*
      1. WAS DER BETRIEB HAT — gemessen VOR der Ausleitung.

      Die Reihenfolge ist kein Zufall. Die Ausleitung hält ihren EIGENEN Lauf
      in `system_laeufe` fest, und zwar NACH dem Schreiben der Datei; die
      Datei kann diesen Eintrag also gar nicht enthalten. Wer erst danach
      misst, vergleicht den Rücklauf gegen eine Zeile, die es beim Ausleiten
      noch nicht gab — und hält ein richtiges Ergebnis für falsch. Genau
      darüber bin ich beim ersten Lauf gestolpert.
    */
    const tabellen = (await admin.rpc('auszug_tabellen')).data as string[];
    const vorher: Record<string, number> = {};
    for (const t of tabellen) {
      const { count } = await admin.from(t).select('*', { count: 'exact', head: true })
        .eq('company_id', BETRIEB);
      if (count) vorher[t] = count;
    }
    expect(Object.keys(vorher).length).toBeGreaterThan(2);

    /*
      2. Ausleiten — mit dem Token eines Menschen, also der Knopf aus den
      Einstellungen, nicht der Nachtlauf.

      `apikey` ist der ÖFFENTLICHE Schlüssel, so wie der Browser ihn schickt.
      Mit dem Dienstschlüssel darin gälte der Aufruf als Maschine, und die
      Function nähme den Nachtlauf-Weg über alle Betriebe — der antwortet
      ohne `pfad`, weil er nicht EINEN Stand schreibt. Genau darüber bin ich
      beim ersten Lauf gestolpert.
    */
    const antwort = await fetch(`${API}/functions/v1/daten-ausleitung`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${chef.token}` },
    });
    expect(antwort.status).toBe(200);
    const bilanz = await antwort.json();
    expect(bilanz.zeilen).toBeGreaterThan(0);

    /* 3. Die Datei holen, so wie ein Mensch sie aus dem Eimer holte. */
    const { data: blob, error: holFehler } = await admin.storage
      .from('ausleitung').download(bilanz.pfad);
    expect(holFehler).toBeNull();
    const inhalt = await blob!.text();
    expect(inhalt).toContain('"sammlung":"companies"');

    /* 4. DEN BETRIEB LÖSCHEN. Der Ernstfall, nachgestellt. */
    await betriebLoeschen(BETRIEB, tabellen);
    for (const uid of [chef.uid, monteur.uid]) await admin.auth.admin.deleteUser(uid);
    await admin.from('companies').delete().eq('id', BETRIEB);
    const { count: weg } = await admin.from('customers')
      .select('*', { count: 'exact', head: true }).eq('company_id', BETRIEB);
    expect(weg).toBe(0);

    /* 5. Zurückspielen — mit dem echten Werkzeug, als eigener Vorgang. */
    const datei = join(mkdtempSync(join(tmpdir(), 'ruecklauf-')), 'stand.jsonl');
    writeFileSync(datei, inhalt);
    const { stdout } = await lauf('node', ['scripts/ruecklauf.mjs', datei, '--schreiben'], {
      env: { ...process.env, RUECKLAUF_URL: API, RUECKLAUF_DIENSTSCHLUESSEL: SERVICE },
      cwd: process.cwd(),
    });
    expect(stdout).toContain('Fertig.');

    /* 6. Und nun der Vergleich. */
    for (const [t, anzahl] of Object.entries(vorher)) {
      const { count } = await admin.from(t).select('*', { count: 'exact', head: true })
        .eq('company_id', BETRIEB);
      expect(count, `Tabelle ${t}`).toBe(anzahl);
    }

    // Nicht nur die Anzahl: der Inhalt muss stimmen, sonst hätte auch eine
    // Handvoll leerer Zeilen bestanden.
    const [firma] = (await admin.from('companies').select('name').eq('id', BETRIEB)).data!;
    expect(firma.name).toBe('Rücklauf GmbH');
    const [baustelle] = (await admin.from('projects')
      .select('project_number, customer_name, customer_id').eq('company_id', BETRIEB)).data!;
    expect(baustelle.project_number).toBe('R-2026-001');
    // Der Fremdschlüssel zeigt wieder auf einen Kunden, den es gibt.
    const { count: kundeDa } = await admin.from('customers')
      .select('*', { count: 'exact', head: true }).eq('id', baustelle.customer_id);
    expect(kundeDa).toBe(1);
  }, 240_000);

  it('legt die Anmeldekonten unter DERSELBEN Kennung wieder an', async () => {
    /*
      Der Punkt, an dem ein Rücklauf sonst scheitert. Die Konten stehen NICHT
      in der Sicherung — sie tragen kein `company_id` und fallen aus der
      Ausleitung heraus. Bekämen sie beim Wiederanlauf neue Kennungen, zeigte
      jede Zeiteintragung, jeder Schein und jede Zuordnung ins Leere.
    */
    const { data } = await admin.auth.admin.listUsers();
    const wieder = data.users.filter((u) => u.app_metadata?.company_id === BETRIEB);
    expect(wieder.map((u) => u.id).sort()).toEqual([chef.uid, monteur.uid].sort());

    // Und mit den richtigen Ansprüchen — daran hängt der ganze Zeilenschutz.
    const chefWieder = wieder.find((u) => u.id === chef.uid);
    expect(chefWieder?.app_metadata?.role).toBe('Geschäftsführung');

    // Die Buchungen zeigen wieder auf einen Menschen, den es gibt.
    const { data: zeiten } = await admin.from('time_entries')
      .select('user_id').eq('company_id', BETRIEB);
    expect(zeiten!.every((z) => z.user_id === monteur.uid)).toBe(true);
  });
});
