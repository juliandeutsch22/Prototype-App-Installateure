import { listEntriesForProjects } from '@/lib/db/timeEntries';
import { listInvoicesForProjects } from '@/lib/db/invoices';
import { listQuotesForProjects } from '@/lib/db/quotes';
import { listWorkSheetsForProjects } from '@/lib/db/workSheets';
import { katalogNachIds, katalogNachNamen } from '@/lib/db/materials';
import { einkaufspreise, type Kostensaetze } from '@/lib/db/kosten';
import { normProjectNumber } from '@/lib/time';
import type { Invoice, Material, Project, Quote, WorkSheet } from '@/types';
import type { WithId } from '@/lib/db/core';
import { rechneBaustelle, type Nachkalkulation } from './nachkalkulation';
import { materialkosten, KEINE_MATERIALKOSTEN } from './materialkosten';

/** Eine gerechnete Baustelle, mit der Kennung für den Weg in ihre Akte. */
export type NachkalkulationZeile = Nachkalkulation & { projektId?: string };

/**
 * Das Angebot, das für die Baustelle zählt: das ANGENOMMENE, wenn es eines
 * gibt. Hängen mehrere an einer Baustelle (ein abgelehntes, ein neues), war
 * es vorher das erste in der Liste — und nur ein angenommenes ist ein Erlös.
 */
export function angebotDerBaustelle(angebote: readonly WithId<Quote>[]): WithId<Quote> | undefined {
  return angebote.find((q) => q.status === 'Angenommen') ?? angebote[0];
}

/** Nach Baustelle sortiert, über die Nummer ohne „PR-“ wie in `rechneBaustelle`. */
function jeNummer<T>(zeilen: readonly T[], nummer: (z: T) => string | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const z of zeilen) {
    const n = normProjectNumber(nummer(z) ?? '');
    const liste = m.get(n);
    if (liste) liste.push(z);
    else m.set(n, [z]);
  }
  return m;
}

/**
 * Rechnet die gegebenen Baustellen durch — die schlechtesten zuerst.
 *
 * IN EINEM ZUG FÜR ALLE BAUSTELLEN (Auftrag 04.11.2026: „lädt im Vergleich zu
 * den anderen sehr langsam … beim Tabwechsel wird Inhalt oft noch
 * nachgeladen“). Bis dahin fragte die Ansicht Scheine, Rechnungen und
 * Angebote je Baustelle einzeln, samt ihren Zeilen: bei 25 Baustellen über
 * 200 Anfragen, bevor die erste Zahl dastand. Jetzt eine Abfrage je Art über
 * alle Baustellen (die Zeilen jeweils in einer weiteren), zusammen etwa
 * zehn. Was gerechnet wird, ist dasselbe: dieselben Rechnungen in jeder
 * Schreibweise der Nummer (P2-13), dieselben Angebote über die Kennung,
 * jeder unterschriebene Schein.
 *
 * Die OBERGRENZE (höchstens 25 Baustellen je Aufruf) setzt die Ansicht; sie
 * hält auch die Wertelisten der Abfragen klein.
 */
export async function rechneBaustellen(
  companyId: string,
  projekte: readonly WithId<Project>[],
  kosten: Kostensaetze,
): Promise<NachkalkulationZeile[]> {
  if (projekte.length === 0) return [];
  const nummern = projekte.map((p) => p.projectNumber);
  const [eintraege, scheine, rechnungen, angebote] = await Promise.all([
    listEntriesForProjects(companyId, nummern),
    /*
      Konnten die Scheine nicht geladen werden, wird KEIN Material angesetzt
      — und die Lücke bleibt sichtbar, weil auch keine Artikel gemeldet
      werden. Eine Null wäre hier dasselbe wie „kein Material verbaut", und
      das ist eine andere Aussage. Die Scheine sind eine Zusatzangabe: ohne
      sie bleibt der Deckungsbeitrag vor Material eine Auskunft.
    */
    listWorkSheetsForProjects(companyId, nummern).catch(() => null),
    listInvoicesForProjects(companyId, nummern),
    listQuotesForProjects(companyId, projekte.flatMap((p) => (p.id ? [p.id] : []))),
  ]);

  const scheineJe = scheine ? jeNummer<WithId<WorkSheet>>(scheine, (s) => s.projectNumber) : null;
  const rechnungenJe = jeNummer<WithId<Invoice>>(rechnungen, (r) => r.projectNumber);
  const angeboteJe = new Map<string, WithId<Quote>[]>();
  for (const q of angebote) {
    if (!q.projectId) continue;
    const liste = angeboteJe.get(q.projectId);
    if (liste) liste.push(q);
    else angeboteJe.set(q.projectId, [q]);
  }
  const angebotVon = (p: WithId<Project>) => angebotDerBaustelle((p.id && angeboteJe.get(p.id)) || []);

  /*
    DER MATERIALSTAMM NUR FÜR DIESE BAUSTELLEN (19.10.2026): die Artikel,
    deren Namen auf ihren Scheinen und angenommenen Angeboten stehen, dazu
    die Artikel, auf die eine Angebots- oder Scheinzeile zeigt — aus dem
    ganzen Katalog. Vorher kamen die ersten tausend Artikel; ein Artikel
    dahinter stand als „ohne Einkaufspreis“ da, und der Deckungsbeitrag war
    zu hoch. Die Einkaufspreise liest nur die Spitze (offene Punkte B1).
  */
  const zeilen = projekte.flatMap((p) => angebotVon(p)?.positions ?? []);
  const scheinZeilen = (scheine ?? []).flatMap((s) => s.material ?? []);
  const [nachName, nachId] = await Promise.all([
    katalogNachNamen(companyId, [
      ...scheinZeilen.map((z) => z.name ?? ''),
      ...zeilen.map((z) => z.label ?? ''),
    ]),
    katalogNachIds(companyId, [
      ...zeilen.map((z) => z.materialId ?? ''),
      ...scheinZeilen.flatMap((z) => (z.materialId ? [z.materialId] : [])),
    ]),
  ]);
  const artikel = [...new Map([...nachName, ...nachId].map((m) => [m.id, m])).values()];
  const preise = await einkaufspreise(companyId, artikel.map((m) => m.id));
  const katalog: Material[] = artikel.map((m) => ({ ...m, einkaufspreis: preise.get(m.id) }));

  return projekte
    .map((p): NachkalkulationZeile => {
      const nr = normProjectNumber(p.projectNumber);
      const material = scheineJe ? materialkosten(scheineJe.get(nr) ?? [], katalog) : KEINE_MATERIALKOSTEN;
      return {
        ...rechneBaustelle(
          p.projectNumber,
          p.customerName,
          eintraege,
          rechnungenJe.get(nr) ?? [],
          angebotVon(p),
          kosten,
          material,
          katalog,
        ),
        projektId: p.id,
      };
    })
    // Die schlechtesten oben: eine Auswertung ist eine Arbeitsliste.
    .sort((a, b) => (a.margeProzent ?? 999) - (b.margeProzent ?? 999));
}
