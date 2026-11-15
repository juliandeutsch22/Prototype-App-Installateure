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

/**
 * EIN LEERES ANGEBOT WIRD NICHT ANGENOMMEN (A14). Die Datenbank weist es an
 * jedem Weg ab; die Rückfrage sagt es vorher, statt eine Fehlermeldung zu
 * zeigen. Für Liste und Angebotsseite.
 */
export function leerNichtAnnehmen(q: Pick<Quote, 'quoteNumber' | 'positions'>): string | null {
  return hatPosition(q)
    ? null
    : `${q.quoteNumber} hat noch keine Position — ein leeres Angebot wird nicht angenommen. Erst unter „Bearbeiten“ Positionen eintragen.`;
}

/**
 * DAS ANGEBOTSDATUM BEIM VERSAND (A12). Es war der Tag des Anlegens und nicht
 * änderbar: ein Entwurf vom 01.10., versendet am 20.10., trug auf dem PDF den
 * 01.10. — und seine 30 Tage Bindefrist waren beim Versand zu zwei Dritteln
 * um. Liegt das Datum zurück, bietet die Rückfrage an, es auf heute zu
 * setzen; die Bindefrist rückt um dieselben Tage mit.
 */
export function datumAufHeute(q: Pick<Quote, 'quoteDate' | 'validUntil'>, heute: string): Pick<Quote, 'quoteDate' | 'validUntil'> | null {
  if (!q.quoteDate || q.quoteDate >= heute) return null;
  const tag = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
  const spanne = Math.max(0, Math.round((tag(q.validUntil) - tag(q.quoteDate)) / 86_400_000));
  const bis = new Date(tag(heute));
  bis.setUTCDate(bis.getUTCDate() + spanne);
  return { quoteDate: heute, validUntil: bis.toISOString().slice(0, 10) };
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
