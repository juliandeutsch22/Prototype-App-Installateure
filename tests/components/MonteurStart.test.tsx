import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: null, company: null }) }));

const { default: MonteurStart } = await import('@/features/dashboard/MonteurStart');

/**
 * Die Startseite des Monteurs: Heute, Diese Woche, Offen für dich und —
 * sobald geladen — Nächste Einsätze (Mockup S. 1 und 7).
 */
const einsatz = {
  id: 'a1',
  date: '2026-09-25',
  projectNumber: 'PR-187',
  customerName: 'Max Musterkunde',
  address: 'Ludersdorf 204',
  contactName: 'Julian Deutsch',
  contactPhone: '0660 6322503',
  asHelper: false,
  comment: 'Rohr verlegen',
};
const letzte = { startTime: '07:00', endTime: '16:00', breakDuration: 30, minuten: 510, projectNumber: 'PR-187' };

function zeichne(props: Partial<Parameters<typeof MonteurStart>[0]> = {}) {
  return render(
    <MemoryRouter>
      <MonteurStart
        einsaetze={[einsatz]}
        letzte={letzte}
        woche={{ istMin: 17 * 60, sollMin: 38 * 60 + 30 }}
        monat={{ name: 'September', saldoMin: 60 }}
        fehlendeTage={[]}
        offeneAnforderungen={0}
        scheineAn
        materialAn
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('Monteur-Start', () => {
  it('zeigt höchstens vier Karten', () => {
    /*
      VIER STATT DREI seit dem Schreibtisch-Raster des Entwurfs (Mockup
      S. 7): „Nächste Einsätze“ kommt dazu, aus derselben Abfrage wie in
      „Mein Einsatzplan“. Solange sie nicht geladen sind, bleibt es bei drei.
    */
    const { container, unmount } = zeichne();
    expect(container.querySelectorAll('section')).toHaveLength(3);
    unmount();
    const mit = zeichne({ naechste: [] });
    expect(mit.container.querySelectorAll('section')).toHaveLength(4);
  });

  it('nennt Baustelle, Nummer und Aufgabe — und macht Adresse und Anruf zu Handgriffen', () => {
    zeichne();
    expect(screen.getByText('Max Musterkunde')).toBeInTheDocument();
    expect(screen.getByText('Rohr verlegen')).toBeInTheDocument();
    expect(screen.getByText(/PR-187/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ludersdorf 204/ })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps'),
    );
    expect(screen.getByRole('link', { name: /0660 6322503/ })).toHaveAttribute('href', 'tel:06606322503');
  });

  it('bietet „Wie zuletzt“ als Hauptknopf, wenn es dieselbe Baustelle ist', () => {
    zeichne();
    const knopf = screen.getByRole('link', { name: /Wie zuletzt buchen/ });
    expect(knopf).toHaveTextContent('07:00–16:00 · 30 min Pause · 08:30 Std');
    expect(knopf).toHaveAttribute('href', '/time');
    expect(screen.getByRole('link', { name: 'Andere Zeit' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Schein schreiben' })).toHaveAttribute(
      'href',
      '/worksheet?projekt=PR-187',
    );
  });

  it('bucht NIE die gestrige Baustelle auf den heutigen Einsatz', () => {
    zeichne({ letzte: { ...letzte, projectNumber: 'PR-100' } });
    expect(screen.queryByRole('link', { name: /Wie zuletzt/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zeit erfassen' })).toBeInTheDocument();
  });

  it('zeigt die Woche gegen das Soll und den Saldo des Monats', () => {
    zeichne();
    const woche = screen.getByText('Diese Woche').closest('section')!;
    expect(woche).toHaveTextContent('17:00 von 38:30 Std');
    expect(within(woche).getByText('Saldo September')).toBeInTheDocument();
    expect(within(woche).getByText('+01:00')).toBeInTheDocument();
  });

  it('stellt die Summe rechts in die Titelzeile der Karte', () => {
    zeichne();
    const kopf = screen.getByRole('heading', { name: 'Diese Woche' }).parentElement!;
    expect(kopf).toHaveTextContent('Diese Woche17:00 von 38:30 Std');
  });

  describe('die Balken je Tag', () => {
    const TAGE = [
      { datum: '2026-09-21', istMin: 510, sollMin: 462 },
      { datum: '2026-09-22', istMin: 231, sollMin: 462 },
      { datum: '2026-09-23', istMin: 0, sollMin: 462 },
      { datum: '2026-09-24', istMin: 0, sollMin: 462 },
      { datum: '2026-09-25', istMin: 0, sollMin: 462 },
    ];

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, 25, 7, 0, 0));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function balken() {
      zeichne({ woche: { istMin: 741, sollMin: 38 * 60 + 30, tage: TAGE } });
      return screen.getByRole('list', { name: 'Gebuchte Stunden je Tag' });
    }

    it('nennt jeden Tag Mo–Fr mit Text für die Vorlesehilfe', () => {
      const tage = within(balken()).getAllByRole('listitem');
      expect(tage).toHaveLength(5);
      expect(tage[0]).toHaveTextContent('Montag: 08:30 Std');
      expect(tage[1]).toHaveTextContent('Dienstag: 03:51 Std');
      expect(tage[2]).toHaveTextContent('Mittwoch: nichts gebucht');
      expect(tage[4]).toHaveTextContent('Freitag (heute): nichts gebucht');
    });

    it('misst die Höhe am Tagessoll — der längste Tag reicht bis oben', () => {
      const tage = within(balken()).getAllByRole('listitem');
      // Montag (08:30 über 07:42 Soll) ist der längste Tag; Dienstag hat die
      // Hälfte des Solls gebucht.
      expect(tage[0].querySelector<HTMLElement>('.woche-balken')!.style.height).toBe('100%');
      expect(tage[1].querySelector<HTMLElement>('.woche-balken')!.style.height).toBe('45%');
    });

    it('zeigt Tage ohne Buchung als flache Linie und heute als Rahmen in Sollhöhe', () => {
      const tage = within(balken()).getAllByRole('listitem');
      expect(tage[2].querySelector('.woche-leer')).not.toBeNull();
      expect(tage[2].querySelector('.woche-balken')).toBeNull();
      const rahmen = tage[4].querySelector<HTMLElement>('.woche-rahmen-heute')!;
      expect(rahmen.style.height).toBe('91%');
      expect(rahmen.querySelector('.woche-balken')).toBeNull();
      expect(tage[4].querySelector('.woche-tagname-heute')).toHaveTextContent('Fr');
    });
  });

  it('sagt ruhig „Alles erledigt“, wenn nichts offen ist', () => {
    zeichne();
    expect(screen.getByText('Alles erledigt.')).toBeInTheDocument();
  });

  it('nennt fehlende Tage mit Datum und angefordertes Material', () => {
    /*
      SEIT DER LINIE (docs/design/linie.md 3) ist die GANZE Zeile der Link,
      mit Pfeil — nicht mehr nur der unterstrichene Titel. Der Name des Links
      beginnt deshalb mit dem Titel und trägt die Unterzeile mit; geprüft
      werden Anfang und Ziel, genauso streng wie vorher.
    */
    zeichne({ fehlendeTage: ['2026-09-22', '2026-09-23'], offeneAnforderungen: 2 });
    const offen = screen.getByText('Offen für dich').closest('section')!;
    expect(within(offen).getByRole('link', { name: /^2 Tage ohne Buchung/ })).toHaveAttribute('href', '/time');
    expect(offen).toHaveTextContent(/22\.09\..*23\.09\./);
    expect(within(offen).getByRole('link', { name: /^Material angefordert/ })).toHaveAttribute('href', '/material');
  });

  it('macht jede Zeile unter „Offen für dich“ ganz zum Link, mit Pfeil und ohne Textlink im Titel', () => {
    zeichne({ fehlendeTage: ['2026-09-22'], offeneAnforderungen: 1 });
    const offen = screen.getByText('Offen für dich').closest('section')!;
    const zeilen = within(offen).getAllByRole('listitem');
    expect(zeilen).toHaveLength(2);
    for (const zeile of zeilen) {
      // Genau EIN Link je Zeile — die Zeile selbst —, der Titel darin ist
      // kein eigener, unterstrichener Textlink mehr.
      const links = within(zeile).getAllByRole('link');
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveClass('zeile-link');
      expect(links[0].querySelector('.textlink')).toBeNull();
      expect(links[0].querySelector('svg')).not.toBeNull();
    }
  });

  it('trägt keinen Kasten in der Karte — mehrere Einsätze trennt eine Haarlinie', () => {
    const { container } = zeichne({
      einsaetze: [einsatz, { ...einsatz, id: 'a2', projectNumber: 'PR-188', customerName: 'Familie Huber' }],
    });
    const karte = screen.getByText('Heute — 2 Baustellen').closest('section')!;
    expect(karte.querySelector('.kasten-hell, .kasten')).toBeNull();
    expect(karte.querySelectorAll('hr')).toHaveLength(1);
    expect(container.querySelectorAll('section section')).toHaveLength(0);
  });

  it('zeigt die Abrechnungsart nur, wenn sie bekannt ist — und erfindet keine Uhrzeit', () => {
    const { unmount } = zeichne({ einsaetze: [{ ...einsatz, billingMode: 'Regie' }] });
    const karte = screen.getByRole('heading', { name: 'Heute' }).closest('section')!;
    expect(within(karte).getByText('Regie')).toBeInTheDocument();
    expect(karte).not.toHaveTextContent(/Heute ab/);
    unmount();
    zeichne();
    const ohne = screen.getByRole('heading', { name: 'Heute' }).closest('section')!;
    expect(within(ohne).queryByText(/Regie|Pauschal/)).toBeNull();
  });

  it('nennt die nächsten Einsätze mit Datumskachel, Kunde · Nummer und Aufgabe · Adresse', () => {
    zeichne({
      naechste: [
        {
          id: 'n1',
          date: '2026-09-28',
          projectNumber: 'PR-2026-0004',
          customerName: 'Max Testkunde',
          comment: 'Montage Heizkörper',
          address: 'Alois-Köberl-Gasse 11',
          asHelper: false,
        },
        {
          id: 'n2',
          date: '2026-09-29',
          projectNumber: 'PR-187',
          customerName: 'Max Musterkunde',
          address: 'Ludersdorf 204',
          asHelper: true,
        },
      ],
    });
    const karte = screen.getByRole('heading', { name: 'Nächste Einsätze' }).closest('section')!;
    const zeilen = within(karte).getAllByRole('listitem');
    expect(zeilen[0]).toHaveTextContent('Max Testkunde · PR-2026-0004');
    expect(zeilen[0]).toHaveTextContent('Montage Heizkörper · Alois-Köberl-Gasse 11');
    expect(zeilen[0].querySelector('.datumskachel')).toHaveTextContent(/Mo.*28/);
    expect(within(zeilen[1]).getByText('Helfer')).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: 'Mein Einsatzplan' })).toHaveAttribute(
      'href',
      '/my-schedule',
    );
  });

  it('sagt ruhig, wenn nichts weiter eingeplant ist', () => {
    zeichne({ naechste: [] });
    expect(screen.getByText('Zurzeit ist nichts weiter eingeplant.')).toBeInTheDocument();
  });

  it('ohne Einsatz: eine ruhige Zeile und trotzdem der Hauptknopf', () => {
    zeichne({ einsaetze: [] });
    expect(screen.getByText('Heute ist kein Einsatz eingeplant.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Wie zuletzt buchen/ })).toBeInTheDocument();
  });
});
