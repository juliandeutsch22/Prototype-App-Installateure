/**
 * Das breitere Seitenfenster (Runde 4, „Person im Monat“, 480 px): eine
 * eigene Klasse, und ohne die Angabe bleibt jedes andere Fenster, wie es war.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import BottomSheet from '@/components/BottomSheet';

describe('BottomSheet breit', () => {
  it('ohne Angabe bleibt das Seitenfenster bei .fenster', () => {
    render(<BottomSheet open onClose={() => {}} label="x" auchBreit titel="T">Inhalt</BottomSheet>);
    expect(screen.getByRole('dialog').className).toMatch(/^fenster /);
  });

  it('mit `breit` trägt es .fenster-breit, ab Tablet 30rem', () => {
    render(<BottomSheet open onClose={() => {}} label="x" auchBreit breit titel="T">Inhalt</BottomSheet>);
    expect(screen.getByRole('dialog').className).toMatch(/^fenster-breit /);
    expect(readFileSync('src/styles/lot.css', 'utf8')).toMatch(/\.fenster-breit \{ left: auto; top: 0; width: 30rem;/);
  });

  it('am Handy ohne `auchBreit` bleibt es das Blatt, auch mit `breit`', () => {
    render(<BottomSheet open onClose={() => {}} label="x" breit>Inhalt</BottomSheet>);
    expect(screen.getByRole('dialog').className).toMatch(/^blatt /);
  });
});

/*
  DER KLEINE PLANKOPF EINES SEITENFENSTERS (Planlinie B10, E30): die Nummer
  steht als Stempel neben dem Titel — keine Skizze, keine Eckmarken; im
  Fenster gibt es keinen Akzent.
*/
describe('BottomSheet mit Nummernstempel', () => {
  it('der Stempel steht im Titel', () => {
    render(<BottomSheet open onClose={() => {}} label="Rechnung RE-1" auchBreit titel="Rechnung" stempel="RE-2026-1502">Inhalt</BottomSheet>);
    const titel = screen.getByRole('heading', { level: 2 });
    expect(titel).toHaveClass('fenster-titel');
    expect(titel.querySelector('.stempel')).toHaveTextContent('RE-2026-1502');
    expect(screen.getByRole('dialog').querySelector('.lot-skizze, .eckmarken')).toBeNull();
  });

  it('Gegenprobe: ohne Angabe kein Stempel', () => {
    render(<BottomSheet open onClose={() => {}} label="x" auchBreit titel="T">Inhalt</BottomSheet>);
    expect(screen.getByRole('heading', { level: 2 }).querySelector('.stempel')).toBeNull();
  });
});
