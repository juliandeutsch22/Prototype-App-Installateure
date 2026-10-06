/**
 * Die Zwei-Faktor-Anmeldung über Supabase Auth (Testbericht Runde 3, H1).
 *
 * TOTP: die Person scannt einmal einen QR-Code mit einer Authenticator-App
 * und gibt danach bei jeder Anmeldung den sechsstelligen Code ein.
 *
 * WER ES BRAUCHT, entscheidet die Datenbank (`app.zweiter_faktor_verlangt`):
 * das Plattformkonto immer, die Leitung eines Betriebs mit eingeschalteter
 * Pflicht, und jedes Konto, das einen zweiten Faktor eingerichtet hat. Ohne
 * ihn liefert jede Zeilenregel nichts. Diese Datei sagt der Oberfläche nur,
 * welche Seite sie zeigen muss.
 */
import { supabaseClient } from '@/lib/supabase';

/** Was nach dem Passwort noch fehlt. */
export type ZweiterFaktorBedarf = 'keiner' | 'pruefen' | 'einrichten';

export interface ZweiterFaktorStand {
  /** Wird der Person die Einrichtung angeboten (Leitung, Plattform)? */
  angeboten: boolean;
  /** Muss sie einen haben? */
  pflicht: boolean;
  plattform: boolean;
  /** Ist im Betrieb die Pflicht für die Leitung eingeschaltet? */
  betriebPflicht: boolean;
  eingerichtet: boolean;
  codesOffen: number;
  codeZuletztVerwendet: string | null;
}

const LEITUNG = ['Administrator', 'Geschäftsführung'];

function fehlerText(e: { message: string } | null | undefined, sonst: string): string {
  return e?.message || sonst;
}

export async function zweiterFaktorStand(): Promise<ZweiterFaktorStand> {
  const { data, error } = await supabaseClient().rpc('mein_zweiter_faktor');
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    angeboten: d.angeboten === true,
    pflicht: d.pflicht === true,
    plattform: d.plattform === true,
    betriebPflicht: d.betrieb_pflicht === true,
    eingerichtet: d.eingerichtet === true,
    codesOffen: Number(d.codes_offen ?? 0),
    codeZuletztVerwendet: (d.code_zuletzt_verwendet as string | null) ?? null,
  };
}

/**
 * Welche Seite nach dem Passwort kommt.
 *
 * MEIST OHNE NETZ: Stufe der Sitzung und eingerichtete Faktoren stehen in der
 * Sitzung selbst. Nur wer zur Leitung gehört und noch keinen Faktor hat,
 * kostet eine Abfrage — ob sein Betrieb ihn verlangt, weiss nur die
 * Datenbank. Scheitert sie (kein Netz), geht es ohne weiter: die Grenze steht
 * ohnehin in der Datenbank, und dort fiele dann jede Abfrage leer aus.
 */
export async function zweiterFaktorBedarf(): Promise<ZweiterFaktorBedarf> {
  const c = supabaseClient();
  const { data, error } = await c.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return 'keiner';
  if (data.currentLevel === 'aal2') return 'keiner';
  if (data.nextLevel === 'aal2') return 'pruefen';
  const { data: s } = await c.auth.getSession();
  const meta = (s.session?.user?.app_metadata ?? {}) as Record<string, unknown>;
  if (meta.plattform_admin === true) return 'einrichten';
  if (!LEITUNG.includes(String(meta.role ?? ''))) return 'keiner';
  try {
    const stand = await Promise.race([
      zweiterFaktorStand(),
      new Promise<null>((fertig) => setTimeout(() => fertig(null), 6000)),
    ]);
    return stand?.pflicht && !stand.eingerichtet ? 'einrichten' : 'keiner';
  } catch {
    return 'keiner';
  }
}

export interface NeuerFaktor {
  faktorId: string;
  /** Ein Bild (SVG als Daten-URL) zum Scannen. */
  qrCode: string;
  /** Dasselbe zum Abtippen, falls die Kamera nicht will. */
  geheimnis: string;
}

/**
 * Einrichtung beginnen. Liegt von einem abgebrochenen Versuch ein
 * unbestätigter Faktor herum, wird er vorher entfernt — sonst stünden nach
 * drei Versuchen drei halbe Faktoren im Konto.
 */
export async function einrichtenBeginnen(): Promise<NeuerFaktor> {
  const c = supabaseClient();
  const { data: liste } = await c.auth.mfa.listFactors();
  for (const f of liste?.all ?? []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') {
      await c.auth.mfa.unenroll({ factorId: f.id }).catch(() => undefined);
    }
  }
  const { data, error } = await c.auth.mfa.enroll({
    factorType: 'totp',
    // Eindeutig je Versuch: der Dienst verlangt eindeutige Namen je Konto.
    friendlyName: `Senklot ${new Date().toISOString().slice(0, 16)}`,
  });
  if (error || !data) throw new Error(fehlerText(error, 'Die Einrichtung ließ sich nicht beginnen.'));
  return { faktorId: data.id, qrCode: data.totp.qr_code, geheimnis: data.totp.secret };
}

function codeFehler(e: { message: string } | null): Error {
  return new Error(
    /invalid totp|invalid code|expired/i.test(e?.message ?? '')
      ? 'Der Code stimmt nicht. Bitte den aktuellen Code aus der Authenticator-App eingeben.'
      : fehlerText(e, 'Der Code ließ sich nicht prüfen.'),
  );
}

/** Mit dem ersten Code bestätigen; gibt die zehn Wiederherstellungscodes zurück. */
export async function einrichtenBestaetigen(faktorId: string, code: string): Promise<string[]> {
  const c = supabaseClient();
  const { error } = await c.auth.mfa.challengeAndVerify({ factorId: faktorId, code: code.replace(/\s/g, '') });
  if (error) throw codeFehler(error);
  return neueCodes();
}

/** Neue Wiederherstellungscodes — die alten gelten danach nicht mehr. */
export async function neueCodes(): Promise<string[]> {
  const { data, error } = await supabaseClient().rpc('zwei_faktor_codes_erzeugen');
  if (error) throw new Error(error.message);
  return (data ?? []) as string[];
}

/** Bei der Anmeldung: den Code des eingerichteten Faktors prüfen. */
export async function codePruefen(code: string): Promise<void> {
  const c = supabaseClient();
  const { data, error } = await c.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  const faktor = data?.totp?.[0];
  if (!faktor) throw new Error('Für dieses Konto ist kein zweiter Faktor eingerichtet.');
  const { error: e2 } = await c.auth.mfa.challengeAndVerify({ factorId: faktor.id, code: code.replace(/\s/g, '') });
  if (e2) throw codeFehler(e2);
}

/**
 * Einen Wiederherstellungscode einlösen: der zweite Faktor ist danach
 * entfernt. Die Sitzung wird erneuert, damit sie das weiss — wer ihn braucht,
 * richtet ihn dann sofort neu ein.
 */
export async function codeEinloesen(code: string): Promise<void> {
  const c = supabaseClient();
  const { data, error } = await c.rpc('zwei_faktor_code_einloesen', { p_code: code });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error('Dieser Wiederherstellungscode gilt nicht (mehr).');
  const { error: e2 } = await c.auth.refreshSession();
  if (e2) throw new Error(e2.message);
}

/** Den zweiten Faktor ausschalten — nur, wo er keine Pflicht ist. */
export async function ausschalten(): Promise<void> {
  const c = supabaseClient();
  const { data, error } = await c.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  for (const f of data?.all ?? []) {
    const { error: e2 } = await c.auth.mfa.unenroll({ factorId: f.id });
    if (e2) throw new Error(e2.message);
  }
  const { error: e3 } = await c.rpc('zwei_faktor_codes_verwerfen');
  if (e3) throw new Error(e3.message);
  await c.auth.refreshSession().catch(() => undefined);
}
