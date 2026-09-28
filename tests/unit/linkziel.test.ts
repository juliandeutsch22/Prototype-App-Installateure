import { describe, it, expect } from 'vitest';
import { darfZiel, pfadVon } from '../links/linkziel';

/**
 * Die Regel hinter der Linkprüfung (offene Punkte C1). Sie selbst wird hier
 * geprüft, damit ein grüner Lauf im Browser nicht nur heisst, dass die Regel
 * alles durchwinkt.
 */
describe('Wohin ein Link zeigt', () => {
  it('nimmt Suche, Anker und abschliessenden Schrägstrich weg', () => {
    expect(pfadVon('/invoices?suche=RE-1#oben')).toBe('/invoices');
    expect(pfadVon('/customers/k1/')).toBe('/customers/k1');
    expect(pfadVon('/')).toBe('/');
  });
});

describe('Ob die Rolle dorthin darf', () => {
  it('der Monteur nicht zu den Rechnungen — Gegenprobe: die Buchhaltung schon', () => {
    expect(darfZiel('Mitarbeiter', '/invoices').ok).toBe(false);
    expect(darfZiel('Buchhaltung', '/invoices?suche=RE-2026-0001').ok).toBe(true);
  });

  it('eine Akte hängt an ihrer Liste', () => {
    expect(darfZiel('Buchhaltung', '/customers/k1').ok).toBe(true);
    expect(darfZiel('Mitarbeiter', '/customers/k1').ok).toBe(false);
    expect(darfZiel('Projektleiter', '/admin-projects/p1').ok).toBe(true);
    expect(darfZiel('Buchhaltung', '/admin-projects/p1').ok).toBe(false);
  });

  it('der einzelne Schein folgt den Schreibrollen, nicht der Liste', () => {
    expect(darfZiel('Mitarbeiter', '/worksheet?datum=2026-09-28').ok).toBe(true);
    // Die Buchhaltung sieht die Liste, schreibt aber keinen Schein (P4-04).
    expect(darfZiel('Buchhaltung', '/worksheets').ok).toBe(true);
    expect(darfZiel('Buchhaltung', '/worksheet').ok).toBe(false);
  });

  it('ein abgeschaltetes Modul sperrt auch den Link', () => {
    expect(darfZiel('Administrator', '/invoices', { rechnungen: false, nachkalkulation: false }).ok).toBe(false);
    expect(darfZiel('Administrator', '/invoices').ok).toBe(true);
  });

  it('alte Pfade gelten mit ihrem heutigen Ziel', () => {
    expect(darfZiel('Mitarbeiter', '/order').ok).toBe(true);
    expect(darfZiel('Mitarbeiter', '/admin-orders').ok).toBe(false);
  });

  it('öffentliche Seiten und fremde Adressen sind nie ein Befund', () => {
    expect(darfZiel('Mitarbeiter', '/datenschutz').ok).toBe(true);
    expect(darfZiel('Mitarbeiter', 'tel:+43123').ok).toBe(true);
    expect(darfZiel('Mitarbeiter', 'https://www.bmd.com').ok).toBe(true);
  });

  it('ein unbekannter Pfad ist ein Befund — die App schickte ihn auf die Startseite', () => {
    const u = darfZiel('Administrator', '/rechnungen');
    expect(u.ok).toBe(false);
    expect(!u.ok && u.grund).toMatch(/unbekannter Pfad/);
  });

  it('„/" deckt keine Unterseite zu', () => {
    // Sonst wäre jeder Tippfehler über die Startseite „erlaubt".
    expect(darfZiel('Mitarbeiter', '/gibtsnicht').ok).toBe(false);
  });
});
