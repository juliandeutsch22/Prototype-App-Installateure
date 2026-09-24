import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listFehlerprotokoll, FEHLER_GRENZE } from '@/lib/db/fehlerprotokoll';
import { listUsers } from '@/lib/db/users';
import type { FehlerEintrag } from '@/types';
import type { WithId } from '@/lib/db/core';
import PageHeader from '@/components/PageHeader';
import InfoHint from '@/components/InfoHint';
import Button from '@/components/Button';
import { ErrorState, SkeletonList } from '@/components/States';
import FehlerListe from './FehlerListe';
import type { ProtokollZeile } from './fehlergruppen';

/**
 * Das Fehlerprotokoll des Betriebs — für Geschäftsführung und Administration.
 *
 * Hier landet, was in der App abstürzt, und was jemand über „Problem melden"
 * schreibt. Die Namen kommen aus der Belegschaft des Betriebs: das Protokoll
 * selbst hält nur die Kennung fest, damit ein umbenannter Mitarbeiter nicht
 * unter altem Namen darin steht.
 */
export default function FehlerprotokollView() {
  const { user } = useAuth();
  const betrieb = user?.companyId ?? '';
  const [eintraege, setEintraege] = useState<WithId<FehlerEintrag>[] | null>(null);
  const [namen, setNamen] = useState<Map<string, string>>(new Map());
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    if (!betrieb) return;
    setFehler(null);
    try {
      const [liste, leute] = await Promise.all([
        listFehlerprotokoll(betrieb),
        // Ohne Namen bleibt das Protokoll lesbar — es fehlt nur das „wer".
        listUsers(betrieb).catch(() => []),
      ]);
      setNamen(new Map(leute.map((u) => [u.uid, u.name])));
      setEintraege(liste);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, [betrieb]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const zeilen: ProtokollZeile[] = useMemo(
    () =>
      (eintraege ?? []).map((e) => ({
        ...e,
        wer: e.userId ? namen.get(e.userId) ?? 'ehemaliges Konto' : undefined,
      })),
    [eintraege, namen],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fehlerprotokoll"
        subtitle="Abstürze und gemeldete Probleme der letzten 90 Tage"
        action={
          <Button variant="secondary" onClick={() => void laden()}>
            Neu laden
          </Button>
        }
      />
      <div className="flex items-start gap-2 text-sm text-ink-muted">
        <p>Festgehalten wird Technik, keine Inhalte.</p>
        <InfoHint about="das Fehlerprotokoll">
          Stürzt eine Ansicht ab, schreibt die App die Fehlermeldung, die Ansicht (ohne Kennungen
          und Suchbegriffe), die Fassung der App und das Gerät hierher — Namen, E-Mail-Adressen
          und Ziffernfolgen werden vorher entfernt. Unter „Problem melden" beschreibt jemand
          selbst, was passiert ist. Nach 90 Tagen löscht die Datenbank jeden Eintrag. Der
          Senklot-Support sieht die technischen Fehler aller Betriebe ohne Namen, eine Meldung nur,
          wenn ihr Verfasser sie ausdrücklich auch an den Support geschickt hat.
        </InfoHint>
      </div>

      {fehler && <ErrorState message={fehler} onRetry={() => void laden()} />}
      {!fehler && eintraege === null && <SkeletonList rows={3} />}
      {eintraege !== null && (
        <>
          <FehlerListe zeilen={zeilen} />
          {eintraege.length >= FEHLER_GRENZE && (
            <p className="text-sm text-ink-muted">
              Es werden die jüngsten {FEHLER_GRENZE} Einträge gezeigt.
            </p>
          )}
        </>
      )}
    </div>
  );
}
