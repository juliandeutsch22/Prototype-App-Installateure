import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { fahrtDauer, seilVerlauf } from '@/lib/lotSeil';

/*
  DAS LOT DER NAVIGATION (Auftrag 03.11.2026, E38). Bis dahin trug jeder
  aktive Menüpunkt sein eigenes kleines Lot; beim Wechsel verschwand es oben
  und tauchte unten wieder auf. Jetzt gibt es eines, an einem Seil, das sich
  zum aktiven Punkt herablässt oder eingeholt wird. Am Handy bleibt das Lot
  über dem aktiven Symbol der unteren Leiste, wie es war (Entscheid des
  Auftraggebers).

  „START“ IST DIE AUFHÄNGUNG (03.11.2026, E39). Der Haken sitzt auf der Höhe
  des Punkts „Start“; steht man dort, hängt das Blei ohne Seil am Haken,
  geht man weiter, rollt das Seil von dort ab. Vorher saß die Aufhängung
  6 px darüber, frei im Raum, und auf „Start“ war das Seil ein Stummel.

  FLÜSSIG, WEIL NUR `transform` LÄUFT: das Seil wird gestreckt, das Blei
  verschoben — beides ohne neues Layout, auf der Grafikkarte. Gemessen wird
  nur beim Seitenwechsel und wenn sich die Leiste in der Größe ändert.
  Beim Laden steht das Lot sofort am Ziel; wer „Bewegung reduzieren“
  eingestellt hat, sieht keine Fahrt.
*/

/** Höhe des Senkbleis (`.navi-blei`): das Seil endet an seiner Oberkante. */
const BLEI_HOEHE = 14;

function bewegungReduziert(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Kann dieser Browser die Fahrt abspielen und mitten in ihr umlenken? Ein
 * älterer ohne Web Animations (oder die Testumgebung) setzt das Lot ohne
 * Fahrt — es steht trotzdem am richtigen Punkt.
 */
function kannFahren(el: HTMLElement): boolean {
  return typeof el.animate === 'function' && typeof el.getAnimations === 'function' && typeof DOMMatrixReadOnly === 'function';
}

/** Wo eine laufende `transform`-Animation gerade steht (Verschiebung in px). */
function jetzt(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  return new DOMMatrixReadOnly(t).m42;
}

function anhalten(...els: HTMLElement[]) {
  for (const el of els) if (kannFahren(el)) for (const a of el.getAnimations()) a.cancel();
}

/**
 * Seitenleiste (Tablet und Schreibtisch): Aufhängung, Seil und Blei. Steht
 * im `<aside class="navi">`, das selbst rollt — so wandern sie beim Rollen mit,
 * ohne dass jemand auf das Rollen hören muss.
 */
export function SeilLot() {
  const { pathname } = useLocation();
  return <SeilLotFuer ziel={pathname} />;
}

/**
 * Dasselbe Lot für eine Leiste, deren aktiver Punkt nicht am Pfad hängt —
 * die Plattform wechselt ihre Bereiche auf einer Adresse (E48). `ziel`
 * ändert sich mit dem aktiven Punkt; dann fährt das Blei.
 */
export function SeilLotFuer({ ziel: aktiverPunkt }: { ziel: string }) {
  const aufhaengung = useRef<HTMLSpanElement>(null);
  const seil = useRef<HTMLSpanElement>(null);
  const blei = useRef<HTMLSpanElement>(null);
  /** Die zuletzt gesetzte Seillänge; `null` vor dem ersten Setzen (dann ohne Fahrt). */
  const laenge = useRef<number | null>(null);

  useLayoutEffect(() => {
    const leiste = aufhaengung.current?.parentElement;
    if (!leiste || !seil.current || !blei.current) return;
    const s = seil.current;
    const b = blei.current;

    const messen = () => {
      // Der erste Punkt der Hauptnavigation („Start“) trägt den Haken: das Blei hängt dort mittig, ohne Seil.
      const haupt = leiste.querySelector('nav');
      // Ein Link in der App, ein Knopf in der Plattform — der erste Punkt ist es in beiden.
      const start = haupt?.querySelector<HTMLElement>('a, button');
      const oben = start ? start.offsetTop + start.offsetHeight / 2 - BLEI_HOEHE / 2 : haupt?.offsetTop ?? 0;
      const aktiv = leiste.querySelector<HTMLElement>('.navi-punkt-aktiv');
      // Ohne aktiven Punkt wird das Seil eingeholt.
      const ziel = aktiv ? aktiv.offsetTop + aktiv.offsetHeight / 2 - BLEI_HOEHE / 2 - oben : 0;
      return { oben, ziel: Math.max(0, ziel), ohneZiel: !aktiv };
    };
    const setzen = (oben: number, l: number, ohneZiel: boolean) => {
      for (const el of [aufhaengung.current!, s, b]) el.style.top = `${oben}px`;
      s.style.transform = `scaleY(${l})`;
      b.style.transform = `translateY(${l}px)`;
      /*
        Ohne aktiven Punkt ist das Blei ausgeblendet: am Haken hinge es neben
        „Start“, und „Start“ sähe aktiv aus. Es bleibt nur der Haken.
      */
      b.toggleAttribute('data-ohne-ziel', ohneZiel);
      laenge.current = l;
    };
    const fahren = () => {
      const { oben, ziel, ohneZiel } = messen();
      const fahrbar = kannFahren(b);
      const von = laenge.current === null || !fahrbar ? null : jetzt(b);
      anhalten(s, b);
      setzen(oben, ziel, ohneZiel);
      if (von === null || bewegungReduziert() || Math.abs(ziel - von) < 0.5) return;
      const dauer = fahrtDauer(ziel - von);
      const verlauf = seilVerlauf(von, ziel);
      s.animate(verlauf.map((v) => ({ transform: `scaleY(${v.laenge})`, offset: v.offset, easing: v.easing })), { duration: dauer });
      b.animate(verlauf.map((v) => ({ transform: `translateY(${v.laenge}px)`, offset: v.offset, easing: v.easing })), { duration: dauer });
    };
    fahren();

    // Andere Größe (Tablet ↔ Schreibtisch, nachgeladene Schrift): ohne Fahrt neu setzen.
    if (typeof ResizeObserver === 'undefined') return;
    const beobachter = new ResizeObserver(() => {
      if (kannFahren(s) && s.getAnimations().length > 0) return;
      const { oben, ziel, ohneZiel } = messen();
      setzen(oben, ziel, ohneZiel);
    });
    beobachter.observe(leiste);
    for (const n of leiste.querySelectorAll('nav')) beobachter.observe(n);
    return () => beobachter.disconnect();
  }, [aktiverPunkt]);

  return (
    <>
      <span ref={aufhaengung} className="navi-aufhaengung" aria-hidden="true" />
      <span ref={seil} className="navi-seil" aria-hidden="true" />
      <span ref={blei} className="navi-blei" aria-hidden="true" />
    </>
  );
}
