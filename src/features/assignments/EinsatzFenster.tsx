import { useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { deleteAssignment } from '@/lib/db/assignments';
import type { Abwesenheit } from '@/lib/db/vacations';
import type { WithId } from '@/lib/db/core';
import type { AppUser, Assignment, Betriebsurlaub, Project, Termin } from '@/types';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import { SelectField } from '@/components/Field';
import { useModul } from '@/lib/useModule';
import EinsatzFormular from './EinsatzFormular';
import { fmtDay, useMaterialstamm, useRuestlistenDesTages } from './einsatzDaten';

/** Womit das Fenster geöffnet wird — aus einer Zelle, einer Baustelle oder dem Kopf. */
export interface FensterStart {
  datum: string;
  projectNumber?: string;
  /** Aus der freien Zelle einer Person: sie ist schon gewählt. */
  person?: string;
}

/**
 * PLANEN UND BEARBEITEN IM SEITENFENSTER (Linie „Lot“, Regel 8 und E2):
 * am Tablet und Schreibtisch rechts, am Handy ein Blatt von unten. Der
 * Wochenplan bleibt dahinter stehen — man sieht, wer frei ist, während man
 * einteilt.
 *
 * DER TAG IST NUR UNTER DEN GELADENEN WÄHLBAR. Das Formular übernimmt die
 * vorhandene Planung aus den Einsätzen des Tages; ein Tag ausserhalb der
 * gezeigten Woche stünde leer da, und Speichern überschriebe, was dort
 * schon geplant ist. Für jeden anderen Tag gibt es „Tag planen“.
 */
export default function EinsatzFenster({
  start,
  tage,
  einsaetze,
  users,
  staff,
  projects,
  onProjekt,
  urlaube,
  betriebsurlaube,
  termine,
  onClose,
  onTagPlanen,
}: {
  start: FensterStart;
  /** Die Tage, deren Einsätze geladen sind. */
  tage: string[];
  einsaetze: WithId<Assignment>[];
  users: AppUser[];
  staff: AppUser[];
  projects: Project[];
  onProjekt: (p: WithId<Project>) => void;
  urlaube: Abwesenheit[];
  betriebsurlaube: Betriebsurlaub[];
  termine: Termin[];
  onClose: () => void;
  /** Den ganzen Tag in „Tag planen“ öffnen — mit Terminen und allen Einsätzen. */
  onTagPlanen: (datum: string, projectNumber?: string) => void;
}) {
  const { user } = useAuth();
  const materialAn = useModul('material');
  const [datum, setDatum] = useState(start.datum);
  const [projectNumber, setProjectNumber] = useState(start.projectNumber ?? '');

  const materials = useMaterialstamm(user?.companyId, materialAn);
  const tagesListen = useRuestlistenDesTages(user?.companyId, datum, materialAn);
  // Gleichbleibend, solange sich nichts ändert: daran hängt das Übernehmen ins Formular.
  const tagesEinsaetze = useMemo(() => einsaetze.filter((a) => a.date === datum), [einsaetze, datum]);
  const termineDesTages = useMemo(() => termine.filter((t) => t.datum === datum), [termine, datum]);

  const bearbeiten = !!projectNumber && tagesEinsaetze.some((a) => a.projectNumber === projectNumber);
  const titel = bearbeiten ? 'Einsatz bearbeiten' : 'Einsatz planen';

  return (
    <BottomSheet open onClose={onClose} label={titel} auchBreit titel={titel}>
      <div className="space-y-4">
        <SelectField id="fenster-tag" label="Tag" value={datum} onChange={(e) => setDatum(e.target.value)}>
          {tage.map((t) => (
            <option key={t} value={t}>
              {fmtDay(t)}
            </option>
          ))}
        </SelectField>
        <EinsatzFormular
          date={datum}
          projectNumber={projectNumber}
          onProjectNumber={setProjectNumber}
          startPerson={start.person}
          users={users}
          staff={staff}
          projects={projects}
          onProjekt={onProjekt}
          tagesEinsaetze={tagesEinsaetze}
          urlaube={urlaube}
          betriebsurlaube={betriebsurlaube}
          termineDesTages={termineDesTages}
          materials={materials}
          tagesListen={tagesListen}
          onGespeichert={onClose}
          onLoeschen={(a) => deleteAssignment(a.id)}
        />
        {/*
          DER GANZE TAG BLEIBT EINEN TIPP ENTFERNT: Termine anlegen, alle
          Einsätze des Tages untereinander, ein Tag ausserhalb der Woche.
        */}
        <Button variant="ghost" onClick={() => onTagPlanen(datum, projectNumber || undefined)}>
          Ganzen Tag in „Tag planen“ öffnen
        </Button>
      </div>
    </BottomSheet>
  );
}
