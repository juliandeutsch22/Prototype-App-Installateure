import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import type { AppUser, Company } from '@/types';

/**
 * Abmelden, während noch Buchungen im Ausgangsfach liegen (Prüflauf
 * 25.09.2026, P1-05).
 *
 * Eine Vormerkung geht nur mit der Sitzung ihres Besitzers hinaus. Wer sich
 * abmeldet, lässt sie auf dem Gerät zurück — auf dem Baustellen-Tablet, auf
 * dem sich gleich der Kollege anmeldet, womöglich für immer. Die Hülle fragt
 * deshalb nach, aber NUR dann: ohne offene Vormerkung meldet der Knopf ab wie
 * bisher, ohne zusätzlichen Klick.
 */

const NUTZER = {
  uid: 'm1', companyId: 'perl', name: 'Max Mustermann',
  role: 'Mitarbeiter', email: 'max@perl.at',
} as AppUser;
const betrieb = { id: 'perl', name: 'Perl Installationen' } as Company;
const signOut = vi.fn(async () => undefined);

vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: NUTZER, company: betrieb, signOut }),
}));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: NUTZER, company: betrieb, signOut }),
}));
vi.mock('@/lib/db/offenePosten', () => ({
  ladeOffenePosten: async () => undefined,
}));
const offeneVormerkungen = vi.fn<[string | undefined], Promise<number>>(async () => 0);
vi.mock('@/lib/db/pg/ohneEmpfang', () => ({
  offeneVormerkungen: (uid?: string) => offeneVormerkungen(uid),
}));

const { default: Layout } = await import('@/app/Layout');

function zeige() {
  return render(
    <MemoryRouter>
      <Layout>
        <p>Inhalt</p>
      </Layout>
    </MemoryRouter>,
  );
}

function seitenleiste() {
  return within(screen.getAllByRole('complementary')[0] ?? document.body);
}

beforeEach(() => {
  signOut.mockClear();
  offeneVormerkungen.mockReset().mockResolvedValue(0);
});

describe('Abmelden mit ungesendeten Buchungen', () => {
  it('meldet ohne offene Vormerkung sofort ab — keine Nachfrage', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(seitenleiste().getAllByRole('button', { name: 'Abmelden' })[0]);
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Gezählt wird nur, was dem angemeldeten Konto gehört.
    expect(offeneVormerkungen).toHaveBeenCalledWith('m1');
  });

  it('warnt, solange eigene Buchungen im Fach liegen, und meldet erst auf Wunsch ab', async () => {
    offeneVormerkungen.mockResolvedValue(2);
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(seitenleiste().getAllByRole('button', { name: 'Abmelden' })[0]);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('2 Buchungen liegen noch ungesendet auf diesem Gerät');
    expect(signOut).not.toHaveBeenCalled();

    await nutzer.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(signOut).not.toHaveBeenCalled();

    await nutzer.click(seitenleiste().getAllByRole('button', { name: 'Abmelden' })[0]);
    await nutzer.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Trotzdem abmelden' }),
    );
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });
});
