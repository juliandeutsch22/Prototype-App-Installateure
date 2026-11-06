/**
 * Der Verlauf einer Akte zum Aufklappen (M01b). Festgehalten: zu Beginn zu
 * und nicht geladen; ein Klick lädt und zeigt, wer was geändert hat; ältere
 * Einträge kommen seitenweise, solange eine volle Seite kam; ein Fehler —
 * auch beim Nachladen — lässt sich wiederholen, ohne ein umgebendes Formular
 * abzuschicken; ohne Einträge der Satz, seit wann aufgezeichnet wird; je
 * Objekt neu.
 *
 * Gegenprobe: ohne den Baustein gibt es nichts aufzuklappen — rot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ObjektVerlaufZeile, VerlaufSeite } from '@/lib/db/objektVerlauf';

const listObjektVerlauf = vi.fn<(...a: unknown[]) => Promise<VerlaufSeite>>();
vi.mock('@/lib/db/objektVerlauf', () => ({
  listObjektVerlauf: (...a: unknown[]) => listObjektVerlauf(...a),
  VERLAUF_SEITE: 30,
}));

const { default: ObjektVerlauf } = await import('@/features/verlauf/ObjektVerlauf');

const am = Date.parse('2026-11-06T13:03:00Z');
const telefon: ObjektVerlaufZeile = {
  quelle: 'journal', id: 'j2', objektart: 'kunde', objektId: 'k1', art: 'geaendert', vonName: 'Berta Büro', am,
  amRoh: '2026-11-06 13:03:00.123456+00', aenderungen: { contact_phone: { alt: '0664 1', neu: '0664 2' } },
};
const angelegt: ObjektVerlaufZeile = {
  ...telefon, id: 'j1', art: 'angelegt', aenderungen: {}, vonName: 'Carla Chefin', amRoh: '2026-11-06 12:00:00+00',
};

function oeffnen() {
  const details = screen.getByText('Änderungsverlauf').closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  return details;
}

beforeEach(() => listObjektVerlauf.mockReset());

describe('ObjektVerlauf', () => {
  it('ist zu und lädt nichts, bis jemand aufklappt — dann steht da, wer was geändert hat', async () => {
    listObjektVerlauf.mockResolvedValue({ zeilen: [telefon], weiter: null });
    render(<ObjektVerlauf companyId="perl" objektart="kunde" objektId="k1" />);
    const details = screen.getByText('Änderungsverlauf').closest('details')!;
    expect(details.open).toBe(false);
    expect(listObjektVerlauf).not.toHaveBeenCalled();

    oeffnen();
    expect(await screen.findByText('Telefon 0664 1 → 0664 2')).toBeInTheDocument();
    expect(screen.getByText('Geändert von Berta Büro')).toBeInTheDocument();
    expect(listObjektVerlauf).toHaveBeenCalledWith('perl', 'kunde', 'k1');
    // Kein „Ältere Einträge laden“ nach einer nicht vollen Seite; ohne Anlegen: älter als das Journal.
    expect(screen.queryByRole('button', { name: 'Ältere Einträge laden' })).toBeNull();
    expect(screen.getByText(/was davor geändert wurde, ist nicht bekannt/)).toBeInTheDocument();

    // Zu und wieder auf lädt nicht noch einmal.
    details.open = false;
    fireEvent(details, new Event('toggle'));
    oeffnen();
    expect(listObjektVerlauf).toHaveBeenCalledTimes(1);
  });

  it('holt ältere Einträge ab dem letzten — auch nach einem Fehler beim Nachladen, ohne das Formular abzuschicken', async () => {
    const zeiger = { am: telefon.amRoh, id: telefon.id };
    listObjektVerlauf
      .mockResolvedValueOnce({ zeilen: [telefon], weiter: zeiger })
      .mockRejectedValueOnce(new Error('kein Netz'))
      .mockResolvedValueOnce({ zeilen: [angelegt], weiter: null });
    const abgeschickt = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={abgeschickt}><ObjektVerlauf companyId="perl" objektart="kunde" objektId="k1" /></form>);
    oeffnen();
    fireEvent.click(await screen.findByRole('button', { name: 'Ältere Einträge laden' }));
    expect(await screen.findByText(/älteren Einträge ließen sich nicht laden/)).toBeInTheDocument();
    // Was schon da war, bleibt stehen.
    expect(screen.getByText('Telefon 0664 1 → 0664 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByText('Angelegt von Carla Chefin')).toBeInTheDocument();
    expect(listObjektVerlauf).toHaveBeenNthCalledWith(2, 'perl', 'kunde', 'k1', zeiger);
    expect(listObjektVerlauf).toHaveBeenNthCalledWith(3, 'perl', 'kunde', 'k1', zeiger);
    // Neueste zuerst, das Anlegen am Ende; danach gibt es nichts Älteres und keinen Hinweis auf Altdaten.
    const punkte = screen.getAllByRole('listitem').filter((li) => li.classList.contains('lot-punkt') || li.classList.contains('lot-jetzt'));
    expect(punkte.map((p) => p.querySelector('.lot-titel')?.textContent)).toEqual(['Geändert von Berta Büro', 'Angelegt von Carla Chefin']);
    expect(screen.queryByRole('button', { name: 'Ältere Einträge laden' })).toBeNull();
    expect(screen.queryByText(/was davor geändert wurde/)).toBeNull();
    expect(abgeschickt).not.toHaveBeenCalled();
  });

  it('ein Fehler beim ersten Laden lässt sich wiederholen; ohne Einträge: seit wann aufgezeichnet wird', async () => {
    listObjektVerlauf
      .mockRejectedValueOnce(new Error('kein Netz'))
      .mockResolvedValueOnce({ zeilen: [], weiter: null });
    const abgeschickt = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={abgeschickt}><ObjektVerlauf companyId="perl" objektart="wartung" objektId="w1" /></form>);
    oeffnen();
    expect(await screen.findByText(/Der Verlauf ließ sich nicht laden/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await waitFor(() =>
      expect(screen.getByText('Keine Änderung aufgezeichnet. Aufgezeichnet wird seit 06.11.2026.')).toBeInTheDocument());
    expect(abgeschickt).not.toHaveBeenCalled();
  });

  it('je Objekt neu: ein anderes Objekt beginnt zu und leer', async () => {
    listObjektVerlauf.mockResolvedValue({ zeilen: [telefon], weiter: null });
    const { rerender } = render(<ObjektVerlauf companyId="perl" objektart="rechnung" objektId="r1" />);
    oeffnen();
    expect(await screen.findByText('Telefon 0664 1 → 0664 2')).toBeInTheDocument();
    rerender(<ObjektVerlauf companyId="perl" objektart="rechnung" objektId="r2" />);
    expect(screen.getByText('Änderungsverlauf').closest('details')!.open).toBe(false);
    expect(screen.queryByText('Telefon 0664 1 → 0664 2')).toBeNull();
  });
});
