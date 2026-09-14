/**
 * Die Meldung beim Anlegen eines Benutzers.
 *
 * WARUM DAS EINE PRÜFUNG BEKOMMT. „Der Benutzer konnte nicht angelegt
 * werden." stand bisher über jedem Fehlschlag. Das ist wahr und nutzlos: es
 * sagt nicht, ob die Adresse vergeben ist, ob der Anmeldedienst keine neuen
 * Konten annimmt oder ob das Mailkontingent erschöpft ist.
 *
 * Und die einzige Ausnahme, die je durchkam, suchte nach
 * `email-already-in-use` — einer FIREBASE-Schreibweise. Nach dem Umschalten
 * auf Postgres wäre selbst die vergebene Adresse unter der allgemeinen
 * Meldung verschwunden. Genau solche Zeilen überleben einen Umzug
 * stillschweigend, weil sie nur im Fehlerfall laufen.
 */
import { describe, it, expect } from 'vitest';
import { anlegeFehler } from '@/features/users/anlegeFehler';

describe('anlegeFehler', () => {
  it('erkennt die vergebene Adresse in beiden Schreibweisen', () => {
    expect(anlegeFehler(new Error('auth/email-already-in-use'), false))
      .toBe('Diese E-Mail ist bereits vergeben.');
    expect(anlegeFehler(new Error('User already registered'), false))
      .toBe('Diese E-Mail ist bereits vergeben.');
    expect(anlegeFehler(new Error('email address has already been registered'), false))
      .toBe('Diese E-Mail ist bereits vergeben.');
  });

  it('benennt abgeschaltete Anmeldungen als Projekteinstellung', () => {
    const m = anlegeFehler(new Error('Signups not allowed for this instance'), false);
    expect(m).toContain('keine neuen Konten');
    expect(m).toContain('Einstellung des Projekts');
  });

  it('benennt das erschöpfte Mailkontingent samt Wartezeit', () => {
    const m = anlegeFehler(new Error('email rate limit exceeded'), false);
    expect(m).toContain('Mailkontingent');
    expect(m).toContain('Stunde');
  });

  /*
    DER WICHTIGSTE FALL: eine Ursache, die niemand vorhergesehen hat. Sie
    darf nicht verschwinden — lieber eine technische Meldung als gar keine.
    Genau daran ist das Anlegen im echten Projekt gescheitert, und der
    Bildschirm sagte nichts.
  */
  it('reicht eine unbekannte Ursache im Klartext durch', () => {
    const m = anlegeFehler(new Error('Database error saving new user'), false);
    expect(m).toContain('Der Benutzer konnte nicht angelegt werden.');
    expect(m).toContain('Database error saving new user');
  });

  it('kommt auch ohne Meldung zurecht', () => {
    expect(anlegeFehler(new Error(''), false)).toBe('Der Benutzer konnte nicht angelegt werden.');
    expect(anlegeFehler('kein Fehlerobjekt', false))
      .toBe('Der Benutzer konnte nicht angelegt werden.');
  });

  it('unterscheidet die Änderung von der Neuanlage', () => {
    const m = anlegeFehler(new Error('irgendwas'), true);
    expect(m).toContain('Die Änderungen konnten nicht gespeichert werden.');
    expect(m).toContain('irgendwas');
  });

  /*
    Bei einer ÄNDERUNG gibt es kein neues Konto — die Anlage-Ursachen können
    dort nicht greifen, und eine Meldung über vergebene Adressen wäre eine
    falsche Fährte.
  */
  it('und greift bei einer Änderung nicht auf Anlage-Ursachen zurück', () => {
    const m = anlegeFehler(new Error('User already registered'), true);
    expect(m).toContain('Die Änderungen konnten nicht gespeichert werden.');
    expect(m).not.toBe('Diese E-Mail ist bereits vergeben.');
  });
});
