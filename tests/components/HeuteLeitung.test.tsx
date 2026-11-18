import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Assignment, Project } from '@/types';
import type { MonatsQuelle } from '@/features/assignments/monatsQuelle';
import HeuteLeitung, { type EinsatzVorschauGrund } from '@/features/dashboard/start/HeuteLeitung';
import type { TagesBaustelle } from '@/features/dashboard/start/regeln';

/*
  „DIE MANNSCHAFT HEUTE“: EIN EINSATZ ÖFFNET SEINE VORSCHAU (E98).
  Gegenprobe: vor E98 war jede Zeile ein Verweis auf den Tag der Planung —
  es gab keinen Knopf und kein Fenster, die Tests „öffnet …“ sind rot.
  Was gleich bleiben muss, prüft ein eigener Test: die Abwesenden führen
  weiter auf den Tag, und ohne Vorschau-Grund bleibt alles ein Verweis.
*/
const HEUTE = '2026-11-18';
const tag: TagesBaustelle[] = [
  { projectNumber: 'B-2026-0147', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße', namen: ['Max Monteur'], fehlen: [], unbesetzt: false },
];
const projekt = { id: 'p1', projectNumber: 'B-2026-0147', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße', address: 'Hauptstraße 112, 1100 Wien' } as Project;
const einsatz = {
  id: 'a1', companyId: 'c1', date: HEUTE, projectNumber: 'B-2026-0147', userId: 'u1', userName: 'alt', zeitVon: '07:00', zeitBis: '15:30', comment: 'Steigleitung tauschen',
} as unknown as Assignment;

function quelle(tagDaten: MonatsQuelle['tag'] = async () => ({ einsaetze: [einsatz], urlaube: [], termine: [], zu: null, zuFuer: () => false })): MonatsQuelle {
  return {
    tag: vi.fn(tagDaten),
    projekte: vi.fn(async () => []),
    ruestlisten: vi.fn(async () => []),
    deckung: vi.fn(async () => new Map()),
  };
}

function grund(teil: Partial<EinsatzVorschauGrund> = {}): EinsatzVorschauGrund {
  return {
    betrieb: 'c1', projekte: [projekt], namen: [{ uid: 'u1', name: 'Max Monteur' }], materialAn: false,
    baustelleSichtbar: true, darfBearbeiten: true, quelle: quelle(), ...teil,
  };
}

function Ort() {
  const l = useLocation();
  return <p data-testid="ort">{`${l.pathname}|${JSON.stringify(l.state)}`}</p>;
}

function zeigen(vorschau?: EinsatzVorschauGrund) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HeuteLeitung heute={HEUTE} abwesend={[{ uid: 'u2', name: 'Eva Krank', grund: 'Krank', bis: HEUTE, zeiten: null }]} tag={tag} vorschau={vorschau} />} />
        <Route path="*" element={<Ort />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Die Mannschaft heute — Einsatz-Vorschau (E98)', () => {
  it('öffnet die Vorschau an Ort und Stelle: Zeit, Adresse, Eingeteilte, Aufgabe', async () => {
    const g = grund();
    zeigen(g);
    const imEinsatz = screen.getByRole('region', { name: 'Im Einsatz' });
    expect(within(imEinsatz).queryByRole('link')).toBeNull();
    await userEvent.click(within(imEinsatz).getByRole('button', { name: /Wohnungseigentümergemeinschaft/ }));
    const fenster = await screen.findByRole('dialog');
    await waitFor(() => expect(fenster).toHaveTextContent('Steigleitung tauschen'));
    expect(fenster).toHaveTextContent('07:00–15:30');
    expect(fenster).toHaveTextContent('Hauptstraße 112, 1100 Wien');
    // Der Name aus der Belegschaft, nicht der beim Einteilen mitgeschriebene.
    expect(fenster).toHaveTextContent('Max Monteur');
    expect(fenster).not.toHaveTextContent('alt');
    expect(g.quelle!.tag).toHaveBeenCalledWith('c1', HEUTE);
    // Nur heute: kein Blättern.
    expect(within(fenster).queryByRole('button', { name: 'Nächster Tag' })).toBeNull();
    expect(within(fenster).getByRole('link', { name: 'Baustelle öffnen' })).toHaveAttribute('href', '/admin-projects/p1');
  });

  it('„Bearbeiten“ führt in die Tagesplanung, mit Tag und Baustelle', async () => {
    zeigen(grund());
    await userEvent.click(screen.getByRole('button', { name: /Wohnungseigentümergemeinschaft/ }));
    const fenster = await screen.findByRole('dialog');
    await userEvent.click(within(fenster).getByRole('button', { name: 'Bearbeiten' }));
    expect(screen.getByTestId('ort')).toHaveTextContent(`/assignments/tag|{"datum":"${HEUTE}","projectNumber":"B-2026-0147"}`);
  });

  it('wer nur lesen darf, bekommt kein „Bearbeiten“', async () => {
    zeigen(grund({ darfBearbeiten: false, baustelleSichtbar: false }));
    await userEvent.click(screen.getByRole('button', { name: /Wohnungseigentümergemeinschaft/ }));
    const fenster = await screen.findByRole('dialog');
    await waitFor(() => expect(fenster).toHaveTextContent('Steigleitung tauschen'));
    expect(within(fenster).queryByRole('button', { name: 'Bearbeiten' })).toBeNull();
    expect(within(fenster).queryByRole('link', { name: 'Baustelle öffnen' })).toBeNull();
  });

  it('lädt der Tag nicht, sagt die Vorschau es — statt ewig „…“', async () => {
    zeigen(grund({ quelle: quelle(async () => { throw new Error('weg'); }) }));
    await userEvent.click(screen.getByRole('button', { name: /Wohnungseigentümergemeinschaft/ }));
    expect(await screen.findByText('Dieser Tag konnte nicht geladen werden.')).toBeInTheDocument();
  });

  it('Esc schließt und gibt den Fokus an die Zeile zurück', async () => {
    zeigen(grund());
    const zeile = screen.getByRole('button', { name: /Wohnungseigentümergemeinschaft/ });
    await userEvent.click(zeile);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(zeile).toHaveFocus();
  });

  it('gleich geblieben: Abwesende führen auf den Tag; ohne Vorschau-Grund bleibt der Einsatz ein Verweis', () => {
    zeigen(undefined);
    const ziel = `/assignments/tag?datum=${HEUTE}`;
    expect(within(screen.getByRole('region', { name: 'Abwesend' })).getByRole('link', { name: /Eva Krank/ })).toHaveAttribute('href', ziel);
    expect(within(screen.getByRole('region', { name: 'Im Einsatz' })).getByRole('link', { name: /Wohnungseigentümergemeinschaft/ })).toHaveAttribute('href', ziel);
  });
});
