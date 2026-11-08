import { describe, expect, it } from 'vitest';
import { timerFortschreiben, timerOrtszeit, type TimerBefehl } from '@/lib/zeitsitzung';
import { willMeldung } from '@shared/notifyLogic';
const b = (art: TimerBefehl['p_art'], revision: number, zeit: string): TimerBefehl => ({ p_id: 's', p_befehl: `cmd${revision}`, p_revision: revision, p_art: art, p_zeit: zeit, p_baustelle: 'PR-1' });
describe('Timer-Vorschau ohne Empfang', () => {
  it('führt Arbeit, Pause und weitere Arbeit ohne Arbeitszeitbuchung fort', () => {
    const start = timerFortschreiben(null, b('start', 0, '2026-11-08T07:00:00+01:00'), 'c', 'u');
    const pause = timerFortschreiben(start, b('pause', 1, '2026-11-08T09:00:00+01:00'), 'c', 'u');
    const weiter = timerFortschreiben(pause, b('weiter', 2, '2026-11-08T09:30:00+01:00'), 'c', 'u');
    const ende = timerFortschreiben(weiter, b('stop', 3, '2026-11-08T12:00:00+01:00'), 'c', 'u');
    expect(ende.stand).toBe('beendet'); expect(ende.segmente.map((s) => s.art)).toEqual(['arbeit','pause','arbeit']);
    expect(ende.segmente.every((s) => s.bis && !s.buchung)).toBe(true);
    expect(() => timerFortschreiben(weiter, b('stop', 2, '2026-11-08T12:00:00+01:00'), 'c', 'u')).toThrow(/geändert/);
  });
  it('verwendet den österreichischen Tag auch bei UTC und Sommerzeitwechsel', () => {
    expect(timerOrtszeit('2026-07-01T22:30:00Z')).toEqual({ date: '2026-07-02', time: '00:30' });
    expect(timerOrtszeit('2026-10-25T00:30:00Z')).toEqual({ date: '2026-10-25', time: '02:30' });
    expect(timerOrtszeit('2026-10-25T01:30:00Z')).toEqual({ date: '2026-10-25', time: '02:30' });
  });
  it('die persönliche Timer-Einstellung ist unabhängig von Abwesenheiten', () => {
    expect(willMeldung({ notifyAbwesenheit: false }, 'notifyZeiterfassung')).toBe(true);
    expect(willMeldung({ notifyZeiterfassung: false }, 'notifyZeiterfassung')).toBe(false);
  });
});

describe('Zeitmeldungen ohne private Inhalte', () => {
  it('nennt keine Stunden oder Änderungswünsche und verlinkt den Antrag', async () => {
    const { zeitMeldung, zeitKorrekturEmpfaenger, zeitEigenerEmpfaenger } = await import('@shared/zeitMeldungen');
    expect(zeitMeldung('korrektur-antrag', 'id 1')?.link).toBe('/time?korrektur=id%201');
    expect(zeitMeldung('korrektur-entschieden', 'id')?.body).toBe('Die Entscheidung zu deinem Antrag ist verfügbar.');
    expect(zeitMeldung('unbekannt', 'id')).toBeNull();
    expect(zeitEigenerEmpfaenger([{ uid: 'ma', active: false }, { uid: 'bh', active: true }], 'ma')).toEqual([]);
    expect(zeitEigenerEmpfaenger([{ uid: 'ma', active: true }], 'ma')).toEqual(['ma']);
    expect(zeitKorrekturEmpfaenger([{ uid: 'ma', role: 'Mitarbeiter' }, { uid: 'pl', role: 'Projektleiter' }, { uid: 'bh', role: 'Buchhaltung' }, { uid: 'ad', role: 'Administrator', active: false }, { uid: 'gf', role: 'Geschäftsführung' }], 'gf')).toEqual(['bh']);
  });
});
