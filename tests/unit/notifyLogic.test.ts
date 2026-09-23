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
  orderAusZeile,
  abwesenheitAusZeile,
  empfaengerAntrag,
  empfaengerKrankmeldung,
  textAntrag,
  textEntscheidung,
  textKrankmeldung,
  type Belegschaftsmitglied,
} from '@shared/notifyLogic';

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

describe('Eine Postgres-Zeile wird zur Anforderung', () => {
  /*
    SECHS ZEILEN, DIE STILL FALSCH SEIN KÖNNEN. Verwechselt man `is_urgent`
    mit `isUrgent`, ist `istEilRelevant` immer falsch — und die
    Projektleitung erfährt nie von einer Eilzustellung. Es kommt keine
    Fehlermeldung, es kommt nur nichts.
  */
  const zeile = {
    company_id: 'perl',
    material_name: 'Kupferrohr 15mm',
    quantity: '8.000',
    project_number: 'B-2026-0001',
    user_id: 'u1',
    user_name: 'Max Mustermann',
    status: 'Offen',
    transaction_type: 'order',
    is_urgent: true,
  };

  it('übersetzt jedes Feld, auf das eine Entscheidung schaut', () => {
    expect(orderAusZeile(zeile)).toEqual({
      companyId: 'perl',
      materialName: 'Kupferrohr 15mm',
      // `numeric` kommt als Zeichenkette zurück — als solche stünde im
      // Meldungstext „8.000× Kupferrohr".
      quantity: 8,
      projectNumber: 'B-2026-0001',
      userId: 'u1',
      userName: 'Max Mustermann',
      status: 'Offen',
      transactionType: 'order',
      isUrgent: true,
    });
  });

  it('und die Entscheidungen greifen danach', () => {
    const order = orderAusZeile(zeile)!;
    expect(istMeldepflichtigeAnforderung(order)).toBe(true);
    expect(istEilRelevant(order)).toBe(true);
    expect(textNeueAnforderung(order).body).toContain('8× Kupferrohr 15mm');
  });

  it('ohne Zeile gibt es nichts zu melden', () => {
    expect(orderAusZeile(undefined)).toBeUndefined();
  });

  it('ein fehlendes `is_urgent` ist nicht eilig — und kein `undefined`', () => {
    // `!!undefined` wäre auch falsch-sicher; hier steht ausdrücklich `false`,
    // damit ein Vergleich auf `=== false` nicht danebenliegt.
    expect(orderAusZeile({ company_id: 'perl' })!.isUrgent).toBe(false);
  });
});

/*
  ABWESENHEITEN. Wer bekommt was — und was steht auf dem Sperrbildschirm.
  Ein Krankenstand ist ein Gesundheitsdatum: er geht nur ans Büro, und die
  Meldung sagt nicht mehr als Name und Zeitraum.
*/
describe('Abwesenheiten', () => {
  const leute: Belegschaftsmitglied[] = [
    { uid: 'gf', role: 'Geschäftsführung', active: true, entscheidet: true, buero: true },
    { uid: 'bu', role: 'Buchhaltung', active: true, entscheidet: false, buero: true },
    { uid: 'pl', role: 'Projektleiter', active: true, entscheidet: true, buero: false },
    { uid: 'mo', role: 'Mitarbeiter', active: true, entscheidet: false, buero: false },
    { uid: 'alt', role: 'Geschäftsführung', active: false, entscheidet: true, buero: true },
  ];

  it('einen Antrag bekommt, wer entscheidet — nicht der Antragsteller, nicht ein deaktiviertes Konto', () => {
    expect(empfaengerAntrag(leute, 'mo')).toEqual(['gf', 'pl']);
    expect(empfaengerAntrag(leute, 'gf')).toEqual(['pl']);
  });

  it('eine Krankmeldung bekommt nur das Büro — nicht die Projektleitung', () => {
    expect(empfaengerKrankmeldung(leute, 'mo')).toEqual(['gf', 'bu']);
    expect(empfaengerKrankmeldung(leute, 'bu')).toEqual(['gf']);
  });

  it('liest die Zeile aus Postgres — auch die ZA-Felder', () => {
    const a = abwesenheitAusZeile({
      company_id: 'perl', user_id: 'mo', user_name: 'Max', von: '2026-10-27', bis: '2026-10-27',
      art: 'Zeitausgleich', status: 'Beantragt', za_von: '13:00:00', za_bis: '17:00:00', za_stunden: '4.00',
    });
    expect(a).toMatchObject({ companyId: 'perl', userId: 'mo', art: 'Zeitausgleich', zaStunden: 4 });
    expect(textAntrag(a!, 'v1')).toMatchObject({
      title: 'Neuer Antrag auf Zeitausgleich',
      body: 'Max: 27.10., 13:00–17:00 (4 Std.)',
      link: '/vacations',
    });
  });

  it('nennt Urlaub und Entscheidung beim Namen', () => {
    const u = abwesenheitAusZeile({
      company_id: 'perl', user_id: 'mo', user_name: 'Max', von: '2026-12-21', bis: '2026-12-24',
      art: 'Urlaub', status: 'Genehmigt',
    })!;
    expect(textAntrag(u, 'v2').title).toBe('Neuer Urlaubsantrag');
    expect(textAntrag(u, 'v2').body).toBe('Max: 21.12.–24.12.');
    expect(textEntscheidung(u, 'v2')).toMatchObject({ title: 'Urlaub genehmigt', tag: 'antrag-v2' });
    expect(textEntscheidung({ ...u, status: 'Abgelehnt' }, 'v2').title).toBe('Urlaub abgelehnt');
    expect(textEntscheidung({ ...u, status: 'Storniert' }, 'v2').title).toBe('Urlaub zurückgenommen');
  });

  it('die Krankmeldung verrät nicht mehr als Name und Zeitraum', () => {
    const k = abwesenheitAusZeile({
      company_id: 'perl', user_id: 'mo', user_name: 'Max', von: '2026-10-27', bis: '2026-10-29', notiz: 'Grippe',
    })!;
    const m = textKrankmeldung(k, 'k1');
    expect(m).toMatchObject({ title: 'Krankmeldung', body: 'Max: 27.10.–29.10.' });
    expect(JSON.stringify(m)).not.toContain('Grippe');
  });

  it('wer „Abwesenheiten" abschaltet, bekommt sie nicht', () => {
    expect(willMeldung({ notifyAbwesenheit: false }, 'notifyAbwesenheit')).toBe(false);
    expect(willMeldung({ notifyNewOrder: false }, 'notifyAbwesenheit')).toBe(true);
  });
});
