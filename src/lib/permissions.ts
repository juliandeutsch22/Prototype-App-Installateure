import type { Role } from '@/types';

/**
 * Rollen-Prädikate, 1:1 aus der Legacy-App übernommen (docs §2).
 * Administrator ist Superuser; Geschäftsführung deckt die Leitungsfunktionen ab.
 * Diese Helfer steuern die UI — die HARTE Durchsetzung liegt in firestore.rules.
 */
export const isAdmin = (r: Role) => r === 'Administrator';

/**
 * Projektleitung: dieselben Rechte wie die Geschäftsführung, MIT EINER
 * Ausnahme — die Zeitkonten der Mitarbeiter bleiben ihr verschlossen.
 *
 * Ein Projektleiter plant Baustellen, verteilt Material und rechnet ab. Was
 * ein einzelner Monteur an Überstunden, Krankenständen und Urlaub angesammelt
 * hat, geht ihn nichts an; das ist Sache von Geschäftsführung und
 * Buchhaltung. Krankenstände sind zudem Gesundheitsdaten nach Art. 9 DSGVO,
 * die nur bekommen darf, wer sie für seine Aufgabe braucht.
 */
export const isProjektleiter = (r: Role) => r === 'Projektleiter';

/**
 * Leitungsebene für alles, was Baustellen, Material und Abrechnung angeht.
 * Der Projektleiter zählt hier dazu — beim Zeitkonto (canEditTime) bewusst
 * nicht.
 */
export const isGF = (r: Role) =>
  r === 'Geschäftsführung' || isProjektleiter(r) || isAdmin(r);

/** Nur die echte Geschäftsführung, ohne Projektleitung. */
export const isTopLevel = (r: Role) => r === 'Geschäftsführung' || isAdmin(r);

export const isMitarbeiter = (r: Role) => r === 'Mitarbeiter' || isAdmin(r);
export const isVerw = (r: Role) => r === 'Verwaltung' || isAdmin(r);
export const isBuch = (r: Role) => r === 'Buchhaltung' || isAdmin(r);

export const canOrder = (r: Role) => isMitarbeiter(r) || isVerw(r) || isGF(r);

/**
 * Zeitkonten aller Mitarbeiter einsehen und korrigieren.
 * Der Projektleiter ist hier ausgenommen — das ist der einzige Unterschied
 * zur Geschäftsführung.
 */
export const canEditTime = (r: Role) => isBuch(r) || isTopLevel(r);

/**
 * Wer einen Urlaubsantrag entscheiden darf.
 *
 * ANDERS ALS DIE ÜBRIGEN PRÄDIKATE HIER hängt das nicht allein an der Rolle,
 * sondern an einer betrieblichen Festlegung: in dem einen Betrieb entscheidet
 * die Buchhaltung, im anderen ein Vorarbeiter, im dritten nur der Chef. Die
 * Geschäftsführung legt das in den Einstellungen fest.
 *
 * ZWEI REGELN, DIE NICHT VERHANDELBAR SIND:
 *
 *  1. Geschäftsführung und Administration können immer entscheiden. Wären sie
 *     abwählbar, könnte eine Fehleingabe den ganzen Betrieb aussperren — und
 *     niemand könnte sie zurücknehmen, weil auch das Ändern der Liste ihnen
 *     vorbehalten ist.
 *  2. Ohne Festlegung bleibt es beim Ausgangszustand (Buchhaltung plus
 *     Leitung). Sonst hätte das Einführen dieser Einstellung bestehenden
 *     Betrieben stillschweigend Rechte entzogen.
 *
 * Dieselbe Regel steht in firestore.rules — hier steuert sie die Oberfläche,
 * dort wird sie durchgesetzt.
 */
export function darfUrlaubEntscheiden(
  rolle: Role,
  uid: string,
  genehmiger: string[] | undefined,
): boolean {
  if (isTopLevel(rolle)) return true;
  if (genehmiger && genehmiger.length > 0) return genehmiger.includes(uid);
  return isBuch(rolle);
}

export const canManageProjects = (r: Role) => isGF(r);
export const canManageUsers = (r: Role) => isGF(r);

/**
 * Administratoren anlegen, ändern und löschen darf nur ein Administrator.
 *
 * Sonst könnte sich eine Geschäftsführung selbst zum Superuser machen oder
 * den letzten Administrator entfernen — die Rollenhierarchie wäre damit
 * wirkungslos. Serverseitig steht dieselbe Grenze in firestore.rules.
 */
export const canManageAdmins = (r: Role) => isAdmin(r);

export const canInvoice = (r: Role) => isGF(r) || isBuch(r);
export const canProcessOrders = (r: Role) => isVerw(r) || isGF(r);

/**
 * Wer im Außendienst arbeitet und deshalb IMMER die volle Zeiterfassung
 * braucht: Baustelle, Wegzeit, Fahrzeug, Helfer, Zuschläge.
 *
 * Bewusst nur der Monteur. Der Administrator zählte hier bisher mit, weil
 * `isMitarbeiter` ihn als Superuser einschließt — er bekam dadurch immer das
 * volle Formular, obwohl er in aller Regel gar nicht rausfährt.
 */
export const istAussendienst = (r: Role) => r === 'Mitarbeiter';

/**
 * Wer die erweiterte Erfassung bei Bedarf DAZUSCHALTEN darf.
 *
 * Geschäftsführung, Projektleitung und Administrator buchen im Normalfall nur
 * Zeit — Datum, Status, Von-Bis, Pause, Kommentar. Springt einer von ihnen
 * aber für einen Notdienst ein, braucht er dieselben Felder wie ein Monteur,
 * sonst landet der Einsatz ohne Baustelle und ohne Zuschlag in den Daten und
 * fehlt auf der Rechnung.
 *
 * Verwaltung und Buchhaltung stehen bewusst NICHT hier: sie fahren nicht
 * raus, und ein Feld, das nie gebraucht wird, ist eine Fehlerquelle.
 */
export const canExtendTimeEntry = (r: Role) =>
  r === 'Geschäftsführung' || r === 'Projektleiter' || r === 'Administrator';

/** Soll/Ist-Saldo gilt nur für diese Rollen (Leitung ausgenommen). */
export const shouldShowOvertime = (r: Role) =>
  r === 'Mitarbeiter' || r === 'Verwaltung' || r === 'Buchhaltung';
