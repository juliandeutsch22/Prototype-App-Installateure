import type { AbschlussLage } from '@/lib/db/projects';
import { fmtStd } from '@/lib/time';
import { ZIEL } from '@/features/dashboard/start/ziele';

/**
 * Was vor dem Abschließen einer Baustelle offen ist — in Worten, je mit dem
 * Weg dorthin (A11, F1). Ohne die kommenden Einsätze: die halten das
 * Abschließen auf und stehen im Dialog für sich.
 */
export interface AbschlussPunkt {
  key: string;
  text: string;
  weg?: { text: string; zu: (projectNumber: string) => string };
}

const RECHNUNG_STELLEN = { text: 'Rechnung stellen', zu: (nr: string) => ZIEL.rechnungFuer(nr) };

export function abschlussPunkte(l: AbschlussLage): AbschlussPunkt[] {
  const punkte: AbschlussPunkt[] = [];
  if (l.scheinEntwuerfe > 0) {
    punkte.push({
      key: 'entwuerfe',
      text: l.scheinEntwuerfe === 1 ? 'Ein Handwerksschein ist noch Entwurf' : `${l.scheinEntwuerfe} Handwerksscheine sind noch Entwurf`,
    });
  }
  if (l.offeneAnforderungen > 0) {
    punkte.push({
      key: 'anforderungen',
      text: l.offeneAnforderungen === 1 ? 'Eine Materialanforderung ist nicht erledigt' : `${l.offeneAnforderungen} Materialanforderungen sind nicht erledigt`,
      weg: { text: 'Zu den Anforderungen', zu: () => ZIEL.anforderungen('offen') },
    });
  }
  if ((l.unverrechneteScheine ?? 0) > 0) {
    punkte.push({
      key: 'scheine',
      text: l.unverrechneteScheine === 1 ? 'Ein unterschriebener Schein ist nicht verrechnet' : `${l.unverrechneteScheine} unterschriebene Scheine sind nicht verrechnet`,
      weg: RECHNUNG_STELLEN,
    });
  }
  if ((l.unverrechneteMinuten ?? 0) > 0) {
    punkte.push({ key: 'zeit', text: `${fmtStd(l.unverrechneteMinuten ?? 0)} h Arbeitszeit sind nicht verrechnet`, weg: RECHNUNG_STELLEN });
  }
  if ((l.unverrechnetesMaterial ?? 0) > 0) {
    punkte.push({
      key: 'material',
      text: l.unverrechnetesMaterial === 1 ? 'Eine Materialausgabe ist nicht verrechnet' : `${l.unverrechnetesMaterial} Materialausgaben sind nicht verrechnet`,
      weg: RECHNUNG_STELLEN,
    });
  }
  if ((l.offeneRechnungen ?? 0) > 0) {
    punkte.push({
      key: 'rechnungen',
      text: l.offeneRechnungen === 1 ? 'Eine Rechnung ist noch nicht bezahlt' : `${l.offeneRechnungen} Rechnungen sind noch nicht bezahlt`,
      weg: { text: 'Zu den Rechnungen', zu: (nr: string) => ZIEL.rechnung(nr) },
    });
  }
  return punkte;
}
