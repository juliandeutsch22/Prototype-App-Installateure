import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Der Thread der Baustelle (E83): angelegt erst beim Öffnen.
const kanalBaustelle = vi.fn<(id: string) => Promise<string>>(async () => 'kanal-7');
vi.mock('@/lib/db/nachrichten', () => ({ kanalBaustelle: (id: string) => kanalBaustelle(id) }));

const { default: HeuteEigene } = await import('@/features/dashboard/start/HeuteEigene');
const { EinsatzKnoepfe } = await import('@/features/assignments/Einsatzaktionen');
import type { EinsatzZeile } from '@/features/dashboard/start/laden';

/*
  DIESELBE HANDLUNG, DIESELBE GESTALT (E72, 09.11.2026). Auf der Startseite
  war die Adresse ein Petrol-Unterstrich ohne Symbol, „Wie zuletzt buchen“
  beim Monteur nackter Text, ab dem zweiten Einsatz „Zeit erfassen ›“ ein
  Verweis; im Einsatzplan war „Zeit erfassen“ je Einsatz gefüllt. Jetzt:
  Zeit, Schein und „Wie zuletzt buchen“ Zweitknöpfe (`lot-knopf`, gerahmt,
  nie `bg-brand`), Adresse und Telefon `.link-kontakt` mit Symbol.
*/
const einsatz = (teil: Partial<EinsatzZeile> = {}): EinsatzZeile => ({
  id: 'a1',
  date: '2026-11-09',
  projectNumber: 'B-2026-0147',
  customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118',
  address: 'Hauptstraße 112–118, 2700 Wiener Neustadt',
  contactName: 'Hausverwaltung',
  contactPhone: '0664 1234567',
  asHelper: false,
  zeit: '07:00–15:30',
  ...teil,
});
const ZULETZT = { startTime: '07:00', endTime: '16:30', breakDuration: 30 };

function zeichne(props: Partial<Parameters<typeof HeuteEigene>[0]> = {}) {
  return render(
    <MemoryRouter>
      <HeuteEigene
        einsaetze={[einsatz(), einsatz({ id: 'a2', projectNumber: 'B-2026-0148', customerName: 'Gemeinde Neudorf' })]}
        letzteBuchung={ZULETZT}
        materialAn={false}
        scheinVerweis
        planVerweis
        zeitImKopf
        {...props}
      />
    </MemoryRouter>,
  );
}

/*
  ZWEIMAL IM DOM (D7, E90): Anfordern, Nachricht und Schein des ersten
  Einsatzes stehen ab dem Tablet oben bzw. als Knopf, am Handy in der Leiste
  darunter. jsdom kennt die Breiten nicht — die Prüfungen hier nehmen die
  Stelle ab dem Tablet; die Leiste prüft ihr eigener Block.
*/
const ohneLeiste = <T extends HTMLElement>(alle: T[]) => alle.filter((el) => !el.closest('.einsatz-wegeleiste'));
const breit = {
  link: (name: string) => {
    const [el, ...rest] = ohneLeiste(screen.queryAllByRole('link', { name }));
    expect(rest).toEqual([]);
    return el ?? null;
  },
  knopf: (name: string) => {
    const [el, ...rest] = ohneLeiste(screen.queryAllByRole('button', { name }));
    expect(rest).toEqual([]);
    return el ?? null;
  },
};

/** Ein Zweitknopf: Gestalt aus `knopf.ts`, gerahmt, nicht gefüllt. */
function istZweitknopf(el: HTMLElement) {
  expect(el.className).toContain('lot-knopf');
  expect(el.className).toContain('border-line-strong');
  expect(el.className).not.toContain('bg-brand');
}

describe('Einsatzaktionen auf der Startseite (E72, H1)', () => {
  it('„Wie zuletzt buchen“ ist beim Monteur ein Zweitknopf mit den Zeiten, nicht nackter Text', () => {
    zeichne();
    const knopf = screen.getByRole('link', { name: /Wie zuletzt buchen/ });
    istZweitknopf(knopf);
    expect(knopf).toHaveTextContent('07:00–16:30 · 30 min Pause · 09:00 Std');
    expect(knopf).toHaveAttribute('href', '/time');
  });

  it('auch ohne Zeit im Seitenkopf ist nichts gefüllt — „Andere Zeit“ bleibt erhalten', () => {
    zeichne({ zeitImKopf: false });
    istZweitknopf(screen.getByRole('link', { name: /Wie zuletzt buchen/ }));
    istZweitknopf(screen.getByRole('link', { name: 'Andere Zeit' }));
  });

  it('ab dem zweiten Einsatz sind „Zeit erfassen“ und „Schein schreiben“ Zweitknöpfe statt Verweise', () => {
    zeichne();
    const danach = screen.getByRole('region', { name: 'Danach' });
    const zeit = within(danach).getByRole('link', { name: 'Zeit erfassen' });
    istZweitknopf(zeit);
    expect(zeit.className).not.toContain('link-weiter');
    for (const schein of ohneLeiste(screen.getAllByRole('link', { name: 'Schein schreiben' }))) istZweitknopf(schein);
  });

  it('Adresse und Telefon tragen überall `.link-kontakt` mit Symbol', () => {
    zeichne();
    const adressen = screen.getAllByRole('link', { name: /in Google Maps öffnen/ });
    const nummern = screen.getAllByRole('link', { name: /anrufen/ });
    expect(adressen).toHaveLength(2);
    expect(nummern).toHaveLength(2);
    for (const a of [...adressen, ...nummern]) {
      expect(a.className).toContain('link-kontakt');
      expect(a.querySelector('svg')).not.toBeNull();
    }
  });

  it('die Namen unter „Danach“ trennen mit Strich wie der große Name (R10)', () => {
    zeichne();
    const danach = screen.getByRole('region', { name: 'Danach' });
    expect(within(danach).getByText('Gemeinde Neudorf').className).toContain('start-einsatz-name');
  });

  it('gleich geblieben: beim Monteur ohne letzte Buchung kein Zeitknopf am ersten Einsatz (der steht im Kopf)', () => {
    zeichne({ letzteBuchung: null, einsaetze: [einsatz()] });
    expect(screen.queryByRole('link', { name: /Zeit erfassen|Wie zuletzt/ })).toBeNull();
    expect(breit.link('Schein schreiben')).toBeInTheDocument();
  });
});

describe('Einsatzaktionen im Einsatzplan (E72, H1)', () => {
  it('Zeit und Schein als Zweitknöpfe; der Schein bekommt Baustelle und Tag mit', () => {
    render(
      <MemoryRouter>
        <EinsatzKnoepfe projectNumber="B-2026-0147" datum="2026-11-10" zeit schein />
      </MemoryRouter>,
    );
    istZweitknopf(screen.getByRole('link', { name: 'Zeit erfassen' }));
    const schein = screen.getByRole('link', { name: 'Schein schreiben' });
    istZweitknopf(schein);
    expect(schein).toHaveAttribute('href', '/worksheet?projekt=B-2026-0147&datum=2026-11-10');
  });

  it('gleich geblieben: ohne Zeit und ohne Schein steht nichts da', () => {
    const { container } = render(
      <MemoryRouter>
        <EinsatzKnoepfe projectNumber="B-1" zeit={false} schein={false} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});


/*
  MATERIAL UND NACHRICHT AM EINSATZ (B2, E83): die zwei Dinge, die vor Ort
  fehlten — leise wie Adresse und Telefon, nur mit dem Recht dazu.
*/
describe('Wege am Einsatz', () => {
  const MIT = { material: true, nachricht: true };

  it('führt mit der Baustelle zu „Material anfordern“', () => {
    zeichne({ wege: MIT, einsaetze: [einsatz({ projectId: 'p1' })] });
    const weg = breit.link('Material anfordern')!;
    expect(weg).toHaveAttribute('href', '/material?projekt=B-2026-0147');
    expect(weg.className).toContain('link-kontakt');
    // Am Handy steht derselbe Weg in der Leiste; oben ist er dort ausgeblendet.
    expect(weg).toHaveClass('max-md:hidden');
  });

  it('öffnet den Thread der Baustelle — angelegt erst beim Tippen', async () => {
    kanalBaustelle.mockClear();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HeuteEigene einsaetze={[einsatz({ projectId: 'p1' })]} letzteBuchung={null} materialAn={false} scheinVerweis planVerweis wege={MIT} />} />
          <Route path="/nachrichten/:kanal" element={<p>Thread offen</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(kanalBaustelle).not.toHaveBeenCalled();
    await userEvent.click(breit.knopf('Nachricht zur Baustelle')!);
    expect(kanalBaustelle).toHaveBeenCalledWith('p1');
    expect(await screen.findByText('Thread offen')).toBeInTheDocument();
  });

  it('Gegenprobe: ohne Recht keine der beiden', () => {
    zeichne({ wege: { material: false, nachricht: false }, einsaetze: [einsatz({ projectId: 'p1' })] });
    expect(screen.queryByRole('link', { name: 'Material anfordern' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nachricht zur Baustelle' })).toBeNull();
    // Adresse und Telefon bleiben.
    expect(screen.getByRole('link', { name: /Hauptstraße 112–118, 2700/ })).toBeInTheDocument();
  });

  it('Gegenprobe: ohne Kennung der Baustelle kein Thread — die Nummer allein öffnet keinen', () => {
    zeichne({ wege: MIT, einsaetze: [einsatz()] });
    expect(screen.queryByRole('button', { name: 'Nachricht zur Baustelle' })).toBeNull();
    expect(breit.link('Material anfordern')).toBeInTheDocument();
  });

  it('auch ohne Adresse und Telefon stehen die Wege da', () => {
    zeichne({ wege: MIT, einsaetze: [einsatz({ projectId: 'p1', address: undefined, contactPhone: undefined })] });
    expect(breit.link('Material anfordern')).toBeInTheDocument();
    expect(breit.knopf('Nachricht zur Baustelle')).toBeInTheDocument();
  });
});

/* Die Leiste am Handy (D7, E90): dieselben Wege, je ein Drittel, nur unter dem ersten Einsatz. */
describe('Wegeleiste am Handy (D7, E90)', () => {
  const MIT = { material: true, nachricht: true };
  it('Anfordern, Nachricht und Schein in einer Leiste — nur am Handy, nur einmal', () => {
    const { container } = zeichne({ wege: MIT, einsaetze: [einsatz({ projectId: 'p1' }), einsatz({ id: 'a2', projectNumber: 'B-2026-0148', projectId: 'p2' })] });
    const leisten = container.querySelectorAll('.einsatz-wegeleiste');
    expect(leisten).toHaveLength(1);
    const leiste = leisten[0] as HTMLElement;
    expect(leiste).toHaveClass('md:hidden');
    expect(within(leiste).getByRole('link', { name: 'Material anfordern' })).toHaveAttribute('href', '/material?projekt=B-2026-0147');
    expect(within(leiste).getByRole('button', { name: 'Nachricht zur Baustelle' })).toBeInTheDocument();
    expect(within(leiste).getByRole('link', { name: 'Schein schreiben' })).toHaveAttribute('href', expect.stringMatching(/^\/worksheet\?projekt=B-2026-0147&datum=\d{4}-\d{2}-\d{2}$/));
  });

  it('Gegenprobe: ohne Rechte und ohne Schein keine Leiste', () => {
    const { container } = zeichne({ wege: { material: false, nachricht: false }, scheinVerweis: false, einsaetze: [einsatz({ projectId: 'p1' })] });
    expect(container.querySelector('.einsatz-wegeleiste')).toBeNull();
  });
});
