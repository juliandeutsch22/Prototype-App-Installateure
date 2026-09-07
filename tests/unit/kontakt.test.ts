import { describe, it, expect } from 'vitest';
import { mapsUrl, telUrl, mailUrl } from '@/lib/kontakt';

/**
 * Adresse, Nummer und Mail als Handgriff.
 *
 * Die Regeln stehen bewusst ohne React in `lib/kontakt.ts` — „so sind sie
 * auch ohne gerendertes Bauteil prüfbar" heisst es dort. Geprüft waren sie
 * bis jetzt trotzdem nicht; die Ansichtstests sehen nur, DASS ein Link
 * entsteht, nicht wohin er führt.
 *
 * Alle drei arbeiten an Freitext aus den Stammdaten. Dort steht, was jemand
 * getippt oder aus einer Mail kopiert hat — nicht, was ein Schema vorsieht.
 */

describe('mapsUrl', () => {
  it('sucht die Adresse, statt eine Koordinate zu behaupten', () => {
    // Die Adressen sind mal vollständig, mal „Hauptstraße 12, Wiener
    // Neustadt". Die Suche kommt damit zurecht, eine Koordinatenabfrage nicht.
    expect(mapsUrl('Hauptstraße 12, 2700 Wiener Neustadt')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Hauptstra%C3%9Fe%2012%2C%202700%20Wiener%20Neustadt',
    );
  });

  it('kodiert, was sonst die Adresse zerreissen würde', () => {
    expect(mapsUrl('Bahngasse 8/2')).toContain('Bahngasse%208%2F2');
  });
});

describe('telUrl', () => {
  it('macht aus einer getippten Nummer eine wählbare', () => {
    // So stehen Nummern in der Praxis in den Stammdaten.
    expect(telUrl('0664 123 45 67')).toBe('tel:06641234567');
    expect(telUrl('+43 (0)2622/12345')).toBe('tel:+430262212345');
  });

  it('behält ein führendes Plus — und wirft ein mittendrin weg', () => {
    /*
      Ein Plus MITTEN in der Nummer ist ein Tippfehler. Bliebe es stehen,
      scheiterte der Anruf wortlos: das Telefon wählt und kommt nirgends an.
    */
    expect(telUrl('+43 664 1234567')).toBe('tel:+436641234567');
    expect(telUrl('0664+1234567')).toBe('tel:06641234567');
  });
});

describe('mailUrl', () => {
  it('macht aus der Adresse einen Empfänger', () => {
    expect(mailUrl('office@hv-nord.at')).toBe('mailto:office@hv-nord.at');
    expect(mailUrl('  office@hv-nord.at  ')).toBe('mailto:office@hv-nord.at');
  });

  it('holt die Adresse aus einer kopierten Zeile heraus', () => {
    // Genau so landet sie im Feld, wenn jemand sie aus einer Mail kopiert.
    expect(mailUrl('Max Muster <max@example.at>')).toBe('mailto:max@example.at');
  });

  it('gibt null zurück, wo keine Adresse steht', () => {
    /*
      Ein `mailto:` auf einen Nicht-Wert wäre schlimmer als kein Link: es
      sieht aus wie ein Handgriff und öffnet ein leeres Mailfenster. Die
      Ansicht zeigt den Text dann als Text.
    */
    expect(mailUrl('bitte im Büro erfragen')).toBeNull();
    expect(mailUrl('max@example')).toBeNull();
    expect(mailUrl('')).toBeNull();
  });
});
