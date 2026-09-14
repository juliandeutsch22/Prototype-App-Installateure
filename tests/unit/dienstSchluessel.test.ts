/**
 * Woher der Dienstschlüssel kommt — und was passiert, wenn keiner da ist.
 *
 * WARUM DAS EINE EIGENE PRÜFUNG WERT IST. Der Fehler, der diese Datei
 * ausgelöst hat, sah im Betrieb so aus: der nächtliche Ausleitungslauf
 * antwortete mit 401 „Keine Anmeldung." Der Schlüssel im Tresor war richtig,
 * das Projekt stimmte, die Function war ausgeliefert — gefehlt hat die
 * Umgebungsvariable in der Function. Die Meldung zeigte also auf den
 * Anrufer, während der Dienst das Problem war, und wer danach sucht, sucht
 * eine Stunde an der falschen Stelle.
 *
 * Zwei Dinge werden hier festgehalten: dass der Schlüssel unter beiden
 * Namen gefunden wird, die die Plattform benutzt, und dass „kein Schlüssel"
 * niemals als „das ist die Maschine" durchgeht.
 */
import { describe, it, expect } from 'vitest';
import {
  alleDienstSchluessel, dienstKopfzeilen, dienstSchluessel, istDienst, istJwtFormat,
  rufDerMaschine, SCHLUESSEL_NAMEN, SCHLUESSEL_FEHLT,
} from '@shared/dienstSchluessel';

describe('dienstSchluessel', () => {
  it('findet den alten Namen', () => {
    expect(dienstSchluessel({ SUPABASE_SERVICE_ROLE_KEY: 'abc' })).toBe('abc');
  });

  /*
    DER NEUE NAME IST EIN VERZEICHNIS, KEIN WERT. Beim Tausch eines
    Schlüssels stehen zwei darin — der alte läuft weiter, während der neue
    schon gilt. Wer den Rohwert als Schlüssel nähme, schickte der Plattform
    eine JSON-Zeile als Schlüssel und bekäme 401.
  */
  it('liest den neuen Namen als JSON-Verzeichnis', () => {
    expect(dienstSchluessel({
      SUPABASE_SECRET_KEYS: '{"default":"sb_secret_xyz"}',
    })).toBe('sb_secret_xyz');
  });

  it('nimmt `default`, auch wenn mehrere dastehen', () => {
    expect(dienstSchluessel({
      SUPABASE_SECRET_KEYS: '{"alt":"sb_secret_alt","default":"sb_secret_neu"}',
    })).toBe('sb_secret_neu');
  });

  it('nimmt den ersten brauchbaren, wenn es kein `default` gibt', () => {
    expect(dienstSchluessel({
      SUPABASE_SECRET_KEYS: '{"eigen":"sb_secret_eigen"}',
    })).toBe('sb_secret_eigen');
  });

  it('überspringt leere Einträge im Verzeichnis', () => {
    expect(dienstSchluessel({
      SUPABASE_SECRET_KEYS: '{"default":"   ","zweit":"sb_secret_zweit"}',
    })).toBe('sb_secret_zweit');
  });

  it('meldet null bei einem Verzeichnis ohne brauchbaren Eintrag', () => {
    expect(dienstSchluessel({ SUPABASE_SECRET_KEYS: '{}' })).toBeNull();
    expect(dienstSchluessel({ SUPABASE_SECRET_KEYS: '{"a":123}' })).toBeNull();
    expect(dienstSchluessel({ SUPABASE_SECRET_KEYS: 'null' })).toBeNull();
  });

  /*
    Kein JSON heisst nicht „kaputt": sollte die Plattform je wieder eine
    einfache Zeichenkette hinterlegen, läuft der Dienst weiter, statt an
    einer Formatannahme von heute zu sterben.
  */
  it('nimmt einen einfachen Wert, wenn kein JSON dasteht', () => {
    expect(dienstSchluessel({ SUPABASE_SECRET_KEYS: 'sb_secret_pur' })).toBe('sb_secret_pur');
  });

  it('nimmt den alten zuerst, wenn beide dastehen', () => {
    expect(dienstSchluessel({
      SUPABASE_SERVICE_ROLE_KEY: 'alt',
      SUPABASE_SECRET_KEYS: '{"default":"neu"}',
    })).toBe('alt');
  });

  it('meldet null, wenn keiner gesetzt ist', () => {
    expect(dienstSchluessel({})).toBeNull();
    expect(dienstSchluessel({ IRGENDWAS: 'x' })).toBeNull();
  });

  it('behandelt eine leere Variable wie eine fehlende', () => {
    expect(dienstSchluessel({ SUPABASE_SERVICE_ROLE_KEY: '' })).toBeNull();
    expect(dienstSchluessel({ SUPABASE_SERVICE_ROLE_KEY: '   ' })).toBeNull();
  });

  it('fällt auf den zweiten Namen zurück, wenn der erste leer ist', () => {
    expect(dienstSchluessel({
      SUPABASE_SERVICE_ROLE_KEY: '',
      SUPABASE_SECRET_KEYS: '{"default":"neu"}',
    })).toBe('neu');
  });

  it('schneidet Leerraum ab — ein eingefügter Zeilenumbruch ist derselbe Schlüssel', () => {
    expect(dienstSchluessel({ SUPABASE_SERVICE_ROLE_KEY: ' abc\n' })).toBe('abc');
  });
});

describe('istDienst', () => {
  it('erkennt den Dienst', () => {
    expect(istDienst('abc', 'abc')).toBe(true);
  });

  it('weist einen anderen Schlüssel ab', () => {
    expect(istDienst('anon-schluessel', 'dienst-schluessel')).toBe(false);
  });

  /*
    DER GEFÄHRLICHSTE FALL, und der Grund, warum hier nicht `===` steht:
    ohne Kopfzeile ist das Token die leere Zeichenkette. Wäre der
    Dienstschlüssel ebenfalls leer, machte ein blosser Vergleich aus dem
    Aufruf OHNE jede Anmeldung den einzigen, der durchkommt.
  */
  it('macht aus zweimal nichts keinen Dienst', () => {
    expect(istDienst('', null)).toBe(false);
    expect(istDienst('', '')).toBe(false);
    expect(istDienst('   ', null)).toBe(false);
  });

  it('stört sich nicht an Leerraum um das Token', () => {
    expect(istDienst(' abc ', 'abc')).toBe(true);
  });
});

describe('istJwtFormat', () => {
  it('erkennt ein JWT an seinen drei Teilen', () => {
    expect(istJwtFormat('eyJhbGciOi.eyJyb2xlIjo.unterschrift')).toBe(true);
  });

  it('und einen neuen Schlüssel als das, was er ist: keines', () => {
    expect(istJwtFormat('sb_secret_N7UND0Ugj')).toBe(false);
  });

  it('drei Teile heisst drei GEFÜLLTE Teile', () => {
    expect(istJwtFormat('a..c')).toBe(false);
    expect(istJwtFormat('a.b')).toBe(false);
    expect(istJwtFormat('a.b.c.d')).toBe(false);
    expect(istJwtFormat('')).toBe(false);
  });
});

describe('dienstKopfzeilen', () => {
  /*
    DIE EINE ZEILE, DIE DEN UNTERSCHIED MACHT. Ein neuer Schlüssel in
    `Authorization` wird vom Tor als kaputtes JWT abgewiesen, bevor
    irgendetwas anläuft.
  */
  it('legt einen neuen Schlüssel nur in apikey', () => {
    const kopf = dienstKopfzeilen('sb_secret_xyz');
    expect(kopf.apikey).toBe('sb_secret_xyz');
    expect(kopf.Authorization).toBeUndefined();
  });

  it('legt ein JWT in beide Kopfzeilen', () => {
    const kopf = dienstKopfzeilen('eyJhbGciOi.eyJyb2xlIjo.unterschrift');
    expect(kopf.apikey).toBe('eyJhbGciOi.eyJyb2xlIjo.unterschrift');
    expect(kopf.Authorization).toBe('Bearer eyJhbGciOi.eyJyb2xlIjo.unterschrift');
  });

  it('kommt ohne Schlüssel aus, ohne zu scheitern', () => {
    // Benutzt wird das nie — die Function antwortet vorher mit 503 —, aber
    // die Kopfzeilen entstehen beim Laden der Datei und dürfen nicht werfen.
    expect(dienstKopfzeilen(null).apikey).toBe('');
    expect(dienstKopfzeilen(null).Authorization).toBeUndefined();
  });
});

describe('rufDerMaschine', () => {
  it('erkennt den alten Weg: Schlüssel im Authorization-Kopf', () => {
    expect(rufDerMaschine('Bearer geheim', '', ['geheim'])).toBe(true);
  });

  it('erkennt den neuen Weg: Schlüssel im apikey-Kopf', () => {
    expect(rufDerMaschine('', 'geheim', ['geheim'])).toBe(true);
  });

  /*
    DER FALL, DER EINE RUNDE GEKOSTET HÄTTE. Ein Projekt mitten in der
    Ablösung kennt zwei Dienstschlüssel. Welcher im Tresor liegt, entscheidet
    die Person, die ihn eingetragen hat — nicht die Reihenfolge in unserem
    Code. Gälte nur der erste, sähe der Fehlschlag aus wie ein falscher
    Schlüssel und wäre eine Sortierung.
  */
  it('erkennt auch den zweiten Schlüssel der Umgebung', () => {
    expect(rufDerMaschine('', 'sb_secret_neu', ['alt.jwt.hier', 'sb_secret_neu'])).toBe(true);
    expect(rufDerMaschine('Bearer alt.jwt.hier', '', ['alt.jwt.hier', 'sb_secret_neu'])).toBe(true);
  });

  it('weist einen Menschen ab, der den anon-Schlüssel mitschickt', () => {
    // Genau so ruft ein angemeldeter Mensch an: sein Token im Authorization-
    // Kopf, der öffentliche Schlüssel in apikey. Das ist keine Maschine.
    expect(rufDerMaschine('Bearer nutzertoken', 'anon', ['geheim'])).toBe(false);
  });

  it('und macht aus zweimal nichts keine Maschine', () => {
    expect(rufDerMaschine('', '', [])).toBe(false);
    expect(rufDerMaschine('', '', [''])).toBe(false);
  });
});

describe('alleDienstSchluessel', () => {
  it('nimmt beide Quellen, alte zuerst', () => {
    expect(alleDienstSchluessel({
      SUPABASE_SERVICE_ROLE_KEY: 'alt',
      SUPABASE_SECRET_KEYS: '{"default":"neu"}',
    })).toEqual(['alt', 'neu']);
  });

  it('nimmt jeden Eintrag des Verzeichnisses, `default` zuerst', () => {
    expect(alleDienstSchluessel({
      SUPABASE_SECRET_KEYS: '{"zweit":"b","default":"a"}',
    })).toEqual(['a', 'b']);
  });

  it('zählt denselben Schlüssel nicht doppelt', () => {
    expect(alleDienstSchluessel({
      SUPABASE_SERVICE_ROLE_KEY: 'gleich',
      SUPABASE_SECRET_KEYS: '{"default":"gleich"}',
    })).toEqual(['gleich']);
  });

  it('und ohne Umgebung ist die Liste leer', () => {
    expect(alleDienstSchluessel({})).toEqual([]);
  });
});

describe('SCHLUESSEL_FEHLT', () => {
  it('nennt beide Namen, damit niemand raten muss', () => {
    for (const name of SCHLUESSEL_NAMEN) expect(SCHLUESSEL_FEHLT).toContain(name);
  });
});
