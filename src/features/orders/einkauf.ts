import type { Company, Material, MaterialOrder } from '@/types';
import type { WithId } from '@/lib/db/core';
import { fmtMenge } from '@/lib/belegLayout';

/**
 * Die Einkaufsliste — was nicht im Lager liegt, gesammelt je Grosshändler.
 *
 * GEWÜNSCHT: der Lagerist hakt ab, was da ist; was fehlt, landet auf einer
 * Liste, die das Büro mit einem Klick als PDF oder E-Mail an den Vertreter
 * schickt.
 *
 * WARUM ZUSAMMENGEFASST WIRD. Drei Monteure fordern je zwei Eckventile an —
 * beim Grosshändler ist das EINE Zeile über sechs Stück, nicht drei. Die
 * Baustellen stehen als Kommission daneben, damit die Lieferung sich wieder
 * zuordnen lässt. Geliefert wird dagegen je Anforderung: jede hat ihren
 * Monteur, der eine Meldung bekommt.
 */

/** Eine Zeile der Bestellung beim Grosshändler. */
export interface EinkaufsZeile {
  /** Katalogartikel oder — ohne Katalog — der Name, klein geschrieben. */
  schluessel: string;
  bezeichnung: string;
  artikelnummer?: string;
  einheit?: string;
  menge: number;
  /** Die Baustellen, für die bestellt wird — ohne Doppelte, sortiert. */
  kommissionen: string[];
  /** Die Anforderungen dahinter — für „bestellt" und „geliefert". */
  anforderungen: string[];
}

/** Was je Grosshändler auf der Liste steht. */
export interface EinkaufsGruppe {
  /** `null`: noch keinem Grosshändler zugeordnet. */
  supplierId: string | null;
  zuBestellen: EinkaufsZeile[];
  /** Bestellt, aber noch nicht eingetroffen — je Anforderung. */
  unterwegs: WithId<MaterialOrder>[];
}

/** Gehört diese Anforderung auf die Einkaufsliste? */
export function aufEinkaufsliste(o: MaterialOrder): boolean {
  return (
    o.transactionType !== 'return' &&
    o.beschaffung === 'einkauf' &&
    !o.geliefertAm &&
    o.status !== 'Erledigt'
  );
}

function schluesselVon(o: MaterialOrder): string {
  return o.materialId || `name:${o.materialName.trim().toLowerCase()}`;
}

/**
 * Die offenen Einkäufe, nach Grosshändler — die ohne Grosshändler zuletzt.
 *
 * `katalog` liefert Artikelnummer und Einheit; fehlt ein Artikel darin (freie
 * Anforderung ohne Katalogeintrag), steht nur der Name da.
 */
export function einkaufsliste(
  anforderungen: WithId<MaterialOrder>[],
  katalog: Map<string, Pick<Material, 'articleNumber' | 'unit'>>,
): EinkaufsGruppe[] {
  const gruppen = new Map<string | null, EinkaufsGruppe>();
  const gruppe = (id: string | null) => {
    let g = gruppen.get(id);
    if (!g) {
      g = { supplierId: id, zuBestellen: [], unterwegs: [] };
      gruppen.set(id, g);
    }
    return g;
  };

  for (const o of anforderungen) {
    if (!aufEinkaufsliste(o)) continue;
    const g = gruppe(o.supplierId ?? null);
    if (o.bestelltAm) {
      g.unterwegs.push(o);
      continue;
    }
    const schluessel = schluesselVon(o);
    let z = g.zuBestellen.find((x) => x.schluessel === schluessel);
    if (!z) {
      const k = o.materialId ? katalog.get(o.materialId) : undefined;
      z = {
        schluessel,
        bezeichnung: o.materialName.trim(),
        artikelnummer: k?.articleNumber || undefined,
        einheit: k?.unit || undefined,
        menge: 0,
        kommissionen: [],
        anforderungen: [],
      };
      g.zuBestellen.push(z);
    }
    z.menge = Math.round((z.menge + (Number(o.quantity) || 0)) * 1000) / 1000;
    if (o.projectNumber && !z.kommissionen.includes(o.projectNumber)) {
      z.kommissionen.push(o.projectNumber);
    }
    z.anforderungen.push(o.id);
  }

  for (const g of gruppen.values()) {
    g.zuBestellen.sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, 'de'));
    for (const z of g.zuBestellen) z.kommissionen.sort();
  }
  return [...gruppen.values()].sort((a, b) =>
    a.supplierId === null ? 1 : b.supplierId === null ? -1 : 0,
  );
}

/** Die Bestellung als Text — für die E-Mail und zum Kopieren. */
export function bestellText(o: {
  company: Pick<Company, 'name' | 'addressLine' | 'contactLine'>;
  kundennummer?: string | null;
  zeilen: EinkaufsZeile[];
  datum: string;
  besteller?: string;
}): string {
  const kopf = [
    'Sehr geehrte Damen und Herren,',
    '',
    `wir bestellen am ${o.datum}${o.kundennummer ? ` (Kundennummer ${o.kundennummer})` : ''}:`,
    '',
  ];
  const zeilen = o.zeilen.map((z) => {
    const menge = `${fmtMenge(z.menge)}${z.einheit ? ` ${z.einheit}` : ''}`;
    const nr = z.artikelnummer ? `Art.-Nr. ${z.artikelnummer} – ` : '';
    const kommission = z.kommissionen.length ? ` (Kommission ${z.kommissionen.join(', ')})` : '';
    return `- ${menge} × ${nr}${z.bezeichnung}${kommission}`;
  });
  const fuss = [
    '',
    'Bitte um kurze Bestätigung mit Liefertermin.',
    '',
    'Mit freundlichen Grüßen',
    o.besteller?.trim() || '',
    o.company.name,
    o.company.addressLine ?? '',
    o.company.contactLine ?? '',
  ].filter((z, i, alle) => z !== '' || alle[i - 1] !== '');
  return [...kopf, ...zeilen, ...fuss].join('\n').trim();
}

/**
 * Wie lang ein `mailto:` sein darf, bevor Mailprogramme ihn abschneiden.
 *
 * Eine feste Grenze gibt es nicht; die knappsten Mailprogramme (Outlook unter
 * Windows, manche Android-Mailer) schneiden um 2000 Zeichen ab — OHNE
 * Hinweis, und die Bestellung käme mit fehlenden Zeilen beim Vertreter an.
 * Darüber geht der Text deshalb nicht in die Mail, sondern der Hinweis, das
 * PDF anzuhängen. Gemessen ist das nicht; die Grenze liegt bewusst darunter.
 */
export const MAILTO_GRENZE = 1800;

/** Der Link, der das Mailprogramm mit Empfänger, Betreff und Text öffnet. */
export function bestellMail(o: {
  an: string;
  betreff: string;
  text: string;
}): { href: string; gekuerzt: boolean } {
  const baue = (text: string) =>
    // Das „@" bleibt lesbar: manche Mailprogramme lösen `%40` nicht auf.
    `mailto:${encodeURIComponent(o.an.trim()).replace('%40', '@')}?subject=${encodeURIComponent(o.betreff)}&body=${encodeURIComponent(text)}`;
  const voll = baue(o.text);
  if (voll.length <= MAILTO_GRENZE) return { href: voll, gekuerzt: false };
  return {
    href: baue(
      'Sehr geehrte Damen und Herren,\n\nunsere Bestellung finden Sie im Anhang (PDF).\n\nMit freundlichen Grüßen',
    ),
    gekuerzt: true,
  };
}
