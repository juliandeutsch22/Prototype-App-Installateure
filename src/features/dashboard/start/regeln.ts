import type { AppUser, EinkaufPosten, Invoice, MaterialOrder, Project, Vacation, Wartung, WorkSheet } from '@/types';
import { lehrzeitEnde } from '@/lib/einstufung';
import { istBenutzerkonto } from '@shared/benutzername';
import type { OffenerNachtrag } from '@/features/worksheets/zeitNachtrag';
import type { Mahnlauf } from '@/features/invoices/mahnlauf';
import { istUeberfaellig, offenerRest } from '@/features/invoices/zahlstand';
import { beurteile } from '@/features/maintenance/wartungsplan';
import { euro } from '@/lib/betrag';
import { datumAT } from '@/lib/datum';
import { fmtStd, fmtStunden, tageWort } from '@/lib/time';
import { baustellenTitel } from '@/lib/baustellenTitel';
import { abschnitt, type Abschnitt, type Zeile } from './abschnitte';
import { istAbholbereitAlt, istLieferungHeute, istLieferungUeberfaellig } from '@/features/orders/anforderungStand';
import { BUDGET_AB_PROZENT, endeVorbei, ohneProjektleiter, type BudgetZeile } from '@/features/projects/baustellenLage';

export { BUDGET_AB_PROZENT, type BudgetZeile };
export { ohneEinsatzListe, OHNE_EINSATZ_TAGE } from '@/features/projects/baustellenLage';

export { istAbholbereitAlt, istLieferungUeberfaellig };
import { ZIEL } from './ziele';

/**
 * WAS AUF DER STARTSEITE STEHT — je Abschnitt eine reine Funktion
 * (Nachtest 01.10.2026, Paket B, Skizzen `docs/design/startseite-skizzen`).
 *
 * Eingabe sind die geladenen Daten, Ausgabe die Zeilen. Sortiert wird nach
 * Dringlichkeit: Überfälliges vor Heutigem vor dieser Woche; innerhalb eines
 * Abschnitts das Älteste zuerst. Rot nur für Überfälliges.
 */

const TAG_MS = 86_400_000;

/** '2026-09-24' → '24.09.' */
export function tagKurz(iso: string): string {
  return datumAT(iso).slice(0, 6);
}

/** Millisekunden → '24.09.' in Wiener Zeit. */
function tagKurzMs(ms: number): string {
  return new Date(ms).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Vienna' });
}

/** Ganze Tage zwischen zwei ISO-Tagen (b − a). */
export function tageZwischen(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / TAG_MS);
}

function iso(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date(ms));
}

/** „Freitag, 25.09.2026“ */
export function tagLang(isoTag: string): string {
  const wt = new Date(`${isoTag}T00:00:00`).toLocaleDateString('de-AT', { weekday: 'long' });
  return `${wt}, ${datumAT(isoTag)}`;
}

const mengeText = (o: Pick<MaterialOrder, 'quantity' | 'materialName'>) =>
  `${o.quantity} × ${o.materialName}`;

const nurEchte = (o: MaterialOrder) => o.transactionType !== 'return';

// ─────────────────────────────────────────────────────────────── Monteur ──

/** Tage ohne Buchung — das Älteste zuerst; „laut Plan“, wenn eingeteilt war. */
export function tageOhneBuchung(tage: string[], planNachTag: Map<string, string> = new Map()): Abschnitt | null {
  const zeilen: Zeile[] = [...tage].sort().map((t) => ({
    key: `tag-${t}`,
    titel: tagLang(t),
    detail: planNachTag.get(t) ? `laut Plan ${planNachTag.get(t)}` : undefined,
    status: { text: 'nicht gebucht', ton: 'warn' },
    to: ZIEL.zeitTag(t),
  }));
  return abschnitt('tage', 'Tage ohne Buchung', zeilen, ZIEL.zeitFehlend);
}

export function scheinOhneZeit(nachtraege: OffenerNachtrag[]): Abschnitt | null {
  const zeilen: Zeile[] = [...nachtraege]
    .sort((a, b) => a.schein.datum.localeCompare(b.schein.datum))
    .map((n) => ({
      key: `nachtrag-${n.schein.id}`,
      titel: n.schein.customerName || `Baustelle ${n.schein.projectNumber}`,
      detail: `Schein vom ${datumAT(n.schein.datum)}`,
      status: { text: 'Zeit fehlt', ton: 'warn' },
      to: ZIEL.zeit,
    }));
  return abschnitt('nachtrag', 'Schein wartet auf Zeitbuchung', zeilen, ZIEL.zeit);
}

export function abholbereitEigen(orders: MaterialOrder[]): Abschnitt | null {
  const zeilen: Zeile[] = orders
    .filter((o) => nurEchte(o) && o.status === 'Abholbereit')
    .sort((a, b) => (a.abholbereitSeit ?? a.updatedAt ?? 0) - (b.abholbereitSeit ?? b.updatedAt ?? 0))
    .map((o) => {
      const seit = o.abholbereitSeit ?? o.updatedAt;
      return {
        key: `abh-${o.id}`,
        titel: mengeText(o),
        detail: ['Lager', o.projectNumber].filter(Boolean).join(' · '),
        status: { text: seit ? `seit ${tagKurzMs(seit)}` : 'abholbereit', ton: 'ok' },
        to: ZIEL.meineAbholbereit,
      };
    });
  return abschnitt('abholbereit', 'Material abholbereit', zeilen, ZIEL.meineAbholbereit);
}

// ───────────────────────────────────────────────────────────── Verwaltung ──

/** Eil zuerst, dann die älteste — wie die Liste unter Anforderungen. */
export function eilZuerst(a: MaterialOrder, b: MaterialOrder): number {
  return Number(!!b.isUrgent) - Number(!!a.isUrgent) || (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

export function offeneAnforderungen(orders: MaterialOrder[], heute: string): Abschnitt | null {
  const zeilen: Zeile[] = orders
    .filter((o) => nurEchte(o) && o.status === 'Offen')
    .sort(eilZuerst)
    .map((o) => ({
      key: `offen-${o.id}`,
      titel: mengeText(o),
      detail: [o.userName, o.projectNumber].filter(Boolean).join(' · '),
      status: o.isUrgent
        ? { text: 'Eil', ton: 'warn' }
        : { text: o.createdAt && iso(o.createdAt) === heute ? 'heute' : o.createdAt ? `seit ${tagKurzMs(o.createdAt)}` : 'offen', ton: 'leise' },
      to: ZIEL.anforderungen('offen'),
    }));
  return abschnitt('anf-offen', 'Offene Anforderungen', zeilen, ZIEL.anforderungen('offen'));
}

export function bestelltUeberfaellig(orders: MaterialOrder[], heute: string): Abschnitt | null {
  const zeilen: Zeile[] = orders
    .filter((o) => nurEchte(o) && istLieferungUeberfaellig(o, heute))
    .sort((a, b) => (a.liefertermin ?? '').localeCompare(b.liefertermin ?? ''))
    .map((o) => ({
      key: `best-${o.id}`,
      titel: mengeText(o),
      detail: [o.projectNumber, `Liefertermin ${tagKurz(o.liefertermin!)}`].filter(Boolean).join(' · '),
      status: { text: tageWort(tageZwischen(o.liefertermin!, heute)), ton: 'fehl' },
      to: ZIEL.anforderungen('bestellt-ueberfaellig'),
    }));
  return abschnitt('anf-bestellt', 'Bestellt und überfällig', zeilen, ZIEL.anforderungen('bestellt-ueberfaellig'));
}

export function abholbereitAlt(orders: MaterialOrder[], jetzt: number): Abschnitt | null {
  const zeilen: Zeile[] = orders
    .filter((o) => nurEchte(o) && istAbholbereitAlt(o, jetzt))
    .sort((a, b) => (a.abholbereitSeit ?? 0) - (b.abholbereitSeit ?? 0))
    .map((o) => ({
      key: `alt-${o.id}`,
      titel: mengeText(o),
      detail: [o.userName, o.projectNumber].filter(Boolean).join(' · '),
      status: { text: `seit ${tagKurzMs(o.abholbereitSeit!)}`, ton: 'warn' },
      to: ZIEL.anforderungen('abholbereit-alt'),
    }));
  return abschnitt('anf-alt', 'Seit über 3 Tagen abholbereit', zeilen, ZIEL.anforderungen('abholbereit-alt'));
}

export interface KnapperArtikel {
  id: string;
  name: string;
  unit?: string;
  frei: number;
  mindestmenge?: number | null;
}

export function unterMindestmenge(artikel: KnapperArtikel[]): Abschnitt | null {
  const zeilen: Zeile[] = [...artikel]
    .sort((a, b) => a.frei - b.frei || a.name.localeCompare(b.name, 'de'))
    .map((m) => ({
      key: `knapp-${m.id}`,
      titel: m.name,
      detail: [
        `${fmtStunden(m.frei)}${m.unit ? ` ${m.unit}` : ''} frei`,
        m.mindestmenge != null ? `Mindestmenge ${fmtStunden(m.mindestmenge)}` : '',
      ].filter(Boolean).join(' · '),
      status: m.frei <= 0 ? { text: 'leer', ton: 'fehl' } : { text: 'knapp', ton: 'warn' },
      to: ZIEL.lagerKnapp,
    }));
  return abschnitt('knapp', 'Unter Mindestmenge', zeilen, ZIEL.lagerKnapp);
}

/** Bestellt, heute erwartet — Anforderungen und eigene Posten des Büros. */
export function lieferungenHeute(
  orders: MaterialOrder[],
  posten: EinkaufPosten[],
  heute: string,
): Zeile[] {
  const zeilen: Zeile[] = [];
  for (const o of orders) {
    if (!nurEchte(o) || !istLieferungHeute(o, heute)) continue;
    zeilen.push({
      key: `lief-a-${o.id}`,
      titel: mengeText(o),
      detail: [o.userName, o.projectNumber].filter(Boolean).join(' · '),
      status: { text: 'heute', ton: 'info' },
      to: ZIEL.anforderungen('lieferung-heute'),
    });
  }
  for (const p of posten) {
    if (!p.bestelltAm || p.geliefertAm || p.liefertermin !== heute) continue;
    zeilen.push({
      key: `lief-p-${p.id}`,
      titel: `${fmtStunden(p.menge)}${p.einheit ? ` ${p.einheit}` : ''} × ${p.materialName}`,
      detail: 'fürs Lager',
      status: { text: 'heute', ton: 'info' },
      to: ZIEL.anforderungen('lieferung-heute'),
    });
  }
  return zeilen;
}

// ──────────────────────────────────────────────────────────── Buchhaltung ──

export function mahnungenFaellig(lauf: Mahnlauf): Abschnitt | null {
  const zeilen: Zeile[] = lauf.zeilen.map((z) => ({
    key: `mahn-${z.rechnung.id}`,
    titel: z.rechnung.customerName,
    detail: `${z.rechnung.invoiceNumber} · ${z.stufe}. Mahnung`,
    status: { text: tageWort(z.tageUeberfaellig), ton: 'fehl' },
    to: ZIEL.rechnung(z.rechnung.invoiceNumber),
  }));
  return abschnitt('mahnung', 'Mahnungen fällig', zeilen, ZIEL.rechnungenSicht('mahnung-faellig'));
}

/** Überfällig, aber (noch) nicht zu mahnen — sonst stünde dieselbe Rechnung zweimal da. */
export function ueberfaelligNichtMahnbar(
  rechnungen: (Invoice & { id: string })[],
  lauf: Mahnlauf,
  heute: string,
): Abschnitt | null {
  const imLauf = new Set(lauf.zeilen.map((z) => z.rechnung.id));
  const ausgereizt = new Set(lauf.ausgereizt.map((r) => r.id));
  const zeilen: Zeile[] = rechnungen
    .filter((r) => istUeberfaellig(r, heute) && !imLauf.has(r.id))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .map((r) => ({
      key: `ueber-${r.id}`,
      titel: r.customerName,
      detail: ausgereizt.has(r.id)
        ? `${r.invoiceNumber} · 3. Mahnung heraus — Inkasso prüfen`
        : `${r.invoiceNumber} · ${euro(offenerRest(r))}`,
      status: { text: r.dueDate ? tageWort(tageZwischen(r.dueDate, heute)) : 'überfällig', ton: 'fehl' },
      to: ZIEL.rechnung(r.invoiceNumber),
    }));
  return abschnitt('ueberfaellig', 'Überfällig, noch nicht mahnbar', zeilen, ZIEL.rechnungenUeberfaellig);
}

export interface UnverrechneteZeile {
  schein: WorkSheet & { id: string };
  tage: number;
}

export function scheineNichtVerrechnet(auffaellig: UnverrechneteZeile[]): Abschnitt | null {
  const zeilen: Zeile[] = auffaellig.map(({ schein, tage }) => ({
    key: `schein-${schein.id}`,
    titel: schein.customerName || `Baustelle ${schein.projectNumber}`,
    detail: `Schein ${datumAT(schein.datum)} · ${schein.projectNumber}`,
    status: { text: tageWort(tage), ton: 'warn' },
    to: ZIEL.schein(schein.id),
  }));
  return abschnitt('scheine', 'Scheine über 4 Wochen nicht verrechnet', zeilen, ZIEL.scheine('nicht-verrechnet-alt'));
}

export interface TeamLuecke {
  uid: string;
  name: string;
  fehlendeTage: number;
  /** Der älteste fehlende Tag — für den Monat der Mitarbeiterübersicht. */
  aeltesterTag?: string;
  zuletztGebucht?: string;
}

/** Der Monat (JJJJ-MM) mit dem ältesten fehlenden Tag im Team. */
export function lueckenMonat(team: TeamLuecke[]): string | undefined {
  return team.map((t) => t.aeltesterTag).filter((t): t is string => !!t).sort()[0]?.slice(0, 7);
}

export function stundenOhneBuchung(team: TeamLuecke[]): Abschnitt | null {
  const ziel = ZIEL.luecken(lueckenMonat(team));
  const zeilen: Zeile[] = team
    .filter((t) => t.fehlendeTage > 0)
    .sort((a, b) => b.fehlendeTage - a.fehlendeTage || a.name.localeCompare(b.name, 'de'))
    .map((t) => ({
      key: `luecke-${t.uid}`,
      titel: t.name,
      detail: t.zuletztGebucht ? `zuletzt gebucht ${datumAT(t.zuletztGebucht)}` : 'in den letzten Wochen nichts gebucht',
      status: { text: tageWort(t.fehlendeTage), ton: 'warn' },
      to: ZIEL.luecken(t.aeltesterTag?.slice(0, 7)),
    }));
  // „Stunden ohne Buchung“ heißt in der Scheinliste etwas anderes (Stunden
  // auf Scheinen, die nicht gebucht sind). Hier sind es Personen mit Tagen
  // ohne Buchung (Analyse 03.10.2026, Paket 1).
  return abschnitt('luecken', 'Personen mit Tagen ohne Buchung', zeilen, ziel);
}

export function urlaubsantraege(antraege: Vacation[]): Abschnitt | null {
  const zeilen: Zeile[] = antraege
    .filter((v) => v.status === 'Beantragt')
    .sort((a, b) => a.von.localeCompare(b.von))
    .map((v) => ({
      key: `urlaub-${v.id}`,
      titel: v.userName,
      detail: `${v.von === v.bis ? datumAT(v.von) : `${tagKurz(v.von)}–${datumAT(v.bis)}`} · ${tageWort(v.tage)}`,
      status: { text: 'entscheiden', ton: 'warn' },
      to: ZIEL.urlaubsantraege,
    }));
  return abschnitt('urlaub', 'Urlaubsanträge', zeilen, ZIEL.urlaubsantraege);
}

export interface ZahlungHeute {
  id: string;
  betrag: number;
  art: string;
  rechnung?: Pick<Invoice, 'invoiceNumber' | 'customerName' | 'paymentStatus'> | null;
}

export function zahlungenHeute(zahlungen: ZahlungHeute[]): Zeile[] {
  return zahlungen
    .filter((z) => z.art !== 'Skonto')
    .map((z) => {
      const bezahlt = z.rechnung?.paymentStatus === 'Bezahlt' || z.rechnung?.paymentStatus === 'Überzahlt';
      return {
        key: `zahlung-${z.id}`,
        titel: z.rechnung?.customerName ?? 'Zahlung',
        detail: z.rechnung?.invoiceNumber,
        status: { text: `${euro(z.betrag)} · ${z.betrag < 0 ? 'Rückzahlung' : bezahlt ? 'bezahlt' : 'teilweise'}`, ton: bezahlt ? 'ok' : 'warn' },
        to: z.rechnung ? ZIEL.rechnung(z.rechnung.invoiceNumber) : ZIEL.rechnungenSicht('bezahlt-heute'),
      };
    });
}

// ───────────────────────────────────────────────────────── Projektleitung ──

export function budgetNahe(alle: BudgetZeile[]): Abschnitt | null {
  const zeilen: Zeile[] = alle
    .filter((b) => b.pct >= BUDGET_AB_PROZENT)
    .sort((a, b) => b.pct - a.pct)
    .map((b) => ({
      key: `budget-${b.projectNumber}`,
      titel: b.titel,
      detail: `${b.projectNumber} · ${fmtStd(b.usedMin)} von ${fmtStunden(b.estimatedHours)} Std`,
      status: { text: `${b.pct} %`, ton: 'warn' },
      to: ZIEL.baustelle(b.projectNumber),
    }));
  return abschnitt('budget', 'Baustellen über oder nahe Budget', zeilen, ZIEL.baustellen('budget'));
}

export interface TagesBaustelle {
  projectNumber: string;
  customerName: string;
  namen: string[];
  fehlen: { name: string; grund: string | null }[];
  unbesetzt: boolean;
}

export function unbesetzteEinsaetze(heute: string, tag: TagesBaustelle[]): Abschnitt | null {
  const zeilen: Zeile[] = tag
    .filter((b) => b.unbesetzt)
    .map((b) => ({
      key: `unbesetzt-${b.projectNumber}`,
      titel: `${b.customerName} · ${b.projectNumber}`,
      detail: b.fehlen.map((f) => (f.grund ? `${f.name} ${f.grund.toLowerCase()}` : `${f.name} abwesend`)).join(', '),
      status: { text: 'heute', ton: 'warn' },
      to: ZIEL.tag(heute, 'unbesetzt'),
    }));
  return abschnitt('unbesetzt', 'Unbesetzte Einsätze', zeilen, ZIEL.tag(heute, 'unbesetzt'));
}

export function ohneEinsatz(
  liste: { projectNumber: string; zuletzt?: string }[],
  titelVon: (nr: string) => string,
): Abschnitt | null {
  const zeilen: Zeile[] = [...liste]
    // Am längsten nicht mehr dort zuerst; nie eingeplante ganz oben.
    .sort((a, b) => (a.zuletzt ?? '').localeCompare(b.zuletzt ?? ''))
    .map((x) => ({
      key: `ohne-${x.projectNumber}`,
      titel: titelVon(x.projectNumber),
      detail: x.projectNumber,
      status: { text: x.zuletzt ? `zuletzt ${tagKurz(x.zuletzt)}` : 'nie eingeplant', ton: 'leise' },
      to: ZIEL.baustelle(x.projectNumber),
    }));
  return abschnitt('ohne-einsatz', 'Ohne Einsatz in den nächsten 14 Tagen', zeilen, ZIEL.baustellen('ohne-einsatz'));
}

/** Fällige Wartungen ohne offene Baustelle — überfällige zuerst. */
export function wartungenOhneBaustelle(wartungen: Wartung[], heute: string): Abschnitt | null {
  const zeilen: Zeile[] = wartungen
    .filter((w) => w.aktiv && !w.offeneBaustelle)
    .map((w) => ({ w, b: beurteile(w, heute) }))
    .filter(({ b }) => b.stand === 'überfällig' || b.stand === 'fällig')
    .sort((a, b) => a.w.faelligAm.localeCompare(b.w.faelligAm))
    .map(({ w, b }) => {
      const tage = tageZwischen(heute, w.faelligAm);
      return {
        key: `wartung-${w.id}`,
        titel: `${w.anlage} ${w.customerName}`.trim(),
        detail: `fällig ${datumAT(w.faelligAm)}`,
        status: b.stand === 'überfällig'
          ? { text: 'überfällig', ton: 'fehl' as const }
          : { text: tage <= 7 ? 'diese Woche' : `in ${tageWort(tage)}`, ton: tage <= 7 ? ('warn' as const) : ('leise' as const) },
        to: ZIEL.wartungenOhneBaustelle,
      };
    });
  return abschnitt('wartung', 'Fällige Wartungen ohne Baustelle', zeilen, ZIEL.wartungenOhneBaustelle);
}

export function eilanforderungen(orders: MaterialOrder[]): Abschnitt | null {
  const zeilen: Zeile[] = orders
    .filter((o) => nurEchte(o) && o.isUrgent && (o.status === 'Offen' || o.status === 'In Bearbeitung'))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .map((o) => ({
      key: `eil-${o.id}`,
      titel: mengeText(o),
      detail: [o.userName, o.projectNumber].filter(Boolean).join(' · '),
      status: { text: o.status === 'Offen' ? 'offen' : 'in Bearbeitung', ton: 'warn' },
      to: ZIEL.anforderungen('eil'),
    }));
  return abschnitt('eil', 'Eilanforderungen', zeilen, ZIEL.anforderungen('eil'));
}

export function ohneProjektleitung(projekte: Project[]): Abschnitt | null {
  const zeilen: Zeile[] = projekte
    .filter(ohneProjektleiter)
    .sort((a, b) => a.projectNumber.localeCompare(b.projectNumber))
    .map((p) => ({
      key: `ohnepl-${p.id}`,
      titel: baustellenTitel(p),
      detail: p.projectNumber,
      status: { text: 'ohne Projektleiter', ton: 'leise' },
      to: ZIEL.baustelle(p.projectNumber),
    }));
  return abschnitt('ohne-leitung', 'Baustellen ohne Projektleiter', zeilen, ZIEL.baustellen('ohne-leitung'));
}

export function endeUeberschritten(projekte: Project[], heute: string): Abschnitt | null {
  const zeilen: Zeile[] = projekte
    .filter((p) => endeVorbei(p, heute))
    .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''))
    .map((p) => ({
      key: `ende-${p.id}`,
      titel: baustellenTitel(p),
      detail: `${p.projectNumber} · Ende ${datumAT(p.endDate!)}`,
      status: { text: `seit ${tageWort(tageZwischen(p.endDate!, heute))}`, ton: 'fehl' },
      to: ZIEL.baustelle(p.projectNumber),
    }));
  return abschnitt('ende', 'Ende überschritten', zeilen, ZIEL.baustellen('ende-ueberschritten'));
}

// ─────────────────────────────────────────────────────────── Personen ──

/** So lange vor dem Ende der Lehrzeit erinnert die Startseite der Leitung. */
export const LEHRZEIT_VORLAUF_TAGE = 30;

export interface LehrzeitEndeZeile {
  uid: string;
  name: string;
  /** Der letzte Tag der Lehrzeit (ISO). */
  ende: string;
}

/**
 * LEHRLINGE, DEREN LEHRZEIT ENDET ODER SCHON GEENDET HAT — solange sie noch
 * als Lehrling eingestuft sind.
 *
 * Die App stuft nicht selbst um: ob die Lehrabschlussprüfung bestanden ist
 * und was danach gilt (Facharbeiter, Helfer, Austritt), weiß nur der Betrieb.
 * Bis jemand die Einstufung ändert, zählt die Person im letzten Lehrjahr —
 * mit dessen Satz. Darum erinnert die Leitung ab 30 Tage vorher, und die
 * Zeile bleibt, bis die Einstufung geändert ist.
 */
export function lehrzeitEnden(personen: AppUser[], heute: string): LehrzeitEndeZeile[] {
  return personen
    .filter((p) => p.active !== false && p.einstufung === 'lehrling' && p.lehrbeginn && p.lehrzeitMonate)
    .map((p) => ({ uid: p.uid, name: p.name, ende: lehrzeitEnde(p.lehrbeginn!, p.lehrzeitMonate!) }))
    .filter((z) => tageZwischen(heute, z.ende) <= LEHRZEIT_VORLAUF_TAGE)
    .sort((a, b) => a.ende.localeCompare(b.ende));
}

/**
 * NUR EIN LEITUNGSKONTO, UND DAS OHNE E-MAIL — der Betrieb kann sich dann
 * selbst nicht mehr helfen, wenn dessen Passwort vergessen ist: „Passwort
 * vergessen“ braucht eine Adresse, und ein Startpasswort setzt nur eine
 * zweite Leitung. Dann bleibt nur der Notzugang über den Senklot-Support.
 *
 * Leitung heißt hier wie auf der Plattform: Administrator oder
 * Geschäftsführung, aktiv. Zwei Leitungskonten ohne E-Mail helfen einander
 * und lösen die Zeile nicht aus.
 */
export function einzigeLeitungOhneMail(personen: AppUser[]): boolean {
  const leitung = personen.filter(
    (p) => p.active !== false && (p.role === 'Administrator' || p.role === 'Geschäftsführung'),
  );
  return leitung.length === 1 && istBenutzerkonto(leitung[0].email);
}
