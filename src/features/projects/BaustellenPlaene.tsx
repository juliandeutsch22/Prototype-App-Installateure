import { useRef, useState } from 'react';
import Hinweiszeile from '@/components/Hinweiszeile';
import { dokumentHochladen, dokumentLoeschen, dokumentNurBueroSetzen, dateiPruefen } from '@/lib/db/baustellenDokumente';
import type { BaustellenDokument } from '@/types';
import type { WithId } from '@/lib/db/core';
import Button from '@/components/Button';
import InfoHint from '@/components/InfoHint';
import ConfirmDialog from '@/components/ConfirmDialog';
import { CheckboxField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import PlaeneListe from './PlaeneListe';
import { planeVon, usePlaene } from './usePlaene';
import { klingtNachBueroBeleg } from './bueroBeleg';

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
  personen = [],
}: {
  companyId: string;
  projectId: string;
  darfAendern: boolean;
  meinName: string;
  /** Namen der Belegschaft — ein Dateiname mit einem davon wird nachgefragt (H8). */
  personen?: readonly string[];
}) {
  const toast = useToast();
  const { stand, neuLaden } = usePlaene(companyId, [projectId]);
  const feld = useRef<HTMLInputElement>(null);
  const [fortschritt, setFortschritt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string[]>([]);
  const [weg, setWeg] = useState<WithId<BaustellenDokument> | null>(null);
  /** Dateien, die erst nach einer Rückfrage hochgehen — siehe `klingtNachBueroBeleg`. */
  const [rueckfrage, setRueckfrage] = useState<File[] | null>(null);
  /**
   * NUR FÜRS BÜRO (17 D): gilt für die nächste Auswahl. In der Rückfrage
   * steht es vorab angekreuzt — wer dort weiterklickt, ohne zu lesen, legt
   * den Beleg so ab, dass die Monteure ihn nicht sehen.
   */
  const [nurBuero, setNurBuero] = useState(false);
  const [rueckfrageNurBuero, setRueckfrageNurBuero] = useState(true);

  /*
    EINE NACH DER ANDEREN, und jeder Fehler wird genannt. Zehn Pläne auf
    einmal, von denen einer zu gross ist, sollen neun Pläne ergeben und eine
    Meldung — nicht null Pläne, und nicht neun ohne Wort über den zehnten.
  */
  async function hochladen(dateien: File[], nurFuersBuero: boolean) {
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
        await dokumentHochladen(companyId, projectId, datei, meinName, nurFuersBuero);
        geschafft += 1;
      } catch {
        probleme.push(`„${datei.name}“ konnte nicht hochgeladen werden.`);
      }
    }
    setFortschritt(null);
    setFehler(probleme);
    if (geschafft > 0) {
      const was = geschafft === 1 ? 'Dokument hinzugefügt' : `${geschafft} Dokumente hinzugefügt`;
      toast.success(nurFuersBuero ? `${was} — nur fürs Büro` : was);
      neuLaden();
    }
  }

  async function loeschen(d: WithId<BaustellenDokument>) {
    try {
      const { dateiBlieb } = await dokumentLoeschen(d);
      toast.success(`${d.dateiname} gelöscht`);
      if (dateiBlieb) {
        // Aus der App ist er weg; die Datei selbst liegt noch im Speicher.
        toast.info('Die Datei selbst ließ sich nicht entfernen und bleibt im Speicher.');
      }
      neuLaden();
    } catch {
      setFehler([`„${d.dateiname}“ konnte nicht gelöscht werden.`]);
    }
  }

  async function nurBueroSetzen(d: WithId<BaustellenDokument>, wert: boolean) {
    try {
      await dokumentNurBueroSetzen(d.id, wert);
      toast.success(wert ? `${d.dateiname}: vor den Monteuren verborgen` : `${d.dateiname}: für die Monteure sichtbar`);
      neuLaden();
    } catch {
      setFehler([`„${d.dateiname}“ ließ sich nicht umstellen.`]);
    }
  }

  const dokumente = planeVon(stand, projectId);

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center text-sm text-ink-muted">
        Pläne, Fotos und Unterlagen dieser Baustelle
        <InfoHint about="Pläne und Dokumente">
          PDF, Bilder, Word, Excel und E-Mails bis 25 MB. Sichtbar für das Büro und für die
          Monteure, die im Team dieser Baustelle stehen oder dort eingeteilt sind — sie finden
          sie unter „Meine Baustellen“ und im Einsatzplan. Was „Nur Büro“ trägt, sehen die
          Monteure nicht; umstellen lässt es sich jederzeit. Pläne aus einem CAD-Programm bitte
          als PDF exportieren.
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
          onLoeschen={darfAendern ? setWeg : undefined}
          onNurBuero={darfAendern ? (d, wert) => void nurBueroSetzen(d, wert) : undefined}
        />
      )}

      {fehler.length > 0 && (
        <Hinweiszeile stufe="fehl" role="alert">
          <ul>
            {fehler.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Hinweiszeile>
      )}

      {darfAendern && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={feld}
            id="plaene-datei"
            type="file"
            multiple
            accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.eml,.msg"
            className="sr-only"
            aria-label="Dokumente auswählen"
            onChange={(e) => {
              const dateien = Array.from(e.target.files ?? []);
              // Zurücksetzen, damit dieselbe Datei ein zweites Mal gewählt
              // werden kann — sonst feuert das Feld nicht.
              e.target.value = '';
              if (dateien.length === 0) return;
              // Fürs Büro abgelegt, sieht es kein Monteur — dann gibt es nichts nachzufragen.
              if (!nurBuero && dateien.some((d) => klingtNachBueroBeleg(d.name, personen))) {
                setRueckfrageNurBuero(true);
                setRueckfrage(dateien);
              } else void hochladen(dateien, nurBuero);
            }}
          />
          <Button
            variant="ghost"
            loading={!!fortschritt}
            onClick={() => feld.current?.click()}
          >
            Dokument hinzufügen
          </Button>
          <CheckboxField
            id="plaene-nur-buero"
            label="Nur fürs Büro"
            checked={nurBuero}
            onChange={(e) => setNurBuero(e.target.checked)}
          />
          {fortschritt ? (
            <span className="text-sm text-ink-muted" role="status">{fortschritt}</span>
          ) : (
            <span className="text-xs text-ink-muted">
              {nurBuero
                ? 'Was jetzt dazukommt, sehen die Monteure nicht.'
                : 'Die Monteure dieser Baustelle sehen alles ohne „Nur Büro“.'}
            </span>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!rueckfrage}
        title="Wirklich zu den Plänen?"
        message={
          rueckfrage
            ? `${rueckfrage
                .filter((d) => klingtNachBueroBeleg(d.name, personen))
                .map((d) => d.name)
                .join(', ')} klingt nach einem Beleg aus dem Büro oder nach Daten einer Person. Ohne „Nur fürs Büro“ sehen es auch die Monteure dieser Baustelle.`
            : ''
        }
        confirmLabel="Hinzufügen"
        confirmTone="primary"
        onCancel={() => setRueckfrage(null)}
        onConfirm={() => {
          const dateien = rueckfrage;
          setRueckfrage(null);
          if (dateien) void hochladen(dateien, rueckfrageNurBuero);
        }}
      >
        <CheckboxField
          id="plaene-rueckfrage-nur-buero"
          label="Nur fürs Büro"
          checked={rueckfrageNurBuero}
          onChange={(e) => setRueckfrageNurBuero(e.target.checked)}
        />
      </ConfirmDialog>

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
