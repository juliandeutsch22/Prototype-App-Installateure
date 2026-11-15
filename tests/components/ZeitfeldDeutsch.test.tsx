import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InputField } from '@/components/Field';

/*
  U10, E5: auf einem englisch eingestellten Gerät zeigt das Feld 11/15/2026;
  darunter steht der Wert deutsch. Gegenprobe: auf einem deutschen Gerät
  keine zweite Zeile, bei einem Textfeld nie.
*/
function sprache(wert: string) {
  Object.defineProperty(window.navigator, 'language', { value: wert, configurable: true });
}
afterEach(() => sprache('de-AT'));

describe('InputField: Datum und Uhrzeit deutsch daneben', () => {
  it('englisches Gerät: TT.MM.JJJJ unter dem Datumsfeld, HH:MM unter dem Zeitfeld', () => {
    sprache('en-US');
    render(<>
      <InputField id="d" label="Von" type="date" value="2026-11-15" onChange={() => undefined} />
      <InputField id="t" label="Beginn" type="time" value="19:30" onChange={() => undefined} />
    </>);
    expect(screen.getByText('15.11.2026')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('19:30')).toHaveClass('feld-deutsch');
  });

  it('auch ein ungesteuertes Feld: die Zeile folgt der Eingabe', () => {
    sprache('en-US');
    render(<InputField id="d" label="Von" type="date" defaultValue="2026-11-15" />);
    expect(screen.getByText('15.11.2026')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Von'), { target: { value: '2026-12-24' } });
    expect(screen.getByText('24.12.2026')).toBeInTheDocument();
  });

  it('Gegenprobe: deutsches Gerät und Textfeld ohne zweite Zeile', () => {
    sprache('de-AT');
    const { container, rerender } = render(<InputField id="d" label="Von" type="date" value="2026-11-15" onChange={() => undefined} />);
    expect(container.querySelector('.feld-deutsch')).toBeNull();
    sprache('en-US');
    rerender(<InputField id="n" label="Name" value="2026-11-15" onChange={() => undefined} />);
    expect(container.querySelector('.feld-deutsch')).toBeNull();
  });
});
