import { useState, useEffect, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { InputField, CheckboxField } from '@/components/Field';
import ProduktMarke from '@/components/ProduktMarke';
import RechtLinks from '@/components/RechtLinks';
import Button from '@/components/Button';
import { anmeldeAdresse, istBenutzerkonto, KEIN_MAILKONTO } from '@shared/benutzername';

/**
 * Anmeldung. Dunkles Kopfband mit der Produktmarke, darunter das Formular —
 * die Marke trägt der Kopf, nicht die Eingabefelder.
 *
 * HIER STEHT DAS PRODUKT UND NICHT DER BETRIEB. Vor der Anmeldung ist der
 * Mandant unbekannt: das Branding aus `companies/{id}` gibt es erst danach.
 * Bis hierher sprang deshalb eine Vorgabe ein — und die trug das Logo des
 * ersten Kunden. Ein zweiter Betrieb hätte sich unter fremdem Zeichen
 * angemeldet. Jetzt steht dort Senklot, und der Betrieb erscheint ab der
 * ersten Seite nach der Anmeldung (siehe `BrandLogo` in `Layout`).
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
      /*
        EIN BENUTZERNAME BEKOMMT KEINEN LINK — und das wird gesagt, nicht
        verschwiegen. Die übliche Antwort („wenn es ein Konto gibt, ist eine
        Mail unterwegs") wäre hier eine Lüge: es gibt kein Postfach. Verraten
        wird dabei nichts; die Auskunft folgt aus der Schreibweise, nicht
        daraus, ob es den Namen gibt.
      */
      if (istBenutzerkonto(anmeldeAdresse(email))) {
        setNotice(KEIN_MAILKONTO);
        setSubmitting(false);
        return;
      }
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
      setError('Anmeldung fehlgeschlagen. E-Mail bzw. Benutzername und Passwort prüfen.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-bg p-4">
      <div className="karte-anmeldung">
        {/* Markenband: dieselbe dunkle Trägerfläche wie Seitenleiste und
            Tableiste. Die Marke steht ohne weitere Fassung darauf. */}
        <div className="panel-dark px-6 py-6 text-center">
          <ProduktMarke hoehe={44} className="text-white" />
          {/* Volles Weiss, nicht 85 Prozent: auf dem Telefon im Freien ist der
              abgedunkelte Text auf dem dunklen Band schlecht zu lesen.
              `text-white` und nicht `brand-fg`, weil das Band nicht die
              Markenfarbe des Mandanten traegt, sondern die feste dunkle
              Flaeche — die Kontrastfarbe dazu ist Weiss, unabhaengig davon,
              was der Betrieb als Marke hinterlegt hat. */}
          <p className="mt-3 text-sm font-semibold text-white">
            Mitarbeiter-Portal
          </p>
        </div>
        {/* KEIN STREIFEN MEHR ZWISCHEN KOPF UND FORMULAR. Hier lag die
            leuchtende Kante aus Cyan und Mint — eine dritte Farbe, die das
            Zeichen selbst nicht kennt. Die Kante zwischen dunkler Fläche und
            weissem Formular ist die Trennung; ein Streifen darauf wäre eine
            zweite für dieselbe Sache. */}

        <form onSubmit={handleSubmit} className="bg-surface px-6 py-6">
          <h1 className="mb-1 text-xl font-semibold text-ink">
            {resetMode ? 'Passwort zurücksetzen' : 'Anmelden'}
          </h1>
          <p className="mb-4 text-sm text-ink-muted">
            {resetMode
              ? 'E-Mail-Adresse eingeben — du bekommst einen Link zugeschickt. '
                + 'Wer sich mit Benutzernamen anmeldet, bekommt ein neues Passwort vom Büro.'
              : 'Mit den Zugangsdaten deines Betriebs anmelden.'}
          </p>

          <div className="flex flex-col gap-4">
            {/*
              KEIN `type="email"` MEHR, auch nicht beim Zurücksetzen: der
              Browser wiese einen Benutzernamen ohne `@` sonst schon vor dem
              Absenden ab — und der Hinweis, dass es dafür keinen Link gibt,
              käme nie an. `inputMode` behält die Tastatur mit dem `@`.
            */}
            <InputField
              id="email"
              label={resetMode ? 'E-Mail' : 'E-Mail oder Benutzername'}
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={resetMode ? 'name@firma.at' : 'name@firma.at oder benutzername'}
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
              <p className="rounded-sm border border-line bg-surface-2 p-2 text-sm text-danger" role="alert">
                {error ?? authError}
              </p>
            )}
            {notice && (
              <p className="rounded-sm border border-line bg-surface-2 p-2 text-sm text-success" role="status">
                {notice}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
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
      {/* Vor der Anmeldung erreichbar — das Impressum verlangt es (§ 5 ECG). */}
      <RechtLinks className="text-xs text-ink-muted" />
    </div>
  );
}
