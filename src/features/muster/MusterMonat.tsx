import { useMemo, useState } from 'react';
import { Segmente } from '@/components/LotBausteine';
import { useToast } from '@/components/Toast';
import { isWeekend, todayStr } from '@/lib/time';
import type { Abwesenheit } from '@/lib/db/vacations';
import type { WithId } from '@/lib/db/core';
import type { AppUser, Assignment, Project, Termin } from '@/types';
import MonatsAnsicht from '@/features/assignments/MonatsAnsicht';
import type { MonatsQuelle } from '@/features/assignments/monatsQuelle';
import { monatsTage } from '@/features/assignments/planungKopf';
import { einsatzZeit } from '@/features/assignments/einsatzZeit';
import { nachEinstufung, type Brett, type Zelle } from '@/features/assignments/planTypen';
import { kurzname } from '@/features/assignments/kurzname';

/*
  MUSTER, RUNDE 4 — DER MONAT (Auftrag 5 und 6): Balken je Person und je
  Baustelle, zwei Bahnen an einem Tag, eingeteilt aber abwesend, Abwesenheit
  über ein Wochenende, eine Lieferung ohne Annahme im Kopf, die Vorschau und
  am Handy der Kalender. Mit Beispieldaten des laufenden Monats; nichts wird
  gelesen oder gespeichert — „Bearbeiten“, „Termin ändern“ und „Zur Woche“
  melden nur, was die Seite täte.
*/

const mk = (uid: string, name: string, einstufung?: AppUser['einstufung']) =>
  ({ id: uid, uid, companyId: 'muster', name, email: `${uid}@muster.at`, role: 'Mitarbeiter', active: true, einstufung }) as AppUser;

const LEUTE: AppUser[] = [
  mk('m1', 'Stefan Gruber', 'obermonteur'),
  mk('m2', 'Anton Berger-Steinmetz'),
  mk('m3', 'Max Mustermann'),
  mk('m4', 'Jürgen Fasching', 'helfer'),
  mk('m5', 'Lena Pichler', 'lehrling'),
];

const BAUSTELLEN: Project[] = [
  { id: 'mp1', projectNumber: 'M-0147', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', bezeichnung: 'Heizungstausch', address: 'Hauptstraße 112–118, 2700 Wiener Neustadt' },
  { id: 'mp2', projectNumber: 'M-0148', customerName: 'Gemeinde Neudorf bei Wiener Neustadt', address: 'Rathausplatz 1, 2620 Neunkirchen' },
  { id: 'mp3', projectNumber: 'M-0149', customerName: 'CT Bau GmbH', bezeichnung: 'Rohbau Haus 3', address: 'Industriestraße 4, 4050 Traun' },
  { id: 'mp4', projectNumber: 'M-0150', customerName: 'Familie Huber', address: 'Ringstraße 3, 8200 Gleisdorf' },
].map((p) => ({ companyId: 'muster', status: 'Aktiv', ...p }) as Project);

/** Die Werktage des Monats ab einem Tag (1-basiert), so viele wie verlangt. */
function werktage(tage: string[], ab: number, anzahl: number): string[] {
  return tage.slice(ab - 1).filter((t) => !isWeekend(new Date(`${t}T00:00:00`))).slice(0, anzahl);
}

export default function MusterMonat() {
  const toast = useToast();
  const heute = todayStr();
  const tage = useMemo(() => monatsTage(Number(heute.slice(0, 4)), Number(heute.slice(5, 7)) - 1), [heute]);
  const [sicht, setSicht] = useState<'personen' | 'baustellen'>('personen');
  const [zu, setZu] = useState<Set<string>>(new Set());

  const { einsaetze, urlaube, termine } = useMemo(() => {
    let nr = 0;
    const e = (date: string, projectNumber: string, userId: string, x: Partial<Assignment> = {}): WithId<Assignment> => ({
      id: `me${(nr += 1)}`,
      companyId: 'muster',
      date,
      projectNumber,
      userId,
      userName: LEUTE.find((u) => u.uid === userId)?.name,
      ...x,
    });
    const liste: WithId<Assignment>[] = [
      // Stefan: zwei Wochen auf derselben Baustelle — ein Balken je Woche, das Wochenende trennt.
      ...werktage(tage, 1, 10).map((t) => e(t, 'M-0147', 'm1', { zeitVon: '07:00', zeitBis: '15:30', comment: 'Steigleitung Stiege 2' })),
      // Anton mit Stefan, dazwischen ein Tag woanders — zwei Balken.
      ...werktage(tage, 1, 3).map((t) => e(t, 'M-0147', 'm2', { asHelper: true })),
      ...werktage(tage, 8, 4).map((t) => e(t, 'M-0149', 'm2', { comment: 'Rohinstallation Bad' })),
      // Max: kurze Einsätze, an einem Tag zwei Baustellen (zweite Bahn).
      ...werktage(tage, 3, 2).map((t) => e(t, 'M-0148', 'm3')),
      e(werktage(tage, 4, 1)[0], 'M-0150', 'm3', { zeitVon: '16:00', zeitBis: '18:00', comment: 'Therme entlüften' }),
      ...werktage(tage, 15, 5).map((t) => e(t, 'M-0150', 'm3')),
      // Jürgen: eingeteilt, aber an einem Tag krank (Bernstein).
      ...werktage(tage, 6, 4).map((t) => e(t, 'M-0148', 'm4')),
      // Lena: Lehrling mit Max.
      ...werktage(tage, 15, 3).map((t) => e(t, 'M-0150', 'm5', { asHelper: true })),
    ];
    // Ein Notdienst am ersten Samstag.
    const samstag = tage.find((t) => new Date(`${t}T00:00:00`).getDay() === 6);
    if (samstag) liste.push(e(samstag, 'M-0148', 'm3', { zeitVon: '08:00', zeitBis: '12:00', comment: 'Notdienst Rohrbruch' }));

    const krank = werktage(tage, 6, 4)[2];
    const u: Abwesenheit[] = [
      { userId: 'm4', von: krank, bis: krank, grund: 'Krank', zeiten: null },
      // Urlaub über ein Wochenende: ein Balken, wie die Abwesenheit eingetragen ist.
      { userId: 'm2', von: werktage(tage, 18, 1)[0], bis: werktage(tage, 18, 6)[5], grund: 'Urlaub', zeiten: null },
      { userId: 'm5', von: werktage(tage, 10, 1)[0], bis: werktage(tage, 10, 1)[0], grund: 'Berufsschule', zeiten: null },
      { userId: 'm1', von: werktage(tage, 22, 1)[0], bis: werktage(tage, 22, 1)[0], grund: 'ZA', zeiten: '13:00–17:00' },
    ];
    const t: Termin[] = [
      { id: 'mt1', companyId: 'muster', art: 'Lieferung', datum: werktage(tage, 2, 1)[0], zeitVon: '08:00', zeitBis: '10:00', projectNumber: 'M-0147', teilnehmer: ['m1'], ortName: BAUSTELLEN[0].customerName },
      { id: 'mt2', companyId: 'muster', art: 'Lieferung', datum: werktage(tage, 12, 1)[0], zeitVon: '07:00', zeitBis: '09:00', projectNumber: 'M-0150', teilnehmer: [], ortName: 'Familie Huber' },
      { id: 'mt3', companyId: 'muster', art: 'Besichtigung', datum: werktage(tage, 9, 1)[0], zeitVon: '14:00', zeitBis: '15:00', customerId: 'k', teilnehmer: ['m3'], ortName: 'Anna Beispiel' },
    ];
    return { einsaetze: liste.filter((a) => !!a.date), urlaube: u.filter((a) => !!a.von && !!a.bis), termine: t.filter((x) => !!x.datum) };
  }, [tage]);

  /** Wie die Seite rechnet (`WochenplanView`): je Person und Tag die Zelle. */
  const brett = useMemo(() => {
    const m: Brett = new Map();
    const hole = (uid: string, tag: string): Zelle => {
      const proTag = m.get(uid) ?? new Map<string, Zelle>();
      m.set(uid, proTag);
      const z = proTag.get(tag) ?? { baustellen: [], imUrlaub: false, abwesendText: null };
      proTag.set(tag, z);
      return z;
    };
    for (const a of einsaetze) {
      const p = BAUSTELLEN.find((x) => x.projectNumber === a.projectNumber);
      hole(a.userId, a.date).baustellen.push({ nummer: a.projectNumber, name: p?.customerName ?? a.projectNumber, helfer: !!a.asHelper, zeit: einsatzZeit(a) });
    }
    for (const v of urlaube) {
      for (const tag of tage) {
        if (v.von <= tag && v.bis >= tag) {
          const z = hole(v.userId, tag);
          if (!v.zeiten) z.imUrlaub = true;
          z.abwesendText = [v.grund ?? 'abwesend', v.zeiten].filter(Boolean).join(' ');
        }
      }
    }
    return m;
  }, [einsaetze, urlaube, tage]);

  const gruppen = useMemo(() => nachEinstufung(LEUTE), []);

  /** Tage ausserhalb des Beispielmonats: leer — die Musterseite liest keinen Betrieb. */
  const quelle = useMemo<MonatsQuelle>(
    () => ({
      tag: async () => ({ einsaetze: [], urlaube: [], termine: [], zu: null, zuFuer: () => false }),
      projekte: async () => [],
      ruestlisten: async (_c, tag) =>
        tag === einsaetze.find((a) => a.projectNumber === 'M-0147')?.date
          ? [{ date: tag, projectNumber: 'M-0147', positionen: [{ id: 'r1', materialId: 'x1', name: 'Kupferrohr 22 mm', menge: 6 }, { id: 'r2', name: 'Leihgerät Rohrkamera', menge: 1 }] }]
          : [],
      lager: async () => new Map([['x1', { frei: 4 }]]),
    }),
    [einsaetze],
  );

  return (
    // Keine Karte um den Monat: er bringt seine eigene mit (keine Karte in der Karte).
    <section className="space-y-3" aria-label="Runde 4: Monat mit Balken und Vorschau">
      <h2 className="titel-karte">Runde 4: Monat mit Balken und Vorschau</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-meta text-ink-muted">
          Kurznamen: {BAUSTELLEN.map((p) => `${p.customerName} → ${kurzname(p.customerName)}`).join(' · ')}
        </p>
        <div className="hidden md:block">
          <Segmente
            name="Sicht im Monat"
            werte={[{ wert: 'personen', text: 'Personen' }, { wert: 'baustellen', text: 'Baustellen' }]}
            wert={sicht}
            onChange={setSicht}
          />
        </div>
      </div>
      <div>
        <MonatsAnsicht
          tage={tage}
          heute={heute}
          gruppen={gruppen}
          zu={zu}
          onGruppe={(g) =>
            setZu((alt) => {
              const neu = new Set(alt);
              if (neu.has(g)) neu.delete(g);
              else neu.add(g);
              return neu;
            })
          }
          brett={brett}
          zuFuer={() => false}
          einsaetze={einsaetze}
          projects={BAUSTELLEN}
          urlaube={urlaube}
          staff={LEUTE}
          sicht={sicht}
          termine={termine}
          zuAm={new Map()}
          onEinsatz={(s) =>
            toast.info(
              `Öffnet das Seitenfenster „${s.projectNumber ? 'Einsatz bearbeiten' : 'Einsatz planen'}“ — ${s.datum}${s.projectNumber ? `, ${s.projectNumber}` : ''}${s.person ? `, ${LEUTE.find((u) => u.uid === s.person)?.name}` : ''} (Muster).`,
            )
          }
          onTermin={(t) => toast.info(`Öffnet „Termin ändern“: ${t.art} am ${t.datum} (Muster).`)}
          onZurWoche={(tag) => toast.info(`Wechselt in die Woche von ${tag}, Tageskopf markiert (Muster).`)}
          quelle={quelle}
        />
      </div>
    </section>
  );
}
