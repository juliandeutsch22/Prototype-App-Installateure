import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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

  // Testbericht 30.09.2026, G32 — der Vorleser las „Anforderungen1 offene …“.
  it('trennt Menüpunkt und Zahl für den Vorleser mit einem Komma (G32)', async () => {
    ladenMock.mockResolvedValue(zahlen(0, 1, 0));
    zeige();
    const aside = document.querySelector('aside')!;
    // Ob vor dem Komma ein Leerraum steht, entscheidet die Namensberechnung
    // der Umgebung (jsdom setzt einen, weil es kein CSS kennt); dass das Komma
    // zwischen Wort und Zahl steht, entscheidet die App.
    const link = await within(aside).findByRole('link', {
      name: /^Anforderungen\s*,\s*1 offene Materialanforderung$/,
    });
    expect(link).toBeInTheDocument();
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

  it('bringt am Telefon zusammen, was der Knopf „Mehr“ verdeckt', async () => {
    /*
      „Mehr" verbirgt bis zu zwölf Bereiche. Ohne diese Summe läge eine
      Meldung hinter einem Knopf, den man nur öffnet, wenn man ohnehin schon
      etwas sucht — genau der Zustand, den die Abzeichen beenden sollen.

      Die Geschäftsführung hat unten Start, Planung, Baustellen und
      Rechnungen; Urlaub und Anforderungen liegen unter „Mehr". 3 + 2 = 5.
    */
    ladenMock.mockResolvedValue(zahlen(3, 2, 7));
    zeige();

    // Bewusst geändert (Prüflauf 25.09.2026, P4-08): der Name war „Weitere
    // Bereiche" und überschrieb den Inhalt — die Summe wurde nie vorgelesen,
    // das sichtbare „Mehr" fehlte. Jetzt trägt der Name beides.
    const mehr = await screen.findByRole('button', { name: 'Mehr, 5 offene Posten' });
    await waitFor(() => expect(within(mehr).getByText('5 offene Posten')).toBeInTheDocument());

    // Die sieben fälligen Mahnungen sind NICHT dabei: die Rechnungen stehen
    // sichtbar in der Leiste und tragen ihre Zahl selbst.
    expect(mehr).not.toHaveTextContent('12');
  });

  it('heißt „Mehr“ — mit der Zahl, wenn eine da ist (P4-08)', async () => {
    ladenMock.mockResolvedValue(zahlen(1, 0, 0));
    zeige();
    expect(await screen.findByRole('button', { name: 'Mehr, 1 offener Posten' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Weitere Bereiche' })).not.toBeInTheDocument();
  });

  it('heißt ohne offene Posten schlicht „Mehr“ (P4-08)', async () => {
    ladenMock.mockResolvedValue(zahlen());
    zeige();
    expect(await screen.findByRole('button', { name: 'Mehr' })).toBeInTheDocument();
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

describe('Hilfe und Rechtliches in der Hülle', () => {
  it('bietet „Problem melden“ und die Rechtsseiten in Seitenleiste und Profilblatt', async () => {
    const nutzer = userEvent.setup();
    zeige();
    // Seitenleiste
    expect(await screen.findByRole('button', { name: 'Problem melden' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Impressum' })).toHaveLength(1);
    // Profilblatt am Telefon (Kopfzeile) — am Tablet öffnet es dieselben Initialen in der Leiste.
    expect(screen.getAllByRole('button', { name: /Profil öffnen/ })).toHaveLength(2);
    await nutzer.click(screen.getAllByRole('button', { name: /Profil öffnen/ })[0]);
    expect(screen.getAllByRole('button', { name: 'Problem melden' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Datenschutz' })).toHaveLength(2);
  });

  it('nennt den Eintrag im Profilblatt wie die Seite, auf die er führt (P4-17)', async () => {
    // Er hieß „Benachrichtigungen" und führte auf „Mein Konto"
    // (navigation.ts, Unterseite `meldungen`).
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click((await screen.findAllByRole('button', { name: /Profil öffnen/ }))[0]);
    const profil = screen.getByRole('dialog', { name: 'Profil' });
    expect(within(profil).getByRole('link', { name: 'Mein Konto' })).toHaveAttribute(
      'href',
      '/settings/meldungen',
    );
    expect(within(profil).queryByText('Benachrichtigungen')).not.toBeInTheDocument();
  });
});

describe('Leiste am Tablet (Linie „Lot“, Protokoll Abschnitt 5)', () => {
  it('trägt Symbol und Kurztext — der Vorleser hört trotzdem den ganzen Namen', async () => {
    /*
      Bei 834 px stand bis zum Umbau die volle Seitenleiste, und lange Namen
      wie „Mitarbeiterübersicht" kämpften um jeden Pixel (P4-13). Am Tablet
      steht jetzt die schmale Leiste mit dem Kurztext; der lange Name bleibt
      für den Schreibtisch und für die Vorlesehilfe.
    */
    zeige();
    const aside = (await screen.findByText('Senklot')).closest('aside')!;
    const zeile = within(aside).getByRole('link', { name: 'Mitarbeiterübersicht' });
    expect(within(zeile).getByText('Mitarbeiterübersicht').className).toBe('navi-text-lang');
    const kurz = within(zeile).getByText('Übersicht');
    expect(kurz.className).toBe('navi-text-kurz');
    expect(kurz).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Zum Inhalt (offene Punkte C6)', () => {
  function zeigeMitSeiten() {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Layout>
          <Routes>
            <Route path="/" element={<p>Start</p>} />
            <Route path="/time" element={<input aria-label="Beginn" autoFocus />} />
            <Route path="*" element={<p>Andere Seite</p>} />
          </Routes>
        </Layout>
      </MemoryRouter>,
    );
  }

  it('bietet als ersten Halt einen Sprunglink zum Inhalt', async () => {
    zeige();
    const link = await screen.findByRole('link', { name: 'Zum Inhalt' });
    expect(link).toHaveAttribute('href', '#inhalt');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'inhalt');
  });

  it('stellt nach einem Seitenwechsel den Fokus auf den neuen Inhalt', async () => {
    const nutzer = userEvent.setup();
    zeigeMitSeiten();
    const main = screen.getByRole('main');
    // Beim ersten Laden gehört der Fokus dem Browser.
    expect(main).not.toHaveFocus();

    const nav = screen.getAllByRole('navigation', { name: 'Hauptnavigation' })[0];
    const ziel = within(nav)
      .getAllByRole('link')
      .find((a) => !['/', '/time'].includes(a.getAttribute('href') ?? ''))!;
    await nutzer.click(ziel);
    await waitFor(() => expect(main).toHaveFocus());
  });

  it('lässt den Fokus, wo die neue Seite ihn selbst hinsetzt', async () => {
    const nutzer = userEvent.setup();
    zeigeMitSeiten();
    const nav = screen.getAllByRole('navigation', { name: 'Hauptnavigation' })[0];
    await nutzer.click(within(nav).getAllByRole('link').find((a) => a.getAttribute('href') === '/time')!);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Beginn' })).toHaveFocus());
  });
});

// Analyse 03.10.2026, Paket 1 — Navigation ohne Doppelungen.
describe('Navigation aufgeräumt (Paket 1)', () => {
  it('zeigt im Blatt „Mehr“ nur, was nicht schon unten in der Leiste steht', async () => {
    ladenMock.mockResolvedValue(undefined);
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /^Mehr/ }));
    const blatt = await screen.findByRole('navigation', { name: 'Weitere Bereiche' });
    // Die Geschäftsführung hat unten Start, Planung, Baustellen und Rechnungen.
    for (const unten of ['Start', 'Einsatzplanung', 'Baustellen', 'Rechnungen']) {
      expect(within(blatt).queryByRole('link', { name: new RegExp(`^${unten}`) })).toBeNull();
    }
    // Gegenprobe: was unten fehlt, steht im Blatt.
    expect(within(blatt).getByRole('link', { name: /^Urlaub/ })).toBeInTheDocument();
    expect(within(blatt).getByRole('link', { name: /^Einstellungen/ })).toBeInTheDocument();
  });

  it('nennt die Startseite „Start“ und stellt die Einstellungen ans Ende der Seitenleiste', async () => {
    zeige();
    const aside = document.querySelector('aside')!;
    await within(aside).findByRole('link', { name: /^Start/ });
    expect(within(aside).queryByRole('link', { name: /Dashboard/ })).toBeNull();
    const nav = within(aside).getByRole('navigation', { name: 'Hauptnavigation' });
    const links = within(nav).getAllByRole('link');
    // Die Einstellungen stehen unten im Fuss der Leiste, nach allen Gruppen.
    const fuss = within(aside).getByRole('navigation', { name: 'Einstellungen' });
    expect(within(fuss).getByRole('link', { name: /^Einstellungen/ })).toBeInTheDocument();
    expect(nav.compareDocumentPosition(fuss) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: /^Einstellungen/ })).toBeNull();
    // Gegenprobe: Start bleibt der erste Eintrag.
    expect(links[0]).toHaveTextContent('Start');
  });
});

describe('Strg + K (Linie „Lot“)', () => {
  it('öffnet „Suchen oder springen“ — auch aus einem Feld heraus', async () => {
    zeige();
    await screen.findAllByText('Perl Installationen');
    expect(screen.queryByRole('dialog', { name: 'Suchen oder springen' })).toBeNull();
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog', { name: 'Suchen oder springen' })).toBeInTheDocument();
  });

  it('Gegenprobe: ein K allein öffnet nichts', async () => {
    zeige();
    await screen.findAllByText('Perl Installationen');
    await userEvent.keyboard('k');
    expect(screen.queryByRole('dialog', { name: 'Suchen oder springen' })).toBeNull();
  });

  it('hat in Seitenleiste und Kopfzeile einen Knopf „Suchen“', async () => {
    zeige();
    await screen.findAllByText('Perl Installationen');
    const knoepfe = screen.getAllByRole('button', { name: /^Suchen/ });
    expect(knoepfe).toHaveLength(2);
    await userEvent.click(knoepfe[1]);
    expect(screen.getByRole('dialog', { name: 'Suchen oder springen' })).toBeInTheDocument();
  });
});
