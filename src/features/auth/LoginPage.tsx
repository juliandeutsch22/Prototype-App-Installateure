import { useState, useEffect, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { InputField, CheckboxField } from '@/components/Field';
import BrandLogo from '@/components/BrandLogo';
import Button from '@/components/Button';

/**
 * Vor der Anmeldung ist der Mandant noch unbekannt — das Branding aus
 * companies/{companyId} steht erst danach zur Verfügung. Der Name kommt
 * deshalb aus der Deployment-Konfiguration, damit hier nicht der Name eines
 * fremden Betriebs steht.
 */
const PORTAL_NAME = import.meta.env.VITE_PORTAL_NAME || 'Installateur-Portal';

/**
 * Anmeldung. Dunkles Kopfband im Markenverlauf mit leuchtender Unterkante,
 * darunter das Formular — die Marke trägt der Kopf, nicht die Eingabefelder.
 */
export default function LoginPage() {
  const { signIn, user, error: authError, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);

  /**
   * DER KREISEL AUF DEM KNOPF BRAUCHT EIN ENDE, DAS NICHT „VERSCHWINDEN" HEISST.
   *
   * Bei einer geglückten Anmeldung endete er dadurch, dass diese Seite
   * verschwindet — `user` ist gesetzt, der Verweis unten führt ins Dashboard.
   * Für den Weg, der NICHT ins Dashboard führt, war nie eines vorgesehen:
   * scheitert das Laden des Profils, steht die Meldung darüber, und der Knopf
   * dreht sich weiter. Ein zweiter Versuch sieht dann aus wie der erste, und
   * niemand weiss, ob die App noch arbeitet oder längst aufgegeben hat.
   *
   * Zu sehen war das auf dem allerersten Bild dieses Fehlers: die rote Meldung
   * und darunter der laufende Kreisel. Es ist ein eigener Mangel, kein
   * Nebeneffekt — er trifft jede gescheiterte Anmeldung, nicht nur die des
   * globalen Administrators.
   */
  useEffect(() => {
    if (authError) setSubmitting(false);
  }, [authError]);

  // Bereits angemeldet -> direkt ins Dashboard (der Auth-Guard übernimmt die
  // Navigation; kein manuelles navigate() mit Timing-Risiko nötig).
  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    if (resetMode) {
      try {
        await resetPassword(email);
        setNotice(
          'Wenn zu dieser Adresse ein Konto besteht, wurde eine E-Mail zum Zurücksetzen versendet.',
        );
        setResetMode(false);
      } catch {
        // Bewusst dieselbe Meldung wie im Erfolgsfall: sonst ließe sich hier
        // durchprobieren, welche Adressen im System existieren.
        setNotice(
          'Wenn zu dieser Adresse ein Konto besteht, wurde eine E-Mail zum Zurücksetzen versendet.',
        );
        setResetMode(false);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      await signIn(email, password, remember);
    } catch {
      setError('Anmeldung fehlgeschlagen. E-Mail oder Passwort prüfen.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-4">
      <div className="panel w-full max-w-sm overflow-hidden shadow-lg">
        {/* Markenband: derselbe dunkle Verlauf wie Seitenleiste und Tableiste,
            abgeschlossen von der leuchtenden Kante. Das Logo steht ohne weitere
            Fassung darauf. Vor der Anmeldung ist der Mandant unbekannt, also
            die Vorgabe. */}
        <div className="panel-dark px-6 py-6 text-center">
          <BrandLogo height={52} ignoreCompany alt={PORTAL_NAME} className="mx-auto" />
          {/* Volles Weiss, nicht 85 Prozent: auf dem Telefon im Freien ist der
              abgedunkelte Text auf dem dunklen Band schlecht zu lesen.
              `text-white` und nicht `brand-fg`, weil das Band seit dem
              Erscheinungsbild-Umbau nicht mehr die Markenfarbe des Mandanten
              traegt, sondern den festen dunklen Verlauf — die Kontrastfarbe
              dazu ist Weiss, unabhaengig davon, was der Betrieb als Marke
              hinterlegt hat. */}
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-white">
            Mitarbeiter-Portal
          </p>
        </div>
        <div className="edge-accent h-[3px]" aria-hidden="true" />

        <form onSubmit={handleSubmit} className="bg-surface px-6 py-6">
          <h1 className="mb-1 text-lg font-bold text-ink">
            {resetMode ? 'Passwort zurücksetzen' : 'Anmelden'}
          </h1>
          <p className="mb-4 text-sm text-ink-muted">
            {resetMode
              ? 'E-Mail-Adresse eingeben — du bekommst einen Link zugeschickt.'
              : 'Mit den Zugangsdaten deines Betriebs anmelden.'}
          </p>

          <div className="flex flex-col gap-4">
            <InputField
              id="email"
              label="E-Mail"
              type="email"
              autoComplete="username"
              placeholder="name@firma.at"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              pflicht
            />

            {!resetMode && (
              <>
                <InputField
                  id="password"
                  label="Passwort"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  pflicht
                />
                <CheckboxField
                  id="remember"
                  label="Angemeldet bleiben"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
              </>
            )}

            {(error || authError) && (
              <p className="rounded-sm bg-danger-bg p-2 text-sm text-danger" role="alert">
                {error ?? authError}
              </p>
            )}
            {notice && (
              <p className="rounded-sm bg-success-bg p-2 text-sm text-success" role="status">
                {notice}
              </p>
            )}

            <Button
              type="submit"
              variant="accent"
              loading={submitting}
              className="w-full justify-center"
            >
              {resetMode ? 'Link anfordern' : 'Anmelden'}
            </Button>
          </div>

          <p className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setResetMode(!resetMode);
                setError(null);
                setNotice(null);
              }}
              className="min-h-touch text-xs text-ink-muted underline underline-offset-2 hover:text-brand"
            >
              {resetMode ? 'Zurück zur Anmeldung' : 'Passwort vergessen?'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
