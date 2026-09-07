import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InputField, SelectField, Pflichthinweis } from '@/components/Field';

/**
 * Die Kennzeichnung der Pflichtfelder.
 *
 * AUS DEM BETRIEB: „bei allen Eingaben sollten Pflichtfelder gekennzeichnet
 * werden." Vorher erfuhr man erst nach dem Absenden, dass etwas fehlt — bei
 * acht Feldern heisst das: ausfüllen, abschicken, Meldung lesen, suchen.
 *
 * Die Kennzeichnung hat zwei Hälften, und beide werden hier geprüft: den
 * sichtbaren Stern und `aria-required` für die Sprachausgabe. Ein Stern
 * allein ist Farbe und Form — für einen Vorleser also nichts.
 */

describe('Ein Pflichtfeld', () => {
  it('trägt einen Stern', () => {
    const { container } = render(<InputField id="a" label="Von" pflicht />);
    expect(container.textContent).toContain('*');
  });

  it('sagt es auch der Sprachausgabe', () => {
    render(<InputField id="a" label="Von" pflicht />);
    expect(screen.getByLabelText('Von')).toHaveAttribute('aria-required', 'true');
  });

  /*
    DER STERN GEHÖRT NICHT IN DEN NAMEN DES FELDES. Stünde er im Label, hiesse
    das Feld „Von *" statt „Von" — und jede Suche danach müsste den Stern
    mitraten, in der App wie im Test. Genau daran sind beim Einbau fünfzehn
    bestehende Tests hängengeblieben.
  */
  it('heisst trotzdem nur „Von"', () => {
    render(<InputField id="a" label="Von" pflicht />);
    expect(screen.getByLabelText('Von')).toBeInTheDocument();
    expect(screen.queryByLabelText('Von *')).toBeNull();
  });

  it('gilt genauso für eine Auswahl', () => {
    render(
      <SelectField id="b" label="Kunde" pflicht>
        <option value="">— wählen —</option>
      </SelectField>,
    );
    expect(screen.getByLabelText('Kunde')).toHaveAttribute('aria-required', 'true');
  });
});

describe('Ein freiwilliges Feld', () => {
  it('bekommt keinen Stern', () => {
    const { container } = render(<InputField id="c" label="Hinweis" />);
    expect(container.textContent).not.toContain('*');
  });

  /*
    Und es behauptet auch nicht das Gegenteil: `aria-required="false"` wäre
    zwar zulässig, würde von manchen Vorlesern aber trotzdem erwähnt. Was
    freiwillig ist, sagt gar nichts.
  */
  it('und trägt gar kein aria-required', () => {
    render(<InputField id="c" label="Hinweis" />);
    expect(screen.getByLabelText('Hinweis')).not.toHaveAttribute('aria-required');
  });
});

describe('Der Hinweis unter dem Formular', () => {
  it('erklärt das Zeichen', () => {
    render(<Pflichthinweis />);
    expect(screen.getByText('Pflichtfeld')).toBeInTheDocument();
  });
});
