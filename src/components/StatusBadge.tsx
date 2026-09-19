import { Zustand, type Stand } from './Badge';

/**
 * Der Status eines Geschäftsobjekts — Bestellung, Rechnung, Baustelle,
 * Angebot, Urlaubsantrag.
 *
 * EINE ZUORDNUNG FÜR ALLE DOMÄNEN, damit derselbe Status überall gleich
 * aussieht. Vorher stand sie je Ansicht noch einmal, und „Offen" war in der
 * einen Liste gelb und in der anderen grau.
 *
 * WARUM „ÜBERFÄLLIG" HIER KEINE WARNUNG IST, obwohl es nach einer klingt:
 * der Status einer Rechnung sagt, WO sie steht, nicht was zu tun ist. Was zu
 * tun ist, steht daneben — „3 Tage" am Mahnlauf, „12 Tage" an der
 * unverrechneten Leistung —, und DAS sind Warnungen. Stünde beides als
 * gefüllte Pille da, hätte die Liste zwei Rufe für eine Sache.
 */
const STATUS_STAND: Record<string, Stand> = {
  // Bestell-Status
  Offen: 'achtung',
  'In Bearbeitung': 'laeuft',
  Abholbereit: 'laeuft',
  Erledigt: 'gut',
  // Rechnungs-Status
  Überfällig: 'schlecht',
  /*
    „Teilbezahlt" läuft, es ist weder gut noch schlecht: Geld ist gekommen,
    die Forderung besteht weiter. „Überzahlt" bekommt dagegen Achtung —
    dahinter steht eine Rückzahlung, die jemand veranlassen muss, und sie
    fällt sonst niemandem auf ausser dem Kunden.
  */
  Teilbezahlt: 'laeuft',
  Bezahlt: 'gut',
  Überzahlt: 'achtung',
  Storniert: 'ruht',
  // Baustellen-Status
  Aktiv: 'gut',
  Pausiert: 'achtung',
  Abgeschlossen: 'ruht',
};

export default function StatusBadge({ status }: { status: string }) {
  return <Zustand stand={STATUS_STAND[status] ?? 'ruht'}>{status}</Zustand>;
}
