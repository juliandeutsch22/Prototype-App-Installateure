import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import { Segmente } from '@/components/LotBausteine';
import { ANSICHTSWECHSEL } from '@/lib/ansichtswechsel';

/*
  DER KOPF DER EINSATZPLANUNG (Runde 4, Auftrag 4.1) — für „Woche“, „Monat“
  und „Tag“ derselbe. Vorher standen die Reiter „Wochenplan | Tag planen“
  über dem Titel, und jede Seite trug ihren eigenen Titel: der Titel stand
  doppelt da. Jetzt EIN Titel und in der Steuerung der Umschalter.

  DIE ADRESSEN BLEIBEN: Woche `/assignments/woche`, Monat
  `/assignments/woche?ansicht=monat`, Tag `/assignments/tag`. Lesezeichen
  und „Zurück“ tun, was sie vorher taten.
*/

export type PlanAnsicht = 'woche' | 'monat' | 'tag';

/**
 * Der Seitenkopf — Ortszeile ist die Gruppe der Navigation, wie auf den übrigen Seiten.
 *
 * `mehr`: das ⋯ der Seite. Dort steht „Termin anlegen“ (20.10.2026) — in
 * allen drei Ansichten an derselben Stelle, neben der einen Hauptaktion
 * „Einsatz planen“. Vorher fand man den Weg am Schreibtisch nur über den
 * Kopf eines Tages und im Monat gar nicht.
 */
export function PlanungsSeitenkopf({
  action,
  hilfe,
  mehr,
  stand,
}: {
  action?: ReactNode;
  hilfe?: ReactNode;
  mehr?: ReactNode;
  /** Das Schriftfeld des Plankopfs (Planlinie, B1) — eine `MetricRow`. */
  stand?: ReactNode;
}) {
  return (
    <PageHeader
      ort="Aufträge"
      title="Einsatzplanung"
      subtitle="Wer ist wann auf welcher Baustelle?"
      hilfe={hilfe}
      mehr={mehr}
      action={action}
      stand={stand}
      /*
        KEINE SKIZZE IM SCHRIFTFELD: der eine Akzent dieser Seite ist das
        Raster der Planungsfläche (Planlinie, B12) — zwei Akzente machten
        aus dem Plankopf eine Bühne.
      */
      skizze={false}
    />
  );
}

/**
 * „Woche | Monat | Tag“. Ein Wechsel nach „Tag“ (und von dort zurück) ist
 * ein neuer Eintrag im Verlauf, wie vorher der Reiter; Woche und Monat
 * wechselt die Seite selbst (`onWocheMonat`), damit der gezeigte Zeitraum
 * mitgeht.
 */
export function AnsichtWahl({
  ansicht,
  onWocheMonat,
}: {
  ansicht: PlanAnsicht;
  onWocheMonat?: (neu: 'woche' | 'monat') => void;
}) {
  const navigate = useNavigate();
  return (
    <Segmente
      name="Zeitraum"
      werte={[
        { wert: 'woche', text: 'Woche' },
        { wert: 'monat', text: 'Monat' },
        { wert: 'tag', text: 'Tag' },
      ]}
      wert={ansicht}
      onChange={(neu: PlanAnsicht) => {
        if (neu === ansicht) return;
        if (neu === 'tag') navigate('/assignments/tag', { state: ANSICHTSWECHSEL });
        else if (onWocheMonat) onWocheMonat(neu);
        else navigate(neu === 'monat' ? '/assignments/woche?ansicht=monat' : '/assignments/woche', { state: ANSICHTSWECHSEL });
      }}
    />
  );
}
