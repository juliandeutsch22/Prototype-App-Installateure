/**
 * Die Zeitbuchung übersteht das Funkloch — durch die ganze Kette.
 *
 * WARUM DIESE PRÜFUNG DIE WICHTIGSTE DES UMZUGS IST. Der Fahrplan hat den
 * Wechsel an eine Bedingung geknüpft: „der Schreibweg ohne Empfang wird
 * zuerst gebaut und bewiesen." Gebaut war er — `lib/sync/ausgangsfach.ts`,
 * mit eigener Prüfung gegen die echte Datenbank. Bewiesen war damit die
 * MECHANIK. Angeschlossen war sie an keiner einzigen Stelle.
 *
 * Solange das so war, sagte die App dem Monteur im Keller „ohne Verbindung
 * gespeichert, wird automatisch gesendet" — und nichts davon geschah. Der
 * Aufruf scheiterte, die Buchung war weg.
 *
 * Diese Datei prüft deshalb nicht die Mechanik, sondern den WEG: von der
 * Funktion, die die Ansicht ruft, bis zur Zeile in Postgres. Sie geht durch
 * die Weiche (`@/lib/db/timeEntries`), nicht an ihr vorbei.
 *
 * DAS FUNKLOCH WIRD ECHT HERGESTELLT: der Client zeigt in der ersten Hälfte
 * auf einen Port, an dem niemand horcht. Ein gestellter Sender würde die
 * Einordnung der Fehler überspringen — und genau dort entscheidet sich, ob
 * ein Vorgang wartet oder verloren gilt.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, ANON, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { lagerEinreichen, nachsendenJetzt } from '@/lib/db/pg/ohneEmpfang';
import type { Lager, Vormerkung } from '@/lib/sync/ausgangsfach';

vi.stubEnv('VITE_DATENQUELLE', 'postgres');

const zeiten = await import('@/lib/db/timeEntries');

const BETRIEB = 'funkloch-a';
const TAG = '2026-05-11';

let monteur: Konto;

/** Ein Lager im Kopf — im Browser ist es IndexedDB. */
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

/** Ein Client, der ins Leere zeigt: Port 1 nimmt niemand entgegen. */
const imFunkloch = createClient('http://127.0.0.1:1', ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'funk');
}, 120_000);

afterAll(async () => {
  clientEinreichen(null);
  lagerEinreichen(null);
  await admin.from('time_entries').delete().eq('company_id', BETRIEB);
});

const buchung = (datum: string) => ({
  date: datum,
  status: 'Anwesend' as const,
  startTime: '07:00',
  endTime: '15:00',
  breakDuration: 30,
  userId: monteur.uid,
  userName: 'Funk Monteur',
  source: 'manual' as const,
});

describe('Eine Buchung im Funkloch geht nicht verloren', () => {
  it('wird vorgemerkt und kommt beim nächsten Netz an', async () => {
    const fach = lagerImKopf();
    lagerEinreichen(fach);

    // 1. Im Keller: der Server ist nicht erreichbar.
    clientEinreichen(imFunkloch);
    const stand = await zeiten.createTimeEntryOhneEmpfang(BETRIEB, buchung(TAG));

    expect(stand).toBe('queued');
    expect(fach.inhalt()).toHaveLength(1);
    expect(fach.inhalt()[0].tabelle).toBe('time_entries');
    // Noch ist nichts in der Datenbank — das ist der Punkt.
    const vorher = await admin.from('time_entries').select('id').eq('company_id', BETRIEB);
    expect(vorher.data ?? []).toHaveLength(0);

    // 2. Wieder Empfang.
    clientEinreichen(monteur.client);
    const bericht = await nachsendenJetzt(monteur.client);

    expect(bericht.gesendet).toBe(1);
    expect(bericht.offen).toBe(0);
    expect(fach.inhalt()).toHaveLength(0);

    const nachher = await admin
      .from('time_entries').select('id, date, user_id').eq('company_id', BETRIEB);
    expect(nachher.data ?? []).toHaveLength(1);
    expect((nachher.data ?? [])[0].date).toBe(TAG);
    expect((nachher.data ?? [])[0].user_id).toBe(monteur.uid);
  }, 120_000);

  /*
    DERSELBE VORGANG DARF ZWEIMAL ANKOMMEN. Ein Nachsendelauf, der nicht weiss,
    ob der erste Versuch durchkam, wiederholt ihn — und ohne eine Kennung vom
    Gerät stünde die Buchung danach doppelt im Zeitkonto. Das Gegenteil von
    „keine Buchung geht verloren" ist nicht „jede kommt an", sondern „jede
    kommt GENAU EINMAL an".
  */
  it('und kommt auch bei einem zweiten Anlauf nur einmal an', async () => {
    const fach = lagerImKopf();
    lagerEinreichen(fach);
    clientEinreichen(imFunkloch);

    const zweiterTag = '2026-05-12';
    await zeiten.createTimeEntryOhneEmpfang(BETRIEB, buchung(zweiterTag));
    const vorgemerkt = fach.inhalt()[0];

    clientEinreichen(monteur.client);
    await nachsendenJetzt(monteur.client);
    // Dieselbe Vormerkung noch einmal einlegen — als wäre die Antwort des
    // ersten Laufs unterwegs verlorengegangen.
    await fach.ablegen({ ...vorgemerkt });
    await nachsendenJetzt(monteur.client);

    const zeilen = await admin
      .from('time_entries').select('id').eq('company_id', BETRIEB).eq('date', zweiterTag);
    expect(zeilen.data ?? []).toHaveLength(1);
  }, 120_000);

  /*
    OHNE LAGER GIBT ES KEIN VERSPRECHEN. Privates Fenster, gesperrter
    Speicher: dann wird geschrieben wie bisher, und ein Fehlschlag ist ein
    Fehlschlag. „Wird nachgesendet" zu melden, wo nichts gelagert werden kann,
    wäre dieselbe Lüge in neuen Kleidern.
  */
  it('ohne Lager wird nichts versprochen', async () => {
    lagerEinreichen(null);
    clientEinreichen(imFunkloch);

    await expect(zeiten.createTimeEntryOhneEmpfang(BETRIEB, buchung('2026-05-13')))
      .rejects.toThrow();

    // Und die andere Hälfte desselben Satzes: geht der Schreibvorgang durch,
    // heisst die Antwort `confirmed` — nicht `queued`. Ein `queued` ohne Lager
    // wäre die Zusage „wird nachgesendet" über einem leeren Fach.
    clientEinreichen(monteur.client);
    const stand = await zeiten.createTimeEntryOhneEmpfang(BETRIEB, buchung('2026-05-15'));
    expect(stand).toBe('confirmed');
  }, 60_000);

  it('mit Empfang wird gar nicht erst vorgemerkt', async () => {
    const fach = lagerImKopf();
    lagerEinreichen(fach);
    clientEinreichen(monteur.client);

    const stand = await zeiten.createTimeEntryOhneEmpfang(BETRIEB, buchung('2026-05-14'));
    expect(stand).toBe('confirmed');
    expect(fach.inhalt()).toHaveLength(0);
  }, 60_000);
});
