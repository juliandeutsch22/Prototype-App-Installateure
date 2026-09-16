/**
 * Der Zielspeicher der Sicherung ausser Haus.
 *
 * Zwei Zustände, die nach aussen ähnlich aussehen und Gegenteiliges
 * bedeuten: „kein Ziel eingerichtet" ist eine benannte Lücke, „Ziel
 * eingerichtet, aber die Ablage bleibt aus" ist ein Ausfall. Wer sie
 * verwechselt, hält im Ernstfall eine Sicherung für vorhanden, die es nicht
 * gibt.
 */
import { describe, it, expect } from 'vitest';
import { zielAusUmgebung, zielPfad, dateiZielPfad, putAnfrage } from '@/../shared/ausleitungZiel';
import { inhaltsHash } from '@/../shared/s3Signatur';

const VOLLSTAENDIG = {
  SICHERUNG_S3_ENDPUNKT: 'https://storage.googleapis.com',
  SICHERUNG_S3_REGION: 'auto',
  SICHERUNG_S3_EIMER: 'senklot-ausleitung-perl',
  SICHERUNG_S3_SCHLUESSEL: 'GOOG1EXAMPLE',
  SICHERUNG_S3_GEHEIMNIS: 'geheim',
};

describe('Ist ein Ziel eingerichtet?', () => {
  it('erkennt ein vollständig eingerichtetes Ziel', () => {
    expect(zielAusUmgebung(VOLLSTAENDIG)).toEqual({
      endpunkt: 'https://storage.googleapis.com',
      region: 'auto',
      eimer: 'senklot-ausleitung-perl',
      schluessel: 'GOOG1EXAMPLE',
      geheimnis: 'geheim',
    });
  });

  it('sagt „keines", wenn gar nichts gesetzt ist', () => {
    // Der Normalfall vor der Einrichtung — und ausdrücklich KEIN Fehler.
    expect(zielAusUmgebung({})).toBeNull();
    expect(zielAusUmgebung({ ANDERES: 'x' })).toBeNull();
  });

  it('wirft bei halber Einrichtung — und nennt, was fehlt', () => {
    /*
      DER FALL, DER SONST STILL DURCHGEHT. Wer vier von fünf Feldern setzt,
      hat sich eingerichtet und würde ohne diese Zeile als „nicht
      eingerichtet" behandelt: die App meldete brav „liegt im selben
      Projekt", und niemand käme auf die Idee, nach dem fünften Feld zu
      suchen.
    */
    const ohneGeheimnis = { ...VOLLSTAENDIG, SICHERUNG_S3_GEHEIMNIS: '' };
    expect(() => zielAusUmgebung(ohneGeheimnis)).toThrow(/SICHERUNG_S3_GEHEIMNIS/);

    const nurEimer = { SICHERUNG_S3_EIMER: 'eimer' };
    expect(() => zielAusUmgebung(nurEimer)).toThrow(/halb eingerichtet/);
  });

  it('nimmt Leerzeichen nicht für einen Wert', () => {
    // Ein Feld, in das jemand versehentlich ein Leerzeichen kopiert hat, ist
    // nicht gesetzt — sonst ginge die Signatur mit leerem Geheimnis raus.
    expect(() => zielAusUmgebung({ ...VOLLSTAENDIG, SICHERUNG_S3_SCHLUESSEL: '   ' }))
      .toThrow(/SICHERUNG_S3_SCHLUESSEL/);
  });
});

describe('Der Pfad im Zielspeicher', () => {
  it('trägt Betrieb, Tag und Uhrzeit', () => {
    expect(zielPfad('perl', new Date(Date.UTC(2026, 8, 15, 2, 30, 7))))
      .toBe('ausleitung/perl/2026-09-15/023007.jsonl');
  });

  it('ist bei zwei Läufen am selben Tag VERSCHIEDEN', () => {
    /*
      DER PUNKT. Im eigenen Projekt überschreibt der zweite Lauf den ersten —
      dort ist das gewollt. Hier darf das Dienstkonto ausdrücklich nur
      anlegen, nicht überschreiben; derselbe Pfad zweimal ergäbe eine
      Abweisung, die wie ein kaputter Zugang aussieht, obwohl der Zugang
      genau so gewollt ist.
    */
    const frueh = zielPfad('perl', new Date(Date.UTC(2026, 8, 15, 2, 30, 0)));
    const spaet = zielPfad('perl', new Date(Date.UTC(2026, 8, 15, 9, 14, 52)));
    expect(frueh).not.toBe(spaet);
    expect(spaet).toBe('ausleitung/perl/2026-09-15/091452.jsonl');
  });

  it('hält die Betriebe auseinander', () => {
    const t = new Date(Date.UTC(2026, 8, 15, 2, 30, 0));
    expect(zielPfad('perl', t)).not.toBe(zielPfad('mustermann', t));
  });
});

describe('Der Aufruf, mit dem der Stand ausser Haus geht', () => {
  const ZIEL = {
    endpunkt: 'https://storage.googleapis.com',
    region: 'auto',
    eimer: 'senklot-ausleitung-perl',
    schluessel: 'GOOG1EXAMPLE',
    geheimnis: 'geheim',
  };
  const JETZT = new Date(Date.UTC(2026, 8, 15, 2, 30, 7));

  it('legt den Eimer in den PFAD, nicht in den Hostnamen', async () => {
    /*
      Beide Formen sind bei S3 üblich; Google Cloud Storage erwartet unter
      `storage.googleapis.com` die Pfadform. Die andere ergäbe einen
      Hostnamen, den es nicht gibt — und damit einen Fehler, der wie ein
      Netzproblem aussieht.
    */
    const { url } = await putAnfrage(ZIEL, 'ausleitung/perl/2026-09-15/023007.jsonl', '{}\n', JETZT);
    expect(url).toBe(
      'https://storage.googleapis.com/senklot-ausleitung-perl/ausleitung/perl/2026-09-15/023007.jsonl',
    );
  });

  it('signiert den Pfad MIT dem Eimer', async () => {
    /*
      Der Fehler, der hier lauert: den Eimer in die Adresse schreiben, aber
      ohne ihn signieren. Die Signatur wäre dann für einen anderen Pfad
      gerechnet als den aufgerufenen, und der Zielspeicher antwortete mit
      403 — ohne zu sagen, welcher der beiden Pfade gemeint war.

      Geprüft über die Gegenprobe: dieselbe Datei in einem ANDEREN Eimer muss
      eine andere Signatur ergeben.
    */
    const a = await putAnfrage(ZIEL, 'ausleitung/perl/x.jsonl', 'inhalt', JETZT);
    const b = await putAnfrage({ ...ZIEL, eimer: 'anderer-eimer' }, 'ausleitung/perl/x.jsonl', 'inhalt', JETZT);
    expect(a.kopfzeilen.Authorization).not.toBe(b.kopfzeilen.Authorization);
  });

  it('nimmt Inhaltshash und Inhaltsart in die Signatur', async () => {
    const { kopfzeilen } = await putAnfrage(ZIEL, 'ausleitung/perl/x.jsonl', 'inhalt', JETZT);
    expect(kopfzeilen.Authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date',
    );
    expect(kopfzeilen['Content-Type']).toBe('application/x-ndjson');
    /*
      Der Hash gehört zu DIESEM Inhalt. Verglichen wird gegen den Wert, den
      `sha256sum` für „inhalt" liefert — eine Prüfung auf „sieht aus wie ein
      Hash" ginge auch durch, wenn immer derselbe geschickt würde.
    */
    expect(kopfzeilen['x-amz-content-sha256'])
      .toBe('494ae86f3433cc1bf42ce17b7bdad9c7af03ff2c87cb5a6ac25a53e419ada74b');
  });

  it('kodiert einen Betriebsnamen mit Sonderzeichen in der Adresse', async () => {
    // Sonst stünde in der Adresse etwas anderes als in der Signatur.
    const { url, kopfzeilen } = await putAnfrage(ZIEL, "ausleitung/O'Brien/x.jsonl", 'inhalt', JETZT);
    expect(url).toContain('O%27Brien');
    expect(kopfzeilen.Authorization).toContain('Signature=');
  });
});

describe('Der Pfad einer DATEI im Zielspeicher', () => {
  it('lässt den Objektnamen unangetastet', () => {
    /*
      DER PUNKT DIESER PRÜFUNG. Der Pfad eines Scheinfotos geht in die
      Prüfsumme des Scheins ein. Wer ihn beim Sichern umschreibt — etwa das
      führende `scheine/` weglässt, weil der Eimer schon so heisst —, kann
      den Beleg nach einem Wiederanlauf nicht mehr nachrechnen.
    */
    expect(dateiZielPfad('perl', 'scheinfotos', 'scheine/perl/s1/abc.jpg'))
      .toBe('dateien/perl/scheinfotos/scheine/perl/s1/abc.jpg');
  });

  it('hält Eimer und Betriebe auseinander', () => {
    // Zwei Eimer dürfen denselben Objektnamen tragen; ohne den Abschnitt
    // schriebe der zweite auf den ersten — was der Zielspeicher abwiese und
    // was wie ein kaputter Zugang aussähe.
    expect(dateiZielPfad('perl', 'scheinfotos', 'a/b.jpg'))
      .not.toBe(dateiZielPfad('perl', 'anderer', 'a/b.jpg'));
    expect(dateiZielPfad('perl', 'scheinfotos', 'a/b.jpg'))
      .not.toBe(dateiZielPfad('gruber', 'scheinfotos', 'a/b.jpg'));
  });

  it('trägt KEINEN Zeitstempel — anders als der Stand', () => {
    /*
      Beim Stand ist die Uhrzeit nötig, weil jeder Lauf einen neuen schreibt
      und das Dienstkonto nicht überschreiben darf. Bei einer Datei wäre sie
      schädlich: der Dateiname IST der Inhalts-Hash, derselbe Pfad trägt also
      immer denselben Inhalt. Mit Zeitstempel läge dasselbe Foto nach einem
      Jahr dreihundertmal im Zielspeicher.
    */
    expect(dateiZielPfad('perl', 'scheinfotos', 'x.jpg'))
      .toBe(dateiZielPfad('perl', 'scheinfotos', 'x.jpg'));
    expect(dateiZielPfad('perl', 'scheinfotos', 'x.jpg')).not.toMatch(/\d{6}/);
  });
});

describe('Eine Datei geht ausser Haus', () => {
  const ZIEL = {
    endpunkt: 'https://storage.googleapis.com',
    region: 'auto',
    eimer: 'senklot-ausleitung-perl',
    schluessel: 'GOOG1EXAMPLE',
    geheimnis: 'geheim',
  };
  const JETZT = new Date(Date.UTC(2026, 8, 15, 2, 30, 7));
  /** Bytes, die als Text nicht heil überleben — genau darum geht es. */
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

  it('signiert die BYTES und nicht ihre Textfassung', async () => {
    /*
      DER FEHLER, GEGEN DEN DAS HIER STEHT. Schickte man ein JPEG durch eine
      Zeichenkette, ersetzte die Kodierung jedes Byte über 0x7F durch das
      Ersatzzeichen — die Signatur passte dann zu einem Inhalt, den niemand
      abgeschickt hat, und der Zielspeicher antwortete mit 403. Bei einem
      JPEG ist fast jedes zweite Byte ein solches.
    */
    const { kopfzeilen } = await putAnfrage(
      ZIEL, 'dateien/perl/scheinfotos/x.jpg', JPEG, JETZT, 'image/jpeg',
    );
    expect(kopfzeilen['x-amz-content-sha256']).toBe(await inhaltsHash(JPEG));
    expect(kopfzeilen['x-amz-content-sha256'])
      .not.toBe(await inhaltsHash(new TextDecoder().decode(JPEG)));
  });

  it('legt den Typ ans Objekt, den der Aufrufer nennt', async () => {
    const { kopfzeilen } = await putAnfrage(
      ZIEL, 'dateien/perl/scheinfotos/x.jpg', JPEG, JETZT, 'image/jpeg',
    );
    expect(kopfzeilen['Content-Type']).toBe('image/jpeg');
    // Und er ist MITSIGNIERT — sonst liesse er sich unterwegs austauschen.
    expect(kopfzeilen.Authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date',
    );
  });

  it('bleibt für den Stand beim zeilenweisen JSON, wenn niemand etwas sagt', async () => {
    // Die Vorgabe darf sich nicht verschoben haben: jeder bestehende Aufruf
    // gibt keinen Typ mit.
    const { kopfzeilen } = await putAnfrage(ZIEL, 'ausleitung/perl/x.jsonl', '{}\n', JETZT);
    expect(kopfzeilen['Content-Type']).toBe('application/x-ndjson');
  });
});
