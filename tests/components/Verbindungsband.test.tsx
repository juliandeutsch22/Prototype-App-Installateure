import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Verbindungsband from '@/components/Verbindungsband';
import { meldeVerbindung, verbindungZuruecksetzen } from '@/lib/liveVerbindung';

/**
 * Das Band über dem Inhalt — und vor allem: wann es NICHT da ist.
 *
 * DER GEMELDETE FEHLER. Ein kurzer Wechsel in einen anderen Browser-Tab
 * setzte einen roten Kasten „Das hat nicht geklappt", der die Liste ERSETZTE
 * und bis zum Neuladen stand. Die Aussage stimmte sogar — die Live-Verbindung
 * war weg —, nur war sie zu diesem Zeitpunkt längst überholt, sah aus wie ein
 * Ausfall und nahm die Daten mit, die noch völlig in Ordnung waren.
 *
 * Drei Dinge müssen deshalb zutreffen, und jedes davon steht unten:
 * das Band schweigt ohne Anlass, es nimmt sich von selbst zurück, und es
 * sieht nicht nach einem Ausfall aus.
 */

function netz(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

beforeEach(() => {
  verbindungZuruecksetzen();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('Das Verbindungsband', () => {
  it('ist nicht da, solange alles steht', () => {
    render(<Verbindungsband />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('meldet den fehlenden Empfang — mit dem Versprechen, das die App hält', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    render(<Verbindungsband />);

    expect(screen.getByRole('status')).toHaveTextContent(/Keine Verbindung/);
    expect(screen.getByRole('status')).toHaveTextContent(/automatisch gesendet/);
  });

  it('meldet eine abgerissene Live-Verbindung — ohne Tabellennamen und ohne Zustandscode', () => {
    /*
      Vorher stand dort „Die Live-Verbindung für time_entries steht nicht
      (CLOSED)". Beides ist Innenleben: ein Tabellenname und ein
      Zustandscode. Wer das liest, weiss nicht mehr als vorher — und hält es
      für einen Defekt.
    */
    render(<Verbindungsband />);
    act(() => meldeVerbindung('zeiten', false));

    const band = screen.getByRole('status');
    expect(band).toHaveTextContent('Die Anzeige aktualisiert sich gerade nicht von selbst.');
    expect(band.textContent).not.toMatch(/time_entries|CLOSED|Fehler|geklappt/);
  });

  it('verschwindet wieder, sobald die Verbindung zurück ist', () => {
    // DER KERN DES GEMELDETEN FEHLERS: der alte Hinweis konnte das nicht.
    render(<Verbindungsband />);
    act(() => meldeVerbindung('zeiten', false));
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => meldeVerbindung('zeiten', true));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('bietet einen Ausweg an', () => {
    render(<Verbindungsband />);
    act(() => meldeVerbindung('zeiten', false));

    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeInTheDocument();
  });

  it('sieht nicht nach einem Ausfall aus — `status`, nicht `alert`, und nicht rot', () => {
    /*
      `alert` unterbricht den Vorleser mitten im Satz und ist der Meldung
      vorbehalten, die jemanden von etwas anderem wegholt. Hier ist nichts
      kaputt: die Zahlen auf dem Schirm stimmen, sie sind nur womöglich nicht
      die neuesten.
    */
    render(<Verbindungsband />);
    act(() => meldeVerbindung('zeiten', false));

    expect(screen.queryByRole('alert')).toBeNull();
    const band = screen.getByRole('status');
    expect(band.className).toContain('warning');
    expect(band.className).not.toContain('danger');
  });

  it('sagt bei fehlendem Empfang NUR das — nicht beides übereinander', () => {
    /*
      Ohne Netz steht auch die Live-Verbindung nicht. Zwei Bänder
      untereinander sagten dasselbe zweimal, und das zweite erklärte das
      erste nicht, sondern verdoppelte es.
    */
    render(<Verbindungsband />);
    act(() => meldeVerbindung('zeiten', false));
    act(() => netz(false));

    const baender = screen.getAllByRole('status');
    expect(baender).toHaveLength(1);
    expect(baender[0]).toHaveTextContent(/automatisch gesendet/);
    expect(baender[0].textContent).not.toMatch(/aktualisiert sich/);
  });

  it('zeigt einen Abriss, der VOR dem Zeichnen passiert ist', () => {
    /*
      GEMESSEN, NICHT VERMUTET: der Zustand lebt im Modul und ändert sich
      auch dann, wenn das Band gerade nicht auf dem Schirm ist — etwa beim
      Wechsel der Ansicht. Ein Band, das nur auf ÄNDERUNGEN horcht, bliebe in
      genau diesem Fall stumm, und zwar dauerhaft.
    */
    meldeVerbindung('zeiten', false);
    render(<Verbindungsband />);

    expect(screen.getByRole('status')).toHaveTextContent(/aktualisiert sich/);
  });
});
