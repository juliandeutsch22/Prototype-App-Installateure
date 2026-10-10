import { useAuth } from '@/app/AuthContext';
import { ansicht } from '@/lib/ansichten';

// Unter „/invoices“ angemeldet: das Vorladen holt auch den eigentlichen Baustein.
const InvoicesView = ansicht('/invoices', () => import('./InvoicesView'));
const RechnungenLesen = ansicht('/invoices', () => import('./RechnungenLesen'));

/**
 * Wer unter „Rechnungen“ was bekommt: die Projektleitung (nur mit Freigabe,
 * siehe `navigation.ts`) die Leseliste ihrer Baustellen, alle anderen die
 * Rechnungsverwaltung wie bisher (M38).
 */
export default function RechnungenSeite() {
  const { user } = useAuth();
  return user?.role === 'Projektleiter' ? <RechnungenLesen /> : <InvoicesView />;
}
