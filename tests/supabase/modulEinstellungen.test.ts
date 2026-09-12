/**
 * Firmeneinstellungen, persönliche Einstellungen, Nachtläufe und
 * Monatsbilanzen auf Postgres.
 *
 * Die letzten vier Module. Zwei davon haben eine Eigenheit, die der Umzug
 * auflöst: die Push-Marken brauchten eine Anweisung statt eines
 * Lesen-Ändern-Schreibens, und die Monatsbilanzen sind hier eine Sicht, die
 * nicht unvollständig sein kann.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';
import * as firma from '@/lib/db/pg/company';
import * as einstellungen from '@/lib/db/pg/prefs';
import * as laeufe from '@/lib/db/pg/laeufe';
import * as bilanzen from '@/lib/db/pg/monatsbilanzen';
import { clientEinreichen, NACHFASSEN_MS } from '@/lib/db/pg/kern';
import type { UserPrefs } from '@/types';

const BETRIEB = 'einst-a';

let chef: Konto;
let admin2: Konto;
let anton: Konto;

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Perl Installationen');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  admin2 = await konto(BETRIEB, 'Administrator', 'admin');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
  clientEinreichen(chef.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Firmeneinstellungen', () => {
  afterEach(() => clientEinreichen(chef.client));

  it('liest und schreibt die Stammdaten', async () => {
    await firma.updateCompany(BETRIEB, {
      addressLine: 'Hauptstraße 1 · 1010 Wien',
      iban: 'AT611904300234573201',
      vatId: 'ATU12345678',
    });
    const c = await firma.getCompany(BETRIEB);
    expect(c).toMatchObject({
      id: BETRIEB, name: 'Perl Installationen',
      addressLine: 'Hauptstraße 1 · 1010 Wien', vatId: 'ATU12345678',
    });
  });

  it('die Sätze bleiben ein ganzes Objekt', async () => {
    // Sätze und Module sind Einstellungen, keine Geschäftsdaten. Wer danach
    // filtert oder summiert, hat etwas falsch verstanden.
    await firma.updateCompany(BETRIEB, {
      rates: {
        fach: 89, helper: 62, nightSurcharge: 0.5, emergencySurcharge: 1,
        vatRate: 0.2, dueDays: 14,
      },
    });
    const c = await firma.getCompany(BETRIEB);
    expect(c!.rates).toMatchObject({ fach: 89, helper: 62, vatRate: 0.2, dueDays: 14 });
  });

  it('die Module schaltet nur die Administration', async () => {
    /*
      Die Geschäftsführung führt den Betrieb, die Administration den Zugang.
      Wer Module schaltet, entscheidet, was es für alle anderen überhaupt
      gibt — das ist eine andere Art Entscheidung als ein Stundensatz.
    */
    const module = { modules: { angebote: false } } as Parameters<typeof firma.updateCompany>[1];
    clientEinreichen(chef.client);
    await expect(firma.updateCompany(BETRIEB, module)).rejects.toThrow();

    clientEinreichen(admin2.client);
    await firma.updateCompany(BETRIEB, module);
    const c = await firma.getCompany(BETRIEB);
    expect(c!.modules).toMatchObject({ angebote: false });
  });

  it('an die Einstellungen kommt nur die Spitze — die Projektleitung nicht', async () => {
    /*
      Sätze, Briefkopf, Bankverbindung und die Urlaubs-Genehmigenden sind das
      tägliche Geschäft der Spitze — Geschäftsführung UND Administration, wie
      in `firestore.rules`. Die Projektleitung führt Baustellen, nicht den
      Betrieb; sie kommt an die Zeile gar nicht heran.
    */
    const liste = { vacationApprovers: [chef.uid] } as Parameters<typeof firma.updateCompany>[1];
    clientEinreichen(chef.client);
    await firma.updateCompany(BETRIEB, liste);
    clientEinreichen(admin2.client);
    await firma.updateCompany(BETRIEB, liste);

    const pl = await konto(BETRIEB, 'Projektleiter', 'pl');
    clientEinreichen(pl.client);
    await expect(firma.updateCompany(BETRIEB, { iban: 'AT00' })).rejects.toThrow();
  }, 60_000);

  it('ein Monteur ändert nichts — und bekommt das auch gesagt', async () => {
    /*
      Der Zeilenschutz lässt die Anweisung ins Leere laufen; ohne die
      Trefferprüfung sähe das wie ein geglücktes Speichern aus.
    */
    clientEinreichen(anton.client);
    await expect(firma.updateCompany(BETRIEB, { iban: 'AT00' })).rejects.toThrow();
    clientEinreichen(chef.client);
    expect((await firma.getCompany(BETRIEB))!.iban).toBe('AT611904300234573201');
  });

  it('einen fremden Betrieb sieht niemand', async () => {
    await betriebAnlegen('einst-b', 'Fremd GmbH');
    expect(await firma.getCompany('einst-b')).toBeNull();
  });
});

describe('Persönliche Einstellungen', () => {
  afterEach(() => clientEinreichen(anton.client));

  beforeAll(() => clientEinreichen(anton.client));

  it('gibt es erst, wenn jemand etwas eingestellt hat', async () => {
    expect(await einstellungen.getPrefs(anton.uid)).toBeNull();
  });

  it('speichert die Auswahl und liest sie zurück', async () => {
    await einstellungen.savePrefs(BETRIEB, anton.uid, {
      notifyNewOrder: false, notifyOrderReady: true, notifyUrgentDelivery: true,
    });
    const p = await einstellungen.getPrefs(anton.uid);
    expect(p).toMatchObject({
      id: anton.uid, userId: anton.uid, companyId: BETRIEB,
      notifyNewOrder: false, notifyOrderReady: true, notifyUrgentDelivery: true,
    });
  });

  it('meldet zwei Geräte an, und beide bleiben', async () => {
    /*
      DER GRUND FÜR DIE ANWEISUNG STATT LESEN-ÄNDERN-SCHREIBEN. Meldet sich
      jemand auf Telefon und Rechner kurz nacheinander an, läsen zwei Aufrufe
      denselben Stand und schrieben ihre jeweils eine Marke zurück — die
      zuerst geschriebene wäre weg, und genau dieses Gerät bekäme keine
      Meldungen mehr.
    */
    await Promise.all([
      einstellungen.addPushToken(BETRIEB, anton.uid, 'telefon'),
      einstellungen.addPushToken(BETRIEB, anton.uid, 'rechner'),
    ]);
    const p = await einstellungen.getPrefs(anton.uid);
    expect([...(p!.pushTokens ?? [])].sort()).toEqual(['rechner', 'telefon']);
  });

  it('dasselbe Gerät zweimal ist immer noch ein Gerät', async () => {
    await einstellungen.addPushToken(BETRIEB, anton.uid, 'telefon');
    const p = await einstellungen.getPrefs(anton.uid);
    expect((p!.pushTokens ?? []).filter((t) => t === 'telefon')).toHaveLength(1);
  });

  it('meldet ein Gerät wieder ab und lässt das andere stehen', async () => {
    await einstellungen.removePushToken(anton.uid, 'telefon');
    const p = await einstellungen.getPrefs(anton.uid);
    expect(p!.pushTokens).toEqual(['rechner']);
  });

  it('das Umstellen der Meldungen meldet kein Gerät ab', async () => {
    await einstellungen.savePrefs(BETRIEB, anton.uid, {
      notifyNewOrder: true, notifyOrderReady: false, notifyUrgentDelivery: false,
    });
    const p = await einstellungen.getPrefs(anton.uid);
    expect(p!.pushTokens).toEqual(['rechner']);
    expect(p!.notifyOrderReady).toBe(false);
  });

  it('die eigenen, und nur die eigenen — auch für die Geschäftsführung', async () => {
    /*
      Die Push-Marken eines fremden Geräts gehen auch einen Vorgesetzten
      nichts an. Deshalb greift die Grenze schon beim LESEN.
    */
    clientEinreichen(chef.client);
    expect(await einstellungen.getPrefs(anton.uid)).toBeNull();
  });

  it('das Abonnement meldet eine Änderung an der eigenen Zeile', async () => {
    clientEinreichen(anton.client);
    const staende: Array<UserPrefs | null> = [];
    const stopp = einstellungen.subscribePrefs(
      anton.uid, (p) => staende.push(p), (e) => { throw e; },
    );
    try {
      await warte(NACHFASSEN_MS + 1800);
      await einstellungen.savePrefs(BETRIEB, anton.uid, {
        notifyNewOrder: false, notifyOrderReady: false, notifyUrgentDelivery: false,
      });

      const aus = () => staende[staende.length - 1]?.notifyNewOrder === false;
      for (let i = 0; i < 40 && !aus(); i += 1) await warte(100);
      expect(aus()).toBe(true);
    } finally {
      stopp();
    }
  }, 30_000);
});

describe('Nachtläufe', () => {
  afterEach(() => clientEinreichen(chef.client));

  it('„nicht da" heisst nicht „in Ordnung"', async () => {
    // Ein Lauf, der noch nie gelaufen ist, hat keine Zeile. Die Ansicht
    // unterscheidet das von einem geglückten Lauf.
    clientEinreichen(chef.client);
    expect(await laeufe.ladeLauf(BETRIEB, 'ausleitung')).toBeUndefined();
  });

  it('liest den Zustand, den der Dienstschlüssel geschrieben hat', async () => {
    await admin.from('system_laeufe').upsert({
      company_id: BETRIEB,
      art: 'ausleitung',
      zuletzt_erfolg: '2026-09-11T02:30:00Z',
      zuletzt_versuch: '2026-09-12T02:30:00Z',
      erfolg: false,
      meldung: 'Zielspeicher nicht erreichbar',
      kennzahl: 0,
      kennzahl_einheit: 'Zeilen',
      ziel_extern: true,
    });

    const l = await laeufe.ladeLauf(BETRIEB, 'ausleitung');
    expect(l).toMatchObject({
      art: 'ausleitung', erfolg: false,
      meldung: 'Zielspeicher nicht erreichbar', kennzahlEinheit: 'Zeilen',
    });
    /*
      `zielExtern` HIESS IN DER DATENBANK ZUERST `ausser_haus`. Eine Spalte,
      die anders heisst als das Feld, fällt aus der mechanischen Umrechnung
      heraus — und „nichts behauptet" sieht in der Ansicht aus wie „in
      Ordnung". Genau deshalb steht das hier.
    */
    expect(l!.zielExtern).toBe(true);
    expect(typeof l!.zuletztErfolg).toBe('number');
    expect(l!.zuletztVersuch).toBeGreaterThan(l!.zuletztErfolg!);
  });

  it('ein Monteur sieht die Überwachung nicht', async () => {
    clientEinreichen(anton.client);
    expect(await laeufe.ladeLauf(BETRIEB, 'ausleitung')).toBeUndefined();
  });

  it('geschrieben wird hier nichts — auch nicht von der Spitze', async () => {
    // Eine Überwachung, die der Überwachte beschreiben kann, überwacht nichts.
    clientEinreichen(chef.client);
    const { error } = await chef.client.from('system_laeufe')
      .update({ erfolg: true }).eq('company_id', BETRIEB).eq('art', 'ausleitung');
    expect(error).toBeNull(); // keine Richtlinie: die Anweisung trifft nichts
    expect((await laeufe.ladeLauf(BETRIEB, 'ausleitung'))!.erfolg).toBe(false);
  });
});

describe('Monatsbilanzen', () => {
  afterEach(() => clientEinreichen(anton.client));

  beforeAll(async () => {
    await admin.from('time_entries').delete().eq('company_id', BETRIEB);
    const tage = [
      ['2026-01-12', 'Anwesend'], ['2026-01-13', 'Anwesend'], ['2026-01-14', 'Krank'],
      ['2026-02-09', 'Anwesend'], ['2026-02-10', 'Urlaub'],
    ] as const;
    for (const [datum, status] of tage) {
      await admin.from('time_entries').insert(
        buchung({ ...anton, betrieb: BETRIEB } as Konto, datum, { status }),
      );
    }
    clientEinreichen(anton.client);
  }, 60_000);

  it('der Marker sagt „vollständig, von Anfang an"', async () => {
    /*
      IN FIRESTORE WAR DAS EINE ECHTE FRAGE. Die Bilanzen wurden nächtlich
      vorgerechnet; fiel der Lauf aus, war eine fehlende Bilanz von einem
      Monat ohne Buchungen nicht zu unterscheiden, und der Saldo wurde zu
      niedrig — ohne Meldung, und die Zahl ging auf den Lohnzettel.

      Eine Sicht rechnet bei jeder Abfrage neu. Es gibt keinen Lauf, der
      ausfallen könnte.
    */
    const m = await bilanzen.bilanzMarker(BETRIEB, anton.uid);
    expect(m!.vollstaendigAb <= bilanzen.monatVon('2020-01-01')).toBe(true);
  });

  it('verdichtet je Monat, mit den Tagen', async () => {
    const rows = await bilanzen.listBilanzen(BETRIEB, anton.uid, '2026-01');
    expect(rows.map((b) => b.monat)).toEqual(['2026-01', '2026-02']);

    const jan = rows[0];
    // 07:00–16:00 abzüglich 30 Minuten Pause = 510 Minuten je Anwesenheitstag.
    expect(jan.anwesendMin).toBe(1020);
    expect(jan.krankTage).toBe(1);
    expect(jan.urlaubTage).toBe(0);
    expect(jan.tage).toEqual(['2026-01-12', '2026-01-13', '2026-01-14']);

    expect(rows[1]).toMatchObject({ anwesendMin: 510, krankTage: 0, urlaubTage: 1 });
  });

  it('der Stichmonat schneidet vorne ab', async () => {
    const rows = await bilanzen.listBilanzen(BETRIEB, anton.uid, '2026-02');
    expect(rows.map((b) => b.monat)).toEqual(['2026-02']);
  });

  it('ein Monteur sieht nur die eigenen Bilanzen', async () => {
    /*
      Die Sicht trägt `security_invoker`, also gilt der Zeilenschutz der
      Zeitbuchungen. Krank- und Urlaubstage sind Gesundheitsdaten nach
      Art. 9 DSGVO; ein Kollege hat damit nichts zu tun.
    */
    const fremd = await konto(BETRIEB, 'Mitarbeiter', 'berta');
    await admin.from('time_entries').insert(
      buchung({ ...fremd, betrieb: BETRIEB } as Konto, '2026-01-20'),
    );
    clientEinreichen(anton.client);
    const rows = await bilanzen.listBilanzen(BETRIEB, fremd.uid, '2026-01');
    expect(rows).toEqual([]);
  }, 60_000);

  it('die Buchhaltung sieht sie', async () => {
    const buch = await konto(BETRIEB, 'Buchhaltung', 'buch');
    clientEinreichen(buch.client);
    const rows = await bilanzen.listBilanzen(BETRIEB, anton.uid, '2026-01');
    expect(rows).toHaveLength(2);
  }, 60_000);
});
