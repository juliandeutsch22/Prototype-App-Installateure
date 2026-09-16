/**
 * Die Signatur für die Sicherung ausser Haus.
 *
 * WARUM DAS DIE WICHTIGSTE PRÜFUNG DIESER FUNKTION IST. Eine falsch
 * gerechnete Signatur ergibt ein 403 — ohne einen Hinweis darauf, WELCHER
 * der acht Schritte danebenlag. Man kann sie nicht „ein bisschen" falsch
 * haben: entweder stimmt sie auf das Zeichen genau, oder gar nichts geht.
 *
 * Geprüft wird deshalb nicht gegen meine eigene Rechnung, sondern gegen die
 * VERÖFFENTLICHTEN TESTVEKTOREN von AWS (`aws-sig-v4-test-suite`,
 * Fall `get-vanilla`). Sie nennen für einen bekannten Schlüssel, eine
 * bekannte Zeit und eine bekannte Anfrage die erwartete Kopfzeile. Stimmt
 * sie, stimmt die ganze Kette: kanonische Anfrage, Geltungsbereich,
 * Schlüsselableitung, Signatur.
 */
import { describe, it, expect } from 'vitest';
import { signiere, inhaltsHash, pfadKodieren, zeitstempel } from '@/../shared/s3Signatur';

/** Die Angaben aus der Testsammlung von AWS. */
const VEKTOR = {
  schluessel: 'AKIDEXAMPLE',
  geheimnis: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  dienst: 'service',
  host: 'example.amazonaws.com',
  zeit: new Date(Date.UTC(2015, 7, 30, 12, 36, 0)),
};

describe('Signature Version 4', () => {
  it('trifft den veröffentlichten Testvektor von AWS', async () => {
    /*
      `get-vanilla`: GET auf `/`, ohne Abfrage, ohne Inhalt. Der Fall ist
      bewusst der einfachste — jede Abweichung liegt dann an der Kette und
      nicht an einer Besonderheit der Anfrage.

      Der Vektor signiert NUR `host` und `x-amz-date`. Verglichen wird die
      KOPFZEILE IM GANZEN, nicht ihre Bestandteile: eine Prüfung auf „sieht
      aus wie eine Signatur" ginge auch dann durch, wenn die Schlüsselkette
      falsch gerechnet wäre — und genau die ist der Teil, den man nicht
      sieht.
    */
    const kopf = await signiere({
      endpunkt: `https://${VEKTOR.host}`,
      region: VEKTOR.region,
      dienst: VEKTOR.dienst,
      verb: 'GET',
      pfad: '',
      inhalt: '',
      schluessel: VEKTOR.schluessel,
      geheimnis: VEKTOR.geheimnis,
      jetzt: VEKTOR.zeit,
    });

    expect(kopf.Authorization).toBe(
      'AWS4-HMAC-SHA256 '
      + 'Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, '
      + 'SignedHeaders=host;x-amz-date, '
      + 'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('rechnet für denselben Aufruf immer dasselbe', async () => {
    // Ohne diese Festlegung wäre jede Änderung an der Kette unsichtbar:
    // ein Aufruf, der heute anders signiert als gestern, fällt erst am
    // Zielspeicher auf.
    const eingabe = {
      endpunkt: 'https://storage.googleapis.com',
      region: 'auto',
      verb: 'PUT',
      pfad: 'eimer/ausleitung/perl/2026-09-15/0230.jsonl',
      inhalt: '{"sammlung":"companies"}\n',
      schluessel: 'GOOG1EXAMPLE',
      geheimnis: 'geheim-geheim',
      jetzt: new Date(Date.UTC(2026, 8, 15, 2, 30, 0)),
    };
    const a = await signiere(eingabe);
    const b = await signiere(eingabe);
    expect(a.Authorization).toBe(b.Authorization);
  });

  it('signiert den INHALT mit', async () => {
    /*
      Der Punkt, an dem eine Sicherung still falsch wird: ginge der Inhalt
      nicht in die Signatur ein, liesse er sich unterwegs austauschen, und
      im Eimer läge etwas anderes als im Betrieb. Auffallen würde das erst
      beim Wiederanlauf — also genau dann, wenn niemand mehr etwas richten
      kann.

      Geprüft wird über den Weg, den auch die Ausleitung nimmt: der Hash
      wird berechnet, als Kopfzeile übergeben und damit mitsigniert.
    */
    const grund = {
      endpunkt: 'https://storage.googleapis.com',
      region: 'auto',
      verb: 'PUT',
      pfad: 'eimer/datei.jsonl',
      schluessel: 'GOOG1EXAMPLE',
      geheimnis: 'geheim-geheim',
      jetzt: new Date(Date.UTC(2026, 8, 15, 2, 30, 0)),
    };
    const signiereMitInhalt = async (inhalt: string) =>
      signiere({
        ...grund,
        inhalt,
        kopfzeilen: { 'x-amz-content-sha256': await inhaltsHash(inhalt) },
      });

    const eins = await signiereMitInhalt('a');
    const zwei = await signiereMitInhalt('b');

    expect(eins['x-amz-content-sha256']).not.toBe(zwei['x-amz-content-sha256']);
    expect(eins.Authorization).not.toBe(zwei.Authorization);
    // Und der Hash ist wirklich Teil der Signatur, nicht nur eine Beigabe:
    expect(eins.Authorization).toContain('SignedHeaders=host;x-amz-content-sha256;x-amz-date');
  });

  it('bindet die Signatur an Pfad, Zeit, Region und Geheimnis', async () => {
    const grund = {
      endpunkt: 'https://storage.googleapis.com',
      region: 'auto',
      verb: 'PUT',
      pfad: 'eimer/datei.jsonl',
      inhalt: 'x',
      schluessel: 'GOOG1EXAMPLE',
      geheimnis: 'geheim-geheim',
      jetzt: new Date(Date.UTC(2026, 8, 15, 2, 30, 0)),
    };
    const grundlage = (await signiere(grund)).Authorization;

    expect((await signiere({ ...grund, pfad: 'eimer/andere.jsonl' })).Authorization)
      .not.toBe(grundlage);
    expect((await signiere({ ...grund, jetzt: new Date(Date.UTC(2026, 8, 16, 2, 30)) })).Authorization)
      .not.toBe(grundlage);
    expect((await signiere({ ...grund, geheimnis: 'anders' })).Authorization)
      .not.toBe(grundlage);
    /*
      DIE REGION GEHÖRT DAZU, und diese Zeile fehlte zuerst: eine Mutation,
      die sie im Geltungsbereich durch eine feste ersetzte, blieb unbemerkt,
      weil der Testvektor zufällig dieselbe Region benutzt. Ein Zielspeicher
      in einer anderen Region hätte danach jede Signatur abgewiesen.
    */
    const andereRegion = await signiere({ ...grund, region: 'europe-west3' });
    expect(andereRegion.Authorization).not.toBe(grundlage);
    expect(andereRegion.Authorization).toContain('/europe-west3/s3/aws4_request');
  });
});

describe('Der Pfad in der Signatur', () => {
  it('kodiert die Zeichen, die `encodeURIComponent` stehen lässt', () => {
    /*
      `!'()*` bleiben bei `encodeURIComponent` unberührt, die Signatur
      verlangt sie kodiert. Ein Betriebsname mit Apostroph hätte gereicht:
      der Server rechnete anders und antwortete mit 403, ohne zu sagen warum.
    */
    expect(pfadKodieren("eimer/O'Brien (alt)!")).toBe('eimer/O%27Brien%20%28alt%29%21');
  });

  it('lässt die Schrägstriche stehen', () => {
    // Sonst wäre aus dem Pfad ein einziger Abschnitt geworden — und der
    // Eimer hiesse dann „ausleitung%2Fperl".
    expect(pfadKodieren('eimer/ausleitung/perl/2026-09-15.jsonl'))
      .toBe('eimer/ausleitung/perl/2026-09-15.jsonl');
  });

  it('macht aus einem Zeitpunkt beide Formen', () => {
    const { lang, kurz } = zeitstempel(new Date(Date.UTC(2026, 8, 15, 2, 30, 7)));
    expect(lang).toBe('20260915T023007Z');
    expect(kurz).toBe('20260915');
  });
});
