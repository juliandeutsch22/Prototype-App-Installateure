import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Die feste Leiste unten an Formularen (Designlinie „Fassung 3",
 * docs/design/linie.md § 6/8 D).
 *
 * AM TELEFON klebt sie über der Reiterleiste (`--reiter-hoehe` aus
 * Layout.tsx): Summe und Knöpfe bleiben im Blick, egal wie lang das
 * Formular ist — wer unten angekommen ist, muss nicht zurückblättern, um zu
 * sehen, was er gleich bucht. AM SCHREIBTISCH steht sie ohne Fläche
 * rechtsbündig unter dem Formular.
 *
 * `links` ist der Nebenknopf (Abbrechen, Zurück), `rechts` der Hauptknopf;
 * am Telefon im Verhältnis 1:2, damit der Daumen den richtigen trifft.
 */
export default function Aktionsleiste({
  summe,
  links,
  rechts,
  erstNachDemRollen = false,
}: {
  summe?: { name: ReactNode; wert: ReactNode };
  links?: ReactNode;
  rechts: ReactNode;
  /**
   * ERST KLEBEN, WENN MAN INS FORMULAR GEROLLT IST (Runde 3, G22). Die
   * Zeiterfassung steht am Handy unter Saldo und Hinweisen; beim Öffnen lag
   * die klebende Leiste genau über dem Datumsfeld. Mit diesem Schalter steht
   * sie beim Öffnen an ihrem Platz unter dem Formular und klebt erst, wenn
   * gerollt wurde und der Anfang des Formulars über der Bildschirmmitte
   * steht. Nur dort gesetzt: in den Akten soll der Speichern-Balken nach der
   * ersten Änderung sofort im Blick sein.
   */
  erstNachDemRollen?: boolean;
}) {
  const leiste = useRef<HTMLDivElement>(null);
  const [frei, setFrei] = useState(erstNachDemRollen);

  useEffect(() => {
    const el = leiste.current;
    const formular = el?.closest('form') ?? el?.parentElement;
    if (!erstNachDemRollen || !el || !formular) return;
    let gerollt = false;
    let bild = 0;
    const pruefen = () => {
      bild = 0;
      const oben = formular.getBoundingClientRect().top;
      setFrei(!gerollt || oben > window.innerHeight / 2);
    };
    const nachRollen = () => {
      gerollt = true;
      if (!bild) bild = window.requestAnimationFrame(pruefen);
    };
    const spaeter = () => {
      if (!bild) bild = window.requestAnimationFrame(pruefen);
    };
    pruefen();
    window.addEventListener('scroll', nachRollen, { passive: true });
    window.addEventListener('resize', spaeter);
    // Lädt über dem Formular etwas nach (Saldo, fehlende Tage), rutscht es ohne Rollen.
    const beobachter = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(spaeter);
    beobachter?.observe(document.body);
    return () => {
      beobachter?.disconnect();
      window.removeEventListener('scroll', nachRollen);
      window.removeEventListener('resize', spaeter);
      if (bild) window.cancelAnimationFrame(bild);
    };
  }, [erstNachDemRollen]);

  return (
    <div ref={leiste} className={frei ? 'aktionsleiste aktionsleiste-frei' : 'aktionsleiste'}>
      {summe && (
        <p className="aktionsleiste-summe">
          <span>{summe.name}</span>
          <b>{summe.wert}</b>
        </p>
      )}
      <div className="aktionsleiste-knoepfe">
        {links}
        {rechts}
      </div>
    </div>
  );
}
