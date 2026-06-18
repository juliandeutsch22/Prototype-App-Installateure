import Badge, { type Tone } from './Badge';

/**
 * Zentrale Status→Farbe-Zuordnung für alle Domänen-Status (Bestellung,
 * Rechnung, Baustelle). Ersetzt die zuvor je Screen duplizierten Maps —
 * gleicher Status sieht überall gleich aus.
 */
const STATUS_TONE: Record<string, Tone> = {
  // Bestell-Status
  Offen: 'warning',
  'In Bearbeitung': 'info',
  Abholbereit: 'info',
  Erledigt: 'success',
  // Rechnungs-Status
  Überfällig: 'danger',
  Bezahlt: 'success',
  Storniert: 'gray',
  // Baustellen-Status
  Aktiv: 'success',
  Pausiert: 'warning',
  Abgeschlossen: 'gray',
};

export default function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{status}</Badge>;
}
