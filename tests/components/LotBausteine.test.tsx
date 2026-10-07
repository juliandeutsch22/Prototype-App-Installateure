/**
 * Die Bausteine der Linie „Lot“ (Protokoll Abschnitt 4): Seitenkopf mit
 * Hilfe und Daumenbereich, ganz antippbare Zeile, die fünf Zustände,
 * Seitenfenster, Arbeitszeile, Sammelleiste, „und N weitere“, Kurzzeile,
 * Lot-Verlauf, Segmente und die Wahl hell/dunkel.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, within, act, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import InfoHint from '@/components/InfoHint';
import BottomSheet from '@/components/BottomSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import StatusBadge from '@/components/StatusBadge';
import { ListRow, List } from '@/components/ListRow';
import { SeitenHilfeProvider } from '@/components/SeitenHilfe';
import {
  Arbeitszeile,
  Kurzzeile,
  LotVerlauf,
  MehrAnzeigen,
  Sammelleiste,
  Segmente,
} from '@/components/LotBausteine';
import { useDarstellung, darstellungAnwenden } from '@/lib/darstellung';

describe('Hilfe zu dieser Seite (Regel 11)', () => {
  function Seite({ mitHinweis = true }: { mitHinweis?: boolean }) {
    return (
      <SeitenHilfeProvider>
        <PageHeader title="Lager" />
        <Card title="Bestand" hint={mitHinweis ? 'Frei ist, was nicht reserviert ist.' : undefined}>
          Inhalt
        </Card>
        <p>
          Mindestmenge <InfoHint about="Mindestmenge">Darunter gilt der Artikel als knapp.</InfoHint>
        </p>
      </SeitenHilfeProvider>
    );
  }

  it('sammelt die Erklärungen der Seite an einer Stelle, ohne Text zu verlieren', async () => {
    render(<Seite />);
    // Kein „i“ mehr an den Überschriften …
    expect(screen.queryByRole('button', { name: /Was bedeutet/ })).toBeNull();
    // … sondern ein Zugang im Seitenkopf, der beide Texte zeigt.
    await userEvent.click(screen.getByRole('button', { name: 'Hilfe zu dieser Seite' }));
    const hilfe = screen.getByRole('dialog', { name: 'Hilfe zu Lager' });
    expect(within(hilfe).getByRole('heading', { name: 'Bestand' })).toBeInTheDocument();
    expect(within(hilfe).getByText('Frei ist, was nicht reserviert ist.')).toBeInTheDocument();
    expect(within(hilfe).getByRole('heading', { name: 'Mindestmenge' })).toBeInTheDocument();
    expect(within(hilfe).getByText('Darunter gilt der Artikel als knapp.')).toBeInTheDocument();
  });

  it('Gegenprobe: ohne Erklärungen gibt es keinen leeren Hilfe-Knopf', () => {
    render(
      <SeitenHilfeProvider>
        <PageHeader title="Lager" />
      </SeitenHilfeProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Hilfe zu dieser Seite' })).toBeNull();
  });

  it('ohne sammelnde Seite bleibt das „i“ an seinem Platz', async () => {
    render(<InfoHint about="Eilzustellung">Kommt am selben Tag.</InfoHint>);
    await userEvent.click(screen.getByRole('button', { name: 'Was bedeutet Eilzustellung?' }));
    expect(screen.getByText('Kommt am selben Tag.')).toBeInTheDocument();
  });

  it('im Dialog bleibt das „i“ beim Text — der Dialog verdeckt den Seitenkopf', async () => {
    render(
      <SeitenHilfeProvider>
        <PageHeader title="Lager" />
        <BottomSheet open onClose={() => undefined} label="Artikel" auchBreit>
          <InfoHint about="Reserviert">Für Einsätze zurückgelegt.</InfoHint>
        </BottomSheet>
        <ConfirmDialog open title="Wirklich?" onConfirm={() => undefined} onCancel={() => undefined}>
          <InfoHint about="Storno">Geht nicht zurück.</InfoHint>
        </ConfirmDialog>
      </SeitenHilfeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Was bedeutet Reserviert?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Was bedeutet Storno?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hilfe zu dieser Seite' })).toBeNull();
  });

  it('eine Erklärung, die die Seite verlässt, verschwindet auch aus der Hilfe', async () => {
    const { rerender } = render(<Seite />);
    rerender(<Seite mitHinweis={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Hilfe zu dieser Seite' }));
    const hilfe = screen.getByRole('dialog', { name: 'Hilfe zu Lager' });
    expect(within(hilfe).queryByRole('heading', { name: 'Bestand' })).toBeNull();
    expect(within(hilfe).getByRole('heading', { name: 'Mindestmenge' })).toBeInTheDocument();
  });
});

describe('Seitenkopf (Regel 2)', () => {
  it('Ortszeile, Titel, ⋯ und Hauptaktion — die Hauptaktion im Daumenbereich', () => {
    const { container } = render(
      <PageHeader
        ort="Material"
        title="Lager"
        subtitle="Bestände führen"
        mehr={<button type="button">Weitere Aktionen</button>}
        action={<button type="button">Wareneingang</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Lager' })).toBeInTheDocument();
    expect(screen.getByText('Material').className).toBe('seitenkopf-ort');
    expect(screen.getByRole('button', { name: 'Wareneingang' }).parentElement!.className).toBe('daumen');
    // Der Platzhalter hält am Seitenende Platz frei, damit die Leiste nichts verdeckt.
    expect(container.querySelector('.daumen-platz')).not.toBeNull();
  });

  it('Gegenprobe: ohne Hauptaktion weder Leiste noch Platzhalter', () => {
    const { container } = render(<PageHeader title="Lager" />);
    expect(container.querySelector('.daumen')).toBeNull();
    expect(container.querySelector('.daumen-platz')).toBeNull();
  });
});

describe('Zeile (Regel 3)', () => {
  it('mit Ziel ist die ganze Zeile antippbar, Knöpfe darin bleiben eigene Ziele', async () => {
    const knopf = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <List>
                <ListRow title="Baustelle Gleisdorf" to="/admin-projects/1">
                  <button type="button" onClick={knopf}>Bearbeiten</button>
                </ListRow>
              </List>
            }
          />
          <Route path="/admin-projects/1" element={<p>Akte</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const zeile = screen.getByRole('listitem');
    expect(zeile.className).toContain('zeile-ganz');
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(knopf).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('link', { name: 'Baustelle Gleisdorf' }));
    expect(screen.getByText('Akte')).toBeInTheDocument();
  });

  it('Gegenprobe: ohne Ziel bleibt die Zeile eine Zeile', () => {
    render(<ul><ListRow title="Nur Text" /></ul>);
    expect(screen.getByRole('listitem').className).not.toContain('zeile-ganz');
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('Fünf Zustände (Regel 5)', () => {
  it.each([
    ['Offen', 'stand-offen'],
    ['In Bearbeitung', 'stand-info'],
    ['Aktiv', 'stand-info'],
    ['Bezahlt', 'stand-leise'],
    ['Erledigt', 'stand-leise'],
    ['Überfällig', 'stand-fehl'],
    ['Pausiert', 'stand-warn'],
  ])('%s → %s', (status, klasse) => {
    render(<StatusBadge status={status} />);
    expect([...screen.getByText(status).classList]).toContain(klasse);
  });
});

describe('Seitenfenster (Regel 8)', () => {
  it('mit Titel: sichtbarer Kopf mit „Schließen“, Esc schliesst', async () => {
    const zu = vi.fn();
    render(
      <BottomSheet open onClose={zu} label="Artikel" auchBreit titel="Pressfitting 15 mm">
        <p>Inhalt</p>
      </BottomSheet>,
    );
    const fenster = screen.getByRole('dialog', { name: 'Artikel' });
    expect(fenster.className).toContain('fenster');
    expect(within(fenster).getByRole('heading', { name: 'Pressfitting 15 mm' })).toBeInTheDocument();
    expect(within(fenster).getAllByRole('button', { name: 'Schließen' })).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    expect(zu).toHaveBeenCalled();
  });

  it('Gegenprobe: ohne `auchBreit` bleibt es das Blatt fürs Telefon', () => {
    render(
      <BottomSheet open onClose={() => undefined} label="Mehr">
        <p>Inhalt</p>
      </BottomSheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Mehr' }).className).toContain('blatt');
  });
});

describe('Arbeitsliste (Regel 3)', () => {
  it('Kästchen, antippbarer Inhalt und genau ein Knopf für den nächsten Schritt', async () => {
    const wahl = vi.fn();
    const oeffnen = vi.fn();
    const schritt = vi.fn();
    render(
      <ul>
        <Arbeitszeile name="Anforderung 4711" onWahl={wahl} onOeffnen={oeffnen} schritt={{ text: 'Annehmen', onClick: schritt }}>
          Kupferrohr 15 mm
        </Arbeitszeile>
      </ul>,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Anforderung 4711 auswählen' }));
    expect(wahl).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByRole('button', { name: 'Kupferrohr 15 mm' }));
    expect(oeffnen).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Annehmen: Anforderung 4711' }));
    expect(schritt).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('die Sammelleiste zeigt sich erst mit einer Auswahl', async () => {
    const alle = vi.fn();
    const aufheben = vi.fn();
    const { rerender } = render(<Sammelleiste anzahl={0} aktion={{ text: 'Alle annehmen', onClick: alle }} onAufheben={aufheben} />);
    expect(screen.queryByRole('region', { name: 'Auswahl' })).toBeNull();
    rerender(<Sammelleiste anzahl={3} aktion={{ text: 'Alle annehmen', onClick: alle }} onAufheben={aufheben} />);
    expect(screen.getByText('3 ausgewählt')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Alle annehmen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Auswahl aufheben' }));
    expect(alle).toHaveBeenCalledTimes(1);
    expect(aufheben).toHaveBeenCalledTimes(1);
  });
});

describe('Viele Daten (Regel 4)', () => {
  it('„und N weitere anzeigen“ sagt, wie viele noch kommen', async () => {
    const mehr = vi.fn();
    render(<MehrAnzeigen anzahl={14} onClick={mehr} />);
    await userEvent.click(screen.getByRole('button', { name: 'und 14 weitere anzeigen' }));
    expect(mehr).toHaveBeenCalledTimes(1);
  });

  it('Gegenprobe: nichts mehr — kein Knopf', () => {
    render(<MehrAnzeigen anzahl={0} onClick={() => undefined} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Akten (Regel 6 und 7)', () => {
  it('die Kurzzeile klappt auf und zeigt die Einzelheiten', async () => {
    render(<Kurzzeile name="Kunde" wert="Familie Huber">Hauptplatz 1, 8200 Gleisdorf</Kurzzeile>);
    const zeile = screen.getByText('Kunde').closest('details')!;
    expect(zeile.open).toBe(false);
    await userEvent.click(screen.getByText('Kunde'));
    expect(zeile.open).toBe(true);
  });

  it('der Lot-Verlauf markiert den jetzigen Punkt', () => {
    render(
      <LotVerlauf
        name="Verlauf"
        punkte={[{ titel: 'Angefordert', zeit: '06.10.' }, { titel: 'Abholbereit', jetzt: true }]}
      />,
    );
    const punkte = within(screen.getByRole('list', { name: 'Verlauf' })).getAllByRole('listitem');
    expect(punkte[0].className).toBe('lot-punkt');
    expect(punkte[1].className).toBe('lot-jetzt');
    expect(punkte[1]).toHaveAttribute('aria-current', 'step');
  });
});

describe('Segmente', () => {
  it('die gewählte Stelle ist gedrückt', async () => {
    const wahl = vi.fn();
    render(
      <Segmente
        name="Ansicht"
        werte={[{ wert: 'woche', text: 'Woche' }, { wert: 'monat', text: 'Monat' }]}
        wert="woche"
        onChange={wahl}
      />,
    );
    expect(screen.getByRole('button', { name: 'Woche' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Monat' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Monat' }));
    expect(wahl).toHaveBeenCalledWith('monat');
  });
});

describe('Hell oder dunkel', () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('hell ist Standard — auch wenn das System dunkel will', () => {
    const vorher = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('dark'), media: q })) as unknown as typeof window.matchMedia;
    darstellungAnwenden();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    window.matchMedia = vorher;
  });

  it('dunkel nur auf Wahl, und die Wahl bleibt', () => {
    const { result } = renderHook(() => useDarstellung());
    act(() => result.current[1]('dunkel'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    document.documentElement.removeAttribute('data-theme');
    darstellungAnwenden();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    act(() => result.current[1]('hell'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('Escape bei Dialog im Seitenfenster', () => {
  it('schliesst nur den Dialog obenauf, das Fenster darunter bleibt', async () => {
    const fensterZu = vi.fn();
    const dialogZu = vi.fn();
    function Beides() {
      const [dialog, setDialog] = useState(false);
      return (
        <BottomSheet open onClose={fensterZu} label="Artikel" auchBreit titel="Artikel">
          <button type="button" onClick={() => setDialog(true)}>Löschen …</button>
          <ConfirmDialog open={dialog} title="Wirklich löschen?" onConfirm={() => undefined} onCancel={() => { dialogZu(); setDialog(false); }} />
        </BottomSheet>
      );
    }
    render(<Beides />);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen …' }));
    await userEvent.keyboard('{Escape}');
    expect(dialogZu).toHaveBeenCalledTimes(1);
    expect(fensterZu).not.toHaveBeenCalled();
    // Gegenprobe: ohne Dialog schliesst Escape das Fenster.
    await userEvent.keyboard('{Escape}');
    expect(fensterZu).toHaveBeenCalledTimes(1);
  });
});
