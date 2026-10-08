import { ibanFehler } from '@shared/iban';
import { firmenbuchFehlt } from '@/lib/firmenbuch';
import type {
  AppUser,
  Company,
  EinkaufPosten,
  EinsatzMaterial,
  Freistellung,
  Invoice,
  MaterialOrder,
  Project,
  RuestPosition,
  Role,
  Termin,
  Vacation,
  Wartung,
} from '@/types';
import { getUserByUid, listUsers } from '@/lib/db/users';
import { listOwnEntriesSince, listOwnEntriesInRange, listEntriesInRange, listEntriesForProjects } from '@/lib/db/timeEntries';
import { getGeburtsdatum } from '@/lib/db/arbeitszeitGrenzen';
import { andereVerteilung, grenzfaelle, istJugendlich, type Grenzfall } from '@/features/accounting/arbeitszeitGrenzen';
import {
  listUpcomingAssignments,
  listAssignmentsForDate,
  listAssignmentsForUserInRange,
  listAssignmentsInRange,
} from '@/lib/db/assignments';
import { listEinsatzMaterialForDate } from '@/lib/db/einsatzMaterial';
import { listOpenOrders, listOwnOpenOrders } from '@/lib/db/materialOrders';
import { listLagerPosten } from '@/lib/db/einkauf';
import { listKnappeLagerArtikel } from '@/lib/db/materials';
import { listActiveProjects, listProjectsByNumbers } from '@/lib/db/projects';
import { listUnpaidInvoices, listInvoicesByIds, scheineAufRechnung } from '@/lib/db/invoices';
import { listZahlungenImZeitraum } from '@/lib/db/zahlungen';
import { listRecentWorkSheets, listOwnWorkSheetsSince } from '@/lib/db/workSheets';
import { listAbwesendInRange, listOpenVacations, type Abwesenheit } from '@/lib/db/vacations';
import { listOffeneFreistellungen } from '@/lib/db/freistellungen';
import { listTermineImZeitraum } from '@/lib/db/termine';
import { listFaelligeWartungen } from '@/lib/db/wartungen';
import { buchungskonten } from '@/lib/db/konten';
import { listBasiszinssaetze } from '@/lib/db/basiszins';
import {
  localDateStr,
  todayStr,
  offeneWerktage,
  tagessollStunden,
  type SaldoResult,
} from '@/lib/time';
import { fuehrtZeitkonto, einplanbar } from '@/lib/permissions';
import { getAustrianHolidayName } from '@shared/feiertage';
import { baustellenTitel } from '@/lib/baustellenTitel';
import { besetzung, ganztagsWeg } from '@/features/assignments/besetzung';
import { einsatzZeit } from '@/features/assignments/einsatzZeit';
import { montagDer, wocheAb } from '@/features/assignments/wochenplan';
import { offeneNachtraege, NACHTRAG_TAGE, type OffenerNachtrag } from '@/features/worksheets/zeitNachtrag';
import { unverrechneteScheine, UNVERRECHNET_BASIS } from '@/features/worksheets/unverrechnet';
import { mahnlauf, type Mahnlauf } from '@/features/invoices/mahnlauf';
import { basiszinsVerlauf, halbjahresbeginn } from '@/features/invoices/mahnung';
import { monateDazu } from '@/features/maintenance/wartungsplan';
import { eigenerResturlaub, eigenerSaldo } from './eigeneKonten';
import { budgetStand, ohneEinsatzListe, planFenster } from '@/features/projects/baustellenLage';
import {
  type BudgetZeile,
  type KnapperArtikel,
  type TagesBaustelle,
  type TeamLuecke,
  type UnverrechneteZeile,
  type ZahlungHeute,
  type LehrzeitEndeZeile,
  lehrzeitEnden,
  einzigeLeitungOhneMail,
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
  knapp?: KnapperArtikel[];
  // Buchhaltung
  unbezahlt?: (Invoice & { id: string })[];
  lauf?: Mahnlauf;
  unverrechnet?: UnverrechneteZeile[];
  zahlungenHeute?: ZahlungHeute[];
  bezahltImMonat?: { summe: number; anzahl: number };
  // Team
  team?: TeamLuecke[];
  antraege?: Vacation[];
  /** Offener Sonderurlaub (Plan 10.3) — fürs Büro und die Spitze. */
  freistellungen?: Freistellung[];
  // Leitung
  projekte?: Project[];
  budget?: BudgetZeile[];
  ohneEinsatz?: { projectNumber: string; zuletzt?: string }[];
  wartungen?: Wartung[];
  heuteBetrieb?: TagesBaustelle[];
  abwesendHeute?: Abwesend[];
  auslastung?: number | null;
  hatVerwaltung?: boolean;
  // Einstellungen
  basiszinsFehltAb?: string | null;
  kontenFehlen?: boolean;
  firmaFehlt?: string[];
  // Personen
  lehrzeitEnden?: LehrzeitEndeZeile[];
  einzigeLeitungOhneMail?: boolean;
  // Termine (Plan 10.4)
  termineHeute?: Termin[];
}

export interface Kontext {
  user: Pick<AppUser, 'uid' | 'companyId' | 'role'> & { name?: string };
  company: Company | null | undefined;
  heute: string;
}

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
    FEHLENDE TAGE NUR MIT ZEITKONTO — gefragt wird die frische Zeile, nicht
    das gemerkte Profil (Prüflauf F17).
  */
  if (profil && fuehrtZeitkonto(profil)) {
    out.hatEintritt = !!profil.appStartDate;
    out.fehlendeTage = offeneWerktage(profil, eintraege, fenster, new Date());
    if (out.fehlendeTage.length > 0) {
      const plan = await still(
        () => listAssignmentsForUserInRange(user.companyId, user.uid, out.fehlendeTage![0], out.fehlendeTage![out.fehlendeTage!.length - 1]),
        [],
      );
      out.planNachTag = new Map(plan.map((a) => [a.date, a.projectNumber]));
    }
  }

  // „Wie zuletzt“: der jüngste Anwesenheitseintrag mit Zeitspanne.
  const letzte = [...eintraege]
    .filter((e) => e.status === 'Anwesend' && e.startTime && e.endTime)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  out.letzteBuchung = letzte
    ? { startTime: letzte.startTime!, endTime: letzte.endTime!, breakDuration: Number(letzte.breakDuration ?? 0) }
    : null;

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

  if (was.scheine) {
    const seit = localDateStr(tageZurueck(NACHTRAG_TAGE));
    const scheine = await still(() => listOwnWorkSheetsSince(user.companyId, user.uid, seit), []);
    out.nachtraege = offeneNachtraege(scheine, eintraege, heute, user.name ?? '');
  }
  if (was.material) {
    out.eigeneOrders = await still(() => listOwnOpenOrders(user.companyId, user.uid), []);
  }
  if (was.kennzahlen && profil && fuehrtZeitkonto(profil)) {
    const [saldo, urlaub] = await Promise.all([
      still(() => eigenerSaldo(user.companyId, profil, k.company), null),
      still(() => eigenerResturlaub(user.companyId, profil, k.company), null),
    ]);
    out.saldo = saldo;
    out.resturlaub = urlaub;
  }
  if (was.jugendschutz) {
    out.eigeneGrenzfaelle = await eigeneGrenzfaelle(k, profil);
  }
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
      andereVerteilung: andereVerteilung(profil),
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

async function knappeArtikel(): Promise<KnapperArtikel[]> {
  return listKnappeLagerArtikel();
}

// ──────────────────────────────────────────────────────────── Buchhaltung ──

export async function buchhaltung(
  k: Kontext,
  was: { rechnungen: boolean; scheine: boolean },
): Promise<Partial<StartDaten>> {
  const { user, heute, company } = k;
  const out: Partial<StartDaten> = {};
  if (was.rechnungen) {
    const monatsErster = `${heute.slice(0, 7)}-01`;
    const [unbezahlt, zahlungen] = await Promise.all([
      listUnpaidInvoices(user.companyId),
      still(() => listZahlungenImZeitraum(user.companyId, monatsErster, heute), []),
    ]);
    out.unbezahlt = unbezahlt;
    out.lauf = mahnlauf(unbezahlt, heute, company?.rates);
    // Die Rechnungen hinter den Zahlungen — für Namen, Nummer und den Stand.
    const ids = [...new Set(zahlungen.map((z) => z.invoiceId))];
    const rechnungen = ids.length ? await still(() => listInvoicesByIds(user.companyId, ids), []) : [];
    const nachId = new Map(rechnungen.map((r) => [r.id, r]));
    // Zahlungen auf eine stornierte Rechnung sind Guthaben, keine beglichene Forderung (M13).
    const zaehlt = zahlungen.filter((z) => z.art !== 'Skonto' && nachId.get(z.invoiceId)?.paymentStatus !== 'Storniert');
    out.bezahltImMonat = {
      summe: Math.round(zaehlt.reduce((s, z) => s + (Number(z.betrag) || 0), 0) * 100) / 100,
      anzahl: new Set(zaehlt.map((z) => z.invoiceId)).size,
    };
    out.zahlungenHeute = zahlungen
      .filter((z) => z.datum === heute)
      .map((z) => ({ id: z.id, betrag: Number(z.betrag) || 0, art: z.art, rechnung: nachId.get(z.invoiceId) ?? null }));
  }
  if (was.scheine) {
    out.unverrechnet = await still(async () => {
      const scheine = await listRecentWorkSheets(user.companyId, UNVERRECHNET_BASIS);
      // Ob verrechnet, sagt die Abdeckung über ALLE Rechnungen (P2-03) — wie unter Rechnungen.
      const verrechnet = await scheineAufRechnung(user.companyId, scheine.map((s) => s.id));
      return unverrechneteScheine(scheine, [{ linkedWorkSheets: verrechnet, paymentStatus: 'Offen' }], heute);
    }, undefined);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────── Team ──

export async function team(
  k: Kontext,
  was: { luecken: boolean; urlaub: boolean; freistellungen?: boolean },
): Promise<Partial<StartDaten>> {
  const { user } = k;
  const out: Partial<StartDaten> = {};
  if (was.luecken) {
    const fenster = tageZurueck(LUECKEN_TAGE);
    const [alle, eintraege] = await Promise.all([
      listUsers(user.companyId),
      listEntriesInRange(user.companyId, localDateStr(fenster), todayStr()),
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
  }
  if (was.urlaub) {
    out.antraege = await listOpenVacations(user.companyId, 100);
  }
  if (was.freistellungen) {
    out.freistellungen = await listOffeneFreistellungen(user.companyId);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────── Leitung ──

export async function leitung(
  k: Kontext,
  was: { einsatzplanung: boolean; wartung: boolean; budget: boolean },
): Promise<Partial<StartDaten>> {
  const { user, heute, company } = k;
  const out: Partial<StartDaten> = {};
  const montag = montagDer(heute);
  const woche = wocheAb(montag);
  const { von: vorher, bis } = planFenster(heute);
  const [projekte, alle, einsaetzeHeute, abwesend, plan] = await Promise.all([
    listActiveProjects(user.companyId),
    listUsers(user.companyId),
    was.einsatzplanung ? listAssignmentsForDate(user.companyId, heute) : Promise.resolve([]),
    was.einsatzplanung
      ? still(() => listAbwesendInRange(woche[0] < heute ? woche[0] : heute, woche[6] > heute ? woche[6] : heute), [] as Abwesenheit[])
      : Promise.resolve([] as Abwesenheit[]),
    was.einsatzplanung
      ? still(() => listAssignmentsInRange(user.companyId, vorher < montag ? vorher : montag, bis > woche[6] ? bis : woche[6]), [])
      : Promise.resolve([]),
  ]);
  out.projekte = projekte;
  out.hatVerwaltung = alle.some((u) => u.role === 'Verwaltung' && u.active !== false);
  const nameVon = new Map(alle.map((u) => [u.uid, u.name]));

  if (was.einsatzplanung) {
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

    out.abwesendHeute = abwesend
      .filter((a) => a.von <= heute && a.bis >= heute && nameVon.has(a.userId))
      .map((a) => ({ uid: a.userId, name: nameVon.get(a.userId)!, grund: a.grund, bis: a.bis, zeiten: a.zeiten }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));

    out.ohneEinsatz = ohneEinsatzListe(projekte, plan, heute);
    out.auslastung = auslastung(alle, company, plan, abwesend, woche);
  }

  if (was.budget) {
    const mitBudget = projekte.filter((pr) => (pr.estimatedHours ?? 0) > 0);
    out.budget = mitBudget.length
      ? budgetStand(mitBudget, await listEntriesForProjects(user.companyId, mitBudget.map((pr) => pr.projectNumber)))
      : [];
  }

  if (was.wartung) {
    out.wartungen = await still(() => listFaelligeWartungen(user.companyId, monateDazu(heute, 1)), []);
  }
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
): number | null {
  const planbar = leute.filter((u) => einplanbar(u, company));
  let verfuegbar = 0;
  let verplant = 0;
  const belegt = new Set(einsaetze.map((e) => `${e.userId}|${e.date}`));
  for (const u of planbar) {
    const tage = u.workDays?.length ? u.workDays : [1, 2, 3, 4, 5];
    for (const tag of woche) {
      const d = new Date(`${tag}T00:00:00`);
      if (!tage.includes(d.getDay())) continue;
      if (getAustrianHolidayName(d)) continue;
      if (ganztagsWeg(abwesend, u.uid, tag)) continue;
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
  was: { rechnungen: boolean; konten: boolean; personen: boolean },
): Promise<Partial<StartDaten>> {
  const { company, heute } = k;
  const out: Partial<StartDaten> = {};
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
  }
  if (was.konten && k.user.companyId) {
    const konten = await still(() => buchungskonten(k.user.companyId), null);
    out.kontenFehlen = konten !== null && konten.length === 0;
  }
  if (was.personen && k.user.companyId) {
    const personen = await still(() => listUsers(k.user.companyId), null);
    if (personen) {
      out.lehrzeitEnden = lehrzeitEnden(personen, heute);
      out.einzigeLeitungOhneMail = einzigeLeitungOhneMail(personen);
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
