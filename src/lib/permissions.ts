import type { Role } from '@/types';

/**
 * Rollen-Prädikate, 1:1 aus der Legacy-App übernommen (docs §2).
 * Administrator ist Superuser; Geschäftsführung deckt die Leitungsfunktionen ab.
 * Diese Helfer steuern die UI — die HARTE Durchsetzung liegt im Zeilenschutz.
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
 * Dieselbe Regel steht in `app.darf_urlaub_entscheiden()` — hier steuert sie
 * die Oberfläche, dort wird sie durchgesetzt.
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

/**
 * Benutzer anlegen und Rollen vergeben — OHNE Projektleitung.
 *
 * Wer Rollen vergibt, vergibt sie auch an sich: mit diesem Recht könnte sich
 * die Projektleitung zur Geschäftsführung machen und danach alles. Die
 * Regel in der Datenbank sagte im Kommentar seit jeher „nur GF/Admin", liess aber
 * `isLeadership()` zu; hier stand dieselbe Lücke.
 */
export const canManageUsers = (r: Role) => isTopLevel(r);

/**
 * Administratoren anlegen, ändern und löschen darf nur ein Administrator.
 *
 * Sonst könnte sich eine Geschäftsführung selbst zum Superuser machen oder
 * den letzten Administrator entfernen — die Rollenhierarchie wäre damit
 * wirkungslos. Serverseitig steht dieselbe Grenze im Trigger
 * `users_adminrolle`.
 */
export const canManageAdmins = (r: Role) => isAdmin(r);

/**
 * Rechnungen sehen und stellen — OHNE Projektleitung.
 *
 * So steht es auch in den Richtlinien, und dort ist es die Wahrheit: die
 * Projektleitung kann Rechnungen nicht einmal lesen. Hier hiess es trotzdem
 * `isGF`, worin sie steckt — die Ansicht bot ihr also Knöpfe an, die
 * serverseitig scheitern mussten.
 */
export const canInvoice = (r: Role) => isTopLevel(r) || isBuch(r);
export const canProcessOrders = (r: Role) => isVerw(r) || isGF(r);

/**
 * Wer im Außendienst arbeitet und deshalb IMMER die volle Zeiterfassung
 * braucht: Baustelle, Wegzeit, Fahrzeug, Helfer, Zuschläge.
 *
 * Bewusst nur der Monteur. Der Administrator zählte hier bisher mit, weil
 * `isMitarbeiter` ihn als Superuser einschließt — er bekam dadurch immer das
 * volle Formular, obwohl er in aller Regel gar nicht rausfährt.
 */
/**
 * Wer einen Handwerksschein SCHREIBEN darf — anlegen, einen Entwurf
 * weiterbearbeiten, unterschreiben lassen.
 *
 * WARUM DAS EINE FUNKTION IST UND KEINE AUFZAEHLUNG AN ZWEI STELLEN. Die
 * Rollen standen ausgeschrieben in der Route; die Liste der Scheine sieht
 * aber auch die Buchhaltung und die Verwaltung. Ein Knopf „Öffnen" dort
 * fuehrte fuer sie auf eine Seite, die sie nicht betreten duerfen — und
 * zwei getrennte Aufzaehlungen laufen frueher oder spaeter auseinander.
 *
 * Schreiben darf, wer rausfaehrt oder die Baustelle verantwortet.
 */
export const SCHEIN_ROLLEN: Role[] = [
  'Mitarbeiter',
  'Projektleiter',
  'Geschäftsführung',
  'Administrator',
];

export const canWriteWorkSheet = (r: Role) => SCHEIN_ROLLEN.includes(r);

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

/**
 * Wer ein Zeitkonto führt — also ein Soll hat, einen Saldo, und in der
 * Mitarbeiterübersicht steht.
 *
 * ENTSCHIEDEN VOM BETRIEB AM 24.09.2026 (Prüflauf F12, F17). Vorher hing es
 * allein an der Rolle, und die Projektleitung stand in einer Zwischenlage:
 * in der Übersicht, weil sie Zeit bucht, aber „führt kein Zeitkonto“ — und
 * trotzdem mit „17 Tage fehlen“. Jetzt:
 *
 *   Monteur, Verwaltung, Buchhaltung, Projektleitung — ja.
 *   Administration — nein. Sie ist eine Funktion im System, kein
 *                    Arbeitsverhältnis mit Stundensoll.
 *   Geschäftsführung — je Person, in der Benutzerakte. Der angestellte
 *                    Geschäftsführer hat ein Soll, der Inhaber meist nicht.
 *
 * Wer ein Zeitkonto führt, erscheint auch in der Mitarbeiterübersicht, und
 * nur ihn mahnt die Startseite wegen fehlender Tage. Beides war früher eine
 * eigene Regel und konnte auseinanderlaufen — genau das war F12.
 */
export const fuehrtZeitkonto = (p: { role: Role; fuehrtZeitkonto?: boolean }) =>
  p.role === 'Mitarbeiter' || p.role === 'Verwaltung' || p.role === 'Buchhaltung'
  || p.role === 'Projektleiter'
  || (p.role === 'Geschäftsführung' && p.fuehrtZeitkonto === true);

/**
 * Wer Kunden anlegen, ändern, löschen und aus einer Datei übernehmen darf.
 *
 * Die Leitung immer. Verwaltung und Buchhaltung, wenn die Geschäftsführung
 * es in der Benutzerakte freigegeben hat (entschieden am 24.09.2026,
 * Prüflauf F11). Monteure nie. Die Grenze zieht `app.darf_kunden_pflegen()`
 * in der Datenbank; das hier entscheidet nur, welche Knöpfe erscheinen.
 *
 * Baustellen einem Kunden zuordnen gehört NICHT dazu: das ändert die
 * Baustelle, und die ändert weiterhin nur die Leitung.
 */
export const darfKundenPflegen = (p: { role: Role; kundenPflegen?: boolean }) =>
  isGF(p.role)
  || ((p.role === 'Verwaltung' || p.role === 'Buchhaltung') && p.kundenPflegen === true);
