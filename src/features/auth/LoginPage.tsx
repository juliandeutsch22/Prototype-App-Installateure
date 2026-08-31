import { useState, type FormEvent } from 'react';
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
 * Anmeldung. Aufbau wie im Prototyp: blaues Kopfband mit roter Unterkante,
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
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
        {/* Markenband: Perl-Blau mit roter Unterkante. Das Logo bringt seinen
            eigenen roten Kasten mit und steht deshalb ohne weitere Fassung
            darauf — Blau als Fläche, Rot als Marke, wie in der ganzen App.
            Vor der Anmeldung ist der Mandant unbekannt, also die Vorgabe. */}
        <div className="border-b-[3px] border-b-accent bg-brand px-6 py-6 text-center">
          <BrandLogo height={52} ignoreCompany alt={PORTAL_NAME} className="mx-auto" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-brand-fg/85">
            Mitarbeiter-Portal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6">
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
