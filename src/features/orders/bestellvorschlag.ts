import type { Bestellvorschlag } from '@/lib/db/materialdeckung';
import { fmtMenge } from '@/lib/belegLayout';
import { mengeFehler } from '@/lib/einheit';
import { leseZahl } from '@/lib/zahl';

/** Die Vorschläge je Großhändler — wie die Einkaufsliste bündelt; ohne Großhändler zuletzt. */
export function vorschlagGruppen(
  liste: readonly Bestellvorschlag[],
): { lieferantId: string | null; name: string; vorschlaege: Bestellvorschlag[] }[] {
  const nach = new Map<string, { lieferantId: string | null; name: string; vorschlaege: Bestellvorschlag[] }>();
  for (const v of liste) {
    const k = v.lieferantId ?? '';
    const g = nach.get(k) ?? { lieferantId: v.lieferantId, name: v.lieferantName ?? 'Ohne Großhändler', vorschlaege: [] };
    g.vorschlaege.push(v);
    nach.set(k, g);
  }
  return [...nach.values()].sort((a, b) =>
    a.lieferantId === null ? 1 : b.lieferantId === null ? -1 : a.name.localeCompare(b.name, 'de'),
  );
}

/** Warum vorgeschlagen wird — in Worten, mit den Zahlen dahinter. */
export function vorschlagGrundText(v: Bestellvorschlag): string {
  const e = v.einheit ? ` ${v.einheit}` : '';
  const erwartet = v.frei + v.zulauf;
  const teile = [
    v.grund === 'fehlmenge'
      ? `Für Rüstlisten und Zusagen fehlen ${fmtMenge(-erwartet)}${e}`
      : `Frei ${fmtMenge(v.frei)}${e}, Mindestmenge ${fmtMenge(v.mindestmenge ?? 0)}${e}`,
    v.zulauf > 0 ? `${fmtMenge(v.zulauf)}${e} schon auf der Einkaufsliste` : '',
    v.sollbestand != null ? `bis Sollbestand ${fmtMenge(v.sollbestand)}${e}` : '',
    v.verpackungseinheit != null ? `in Schritten zu ${fmtMenge(v.verpackungseinheit)}${e}` : '',
  ];
  return teile.filter(Boolean).join(' · ');
}

/**
 * Sollbestand und Verpackungseinheit (M04b), wie die Datenbank sie prüft:
 * der Sollbestand nie unter der Mindestmenge, die Verpackungseinheit über
 * null und in Stück ganz.
 */
export function bestellFehler(f: { lagerartikel: boolean; mindestmenge: string; sollbestand: string; verpackungseinheit: string; unit: string }): string | null {
  const soll = f.sollbestand.trim() === '' ? null : leseZahl(f.sollbestand).wert;
  const min = f.mindestmenge.trim() === '' ? null : leseZahl(f.mindestmenge).wert;
  const vpe = f.verpackungseinheit.trim() === '' ? null : leseZahl(f.verpackungseinheit).wert;
  if (f.lagerartikel && soll != null) {
    if (soll < 0) return 'Der Sollbestand kann nicht unter null liegen.';
    if (min != null && soll < min) return 'Der Sollbestand liegt unter der Mindestmenge — bis dorthin wird aufgefüllt, also mindestens so viel.';
  }
  if (vpe != null) {
    const fehler = mengeFehler(vpe, f.unit.trim() || 'Stk');
    if (fehler) return `Verpackungseinheit: ${fehler}`;
  }
  return null;
}
