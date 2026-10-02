/**
 * Die Adresse des Kalender-Abos (Entscheidung vom 02.10.2026).
 *
 * Die Serverfunktion `kalender` liegt beim Datenbankprojekt, nicht bei der
 * App: die App ist nur ausgelieferte Dateien und kann nichts beantworten,
 * wenn ein Kalender nachts nachfragt.
 *
 * Zwei Formen: `https://…` zum Einfügen (Google Kalender, Outlook im Web)
 * und `webcal://…` zum Antippen — iPhone, Mac und Outlook am Rechner öffnen
 * damit gleich den Dialog „Abonnieren“.
 */
export function kalenderAdresse(basis: string | undefined, schluessel: string): string | null {
  const b = (basis ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(b) || !schluessel) return null;
  return `${b}/functions/v1/kalender?t=${encodeURIComponent(schluessel)}`;
}

export function webcalAdresse(adresse: string): string {
  return adresse.replace(/^https?:\/\//, 'webcal://');
}
