import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormGrid, InputField, SelectField } from '@/components/Field';
import EinstufungFelder from '@/features/users/EinstufungFelder';
import { TERMIN_ARTEN } from '@/types';
import { artName } from '@/features/termine/terminText';
import type { BenutzerEntwurf } from '@/features/users/benutzerEntwurf';

/**
 * ABGESCHNITTENE AUSWAHLFELDER IN HALBER BREITE (Testbericht Runde 6, G14).
 *
 * Optionen brechen nicht um. In der halben Spalte eines `FormGrid` stand
 * „Tagesgrenze (Überstunden j…“ (Einstellungen › Personal), „Nicht festgelegt
 * (zählt wie Fa…“ (Benutzer anlegen) und im Termin „Baustellenbesp…“. Die
 * Ursache war der gemeinsame Baustein: das Raster gab jeder Auswahl eine
 * halbe Zeile. Jetzt nimmt eine Auswahl mit langen Optionen die ganze Zeile;
 * kurze bleiben, wie sie waren. jsdom rechnet kein Layout — geprüft wird die
 * Klasse, die das Raster liest, und dass das Raster sie liest.
 *
 * Gegenprobe: ohne `feld-breit` in `SelectField` und ohne die Regel im
 * `FormGrid` schlagen die ersten vier fehl; „kurze Optionen“ hält fest, was
 * gleich bleibt.
 */

const raster = (kind: React.ReactNode) => render(<FormGrid>{kind}</FormGrid>).container.firstElementChild!;

describe('Auswahlfelder in einem Formularraster (Runde 6, G14)', () => {
  it('das Raster gibt einer breiten Auswahl die ganze Zeile', () => {
    expect(raster(<span />).className).toContain('[&>.feld-breit]:col-span-full');
  });

  it('eine Auswahl mit langer Option ist breit — entschieden an der längsten, nicht an der gewählten', () => {
    raster(
      <SelectField id="modell" label="Überstunden" value="zeitkonto" onChange={() => {}}>
        <option value="kurz">Zeitkonto</option>
        <option value="lang">Tagesgrenze (Überstunden je Tag)</option>
      </SelectField>,
    );
    expect(screen.getByLabelText('Überstunden').closest('.feld-breit')).not.toBeNull();
  });

  it('auch in Gruppen und aus Listen', () => {
    const namen = ['Kundentermin', 'Baustellenbesprechung'];
    raster(
      <SelectField id="art" label="Art" value="" onChange={() => {}}>
        <optgroup label="Termine">
          {namen.map((n) => <option key={n} value={n}>{n}</option>)}
        </optgroup>
      </SelectField>,
    );
    expect(screen.getByLabelText('Art').closest('.feld-breit')).not.toBeNull();
  });

  it('die gemeldete Stelle „Benutzer anlegen“: die Einstufung', () => {
    const form = { einstufung: '', lehrbeginn: '', lehrzeitMonate: '' } as unknown as BenutzerEntwurf;
    render(<EinstufungFelder form={form} setForm={() => {}} idPrefix="neu" />);
    expect(screen.getByLabelText('Einstufung').closest('.feld-breit')).not.toBeNull();
  });

  it('die Art eines Termins mit ihren echten Namen (im Seitenfenster 190 px halb)', () => {
    raster(
      <SelectField id="termin-art" label="Art" value="" onChange={() => {}}>
        {TERMIN_ARTEN.map((a) => <option key={a} value={a}>{artName(a)}</option>)}
      </SelectField>,
    );
    expect(screen.getByLabelText('Art').closest('.feld-breit')).not.toBeNull();
  });

  it('gleich geblieben: kurze Optionen stehen weiter in der halben Zeile', () => {
    raster(
      <SelectField id="mwst" label="USt" value="20" onChange={() => {}}>
        <option value="20">20 %</option>
        <option value="10">10 %</option>
        <option value="13">13 %</option>
      </SelectField>,
    );
    expect(screen.getByLabelText('USt').closest('.feld-breit')).toBeNull();
  });
});

/*
  DAS FEHLERHAFTE FELD IST ZU SEHEN (Runde 6, G14): `aria-invalid` stand an
  mehreren Feldern, gezeichnet wurde es nie. Gegenprobe: ohne die Klasse im
  Grundbaustein fehlt der rote Rand.
*/
describe('Ein fehlerhaftes Feld ist markiert', () => {
  it('Eingabe und Auswahl tragen den roten Rand für aria-invalid', () => {
    render(
      <>
        <InputField id="a" label="Montag (Std.)" aria-invalid />
        <SelectField id="b" label="Stand" aria-invalid onChange={() => {}}><option>x</option></SelectField>
      </>,
    );
    expect(screen.getByLabelText('Montag (Std.)').className).toContain('aria-[invalid=true]:border-danger');
    expect(screen.getByLabelText('Stand').className).toContain('aria-[invalid=true]:border-danger');
  });
});
