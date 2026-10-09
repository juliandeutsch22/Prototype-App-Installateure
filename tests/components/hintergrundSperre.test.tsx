/**
 * DIE SEITE HINTER EINEM OVERLAY STEHT STILL (Rückmeldung 09.10.2026,
 * iPhone: im Blatt „Neuen Kunden anlegen“ scrollte die Seite dahinter).
 *
 * Geprüft wird die gemeinsame Sperre an `<html>` und `<body>`: an beim
 * Öffnen, aus erst nach dem letzten Overlay, die Werte von vorher zurück —
 * und dass ein ausgeblendetes Blatt die Seite nicht festhält.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import BottomSheet from '@/components/BottomSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import { offeneSperren } from '@/components/hintergrundSperre';

const html = () => document.documentElement.style.overflow;
const body = () => document.body.style.overflow;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
});

function Blatt({ offen, breit = true }: { offen: boolean; breit?: boolean }) {
  return (
    <BottomSheet open={offen} onClose={() => {}} label="Neuen Kunden anlegen" auchBreit={breit} titel="Neuen Kunden anlegen">
      <p>Formular</p>
    </BottomSheet>
  );
}

describe('Hintergrundsperre', () => {
  it('ein offenes Seitenfenster hält die Seite fest, geschlossen ist sie wieder frei', () => {
    const { rerender } = render(<Blatt offen={false} />);
    expect(html()).toBe('');
    rerender(<Blatt offen />);
    expect(html()).toBe('hidden');
    // Nicht an `body`: es ist `height: 100%`, die Seite spränge nach oben.
    expect(body()).toBe('');
    rerender(<Blatt offen={false} />);
    expect(html()).toBe('');
    expect(offeneSperren()).toBe(0);
  });

  it('zwei Overlays übereinander: erst das letzte gibt die Seite frei', () => {
    const { rerender } = render(
      <>
        <Blatt offen />
        <ConfirmDialog open title="Löschen?" onConfirm={() => {}} onCancel={() => {}} />
      </>,
    );
    expect(offeneSperren()).toBe(2);
    rerender(
      <>
        <Blatt offen />
        <ConfirmDialog open={false} title="Löschen?" onConfirm={() => {}} onCancel={() => {}} />
      </>,
    );
    // Die Rückfrage ist zu, das Seitenfenster noch offen: die Seite bleibt fest.
    expect(html()).toBe('hidden');
    rerender(
      <>
        <Blatt offen={false} />
        <ConfirmDialog open={false} title="Löschen?" onConfirm={() => {}} onCancel={() => {}} />
      </>,
    );
    expect(html()).toBe('');
  });

  it('Werte, die vorher an der Seite standen, kommen zurück', () => {
    document.documentElement.style.overflow = 'scroll';
    const { unmount } = render(<Blatt offen />);
    expect(html()).toBe('hidden');
    unmount();
    expect(html()).toBe('scroll');
  });

  it('am Schreibtisch hält ein Abstand die Breite der verschwundenen Bildlaufleiste', () => {
    const html = document.documentElement;
    const breite = vi.spyOn(html, 'clientWidth', 'get').mockReturnValue(window.innerWidth - 15);
    const { unmount } = render(<Blatt offen />);
    expect(document.body.style.paddingRight).toBe('15px');
    unmount();
    expect(document.body.style.paddingRight).toBe('');
    // Gegenprobe: ohne Leiste (Handy, Überlagerungs-Leisten) kein Abstand.
    breite.mockReturnValue(window.innerWidth);
    render(<Blatt offen />);
    expect(document.body.style.paddingRight).toBe('');
    breite.mockRestore();
  });

  it('Gegenprobe: das „Mehr“-Blatt (nur am Handy) hält ab Tablet-Breite nichts fest', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q === '(min-width: 760px)', media: q,
      addEventListener: () => {}, removeEventListener: () => {},
    }));
    render(<Blatt offen breit={false} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(html()).toBe('');
    cleanup();
    vi.unstubAllGlobals();
    // Am Handy (ohne Medienabfrage, wie in jsdom) dasselbe Blatt: fest.
    render(<Blatt offen breit={false} />);
    expect(html()).toBe('hidden');
  });

  it('die Listen in Blatt, Seitenfenster, Suche und Vorschau reichen das Wischen nicht an die Seite weiter', () => {
    const lot = readFileSync('src/styles/lot.css', 'utf8');
    for (const k of ['blatt-inhalt', 'fenster-inhalt', 'such-liste']) {
      expect(lot).toMatch(new RegExp(`\\.${k} \\{[^}]*overscroll-behavior: contain`));
    }
    expect(readFileSync('src/styles/lot-monat.css', 'utf8')).toMatch(/\.vorschau-inhalt \{[^}]*overscroll-behavior: contain/);
  });
});

/*
  RÜCKMELDUNG 09.10.2026, iPhone, Inventur im Lager: hinter der Rückfrage
  rollte die Seite weiter — `overflow: hidden` allein hält sie dort nicht.
  Ein Wischen, unter dem nichts selbst rollen kann, bricht ab.
*/
describe('Wischen hinter einem Overlay', () => {
  const wisch = (ziel: Element, finger = 1) => {
    const e = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'touches', { value: Array.from({ length: finger }, () => ({})) });
    ziel.dispatchEvent(e);
    return e.defaultPrevented;
  };

  function Inventur({ offen }: { offen: boolean }) {
    return (
      <ConfirmDialog open={offen} title="Inventur: Rohr" onConfirm={() => {}} onCancel={() => {}}>
        <input aria-label="Gezählter Bestand" />
        <div data-testid="liste" style={{ overflowY: 'auto' }}>
          <p>Bewegung</p>
        </div>
      </ConfirmDialog>
    );
  }

  it('bricht auf der Rückfrage ab, wo nichts rollen kann', () => {
    render(<Inventur offen />);
    expect(wisch(screen.getByText('Inventur: Rohr'))).toBe(true);
    expect(wisch(document.body)).toBe(true);
  });

  it('lässt rollen, was selbst rollen kann, und lässt Felder und zwei Finger in Ruhe', () => {
    render(<Inventur offen />);
    const liste = screen.getByTestId('liste');
    // Ohne Überlauf rollt die Liste nicht — dann bricht auch sie ab.
    expect(wisch(screen.getByText('Bewegung'))).toBe(true);
    Object.defineProperty(liste, 'scrollHeight', { value: 400 });
    Object.defineProperty(liste, 'clientHeight', { value: 100 });
    expect(wisch(screen.getByText('Bewegung'))).toBe(false);
    expect(wisch(screen.getByLabelText('Gezählter Bestand'))).toBe(false);
    expect(wisch(screen.getByText('Inventur: Rohr'), 2)).toBe(false);
  });

  it('Gegenprobe: ohne Overlay bleibt jedes Wischen, wie es ist', () => {
    const { rerender } = render(<Inventur offen />);
    rerender(<Inventur offen={false} />);
    expect(offeneSperren()).toBe(0);
    expect(wisch(document.body)).toBe(false);
  });
});
