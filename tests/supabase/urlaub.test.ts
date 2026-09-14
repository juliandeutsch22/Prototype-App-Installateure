/**
 * Urlaub entscheiden — in der Datenbank statt in einer Cloud Function.
 *
 * Zwei Dinge stehen auf dem Prüfstand. Erstens die FEIERTAGSRECHNUNG: sie
 * läuft jetzt auf beiden Seiten — der Browser zeigt beim Antrag, wie viele
 * Arbeitstage der Zeitraum kostet, die Datenbank schreibt bei der Genehmigung
 * genau diese Tage. Liefen sie auseinander, bekäme ein Monteur für eine Woche
 * mit Feiertag fünf Tage abgezogen und hätte trotzdem einen Tag als „nicht
 * gebucht" offen.
 *
 * Zweitens die ENTSCHEIDUNG selbst: sie darf, was der Entscheidende nicht
 * darf — fremde Zeiteinträge lesen und schreiben. Zu sehen bekommt er nichts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { urlaubsTage } from '@shared/feiertage';

const BETRIEB = 'urlaub-b';

let chef: Konto;
let anton: Konto;
let berta: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
  berta = await konto(BETRIEB, 'Mitarbeiter', 'berta');
  clientEinreichen(chef.client);
}, 120_000);

afterAll(() => clientEinreichen(null));


/** Was die Datenbank rechnet. */
async function tageAusDb(
  arbeitstage: number[] | null, von: string, bis: string,
): Promise<string[]> {
  const { data, error } = await admin.rpc('urlaubstage', {
    p_arbeitstage: arbeitstage, p_von: von, p_bis: bis,
  });
  if (error) throw new Error(error.message);
  return (data as string[]) ?? [];
}

async function antragAnlegen(k: Konto, von: string, bis: string): Promise<string> {
  const { data, error } = await admin.from('vacations').insert({
    company_id: BETRIEB, user_id: k.uid, user_name: 'Antragsteller',
    von, bis, tage: 5, status: 'Beantragt',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}

async function antrag(id: string) {
  const { data } = await admin.from('vacations').select('*').eq('id', id).single();
  return data!;
}

async function zeiten(uid: string) {
  const { data } = await admin.from('time_entries')
    .select('date, status, vacation_id').eq('company_id', BETRIEB).eq('user_id', uid)
    .order('date');
  return data ?? [];
}

describe('Die Feiertagsrechnung stimmt mit dem Browser überein', () => {
  it('ganze Jahre, Tag für Tag', async () => {
    /*
      Nicht ein Beispiel, sondern der ganze Kalender: die bewegliche Hälfte der
      Feiertage hängt am Osterdatum, und ein Fehler dort verschiebt vier Tage
      im Jahr. Zwei Jahre reichen, um jeden festen und jeden beweglichen
      Feiertag mindestens einmal zu treffen.
    */
    for (const jahr of [2026, 2027]) {
      const von = `${jahr}-01-01`;
      const bis = `${jahr}-12-31`;
      expect(await tageAusDb(null, von, bis), `Jahr ${jahr}`)
        .toEqual(urlaubsTage(undefined, von, bis));
    }
  }, 60_000);

  it('auch für eine Teilzeitwoche', async () => {
    // Die Arbeitstage des Betroffenen entscheiden — sonst bekäme ein
    // Teilzeitmitarbeiter fünf Tage abgezogen statt drei.
    const wochen = [[1, 2, 3], [2, 4], [0, 6], [1, 2, 3, 4, 5, 6]];
    for (const w of wochen) {
      expect(await tageAusDb(w, '2026-03-01', '2026-06-30'), JSON.stringify(w))
        .toEqual(urlaubsTage(w, '2026-03-01', '2026-06-30'));
    }
  }, 60_000);

  it('ein verdrehter Zeitraum liefert nichts', async () => {
    expect(await tageAusDb(null, '2026-05-10', '2026-05-01')).toEqual([]);
    expect(urlaubsTage(undefined, '2026-05-10', '2026-05-01')).toEqual([]);
  });
});

describe('Genehmigen', () => {
  it('setzt den Status und schreibt die Tage ins Zeitkonto', async () => {
    const id = await antragAnlegen(anton, '2026-05-04', '2026-05-08');
    const { data } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Genehmigt', p_entscheider_name: 'Chef',
    });
    expect(data).toMatchObject({ status: 'Genehmigt', angelegt: 5, uebersprungen: 0, entfernt: 0 });

    const a = await antrag(id);
    expect(a.status).toBe('Genehmigt');
    expect(a.entschieden_von_uid).toBe(chef.uid);
    expect(a.entschieden_von_name).toBe('Chef');

    const z = await zeiten(anton.uid);
    expect(z.map((e) => e.date)).toEqual([
      '2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08',
    ]);
    expect(z.every((e) => e.status === 'Urlaub' && e.vacation_id === id)).toBe(true);
  }, 30_000);

  it('überspringt Tage, an denen schon gebucht ist', async () => {
    /*
      Eine erfasste Arbeitsleistung darf eine Genehmigung nicht stillschweigend
      wegwerfen — und niemand würde es merken.
    */
    await admin.from('time_entries').insert(
      buchung({ ...berta, betrieb: BETRIEB } as Konto, '2026-06-09'),
    );
    const id = await antragAnlegen(berta, '2026-06-08', '2026-06-12');
    const { data } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Genehmigt',
    });
    expect(data).toMatchObject({ angelegt: 4, uebersprungen: 1 });

    const z = await zeiten(berta.uid);
    expect(z.find((e) => e.date === '2026-06-09')!.status).toBe('Anwesend');
  }, 30_000);

  it('lässt einen Feiertag aus', async () => {
    // Der 6. April 2026 ist Ostermontag.
    const id = await antragAnlegen(anton, '2026-04-06', '2026-04-10');
    const { data } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Genehmigt',
    });
    expect(data).toMatchObject({ angelegt: 4 });
    const z = (await zeiten(anton.uid)).filter((e) => e.vacation_id === id);
    expect(z.map((e) => e.date)).not.toContain('2026-04-06');
  }, 30_000);

  it('rechnet mit der Woche des Antragstellers, nicht der des Entscheidenden', async () => {
    /*
      CÄSAR ARBEITET MONTAG UND MITTWOCH. Der Chef, der genehmigt, arbeitet
      fünf Tage. Würde die Funktion die Arbeitstage des Entscheidenden lesen,
      bekäme Cäsar für dieselbe Woche fünf Urlaubstage abgezogen statt zwei —
      und es fiele erst am Jahresende auf, an einem Urlaubskonto, das nicht
      aufgeht.
    */
    const caesar = await konto(BETRIEB, 'Mitarbeiter', 'caesar');
    await admin.from('users').update({ work_days: [1, 3] }).eq('id', caesar.uid);

    const id = await antragAnlegen(caesar, '2026-09-07', '2026-09-11');
    const { data } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Genehmigt',
    });
    expect(data).toMatchObject({ angelegt: 2 });
    expect((await zeiten(caesar.uid)).map((e) => e.date))
      .toEqual(['2026-09-07', '2026-09-09']);
  }, 60_000);

  it('ein Zeitraum ohne Arbeitstag wird abgewiesen', async () => {
    const id = await antragAnlegen(anton, '2026-05-02', '2026-05-03'); // Wochenende
    const { error } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Genehmigt',
    });
    expect(error).not.toBeNull();
    expect((await antrag(id)).status).toBe('Beantragt');
  }, 30_000);

  it('zweimal entscheiden geht nicht', async () => {
    const id = await antragAnlegen(anton, '2026-07-06', '2026-07-10');
    await chef.client.rpc('urlaub_entscheiden', { p_antrag: id, p_entscheidung: 'Genehmigt' });
    const { error } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Genehmigt',
    });
    expect(error).not.toBeNull();
  }, 30_000);
});

describe('Ablehnen und zurücknehmen', () => {
  it('eine Ablehnung braucht einen Grund und rührt das Zeitkonto nicht an', async () => {
    const id = await antragAnlegen(anton, '2026-08-03', '2026-08-07');
    const ohne = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Abgelehnt',
    });
    expect(ohne.error).not.toBeNull();

    const { data } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Abgelehnt', p_grund: 'Zu viele gleichzeitig weg',
    });
    expect(data).toMatchObject({ status: 'Abgelehnt', angelegt: 0 });
    const a = await antrag(id);
    expect(a).toMatchObject({ status: 'Abgelehnt', grund: 'Zu viele gleichzeitig weg' });
    expect((await zeiten(anton.uid)).filter((e) => e.vacation_id === id)).toEqual([]);
  }, 30_000);

  it('eine Rücknahme sammelt genau die erzeugten Tage wieder ein', async () => {
    /*
      Gefunden werden sie über die Antragskennung, nicht über den Zeitraum: ein
      von Hand gebuchter Urlaubstag im selben Zeitraum darf nicht mit
      verschwinden.
    */
    const id = await antragAnlegen(berta, '2026-09-07', '2026-09-11');
    await chef.client.rpc('urlaub_entscheiden', { p_antrag: id, p_entscheidung: 'Genehmigt' });
    // Ein Urlaubstag von Hand, im selben Zeitraum, ohne Antragsbezug.
    await admin.from('time_entries').insert(
      buchung({ ...berta, betrieb: BETRIEB } as Konto, '2026-09-14', { status: 'Urlaub' }),
    );

    const { data } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Storniert', p_grund: 'Doch gearbeitet',
    });
    expect(data).toMatchObject({ status: 'Storniert', entfernt: 5 });

    const z = await zeiten(berta.uid);
    expect(z.some((e) => e.date === '2026-09-14')).toBe(true);
    expect(z.some((e) => e.vacation_id === id)).toBe(false);
  }, 30_000);

  it('nur ein genehmigter Urlaub wird zurückgenommen', async () => {
    const id = await antragAnlegen(anton, '2026-10-05', '2026-10-09');
    const { error } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Storniert', p_grund: 'Nie genehmigt',
    });
    expect(error).not.toBeNull();
  }, 30_000);
});

describe('Wer entscheiden darf', () => {
  it('ein Mitarbeiter nicht — und er sieht auch nichts', async () => {
    const id = await antragAnlegen(berta, '2026-11-02', '2026-11-06');
    clientEinreichen(anton.client);
    const { error } = await anton.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Genehmigt',
    });
    clientEinreichen(chef.client);
    expect(error).not.toBeNull();
    /*
      DIE MELDUNG GEHÖRT ZUR PRÜFUNG. Abgewiesen würde er auch ohne sie: der
      Trigger `urlaub_entscheidung_geschuetzt` auf `vacations` lässt einen
      Statuswechsel nur durch, wenn der Schreibende entscheiden darf, und ein
      Trigger greift auch bei `security definer`. Die Funktion prüft trotzdem
      selbst — sie sagt dem Abgewiesenen, woran es liegt, statt ihn über die
      Zeilenregel eines Statuswechsels stolpern zu lassen. Fiele die Prüfung
      weg, bliebe die Abweisung und nur die Meldung würde eine andere: genau
      deshalb steht sie hier.
    */
    expect(error!.message).toContain('Keine Berechtigung');
    expect((await antrag(id)).status).toBe('Beantragt');
  }, 30_000);

  it('ein fremder Betrieb kommt nicht an den Antrag', async () => {
    await betriebAnlegen('urlaub-c');
    const fremd = await konto('urlaub-c', 'Geschäftsführung', 'fremd');
    const id = await antragAnlegen(anton, '2026-12-07', '2026-12-11');

    const { error } = await fremd.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Genehmigt',
    });
    expect(error).not.toBeNull();
    expect((await antrag(id)).status).toBe('Beantragt');
  }, 60_000);

  it('der Entscheidende bekommt die fremden Zeiteinträge NICHT zu sehen', async () => {
    /*
      DER GRUND, WARUM DIESE FUNKTION ÜBERHAUPT SERVERSEITIG LÄUFT. Sie muss
      fremde Zeiteinträge lesen und schreiben; der Entscheidende darf das
      nicht. Zurück kommen deshalb nur Zahlen.
    */
    const id = await antragAnlegen(anton, '2027-01-04', '2027-01-08');
    const { data } = await chef.client.rpc('urlaub_entscheiden', {
      p_antrag: id, p_entscheidung: 'Genehmigt',
    });
    expect(Object.keys(data as object).sort())
      .toEqual(['angelegt', 'entfernt', 'status', 'uebersprungen']);
  }, 30_000);
});
