import { describe, it, expect } from 'vitest';
import { einfuegenPlan, einfuegenText } from '@/features/time/einfuegen';
import type { TimeEntry } from '@/types';

/**
 * Eine Zeit zwischen bestehende Buchungen einfügen (10.10.2026): was aus den
 * anderen Buchungen des Tages wird — und wann es nicht geht.
 */

const a = (p: Partial<TimeEntry> = {}) => ({
  id: 'a', status: 'Anwesend' as const, projectNumber: 'B-1', startTime: '07:00', endTime: '16:00', breakDuration: 30,
  isBilled: false, ...p,
});
const schein = (startTime: string, endTime: string, projectNumber = 'B-2') =>
  ({ status: 'Anwesend' as const, projectNumber, startTime, endTime });

describe('einfuegenPlan', () => {
  it('mitten hinein: die Tagesbuchung wird geteilt, die Pause bleibt am längeren Teil', () => {
    expect(einfuegenPlan(schein('10:00', '12:00'), [a()])).toEqual({
      art: 'geht',
      aenderungen: [{ id: 'a', projectNumber: 'B-1', vorher: '07:00–16:00', nachher: ['07:00–10:00', '12:00–16:00'] }],
    });
  });

  it('am Rand: die Buchung wird gekürzt — vorne und hinten, auch über zwei Buchungen', () => {
    const plan = einfuegenPlan(schein('09:00', '11:00'), [
      a({ endTime: '10:00', breakDuration: 0 }),
      a({ id: 'c', projectNumber: 'B-3', startTime: '10:00', endTime: '16:00', breakDuration: 30 }),
    ]);
    expect(plan).toEqual({
      art: 'geht',
      aenderungen: [
        { id: 'a', projectNumber: 'B-1', vorher: '07:00–10:00', nachher: ['07:00–09:00'] },
        { id: 'c', projectNumber: 'B-3', vorher: '10:00–16:00', nachher: ['11:00–16:00'] },
      ],
    });
    expect(einfuegenText((plan as unknown as { aenderungen: never[] }).aenderungen)).toBe(
      'Die Zeit überschneidet sich mit einer anderen Buchung und wird beim Buchen dazwischen eingefügt: '
        + 'B-1 07:00–10:00 wird zu 07:00–09:00; B-3 10:00–16:00 wird zu 11:00–16:00. Die Pause bleibt am längeren Teil.',
    );
  });

  it('Gegenprobe: ohne Überschneidung, ohne Zeiten, ohne Baustelle oder nicht gearbeitet — nichts einzufügen', () => {
    expect(einfuegenPlan(schein('16:00', '18:00'), [a()])).toBeNull();
    expect(einfuegenPlan({ status: 'Anwesend', projectNumber: 'B-2' }, [a()])).toBeNull();
    expect(einfuegenPlan(schein('10:00', '12:00', ''), [a()])).toBeNull();
    expect(einfuegenPlan({ ...schein('10:00', '12:00'), status: 'Zeitausgleich' }, [a()])).toBeNull();
  });

  it('Gegenprobe: derselbe Baustelle, verrechnet, über Mitternacht, ganz bedeckt, Pause passt nicht', () => {
    const grund = (p: ReturnType<typeof einfuegenPlan>) => (p as { art: string; grund: string });
    expect(grund(einfuegenPlan(schein('10:00', '12:00', 'B-1'), [a()]))).toMatchObject({ art: 'nicht', grund: expect.stringMatching(/derselben Baustelle/) });
    expect(grund(einfuegenPlan(schein('10:00', '12:00'), [a({ isBilled: true })]))).toMatchObject({ art: 'nicht', grund: expect.stringMatching(/verrechnet/) });
    expect(grund(einfuegenPlan(schein('23:00', '23:30'), [a({ startTime: '22:00', endTime: '06:00' })]))).toMatchObject({ art: 'nicht', grund: expect.stringMatching(/Mitternacht/) });
    expect(grund(einfuegenPlan(schein('22:00', '02:00'), [a({ startTime: '20:00', endTime: '23:00' })]))).toMatchObject({ art: 'nicht', grund: expect.stringMatching(/Mitternacht/) });
    expect(grund(einfuegenPlan(schein('06:00', '17:00'), [a()]))).toMatchObject({ art: 'nicht', grund: expect.stringMatching(/bedeckt 07:00–16:00 \(B-1\) ganz/) });
    expect(grund(einfuegenPlan(schein('07:20', '15:50'), [a()]))).toMatchObject({ art: 'nicht', grund: expect.stringMatching(/Pause von 30 Min\./) });
  });

  it('Gegenprobe: ein anderer Konflikt des Tages bleibt einer — Urlaub, Zeitausgleich zur selben Stunde', () => {
    expect(einfuegenPlan(schein('10:00', '12:00'), [a(), { ...a({ id: 'u' }), status: 'Urlaub', startTime: undefined, endTime: undefined }])).toBeNull();
    expect(einfuegenPlan(schein('10:00', '12:00'), [
      a({ endTime: '11:00', breakDuration: 0 }),
      { ...a({ id: 'z', projectNumber: '' }), status: 'Zeitausgleich', startTime: '11:00', endTime: '13:00' },
    ])).toBeNull();
  });
});
