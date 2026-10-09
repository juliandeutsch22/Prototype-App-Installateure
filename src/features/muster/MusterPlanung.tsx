import { useState } from 'react';
import type { AppUser, Assignment, Project, Termin } from '@/types';
import Card from '@/components/Card';
import { useToast } from '@/components/Toast';
import { PersonenWoche, type RasterGrund } from '@/features/assignments/WochenRaster';
import HandyWoche from '@/features/assignments/HandyWoche';
import { nachEinstufung, type Brett, type TagStand, type Zelle } from '@/features/assignments/planTypen';
import { wocheAb } from '@/features/assignments/wochenplan';
import { schmalerTag } from '@/features/assignments/wochenTermine';

/*
  MUSTERSEITE, RUNDE 4 — die Bausteine der Einsatzplanung (Auftrag
  Abschnitt 6) mit allen Zuständen, gezeichnet von denselben Komponenten wie
  auf der Seite: Tageskopf (heute, markiert, schmal, Wochenende mit
  Notdienst, „Lieferung ohne Annahme“, „N Termine“), Einsatzblock (mit Zeit,
  mit Ort, mit Zusatzzeile, „als Helfer“), eingeteilt aber abwesend,
  abwesend, Termin-Eintrag, leere Zelle; die Hinweiszeile; am Handy die
  Tageswahl mit Punkten und die Tagesliste. Feste Beispieldaten.
*/

const MONTAG = '2026-10-05';
const TAGE = wocheAb(MONTAG);
const HEUTE = '2026-10-07';

const person = (uid: string, name: string, einstufung?: string) =>
  ({ id: uid, uid, name, companyId: 'muster', email: '', role: 'Mitarbeiter', active: true, einstufung }) as AppUser;
const LEUTE = [
  person('m1', 'Stefan Gruber', 'obermonteur'),
  person('m2', 'Max Mustermann'),
  person('m3', 'Jürgen Fasching', 'helfer'),
  person('m4', 'Lena Pichler', 'lehrling'),
];
const PROJEKTE = [
  { projectNumber: 'B-2026-0147', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', address: 'Hauptstraße 112, 2700 Wiener Neustadt', bezeichnung: 'Heizungstausch' },
  { projectNumber: 'B-2026-0148', customerName: 'Gemeinde Neudorf', address: 'Rathausplatz 1, 2620 Neunkirchen' },
] as Project[];

const E = (date: string, pn: string, uid: string, x: Partial<Assignment> = {}) =>
  ({ id: `${date}-${uid}-${pn}`, companyId: 'muster', date, projectNumber: pn, userId: uid, userName: '', ...x }) as Assignment;
const EINSAETZE = [
  E(TAGE[0], 'B-2026-0147', 'm1', { zeitVon: '07:00', zeitBis: '15:30' }),
  E(TAGE[1], 'B-2026-0147', 'm1'),
  E(TAGE[1], 'B-2026-0147', 'm3'),
  E(TAGE[2], 'B-2026-0147', 'm1'),
  E(TAGE[2], 'B-2026-0148', 'm1', { zeitVon: '16:00', zeitBis: '18:00' }),
  E(TAGE[2], 'B-2026-0148', 'm2', { asHelper: true }),
  E(TAGE[3], 'B-2026-0147', 'm3'),
  E(TAGE[5], 'B-2026-0148', 'm2', { zeitVon: '08:00', zeitBis: '12:00' }),
];
const TERMINE: Termin[] = [
  { id: 'mt1', companyId: 'muster', art: 'Lieferung', datum: TAGE[1], zeitVon: '08:00', zeitBis: '10:00', projectNumber: 'B-2026-0147', teilnehmer: ['m1'], ortName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118' },
  { id: 'mt2', companyId: 'muster', art: 'Besichtigung', datum: TAGE[2], zeitVon: '14:00', zeitBis: '15:00', customerId: 'k', teilnehmer: ['m2'], ortName: 'Familie Huber' },
  { id: 'mt3', companyId: 'muster', art: 'Lieferung', datum: TAGE[4], zeitVon: '07:00', zeitBis: '09:00', projectNumber: 'B-2026-0149', teilnehmer: [], ortName: 'Familie Huber' },
];
/** Jürgen am Donnerstag krank (eingeteilt), Lena am Freitag in der Berufsschule, Max am Montag stundenweise weg. */
const WEG: Record<string, Record<string, { text: string; ganz: boolean }>> = {
  m3: { [TAGE[3]]: { text: 'Krank', ganz: true } },
  m4: { [TAGE[4]]: { text: 'Berufsschule', ganz: true } },
  m2: { [TAGE[0]]: { text: 'ZA 13:00–17:00', ganz: false } },
};

function brettBauen(): Brett {
  const m: Brett = new Map();
  for (const u of LEUTE) {
    const proTag = new Map<string, Zelle>();
    for (const tag of TAGE) {
      const weg = WEG[u.uid]?.[tag];
      proTag.set(tag, {
        baustellen: EINSAETZE.filter((a) => a.userId === u.uid && a.date === tag).map((a) => ({
          nummer: a.projectNumber,
          name: PROJEKTE.find((p) => p.projectNumber === a.projectNumber)?.customerName ?? a.projectNumber,
          helfer: !!a.asHelper,
          zeit: a.zeitVon ? `${a.zeitVon}${a.zeitBis ? `–${a.zeitBis}` : ''}` : null,
        })),
        imUrlaub: !!weg?.ganz,
        abwesendText: weg?.text ?? null,
      });
    }
    m.set(u.uid, proTag);
  }
  return m;
}
const BRETT = brettBauen();
const PRO_TAG = new Map<string, TagStand>(
  TAGE.map((tag) => {
    const frei = LEUTE.filter((u) => {
      const z = BRETT.get(u.uid)?.get(tag);
      return !z?.imUrlaub && !z?.baustellen.length;
    });
    return [tag, { baustellen: [], frei: frei.map((u) => u.name), freiIds: frei.map((u) => u.uid), urlaub: [] }];
  }),
);

export default function MusterPlanung() {
  const toast = useToast();
  const [handyTag, setHandyTag] = useState(TAGE[1]);
  const termineAm = (tag: string) => TERMINE.filter((t) => t.datum === tag);
  const zeigen = (was: string) => () => toast.info(`Öffnet: ${was} (Muster).`);
  const grund: RasterGrund = {
    tage: TAGE,
    heute: HEUTE,
    markiert: TAGE[3],
    schmal: new Set(TAGE.filter((t) => schmalerTag(t, EINSAETZE, TERMINE))),
    proTag: PRO_TAG,
    freiJeTag: new Map(TAGE.map((t) => [t, PRO_TAG.get(t)?.frei.length ?? 0])),
    zuAm: new Map(),
    einsaetze: EINSAETZE,
    termineAm,
    darf: true,
    onTag: zeigen('Seitenfenster „Tag“'),
    onEinsatz: zeigen('Einsatz planen/bearbeiten'),
    onTermin: zeigen('Termin ändern'),
  };
  const infoFuer = (_tag: string, nummer: string) => ({ projekt: PROJEKTE.find((p) => p.projectNumber === nummer), stand: undefined });

  return (
    <>
      <Card title="Einsatzplanung: Hinweiszeile" buendig>
        <div className="p-4">
          <div className="planung-hinweiszeile">
            <p className="hinweis-text">2 laufende Baustellen ohne Einsatz in dieser Woche: Familie Huber, Bäckerei Mayr</p>
            <button type="button" className="wp-textknopf" onClick={zeigen('Noch einzuplanen')}>
              Noch einzuplanen …
            </button>
          </div>
        </div>
      </Card>

      <Card title="Einsatzplanung: Raster der Woche" buendig>
        <PersonenWoche
          g={grund}
          gruppen={nachEinstufung(LEUTE)}
          zu={new Set()}
          onGruppe={() => undefined}
          brett={BRETT}
          zuFuer={() => false}
          infoFuer={infoFuer}
        />
      </Card>

      <Card title="Einsatzplanung: Woche am Handy" buendig>
        <HandyWoche
          tage={TAGE}
          heute={HEUTE}
          gewaehlt={handyTag}
          onWahl={setHandyTag}
          gruppen={nachEinstufung(LEUTE)}
          brett={BRETT}
          proTag={PRO_TAG}
          zuAm={new Map()}
          zuFuer={() => false}
          einsaetze={EINSAETZE}
          termineAm={termineAm}
          infoFuer={infoFuer}
          darf
          onTag={zeigen('Seitenfenster „Tag“')}
          onEinsatz={zeigen('Einsatz planen/bearbeiten')}
          onTermin={zeigen('Termin ändern')}
          onTerminNeu={zeigen('Termin anlegen')}
        />
      </Card>
    </>
  );
}
