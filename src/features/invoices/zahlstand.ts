/**
 * Was von einer Rechnung noch aussteht, ab wann es fällig ist und was davon
 * Rücklass ist. Die Regeln stehen seit der Durchsicht vom 15.11.2026 in
 * `shared/forderungen.ts` — dieselbe Fassung rechnet die Edge Function der
 * Startseite (`startseite-forderungen`). Hier nur weitergereicht.
 */
export {
  zahlstand,
  offenerRest,
  ruecklassFaelligAm,
  offenerRuecklass,
  mahnbar,
  istUeberfaellig,
  type Zahlstand,
} from '@shared/forderungen';
