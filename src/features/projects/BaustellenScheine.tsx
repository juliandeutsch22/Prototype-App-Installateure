import { useEffect, useState } from 'react';
import { listWorkSheetsForProject } from '@/lib/db/workSheets';
import { scheineAufRechnung } from '@/lib/db/invoices';
import { SCHEIN_STAND } from '@/features/worksheets/scheinStand';
import type { WorkSheet } from '@/types';
import type { WithId } from '@/lib/db/core';
import { List, ListRow } from '@/components/ListRow';
import { Zustand } from '@/components/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import Nachladen from '@/components/Nachladen';
import { datumAT } from '@/lib/datum';
import { fmtDauer } from '@/lib/time';

/**
 * DIE HANDWERKSSCHEINE EINER BAUSTELLE, in ihrer Akte (Rückmeldung des
 * Betreibers, 09.10.2026). Bisher stand dort nur „Handwerksschein schreiben“;
 * welche Scheine es zur Baustelle schon gibt, sah man nur in der Scheinliste,
 * gemischt mit allen anderen.
 *
 * NUR ANZEIGE. Geladen wird über die bestehende Abfrage der Baustelle; was
 * jemand sehen darf, entscheidet wie überall der Zeilenschutz. Ein Tipp
 * öffnet den Schein in der Scheinliste (`?markiert=`), wo alle Handgriffe
 * stehen — PDF, Weiterbearbeiten, Storno —, statt sie hier ein zweites Mal
 * zu bauen.
 *
 * ZWANZIG AUF EINMAL. Ein unterschriebener Schein trägt zwei
 * Unterschriftsbilder (rund 70 KB); eine lange Baustelle mit hundert
 * Scheinen wären sieben Megabyte bei jedem Öffnen der Akte. Die neuesten
 * zwanzig, dann „Weitere … laden“.
 */
const SCHEINE_JE_SEITE = 20;

export default function BaustellenScheine({
  companyId,
  projectNumber,
  verrechnungSehen,
}: {
  companyId: string;
  projectNumber: string;
  /** Ob „verrechnet“ gezeigt wird — nur wer Rechnungen lesen darf, wie in der Scheinliste. */
  verrechnungSehen: boolean;
}) {
  const [grenze, setGrenze] = useState(SCHEINE_JE_SEITE);
  const [scheine, setScheine] = useState<WithId<WorkSheet>[] | null>(null);
  const [verrechnet, setVerrechnet] = useState<Set<string>>(new Set());
  const [fehler, setFehler] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    let weg = false;
    setLaeuft(true);
    setFehler(false);
    listWorkSheetsForProject(companyId, projectNumber, grenze)
      .then(async (rows) => {
        if (weg) return;
        setScheine(rows);
        if (!verrechnungSehen) return;
        const unterschrieben = rows.filter((s) => s.status === 'Unterschrieben').map((s) => s.id);
        if (unterschrieben.length === 0) return;
        try {
          const ids = await scheineAufRechnung(companyId, unterschrieben);
          if (!weg) setVerrechnet(new Set(ids));
        } catch {
          // Ohne die Auskunft fehlt nur das Wort „verrechnet“ — die Scheine stehen da.
        }
      })
      .catch(() => {
        if (!weg) setFehler(true);
      })
      .finally(() => {
        if (!weg) setLaeuft(false);
      });
    return () => {
      weg = true;
    };
  }, [companyId, projectNumber, grenze, verrechnungSehen, versuch]);

  if (fehler && !scheine) {
    return <ErrorState message="Die Handwerksscheine dieser Baustelle konnten nicht geladen werden." onRetry={() => setVersuch((v) => v + 1)} />;
  }
  if (!scheine) return <SkeletonList rows={2} />;

  return (
    <div>
      {scheine.length === 0 ? (
        <EmptyState>Zu dieser Baustelle gibt es noch keinen Handwerksschein.</EmptyState>
      ) : (
        <List>
          {scheine.map((s) => {
            const minuten = s.zeiten.reduce((n, z) => n + z.minuten, 0);
            const istVerrechnet = verrechnet.has(s.id);
            return (
              <ListRow
                key={s.id}
                to={`/worksheets?markiert=${encodeURIComponent(s.id)}`}
                wert={minuten > 0 ? fmtDauer(minuten) : undefined}
                zustand={
                  <Zustand stand={istVerrechnet ? 'ruht' : SCHEIN_STAND[s.status]}>
                    {istVerrechnet ? 'verrechnet' : s.status}
                  </Zustand>
                }
                title={
                  <span>
                    {datumAT(s.datum)} · {s.abrechnung}
                  </span>
                }
                subtitle={
                  <>
                    {s.erstelltVonName ? `geschrieben von ${s.erstelltVonName}` : null}
                    {s.unterschriften?.kunde?.name ? ` · unterschrieben von ${s.unterschriften.kunde.name}` : null}
                  </>
                }
              />
            );
          })}
        </List>
      )}
      <Nachladen
        geladen={scheine.length}
        grenze={grenze}
        laeuft={laeuft}
        onMehr={() => setGrenze((g) => g + SCHEINE_JE_SEITE)}
        einheit="Handwerksscheine"
        sucheImBrowser={false}
      />
    </div>
  );
}
