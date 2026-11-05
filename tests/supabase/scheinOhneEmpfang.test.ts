/**
 * DER HANDWERKSSCHEIN ÜBERSTEHT DAS FUNKLOCH (E49, 05.11.2026) — durch die
 * ganze Kette, gegen die echte Datenbank und den echten Speicher.
 *
 * Bis hierher liefen Speichern und Unterschreiben als direkter Aufruf an den
 * Server (Prüflauf 25.09.2026, P1-14): im Keller ohne Empfang ließ sich der
 * Schein weder sichern noch unterschreiben. Jetzt geht jeder Schritt über das
 * Ausgangsfach — Anlegen, Foto, Fotoliste, Unterschrift —, je ein Vorgang, in
 * der Reihenfolge, in der er entstand.
 *
 * Geprüft wird der WEG, nicht die Mechanik: von den Funktionen, die die Maske
 * ruft, bis zur Zeile in Postgres und zur Datei im Eimer. Das Funkloch ist
 * echt (ein Client auf Port 1), damit die Einordnung der Fehler mitläuft.
 *
 * Gegenprobe: mit Sender und Datenschicht von `main` scheitert schon das
 * Anlegen im Funkloch mit einem Fehler, statt vorgemerkt zu werden, und ein
 * zweites Zustellen derselben Unterschrift gilt als abgelehnt.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, ANON, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { ausgangsfachKonto, lagerEinreichen, nachsendenJetzt } from '@/lib/db/pg/ohneEmpfang';
import { beiVormerkungFehlgeschlagen, type Lager, type Sendung, type Vormerkung } from '@/lib/sync/ausgangsfach';
import { supabaseSender } from '@/lib/sync/supabaseSender';
import {
  createWorkSheet, fotosAmEntwurf, getWorkSheet, signWorkSheet, updateWorkSheetDraft,
  type NewWorkSheet,
} from '@/lib/db/pg/workSheets';
import { fotoHochladen } from '@/lib/db/pg/scheinFotos';

const BETRIEB = 'schein-funkloch';
let monteur: Konto;

function lagerImKopf(): Lager & { inhalt: () => Vormerkung[] } {
  let zeilen: Vormerkung[] = [];
  let zaehler = 0;
  return {
    inhalt: () => [...zeilen].sort((a, b) => a.folge - b.folge),
    async alle() { return [...zeilen]; },
    async ablegen(v) { zaehler += 1; zeilen.push({ ...v, folge: zaehler }); return zaehler; },
    async entfernen(folge) { zeilen = zeilen.filter((x) => x.folge !== folge); },
    async ersetzen(v) { zeilen = zeilen.map((x) => (x.folge === v.folge ? v : x)); },
  };
}

/**
 * Ein vorgemerkter Vorgang stößt sofort einen Nachsendelauf an; im Funkloch
 * scheitert er gleich. Erst wenn er durch ist, gehört der nächste Lauf dem
 * Client mit Netz — sonst bekäme der Test den laufenden zurück.
 */
async function funklochAbwarten() {
  await nachsendenJetzt(imFunkloch);
}

/** Ein Client, der ins Leere zeigt: Port 1 nimmt niemand entgegen. */
const imFunkloch = createClient('http://127.0.0.1:1', ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const bild = (inhalt: string) => new Blob([`${inhalt}-${crypto.randomUUID()}`], { type: 'image/jpeg' });

const inhalt = (): NewWorkSheet => ({
  projectNumber: 'FL-1',
  customerName: 'Familie Keller',
  address: 'Kellergasse 1',
  datum: '2026-11-05',
  status: 'Entwurf',
  abrechnung: 'Regie',
  zeiten: [{ datum: '2026-11-05', mitarbeiter: 'Funk Monteur', von: '07:00', bis: '09:00', pauseMin: 0, minuten: 120 }],
  material: [{ name: 'Dichtung', menge: 2, einheit: 'Stk' }],
  notizen: 'Im Keller ohne Empfang',
  erstelltVonUid: monteur.uid,
  erstelltVonName: 'Funk Monteur',
});

const monteurUnterschrift = { name: 'Funk Monteur', bild: 'data:image/png;base64,AAAA', geraetZeit: 1_778_000_000_000 };
const kundeUnterschrift = { name: 'Frau Keller', bild: 'data:image/png;base64,BBBB', geraetZeit: 1_778_000_000_000 };

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'schein-funk');
  ausgangsfachKonto(null);
}, 180_000);

afterEach(() => beiVormerkungFehlgeschlagen(null));

afterAll(async () => {
  clientEinreichen(null);
  lagerEinreichen(null);
  await admin.from('work_sheets').delete().eq('company_id', BETRIEB).eq('status', 'Entwurf');
});

describe('Ein Handwerksschein im Funkloch geht nicht verloren', () => {
  it('Anlegen, Foto und Unterschrift werden vorgemerkt und kommen in dieser Reihenfolge an', async () => {
    const fach = lagerImKopf();
    lagerEinreichen(fach);

    // 1. Im Keller: der Server ist nicht erreichbar.
    clientEinreichen(imFunkloch);
    const id = await createWorkSheet(BETRIEB, inhalt());
    const foto = await fotoHochladen(BETRIEB, id, bild('keller'), 1_778_000_000_000);
    await fotosAmEntwurf(id, [foto]);
    await signWorkSheet(id, monteurUnterschrift, kundeUnterschrift);

    expect(fach.inhalt().map((v) => `${v.tabelle}:${v.art}`)).toEqual([
      'work_sheets:aufruf', 'scheinfotos:hochladen', 'work_sheets:aufruf', 'work_sheets:aufruf',
    ]);
    const vorher = await admin.from('work_sheets').select('id').eq('id', id);
    expect(vorher.data ?? []).toHaveLength(0);
    await funklochAbwarten();

    // 2. Wieder Empfang.
    clientEinreichen(monteur.client);
    const bericht = await nachsendenJetzt(monteur.client);
    expect(bericht).toEqual({ gesendet: 4, abgelehnt: 0, offen: 0 });

    const schein = await getWorkSheet(id);
    expect(schein?.status).toBe('Unterschrieben');
    expect(schein?.erstelltVonUid).toBe(monteur.uid);
    expect(schein?.zeiten).toHaveLength(1);
    expect(schein?.material).toEqual([{ name: 'Dichtung', menge: 2, einheit: 'Stk' }]);
    expect(schein?.fotos?.map((f) => f.pfad)).toEqual([foto.pfad]);
    // Die Gerätezeit der Unterschrift bleibt die im Keller, nicht die der Übertragung.
    expect(schein?.unterschriften?.kunde?.geraetZeit).toBe(kundeUnterschrift.geraetZeit);

    const datei = await admin.storage.from('scheinfotos').download(foto.pfad);
    expect(datei.error).toBeNull();
    expect((await datei.data!.text()).startsWith('keller-')).toBe(true);

    // Die Prüfsumme setzt der Server beim Eintreffen der Unterschrift — über Inhalt und Foto.
    const kopf = await admin.from('work_sheets').select('inhalt_hash').eq('id', id).single();
    expect(kopf.data?.inhalt_hash).toMatch(/^[0-9a-f]{64}$/);
  }, 120_000);

  it('dieselbe Unterschrift zweimal zugestellt ist kein Verlust, eine andere wird abgelehnt', async () => {
    /*
      Kam die erste Zustellung an, ging aber die Antwort im Funkloch verloren,
      sendet das Fach sie noch einmal. Der Schein ist dann schon eingefroren,
      und die Datenbank weist jedes Ändern ab — ohne diese Prüfung meldete die
      App einen unterschriebenen Schein als verloren.
    */
    lagerEinreichen(null);
    clientEinreichen(monteur.client);
    const id = await createWorkSheet(BETRIEB, inhalt());
    const sender = supabaseSender(monteur.client);
    const sendung: Sendung = {
      tabelle: 'work_sheets', art: 'aufruf', zeile: id, versuche: 0, angelegt: Date.now(),
      daten: { funktion: 'schein_unterschreiben', parameter: { p_id: id, p_monteur: monteurUnterschrift, p_kunde: kundeUnterschrift } },
    };
    expect(await sender(sendung)).toEqual({ art: 'ok' });
    expect(await sender(sendung)).toEqual({ art: 'ok' });

    const andere = { ...kundeUnterschrift, geraetZeit: kundeUnterschrift.geraetZeit + 1 };
    const zweite = await sender({
      ...sendung,
      daten: { funktion: 'schein_unterschreiben', parameter: { p_id: id, p_monteur: monteurUnterschrift, p_kunde: andere } },
    });
    expect(zweite.art).toBe('abgelehnt');
  }, 120_000);

  it('ein vorgemerkter Stand trifft auf einen inzwischen unterschriebenen Schein: abgelehnt und gemeldet', async () => {
    const fach = lagerImKopf();
    lagerEinreichen(fach);
    clientEinreichen(monteur.client);
    const id = await createWorkSheet(BETRIEB, inhalt());

    // Im Funkloch noch einmal geändert …
    clientEinreichen(imFunkloch);
    await updateWorkSheetDraft(id, { notizen: 'Nachgetragen im Keller' });
    expect(fach.inhalt()).toHaveLength(1);
    await funklochAbwarten();

    // … während derselbe Entwurf auf einem anderen Gerät unterschrieben wurde.
    const zugleich = await monteur.client.rpc('schein_unterschreiben', {
      p_id: id, p_monteur: monteurUnterschrift, p_kunde: kundeUnterschrift,
    });
    expect(zugleich.error).toBeNull();

    const gemeldet: { tabelle: string; grund: string }[] = [];
    beiVormerkungFehlgeschlagen((f) => gemeldet.push(f));
    clientEinreichen(monteur.client);
    const bericht = await nachsendenJetzt(monteur.client);

    expect(bericht).toEqual({ gesendet: 0, abgelehnt: 1, offen: 0 });
    expect(gemeldet).toHaveLength(1);
    expect(gemeldet[0].tabelle).toBe('work_sheets');
    const kopf = await admin.from('work_sheets').select('notizen, status').eq('id', id).single();
    expect(kopf.data).toEqual({ notizen: 'Im Keller ohne Empfang', status: 'Unterschrieben' });
  }, 120_000);

  it('ohne Lager im Browser (privates Fenster) bleibt es beim direkten Aufruf: mit Netz bestätigt, ohne Netz ein Fehler', async () => {
    lagerEinreichen(null);
    clientEinreichen(monteur.client);
    const id = await createWorkSheet(BETRIEB, inhalt());
    const da = await admin.from('work_sheets').select('id').eq('id', id);
    expect(da.data ?? []).toHaveLength(1);

    clientEinreichen(imFunkloch);
    await expect(createWorkSheet(BETRIEB, inhalt())).rejects.toThrow(/Verbindung/);
  }, 120_000);
});
