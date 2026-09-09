import { describe, it, expect } from 'vitest';
import { offeneNachtraege, NACHTRAG_TAGE } from '@/features/worksheets/zeitNachtrag';
import type { TimeEntry, WorkSheet } from '@/types';

/**
 * Unterschriebene Scheine, für die noch kein Zeiteintrag existiert.
 *
 * DAS IST NICHT NUR UNSCHÖN, ES KOSTET GELD. Die Rechnung rechnet ihre
 * Stunden aus den ZEITEINTRÄGEN, nicht vom Schein — der Schein liefert nur
 * das Material. Eine Stunde, die nie gebucht wird, wird also nie verrechnet.
 * Nicht „später korrigiert": nie. Und es fehlt zugleich die
 * Arbeitszeitaufzeichnung nach § 26 AZG.
 */

const HEUTE = '2026-09-08';

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
    zeiten: [{ datum, mitarbeiter: 'Max', von: '08:00', bis: '11:00', pauseMin: 0, minuten: 180 }],
    material: [],
    erstelltVonUid: 'm1',
    erstelltVonName: 'Max',
    ...p,
  }) as WorkSheet & { id: string };

const eintrag = (date: string, projectNumber = '2026-042', status: TimeEntry['status'] = 'Anwesend') =>
  ({ date, projectNumber, status }) as Pick<TimeEntry, 'date' | 'status' | 'projectNumber'>;

describe('Was nachzutragen ist', () => {
  it('meldet einen unterschriebenen Schein ohne Zeiteintrag', () => {
    const offen = offeneNachtraege([schein('s1', '2026-09-07')], [], HEUTE, 'Max');
    expect(offen).toHaveLength(1);
    expect(offen[0].minuten).toBe(180);
    // Die Spanne wandert als Vorschlag ins Formular — abtippen ist genau die
    // Reibung, an der das Nachtragen scheitert.
    expect(offen[0].von).toBe('08:00');
    expect(offen[0].bis).toBe('11:00');
  });

  it('schweigt, sobald die Zeit gebucht ist', () => {
    const offen = offeneNachtraege(
      [schein('s1', '2026-09-07')],
      [eintrag('2026-09-07')],
      HEUTE,
      'Max',
    );
    expect(offen).toEqual([]);
  });

  /*
    DIE MINUTEN WERDEN NICHT VERGLICHEN. Sie dürfen abweichen, und zwar
    regelmässig: der Schein bestätigt die Zeit beim Kunden, der Eintrag
    umfasst den Arbeitstag. Ein Wächter, der jede Abweichung meldet, schlüge
    ständig zu Recht an — und würde nach einer Woche weggeklickt.
  */
  it('meldet nichts, wenn der Eintrag länger ist als der Schein', () => {
    const offen = offeneNachtraege(
      [schein('s1', '2026-09-07')],
      [eintrag('2026-09-07')],
      HEUTE,
      'Max',
    );
    expect(offen).toEqual([]);
  });

  it('unterscheidet die Baustelle', () => {
    // Am selben Tag auf einer anderen Baustelle gebucht — der Schein bleibt
    // offen, denn diese Leistung ist nicht erfasst.
    const offen = offeneNachtraege(
      [schein('s1', '2026-09-07')],
      [eintrag('2026-09-07', '2026-099')],
      HEUTE,
      'Max',
    );
    expect(offen).toHaveLength(1);
  });

  it('erkennt eine Buchung mit führendem „PR-" aus Altbeständen', () => {
    // Sonst stünde für jede alte Schreibweise ein Nachtrag da, den es nicht
    // gibt — und der Hinweis verlöre seinen Wert.
    const offen = offeneNachtraege(
      [schein('s1', '2026-09-07')],
      [eintrag('2026-09-07', 'PR-2026-042')],
      HEUTE,
      'Max',
    );
    expect(offen).toEqual([]);
  });

  it('zählt Krank und Urlaub nicht als Buchung', () => {
    const offen = offeneNachtraege(
      [schein('s1', '2026-09-07')],
      [eintrag('2026-09-07', '2026-042', 'Krank')],
      HEUTE,
      'Max',
    );
    expect(offen).toHaveLength(1);
  });
});

describe('Was gar nicht erst gemeldet wird', () => {
  it('ein Entwurf — er ist noch kein Beleg', () => {
    const offen = offeneNachtraege([schein('s1', '2026-09-07', { status: 'Entwurf' })], [], HEUTE, 'Max');
    expect(offen).toEqual([]);
  });

  it('ein stornierter Schein', () => {
    const offen = offeneNachtraege(
      [schein('s1', '2026-09-07', { status: 'Storniert' })],
      [],
      HEUTE,
      'Max',
    );
    expect(offen).toEqual([]);
  });

  /*
    EIN REINER MATERIALSCHEIN IST VOLLSTÄNDIG. Dafür war niemand stundenlang
    dort — es gibt nichts nachzutragen, und eine Meldung wäre Lärm.
  */
  it('ein Schein ganz ohne Zeiten', () => {
    const offen = offeneNachtraege([schein('s1', '2026-09-07', { zeiten: [] })], [], HEUTE, 'Max');
    expect(offen).toEqual([]);
  });

  it('ein Schein, dessen Zeilen null Minuten tragen', () => {
    const offen = offeneNachtraege(
      [
        schein('s1', '2026-09-07', {
          zeiten: [{ datum: '2026-09-07', mitarbeiter: 'Max', minuten: 0 }],
        }),
      ],
      [],
      HEUTE,
      'Max',
    );
    expect(offen).toEqual([]);
  });
});

describe('Das Zeitfenster', () => {
  /*
    VIERZEHN TAGE. Länger würde zur Dauerliste: hat jemand den Tag auf eine
    andere Baustelle gebucht, bleibt der Hinweis stehen — und ein Hinweis,
    der ständig zu Unrecht dasteht, wird nicht mehr gelesen. Der lange
    Schwanz gehört ins Büro, zur „nicht verrechneten Leistung".
  */
  it('reicht genau bis an die Grenze', () => {
    const grenze = '2026-08-25'; // 14 Tage vor dem 08.09.
    const offen = offeneNachtraege([schein('s1', grenze)], [], HEUTE, 'Max');
    expect(offen).toHaveLength(1);
    expect(NACHTRAG_TAGE).toBe(14);
  });

  it('lässt Älteres liegen', () => {
    const offen = offeneNachtraege([schein('s1', '2026-08-24')], [], HEUTE, 'Max');
    expect(offen).toEqual([]);
  });

  it('lässt ein Datum in der Zukunft liegen', () => {
    // Ein Schein von morgen ist ein Tippfehler, keine offene Nachtragung.
    const offen = offeneNachtraege([schein('s1', '2026-09-09')], [], HEUTE, 'Max');
    expect(offen).toEqual([]);
  });

  it('stellt die ältesten nach oben', () => {
    // Was zwei Wochen her ist, weiss niemand mehr genau — das gehört zuerst
    // nachgetragen, solange es überhaupt noch jemand erinnert.
    const offen = offeneNachtraege(
      [schein('neu', '2026-09-07'), schein('alt', '2026-08-28')],
      [],
      HEUTE,
      'Max',
    );
    expect(offen.map((n) => n.schein.id)).toEqual(['alt', 'neu']);
  });
});

/**
 * WER GEMAHNT WIRD — der gemeldete Fehler vom 09.09.2026.
 *
 * „In der Zeiterfassung im Admin-Konto scheint diese Meldung auf: zu den
 * beschriebenen Zeiten gibt es Buchungen eines Mitarbeiters."
 *
 * Als „eigener Schein" galt, was `erstelltVonUid` sagte: wer ihn GESCHRIEBEN
 * hat. Dahinter steckte die Annahme, dass der Schreiber auch der Arbeitende
 * ist. Für den Monteur beim Kunden stimmt sie — nicht aber, wenn das Büro
 * einen Schein nachträglich für einen Monteur schreibt (den Weg gibt es in
 * der Baustellenliste) oder wenn jemand Belege zum Ausprobieren anlegt.
 *
 * Die Zeiterfassung forderte dann die Buchhalterin auf, Stunden zu buchen,
 * die ein anderer geleistet hat. Deren Zeiten waren längst gebucht; der
 * Hinweis stand trotzdem da, weil er in IHRE Einträge sah.
 */
describe('Wer gemahnt wird', () => {
  const fremd = schein('s1', '2026-09-07', {
    // Vom Büro geschrieben, gearbeitet hat der Monteur.
    erstelltVonUid: 'buch1',
    erstelltVonName: 'Petra Perl',
    zeiten: [
      { datum: '2026-09-07', mitarbeiter: 'Max Mustermann', von: '08:00', bis: '11:00', minuten: 180 },
    ],
  });

  it('mahnt NICHT, wer den Schein nur geschrieben hat', () => {
    expect(offeneNachtraege([fremd], [], HEUTE, 'Petra Perl')).toEqual([]);
  });

  it('mahnt sehr wohl den, der auf dem Schein steht', () => {
    // Der eigentliche Zweck bleibt: der Monteur wird an seine Stunden erinnert.
    const offen = offeneNachtraege([fremd], [], HEUTE, 'Max Mustermann');
    expect(offen).toHaveLength(1);
    expect(offen[0].minuten).toBe(180);
  });

  it('nimmt Gross-, Kleinschreibung und doppelte Leerzeichen nicht übel', () => {
    // Der Schein trägt keine Kennung, nur den Namen — dieselbe Zuordnung wie
    // in der Bürosicht. Ein zweites Leerzeichen darf sie nicht auseinander-
    // reissen.
    expect(offeneNachtraege([fremd], [], HEUTE, '  max   mustermann ')).toHaveLength(1);
  });

  it('rechnet nur die EIGENEN Zeilen zusammen', () => {
    /*
      Auf einem Schein stehen oft zwei Leute. Die Summe beider als „deine
      Zeit" vorzuschlagen wäre eine zu hohe Arbeitszeitaufzeichnung — und die
      wandert auf einen Lohnzettel.
    */
    const zuZweit = schein('s2', '2026-09-07', {
      zeiten: [
        { datum: '2026-09-07', mitarbeiter: 'Max Mustermann', von: '08:00', bis: '11:00', minuten: 180 },
        { datum: '2026-09-07', mitarbeiter: 'Franz Huber', von: '08:00', bis: '16:00', minuten: 480 },
      ],
    });
    const offen = offeneNachtraege([zuZweit], [], HEUTE, 'Franz Huber');
    expect(offen[0].minuten).toBe(480);
    // Und der Vorschlag fürs Formular ist SEINE Spanne, nicht die des Kollegen.
    expect(offen[0].bis).toBe('16:00');
  });

  it('schweigt, wenn die Zeile niemanden nennt', () => {
    /*
      „Unbekannt" auf mich zu beziehen wäre wieder genau die Vermutung, die
      diesen Fehler erzeugt hat. Verloren geht dabei nichts: die Bürosicht
      „Stunden ohne Buchung" prüft alle Zeilen aller Scheine und ist dafür da.
    */
    const ohneNamen = schein('s3', '2026-09-07', {
      zeiten: [{ datum: '2026-09-07', mitarbeiter: '', von: '08:00', bis: '11:00', minuten: 180 }],
    });
    expect(offeneNachtraege([ohneNamen], [], HEUTE, 'Max Mustermann')).toEqual([]);
  });

  it('schweigt auch, wenn gar niemand angemeldet ist', () => {
    // Ein leerer Name darf nicht auf leere Zeilen passen.
    expect(offeneNachtraege([fremd], [], HEUTE, '')).toEqual([]);
  });
});
