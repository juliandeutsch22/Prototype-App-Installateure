import { describe, it, expect } from 'vitest';
import {
  scheineOhneBuchung,
  minutenOhneBuchung,
  OFFEN_AB_TAGEN,
} from '@/features/worksheets/fehlendeZeitbuchung';
import type { TimeEntry, WorkSheet, WorkSheetZeit } from '@/types';

/**
 * Die Kollegenzeile, an die niemand erinnert wird.
 *
 * Der Nachtrag in der Zeiterfassung deckt nur die EIGENEN Zeilen ab — ein
 * Monteur darf fremde Zeiteinträge weder lesen noch schreiben, weil in
 * derselben Sammlung Kranken- und Urlaubstage stehen (Art. 9 DSGVO). Trägt
 * er auf dem Schein „Kollege Huber, 07:00–15:30" ein, sieht das niemand
 * wieder: der Monteur nicht, weil ihm fremde Buchungen verborgen sind, und
 * Huber nicht, weil ihm der Schein eines anderen verborgen ist.
 *
 * Die Stunde steht dann unterschrieben beim Kunden und wird nie verrechnet —
 * die Rechnung nimmt ihre Stunden aus den Zeiteinträgen, nicht vom Schein.
 */

const HEUTE = '2026-09-08';

const zeit = (mitarbeiter: string, minuten = 180): WorkSheetZeit => ({
  datum: '',
  mitarbeiter,
  von: '08:00',
  bis: '11:00',
  pauseMin: 0,
  minuten,
});

const schein = (
  id: string,
  datum: string,
  p: Partial<WorkSheet> = {},
): WorkSheet & { id: string } =>
  ({
    id,
    companyId: 'perl',
    projectNumber: '2026-042',
    customerName: 'Familie Huber',
    datum,
    status: 'Unterschrieben',
    abrechnung: 'Regie',
    zeiten: [zeit('Max Perl')],
    material: [],
    erstelltVonUid: 'm1',
    erstelltVonName: 'Max Perl',
    ...p,
  }) as WorkSheet & { id: string };

type Buchung = Pick<TimeEntry, 'date' | 'status' | 'projectNumber' | 'userName'>;

const eintrag = (
  date: string,
  userName: string,
  projectNumber: string | undefined = '2026-042',
  status: TimeEntry['status'] = 'Anwesend',
): Buchung => ({ date, userName, projectNumber, status });

describe('Scheinstunden ohne Buchung', () => {
  it('meldet die Zeile des Kollegen, die niemand gebucht hat', () => {
    /*
      DER KERNFALL. Max hat gebucht, Huber nicht — und Huber erfährt es nie,
      weil er den Schein nicht sieht.
    */
    const befunde = scheineOhneBuchung(
      [schein('s1', '2026-09-01', { zeiten: [zeit('Max Perl'), zeit('Franz Huber', 240)] })],
      [eintrag('2026-09-01', 'Max Perl')],
      HEUTE,
    );
    expect(befunde).toHaveLength(1);
    expect(befunde[0].zeilen).toEqual([
      { name: 'Franz Huber', minuten: 240, art: 'keine' },
    ]);
    expect(befunde[0].minutenOhneBuchung).toBe(240);
  });

  it('schweigt, wenn alle Zeilen gebucht sind', () => {
    const befunde = scheineOhneBuchung(
      [schein('s1', '2026-09-01', { zeiten: [zeit('Max Perl'), zeit('Franz Huber')] })],
      [eintrag('2026-09-01', 'Max Perl'), eintrag('2026-09-01', 'Franz Huber')],
      HEUTE,
    );
    expect(befunde).toEqual([]);
  });

  /*
    NAMEN KOMMEN AUS ZWEI QUELLEN: der Schein trägt ihn als Text, wie ihn der
    Monteur auf der Baustelle tippt, der Zeiteintrag aus dem Benutzerkonto.
    Ein Vergleich Zeichen für Zeichen meldete Fehlbuchungen, wo keine sind —
    und eine Liste, die zu Unrecht anschlägt, wird nach einer Woche nicht
    mehr gelesen.
  */
  it('nimmt Gross- und Kleinschreibung und doppelte Leerzeichen nicht krumm', () => {
    const befunde = scheineOhneBuchung(
      [schein('s1', '2026-09-01', { zeiten: [zeit('  franz   HUBER ')] })],
      [eintrag('2026-09-01', 'Franz Huber')],
      HEUTE,
    );
    expect(befunde).toEqual([]);
  });

  /*
    GEBUCHT, ABER WOANDERS. Der Mann hat den ganzen Tag auf die Hauptbaustelle
    gebucht und war zwischendurch bei diesem Kunden. Die Arbeitszeit ist damit
    aufgezeichnet — § 26 AZG ist erfüllt —, falsch ist nur die Zuordnung, und
    die entscheidet, wem die Stunde verrechnet wird. Das ist ein anderer
    Befund als „gar nicht gebucht" und muss sich davon unterscheiden lassen.
  */
  it('unterscheidet „gar nicht gebucht" von „auf eine andere Baustelle gebucht"', () => {
    const befunde = scheineOhneBuchung(
      [schein('s1', '2026-09-01')],
      [eintrag('2026-09-01', 'Max Perl', '2026-001')],
      HEUTE,
    );
    expect(befunde[0].zeilen[0].art).toBe('andereBaustelle');
    expect(befunde[0].zeilen[0].gebuchtAuf).toEqual(['2026-001']);
    // Diese Minuten fehlen NICHT — sie stehen nur an der falschen Stelle.
    expect(befunde[0].minutenOhneBuchung).toBe(0);
  });

  it('nennt eine Buchung ohne Baustelle beim Namen', () => {
    // Leer ist hier eine Aussage, kein fehlender Wert: der Tag ist gebucht,
    // aber auf gar keine Baustelle. Ohne Text stünde in der Liste nichts.
    // Ohne `eintrag(...)`: ein ausdrückliches `undefined` würde dort den
    // Standardwert des Parameters auslösen, also gerade nicht das Feld leeren.
    const befunde = scheineOhneBuchung(
      [schein('s1', '2026-09-01')],
      [{ date: '2026-09-01', userName: 'Max Perl', status: 'Anwesend' }],
      HEUTE,
    );
    expect(befunde[0].zeilen[0].gebuchtAuf).toEqual(['ohne Baustelle']);
  });

  /*
    „PR-2026-042" stammt aus Altbeständen und meint dieselbe Baustelle wie
    „2026-042". Ohne die Normalisierung stünde jeder alte Eintrag als
    Fehlbuchung da.
  */
  it('erkennt die Baustelle auch in der alten Schreibweise', () => {
    const befunde = scheineOhneBuchung(
      [schein('s1', '2026-09-01')],
      [eintrag('2026-09-01', 'Max Perl', 'PR-2026-042')],
      HEUTE,
    );
    expect(befunde).toEqual([]);
  });

  /*
    URLAUB UND KRANKENSTAND SIND KEINE ARBEITSZEITBUCHUNG. Steht der Mann
    laut Schein beim Kunden und laut Zeiterfassung im Urlaub, ist die
    Arbeitszeit nicht aufgezeichnet — und der Widerspruch ist genau das, was
    jemand sehen muss.
  */
  it('lässt Urlaub und Krankenstand nicht als Buchung gelten', () => {
    for (const status of ['Urlaub', 'Krank'] as const) {
      const befunde = scheineOhneBuchung(
        [schein('s1', '2026-09-01')],
        [eintrag('2026-09-01', 'Max Perl', '2026-042', status)],
        HEUTE,
      );
      expect(befunde[0].zeilen[0].art, status).toBe('keine');
    }
  });

  /*
    Nur der unterschriebene Schein zählt. Ein Entwurf ist noch in Arbeit, ein
    Storno zurückgezogen, ein verworfener nie beim Kunden gewesen — für keinen
    davon wäre eine fehlende Buchung ein Befund.
  */
  it('sieht nur unterschriebene Scheine an', () => {
    for (const status of ['Entwurf', 'Storniert', 'Verworfen'] as const) {
      const befunde = scheineOhneBuchung([schein('s1', '2026-09-01', { status })], [], HEUTE);
      expect(befunde, status).toEqual([]);
    }
  });

  /*
    Gebucht wird am Ende des Arbeitstags, oft erst am Morgen darauf. Der
    Schein von gestern ist noch kein Befund, sondern der Normalfall — und
    eine Liste, die den Normalfall meldet, wird nicht gelesen.
  */
  it('wartet die ersten Tage ab', () => {
    expect(OFFEN_AB_TAGEN).toBe(2);
    expect(scheineOhneBuchung([schein('s1', '2026-09-08')], [], HEUTE)).toEqual([]);
    expect(scheineOhneBuchung([schein('s1', '2026-09-07')], [], HEUTE)).toEqual([]);
    expect(scheineOhneBuchung([schein('s1', '2026-09-06')], [], HEUTE)).toHaveLength(1);
  });

  /*
    NACH OBEN KEINE GRENZE, anders als beim Nachtrag des Monteurs (vierzehn
    Tage). Der Monteur soll an das erinnert werden, was er noch weiss; das
    Büro muss auch den Schein von vor drei Monaten finden — genau der ist der
    teure.
  */
  it('vergisst den alten Schein nicht', () => {
    const befunde = scheineOhneBuchung([schein('s1', '2026-05-04')], [], HEUTE);
    expect(befunde).toHaveLength(1);
    expect(befunde[0].tage).toBe(127);
  });

  it('stellt die ältesten nach oben', () => {
    const befunde = scheineOhneBuchung(
      [schein('neu', '2026-09-05'), schein('alt', '2026-06-01'), schein('mittel', '2026-08-01')],
      [],
      HEUTE,
    );
    expect(befunde.map((b) => b.schein.id)).toEqual(['alt', 'mittel', 'neu']);
  });

  /*
    Ein reiner Materialschein ist vollständig — dafür war niemand stundenlang
    dort. Stünde er in der Liste, wäre sie voll mit Zeilen, an denen nichts
    zu tun ist.
  */
  it('übergeht den Schein ohne Stunden', () => {
    expect(scheineOhneBuchung([schein('s1', '2026-09-01', { zeiten: [] })], [], HEUTE)).toEqual([]);
    expect(
      scheineOhneBuchung([schein('s2', '2026-09-01', { zeiten: [zeit('Max Perl', 0)] })], [], HEUTE),
    ).toEqual([]);
  });

  /*
    Zwei Spannen desselben Manns — vormittags und nach dem Materialholen —
    sind EINE fehlende Buchung, nicht zwei. Sonst stünde er doppelt in der
    Liste, und es sähe nach mehr Arbeit aus, als es ist.
  */
  it('fasst mehrere Spannen desselben Manns zusammen', () => {
    const befunde = scheineOhneBuchung(
      [schein('s1', '2026-09-01', { zeiten: [zeit('Max Perl', 180), zeit('Max Perl', 120)] })],
      [],
      HEUTE,
    );
    expect(befunde[0].zeilen).toHaveLength(1);
    expect(befunde[0].zeilen[0].minuten).toBe(300);
  });

  /*
    Die Summe ist die eigentliche Aussage der Ansicht: so viele Stunden
    stehen unterschrieben beim Kunden und in keiner Aufzeichnung. Gezählt
    werden nur die gar nicht gebuchten — die falsch zugeordneten sind ein
    Zuordnungsfehler, kein Verlust, und beide in eine Zahl zu werfen machte
    sie unbrauchbar.
  */
  it('summiert nur, was wirklich nirgends steht', () => {
    const befunde = scheineOhneBuchung(
      [
        schein('s1', '2026-09-01', { zeiten: [zeit('Franz Huber', 240)] }),
        schein('s2', '2026-08-20', { zeiten: [zeit('Max Perl', 300)] }),
      ],
      [eintrag('2026-08-20', 'Max Perl', '2026-001')],
      HEUTE,
    );
    expect(minutenOhneBuchung(befunde)).toBe(240);
  });

  it('lässt eine Zeile ohne Namen nicht als Person gelten', () => {
    // Ohne Namen ist die Zeile niemandem zuzuordnen; sie als „nicht gebucht"
    // zu melden schickte das Büro auf eine Suche ohne Ziel.
    const befunde = scheineOhneBuchung(
      [schein('s1', '2026-09-01', { zeiten: [{ ...zeit('   '), minuten: 180 }] })],
      [],
      HEUTE,
    );
    expect(befunde).toEqual([]);
  });
});
