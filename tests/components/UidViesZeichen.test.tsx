import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import UidVies from '@/features/customers/UidVies';
import type { UidViesStand } from '@/features/customers/useUidVies';
import type { Customer, UidPruefung } from '@/types';

vi.mock('@/features/customers/useUidVies', () => ({ default: () => null }));

/*
  PLANLINIE B3 — das Ergebnis der VIES-Abfrage. „gültig“ ist ein Befund,
  kein laufender Vorgang: der Haken von „erledigt“, nicht der halbe Kreis
  von „in Arbeit“. „nicht gültig“ bleibt rot — das ist die Gegenprobe.
*/
const KUNDE = { id: 'k1', companyId: 'perl', name: 'Firma', kundenart: 'unternehmen', vatId: 'ATU12345678' } as unknown as Customer & { id: string };

function stand(gueltig: boolean): UidViesStand {
  const pruefung = { id: 'p1', customerId: 'k1', uid: 'ATU12345678', gueltig, abgefragtAm: Date.UTC(2026, 9, 20, 9) } as UidPruefung;
  return { liste: [pruefung], laeuft: false, fehler: null, hinweis: null, pruefen: async () => undefined } as unknown as UidViesStand;
}

describe('UID-Prüfung — Statuszeichen (Planlinie B3)', () => {
  it('gültig trägt den Haken von „erledigt“', () => {
    render(<UidVies kunde={KUNDE} stand={stand(true)} uidGeaendert={false} darfPruefen={false} />);
    expect(screen.getByText('gültig')).toHaveClass('stand', 'stand-erledigt');
  });

  it('Gegenprobe: nicht gültig bleibt überfällig-rot', () => {
    render(<UidVies kunde={KUNDE} stand={stand(false)} uidGeaendert={false} darfPruefen={false} />);
    expect(screen.getByText('nicht gültig')).toHaveClass('stand', 'stand-fehl');
  });
});
