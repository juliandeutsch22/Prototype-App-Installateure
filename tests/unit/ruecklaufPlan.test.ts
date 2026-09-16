/**
 * Was der Rücklauf aus einer Sicherungsdatei liest — bevor er irgendetwas
 * schreibt.
 *
 * WARUM DAS DIE WICHTIGSTE PRÜFUNG DES RÜCKLAUFS IST. Danach wird in eine
 * Datenbank geschrieben, und eine halb eingelesene Sicherung ist schlimmer
 * als gar keine: sie sieht aus wie ein Wiederanlauf und ist ein Datensalat.
 * Alles, was sich VOR dem ersten Schreibvorgang abweisen lässt, muss hier
 * abgewiesen werden.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — Werkzeug des Betriebs, bewusst als .mjs ohne Typen.
import { standLesen, betriebAusStand, kontenAusStand } from '../../scripts/ruecklaufPlan.mjs';

const zeile = (sammlung: string, daten: Record<string, unknown>) =>
  `${JSON.stringify({ sammlung, daten })}\n`;

const STAND =
  zeile('companies', { id: 'perl', name: 'Perl Installationen' }) +
  zeile('users', { id: 'u1', company_id: 'perl', email: 'chef@perl.at', role: 'Geschäftsführung', active: true }) +
  zeile('users', { id: 'u2', company_id: 'perl', email: 'max@perl.at', role: 'Mitarbeiter', active: false }) +
  zeile('customers', { id: 'k1', company_id: 'perl', name: 'Familie Huber' });

describe('Die Sicherungsdatei lesen', () => {
  it('sortiert die Zeilen nach Tabelle', () => {
    const { sammlungen, fehler } = standLesen(STAND);
    expect(fehler).toEqual([]);
    expect([...sammlungen.keys()].sort()).toEqual(['companies', 'customers', 'users']);
    expect(sammlungen.get('users')).toHaveLength(2);
  });

  it('überspringt eine kaputte Zeile NICHT, sondern meldet sie', () => {
    /*
      DER PUNKT. Überspringen hiesse, aus einer beschädigten Datei still
      einen unvollständigen Betrieb zu bauen — und niemand wüsste, was
      fehlt. Genau das ist der Fehler, den man erst Monate später bemerkt.
    */
    const kaputt = STAND + 'das ist kein JSON\n' + zeile('customers', { id: 'k2', company_id: 'perl' });
    const { sammlungen, fehler } = standLesen(kaputt);

    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toMatch(/Zeile 5/);
    // Und die heilen Zeilen danach gehen nicht verloren — der Befund soll
    // vollständig sein, nicht beim ersten Fehler abbrechen.
    expect(sammlungen.get('customers')).toHaveLength(2);
  });

  it('meldet auch eine Zeile ohne Tabellennamen oder ohne Datensatz', () => {
    const { fehler } = standLesen(
      '{"daten":{"id":"x"}}\n' +
      '{"sammlung":"users"}\n' +
      '{"sammlung":"users","daten":[1,2]}\n',
    );
    expect(fehler).toHaveLength(3);
  });

  it('stört sich nicht an Leerzeilen', () => {
    const { fehler, sammlungen } = standLesen(`\n${STAND}\n\n`);
    expect(fehler).toEqual([]);
    expect(sammlungen.get('companies')).toHaveLength(1);
  });
});

describe('Zu welchem Betrieb der Stand gehört', () => {
  it('nennt ihn', () => {
    expect(betriebAusStand(standLesen(STAND).sammlungen)).toBe('perl');
  });

  it('weist eine Datei OHNE Firmenzeile ab', () => {
    /*
      An der Firma hängen Stundensätze und Steuersatz. Ein Wiederanlauf ohne
      sie rechnet ab dem ersten Tag falsch, und zwar unauffällig — der
      teuerste Fehler dieser ganzen Kette.
    */
    const ohne = zeile('users', { id: 'u1', company_id: 'perl', email: 'a@b.at', role: 'Mitarbeiter' });
    expect(() => betriebAusStand(standLesen(ohne).sammlungen)).toThrow(/companies/);
  });

  it('weist eine Datei mit ZWEI Betrieben ab', () => {
    // Die Ausleitung schreibt je Betrieb eine Datei. Kämen hier zwei vor,
    // wäre die Datei zusammengestückelt oder der Export kaputt.
    const zwei = STAND + zeile('companies', { id: 'mustermann', name: 'Anderer' });
    expect(() => betriebAusStand(standLesen(zwei).sammlungen)).toThrow(/zu genau einem/);
  });

  it('weist eine eingeschmuggelte fremde Zeile ab', () => {
    /*
      Der stillere der beiden Fälle: die Firmenzeile stimmt, aber irgendwo
      dazwischen steht eine Zeile eines ANDEREN Betriebs. In eine fremde
      Datenbank gekippt liesse sie sich nicht mehr auseinandersortieren.
    */
    const gemischt = STAND + zeile('customers', { id: 'k9', company_id: 'mustermann', name: 'Fremd' });
    expect(() => betriebAusStand(standLesen(gemischt).sammlungen)).toThrow(/mustermann/);
  });
});

describe('Die Anmeldekonten, die neu gebaut werden müssen', () => {
  it('baut sie aus den Profilen — unter derselben Kennung', () => {
    /*
      `public.users.id` verweist auf `auth.users(id)`. Die Anmeldekonten
      tragen kein `company_id` und stehen deshalb NICHT in der Sicherung.
      Ohne sie lässt sich keine einzige Profilzeile einfügen. Sie werden
      unter derselben Kennung neu gebaut — damit lösen sich alle
      Fremdschlüssel der Sicherung wieder auf.
    */
    const konten = kontenAusStand(standLesen(STAND).sammlungen);
    expect(konten).toEqual([
      { id: 'u1', email: 'chef@perl.at' },
      { id: 'u2', email: 'max@perl.at' },
    ]);
  });

  it('nimmt NUR Kennung und Adresse — keine Ansprüche', () => {
    /*
      Erst stand hier auch `{ company_id, role, active }`. Der Auslöser
      `users_ansprueche` setzt das aber selbst, sobald die Profilzeile
      eingefügt wird, und sperrt ein inaktives Konto gleich mit. Zwei Quellen
      für dieselbe Wahrheit laufen auseinander — und diese hier wäre die
      schlechtere gewesen, weil sie einer Datei glaubt statt der Datenbank.

      Aufgefallen an einer Mutation, die überlebt hat: die Ansprüche
      wegzulassen änderte am Ergebnis nichts. Das war kein Loch in der
      Prüfung, sondern eine Antwort.
    */
    const konten = kontenAusStand(standLesen(STAND).sammlungen);
    for (const k of konten) expect(Object.keys(k).sort()).toEqual(['email', 'id']);
  });

  it('kommt ohne Benutzer zurecht', () => {
    const nurFirma = zeile('companies', { id: 'perl', name: 'Perl' });
    expect(kontenAusStand(standLesen(nurFirma).sammlungen)).toEqual([]);
  });
});
