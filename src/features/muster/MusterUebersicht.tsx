import { useState } from 'react';
import Card from '@/components/Card';
import { useToast } from '@/components/Toast';
import { Segmente } from '@/components/LotBausteine';
import type { AppUser, TimeEntry } from '@/types';
import UebersichtListe, { type UebersichtZeile } from '@/features/accounting/UebersichtListe';
import { StreifenFeld, TippBereich } from '@/features/accounting/Streifen';
import { tageDerWoche, tageDesMonats, tagKurz, type TagesZustand, type Tageswert } from '@/features/accounting/tagesauswertung';

/**
 * MUSTERSEITE, RUNDE 4 — die Bausteine der Mitarbeiterübersicht (Auftrag 6):
 * Streifen mit allen sechs Zuständen, Kopf mit Montagen und „heute“, die
 * Wochenzellen und der Tooltip (ab 1.200 px beim Darüberfahren). Feste
 * Beispieldaten (Oktober 2026), damit die Seite jeden Tag gleich aussieht.
 */

const HEUTE = '2026-10-14';

function wert(tag: string, zustand: TagesZustand, x: Partial<Tageswert> = {}): Tageswert {
  const gebucht = zustand === 'ok' || zustand === 'grenze';
  return {
    tag,
    kurz: tagKurz(tag),
    zustand,
    eintraege: gebucht ? [{ date: tag, status: 'Anwesend', startTime: '07:00', endTime: '15:30' } as TimeEntry] : [],
    istMin: gebucht ? 480 : 0,
    abwesenheit: null,
    feiertag: null,
    frei: zustand === 'frei',
    sollMin: zustand === 'frei' || zustand === 'zukunft' ? null : 480,
    sollImSaldoMin: zustand === 'frei' || zustand === 'zukunft' ? 0 : 480,
    tagessollMin: zustand === 'frei' ? null : 480,
    zeiten: gebucht ? '07:00–15:30' : null,
    grenzen: [],
    offen: tag >= HEUTE,
    ...x,
  };
}

/** Ein Monat: Wochenende frei, Feiertag am 26., vor heute gebucht — mit je einem Tag jeder Art. */
function monat(besonders: Record<string, Partial<Tageswert> & { zustand: TagesZustand }>): Tageswert[] {
  return tageDesMonats(2026, 9).map((tag) => {
    const wt = new Date(`${tag}T00:00:00`).getDay();
    if (besonders[tag]) return wert(tag, besonders[tag].zustand, besonders[tag]);
    if (wt === 0 || wt === 6) return wert(tag, 'frei');
    if (tag === '2026-10-26') return wert(tag, 'frei', { feiertag: 'Nationalfeiertag' });
    return wert(tag, tag < HEUTE ? 'ok' : 'zukunft');
  });
}

const PERSONEN = [
  { uid: 'm1', name: 'Sabine Krenn', role: 'Buchhaltung' },
  { uid: 'm2', name: 'Stefan Gruber', role: 'Mitarbeiter' },
  { uid: 'm3', name: 'Lena Pichler', role: 'Mitarbeiter' },
] as AppUser[];

const krank: Partial<Tageswert> & { zustand: TagesZustand } = {
  zustand: 'weg', abwesenheit: 'Krank', eintraege: [], istMin: 0, zeiten: null, sollImSaldoMin: 0,
};
const schule: Partial<Tageswert> & { zustand: TagesZustand } = {
  zustand: 'weg', abwesenheit: 'Berufsschule', eintraege: [], istMin: 0, zeiten: null, sollImSaldoMin: 0,
};
const grenze: Partial<Tageswert> & { zustand: TagesZustand } = {
  zustand: 'grenze',
  istMin: 645,
  zeiten: '06:30–17:45',
  grenzen: [{ art: 'tag', bezug: '2026-10-06', jugendlich: true, ist: 645, grenze: 480 }],
};

const MONAT: UebersichtZeile[] = [
  {
    user: PERSONEN[0], status: '2 Tage ohne Buchung', achtung: true, offen: 2,
    werte: monat({ '2026-10-01': { zustand: 'fehlt', eintraege: [], istMin: 0, zeiten: null }, '2026-10-07': { zustand: 'fehlt', eintraege: [], istMin: 0, zeiten: null } }),
    gebucht: '64:00', soll: '80:00', saldo: '-16:00',
  },
  {
    user: PERSONEN[1], status: 'Obermonteur · vollständig', achtung: false, offen: 0,
    werte: monat({ '2026-10-08': krank, '2026-10-09': krank }),
    gebucht: '64:00', soll: '64:00', saldo: '00:00',
  },
  {
    user: PERSONEN[2], status: 'Lehrling, 2. Lehrjahr · heute offen', achtung: false, offen: 0,
    werte: monat({ '2026-10-06': { ...grenze, tag: '2026-10-06' }, '2026-10-12': schule }),
    gebucht: '74:45', soll: '72:00', saldo: '+02:45',
  },
];

const WOCHE_TAGE = tageDerWoche('2026-10-12');
const WOCHE: UebersichtZeile[] = MONAT.map((z) => {
  const werte = z.werte.filter((t) => WOCHE_TAGE.includes(t.tag));
  return { ...z, werte, offen: 0, status: z.status.replace(/ ·.*$/, '') };
});
WOCHE[0] = {
  ...WOCHE[0],
  status: '1 Tag fehlt',
  achtung: true,
  offen: 1,
  werte: WOCHE[0].werte.map((t) => (t.tag === '2026-10-13' ? wert(t.tag, 'fehlt', { eintraege: [], istMin: 0, zeiten: null }) : t)),
};

export default function MusterUebersicht() {
  const toast = useToast();
  const [ansicht, setAnsicht] = useState<'monat' | 'woche'>('monat');
  const oeffnen = (uid: string, tag: string | null) =>
    toast.info(`Seitenfenster: ${PERSONEN.find((p) => p.uid === uid)?.name}${tag ? `, ${tagKurz(tag)}` : ''} (Muster)`);
  const zustaende: Array<[TagesZustand, string]> = [
    ['ok', 'gebucht · .st-ok'],
    ['grenze', 'gebucht mit Fall der Arbeitszeitgrenzen · .st-grenze'],
    ['fehlt', 'Arbeitstag ohne Buchung · .st-fehlt'],
    ['weg', 'abwesend · .st-weg'],
    ['frei', 'Wochenende, Feiertag · .st-frei'],
    ['zukunft', 'heute und Zukunft · .st-zukunft'],
  ];
  return (
    <TippBereich>
      <Card title="Mitarbeiterübersicht: Streifen und Woche (Runde 4)">
        <div className="space-y-4">
          <ul className="space-y-1 text-sm text-ink-muted">
            {zustaende.map(([z, text]) => (
              <li key={z} className="flex items-center gap-2">
                <StreifenFeld zustand={z} />
                {text}
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-muted">
            Als „heute“ gilt hier {tagKurz(HEUTE)} — Darüberfahren zeigt den Tooltip (ab 1.200 px), ein Klick das
            Seitenfenster. Am Tablet stehen über dem Streifen nur Montage und heute.
          </p>
          <Segmente
            name="Muster-Ansicht"
            werte={[{ wert: 'monat', text: 'Monat' }, { wert: 'woche', text: 'Woche' }]}
            wert={ansicht}
            onChange={setAnsicht}
          />
          <UebersichtListe
            ansicht={ansicht}
            tage={ansicht === 'woche' ? WOCHE_TAGE : tageDesMonats(2026, 9)}
            heute={HEUTE}
            zeilen={ansicht === 'woche' ? WOCHE : MONAT}
            imSupport={false}
            onOeffnen={oeffnen}
          />
        </div>
      </Card>
    </TippBereich>
  );
}
