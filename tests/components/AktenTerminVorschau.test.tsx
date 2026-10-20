import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Termin } from '@/types';
import AktenTerminVorschau from '@/components/AktenTerminVorschau';

afterEach(() => vi.useRealTimers());

it('zeigt als nächsten Termin einen laufenden statt eines heute schon beendeten Termins', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  const termin = (id: string, von: string, bis: string): Termin => ({
    id, companyId: 'perl', art: 'Besichtigung', datum: '2026-10-20', teilnehmer: [],
    zeitVon: von, zeitBis: bis, notiz: id,
  });
  render(<MemoryRouter><AktenTerminVorschau bereich="planung" stand={{ fehler: false, termine: [
    termin('Bereits beendet', '08:00', '10:00'), termin('Laufende Besichtigung', '13:30', '14:30'),
    termin('Später am Tag', '16:00', '17:00'),
  ] }} /></MemoryRouter>);
  expect(screen.getByText('Laufende Besichtigung')).toBeInTheDocument();
  expect(screen.queryByText('Bereits beendet')).toBeNull();
  expect(screen.queryByText('Später am Tag')).toBeNull();
});
