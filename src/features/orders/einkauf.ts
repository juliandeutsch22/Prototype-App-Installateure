import type { Company, EinkaufPosten, Material, MaterialOrder } from '@/types';
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
 *
 * DAZU DIE EIGENEN POSTEN des Büros (etwa fürs Lager). Sie stehen in
 * derselben Zeile wie gleiche Artikel aus Anforderungen — beim Grosshändler
 * ist es eine Bestellung —, mit „Lager" als Kommission.
 */

/** Die Kommission, unter der eigene Posten auf der Bestellung stehen. */
export const LAGER_KOMMISSION = 'Lager';

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
  /** Die eigenen Posten dahinter. */
  posten: string[];
}

/** Bestellt und noch nicht da — eine Anforderung oder ein eigener Posten. */
export interface Unterwegs {
  id: string;
  art: 'anforderung' | 'lager';
  bezeichnung: string;
  menge: number;
  einheit?: string;
  /** Wer wartet — der Monteur, oder beim eigenen Posten, wer ihn anlegte. */
  wer?: string;
  /** Die Baustelle der Anforderung; beim eigenen Posten „Lager". */
  kommission?: string;
  notiz?: string;
  bestelltAm?: number | null;
}

/** Was je Grosshändler auf der Liste steht. */
export interface EinkaufsGruppe {
  /** `null`: noch keinem Grosshändler zugeordnet. */
  supplierId: string | null;
  zuBestellen: EinkaufsZeile[];
  /** Bestellt, aber noch nicht eingetroffen — je Anforderung bzw. Posten. */
  unterwegs: Unterwegs[];
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

function schluesselVon(o: { materialId?: string | null; materialName: string }): string {
  return o.materialId || `name:${o.materialName.trim().toLowerCase()}`;
}

/**
 * Die offenen Einkäufe, nach Grosshändler — die ohne Grosshändler zuletzt.
 *
 * `katalog` liefert Artikelnummer und Einheit; fehlt ein Artikel darin (freie
 * Anforderung ohne Katalogeintrag), steht nur der Name da.
 *
 * `posten`: die offenen eigenen Posten des Büros.
 */
export function einkaufsliste(
  anforderungen: WithId<MaterialOrder>[],
  katalog: Map<string, Pick<Material, 'articleNumber' | 'unit'>>,
  posten: WithId<EinkaufPosten>[] = [],
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

  const zeile = (
    g: EinkaufsGruppe,
    o: { materialId?: string | null; materialName: string },
    einheit?: string | null,
  ): EinkaufsZeile => {
    const schluessel = schluesselVon(o);
    let z = g.zuBestellen.find((x) => x.schluessel === schluessel);
    if (!z) {
      const k = o.materialId ? katalog.get(o.materialId) : undefined;
      z = {
        schluessel,
        bezeichnung: o.materialName.trim(),
        artikelnummer: k?.articleNumber || undefined,
        einheit: k?.unit || einheit || undefined,
        menge: 0,
        kommissionen: [],
        anforderungen: [],
        posten: [],
      };
      g.zuBestellen.push(z);
    }
    return z;
  };
  const dazu = (z: EinkaufsZeile, menge: number, kommission?: string) => {
    z.menge = Math.round((z.menge + (Number(menge) || 0)) * 1000) / 1000;
    if (kommission && !z.kommissionen.includes(kommission)) z.kommissionen.push(kommission);
  };

  for (const o of anforderungen) {
    if (!aufEinkaufsliste(o)) continue;
    const g = gruppe(o.supplierId ?? null);
    if (o.bestelltAm) {
      g.unterwegs.push({
        id: o.id,
        art: 'anforderung',
        bezeichnung: o.materialName,
        menge: Number(o.quantity) || 0,
        wer: o.userName,
        kommission: o.projectNumber,
        bestelltAm: o.bestelltAm,
      });
      continue;
    }
    const z = zeile(g, o);
    dazu(z, o.quantity, o.projectNumber);
    z.anforderungen.push(o.id);
  }

  for (const p of posten) {
    if (p.geliefertAm) continue;
    const g = gruppe(p.supplierId ?? null);
    if (p.bestelltAm) {
      g.unterwegs.push({
        id: p.id,
        art: 'lager',
        bezeichnung: p.materialName,
        menge: Number(p.menge) || 0,
        einheit: p.einheit ?? undefined,
        wer: p.angelegtVonName ?? undefined,
        kommission: LAGER_KOMMISSION,
        notiz: p.notiz ?? undefined,
        bestelltAm: p.bestelltAm,
      });
      continue;
    }
    const z = zeile(g, p, p.einheit);
    dazu(z, p.menge, LAGER_KOMMISSION);
    z.posten.push(p.id);
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
