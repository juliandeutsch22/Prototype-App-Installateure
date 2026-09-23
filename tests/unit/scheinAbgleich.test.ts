import { describe, it, expect } from 'vitest';
import {
  scheinAbgleich,
  AUFFAELLIG_AB_MINUTEN,
  AUFFAELLIG_AB_ANTEIL,
} from '@/features/invoices/scheinAbgleich';
import type { TimeEntry, WorkSheet } from '@/types';

/**
 * Was verrechnet wird, gegen das, was der Kunde unterschrieben hat.
 *
 * Die Rechnung nimmt alle unverrechneten Stunden der Baustelle; der Kunde hat
 * einen Schein über die Zeit BEI IHM in der Hand. Beides darf auseinandergehen
 * — Vorfertigung in der Werkstatt zählt auf die Baustelle. Nur sagte es
 * niemandem, wenn die Rechnung deutlich darüber liegt, und die Reklamation
 * kommt erst, wenn sie schon draussen ist.
 */

/*
  Über `hours` statt über eine Spanne: `calcWorkMin` greift darauf zurück,
  wenn kein Von/Bis gesetzt ist. Eine gerechnete Endzeit lief bei mehreren
  Tagen über 24:00 hinaus und ergab NaN — ein Fehler im TEST, der wie ein
  Fehler in der Rechnung aussah.
*/
const eintrag = (min: number, over: Partial<TimeEntry> = {}): TimeEntry =>
  ({
    id: 'e', companyId: 'perl', date: '2026-06-15', status: 'Anwesend', userId: 'u1',
    hours: min / 60, projectNumber: '2026-042', ...over,
  }) as TimeEntry;

const schein = (minuten: number[], over: Partial<WorkSheet> = {}): WorkSheet & { id: string } =>
  ({
    id: 's1', companyId: 'perl', projectNumber: '2026-042', customerName: 'Familie Huber',
    datum: '2026-06-15', status: 'Unterschrieben', abrechnung: 'Regie',
    zeiten: minuten.map((m) => ({ datum: '2026-06-15', mitarbeiter: 'Max', minuten: m })),
    material: [], erstelltVonUid: 'm1', erstelltVonName: 'Max', ...over,
  }) as WorkSheet & { id: string };

describe('Rechnung gegen unterschriebenen Schein', () => {
  it('stellt beide Zahlen nebeneinander', () => {
    const a = scheinAbgleich('2026-042', [eintrag(480)], [schein([240])]);
    expect(a.verrechnetMin).toBe(480);
    expect(a.bestaetigtMin).toBe(240);
    expect(a.mehrMin).toBe(240);
    expect(a.scheine).toBe(1);
  });

  it('schlägt an, wenn deutlich mehr verrechnet wird als bestätigt', () => {
    // 8 h verrechnet gegen 4 h bestätigt: das Doppelte, und vier Stunden mehr.
    expect(scheinAbgleich('2026-042', [eintrag(480)], [schein([240])]).auffaellig).toBe(true);
  });

  /*
    BEIDE BEDINGUNGEN, und jede allein wäre Lärm. Ein Viertel mehr ist bei
    einem Einstundeneinsatz eine Viertelstunde; eine Stunde mehr ist auf einer
    Vierzigstundenbaustelle nichts.
  */
  it('schweigt bei einer Viertelstunde, auch wenn das anteilig viel ist', () => {
    expect(AUFFAELLIG_AB_MINUTEN).toBe(60);
    // 75 min gegen 60 min bestätigt — anteilig ein Viertel, absolut nichts.
    const a = scheinAbgleich('2026-042', [eintrag(75)], [schein([60])]);
    expect(a.mehrMin).toBe(15);
    expect(a.auffaellig).toBe(false);
  });

  it('schweigt bei einer Stunde auf einer grossen Baustelle', () => {
    expect(AUFFAELLIG_AB_ANTEIL).toBe(0.25);
    // 41 h gegen 40 h bestätigt — absolut über der Grenze, anteilig nichts.
    const a = scheinAbgleich('2026-042', [eintrag(2460)], [schein([2400])]);
    expect(a.mehrMin).toBe(60);
    expect(a.auffaellig).toBe(false);
  });

  /*
    OHNE SCHEIN GIBT ES NICHTS ZU VERGLEICHEN. „Sie verrechnen 40 Stunden,
    bestätigt sind 0" stünde sonst bei jeder Baustelle ohne Schein da und
    wäre nach zwei Tagen weggeklickt.
  */
  it('schweigt, wenn es gar keinen unterschriebenen Schein gibt', () => {
    const a = scheinAbgleich('2026-042', [eintrag(480)], []);
    expect(a.bestaetigtMin).toBe(0);
    expect(a.auffaellig).toBe(false);
  });

  it('zählt nur unterschriebene Scheine', () => {
    for (const status of ['Entwurf', 'Storniert', 'Verworfen'] as const) {
      const a = scheinAbgleich('2026-042', [eintrag(480)], [schein([240], { status })]);
      expect(a.bestaetigtMin, status).toBe(0);
      expect(a.scheine, status).toBe(0);
    }
  });

  it('nimmt nur die Scheine DIESER Baustelle', () => {
    const a = scheinAbgleich('2026-042', [eintrag(480)], [
      schein([240]),
      schein([600], { id: 's2', projectNumber: '2026-099' }),
    ]);
    expect(a.bestaetigtMin).toBe(240);
    expect(a.scheine).toBe(1);
  });

  /*
    „PR-2026-042" stammt aus Altbeständen und meint dieselbe Baustelle. Ohne
    die Normalisierung stünde dort „0 bestätigt" — und die Warnung schlüge bei
    jeder alten Baustelle zu Unrecht an.
  */
  it('erkennt die Baustelle auch in der alten Schreibweise', () => {
    const a = scheinAbgleich('2026-042', [eintrag(480)], [
      schein([480], { projectNumber: 'PR-2026-042' }),
    ]);
    expect(a.bestaetigtMin).toBe(480);
    expect(a.auffaellig).toBe(false);
  });

  it('addiert mehrere Scheine und mehrere Zeilen', () => {
    const a = scheinAbgleich('2026-042', [eintrag(480)], [
      schein([120, 60]),
      schein([180], { id: 's2', datum: '2026-06-16' }),
    ]);
    expect(a.bestaetigtMin).toBe(360);
    expect(a.scheine).toBe(2);
  });

  /*
    Weniger zu verrechnen als bestätigt ist kein Befund dieser Art — das ist
    die Aufgabe von „nicht verrechnete Leistung". Hier stünde sonst eine
    negative Zahl, die niemand einordnen kann.
  */
  it('meldet keine negative Abweichung', () => {
    const a = scheinAbgleich('2026-042', [eintrag(120)], [schein([480])]);
    expect(a.mehrMin).toBe(0);
    expect(a.auffaellig).toBe(false);
  });
});

/**
 * Die Gegenrichtung: weniger verrechnet, als unterschrieben ist.
 *
 * GEFUNDEN BEIM PROBELAUF. Schein über acht Stunden unterschrieben, die Zeit
 * noch nicht gebucht — die Rechnung nahm null Stunden, der Abgleich stand in
 * Grau darüber, und die Rechnung ging ohne Arbeitszeit hinaus.
 */
describe('Rechnung unter dem unterschriebenen Schein', () => {
  it('warnt, wenn die Stunden eines offenen Scheins fehlen', () => {
    const a = scheinAbgleich('2026-042', [], [schein([480])], new Set(['s1']));
    expect(a.wenigerMin).toBe(480);
    expect(a.zuWenig).toBe(true);
  });

  it('schweigt bei einer Folgerechnung — ein schon verrechneter Schein zählt nicht', () => {
    // Sonst schlüge jede zweite Rechnung einer Baustelle Alarm: die Stunden
    // der ersten sind verrechnet, ihr Schein stünde aber weiter da.
    const a = scheinAbgleich('2026-042', [eintrag(120)], [schein([480])], new Set());
    expect(a.wenigerMin).toBe(0);
    expect(a.zuWenig).toBe(false);
  });

  it('bleibt ohne Liste der offenen Scheine beim alten Verhalten', () => {
    const a = scheinAbgleich('2026-042', [], [schein([480])]);
    expect(a.zuWenig).toBe(false);
  });

  it('meldet eine kleine Abweichung nicht', () => {
    // Eine halbe Stunde unter acht: Rundung, eine vergessene Minute — kein Fall.
    const a = scheinAbgleich('2026-042', [eintrag(450)], [schein([480])], new Set(['s1']));
    expect(a.wenigerMin).toBe(30);
    expect(a.zuWenig).toBe(false);
  });

  it('zählt nur die Scheine derselben Baustelle', () => {
    const fremd = schein([480], { id: 's2', projectNumber: '2026-099' });
    const a = scheinAbgleich('2026-042', [], [fremd], new Set(['s2']));
    expect(a.zuWenig).toBe(false);
  });

  it('lässt die Richtung „mehr" unverändert', () => {
    const offen = scheinAbgleich('2026-042', [eintrag(600)], [schein([240])], new Set(['s1']));
    const ohne = scheinAbgleich('2026-042', [eintrag(600)], [schein([240])]);
    expect(offen.mehrMin).toBe(ohne.mehrMin);
    expect(offen.auffaellig).toBe(ohne.auffaellig);
  });
});
