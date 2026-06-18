import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { navForRole } from '@/app/navigation';
import Card from '@/components/Card';

/** Rollen-spezifisches Zuhause mit Schnellzugriffen. */
export default function DashboardView() {
  const { user, company } = useAuth();
  if (!user) return null;

  const items = navForRole(user.role).filter((i) => i.path !== '/');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Willkommen, {user.name.split(' ')[0]}
        </h1>
        <p className="text-gray-500">
          {company?.name ?? 'Installateur-App'} · Rolle: {user.role}
        </p>
      </div>

      <Card title="Schnellzugriff">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="flex min-h-touch items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-4 text-center font-medium text-gray-800 hover:border-brand hover:bg-white"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </Card>

      <Card title="KI-Erfassung">
        <p className="mb-3 text-gray-600">
          Sprich 15 Sekunden — Zeit, Material und Folgetermin werden automatisch
          als bestätigbare Karten vorbereitet. Nichts wird ohne deine Bestätigung
          gespeichert.
        </p>
        <Link
          to="/voice"
          className="inline-flex min-h-touch items-center rounded-lg bg-brand px-4 py-2 font-medium text-brand-fg hover:opacity-90"
        >
          🎤 Spracherfassung starten
        </Link>
      </Card>
    </div>
  );
}
