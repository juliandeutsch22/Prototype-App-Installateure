import { describe, it, expect } from 'vitest';
import {
  empfaengerNeueAnforderung,
  istEilRelevant,
  istMeldepflichtigeAnforderung,
  istUebergangAufAbholbereit,
  textAbholbereit,
  textEilAngefordert,
  textNeueAnforderung,
  toteTokens,
  willMeldung,
} from '../../functions/src/notifyLogic';

/**
 * Benachrichtigungen laufen in Ereignis-Triggern auf dem Server. Ein Fehler
 * dort ist unsichtbar: niemand bekommt eine Meldung, und niemand merkt, dass
 * eine gefehlt hat. Deshalb steht jede Entscheidung hier einzeln auf dem
 * Prüfstand — nicht der Versand, sondern das Urteil davor.
 */

describe('Wofür überhaupt gemeldet wird', () => {
  it('meldet eine gewöhnliche Anforderung', () => {
    expect(istMeldepflichtigeAnforderung({ companyId: 'perl' })).toBe(true);
  });

  it('meldet keine Retoure — das ist eine Rückgabe, dafür läuft niemand', () => {
    expect(
      istMeldepflichtigeAnforderung({ companyId: 'perl', transactionType: 'return' }),
    ).toBe(false);
  });

  it('meldet nichts ohne Mandant — dann ist unklar, wer zuständig wäre', () => {
    expect(istMeldepflichtigeAnforderung({ materialName: 'Rohr' })).toBe(false);
    expect(istMeldepflichtigeAnforderung(undefined)).toBe(false);
  });
});

describe('Wer eine neue Anforderung erfährt', () => {
  const leute = [
    { uid: 'verwaltung-1', active: true },
    { uid: 'chefin', active: true },
    { uid: 'admin', active: undefined },
  ];

  it('nimmt alle, deren Konto nicht deaktiviert ist', () => {
    // `active: undefined` ist ein Altbestand ohne das Feld — der zählt als aktiv.
    expect(empfaengerNeueAnforderung(leute)).toEqual(['verwaltung-1', 'chefin', 'admin']);
  });

  it('lässt deaktivierte Konten aus', () => {
    const mit = [...leute, { uid: 'ausgeschieden', active: false }];
    expect(empfaengerNeueAnforderung(mit)).not.toContain('ausgeschieden');
  });

  it('schickt dem Besteller nicht seine eigene Meldung', () => {
    expect(empfaengerNeueAnforderung(leute, 'chefin')).toEqual(['verwaltung-1', 'admin']);
  });

  it('überspringt Einträge ohne uid, statt undefined zu verschicken', () => {
    expect(empfaengerNeueAnforderung([{ active: true }, { uid: 'chefin' }])).toEqual(['chefin']);
  });
});

describe('Will dieser Nutzer die Meldung?', () => {
  it('ja, wenn er nie etwas eingestellt hat — nichts zu verpassen ist der bessere Start', () => {
    expect(willMeldung({ pushTokens: ['t1'] }, 'notifyNewOrder')).toBe(true);
  });

  it('nein, wenn er sie ausdrücklich abgeschaltet hat', () => {
    expect(willMeldung({ notifyNewOrder: false }, 'notifyNewOrder')).toBe(false);
  });

  it('unterscheidet die Arten voneinander', () => {
    const p = { notifyNewOrder: false, notifyOrderReady: true };
    expect(willMeldung(p, 'notifyNewOrder')).toBe(false);
    expect(willMeldung(p, 'notifyOrderReady')).toBe(true);
    expect(willMeldung(p, 'notifyUrgentDelivery')).toBe(true);
  });

  it('nein ohne Einstellungsdokument — dann ist auch kein Gerät angemeldet', () => {
    expect(willMeldung(undefined, 'notifyNewOrder')).toBe(false);
  });
});

describe('Abholbereit — nur der Übergang zählt', () => {
  const basis = { userId: 'monteur-1', companyId: 'perl' };

  it('meldet, wenn der Status auf Abholbereit springt', () => {
    expect(
      istUebergangAufAbholbereit(
        { ...basis, status: 'In Bearbeitung' },
        { ...basis, status: 'Abholbereit' },
      ),
    ).toBe(true);
  });

  /**
   * Der wichtigste Fall. Ohne diese Prüfung löste JEDE spätere Änderung an
   * einer bereits abholbereiten Anforderung dieselbe Meldung erneut aus — der
   * Monteur liefe womöglich ein zweites Mal los.
   */
  it('meldet NICHT erneut, wenn sonst etwas an der Anforderung geändert wird', () => {
    expect(
      istUebergangAufAbholbereit(
        { ...basis, status: 'Abholbereit', quantity: 1 },
        { ...basis, status: 'Abholbereit', quantity: 5 },
      ),
    ).toBe(false);
  });

  it('meldet nicht bei einem anderen Zielstatus', () => {
    expect(
      istUebergangAufAbholbereit({ ...basis, status: 'Offen' }, { ...basis, status: 'Erledigt' }),
    ).toBe(false);
  });

  it('meldet nicht ohne Besteller — es gäbe niemanden zu verständigen', () => {
    expect(
      istUebergangAufAbholbereit({ status: 'Offen' }, { companyId: 'perl', status: 'Abholbereit' }),
    ).toBe(false);
  });
});

describe('Eilzustellung', () => {
  it('gilt nur mit Baustelle — ohne sie gibt es keine Projektleitung', () => {
    expect(istEilRelevant({ companyId: 'perl', isUrgent: true, projectNumber: '2026-001' })).toBe(
      true,
    );
    expect(istEilRelevant({ companyId: 'perl', isUrgent: true })).toBe(false);
    expect(istEilRelevant({ companyId: 'perl', projectNumber: '2026-001' })).toBe(false);
  });
});

describe('Tote Geräte abmelden', () => {
  const tokens = ['tok-a', 'tok-b', 'tok-c'];

  it('erkennt endgültig ungültige Tokens', () => {
    const res = [
      {},
      { error: { code: 'messaging/registration-token-not-registered' } },
      { error: { code: 'messaging/invalid-registration-token' } },
    ];
    expect(toteTokens(tokens, res)).toEqual(['tok-b', 'tok-c']);
  });

  /**
   * Der gefährliche Fall: ein vorübergehender Fehler darf KEIN Gerät
   * abmelden. Sonst meldete eine halbe Stunde Störung beim Anbieter sämtliche
   * Geräte des Betriebs ab — und niemand bekäme je wieder eine Meldung, ohne
   * zu wissen warum.
   */
  it('meldet bei vorübergehenden Fehlern niemanden ab', () => {
    const res = [
      { error: { code: 'messaging/internal-error' } },
      { error: { code: 'messaging/server-unavailable' } },
      { error: { code: 'messaging/quota-exceeded' } },
    ];
    expect(toteTokens(tokens, res)).toEqual([]);
  });

  /**
   * `invalid-argument` kommt bei einem kaputten Token vor — aber ebenso bei
   * einer fehlerhaften Nachricht, und die betrifft dann alle Empfänger auf
   * einmal. Ein Tippfehler im Meldungstext würde damit sämtliche Geräte des
   * Betriebs abmelden. Im Zweifel lieber ein totes Token behalten als ein
   * lebendes verlieren.
   */
  it('meldet bei „invalid-argument" niemanden ab — der Code ist mehrdeutig', () => {
    const res = [{ error: { code: 'messaging/invalid-argument' } }, {}, {}];
    expect(toteTokens(tokens, res)).toEqual([]);
  });

  it('gibt nichts zurück, wenn alles zugestellt wurde', () => {
    expect(toteTokens(tokens, [{}, {}, {}])).toEqual([]);
  });
});

describe('Was in der Meldung steht', () => {
  const order = {
    companyId: 'perl',
    materialName: 'Kupferrohr 15 mm',
    quantity: 3,
    projectNumber: '2026-001',
    userName: 'Max Mustermann',
  };

  it('nennt Menge, Material, Besteller und Baustelle', () => {
    const m = textNeueAnforderung(order);
    expect(m.body).toBe('3× Kupferrohr 15 mm — Max Mustermann (2026-001)');
    expect(m.link).toBe('/material/anforderungen');
  });

  it('kommt ohne Baustelle und ohne Namen aus, statt „undefined" zu zeigen', () => {
    const m = textNeueAnforderung({ companyId: 'perl', materialName: 'Dichtung' });
    expect(m.body).toBe('1× Dichtung');
  });

  it('fasst gewöhnliche Anforderungen unter einer Kennung zusammen', () => {
    // Fünf Meldungen kurz hintereinander sollen nicht fünf Einträge im
    // Sperrbildschirm sein.
    expect(textNeueAnforderung(order).tag).toBe(textNeueAnforderung({ ...order, quantity: 9 }).tag);
  });

  it('gibt jeder Eilmeldung eine eigene Kennung', () => {
    // Eine Eilmeldung darf nicht von der Sammelmeldung verdrängt werden.
    expect(textEilAngefordert(order, 'a1').tag).not.toBe(textEilAngefordert(order, 'a2').tag);
    expect(textEilAngefordert(order, 'a1').tag).not.toBe(textNeueAnforderung(order).tag);
  });

  it('schickt den Monteur bei „abholbereit" in seine eigene Ansicht', () => {
    const m = textAbholbereit(order, 'a1');
    expect(m.link).toBe('/material/anfordern');
    expect(m.body).toBe('3× Kupferrohr 15 mm liegt bereit (2026-001)');
  });
});
