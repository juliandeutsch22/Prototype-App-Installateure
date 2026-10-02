/**
 * Der globale Administrator — ein Konto, das Betriebe ANLEGEN kann und in
 * keinen HINEINSIEHT.
 *
 * WOZU. Bisher entsteht ein neuer Betrieb über ein Skript, das jemand mit
 * einem Dienstkonto von Hand ausführt (`scripts/bootstrap-tenant.mjs`). Das
 * ist genau der Zustand, in dem ein Fehlgriff nicht auffällt: das Dienstkonto
 * kann alles, es bleibt kein Protokoll, und wer es hat, kommt auch an jeden
 * Kundenstamm.
 *
 * DIE ENTSCHEIDENDE EINSCHRÄNKUNG. Der globale Administrator bekommt einen
 * eigenen Claim (`plattformAdmin`) und mit ihm NICHT ein einziges Leserecht.
 * Die firestore.rules prüfen durchweg `resource.data.companyId ==
 * request.auth.token.companyId`; ein Token ohne `companyId` erfüllt das
 * nirgends. Das ist keine Nachlässigkeit, auf die man sich verlässt, sondern
 * die tragende Eigenschaft dieses Kontos — und sie ist in
 * `tests/rules/plattform.rules.test.ts` einzeln geprüft.
 *
 * Anders gesagt: dieses Konto kann einen Betrieb ins Leben rufen und danach
 * nie wieder etwas über ihn erfahren. Wer mehr braucht, braucht ein Konto IN
 * dem Betrieb — und das legt dessen Administration an, nicht die Plattform.
 *
 * WARUM NICHT EINFACH EINE ROLLE MEHR. Weil eine Rolle im
 * `users`-Dokument eines Betriebs steht und damit an einen Betrieb gebunden
 * wäre. Der globale Administrator gehört zu keinem — er hat kein
 * `users`-Dokument, keine `companyId`, und die App zeigt ihm folglich auch
 * keinen einzigen Reiter.
 */

import { benutzernameFehler, kunstadresse } from './benutzername';

/** Wo die globalen Administratoren stehen. Kein Client kommt an diese Sammlung. */
export const PLATTFORM_ADMINS = 'platformAdmins';

/** Wo festgehalten wird, wer wann welchen Betrieb angelegt hat. */
export const BETRIEBSANLAGEN = 'betriebsanlagen';

/** Was beim Anlegen eines Betriebs angegeben werden muss. */
export interface NeuerBetrieb {
  /** Anzeigename des Betriebs, z. B. „Perl Installationen". */
  name: string;
  /** Kennung des Mandanten — sie steht später in jedem Dokument. */
  companyId: string;
  /** E-Mail des ersten Administrators dieses Betriebs. */
  adminEmail: string;
  /** Name des ersten Administrators. */
  adminName: string;
  /**
   * Womit sich der erste Administrator anmeldet (Testbericht 30.09.2026, P1).
   * Fehlt die Angabe, ist es die E-Mail — wie bisher.
   */
  anmeldung?: 'email' | 'benutzername';
  /** Sein Benutzername, wenn er sich damit anmeldet. */
  adminBenutzername?: string;
  /**
   * Ein Test- oder Vorführbetrieb (Nachtest 01.10.2026, Paket D): er lässt
   * sich später ohne Export und ohne Frist löschen.
   */
  testbetrieb?: boolean;
}

/**
 * Was der Anlagevorgang festhält.
 *
 * BEWUSST OHNE GESCHÄFTSDATEN. Hier steht, dass ein Betrieb entstanden ist
 * und wer ihn angelegt hat — nicht, was in ihm passiert. Ein Protokoll, das
 * mitwüchse, wäre am Ende doch wieder ein Fenster in fremde Betriebe.
 */
export interface Betriebsanlage {
  companyId: string;
  name: string;
  /** Wer angelegt hat — die Auth-Kennung des globalen Administrators. */
  angelegtVon: string;
  angelegtAm: number;
  /** Die Kennung des ersten Administrators, damit man ihn wiederfindet. */
  ersterAdminUid: string;
}

/**
 * Wie eine Mandantenkennung aussehen darf.
 *
 * Sie wird zur Dokument-Id von `companies/{companyId}` und steht als Feld in
 * jedem einzelnen Datensatz. Ein Schrägstrich zerlegte den Pfad, ein
 * Leerzeichen macht jede spätere Abfrage von Hand zur Fehlerquelle, und
 * Grossbuchstaben lassen zwei Kennungen gleich aussehen, die es nicht sind.
 */
const KENNUNG = /^[a-z][a-z0-9-]{1,29}$/;

/**
 * Eine sehr einfache Prüfung auf eine E-Mail.
 *
 * ABSICHTLICH GROB. Sie soll den Vertipper abfangen („perl.at" ohne @), nicht
 * die Zustellbarkeit beweisen — das kann ohnehin nur ein Zustellversuch. Eine
 * strengere Regel würde gültige Adressen zurückweisen, und dann steht jemand
 * mit einer richtigen Adresse vor einem Formular, das ihn für falsch hält.
 */
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Was an der Eingabe nicht stimmt — oder `null`.
 *
 * Dieselbe Prüfung läuft im Browser und in der Function. Der Browser, damit
 * niemand ins Leere tippt; die Function, weil sie die einzige ist, die zählt.
 */
export function betriebFehler(b: Partial<NeuerBetrieb>): string | null {
  if (!b.name?.trim()) return 'Der Betrieb braucht einen Namen.';
  /*
    GEPRÜFT WIRD DIE FORM, DIE GESPEICHERT WÜRDE — nicht die getippte. Wer
    „Perl" eintippt, meint dieselbe Kennung wie „perl", und ihn dafür
    abzuweisen wäre eine Regel, die sich niemandem erschliesst. Gespeichert
    wird ohnehin nur die kleingeschriebene Form (`betriebNormalisiert`), es
    kann also gar nicht zwei geben, die gleich aussehen.
  */
  const kennung = (b.companyId ?? '').trim().toLowerCase();
  if (!KENNUNG.test(kennung)) {
    return 'Die Kennung besteht aus Kleinbuchstaben, Ziffern und Bindestrichen, beginnt mit einem Buchstaben und ist 2 bis 30 Zeichen lang.';
  }
  if (b.anmeldung === 'benutzername') {
    const f = benutzernameFehler(b.adminBenutzername ?? '');
    if (f) return f;
  } else if (!MAIL.test((b.adminEmail ?? '').trim())) {
    return 'Die E-Mail des ersten Administrators fehlt oder ist unvollständig.';
  }
  if (!b.adminName?.trim()) return 'Der erste Administrator braucht einen Namen.';
  return null;
}

/**
 * Eine Kennung aus dem Namen vorschlagen (Testbericht 30.09.2026, G21):
 * „Perl Installationen GmbH“ → „perl-installationen“. Umlaute werden
 * ausgeschrieben, alles andere wird zum Bindestrich; sie beginnt mit einem
 * Buchstaben und hat höchstens 30 Zeichen. Ein Vorschlag, keine Vorschrift:
 * wer die Kennung selbst tippt, behält seine.
 *
 * SEIT DEM NACHTEST 01.10.2026 (N4) ohne Rechtsform und an einer Wortgrenze
 * gekürzt. Aus „Installateur Müller & Söhne GmbH“ wurde
 * „installateur-mueller-soehne-gm“ — abgeschnitten mitten in der Rechtsform,
 * in einer Kennung, die sich nie mehr ändern lässt und in jedem Datensatz
 * steht. Die Rechtsform fällt am Ende weg (auch „GmbH & Co KG“), weil sie
 * sich ändern kann, der Betrieb aber derselbe bleibt.
 */
const RECHTSFORMEN: string[][] = [
  ['gmbh'], ['gesmbh'], ['ges', 'm', 'b', 'h'], ['mbh'], ['kg'], ['og'], ['ag'], ['se'],
  ['e', 'u'], ['eu'], ['gesbr'], ['ges', 'b', 'r'], ['gesnbr'], ['ges', 'n', 'b', 'r'],
  ['keg'], ['oeg'], ['co'], ['cokg'], ['ohg'], ['ug'], ['eg'], ['e', 'gen'],
];
const HOECHSTENS = 30;

export function kennungVorschlag(name: string): string {
  const woerter = name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  // Vorn steht ein Buchstabe: führende Ziffern fallen weg („3 Brüder“ → „brueder“).
  while (woerter.length && !/^[a-z]/.test(woerter[0])) {
    woerter[0] = woerter[0].replace(/^[^a-z]+/, '');
    if (!woerter[0]) woerter.shift();
  }
  // Rechtsformen am Ende ablegen, solange davor noch ein Wort steht.
  for (let weiter = true; weiter;) {
    weiter = false;
    for (const form of RECHTSFORMEN) {
      if (woerter.length > form.length && form.every((w, i) => woerter[woerter.length - form.length + i] === w)) {
        woerter.splice(woerter.length - form.length);
        weiter = true;
        break;
      }
    }
  }
  // An einer Wortgrenze kürzen; nur ein einzelnes überlanges Wort wird geschnitten.
  let kennung = '';
  for (const w of woerter) {
    const mit = kennung ? `${kennung}-${w}` : w;
    if (mit.length > HOECHSTENS) {
      if (!kennung) kennung = w.slice(0, HOECHSTENS);
      break;
    }
    kennung = mit;
  }
  return kennung;
}

/** Die Eingabe in die Form bringen, in der sie gespeichert wird. */
export function betriebNormalisiert(b: NeuerBetrieb): NeuerBetrieb {
  /*
    MIT BENUTZERNAMEN ist die Adresse die Kunstadresse (siehe
    `benutzername.ts`) — gebildet hier, damit Browser und Function dieselbe
    meinen.
  */
  if (b.anmeldung === 'benutzername') {
    const benutzername = (b.adminBenutzername ?? '').trim().toLowerCase();
    return {
      name: b.name.trim(),
      companyId: b.companyId.trim().toLowerCase(),
      adminEmail: kunstadresse(benutzername),
      adminName: b.adminName.trim(),
      anmeldung: 'benutzername',
      adminBenutzername: benutzername,
      testbetrieb: b.testbetrieb === true,
    };
  }
  return {
    name: b.name.trim(),
    companyId: b.companyId.trim().toLowerCase(),
    // Kleinbuchstaben: Firebase Auth behandelt Adressen ohnehin so, und zwei
    // Schreibweisen derselben Adresse ergäben sonst zwei Konten.
    adminEmail: (b.adminEmail ?? '').trim().toLowerCase(),
    adminName: b.adminName.trim(),
    testbetrieb: b.testbetrieb === true,
  };
}

/**
 * Die Warnung, wenn der erste Administrator keine E-Mail hat (P1): ohne sie
 * gibt es kein „Passwort vergessen“, und hat der Betrieb sonst niemanden,
 * der Passwörter vergibt, hilft nur der Support.
 */
export const WARNUNG_OHNE_MAIL =
  'Ohne E-Mail kann sich dieser Betrieb bei vergessenem Passwort nur über den Senklot-Support '
  + 'wiederherstellen lassen. Empfohlen: einen zweiten Administrator oder eine Geschäftsführung anlegen.';

/**
 * Wohin ein Rücksetz- oder Einladungslink nach dem Bestätigen führt.
 *
 * OHNE DIESE ANGABE nimmt der Anmeldedienst seine „Site URL" — und die stand
 * im Pilotbetrieb noch auf dem Entwicklungswert: der erste Administrator
 * eines neuen Betriebs landete auf `localhost` und kam nie in sein Konto
 * (Testbericht 30.09.2026, K1). Die Einstellung im Projekt ist inzwischen
 * richtig; dass ein Link funktioniert, soll aber nicht an einer Einstellung
 * hängen, die niemand sieht.
 *
 * ZUERST DIE AUSDRÜCKLICH GESETZTE ADRESSE, dann die Herkunft der Anfrage:
 * die App ruft von ihrer eigenen Adresse aus, und genau dorthin soll der
 * Link zurück. Gilt keine von beiden, bleibt es beim Dienst — `null`.
 * Der Dienst nimmt ohnehin nur Adressen an, die in seiner Erlaubnisliste
 * stehen; eine fremde Herkunft führt deshalb nirgendwohin.
 */
export function ruecksprungAdresse(
  festgelegt?: string | null,
  herkunft?: string | null,
): string | null {
  for (const kandidat of [festgelegt, herkunft]) {
    const text = (kandidat ?? '').trim();
    if (!text) continue;
    try {
      const adresse = new URL(text);
      if (adresse.protocol === 'https:' || adresse.protocol === 'http:') return `${adresse.origin}/`;
    } catch {
      // Keine Adresse — die nächste Quelle versuchen.
    }
  }
  return null;
}
