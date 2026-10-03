import { describe, it, expect } from 'vitest';
import type { AppUser, Invoice, MaterialOrder, Project, Wartung, WorkSheet } from '@/types';
import { euro } from '@/lib/betrag';
import { abschnitt, JE_ABSCHNITT, summe } from '@/features/dashboard/start/abschnitte';
import {
  abholbereitAlt,
  bestelltUeberfaellig,
  budgetNahe,
  lieferungenHeute,
  offeneAnforderungen,
  ohneEinsatzListe,
  tageOhneBuchung,
  ueberfaelligNichtMahnbar,
  wartungenOhneBaustelle,
  lehrzeitEnden,
  einzigeLeitungOhneMail,
} from '@/features/dashboard/start/regeln';
import { auslastung } from '@/features/dashboard/start/laden';
import { startseite, type Umfeld } from '@/features/dashboard/start/aufbau';
import { themenAbschnitte } from '@/features/dashboard/start/themen';
import { ZIEL, ANFORDERUNGS_FILTER, BAUSTELLEN_FILTER, SCHEIN_FILTER, RECHNUNGS_SICHTEN, grundpfad } from '@/features/dashboard/start/ziele';
import { mahnlauf } from '@/features/invoices/mahnlauf';
import { darfZiel } from '../links/linkziel';
import { canAccess } from '@/app/navigation';

/**
 * Die Regeln der Startseite (Testbericht 4.2, Nachtest 01.10.2026 Paket B):
 * höchstens drei je Abschnitt, Dringlichstes zuerst, leere Abschnitte weg,
 * Rot nur für Überfälliges, jede Zeile auf eine Seite, die die Rolle sehen
 * darf.
 */

const HEUTE = '2026-09-30';
const JETZT = Date.parse('2026-09-30T10:00:00+02:00');

const anf = (teil: Partial<MaterialOrder> & { id: string }): MaterialOrder => ({
  companyId: 'b',
  materialId: null,
  materialName: 'Rohr',
  quantity: 1,
  status: 'Offen',
  transactionType: 'order',
  userId: 'u',
  userName: 'Max',
  createdAt: Date.parse('2026-09-20T08:00:00Z'),
  ...teil,
});

describe('Ein Abschnitt', () => {
  it('zeigt höchstens drei Zeilen und zählt alle', () => {
    const zeilen = Array.from({ length: 7 }, (_, i) => ({ key: `z${i}`, titel: `Z${i}` }));
    const a = abschnitt('x', 'X', zeilen, '/ziel')!;
    expect(a.zeilen).toHaveLength(JE_ABSCHNITT);
    expect(a.anzahl).toBe(7);
    expect(a.weiter).toEqual({ to: '/ziel' });
    expect(summe([a])).toBe(7);
  });

  it('ohne Ziel klappt er auf, statt ins Leere zu führen', () => {
    const a = abschnitt('x', 'X', Array.from({ length: 5 }, (_, i) => ({ key: `z${i}`, titel: `Z${i}` })))!;
    expect(a.weiter && 'aufklappen' in a.weiter && a.weiter.aufklappen).toHaveLength(2);
  });

  it('leer heißt: kein Abschnitt', () => {
    expect(abschnitt('x', 'X', [], '/ziel')).toBeNull();
  });
});

describe('Monteur', () => {
  it('Tage ohne Buchung: das Älteste zuerst, mit dem Plan des Tages', () => {
    const a = tageOhneBuchung(['2026-09-28', '2026-09-25'], new Map([['2026-09-25', 'PR-1']]))!;
    expect(a.zeilen.map((z) => z.titel)).toEqual(['Freitag, 25.09.2026', 'Montag, 28.09.2026']);
    expect(a.zeilen[0].detail).toBe('laut Plan PR-1');
    expect(a.zeilen[0].to).toBe('/time?datum=2026-09-25');
    expect(a.zeilen[0].status?.ton).toBe('warn');
  });
});

describe('Verwaltung', () => {
  it('offene Anforderungen: Eil zuerst, dann die älteste; „In Bearbeitung“ zählt nicht', () => {
    const a = offeneAnforderungen([
      anf({ id: 'neu', createdAt: Date.parse('2026-09-29T08:00:00Z') }),
      anf({ id: 'alt', createdAt: Date.parse('2026-09-01T08:00:00Z') }),
      anf({ id: 'eil', isUrgent: true, createdAt: Date.parse('2026-09-29T09:00:00Z') }),
      anf({ id: 'arbeit', status: 'In Bearbeitung' }),
      anf({ id: 'ret', transactionType: 'return' }),
    ], HEUTE)!;
    expect(a.zeilen.map((z) => z.key)).toEqual(['offen-eil', 'offen-alt', 'offen-neu']);
  });

  it('bestellt und überfällig erst nach dem Liefertermin — und nur rot', () => {
    const bestellt = { status: 'In Bearbeitung' as const, bestelltAm: Date.parse('2026-09-20T08:00:00Z') };
    const a = bestelltUeberfaellig([
      anf({ id: 'spaet', ...bestellt, liefertermin: '2026-09-28' }),
      anf({ id: 'heute', ...bestellt, liefertermin: HEUTE }),
      anf({ id: 'ohne', ...bestellt }),
      anf({ id: 'da', ...bestellt, liefertermin: '2026-09-25', geliefertAm: Date.parse('2026-09-26T08:00:00Z') }),
    ], HEUTE)!;
    expect(a.zeilen.map((z) => z.key)).toEqual(['best-spaet']);
    expect(a.zeilen[0].status).toEqual({ text: '2 Tage', ton: 'fehl' });
    expect(lieferungenHeute([anf({ id: 'heute', ...bestellt, liefertermin: HEUTE })], [], HEUTE)).toHaveLength(1);
  });

  it('abholbereit zählt ab dem Zeitstempel der Datenbank, nicht ab der letzten Änderung', () => {
    const a = abholbereitAlt([
      anf({ id: 'alt', status: 'Abholbereit', abholbereitSeit: JETZT - 4 * 86_400_000, updatedAt: JETZT }),
      anf({ id: 'frisch', status: 'Abholbereit', abholbereitSeit: JETZT - 2 * 86_400_000 }),
    ], JETZT)!;
    expect(a.zeilen.map((z) => z.key)).toEqual(['alt-alt']);
  });
});

describe('Buchhaltung', () => {
  const rechnung = (teil: Partial<Invoice> & { id: string }) => ({
    invoiceNumber: teil.id, customerName: 'Kunde', paymentStatus: 'Offen', totalBrutto: 100, invoiceDate: '2026-07-01',
    dueDate: '2026-07-15', mahnstufe: 0, ...teil,
  }) as Invoice & { id: string };

  it('„überfällig, noch nicht mahnbar“ nennt keine Rechnung, die im Mahnlauf steht', () => {
    const r = [rechnung({ id: 'RE-1' }), rechnung({ id: 'RE-2', gemahntAm: '2026-09-28', mahnstufe: 1 })];
    const lauf = mahnlauf(r, HEUTE, undefined);
    const imLauf = new Set(lauf.zeilen.map((z) => z.rechnung.id));
    const a = ueberfaelligNichtMahnbar(r, lauf, HEUTE);
    for (const z of a?.zeilen ?? []) expect(imLauf.has(z.key.replace('ueber-', ''))).toBe(false);
    expect((a?.anzahl ?? 0) + lauf.zeilen.length).toBe(2);
  });

  // Testbericht 30.09.2026, M24 — die Startseite der Buchhaltung zeigt die Finanzkennzahlen.
  const umfeld = (teil: Partial<Umfeld> = {}): Umfeld => ({
    rolle: 'buchhaltung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false, ...teil,
  });
  const schein = (id: string, tage: number) =>
    ({ schein: { id, projectNumber: 'PR-1', customerName: 'Kunde', datum: '2026-08-01' } as WorkSheet & { id: string }, tage });

  it('zeigt Offen, Überfällig, Nicht verrechnet und Bezahlt im Monat (M24)', () => {
    const s = startseite({
      unbezahlt: [
        rechnung({ id: 'RE-1', totalBrutto: 200, dueDate: '2026-10-14' }),
        rechnung({ id: 'RE-2', totalBrutto: 300, dueDate: '2026-10-20' }),
        rechnung({ id: 'RE-3', totalBrutto: 150, dueDate: '2026-09-15' }),
      ],
      unverrechnet: [schein('s1', 40), schein('s2', 3)],
      bezahltImMonat: { summe: 1234.5, anzahl: 4 },
    }, umfeld());

    expect(s.kennzahlen.map((k) => k.label)).toEqual(['Offen', 'Überfällig', 'Nicht verrechnet', 'Bezahlt im September']);
    const nach = new Map(s.kennzahlen.map((k) => [k.key, k]));
    expect(nach.get('offen')).toMatchObject({ wert: euro(500), zusatz: '2 Rechnungen', to: ZIEL.rechnungen });
    // Rot nur, wo etwas überfällig ist.
    expect(nach.get('ueberfaellig')).toMatchObject({
      wert: euro(150), zusatz: '1 Rechnung', to: ZIEL.rechnungenUeberfaellig, ton: 'danger',
    });
    expect(nach.get('unverrechnet')).toMatchObject({ wert: '2 Scheine', zusatz: 'davon 1 über 4 Wochen' });
    expect(nach.get('bezahlt')).toMatchObject({ wert: euro(1234.5), zusatz: '4 Rechnungen', to: ZIEL.rechnungenSicht('bezahlt-monat') });
  });

  it('Gegenprobe: ohne Überfälliges kein Rot — und ohne Recht auf Rechnungen keine Geldkennzahl (M24)', () => {
    const daten = { unbezahlt: [rechnung({ id: 'RE-1', dueDate: '2026-10-14' })], bezahltImMonat: { summe: 0, anzahl: 0 } };
    const ueber = startseite(daten, umfeld()).kennzahlen.find((k) => k.key === 'ueberfaellig');
    expect(ueber).toMatchObject({ wert: euro(0), zusatz: 'keine Rechnung' });
    expect(ueber?.ton).toBeUndefined();

    const ohne = startseite(daten, umfeld({ darf: (z) => !z.startsWith('/invoices') }));
    expect(ohne.kennzahlen).toEqual([]);
  });

  // Analyse 03.10.2026, Paket 1 — die eigenen Tage stehen nur einmal da.
  it('zeigt die eigene Person nicht zusätzlich unter „Personen mit Tagen ohne Buchung“', () => {
    const daten = {
      fehlendeTage: ['2026-10-12', '2026-10-13'],
      team: [
        { uid: 'ich', name: 'Bea Büro', fehlendeTage: 2, aeltesterTag: '2026-10-12' },
        { uid: 'max', name: 'Max Monteur', fehlendeTage: 1, aeltesterTag: '2026-10-13' },
      ],
    };
    const s = startseite(daten, umfeld({ ich: 'ich' }));
    const eigene = s.abschnitte.find((a) => a.titel === 'Deine Tage ohne Buchung');
    const team = s.abschnitte.find((a) => a.key === 'luecken');
    expect(eigene).toBeDefined();
    expect(team?.titel).toBe('Personen mit Tagen ohne Buchung');
    expect(team?.zeilen.map((z) => z.titel)).toEqual(['Max Monteur']);

    // Gegenprobe: ohne eigene Kennung stünde sie doppelt — genau der gemeldete Fall.
    const vorher = startseite(daten, umfeld());
    expect(vorher.abschnitte.find((a) => a.key === 'luecken')?.zeilen).toHaveLength(2);
  });
});

describe('Projektleitung', () => {
  const p = (teil: Partial<Project> & { projectNumber: string }) =>
    ({ id: teil.projectNumber, companyId: 'b', customerName: 'K', address: '', status: 'Aktiv', ...teil }) as Project;

  it('ohne Einsatz: nicht pausiert, nicht erst später begonnen, nicht schon beendet', () => {
    const liste = ohneEinsatzListe([
      p({ projectNumber: 'A' }),
      p({ projectNumber: 'B' }),
      p({ projectNumber: 'P', status: 'Pausiert' }),
      p({ projectNumber: 'S', startDate: '2026-12-01' }),
      p({ projectNumber: 'E', endDate: '2026-09-01' }),
    ], [
      { projectNumber: 'A', date: '2026-10-05' },
      { projectNumber: 'B', date: '2026-09-11' },
    ], HEUTE);
    expect(liste).toEqual([{ projectNumber: 'B', zuletzt: '2026-09-11' }]);
  });

  it('am Budget erst ab 90 %', () => {
    const a = budgetNahe([
      { projectNumber: 'A', titel: 'A', pct: 89, usedMin: 0, estimatedHours: 10 },
      { projectNumber: 'B', titel: 'B', pct: 112, usedMin: 0, estimatedHours: 10 },
      { projectNumber: 'C', titel: 'C', pct: 90, usedMin: 0, estimatedHours: 10 },
    ])!;
    expect(a.zeilen.map((z) => z.key)).toEqual(['budget-B', 'budget-C']);
  });

  it('Wartungen: überfällige zuerst und rot, eingeplante gar nicht', () => {
    const w = (teil: Partial<Wartung> & { id: string }) =>
      ({ companyId: 'b', customerId: 'k', customerName: 'Koller', anlage: 'Therme', intervallMonate: 12, faelligAm: HEUTE, aktiv: true, ...teil }) as Wartung;
    const a = wartungenOhneBaustelle([
      w({ id: 'bald', faelligAm: '2026-10-03' }),
      w({ id: 'weg', faelligAm: '2026-09-22' }),
      w({ id: 'geplant', faelligAm: '2026-09-20', offeneBaustelle: 'PR-9' }),
    ], HEUTE)!;
    expect(a.zeilen.map((z) => z.key)).toEqual(['wartung-weg', 'wartung-bald']);
    expect(a.zeilen[0].status?.ton).toBe('fehl');
    expect(a.zeilen[1].status).toEqual({ text: 'diese Woche', ton: 'warn' });
  });

  it('Auslastung: verplante durch verfügbare Personentage, ohne Feiertag und Abwesenheit', () => {
    const woche = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
    const leute = [
      { uid: 'a', role: 'Mitarbeiter' as const, active: true },
      { uid: 'b', role: 'Mitarbeiter' as const, active: true },
      { uid: 'c', role: 'Buchhaltung' as const, active: true },
    ];
    // 26.10. Nationalfeiertag: 2 × 4 Tage = 8, b am Freitag krank: 7 verfügbar.
    const wert = auslastung(leute, null, [
      { userId: 'a', date: '2026-10-27' },
      { userId: 'a', date: '2026-10-27' },
      { userId: 'b', date: '2026-10-28' },
      { userId: 'b', date: '2026-10-30' },
      { userId: 'c', date: '2026-10-28' },
    ], [{ userId: 'b', von: '2026-10-30', bis: '2026-10-30', grund: 'Krank', zeiten: null }], woche);
    expect(wert).toBe(Math.round((2 / 7) * 100));
  });
});

describe('Geschäftsführung und Administrator', () => {
  const umfeld = (teil: Partial<Umfeld> = {}): Umfeld => ({
    rolle: 'leitung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: true, ...teil,
  });

  it('ordnet Themen nach Überfällig, Heute, Diese Woche — je höchstens drei, der Rest klappt auf', () => {
    const abschnitte = themenAbschnitte(Array.from({ length: 5 }, (_, i) => ({
      key: `t${i}`, titel: `T${i}`, wann: i === 0 ? 'ueberfaellig' as const : 'woche' as const, to: '/x',
    })));
    expect(abschnitte.map((a) => a.titel)).toEqual(['Überfällig', 'Diese Woche']);
    expect(abschnitte[1].weiter && 'aufklappen' in abschnitte[1].weiter).toBe(true);
  });

  it('Lagerarbeit nur, wenn der Betrieb keine Verwaltung hat', () => {
    const orders = [anf({ id: 'o' })];
    const mit = startseite({ orders, hatVerwaltung: true }, umfeld());
    const ohne = startseite({ orders, hatVerwaltung: false }, umfeld());
    const titel = (s: typeof mit) => s.abschnitte.flatMap((a) => [...a.zeilen, ...(a.weiter && 'aufklappen' in a.weiter ? a.weiter.aufklappen : [])].map((z) => z.titel));
    expect(titel(mit).some((t) => /Anforderung/.test(t))).toBe(false);
    expect(titel(ohne).some((t) => /1 Anforderung offen/.test(t))).toBe(true);
  });

  it('der fehlende Basiszinssatz steht unter Überfällig', () => {
    const s = startseite({ basiszinsFehltAb: '2026-07-01' }, umfeld());
    expect(s.abschnitte[0].titel).toBe('Überfällig');
    expect(s.abschnitte[0].zeilen[0].titel).toBe('Basiszinssatz ab 01.07. fehlt');
    expect(s.zaehlwort).toBe('Thema');
  });

  it('keine Zeile auf eine Seite, die die Rolle nicht sehen darf', () => {
    const s = startseite({ orders: [anf({ id: 'o', isUrgent: true })], hatVerwaltung: false }, umfeld({ darf: (z) => !z.startsWith('/anforderungen') }));
    expect(s.abschnitte).toEqual([]);
  });
});

describe('Personen: Lehrzeit und Leitung ohne E-Mail', () => {
  const person = (teil: Partial<AppUser> & { uid: string }): AppUser => ({
    id: teil.uid, companyId: 'b', name: teil.uid, email: `${teil.uid}@betrieb.at`, role: 'Mitarbeiter', active: true, ...teil,
  });
  // Lehrbeginn 01.11.2023, 36 Monate → letzter Tag 31.10.2026 (31 Tage nach dem 30.09.).
  const lehrling = (uid: string, lehrbeginn: string, teil: Partial<AppUser> = {}) =>
    person({ uid, einstufung: 'lehrling', lehrbeginn, lehrzeitMonate: 36, ...teil });

  it('nennt Lehrzeiten, die in 30 Tagen enden oder schon geendet haben, früheste zuerst', () => {
    const z = lehrzeitEnden([
      lehrling('bald', '2023-10-30'), // Ende 29.10.2026, in 29 Tagen
      lehrling('vorbei', '2023-09-01'), // Ende 31.08.2026
      lehrling('genau', '2023-10-31'), // Ende 30.10.2026, in 30 Tagen
    ], HEUTE);
    expect(z.map((x) => [x.uid, x.ende])).toEqual([
      ['vorbei', '2026-08-31'], ['bald', '2026-10-29'], ['genau', '2026-10-30'],
    ]);
  });

  it('Gegenprobe: später endend, umgestuft, ohne Lehrbeginn oder deaktiviert — keine Zeile', () => {
    expect(lehrzeitEnden([
      lehrling('spaeter', '2023-11-01'), // Ende 31.10.2026, in 31 Tagen
      lehrling('umgestuft', '2023-09-01', { einstufung: 'facharbeiter' }),
      lehrling('ohne', '2023-09-01', { lehrbeginn: null }),
      lehrling('weg', '2023-09-01', { active: false }),
    ], HEUTE)).toEqual([]);
  });

  it('meldet die einzige Leitung, wenn sie keine E-Mail hat', () => {
    const chef = person({ uid: 'chef', role: 'Administrator', email: 'chef@benutzer.senklot.invalid' });
    expect(einzigeLeitungOhneMail([chef, person({ uid: 'm' })])).toBe(true);
    // Eine deaktivierte zweite Leitung hilft nicht.
    expect(einzigeLeitungOhneMail([chef, person({ uid: 'alt', role: 'Geschäftsführung', active: false })])).toBe(true);
  });

  it('Gegenprobe: Leitung mit E-Mail oder eine zweite Leitung — keine Meldung', () => {
    const ohne = person({ uid: 'chef', role: 'Administrator', email: 'chef@benutzer.senklot.invalid' });
    expect(einzigeLeitungOhneMail([person({ uid: 'chefin', role: 'Geschäftsführung' })])).toBe(false);
    expect(einzigeLeitungOhneMail([ohne, person({ uid: 'gf', role: 'Geschäftsführung', email: 'gf@benutzer.senklot.invalid' })])).toBe(false);
    expect(einzigeLeitungOhneMail([])).toBe(false);
  });

  const umfeld = (teil: Partial<Umfeld> = {}): Umfeld => ({
    rolle: 'leitung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false, ...teil,
  });
  const zeilen = (s: ReturnType<typeof startseite>) =>
    s.abschnitte.flatMap((a) => [...a.zeilen, ...(a.weiter && 'aufklappen' in a.weiter ? a.weiter.aufklappen : [])]);

  it('eine Lehrzeit führt in die Akte; eine vergangene steht unter Überfällig', () => {
    const bald = startseite({ lehrzeitEnden: [{ uid: 'u1', name: 'Anna Huber', ende: '2026-10-29' }] }, umfeld());
    expect(bald.abschnitte[0].titel).toBe('Diese Woche');
    expect(zeilen(bald)[0]).toMatchObject({ titel: 'Lehrzeit von Anna Huber endet am 29.10.', to: '/user-mgmt/u1' });

    const vorbei = startseite({ lehrzeitEnden: [{ uid: 'u1', name: 'Anna Huber', ende: '2026-08-31' }] }, umfeld());
    expect(vorbei.abschnitte[0].titel).toBe('Überfällig');
    expect(zeilen(vorbei)[0].titel).toBe('Lehrzeit von Anna Huber endete am 31.08.');
  });

  it('mehrere Lehrzeiten führen in die Benutzerverwaltung und nennen alle', () => {
    const s = startseite({ lehrzeitEnden: [
      { uid: 'u1', name: 'Anna', ende: '2026-10-10' }, { uid: 'u2', name: 'Ben', ende: '2026-10-20' },
    ] }, umfeld());
    expect(zeilen(s)[0]).toMatchObject({ titel: '2 Lehrzeiten enden', detail: 'Anna 10.10., Ben 20.10.', to: '/user-mgmt' });
  });

  it('die Leitung ohne E-Mail steht unter Diese Woche — und nur, wo die Benutzerverwaltung offen ist', () => {
    const s = startseite({ einzigeLeitungOhneMail: true }, umfeld());
    expect(zeilen(s)[0]).toMatchObject({ titel: 'Nur ein Leitungskonto, ohne E-Mail', to: '/user-mgmt' });
    expect(startseite({ einzigeLeitungOhneMail: true }, umfeld({ darf: (z) => !z.startsWith('/user-mgmt') })).abschnitte).toEqual([]);
  });
});

describe('Die Ziele der Startseite', () => {
  const ziele = [
    ZIEL.zeitFehlend, ZIEL.zeitTag(HEUTE), ZIEL.meineAbholbereit, ZIEL.lagerKnapp, ZIEL.rechnungenUeberfaellig,
    ZIEL.rechnung('RE-1'), ZIEL.schein('s1'), ZIEL.luecken('2026-09'), ZIEL.urlaubsantraege, ZIEL.tag(HEUTE, 'unbesetzt'),
    ZIEL.woche, ZIEL.baustelle('PR-1'), ZIEL.wartungenOhneBaustelle, ZIEL.einsatzplan,
    ...ANFORDERUNGS_FILTER.map(ZIEL.anforderungen), ...BAUSTELLEN_FILTER.map(ZIEL.baustellen),
    ...SCHEIN_FILTER.map(ZIEL.scheine), ...RECHNUNGS_SICHTEN.map(ZIEL.rechnungenSicht),
    ZIEL.einstellungen('saetze'), ZIEL.einstellungen('konten'), ZIEL.einstellungen('firma'),
    ZIEL.benutzerverwaltung, ZIEL.benutzer('u1'),
  ];

  it.each(ziele)('%s ist eine bekannte Seite', (ziel) => {
    // Der Administrator sieht jede Seite; ein unbekannter Pfad wäre ein Link ins Leere.
    const rolle = ziel.startsWith('/my-schedule') ? 'Mitarbeiter' : 'Administrator';
    expect(darfZiel(rolle, ziel)).toEqual({ ok: true });
  });

  it('der Grundpfad entscheidet über die Sichtbarkeit — wie im Menü', () => {
    expect(grundpfad('/assignments/tag?datum=2026-09-30')).toBe('/assignments');
    expect(canAccess('Verwaltung', grundpfad(ZIEL.anforderungen('offen')))).toBe(true);
    expect(canAccess('Mitarbeiter', grundpfad(ZIEL.anforderungen('offen')))).toBe(false);
  });
});
