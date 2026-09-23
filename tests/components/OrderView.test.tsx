import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { Material, MaterialOrder, Project } from '@/types';
import type { WithId } from '@/lib/db/core';
import OrderView from '@/features/orders/OrderView';

/**
 * Material anfordern — der erste Schritt des Materialablaufs und die Ansicht,
 * die ein Monteur mit Handschuhen im Keller bedient.
 *
 * GEPRÜFT WIRD DIE VERDRAHTUNG, nicht die Rechnung. Was hier schiefgehen
 * kann, geht still schief: eine Eilzustellung ohne zuständige Baustelle
 * erreicht niemanden, ein Teilfehler beim Absenden erzeugt beim zweiten
 * Versuch Doppelbuchungen, ein geteiltes Tablet bestellt unter dem falschen
 * Namen. Keiner dieser Fälle wirft eine Meldung.
 */

const ROHR: WithId<Material> = {
  id: 'm1', companyId: 'perl', name: 'Kupferrohr 15mm', category: 'Rohre',
  unit: 'm', stock: 40, articleNumber: 'KR15',
} as WithId<Material>;
const DICHTUNG: WithId<Material> = {
  id: 'm2', companyId: 'perl', name: 'Dichtung 1/2"', category: 'Kleinteile',
  unit: 'Stk', stock: 3, articleNumber: 'D12',
} as WithId<Material>;

const MIT_LEITUNG: Project = {
  id: 'p1', companyId: 'perl', projectNumber: '2026-042', customerName: 'Familie Huber',
  status: 'Aktiv', projectManagers: ['pl1'],
} as Project;
const OHNE_LEITUNG: Project = {
  id: 'p2', companyId: 'perl', projectNumber: '2026-099', customerName: 'Firma Ohne',
  status: 'Aktiv', projectManagers: [],
} as Project;

let materialien: WithId<Material>[] = [];
let projekte: Project[] = [];
let eigene: WithId<MaterialOrder>[] = [];
let abosFehler: { material?: boolean; eigene?: boolean; projekte?: boolean } = {};

const anlegen = vi.fn();
const retoure = vi.fn();
const statusSetzen = vi.fn();

vi.mock('@/lib/db/materials', () => ({
  LOW_STOCK_THRESHOLD: 5,
  subscribeMaterials: (
    _c: string,
    cb: (rows: WithId<Material>[]) => void,
    onError: (e: Error) => void,
  ) => {
    if (abosFehler.material) onError(new Error('Katalog nicht lesbar'));
    else cb(materialien);
    return () => undefined;
  },
}));

vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => {
    if (abosFehler.projekte) throw new Error('kein Netz');
    return projekte;
  }),
  listProjectsByNumbers: vi.fn(async () => projekte),
  listRecentProjects: vi.fn(async () => projekte),
}));

vi.mock('@/lib/db/materialOrders', () => ({
  subscribeOwnOrders: (
    _c: string,
    _uid: string,
    _max: number,
    cb: (rows: WithId<MaterialOrder>[]) => void,
    onError: (e: Error) => void,
  ) => {
    if (abosFehler.eigene) onError(new Error('nicht lesbar'));
    else cb(eigene);
    return () => undefined;
  },
  // Die Ansicht schreibt über das Ausgangsfach: die Antwort ist nicht mehr
  // eine Kennung, sondern der Stand — `confirmed` oder `queued`.
  createMaterialOrderOhneEmpfang: (...a: unknown[]) => anlegen(...a),
  createReturn: (...a: unknown[]) => retoure(...a),
  updateOrderStatus: (...a: unknown[]) => statusSetzen(...a),
}));

const authWert = {
  user: { uid: 'u1', companyId: 'perl', name: 'Max Mustermann', role: 'Mitarbeiter' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige() {
  return render(
    <ToastProvider>
      <OrderView />
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  materialien = [ROHR, DICHTUNG];
  projekte = [MIT_LEITUNG, OHNE_LEITUNG];
  eigene = [];
  abosFehler = {};
  anlegen.mockReset();
  anlegen.mockResolvedValue('confirmed');
  retoure.mockReset();
  retoure.mockResolvedValue('ret1');
  statusSetzen.mockReset();
  statusSetzen.mockResolvedValue(undefined);
});

describe('Material anfordern — der Warenkorb', () => {
  it('schickt Menge, Baustelle und Besteller an die Datenbank', async () => {
    zeige();
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: /Für welche Baustelle/ }),
      '2026-042',
    );
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm anfordern/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Bestellung aufgeben' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][0]).toBe('perl');
    expect(anlegen.mock.calls[0][1]).toMatchObject({
      materialId: 'm1',
      materialName: 'Kupferrohr 15mm',
      quantity: 1,
      projectNumber: '2026-042',
      status: 'Offen',
      transactionType: 'order',
      userId: 'u1',
      userName: 'Max Mustermann',
    });
  });

  it('schickt die Notiz mit, die nach dem Hinzufügen getippt wurde', async () => {
    /*
      GEFUNDEN BEIM PROBELAUF. Das Notizfeld erscheint erst, wenn schon etwas
      im Korb liegt — die Notiz hing aber an der Position und wurde beim
      Hinzufügen übernommen. Was danach getippt wurde (also immer), kam nie
      an, und das Feld war nach dem Absenden leer.
    */
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm anfordern/ }));
    await userEvent.click(screen.getByRole('button', { name: /Dichtung .* anfordern/ }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /Notiz für die Projektleitung/ }),
      'Bitte bis Donnerstag',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Bestellung aufgeben' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(2));
    expect(anlegen.mock.calls.map((c) => (c[1] as { note: string }).note)).toEqual([
      'Bitte bis Donnerstag',
      'Bitte bis Donnerstag',
    ]);
  });

  it('nimmt eine frei eingetippte Menge', async () => {
    /**
     * AUS DEM BETRIEB GEWUENSCHT. Vorher gab es nur „noch eins": wer dreissig
     * Meter Rohr braucht, haette dreissig Mal tippen muessen — mit Handschuhen,
     * auf der Baustelle. Der Knopf bleibt fuer den Regelfall, das Feld ist der
     * Ausweg fuer alles darueber.
     */
    zeige();
    const menge = await screen.findByRole('spinbutton', { name: /Menge .* Kupferrohr 15mm/ });
    await userEvent.clear(menge);
    await userEvent.type(menge, '30');
    await userEvent.click(screen.getByRole('button', { name: /Kupferrohr 15mm anfordern/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Bestellung aufgeben' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][1].quantity).toBe(30);
  });

  it('faellt nach dem Anfordern auf eins zurueck', async () => {
    // Eine stehengebliebene 30 waere die teurere Ueberraschung: die naechste
    // Position ist fast immer wieder eine.
    zeige();
    const menge = await screen.findByRole('spinbutton', { name: /Menge .* Kupferrohr 15mm/ });
    await userEvent.clear(menge);
    await userEvent.type(menge, '30');
    await userEvent.click(screen.getByRole('button', { name: /Kupferrohr 15mm anfordern/ }));

    await waitFor(() => expect(menge).toHaveValue(1));
  });

  it('fordert nichts an, solange die Menge unbrauchbar ist', async () => {
    // Ein leeres oder krummes Feld darf nicht als 0 oder NaN durchgehen.
    zeige();
    const menge = await screen.findByRole('spinbutton', { name: /Menge .* Kupferrohr 15mm/ });
    await userEvent.clear(menge);
    expect(screen.getByRole('button', { name: /Kupferrohr 15mm anfordern/ })).toBeDisabled();
    expect(anlegen).not.toHaveBeenCalled();
  });

  it('zählt dasselbe Material auf derselben Baustelle zusammen', async () => {
    // Sonst stünden drei Zeilen „Kupferrohr ×1" in der Anforderung, und die
    // Projektleitung müsste sie im Kopf addieren.
    zeige();
    const knopf = await screen.findByRole('button', { name: /Kupferrohr 15mm anfordern/ });
    await userEvent.click(knopf);
    await userEvent.click(screen.getByRole('button', { name: /Kupferrohr 15mm anfordern/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Bestellung aufgeben' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][1].quantity).toBe(2);
  });

  it('übernimmt die Eilzustellung NICHT ohne Baustelle', async () => {
    /**
     * Der Haken ist ohne Baustelle gesperrt — aber ein Zustand, der nur von
     * einem `disabled` gehalten wird, überlebt keine Umbauten. Hier wird
     * geprüft, was tatsächlich in die Datenbank geht: eine Eilmeldung ohne
     * Baustelle hat keine zuständige Projektleitung und erreicht damit
     * niemanden. Der Monteur wartete dann auf einen Anruf, den nie jemand
     * bekommen hat.
     */
    zeige();
    expect(await screen.findByRole('checkbox', { name: /Eilzustellung/ })).toBeDisabled();
    expect(screen.getByText('Dafür zuerst die Baustelle wählen.')).toBeInTheDocument();

    // Erst Baustelle und Haken setzen, dann die Baustelle wieder wegnehmen:
    // NUR SO wird die Bedingung im Warenkorb tatsächlich geprüft. Ohne diesen
    // Umweg bliebe der Haken schon deshalb aus, weil das Kästchen gesperrt
    // ist — und der Test wäre auch dann grün, wenn die Bedingung fehlte.
    const baustelle = await screen.findByRole('combobox', { name: /Für welche Baustelle/ });
    await userEvent.selectOptions(baustelle, '2026-042');
    await userEvent.click(screen.getByRole('checkbox', { name: /Eilzustellung/ }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Eilzustellung/ })).toBeChecked());
    await userEvent.selectOptions(baustelle, '');
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Eilzustellung/ })).toBeDisabled(),
    );

    await userEvent.click(await screen.findByRole('button', { name: /Dichtung .* anfordern/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Bestellung aufgeben' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][1].projectNumber).toBe('');
    expect(anlegen.mock.calls[0][1].isUrgent).toBe(false);
  });

  it('warnt vor einer Eilzustellung an eine Baustelle ohne Projektleitung', async () => {
    // Abschicken darf man sie — die Verwaltung sieht sie ohnehin. Aber wer
    // „Eil" ankreuzt, erwartet einen Anruf, und der käme hier nicht.
    zeige();
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: /Für welche Baustelle/ }),
      '2026-099',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Eilzustellung/ }));

    expect(
      await screen.findByText(/keine Projektleitung zugeteilt/),
    ).toBeInTheDocument();
  });

  it('sagt nichts, wenn die Baustelle eine Projektleitung hat', async () => {
    zeige();
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: /Für welche Baustelle/ }),
      '2026-042',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Eilzustellung/ }));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Eilzustellung/ })).toBeChecked());
    expect(screen.queryByText(/keine Projektleitung zugeteilt/)).not.toBeInTheDocument();
  });
});

describe('Material anfordern — wenn das Absenden teilweise scheitert', () => {
  it('lässt genau die gescheiterten Positionen im Korb stehen', async () => {
    /**
     * DER FALL, DER DOPPELBUCHUNGEN ERZEUGT. Ginge der Korb komplett verloren
     * oder bliebe er komplett stehen, wäre nach einem Teilfehler unklar, was
     * schon geschrieben ist — und der zweite Versuch bestellte das Material
     * ein zweites Mal. Es wird positionsweise gesendet, und nur das
     * Gescheiterte bleibt liegen.
     */
    anlegen
      .mockResolvedValueOnce('confirmed')
      .mockRejectedValueOnce(new Error('kein Netz'));

    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm anfordern/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Dichtung .* anfordern/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Bestellung aufgeben' }));

    await waitFor(() => expect(screen.getByText(/konnten nicht gesendet werden/)).toBeInTheDocument());

    // Genau eine Zeile blieb übrig — die gescheiterte.
    expect(await screen.findByRole('heading', { name: 'Anforderung (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dichtung .* entfernen/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kupferrohr 15mm entfernen/ })).not.toBeInTheDocument();
  });

  it('sagt es, wenn die Anforderung nur vorgemerkt ist', async () => {
    /*
      IM KELLER OHNE NETZ. Die Anforderung liegt im Ausgangsfach und geht
      später raus — sagt die App das nicht, tippt der Monteur sie oben am
      Fahrzeug ein zweites Mal, und das Material kommt doppelt.
    */
    anlegen.mockResolvedValue('queued');

    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm anfordern/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Bestellung aufgeben' }));

    expect(await screen.findByText(/wird automatisch gesendet/)).toBeInTheDocument();
  });

  it('leert den Korb und wechselt zur Verfolgung, wenn alles durchging', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm anfordern/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Bestellung aufgeben' }));

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Meine Bestellungen/ })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
  });
});

describe('Material anfordern — der Warenkorb auf einem geteilten Tablet', () => {
  it('trennt den Korb nach Mandant und Benutzer', async () => {
    /**
     * Auf einem Baustellen-Tablet meldet sich nacheinander die halbe
     * Mannschaft an. Mit einem festen Schlüssel sah der Nächste den Korb
     * seines Vorgängers — und gab ihn unter SEINEM Namen auf DESSEN
     * Baustelle auf.
     */
    localStorage.setItem(
      'perl_cart_v2:perl:jemand-anderer',
      JSON.stringify([{ materialId: 'm2', materialName: 'Fremd', quantity: 9, projectNumber: '', note: '' }]),
    );
    zeige();

    expect(await screen.findByRole('heading', { name: 'Anforderung (0)' })).toBeInTheDocument();
    expect(screen.queryByText(/Fremd/)).not.toBeInTheDocument();

    // Und die Gegenprobe beim Schreiben: der eigene Korb landet unter dem
    // eigenen Schlüssel, nicht unter einem, den sich alle teilen.
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm anfordern/ }));
    await waitFor(() =>
      expect(localStorage.getItem('perl_cart_v2:perl:u1')).toContain('Kupferrohr'),
    );
    expect(localStorage.getItem('perl_cart_v2:perl')).toBeNull();
  });

  it('holt den eigenen Korb nach einem Neustart zurück', async () => {
    // Auf der Baustelle bricht die Verbindung — oder die App — weg, bevor
    // abgeschickt wurde. Der Korb neu getippt ist eine verlorene Viertelstunde.
    localStorage.setItem(
      'perl_cart_v2:perl:u1',
      JSON.stringify([
        { materialId: 'm1', materialName: 'Kupferrohr 15mm', quantity: 7, projectNumber: '2026-042', note: '' },
      ]),
    );
    zeige();

    expect(await screen.findByRole('heading', { name: 'Anforderung (1)' })).toBeInTheDocument();
    expect(screen.getByText('×7')).toBeInTheDocument();
  });
});

describe('Material anfordern — Retoure', () => {
  it('weist eine Menge unter 1 ab, statt sie zu buchen', async () => {
    /**
     * Eine Retoure mit Menge -3 ginge als `increment(-3)` durch und
     * VERRINGERTE den Lagerbestand — eine Rückgabe, die das Lager leert.
     */
    zeige();
    await userEvent.click(screen.getByRole('tab', { name: 'Retoure' }));
    await userEvent.type(await screen.findByRole('searchbox', { name: /^Material/ }), 'Kupfer');
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm zurückgeben/ }));
    const menge = screen.getByRole('spinbutton', { name: /Menge/ });
    await userEvent.clear(menge);
    await userEvent.type(menge, '-3');
    await userEvent.click(screen.getByRole('button', { name: 'Retoure erfassen' }));

    expect(await screen.findByText(/Menge von mindestens 1/)).toBeInTheDocument();
    expect(retoure).not.toHaveBeenCalled();
  });

  it('gibt Zustand und Menge weiter — nur „neu" wird gutgeschrieben', async () => {
    zeige();
    await userEvent.click(screen.getByRole('tab', { name: 'Retoure' }));
    await userEvent.type(await screen.findByRole('searchbox', { name: /^Material/ }), 'KR15');
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm zurückgeben/ }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Zustand/ }), 'defekt');
    const menge = screen.getByRole('spinbutton', { name: /Menge/ });
    await userEvent.clear(menge);
    await userEvent.type(menge, '4');
    await userEvent.click(screen.getByRole('button', { name: 'Retoure erfassen' }));

    await waitFor(() => expect(retoure).toHaveBeenCalledTimes(1));
    expect(retoure.mock.calls[0][1]).toMatchObject({
      materialId: 'm1',
      materialName: 'Kupferrohr 15mm',
      quantity: 4,
      condition: 'defekt',
      userId: 'u1',
    });
  });
});

describe('Material anfordern — gescheiterte Ladevorgänge', () => {
  it('zeigt den Katalog trotzdem, wenn nur die Baustellen fehlen', async () => {
    // Ein stumm gescheitertes Nebenabo sieht aus wie „nichts da". Der Monteur
    // hielte seine Baustelle für nicht angelegt.
    abosFehler = { projekte: true };
    zeige();

    expect(await screen.findByText(/Die Baustellen/)).toBeInTheDocument();
    expect(screen.getByText('Kupferrohr 15mm')).toBeInTheDocument();
  });

  it('unterscheidet einen leeren Katalog von einer erfolglosen Suche', async () => {
    materialien = [];
    zeige();
    expect(await screen.findByText(/Materialkatalog ist noch leer/)).toBeInTheDocument();
  });

  it('sagt bei einer erfolglosen Suche, dass es an der Suche liegt', async () => {
    zeige();
    await userEvent.type(await screen.findByRole('textbox', { name: /Suche/ }), 'Wasserhahn');
    expect(await screen.findByText('Kein Material passt zur Suche.')).toBeInTheDocument();
  });

  it('sucht auch über Kategorie und Artikelnummer', async () => {
    zeige();
    await userEvent.type(await screen.findByRole('textbox', { name: /Suche/ }), 'KR15');
    await waitFor(() => expect(screen.getByText('Kupferrohr 15mm')).toBeInTheDocument());
    expect(screen.queryByText('Dichtung 1/2"')).not.toBeInTheDocument();
  });
});

describe('Material anfordern — die eigene Verfolgung', () => {
  it('bietet „Abgeholt" bei JEDER eigenen offenen Anforderung an', async () => {
    /**
     * AUS DEM BETRIEB GEWUENSCHT, und die Begruendung ueberzeugt: der Status
     * ist eine Absichtserklaerung der Verwaltung, kein Tatsachenbericht. Wer
     * sich das Material selbst aus dem Lager nimmt oder es beim Haendler
     * mitnimmt, ist fertig — unabhaengig davon, ob im Buero jemand dazu
     * gekommen ist, den Status weiterzuschalten. Vorher blieb so eine
     * Anforderung ewig offen, und der Lagerabzug unterblieb.
     */
    eigene = [
      { id: 'o1', companyId: 'perl', materialName: 'Kupferrohr 15mm', quantity: 2,
        status: 'Offen', transactionType: 'order', userId: 'u1' } as WithId<MaterialOrder>,
      { id: 'o2', companyId: 'perl', materialName: 'Dichtung 1/2"', quantity: 5,
        status: 'Abholbereit', transactionType: 'order', userId: 'u1' } as WithId<MaterialOrder>,
    ];
    zeige();
    await userEvent.click(screen.getByRole('tab', { name: /Meine Bestellungen/ }));

    const knoepfe = await screen.findAllByRole('button', { name: 'Abgeholt' });
    expect(knoepfe).toHaveLength(2);
  });

  it('bucht die Abholung erst nach der Bestätigung', async () => {
    eigene = [
      { id: 'o2', companyId: 'perl', materialName: 'Dichtung 1/2"', quantity: 5,
        status: 'Abholbereit', transactionType: 'order', userId: 'u1' } as WithId<MaterialOrder>,
    ];
    zeige();
    await userEvent.click(screen.getByRole('tab', { name: /Meine Bestellungen/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Abgeholt' }));

    expect(await screen.findByText(/vom Lagerbestand abgezogen/)).toBeInTheDocument();
    expect(statusSetzen).not.toHaveBeenCalled();

    /**
     * Der Knopf muss „Abgeholt" heißen. Ohne gesetztes `confirmLabel` nimmt
     * der Dialog seine Vorgabe „Löschen" — in Rot, unter der Frage „Material
     * abgeholt?". Wer das liest, tippt nicht darauf.
     */
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abgeholt' }));
    await waitFor(() => expect(statusSetzen).toHaveBeenCalledWith('o2', 'Erledigt'));
  });

  it('führt Retouren im Erledigten, nicht im Offenen', async () => {
    eigene = [
      { id: 'r1', companyId: 'perl', materialName: 'Kupferrohr 15mm', quantity: 2,
        status: 'Offen', transactionType: 'return', userId: 'u1' } as WithId<MaterialOrder>,
    ];
    zeige();
    await userEvent.click(screen.getByRole('tab', { name: /Meine Bestellungen/ }));

    expect(await screen.findByText('Keine offenen Bestellungen.')).toBeInTheDocument();
    const erledigt = screen.getByRole('heading', { name: 'Erledigt (1)' }).closest('section')!;
    expect(within(erledigt).getByText('Retoure')).toBeInTheDocument();
  });
});
