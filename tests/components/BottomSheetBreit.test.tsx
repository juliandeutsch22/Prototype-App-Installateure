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
