import { useEffect, useMemo, useState } from 'react';
import { listGenehmigungsAbwesenheiten, type GenehmigungsAbwesenheit } from '@/lib/db/vacations';
import { localDateStr, todayStr } from '@/lib/time';
import MonthCalendar from '@/components/MonthCalendar';
import Card from '@/components/Card';
import { ErrorState, SkeletonList } from '@/components/States';

/** Für Entscheidungen zählt, wer fehlt; private Gründe kommen ausschließlich aus der geschützten Abfrage. */
export default function Monatsabwesenheiten({ stand }: { stand: number }) {
  const heute = todayStr();
  const [monat, setMonat] = useState(() => [Number(heute.slice(0, 4)), Number(heute.slice(5, 7)) - 1]);
  const [tag, setTag] = useState(heute);
  const [abwesend, setAbwesend] = useState<GenehmigungsAbwesenheit[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);
  const [jahr, m] = monat;
  const von = localDateStr(new Date(jahr, m, 1));
  const bis = localDateStr(new Date(jahr, m + 1, 0));
  useEffect(() => {
    let weg = false;
    setLaedt(true);
    setFehler(null);
    setAbwesend([]);
    void listGenehmigungsAbwesenheiten(von, bis).then((rows) => {
      if (!weg) setAbwesend(rows);
    }).catch((e: Error) => { if (!weg) setFehler(e.message); })
      .finally(() => { if (!weg) setLaedt(false); });
    return () => { weg = true; };
  }, [von, bis, stand, versuch]);

  const zahlen = useMemo(() => {
    const personen = new Map<string, Set<string>>();
    const tage = new Date(jahr, m + 1, 0).getDate();
    for (let d = 1; d <= tage; d++) {
      const iso = localDateStr(new Date(jahr, m, d));
      const ids = new Set(abwesend.filter((a) => a.von <= iso && a.bis >= iso).map((a) => a.userId));
      if (ids.size) personen.set(iso, ids);
    }
    return new Map([...personen].map(([iso, ids]) => [iso, ids.size]));
  }, [abwesend, jahr, m]);
  const personen = new Map<string, { name: string; hinweise: Set<string> }>();
  for (const a of abwesend.filter((a) => a.von <= tag && a.bis >= tag)) {
    const p = personen.get(a.userId) ?? { name: a.name, hinweise: new Set<string>() };
    p.hinweise.add([a.grund || 'abwesend', a.zeiten].filter(Boolean).join(' · '));
    personen.set(a.userId, p);
  }
  return (
    <Card title="Monatsübersicht" hint="Genehmigte Abwesenheiten, Krankenstände und Berufsschule im Monat. Die Zahl zählt Personen; stundenweise Abwesenheiten stehen mit Uhrzeit. Private Gründe zeigt die App nur den berechtigten Rollen.">
      <MonthCalendar year={jahr} month={m} selected={tag} onSelect={setTag}
        onShiftMonth={(delta) => {
          const neu = new Date(jahr, m + delta, 1);
          setMonat([neu.getFullYear(), neu.getMonth()]); setTag(localDateStr(neu));
        }} marks={laedt || fehler ? undefined : zahlen}
        markLabel={(n) => `${n} ${n === 1 ? 'Person' : 'Personen'} abwesend`} />
      <div className="mt-3">
        {laedt ? <SkeletonList rows={2} /> : fehler
          ? <ErrorState message={fehler} onRetry={() => setVersuch((n) => n + 1)} />
          : personen.size ? <ul className="divide-y divide-line" aria-label={`Abwesend am ${tag}`}>
            {[...personen].sort((a, b) => a[1].name.localeCompare(b[1].name, 'de-AT')).map(([id, p]) => (
              <li key={id} className="py-2 text-sm"><span className="font-semibold">{p.name}</span>
                {' · '}{[...p.hinweise].join('; ')}</li>
            ))}
          </ul> : <p className="text-sm text-ink-muted">An diesem Tag ist keine Abwesenheit eingetragen.</p>}
      </div>
    </Card>
  );
}
