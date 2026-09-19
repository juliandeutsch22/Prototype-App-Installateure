import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Doppelbuchung beim BEARBEITEN.
 *
 * Beim Anlegen war sie längst geblockt, beim Ändern nicht: ein Eintrag liess
 * sich auf einen Tag schieben, an dem für denselben Mitarbeiter bereits
 * gebucht war. Danach stehen zwei Einträge auf demselben Tag, der
 * Überstunden-Saldo zählt beide, und niemand sieht es — die Zahl ist einfach
 * falsch. Erreichbar für jeden Benutzer an jedem Tag.
 *
 * GEPRÜFT IST DIE ENTSCHEIDUNG, NICHT DAS SCHREIBEN. Die Regel steht in
 * `lib/db/timeEntries.ts` — der Schicht, die den Konflikt beurteilt, bevor
 * sie die Datenbank überhaupt fragt. Ersetzt wird deshalb die Datenbank
 * darunter; dass das Schreiben selbst ankommt, deckt `modulZeiten` gegen eine
 * echte Postgres-Datenbank ab.
 */

const aendern = vi.fn();
const eintraegeAmTag = vi.fn();

vi.mock('@/lib/db/pg/timeEntries', () => ({
  aendern: (...a: unknown[]) => aendern(...a),
  eintraegeAmTag: (...a: unknown[]) => eintraegeAmTag(...a),
}));

const { updateTimeEntry, DuplicateEntryError } = await import('@/lib/db/timeEntries');

const OWNER = { companyId: 'perl', userId: 'monteur-1' };

beforeEach(() => {
  aendern.mockReset().mockResolvedValue(undefined);
  eintraegeAmTag.mockReset().mockResolvedValue([]);
});

describe('Zeiteintrag bearbeiten', () => {
  it('weist ein Datum ab, an dem schon ein anderer Eintrag liegt', async () => {
    eintraegeAmTag.mockResolvedValue([{ id: 'fremder-eintrag', date: '2026-09-01' }]);
    await expect(
      updateTimeEntry('mein-eintrag', { date: '2026-09-01' }, OWNER),
    ).rejects.toBeInstanceOf(DuplicateEntryError);
    expect(aendern).not.toHaveBeenCalled();
  });

  it('nennt in der Meldung den betroffenen Tag', async () => {
    eintraegeAmTag.mockResolvedValue([{ id: 'fremder-eintrag', date: '2026-09-01' }]);
    await expect(
      updateTimeEntry('mein-eintrag', { date: '2026-09-01' }, OWNER),
    ).rejects.toThrow('2026-09-01');
  });

  it('nimmt den bearbeiteten Eintrag von der Suche aus', async () => {
    /*
      SONST IST JEDE ÄNDERUNG EIN KONFLIKT MIT SICH SELBST. Wer nur den
      Kommentar berichtigt und das Datum stehen lässt, fände seinen eigenen
      Eintrag und bekäme „für diesen Tag ist bereits gebucht".

      BIS ZUM 19.09. STAND HIER ETWAS ANDERES: unter Firestore kam der
      bearbeitete Eintrag mit zurück und wurde danach aussortiert, also prüfte
      der Test eine Trefferliste, die ihn enthielt. Postgres schliesst ihn in
      der ABFRAGE aus — geprüft wird deshalb, dass die Kennung dorthin
      mitgegeben wird. Dieselbe Zusicherung, eine Schicht tiefer.
    */
    await updateTimeEntry('mein-eintrag', { date: '2026-09-01', comment: 'neu' }, OWNER);
    expect(eintraegeAmTag).toHaveBeenCalledWith('perl', 'monteur-1', '2026-09-01', 'mein-eintrag');
    expect(aendern).toHaveBeenCalledOnce();
  });

  it('fragt gar nicht erst nach, wenn das Datum unangetastet bleibt', async () => {
    await updateTimeEntry('mein-eintrag', { comment: 'nur ein Kommentar' }, OWNER);
    expect(eintraegeAmTag).not.toHaveBeenCalled();
    expect(aendern).toHaveBeenCalledOnce();
  });

  it('prueft gegen den Eigentuemer, nicht gegen den Bearbeiter', async () => {
    // Korrigiert die Buchhaltung den Eintrag eines Monteurs, muessen dessen
    // Tage geprueft werden. Gegen die eigenen zu pruefen, liesse die
    // Doppelbuchung durch und meldete dafuer falsche Konflikte.
    await updateTimeEntry('mein-eintrag', { date: '2026-09-02' }, OWNER);
    const [companyId, uid] = eintraegeAmTag.mock.calls[0] as [string, string];
    expect(companyId).toBe('perl');
    expect(uid).toBe('monteur-1');
  });
});

describe('Mehrere Baustellen an einem Tag', () => {
  /**
   * DIE SPERRE GING ZU WEIT. Sie pruefte `(Mitarbeiter, Tag)` ohne Ansehen
   * der Baustelle — ein Monteur, der drei kleine Baustellen abklappert,
   * konnte davon eine buchen. Die uebrigen bekamen keine Stunden, keinen
   * Budgetverbrauch, keine Rechnungsposition.
   *
   * Was sie richtig machte, bleibt: zwei Buchungen fuer denselben Einsatz
   * zaehlen doppelt in den Saldo und wandern auf den Lohnzettel.
   */
  it('laesst eine zweite Baustelle am selben Tag zu', async () => {
    eintraegeAmTag.mockResolvedValue([
      { id: 'anderer', date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-042' },
    ]);
    await updateTimeEntry(
      'mein-eintrag',
      { date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-043' },
      OWNER,
    );
    expect(aendern).toHaveBeenCalledOnce();
  });

  it('blockt DIESELBE Baustelle ein zweites Mal', async () => {
    eintraegeAmTag.mockResolvedValue([
      { id: 'anderer', date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-042' },
    ]);
    await expect(
      updateTimeEntry(
        'mein-eintrag',
        { date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-042' },
        OWNER,
      ),
    ).rejects.toBeInstanceOf(DuplicateEntryError);
    expect(aendern).not.toHaveBeenCalled();
  });

  it('blockt Arbeitszeit an einem Krankentag', async () => {
    // Krank und Urlaub gelten fuer den GANZEN Tag; die Rechnung zaehlt sie
    // als ganze Tage, je Eintrag einen.
    eintraegeAmTag.mockResolvedValue([{ id: 'krank', date: '2026-09-01', status: 'Krank' }]);
    await expect(
      updateTimeEntry(
        'mein-eintrag',
        { date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-042' },
        OWNER,
      ),
    ).rejects.toBeInstanceOf(DuplicateEntryError);
  });

  it('nennt den Grund, nicht nur die Tatsache', async () => {
    eintraegeAmTag.mockResolvedValue([
      { id: 'anderer', date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-042' },
    ]);
    await expect(
      updateTimeEntry(
        'mein-eintrag',
        { date: '2026-09-01', status: 'Anwesend', projectNumber: '2026-042' },
        OWNER,
      ),
    ).rejects.toThrow(/diese Baustelle/i);
  });
});
