import { describe, it, expect } from 'vitest';
import { istArztbesuch, istArztbesuchTag, selberFall, type FreistellungFuerRegeln } from '@shared/freistellung';
import { abwesenheitAusZeile, textFreistellungAntrag, textFreistellungEntscheidung } from '@shared/notifyLogic';
import { tagesStatusName } from '@/lib/time';
import {
  ablehnungVermerk, anrechnungVermerk, freistellungWas, freistellungZeitraum, leseDauer, terminMinuten,
} from '@/features/vacations/freistellungText';
import type { Freistellung } from '@/types';

/**
 * DER ARZTBESUCH (E35) — die Regeln und Texte, die App, Push und Zeitkonto
 * teilen. Rechtlich eine Dienstverhinderung (§ 1154b Abs 5 ABGB, § 8 Abs 3
 * AngG), in der App heißt er, was er ist.
 */

const arzt = (rest: Partial<Freistellung> = {}): Freistellung => ({
  id: 'a1', companyId: 'c', userId: 'u', userName: 'Max', art: 'dienstverhinderung', anlass: 'arztbesuch',
  von: '2026-11-12', bis: '2026-11-12', zeitVon: '13:00:00', zeitBis: '15:00:00', status: 'Beantragt', ...rest,
} as Freistellung);

describe('erkennen', () => {
  it('ein Antrag ist ein Arztbesuch nur als Dienstverhinderung mit diesem Anlass', () => {
    expect(istArztbesuch(arzt())).toBe(true);
    expect(istArztbesuch({ art: 'dienstverhinderung', anlass: 'hochzeit' })).toBe(false);
    expect(istArztbesuch({ art: 'pflegefreistellung', anlass: 'arztbesuch' })).toBe(false);
  });

  it('ein Tag im Zeitkonto ist ein Arztbesuch nur mit dem Vermerk', () => {
    expect(istArztbesuchTag({ status: 'Dienstverhinderung', comment: 'Arztbesuch' })).toBe(true);
    expect(istArztbesuchTag({ status: 'Dienstverhinderung', comment: null })).toBe(false);
    expect(istArztbesuchTag({ status: 'Anwesend', comment: 'Arztbesuch' })).toBe(false);
  });

  it('zwei Arztbesuche sind nie „derselbe Anlass“ — kein Teilungshinweis', () => {
    const a = { id: 'a', userId: 'u', art: 'dienstverhinderung', anlass: 'arztbesuch', ereignisDatum: '2026-11-12', von: '2026-11-12', bis: '2026-11-12', status: 'Bestätigt' } as FreistellungFuerRegeln;
    expect(selberFall(a, { ...a, von: '2026-11-19', bis: '2026-11-19', ereignisDatum: '2026-11-19' })).toBe(false);
    // Gegenprobe: zwei Hochzeitstage zum selben Ereignis sind derselbe Fall.
    const h = { ...a, anlass: 'hochzeit' };
    expect(selberFall(h, { ...h, von: '2026-11-13', bis: '2026-11-13' })).toBe(true);
  });
});

describe('Texte', () => {
  it('heißt Arztbesuch, mit Tag und Uhrzeit', () => {
    expect(freistellungWas(arzt())).toBe('Arztbesuch');
    expect(freistellungZeitraum(arzt())).toBe('12.11.2026, 13:00–15:00');
    expect(terminMinuten(arzt())).toBe(120);
  });

  it('auf dem Tag im Zeitkonto steht „Arztbesuch“, sonst bleibt es Sonderurlaub', () => {
    expect(tagesStatusName('Dienstverhinderung', 'Arztbesuch')).toBe('Arztbesuch');
    expect(tagesStatusName('Dienstverhinderung')).toBe('Sonderurlaub');
    expect(tagesStatusName('Dienstverhinderung', 'Hochzeit')).toBe('Sonderurlaub');
  });

  it('die angerechnete Zeit steht nur da, wenn sie vom Termin abweicht', () => {
    expect(anrechnungVermerk(arzt({ status: 'Bestätigt', minuten: 120 }))).toBeNull();
    expect(anrechnungVermerk(arzt({ status: 'Bestätigt', minuten: 90 })))
      .toBe('Angerechnet 01:30 Std von 02:00 Std (der Rest lag außerhalb der Sollzeit)');
    expect(anrechnungVermerk(arzt({ status: 'Bestätigt', minuten: 120, anrechnungGrund: 'Gleitzeit' })))
      .toBe('Angerechnet 02:00 Std von 02:00 Std — Gleitzeit');
    expect(anrechnungVermerk(arzt({ status: 'Beantragt', minuten: 90 }))).toBeNull();
  });

  it('beim abgelehnten steht, was aus der Zeit wurde', () => {
    expect(ablehnungVermerk(arzt({ status: 'Abgelehnt', ablehnungFolge: 'zeitausgleich' }))).toBe('Als Zeitausgleich gebucht');
    expect(ablehnungVermerk(arzt({ status: 'Abgelehnt', ablehnungFolge: 'keine' }))).toBe('Nicht gebucht — die Zeit fehlt im Saldo');
    expect(ablehnungVermerk(arzt({ status: 'Abgelehnt' }))).toBeNull();
  });

  it('die Dauer wird als Std:Min gelesen — alles andere nicht', () => {
    expect(leseDauer('1:30')).toBe(90);
    expect(leseDauer('01:30')).toBe(90);
    expect(leseDauer(' 2:00 ')).toBe(120);
    for (const falsch of ['1,5', '90', '1:75', '', 'eins']) expect(leseDauer(falsch), falsch).toBeNull();
  });
});

/** Die Zeile, wie sie die Datenbank an die Push-Funktion gibt — hier immer da. */
const doc = (z: Record<string, unknown>) => abwesenheitAusZeile(z)!;

describe('Push', () => {
  const zeile = {
    user_id: 'u', user_name: 'Max', art: 'dienstverhinderung', arztbesuch: true,
    von: '2026-11-12', bis: '2026-11-12', zeit_von: '13:00:00', zeit_bis: '15:00:00', status: 'Beantragt',
  };

  it('ans Büro: „Arztbesuch zu bestätigen“ mit der Uhrzeit — ohne Anmerkung', () => {
    const a = doc({ ...zeile, notiz: 'Zahnarzt, Wurzelbehandlung' });
    const m = textFreistellungAntrag(a, 'a1');
    expect(m.title).toBe('Arztbesuch zu bestätigen');
    expect(m.body).toMatch(/^Max: .*13:00–15:00$/);
    expect(JSON.stringify(m)).not.toMatch(/Zahn|Wurzel/);
  });

  it('an die Person: bestätigt oder abgelehnt, mit der Uhrzeit', () => {
    expect(textFreistellungEntscheidung(doc({ ...zeile, status: 'Bestätigt' }), 'a1').title).toBe('Arztbesuch bestätigt');
    expect(textFreistellungEntscheidung(doc({ ...zeile, status: 'Abgelehnt' }), 'a1').title).toBe('Arztbesuch abgelehnt');
  });

  it('Gegenprobe: ein anderer Sonderurlaub nennt keinen Anlass', () => {
    const a = doc({ ...zeile, arztbesuch: false, zeit_von: null, zeit_bis: null });
    expect(textFreistellungAntrag(a, 'f1').title).toBe('Neuer Antrag auf Sonderurlaub');
    expect(textFreistellungEntscheidung({ ...a, status: 'Bestätigt' }, 'f1').title).toBe('Sonderurlaub bestätigt');
  });
});
