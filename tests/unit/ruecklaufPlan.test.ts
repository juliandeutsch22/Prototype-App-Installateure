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
import { standLesen, staendeLesen, betriebAusStand, kontenAusStand, entfernteAussondern } from '../../scripts/ruecklaufPlan.mjs';
import { inTeilen } from '@shared/ausleitungPlan';

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

describe('Tabellen, die es nicht mehr gibt', () => {
  it('übergeht die Wiedervorlagen einer alten Sicherung und nennt sie', () => {
    const { sammlungen } = standLesen(
      STAND + zeile('follow_ups', { id: 'f1', company_id: 'perl', title: 'Rückruf' }),
    );
    const uebergangen = entfernteAussondern(sammlungen);
    expect(uebergangen).toEqual([
      expect.objectContaining({ tabelle: 'follow_ups', zeilen: 1 }),
    ]);
    expect(sammlungen.has('follow_ups')).toBe(false);
    // Der Rest bleibt unberührt.
    expect(sammlungen.get('customers')).toHaveLength(1);
  });

  it('Gegenprobe: eine unbekannte Tabelle bleibt drin — dort passt die Datei nicht', () => {
    const { sammlungen } = standLesen(STAND + zeile('gibt_es_nicht', { id: 'x', company_id: 'perl' }));
    expect(entfernteAussondern(sammlungen)).toEqual([]);
    expect(sammlungen.has('gibt_es_nicht')).toBe(true);
  });
});

describe('Ein Stand in Teilen (10.10.2026)', () => {
  /** STAND so, wie die Ausleitung ihn in Teile schreibt — zu je höchstens `grenze` Zeichen. */
  async function inTeileGeschrieben(lauf: string, grenze: number) {
    const teile: Array<{ name: string; text: string }> = [];
    const stand = inTeilen(lauf, grenze, async (text: string, nr: number) => {
      teile.push({ name: nr === 1 ? 'stand.jsonl' : `stand.${lauf}.teil-${nr}.jsonl`, text });
    });
    for (const z of STAND.split('\n').filter(Boolean)) await stand.anhaengen(`${z}\n`);
    await stand.abschliessen();
    return teile;
  }
  const alsText = (m: Map<string, unknown[]>) => JSON.stringify([...m].sort());

  it('setzt die Teile in beliebiger Reihenfolge zum selben Stand zusammen wie eine Datei', async () => {
    const teile = await inTeileGeschrieben('l1', 120);
    expect(teile.length).toBeGreaterThan(2);
    const { sammlungen, fehler } = staendeLesen([...teile].reverse());
    expect(fehler).toEqual([]);
    expect(alsText(sammlungen)).toBe(alsText(standLesen(STAND).sammlungen));
    expect(sammlungen.has('_teil')).toBe(false);
    expect(betriebAusStand(sammlungen)).toBe('perl');
  });

  it('eine Sicherung von vorher, ohne Kopfzeile, liest sich wie bisher', () => {
    const { sammlungen, fehler } = staendeLesen([{ name: 'alt.jsonl', text: STAND }]);
    expect(fehler).toEqual([]);
    expect(alsText(sammlungen)).toBe(alsText(standLesen(STAND).sammlungen));
  });

  it('ein Stand in einem Teil, mit Kopfzeile, ebenso', async () => {
    const teile = await inTeileGeschrieben('l1', 1_000_000);
    expect(teile).toHaveLength(1);
    const { sammlungen, fehler } = staendeLesen(teile);
    expect(fehler).toEqual([]);
    expect(alsText(sammlungen)).toBe(alsText(standLesen(STAND).sammlungen));
  });

  it('weist ab, wenn ein Teil fehlt', async () => {
    const teile = await inTeileGeschrieben('l1', 120);
    const ohne = teile.filter((t) => !t.name.includes('teil-2'));
    expect(staendeLesen(ohne).fehler).toEqual([`Es fehlen Teil 2 von ${teile.length}.`]);
  });

  it('weist ab, wenn der erste Teil fehlt — er trägt die Zahl der Teile', async () => {
    const teile = await inTeileGeschrieben('l1', 120);
    expect(staendeLesen(teile.filter((t) => t.name !== 'stand.jsonl')).fehler[0]).toMatch(/erste Teil fehlt/);
  });

  it('weist einen Teil aus einem anderen Lauf ab, auch wenn die Nummern aufgehen', async () => {
    const eins = await inTeileGeschrieben('l1', 120);
    const zwei = await inTeileGeschrieben('l2', 120);
    const gemischt = [...eins.filter((t) => !t.name.includes('teil-2')), zwei.find((t) => t.name.includes('teil-2'))!];
    const { fehler } = staendeLesen(gemischt);
    expect(fehler.join(' ')).toMatch(/anderen Lauf/);
  });

  it('weist einen doppelten Teil ab', async () => {
    const teile = await inTeileGeschrieben('l1', 120);
    const zweiter = teile.find((t) => t.name.includes('teil-2'))!;
    expect(staendeLesen([...teile, { ...zweiter, name: 'kopie.jsonl' }]).fehler.join(' ')).toMatch(/Teil 2 doppelt/);
  });

  it('weist mehrere Dateien ohne Kopfzeile ab — das sind keine Teile', () => {
    const { fehler } = staendeLesen([{ name: 'a.jsonl', text: STAND }, { name: 'b.jsonl', text: STAND }]);
    expect(fehler[0]).toMatch(/2 Dateien ohne Kopfzeile/);
  });

  it('weist eine Mischung aus Teilen und einer Datei ohne Kopfzeile ab', async () => {
    const teile = await inTeileGeschrieben('l1', 1_000_000);
    expect(staendeLesen([...teile, { name: 'alt.jsonl', text: STAND }]).fehler)
      .toEqual(['Ohne Kopfzeile, also kein Teil dieses Stands: alt.jsonl']);
  });

  it('nennt eine kaputte Zeile mit ihrer Datei', async () => {
    const teile = await inTeileGeschrieben('l1', 120);
    teile[0] = { ...teile[0], text: `${teile[0].text}{kaputt\n` };
    expect(staendeLesen(teile).fehler.some((f: string) => f.startsWith(`${teile[0].name}: Zeile`))).toBe(true);
  });
});
