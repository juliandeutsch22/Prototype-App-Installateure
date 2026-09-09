import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { MaterialOrder } from '@/types';
import type { WithId } from '@/lib/db/core';
import AdminOrdersView from '@/features/orders/AdminOrdersView';

/**
 * Anforderungen — der zweite Schritt des Materialablaufs, die Seite der
 * Projektleitung.
 *
 * Hier liegt die einzige Stelle, an der ein Klick den LAGERBESTAND
 * VERÄNDERT: der Übergang auf „Erledigt". Deshalb hängt der wichtigste Test
 * daran, dass dieser eine Übergang durch die Rückfrage geht und jeder andere
 * nicht — eine Rückfrage bei jedem Statuswechsel wäre nach dem dritten Mal
 * weggeklickt, und dann wirkt auch die vierte nicht mehr.
 */

function anforderung(p: Partial<MaterialOrder> & { id: string }): WithId<MaterialOrder> {
  return {
    companyId: 'perl',
    materialName: 'Kupferrohr 15mm',
    quantity: 2,
    status: 'Offen',
    transactionType: 'order',
    userId: 'u1',
    userName: 'Max Mustermann',
    createdAt: { toDate: () => new Date('2026-09-01T08:00:00Z') },
    ...p,
  } as unknown as WithId<MaterialOrder>;
}

let anforderungen: WithId<MaterialOrder>[] = [];
let ladefehler: string | null = null;

const statusSetzen = vi.fn();
const loeschen = vi.fn();

/* Mit welcher ABFRAGE-Grenze zuletzt abonniert wurde. */
let letzteHolgrenze = 0;

vi.mock('@/lib/db/materialOrders', () => ({
  ORDER_STATUS_FLOW: ['Offen', 'In Bearbeitung', 'Abholbereit', 'Erledigt'],
  subscribeAllOrders: (
    _c: string,
    max: number,
    cb: (rows: WithId<MaterialOrder>[]) => void,
    onError: (e: Error) => void,
  ) => {
    letzteHolgrenze = max;
    if (ladefehler) onError(new Error(ladefehler));
    else cb(anforderungen);
    return () => undefined;
  },
  updateOrderStatus: (...a: unknown[]) => statusSetzen(...a),
  deleteOrder: (...a: unknown[]) => loeschen(...a),
}));

const authWert = {
  user: { uid: 'pl', companyId: 'perl', name: 'Planer', role: 'Projektleiter' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige() {
  return render(
    <ToastProvider>
      <AdminOrdersView />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 2, 9, 0, 0));
  anforderungen = [];
  ladefehler = null;
  statusSetzen.mockReset();
  statusSetzen.mockResolvedValue(undefined);
  loeschen.mockReset();
  loeschen.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Anforderungen — der Abschluss zieht vom Lager ab', () => {
  it('fragt vor „Erledigt" nach und bucht erst nach der Bestätigung', async () => {
    anforderungen = [anforderung({ id: 'o1', status: 'Abholbereit' })];
    zeige();

    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: '' }).catch(() => screen.getAllByRole('combobox')[0]),
      'Erledigt',
    );

    expect(await screen.findByText(/vom Lagerbestand abgezogen/)).toBeInTheDocument();
    expect(statusSetzen).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abschließen' }));
    await waitFor(() => expect(statusSetzen).toHaveBeenCalledWith('o1', 'Erledigt'));
  });

  it('bucht nichts, wenn die Rückfrage abgebrochen wird', async () => {
    anforderungen = [anforderung({ id: 'o1', status: 'Abholbereit' })];
    zeige();

    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'Erledigt');
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(statusSetzen).not.toHaveBeenCalled();
  });

  it('schaltet jeden ANDEREN Status ohne Rückfrage durch', async () => {
    /**
     * Eine Rückfrage bei jedem Schritt wäre nach dem dritten Mal reflexhaft
     * weggeklickt — und dann schützt auch die vierte nicht mehr. Nur der
     * Schritt, der Bestand bewegt, fragt nach.
     */
    anforderungen = [anforderung({ id: 'o1', status: 'Offen' })];
    zeige();

    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'In Bearbeitung');
    await waitFor(() => expect(statusSetzen).toHaveBeenCalledWith('o1', 'In Bearbeitung'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('meldet einen gescheiterten Statuswechsel, statt ihn zu verschlucken', async () => {
    // Ohne Meldung sprang der Status nicht um und der Nutzer sah nichts —
    // er hielt die Anforderung für erledigt.
    statusSetzen.mockRejectedValueOnce(new Error('kein Netz'));
    anforderungen = [anforderung({ id: 'o1', status: 'Offen' })];
    zeige();

    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'In Bearbeitung');
    expect(await screen.findByText(/konnte nicht geändert werden/)).toBeInTheDocument();
  });
});

describe('Anforderungen — die Reihenfolge der Arbeit', () => {
  it('stellt Eilzustellungen an den Anfang ihrer Gruppe', async () => {
    /**
     * Eine Eilzustellung ging zwischen zwanzig gewöhnlichen Zeilen unter,
     * obwohl genau sie den Anlass zum Handeln gibt.
     */
    anforderungen = [
      anforderung({ id: 'a', materialName: 'Gewöhnlich', status: 'Offen',
        createdAt: { toDate: () => new Date('2026-09-01T07:00:00Z') } as never }),
      anforderung({ id: 'b', materialName: 'Eilig', status: 'Offen', isUrgent: true,
        createdAt: { toDate: () => new Date('2026-09-01T09:00:00Z') } as never }),
    ];
    zeige();

    const zeilen = await screen.findAllByRole('listitem');
    expect(within(zeilen[0]).getByText('Eilig')).toBeInTheDocument();
  });

  it('trennt die Arbeitsschritte in eigene Gruppen', async () => {
    // Vorher lagen Offen, In Bearbeitung und Abholbereit in einer Liste — man
    // musste jede Zeile lesen, um zu wissen, was als Nächstes zu tun ist.
    anforderungen = [
      anforderung({ id: 'a', status: 'Offen' }),
      anforderung({ id: 'b', status: 'Abholbereit' }),
    ];
    zeige();

    // Nur die Gruppenüberschriften (h3), nicht der Kartentitel darüber.
    const gruppen = await screen.findAllByRole('heading', { level: 3 });
    const titel = gruppen.map((h) => h.textContent);
    expect(titel).toEqual(['Offen1', 'Abholbereit1']);
  });

  it('hält Erledigtes und Retouren aus dem offenen Reiter heraus', async () => {
    anforderungen = [
      anforderung({ id: 'a', status: 'Erledigt' }),
      anforderung({ id: 'b', status: 'Offen', transactionType: 'return', condition: 'neu' }),
    ];
    zeige();

    expect(await screen.findByText('Aktuell keine offenen Bestellungen.')).toBeInTheDocument();
  });

  it('führt eine Retoure unter Retouren, auch wenn ihr Status „Offen" lautet', async () => {
    // Die Zuordnung hängt am transactionType, nicht am Status. Liefe sie über
    // den Status, verschwände eine Retoure aus beiden Reitern.
    anforderungen = [
      anforderung({ id: 'b', status: 'Offen', transactionType: 'return', condition: 'neu' }),
    ];
    zeige();

    await userEvent.click(screen.getByRole('tab', { name: /Retouren/ }));
    expect(await screen.findByText('Neu / OVP', { exact: false })).toBeInTheDocument();
  });

  it('bietet einer Retoure keine Statusauswahl an', async () => {
    // Sie ist bei der Erfassung bereits abgeschlossen und gebucht. Ein
    // zweites „Erledigt" darüber wäre ein zweiter Lagerzugriff.
    anforderungen = [
      anforderung({ id: 'b', status: 'Erledigt', transactionType: 'return', condition: 'neu' }),
    ];
    zeige();

    await userEvent.click(screen.getByRole('tab', { name: /Retouren/ }));
    await screen.findByText('Neu / OVP', { exact: false });
    expect(screen.queryByRole('option', { name: 'Abholbereit' })).not.toBeInTheDocument();
  });
});

describe('Anforderungen — suchen und filtern', () => {
  it('durchsucht Material, Besteller, Baustelle und Notiz', async () => {
    anforderungen = Array.from({ length: 10 }, (_, i) =>
      anforderung({ id: `o${i}`, materialName: `Ding ${i}`, userName: i === 3 ? 'Erna Beispiel' : 'Max' }),
    );
    zeige();

    await userEvent.type(await screen.findByRole('searchbox', { name: /Suche/ }), 'Erna');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByText('Ding 3')).toBeInTheDocument();
  });

  it('sagt bei einer erfolglosen Suche, wonach gesucht wurde', async () => {
    anforderungen = Array.from({ length: 10 }, (_, i) => anforderung({ id: `o${i}` }));
    zeige();

    await userEvent.type(await screen.findByRole('searchbox', { name: /Suche/ }), 'Wasserhahn');
    expect(await screen.findByText(/Nichts passt zu/)).toBeInTheDocument();
  });

  it('blendet das Suchfeld bei wenigen Zeilen aus', async () => {
    // Ein Suchfeld über drei Zeilen ist Ballast auf einem Telefonschirm.
    anforderungen = [anforderung({ id: 'o1' })];
    zeige();

    await screen.findByText('Kupferrohr 15mm');
    expect(screen.queryByRole('searchbox', { name: /Suche/ })).not.toBeInTheDocument();
  });
});

describe('Anforderungen — löschen', () => {
  it('löscht erst nach der Rückfrage', async () => {
    anforderungen = [anforderung({ id: 'o1' })];
    zeige();

    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm löschen/ }));
    expect(loeschen).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(loeschen).toHaveBeenCalledWith('o1'));
  });
});

describe('Anforderungen — wenn das Laden scheitert', () => {
  it('zeigt den Fehler, statt „nichts angefordert" zu behaupten', async () => {
    ladefehler = 'Fehlende Berechtigung';
    zeige();
    expect(await screen.findByText(/Fehlende Berechtigung/)).toBeInTheDocument();
    expect(screen.queryByText('Aktuell keine offenen Bestellungen.')).not.toBeInTheDocument();
  });
});

/**
 * ZWEI GRENZEN, DIE LEICHT ZU VERWECHSELN SIND.
 *
 * „Weitere anzeigen" im Archiv hebt die ANZEIGE-Grenze an: es zeigt mehr von
 * dem, was schon geladen ist. Die ABFRAGE-Grenze stand fest bei zweihundert
 * und liess sich gar nicht anheben.
 *
 * Aufgefallen ist das erst beim Archiv: es wächst mit jeder erledigten
 * Anforderung, und ab der zweihundertsten fehlten die ältesten. Die Suche
 * fand sie nicht, und nichts unterschied das von „gibt es nicht" — derselbe
 * Fehler wie bei den Baustellen im September, nur eine Ansicht weiter.
 */
describe('Anforderungen — wie weit die Abfrage reicht', () => {
  const viele = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      ({
        id: `o${i}`,
        companyId: 'perl',
        materialName: `Artikel ${i}`,
        quantity: 1,
        // Der Reiter „aktiv“ ist die Vorgabe und zeigt nur Offene.
        status: 'Offen',
        userId: 'u1',
        userName: 'Max Mustermann',
        projectNumber: '2026-001',
      }) as unknown as WithId<MaterialOrder>,
    );

  it('holt mit der Grenze, nicht unbegrenzt', async () => {
    anforderungen = viele(3);
    zeige();
    await screen.findByText(/Artikel 0/);
    expect(letzteHolgrenze).toBe(200);
  });

  it('schweigt, solange die Grenze nicht greift', async () => {
    anforderungen = viele(3);
    zeige();
    await screen.findByText(/Artikel 0/);
    expect(
      screen.queryByRole('button', { name: /Weitere Anforderungen laden/ }),
    ).not.toBeInTheDocument();
  });

  it('sagt es, sobald die Grenze erreicht ist, und holt dann mehr', async () => {
    anforderungen = viele(200);
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText(/Artikel 0/);

    expect(screen.getByText(/nur in diesen gesucht/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: /Weitere Anforderungen laden/ }));
    expect(letzteHolgrenze).toBe(400);
  });
});
