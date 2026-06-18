import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { LoadingState } from '@/components/States';
import type { Role } from '@/types';

/** Schützt Routen: ohne Anmeldung -> Login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState label="Anmeldung wird geprüft …" />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

/** Schützt Routen rollenbasiert. UI-Schutz — Server-Rules sind die Wahrheit. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold text-ink">Kein Zugriff</h1>
        <p className="mt-2 text-ink-muted">
          Deine Rolle ({user.role}) hat keinen Zugriff auf diesen Bereich.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
