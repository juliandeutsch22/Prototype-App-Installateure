import { cent } from '@/lib/betrag';
import { leseZahl } from '@/lib/zahl';
import { liesCsv } from '@/features/customers/kundenCsv';
import { IBAN_LAENGEN, ibanFehler } from '@shared/iban';

/**
 * DEN KONTOAUSZUG DER BANK LESEN (Durchsicht 15.11.2026, F13).
 *
 * Gelesen wird NUR IM BROWSER. Ein Kontoauszug enthält alles, was über das
 * Konto des Betriebs läuft — Löhne, Miete, private Entnahmen. Für den
 * Abgleich braucht es davon nur die Eingänge, und auch die nur, bis sie
 * verbucht sind. Deshalb geht die Datei nirgends hin: gespeichert wird je
 * verbuchter Bewegung eine Prüfsumme (gegen das doppelte Verbuchen) und der
 * Zahlungseingang selbst.
 *
 * DREI FAMILIEN VON FORMATEN, ERKANNT AM INHALT, nicht an der Endung — die
 * Banken nennen ihre Dateien `.xml`, `.csv`, `.txt`, `.sta` oder gar nicht:
 *   - ISO 20022 „camt“ (053 Tagesauszug, 052 untertags, 054 Gutschriftsanzeige)
 *     in jeder Fassung (001.02 bis 001.13) — gelesen über die Namen der
 *     Elemente, nicht über den Namensraum;
 *   - MT940 (SWIFT), wie es ELBA, George und Business-Banking noch anbieten;
 *   - CSV mit oder ohne Kopfzeile. Mit Kopfzeile ordnen die Spaltennamen zu
 *     (George, Bank Austria, Volksbank, N26 …), ohne Kopfzeile der Inhalt der
 *     Spalten (ELBA/Raiffeisen, BAWAG/easybank): Datum, Betrag, Währung, Text.
 *
 * Übernommen werden gebuchte Eingänge in Euro. Abbuchungen, vorgemerkte
 * Bewegungen, Rückbuchungen und fremde Währungen werden gezählt und genannt —
 * nicht still übergangen.
 */

export interface BankBuchung {
  /** Stelle in der Datei (1 = erste Bewegung) — für Anzeige und Gegenprobe. */
  stelle: number;
  /** Buchungstag `JJJJ-MM-TT`. */
  buchungstag: string;
  valuta?: string;
  /** Eingang in Euro, immer größer null. */
  betrag: number;
  /** Auftraggeber, wenn die Datei ihn eigens nennt. */
  name?: string;
  /** IBAN des Auftraggebers, ohne Leerzeichen. */
  iban?: string;
  /** Verwendungszweck und Zahlungsreferenz, zu einer Zeile gefügt. */
  zweck: string;
}

export type AuszugFormat = 'camt.053' | 'camt.052' | 'camt.054' | 'mt940' | 'csv';

export interface Kontoauszug {
  format: AuszugFormat;
  /** Was über die Form gesagt werden kann — bei CSV die erkannten Spalten. */
  beschreibung: string;
  /** Die eigene IBAN, wenn die Datei sie trägt. */
  konto?: string;
  von?: string;
  bis?: string;
  eingaenge: BankBuchung[];
  /** Was bewusst nicht abgeglichen wird, mit Anzahl. */
  nichtBetrachtet: { abbuchungen: number; vorgemerkt: number; rueckbuchungen: number; fremdwaehrung: number };
  /** Zeilen, die sich nicht lesen ließen — mit Grund, damit niemand glaubt, sie seien mitgekommen. */
  unlesbar: { stelle: number; grund: string }[];
}

/** Die Datei ist kein Kontoauszug, den Senklot liest — mit einem Satz, was zu tun ist. */
export class AuszugUnlesbar extends Error {}

const ALLE_FORMATE = 'Senklot liest Kontoauszüge als camt.053 (XML), MT940 oder CSV — im Online-Banking unter „Export“ oder „Umsätze herunterladen“.';

/** Ein Auszug aus dem dekodierten Text der Datei. */
export function kontoauszugLesen(roh: string): Kontoauszug {
  const text = roh.replace(/^\uFEFF/, '');
  const kopf = text.trimStart().slice(0, 400);
  if (kopf.startsWith('<')) return camtLesen(text);
  if (/(^|\n)\s*:20:/.test(text.slice(0, 2000)) && /(^|\n):61:/.test(text)) return mt940Lesen(text);
  if (/^%PDF/.test(kopf)) throw new AuszugUnlesbar(`Das ist ein PDF. ${ALLE_FORMATE}`);
  return csvLesen(text);
}

// ---------------------------------------------------------------------------
// Gemeinsames
// ---------------------------------------------------------------------------

const leer = { abbuchungen: 0, vorgemerkt: 0, rueckbuchungen: 0, fremdwaehrung: 0 };

/** Leerzeichen zusammenfassen, Ränder weg. */
function eineZeile(s: string | undefined | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** IBAN ohne Leerzeichen und groß — oder `undefined`, wenn es keine ist. */
export function ibanSauber(s: string | undefined | null): string | undefined {
  const t = (s ?? '').replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(t) ? t : undefined;
}

/**
 * Ein Betrag, wie Banken ihn schreiben: „1.234,56“, „+1.234,56“, „-12,00“,
 * „1234.56“, „1 234,56 EUR“. Gibt `null` zurück, wenn es keiner ist.
 *
 * DAS LETZTE TRENNZEICHEN ENTSCHEIDET, wenn beide vorkommen (wie überall in
 * der App, `leseZahl`). Banken schreiben Cent immer aus; ein „1.234“ ohne
 * Cent ist mehrdeutig (1.234 € oder 1,234 €?) und wird nicht geraten — die
 * Zeile steht dann unter „ließ sich nicht lesen“.
 */
export function betragLesen(roh: string | undefined): number | null {
  let s = (roh ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(/EUR|€/gi, '');
  if (!s) return null;
  // Manche Banken setzen das Vorzeichen ans Ende („12,00-“).
  if (/^[^-].*-$/.test(s)) s = `-${s.slice(0, -1)}`;
  if (!/^[+-]?[\d.,']+$/.test(s) || !/\d/.test(s)) return null;
  // Gelesen wie jede Zahl der App (`lib/zahl.ts`): Tausenderpunkt und Dezimalkomma, auch umgekehrt.
  const { wert } = leseZahl(s, { negativ: true });
  return wert === null || !Number.isFinite(wert) ? null : cent(wert);
}

/** „31.10.2026“, „1.3.26“, „2026-10-31“, „31/10/2026“, auch mit Uhrzeit dahinter → `JJJJ-MM-TT`. */
export function datumLesen(roh: string | undefined): string | null {
  const s = (roh ?? '').trim();
  let j: number;
  let m: number;
  let t: number;
  let treffer = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (treffer) {
    [j, m, t] = [Number(treffer[1]), Number(treffer[2]), Number(treffer[3])];
  } else {
    treffer = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})(?!\d)/.exec(s);
    if (!treffer) return null;
    t = Number(treffer[1]);
    m = Number(treffer[2]);
    j = Number(treffer[3]);
    if (j < 100) j += 2000;
  }
  if (m < 1 || m > 12 || t < 1 || t > 31) return null;
  const d = new Date(Date.UTC(j, m - 1, t));
  if (d.getUTCMonth() !== m - 1) return null;
  return `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
}

function zeitraum(eingaenge: BankBuchung[]): { von?: string; bis?: string } {
  const tage = eingaenge.map((e) => e.buchungstag).sort();
  return { von: tage[0], bis: tage[tage.length - 1] };
}

// ---------------------------------------------------------------------------
// camt.052 / camt.053 / camt.054
// ---------------------------------------------------------------------------

/** Die Kinder eines Elements mit diesem Namen (ohne Namensraum). */
function kinder(el: Element | null | undefined, name: string): Element[] {
  if (!el) return [];
  return Array.from(el.children).filter((k) => k.localName === name);
}

/** Dem Pfad folgen, jeweils das erste Kind des Namens. */
function pfad(el: Element | null | undefined, ...namen: string[]): Element | null {
  let jetzt: Element | null | undefined = el;
  for (const n of namen) {
    jetzt = kinder(jetzt, n)[0];
    if (!jetzt) return null;
  }
  return jetzt ?? null;
}

function textVon(el: Element | null | undefined, ...namen: string[]): string {
  return eineZeile(pfad(el, ...namen)?.textContent);
}

/** Alle Nachfahren des Namens, unabhängig vom Namensraum. */
function nachfahren(el: Element | Document, name: string): Element[] {
  return Array.from(el.getElementsByTagNameNS('*', name));
}

function camtLesen(text: string): Kontoauszug {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new AuszugUnlesbar(`Die XML-Datei ist beschädigt oder unvollständig. ${ALLE_FORMATE}`);
  }
  const format: AuszugFormat | null = nachfahren(doc, 'BkToCstmrStmt').length > 0
    ? 'camt.053'
    : nachfahren(doc, 'BkToCstmrAcctRpt').length > 0
      ? 'camt.052'
      : nachfahren(doc, 'BkToCstmrDbtCdtNtfctn').length > 0 ? 'camt.054' : null;
  if (!format) {
    throw new AuszugUnlesbar(`Diese XML-Datei ist kein Kontoauszug (camt.052, camt.053 oder camt.054). ${ALLE_FORMATE}`);
  }

  // Die Auszüge selbst: Stmt (053), Rpt (052), Ntfctn (054).
  const auszuege = [...nachfahren(doc, 'Stmt'), ...nachfahren(doc, 'Rpt'), ...nachfahren(doc, 'Ntfctn')];
  const konto = auszuege.map((a) => ibanSauber(textVon(a, 'Acct', 'Id', 'IBAN'))).find(Boolean);

  const nicht = { ...leer };
  const eingaenge: BankBuchung[] = [];
  const unlesbar: Kontoauszug['unlesbar'] = [];
  let stelle = 0;

  for (const ntry of nachfahren(doc, 'Ntry')) {
    stelle += 1;
    const status = textVon(ntry, 'Sts', 'Cd') || textVon(ntry, 'Sts');
    if (status && status !== 'BOOK') {
      nicht.vorgemerkt += 1;
      continue;
    }
    if (textVon(ntry, 'RvslInd') === 'true') {
      nicht.rueckbuchungen += 1;
      continue;
    }
    if (textVon(ntry, 'CdtDbtInd') !== 'CRDT') {
      nicht.abbuchungen += 1;
      continue;
    }
    const amt = pfad(ntry, 'Amt');
    const waehrung = amt?.getAttribute('Ccy') ?? 'EUR';
    if (waehrung !== 'EUR') {
      nicht.fremdwaehrung += 1;
      continue;
    }
    const buchungstag = datumLesen(textVon(ntry, 'BookgDt', 'Dt') || textVon(ntry, 'BookgDt', 'DtTm'))
      ?? datumLesen(textVon(ntry, 'ValDt', 'Dt') || textVon(ntry, 'ValDt', 'DtTm'));
    const gesamt = betragLesen(amt?.textContent ?? '');
    if (!buchungstag || gesamt === null || !(gesamt > 0)) {
      unlesbar.push({ stelle, grund: 'Buchungstag oder Betrag fehlt' });
      continue;
    }
    const valuta = datumLesen(textVon(ntry, 'ValDt', 'Dt') || textVon(ntry, 'ValDt', 'DtTm')) ?? undefined;

    /*
      SAMMELBUCHUNGEN: eine Bewegung, mehrere Zahlungen (TxDtls) — jede mit
      eigenem Betrag, Auftraggeber und Zweck. Dann ist jede ein Eingang für
      sich; ohne eigene Beträge bleibt es eine Bewegung.
    */
    const details = nachfahren(ntry, 'TxDtls');
    const betragJe = details.map((d) => betragLesen(
      (pfad(d, 'AmtDtls', 'TxAmt', 'Amt') ?? pfad(d, 'Amt'))?.textContent ?? '',
    ));
    const einzeln = details.length > 1 && betragJe.every((b) => b !== null && b > 0)
      && cent(betragJe.reduce<number>((s, b) => s + (b ?? 0), 0)) === gesamt;
    const nebentext = textVon(ntry, 'AddtlNtryInf');

    if (einzeln) {
      details.forEach((d, i) => {
        eingaenge.push({ stelle, buchungstag, valuta, betrag: betragJe[i]!, ...camtTeil(d, nebentext) });
      });
    } else {
      eingaenge.push({ stelle, buchungstag, valuta, betrag: gesamt, ...camtTeil(details[0], nebentext, details.slice(1)) });
    }
  }

  return {
    format,
    beschreibung: `ISO 20022 ${format}`,
    konto,
    ...zeitraum(eingaenge),
    eingaenge,
    nichtBetrachtet: nicht,
    unlesbar,
  };
}

/** Auftraggeber und Zweck einer Zahlung im camt. */
function camtTeil(d: Element | undefined, nebentext: string, weitere: Element[] = []): Pick<BankBuchung, 'name' | 'iban' | 'zweck'> {
  const parteien = pfad(d, 'RltdPties');
  const name = textVon(parteien, 'Dbtr', 'Nm') || textVon(parteien, 'Dbtr', 'Pty', 'Nm')
    || textVon(parteien, 'UltmtDbtr', 'Nm') || textVon(parteien, 'UltmtDbtr', 'Pty', 'Nm');
  const iban = ibanSauber(textVon(parteien, 'DbtrAcct', 'Id', 'IBAN'));
  const teile: string[] = [];
  for (const el of [d, ...weitere]) {
    if (!el) continue;
    const rmt = pfad(el, 'RmtInf');
    for (const u of kinder(rmt, 'Ustrd')) teile.push(eineZeile(u.textContent));
    for (const s of kinder(rmt, 'Strd')) {
      teile.push(textVon(s, 'CdtrRefInf', 'Ref'));
      for (const z of kinder(s, 'AddtlRmtInf')) teile.push(eineZeile(z.textContent));
    }
    const e2e = textVon(el, 'Refs', 'EndToEndId');
    if (e2e && e2e !== 'NOTPROVIDED') teile.push(e2e);
    teile.push(textVon(el, 'AddtlTxInf'));
  }
  teile.push(nebentext);
  const zweck = [...new Set(teile.filter(Boolean))].join(' ');
  return { ...(name ? { name } : {}), ...(iban ? { iban } : {}), zweck };
}

// ---------------------------------------------------------------------------
// MT940
// ---------------------------------------------------------------------------

/**
 * MT940: Satz `:61:` trägt Tag, Soll/Haben und Betrag, der folgende `:86:`
 * den Text. In Österreich ist `:86:` meist gegliedert (`?20`–`?29` Zweck,
 * `?31` Konto, `?32`/`?33` Name); sonst ist er freier Text.
 */
function mt940Lesen(text: string): Kontoauszug {
  // Felder: ein Feld beginnt am Zeilenanfang mit „:NN:“ oder „:NNx:“ und reicht bis zum nächsten.
  const felder: { tag: string; wert: string }[] = [];
  for (const zeile of text.replace(/\r\n?/g, '\n').split('\n')) {
    const t = /^:(\d{2}[A-Z]?):(.*)$/.exec(zeile);
    if (t) felder.push({ tag: t[1], wert: t[2] });
    else if (felder.length > 0 && zeile.trim() !== '-' && !/^\{|^-\}/.test(zeile.trim())) {
      felder[felder.length - 1].wert += `\n${zeile}`;
    }
  }

  const nicht = { ...leer };
  const eingaenge: BankBuchung[] = [];
  const unlesbar: Kontoauszug['unlesbar'] = [];
  let konto: string | undefined;
  let stelle = 0;
  let waehrung = 'EUR';

  for (let i = 0; i < felder.length; i++) {
    const f = felder[i];
    if (f.tag === '25') konto ??= ibanSauber(f.wert.split('/').pop());
    if (f.tag === '60F' || f.tag === '60M') waehrung = /^[CD]\d{6}([A-Z]{3})/.exec(f.wert.trim())?.[1] ?? waehrung;
    if (f.tag !== '61') continue;
    stelle += 1;
    // JJMMTT [MMTT] (R)C|(R)D [Kapitalkennung] Betrag N… Referenzen
    const m = /^(\d{2})(\d{2})(\d{2})(\d{4})?(RC|RD|C|D)([A-Z])?(\d+,\d{0,2})/.exec(f.wert.replace(/\n/g, ''));
    const naechstes = felder[i + 1]?.tag === '86' ? felder[i + 1].wert : '';
    if (!m) {
      unlesbar.push({ stelle, grund: 'Satz :61: nicht lesbar' });
      continue;
    }
    if (m[5].startsWith('R')) {
      nicht.rueckbuchungen += 1;
      continue;
    }
    if (m[5] !== 'C') {
      nicht.abbuchungen += 1;
      continue;
    }
    if (waehrung !== 'EUR') {
      nicht.fremdwaehrung += 1;
      continue;
    }
    const valuta = `20${m[1]}-${m[2]}-${m[3]}`;
    // Der Buchungstag (MMTT) fehlt manchmal; dann gilt die Valuta. Über den Jahreswechsel: Buchung im Jänner zu Valuta Dezember.
    let buchungstag = valuta;
    if (m[4]) {
      let jahr = Number(`20${m[1]}`);
      if (m[2] === '12' && m[4].startsWith('01')) jahr += 1;
      if (m[2] === '01' && m[4].startsWith('12')) jahr -= 1;
      buchungstag = `${jahr}-${m[4].slice(0, 2)}-${m[4].slice(2)}`;
    }
    const betrag = betragLesen(m[7]);
    if (!datumLesen(buchungstag) || betrag === null || !(betrag > 0)) {
      unlesbar.push({ stelle, grund: 'Buchungstag oder Betrag fehlt' });
      continue;
    }
    eingaenge.push({ stelle, buchungstag, valuta, betrag, ...mt940Text(naechstes) });
  }

  return {
    format: 'mt940',
    beschreibung: 'MT940',
    konto,
    ...zeitraum(eingaenge),
    eingaenge,
    nichtBetrachtet: nicht,
    unlesbar,
  };
}

function mt940Text(roh: string): Pick<BankBuchung, 'name' | 'iban' | 'zweck'> {
  const flach = roh.replace(/\n/g, '');
  if (!/\?\d{2}/.test(flach)) {
    return { zweck: eineZeile(roh), ...(ibanImText(roh) ? { iban: ibanImText(roh) } : {}) };
  }
  const teile = new Map<string, string>();
  for (const t of flach.matchAll(/\?(\d{2})([^?]*)/g)) teile.set(t[1], (teile.get(t[1]) ?? '') + t[2]);
  const zweck = ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '60', '61', '62', '63']
    .map((k) => teile.get(k) ?? '').join('');
  const name = eineZeile(`${teile.get('32') ?? ''}${teile.get('33') ?? ''}`);
  const iban = ibanSauber(teile.get('31'));
  return { zweck: eineZeile(zweck), ...(name ? { name } : {}), ...(iban ? { iban } : {}) };
}

/**
 * Eine IBAN im freien Text (ELBA schreibt sie in den Buchungstext): Länge je
 * Land und Prüfziffer müssen stimmen — sonst hängt sich das nächste Wort an
 * („AT61…3201 RE-2026“) oder eine Kundennummer wird zur IBAN.
 */
function ibanImText(s: string): string | undefined {
  const t = s.toUpperCase();
  // Ohne Lookbehind (ältere iPhones, `vite.config.ts`): das Zeichen davor gehört zum Treffer.
  for (const m of t.matchAll(/(?:^|[^A-Z0-9])([A-Z]{2})\d{2}/g)) {
    const laenge = IBAN_LAENGEN[m[1]];
    if (!laenge) continue;
    let iban = '';
    for (let i = m.index + m[0].length - 4; i < t.length && iban.length < laenge; i++) {
      const z = t[i];
      if (/[A-Z0-9]/.test(z)) iban += z;
      else if (z !== ' ' || t[i + 1] === ' ') break;
    }
    if (iban.length === laenge && ibanFehler(iban) === null) return iban;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

type Feld = 'buchungstag' | 'valuta' | 'betrag' | 'haben' | 'soll' | 'waehrung' | 'name' | 'iban' | 'zweck';

/** Spaltennamen ohne Umlaute, Leerzeichen und Zeichen: „Partner IBAN“ → „partneriban“. */
function schluessel(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Welche Spalte was ist — zuerst genaue Namen, dann Wortteile. Die Reihenfolge
 * zählt: „Valutadatum“ enthält „datum“ und muss vorher Valuta werden; „Partner
 * IBAN“ enthält „partner“ und muss vorher IBAN werden.
 */
const REGELN: [Feld, (k: string) => boolean][] = [
  ['valuta', (k) => k.includes('valuta') || k.includes('wertstellung') || k === 'valuedate'],
  ['iban', (k) => k.includes('iban') || k === 'gegenkonto' || k === 'kontonummerauftraggeber' || k === 'auftraggeberkonto'],
  ['buchungstag', (k) => ['buchungsdatum', 'buchungstag', 'datum', 'bookingdate', 'date', 'umsatzdatum', 'transaktionsdatum', 'buchung'].includes(k)
    || (k.includes('datum') && !k.includes('zeit'))],
  ['waehrung', (k) => k.includes('waehrung') || k === 'currency' || k === 'whrg' || k === 'wae'],
  ['haben', (k) => ['haben', 'eingang', 'gutschrift', 'habenbetrag', 'credit', 'eingaenge'].includes(k)],
  ['soll', (k) => ['soll', 'ausgang', 'lastschrift', 'belastung', 'sollbetrag', 'debit', 'ausgaenge'].includes(k)],
  ['betrag', (k) => k.includes('betrag') || k === 'amount' || k === 'umsatz' || k.startsWith('amount')],
  ['name', (k) => k.includes('name') || k.includes('auftraggeber') || k === 'partner' || k.includes('empfaenger')
    || k.includes('zahlungspflichtiger') || k.includes('absender') || k.includes('beguenstigter')],
  ['zweck', (k) => ['verwendungszweck', 'zahlungsreferenz', 'buchungstext', 'text', 'mitteilung', 'referenz', 'beschreibung',
    'buchungsinfo', 'buchungsinformation', 'buchungsinformationen', 'notiz', 'zahlungsgrund', 'transaktionstext', 'details',
    'kundenreferenz', 'buchungsdetails', 'umsatztext', 'zweck', 'infos', 'information'].includes(k)
    || k.includes('verwendungszweck') || k.includes('zahlungsreferenz') || k.includes('buchungstext')],
];

function feldVon(spalte: string): Feld | null {
  const k = schluessel(spalte);
  if (!k) return null;
  for (const [feld, passt] of REGELN) if (passt(k)) return feld;
  return null;
}

const WORT: Record<Feld, string> = {
  buchungstag: 'Buchungstag', valuta: 'Valuta', betrag: 'Betrag', haben: 'Haben', soll: 'Soll',
  waehrung: 'Währung', name: 'Auftraggeber', iban: 'IBAN', zweck: 'Zweck',
};

function csvLesen(text: string): Kontoauszug {
  const zeilen = liesCsv(text).filter((z) => z.some((f) => f.trim() !== ''));
  if (zeilen.length === 0) throw new AuszugUnlesbar(`Die Datei ist leer. ${ALLE_FORMATE}`);

  // Die Kopfzeile steht nicht immer zuoberst — manche Banken setzen Kontoangaben davor.
  const kopfIndex = zeilen.slice(0, 15).findIndex((z) => {
    const felder = z.map(feldVon);
    return felder.includes('buchungstag') && (felder.includes('betrag') || felder.includes('haben'));
  });
  return kopfIndex >= 0 ? csvMitKopf(zeilen, kopfIndex) : csvOhneKopf(zeilen);
}

function csvMitKopf(zeilen: string[][], kopfIndex: number): Kontoauszug {
  const kopf = zeilen[kopfIndex];
  const spalten = new Map<Feld, number[]>();
  kopf.forEach((name, i) => {
    const f = feldVon(name);
    if (f) spalten.set(f, [...(spalten.get(f) ?? []), i]);
  });
  const daten = zeilen.slice(kopfIndex + 1);

  /*
    EINE IBAN-SPALTE, IN DER IMMER DIESELBE STEHT, IST DAS EIGENE KONTO
    (z. B. „Kontonummer“ in manchen Exporten) — nicht der Auftraggeber.
  */
  let konto: string | undefined;
  const ibanSpalten = (spalten.get('iban') ?? []).filter((i) => {
    const werte = new Set(daten.map((z) => ibanSauber(z[i])).filter(Boolean));
    if (werte.size === 1 && daten.length > 2) {
      konto = [...werte][0];
      return false;
    }
    return true;
  });

  const wert = (z: string[], f: Feld) => (spalten.get(f) ?? []).map((i) => z[i] ?? '');
  const nicht = { ...leer };
  const eingaenge: BankBuchung[] = [];
  const unlesbar: Kontoauszug['unlesbar'] = [];

  daten.forEach((z, n) => {
    const stelle = n + 1;
    const buchungstag = datumLesen(wert(z, 'buchungstag')[0]) ?? datumLesen(wert(z, 'valuta')[0]);
    let betrag: number | null;
    if (spalten.has('betrag')) {
      betrag = betragLesen(wert(z, 'betrag')[0]);
    } else {
      const haben = betragLesen(wert(z, 'haben')[0]);
      const soll = betragLesen(wert(z, 'soll')[0]);
      betrag = haben && haben !== 0 ? Math.abs(haben) : soll && soll !== 0 ? -Math.abs(soll) : null;
    }
    if (!buchungstag || betrag === null) {
      // Summen- und Saldozeilen am Ende sind keine Bewegungen.
      if (z.join(' ').match(/saldo|summe|kontostand/i)) return;
      unlesbar.push({ stelle, grund: 'Buchungstag oder Betrag nicht lesbar' });
      return;
    }
    if (!(betrag > 0)) {
      nicht.abbuchungen += 1;
      return;
    }
    const waehrung = eineZeile(wert(z, 'waehrung')[0]).toUpperCase();
    if (waehrung && waehrung !== 'EUR') {
      nicht.fremdwaehrung += 1;
      return;
    }
    const name = eineZeile(wert(z, 'name').filter(Boolean).join(' '));
    const iban = ibanSpalten.map((i) => ibanSauber(z[i])).find(Boolean);
    const zweck = eineZeile(wert(z, 'zweck').filter(Boolean).join(' '));
    eingaenge.push({
      stelle,
      buchungstag,
      ...(datumLesen(wert(z, 'valuta')[0]) ? { valuta: datumLesen(wert(z, 'valuta')[0])! } : {}),
      betrag,
      ...(name ? { name } : {}),
      ...(iban ? { iban } : {}),
      zweck,
    });
  });

  const erkannt = [...spalten.keys()].filter((f) => f !== 'iban' || ibanSpalten.length > 0).map((f) => WORT[f]);
  return {
    format: 'csv',
    beschreibung: `CSV mit Kopfzeile — erkannt: ${erkannt.join(', ')}`,
    konto,
    ...zeitraum(eingaenge),
    eingaenge,
    nichtBetrachtet: nicht,
    unlesbar,
  };
}

const IST_DATUM = /^\d{1,2}\.\d{1,2}\.\d{2,4}$|^\d{4}-\d{2}-\d{2}$/;
const IST_BETRAG = /^[+-]?\d{1,3}(?:\.\d{3})*,\d{2}-?$|^[+-]?\d+,\d{2}-?$|^[+-]?\d+\.\d{2}$/;
const IST_WAEHRUNG = /^[A-Z]{3}$/;

/**
 * Ohne Kopfzeile (ELBA: „Datum;Text;Valuta;Betrag;Währung;Zeitstempel“,
 * BAWAG: „IBAN;Text;Datum;Valuta;Betrag;Währung“): die Spalten nach ihrem
 * Inhalt — was in fast allen Zeilen wie ein Datum, ein Betrag, eine Währung
 * aussieht, ist es; der längste Text ist der Zweck. Name und IBAN des
 * Auftraggebers stehen dann im Text; der Abgleich sucht dort nach ihnen.
 */
function csvOhneKopf(zeilen: string[][]): Kontoauszug {
  const breite = Math.max(...zeilen.map((z) => z.length));
  const anteil = (i: number, muster: RegExp) =>
    zeilen.filter((z) => muster.test((z[i] ?? '').trim())).length / zeilen.length;
  const datumsSpalten: number[] = [];
  let betragSpalte = -1;
  let waehrungSpalte = -1;
  let kontoSpalte = -1;
  for (let i = 0; i < breite; i++) {
    if (anteil(i, IST_DATUM) >= 0.8) datumsSpalten.push(i);
    else if (betragSpalte < 0 && anteil(i, IST_BETRAG) >= 0.8) betragSpalte = i;
    else if (waehrungSpalte < 0 && anteil(i, IST_WAEHRUNG) >= 0.8) waehrungSpalte = i;
    else if (kontoSpalte < 0 && zeilen.every((z) => ibanSauber(z[i]) && ibanSauber(z[i]) === ibanSauber(zeilen[0][i]))) kontoSpalte = i;
  }
  if (datumsSpalten.length === 0 || betragSpalte < 0) {
    throw new AuszugUnlesbar(
      `In dieser Datei ließen sich Datum und Betrag nicht erkennen. ${ALLE_FORMATE}`,
    );
  }
  const vergeben = new Set([...datumsSpalten, betragSpalte, waehrungSpalte, kontoSpalte]);
  // Der Zweck: die Textspalte mit dem meisten Inhalt (Zeitstempel und Zahlen zählen nicht).
  let zweckSpalte = -1;
  let laenge = 0;
  for (let i = 0; i < breite; i++) {
    if (vergeben.has(i)) continue;
    const summe = zeilen.reduce((s, z) => s + (/[A-Za-zÄÖÜäöü]/.test(z[i] ?? '') ? (z[i] ?? '').length : 0), 0);
    if (summe > laenge) {
      laenge = summe;
      zweckSpalte = i;
    }
  }

  const nicht = { ...leer };
  const eingaenge: BankBuchung[] = [];
  const unlesbar: Kontoauszug['unlesbar'] = [];
  zeilen.forEach((z, n) => {
    const stelle = n + 1;
    const buchungstag = datumLesen(z[datumsSpalten[0]]);
    const betrag = betragLesen(z[betragSpalte]);
    if (!buchungstag || betrag === null) {
      unlesbar.push({ stelle, grund: 'Buchungstag oder Betrag nicht lesbar' });
      return;
    }
    if (!(betrag > 0)) {
      nicht.abbuchungen += 1;
      return;
    }
    const waehrung = waehrungSpalte >= 0 ? (z[waehrungSpalte] ?? '').trim().toUpperCase() : 'EUR';
    if (waehrung !== 'EUR') {
      nicht.fremdwaehrung += 1;
      return;
    }
    const zweck = eineZeile(zweckSpalte >= 0 ? z[zweckSpalte] : '');
    const valuta = datumsSpalten[1] !== undefined ? datumLesen(z[datumsSpalten[1]]) : null;
    const iban = ibanImText(zweck);
    eingaenge.push({ stelle, buchungstag, ...(valuta ? { valuta } : {}), betrag, ...(iban ? { iban } : {}), zweck });
  });

  const erkannt = ['Buchungstag', ...(datumsSpalten.length > 1 ? ['Valuta'] : []), 'Betrag',
    ...(waehrungSpalte >= 0 ? ['Währung'] : []), ...(zweckSpalte >= 0 ? ['Text'] : [])];
  return {
    format: 'csv',
    beschreibung: `CSV ohne Kopfzeile — erkannt am Inhalt: ${erkannt.join(', ')}`,
    konto: kontoSpalte >= 0 ? ibanSauber(zeilen[0][kontoSpalte]) : undefined,
    ...zeitraum(eingaenge),
    eingaenge,
    nichtBetrachtet: nicht,
    unlesbar,
  };
}

// ---------------------------------------------------------------------------
// Die Kennung einer Bewegung
// ---------------------------------------------------------------------------

/**
 * DIE PRÜFSUMME EINER BEWEGUNG — gegen das doppelte Verbuchen, wenn dieselbe
 * Datei (oder ein Auszug, der sich mit einem früheren überschneidet) noch
 * einmal eingelesen wird. Die Datenbank nimmt jede Kennung je Betrieb nur
 * einmal an (`bank_buchungen`).
 *
 * AUS DEM, WAS IN JEDEM FORMAT GLEICH IST: Buchungstag, Betrag, IBAN des
 * Auftraggebers und der Zweck ohne Leerzeichen (camt bricht ihn in Zeilen,
 * CSV fügt sie mit Leerzeichen). Nicht darin: Bankreferenzen und die eigene
 * IBAN — die fehlen in manchen CSV. Zwei gleiche Bewegungen in einer Datei
 * (dieselbe Rate zweimal am selben Tag) zählen mit: die zweite bekommt „#2“.
 *
 * GESPEICHERT WIRD NUR DIE PRÜFSUMME, nicht Name, IBAN oder Zweck: aus ihr
 * lässt sich nichts zurücklesen.
 */
export async function kontoauszugKennungen(eingaenge: BankBuchung[]): Promise<string[]> {
  const gesehen = new Map<string, number>();
  const texte = eingaenge.map((b) => {
    const grund = ['v1', b.buchungstag, cent(b.betrag).toFixed(2), b.iban ?? '', b.zweck.replace(/\s+/g, '').toUpperCase()].join('|');
    const n = (gesehen.get(grund) ?? 0) + 1;
    gesehen.set(grund, n);
    return n === 1 ? grund : `${grund}#${n}`;
  });
  return Promise.all(texte.map(async (t) => {
    const roh = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return Array.from(new Uint8Array(roh), (x) => x.toString(16).padStart(2, '0')).join('');
  }));
}
