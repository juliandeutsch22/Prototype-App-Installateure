import type { Meldung } from './notifyLogic';
/** Auf Sperrbildschirmen stehen weder Stunden noch der möglicherweise persönliche Korrekturtext. */
export function zeitMeldung(art: string, id: string): Meldung | null {
  if (art === 'timer-erinnerung') return { title: 'Timer noch aktiv', body: 'Bitte tatsächliche Zeiten prüfen oder bewusst weiterlaufen lassen.', link: '/time', tag: `zeit-timer-${id}` };
  if (art === 'korrektur-antrag') return { title: 'Zeitkorrektur angefragt', body: 'Ein neuer Korrekturantrag wartet auf Prüfung.', link: `/time?korrektur=${encodeURIComponent(id)}`, tag: `zeit-korrektur-${id}` };
  if (art === 'korrektur-entschieden') return { title: 'Zeitkorrektur geprüft', body: 'Die Entscheidung zu deinem Antrag ist verfügbar.', link: `/time?korrektur=${encodeURIComponent(id)}`, tag: `zeit-korrektur-${id}` };
  return null;
}
export function zeitKorrekturEmpfaenger(personen: readonly { uid?: string; role?: string; active?: boolean }[], antragsteller: string): string[] {
  return personen.filter((u) => u.uid && u.uid !== antragsteller && u.active !== false && ['Buchhaltung','Geschäftsführung','Administrator'].includes(u.role ?? '')).map((u) => u.uid!);
}

/** Auch persönliche Hinweise gehen nur an ein weiterhin aktives Betriebskonto. */
export function zeitEigenerEmpfaenger(personen: readonly { uid?: string; active?: boolean }[], uid: string): string[] {
  return personen.filter((u) => u.uid === uid && u.active !== false).map((u) => u.uid!);
}
