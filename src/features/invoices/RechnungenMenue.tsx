import { useNavigate } from 'react-router-dom';
import RowMenu from '@/components/RowMenu';

/**
 * Das ⋯ im Seitenkopf der Rechnungen — seltene Seitenaktionen (Regel 2).
 * Bisher eine: der Abgleich des Kontoauszugs (F13), einmal je Auszug.
 */
export default function RechnungenMenue() {
  const navigate = useNavigate();
  return (
    <RowMenu about="Rechnungen" items={[{ label: 'Kontoauszug abgleichen', onSelect: () => navigate('/invoices/kontoauszug') }]} />
  );
}
