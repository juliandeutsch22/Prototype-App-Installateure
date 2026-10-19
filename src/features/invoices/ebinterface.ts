import type { Company, Customer, Invoice, RechnungsArt, Vorrechnung } from '@/types';
import { cent, discountLabel, istPreiszeile, rabattAnteil } from './totals';
import { mitAbzug } from './vorrechnungen';
import { zugesagterSkonto } from './skonto';
import { RC_HINWEIS } from './reverseCharge';
import { stornoBelegTag } from './stornoBelegTag';
import { ibanNormal } from '@shared/iban';
import { uidNormalisieren } from '@/lib/uid';

/**
 * DIE RECHNUNG ALS E-RECHNUNG NACH ebInterface 6.1 (Auftrag 19.10.2026).
 *
 * ebInterface ist der österreichische Rechnungsstandard. Der Bund nimmt
 * Rechnungen seit 2014 nur elektronisch an (IKT-Konsolidierungsgesetz,
 * e-Rechnung.gv.at); Länder, Gemeinden und große Auftraggeber verlangen es
 * zunehmend. Erzeugt wird hier dasselbe Dokument wie das PDF — dieselben
 * Positionen, Abzüge, Steuern und derselbe Zahlbetrag —, nur maschinenlesbar.
 *
 * WIE DIE BESONDERHEITEN DES BELEGS ABGEBILDET SIND:
 *   – Titel öffnen eine eigene Positionsgruppe (`ItemList`), Text steht als
 *     weitere Beschreibung an der Position davor (ohne sie im Kopf der Gruppe).
 *   – Positionsrabatt: `ReductionListLineItem` mit Basis, Prozent und Betrag;
 *     der Rabatt über die Rechnung: `Reduction` auf Rechnungsebene.
 *   – Teil- und Schlussrechnung (e-Rechnung.gv.at, „Teil- und
 *     Endrechnungen“): die ganze Leistung als Positionen, jede abgezogene
 *     Vorrechnung als Position mit negativem Netto und ihrem Steuersatz, dazu
 *     ein `RelatedDocument` je Vorrechnung.
 *   – Haft- oder Deckungsrücklass: `BelowTheLineItem`. Er mindert den
 *     Zahlbetrag, nicht das Entgelt — wie auf dem PDF; die Steuer bleibt voll.
 *   – Skonto: `PaymentConditions/Discount` vom Zahlbetrag, wie auf dem PDF.
 *   – Stornorechnung (e-Rechnung.gv.at, „Storno von Rechnungen“): eigene
 *     Nummer, dieselben Beträge mit demselben Vorzeichen, dazu
 *     `CancelledOriginalDocument` mit Nummer, Datum und Art der Rechnung.
 *
 * Geprüft wird VOR dem Erzeugen (`ebiPruefen`). Was die Datei ungültig
 * machte oder beim Empfänger abgewiesen würde, ist ein Fehler und hält sie
 * zurück; was nur auffällt, ist ein Hinweis.
 */

export const EBI_NAMENSRAUM = 'http://www.ebinterface.at/schema/6p1/';

/** An wen die E-Rechnung geht — davon hängen Pflichtangaben ab. */
export type EbiEmpfaengerArt =
  /** Ein Unternehmen, das ebInterface annimmt: die Datei geht per E-Mail oder Portal. */
  | 'allgemein'
  /** Eine Dienststelle des Bundes über e-Rechnung.gv.at. */
  | 'bund'
  /** Land, Gemeinde oder andere Stelle über e-Rechnung.gv.at. */
  | 'andere';

export interface EbiOptionen {
  company: Company;
  invoice: Invoice;
  /** Die Stornorechnung statt der Rechnung. */
  storno?: boolean;
  empfaengerArt: EbiEmpfaengerArt;
  /**
   * Die Auftragsreferenz. Beim Bund die Bestellnummer (zehnstellig), die
   * Einkäufergruppe (drei Zeichen) oder „Einkäufergruppe:Referenz“; bei
   * anderen über e-Rechnung.gv.at „Kennung/Referenz“; sonst die
   * Bestellnummer des Kunden, wenn es eine gibt.
   */
  auftragsreferenz?: string;
  /** Die Bestellposition — nur bei einer zehnstelligen Bestellnummer des Bundes. */
  bestellposition?: string;
  /** Die Lieferantennummer, unter der der Empfänger den Betrieb führt. */
  lieferantennummer?: string;
  /** Aus dem Kundenstamm, soweit gefunden: E-Mail und Kundennummer. */
  kunde?: Pick<Customer, 'email' | 'kundennummer'> | null;
}

export interface EbiPruefung {
  fehler: string[];
  hinweise: string[];
}

/** Höchstens so viele Positionen nimmt e-Rechnung.gv.at an. */
export const EBI_HOECHSTENS_POSITIONEN = 999;

/** Wie der Beleg heißt — dieselben Wörter wie auf dem PDF (`pdf.ts`), ohne dessen Bibliothek zu laden. */
const UEBERSCHRIFT: Record<RechnungsArt, string> = {
  einzel: 'Rechnung',
  anzahlung: 'Anzahlungsrechnung',
  teil: 'Teilrechnung',
  schluss: 'Schlussrechnung',
};

const DOKUMENTART: Record<RechnungsArt, string> = {
  einzel: 'Invoice',
  anzahlung: 'InvoiceForAdvancePayment',
  teil: 'InvoiceForPartialDelivery',
  schluss: 'FinalSettlement',
};

/** Länder, wie `app.adresse_zeile` sie in die Anschrift schreibt — zurück zum Code. */
const LAENDER: Record<string, string> = {
  deutschland: 'DE',
  schweiz: 'CH',
  italien: 'IT',
  slowenien: 'SI',
  ungarn: 'HU',
  tschechien: 'CZ',
  slowakei: 'SK',
  liechtenstein: 'LI',
};
const LANDNAME: Record<string, string> = {
  AT: 'Österreich', DE: 'Deutschland', CH: 'Schweiz', IT: 'Italien', SI: 'Slowenien',
  HU: 'Ungarn', CZ: 'Tschechien', SK: 'Slowakei', LI: 'Liechtenstein',
};

export interface Anschrift {
  strasse: string;
  plz: string;
  ort: string;
  land: string;
}

/**
 * Die festgehaltene Anschrift des Belegs in ihre Teile — so, wie die
 * Datenbank sie zusammensetzt (`app.adresse_zeile`): „Straße, PLZ Ort“ und
 * außerhalb Österreichs „, Land“. Was nicht so aussieht, gibt `null`: lieber
 * eine Rückfrage als eine geratene Postleitzahl auf einer Rechnung.
 */
export function anschriftZerlegen(zeile: string | null | undefined): Anschrift | null {
  const teile = (zeile ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  if (teile.length < 2) return null;
  const ORT = /^([A-Z]{0,2}-?\d{4,5})\s+(.+)$/;
  // „PLZ Ort“ ist der letzte Teil — oder der vorletzte, wenn danach das Land steht.
  let land = 'AT';
  let ortStelle = teile.length - 1;
  if (!ORT.test(teile[ortStelle])) {
    const roh = teile[ortStelle];
    const code = LAENDER[roh.toLowerCase()] ?? (/^[A-Z]{2}$/.test(roh) ? roh : null);
    if (!code) return null;
    land = code;
    ortStelle -= 1;
  }
  const ortTeil = ortStelle >= 1 ? ORT.exec(teile[ortStelle]) : null;
  if (!ortTeil) return null;
  // Die Straße darf selbst ein Komma tragen („Hauptplatz 1, Stiege 2, Top 3“).
  return { strasse: teile.slice(0, ortStelle).join(', '), plz: ortTeil[1], ort: ortTeil[2], land };
}

/** Die E-Mail-Adresse aus der Kontaktzeile des Briefkopfs („Tel · Mail · Web“). */
export function emailAusKontakt(kontakt: string | null | undefined): string | null {
  const m = /[^\s·|,;]+@[^\s·|,;]+\.[A-Za-z]{2,}/.exec(kontakt ?? '');
  return m ? m[0] : null;
}

/** Die Telefonnummer aus der Kontaktzeile — das erste Stück, das nach einer Nummer aussieht. */
function telefonAusKontakt(kontakt: string | null | undefined): string | null {
  for (const teil of (kontakt ?? '').split(/[·|,;]/)) {
    const t = teil.replace(/^\s*(Tel\.?|Telefon|Mobil)[:\s]*/i, '').trim();
    if (/^\+?[\d\s/()-]{6,}$/.test(t)) return t;
  }
  return null;
}

/** Ab wann der Bund die UID des Rechnungsstellers verlangt (brutto, e-Rechnung.gv.at). */
const UID_STELLER_AB = 400;
/** Ab wann die UID des Empfängers (brutto). */
const UID_EMPFAENGER_AB = 10_000;
/** Was ohne UID eingetragen wird — die Vorgabe von e-Rechnung.gv.at. */
const OHNE_UID = 'ATU00000000';

/** Steuerkategorie und Prozentsatz einer Zeile, wie ebInterface sie verlangt. */
interface Steuer {
  code: 'S' | 'AA' | 'E' | 'AE';
  prozent: number;
  kommentar?: string;
}

function steuerDerRechnung(inv: Invoice): Steuer {
  if (inv.reverseCharge) return { code: 'AE', prozent: 0, kommentar: RC_HINWEIS };
  const prozent = Math.round((inv.vatRate ?? 0.2) * 10000) / 100;
  if (prozent === 0) return { code: 'E', prozent: 0, kommentar: inv.steuerbefreiung?.trim() || undefined };
  // Der Normalsatz (20 %, in Jungholz und Mittelberg 19 %) ist „S“, die ermäßigten „AA“.
  return { code: prozent >= 19 ? 'S' : 'AA', prozent };
}

/** Der Steuersatz einer Vorrechnung — aus ihren eigenen Beträgen, nicht aus dieser Rechnung. */
function steuerDerVorrechnung(v: Vorrechnung, haupt: Steuer): Steuer {
  if (!(Math.abs(v.netto) > 0)) return haupt;
  const prozent = Math.round((v.vat / v.netto) * 100);
  if (prozent === Math.round(haupt.prozent)) return haupt;
  if (prozent === 0) return haupt.code === 'AE' ? haupt : { code: 'E', prozent: 0 };
  return { code: prozent >= 19 ? 'S' : 'AA', prozent };
}

const schluessel = (s: Steuer) => `${s.code}|${s.prozent}`;

/** Eine Zeile der E-Rechnung — gerechnet, bevor geschrieben wird. */
interface Zeile {
  beschreibung: string[];
  menge: number;
  einheit: string;
  einzelpreis: number;
  rabatt?: { basis: number; prozent: number; betrag: number };
  betrag: number;
  steuer: Steuer;
}

interface Gruppe {
  kopf: string[];
  zeilen: Zeile[];
}

interface Beleg {
  art: RechnungsArt;
  nummer: string;
  datum: string;
  gruppen: Gruppe[];
  /** Was nach den Gruppen noch zu sagen war (Titel ohne Positionen am Ende). */
  fussText: string[];
  rabatt: { basis: number; prozent?: number; betrag: number; text: string } | null;
  steuern: Map<string, { steuer: Steuer; netto: number; ust: number }>;
  forderung: number;
  ruecklass: { betrag: number; text: string; bis: string } | null;
  zahlbetrag: number;
  skonto: { bis: string; prozent: number; basis: number; betrag: number } | null;
  /** Die Positionen des Belegs passen nicht zu seinen festgehaltenen Summen. */
  abweichungen: string[];
}

/** Rechnet den Beleg so aus, wie das PDF ihn zeigt — eine Quelle für Prüfung und Datei. */
function belegRechnen(o: EbiOptionen): Beleg {
  const inv = o.invoice;
  const art = inv.art ?? 'einzel';
  const haupt = steuerDerRechnung(inv);
  const abweichungen: string[] = [];

  const gruppen: Gruppe[] = [];
  let aktuell: Gruppe = { kopf: [], zeilen: [] };
  let wartenderKopf: string[] = [];
  const schliessen = () => {
    if (aktuell.zeilen.length > 0) gruppen.push(aktuell);
    else wartenderKopf = [...wartenderKopf, ...aktuell.kopf];
  };
  (inv.positions ?? []).forEach((p, i) => {
    const art = p.art ?? 'position';
    const text = (p.label ?? '').trim();
    if (art === 'titel') {
      schliessen();
      aktuell = { kopf: [...wartenderKopf, ...(text ? [text] : [])], zeilen: [] };
      wartenderKopf = [];
      return;
    }
    if (art === 'text') {
      if (!text) return;
      const vorige = aktuell.zeilen[aktuell.zeilen.length - 1];
      if (vorige) vorige.beschreibung.push(text);
      else aktuell.kopf.push(text);
      return;
    }
    if (!istPreiszeile(p)) return;
    const menge = Number(p.qty) || 0;
    const preis = Number(p.unitPrice) || 0;
    const netto = cent(Number(p.netto) || 0);
    const basis = cent(menge * preis);
    const prozent = rabattAnteil(p.rabattProzent);
    // Ohne Rabatt muss Menge × Preis den Betrag ergeben — der Empfänger rechnet nach.
    if (!prozent && Math.abs(basis - netto) > 0.005) {
      abweichungen.push(`Position ${i + 1} („${text || 'ohne Bezeichnung'}“): Menge × Einzelpreis ergibt ${basis.toFixed(2)}, die Zeile ${netto.toFixed(2)}.`);
    }
    aktuell.zeilen.push({
      beschreibung: [text || 'Position'],
      menge,
      einheit: (p.unit ?? '').trim() || 'Stk',
      einzelpreis: preis,
      ...(prozent ? { rabatt: { basis, prozent, betrag: cent(basis - netto) } } : {}),
      betrag: netto,
      steuer: haupt,
    });
  });
  schliessen();
  // Titel oder Text ohne Position danach: sie stehen unter den Positionen.
  const fussText = wartenderKopf;

  // Die volle Leistung, wie sie festgehalten ist — wie das PDF (`druckAngaben`).
  const gesamt = {
    totalNetto: inv.gesamtNetto ?? inv.totalNetto,
    totalVat: inv.gesamtVat ?? inv.totalVat,
    totalBrutto: inv.gesamtBrutto ?? inv.totalBrutto,
  };
  const subtotal = cent(inv.subtotalNetto ?? gesamt.totalNetto);
  const rabattBetrag = cent(inv.discountAmount ?? 0);
  const rabatt = rabattBetrag > 0 && inv.discount
    ? {
        basis: subtotal,
        ...(inv.discount.mode === 'percent' ? { prozent: inv.discount.value } : {}),
        betrag: rabattBetrag,
        text: discountLabel(inv.discount),
      }
    : null;

  const summePositionen = cent(gruppen.reduce((s, g) => s + g.zeilen.reduce((t, z) => t + z.betrag, 0), 0));
  if (Math.abs(summePositionen - subtotal) > 0.005) {
    abweichungen.push(`Die Positionen ergeben ${summePositionen.toFixed(2)} netto, die Rechnung führt ${subtotal.toFixed(2)}.`);
  }
  if (Math.abs(cent(subtotal - rabattBetrag) - cent(gesamt.totalNetto)) > 0.005) {
    abweichungen.push(`Zwischensumme abzüglich Rabatt ergibt ${cent(subtotal - rabattBetrag).toFixed(2)}, die Rechnung führt ${cent(gesamt.totalNetto).toFixed(2)} netto.`);
  }

  const steuern = new Map<string, { steuer: Steuer; netto: number; ust: number }>();
  const buchen = (s: Steuer, netto: number, ust: number) => {
    const k = schluessel(s);
    const alt = steuern.get(k) ?? { steuer: s, netto: 0, ust: 0 };
    steuern.set(k, { steuer: s, netto: cent(alt.netto + netto), ust: cent(alt.ust + ust) });
  };
  buchen(haupt, cent(gesamt.totalNetto), inv.reverseCharge ? 0 : cent(gesamt.totalVat));

  const abzuege = inv.vorrechnungen ?? [];
  if (abzuege.length > 0) {
    const zeilen: Zeile[] = abzuege.map((v) => {
      const s = steuerDerVorrechnung(v, haupt);
      buchen(s, -cent(v.netto), s.code === 'AE' ? 0 : -cent(v.vat));
      return {
        beschreibung: [`abzüglich ${v.invoiceNumber} vom ${datumAT(v.invoiceDate)}`],
        menge: 1,
        einheit: 'Stk',
        einzelpreis: -cent(v.netto),
        betrag: -cent(v.netto),
        steuer: s,
      };
    });
    gruppen.push({ kopf: ['Abzüglich bereits verrechneter Teilbeträge'], zeilen });
  }

  const summen = mitAbzug(gesamt, abzuege);
  const forderung = cent(summen.totalBrutto);
  const steuerSumme = cent([...steuern.values()].reduce((s, t) => s + t.netto + t.ust, 0));
  if (Math.abs(steuerSumme - forderung) > 0.005) {
    abweichungen.push(`Netto und Steuer ergeben ${steuerSumme.toFixed(2)}, gefordert sind ${forderung.toFixed(2)}.`);
  }

  const ruecklass = inv.ruecklassArt && inv.ruecklassProzent && inv.ruecklassBetrag != null && inv.ruecklassBis
    ? {
        betrag: cent(inv.ruecklassBetrag),
        bis: inv.ruecklassBis,
        text: `${inv.ruecklassArt === 'deckung' ? 'Deckungsrücklass' : 'Haftrücklass'} ${String(inv.ruecklassProzent).replace('.', ',')} %, fällig am ${datumAT(inv.ruecklassBis)}`,
      }
    : null;
  const zahlbetrag = cent(forderung - (ruecklass?.betrag ?? 0));
  const skonto = inv.skontoProzent && inv.skontoBis
    ? {
        bis: inv.skontoBis,
        prozent: inv.skontoProzent,
        basis: zahlbetrag,
        betrag: zugesagterSkonto({ totalBrutto: forderung, ruecklassBetrag: ruecklass?.betrag ?? 0, skontoProzent: inv.skontoProzent }),
      }
    : null;

  const nummer = o.storno ? (inv.stornoNummer ?? '') : inv.invoiceNumber;
  const datum = o.storno ? (stornoBelegTag(inv) ?? '') : inv.invoiceDate;
  return { art, nummer, datum, gruppen, fussText, rabatt, steuern, forderung, ruecklass, zahlbetrag, skonto, abweichungen };
}

function datumAT(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

const ZEHNSTELLIG = /^\d{10}$/;

/** Ist die Auftragsreferenz so, wie die Empfängerart sie verlangt? Sonst der Grund. */
export function auftragsreferenzFehler(art: EbiEmpfaengerArt, ref: string): string | null {
  const r = ref.trim();
  if (art === 'bund') {
    if (!r) return 'Die Auftragsreferenz fehlt. Der Bund ordnet die Rechnung darüber zu; sie steht in der Bestellung oder kommt von der beauftragenden Dienststelle.';
    if (ZEHNSTELLIG.test(r) || /^[A-Za-z0-9]{3}$/.test(r) || /^[A-Za-z0-9]{3}:.{1,50}$/.test(r)) return null;
    return 'Die Auftragsreferenz des Bundes ist eine zehnstellige Bestellnummer, eine Einkäufergruppe aus drei Zeichen oder „Einkäufergruppe:Referenz“ (z. B. 4700000001, Z01 oder Z01:111599).';
  }
  if (art === 'andere') {
    if (!r) return 'Die Auftragsreferenz fehlt. Sie kommt von der beauftragenden Stelle und ist die Rechnungsadresse bei e-Rechnung.gv.at.';
    // „Zumindest dreistellig“ samt Schrägstrich — das Beispiel von e-Rechnung.gv.at ist „Z0/“.
    if (/^[A-Za-z0-9]{2,}\/.{0,50}$/.test(r)) return null;
    return 'Die Auftragsreferenz anderer Empfänger beginnt mit ihrer Kennung und einem Schrägstrich, danach höchstens 50 Zeichen (z. B. Z0/ oder Z0/Akt 4711).';
  }
  return null;
}

/** Alles, was die Datei ungültig machte oder beim Empfänger abgewiesen würde — und was nur auffällt. */
export function ebiPruefen(o: EbiOptionen): EbiPruefung {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  const { company, invoice: inv } = o;
  const erb = o.empfaengerArt !== 'allgemein';

  if (o.storno && !inv.stornoNummer) {
    fehler.push('Für diese Rechnung ist noch keine Stornorechnung ausgestellt.');
  }
  if (!(inv.positions ?? []).some((p) => istPreiszeile(p))) {
    fehler.push('Die Rechnung hat keine festgehaltenen Positionen. Eine E-Rechnung braucht jede Leistung mit Menge, Einheit und Preis.');
  }
  const beleg = belegRechnen(o);
  fehler.push(...beleg.abweichungen);
  const zeilenZahl = beleg.gruppen.reduce((s, g) => s + g.zeilen.length, 0);
  if (erb && zeilenZahl > EBI_HOECHSTENS_POSITIONEN) {
    fehler.push(`e-Rechnung.gv.at nimmt höchstens ${EBI_HOECHSTENS_POSITIONEN} Positionen an; diese Rechnung hat ${zeilenZahl}.`);
  }

  // Der Rechnungssteller.
  if (!company.name?.trim()) fehler.push('Der Name des Betriebs fehlt (Einstellungen › Betrieb).');
  if (!company.strasse?.trim() || !company.plz?.trim() || !company.ort?.trim()) {
    fehler.push('Die Anschrift des Betriebs ist unvollständig — Straße, Postleitzahl und Ort (Einstellungen › Betrieb).');
  }
  const email = emailAusKontakt(company.contactLine);
  if (!email && erb) fehler.push('e-Rechnung.gv.at verlangt die E-Mail-Adresse des Rechnungsstellers. Sie fehlt in der Kontaktzeile (Einstellungen › Betrieb).');
  const iban = ibanNormal(company.iban);
  if (!iban) {
    if (erb) fehler.push('e-Rechnung.gv.at verlangt die Bankverbindung mit IBAN. Sie fehlt (Einstellungen › Betrieb).');
    else hinweise.push('Ohne IBAN steht in der E-Rechnung keine Bankverbindung.');
  }
  if (!uidNormalisieren(company.vatId) && beleg.forderung > UID_STELLER_AB) {
    hinweise.push(`Ohne eigene UID-Nummer steht ${OHNE_UID} in der E-Rechnung. Über ${UID_STELLER_AB} € brutto verlangt das Gesetz die UID des Rechnungsstellers, sofern es eine gibt.`);
  }

  // Der Empfänger.
  if (!anschriftZerlegen(inv.address)) {
    fehler.push(inv.address?.trim()
      ? `Die Anschrift auf der Rechnung („${inv.address.trim()}“) lässt sich nicht in Straße, Postleitzahl und Ort zerlegen.`
      : 'Auf der Rechnung steht keine Anschrift des Empfängers.');
  }
  if (!uidNormalisieren(inv.customerVatId) && beleg.forderung > UID_EMPFAENGER_AB) {
    hinweise.push(`Über ${UID_EMPFAENGER_AB.toLocaleString('de-AT')} € brutto verlangt das Gesetz die UID des Empfängers; ohne sie steht ${OHNE_UID} da.`);
  }

  // Leistungsdatum — Pflichtangabe nach § 11 Abs 1 Z 4 UStG.
  if (!(inv.leistungVon && inv.leistungBis)) {
    if (beleg.art === 'anzahlung') hinweise.push('Ohne Leistungszeitraum: bei einer Anzahlung steht die Leistung noch aus.');
    else fehler.push('Das Leistungsdatum oder der Leistungszeitraum fehlt auf der Rechnung (§ 11 Abs 1 Z 4 UStG).');
  }

  // Auftragsreferenz und Lieferantennummer über e-Rechnung.gv.at.
  const ref = (o.auftragsreferenz ?? '').trim();
  const refFehler = auftragsreferenzFehler(o.empfaengerArt, ref);
  if (refFehler) fehler.push(refFehler);
  if (o.empfaengerArt === 'bund' && ZEHNSTELLIG.test(ref) && !(o.bestellposition ?? '').trim()) {
    fehler.push('Zu einer zehnstelligen Bestellnummer verlangt der Bund die Bestellposition (meist 10).');
  }
  const lief = (o.lieferantennummer ?? '').trim();
  if (o.empfaengerArt === 'bund' && !/^\d{8}$/.test(lief)) {
    fehler.push('Die Lieferantennummer des Bundes ist achtstellig (z. B. 50012345). Sie kommt von der beauftragenden Dienststelle.');
  }
  if (o.empfaengerArt === 'andere' && !lief) {
    fehler.push('Die Lieferantennummer fehlt. Sie ist die Kennung des Betriebs beim Empfänger und kommt von dort.');
  }

  if (beleg.zahlbetrag < 0) hinweise.push('Der Zahlbetrag ist negativ — die E-Rechnung ist damit eine Gutschrift, ohne Zahlungsaufforderung.');
  if (beleg.ruecklass) hinweise.push('Der Rücklass steht als Abzug unter dem Strich: er mindert den Zahlbetrag, nicht die Steuer — wie auf dem PDF.');
  return { fehler, hinweise };
}

// ─────────────────────────────────────────────────────────────── Schreiben ──

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Steuerzeichen außer Tab, Zeilenumbruch und Wagenrücklauf sind in XML 1.0 nicht erlaubt.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** Zwei Nachkommastellen, ohne „-0.00“. */
function d2(n: number): string {
  const s = cent(n).toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

/** Bis zu vier Nachkommastellen (Menge, Einzelpreis). */
function d4(n: number): string {
  const s = (Math.round(n * 10000) / 10000).toFixed(4);
  return s === '-0.0000' ? '0.0000' : s;
}

class Schreiber {
  private zeilen: string[] = [];
  private tiefe = 0;
  auf(name: string, attr: Record<string, string | undefined> = {}) {
    this.zeilen.push(`${'  '.repeat(this.tiefe)}<${name}${attribute(attr)}>`);
    this.tiefe += 1;
  }
  zu(name: string) {
    this.tiefe -= 1;
    this.zeilen.push(`${'  '.repeat(this.tiefe)}</${name}>`);
  }
  wert(name: string, inhalt: string, attr: Record<string, string | undefined> = {}) {
    this.zeilen.push(`${'  '.repeat(this.tiefe)}<${name}${attribute(attr)}>${esc(inhalt)}</${name}>`);
  }
  leer(name: string) {
    this.zeilen.push(`${'  '.repeat(this.tiefe)}<${name}/>`);
  }
  text() {
    return this.zeilen.join('\n');
  }
}

function attribute(a: Record<string, string | undefined>): string {
  return Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${esc(v as string)}"`)
    .join('');
}

function steuerZeile(w: Schreiber, s: Steuer, netto: number, ust?: number) {
  w.auf('TaxItem');
  w.wert('TaxableAmount', d2(netto));
  w.wert('TaxPercent', d2(s.prozent), { TaxCategoryCode: s.code });
  if (ust !== undefined) w.wert('TaxAmount', d2(ust));
  if (s.kommentar) w.wert('Comment', s.kommentar);
  w.zu('TaxItem');
}

function anschrift(w: Schreiber, name: string, a: Anschrift, kontakt: { email?: string | null; telefon?: string | null } = {}) {
  w.auf('Address');
  w.wert('Name', name);
  w.wert('Street', a.strasse);
  w.wert('Town', a.ort);
  w.wert('ZIP', a.plz);
  w.wert('Country', LANDNAME[a.land] ?? a.land, { CountryCode: a.land });
  if (kontakt.telefon) w.wert('Phone', kontakt.telefon);
  if (kontakt.email) w.wert('Email', kontakt.email);
  w.zu('Address');
}

/**
 * Die E-Rechnung als ebInterface-6.1-XML. Wirft, wenn `ebiPruefen` Fehler
 * findet — eine Datei, die beim Empfänger abgewiesen würde, entsteht nicht.
 */
export function ebInterfaceXml(o: EbiOptionen): string {
  const pruefung = ebiPruefen(o);
  if (pruefung.fehler.length > 0) throw new Error(pruefung.fehler.join(' '));
  const { company, invoice: inv } = o;
  const b = belegRechnen(o);
  const erb = o.empfaengerArt !== 'allgemein';
  const ref = (o.auftragsreferenz ?? '').trim() || (o.empfaengerArt === 'allgemein' ? (inv.bestellnummer ?? '').trim() : '');
  const position = o.empfaengerArt === 'bund' && ZEHNSTELLIG.test(ref) ? (o.bestellposition ?? '').trim() : '';
  const lief = (o.lieferantennummer ?? '').trim();
  const w = new Schreiber();

  w.auf('Invoice', {
    xmlns: EBI_NAMENSRAUM,
    GeneratingSystem: 'Senklot',
    DocumentType: DOKUMENTART[b.art],
    InvoiceCurrency: 'EUR',
    DocumentTitle: o.storno ? 'Stornorechnung' : UEBERSCHRIFT[b.art],
    Language: 'de',
  });
  w.wert('InvoiceNumber', b.nummer);
  w.wert('InvoiceDate', b.datum);
  if (o.storno) {
    w.auf('CancelledOriginalDocument');
    w.wert('InvoiceNumber', inv.invoiceNumber);
    w.wert('InvoiceDate', inv.invoiceDate);
    w.wert('DocumentType', DOKUMENTART[b.art]);
    w.wert('Comment', `Storniert die ${UEBERSCHRIFT[b.art]} ${inv.invoiceNumber} vom ${datumAT(inv.invoiceDate)} in voller Höhe.`
      + (inv.cancellationNote?.trim() ? ` Grund: ${inv.cancellationNote.trim()}` : ''));
    w.zu('CancelledOriginalDocument');
  }
  for (const v of inv.vorrechnungen ?? []) {
    w.auf('RelatedDocument');
    w.wert('InvoiceNumber', v.invoiceNumber);
    w.wert('InvoiceDate', v.invoiceDate);
    w.wert('Comment', `Abgezogen: ${d2(v.netto)} netto, ${d2(v.vat)} Umsatzsteuer`);
    w.zu('RelatedDocument');
  }

  if (inv.leistungVon && inv.leistungBis) {
    w.auf('Delivery');
    if (inv.leistungVon === inv.leistungBis) w.wert('Date', inv.leistungVon);
    else {
      w.auf('Period');
      w.wert('FromDate', inv.leistungVon);
      w.wert('ToDate', inv.leistungBis);
      w.zu('Period');
    }
    const ort = inv.leistungsort?.trim();
    const zeile = [`Baustelle ${inv.projectNumber}`, ort && ort !== inv.address?.trim() ? `Ort der Leistung: ${ort}` : '']
      .filter(Boolean).join(' · ');
    // e-Rechnung.gv.at nimmt hier höchstens 500 Zeichen.
    w.wert('Description', zeile.slice(0, 500));
    w.zu('Delivery');
  }

  // Der Rechnungssteller.
  w.auf('Biller');
  w.wert('VATIdentificationNumber', uidNormalisieren(company.vatId) || OHNE_UID);
  if (company.companyRegister?.trim()) w.wert('FurtherIdentification', company.companyRegister.trim(), { IdentificationType: 'FN' });
  if (company.firmenbuchgericht?.trim()) w.wert('FurtherIdentification', company.firmenbuchgericht.trim(), { IdentificationType: 'FBG' });
  if (company.ort?.trim()) w.wert('FurtherIdentification', company.ort.trim(), { IdentificationType: 'FS' });
  anschrift(
    w,
    company.name,
    { strasse: company.strasse ?? '', plz: company.plz ?? '', ort: company.ort ?? '', land: (company.land ?? 'AT').toUpperCase() },
    { email: emailAusKontakt(company.contactLine), telefon: telefonAusKontakt(company.contactLine) },
  );
  if (lief) w.wert('InvoiceRecipientsBillerID', lief);
  w.zu('Biller');

  // Der Empfänger.
  w.auf('InvoiceRecipient');
  w.wert('VATIdentificationNumber', uidNormalisieren(inv.customerVatId) || OHNE_UID);
  if (ref) {
    w.auf('OrderReference');
    w.wert('OrderID', ref);
    w.zu('OrderReference');
  }
  anschrift(w, inv.customerName, anschriftZerlegen(inv.address)!, { email: o.kunde?.email?.trim() || null });
  if (o.kunde?.kundennummer?.trim()) w.wert('BillersInvoiceRecipientID', o.kunde.kundennummer.trim());
  w.zu('InvoiceRecipient');

  // Die Positionen.
  w.auf('Details');
  let nr = 0;
  for (const g of b.gruppen) {
    w.auf('ItemList');
    if (g.kopf.length) w.wert('HeaderDescription', g.kopf.join('\n'));
    for (const z of g.zeilen) {
      nr += 1;
      w.auf('ListLineItem');
      w.wert('PositionNumber', String(nr));
      for (const t of z.beschreibung) w.wert('Description', t);
      w.wert('Quantity', d4(z.menge), { Unit: z.einheit });
      w.wert('UnitPrice', d4(z.einzelpreis));
      if (z.rabatt) {
        w.auf('ReductionAndSurchargeListLineItemDetails');
        w.auf('ReductionListLineItem');
        w.wert('BaseAmount', d2(z.rabatt.basis));
        w.wert('Percentage', d2(z.rabatt.prozent));
        w.wert('Amount', d2(z.rabatt.betrag));
        w.wert('Comment', 'Rabatt auf die Position');
        w.zu('ReductionListLineItem');
        w.zu('ReductionAndSurchargeListLineItemDetails');
      }
      if (position) {
        w.auf('InvoiceRecipientsOrderReference');
        w.wert('OrderID', ref);
        w.wert('OrderPositionNumber', position);
        w.zu('InvoiceRecipientsOrderReference');
      }
      steuerZeile(w, z.steuer, z.betrag);
      w.wert('LineItemAmount', d2(z.betrag));
      w.zu('ListLineItem');
    }
    w.zu('ItemList');
  }
  if (b.fussText.length) w.wert('FooterDescription', b.fussText.join('\n'));
  if (b.ruecklass) {
    w.auf('BelowTheLineItem');
    w.wert('Description', b.ruecklass.text);
    w.wert('LineItemAmount', d2(-b.ruecklass.betrag));
    w.wert('Reason', 'Einbehalt bis zum Ende der Haftung bzw. Deckung', { Date: b.ruecklass.bis });
    w.zu('BelowTheLineItem');
  }
  w.zu('Details');

  if (b.rabatt) {
    const haupt = steuerDerRechnung(inv);
    w.auf('ReductionAndSurchargeDetails');
    w.auf('Reduction');
    w.wert('BaseAmount', d2(b.rabatt.basis));
    if (b.rabatt.prozent !== undefined) w.wert('Percentage', d2(b.rabatt.prozent));
    w.wert('Amount', d2(b.rabatt.betrag));
    w.wert('Comment', b.rabatt.text);
    steuerZeile(w, haupt, b.rabatt.betrag);
    w.zu('Reduction');
    w.zu('ReductionAndSurchargeDetails');
  }

  w.auf('Tax');
  for (const t of b.steuern.values()) steuerZeile(w, t.steuer, t.netto, t.ust);
  w.zu('Tax');
  w.wert('TotalGrossAmount', d2(b.forderung));
  w.wert('PayableAmount', d2(b.zahlbetrag));

  // Wie bezahlt wird.
  const iban = ibanNormal(company.iban);
  if (b.zahlbetrag <= 0) {
    w.auf('PaymentMethod');
    w.wert('Comment', 'Kein Betrag zu zahlen.');
    w.leer('NoPayment');
    w.zu('PaymentMethod');
  } else if (iban) {
    w.auf('PaymentMethod');
    w.wert('Comment', 'Überweisung');
    w.auf('UniversalBankTransaction');
    w.auf('BeneficiaryAccount');
    if (company.bankName?.trim()) w.wert('BankName', company.bankName.trim().slice(0, 255));
    if (company.bic && /^[0-9A-Za-z]{8}([0-9A-Za-z]{3})?$/.test(company.bic.replace(/\s+/g, ''))) {
      w.wert('BIC', company.bic.replace(/\s+/g, '').toUpperCase());
    }
    w.wert('IBAN', iban);
    w.wert('BankAccountOwner', company.name.slice(0, 70));
    w.zu('BeneficiaryAccount');
    w.wert('PaymentReference', b.nummer.slice(0, 35));
    w.zu('UniversalBankTransaction');
    w.zu('PaymentMethod');
  }
  if (!o.storno && b.zahlbetrag > 0) {
    w.auf('PaymentConditions');
    w.wert('DueDate', inv.dueDate);
    if (b.skonto) {
      w.auf('Discount');
      w.wert('PaymentDate', b.skonto.bis);
      w.wert('BaseAmount', d2(b.skonto.basis));
      w.wert('Percentage', d2(b.skonto.prozent));
      w.wert('Amount', d2(b.skonto.betrag));
      w.zu('Discount');
    }
    w.zu('PaymentConditions');
  }

  const kommentar = [
    b.art === 'anzahlung' ? 'Anzahlung auf eine noch zu erbringende Leistung.' : '',
    inv.reverseCharge ? RC_HINWEIS : '',
    !inv.reverseCharge && steuerDerRechnung(inv).code === 'E' ? (inv.steuerbefreiung ?? '').trim() : '',
    !erb && inv.bestellnummer?.trim() && ref !== inv.bestellnummer.trim() ? `Ihre Bestellnummer: ${inv.bestellnummer.trim()}` : '',
  ].filter(Boolean);
  if (kommentar.length) w.wert('Comment', kommentar.join('\n'));
  w.zu('Invoice');

  return `<?xml version="1.0" encoding="UTF-8"?>\n${w.text()}\n`;
}

/** Der Dateiname: die Belegnummer, ohne Zeichen, die Dateisysteme nicht mögen. */
export function ebiDateiname(o: Pick<EbiOptionen, 'invoice' | 'storno'>): string {
  const nummer = o.storno ? (o.invoice.stornoNummer ?? o.invoice.invoiceNumber) : o.invoice.invoiceNumber;
  return `${nummer.replace(/[^A-Za-z0-9._-]+/g, '_')}.xml`;
}
