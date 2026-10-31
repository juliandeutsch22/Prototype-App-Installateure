import type { Zeile, Abschnitt } from './abschnitte';
import { abschnitt, mitInhalt } from './abschnitte';
import type { Kennzahl } from './Kennzahlen';
import type { StartDaten, StartRolle } from './laden';
import {
  abholbereitAlt,
  abholbereitEigen,
  bestelltUeberfaellig,
  budgetNahe,
  BUDGET_AB_PROZENT,
  eilanforderungen,
  endeUeberschritten,
  istAbholbereitAlt,
  istLieferungUeberfaellig,
  lieferungenHeute,
  lueckenMonat,
  mahnungenFaellig,
  offeneAnforderungen,
  ohneEinsatz,
  ohneProjektleitung,
  scheineZeile,
  stundenZeile,
  scheinOhneZeit,
  stundenOhneBuchung,
  basiszinsFehlt,
  rechnungGesperrt,
  tageOhneBuchung,
  tageZwischen,
  tagKurz,
  ueberfaelligNichtMahnbar,
  ruecklassWirdFaellig,
  ruecklaesseBald,
  garantieEndet,
  garantienBald,
  unbesetzteEinsaetze,
  unterMindestmenge,
  urlaubsantraege,
  freistellungsantraege,
  wartungenOhneBaustelle,
  zahlungenHeute,
  jugendschutzEigen,
} from './regeln';
import { anzahl, themenAbschnitte, type Thema } from './themen';
import { ZIEL } from './ziele';
import { AUFFAELLIG_AB_TAGEN } from '@/features/worksheets/unverrechnet';
import { istUeberfaellig, mahnbar, offenerRest, offenerRuecklass, ruecklassFaelligAm } from '@/features/invoices/zahlstand';
import { beurteile } from '@/features/maintenance/wartungsplan';
import { euro } from '@/lib/betrag';
import { fmtMin, getISOWeek, tageWort, tageWortDativ } from '@/lib/time';
import { baustellenTitel } from '@/lib/baustellenTitel';

/**
 * AUS DEN DATEN WIRD DIE SEITE — je Rolle Handlungsbedarf, Heute und
 * Kennzahlen (Skizzen 01–06). Ohne Oberfläche, damit sich prüfen lässt, was
 * bei wem steht.
 */

export interface Umfeld {
  rolle: StartRolle;
  heute: string;
  jetzt: number;
  /** Ob die Rolle eine Zielseite sehen darf — Rolle UND eingeschaltetes Modul. */
  darf: (ziel: string) => boolean;
  /** Entscheidet diese Person über Urlaub? */
  urlaubEntscheiden: boolean;
  /** Bestätigt diese Person Sonderurlaub (Büro, Spitze)? Seit A15 auch ohne das Modul Urlaub. */
  freistellungBestaetigen?: boolean;
  /** Wohin die Anträge auf Sonderurlaub führen — ohne das Modul Urlaub auf die eigene Seite (A15). */
  sonderurlaubZiel?: string;
  /** Die eigene Kennung — damit die eigene Person nicht in zwei Abschnitten steht. */
  ich?: string;
}

export type HeuteArt =
  | { art: 'liste'; zusatz: string; zeilen: Zeile[]; verweis: { to: string; text: string } }
  | { art: 'leitung' }
  | null;

export interface Startseite {
  abschnitte: Abschnitt[];
  zaehlwort?: string;
  kennzahlen: Kennzahl[];
  heute: HeuteArt;
}

const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Nur, was die Rolle sehen darf — eine Zeile auf eine gesperrte Seite wäre eine Sackgasse. */
/**
 * WEN EINE SAMMELZEILE BETRIFFT (Testbericht Runde 6, G10): „2 Baustellen
 * über dem Endtermin · Max Musterkunde“ nannte nur die erste — die Zeile las
 * sich, als beträfe sie nur einen Kunden. Jetzt stehen bis zu zwei Namen da,
 * darüber hinaus „und N weitere“; derselbe Name zweimal steht einmal (zwei
 * Baustellen eines Kunden). Die ganze Liste zeigt die Fachseite.
 */
export function aufzaehlen(namen: string[]): string {
  const eindeutig = [...new Set(namen.map((n) => n.trim()).filter(Boolean))];
  if (eindeutig.length <= 2) return eindeutig.join(', ');
  return `${eindeutig.slice(0, 2).join(', ')} und ${eindeutig.length - 2} weitere`;
}

function erlaubt(a: Abschnitt | null, u: Umfeld): Abschnitt | null {
  if (!a) return null;
  const ziel = a.zeilen[0]?.to ?? (a.weiter && 'to' in a.weiter ? a.weiter.to : undefined);
  return !ziel || u.darf(ziel) ? a : null;
}

export function startseite(d: StartDaten, u: Umfeld): Startseite {
  switch (u.rolle) {
    case 'monteur':
      return monteur(d, u);
    case 'verwaltung':
      return verwaltung(d, u);
    case 'buchhaltung':
      return buchhaltung(d, u);
    case 'projektleitung':
      return projektleitung(d, u);
    default:
      return leitung(d, u);
  }
}

// ─────────────────────────────────────────────────────────────── Monteur ──

function monteur(d: StartDaten, u: Umfeld): Startseite {
  const abschnitte = mitInhalt([
    erlaubt(tageOhneBuchung(d.fehlendeTage ?? [], d.planNachTag), u),
    erlaubt(scheinOhneZeit(d.nachtraege ?? []), u),
    erlaubt(abholbereitEigen(d.eigeneOrders ?? []), u),
    // Zuletzt und leise: ein Hinweis für Jugendliche, keine Aufgabe (Runde 3, M2).
    erlaubt(jugendschutzEigen(d.eigeneGrenzfaelle ?? []), u),
  ]);
  const kennzahlen: Kennzahl[] = [];
  if (d.saldo?.hasConfig) {
    kennzahlen.push({
      key: 'saldo',
      label: 'Saldo',
      wert: `${d.saldo.saldoH > 0 ? '+' : ''}${fmtMin(Math.round(d.saldo.saldoH * 60))} Std`,
      zusatz: d.saldo.daysWithoutEntry > 0 ? `${tageWort(d.saldo.daysWithoutEntry)} ohne Buchung` : 'seit Eintritt',
      to: ZIEL.zeit,
    });
  }
  if (d.resturlaub && u.darf('/vacations')) {
    kennzahlen.push({
      key: 'urlaub',
      label: 'Resturlaub',
      wert: tageWort(d.resturlaub.rest),
      zusatz: `von ${tageWortDativ(d.resturlaub.anspruch)}`,
      to: '/vacations',
    });
  }
  return { abschnitte, kennzahlen, heute: null };
}

/** Die eigenen Tage ohne Buchung, für Rollen, die ein Zeitkonto führen, aber nicht draußen sind. */
/*
  DIE GRENZEN FÜR JUGENDLICHE AUF JEDER STARTSEITE (A8, 24.10.2026). Bisher
  nur beim Monteur — ein Lehrling im Büro (Verwaltung, Buchhaltung) sah
  seine Überschreitungen nicht. Ob jemand jugendlich ist, sagt das
  Geburtsdatum; ohne Fälle steht nichts da. Zuletzt und leise, wie beim
  Monteur: zu tun hat die Person nichts.
*/
function eigenerJugendschutz(d: StartDaten, u: Umfeld): Abschnitt | null {
  return erlaubt(jugendschutzEigen(d.eigeneGrenzfaelle ?? []), u);
}

function eigeneTage(d: StartDaten, u: Umfeld): Abschnitt | null {
  const a = tageOhneBuchung(d.fehlendeTage ?? [], d.planNachTag);
  return a ? erlaubt({ ...a, titel: 'Deine Tage ohne Buchung' }, u) : null;
}

// ──────────────────────────────────────────────────────────── Verwaltung ──

function verwaltung(d: StartDaten, u: Umfeld): Startseite {
  const orders = d.orders ?? [];
  const abschnitte = mitInhalt([
    eigeneTage(d, u),
    erlaubt(offeneAnforderungen(orders, u.heute), u),
    erlaubt(bestelltUeberfaellig(orders, u.heute), u),
    erlaubt(abholbereitAlt(orders, u.jetzt), u),
    erlaubt(unterMindestmenge(d.knapp ?? []), u),
    eigenerJugendschutz(d, u),
  ]);
  const lieferungen = u.darf(ZIEL.anforderungen('lieferung-heute'))
    ? lieferungenHeute(orders, d.lagerPosten ?? [], u.heute)
    : [];
  return {
    abschnitte,
    kennzahlen: lagerKennzahlen(d, u),
    heute: lieferungen.length
      ? {
        art: 'liste',
        zusatz: anzahl(lieferungen.length, 'Lieferung', 'Lieferungen'),
        zeilen: lieferungen,
        verweis: { to: ZIEL.anforderungen('lieferung-heute'), text: 'Anforderungen' },
      }
      : null,
  };
}

function lagerKennzahlen(d: StartDaten, u: Umfeld): Kennzahl[] {
  const out: Kennzahl[] = [];
  if (d.orders && u.darf(ZIEL.anforderungen('offen'))) {
    const offen = d.orders.filter((o) => o.transactionType !== 'return' && o.status === 'Offen');
    const eil = offen.filter((o) => o.isUrgent).length;
    out.push({
      key: 'anf',
      // Kurz, damit es am Telefon in die halbe Breite passt.
      label: 'Anforderungen',
      wert: offen.length,
      zusatz: eil ? `offen, davon ${eil} Eil` : 'offen',
      to: ZIEL.anforderungen('offen'),
      leer: offen.length === 0,
    });
  }
  if (d.knapp && u.darf(ZIEL.lagerKnapp)) {
    out.push({
      key: 'knapp',
      label: 'Knappe Artikel',
      wert: d.knapp.length,
      zusatz: 'unter Mindestmenge',
      to: ZIEL.lagerKnapp,
      leer: d.knapp.length === 0,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────── Buchhaltung ──

/**
 * „Nicht verrechnet“ bei der Buchhaltung: ein Abschnitt mit höchstens zwei
 * Sammelzeilen, Scheine und Regiestunden (E22). Jede Zeile nur, wenn ihr
 * Ziel erlaubt ist — die Scheinliste und die Rechnungen sind verschiedene
 * Rechte.
 */
function nichtVerrechnet(d: StartDaten, u: Umfeld): Abschnitt | null {
  const zeilen = [
    d.unverrechnet ? scheineZeile(d.unverrechnet, AUFFAELLIG_AB_TAGEN) : null,
    d.offeneStunden ? stundenZeile(d.offeneStunden, AUFFAELLIG_AB_TAGEN) : null,
  ].filter((z): z is Zeile => !!z && (!z.to || u.darf(z.to)));
  return abschnitt('verrechnen', 'Nicht verrechnet', zeilen, ZIEL.scheine('nicht-verrechnet'));
}

function buchhaltung(d: StartDaten, u: Umfeld): Startseite {
  const abschnitte = mitInhalt([
    // Zuerst: solange die Firmendaten jede Rechnung sperren, geht hier nichts.
    erlaubt(rechnungGesperrt(d.firmaSperrt), u),
    eigeneTage(d, u),
    d.lauf ? erlaubt(mahnungenFaellig(d.lauf), u) : null,
    d.lauf && d.unbezahlt ? erlaubt(ueberfaelligNichtMahnbar(d.unbezahlt, d.lauf, u.heute), u) : null,
    d.unbezahlt ? erlaubt(ruecklassWirdFaellig(d.unbezahlt, u.heute), u) : null,
    d.garantien ? erlaubt(garantieEndet(d.garantien, u.heute), u) : null,
    nichtVerrechnet(d, u),
    /*
      DIE EIGENE PERSON NUR EINMAL (Analyse 03.10.2026, Paket 1): ihre Tage
      stehen schon oben unter „Deine Tage ohne Buchung“. Bei der Leitung
      genauso (Thema „ohne eigene Buchung“, siehe `leitung`).
    */
    erlaubt(stundenOhneBuchung((d.team ?? []).filter((t) => t.uid !== u.ich)), u),
    erlaubt(basiszinsFehlt(d.basiszinsFehltAb), u),
    u.urlaubEntscheiden ? erlaubt(urlaubsantraege(d.antraege ?? []), u) : null,
    // Unbezahlten Urlaub entscheidet die Buchhaltung nicht — er steht hier nicht.
    u.freistellungBestaetigen ? erlaubt(freistellungsantraege(d.freistellungen ?? [], false, u.sonderurlaubZiel), u) : null,
    eigenerJugendschutz(d, u),
  ]);
  const zahlungen = zahlungenHeute(d.zahlungenHeute ?? []);
  return {
    abschnitte,
    kennzahlen: geldKennzahlen(d, u, true),
    heute: zahlungen.length && u.darf(ZIEL.rechnungen)
      ? {
        art: 'liste',
        zusatz: anzahl(zahlungen.length, 'Zahlungseingang', 'Zahlungseingänge'),
        zeilen: zahlungen,
        verweis: { to: ZIEL.rechnungenSicht('bezahlt-heute'), text: 'Rechnungen' },
      }
      : null,
  };
}

/** Offen, Überfällig, Nicht verrechnet — und für die Buchhaltung „Bezahlt im Monat“. */
function geldKennzahlen(d: StartDaten, u: Umfeld, mitBezahlt: boolean): Kennzahl[] {
  const out: Kennzahl[] = [];
  if (d.unbezahlt && u.darf(ZIEL.rechnungen)) {
    const ueber = d.unbezahlt.filter((i) => istUeberfaellig(i, u.heute));
    const offen = d.unbezahlt.filter((i) => !istUeberfaellig(i, u.heute));
    const summe = (l: typeof ueber) => l.reduce((s, i) => s + offenerRest(i), 0);
    // Überfällig ist nur, was zu mahnen ist; ein noch nicht fälliger Rücklass
    // bleibt offen — dieselbe Rechnung zählt dann in beiden Kacheln.
    const faellig = ueber.reduce((s, i) => s + mahnbar(i, u.heute).rest, 0);
    const mitRuecklass = ueber.filter((i) => offenerRest(i) - mahnbar(i, u.heute).rest > 0.005).length;
    out.push({
      key: 'offen',
      label: 'Offen',
      wert: euro(summe(offen) + summe(ueber) - faellig),
      zusatz: anzahl(offen.length + mitRuecklass, 'Rechnung', 'Rechnungen'),
      to: ZIEL.rechnungen,
      leer: offen.length + mitRuecklass === 0,
    });
    out.push({
      key: 'ueberfaellig',
      label: 'Überfällig',
      wert: euro(faellig),
      zusatz: ueber.length ? anzahl(ueber.length, 'Rechnung', 'Rechnungen') : 'keine Rechnung',
      to: ZIEL.rechnungenUeberfaellig,
      ton: ueber.length ? 'danger' : undefined,
      leer: ueber.length === 0,
    });
  }
  if (mitBezahlt && d.bezahltImMonat && u.darf(ZIEL.rechnungen)) {
    out.push({
      key: 'bezahlt',
      label: `Bezahlt im ${MONATE[Number(u.heute.slice(5, 7)) - 1]}`,
      wert: euro(d.bezahltImMonat.summe),
      zusatz: anzahl(d.bezahltImMonat.anzahl, 'Rechnung', 'Rechnungen'),
      to: ZIEL.rechnungenSicht('bezahlt-monat'),
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────── Projektleitung ──

function titelVon(d: StartDaten) {
  const nach = new Map((d.projekte ?? []).map((p) => [p.projectNumber, baustellenTitel(p)]));
  return (nr: string) => nach.get(nr) ?? `Baustelle ${nr}`;
}

function projektleitung(d: StartDaten, u: Umfeld): Startseite {
  const abschnitte = mitInhalt([
    eigeneTage(d, u),
    erlaubt(unbesetzteEinsaetze(u.heute, d.heuteBetrieb ?? []), u),
    erlaubt(budgetNahe(d.budget ?? []), u),
    erlaubt(ohneEinsatz(d.ohneEinsatz ?? [], titelVon(d)), u),
    erlaubt(wartungenOhneBaustelle(d.wartungen ?? [], u.heute), u),
    erlaubt(eilanforderungen(d.orders ?? []), u),
    erlaubt(endeUeberschritten(d.projekte ?? [], u.heute), u),
    erlaubt(ohneProjektleitung(d.projekte ?? []), u),
    eigenerJugendschutz(d, u),
  ]);
  return { abschnitte, kennzahlen: baustellenKennzahlen(d, u, true), heute: leitungHeute(d, u) };
}

function leitungHeute(d: StartDaten, u: Umfeld): HeuteArt {
  if (!u.darf(ZIEL.tag(u.heute))) return null;
  const da = (d.heuteBetrieb ?? []).some((b) => !b.unbesetzt);
  return da || (d.abwesendHeute ?? []).length ? { art: 'leitung' } : null;
}

function baustellenKennzahlen(d: StartDaten, u: Umfeld, mitAuslastung: boolean): Kennzahl[] {
  const out: Kennzahl[] = [];
  if (d.projekte && u.darf(ZIEL.baustellen('aktiv'))) {
    const aktiv = d.projekte.filter((p) => p.status === 'Aktiv').length;
    const amLimit = (d.budget ?? []).filter((b) => b.pct >= BUDGET_AB_PROZENT).length;
    out.push({
      key: 'baustellen',
      label: 'Aktive Baustellen',
      wert: aktiv,
      // Ohne Budgetstand kein Satz dazu: „alle im Budget“ wäre eine Entwarnung ohne Grundlage (Runde 5, M1).
      zusatz: !d.budget ? undefined : amLimit ? `${amLimit} am Budgetlimit` : 'alle im Budget',
      to: ZIEL.baustellen('aktiv'),
    });
  }
  if (mitAuslastung && d.auslastung != null && u.darf(ZIEL.woche)) {
    out.push({
      key: 'auslastung',
      label: `Auslastung KW ${getISOWeek(new Date(`${u.heute}T12:00:00`)).week}`,
      wert: `${d.auslastung} %`,
      zusatz: 'der Personentage verplant',
      to: ZIEL.woche,
    });
  }
  return out;
}

// ─────────────────────────────────────── Geschäftsführung, Administrator ──

function leitung(d: StartDaten, u: Umfeld): Startseite {
  const h = u.heute;
  const themen: (Thema | null | false)[] = [];
  const orders = d.orders ?? [];
  const lagerHier = !d.hatVerwaltung;
  const wenn = (ziel: string, t: Omit<Thema, 'to'>): Thema | null => (u.darf(ziel) ? { ...t, to: ziel } : null);

  // ── Überfällig
  /*
    SPERREN DIE FIRMENDATEN JEDE RECHNUNG, steht das ganz vorn unter
    „Dringend“ und in Rot (Testbericht Runde 5, M2) — vorher stand es leise
    unter „Diese Woche“, oft hinter „und N weitere“. Fehlt nur, was warnt
    (Firmenbuch, eine IBAN überhaupt), bleibt es dort.
  */
  const firmaFehlt = d.firmaFehlt ?? [];
  const firmaSperrt = (d.firmaSperrt ?? []).length > 0;
  if (firmaFehlt.length && firmaSperrt) {
    themen.push(wenn(ZIEL.einstellungen('firma'), {
      key: 'firma', wann: 'ueberfaellig',
      titel: 'Keine Rechnung möglich: Firmendaten unvollständig',
      detail: `fehlt: ${firmaFehlt.join(', ')}`,
      status: { text: 'ergänzen', ton: 'fehl' },
    }));
  }
  const eigene = d.fehlendeTage ?? [];
  if (eigene.length) {
    themen.push(wenn(ZIEL.zeitFehlend, {
      key: 'eigene-tage', wann: 'ueberfaellig',
      titel: `${anzahl(eigene.length, 'Tag', 'Tage')} ohne eigene Buchung`,
      detail: `ältester ${tagKurz([...eigene].sort()[0])}`,
      status: { text: 'nachtragen', ton: 'warn' },
    }));
  }
  if (d.unbezahlt) {
    const ueber = d.unbezahlt.filter((i) => istUeberfaellig(i, h));
    if (ueber.length) {
      // Ab der Fälligkeit dessen, was zu mahnen ist — bei einem Rücklass seine.
      const ab = (i: (typeof ueber)[number]) => mahnbar(i, h).faellig ?? i.dueDate;
      const aeltester = [...ueber].sort((a, b) => ab(a).localeCompare(ab(b)))[0];
      const mahnungen = d.lauf?.zeilen.length ?? 0;
      themen.push(wenn(ZIEL.rechnungenUeberfaellig, {
        key: 'rechnungen', wann: 'ueberfaellig',
        titel: `${anzahl(ueber.length, 'Rechnung', 'Rechnungen')} überfällig`,
        detail: [euro(ueber.reduce((s, i) => s + mahnbar(i, h).rest, 0)), mahnungen ? anzahl(mahnungen, 'Mahnung fällig', 'Mahnungen fällig') : '']
          .filter(Boolean).join(' · '),
        status: { text: tageWort(tageZwischen(ab(aeltester), h)), ton: 'fehl' },
      }));
    }
  }
  if (d.unbezahlt) {
    // Rücklässe, die in den nächsten 30 Tagen fällig werden (seit 05.10.2026).
    const bald = ruecklaesseBald(d.unbezahlt, h);
    if (bald.length) {
      themen.push(wenn(ZIEL.rechnungen, {
        key: 'ruecklass', wann: 'woche',
        titel: `${anzahl(bald.length, 'Rücklass wird', 'Rücklässe werden')} fällig`,
        detail: euro(bald.reduce((s, i) => s + offenerRuecklass(i), 0)),
        status: { text: `ab ${tagKurz(ruecklassFaelligAm(bald[0])!)}`, ton: 'warn' },
      }));
    }
  }
  if (d.garantien) {
    // Bankgarantien, die bald enden oder geendet haben (seit 10.10.2026).
    const g = garantienBald(d.garantien, h);
    if (g.length) {
      const vorbei = g.filter((x) => x.ruecklassGarantieBis! < h).length;
      themen.push(wenn(ZIEL.rechnungen, {
        key: 'garantie', wann: 'woche',
        titel: `${anzahl(g.length, 'Bankgarantie endet', 'Bankgarantien enden')}`,
        detail: vorbei ? `${anzahl(vorbei, 'Urkunde', 'Urkunden')} zurückfordern` : `${g[0].customerName} · ${g[0].invoiceNumber}`,
        status: { text: g[0].ruecklassGarantieBis! < h ? `seit ${tagKurz(g[0].ruecklassGarantieBis!)}` : `ab ${tagKurz(g[0].ruecklassGarantieBis!)}`, ton: 'warn' },
      }));
    }
  }
  if (d.basiszinsFehltAb) {
    // Seit Paket 2 (03.10.2026) ein Reiter für Buchhaltung und Leitung.
    themen.push(wenn(ZIEL.einstellungen('rechnung'), {
      key: 'basiszins', wann: 'ueberfaellig',
      titel: `Basiszinssatz ab ${tagKurz(d.basiszinsFehltAb)} fehlt`,
      detail: 'Einstellungen · Rechnungsvorgaben',
      status: { text: `seit ${tagKurz(d.basiszinsFehltAb)}`, ton: 'fehl' },
    }));
  }
  const wartungen = (d.wartungen ?? [])
    .filter((w) => w.aktiv && !w.offeneBaustelle)
    .map((w) => ({ w, b: beurteile(w, h) }));
  const wUeber = wartungen.filter((x) => x.b.stand === 'überfällig').sort((a, b) => a.w.faelligAm.localeCompare(b.w.faelligAm));
  if (wUeber.length) {
    themen.push(wenn(ZIEL.wartungenOhneBaustelle, {
      key: 'wartung-ueber', wann: 'ueberfaellig',
      titel: `${anzahl(wUeber.length, 'Wartung', 'Wartungen')} ohne Baustelle`,
      detail: `${wUeber[0].w.customerName}, fällig ${tagKurz(wUeber[0].w.faelligAm)}`,
      status: { text: tageWort(tageZwischen(wUeber[0].w.faelligAm, h)), ton: 'fehl' },
    }));
  }
  // Am längsten überzogen zuerst — sie nennt die Zeile vorne.
  const ende = (d.projekte ?? [])
    .filter((p) => p.status === 'Aktiv' && p.endDate && p.endDate < h)
    .sort((a, b) => a.endDate!.localeCompare(b.endDate!));
  if (ende.length) {
    themen.push(wenn(ZIEL.baustellen('ende-ueberschritten'), {
      key: 'ende', wann: 'ueberfaellig',
      titel: `${anzahl(ende.length, 'Baustelle', 'Baustellen')} über dem Endtermin`,
      detail: aufzaehlen(ende.map(baustellenTitel)),
      status: { text: 'Ende überschritten', ton: 'fehl' },
    }));
  }
  if (lagerHier) {
    const spaet = orders.filter((o) => o.transactionType !== 'return' && istLieferungUeberfaellig(o, h));
    if (spaet.length) {
      themen.push(wenn(ZIEL.anforderungen('bestellt-ueberfaellig'), {
        key: 'lieferung-spaet', wann: 'ueberfaellig',
        titel: `${anzahl(spaet.length, 'Bestellung', 'Bestellungen')} überfällig`,
        detail: `${spaet[0].materialName}, Liefertermin ${tagKurz(spaet[0].liefertermin!)}`,
        status: { text: 'nachfragen', ton: 'fehl' },
      }));
    }
  }

  // ── Heute
  const unbesetzt = (d.heuteBetrieb ?? []).filter((b) => b.unbesetzt);
  if (unbesetzt.length) {
    themen.push(wenn(ZIEL.tag(h, 'unbesetzt'), {
      key: 'unbesetzt', wann: 'heute',
      titel: `${anzahl(unbesetzt.length, 'Einsatz', 'Einsätze')} unbesetzt`,
      detail: `${unbesetzt[0].customerName} · ${unbesetzt[0].fehlen.map((f) => (f.grund ? `${f.name} ${f.grund.toLowerCase()}` : f.name)).join(', ')}`,
      status: { text: 'heute', ton: 'warn' },
    }));
  }
  const eil = orders.filter((o) => o.transactionType !== 'return' && o.isUrgent && (o.status === 'Offen' || o.status === 'In Bearbeitung'));
  if (eil.length) {
    themen.push(wenn(ZIEL.anforderungen('eil'), {
      key: 'eil', wann: 'heute',
      titel: `${anzahl(eil.length, 'Eilanforderung', 'Eilanforderungen')} offen`,
      detail: [eil[0].projectNumber, eil[0].userName].filter(Boolean).join(' · '),
      status: { text: 'heute', ton: 'warn' },
    }));
  }
  const antraege = u.urlaubEntscheiden ? (d.antraege ?? []).filter((v) => v.status === 'Beantragt') : [];
  if (antraege.length) {
    const erster = [...antraege].sort((a, b) => a.von.localeCompare(b.von))[0];
    themen.push(wenn(ZIEL.urlaubsantraege, {
      key: 'urlaub', wann: 'heute',
      titel: anzahl(antraege.length, 'Urlaubsantrag', 'Urlaubsanträge'),
      detail: `frühester: ${erster.userName}, ${tagKurz(erster.von)}`,
      status: { text: 'entscheiden', ton: 'warn' },
    }));
  }
  const frei = u.freistellungBestaetigen ? (d.freistellungen ?? []).filter((f) => f.status === 'Beantragt') : [];
  if (frei.length) {
    const erster = [...frei].sort((a, b) => a.von.localeCompare(b.von))[0];
    themen.push(wenn(u.sonderurlaubZiel ?? ZIEL.urlaubsantraege, {
      key: 'sonderurlaub', wann: 'heute',
      titel: anzahl(frei.length, 'Antrag auf Sonderurlaub', 'Anträge auf Sonderurlaub'),
      detail: `frühester: ${erster.userName}, ${tagKurz(erster.von)}`,
      status: { text: 'bestätigen', ton: 'warn' },
    }));
  }
  if (lagerHier) {
    const lief = lieferungenHeute(orders, d.lagerPosten ?? [], h);
    if (lief.length) {
      themen.push(wenn(ZIEL.anforderungen('lieferung-heute'), {
        key: 'lieferung-heute', wann: 'heute',
        titel: `${anzahl(lief.length, 'Lieferung', 'Lieferungen')} erwartet`,
        detail: lief[0].titel,
        status: { text: 'heute', ton: 'info' },
      }));
    }
  }

  // ── Diese Woche
  const budget = (d.budget ?? []).filter((b) => b.pct >= BUDGET_AB_PROZENT);
  if (budget.length) {
    const ueber = budget.filter((b) => b.pct > 100).length;
    themen.push(wenn(ZIEL.baustellen('budget'), {
      key: 'budget', wann: 'woche',
      titel: `${anzahl(budget.length, 'Baustelle', 'Baustellen')} am Budgetlimit`,
      detail: [ueber ? `${ueber} über Budget` : '', budget.length - ueber ? `${budget.length - ueber} ab 90 %` : ''].filter(Boolean).join(', '),
      status: { text: 'prüfen', ton: 'warn' },
    }));
  }
  /*
    NICHT VERRECHNET (E22): alle Scheine und alle Regiestunden, je als ein
    Thema — mit Achtung-Punkt, sobald etwas über vier Wochen alt ist, sonst
    ruhig. Die Zahl stand bis dahin zusätzlich im Stand; sie ist Arbeit.
  */
  for (const z of [
    d.unverrechnet ? scheineZeile(d.unverrechnet, AUFFAELLIG_AB_TAGEN) : null,
    d.offeneStunden ? stundenZeile(d.offeneStunden, AUFFAELLIG_AB_TAGEN) : null,
  ]) {
    if (z?.to) themen.push(wenn(z.to, { key: z.key, wann: 'woche', titel: z.titel, detail: z.detail, status: z.status }));
  }
  if ((d.ohneEinsatz ?? []).length) {
    themen.push(wenn(ZIEL.baustellen('ohne-einsatz'), {
      key: 'ohne-einsatz', wann: 'woche',
      titel: `${anzahl(d.ohneEinsatz!.length, 'Baustelle', 'Baustellen')} ohne Einsatz`,
      detail: 'in den nächsten 14 Tagen',
      status: { text: 'einplanen', ton: 'warn' },
    }));
  }
  // Die eigenen Tage stehen schon im Thema „ohne eigene Buchung“ (Paket 1).
  const luecken = (d.team ?? []).filter((t) => t.fehlendeTage > 0 && t.uid !== u.ich);
  if (luecken.length) {
    themen.push(wenn(ZIEL.luecken(lueckenMonat(luecken)), {
      key: 'luecken', wann: 'woche',
      titel: `${anzahl(luecken.length, 'Person', 'Personen')} mit Tagen ohne Buchung`,
      detail: [...luecken].sort((a, b) => b.fehlendeTage - a.fehlendeTage).slice(0, 2).map((t) => `${t.name} (${t.fehlendeTage})`).join(', '),
      status: { text: 'nachfragen', ton: 'warn' },
    }));
  }
  const wBald = wartungen.filter((x) => x.b.stand === 'fällig');
  if (wBald.length) {
    themen.push(wenn(ZIEL.wartungenOhneBaustelle, {
      key: 'wartung-bald', wann: 'woche',
      titel: `${anzahl(wBald.length, 'Wartung', 'Wartungen')} demnächst fällig`,
      detail: 'noch ohne Baustelle',
      status: { text: 'einplanen', ton: 'leise' },
    }));
  }
  const ohneLeitung = (d.projekte ?? []).filter((p) => p.status === 'Aktiv' && !(p.projectManagers?.length));
  if (ohneLeitung.length) {
    themen.push(wenn(ZIEL.baustellen('ohne-leitung'), {
      key: 'ohne-leitung', wann: 'woche',
      titel: `${anzahl(ohneLeitung.length, 'Baustelle', 'Baustellen')} ohne Projektleiter`,
      detail: baustellenTitel(ohneLeitung[0]),
      status: { text: 'zuteilen', ton: 'leise' },
    }));
  }
  if (lagerHier) {
    const offen = orders.filter((o) => o.transactionType !== 'return' && o.status === 'Offen');
    if (offen.length) {
      themen.push(wenn(ZIEL.anforderungen('offen'), {
        key: 'anf-offen', wann: 'woche',
        titel: `${anzahl(offen.length, 'Anforderung', 'Anforderungen')} offen`,
        detail: 'Lager',
        status: { text: 'bearbeiten', ton: 'leise' },
      }));
    }
    const alt = orders.filter((o) => o.transactionType !== 'return' && istAbholbereitAlt(o, u.jetzt));
    if (alt.length) {
      themen.push(wenn(ZIEL.anforderungen('abholbereit-alt'), {
        key: 'abholbereit', wann: 'woche',
        titel: `${anzahl(alt.length, 'Anforderung', 'Anforderungen')} seit über 3 Tagen abholbereit`,
        detail: alt[0].userName ?? '',
        status: { text: 'erinnern', ton: 'leise' },
      }));
    }
    if ((d.knapp ?? []).length) {
      themen.push(wenn(ZIEL.lagerKnapp, {
        key: 'knapp', wann: 'woche',
        titel: `${anzahl(d.knapp!.length, 'Artikel', 'Artikel')} unter Mindestmenge`,
        detail: d.knapp![0].name,
        status: { text: 'nachbestellen', ton: 'leise' },
      }));
    }
  }
  if (d.kontenFehlen) {
    themen.push(wenn(ZIEL.einstellungen('konten'), {
      key: 'konten', wann: 'woche',
      titel: 'Kontenrahmen nicht eingerichtet',
      detail: 'Einstellungen · Konten',
      status: { text: 'einrichten', ton: 'leise' },
    }));
  }
  const lehrzeit = d.lehrzeitEnden ?? [];
  if (lehrzeit.length) {
    const erste = lehrzeit[0];
    const vorbei = erste.ende < h;
    themen.push(wenn(lehrzeit.length === 1 ? ZIEL.benutzer(erste.uid) : ZIEL.benutzerverwaltung, {
      key: 'lehrzeit', wann: vorbei ? 'ueberfaellig' : 'woche',
      titel: lehrzeit.length === 1
        ? `Lehrzeit von ${erste.name} ${vorbei ? 'endete' : 'endet'} am ${tagKurz(erste.ende)}`
        : `${anzahl(lehrzeit.length, 'Lehrzeit endet', 'Lehrzeiten enden')}`,
      detail: lehrzeit.length === 1
        ? 'Einstufung ändern, sobald die Prüfung abgelegt ist'
        : lehrzeit.map((z) => `${z.name} ${tagKurz(z.ende)}`).join(', '),
      status: { text: 'ändern', ton: vorbei ? 'warn' : 'leise' },
    }));
  }
  if (d.einzigeLeitungOhneMail) {
    themen.push(wenn(ZIEL.benutzerverwaltung, {
      key: 'leitung-mail', wann: 'woche',
      titel: 'Nur ein Leitungskonto, ohne E-Mail',
      detail: 'Passwort vergessen geht dann nur über den Support — zweites anlegen oder auf E-Mail umstellen',
      status: { text: 'anlegen', ton: 'leise' },
    }));
  }
  /*
    EINMAL GEMELDET (Runde 7, 6.1): beim Update wurde der abgewählte Haken
    „Im Firmenbuch eingetragen“ bei einer GmbH, AG, KG … zurückgesetzt. Die
    Zeile bleibt, bis die Geschäftsführung es in den Firmendaten zur
    Kenntnis nimmt.
  */
  if (d.firmenbuchKorrigiertAm) {
    themen.push(wenn(ZIEL.einstellungen('firma'), {
      key: 'firmenbuch-haken', wann: 'woche',
      titel: '„Im Firmenbuch eingetragen“ wieder gesetzt',
      detail: 'war abgewählt — bei dieser Rechtsform ist der Betrieb immer eingetragen',
      status: { text: 'ansehen', ton: 'leise' },
    }));
  }
  if (firmaFehlt.length && !firmaSperrt) {
    themen.push(wenn(ZIEL.einstellungen('firma'), {
      key: 'firma', wann: 'woche',
      titel: 'Firmendaten für Rechnungen unvollständig',
      detail: `fehlt: ${firmaFehlt.join(', ')}`,
      status: { text: 'ergänzen', ton: 'leise' },
    }));
  }

  // Auch die Leitung kann unter 18 sein (etwa ein Administrator in der Lehre) — ein leises Thema.
  const jugend = (d.eigeneGrenzfaelle ?? []).filter((f) => f.jugendlich);
  if (jugend.length) {
    themen.push(wenn(ZIEL.zeit, {
      key: 'jugendschutz', wann: 'woche',
      titel: `${anzahl(jugend.length, 'Überschreitung', 'Überschreitungen')} der Grenzen für Jugendliche`,
      detail: 'eigene Zeiten, laufender und letzter Monat',
      status: { text: 'über der Grenze', ton: 'leise' },
    }));
  }

  const abschnitte = themenAbschnitte(themen);
  const kennzahlen = [...geldKennzahlen(d, u, false), ...baustellenKennzahlen(d, u, false)];
  return { abschnitte, zaehlwort: abschnitte.reduce((s, a) => s + a.anzahl, 0) === 1 ? 'Thema' : 'Themen', kennzahlen, heute: leitungHeute(d, u) };
}
