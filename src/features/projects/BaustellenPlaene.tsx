import { useRef, useState } from 'react';
import { dokumentHochladen, dokumentLoeschen, dateiPruefen } from '@/lib/db/baustellenDokumente';
import type { BaustellenDokument } from '@/types';
import type { WithId } from '@/lib/db/core';
import Button from '@/components/Button';
import Icon from '@/components/Icon';
import InfoHint from '@/components/InfoHint';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import PlaeneListe from './PlaeneListe';
import { planeVon, usePlaene } from './usePlaene';

/**
 * Dateinamen, die nach einem Beleg des Büros klingen, nicht nach einem Plan.
 *
 * Im Launch-Check (25.09.2026, R1) lag ein Stundennachweis bei den Plänen —
 * sichtbar für jeden Monteur der Baustelle, mit den Stunden der Kollegen.
 * Ein Dateiname beweist nichts; er ist aber der einzige Anhaltspunkt vor dem
 * Hochladen, und gefragt wird nur, nicht verboten.
 */
const BUEROBELEG = /stunden|rechnung|lohn|gehalt|abrechnung|angebot|kalkulation|zeitkonto|saldo|krank|urlaub/i;

function klingtNachBueroBeleg(dateiname: string): boolean {
  return BUEROBELEG.test(dateiname);
}

/**
 * Pläne und Dokumente in der Baustellenakte — hochladen, ansehen, löschen.
 *
 * GEMELDET: „Baustellen sollte man Dokumente oder Bilder hinzufügen können,
 * für Baupläne oder ähnliches, damit der Monteur Zugriff darauf hat."
 *
 * Hochladen und Löschen dürfen, wer die Baustelle ändern darf; die Datenbank
 * sagt dasselbe noch einmal. Alle anderen im Büro sehen nur.
 */
export default function BaustellenPlaene({
  companyId,
  projectId,
  darfAendern,
  meinName,
}: {
  companyId: string;
  projectId: string;
  darfAendern: boolean;
  meinName: string;
}) {
  const toast = useToast();
  const { stand, neuLaden } = usePlaene(companyId, [projectId]);
  const feld = useRef<HTMLInputElement>(null);
  const [fortschritt, setFortschritt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string[]>([]);
  const [weg, setWeg] = useState<WithId<BaustellenDokument> | null>(null);
  /** Dateien, die erst nach einer Rückfrage hochgehen — siehe `klingtNachBueroBeleg`. */
  const [rueckfrage, setRueckfrage] = useState<File[] | null>(null);

  /*
    EINE NACH DER ANDEREN, und jeder Fehler wird genannt. Zehn Pläne auf
    einmal, von denen einer zu gross ist, sollen neun Pläne ergeben und eine
    Meldung — nicht null Pläne, und nicht neun ohne Wort über den zehnten.
  */
  async function hochladen(dateien: File[]) {
    const probleme: string[] = [];
    let geschafft = 0;
    for (const [i, datei] of dateien.entries()) {
      setFortschritt(dateien.length > 1 ? `Lade ${i + 1} von ${dateien.length} hoch …` : 'Lade hoch …');
      const warum = dateiPruefen(datei);
      if (warum) {
        probleme.push(warum);
        continue;
      }
      try {
        await dokumentHochladen(companyId, projectId, datei, meinName);
        geschafft += 1;
      } catch {
        probleme.push(`„${datei.name}" konnte nicht hochgeladen werden.`);
      }
    }
    setFortschritt(null);
    setFehler(probleme);
    if (geschafft > 0) {
      toast.success(geschafft === 1 ? 'Plan hinzugefügt' : `${geschafft} Pläne hinzugefügt`);
      neuLaden();
    }
  }

  async function loeschen(d: WithId<BaustellenDokument>) {
    try {
      const { dateiBlieb } = await dokumentLoeschen(d);
      toast.success(`${d.dateiname} gelöscht`);
      if (dateiBlieb) {
        // Aus der App ist er weg; die Datei selbst liegt noch im Speicher.
        toast.info('Die Datei selbst liess sich nicht entfernen und bleibt im Speicher.');
      }
      neuLaden();
    } catch {
      setFehler([`„${d.dateiname}" konnte nicht gelöscht werden.`]);
    }
  }

  const dokumente = planeVon(stand, projectId);

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center text-sm text-ink-muted">
        Pläne, Fotos und Unterlagen für die Monteure dieser Baustelle
        <InfoHint about="Pläne und Dokumente">
          PDF und Bilder bis 25 MB. Sichtbar für das Büro und für die Monteure, die im Team
          dieser Baustelle stehen oder dort eingeteilt sind — sie finden sie unter „Meine
          Baustellen" und im Einsatzplan. Pläne aus einem CAD-Programm bitte als PDF exportieren.
        </InfoHint>
      </p>

      {stand.zustand === 'laedt' ? (
        <SkeletonList rows={1} />
      ) : stand.zustand === 'fehler' ? (
        <TeilFehler was="Die Pläne" onRetry={neuLaden} />
      ) : dokumente.length === 0 ? (
        <EmptyState>Noch keine Pläne oder Dokumente.</EmptyState>
      ) : (
        <PlaeneListe
          dokumente={dokumente}
          adressen={stand.adressen}
          onLoeschen={darfAendern ? setWeg : undefined}
        />
      )}

      {fehler.length > 0 && (
        <ul className="rounded border border-line bg-surface-2 px-3 py-2 text-sm text-danger" role="alert">
          {fehler.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}

      {darfAendern && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={feld}
            id="plaene-datei"
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="sr-only"
            aria-label="Pläne oder Bilder auswählen"
            onChange={(e) => {
              const dateien = Array.from(e.target.files ?? []);
              // Zurücksetzen, damit dieselbe Datei ein zweites Mal gewählt
              // werden kann — sonst feuert das Feld nicht.
              e.target.value = '';
              if (dateien.length === 0) return;
              if (dateien.some((d) => klingtNachBueroBeleg(d.name))) setRueckfrage(dateien);
              else void hochladen(dateien);
            }}
          />
          <Button
            variant="ghost"
            loading={!!fortschritt}
            onClick={() => feld.current?.click()}
          >
            <Icon name="plus" size={18} />
            Plan oder Bild hinzufügen
          </Button>
          {fortschritt ? (
            <span className="text-sm text-ink-muted" role="status">{fortschritt}</span>
          ) : (
            <span className="text-xs text-ink-muted">Die Monteure dieser Baustelle sehen alles hier.</span>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!rueckfrage}
        title="Wirklich zu den Plänen?"
        message={
          rueckfrage
            ? `${rueckfrage
                .filter((d) => klingtNachBueroBeleg(d.name))
                .map((d) => d.name)
                .join(', ')} klingt nach einem Beleg aus dem Büro. Alles hier sehen auch die Monteure dieser Baustelle.`
            : ''
        }
        confirmLabel="Trotzdem hinzufügen"
        confirmTone="primary"
        onCancel={() => setRueckfrage(null)}
        onConfirm={() => {
          const dateien = rueckfrage;
          setRueckfrage(null);
          if (dateien) void hochladen(dateien);
        }}
      />

      <ConfirmDialog
        open={!!weg}
        title="Plan löschen?"
        message={weg ? `${weg.dateiname} wird entfernt — auch für die Monteure.` : ''}
        onCancel={() => setWeg(null)}
        onConfirm={() => {
          const d = weg;
          setWeg(null);
          if (d) void loeschen(d);
        }}
      />
    </div>
  );
}
