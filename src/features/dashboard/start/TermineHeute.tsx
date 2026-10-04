import type { Termin } from '@/types';
import { AdresseLink } from '@/components/Kontakt';
import { bezugText, terminKopf } from '@/features/termine/terminText';
import StartKarte from './StartKarte';

/**
 * DEINE TERMINE HEUTE (Plan 10.4) — Besichtigung, Abnahme, Lieferung, an
 * denen man teilnimmt. Mit Adresse, antippbar: wer teilnimmt, fährt hin.
 * Ein Termin bucht nichts; die Zeit bucht man wie immer.
 */
export default function TermineHeute({ termine, planVerweis }: { termine: Termin[]; planVerweis: boolean }) {
  if (termine.length === 0) return null;
  return (
    <StartKarte
      titel="Deine Termine heute"
      zusatz={termine.length === 1 ? '1 Termin' : `${termine.length} Termine`}
      verweis={planVerweis ? { to: '/my-schedule', text: 'Mein Einsatzplan' } : undefined}
    >
      <ul className="divide-y divide-line">
        {termine.map((t) => (
          <li key={t.id} className="px-4 py-3">
            <p className="font-semibold text-ink-deep">{terminKopf(t)}</p>
            <p className="text-meta text-ink-muted">{bezugText(t)}</p>
            {t.ortAdresse && <AdresseLink adresse={t.ortAdresse} className="text-sm" />}
            {t.notiz && <p className="mt-1 whitespace-pre-line text-sm text-ink">{t.notiz}</p>}
          </li>
        ))}
      </ul>
    </StartKarte>
  );
}
