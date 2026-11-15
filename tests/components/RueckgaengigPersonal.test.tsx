import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, UrlaubsanspruchAnpassung } from '@/types';

/*
  F15 (Nacharbeit): „Rückgängig“ nach dem Zurücknehmen einer Arbeitszeit-
  oder Anspruchsänderung und nach dem Entfernen einer Urlaubsanpassung —
  dieselbe Änderung wird über den bestehenden Weg wieder angelegt.
  Gegenprobe: ohne die Änderung hat die Meldung keinen Knopf.
*/
const zk = {
  arbeitszeitAendern: vi.fn(async () => undefined),
  arbeitszeitAenderungEntfernen: vi.fn(async () => undefined),
  urlaubsanspruchAendern: vi.fn(async () => undefined),
  urlaubsanspruchAenderungEntfernen: vi.fn(async () => undefined),
};
vi.mock('@/lib/db/zeitkonto', () => zk);
const anpassung: UrlaubsanspruchAnpassung = { id: 'a1', companyId: 'perl', userId: 'u1', urlaubsjahr: 2026, tage: -6.25, grund: 'Elternkarenz' };
const ua = {
  listAnpassungen: vi.fn(async () => [anpassung]),
  anpassungEntfernen: vi.fn(async () => undefined),
  anspruchAnpassen: vi.fn(async () => undefined),
};
vi.mock('@/lib/db/urlaubsanspruch', () => ua);

/** Der Bestätigungsknopf steht in der Rückfrage zuletzt. */
const letzter = (k: HTMLElement[]) => k[k.length - 1];

const { default: ArbeitszeitVerlaufKarte } = await import('@/features/users/ArbeitszeitVerlaufKarte');
const { default: UrlaubsanspruchKarte } = await import('@/features/users/UrlaubsanspruchKarte');

const person = {
  uid: 'u1', companyId: 'perl', name: 'Max', role: 'Mitarbeiter', appStartDate: '2025-01-01',
  arbeitszeitVerlauf: [
    { ab: '2025-01-01', wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5], tagessoll: null },
    { ab: '2026-07-01', wochenstunden: 30, arbeitstage: [1, 2, 3, 4], tagessoll: null },
  ],
  urlaubsanspruchVerlauf: [{ jahr: 2025, tage: 25 }, { jahr: 2026, tage: 30 }],
} as unknown as AppUser;

describe('Rückgängig in der Personalakte', () => {
  it('Arbeitszeit ab einem Tag zurückgenommen — „Rückgängig“ legt sie mit denselben Werten wieder an', async () => {
    const nutzer = userEvent.setup();
    render(<ToastProvider><ArbeitszeitVerlaufKarte person={person} jahresbeginn="01-01" darfAendern onGeaendert={() => undefined} /></ToastProvider>);
    await nutzer.click(screen.getByRole('button', { name: 'Arbeitszeit ab 01.07.2026 zurücknehmen' }));
    const dialog = await screen.findByRole('dialog');
    await nutzer.click(letzter(within(dialog).getAllByRole('button')));
    await waitFor(() => expect(zk.arbeitszeitAenderungEntfernen).toHaveBeenCalledWith('u1', '2026-07-01'));
    await nutzer.click(await screen.findByRole('button', { name: 'Rückgängig' }));
    await waitFor(() => expect(zk.arbeitszeitAendern).toHaveBeenCalledWith({ userId: 'u1', ab: '2026-07-01', wochenstunden: 30, arbeitstage: [1, 2, 3, 4], tagessoll: null }));
  });

  it('Anspruch ab einem Urlaubsjahr zurückgenommen — „Rückgängig“ trägt dieselben Tage wieder ein', async () => {
    const nutzer = userEvent.setup();
    render(<ToastProvider><ArbeitszeitVerlaufKarte person={person} jahresbeginn="01-01" darfAendern onGeaendert={() => undefined} /></ToastProvider>);
    await nutzer.click(screen.getByRole('button', { name: 'Anspruch ab 2026 zurücknehmen' }));
    const dialog = await screen.findByRole('dialog');
    await nutzer.click(letzter(within(dialog).getAllByRole('button')));
    await nutzer.click(await screen.findByRole('button', { name: 'Rückgängig' }));
    await waitFor(() => expect(zk.urlaubsanspruchAendern).toHaveBeenCalledWith('u1', 2026, 30));
  });

  it('Urlaubsanpassung entfernt — „Rückgängig“ legt sie mit Jahr, Tagen und Grund wieder an', async () => {
    const nutzer = userEvent.setup();
    render(<ToastProvider><UrlaubsanspruchKarte person={person} jahresbeginn="01-01" /></ToastProvider>);
    await nutzer.click(await screen.findByRole('button', { name: /entfernen$/ }));
    const dialog = await screen.findByRole('dialog');
    await nutzer.type(within(dialog).getByRole('textbox'), 'Irrtum');
    await nutzer.click(letzter(within(dialog).getAllByRole('button')));
    await waitFor(() => expect(ua.anpassungEntfernen).toHaveBeenCalledWith('a1', 'Irrtum'));
    await nutzer.click(await screen.findByRole('button', { name: 'Rückgängig' }));
    await waitFor(() => expect(ua.anspruchAnpassen).toHaveBeenCalledWith({ userId: 'u1', urlaubsjahr: 2026, tage: -6.25, grund: 'Elternkarenz' }));
  });
});
