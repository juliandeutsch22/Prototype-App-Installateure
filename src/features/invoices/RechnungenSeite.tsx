import { lazy } from 'react';
import { useAuth } from '@/app/AuthContext';

const InvoicesView = lazy(() => import('./InvoicesView'));
const RechnungenLesen = lazy(() => import('./RechnungenLesen'));

/**
 * Wer unter „Rechnungen“ was bekommt: die Projektleitung (nur mit Freigabe,
 * siehe `navigation.ts`) die Leseliste ihrer Baustellen, alle anderen die
 * Rechnungsverwaltung wie bisher (M38).
 */
export default function RechnungenSeite() {
  const { user } = useAuth();
  return user?.role === 'Projektleiter' ? <RechnungenLesen /> : <InvoicesView />;
}
