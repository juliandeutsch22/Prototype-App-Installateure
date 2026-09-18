import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
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

/**
 * Die Zahlen kommen aus der Datenschicht — hier steht an ihrer Stelle eine
 * Attrappe. Geprüft wird die HÜLLE: ob sie die Zahl holt, wo sie sie
 * hinhängt, und was sie tut, wenn keine bekannt ist.
 */
const ladenMock = vi.fn();
vi.mock('@/lib/db/offenePosten', () => ({
  ladeOffenePosten: (h: string) => ladenMock(h),
}));

const { default: Layout } = await import('@/app/Layout');
const { postenZuruecksetzen } = await import('@/app/offenePosten');

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
  postenZuruecksetzen();
  ladenMock.mockReset();
  ladenMock.mockResolvedValue(undefined);
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

    /*
      Und sie ist kleiner als der Betriebsname darüber.

      Der Schriftgrad steht am UMSCHLIESSENDEN Element, nicht am Text selbst:
      der Name liegt seit dem Umbruch auf bis zu drei Zeilen in einem inneren
      `span`, der die Begrenzung trägt. `getByText` findet diesen inneren —
      gemessen wird deshalb am Elternteil, wo der Grad gesetzt ist.
    */
    const betriebsname = within(seitenleiste!).getByText('Perl Installationen');
    const gross = Number.parseFloat(
      (betriebsname.parentElement as HTMLElement).style.fontSize,
    );
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

/**
 * Die Abzeichen im Menü — „hier liegt etwas für dich".
 *
 * WAS SIE LÖSEN SOLLEN: die Navigation sagte, WO etwas liegt, aber nie, DASS
 * dort etwas liegt. Wer entscheidet, ob ein Urlaubsantrag wartet, musste den
 * Reiter öffnen; wer es nicht tat, erfuhr es nicht.
 */
describe('Die Abzeichen für offene Posten', () => {
  const zahlen = (urlaub = 0, anforderungen = 0, mahnungen = 0) =>
    ({ urlaub, anforderungen, mahnungen });

  /** Die Zeile eines Menüpunkts in der Seitenleiste. */
  function zeile(label: string): HTMLElement {
    const aside = document.querySelector('aside')!;
    return within(aside).getByRole('link', { name: new RegExp(label) });
  }

  it('hängt die Zahl an den Menüpunkt, zu dem sie gehört', async () => {
    ladenMock.mockResolvedValue(zahlen(3, 0, 0));
    zeige();

    await waitFor(() => expect(zeile('Urlaub')).toHaveTextContent('3'));
    expect(within(zeile('Urlaub')).getByText('3 offene Urlaubsanträge')).toBeInTheDocument();

    /*
      UND NUR DORT. Stünde dieselbe Zahl an jedem Eintrag, wäre sie keine
      Auskunft mehr, sondern Zierrat — und niemand wüsste, wohin er klicken
      soll.
    */
    expect(zeile('Rechnungen')).not.toHaveTextContent('3');
    expect(zeile('Anforderungen')).not.toHaveTextContent('3');
  });

  it('nennt den Posten in der Einzahl, wenn es einer ist', async () => {
    // „1 offene Urlaubsanträge" ist der Satz, über den in dieser App schon
    // einmal jemand gestolpert ist („1 Tage fehlen").
    ladenMock.mockResolvedValue(zahlen(1, 0, 0));
    zeige();

    await waitFor(() =>
      expect(within(zeile('Urlaub')).getByText('1 offener Urlaubsantrag')).toBeInTheDocument());
  });

  it('zeigt nichts, wo nichts offen ist', async () => {
    ladenMock.mockResolvedValue(zahlen(0, 0, 2));
    zeige();

    await waitFor(() => expect(zeile('Rechnungen')).toHaveTextContent('2'));
    expect(zeile('Urlaub')).not.toHaveTextContent(/\d/);
  });

  it('zeigt nichts, wenn sich die Zahlen nicht sagen lassen', async () => {
    /*
      „NICHT BEKANNT" IST NICHT „NICHTS OFFEN". Ein fehlender Hinweis ist
      ehrlicher als ein falscher — eine 0 einzusetzen wäre bequem und wäre
      eine Aussage, die niemand geprüft hat.
    */
    ladenMock.mockResolvedValue(undefined);
    zeige();

    await waitFor(() => expect(ladenMock).toHaveBeenCalled());
    expect(zeile('Urlaub')).not.toHaveTextContent(/\d/);
    expect(zeile('Rechnungen')).not.toHaveTextContent(/\d/);
  });

  it('bringt am Telefon zusammen, was der Knopf „Mehr" verdeckt', async () => {
    /*
      „Mehr" verbirgt bis zu zwölf Bereiche. Ohne diese Summe läge eine
      Meldung hinter einem Knopf, den man nur öffnet, wenn man ohnehin schon
      etwas sucht — genau der Zustand, den die Abzeichen beenden sollen.

      Die Geschäftsführung hat unten Start, Planung, Baustellen und
      Rechnungen; Urlaub und Anforderungen liegen unter „Mehr". 3 + 2 = 5.
    */
    ladenMock.mockResolvedValue(zahlen(3, 2, 7));
    zeige();

    const mehr = await screen.findByRole('button', { name: 'Weitere Bereiche' });
    await waitFor(() => expect(within(mehr).getByText('5 offene Posten')).toBeInTheDocument());

    // Die sieben fälligen Mahnungen sind NICHT dabei: die Rechnungen stehen
    // sichtbar in der Leiste und tragen ihre Zahl selbst.
    expect(mehr).not.toHaveTextContent('12');
  });

  it('holt die Zahlen bei jedem Seitenwechsel neu', async () => {
    /*
      DER ZEITPUNKT IST MIT ABSICHT DIESER. Wer einen Posten erledigt, bleibt
      auf der Seite — dort stösst die Ansicht selbst an. Wer nur wechselt,
      bekommt den frischen Stand kostenlos mit. Ohne das stünde die Zahl vom
      Anmelden bis zum Neuladen der App unverändert da.
    */
    ladenMock.mockResolvedValue(zahlen());
    zeige();
    await waitFor(() => expect(ladenMock).toHaveBeenCalledTimes(1));

    await userEvent.click(zeile('Rechnungen'));

    await waitFor(() => expect(ladenMock).toHaveBeenCalledTimes(2));
  });
});
