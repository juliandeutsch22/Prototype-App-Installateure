/**
 * Die Weiche für „Urlaub entscheiden" — die erste außerhalb der Datenschicht.
 *
 * Unter Firestore entscheidet eine Cloud Function, unter Postgres eine
 * Datenbankfunktion. Die Ansicht (`VacationsView`) merkt davon nichts: sie
 * bekommt in beiden Fällen `{ data }` und liest daraus dieselben vier Zahlen.
 *
 * WARUM DAS EINEN EIGENEN TEST BRAUCHT. Die achtzehn Weichen in `lib/db/`
 * hält `datenschichtVertrag.test.ts` zusammen — der prüft aber nur Dateien
 * unter `src/lib/db/`. Diese eine liegt in `lib/functions.ts`, weil der
 * Aufrufer dort schon immer gesucht hat. Ohne diesen Test stünde sie als
 * einzige ungeprüft da: ein vertauschter Zweig bliebe still, bis in Stufe 8
 * der Schalter umgelegt wird und die Genehmigung ins Leere ruft.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const nutztPostgres = vi.fn<[], boolean>();
const entscheiden = vi.fn();
const alsFunction = vi.fn();

vi.mock('@/lib/db/quelle', () => ({ nutztPostgres: () => nutztPostgres() }));
vi.mock('@/lib/db/vacations', () => ({ entscheiden: (d: unknown) => entscheiden(d) }));
vi.mock('@/lib/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => (d: unknown) => alsFunction(d),
}));

const EINGABE = {
  vacationId: 'v1',
  entscheidung: 'Genehmigt' as const,
  grund: '',
  entscheiderName: 'Chef',
};
const ZAHLEN = { status: 'Genehmigt', angelegt: 5, uebersprungen: 0, entfernt: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  entscheiden.mockResolvedValue(ZAHLEN);
  alsFunction.mockResolvedValue({ data: ZAHLEN });
});

async function callUrlaubEntscheiden() {
  const modul = await import('@/lib/functions');
  return modul.callUrlaubEntscheiden;
}

describe('Urlaub entscheiden — dieselbe Antwort aus zwei Datenbanken', () => {
  it('unter Postgres fragt die Datenbank, nicht die Cloud Function', async () => {
    nutztPostgres.mockReturnValue(true);
    const antwort = await (await callUrlaubEntscheiden())(EINGABE);

    expect(entscheiden).toHaveBeenCalledWith(EINGABE);
    expect(alsFunction).not.toHaveBeenCalled();
    // Die Ansicht liest `data` — die Hülle muss also auch hier stehen.
    expect(antwort).toEqual({ data: ZAHLEN });
  });

  it('unter Firestore die Cloud Function, nicht die Datenbank', async () => {
    nutztPostgres.mockReturnValue(false);
    const antwort = await (await callUrlaubEntscheiden())(EINGABE);

    expect(alsFunction).toHaveBeenCalledWith(EINGABE);
    expect(entscheiden).not.toHaveBeenCalled();
    expect(antwort).toEqual({ data: ZAHLEN });
  });
});
