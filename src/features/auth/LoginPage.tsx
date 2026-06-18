import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { InputField } from '@/components/Field';
import Button from '@/components/Button';

export default function LoginPage() {
  const { signIn, user, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bereits angemeldet -> direkt ins Dashboard (der Auth-Guard übernimmt die
  // Navigation; kein manuelles navigate() mit Timing-Risiko nötig).
  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch {
      setError('Anmeldung fehlgeschlagen. E-Mail oder Passwort prüfen.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Anmelden</h1>
        <p className="mb-6 text-sm text-gray-500">Installateur-App</p>

        <div className="flex flex-col gap-4">
          <InputField
            id="email"
            label="E-Mail"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <InputField
            id="password"
            label="Passwort"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {(error || authError) && (
            <p className="rounded-md bg-red-50 p-2 text-sm text-red-700" role="alert">
              {error ?? authError}
            </p>
          )}

          <Button type="submit" loading={submitting} className="w-full">
            Anmelden
          </Button>
        </div>
      </form>
    </div>
  );
}
