import { useState, type ReactNode } from 'react';
import type { WithId } from '@/lib/db/core';
import type { Invoice } from '@/types';
import { MehrAnzeigen } from '@/components/LotBausteine';
import { istUeberfaellig, mahnbar, offenerRuecklass, ruecklassFaelligAm, zahlstand } from './zahlstand';

/**
 * DIE RECHNUNGSLISTE NACH DER LINIE „LOT“ (Protokoll E6, Regeln 4 und 7).
 *
 * Bis zum Umbau stand eine Liste aller zuletzt geladenen Rechnungen da, nach
 * Nummer absteigend. Wer wissen wollte, wo Geld fehlt, filterte auf
 * „Überfällig“ und dann auf „Teilbezahlt“ und hielt beides im Kopf
 * zusammen. Jetzt ist der ARBEITSSTAND die Standardansicht: alles, worauf
 * noch Geld kommt oder Geld zurückgeht, nach Dringlichkeit gruppiert.
 * „Erledigt“ und „Alle“ bleiben einen Tipp entfernt, die genaue Auswahl nach
 * Stand ebenso.
 *
 * Gerechnet wird hier nichts Neues: die Zuordnung liest dieselben Funktionen
 * (`zahlstand`, `istUeberfaellig`, `offenerRuecklass`), mit denen Kennzahlen
 * und Mahnlauf rechnen — sonst stünde eine Rechnung in der Liste unter
 * „Offen“ und in der Kennzahl unter „Überfällig“.
 */

/** Die Zahlstände, nach denen die Liste genau filtert — auch über `?status=`. */
export const FILTERSTATI = ['Offen', 'Überfällig', 'Teilbezahlt', 'Bezahlt', 'Überzahlt', 'Storniert'] as const satisfies readonly Invoice['paymentStatus'][];

/** Die drei Ansichten der Segmente; die genaue Auswahl nach Stand kommt dazu. */
export type Bereich = 'offen' | 'erledigt' | 'alle';
// eslint-disable-next-line react-refresh/only-export-components
export const BEREICHE: readonly { wert: Bereich; text: string }[] = [
  { wert: 'offen', text: 'Offen' },
  { wert: 'erledigt', text: 'Erledigt' },
  { wert: 'alle', text: 'Alle' },
];
export type RechnungsFilter = Bereich | (typeof FILTERSTATI)[number];

/** Höchstens so viele Zeilen je Gruppe, dann „und N weitere anzeigen“ (Regel 4). */
export const GRUPPE_HOECHSTENS = 20;

/**
 * Gehört die Rechnung zum Arbeitsstand? Ja, solange der Kunde noch etwas
 * schuldet oder der Betrieb ihm etwas zurückzahlen muss — ein Guthaben auf
 * einer stornierten Rechnung ist Arbeit, auch wenn der Stand „Storniert“ heisst.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function imArbeitsstand(inv: Invoice): boolean {
  if (zahlstand(inv).guthaben > 0) return true;
  return inv.paymentStatus === 'Offen' || inv.paymentStatus === 'Überfällig' || inv.paymentStatus === 'Teilbezahlt';
}

export interface Gruppe {
  schluessel: string;
  /** Ohne Titel: die Ansicht ist schon die Gruppe (eine einzige). */
  titel?: string;
  rechnungen: WithId<Invoice>[];
}

const nachNummerAbsteigend = (a: Invoice, b: Invoice) => b.invoiceNumber.localeCompare(a.invoiceNumber);
const nachDatum = (wann: (i: Invoice) => string | undefined) => (a: Invoice, b: Invoice) =>
  (wann(a) ?? '').localeCompare(wann(b) ?? '') || a.invoiceNumber.localeCompare(b.invoiceNumber);

/**
 * Die Gruppen einer Ansicht.
 *
 * IM ARBEITSSTAND NACH DRINGLICHKEIT (Regel 4): zuerst, was überfällig ist —
 * am längsten fälliges oben —, dann das Guthaben, das der Betrieb selbst
 * zurückzahlen muss, dann was noch läuft, nach Fälligkeit. Ganz unten, was
 * nur noch auf den Rücklass wartet: der wird oft erst in Jahren fällig und
 * darf die Rechnungen dieser Woche nicht nach unten drücken.
 *
 * Jede andere Ansicht bleibt EINE Liste, nach Nummer absteigend — wie bisher.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function rechnungsGruppen(rechnungen: WithId<Invoice>[], gruppiert: boolean, heute: string): Gruppe[] {
  if (!gruppiert) return [{ schluessel: 'alle', rechnungen: [...rechnungen].sort(nachNummerAbsteigend) }];
  const ueberfaellig: WithId<Invoice>[] = [];
  const guthaben: WithId<Invoice>[] = [];
  const offen: WithId<Invoice>[] = [];
  const ruecklass: WithId<Invoice>[] = [];
  for (const inv of rechnungen) {
    const stand = zahlstand(inv);
    if (istUeberfaellig(inv, heute)) ueberfaellig.push(inv);
    else if (stand.guthaben > 0) guthaben.push(inv);
    else if (stand.rest > 0 && offenerRuecklass(inv) >= stand.rest) ruecklass.push(inv);
    else offen.push(inv);
  }
  return [
    {
      schluessel: 'ueberfaellig',
      titel: 'Überfällig',
      rechnungen: ueberfaellig.sort(nachDatum((i) => mahnbar(i, heute).faellig)),
    },
    { schluessel: 'guthaben', titel: 'Guthaben zurückzahlen', rechnungen: guthaben.sort(nachDatum((i) => i.invoiceDate)) },
    { schluessel: 'offen', titel: 'Offen', rechnungen: offen.sort(nachDatum((i) => i.dueDate)) },
    {
      schluessel: 'ruecklass',
      titel: 'Nur noch Rücklass offen',
      rechnungen: ruecklass.sort(nachDatum((i) => ruecklassFaelligAm(i))),
    },
  ].filter((g) => g.rechnungen.length > 0);
}

/**
 * Eine Liste, die nach 20 Zeilen abbricht und sagt, wie viele noch kommen
 * (Regel 4) — für die Gruppen der Rechnungsliste wie für Mahnlauf und nicht
 * verrechnete Leistung. Die Zeilen kommen von aussen.
 */
export function GekuerzteListe<T>({ eintraege, zeile }: { eintraege: T[]; zeile: (e: T) => ReactNode }) {
  const [gezeigt, setGezeigt] = useState(GRUPPE_HOECHSTENS);
  return (
    <>
      <ul>{eintraege.slice(0, gezeigt).map(zeile)}</ul>
      <MehrAnzeigen anzahl={Math.max(0, eintraege.length - gezeigt)} onClick={() => setGezeigt(eintraege.length)} />
    </>
  );
}

/**
 * Eine Gruppe der Rechnungsliste: Abschnittskopf mit Anzahl, darunter die
 * gekürzte Liste. Die Ansicht kennt die Handlungen, die Gruppe nur die
 * Anordnung.
 */
export function RechnungsGruppe({
  titel,
  rechnungen,
  zeile,
}: {
  titel?: string;
  rechnungen: WithId<Invoice>[];
  zeile: (inv: WithId<Invoice>) => ReactNode;
}) {
  return (
    <>
      {titel && (
        <div className="abschnitt">
          <h3>{titel}</h3>
          <span className="gruppe-anzahl">{rechnungen.length}</span>
        </div>
      )}
      <GekuerzteListe eintraege={rechnungen} zeile={zeile} />
    </>
  );
}
