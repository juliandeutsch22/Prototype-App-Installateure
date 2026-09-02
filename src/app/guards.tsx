import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { LoadingState } from '@/components/States';
import { aktiveModule, modul, type ModulId } from '@/lib/module';
import { isTopLevel } from '@/lib/permissions';
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
      <div className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold text-ink">Kein Zugriff</h1>
        <p className="mt-2 text-ink-muted">
          Deine Rolle ({user.role}) hat keinen Zugriff auf diesen Bereich.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Schützt Routen, deren Bereich der Betrieb abgeschaltet hat.
 *
 * WARUM DAS NEBEN DER NAVIGATION NOCH BRAUCHT: den Eintrag auszublenden nimmt
 * nur den Weg weg, nicht die Adresse. Ein Lesezeichen, ein alter Link in einer
 * E-Mail oder der Zurück-Knopf führen weiter hinein — und dort stünde dann
 * eine Ansicht, die Daten eines Bereichs zeigt, den es für diesen Betrieb
 * nicht geben soll.
 *
 * Die Meldung sagt, WAS los ist und WER es ändern kann. „Kein Zugriff" wäre
 * hier falsch: es liegt nicht an der Rolle, sondern an einer Einstellung.
 */
export function RequireModul({ id, children }: { id: ModulId; children: ReactNode }) {
  const { user, company } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (aktiveModule(company?.modules).has(id)) return <>{children}</>;

  const m = modul(id);
  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-xl font-semibold text-ink">{m?.name ?? 'Dieser Bereich'} ist ausgeschaltet</h1>
      <p className="mt-2 text-ink-muted">
        Der Betrieb benutzt diesen Bereich zurzeit nicht. Vorhandene Daten bleiben
        erhalten — sie sind nur nicht erreichbar, solange das Modul aus ist.
      </p>
      {isTopLevel(user.role) ? (
        <p className="mt-4">
          <Link to="/modules" className="font-semibold text-brand underline">
            Unter „Module" wieder einschalten
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">
          Einschalten kann das die Geschäftsführung unter „Module".
        </p>
      )}
    </div>
  );
}
