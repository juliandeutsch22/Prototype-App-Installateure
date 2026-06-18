import Card from '@/components/Card';

/**
 * Platzhalter für die iterativ zu portierenden Views (Phase 4, Spec §8):
 * Material/Bestellung, Baustellen, Einsatzplanung, Rechnungen, Buchhaltung.
 * Bewusst noch nicht gebaut — erst nach dem vertikalen Schnitt + KI-Moment.
 */
export default function PlaceholderView({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <Card>
        <p className="text-gray-600">
          Dieser Bereich wird iterativ portiert (Phase 4). Datenmodell und
          Geschäftslogik sind bereits in <code>docs/LEGACY-ANALYSIS.md</code> dokumentiert und in{' '}
          <code>src/types</code> bzw. <code>src/lib</code> vorbereitet.
        </p>
      </Card>
    </div>
  );
}
