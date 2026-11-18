import type { ReactNode } from 'react';
import BottomSheet from './BottomSheet';
import Card from './Card';
import InfoHint from './InfoHint';
import { useAmHandy } from '@/lib/breiten';

/**
 * „NEU …“ AM HANDY IMMER ALS BLATT VON UNTEN (U2, Durchsicht 15.11.2026).
 *
 * Vorher war Neu-Anlegen mal ein Blatt (Zeiterfassung, E90), mal ein
 * Formular offen auf der Seite: unter „Urlaub“ stand „Antrag stellen“ vor
 * „Meine Anträge“, in der Benutzerverwaltung das ganze Anlegeformular vor der
 * Liste — der Bestand rutschte eine Bildschirmhöhe nach unten, und wer nur
 * nachsehen wollte, musste über ein leeres Formular rollen.
 *
 * Jetzt zeigt die Seite am Handy zuerst den Bestand; die Hauptaktion im
 * Seitenkopf („Antrag stellen“, „Benutzer anlegen“) öffnet dieses Blatt.
 * Ab dem Tablet steht das Formular wie bisher als Blatt auf der Seite, wo
 * neben dem Bestand Platz ist. Dasselbe Formular, nie zweimal im DOM —
 * zwei Fassungen hätten zwei Stände (`useAmHandy`).
 *
 * `offen` und `onSchliessen` gelten nur am Handy; nach dem Speichern schließt
 * die Seite das Blatt selbst (sie weiß, wann es geklappt hat).
 */
export default function NeuFormular({ titel, offen, onSchliessen, children, className, id, hint }: {
  titel: string;
  offen: boolean;
  onSchliessen: () => void;
  children: ReactNode;
  /** Für das Blatt auf der Seite (ab dem Tablet). */
  className?: string;
  id?: string;
  hint?: ReactNode;
}) {
  const amHandy = useAmHandy();
  if (amHandy) {
    return (
      <BottomSheet open={offen} onClose={onSchliessen} label={titel} titel={titel} auchBreit>
        {/* Die Erklärung der Karte geht im Blatt nicht verloren: als „i“ am Anfang (im Fenster bleibt es am Platz). */}
        {hint && <p className="mb-2 text-meta text-ink-muted">Erklärung <InfoHint about={titel}>{hint}</InfoHint></p>}
        {children}
      </BottomSheet>
    );
  }
  return <Card title={titel} className={className} id={id} hint={hint}>{children}</Card>;
}
