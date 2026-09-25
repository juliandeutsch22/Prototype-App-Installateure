import { useEffect, useRef, type ReactNode } from 'react';
import Card from './Card';

/**
 * Eine Karte mit einem Formular, die ZUGEKLAPPT GEBOREN WIRD.
 *
 * WARUM ES DAS GIBT. In Kunden, Baustellen, Angeboten, Rechnungen und
 * Benutzern stand das Anlege-Formular dauerhaft ganz oben. Gemessen auf einem
 * 390 px breiten Telefon musste man an ihm vorbei scrollen, um zum ersten
 * vorhandenen Eintrag zu kommen: 1319 px in den Angeboten, 1162 in den Kunden,
 * 958 in den Rechnungen — bei 844 px Bildschirmhöhe also bis zu anderthalb
 * Bildschirme. In einer Liste ist Nachsehen aber die häufigere Handlung als
 * Anlegen.
 *
 * WARUM KEIN MODAL. Ein Fenster über dem Bildschirm wäre die naheliegende
 * Antwort und hier die schlechtere:
 *
 *  - Am Telefon wird ein Formular mit acht bis vierzehn Feldern darin zu
 *    einem scrollenden Kasten in einer scrollenden Seite, und die Tastatur
 *    verdeckt die Hälfte.
 *  - Anlegen braucht oft den Blick auf das Vorhandene („gibt es den Kunden
 *    schon?", „welche Nummer ist frei?") — genau das verdeckt ein Modal.
 *  - Die App ist auf schlechtes Netz gebaut; ein halb ausgefülltes Formular
 *    darf liegen bleiben, während man wegscrollt. Ein Modal behauptet
 *    „das schließt du jetzt ab".
 *  - Modale Fenster heissen in dieser App bereits etwas anderes:
 *    `ConfirmDialog` ist eine Entscheidung, `BottomSheet` ist Navigation.
 *
 * WAS DIESER BAUSTEIN BEITRÄGT, und warum es ihn überhaupt braucht statt
 * fünfmal derselben zehn Zeilen: das Formular erscheint AUSSERHALB des
 * Blickfelds, wenn es aus einer Zeile weiter unten geöffnet wird (etwa
 * „Bearbeiten" am Kunden). Ohne Nachführen sähe es aus, als täte der Knopf
 * nichts. Der Fokus wandert dabei auf die Karte selbst und nicht in das erste
 * Feld: eine Sprachausgabe erfährt so, dass sich etwas geöffnet hat, und am
 * Telefon springt nicht ungefragt die Tastatur auf.
 */
export default function FormularKarte({
  offen,
  title,
  hint,
  action,
  children,
}: {
  offen: boolean;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const kasten = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!offen) return;
    const el = kasten.current;
    if (!el) return;
    /*
      `scrollIntoView` ist JavaScript und schert sich nicht um die
      `prefers-reduced-motion`-Regel in index.css — die gilt nur für CSS.
      Wer Bewegung abbestellt hat, bekommt sie hier deshalb von Hand
      abgestellt.
    */
    const ruhig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: ruhig ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }, [offen]);

  if (!offen) return null;

  return (
    // `scroll-mt-4`: sonst klebt die Karte beim Nachführen an der Oberkante.
    // `outline-none` am Behälter, weil der Fokus hier nur die Vorlesehilfe
    // führt — sichtbar markiert wird das Feld, in das jemand tippt.
    <div ref={kasten} tabIndex={-1} className="scroll-mt-4 outline-none">
      <Card title={title} hint={hint} action={action}>
        {children}
      </Card>
    </div>
  );
}
