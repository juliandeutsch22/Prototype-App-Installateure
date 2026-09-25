import type { ReactNode } from 'react';
import PageHeader from '@/components/PageHeader';
import { useAbBreite } from '@/lib/useAbBreite';

/**
 * Ab hier steht die Seitenleiste und mit ihr der helle Seitenkopf. Darunter
 * trägt die dunkle Kopfleiste des Telefons (`app/Layout.tsx`, `md:hidden`)
 * das Kopfband weiter — dieselbe Grenze wie dort.
 */
const AB_SEITENLEISTE = 768;

/**
 * DER KOPF DER STARTSEITE — für alle Rollen derselbe (docs/design/linie.md,
 * 1 und 9): klein „Freitag, 25.09.2026 · KW 39“, darunter der Gruß als
 * Titel, rechts die Hauptaktion.
 *
 * AM TELEFON FÜR DEN MONTEUR ALS DUNKLES KOPFBAND (Mockup S. 1). Es schließt
 * nahtlos an die dunkle Kopfleiste der App an und reicht dafür über den
 * Innenabstand des Inhalts bis an den Rand; die Heute-Karte darunter ragt
 * hinein (`.start-heute`). Die Hauptaktion steht dort nicht im Band: am
 * Telefon ist „Wie zuletzt buchen“ in der Karte der Knopf des Tages, und
 * „Zeit“ liegt in der Tableiste.
 *
 * Es steht genau EINE Form im DOM (siehe `useAbBreite`) — sonst gäbe es zwei
 * Überschriften erster Ordnung.
 */
export default function StartKopf({
  datum,
  kw,
  feiertag,
  titel,
  aktion,
  band,
}: {
  /** „Freitag, 25.09.2026“. */
  datum: string;
  kw: number;
  /** Name des Feiertags, wenn heute einer ist. */
  feiertag?: string | null;
  titel: string;
  aktion?: ReactNode;
  /** Am Telefon als dunkles Band (nur der Monteur-Start). */
  band: boolean;
}) {
  const breit = useAbBreite(AB_SEITENLEISTE);
  const alsBand = band && !breit;
  /*
    Der Feiertag bleibt in der kleinen Zeile, wie bisher in der Metazeile —
    er beantwortet die Frage, warum heute nichts ansteht. Auf dem hellen
    Grund in der Warnfarbe (5,4:1), auf dem dunklen Band weiß und kräftig:
    die Warnfarbe hätte dort keinen lesbaren Kontrast.
  */
  const ueber: ReactNode = (
    <>
      {/* Umbrechen nur zwischen den Teilen (Prüflauf 24.09.2026, D13). */}
      <span className="whitespace-nowrap">{datum}</span> ·{' '}
      <span className="whitespace-nowrap">KW {kw}</span>
      {feiertag && (
        <>
          {' · '}
          <span className={alsBand ? 'start-band-feiertag' : 'start-feiertag'}>{feiertag}</span>
        </>
      )}
    </>
  );
  if (alsBand) {
    return (
      <div className="start-band">
        <p className="start-band-ueber">{ueber}</p>
        <h1 className="start-band-titel">{titel}</h1>
      </div>
    );
  }
  return <PageHeader ueber={ueber} title={titel} action={aktion} />;
}
