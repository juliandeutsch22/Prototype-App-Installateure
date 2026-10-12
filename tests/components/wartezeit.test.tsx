import { describe, it, expect } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';

/**
 * Die Wartezeit der Abfragen (`tests/components/setup.ts`). Gegenprobe: mit
 * der Vorgabe von einer Sekunde findet `findByText` den Text nicht, der nach
 * 1,5 s erscheint — so langsam war die CI, als #296 stehen blieb.
 */
function Spaet() {
  const [da, setDa] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDa(true), 1500);
    return () => clearTimeout(t);
  }, []);
  return <p>{da ? 'angekommen' : 'lädt'}</p>;
}

describe('Wartezeit der Ansichtstests', () => {
  it('wartet länger als eine Sekunde — wie ein langsamer CI-Lauf', async () => {
    render(<Spaet />);
    expect(await screen.findByText('angekommen')).toBeInTheDocument();
  });
});
