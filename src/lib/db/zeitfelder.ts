/**
 * Die freien Zeitfelder (M06b) — die Weiche, dazu das Gedächtnis des Geräts.
 *
 * WARUM EIN GEDÄCHTNIS. Der Monteur bucht im Keller ohne Empfang; die Maske
 * muss dann trotzdem wissen, welche Felder es gibt und was Pflicht ist —
 * sonst merkte das Ausgangsfach eine Buchung ohne Angaben vor. Gemerkt wird
 * der zuletzt geladene Feldsatz (Fassung und Definitionen, ohne wer sie
 * geändert hat) je Betrieb im Speicher des Browsers. Ist er inzwischen
 * veraltet, nimmt der Server die Buchung nach DIESER Fassung an und
 * kennzeichnet, was die neue zusätzlich verlangt („Nachpflege“).
 */
import type { ZeitfeldDefinition, ZeitfeldFassung, Zeitfeldwert } from '@/types';
import type { WithId } from './core';
import * as pg from './pg/zeitfelder';

export type { ZeitfeldEntwurf } from './pg/zeitfelder';

export function listZeitfeldDefinitionen(companyId: string): Promise<WithId<ZeitfeldDefinition>[]> {
  return pg.listZeitfeldDefinitionen(companyId);
}

export function getAktuelleZeitfeldFassung(companyId: string): Promise<ZeitfeldFassung | null> {
  return pg.getAktuelleZeitfeldFassung(companyId);
}

export function listZeitfeldFassungen(companyId: string, nummern: readonly number[]): Promise<WithId<ZeitfeldFassung>[]> {
  return pg.listZeitfeldFassungen(companyId, nummern);
}

export function listFeldwerte(companyId: string, von: string, bis: string, userId?: string): Promise<WithId<Zeitfeldwert>[]> {
  return pg.listFeldwerte(companyId, von, bis, userId);
}

export function zeitfeldSpeichern(f: pg.ZeitfeldEntwurf) {
  return pg.zeitfeldSpeichern(f);
}

export function zeitfeldTypWechseln(altId: string, f: pg.ZeitfeldEntwurf) {
  return pg.zeitfeldTypWechseln(altId, f);
}

export function zeitfeldReihenfolge(ids: string[]) {
  return pg.zeitfeldReihenfolge(ids);
}

/** Der Feldsatz, den die Maske braucht: die geltende Fassung und alle Definitionen. */
export interface Feldsatz {
  fassung: ZeitfeldFassung | null;
  definitionen: ZeitfeldDefinition[];
}

const SCHLUESSEL = (companyId: string) => `senklot.zeitfelder.${companyId}`;

/** Zuletzt geladener Feldsatz dieses Betriebs auf diesem Gerät — oder `null`. */
export function gemerkterFeldsatz(companyId: string): Feldsatz | null {
  try {
    const roh = globalThis.localStorage?.getItem(SCHLUESSEL(companyId));
    if (!roh) return null;
    const satz = JSON.parse(roh) as Feldsatz;
    return Array.isArray(satz?.definitionen) ? satz : null;
  } catch {
    return null;
  }
}

function merken(companyId: string, satz: Feldsatz): void {
  try {
    // Ohne Namen der Bearbeiter: auf dem Gerät liegt nur, was die Maske braucht.
    const schlank: Feldsatz = {
      fassung: satz.fassung ? { ...satz.fassung, vonUid: null, vonName: null } : null,
      definitionen: satz.definitionen.map((d) => ({ ...d, geaendertVonUid: null, geaendertVonName: null })),
    };
    globalThis.localStorage?.setItem(SCHLUESSEL(companyId), JSON.stringify(schlank));
  } catch {
    // Kein Speicher (privates Fenster): dann eben ohne Gedächtnis.
  }
}

/** Den Feldsatz frisch laden und merken. */
export async function feldsatzLaden(companyId: string): Promise<Feldsatz> {
  const [fassung, definitionen] = await Promise.all([
    getAktuelleZeitfeldFassung(companyId),
    listZeitfeldDefinitionen(companyId),
  ]);
  const satz = { fassung, definitionen };
  merken(companyId, satz);
  return satz;
}
