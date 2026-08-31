/**
 * Schalter für Funktionen, die fertig sind, aber (noch) nicht gezeigt werden.
 *
 * Der Code bleibt vollständig erhalten — Route, Ansicht, Cloud Function und
 * Tests. Nur der Weg dorthin ist zu. So kostet das Wiedereinschalten eine
 * Umgebungsvariable statt einer Rückportierung.
 */

/**
 * KI-Spracherfassung. Aus, solange die Transkription (OpenAI) und die
 * Extraktion (Claude) nicht eingerichtet sind: ohne Schlüssel führt der
 * Knopf nur in eine Fehlermeldung. Dazu kommt, dass Sprachaufnahmen von
 * Mitarbeitern an US-Anbieter gehen — das braucht vorher
 * Auftragsverarbeitungsverträge und einen Hinweis an die Belegschaft.
 */
export const VOICE_ENABLED = import.meta.env.VITE_ENABLE_VOICE === 'true';
