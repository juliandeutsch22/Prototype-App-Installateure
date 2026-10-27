import { describe, it, expect } from 'vitest';
import type { AppUser, Freistellung, Invoice, MaterialOrder, Project, Wartung, WorkSheet } from '@/types';
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
  garantienBald,
  type GarantieZeile,
} from '@/features/dashboard/start/regeln';
import { auslastung } from '@/features/dashboard/start/laden';
import { budgetStand } from '@/features/projects/baustellenLage';
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

  /*
    RESTPUNKT AUS RUNDE 5, M2: sperren die Firmendaten jede Rechnung, sieht
    das auch die Buchhaltung — sie schreibt die Rechnungen, ergänzen kann sie
    die Daten nicht. Darum ganz vorn und mit dem Hinweis, wer es tut.
  */
  it('nennt eine Rechnungssperre durch Firmendaten ganz vorn — und wer sie aufhebt', () => {
    const s = startseite({ firmaSperrt: ['gültige IBAN'], basiszinsFehltAb: '2026-07-01' }, umfeld());
    expect(s.abschnitte[0].titel).toBe('Keine Rechnung möglich');
    expect(s.abschnitte[0].zeilen[0]).toMatchObject({
      key: 'firma',
      titel: 'Firmendaten unvollständig',
      detail: 'fehlt: gültige IBAN — die Geschäftsführung ergänzt sie in den Firmendaten',
      status: { text: 'gesperrt', ton: 'fehl' },
      to: ZIEL.rechnungen,
    });
  });

  it('Gegenprobe: was nur warnt oder gar nicht fehlt, steht bei der Buchhaltung nicht', () => {
    for (const d of [{ firmaFehlt: ['Firmenbuchgericht'], firmaSperrt: [] }, {}]) {
      const s = startseite(d, umfeld());
      expect(s.abschnitte.flatMap((a) => a.zeilen).some((z) => z.key === 'firma')).toBe(false);
    }
  });

  it('zeigt Offen, Überfällig und Bezahlt im Monat (M24) — „Nicht verrechnet“ steht unter Zu erledigen (E22)', () => {
    const s = startseite({
      unbezahlt: [
        rechnung({ id: 'RE-1', totalBrutto: 200, dueDate: '2026-10-14' }),
        rechnung({ id: 'RE-2', totalBrutto: 300, dueDate: '2026-10-20' }),
        rechnung({ id: 'RE-3', totalBrutto: 150, dueDate: '2026-09-15' }),
      ],
      unverrechnet: [schein('s1', 40), schein('s2', 3)],
      bezahltImMonat: { summe: 1234.5, anzahl: 4 },
    }, umfeld());

    expect(s.kennzahlen.map((k) => k.label)).toEqual(['Offen', 'Überfällig', 'Bezahlt im September']);
    const nach = new Map(s.kennzahlen.map((k) => [k.key, k]));
    expect(nach.get('offen')).toMatchObject({ wert: euro(500), zusatz: '2 Rechnungen', to: ZIEL.rechnungen });
    // Rot nur, wo etwas überfällig ist.
    expect(nach.get('ueberfaellig')).toMatchObject({
      wert: euro(150), zusatz: '1 Rechnung', to: ZIEL.rechnungenUeberfaellig, ton: 'danger',
    });
    const verrechnen = s.abschnitte.find((a) => a.key === 'verrechnen');
    expect(verrechnen?.zeilen.find((z) => z.key === 'scheine')).toMatchObject({
      titel: '2 Scheine nicht verrechnet', detail: 'davon 1 über 4 Wochen',
      status: { text: 'verrechnen', ton: 'warn' }, to: ZIEL.scheine('nicht-verrechnet'),
    });
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

  /*
    DIE STAND-ZEILE (E22, 25.10.2026) lässt aus, wo nichts zu tun ist. Die
    Entscheidung trifft der Aufbau, nicht die Darstellung: nur er weiß, ob
    „€ 0,00“ eine leere Arbeitsliste ist oder ein Rücklass, der noch zählt.
  */
  it('markiert leere Arbeitszahlen als leer — Bezahlt im Monat nie (E22)', () => {
    const s = startseite({ unbezahlt: [], unverrechnet: [], bezahltImMonat: { summe: 0, anzahl: 0 } }, umfeld());
    const nach = new Map(s.kennzahlen.map((k) => [k.key, k]));
    expect(nach.get('offen')?.leer).toBe(true);
    expect(nach.get('ueberfaellig')?.leer).toBe(true);
    // Auch null Eingänge sind eine Auskunft über den Monat.
    expect(nach.get('bezahlt')?.leer).toBeUndefined();
  });

  it('Gegenprobe: was offen oder überfällig ist, bleibt stehen (E22)', () => {
    const s = startseite({
      unbezahlt: [rechnung({ id: 'RE-1', totalBrutto: 200, dueDate: '2026-10-14' })],
      unverrechnet: [schein('s1', 3)],
    }, umfeld());
    const nach = new Map(s.kennzahlen.map((k) => [k.key, k]));
    expect(nach.get('offen')?.leer).toBe(false);
    expect(nach.get('ueberfaellig')?.leer).toBe(true);
  });

  it('Gegenprobe: ein überfälliger Rücklass-Rest hält „Überfällig“ in der Zeile (E22)', () => {
    const s = startseite({
      unbezahlt: [rechnung({
        id: 'RE-4', totalBrutto: 1200, dueDate: '2026-09-15',
        ruecklassArt: 'haft', ruecklassProzent: 5, ruecklassBetrag: 60, ruecklassBis: '2029-09-01',
      })],
    }, umfeld());
    expect(s.kennzahlen.find((k) => k.key === 'ueberfaellig')?.leer).toBe(false);
  });

  /*
    NICHT VERRECHNET IST ARBEIT, KEIN STAND (E22, 25.10.2026). Die Zahl
    stand im Stand und unter „Zu erledigen“ nur ab vier Wochen. Jetzt fehlt sie
    im Stand und steht unter „Zu erledigen“ immer — frisch ruhig, alt mit
    Achtung-Punkt.
  */
  it('Stand ohne „Nicht verrechnet“ — die Scheine stehen unter Zu erledigen (E22)', () => {
    const s = startseite({ unverrechnet: [schein('s1', 40)] }, umfeld());
    expect(s.kennzahlen.some((k) => k.key === 'unverrechnet')).toBe(false);
    expect(s.abschnitte.find((a) => a.key === 'verrechnen')?.zeilen[0]).toMatchObject({ key: 'scheine', titel: '1 Schein nicht verrechnet' });
  });

  it('Buchhaltung: auch ein frischer Schein steht da — ruhig, ohne Achtung-Punkt (E22)', () => {
    const s = startseite({ unverrechnet: [schein('s1', 3), schein('s2', 10)] }, umfeld());
    expect(s.abschnitte.find((a) => a.key === 'verrechnen')?.zeilen).toEqual([expect.objectContaining({
      key: 'scheine', titel: '2 Scheine nicht verrechnet', detail: 'alle jünger als 4 Wochen',
      status: { text: 'verrechnen', ton: 'leise' }, to: ZIEL.scheine('nicht-verrechnet'),
    })]);
  });

  it('Geschäftsführung: ein Thema unter „Diese Woche“, frisch ruhig, alt mit Achtung-Punkt (E22)', () => {
    const leitung = (d: Parameters<typeof startseite>[0]) => startseite(d, umfeld({ rolle: 'leitung' }));
    const thema = (d: Parameters<typeof startseite>[0]) =>
      leitung(d).abschnitte.flatMap((a) => [...a.zeilen, ...(a.weiter && 'aufklappen' in a.weiter ? a.weiter.aufklappen : [])])
        .find((z) => z.key === 'scheine');
    expect(thema({ unverrechnet: [schein('s1', 3)] })).toMatchObject({ detail: 'alle jünger als 4 Wochen', status: { ton: 'leise' } });
    expect(thema({ unverrechnet: [schein('s1', 3), schein('s2', 40)] })).toMatchObject({ detail: 'davon 1 über 4 Wochen', status: { ton: 'warn' } });
    expect(leitung({ unverrechnet: [schein('s1', 3)] }).kennzahlen.some((k) => k.key === 'unverrechnet')).toBe(false);
  });

  it('Gegenprobe: ohne nicht verrechnete Scheine und Stunden kein Abschnitt (E22)', () => {
    expect(startseite({ unverrechnet: [], offeneStunden: [] }, umfeld()).abschnitte.some((a) => a.key === 'verrechnen')).toBe(false);
  });

  // Rücklass (05.10.2026): der nicht fällige Teil einer überfälligen Rechnung bleibt offen.
  it('ein noch nicht fälliger Rücklass zählt unter „Offen“, samt seiner Rechnung', () => {
    const s = startseite({
      unbezahlt: [rechnung({
        id: 'RE-4', totalBrutto: 1200, dueDate: '2026-09-15',
        ruecklassArt: 'haft', ruecklassProzent: 5, ruecklassBetrag: 60, ruecklassBis: '2029-09-01',
      })],
    }, umfeld());
    const nach = new Map(s.kennzahlen.map((k) => [k.key, k]));
    expect(nach.get('ueberfaellig')).toMatchObject({ wert: euro(1140), zusatz: '1 Rechnung' });
    expect(nach.get('offen')).toMatchObject({ wert: euro(60), zusatz: '1 Rechnung' });
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
    // Paket 2: auch die Buchhaltung bekommt den fehlenden Basiszinssatz — sie pflegt ihn.
    const zins = startseite({ basiszinsFehltAb: '2026-07-01' }, umfeld({ ich: 'ich' }));
    expect(zins.abschnitte.find((a) => a.key === 'basiszins')?.zeilen[0]).toMatchObject({
      titel: 'Basiszinssatz ab 01.07.2026 fehlt', to: ZIEL.einstellungen('rechnung'),
    });

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

  /*
    STD:MIN WIE ÜBERALL (Testbericht Runde 6, G11): „25,0 von 12 Std“ stand
    nur hier als Dezimalzahl. Gegenprobe: mit `fmtStd` und `fmtStunden` steht
    wieder „27,9 von 30 Std“.
  */
  it('nennt verbrauchte und geplante Stunden in Std:Min', () => {
    const a = budgetNahe([
      { projectNumber: 'PR-2026-0001', titel: 'Huber', pct: 93, usedMin: 1675, estimatedHours: 30 },
      { projectNumber: 'PR-2026-0189', titel: 'CT Bau', pct: 208, usedMin: 1500, estimatedHours: 12.5 },
    ])!;
    expect(a.zeilen.map((z) => z.detail)).toEqual([
      'PR-2026-0189 · 25:00 Std von 12:30 Std',
      'PR-2026-0001 · 27:55 Std von 30:00 Std',
    ]);
  });

  /*
    TESTBERICHT RUNDE 5, M1. Die Kennzahl sagt „alle im Budget“ nur, wenn der
    Budgetstand geladen ist — und rechnet aus Summen aller Buchungen
    (`budgetStand` aus `stundenDerBaustellen`), nicht aus den eigenen.
  */
  describe('Kennzahl „Aktive Baustellen“', () => {
    const umfeld = (): Umfeld => ({
      rolle: 'projektleitung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false,
    });
    const kennzahl = (budget: ReturnType<typeof budgetStand> | undefined) =>
      startseite({ projekte: [p({ projectNumber: 'A', estimatedHours: 8 })], budget }, umfeld())
        .kennzahlen.find((k) => k.key === 'baustellen');

    it('zählt die Stunden aller, nicht nur die eigenen', () => {
      // 18:45 Std bei 8 Std Budget — zwei Personen, die Art entscheidet.
      const budget = budgetStand([p({ projectNumber: 'PR-A', estimatedHours: 8 })], [
        { projectNumber: 'A', art: 'fach', minuten: 600 },
        { projectNumber: 'A', art: 'fach', minuten: 525 },
        { projectNumber: 'A', art: 'helfer', minuten: 600 },
        { projectNumber: 'A', art: 'lehrling', minuten: 600 },
        { projectNumber: 'B', art: 'fach', minuten: 9999 },
      ]);
      expect(budget).toEqual([expect.objectContaining({ projectNumber: 'PR-A', usedMin: 1125, pct: 234 })]);
      expect(kennzahl(budget)?.zusatz).toBe('1 am Budgetlimit');
    });

    it('Gegenprobe: im Rahmen heißt weiter „alle im Budget“', () => {
      expect(kennzahl(budgetStand([p({ projectNumber: 'A', estimatedHours: 8 })], [
        { projectNumber: 'A', art: 'fach', minuten: 60 },
      ]))?.zusatz).toBe('alle im Budget');
    });

    it('ohne geladenen Budgetstand keine Entwarnung', () => {
      const k = kennzahl(undefined);
      expect(k?.wert).toBe(1);
      expect(k?.zusatz).toBeUndefined();
    });
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

  it('ordnet Themen nach Dringend, Heute, Diese Woche — je höchstens drei, der Rest klappt auf', () => {
    const abschnitte = themenAbschnitte(Array.from({ length: 5 }, (_, i) => ({
      key: `t${i}`, titel: `T${i}`, wann: i === 0 ? 'ueberfaellig' as const : 'woche' as const, to: '/x',
    })));
    expect(abschnitte.map((a) => a.titel)).toEqual(['Dringend', 'Diese Woche']);
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

  it('der fehlende Basiszinssatz steht unter Dringend', () => {
    const s = startseite({ basiszinsFehltAb: '2026-07-01' }, umfeld());
    expect(s.abschnitte[0].titel).toBe('Dringend');
    expect(s.abschnitte[0].zeilen[0].titel).toBe('Basiszinssatz ab 01.07. fehlt');
    expect(s.zaehlwort).toBe('Thema');
  });

  /*
    TESTBERICHT RUNDE 5, M2 — sperren die Firmendaten jede Rechnung, steht das
    ganz vorn unter „Dringend“ und in Rot, vor allem anderen.
  */
  describe('Firmendaten für Rechnungen (Runde 5, M2)', () => {
    const viel = {
      basiszinsFehltAb: '2026-07-01',
      fehlendeTage: ['2026-09-28'],
      unbezahlt: [{ id: 'RE-1', invoiceNumber: 'RE-1', customerName: 'K', paymentStatus: 'Offen', totalBrutto: 100,
        invoiceDate: '2026-07-01', dueDate: '2026-07-15', mahnstufe: 0 } as Invoice & { id: string }],
    };

    it('sperren sie jede Rechnung: ganz vorn unter „Dringend“, in Rot, mit allem, was fehlt', () => {
      const s = startseite({ ...viel, firmaFehlt: ['gültige IBAN', 'Firmenbuchgericht'], firmaSperrt: ['gültige IBAN'] }, umfeld());
      expect(s.abschnitte[0].titel).toBe('Dringend');
      expect(s.abschnitte[0].zeilen[0]).toMatchObject({
        key: 'firma',
        titel: 'Keine Rechnung möglich: Firmendaten unvollständig',
        detail: 'fehlt: gültige IBAN, Firmenbuchgericht',
        status: { text: 'ergänzen', ton: 'fehl' },
        to: ZIEL.einstellungen('firma'),
      });
      // Nur einmal, nicht zusätzlich unter „Diese Woche“.
      const alle = s.abschnitte.flatMap((a) => [...a.zeilen, ...(a.weiter && 'aufklappen' in a.weiter ? a.weiter.aufklappen : [])]);
      expect(alle.filter((z) => z.key === 'firma')).toHaveLength(1);
    });

    it('Gegenprobe: was nur warnt, bleibt leise unter „Diese Woche“', () => {
      const s = startseite({ firmaFehlt: ['Firmenbuchgericht'], firmaSperrt: [] }, umfeld());
      expect(s.abschnitte.map((a) => a.titel)).toEqual(['Diese Woche']);
      expect(s.abschnitte[0].zeilen[0]).toMatchObject({
        key: 'firma', titel: 'Firmendaten für Rechnungen unvollständig', status: { text: 'ergänzen', ton: 'leise' },
      });
    });
  });

  // Paket 2 (03.10.2026) — ein Reiter für Buchhaltung und Leitung.
  it('führt beim fehlenden Basiszinssatz auf „Rechnungsvorgaben“', () => {
    const s = startseite({ basiszinsFehltAb: '2026-07-01' }, umfeld());
    expect(s.abschnitte[0].zeilen[0]).toMatchObject({ to: ZIEL.einstellungen('rechnung'), detail: 'Einstellungen · Rechnungsvorgaben' });
  });

  // Korrektur zu Paket 1: auch die Leitung hat ihre eigenen Tage schon als Thema.
  it('zählt die eigene Person nicht zusätzlich unter „Personen mit Tagen ohne Buchung“', () => {
    const daten = {
      fehlendeTage: ['2026-10-12'],
      team: [
        { uid: 'chef', name: 'Chefin', fehlendeTage: 1, aeltesterTag: '2026-10-12' },
        { uid: 'max', name: 'Max Monteur', fehlendeTage: 2, aeltesterTag: '2026-10-12' },
      ],
    };
    const zeilen = (x: ReturnType<typeof startseite>) =>
      x.abschnitte.flatMap((a) => [...a.zeilen, ...(a.weiter && 'aufklappen' in a.weiter ? a.weiter.aufklappen : [])]);
    const mit = zeilen(startseite(daten, umfeld({ ich: 'chef' })));
    expect(mit.find((z) => z.key === 'eigene-tage')).toBeDefined();
    expect(mit.find((z) => z.key === 'luecken')?.titel).toBe('1 Person mit Tagen ohne Buchung');
    // Gegenprobe: ohne eigene Kennung zählte sie doppelt.
    const ohne = zeilen(startseite(daten, umfeld()));
    expect(ohne.find((z) => z.key === 'luecken')?.titel).toBe('2 Personen mit Tagen ohne Buchung');
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

  it('eine Lehrzeit führt in die Akte; eine vergangene steht unter Dringend', () => {
    const bald = startseite({ lehrzeitEnden: [{ uid: 'u1', name: 'Anna Huber', ende: '2026-10-29' }] }, umfeld());
    expect(bald.abschnitte[0].titel).toBe('Diese Woche');
    expect(zeilen(bald)[0]).toMatchObject({ titel: 'Lehrzeit von Anna Huber endet am 29.10.', to: '/user-mgmt/u1' });

    const vorbei = startseite({ lehrzeitEnden: [{ uid: 'u1', name: 'Anna Huber', ende: '2026-08-31' }] }, umfeld());
    expect(vorbei.abschnitte[0].titel).toBe('Dringend');
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

describe('Sonderurlaub auf der Startseite (Plan 10.3)', () => {
  const antrag = (id: string, art: Freistellung['art'], von: string) => ({
    id, companyId: 'perl', userId: `u-${id}`, userName: `Person ${id}`, art, von, bis: von, status: 'Beantragt' as const,
  }) as Freistellung;
  const daten = { freistellungen: [antrag('a', 'dienstverhinderung', '2026-11-11'), antrag('b', 'unbezahlt', '2026-11-16')] };

  it('die Buchhaltung sieht offenen Sonderurlaub — ohne den unbezahlten, über den sie nicht entscheidet', () => {
    const s = startseite(daten, {
      rolle: 'buchhaltung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false, freistellungBestaetigen: true,
    });
    const ab = s.abschnitte.find((a) => a.key === 'sonderurlaub');
    expect(ab?.zeilen.map((z) => z.titel)).toEqual(['Person a']);
    expect(ab?.zeilen[0].detail).toContain('Sonderurlaub');
    // Den Anlass nie auf der Startseite.
    expect(JSON.stringify(ab)).not.toMatch(/hochzeit|Eheschließung/);
  });

  it('Gegenprobe: ohne das Recht kein Abschnitt', () => {
    const s = startseite(daten, {
      rolle: 'buchhaltung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false,
    });
    expect(s.abschnitte.find((a) => a.key === 'sonderurlaub')).toBeUndefined();
  });

  it('die Leitung sieht beide als ein Thema', () => {
    const s = startseite(daten, {
      rolle: 'leitung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: true, freistellungBestaetigen: true,
    });
    const zeilen = s.abschnitte.flatMap((a) => a.zeilen);
    expect(zeilen.some((z) => z.titel === '2 Anträge auf Sonderurlaub')).toBe(true);
  });
  // A15 (24.10.2026): ohne das Modul Urlaub führt der Abschnitt auf die eigene Seite.
  it('ohne das Modul Urlaub führt der Sonderurlaub auf seine eigene Seite — Abschnitt und Thema', () => {
    const b = startseite(daten, {
      rolle: 'buchhaltung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false,
      freistellungBestaetigen: true, sonderurlaubZiel: ZIEL.sonderurlaub,
    });
    expect(b.abschnitte.find((a) => a.key === 'sonderurlaub')?.zeilen[0].to).toBe('/sonderurlaub');
    const l = startseite(daten, {
      rolle: 'leitung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false,
      freistellungBestaetigen: true, sonderurlaubZiel: ZIEL.sonderurlaub,
    });
    expect(JSON.stringify(l)).toContain('/sonderurlaub');
  });

  it('bleibt gleich: mit dem Modul Urlaub auf die Urlaubsseite', () => {
    const s = startseite(daten, {
      rolle: 'buchhaltung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false, freistellungBestaetigen: true,
    });
    expect(s.abschnitte.find((a) => a.key === 'sonderurlaub')?.zeilen[0].to).toBe(ZIEL.urlaubsantraege);
  });
});

/*
  BANKGARANTIE ENDET (10.10.2026). Endet die Garantie, mit der ein Rücklass
  abgelöst wurde, gehört die Urkunde zurück — sonst verrechnet die Bank
  weiter. 30 Tage davor „endet“, bis 30 Tage danach „Urkunde zurückfordern“.
*/
describe('Bankgarantie endet', () => {
  const g = (teil: Partial<GarantieZeile> & { id: string }): GarantieZeile => ({
    invoiceNumber: `RE-${teil.id}`, customerName: `Kunde ${teil.id}`, paymentStatus: 'Bezahlt',
    ruecklassGarantieAm: '2026-03-01', ruecklassGarantieBank: 'Raiffeisen', ruecklassGarantieNr: 'G-1',
    ruecklassGarantieBis: '2026-10-15', ...teil,
  });
  const umfeldB = (rolle: Umfeld['rolle']): Umfeld => ({
    rolle, heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false,
  });

  it('die Buchhaltung sieht, was bald endet, und was zurückzufordern ist — das Älteste zuerst', () => {
    const s = startseite({
      garantien: [g({ id: '1', ruecklassGarantieBis: '2026-10-15' }), g({ id: '2', ruecklassGarantieBis: '2026-09-20' })],
    }, umfeldB('buchhaltung'));
    const a = s.abschnitte.find((x) => x.titel === 'Bankgarantie endet')!;
    expect(a.zeilen.map((z) => [z.key, z.detail, z.status])).toEqual([
      ['garantie-2', 'RE-2 · Bankgarantie · Raiffeisen · G-1', { text: 'seit 20.09. — Urkunde zurückfordern', ton: 'warn' }],
      ['garantie-1', 'RE-1 · Bankgarantie · Raiffeisen · G-1', { text: 'endet 15.10.', ton: 'warn' }],
    ]);
    expect(a.zeilen[0].to).toBe(ZIEL.rechnung('RE-2'));
  });

  it('Gegenprobe: zu früh, zu lange vorbei, storniert oder nie abgelöst — keine Zeile', () => {
    const s = startseite({
      garantien: [
        g({ id: '3', ruecklassGarantieBis: '2026-11-01' }),
        g({ id: '4', ruecklassGarantieBis: '2026-08-30' }),
        g({ id: '5', paymentStatus: 'Storniert' }),
        g({ id: '6', ruecklassGarantieAm: undefined }),
      ],
    }, umfeldB('buchhaltung'));
    expect(s.abschnitte.some((x) => x.titel === 'Bankgarantie endet')).toBe(false);
    // Die Grenzen selbst zählen noch: 30 Tage davor und danach.
    expect(garantienBald([g({ id: '7', ruecklassGarantieBis: '2026-10-30' }), g({ id: '8', ruecklassGarantieBis: '2026-08-31' })], HEUTE)
      .map((x) => x.id)).toEqual(['8', '7']);
  });

  it('die Leitung sieht es als Thema der Woche', () => {
    const s = startseite({ garantien: [g({ id: '2', ruecklassGarantieBis: '2026-09-20' }), g({ id: '1' })] }, umfeldB('leitung'));
    const alle = s.abschnitte.flatMap((a) => [...a.zeilen, ...(a.weiter && 'aufklappen' in a.weiter ? a.weiter.aufklappen : [])]);
    expect(alle.find((z) => z.key === 'garantie')).toMatchObject({
      titel: '2 Bankgarantien enden', detail: '1 Urkunde zurückfordern', status: { text: 'seit 20.09.', ton: 'warn' },
    });
  });
});

/*
  UNVERRECHNETE STUNDEN (23.10.2026). Eine Regiebaustelle über Wochen hat
  nicht für jede Buchung einen Schein — auf der Startseite fiel sie bisher
  nur über Scheine auf. Jetzt auch über ihre ältesten offenen Stunden.
*/
describe('Unverrechnete Stunden auf der Startseite', () => {
  const stunden = (nr: string, tage: number, kunde = 'Familie Huber') => ({
    stunden: { projectNumber: nr, kunde, minuten: 2550, aeltester: '2026-08-01' }, tage,
  });
  const buch = (teil: Partial<Umfeld> = {}): Umfeld => ({
    rolle: 'buchhaltung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false, ...teil,
  });
  const leitung = (teil: Partial<Umfeld> = {}): Umfeld => ({
    rolle: 'leitung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false, ...teil,
  });
  const alleZeilen = (s: ReturnType<typeof startseite>) =>
    s.abschnitte.flatMap((a) => [...a.zeilen, ...(a.weiter && 'aufklappen' in a.weiter ? a.weiter.aufklappen : [])]);

  /*
    SEIT E22 EINE SAMMELZEILE im Abschnitt „Nicht verrechnet“, für alle
    offenen Stunden, nicht nur die alten. Bei einer Baustelle führt sie direkt
    zu „Neue Rechnung“ mit ihr und nennt Kunde, Stunden und ältesten Tag.
  */
  it('Buchhaltung: eine Sammelzeile unter „Nicht verrechnet“ — bei einer Baustelle direkt zu ihrer Rechnung', () => {
    const eine = startseite({ offeneStunden: [stunden('2026-042', 60)] }, buch());
    const a = eine.abschnitte.find((x) => x.key === 'verrechnen')!;
    expect(a.titel).toBe('Nicht verrechnet');
    expect(a.zeilen).toEqual([expect.objectContaining({
      key: 'stunden',
      titel: '1 Baustelle mit Stunden nicht verrechnet',
      detail: 'Familie Huber · 42:30 Std seit 01.08.2026',
      status: { text: 'verrechnen', ton: 'warn' },
      to: '/invoices?neu=2026-042',
    })]);
    const zwei = startseite({ offeneStunden: [stunden('2026-042', 60), stunden('2026-050', 5)] }, buch());
    expect(zwei.abschnitte.find((x) => x.key === 'verrechnen')!.zeilen[0]).toMatchObject({
      titel: '2 Baustellen mit Stunden nicht verrechnet', detail: 'davon 1 über 4 Wochen', to: ZIEL.rechnungen,
    });
  });

  it('auch frische Stunden stehen da — ruhig, ohne Achtung-Punkt (E22)', () => {
    const s = startseite({ offeneStunden: [stunden('2026-042', 27), stunden('2026-050', 3)] }, buch());
    expect(s.abschnitte.find((x) => x.key === 'verrechnen')!.zeilen[0]).toMatchObject({
      detail: 'alle jünger als 4 Wochen', status: { text: 'verrechnen', ton: 'leise' },
    });
  });

  it('Gegenprobe: ohne Recht auf Rechnungen keine Stundenzeile — die Scheine bleiben', () => {
    const s = startseite(
      { offeneStunden: [stunden('2026-042', 60)], unverrechnet: [{ schein: { id: 's1', projectNumber: 'PR-1', customerName: 'Kunde', datum: '2026-10-10' }, tage: 3 }] },
      buch({ darf: (z) => !z.startsWith('/invoices') }),
    );
    const zeilen = s.abschnitte.find((x) => x.key === 'verrechnen')!.zeilen;
    expect(zeilen.map((z) => z.key)).toEqual(['scheine']);
  });

  it('Leitung: ein Thema unter „Diese Woche“ — bei einer Baustelle direkt zu ihrer Rechnung', () => {
    const eine = alleZeilen(startseite({ offeneStunden: [stunden('2026-042', 40)] }, leitung()));
    expect(eine.find((z) => z.key === 'stunden')).toMatchObject({
      titel: '1 Baustelle mit Stunden nicht verrechnet',
      detail: 'Familie Huber · 42:30 Std seit 01.08.2026',
      to: '/invoices?neu=2026-042',
    });
    const zwei = alleZeilen(startseite({ offeneStunden: [stunden('2026-042', 40), stunden('2026-050', 30)] }, leitung()));
    expect(zwei.find((z) => z.key === 'stunden')).toMatchObject({
      titel: '2 Baustellen mit Stunden nicht verrechnet', to: ZIEL.rechnungen,
    });
  });

  it('Gleichbleiben: ohne offene Stunden bleibt die Startseite, wie sie war', () => {
    const vorher = startseite({}, leitung());
    const nachher = startseite({ offeneStunden: [] }, leitung());
    expect(nachher).toEqual(vorher);
  });

  it('das Ziel gehört zu einer Seite, die Buchhaltung und Spitze betreten dürfen', () => {
    expect(grundpfad(ZIEL.rechnungFuer('PR-1/A'))).toBe('/invoices');
    expect(ZIEL.rechnungFuer('PR-1/A')).toBe('/invoices?neu=PR-1%2FA');
  });
});

/*
  WEN DIE SAMMELZEILE BETRIFFT (Testbericht Runde 6, G10): „2 Baustellen über
  dem Endtermin · Max Musterkunde“ nannte nur den ersten Kunden. Gegenprobe:
  mit `baustellenTitel(ende[0])` stehen die beiden ersten Fälle auf einem
  Namen; der dritte (ein Kunde, zwei Baustellen) hält fest, was gleich bleibt.
*/
describe('Sammelzeile „über dem Endtermin“ (Runde 6, G10)', () => {
  const leitung = (): Umfeld => ({
    rolle: 'leitung', heute: HEUTE, jetzt: JETZT, darf: () => true, urlaubEntscheiden: false,
  });
  const bau = (nr: string, kunde: string, ende: string) =>
    ({ id: nr, projectNumber: nr, companyId: 'b', customerName: kunde, address: '', status: 'Aktiv', endDate: ende }) as Project;
  const zeile = (projekte: Project[]) =>
    startseite({ projekte }, leitung()).abschnitte
      .flatMap((a) => [...a.zeilen, ...(a.weiter && 'aufklappen' in a.weiter ? a.weiter.aufklappen : [])])
      .find((z) => z.key === 'ende');

  it('nennt bei zwei Kunden beide, am längsten überzogen zuerst', () => {
    expect(zeile([bau('PR-2026-0189', 'CT Bau GmbH', '2026-09-20'), bau('PR-187', 'Max Musterkunde', '2026-09-01')]))
      .toMatchObject({ titel: '2 Baustellen über dem Endtermin', detail: 'Max Musterkunde, CT Bau GmbH' });
  });

  it('ab drei Kunden: zwei Namen und „und N weitere“', () => {
    expect(zeile([
      bau('A', 'Anna Auer', '2026-09-01'), bau('B', 'Bert Berger', '2026-09-02'),
      bau('C', 'Clara Czerny', '2026-09-03'), bau('D', 'Dora Danner', '2026-09-04'),
    ])?.detail).toBe('Anna Auer, Bert Berger und 2 weitere');
  });

  it('gleich geblieben: eine Baustelle, oder zwei desselben Kunden, nennen den Kunden einmal', () => {
    expect(zeile([bau('A', 'Max Musterkunde', '2026-09-01')])).toMatchObject({
      titel: '1 Baustelle über dem Endtermin', detail: 'Max Musterkunde',
    });
    expect(zeile([bau('A', 'Max Musterkunde', '2026-09-01'), bau('B', 'Max Musterkunde', '2026-09-10')])?.detail)
      .toBe('Max Musterkunde');
  });
});
