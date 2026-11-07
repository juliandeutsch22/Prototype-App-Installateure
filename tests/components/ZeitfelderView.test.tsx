import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Role, ZeitfeldDefinition } from '@/types';

/**
 * DIE SEITE „ZEITFELDER“ (M06b, N01): Geschäftsführung und Administration
 * legen eigene Angaben zur Zeitbuchung an, ändern sie, beenden sie — und ein
 * Typwechsel geschieht als „neues Feld, altes endet“, mit Hinweis vorher.
 * Die Hilfe warnt vor Gesundheitsangaben im Freitext.
 *
 * Gegenprobe: ohne `ZeitfelderView.tsx` gibt es nichts zu zeigen — rot.
 */

const ALLE: Role[] = ['Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator'];
const def = (id: string, name: string, x: Partial<ZeitfeldDefinition>): ZeitfeldDefinition => ({
  id, companyId: 'perl', name, typ: 'text', regeln: {}, giltStaende: ['Anwesend'], giltRollen: ALLE, pflicht: 'nie',
  reihenfolge: 1, aktiv: true, ...x,
});
let felder: ZeitfeldDefinition[] = [];
const speichern = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ id: 'neu', fassung: 7 }));
const typWechseln = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ id: 'neu2', fassung: 8 }));
const reihenfolge = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => undefined);
vi.mock('@/lib/db/zeitfelder', () => ({
  listZeitfeldDefinitionen: vi.fn(async () => felder),
  getAktuelleZeitfeldFassung: vi.fn(async () => ({ id: 'f', companyId: 'perl', nummer: 6, felder: {}, anlass: '„Kilometer“ angelegt' })),
  zeitfeldSpeichern: (...a: unknown[]) => speichern(...a),
  zeitfeldTypWechseln: (...a: unknown[]) => typWechseln(...a),
  zeitfeldReihenfolge: (...a: unknown[]) => reihenfolge(...a),
}));

const authWert: { user: AppUser } = {
  user: { uid: 'gf', name: 'Gerda Chefin', role: 'Geschäftsführung', companyId: 'perl' } as unknown as AppUser,
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: ZeitfelderView } = await import('@/features/settings/ZeitfelderView');

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ZeitfelderView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  speichern.mockClear();
  typWechseln.mockClear();
  reihenfolge.mockClear();
  authWert.user = { ...authWert.user, role: 'Geschäftsführung' } as AppUser;
  felder = [
    def('k', 'Kostenstelle', { typ: 'auswahl', pflicht: 'beim_buchen', regeln: { optionen: [{ id: '11111111-1111-4111-8111-111111111111', text: 'Wien', aktiv: true }] } }),
    def('km', 'Kilometer', { typ: 'zahl', reihenfolge: 2, regeln: { min: 0, stellen: 1, einheit: 'km' } }),
    def('alt', 'Abnahme', { typ: 'datum', aktiv: false, ersetztDurch: 'k' }),
  ];
});

describe('Die Seite „Zeitfelder“', () => {
  it('zeigt die Felder in Gebrauch, die geltende Fassung und die beendeten', async () => {
    zeichne();
    const liste = (await screen.findByText('Kostenstelle')).closest('ul') as HTMLElement;
    expect(within(liste).getByText('Auswahl · Pflicht beim Buchen · Anwesend · alle Rollen')).toBeInTheDocument();
    expect(within(liste).getByText('Kilometer')).toBeInTheDocument();
    expect(screen.getByText(/Fassung 6 · „Kilometer“ angelegt/)).toBeInTheDocument();
    expect(screen.getByText('Abnahme')).toBeInTheDocument();
    expect(screen.getByText('Datum · ersetzt durch „Kostenstelle“')).toBeInTheDocument();
  });

  it('die Hilfe warnt vor Gesundheitsangaben im Freitext', async () => {
    zeichne();
    await userEvent.click(screen.getByRole('button', { name: 'Hilfe zu dieser Seite' }));
    expect(await screen.findByText(/auch Angaben zur Gesundheit, die dort nicht hingehören/)).toBeInTheDocument();
  });

  it('legt ein Zahlfeld mit Einheit, Rollen und Pflicht an — und nennt die Fassung', async () => {
    zeichne();
    await screen.findByText('Kostenstelle');
    await userEvent.click(screen.getByRole('button', { name: 'Feld anlegen' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Kilometer Firmenauto');
    await userEvent.selectOptions(screen.getByLabelText('Typ'), 'zahl');
    await userEvent.type(screen.getByLabelText('Mindestens (optional)'), '0');
    await userEvent.selectOptions(screen.getByLabelText('Nachkommastellen'), '1');
    await userEvent.type(screen.getByLabelText('Einheit (optional)'), 'km');
    await userEvent.click(screen.getByLabelText('Zeitausgleich'));
    await userEvent.click(screen.getByLabelText('Verwaltung'));
    await userEvent.selectOptions(screen.getByLabelText('Pflicht'), 'nur_buero');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(speichern).toHaveBeenCalled());
    expect(speichern.mock.calls[0][0]).toEqual({
      id: undefined, name: 'Kilometer Firmenauto', typ: 'zahl', regeln: { min: 0, stellen: 1, einheit: 'km' },
      giltStaende: ['Anwesend', 'Zeitausgleich'], giltRollen: ALLE.filter((r) => r !== 'Verwaltung'),
      pflicht: 'nur_buero', aktiv: true,
    });
    expect(await screen.findByText('„Kilometer Firmenauto“ gespeichert — Fassung 7')).toBeInTheDocument();
  });

  it('prüft die Regeln wie der Server: eine Option braucht einen Text', async () => {
    zeichne();
    await screen.findByText('Kostenstelle');
    await userEvent.click(screen.getByRole('button', { name: 'Feld anlegen' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Abteilung');
    await userEvent.selectOptions(screen.getByLabelText('Typ'), 'auswahl');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Jede Option braucht einen Text (höchstens 80 Zeichen)')).toBeInTheDocument();
    expect(speichern).not.toHaveBeenCalled();
  });

  it('Typwechsel: erst „Typ ändern …“, dann der Hinweis — gespeichert als neues Feld', async () => {
    zeichne();
    await userEvent.click(await screen.findByText('Kilometer'));
    expect(screen.getByLabelText('Typ')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Typ ändern …' }));
    expect(screen.getByText(/Ein Typwechsel ergibt ein neues Feld: das alte endet/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Typ'), 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Als neues Feld anlegen' }));
    await waitFor(() => expect(typWechseln).toHaveBeenCalled());
    expect(typWechseln.mock.calls[0][0]).toBe('km');
    expect(typWechseln.mock.calls[0][1]).toMatchObject({ name: 'Kilometer', typ: 'text', regeln: {}, aktiv: true });
    expect(speichern).not.toHaveBeenCalled();
    expect(await screen.findByText('„Kilometer“ als neues Feld angelegt, das alte ist beendet — Fassung 8')).toBeInTheDocument();
  });

  it('die Reihenfolge ergibt sich im Fenster des Felds', async () => {
    zeichne();
    await userEvent.click(await screen.findByText('Kilometer'));
    await userEvent.click(screen.getByRole('button', { name: 'Weiter nach oben' }));
    await waitFor(() => expect(reihenfolge).toHaveBeenCalledWith(['km', 'k']));
  });

  it('ein ersetztes Feld lässt sich nicht öffnen', async () => {
    zeichne();
    const zeile = (await screen.findByText('Abnahme')).closest('li') as HTMLElement;
    expect(within(zeile).queryByRole('button')).toBeNull();
  });

  it('ohne Recht (Projektleitung) kein Anlegen und kein Öffnen', async () => {
    authWert.user = { ...authWert.user, role: 'Projektleiter' } as AppUser;
    zeichne();
    await screen.findByText('Kostenstelle');
    expect(screen.queryByRole('button', { name: 'Feld anlegen' })).toBeNull();
  });
});
