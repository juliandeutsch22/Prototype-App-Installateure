/**
 * Die Belegschaft — auf Postgres.
 *
 * HIER FÄLLT EIN ÜBERSETZER WEG. Das Firestore-Dokument trug die Felder teils
 * in `snake_case` (`initial_overtime`, `app_start_date`, `work_days`) — ein
 * Erbe aus dem Prototyp, das die alte Fassung bei jedem Lesen und Schreiben
 * von Hand umrechnen musste. In Postgres heisst jede Spalte `snake_case`, und
 * die Umrechnung macht `felder.ts` mechanisch für alle Tabellen.
 *
 * ZWEI DINGE BLEIBEN VON HAND, weil sie keine Namensfrage sind:
 *
 *   `uid` — in Firestore war die Dokumentkennung die Auth-Kennung, und `uid`
 *           stand zusätzlich im Dokument. Hier IST `id` die Auth-Kennung
 *           (`references auth.users`), ein zweites Feld dafür wäre eine Kopie,
 *           die auseinanderlaufen kann. Für die Ansichten wird es gespiegelt.
 *
 *   `appStartDate` — der Typ sagt ausdrücklich `string | null`. „Nicht
 *           gesetzt" heisst hier „gilt von Anfang an" und ist eine Aussage,
 *           keine Lücke; die Ansicht unterscheidet die beiden nicht, aber der
 *           Vertrag tut es.
 */
import type { AppUser } from '@/types';
import { abfragen, derClient, aendern, type WithId } from './kern';
import { objektAlsZeile, zeileAlsObjekt } from './felder';
import {
  DEFAULT_WEEKLY_HOURS, DEFAULT_VACATION_DAYS, DEFAULT_WORK_DAYS,
  type UserProfileInput,
} from '../benutzerVorgaben';

const BELEGSCHAFT = 'users';

type Zeile = Omit<AppUser, 'uid'>;

function alsBenutzer(zeile: WithId<Zeile>): AppUser {
  return { ...zeile, uid: zeile.id, appStartDate: zeile.appStartDate ?? null };
}

export async function listUsers(companyId: string): Promise<AppUser[]> {
  const zeilen = await abfragen<Zeile>(BELEGSCHAFT, companyId);
  return zeilen.map(alsBenutzer);
}

/**
 * Einen Benutzer über seine Auth-Kennung holen.
 *
 * Der Betrieb geht nicht in die Abfrage ein — er steht im Zeilenschutz, und
 * der ist die verbindliche Grenze. Der Parameter bleibt in der Signatur,
 * damit die Weiche beide Datenquellen bedienen kann.
 */
export async function getUserByUid(companyId: string, uid: string): Promise<AppUser | null> {
  void companyId;
  const { data, error } = await derClient()
    .from(BELEGSCHAFT).select('*').eq('id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return alsBenutzer(zeileAlsObjekt<WithId<Zeile>>(BELEGSCHAFT, data as Record<string, unknown>));
}

/** Stammdaten eines bestehenden Nutzers ändern. */
export function updateUserProfile(uid: string, p: Partial<UserProfileInput>): Promise<void> {
  /*
    EINE ERLAUBNISLISTE, KEIN DURCHREICHEN.

    Die E-Mail steht bewusst nicht darauf: sie ist der Anmeldename und gehört
    zum Konto, nicht zum Profil. Käme sie hier durch, sperrte sich jemand
    aus, ohne es zu merken — die Zeile hiesse dann anders als das Konto, mit
    dem er sich anmeldet.

    Dass „nicht mitgeschickt" nicht zu „geleert" wird, prüft diese Liste
    NICHT — das erledigt `objektAlsZeile`, indem es `undefined` fallen lässt.
    Es hier ein zweites Mal zu regeln hiesse, die Regel an zwei Stellen zu
    führen, bis eines Tages nur noch eine davon stimmt.
  */
  const daten: Record<string, unknown> = {};
  for (const feld of [
    'name', 'role', 'active', 'weeklyTargetHours', 'yearlyVacationDays',
    'workDays', 'appStartDate', 'initialOvertime',
  ] as const) {
    daten[feld] = p[feld];
  }
  return aendern(BELEGSCHAFT, uid, daten);
}

/**
 * Legt das Profil an — die Kennung ist die Auth-Kennung.
 *
 * Die Rollen-Ansprüche im Token setzt weiterhin der Server; diese Zeile ist
 * das, was die App von einem Benutzer sieht. Angelegt wird über `upsert`:
 * derselbe Aufruf zweimal darf kein zweites Profil erzeugen, und beim
 * Einladen eines Benutzers, dessen Konto schon besteht, ist genau das der
 * Normalfall.
 */
export async function createUserDoc(
  companyId: string,
  uid: string,
  p: UserProfileInput,
): Promise<void> {
  const zeile = {
    ...objektAlsZeile(BELEGSCHAFT, {
      name: p.name,
      email: p.email,
      role: p.role,
      active: p.active,
      weeklyTargetHours: p.weeklyTargetHours ?? DEFAULT_WEEKLY_HOURS,
      yearlyVacationDays: p.yearlyVacationDays ?? DEFAULT_VACATION_DAYS,
      workDays: p.workDays ?? DEFAULT_WORK_DAYS,
      appStartDate: p.appStartDate ?? null,
      initialOvertime: p.initialOvertime ?? 0,
    }),
    id: uid,
    company_id: companyId,
  };
  const { error } = await derClient().from(BELEGSCHAFT).upsert(zeile, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

// Bewusst KEIN Löschen von Benutzern: Zeitbuchungen, Materialanforderungen und
// Einsätze verweisen über die Kennung auf den Nutzer und würden verwaisen.
// Gesperrt wird über `active: false` — das nimmt die Anmeldung und die
// Auswertungen, lässt die Vergangenheit aber lesbar.
