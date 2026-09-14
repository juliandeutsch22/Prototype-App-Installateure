/**
 * Ein Anmeldekonto anlegen — die Edge Function gegen den laufenden Stapel.
 *
 * WAS SIE ERSETZT UND WARUM. Die App rief bis hierher `auth.signUp` aus dem
 * Browser, mit dem ÖFFENTLICHEN Schlüssel. Das verlangt im Projekt den
 * Schalter „Allow new users to sign up" — und der ist aus, zu Recht: der
 * Schlüssel steht im ausgelieferten JavaScript, und eingeschaltet könnte sich
 * jeder, der ihn dort abliest, selbst ein Konto anlegen.
 *
 * WAS HIER AUF DEM PRÜFSTAND STEHT, ist deshalb nicht der glückliche Fall
 * allein, sondern die ABWEISUNG: ohne Anmeldung, mit der falschen Rolle, mit
 * einem deaktivierten Konto. Eine Function, die anlegt, wenn sie soll, aber
 * niemanden abweist, hätte das Loch bloss verschoben — vom Schalter in den
 * Quelltext.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, API, ANON, betriebAnlegen, konto, type Konto } from './helfer';

const FUNKTION = `${API}/functions/v1/mitarbeiter-anlegen`;
const BETRIEB = 'anlegen-a';

let chefin: Konto;
let monteur: Konto;
let gesperrt: Konto;

/** Ein Ruf an die Function, so wie ihn der Browser absetzt. */
async function anlegen(token: string | null, rumpf: unknown) {
  const kopf: Record<string, string> = { apikey: ANON, 'Content-Type': 'application/json' };
  if (token) kopf.Authorization = `Bearer ${token}`;
  const antwort = await fetch(FUNKTION, {
    method: 'POST', headers: kopf, body: JSON.stringify(rumpf),
  });
  return { status: antwort.status, daten: await antwort.json().catch(() => ({})) };
}

const frischeAdresse = () => `neu-${crypto.randomUUID().slice(0, 8)}@${BETRIEB}.test`;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'chefin');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'monteur');
  gesperrt = await konto(BETRIEB, 'Geschäftsführung', 'gesperrt', false);
}, 180_000);

describe('Wer ein Konto anlegen darf', () => {
  it('die Geschäftsführung — und das Konto ist sofort benutzbar', async () => {
    const email = frischeAdresse();
    const { status, daten } = await anlegen(chefin.token, { email, passwort: 'Anfang-2026!' });

    expect(status).toBe(200);
    expect(typeof daten.uid).toBe('string');

    /*
      DIE ADRESSE MUSS BESTÄTIGT SEIN. Im Projekt steht „Confirm email" an;
      ohne `email_confirm` käme der Mitarbeiter bis zu seinem Klick in einer
      Mail nicht hinein — und genau das war der Zustand, der hier behoben
      wird. Eine Prüfung auf „angelegt" allein hätte das nicht gesehen.
    */
    const { data } = await admin.auth.admin.getUserById(String(daten.uid));
    expect(data.user?.email_confirmed_at).toBeTruthy();
  }, 120_000);

  it('ein Monteur nicht', async () => {
    const { status } = await anlegen(monteur.token, {
      email: frischeAdresse(), passwort: 'Anfang-2026!',
    });
    expect(status).toBe(403);
  }, 120_000);

  it('ein deaktiviertes Konto nicht — und die Abweisung kommt früher als gedacht', async () => {
    /*
      HIER HATTE ICH EINE FALSCHE ERWARTUNG, und sie gehört aufgeschrieben.

      Gerechnet hatte ich mit 403: die Function fragt die Belegschaftstabelle,
      findet `active = false` und weist ab. Es kommt aber 401, und zwar eine
      Schicht früher — `app.konto_sperren` setzt beim Deaktivieren
      `banned_until` im Anmeldedienst UND löscht die offenen Sitzungen. Das
      Token ist damit tot, bevor diese Function es überhaupt anschaut.

      Das ist das STÄRKERE Verhalten, nicht das schwächere. Die Prüfung ist
      deshalb an die Wirklichkeit angepasst worden und nicht die Function an
      die Prüfung — ein 403er-Pfad, nur damit meine Annahme stimmt, wäre eine
      Verschlechterung mit grünem Haken.

      Die Tabellenabfrage bleibt trotzdem nötig: sie trägt den ROLLENwechsel
      (Geschäftsführung wird Monteur), und der sperrt kein Konto.
    */
    const { status } = await anlegen(gesperrt.token, {
      email: frischeAdresse(), passwort: 'Anfang-2026!',
    });
    expect(status).toBe(401);
  }, 120_000);

  it('niemand ohne Anmeldung', async () => {
    const { status } = await anlegen(null, {
      email: frischeAdresse(), passwort: 'Anfang-2026!',
    });
    expect(status).toBe(401);
  }, 120_000);
});

describe('Was abgewiesen wird', () => {
  it('eine schon vergebene Adresse — mit einem Satz, der die Adresse nennt', async () => {
    const email = frischeAdresse();
    await anlegen(chefin.token, { email, passwort: 'Anfang-2026!' });
    const { status, daten } = await anlegen(chefin.token, { email, passwort: 'Anfang-2026!' });

    expect(status).toBe(409);
    // Ohne die Adresse im Text sucht die Verwaltung im falschen Formular.
    expect(String(daten.error)).toContain(email);
  }, 120_000);

  it('eine unbrauchbare Adresse und ein zu kurzes Passwort', async () => {
    const ohneAt = await anlegen(chefin.token, { email: 'keinemail', passwort: 'Anfang-2026!' });
    expect(ohneAt.status).toBe(400);

    const kurz = await anlegen(chefin.token, { email: frischeAdresse(), passwort: 'kurz' });
    expect(kurz.status).toBe(400);
  }, 120_000);
});

describe('Die Zeile in der Belegschaft bleibt Sache des Browsers', () => {
  it('die Function legt KEINE an', async () => {
    /*
      DER WICHTIGSTE SATZ AN DIESER FUNCTION, und er steht als Prüfung da,
      damit ihn niemand später „vereinfacht": auf `users` liegen
      `users_anlegen` (verlangt `app.ist_spitze()`) und der Trigger
      `users_adminrolle`. Beide lesen den Anspruch aus dem Token des
      Aufrufers. Schriebe die Function die Zeile mit dem Dienstschlüssel,
      gälte keine der beiden Regeln mehr — aus einer Absicherung würde ein
      Loch, das niemandem auffiele, weil alles weiter funktioniert.
    */
    const email = frischeAdresse();
    const { status, daten } = await anlegen(chefin.token, { email, passwort: 'Anfang-2026!' });

    /*
      ERST BELEGEN, DASS ES GEKLAPPT HAT. Ohne diese Zeile war die Prüfung
      hohl: bei einer Function, die gar nicht antwortet, ist `uid` leer, es
      gibt keine Zeile — und sie wurde grün. Genau dieser Fall ist hier beim
      ersten Lauf eingetreten.
    */
    expect(status).toBe(200);
    expect(typeof daten.uid).toBe('string');

    const { data } = await admin.from('users').select('id').eq('id', String(daten.uid));
    expect(data ?? []).toHaveLength(0);
  }, 120_000);
});
