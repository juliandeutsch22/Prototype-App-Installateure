import Card from '@/components/Card';

/**
 * Platzhalter für noch nicht portierte Views. Aktuell nur noch die
 * Benutzerverwaltung (nutzt in der Legacy das Secondary-App-Muster zum
 * Anlegen von Auth-Konten; die Custom-Claims werden bereits von der Cloud
 * Function syncUserClaims gesetzt). Bewusst als nächster Schritt offen.
 */
export default function PlaceholderView({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <Card>
        <p className="text-gray-600">
          Dieser Bereich ist noch nicht portiert. Datenmodell und Sicherheits-Rules
          (inkl. Custom-Claims-Sync) stehen bereits bereit.
        </p>
      </Card>
    </div>
  );
}
