
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
 *
 * NEUE FACHBEFEHLE PRÜFEN DAS MODUL AUF DEM SERVER (E51, V3). Was der
 * SHK-Ausbau an neuen Befehlen bringt, fragt `app.modul_aktiv` — als erster
 * der Annahme-Link (`angebote.online_annahme`, M02a): abgeschaltet entsteht
 * kein neuer Link, und ein vorhandener antwortet wie ein unbekannter. Für
 * diese Befehle IST das Modul eine Grenze. Die bestehenden Schreibwege
 * bleiben, wie sie sind (oben). Die Regel ist dieselbe wie `aktiveSchalter`;
 * die Standards stehen in SQL als Liste (`app.modul_register`), und
 * `tests/supabase/modulRegisterServer.test.ts` vergleicht sie mit `MODULE`
 * und `KERN`. Wer hier ein Modul, einen Kernbereich oder eine Unterfähigkeit
 * ändert, ändert die Liste mit.
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
export type FaehigkeitId = `${ModulId | KernId}.${string}`;

/**
 * Ein Kernbereich: immer an, nicht abschaltbar (E51, V1) — aber mit
 * Unterfähigkeiten, die es sind (M02b). Kunden und Baustellen sind der Bezug
 * für alles Übrige; ihre Zusatzfähigkeiten (Auftragseingang, später Aufgaben,
 * Mängel, Objekte …) braucht nicht jeder Betrieb.
 */
export type KernId = 'baustellen' | 'kunden';

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
  /**
   * Was beim Abschalten darüber hinaus geschieht (siehe `Modul.folgen`) —
   * oder was man vorher wissen muss, obwohl es zurückkommt (Bestände, die
   * unsichtbar werden, M04a).
   */
  folgen?: string[];
}

/** Alles, wonach gefragt werden kann: ein Modul, ein Kernbereich (immer an) oder eine Unterfähigkeit. */
export type SchalterId = ModulId | KernId | FaehigkeitId;

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

/** Ein Kernbereich mit seinen schaltbaren Teilen (siehe `KernId`). */
export interface Kernbereich {
  id: KernId;
  name: string;
  /** Ein Satz: was der Betrieb damit tut. */
  zweck: string;
  /** Was in der Navigation dazu gehört — wie bei den Modulen. */
  betrifft: string[];
  /** Unterfähigkeiten, die einzeln schaltbar sind (N02). */
  unter: Faehigkeit[];
}

/**
 * Der Kern steht bewusst NICHT in dieser Liste — Kunden und Baustellen stehen
 * mit ihren schaltbaren Teilen in `KERN`, ohne eigenen Schalter.
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
      {
        /*
          LAGERORTE UND FAHRZEUGLAGER (M04a, E10). „Behalten“, Standard an:
          ein Betrieb ohne weitere Orte sieht nur das Hauptlager und keine
          Wahl, solange er keinen Ort und kein Fahrzeug anlegt.

          AUS heißt: nur das Hauptlager. Weitere Orte verschwinden aus den
          Ansichten, ihre Bestände bleiben — Ware im Fahrzeug ist dann nicht
          mehr zu sehen, aber nicht weg. Das steht vorher in der Rückfrage
          (`folgen`), obwohl es mit dem Wiedereinschalten zurückkommt: wer
          abschaltet, während Ware in den Bussen liegt, muss das wissen.

          Die Fahrzeuge selbst sind Kern der Betriebsmittel (W06/W07); ihre
          Liste unter Einstellungen steht, solange diese Fähigkeit oder ein
          Betriebsmittel-Modul an ist (`nurMitModul` der Unterseite).
        */
        id: 'material.lagerorte_fahrzeuglager',
        name: 'Lagerorte und Fahrzeuglager',
        zweck: 'Bestand je Ort: weitere Lager und je Fahrzeug ein Fahrzeuglager, Umlagern, „Mein Fahrzeug“ für den Monteur.',
        standard: true,
        betrifft: [
          'Lagerorte und Umlagern im Lager',
          'Fahrzeuge (Einstellungen)',
          'Mein Fahrzeug',
          'Wahl des Ortes bei Wareneingang, Inventur, Abhaken, Retoure und Abholen',
        ],
        folgen: [
          'Ware an weiteren Lagerorten und in Fahrzeugen ist dann nicht mehr zu sehen, aber nicht weg: ihre Bestände bleiben und stehen nach dem Wiedereinschalten wieder da. Gebucht wird nur noch im Hauptlager.',
        ],
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
    unter: [
      {
        id: 'angebote.online_annahme',
        name: 'Annahme per Link',
        zweck: 'Der Kunde nimmt ein Angebot über einen Link an — mit Name und Unterschrift, ohne Konto.',
        standard: true,
        betrifft: ['„Annahme-Link“ im Angebot'],
        /*
          GEPRÜFT AM SERVER (V3): `angebot_link_abruf` und die Annahme fragen
          `app.modul_aktiv`; gelöscht oder widerrufen wird beim Abschalten
          nichts. Die Gültigkeit läuft weiter — ein Link, der in der Zeit
          abläuft, bleibt abgelaufen.
        */
        folgen: [
          'Offene Annahme-Links funktionieren nicht mehr: Der Kunde sieht dieselbe Meldung wie bei einem ungültigen Link. Nach dem Wiedereinschalten gelten sie wieder bis zu ihrem Ablaufdatum.',
        ],
      },
    ],
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

/**
 * DIE KERNBEREICHE MIT IHREN SCHALTBAREN TEILEN (M02b). Sie zählen nicht zu
 * den Modulen („Eingeschaltet: N von 9“ bleibt), haben keinen Schalter und
 * stehen auf der Seite „Module“ als „immer an“; ihre Unterfähigkeiten
 * schaltet der Betrieb wie die eines Moduls. Eine Festlegung zu einem
 * Kernbereich selbst wird nicht gelesen — auch nicht auf dem Server
 * (`app.modul_kern`).
 */
export const KERN: Kernbereich[] = [
  {
    id: 'baustellen',
    name: 'Baustellen',
    zweck: 'Der Bezug für Planung, Zeiten, Scheine, Wartungen und Rechnungen.',
    betrifft: ['Baustellen'],
    unter: [
      {
        /*
          AUFTRAGSEINGANG (A03, A11): „Behalten“, Standard an. Aus heißt: der
          Eintrag in der Navigation, der Hinweis auf der Startseite und die
          Verweise „Aus Eingang …“ verschwinden; Erfassen und Umwandeln
          lehnt der Server ab (V3, `app.modul_aktiv`). Vorhandene Eingänge
          bleiben unangetastet und sind nach dem Wiedereinschalten wieder da
          — keine Folge, die sich nicht zurückholen ließe.
        */
        id: 'baustellen.auftragseingang',
        name: 'Auftragseingang',
        zweck: 'Anfragen und Aufträge mit Quelle, Nummer des Auftraggebers und Dringlichkeit erfassen und zur Baustelle oder zum Angebot machen.',
        standard: true,
        betrifft: ['Auftragseingang', 'Offene Eingänge auf der Startseite', '„Aus Eingang …“ in Baustelle, Angebot und Kunde'],
      },
    ],
  },
  {
    id: 'kunden',
    name: 'Kunden',
    zweck: 'Der Kundenstamm mit Anschrift, Ansprechpartner und Belegen.',
    betrifft: ['Kunden'],
    unter: [
      {
        /*
          LIEGENSCHAFTEN, TOPS, BETEILIGTE (M02c, A09): „Optional“ — und
          „Optional“ steht ab Werk AUS (E51): was nicht jeder Betrieb
          braucht, soll keinen Betrieb überladen. Ein Installateur, der für
          Hausverwaltungen arbeitet, schaltet es ein.

          Aus heißt: Navigation, Felder und Abschnitte verschwinden; die
          Daten bleiben, auch die Zuordnung einer Baustelle. Anlegen, Ändern
          und jede neue Zuordnung lehnt der Server ab (V3, `app.modul_aktiv`);
          einen Beteiligten entfernen und einen Kunden löschen geht immer.
          Nichts, was sich nicht zurückholen ließe — keine Rückfrage.
        */
        id: 'kunden.liegenschaften',
        name: 'Liegenschaften und Tops',
        zweck: 'Häuser und Anlagen mit Wohnungen bzw. Einheiten und ihren Beteiligten (Eigentümer, Hausverwaltung, Mieter …) — Baustellen, Wartungen und Eingänge je Haus und Top.',
        standard: false,
        betrifft: [
          'Liegenschaften',
          'Liegenschaft und Top an Baustelle, Wartung und Eingang',
          '„Liegenschaften“ in der Kundenakte',
        ],
      },
    ],
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
  const alle = aktiveSchalter(festlegung, register);
  // Nur die Module des Registers: Kernbereiche und Unterfähigkeiten stehen nicht in der Navigation.
  const an = new Set<ModulId>();
  for (const m of register) if (alle.has(m.id)) an.add(m.id);
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
  kern: Kernbereich[] = KERN,
): Set<SchalterId> {
  const knoten: { id: SchalterId; braucht: SchalterId[] }[] = [];
  const an = new Set<SchalterId>();
  // Der Kern ist immer an — eine Festlegung zu ihm wird nicht gelesen. Seine Teile folgen ihr.
  for (const k of kern) {
    an.add(k.id);
    for (const f of k.unter) {
      knoten.push({ id: f.id, braucht: [k.id, ...(f.abhaengigVon ?? [])] });
      if (festlegung?.[f.id] ?? f.standard) an.add(f.id);
    }
  }
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
  // Ein Kernbereich lässt sich nicht abschalten — es geht nichts mit.
  if (!vorher.has(id) || istKern(id)) return [];
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
    const eintrag = schalter(s, register);
    const eigene = eintrag && 'folgen' in eintrag ? eintrag.folgen : undefined;
    for (const f of eigene ?? []) if (!folgen.includes(f)) folgen.push(f);
  }
  return folgen;
}

/** Ein Modul nachschlagen. */
export function modul(id: ModulId, register: Modul[] = MODULE): Modul | undefined {
  return register === MODULE ? NACH_ID.get(id) : register.find((m) => m.id === id);
}

/** Ein Modul, einen Kernbereich oder eine Unterfähigkeit nachschlagen. */
export function schalter(
  id: SchalterId,
  register: Modul[] = MODULE,
  kern: Kernbereich[] = KERN,
): Modul | Kernbereich | Faehigkeit | undefined {
  for (const m of [...register, ...kern]) {
    if (m.id === id) return m;
    const f = m.unter?.find((u) => u.id === id);
    if (f) return f;
  }
  return undefined;
}

/** Ist das ein Kernbereich — immer an, ohne eigenen Schalter? */
export function istKern(id: SchalterId, kern: Kernbereich[] = KERN): boolean {
  return kern.some((k) => k.id === id);
}
