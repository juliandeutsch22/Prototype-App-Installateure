import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import Lieferantenvergleich from '@/features/materials/Lieferantenvergleich';
import type { Vergleich, VergleichZeile } from '@/lib/db/lieferantenartikel';

/**
 * Der Abschnitt „Lieferanten“ im Artikelblatt (M03a, E02–E04).
 *
 * Was vergleichbar ist und welcher der günstigste, entscheidet die Datenbank;
 * geprüft wird hier, dass die Ansicht es SAGT: „günstigster“ als Zustand mit
 * Wort, der Grund bei „nicht vergleichbar“, warum es keinen günstigsten gibt —
 * und dass „Derselbe Artikel“ und „Zuordnung lösen“ nur da sind, wo Recht und
 * Modul es erlauben. GEGENPROBE: ohne den Abschnitt gibt es nichts davon.
 */

const zuordnen = vi.fn();
const loesen = vi.fn();
const verlauf = vi.fn();
let vergleich: Vergleich;
vi.mock('@/lib/db/lieferantenartikel', () => ({
  artikelVergleich: () => Promise.resolve(vergleich),
  zuordnen: (...a: unknown[]) => zuordnen(...a),
  loesen: (...a: unknown[]) => loesen(...a),
  preisverlauf: (...a: unknown[]) => verlauf(...a),
}));

const zeile = (z: Partial<VergleichZeile>): VergleichZeile => ({
  lieferantenartikelId: 'la1', supplierId: 's1', lieferant: 'Alpha', lieferantenNr: 'A-1', bezeichnung: 'Kugelhahn',
  einheit: 'Stk', preiseinheit: 1, ean: null, zuordnung: 'automatisch', zuPruefen: false, bestaetigtVon: null,
  bestaetigtAm: null, ausgelaufen: false, listenpreis: null, rabattProzent: null, einkaufspreis: 10, rabattgruppe: null,
  stand: '2026-11-01', verifiziertDurch: 'automatisch', vergleichbar: true, grund: null, veraltet: false,
  guenstigster: false, ...z,
});

function zeige(o: Partial<{ darfZuordnen: boolean; zuordnenAn: boolean; verlaufAn: boolean }> = {}) {
  const geaendert = vi.fn();
  render(
    <ToastProvider>
      <Lieferantenvergleich
        materialId="m1"
        einheit="Stk"
        darfZuordnen={o.darfZuordnen ?? true}
        zuordnenAn={o.zuordnenAn ?? true}
        verlaufAn={o.verlaufAn ?? true}
        onGeaendert={geaendert}
      />
    </ToastProvider>,
  );
  return geaendert;
}

beforeEach(() => {
  zuordnen.mockReset();
  zuordnen.mockResolvedValue(undefined);
  loesen.mockReset();
  loesen.mockResolvedValue(undefined);
  verlauf.mockReset();
  vergleich = {
    heute: '2026-11-07', fristTage: 180, basisGrund: null,
    zeilen: [
      zeile({ lieferantenartikelId: 'la2', supplierId: 's2', lieferant: 'Beta', lieferantenNr: 'B-7', einkaufspreis: 9,
        zuordnung: 'bestaetigt', verifiziertDurch: 'bestaetigt', bestaetigtVon: 'Gerda Chefin',
        bestaetigtAm: '2026-11-02T09:00:00Z', guenstigster: true }),
      zeile({}),
    ],
  };
});

describe('Der Vergleich', () => {
  it('kennzeichnet den günstigsten mit Wort, nicht mit Farbe allein', async () => {
    zeige();
    const beta = (await screen.findByText('Beta')).closest('details')!;
    expect(within(beta).getByText('günstigster')).toHaveClass('stand');
    expect(within(beta).getByText('€ 9,00')).toBeInTheDocument();
    expect(within(beta).getByText(/als derselbe Artikel bestätigt \(Gerda Chefin, 02\.11\.2026\)/)).toBeInTheDocument();
    expect(within(screen.getByText('Alpha').closest('details')!).queryByText('günstigster')).toBeNull();
  });

  it('sagt bei „nicht vergleichbar“ den Grund und warum es keinen günstigsten gibt', async () => {
    vergleich = {
      ...vergleich,
      basisGrund: 'Nicht alle Lieferanten sind vergleichbar — kein günstigster',
      zeilen: [zeile({}), zeile({ lieferantenartikelId: 'la2', supplierId: 's2', lieferant: 'Beta', einheit: 'm',
        vergleichbar: false, grund: 'Einheit m statt Stk', zuordnung: 'bestaetigt', verifiziertDurch: 'bestaetigt' })],
    };
    zeige();
    const beta = (await screen.findByText('Beta')).closest('details')!;
    expect(within(beta).getByText('nicht vergleichbar')).toBeInTheDocument();
    expect(within(beta).getByText('nicht vergleichbar: Einheit m statt Stk')).toBeInTheDocument();
    expect(screen.getByText(/Kein „günstigster“: Nicht alle Lieferanten sind vergleichbar/)).toBeInTheDocument();
  });

  it('Bestand mit mehreren Lieferanten steht als „zu prüfen“', async () => {
    vergleich = { ...vergleich, zeilen: [zeile({ zuordnung: 'bestand', zuPruefen: true, verifiziertDurch: null,
      vergleichbar: false, grund: 'Bestand, zu prüfen: derselbe Artikel?' })] };
    zeige();
    expect(await screen.findByText('zu prüfen')).toBeInTheDocument();
  });
});

describe('Zuordnung bestätigen und lösen', () => {
  it('„Derselbe Artikel“ bestätigt die Zuordnung und lädt neu', async () => {
    const geaendert = zeige();
    const alpha = (await screen.findByText('Alpha')).closest('details')!;
    await userEvent.click(within(alpha).getByRole('button', { name: 'Derselbe Artikel' }));
    await waitFor(() => expect(zuordnen).toHaveBeenCalledWith('la1', 'm1'));
    expect(geaendert).toHaveBeenCalled();
    // Schon bestätigt: kein zweites Bestätigen.
    const beta = screen.getByText('Beta').closest('details')!;
    expect(within(beta).queryByRole('button', { name: 'Derselbe Artikel' })).toBeNull();
  });

  it('„Zuordnung lösen“ erst nach der Rückfrage, die sagt, was mit den Preisen geschieht', async () => {
    zeige();
    const beta = (await screen.findByText('Beta')).closest('details')!;
    await userEvent.click(within(beta).getByRole('button', { name: 'Zuordnung lösen …' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Seine Preise gehen mit ihm/)).toBeInTheDocument();
    expect(loesen).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lösen' }));
    await waitFor(() => expect(loesen).toHaveBeenCalledWith('la2'));
  });

  it('ohne Recht oder ohne Modul keine Aktionen', async () => {
    zeige({ darfZuordnen: false });
    await screen.findByText('Beta');
    expect(screen.queryByRole('button', { name: 'Derselbe Artikel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zuordnung lösen …' })).toBeNull();
  });

  it('Gegenprobe: mit Recht, aber Modul „Kataloge mehrerer Großhändler“ aus — ebenso keine', async () => {
    zeige({ zuordnenAn: false });
    await screen.findByText('Beta');
    expect(screen.queryByRole('button', { name: 'Zuordnung lösen …' })).toBeNull();
  });
});

describe('Der Preisverlauf', () => {
  it('kommt auf Wunsch, jüngster zuerst, mit Änderung in Prozent', async () => {
    verlauf.mockResolvedValue([
      { gueltigAb: '2026-11-01', gueltigBis: null, listenpreis: null, rabattProzent: null, einkaufspreis: 9.9, rabattgruppe: null, aenderungProzent: 10 },
      { gueltigAb: '2026-10-01', gueltigBis: '2026-10-31', listenpreis: null, rabattProzent: null, einkaufspreis: 9, rabattgruppe: null, aenderungProzent: null },
    ]);
    zeige();
    const beta = (await screen.findByText('Beta')).closest('details')!;
    expect(verlauf).not.toHaveBeenCalled();
    await userEvent.click(within(beta).getByRole('button', { name: 'Preisverlauf zeigen' }));
    const liste = await within(beta).findByRole('list', { name: 'Preisverlauf Beta' });
    const punkte = within(liste).getAllByRole('listitem');
    expect(punkte[0]).toHaveTextContent('€ 9,90 · +10 %');
    expect(punkte[0]).toHaveTextContent('01.11.2026');
    expect(punkte[1]).toHaveTextContent('01.10.2026 bis 31.10.2026');
    expect(verlauf).toHaveBeenCalledWith('m1', 's2', 200);
  });

  it('ist der Preisverlauf ausgeschaltet, fehlt der Knopf', async () => {
    zeige({ verlaufAn: false });
    await screen.findByText('Beta');
    expect(screen.queryByRole('button', { name: 'Preisverlauf zeigen' })).toBeNull();
  });
});
