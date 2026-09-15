import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AppUser, Company } from '@/types';

/**
 * Die Hülle der App — und die Frage, wessen Marke darin steht.
 *
 * ZWEI MARKEN, ZWEI ORTE. Die Seitenleiste ist der Arbeitsplatz eines
 * bestimmten Betriebs: dort steht ER. Das Produkt meldet sich an der Tür
 * (Anmeldung), auf dem App-Zeichen — und klein am Fuss, damit jemand, der
 * anruft, ein Wort für die Software hat. Vertauscht man das, sagt die App
 * zwanzigmal am Tag etwas, das niemand braucht, und verschweigt das, was
 * jemand wissen will.
 */

let betrieb: Company | null = { id: 'perl', name: 'Perl Installationen' } as Company;
const NUTZER = {
  uid: 'gf1', companyId: 'perl', name: 'Julian Deutsch',
  role: 'Geschäftsführung', email: 'chef@perl.at',
} as AppUser;

vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: NUTZER, company: betrieb, signOut: vi.fn() }),
}));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: NUTZER, company: betrieb, signOut: vi.fn() }),
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

beforeEach(() => {
  betrieb = { id: 'perl', name: 'Perl Installationen' } as Company;
});

describe('Wessen Marke in der Hülle steht', () => {
  it('nennt oben den Betrieb, nicht das Produkt', async () => {
    zeige();
    // Zweimal: schmale Kopfleiste und Seitenleiste tragen dieselbe Marke.
    expect(await screen.findAllByText('Perl Installationen')).toHaveLength(2);
  });

  it('trägt die Produktmarke klein am Fuss der Seitenleiste', async () => {
    /*
      Nicht oben und nicht gross: sie steht HINTER dem Abmelden, in der
      Fusszeile der Navigation. Dort konkurriert sie mit nichts — und wer
      anruft, hat trotzdem ein Wort für die Software.
    */
    zeige();
    const marke = await screen.findByText('Senklot');
    const seitenleiste = marke.closest('aside');
    expect(seitenleiste).not.toBeNull();

    /*
      NICHT NUR „IRGENDWO IN DER SEITENLEISTE" — das war die erste Fassung
      dieser Prüfung, und eine Mutation, die die Marke nach OBEN neben das
      Betriebslogo setzt, blieb damit unbemerkt. Geprüft wird die
      Reihenfolge: sie steht HINTER dem Abmelden, also im Fuss.
    */
    const abmelden = within(seitenleiste!).getByRole('button', { name: 'Abmelden' });
    const folgt = abmelden.compareDocumentPosition(marke) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(folgt).toBeTruthy();

    // Und sie ist kleiner als der Betriebsname darüber.
    const betriebsname = within(seitenleiste!).getByText('Perl Installationen');
    const gross = Number.parseFloat(betriebsname.style.fontSize);
    const klein = Number.parseFloat((marke.parentElement as HTMLElement).style.fontSize);
    expect(klein).toBeLessThan(gross);
  });

  it('zeigt einem zweiten Betrieb NICHT das Zeichen des ersten', async () => {
    // Die Prüfung, um die es geht: der Ersatz war fest auf Perls Logo
    // verdrahtet.
    betrieb = { id: 'zweiter', name: 'Installationen Mustermann' } as Company;
    zeige();

    expect(await screen.findAllByText('Installationen Mustermann')).toHaveLength(2);
    expect(screen.queryByText(/Perl/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
