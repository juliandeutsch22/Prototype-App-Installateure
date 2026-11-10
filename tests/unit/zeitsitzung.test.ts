import { describe, expect, it } from 'vitest';
import { dauerText, timerBaustelle, timerDauer, timerFortschreiben, timerOrtszeit, timerPauseMs, timerVorschlaege, type TimerBefehl, type Zeitsitzung } from '@/lib/zeitsitzung';
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

/*
  DIE UHR DER KARTE „ARBEITSTAG“ (08.11.2026): Arbeitszeit = alle
  Arbeitsabschnitte, der laufende bis jetzt; Pausen zählen nicht. In der
  Pause zeigt die Karte, seit wann und wie lange sie dauert.
*/
describe('Die Uhr der Karte „Arbeitstag“', () => {
  const start = timerFortschreiben(null, b('start', 0, '2026-11-08T07:00:00+01:00'), 'c', 'u');
  const pause = timerFortschreiben(start, b('pause', 1, '2026-11-08T09:00:00+01:00'), 'c', 'u');
  const weiter = timerFortschreiben(pause, b('weiter', 2, '2026-11-08T09:30:00+01:00'), 'c', 'u');

  it('läuft: Arbeit vom Start bis jetzt, ohne Pause', () => {
    const d = timerDauer(start, Date.parse('2026-11-08T08:15:30+01:00'));
    expect(d.arbeitMs).toBe((75 * 60 + 30) * 1000);
    expect(d.pauseSeit).toBeNull();
    expect(timerOrtszeit(d.beginn).time).toBe('07:00');
  });

  it('Pause: die Arbeit bleibt stehen, die Pause zählt ab ihrem Beginn', () => {
    const d = timerDauer(pause, Date.parse('2026-11-08T09:12:05+01:00'));
    expect(d.arbeitMs).toBe(2 * 3600 * 1000);
    expect(timerOrtszeit(d.pauseSeit!).time).toBe('09:00');
    expect(d.pauseMs).toBe((12 * 60 + 5) * 1000);
  });

  it('weiter: beide Arbeitsabschnitte zusammen, die Pause nicht', () => {
    const d = timerDauer(weiter, Date.parse('2026-11-08T10:00:00+01:00'));
    expect(d.arbeitMs).toBe(2.5 * 3600 * 1000);
    expect(d.pauseMs).toBe(0);
  });

  it('Stoppuhr-Schreibweise: Stunden ohne führende Null, Minuten und Sekunden zweistellig', () => {
    expect(dauerText((4 * 3600 + 17 * 60 + 32) * 1000)).toBe('4:17:32');
    expect(dauerText((4 * 3600 + 17 * 60 + 32) * 1000, false)).toBe('4:17');
    expect(dauerText(5 * 1000)).toBe('0:00:05');
    expect(dauerText(-1000)).toBe('0:00:00');
    expect(dauerText(12 * 3600 * 1000 + 999)).toBe('12:00:00');
  });

  it('die Baustelle ist die des letzten Arbeitsabschnitts — die Pause hat keine eigene', () => {
    expect(timerBaustelle(weiter)).toBe('PR-1');
    const ohne = timerFortschreiben(null, { ...b('start', 0, '2026-11-08T07:00:00+01:00'), p_baustelle: '' }, 'c', 'u');
    expect(timerBaustelle(ohne)).toBe('');
  });
});

/*
 * WAS AUS EINEM ARBEITSTAG GEBUCHT WIRD (E73). Je Baustelle eine Zeit von
 * Beginn bis Ende, die Pausen dazwischen als Minuten. Gegenprobe: mit einer
 * Zeile je Abschnitt (wie vor E73) sind die ersten drei Prüfungen rot.
 */
describe('Vorschläge zum Buchen', () => {
  const tag = (segmente: Zeitsitzung['segmente']): Zeitsitzung => ({
    id: 's', company_id: 'c', user_id: 'u', stand: 'beendet', revision: 1, segmente, aktualisiert_am: '', erinnert_am: null, abgeschlossen: false,
  });
  const arbeit = (id: string, von: string, bis: string, baustelle = 'B-1', rest: Partial<Zeitsitzung['segmente'][number]> = {}) =>
    ({ id, art: 'arbeit' as const, von: `2026-11-09T${von}:00+01:00`, bis: `2026-11-09T${bis}:00+01:00`, baustelle, ...rest });
  const pause = (id: string, von: string, bis?: string) =>
    ({ id, art: 'pause' as const, von: `2026-11-09T${von}:00+01:00`, ...(bis ? { bis: `2026-11-09T${bis}:00+01:00` } : {}), baustelle: 'B-1' });

  it('Arbeit, Pause, Arbeit an derselben Baustelle ist eine Zeit mit der Pause in Minuten', () => {
    const v = timerVorschlaege(tag([arbeit('a', '07:00', '12:00'), pause('p', '12:00', '12:30'), arbeit('b', '12:30', '16:00')]));
    expect(v).toEqual([expect.objectContaining({ von: 0, bis: 2, arbeit: [0, 2], pauseMin: 30, baustelle: 'B-1', stand: 'offen' })]);
    expect(timerOrtszeit(v[0].beginn).time).toBe('07:00');
    expect(timerOrtszeit(v[0].ende!).time).toBe('16:00');
  });

  it('zwei Pausen zählen zusammen; ein Wechsel beginnt eine neue Zeit', () => {
    const v = timerVorschlaege(tag([
      arbeit('a', '07:00', '09:00'), pause('p', '09:00', '09:15'), arbeit('b', '09:15', '12:00'), pause('q', '12:00', '12:30'),
      arbeit('c', '12:30', '14:00'), arbeit('d', '14:00', '16:00', 'B-2'),
    ]));
    expect(v.map((x) => [x.von, x.bis, x.pauseMin, x.baustelle])).toEqual([[0, 4, 45, 'B-1'], [5, 5, 0, 'B-2']]);
  });

  it('eine Pause am Ende gehört zu keiner Zeit', () => {
    const v = timerVorschlaege(tag([arbeit('a', '07:00', '12:00'), pause('p', '12:00', '12:40')]));
    expect(v).toEqual([expect.objectContaining({ von: 0, bis: 0, pauseMin: 0 })]);
  });

  it('Gebuchtes nur zusammen, wenn es dieselbe Buchung ist; Offenes nie mit Gebuchtem', () => {
    // Eine ältere Fassung buchte je Abschnitt: zwei Buchungen bleiben zwei Zeilen.
    const alt = timerVorschlaege(tag([arbeit('a', '07:00', '12:00', 'B-1', { buchung: 'e1' }), pause('p', '12:00', '12:30'), arbeit('b', '12:30', '16:00', 'B-1', { buchung: 'e2' })]));
    expect(alt.map((x) => x.stand)).toEqual(['gebucht', 'gebucht']);
    const neu = timerVorschlaege(tag([arbeit('a', '07:00', '12:00', 'B-1', { buchung: 'e1' }), pause('p', '12:00', '12:30'), arbeit('b', '12:30', '16:00', 'B-1', { buchung: 'e1' })]));
    expect(neu).toEqual([expect.objectContaining({ von: 0, bis: 2, stand: 'gebucht', pauseMin: 30 })]);
    const gemischt = timerVorschlaege(tag([arbeit('a', '07:00', '12:00', 'B-1', { buchung: 'e1' }), pause('p', '12:00', '12:30'), arbeit('b', '12:30', '16:00')]));
    expect(gemischt.map((x) => [x.von, x.stand])).toEqual([[0, 'gebucht'], [2, 'offen']]);
  });

  it('Verworfenes mit demselben Grund steht als eine Zeit da, vorgemerktes bleibt vorgemerkt', () => {
    const v = timerVorschlaege(tag([
      arbeit('a', '07:00', '09:00', 'B-1', { verworfen_grund: 'Schulung' }), pause('p', '09:00', '09:30'),
      arbeit('b', '09:30', '11:00', 'B-1', { verworfen_grund: 'Schulung' }), arbeit('c', '11:00', '12:00', 'B-2', { vorgemerkt: true }),
    ]));
    expect(v.map((x) => [x.von, x.bis, x.stand, x.grund])).toEqual([[0, 2, 'verworfen', 'Schulung'], [3, 3, 'vorgemerkt', undefined]]);
  });

  it('die Pausen des Tages zusammen', () => {
    expect(timerPauseMs(tag([arbeit('a', '07:00', '09:00'), pause('p', '09:00', '09:15'), arbeit('b', '09:15', '12:00'), pause('q', '12:00', '12:30')]))).toBe(45 * 60_000);
  });
});
