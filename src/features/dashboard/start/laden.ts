import { istAn } from '@/lib/module';
import { cent } from '@/lib/betrag';
import { ibanFehler } from '@shared/iban';
import { firmenbuchFehlt } from '@/lib/firmenbuch';
import type {
  AppUser,
  Company,
  Betriebsurlaub,
  EinkaufPosten,
  EinsatzMaterial,
  Freistellung,
  MaterialOrder,
  Project,
  RuestPosition,
  Role,
  Termin,
  Vacation,
} from '@/types';
import { getUserByUid, listPasswortAnfragen, listUsers } from '@/lib/db/users';
import { listOwnEntriesSince, listOwnEntriesInRange, buchungstage, stundenDerBaustellen, unverrechneteStunden } from '@/lib/db/timeEntries';
import { getGeburtsdatum } from '@/lib/db/arbeitszeitGrenzen';
import { grenzArbeitszeit, grenzfaelle, istJugendlich, type Grenzfall } from '@/features/accounting/arbeitszeitGrenzen';
import {
  listUpcomingAssignments,
  listAssignmentsForDate,
  listAssignmentsForUserInRange,
  listEinsatztageInRange,
  baustellenOhneEinsatz,
} from '@/lib/db/assignments';
import { listEinsatzMaterialForDate } from '@/lib/db/einsatzMaterial';
import { listOpenOrders, listOwnOpenOrders } from '@/lib/db/materialOrders';
import { listLagerPosten } from '@/lib/db/einkauf';
import { materialdeckung } from '@/lib/db/materialdeckung';
import { deckungJeEinsatz } from '@/features/assignments/materialDeckung';
import { lagerListe, LOW_STOCK_THRESHOLD } from '@/lib/db/materials';
import { JE_ABSCHNITT } from './abschnitte';
import { listActiveProjects, listProjectsByNumbers } from '@/lib/db/projects';
import { listGarantienEndenIn, listInvoicesByIds, scheineUnverrechnetStand, type GarantieRechnung } from '@/lib/db/invoices';
import { listZahlungenImZeitraum } from '@/lib/db/zahlungen';
import { listOwnWorkSheetsSince, scheineNeu, zaehleVerworfeneScheine } from '@/lib/db/workSheets';
import { zaehleVerworfeneAngebote } from '@/lib/db/quotes';
import { listUeberLinkAngenommen, type UeberLinkAngenommen } from '@/lib/db/angebotLinks';
import { zaehleOffeneEingaenge } from '@/lib/db/auftragseingaenge';
import { meldungenOffen, ungeleseneZahl } from '@/lib/db/nachrichten';
import { fristStichtag } from '@/lib/papierkorb';
import { listAbwesendInRange, listOpenVacations, type Abwesenheit } from '@/lib/db/vacations';
import { listOffeneFreistellungen } from '@/lib/db/freistellungen';
import { zeitkorrekturenLaden, type Zeitkorrektur } from '@/lib/db/zeitkorrekturen';
import { listTermineImZeitraum } from '@/lib/db/termine';
import { wartungenFaelligStand, wartungErledigtVorschlaege, type WartungErledigtVorschlag, type WartungenStand } from '@/lib/db/wartungen';
import { buchungskonten } from '@/lib/db/konten';
import { listBasiszinssaetze } from '@/lib/db/basiszins';
import {
  arbeitszeitAm,
  localDateStr,
  todayStr,
  offeneWerktage,
  tagessollStunden,
  type SaldoResult,
} from '@/lib/time';
import { fuehrtZeitkonto, einplanbar } from '@/lib/permissions';
import { getAustrianHolidayName } from '@shared/feiertage';
import { baustellenTitel } from '@/lib/baustellenTitel';
import { besetzung, betriebZuFuer, ganztagsWeg } from '@/features/assignments/besetzung';
import { listBetriebsurlaubeImZeitraum } from '@/lib/db/abwesenheiten';
import { einsatzZeit } from '@/features/assignments/einsatzZeit';
import { montagDer, wocheAb } from '@/features/assignments/wochenplan';
import { offeneNachtraege, NACHTRAG_TAGE, type OffenerNachtrag } from '@/features/worksheets/zeitNachtrag';
import { auffaelligBis, unverrechneteStundenZeilen } from '@/features/worksheets/unverrechnet';
import type { ForderungsStand } from '@shared/forderungen';
import { startseiteForderungen } from '@/lib/db/forderungen';
import { basiszinsVerlauf, halbjahresbeginn } from '@/features/invoices/mahnung';
import { VORLAUF_TAGE } from '@/features/maintenance/wartungsplan';
import { eigenerResturlaub, eigenerSaldo } from './eigeneKonten';
import { budgetStand } from '@/features/projects/baustellenLage';
import { firmaSperrtRechnung } from '@/features/invoices/firmaSperre';
import {
  type BudgetZeile,
  type KnappStand,
  type MaterialFehltZeile,
  type TagesBaustelle,
  type FehlenZeile,
  type TeamLuecke,
  type UnverrechneteScheine,
  type OffeneStundenZeile,
  type ZahlungHeute,
  type LehrzeitEndeZeile,
  type PasswortBitte,
  type AndereEntscheiden,
  andereEntscheiden,
  lehrzeitEnden,
  einzigeLeitungOhneMail,
  passwortBitten,
  GARANTIE_NACHLAUF_TAGE,
  GARANTIE_VORLAUF_TAGE,
  tageVerschoben,
} from './regeln';

/**
 * WAS DIE STARTSEITE LÄDT — je Bereich ein Block (Nachtest 01.10.2026,
 * Paket B).
 *
 * Die Blöcke laufen getrennt: fällt die Buchhaltung aus, sieht der Monteur
 * trotzdem, wo er heute hin muss, und die Seite sagt, welcher Teil fehlt.
 * Jeder Block lädt nur, was die Rolle auch anzeigt; Zusatzangaben innerhalb
 * eines Blocks scheitern still (dann fehlt eine Zeile, nicht die Seite).
 */

/** Wie weit die Lücken-Prüfung zurückreicht: ein Monat plus ein paar Tage. */
export const LUECKEN_TAGE = 35;

/** Ein eigener Einsatz von heute — mit dem, was im Auto zählt. */
export interface EinsatzZeile {
  id: string;
  /** Der Tag des Einsatzes — mitgeführt, damit ein Haken über Mitternacht am richtigen Dokument landet. */
  date: string;
  projectNumber: string;
  /** Kennung der Baustelle — der Weg in ihren Thread braucht sie (B2). */
  projectId?: string;
  customerName: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  asHelper: boolean;
  comment?: string;
  zeit?: string | null;
  material?: RuestPosition[];
  geladen?: NonNullable<EinsatzMaterial['geladen']>;
}

export interface LetzteBuchung {
  startTime: string;
  endTime: string;
  breakDuration: number;
}

export interface Abwesend {
  uid: string;
  name: string;
  grund: string | null;
  bis: string;
  zeiten: string | null;
}

export interface StartDaten {
  // persönlich
  hatEintritt?: boolean;
  fehlendeTage?: string[];
  planNachTag?: Map<string, string>;
  nachtraege?: OffenerNachtrag[];
  eigeneOrders?: MaterialOrder[];
  heuteEigene?: EinsatzZeile[];
  /** Vorlage für „Wie zuletzt buchen“. */
  letzteBuchung?: LetzteBuchung | null;
  saldo?: SaldoResult | null;
  resturlaub?: { rest: number; anspruch: number } | null;
  /** Eigene Überschreitungen der Grenzen für Jugendliche, laufender und letzter Monat (Runde 3, M2). */
  eigeneGrenzfaelle?: Grenzfall[];
  // Lager
  orders?: MaterialOrder[];
  lagerPosten?: EinkaufPosten[];
  knapp?: KnappStand;
  // Buchhaltung
  /**
   * Die offenen Forderungen als Zahlen und die ersten je Abschnitt
   * (Durchsicht 15.11.2026, Budget B3) — ausgewertet von der Edge Function
   * `startseite-forderungen` mit den Regeln in `shared/forderungen.ts`.
   */
  forderungen?: ForderungsStand;
  /** Bankgarantien, die bald enden oder gerade geendet haben (seit 10.10.2026). */
  garantien?: (GarantieRechnung & { id: string })[];
  /** Zahl der unverrechneten Scheine über alle, davon über vier Wochen (L22: gezählt in der Datenbank). */
  unverrechnet?: UnverrechneteScheine;
  /** Regiebaustellen mit unverrechneten Stunden, älteste zuerst (seit 23.10.2026). */
  offeneStunden?: OffeneStundenZeile[];
  zahlungenHeute?: ZahlungHeute[];
  bezahltImMonat?: { summe: number; anzahl: number };
  // Team
  team?: TeamLuecke[];
  antraege?: Vacation[];
  /** Offener Sonderurlaub (Plan 10.3) — fürs Büro und die Spitze. */
  freistellungen?: Freistellung[];
  /**
   * Ob außer der Person noch jemand über Urlaub und Sonderurlaub entscheidet
   * (Vier Augen) — dann steht der eigene Antrag nicht unter „entscheiden“.
   * Fehlt die Angabe, ist es unbekannt.
   */
  entscheidenAndere?: AndereEntscheiden;
  /** Offene Korrekturanträge der Zeiterfassung (M06c) — fürs Büro, das sie prüft. */
  korrekturen?: Zeitkorrektur[];
  // Leitung
  projekte?: Project[];
  budget?: BudgetZeile[];
  ohneEinsatz?: { projectNumber: string; zuletzt?: string }[];
  /** Einsätze der nächsten sieben Tage, deren Material nicht gedeckt ist (M04b). */
  materialFehlt?: MaterialFehltZeile[];
  /** Fällige Wartungen je Abschnitt: Zahl und die ersten (`wartungen_faellig_stand`). */
  wartungen?: WartungenStand;
  /** Eingeplante Wartungen, die erledigt aussehen (A9) — nur für die Führung gefüllt. */
  wartungVorschlaege?: WartungErledigtVorschlag[];
  heuteBetrieb?: TagesBaustelle[];
  /**
   * Die Namen der Belegschaft — für die Vorschau eines Einsatzes aus „Die
   * Mannschaft heute“ (E98): dieselben Namen wie in der Planung, nicht die
   * beim Einteilen mitgeschriebenen.
   */
  belegschaftNamen?: { uid: string; name: string }[];
  /** Seit dem letzten Ansehen unterschriebene Scheine, neueste zuerst (V9). */
  neueScheine?: { id: string; customerName: string; erstelltVonName: string }[];
  /** Einsätze mit ganztags Fehlenden, heute (teilweise) und morgen (V1). */
  eingeteiltFehlen?: FehlenZeile[];
  abwesendHeute?: Abwesend[];
  auslastung?: number | null;
  hatVerwaltung?: boolean;
  // Einstellungen
  basiszinsFehltAb?: string | null;
  kontenFehlen?: boolean;
  firmaFehlt?: string[];
  /** Was an den Firmendaten jede neue Rechnung sperrt (`firmaSperrtRechnung`). */
  firmaSperrt?: string[];
  /** Seit wann der zurückgesetzte Firmenbuch-Haken auf Kenntnisnahme wartet (Runde 7, 6.1). */
  firmenbuchKorrigiertAm?: number | null;
  /** Was länger als die Frist im Papierkorb liegt (M01d) — nur mit Frist. */
  papierkorbUeberFrist?: { anzahl: number; tage: number } | null;
  // Angebote (M02a)
  /** Über den Annahme-Link angenommen, von der Führung noch nicht geöffnet — höchstens 7 Tage. */
  ueberLinkAngenommen?: UeberLinkAngenommen[];
  // Auftragseingang (M02b)
  /** Offene Eingänge, davon dringend und Notfall — gezählt auf dem Server. */
  offeneEingaenge?: OffeneEingaenge;
  // Nachrichten (M10/B09)
  /** Die eigenen ungelesenen Nachrichten. */
  ungeleseneNachrichten?: number;
  /** Offene Meldungen an die Geschäftsführung (D5) — nur für sie geladen. */
  meldungenOffen?: number;
  // Personen
  lehrzeitEnden?: LehrzeitEndeZeile[];
  einzigeLeitungOhneMail?: boolean;
  /** Bitten um ein neues Passwort aus der Anmeldemaske (V14) — nur für die Spitze geladen. */
  passwortBitten?: PasswortBitte[];
  // Termine (Plan 10.4)
  termineHeute?: Termin[];
}

export interface Kontext {
  user: Pick<AppUser, 'uid' | 'companyId' | 'role'> & { name?: string };
  company: Company | null | undefined;
  heute: string;
  /**
   * Die Belegschaft, einmal je Aufbau der Startseite geholt. Drei Blöcke der
   * Leitung (Mannschaft, Baustellen, Einstellungen) brauchten sie und holten
   * sie je selbst (Analyse 09.10.2026, Maßnahme 7). Ohne Angabe holt jeder
   * Block sie wie bisher.
   */
  belegschaft?: () => Promise<AppUser[]>;
}

const belegschaftVon = (k: Kontext) => (k.belegschaft ? k.belegschaft() : listUsers(k.user.companyId));

const tageZurueck = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const still = <T>(p: () => Promise<T>, ersatz: T): Promise<T> =>
  Promise.resolve().then(p).catch(() => ersatz);

// ──────────────────────────────────────────────────────────────── Termine ──

/**
 * Die eigenen Termine von heute — für jede Rolle, an der ein Termin hängt.
 * Nur als Teilnehmer: wer bloß auf der Baustelle eingeteilt ist, sieht die
 * Lieferung in „Mein Einsatzplan" (Plan 10.4). Gefiltert wird hier, weil die
 * Leitung von der Datenbank alle Termine des Betriebs bekommt.
 */
export async function termineHeute(k: Kontext): Promise<Partial<StartDaten>> {
  const alle = await listTermineImZeitraum(k.user.companyId, k.heute, k.heute);
  return { termineHeute: alle.filter((t) => t.teilnehmer.includes(k.user.uid)) };
}

// ─────────────────────────────────────────────────────────────── Angebote ──

/**
 * Über den Annahme-Link angenommen (M02a) — für die Führung, bis jemand das
 * Angebot geöffnet hat, höchstens sieben Tage (`angebot_links_neu_angenommen`).
 */
export async function annahmenUeberLink(): Promise<Partial<StartDaten>> {
  return { ueberLinkAngenommen: await listUeberLinkAngenommen() };
}

// ──────────────────────────────────────────────────────── Auftragseingang ──

export interface OffeneEingaenge {
  offen: number;
  dringend: number;
  notfall: number;
}

/**
 * Wie viele Eingänge offen sind (M02b) — für das Büro, das sie annimmt und
 * weitergibt. Gezählt, nicht geholt: die Zeile nennt Anzahl und
 * Dringlichkeit, die Liste die einzelnen.
 */
export async function eingaenge(k: Kontext): Promise<Partial<StartDaten>> {
  return { offeneEingaenge: await zaehleOffeneEingaenge(k.user.companyId) };
}

/**
 * NEU EINGEGANGENE SCHEINE (V9) — für Projektleitung und Verwaltung, die
 * keine Rechnungen schreiben und den unterschriebenen Schein sonst nur
 * zufällig fanden. Seit dem letzten Ansehen, ohne die eigenen.
 */
export async function neueScheine(): Promise<Partial<StartDaten>> {
  const liste = await scheineNeu();
  return { neueScheine: liste.map((s) => ({ id: s.id, customerName: s.customerName, erstelltVonName: s.erstelltVonName })) };
}

// ──────────────────────────────────────────────────────────── Nachrichten ──

/**
 * Die eigene Zahl ungelesener Nachrichten (M10/B09) — und für die
 * Geschäftsführung, wie viele Meldungen offen sind (D5). Nur Zahlen: was
 * darin steht, zeigt der Posteingang bzw. die Seite der Meldungen.
 */
export async function nachrichtenStart(k: Kontext, a: { meldungen: boolean }): Promise<Partial<StartDaten>> {
  const [ungelesen, offen] = await Promise.all([
    ungeleseneZahl(k.user.uid),
    a.meldungen ? meldungenOffen() : Promise.resolve(undefined),
  ]);
  return { ungeleseneNachrichten: ungelesen, ...(offen !== undefined ? { meldungenOffen: offen } : {}) };
}

// ──────────────────────────────────────────────────────────── persönlich ──

export async function persoenlich(
  k: Kontext,
  was: { material: boolean; scheine: boolean; kennzahlen: boolean; jugendschutz?: boolean },
): Promise<Partial<StartDaten>> {
  const { user, heute } = k;
  const out: Partial<StartDaten> = {};
  const fenster = tageZurueck(LUECKEN_TAGE);
  const ab = localDateStr(fenster);

  const [profil, eintraege, einsaetze] = await Promise.all([
    getUserByUid(user.companyId, user.uid),
    listOwnEntriesSince(user.companyId, user.uid, ab),
    listUpcomingAssignments(user.companyId, user.uid, heute, 20),
  ]);

  /*
    DIE TEILE DANACH LAUFEN GLEICHZEITIG (Analyse 09.10.2026, Maßnahme 7).
    Bis hierher hingen sie nacheinander — Plan, Abwesenheit, Baustellen,
    Scheine, Anforderungen, Saldo, Jugendschutz —, obwohl keiner auf den
    anderen wartet: jeder schreibt sein eigenes Feld. Was einer braucht
    (Profil, Buchungen, Einsätze), kommt aus dem Schritt darüber.
  */
  const teile: Promise<void>[] = [];

  /*
    FEHLENDE TAGE NUR MIT ZEITKONTO — gefragt wird die frische Zeile, nicht
    das gemerkte Profil (Prüflauf F17).
  */
  if (istAn(k.company?.modules, 'zeiterfassung') && profil && fuehrtZeitkonto(profil)) {
    out.hatEintritt = !!profil.appStartDate;
    out.fehlendeTage = offeneWerktage(profil, eintraege, fenster, new Date());
    const fehlend = out.fehlendeTage;
    if (fehlend.length > 0) {
      teile.push((async () => {
        const plan = await still(
          () => listAssignmentsForUserInRange(user.companyId, user.uid, fehlend[0], fehlend[fehlend.length - 1]),
          [],
        );
        out.planNachTag = new Map(plan.map((a) => [a.date, a.projectNumber]));
      })());
    }
  }

  // „Wie zuletzt“: der jüngste Anwesenheitseintrag mit Zeitspanne.
  const letzte = [...eintraege]
    .filter((e) => e.status === 'Anwesend' && e.startTime && e.endTime)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  out.letzteBuchung = istAn(k.company?.modules, 'zeiterfassung') && letzte
    ? { startTime: letzte.startTime!, endTime: letzte.endTime!, breakDuration: Number(letzte.breakDuration ?? 0) }
    : null;

  teile.push((async () => {
    // Wer heute ganztags weg ist, hat heute keinen Einsatz (M33).
    const eigeneAbwesenheit = einsaetze.some((a) => a.date === heute)
      ? await still(() => listAbwesendInRange(heute, heute), [] as Abwesenheit[])
      : [];
    const heuteWeg = !!ganztagsWeg(eigeneAbwesenheit, user.uid, heute);
    const heutige = heuteWeg ? [] : einsaetze.filter((a) => a.date === heute);
    if (heutige.length > 0) {
      const [projekte, listen] = await Promise.all([
        listProjectsByNumbers(user.companyId, heutige.map((a) => a.projectNumber)),
        was.material ? still(() => listEinsatzMaterialForDate(user.companyId, heute), []) : Promise.resolve([]),
      ]);
      out.heuteEigene = heutige
        .map((a) => {
          const pr = projekte.find((x) => x.projectNumber === a.projectNumber);
          const liste = listen.find((l) => l.projectNumber === a.projectNumber);
          return {
            id: a.id,
            date: a.date,
            projectNumber: a.projectNumber,
            projectId: pr?.id,
            customerName: pr ? baustellenTitel(pr) : `Baustelle ${a.projectNumber}`,
            address: pr?.address,
            contactName: pr?.contactName,
            contactPhone: pr?.contactPhone,
            asHelper: !!a.asHelper,
            comment: a.comment,
            zeit: einsatzZeit(a),
            material: liste?.positionen,
            geladen: liste?.geladen ?? {},
          };
        })
        // Nach Uhrzeit, ohne Uhrzeit zuletzt: „Danach“ ist dann wirklich danach.
        .sort((a, b) => (a.zeit ?? '99').localeCompare(b.zeit ?? '99'));
    } else {
      out.heuteEigene = [];
    }
  })());

  if (was.scheine && istAn(k.company?.modules, 'zeiterfassung')) {
    teile.push((async () => {
      const seit = localDateStr(tageZurueck(NACHTRAG_TAGE));
      const scheine = await still(() => listOwnWorkSheetsSince(user.companyId, user.uid, seit), []);
      out.nachtraege = offeneNachtraege(scheine, eintraege, heute, user.name ?? '');
    })());
  }
  if (was.material) {
    teile.push((async () => {
      out.eigeneOrders = await still(() => listOwnOpenOrders(user.companyId, user.uid), []);
    })());
  }
  if (was.kennzahlen && profil && fuehrtZeitkonto(profil)) {
    teile.push((async () => {
      const [saldo, urlaub] = await Promise.all([
        still(() => eigenerSaldo(user.companyId, profil, k.company), null),
        still(() => eigenerResturlaub(user.companyId, profil, k.company), null),
      ]);
      out.saldo = saldo;
      out.resturlaub = urlaub;
    })());
  }
  if (was.jugendschutz) {
    teile.push((async () => {
      out.eigeneGrenzfaelle = await eigeneGrenzfaelle(k, profil);
    })());
  }
  await Promise.all(teile);
  return out;
}

/**
 * DIE EIGENEN ÜBERSCHREITUNGEN, WENN MAN UNTER 18 IST (Runde 3, M2): der
 * laufende und der letzte Monat, gerechnet wie in der Mitarbeiterübersicht
 * und nur bis heute. Für alle anderen bleibt es bei der Frage nach dem
 * Geburtsdatum. Scheitert etwas, fehlt der Hinweis — nicht die Seite.
 */
async function eigeneGrenzfaelle(k: Kontext, profil: AppUser | null): Promise<Grenzfall[]> {
  const { user, heute } = k;
  const geboren = await still(() => getGeburtsdatum(user.companyId, user.uid), null);
  if (!istJugendlich(geboren, heute)) return [];
  const [j, m] = heute.split('-').map(Number);
  const vormonat = new Date(Date.UTC(j, m - 2, 1)).toISOString().slice(0, 10);
  const ab = new Date(Date.UTC(j, m - 2, 1 - 7)).toISOString().slice(0, 10);
  const rows = await still(() => listOwnEntriesInRange(user.companyId, user.uid, ab, heute), []);
  return grenzfaelle(
    rows,
    { von: vormonat, bis: heute },
    {
      geburtsdatum: geboren,
      schultagMin: profil ? (t) => tagessollStunden(profil, t) * 60 : undefined,
      andereVerteilung: grenzArbeitszeit(profil, k.company?.kjbgVerteilungKv === true).andereVerteilung,
    },
    { stichtag: heute },
  ).filter((f) => f.jugendlich);
}

// ──────────────────────────────────────────────────────────────── Lager ──

export async function lager(
  k: Kontext,
  was: { posten: boolean; bestand: boolean },
): Promise<Partial<StartDaten>> {
  const { user } = k;
  const [orders, posten, bestand] = await Promise.all([
    listOpenOrders(user.companyId),
    was.posten ? still(() => listLagerPosten(user.companyId), [] as EinkaufPosten[]) : Promise.resolve([]),
    was.bestand ? knappeArtikel() : Promise.resolve(undefined),
  ]);
  return { orders, lagerPosten: posten, knapp: bestand };
}

async function knappeArtikel(): Promise<KnappStand> {
  /*
    Gerechnet in der Datenbank (Ladezeit 19.10.2026): dieselbe Regel wie die
    Lagerliste (`istKnapp` — unter der Mindestmenge, ohne Mindestmenge ab der
    Grenze, nie ausgelaufen), über alle Lagerartikel.

    NUR, WAS GEZEIGT WIRD (Durchsicht 15.11.2026, Budget B3): die Zahl und
    ein Abschnitt voll der dringendsten aus der Lagerliste (`lager_liste`,
    gefiltert auf „knapp“), dazu der erste nach dem Namen für den
    Wochenhinweis — gleichzeitig. Bis dahin kam jeder knappe Artikel
    (`lager_knapp`, gewachsener Bestand: 192).
  */
  const [dringend, nachName] = await Promise.all([
    lagerListe({ filter: 'knapp', reihenfolge: 'frei', anzahl: JE_ABSCHNITT, grenze: LOW_STOCK_THRESHOLD }),
    lagerListe({ filter: 'knapp', reihenfolge: 'name', anzahl: 1, grenze: LOW_STOCK_THRESHOLD }),
  ]);
  return {
    anzahl: dringend.treffer,
    zeilen: dringend.zeilen.map((m) => ({
      id: m.id,
      name: m.name,
      ...(m.unit ? { unit: m.unit } : {}),
      mindestmenge: m.mindestmenge ?? null,
      frei: m.free,
    })),
    ersterNachName: nachName.zeilen[0]?.name ?? null,
  };
}

// ──────────────────────────────────────────────────────────── Buchhaltung ──

export async function buchhaltung(
  k: Kontext,
  was: { rechnungen: boolean; scheine: boolean },
): Promise<Partial<StartDaten>> {
  const { user, heute, company } = k;
  const out: Partial<StartDaten> = {};
  // Rechnungen und Scheine hängen nicht voneinander ab: gleichzeitig (Ladezeit, 19.10.2026).
  await Promise.all([
    was.rechnungen ? (async () => {
      const monatsErster = `${heute.slice(0, 7)}-01`;
      const [forderungen, [zahlungen, rechnungen], garantien] = await Promise.all([
        // Zahlen und die ersten je Abschnitt statt aller offenen Köpfe (B3) — dieselben Regeln, auf dem Server.
        startseiteForderungen(heute),
        // Die Rechnungen hinter den Zahlungen — für Namen, Nummer und den Stand —, sobald die Zahlungen da sind.
        still(() => listZahlungenImZeitraum(user.companyId, monatsErster, heute), []).then(async (zahlungen) => {
          const ids = [...new Set(zahlungen.map((z) => z.invoiceId))];
          return [zahlungen, ids.length ? await still(() => listInvoicesByIds(user.companyId, ids), []) : []] as const;
        }),
        // Still: fehlt die Erinnerung, bleibt der Rest der Startseite.
        still(() => listGarantienEndenIn(user.companyId, tageVerschoben(heute, -GARANTIE_NACHLAUF_TAGE), tageVerschoben(heute, GARANTIE_VORLAUF_TAGE)), []),
      ]);
      out.forderungen = forderungen;
      out.garantien = garantien;
      const nachId = new Map(rechnungen.map((r) => [r.id, r]));
      // Zahlungen auf eine stornierte Rechnung sind Guthaben, keine beglichene Forderung (M13).
      const zaehlt = zahlungen.filter((z) => z.art !== 'Skonto' && nachId.get(z.invoiceId)?.paymentStatus !== 'Storniert');
      out.bezahltImMonat = {
        summe: cent(zaehlt.reduce((s, z) => s + (Number(z.betrag) || 0), 0)),
        anzahl: new Set(zaehlt.map((z) => z.invoiceId)).size,
      };
      out.zahlungenHeute = zahlungen
        .filter((z) => z.datum === heute)
        .map((z) => ({ id: z.id, betrag: Number(z.betrag) || 0, art: z.art, rechnung: nachId.get(z.invoiceId) ?? null }));
    })() : undefined,
    /*
      Unverrechnete Stunden der Regiebaustellen (23.10.2026) — neben den
      Rechnungen, nicht danach. Still: fehlen sie, bleibt der Rest.

      Nur mit der Zeiterfassung (M06d/V2): ist sie aus, bietet die Rechnung
      die Stunden nicht mehr als Quelle an — „mit Stunden nicht verrechnet“
      wäre dann eine Aufgabe, die sich nirgends erledigen lässt.
    */
    was.rechnungen && istAn(company?.modules, 'zeiterfassung') ? (async () => {
      out.offeneStunden = await still(
        async () => unverrechneteStundenZeilen(await unverrechneteStunden(), heute),
        undefined,
      );
    })() : undefined,
    was.scheine ? (async () => {
      out.unverrechnet = await still(async () => {
        // Über ALLE unterschriebenen Scheine (P3), dieselben Regeln wie unter Rechnungen und in der Scheinliste —
        // gezählt in der Datenbank (L22), denn die Zeile nennt nur Zahl und Alter.
        const { anzahl, alt } = await scheineUnverrechnetStand(auffaelligBis(heute));
        return { anzahl, alt };
      }, undefined);
    })() : undefined,
  ]);
  return out;
}

// ───────────────────────────────────────────────────────────────── Team ──

export async function team(
  k: Kontext,
  was: { luecken: boolean; urlaub: boolean; freistellungen?: boolean; korrekturen?: boolean },
): Promise<Partial<StartDaten>> {
  const { user } = k;
  const out: Partial<StartDaten> = {};
  /*
    Die drei Fragen hängen nicht voneinander ab und laufen gleichzeitig
    (Ladezeit, 19.10.2026) — hintereinander addierten sich ihre Wege durchs
    Netz. Scheitert eine, scheitert der Block wie bisher.
  */
  await Promise.all([
    was.luecken && istAn(k.company?.modules, 'zeiterfassung') ? (async () => {
      const fenster = tageZurueck(LUECKEN_TAGE);
      const [alle, eintraege] = await Promise.all([
        belegschaftVon(k),
        // Jeder Tag je Person einmal: mehr braucht „Tage ohne Buchung“ nicht (Ladezeit, 19.10.2026).
        buchungstage(localDateStr(fenster), todayStr()),
      ]);
      out.team = alle
        .filter((u) => fuehrtZeitkonto(u) && u.active !== false && !!u.appStartDate)
        .map((u) => {
          const eigene = eintraege.filter((e) => e.userId === u.uid);
          const zuletzt = eigene.map((e) => e.date).filter((d) => d <= k.heute).sort().pop();
          const fehlend = offeneWerktage(u, eigene, fenster, new Date());
          return {
            uid: u.uid,
            name: u.name,
            fehlendeTage: fehlend.length,
            aeltesterTag: fehlend[0],
            zuletztGebucht: zuletzt,
          };
        });
    })() : undefined,
    was.urlaub ? listOpenVacations(user.companyId, 100).then((a) => { out.antraege = a; }) : undefined,
    was.freistellungen ? listOffeneFreistellungen(user.companyId).then((f) => { out.freistellungen = f; }) : undefined,
    /*
      WER SONST NOCH ENTSCHEIDET — für den eigenen Antrag (Vier Augen). Still:
      ohne Belegschaft bleibt er stehen wie bisher, der Rest des Blocks auch.
    */
    was.urlaub || was.freistellungen
      ? still(() => belegschaftVon(k), null).then((alle) => {
        if (alle) out.entscheidenAndere = andereEntscheiden(alle, user.uid, k.company?.vacationApprovers);
      })
      : undefined,
    // Wie Urlaub und Sonderurlaub: scheitert die Frage, sagt die Seite, dass der Block fehlt.
    was.korrekturen ? zeitkorrekturenLaden(user.companyId, true).then((z) => { out.korrekturen = z; }) : undefined,
  ]);
  return out;
}

// ─────────────────────────────────────────────────────────────── Leitung ──

export async function leitung(
  k: Kontext,
  was: { einsatzplanung: boolean; wartung: boolean; budget: boolean; material?: boolean },
): Promise<Partial<StartDaten>> {
  const { user, heute, company } = k;
  const out: Partial<StartDaten> = {};
  /*
    MATERIAL DER NÄCHSTEN SIEBEN TAGE (M04b, E13): dieselbe Rechnung wie in
    der Woche. Scheitert sie, fehlt nur dieser Abschnitt — nicht der Block.
  */
  const material = was.material && was.einsatzplanung
    ? still<MaterialFehltZeile[] | undefined>(async () => {
      const bis = new Date(Date.parse(`${heute}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
      const je = deckungJeEinsatz(await materialdeckung(heute, bis));
      return [...je]
        .filter(([, d]) => d.lage?.zustand === 'achtung')
        .map(([schluessel, d]) => {
          const [datum, ...rest] = schluessel.split('|');
          return { datum, projectNumber: rest.join('|'), text: d.lage!.text };
        });
    }, undefined)
    : undefined;
  const montag = montagDer(heute);
  const woche = wocheAb(montag);
  /*
    Die fälligen Wartungen hängen an nichts hier: gleich mit losschicken
    (Ladezeit, 19.10.2026). Bis zum selben Stichtag wie die Wartungsliste
    (`VORLAUF_TAGE`): ein Monat voraus war im Februar zwei Tage kürzer, und
    was die Liste „fällig“ nennt, fehlte hier.
  */
  // A9: was erledigt aussieht — scheitert es, fehlt nur der Vorschlag.
  const wartungVorschlaege = was.wartung ? still(() => wartungErledigtVorschlaege(), []) : undefined;
  /*
    ZAHL UND DIE ERSTEN JE ABSCHNITT (Durchsicht 15.11.2026, Budget B3):
    vorher jede fällige Wartung bis zum Stichtag, höchstens 200 — darüber
    stimmten die Zahlen nicht mehr. Gleich mit den Vorschlägen losgeschickt;
    gibt es Vorschläge, wird ohne deren Wartungen noch einmal gezählt — sie
    stehen in eigenen Zeilen.
  */
  const wartungBis = tageVerschoben(heute, VORLAUF_TAGE);
  const wartungen = wartungVorschlaege
    ? Promise.all([
      still(() => wartungenFaelligStand(heute, wartungBis, JE_ABSCHNITT), undefined),
      wartungVorschlaege,
    ]).then(([stand, v]) => (stand && v.length
      ? still(() => wartungenFaelligStand(heute, wartungBis, JE_ABSCHNITT, v.map((x) => x.wartungId)), undefined)
      : stand))
    : undefined;
  const projekteZusage = listActiveProjects(user.companyId);
  /*
    Der Budgetstand braucht nur die Baustellen, nicht Belegschaft und
    Einsätze: er startet, sobald sie da sind (Nachweis mit dreifachem
    Bestand, 19.10.2026) — vorher wartete er auf den ganzen Block.

    Scheitert er, fehlt nur er — nicht der ganze Block mit Baustellen,
    Einsätzen und Wartungen. So im Support-Einblick: die Stunden der
    Baustellen bekommt nur die Leitung des Betriebs selbst. Ohne
    Budgetstand steht auch kein „alle im Budget“ da (`aufbau.ts`).
    Scheitern die Baustellen selbst, scheitert der Block wie bisher.
  */
  const budget = was.budget
    ? still<BudgetZeile[] | undefined>(async () => {
      const mitBudget = (await projekteZusage).filter((pr) => (pr.estimatedHours ?? 0) > 0);
      return mitBudget.length ? budgetStand(mitBudget, await stundenDerBaustellen(mitBudget.map((pr) => pr.projectNumber))) : [];
    }, undefined)
    : undefined;
  // V1: auch morgen — wer dann fehlt, soll die Planung heute schon sehen.
  const morgen = tageVerschoben(heute, 1);
  const [projekte, alle, einsaetzeHeute, abwesend, plan, einsaetzeMorgen] = await Promise.all([
    projekteZusage,
    belegschaftVon(k),
    was.einsatzplanung ? listAssignmentsForDate(user.companyId, heute) : Promise.resolve([]),
    was.einsatzplanung
      ? still(() => listAbwesendInRange(woche[0] < heute ? woche[0] : heute, woche[6] > morgen ? woche[6] : morgen), [] as Abwesenheit[])
      : Promise.resolve([] as Abwesenheit[]),
    was.einsatzplanung
      ? still(async () => {
        /*
          FÜR „OHNE EINSATZ“ JE BAUSTELLE DER LETZTE UND DER NÄCHSTE EINSATZ,
          für die Auslastung die Einsatztage dieser Woche (Ladezeit,
          19.10.2026). Bis hierher kam jeder Einsatz der 15 Wochen dazwischen
          — mit der Belegschaft mehr, und ab 3.000 still abgeschnitten.
        */
        /*
          „Ohne Einsatz“ entscheidet seit P8 die Datenbank über alle aktiven
          Baustellen (`baustellen_ohne_einsatz`) — dieselbe Antwort wie der
          Filter der Baustellenliste. Kommt sie nicht, fehlt die Zeile (statt
          jede Baustelle als „ohne Einsatz“ zu melden).
        */
        const [ohne, woche7, zu] = await Promise.all([
          still(() => baustellenOhneEinsatz(heute), undefined),
          listEinsatztageInRange(user.companyId, woche[0], woche[6]),
          still(() => listBetriebsurlaubeImZeitraum(user.companyId, woche[0], woche[6]), null),
        ]);
        return { ohne, woche: woche7, zu };
      }, { ohne: undefined, woche: [], zu: null })
      : Promise.resolve({ ohne: undefined, woche: [], zu: null }),
    was.einsatzplanung ? still(() => listAssignmentsForDate(user.companyId, morgen), []) : Promise.resolve([]),
  ]);
  out.projekte = projekte;
  out.hatVerwaltung = alle.some((u) => u.role === 'Verwaltung' && u.active !== false);
  const nameVon = new Map(alle.map((u) => [u.uid, u.name]));

  if (was.einsatzplanung) {
    out.belegschaftNamen = alle.map((u) => ({ uid: u.uid, name: u.name }));
    const nachBaustelle = new Map<string, typeof einsaetzeHeute>();
    for (const a of einsaetzeHeute) {
      const liste = nachBaustelle.get(a.projectNumber) ?? [];
      liste.push(a);
      nachBaustelle.set(a.projectNumber, liste);
    }
    out.heuteBetrieb = [...nachBaustelle.entries()]
      .map(([pn, rows]) => {
        const pr = projekte.find((x) => x.projectNumber === pn);
        const lage = besetzung(rows, abwesend, heute);
        return {
          projectNumber: pn,
          customerName: pr ? baustellenTitel(pr) : `Baustelle ${pn}`,
          namen: lage.da.filter((n) => n !== 'Unbekannt').sort((a, b) => a.localeCompare(b, 'de')),
          fehlen: lage.fehlen,
          unbesetzt: lage.unbesetzt,
        };
      })
      .sort((a, b) => a.customerName.localeCompare(b.customerName, 'de'));

    /*
      EINGETEILTE FEHLEN (V1): heute, wo jemand fehlt, aber noch jemand da ist
      (ganz unbesetzt steht schon unter „Unbesetzt“), und morgen jeder Einsatz
      mit Fehlenden. Dieselbe Rechnung wie „Unbesetzt“ (`besetzung`).
    */
    const fehlenAm = (tag: string, rows: typeof einsaetzeHeute, auchUnbesetzt: boolean): FehlenZeile[] => {
      const je = new Map<string, typeof einsaetzeHeute>();
      for (const a of rows) je.set(a.projectNumber, [...(je.get(a.projectNumber) ?? []), a]);
      return [...je.entries()].flatMap(([pn, eingeteilt]) => {
        const lage = besetzung(eingeteilt, abwesend, tag);
        if (lage.fehlen.length === 0 || (lage.unbesetzt && !auchUnbesetzt)) return [];
        const pr = projekte.find((x) => x.projectNumber === pn);
        return [{
          datum: tag, projectNumber: pn, customerName: pr ? baustellenTitel(pr) : `Baustelle ${pn}`,
          namen: lage.da, fehlen: lage.fehlen, unbesetzt: lage.unbesetzt,
        }];
      }).sort((a, b) => a.customerName.localeCompare(b.customerName, 'de'));
    };
    out.eingeteiltFehlen = [...fehlenAm(heute, einsaetzeHeute, false), ...fehlenAm(morgen, einsaetzeMorgen, true)];

    out.abwesendHeute = abwesend
      .filter((a) => a.von <= heute && a.bis >= heute && nameVon.has(a.userId))
      .map((a) => ({ uid: a.userId, name: nameVon.get(a.userId)!, grund: a.grund, bis: a.bis, zeiten: a.zeiten }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));

    if (plan.ohne) out.ohneEinsatz = plan.ohne;
    // Ohne Betriebsurlaube (nicht geladen) keine Zahl: sonst zählte eine Woche zu als verfügbar.
    out.auslastung = plan.zu ? auslastung(alle, company, plan.woche, abwesend, woche, plan.zu) : null;
  }

  if (budget) out.budget = await budget;

  if (wartungen) {
    const stand = await wartungen;
    if (stand) out.wartungen = stand;
  }
  if (wartungVorschlaege) out.wartungVorschlaege = await wartungVorschlaege;
  if (material) out.materialFehlt = await material;
  return out;
}

/**
 * AUSLASTUNG DIESER WOCHE: verplante Personentage durch verfügbare.
 *
 * Verfügbar ist, wer einplanbar ist (Außendienst, je nach Einstellung die
 * Projektleiter), an seinen Arbeitstagen von Montag bis Sonntag, ohne
 * Feiertage und ohne ganztägige Abwesenheit. Verplant ist ein solcher Tag,
 * sobald ein Einsatz darauf liegt — wie viele, zählt nicht.
 */
export function auslastung(
  leute: Pick<AppUser, 'uid' | 'role' | 'active' | 'workDays'>[],
  company: Company | null | undefined,
  einsaetze: { userId: string; date: string }[],
  abwesend: Abwesenheit[],
  woche: string[],
  /**
   * DER BETRIEBSURLAUB (P9): an seinen Tagen ist nur verfügbar, wer
   * ausgenommen ist. Vorher zählte er als verfügbare Zeit — in einer Woche
   * Betriebsurlaub stand „0 %“ statt keiner Zahl.
   */
  betriebsurlaube: Pick<Betriebsurlaub, 'von' | 'bis' | 'ausgenommen'>[] = [],
): number | null {
  const planbar = leute.filter((u) => einplanbar(u, company));
  let verfuegbar = 0;
  let verplant = 0;
  const belegt = new Set(einsaetze.map((e) => `${e.userId}|${e.date}`));
  for (const u of planbar) {
    // Die Arbeitstage dieser Woche (Z3), nicht unbedingt die von heute.
    const az = arbeitszeitAm(u, woche[0] ?? todayStr());
    const tage = az.workDays?.length ? az.workDays : [1, 2, 3, 4, 5];
    for (const tag of woche) {
      const d = new Date(`${tag}T00:00:00`);
      if (!tage.includes(d.getDay())) continue;
      if (getAustrianHolidayName(d)) continue;
      if (ganztagsWeg(abwesend, u.uid, tag)) continue;
      if (betriebZuFuer(betriebsurlaube, u.uid, tag)) continue;
      verfuegbar += 1;
      if (belegt.has(`${u.uid}|${tag}`)) verplant += 1;
    }
  }
  return verfuegbar === 0 ? null : Math.round((verplant / verfuegbar) * 100);
}

// ─────────────────────────────────────────────────────────── Einstellungen ──

/**
 * Fehlende Einstellungen, die Rechnung und Mahnung brauchen — und was an den
 * Konten der Belegschaft zu tun ist (Lehrzeit zu Ende, Leitung ohne E-Mail).
 */
export async function einstellungen(
  k: Kontext,
  was: {
    rechnungen: boolean; konten: boolean; personen: boolean; firma?: boolean;
    /** Der Papierkorb (M01d): welche Arten mitzählen — je nach Modul. */
    papierkorb?: { angebote: boolean; scheine: boolean };
  },
): Promise<Partial<StartDaten>> {
  const { company, heute } = k;
  const out: Partial<StartDaten> = {};
  // Nur die Geschäftsführung bekommt die einmalige Meldung — sie pflegt die Firmendaten.
  if (was.firma) out.firmenbuchKorrigiertAm = company?.firmenbuchKorrigiertAm ?? null;
  if (was.rechnungen) {
    const ab = halbjahresbeginn(heute);
    // Steht der Satz zentral, braucht der Betrieb keinen eigenen. Kommt die
    // zentrale Liste nicht, bleibt es beim eigenen Verlauf wie bisher.
    const zentral = await still(() => listBasiszinssaetze(), []);
    out.basiszinsFehltAb = basiszinsVerlauf(company?.rates, zentral).some((b) => b.ab === ab) ? null : ab;
    const fehlt: string[] = [];
    if (!company?.strasse?.trim() || !company?.plz?.trim() || !company?.ort?.trim()) fehlt.push('Anschrift');
    if (!company?.iban?.trim()) fehlt.push('IBAN');
    // Runde 3, H3: eine ungültige IBAN sperrt jede neue Rechnung.
    else if (ibanFehler(company.iban)) fehlt.push('gültige IBAN');
    // Runde 3, M8: § 14 UGB — wer im Firmenbuch steht, nennt Nummer und Gericht.
    fehlt.push(...firmenbuchFehlt(company));
    out.firmaFehlt = fehlt;
    // Runde 5, M2: was davon jede Rechnung sperrt — dieselbe Prüfung wie am Knopf.
    out.firmaSperrt = firmaSperrtRechnung(company);
  }
  if (was.konten && k.user.companyId) {
    const konten = await still(() => buchungskonten(k.user.companyId), null);
    out.kontenFehlen = konten !== null && konten.length === 0;
  }
  /*
    DER PAPIERKORB ÜBER DER FRIST (M01d): nur mit Frist, gezählt auf dem
    Server — die Zahl stimmt auch, wenn der Papierkorb selbst seitenweise
    lädt. Ohne Frist fragt die Startseite gar nicht.
  */
  const stichtag = fristStichtag(company?.papierkorbFristTage, Date.now());
  if (was.papierkorb && stichtag !== null && k.user.companyId && company?.papierkorbFristTage) {
    const bis = new Date(stichtag).toISOString();
    const [angebote, scheine] = await Promise.all([
      was.papierkorb.angebote ? still(() => zaehleVerworfeneAngebote(k.user.companyId, bis), 0) : 0,
      was.papierkorb.scheine ? still(() => zaehleVerworfeneScheine(k.user.companyId, bis), 0) : 0,
    ]);
    out.papierkorbUeberFrist = { anzahl: angebote + scheine, tage: company.papierkorbFristTage };
  }
  if (was.personen && k.user.companyId) {
    const personen = await still(() => belegschaftVon(k), null);
    if (personen) {
      out.lehrzeitEnden = lehrzeitEnden(personen, heute);
      out.einzigeLeitungOhneMail = einzigeLeitungOhneMail(personen);
      // V14: wer sich nicht anmelden kann, wartet — die Bitte steht unter „Heute“.
      const anfragen = await still(() => listPasswortAnfragen(k.user.companyId), []);
      out.passwortBitten = passwortBitten(anfragen, personen);
    }
  }
  return out;
}

/** Wer gilt auf der Startseite als welche Rolle. */
export type StartRolle = 'monteur' | 'verwaltung' | 'buchhaltung' | 'projektleitung' | 'leitung';

export function startRolle(role: Role): StartRolle {
  switch (role) {
    case 'Mitarbeiter':
      return 'monteur';
    case 'Verwaltung':
      return 'verwaltung';
    case 'Buchhaltung':
      return 'buchhaltung';
    case 'Projektleiter':
      return 'projektleitung';
    default:
      return 'leitung';
  }
}
