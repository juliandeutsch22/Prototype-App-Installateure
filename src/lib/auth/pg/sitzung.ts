/**
 * Die Anmeldung auf Supabase Auth.
 *
 * DREI UNTERSCHIEDE ZU FIREBASE, und alle drei haben Folgen:
 *
 * 1. ES GIBT KEINEN ZWISCHENSPEICHER. Das Firestore-SDK legt jedes gelesene
 *    Dokument von selbst ab, und der Start las daraus, bevor er das Netz
 *    fragte. Supabase tut das nicht. Ohne Ersatz stünde der Monteur im Keller
 *    bei jedem Start vor einem Ladebalken — genau die Sekunden, die dieses
 *    Projekt einmal mühsam weggeräumt hat. Deshalb führt diese Datei einen
 *    eigenen, kleinen Zwischenspeicher.
 *
 * 2. DIE SITZUNGSDAUER WIRD NICHT BEIM ANMELDEN GEWÄHLT, sondern am Speicher.
 *    `browserLocalPersistence` gibt es nicht; stattdessen entscheidet ein
 *    Adapter, ob die Sitzung im `localStorage` oder im `sessionStorage`
 *    landet. Siehe `sitzungsSpeicher` in `lib/supabase.ts`.
 *
 * 3. DAS PROFIL STEHT IN EINER TABELLE MIT ZEILENSCHUTZ. Ein Konto ohne Zeile
 *    in der Belegschaft bekommt keine Fehlermeldung, sondern eine leere
 *    Antwort — anders als unter Firestore, wo die fehlende Zeile einen
 *    abgewiesenen Zugriff ergab. Für den globalen Administrator ist das der
 *    ruhigere Weg.
 */
import type { Company, CurrentUser, Role } from '@/types';
import { supabaseClient, merkenSetzen } from '@/lib/supabase';
import { InactiveUserError, type Angemeldet } from '../kern';

/** Wo der eigene Zwischenspeicher liegt. */
const SPEICHER = 'perl.sitzung';

interface Gemerkt {
  profil: CurrentUser;
  firma: Company | null;
}

function lesen(uid: string): Gemerkt | null {
  try {
    const roh = localStorage.getItem(`${SPEICHER}.${uid}`);
    return roh ? (JSON.parse(roh) as Gemerkt) : null;
  } catch {
    // Privates Fenster oder blockierte Website-Daten: dann eben ohne.
    return null;
  }
}

export function beiAenderung(ruf: (wer: Angemeldet | null) => void): () => void {
  const c = supabaseClient();
  /*
    `onAuthStateChange` meldet sich beim Anhängen SOFORT mit dem aktuellen
    Stand — auch mit `null`, wenn noch keine Sitzung wiederhergestellt ist.
    Genau wie `onAuthStateChanged` bei Firebase; die Ansicht braucht also
    keinen zweiten Weg für „beim Start schon angemeldet".
  */
  const { data } = c.auth.onAuthStateChange((_ereignis, sitzung) => {
    const nutzer = sitzung?.user;
    ruf(nutzer ? { uid: nutzer.id, email: nutzer.email ?? '' } : null);
  });
  return () => data.subscription.unsubscribe();
}

export async function anmelden(
  email: string, passwort: string, merken: boolean,
): Promise<void> {
  /*
    DIE ENTSCHEIDUNG FÄLLT VOR DEM ANMELDEN, nicht danach: der Adapter muss
    schon wissen, wohin die Sitzung geschrieben wird, wenn sie entsteht.
  */
  merkenSetzen(merken);
  const { error } = await supabaseClient().auth.signInWithPassword({
    email, password: passwort,
  });
  if (error) throw new Error(error.message);
}

export async function abmelden(): Promise<void> {
  const { error } = await supabaseClient().auth.signOut();
  if (error) throw new Error(error.message);
}

export async function passwortZuruecksetzen(email: string): Promise<void> {
  const { error } = await supabaseClient().auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message);
}

/**
 * Trägt das vorliegende Token den Plattform-Anspruch?
 *
 * Gelesen wird die Sitzung, die ohnehin im Speicher liegt — keine Netzrunde.
 * Das ist eine ANZEIGEFRAGE und keine Sicherheitsgrenze: die steht in den
 * Zeilenregeln und in der Edge Function, die den Betrieb anlegt. Ein
 * gefälschter Anspruch brächte hier nur eine Seite zum Vorschein, auf der
 * jeder Knopf serverseitig abgewiesen würde.
 */
export async function istPlattformAdmin(): Promise<boolean> {
  const { data } = await supabaseClient().auth.getSession();
  return data.session?.user?.app_metadata?.plattform_admin === true;
}

/**
 * Ein Konto anlegen, OHNE die eigene Sitzung zu verlieren.
 *
 * Unter Firebase brauchte es dafür eine zweite App — `createUserWithEmail`
 * meldet den Angelegten sofort an. Hier legt `signUp` die Sitzung nur dann um,
 * wenn keine besteht; um das gar nicht erst zu riskieren, geht der Aufruf
 * über einen EIGENEN Client, der nichts speichert. Die Sitzung der Verwaltung
 * bleibt unberührt.
 */
export async function kontoAnlegen(email: string, passwort: string): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const einweg = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await einweg.auth.signUp({ email, password: passwort });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Das Konto wurde nicht angelegt.');
  return data.user.id;
}

function profilAus(
  zeile: Record<string, unknown> | null, uid: string, email: string,
): CurrentUser | null {
  if (!zeile) return null;
  const companyId = zeile.company_id as string | undefined;
  const role = zeile.role as Role | undefined;
  if (!companyId || !role) return null;
  if (zeile.active === false) throw new InactiveUserError();
  return {
    uid,
    email: (zeile.email as string) ?? email,
    name: (zeile.name as string) ?? email,
    role,
    companyId,
    docId: uid,
  };
}

/**
 * Das Profil aus dem eigenen Zwischenspeicher — ohne Netz, in Millisekunden.
 *
 * Ein veraltetes Profil ist dabei ungefährlich: die harte Grenze steht
 * serverseitig, und ein deaktiviertes Konto wird auch hier abgewiesen, weil
 * der Merker `active` mitgeschrieben wird.
 */
export function profilSchnell(uid: string, email: string): Promise<CurrentUser | null> {
  const gemerkt = lesen(uid);
  if (!gemerkt) return Promise.resolve(null);
  /*
    Die Adresse aus der Anmeldung schlägt die gemerkte: hat jemand sie
    geändert, stünde sonst bis zum nächsten Netzabruf die alte in der
    Kopfzeile. Alles andere kommt aus dem Zwischenspeicher.
  */
  return Promise.resolve({ ...gemerkt.profil, email: gemerkt.profil.email || email });
}

export async function profilVomServer(
  uid: string, email: string,
): Promise<CurrentUser | null> {
  const c = supabaseClient();
  const { data, error } = await c.from('users').select('*').eq('id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return profilAus(data as Record<string, unknown>, uid, email);

  /*
    KEINE ZEILE — UND DAS HEISST ZWEIERLEI.

    Gemessen, nicht vermutet: wird jemand MITTEN IN DER SITZUNG deaktiviert,
    filtert der Zeilenschutz seine eigene Zeile weg. Die Abfrage gelingt und
    liefert nichts — genau wie bei einem Konto, das gar kein Profil hat (dem
    globalen Administrator). `active: false` ist dabei nirgends zu sehen.

    Ohne diese Rückfrage stünde vor dem gerade Ausgeschiedenen „Kein
    Benutzerprofil für dieses Konto gefunden". Nicht falsch, und trotzdem die
    schlechtere Auskunft: er soll lesen, dass sein Zugang beendet wurde, und
    nicht raten, ob etwas kaputt ist.

    `public.mein_zustand()` sieht an der Zeilenregel vorbei und gibt zwei
    Wahrheitswerte über den AUFRUFER zurück — sonst nichts.
  */
  const { data: zustand } = await c.rpc('mein_zustand');
  const z = zustand as { vorhanden?: boolean; aktiv?: boolean } | null;
  if (z?.vorhanden && z.aktiv === false) throw new InactiveUserError();
  return null;
}

export function firmaSchnell(companyId: string): Promise<Company | null> {
  /*
    Die Firma liegt beim Profil, nicht unter eigenem Schlüssel: gesucht wird
    sie ohnehin nur zu der Anmeldung, zu der sie gehört, und zwei Einträge
    könnten auseinanderlaufen.
  */
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const schluessel = localStorage.key(i);
      if (!schluessel?.startsWith(`${SPEICHER}.`)) continue;
      const gemerkt = JSON.parse(localStorage.getItem(schluessel) ?? 'null') as Gemerkt | null;
      if (gemerkt?.firma?.id === companyId) return Promise.resolve(gemerkt.firma);
    }
  } catch {
    /* ohne Zwischenspeicher eben ohne */
  }
  return Promise.resolve(null);
}

/**
 * Profil und Firma für den nächsten Start ablegen.
 *
 * Unter Firestore tut das der SDK-Zwischenspeicher von selbst; hier muss es
 * jemand tun, sonst beginnt jeder Start wieder mit einem Ladebalken.
 */
export function profilMerken(profil: CurrentUser, firma: Company | null): void {
  try {
    localStorage.setItem(
      `${SPEICHER}.${profil.uid}`,
      JSON.stringify({ profil, firma } satisfies Gemerkt),
    );
  } catch {
    /* nicht schlimm — dann eben beim nächsten Mal wieder vom Netz */
  }
}
