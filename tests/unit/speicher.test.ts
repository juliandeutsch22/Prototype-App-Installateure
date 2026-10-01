// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { schluesselUmziehen, benutzerSpurenLoeschen, istFirestoreRest } from '@/lib/speicher';

/**
 * Testbericht 30.09.2026, M9 — was im Browser liegen bleibt.
 *
 * Nach dem Abmelden lagen Profil, Firma und Warenkorb früherer Nutzer im
 * lokalen Speicher; die Schlüssel hiessen nach dem Pilotbetrieb („perl“).
 */
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('Die Schlüssel ziehen um', () => {
  it('„perl…“ wird „senklot…“, der Wert bleibt', () => {
    localStorage.setItem('perl.sitzung.u1', '{"profil":1}');
    localStorage.setItem('perl.sitzungMerken', 'nein');
    localStorage.setItem('perl_cart_v2:perl:u1', '[1]');
    localStorage.setItem('perl:hartErneuert', 'f1');
    sessionStorage.setItem('perl:aufraeumen', '1');

    schluesselUmziehen();

    expect(localStorage.getItem('senklot.sitzung.u1')).toBe('{"profil":1}');
    expect(localStorage.getItem('senklot.sitzungMerken')).toBe('nein');
    expect(localStorage.getItem('senklot.warenkorb:perl:u1')).toBe('[1]');
    expect(localStorage.getItem('senklot:hartErneuert')).toBe('f1');
    expect(sessionStorage.getItem('senklot:aufraeumen')).toBe('1');
    for (let i = 0; i < localStorage.length; i += 1) expect(localStorage.key(i)).not.toMatch(/^perl/);
  });

  it('ein schon vorhandener neuer Schlüssel gewinnt', () => {
    localStorage.setItem('senklot.sitzungMerken', 'ja');
    localStorage.setItem('perl.sitzungMerken', 'nein');
    schluesselUmziehen();
    expect(localStorage.getItem('senklot.sitzungMerken')).toBe('ja');
    expect(localStorage.getItem('perl.sitzungMerken')).toBeNull();
  });
});

describe('Beim Abmelden', () => {
  it('geht alles, was einem Nutzer gehört — auch das früherer Nutzer', () => {
    localStorage.setItem('senklot.sitzung.u1', 'a');
    localStorage.setItem('senklot.sitzung.vorgaenger', 'b');
    localStorage.setItem('senklot.letzteFirma.u1', 'perl');
    localStorage.setItem('senklot.warenkorb:perl:u1', '[1]');
    sessionStorage.setItem('senklot.einblick', 'f1');

    benutzerSpurenLoeschen();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.getItem('senklot.einblick')).toBeNull();
  });

  it('bleibt, was zum Gerät gehört', () => {
    localStorage.setItem('senklot.sitzungMerken', 'nein');
    localStorage.setItem('senklot:hartErneuert', 'f1');
    sessionStorage.setItem('senklot:aufraeumen', '1');

    benutzerSpurenLoeschen();

    expect(localStorage.getItem('senklot.sitzungMerken')).toBe('nein');
    expect(localStorage.getItem('senklot:hartErneuert')).toBe('f1');
    expect(sessionStorage.getItem('senklot:aufraeumen')).toBe('1');
  });
});

describe('Reste der Firestore-Zeit', () => {
  it('Firestore und die alte Anmeldung gehen — Firebase Messaging (Push) bleibt', () => {
    expect(istFirestoreRest('firestore/[DEFAULT]/installateur-demo/main')).toBe(true);
    expect(istFirestoreRest('firebaseLocalStorageDb')).toBe(true);
    expect(istFirestoreRest('firebase-messaging-database')).toBe(false);
    expect(istFirestoreRest('firebase-installations-database')).toBe(false);
    expect(istFirestoreRest('installateur-ausgangsfach')).toBe(false);
  });
});

/*
  Nachtest 01.10.2026, N7: nach dem Abmelden lagen noch
  `firestore_online_state_…` und `firestore_sequence_number_…` im Speicher.
  Das SDK lädt nicht mehr; es sind Reste der Firestore-Zeit.
*/
describe('Firestore-Reste im lokalen Speicher (N7)', () => {
  it('räumt die Schlüssel der alten Mehr-Tab-Abstimmung weg — Push und eigene Schlüssel bleiben', async () => {
    const { firestoreResteEntfernen } = await import('@/lib/speicher');
    localStorage.clear();
    localStorage.setItem('firestore_online_state_[DEFAULT]_perl-app', '{}');
    localStorage.setItem('firestore_sequence_number_[DEFAULT]_perl-app', '7');
    localStorage.setItem('firestore_clients_[DEFAULT]_perl-app_abc', '{}');
    localStorage.setItem('firebase:authUser:abc:[DEFAULT]', '{}');
    localStorage.setItem('senklot.angemeldetBleiben', 'ja');
    await firestoreResteEntfernen();
    expect(Object.keys(localStorage).sort()).toEqual(['senklot.angemeldetBleiben']);
  });
});
