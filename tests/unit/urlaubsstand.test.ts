import { describe, it, expect } from 'vitest';
import {
  urlaubsStand,
  calcMonthStats,
  uebertragsRegel,
  urlaubsJahrVon,
  type UebertragRegel,
} from '@/lib/time';
import type { TimeEntry } from '@/types';

/**
 * DER RESTURLAUB IM ERSTEN JAHR.
 *
 * DER GEMELDETE FALL. Ein Betrieb steigt mitten im Jahr um. Was seine Leute
 * bis dahin an Urlaub genommen haben, steht in keiner Buchung der App — die
 * gibt es erst ab dem Startdatum. Gerechnet wurde trotzdem „Jahresanspruch
 * minus Urlaubstage in der App", und das Ergebnis war um genau die
 * mitgebrachten Tage zu hoch. Dieselbe Zahl sah der Mitarbeiter, der
 * Genehmigende und die Lohn-CSV.
 *
 * Die Prüfungen hier sind nach dem gebaut, was im Betrieb passiert, nicht
 * nach den Zweigen im Code.
 */

/** Petra: 25 Tage im Jahr, Umstieg am 15. September mit 7 Tagen Rest. */
const petra = {
  yearlyVacationDays: 25,
  initialVacationDays: 7,
  appStartDate: '2026-09-15',
};

describe('Im Jahr des Umstiegs', () => {
  it('zählt den mitgebrachten Bestand, nicht den Jahresanspruch', () => {
    // Genau der gemeldete Fall: 25 wären falsch, 7 sind richtig.
    const stand = urlaubsStand(petra, 2026, []);
    expect(stand.anspruch).toBe(7);
    expect(stand.rest).toBe(7);
    expect(stand.ausAnfangsbestand).toBe(true);
  });

  it('zieht ab, was nach dem Umstieg genommen wurde', () => {
    const stand = urlaubsStand(petra, 2026, [{ von: '2026-10-05', tage: 4 }]);
    expect(stand.genommen).toBe(4);
    expect(stand.rest).toBe(3);
  });

  it('zieht NICHT ab, was vor dem Umstieg liegt — das steckt schon im Bestand', () => {
    /*
      Die Buchhaltung darf fremde Zeiteinträge nachtragen, auch rückwirkend.
      Landet dabei ein Urlaubstag von vor dem Startdatum in der App, wäre er
      zweimal weg: einmal im mitgebrachten Bestand, einmal als Eintrag.
    */
    const stand = urlaubsStand(petra, 2026, [
      { von: '2026-03-02', tage: 5 },
      { von: '2026-10-05', tage: 4 },
    ]);
    expect(stand.genommen).toBe(4);
    expect(stand.rest).toBe(3);
  });

  it('zählt den Starttag selbst mit', () => {
    // Die Grenze gehört zum neuen Zeitraum: „Bestand AM Startdatum" heisst,
    // dass an diesem Tag noch nichts abgezogen ist.
    const stand = urlaubsStand(petra, 2026, [{ von: '2026-09-15', tage: 1 }]);
    expect(stand.genommen).toBe(1);
    expect(stand.rest).toBe(6);
  });

  it('lässt den Rest ins Minus laufen, statt bei null zu halten', () => {
    /*
      Wer mehr genommen hat, als ihm blieb, hat ein Minus — und das gehört
      hingeschrieben. Auf null zu kappen versteckte genau den Fall, wegen
      dessen jemand hinsieht.
    */
    expect(urlaubsStand(petra, 2026, [{ von: '2026-10-05', tage: 9 }]).rest).toBe(-2);
  });
});

describe('In jedem anderen Jahr', () => {
  it('kommt der Jahresanspruch dazu — und was übrig war, bleibt', () => {
    /*
      HIER STAND BIS ZUM ÜBERTRAG `toBe(25)`, und das war der Fehler, den
      diese Änderung behebt: am 1. Jänner wurde der Rest weggeworfen. Petra
      hatte beim Umstieg 7 Tage und nichts genommen — sie geht mit 32 ins
      nächste Jahr, nicht mit 25.
    */
    const stand = urlaubsStand(petra, 2027, []);
    expect(stand.anspruch).toBe(32);
    expect(stand.uebertrag).toBe(7);
    expect(stand.ausAnfangsbestand).toBe(false);
  });

  it('zählt dann auch wieder alle Tage des Jahres', () => {
    // Die Sperre „erst ab dem Startdatum" gehört zum Umstiegsjahr und darf
    // nicht im Folgejahr weiterwirken — dort liegt JEDER Tag danach.
    const stand = urlaubsStand(petra, 2027, [{ von: '2027-01-08', tage: 3 }]);
    expect(stand.genommen).toBe(3);
    expect(stand.rest).toBe(29);
  });

  it('auch im Jahr VOR dem Umstieg', () => {
    const stand = urlaubsStand(petra, 2025, [{ von: '2025-07-01', tage: 2 }]);
    expect(stand.anspruch).toBe(25);
    expect(stand.rest).toBe(23);
  });
});

describe('Ohne Angabe bleibt alles wie vorher', () => {
  it('ohne Anfangsbestand gilt der Jahresanspruch — auch im Startjahr', () => {
    /*
      Das ist der Zustand jeder bestehenden Zeile. Diese Änderung darf ihre
      Bedeutung nicht verschieben, sonst wäre die Reparatur an einer Stelle
      ein neuer Fehler an allen anderen.
    */
    const ohne = { yearlyVacationDays: 25, initialVacationDays: null, appStartDate: '2026-09-15' };
    const stand = urlaubsStand(ohne, 2026, [{ von: '2026-03-02', tage: 5 }]);
    expect(stand.anspruch).toBe(25);
    expect(stand.genommen).toBe(5);
    expect(stand.ausAnfangsbestand).toBe(false);
  });

  it('ohne Startdatum gibt es kein Umstiegsjahr', () => {
    const ohne = { yearlyVacationDays: 25, initialVacationDays: 7, appStartDate: null };
    expect(urlaubsStand(ohne, 2026, []).anspruch).toBe(25);
  });

  it('ohne Jahresanspruch greift die Vorgabe des Betriebs', () => {
    expect(
      urlaubsStand({ yearlyVacationDays: undefined, initialVacationDays: null, appStartDate: null }, 2026, [])
        .anspruch,
    ).toBe(25);
  });
});

describe('Null Tage sind eine Angabe, keine fehlende', () => {
  it('ein Bestand von 0 heisst: aufgebraucht', () => {
    /*
      DER UNTERSCHIED, AN DEM ES HÄNGT. `0` und „nichts eingetragen" sehen in
      JavaScript schnell gleich aus — mit `||` oder `??` an der falschen
      Stelle würde aus „hat nichts mehr" ein voller Jahresanspruch. Dann
      bekäme ausgerechnet der, dessen Urlaub weg ist, 25 Tage angezeigt.
    */
    const leer = { yearlyVacationDays: 25, initialVacationDays: 0, appStartDate: '2026-09-15' };
    const stand = urlaubsStand(leer, 2026, []);
    expect(stand.anspruch).toBe(0);
    expect(stand.ausAnfangsbestand).toBe(true);
  });

  it('ein negativer Bestand bleibt negativ', () => {
    // Wer im Vorgriff mehr genommen hat, als ihm zusteht, bringt ein Minus
    // mit — dieselbe Lesart wie beim Start-Saldo der Stunden.
    const minus = { yearlyVacationDays: 25, initialVacationDays: -2, appStartDate: '2026-09-15' };
    expect(urlaubsStand(minus, 2026, []).rest).toBe(-2);
  });
});

describe('Die Monatszahlen der Buchhaltung nehmen dieselbe Regel', () => {
  /*
    WARUM DAS EIGENS GEPRÜFT WIRD. Die Regel kann stimmen und trotzdem
    nirgends ankommen: `calcMonthStats` hat den Resturlaub vorher SELBST
    gerechnet. Diese Prüfung hält fest, dass sie ihn jetzt holt — sonst zeigt
    die Mitarbeiteransicht die richtige Zahl und die Lohn-CSV die alte.
  */
  const eintrag = (date: string): TimeEntry => ({
    id: date, companyId: 'x', userId: 'petra', date, status: 'Urlaub',
  });

  it('rechnet den Resturlaub im Umstiegsjahr aus dem Anfangsbestand', () => {
    const stats = calcMonthStats(
      { weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], ...petra },
      [],
      [eintrag('2026-10-05'), eintrag('2026-10-06')],
      2026,
      9,
    );
    expect(stats.urlaubRest).toBe(5);
    expect(stats.urlaubsAnspruch).toBe(7);
    expect(stats.urlaubAusAnfangsbestand).toBe(true);
  });

  it('zählt daneben weiter ALLE Urlaubstage des Jahres', () => {
    /*
      `yearlyUrlaubDays` ist eine Beobachtung („so viele stehen in der App"),
      kein Anspruch. Im Umstiegsjahr dürfen sich die beiden Zahlen
      unterscheiden — würde man sie gleichsetzen, ginge eine von beiden
      verloren.
    */
    const stats = calcMonthStats(
      { weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], ...petra },
      [],
      [eintrag('2026-03-02'), eintrag('2026-10-05')],
      2026,
      9,
    );
    expect(stats.yearlyUrlaubDays).toBe(2);
    // Gegen den Anspruch zählt nur der Tag NACH dem Umstieg.
    expect(stats.urlaubRest).toBe(6);
  });

  it('ohne Anfangsbestand bleibt es beim Jahresanspruch', () => {
    const stats = calcMonthStats(
      {
        weeklyTargetHours: 40, yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5],
        appStartDate: '2026-09-15', initialVacationDays: null,
      },
      [],
      [eintrag('2026-10-05')],
      2026,
      9,
    );
    expect(stats.urlaubRest).toBe(24);
    expect(stats.urlaubAusAnfangsbestand).toBe(false);
  });
});

/**
 * DER ÜBERTRAG ZUM JAHRESWECHSEL.
 *
 * Bis hierher sprang der Resturlaub am 1. Jänner auf den vollen
 * Jahresanspruch zurück; was übrig war, verschwand. In Österreich verfällt
 * nicht verbrauchter Urlaub aber nicht am Jahresende — er verjährt erst zwei
 * Jahre nach dem Jahr, in dem er entstand (§ 4 Abs 5 UrlG).
 *
 * Gerechnet wird in Jahrgängen, weil ein blosser Saldo nicht sagen kann,
 * WELCHE Tage alt sind.
 */

/** Anton: 25 Tage im Jahr, in der App seit Anfang 2024, ohne Anfangsbestand. */
const anton = {
  yearlyVacationDays: 25,
  initialVacationDays: null,
  appStartDate: '2024-01-01',
};

const VERJAEHRT: UebertragRegel = { art: 'verjaehrung' };
const STICHTAG: UebertragRegel = { art: 'stichtag', stichtag: '03-31' };

describe('Übertrag nach der gesetzlichen Verjährung', () => {
  it('nimmt den Rest ins nächste Jahr mit', () => {
    const stand = urlaubsStand(anton, 2025, [{ von: '2024-07-01', tage: 20 }], VERJAEHRT);
    expect(stand.uebertrag).toBe(5);
    expect(stand.anspruch).toBe(30);
  });

  it('lässt einen Jahrgang zwei Jahre nach seinem Jahr verfallen', () => {
    /*
      Der Jahrgang 2024 lebt bis Ende 2026. Anton nimmt nie Urlaub:
        2025  25 + 25 = 50
        2026  25 + 25 + 25 = 75
        2027  der Jahrgang 2024 ist weg — 25 + 25 + 25 = 75, nicht 100
    */
    expect(urlaubsStand(anton, 2026, [], VERJAEHRT).anspruch).toBe(75);
    const stand = urlaubsStand(anton, 2027, [], VERJAEHRT);
    expect(stand.anspruch).toBe(75);
    expect(stand.verfallen).toBe(25);
  });

  it('verbraucht den ÄLTESTEN Jahrgang zuerst', () => {
    /*
      Das ist die für den Mitarbeiter günstige Reihenfolge: so verfällt so
      wenig wie möglich. Anton nimmt 2025 zwanzig Tage — die gehen auf 2024,
      nicht auf 2025. Ende 2026 verfällt vom Jahrgang 2024 deshalb nur der
      Rest von fünf.
    */
    const genommen = [{ von: '2025-06-02', tage: 20 }];
    expect(urlaubsStand(anton, 2027, genommen, VERJAEHRT).verfallen).toBe(5);
  });

  it('meldet nichts als verfallen, wenn der alte Jahrgang aufgebraucht war', () => {
    // Die Gegenprobe: wer seinen alten Urlaub verbraucht, verliert nichts.
    const genommen = [{ von: '2025-06-02', tage: 25 }];
    expect(urlaubsStand(anton, 2027, genommen, VERJAEHRT).verfallen).toBe(0);
  });
});

describe('Übertrag mit vereinbartem Verfallsstichtag', () => {
  /** Anton hat 2024 zwanzig von fünfundzwanzig Tagen genommen: fünf bleiben. */
  const ausZweiundzwanzigVier = { von: '2024-07-01', tage: 20 };

  it('zehrt ein Urlaub VOR dem Stichtag noch vom alten Jahrgang', () => {
    /*
      Am 2. März 2025 stehen Anton 30 Tage zur Verfügung — 25 neue und 5
      mitgebrachte. Die drei Tage gehen auf den alten Jahrgang, also verfallen
      am 31.03. nur noch zwei statt fünf. Genau dafür liegt der Stichtag
      mitten im Jahr und nicht an seinem Rand.
    */
    const stand = urlaubsStand(
      anton, 2025, [ausZweiundzwanzigVier, { von: '2025-03-02', tage: 3 }], STICHTAG,
    );
    expect(stand.uebertrag).toBe(5);
    expect(stand.verfallen).toBe(2);
    expect(stand.rest).toBe(25);
  });

  it('lässt den alten Jahrgang am Stichtag verfallen', () => {
    // Der Urlaub im Juni kommt zu spät — die fünf Tage aus 2024 sind weg.
    const stand = urlaubsStand(
      anton, 2025, [ausZweiundzwanzigVier, { von: '2025-06-02', tage: 3 }], STICHTAG,
    );
    expect(stand.verfallen).toBe(5);
    expect(stand.rest).toBe(22);
  });

  it('verfällt auch dann, wenn im ganzen Jahr kein Urlaub genommen wurde', () => {
    /*
      DER FALL, DEN EINE SCHLEIFE ÜBER DIE URLAUBE VERLIERT. Ohne einen
      einzigen Eintrag gäbe es keinen Zeitpunkt, an dem der Stichtag
      „überschritten" wird — und der alte Jahrgang bliebe für immer stehen.
      Deshalb steht dieselbe Prüfung noch einmal HINTER der Schleife.
    */
    const stand = urlaubsStand(anton, 2025, [ausZweiundzwanzigVier], STICHTAG);
    expect(stand.verfallen).toBe(5);
    expect(stand.rest).toBe(25);
  });

  it('greift im Startjahr nicht — davor gibt es nichts zu verfallen', () => {
    const stand = urlaubsStand(anton, 2024, [{ von: '2024-06-03', tage: 2 }], STICHTAG);
    expect(stand.verfallen).toBe(0);
    expect(stand.anspruch).toBe(25);
  });
});

describe('Der Anfangsbestand trägt in die Folgejahre', () => {
  it('bringt Petras sieben Tage ins nächste Jahr', () => {
    // Der Anfangsbestand IST der Jahrgang des Startjahres — er verhält sich
    // ab da wie jeder andere.
    expect(urlaubsStand(petra, 2027, [], VERJAEHRT).uebertrag).toBe(7);
  });

  it('und lässt sie mit dem Startjahrgang verjähren', () => {
    // Jahrgang 2026 lebt bis Ende 2028; 2029 ist er weg.
    expect(urlaubsStand(petra, 2029, [], VERJAEHRT).uebertrag).toBe(50);
  });
});

describe('Ohne Übertragsregel gilt das Gesetz', () => {
  it('die Vorgabe ist die Verjährung, nicht das Wegwerfen', () => {
    /*
      Was ein Betrieb nicht eingestellt hat, richtet sich nach dem Gesetz —
      nicht nach dem, was die App vorher tat. Hätte die Vorgabe „kein
      Übertrag" geheissen, wäre der Fehler als Einstellung konserviert.
    */
    expect(urlaubsStand(anton, 2025, [])).toEqual(
      urlaubsStand(anton, 2025, [], VERJAEHRT),
    );
  });
});

describe('Die Regel aus den Stammdaten des Betriebs', () => {
  it('nimmt den Stichtag, wenn er gesetzt ist', () => {
    expect(uebertragsRegel({ urlaubUebertrag: 'stichtag', urlaubStichtag: '03-31' }))
      .toEqual({ art: 'stichtag', stichtag: '03-31', jahresbeginn: '01-01' });
  });

  it('gibt ohne Angabe das Kalenderjahr als Urlaubsjahr aus', () => {
    // Die Vorgabe ist der häufigste Fall — und die einzige, bei der sich für
    // bestehende Betriebe keine einzige Zahl bewegt.
    expect(uebertragsRegel(null).jahresbeginn).toBe('01-01');
    expect(uebertragsRegel({}).jahresbeginn).toBe('01-01');
  });

  it('nimmt den eingestellten Beginn des Urlaubsjahres', () => {
    expect(uebertragsRegel({ urlaubJahresbeginn: '07-01' }).jahresbeginn).toBe('07-01');
  });

  it('fällt ohne Einstellung auf das Gesetz zurück', () => {
    expect(uebertragsRegel(null).art).toBe('verjaehrung');
    expect(uebertragsRegel({}).art).toBe('verjaehrung');
  });

  it('fällt auch bei „Stichtag ohne Datum" auf das Gesetz zurück', () => {
    /*
      Die Datenbank lässt diesen Zustand nicht zu. Eine Rechnung, die sich
      darauf VERLÄSST, hat trotzdem eine Annahme eingebaut — und die Antwort
      „Gesetz" ist die einzige, die niemandem etwas wegnimmt. „Verfällt nie"
      wäre zu viel, ein Absturz zu wenig.
    */
    expect(uebertragsRegel({ urlaubUebertrag: 'stichtag', urlaubStichtag: null }).art)
      .toBe('verjaehrung');
  });
});

describe('Ein Urlaubsjahr, das nicht am 1. Jänner beginnt', () => {
  /*
    DER STILLE FEHLER, DEN DAS BEHEBT. Bis zum 20.09.2026 entstand der neue
    Anspruch fest am 1. Jänner. Führt ein Betrieb sein Urlaubsjahr vom 1. Juli
    bis zum 30. Juni, kam er damit ein halbes Jahr zu früh — und der Übertrag
    wurde im falschen Moment gemessen. Auf dem Bildschirm stand eine Zahl, die
    richtig aussah.
  */
  const JULI: UebertragRegel = { art: 'verjaehrung', jahresbeginn: '07-01' };
  const person = { yearlyVacationDays: 25, initialVacationDays: null, appStartDate: '2026-07-01' };

  it('ordnet ein Datum dem Jahr zu, in dem das Urlaubsjahr BEGINNT', () => {
    // Der 3. März 2027 gehört in das Urlaubsjahr 2026 (1.7.2026 – 30.6.2027).
    expect(urlaubsJahrVon('2027-03-03', '07-01')).toBe(2026);
    expect(urlaubsJahrVon('2026-07-01', '07-01')).toBe(2026);
    expect(urlaubsJahrVon('2026-06-30', '07-01')).toBe(2025);
    // Und beim Kalenderjahr ist die Antwort schlicht die Jahreszahl.
    expect(urlaubsJahrVon('2027-03-03')).toBe(2027);
  });

  it('zählt den Urlaub im März zum laufenden Urlaubsjahr, nicht zum nächsten', () => {
    /*
      GENAU HIER SASS DER FEHLER. Mit dem Kalenderjahr gerechnet fiele dieser
      Urlaub in ein neues Jahr mit vollem Anspruch — der Mitarbeiter hätte im
      März plötzlich wieder 25 Tage.
    */
    const stand = urlaubsStand(person, 2026, [{ von: '2027-03-03', tage: 5 }], JULI);
    expect(stand.genommen).toBe(5);
    expect(stand.rest).toBe(20);
  });

  it('lässt den neuen Anspruch erst am 1. Juli entstehen', () => {
    const vorher = urlaubsStand(person, 2026, [{ von: '2027-06-30', tage: 25 }], JULI);
    expect(vorher.rest).toBe(0);

    // Einen Tag später beginnt das nächste Urlaubsjahr — und der Anspruch ist
    // wieder da, ohne dass der alte Rest verschwindet.
    const nachher = urlaubsStand(person, 2027, [{ von: '2027-06-30', tage: 25 }], JULI);
    expect(nachher.rest).toBe(25);
    expect(nachher.genommen).toBe(0);
  });

  it('sucht den Verfallstag IM Urlaubsjahr und nicht im Kalenderjahr', () => {
    /*
      DER FEHLER, DEN DAS ABFÄNGT, KOSTET DEM MITARBEITER TAGE.

      Ein Stichtag 31. März liegt in einem Urlaubsjahr, das am 1. Juli
      beginnt, im FOLGENDEN Kalenderjahr: das Urlaubsjahr 2027 läuft vom
      1.7.2027 bis zum 30.6.2028, sein Stichtag ist der 31.3.2028. Wer stur
      `2027-03-31` bildete, legte den Verfallstag VOR den Beginn des Jahres —
      dann wäre jeder Urlaub des Jahres „nach dem Stichtag", und der alte
      Jahrgang verfiele schon beim ersten Antrag im Juli.

      Geprüft wird deshalb mit einem Urlaub DAZWISCHEN: am 1.9.2027 liegt er
      nach dem falschen und vor dem richtigen Stichtag.
    */
    const stichtag: UebertragRegel = { art: 'stichtag', stichtag: '03-31', jahresbeginn: '07-01' };
    const stand = urlaubsStand(person, 2027, [{ von: '2027-09-01', tage: 5 }], stichtag);

    // Die fünf Tage zehren noch vom alten Jahrgang (ältester zuerst), und erst
    // am 31.3.2028 verfallen die restlichen zwanzig.
    expect(stand.verfallen).toBe(20);
  });

  it('nimmt das Urlaubsjahr des Startdatums, nicht dessen Jahreszahl', () => {
    /*
      Wer am 1.3.2027 auf die App umsteigt, steigt mitten im Urlaubsjahr 2026
      ein (1.7.2026 – 30.6.2027). Zählte man das Startjahr aus der Jahreszahl,
      läge es bei 2027 — also NACH dem angezeigten Jahr —, und die Rechnung
      fiele auf „kein Verlauf, voller Jahresanspruch" zurück. Der mitgebrachte
      Rest von sieben Tagen wäre damit auf 25 aufgeblasen.
    */
    const umsteiger = {
      yearlyVacationDays: 25,
      initialVacationDays: 7,
      appStartDate: '2027-03-01',
    };
    const stand = urlaubsStand(umsteiger, 2026, [], JULI);
    expect(stand.anspruch).toBe(7);
    expect(stand.ausAnfangsbestand).toBe(true);
  });
});
