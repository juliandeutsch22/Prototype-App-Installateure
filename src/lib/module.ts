
/**
 * Module: welche Teile der App ein Betrieb überhaupt benutzt.
 *
 * WOZU. Die App ist über die Zeit auf siebzehn Bereiche gewachsen. Ein Betrieb
 * braucht selten alle: wer extern fakturiert, will keine Rechnungen sehen; wer
 * kein Lager führt, keine Materialanforderung; wer die Einteilung telefonisch
 * macht, keine Einsatzplanung. Jeder ungenutzte Bereich ist ein Eintrag in der
 * Navigation, eine Frage im Kopf und eine Stelle, an der etwas kaputtgehen
 * kann, ohne dass es jemand merkt.
 *
 * WAS EIN MODUL NICHT IST — und das ist der wichtigste Satz hier:
 *
 *   EIN ABGESCHALTETES MODUL IST KEINE SICHERHEITSGRENZE.
 *
 * Es nimmt den Weg weg, nicht das Recht. Wer als Buchhaltung Rechnungen
 * anlegen darf, darf das weiterhin — die Oberfläche bietet es nur nicht mehr
 * an, und die Route ist zu. Serverseitig durchzusetzen wäre möglich, kostete
 * aber bei JEDEM Schreibvorgang eine zusätzliche Leseoperation auf das
 * Firmendokument, und der Gewinn wäre gering: die Rolle darf es ja ohnehin.
 * Was sehr wohl serverseitig geschützt ist, ist die Modulliste SELBST —
 * sonst schaltete sich ein Monteur frei, was er will (Trigger
 * `companies_einstellungen`).
 *
 * Wer diesen Unterschied nicht kennt, hält Module für Rechteverwaltung. Die
 * steht woanders: in den Rollen und im Zeilenschutz.
 */

export type ModulId =
  | 'einsatzplanung'
  | 'material'
  | 'urlaub'
  | 'scheine'
  | 'angebote'
  | 'rechnungen'
  | 'nachkalkulation'
  | 'wartung'
  | 'zeitkonten';

/**
 * Eine Unterfähigkeit eines Moduls, etwa `baustellen.aufgaben`: ein Teil, den
 * ein Betrieb einzeln ein- oder ausschaltet (N02, E52).
 *
 * WARUM UNTER EINEM MODUL und nicht als eigenes Modul: der Ausbau bringt
 * Dutzende solcher Teile (Aufgaben, Mängel, Lagerorte, Scan, Fahrtenbuch …).
 * Als flache Liste wären es sechzig Schalter ohne Ordnung; unter ihrem Modul
 * steht jeder dort, wo man ihn sucht — und geht mit dem Modul aus, ohne dass
 * jemand jeden einzeln abschalten muss.
 *
 * Gespeichert wird sie im selben Feld wie die Module (`companies.modules`),
 * unter ihrer Kennung mit Punkt. Ein Schlüssel mit Punkt kollidiert mit keinem
 * Modul, und der Server-Trigger, der die Liste schützt, schützt sie mit.
 */
export type FaehigkeitId = `${ModulId}.${string}`;

export interface Faehigkeit {
  id: FaehigkeitId;
  name: string;
  /** Ein Satz: was der Betrieb damit tut. */
  zweck: string;
  /** An oder aus, solange nichts festgelegt ist — und nur, wenn das Modul an ist. */
  standard: boolean;
  /** Weitere Voraussetzungen über das eigene Modul hinaus. */
  abhaengigVon?: SchalterId[];
  /** Was in der Oberfläche verschwindet. */
  betrifft: string[];
  /** Was beim Abschalten darüber hinaus geschieht (siehe `Modul.folgen`). */
  folgen?: string[];
}

/** Alles, was sich schalten lässt: ein Modul oder eine Unterfähigkeit. */
export type SchalterId = ModulId | FaehigkeitId;

export interface Modul {
  id: ModulId;
  name: string;
  /** Ein Satz: was der Betrieb damit tut. */
  zweck: string;
  /** An oder aus, solange nichts festgelegt ist. */
  standard: boolean;
  /**
   * Module, ohne die dieses nicht sinnvoll läuft.
   *
   * Die Nachkalkulation braucht einen Erlös, und der kommt aus den
   * Rechnungen. Ohne sie zeigte sie für jede Baustelle „keine Aussage" — eine
   * Ansicht, die nur mitteilt, dass sie nichts mitteilen kann.
   */
  abhaengigVon?: ModulId[];
  /** Was in der Navigation verschwindet — für die Anzeige im Panel. */
  betrifft: string[];
  /**
   * Was beim Abschalten ÜBER DAS VERSCHWINDEN HINAUS geschieht und sich durch
   * Wiedereinschalten nicht zurückholen lässt.
   *
   * Die Seite „Module“ versprach „vorhandene Daten bleiben unangetastet“.
   * Für die Einsatzplanung stimmte das nicht: der Server beendet beim
   * Abschalten die Kalender-Abos des ganzen Plans (Trigger
   * `companies_gesamtplan_abo`), und nach dem Wiedereinschalten muss jeder
   * seinen Link neu einrichten. Wer das erst merkt, wenn der Kalender am
   * Telefon leer bleibt, wurde nicht gefragt. Was hier steht, sagt die
   * Rückfrage vor dem Abschalten.
   */
  folgen?: string[];
  /** Unterfähigkeiten, die einzeln schaltbar sind (N02). */
  unter?: Faehigkeit[];
}

/**
 * Der Kern steht bewusst NICHT in dieser Liste.
 *
 * Startseite, Zeiterfassung, Kunden, Baustellen, Benutzer und Einstellungen
 * sind nicht abschaltbar. Eine Handwerker-App ohne Zeiterfassung ist keine
 * App mehr, und ohne Baustellen hätten die übrigen Module nichts, worauf sie
 * sich beziehen. Ein Schalter, mit dem man die Anlage unbenutzbar macht, ist
 * kein Freiheitsgrad, sondern eine Falle.
 */
export const MODULE: Modul[] = [
  {
    id: 'einsatzplanung',
    name: 'Einsatzplanung',
    zweck: 'Wer ist an welchem Tag auf welcher Baustelle.',
    standard: true,
    betrifft: ['Einsatzplanung', 'Wochenplan', 'Mein Einsatzplan'],
    folgen: [
      'Die Kalender-Abos des ganzen Einsatzplans enden. Nach dem Wiedereinschalten richtet sie jeder neu ein.',
    ],
  },
  {
    id: 'material',
    name: 'Material und Lager',
    zweck: 'Anforderungen vom Monteur, Bearbeitung im Büro, Lagerstand.',
    standard: true,
    betrifft: ['Material anfordern', 'Anforderungen', 'Lager'],
    /*
      DIE KATALOGE MEHRERER GROSSHÄNDLER (M03a). Abschalten nimmt die
      Ansichten weg, NICHT DIE ZUORDNUNG: die Übernahme eines Katalogs legt
      jeden Artikel an seinen Lieferantenartikel und überschreibt keinen
      Artikel eines anderen Großhändlers, ob die Ansicht da ist oder nicht.
      Das ist Datenrichtigkeit, kein Zusatz — ein abgeschalteter Schalter
      dürfte sonst den Stamm wieder vom letzten Katalog überschreiben lassen.
      Ebenso bestimmt der Einkaufspreis des Stammartikels sich immer nach der
      Regel „günstigster vergleichbarer, sonst jüngster“: Kalkulation und
      Nachkalkulation dürfen nicht von einer Ansicht abhängen.
    */
    unter: [
      {
        id: 'material.katalogversionen',
        name: 'Kataloge mehrerer Großhändler',
        zweck: 'Offene Lieferantenartikel zuordnen oder als neuen Artikel anlegen.',
        standard: true,
        betrifft: ['Offene Lieferantenartikel', 'Zuordnen im Artikelblatt', 'Hinweis nach der Übernahme'],
      },
      {
        id: 'material.lieferantenvergleich',
        name: 'Preisvergleich der Lieferanten',
        zweck: 'Preise eines Artikels je Großhändler nebeneinander, mit dem günstigsten.',
        standard: true,
        betrifft: ['Lieferanten im Artikelblatt', 'Grund des Großhändler-Vorschlags'],
      },
      {
        id: 'material.katalogpreisverlauf',
        name: 'Preisverlauf und Preissprünge',
        zweck: 'Verlauf der Einkaufspreise je Großhändler, Preissprünge im Übernahmebericht.',
        standard: true,
        betrifft: ['Preisverlauf im Artikelblatt', 'Preissprünge im Übernahmebericht'],
      },
    ],
  },
  {
    id: 'urlaub',
    name: 'Urlaub',
    zweck: 'Antrag, Genehmigung, Eintrag ins Zeitkonto.',
    standard: true,
    betrifft: ['Urlaub'],
  },
  {
    id: 'scheine',
    name: 'Handwerksscheine',
    zweck: 'Leistung vor Ort bestätigen lassen, unterschreiben, einfrieren.',
    standard: true,
    betrifft: ['Handwerksscheine'],
  },
  {
    id: 'angebote',
    name: 'Angebote',
    zweck: 'Kalkulieren und beim Annehmen die Baustelle mit Stundenbudget anlegen.',
    standard: true,
    betrifft: ['Angebote'],
  },
  {
    id: 'rechnungen',
    name: 'Rechnungen',
    zweck: 'Aus der Baustelle verrechnen, Nummernkreis, Buchhaltungs-Export.',
    standard: true,
    betrifft: ['Rechnungen'],
  },
  {
    id: 'nachkalkulation',
    name: 'Nachkalkulation',
    zweck: 'Erlös gegen Personal- und Materialkosten — hat die Baustelle Geld verdient?',
    standard: true,
    abhaengigVon: ['rechnungen'],
    betrifft: ['Nachkalkulation'],
  },
  {
    id: 'wartung',
    name: 'Wiederkehrende Wartungen',
    zweck: 'Wartungsvereinbarungen führen und sehen, was fällig wird.',
    /*
      EINGESCHALTET, obwohl neu.

      Die jährliche Thermenwartung ist bei einem Installateur kein Zusatz,
      sondern der planbare Teil des Jahres. Ein Bereich, den man erst finden
      muss, um ihn einzuschalten, wird nicht gefunden — und ein Betrieb, der
      keine Wartungen führt, sieht eine leere Liste und schaltet sie in zwei
      Klicks ab. Das ist die billigere der beiden Fehlannahmen.
    */
    standard: true,
    betrifft: ['Wartungen'],
  },
  {
    id: 'zeitkonten',
    name: 'Zeitkonten und Auswertung',
    zweck: 'Salden aller Mitarbeiter, Monatsexport, Stundennachweis.',
    standard: true,
    betrifft: ['Mitarbeiterübersicht'],
  },
];

const NACH_ID = new Map(MODULE.map((m) => [m.id, m]));

/*
  HIER STAND EIN DRITTER ZUSTAND: „technisch nicht eingerichtet".

  Er hatte genau einen Nutzer, die KI-Spracherfassung — sie brauchte
  hinterlegte Zugänge zu zwei fremden Diensten, und ohne sie führte der
  Schalter nur in eine Fehlermeldung. Mit ihr ist er am 19.09. gefallen.

  ERSATZLOS UND NICHT VORSORGLICH STEHENGELASSEN. Ein Mechanismus, den kein
  Modul mehr benutzt, lässt sich nicht prüfen; die Oberfläche dazu („nicht
  eingerichtet", der gesperrte Schalter, der erklärende Satz) wäre eine
  Zusage, für die niemand mehr geradesteht. Braucht ein künftiges Modul eine
  Voraussetzung, sind es fünf Zeilen — und dann wieder mit einer Prüfung.
*/

/**
 * Welche Module gelten tatsächlich?
 *
 * Drei Stufen, in dieser Reihenfolge:
 *
 *   1. der Standard des Moduls
 *   2. die Festlegung des Betriebs (nur die Abweichungen sind gespeichert)
 *   3. die Wirklichkeit: fehlt eine Abhängigkeit, ist es aus — egal was
 *      jemand eingestellt hat
 *
 * Stufe 3 ist der Grund, warum es diese Funktion gibt und nicht nur ein
 * Nachschlagen im Firmendokument. Wer die Rechnungen abschaltet und die
 * Nachkalkulation angeschaltet lässt, bekäme sonst eine Ansicht, die für jede
 * Baustelle „keine Aussage" meldet — technisch fehlerfrei und trotzdem
 * kaputt.
 */
export function aktiveModule(
  festlegung: Record<string, boolean> | undefined,
  register: Modul[] = MODULE,
): Set<ModulId> {
  const an = new Set<ModulId>();
  for (const id of aktiveSchalter(festlegung, register)) {
    if (!id.includes('.')) an.add(id as ModulId);
  }
  return an;
}

/**
 * Was ist an — Module UND Unterfähigkeiten?
 *
 * Dieselben drei Stufen wie bei den Modulen; eine Unterfähigkeit hängt
 * zusätzlich immer an ihrem Modul. Wer die Material-Verwaltung abschaltet,
 * schaltet damit auch jeden ihrer Teile ab, ohne jeden einzeln anzufassen —
 * und bekommt beim Wiedereinschalten dieselben Teile zurück, weil die
 * Festlegung der Teile nicht angerührt wird.
 */
export function aktiveSchalter(
  festlegung: Record<string, boolean> | undefined,
  register: Modul[] = MODULE,
): Set<SchalterId> {
  const knoten: { id: SchalterId; braucht: SchalterId[] }[] = [];
  const an = new Set<SchalterId>();
  for (const m of register) {
    knoten.push({ id: m.id, braucht: m.abhaengigVon ?? [] });
    if (festlegung?.[m.id] ?? m.standard) an.add(m.id);
    for (const f of m.unter ?? []) {
      knoten.push({ id: f.id, braucht: [m.id, ...(f.abhaengigVon ?? [])] });
      if (festlegung?.[f.id] ?? f.standard) an.add(f.id);
    }
  }

  /**
   * Abhängigkeiten so lange nachziehen, bis sich nichts mehr ändert.
   *
   * Eine einzelne Runde genügte für die heutige Kette (Nachkalkulation ->
   * Rechnungen), aber nicht für eine, die später zwei Stufen tief wird — und
   * mit den Unterfähigkeiten wird sie das (Teil -> Modul -> Modul). Die
   * Schleife kostet nichts und hält, wenn jemand etwas ergänzt.
   */
  let geaendert = true;
  while (geaendert) {
    geaendert = false;
    for (const k of knoten) {
      if (!an.has(k.id)) continue;
      if (k.braucht.some((d) => !an.has(d))) {
        an.delete(k.id);
        geaendert = true;
      }
    }
  }
  return an;
}

/** Ist dieses Modul oder diese Unterfähigkeit an? */
export function istAn(
  festlegung: Record<string, boolean> | undefined,
  id: SchalterId,
  register: Modul[] = MODULE,
): boolean {
  return aktiveSchalter(festlegung, register).has(id);
}

/**
 * Was ginge mit, wenn man dies abschaltet?
 *
 * Für die Rückfrage im Panel. Jemandem die Rechnungen abschalten zu lassen
 * und ihm erst hinterher zu zeigen, dass die Nachkalkulation mit verschwunden
 * ist, wäre eine Überraschung — und Überraschungen sind bei Einstellungen das
 * Gegenteil von Kontrolle.
 *
 * Genannt werden die MODULE, die mitgehen. Die Unterfähigkeiten des eigenen
 * Moduls gehen selbstverständlich mit und stünden nur als Aufzählung da; die
 * Unterfähigkeiten FREMDER Module, die an diesem hängen, werden genannt.
 */
export function zieheMit(
  id: SchalterId,
  festlegung: Record<string, boolean> | undefined,
  register: Modul[] = MODULE,
): SchalterId[] {
  const vorher = aktiveSchalter(festlegung, register);
  if (!vorher.has(id)) return [];
  const nachher = aktiveSchalter({ ...(festlegung ?? {}), [id]: false }, register);
  return [...vorher].filter(
    (m) => m !== id && !nachher.has(m) && !m.startsWith(`${id}.`),
  );
}

/**
 * Was geschieht beim Abschalten über das Verschwinden hinaus — für dies und
 * alles, was mitgeht?
 *
 * Wer die Rechnungen abschaltet und damit die Nachkalkulation verliert, muss
 * auch deren Folgen erfahren, nicht nur die der Rechnungen.
 */
export function folgenBeimAbschalten(
  id: SchalterId,
  festlegung: Record<string, boolean> | undefined,
  register: Modul[] = MODULE,
): string[] {
  const betroffen = [id, ...zieheMit(id, festlegung, register)];
  const vorher = aktiveSchalter(festlegung, register);
  // Die eigenen Unterfähigkeiten gehen mit, auch wenn zieheMit sie nicht nennt.
  for (const s of vorher) if (s.startsWith(`${id}.`)) betroffen.push(s);
  const folgen: string[] = [];
  for (const s of betroffen) {
    for (const f of schalter(s, register)?.folgen ?? []) if (!folgen.includes(f)) folgen.push(f);
  }
  return folgen;
}

/** Ein Modul nachschlagen. */
export function modul(id: ModulId, register: Modul[] = MODULE): Modul | undefined {
  return register === MODULE ? NACH_ID.get(id) : register.find((m) => m.id === id);
}

/** Ein Modul oder eine Unterfähigkeit nachschlagen. */
export function schalter(
  id: SchalterId,
  register: Modul[] = MODULE,
): Modul | Faehigkeit | undefined {
  for (const m of register) {
    if (m.id === id) return m;
    const f = m.unter?.find((u) => u.id === id);
    if (f) return f;
  }
  return undefined;
}
