import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * WAS BEIM VERWERFEN TATSAECHLICH IN DIE DATENBANK GEHT.
 *
 * Die Ansicht laesst sich pruefen, ohne dass diese Frage je gestellt wird:
 * ihre Tests ersetzen die Datenschicht durch einen Doppelgaenger und sehen
 * nur, DASS sie gerufen wird. Faellt der Statuswechsel aus dem Aufruf heraus,
 * bleibt der Entwurf ein Entwurf — der Knopf meldet Erfolg, die Liste laedt
 * neu, und alles steht wieder da. Genau dieser Fall ist beim Gegenlesen
 * durchgerutscht und hat diese Datei ausgeloest.
 *
 * Geprueft wird deshalb die NUTZLAST, nicht das Schreiben selbst; das
 * Schreiben deckt der Emulatorlauf ab.
 */

const updateDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, sammlung: string, id: string) => ({ pfad: `${sammlung}/${id}` }),
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: () => 'SERVERZEIT',
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/db/fs/core', () => ({ queryTenant: vi.fn(), createInTenant: vi.fn() }));

const { discardWorkSheetDraft, restoreWorkSheetDraft, cancelWorkSheet } = await import(
  '@/lib/db/workSheets'
);

beforeEach(() => updateDoc.mockReset().mockResolvedValue(undefined));

describe('Verwerfen und Zurueckholen schreiben', () => {
  it('setzt den Status auf „Verworfen" und haelt fest, wer es war', async () => {
    await discardWorkSheetDraft('s1', 'Max Mustermann');
    expect(updateDoc).toHaveBeenCalledWith(
      { pfad: 'workSheets/s1' },
      { status: 'Verworfen', verworfenVonName: 'Max Mustermann' },
    );
  });

  it('holt zurueck in den Entwurf — und fasst sonst nichts an', async () => {
    /*
      Die Rules lassen auf diesem Weg NUR `status` und `verworfenVonName` zu.
      Kaeme ein Inhaltsfeld dazu — und sei es unabsichtlich —, waere der Knopf
      im Betrieb tot: die Datenbank lehnte ab, der Nutzer saehe nur einen
      Fehler.

      Dass hier ausserdem der NAME stehen bleibt, ist Absicht und nicht von
      den Rules erzwungen: ein zweites Verwerfen ueberschreibt dieselbe Zeile,
      statt eine Historie zu beginnen, fuer die es kein Feld gibt.
    */
    await restoreWorkSheetDraft('s1');
    expect(updateDoc).toHaveBeenCalledWith({ pfad: 'workSheets/s1' }, { status: 'Entwurf' });
  });

  it('verwechselt Verwerfen und Stornieren nicht', async () => {
    // Der Storno gilt dem unterschriebenen Beleg und traegt einen Grund.
    await cancelWorkSheet('s1', 'Zahlendreher', 'Chef');
    expect(updateDoc).toHaveBeenCalledWith(
      { pfad: 'workSheets/s1' },
      { status: 'Storniert', stornoGrund: 'Zahlendreher', storniertVonName: 'Chef' },
    );
  });
});
