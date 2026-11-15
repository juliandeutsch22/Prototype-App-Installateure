import type { Quote } from '@/types';

/**
 * DIE RÜCKFRAGE VOR EINEM STANDWECHSEL (Durchsicht 15.11.2026, A5).
 *
 * „Als versendet markieren“ und „Als abgelehnt markieren“ wirkten mit einem
 * Tipp, ohne Rückfrage und ohne Rückweg — ein Fehltipp neben „Bearbeiten“
 * machte einen leeren Entwurf unwiderruflich zu einem versendeten Angebot.
 * Eine Stelle für Liste und Angebotsseite: beide fragen dasselbe.
 */
export interface StatusFrage {
  neu: Quote['status'];
  titel: string;
  text: string;
  label: string;
  meldung: string;
  /** Geht gerade nicht — der Text sagt, warum. */
  gesperrt?: boolean;
}

/** Positionen zählen — Titel und Text bieten nichts an (M18). */
export function hatPosition(q: Pick<Quote, 'positions'>): boolean {
  return q.positions.some((p) => (p.art ?? 'position') === 'position');
}

export type Standwechsel = 'versenden' | 'ablehnen' | 'zurueckInEntwurf' | 'ablehnungZurueck';

export function statusFrage(q: Pick<Quote, 'quoteNumber' | 'positions' | 'versendetAm'>, wechsel: Standwechsel): StatusFrage {
  const nr = q.quoteNumber;
  switch (wechsel) {
    case 'versenden':
      return hatPosition(q)
        ? {
            neu: 'Versendet', titel: 'Als versendet markieren?', label: 'Als versendet markieren', meldung: 'Als versendet markiert',
            text: `${nr} gilt danach als beim Kunden: geändert wird es nur noch als neue Fassung. Zurück in den Entwurf geht, solange kein Annahme-Link geöffnet wurde.`,
          }
        : {
            neu: 'Versendet', titel: 'Als versendet markieren?', label: 'Als versendet markieren', meldung: '', gesperrt: true,
            text: `${nr} hat noch keine Position — ein leeres Angebot wird nicht versendet. Erst unter „Bearbeiten“ Positionen eintragen.`,
          };
    case 'ablehnen':
      return {
        neu: 'Abgelehnt', titel: 'Als abgelehnt markieren?', label: 'Als abgelehnt markieren', meldung: 'Als abgelehnt vermerkt',
        text: `${nr} gilt danach als vom Kunden abgelehnt und steht unter „Erledigt“. Ein Fehltipp lässt sich auf der Angebotsseite mit „Ablehnung zurücknehmen“ beheben.`,
      };
    case 'zurueckInEntwurf':
      return {
        neu: 'Entwurf', titel: 'Zurück in den Entwurf?', label: 'Zurück in den Entwurf', meldung: `${nr} ist wieder ein Entwurf`,
        text: `${nr} lässt sich danach wieder bearbeiten, als wäre es nie versendet worden. Ein noch nicht geöffneter Annahme-Link wird dabei widerrufen.`,
      };
    case 'ablehnungZurueck': {
      const neu = q.versendetAm ? 'Versendet' : 'Entwurf';
      return {
        neu, titel: 'Ablehnung zurücknehmen?', label: 'Ablehnung zurücknehmen', meldung: 'Ablehnung zurückgenommen',
        text: `${nr} ist danach wieder ${neu === 'Versendet' ? 'versendet und wartet auf die Antwort des Kunden' : 'ein Entwurf'}.`,
      };
    }
  }
}
