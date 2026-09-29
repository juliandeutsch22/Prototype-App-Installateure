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

/*
  DIE ANFANGSSTÄNDE LIEGEN NEBENAN (seit 29.09.2026, offene Punkte B1).

  `initialOvertime` und `initialVacationDays` stehen in `zeitkonto_anfang`,
  die nur liest, wer auch die Urlaube der Person liest. Hier werden sie zum
  Benutzer gelegt, damit keine Ansicht etwas davon merkt. Wer sie nicht
  lesen darf, bekommt die Felder leer — für die Kollegen im Einsatzplan ist
  das richtig so.

  Geschrieben wird weiter über die Spalten in `users`; die Datenbank legt
  sie um (Einlass). SCHEITERT das Lesen, scheitert die ganze Abfrage: ein
  Formular, das stattdessen leere Felder zeigte, schriebe beim Speichern 0
  über den hinterlegten Stand.
*/
type Anfang = { userId: string; initialOvertime: number | null; initialVacationDays: number | null };

async function anfaenge(companyId: string, ids: readonly string[]): Promise<Map<string, Anfang>> {
  if (ids.length === 0) return new Map();
  const zeilen = await abfragen<Anfang>('zeitkonto_anfang', companyId, {
    wo: [{ art: 'in', feld: 'userId', werte: [...ids] }],
  });
  return new Map(zeilen.map((z) => [z.userId, z]));
}

function mitAnfang(zeile: WithId<Zeile>, anfang: Anfang | undefined): WithId<Zeile> {
  return {
    ...zeile,
    initialOvertime: anfang?.initialOvertime != null ? Number(anfang.initialOvertime) : undefined,
    initialVacationDays: anfang?.initialVacationDays != null ? Number(anfang.initialVacationDays) : undefined,
  };
}

type Zeile = Omit<AppUser, 'uid'>;

function alsBenutzer(zeile: WithId<Zeile>): AppUser {
  return {
    ...zeile,
    uid: zeile.id,
    appStartDate: zeile.appStartDate ?? null,
    /*
      DIESELBE AUSNAHME WIE BEIM STARTDATUM, AUS DEMSELBEN GRUND.

      `zeileAlsObjekt` lässt leere Spalten absichtlich weg — die App-Typen
      sagen meist `feld?: string` und nicht `string | null`. Hier sagt der Typ
      aber `number | null`, weil „nicht angegeben" eine AUSSAGE ist: dann gilt
      der volle Jahresanspruch. Ohne diese Zeile käme `undefined` zurück, wo
      der Vertrag `null` verspricht — und das Formular, das zwischen „leer"
      und „0" unterscheiden muss, bekäme zwei Schreibweisen für dasselbe.
    */
    initialVacationDays: zeile.initialVacationDays ?? null,
  };
}

export async function listUsers(companyId: string): Promise<AppUser[]> {
  const zeilen = await abfragen<Zeile>(BELEGSCHAFT, companyId);
  const anfang = await anfaenge(companyId, zeilen.map((z) => z.id));
  return zeilen.map((z) => alsBenutzer(mitAnfang(z, anfang.get(z.id))));
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
  const zeile = zeileAlsObjekt<WithId<Zeile>>(BELEGSCHAFT, data as Record<string, unknown>);
  const anfang = await anfaenge((data as { company_id: string }).company_id, [uid]);
  return alsBenutzer(mitAnfang(zeile, anfang.get(uid)));
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
    'workDays', 'appStartDate', 'initialOvertime', 'initialVacationDays',
    'kundenPflegen', 'fuehrtZeitkonto',
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
      /*
        `?? null` und NICHT `?? DEFAULT_VACATION_DAYS`: „nicht angegeben" ist
        hier eine eigene Aussage und heisst „rechne wie ohne Anfangsbestand".
        Ein Vorbelegen mit dem Jahresanspruch sähe genauso aus wie eine
        bewusste Angabe und wäre nur zufällig richtig.
      */
      initialVacationDays: p.initialVacationDays ?? null,
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
