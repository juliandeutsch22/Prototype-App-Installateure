import { useNavigate } from 'react-router-dom';
import Button from '@/components/Button';
import { Marke } from '@/components/Badge';
import { useModul } from '@/lib/useModule';
import type { TimeEntry } from '@/types';

/**
 * Statt „Bearbeiten" und „Löschen" bei einem Tag aus einem genehmigten Antrag.
 *
 * Die Datenbank lässt diesen Tag nur über den Antrag ändern („zurücknehmen"
 * auf der Seite Urlaub). Zwei Knöpfe anzubieten, die dann abgewiesen werden,
 * wäre die Sackgasse, die bei Krank schon einmal da war.
 *
 * Ohne das Modul Urlaub gibt es die Seite nicht — dann steht nur da, woher
 * der Tag kommt.
 */
export default function AntragKnopf({ eintrag }: { eintrag: Pick<TimeEntry, 'status'> }) {
  const navigate = useNavigate();
  const urlaubAn = useModul('urlaub');
  const wort = eintrag.status === 'Zeitausgleich' ? 'ZA-Antrag' : 'Urlaubsantrag';
  if (!urlaubAn) return <Marke>aus {wort}</Marke>;
  return (
    <Button variant="ghost" onClick={() => navigate('/vacations')}>
      {wort}
    </Button>
  );
}
