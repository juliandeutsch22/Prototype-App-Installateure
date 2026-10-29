import { useRef, useState, type DragEvent } from 'react';
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
import DokumentAblage, { type AblageDatei } from '@/components/DokumentAblage';
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
 *
 * ERST SAMMELN, DANN HOCHLADEN (29.10.2026, `DokumentAblage`): gewählte oder
 * hergezogene Dateien stehen mit Größe und Zustand in einer Liste, eine
 * falsche lässt sich entfernen, bevor sie bei den Monteuren liegt.
 */
/*
  Der Grund steht in der Ablage unter dem Dateinamen — „„Grundriss.dwg“: nur
  PDF …“ nannte ihn ein zweites Mal. Auf der Seite (ohne Liste) bleibt der
  volle Satz mit Namen. `dateiPruefen` kennt zwei Formen: mit Doppelpunkt
  (falscher Typ) und als Satz („… ist leer.“, „… ist 30 MB groß“) — beide
  verlieren den Namen, sonst stünde er bei Größe und Leere doppelt da.
*/
function grundOhneName(datei: File): string | null {
  const grund = dateiPruefen(datei);
  if (!grund) return null;
  const name = `„${datei.name}“`;
  if (grund.startsWith(`${name}: `)) {
    const rest = grund.slice(name.length + 2);
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  if (grund.startsWith(`${name} `)) return `Die Datei ${grund.slice(name.length + 1)}`;
  return grund;
}

/*
  GESCHEITERT IST NICHT UNGÜLTIG: eine Datei, die am Netz scheiterte, bleibt
  mit dem Grund stehen und geht beim nächsten „Hochladen“ wieder mit. Als
  `problem` geführt, zählte der Knopf sie nicht mehr, und dieselbe Datei neu
  zu wählen verhinderte die Doppelprüfung — „bitte erneut versuchen“ ginge
  dann nur über Entfernen und neu Wählen.
*/
type Auswahl = AblageDatei & { gescheitert?: boolean };

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
  const [ablageOffen, setAblageOffen] = useState(false);
  const [auswahl, setAuswahl] = useState<Auswahl[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fortschritt, setFortschritt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string[]>([]);
  const [weg, setWeg] = useState<WithId<BaustellenDokument> | null>(null);
  /** Rückfrage vor dem Hochladen — siehe `klingtNachBueroBeleg`. */
  const [rueckfrage, setRueckfrage] = useState(false);
  /**
   * NUR FÜRS BÜRO (17 D): gilt für diese Ablage. In der Rückfrage steht es
   * vorab angekreuzt — wer dort weiterklickt, ohne zu lesen, legt den Beleg
   * so ab, dass die Monteure ihn nicht sehen.
   */
  const [nurBuero, setNurBuero] = useState(false);
  const [rueckfrageNurBuero, setRueckfrageNurBuero] = useState(true);
  const naechste = useRef(0);

  const klingtNachBuero = (d: File) => klingtNachBueroBeleg(d.name, personen);
  // Der Hinweis gilt nur, solange „Nur fürs Büro“ nicht gesetzt ist — dann sieht es ohnehin kein Monteur.
  const liste = auswahl.map((a) => ({
    ...a,
    hinweis: a.gescheitert
      ? 'Konnte nicht hochgeladen werden — bitte erneut versuchen'
      : !a.problem && !nurBuero && klingtNachBuero(a.datei)
        ? 'Klingt nach einem Beleg aus dem Büro — ohne „Nur fürs Büro“ sehen es die Monteure'
        : null,
  }));

  function dazu(dateien: File[]) {
    setFehler([]);
    setAuswahl((alt) => {
      // Dieselbe Datei zweimal gewählt oder hergezogen ergibt eine Zeile, nicht zwei.
      const schon = new Set(alt.map((a) => `${a.datei.name}|${a.datei.size}|${a.datei.lastModified}`));
      const neu = dateien
        .filter((d) => !schon.has(`${d.name}|${d.size}|${d.lastModified}`))
        .map((datei) => ({ id: `d${(naechste.current += 1)}`, datei, problem: grundOhneName(datei), hinweis: null }));
      return [...alt, ...neu];
    });
    setAblageOffen(true);
  }

  function schliessen() {
    setAblageOffen(false);
    setAuswahl([]);
    setNurBuero(false);
    setFortschritt(null);
  }

  function hochladenStarten() {
    const gueltig = auswahl.filter((a) => !a.problem);
    // Fürs Büro abgelegt, sieht es kein Monteur — dann gibt es nichts nachzufragen.
    if (!nurBuero && gueltig.some((a) => klingtNachBuero(a.datei))) {
      setRueckfrageNurBuero(true);
      setRueckfrage(true);
    } else void hochladen(nurBuero);
  }

  /*
    EINE NACH DER ANDEREN, und jeder Fehler wird genannt. Zehn Pläne auf
    einmal, von denen einer scheitert, sollen neun Pläne ergeben und eine
    Zeile mit dem Grund — nicht null Pläne, und nicht neun ohne Wort über
    den zehnten. Was angekommen ist, verschwindet aus der Liste; was
    scheiterte, bleibt mit dem Grund stehen und lässt sich erneut hochladen.
  */
  async function hochladen(nurFuersBuero: boolean) {
    const gueltig = auswahl.filter((a) => !a.problem);
    const ungueltig = auswahl.filter((a) => a.problem);
    const gescheitert: Auswahl[] = [];
    let geschafft = 0;
    setLaeuft(true);
    for (const [i, a] of gueltig.entries()) {
      setFortschritt(gueltig.length > 1 ? `Lade ${i + 1} von ${gueltig.length} hoch …` : 'Lade hoch …');
      try {
        await dokumentHochladen(companyId, projectId, a.datei, meinName, nurFuersBuero);
        geschafft += 1;
      } catch {
        gescheitert.push({ ...a, gescheitert: true });
      }
    }
    setLaeuft(false);
    setFortschritt(null);
    if (geschafft > 0) {
      const was = geschafft === 1 ? 'Dokument hinzugefügt' : `${geschafft} Dokumente hinzugefügt`;
      toast.success(nurFuersBuero ? `${was} — nur fürs Büro` : was);
      neuLaden();
    }
    if (gescheitert.length > 0) {
      // Bleibt offen: was scheiterte, steht mit dem Grund in der Liste.
      setAuswahl([...gescheitert, ...ungueltig]);
      return;
    }
    // Alles Gültige ist angekommen. Was gar nicht hochging, nennt die Seite.
    setFehler(ungueltig.map((a) => dateiPruefen(a.datei) ?? `„${a.datei.name}“ ging nicht hoch.`));
    schliessen();
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

  /* Dateien lassen sich auch direkt auf den Bereich ziehen — die Ablage öffnet sich mit ihnen. */
  const ablegbar = (e: DragEvent<HTMLDivElement>) => darfAendern && !laeuft && Array.from(e.dataTransfer.types).includes('Files');

  const dokumente = planeVon(stand, projectId);
  // Im leeren Reiter ist es der nächste Schritt; unter einer Liste steht es ruhig darunter.
  const hinzufuegen = (variant: 'primary' | 'secondary') => (
    <Button variant={variant} onClick={() => setAblageOffen(true)}>
      Dokumente hinzufügen
    </Button>
  );

  return (
    <div
      className="space-y-3"
      onDragOver={(e) => {
        if (ablegbar(e)) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!ablegbar(e) || ablageOffen) return;
        e.preventDefault();
        const neu = Array.from(e.dataTransfer.files ?? []);
        if (neu.length > 0) dazu(neu);
      }}
    >
      <p className="flex flex-wrap items-center text-sm text-ink-muted">
        Pläne, Fotos und Unterlagen dieser Baustelle
        <InfoHint about="Pläne und Dokumente">
          PDF, Bilder, Word, Excel und E-Mails bis 25 MB. Sichtbar für das Büro und für die
          Monteure, die im Team dieser Baustelle stehen oder dort eingeteilt sind — sie finden
          sie unter „Meine Baustellen“ und im Einsatzplan. Was „Nur Büro“ trägt, sehen die
          Monteure nicht; umstellen lässt es sich jederzeit. Pläne aus einem CAD-Programm bitte
          als PDF exportieren. Dateien lassen sich auch direkt hierher ziehen.
        </InfoHint>
      </p>

      {stand.zustand === 'laedt' ? (
        <SkeletonList rows={1} />
      ) : stand.zustand === 'fehler' ? (
        <TeilFehler was="Die Pläne" onRetry={neuLaden} />
      ) : dokumente.length === 0 ? (
        <EmptyState zeichnung="plan" titel="Noch keine Pläne oder Dokumente." action={darfAendern ? hinzufuegen('primary') : undefined}>
          {darfAendern
            ? 'Pläne, Fotos und Unterlagen liegen hier für das Büro und die Monteure dieser Baustelle bereit.'
            : 'Sobald das Büro Pläne ablegt, stehen sie hier.'}
        </EmptyState>
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

      {darfAendern && dokumente.length > 0 && <div className="flex flex-wrap items-center gap-3">{hinzufuegen('secondary')}</div>}

      {darfAendern && (
        <DokumentAblage
          open={ablageOffen}
          titel="Dokumente hinzufügen"
          unterzeile="Pläne, Fotos und Unterlagen dieser Baustelle"
          erlaubt="PDF, Bilder, Word, Excel und E-Mails bis 25 MB"
          accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.eml,.msg"
          eingabeId="plaene-datei"
          dateien={liste}
          laeuft={laeuft}
          fortschritt={fortschritt}
          onDateien={dazu}
          onEntfernen={(id) => setAuswahl((alt) => alt.filter((a) => a.id !== id))}
          onHochladen={hochladenStarten}
          onClose={schliessen}
          zusatz={
            <div>
              <CheckboxField
                id="plaene-nur-buero"
                label="Nur fürs Büro"
                checked={nurBuero}
                onChange={(e) => setNurBuero(e.target.checked)}
              />
              <p className="text-xs text-ink-muted">
                {nurBuero
                  ? 'Was jetzt dazukommt, sehen die Monteure nicht.'
                  : 'Die Monteure dieser Baustelle sehen alles ohne „Nur Büro“.'}
              </p>
            </div>
          }
        />
      )}

      <ConfirmDialog
        open={rueckfrage}
        title="Wirklich zu den Plänen?"
        message={`${auswahl
          .filter((a) => !a.problem && klingtNachBuero(a.datei))
          .map((a) => a.datei.name)
          .join(', ')} klingt nach einem Beleg aus dem Büro oder nach Daten einer Person. Ohne „Nur fürs Büro“ sehen es auch die Monteure dieser Baustelle.`}
        confirmLabel="Hinzufügen"
        confirmTone="primary"
        onCancel={() => setRueckfrage(false)}
        onConfirm={() => {
          setRueckfrage(false);
          void hochladen(rueckfrageNurBuero);
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
