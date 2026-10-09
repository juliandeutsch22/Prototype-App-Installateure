/*
  KURZNAMEN FÜR DEN MONAT (Runde 4, Auftrag 5.1). Ein Balken von zwei Tagen
  ist am Schreibtisch rund 60 px breit; „Wohnungseigentümergemeinschaft
  Hauptstraße 112–118“ steht dort nur als „Woh…“. Diese Funktionen kürzen
  NUR FÜR DIE ANZEIGE — es gibt kein Datenfeld „Kurzname“ (Auftrag 10), und
  `title` und Vorschau tragen weiter den vollen Namen.

  IM ZWEIFEL BLEIBT DER NAME. Ob „Gasthof Post“ eine Firma oder „Anna
  Beispiel“ eine Person ist, steht in keinem Feld, das die Planung lädt (die
  Kundenart liegt am Kunden, nicht an der Baustelle). Gekürzt wird deshalb
  nur, wo der Name selbst es sagt: eine Rechtsform, „Gemeinde“, „Familie“,
  eine Anrede oder ein bekannter Vorname vor dem Nachnamen. Ein falscher
  Kurzname („Post“ statt „Gasthof Post“, „Bau“ statt „CT Bau“) wäre
  schlimmer als ein langer, den die Breite abschneidet.
*/

/**
 * Rechtsformen am Ende des Namens (Österreich und Nachbarn), die längsten
 * zuerst, damit „GmbH & Co KG“ nicht als „GmbH & Co“ stehen bleibt. Gross
 * und klein zählt: „AG“ ist eine Rechtsform, „Ag“ am Ende eines Namens nicht.
 */
const RECHTSFORM =
  /[\s,]+(?:GmbH\s*(?:&|und)\s*Co\.?\s*KG|Ges\.?\s?m\.?\s?b\.?\s?H\.?|Gesellschaft\s+m\.?\s?b\.?\s?H\.?|Gesellschaft\s+mit\s+beschränkter\s+Haftung|GmbH|Gmbh|GMBH|AG|KG|OG|OEG|KEG|e\.\s?U\.|eU|e\.\s?Gen\.?|eGen|reg\.?\s?Gen\.?\s?m\.?\s?b\.?\s?H\.?|GesbR|GesnbR|FlexCo|FlexKapG|SE|Inc\.?|Ltd\.?|LLC)\.?$/;

/** Gebietskörperschaften: „Gemeinde Ansfelden“ heißt im Betrieb „Ansfelden“. */
const GEMEINDE = /^(?:Markt|Stadt|Orts)?gemeinde\s+|^Stadt\s+|^Magistrat\s+(?:der\s+Stadt\s+)?/i;

/** Was vor einem Personennamen steht und sagt: das ist ein Mensch. */
const ANREDE = /^(?:Familie|Fam\.|Ehepaar|Herrn?|Frau)\s+/i;

/** Akademische Grade vor dem Namen — sie sind ein Zeichen für eine Person. */
const TITEL = /^(?:(?:Dr|Mag|Ing|DI|Dipl\.-Ing|DDr|Prof|MMag)\.?(?:\s*\([A-Z]+\))?\s+)+/;

/**
 * Häufige Vornamen. Ein Name aus Vorname und Nachname („Anna Beispiel“) wird
 * nur gekürzt, wenn der erste Teil hier steht — sonst könnte „Gasthof Post“
 * zu „Post“ werden. Fehlt ein Vorname, bleibt der volle Name: das ist der
 * sichere Fehler.
 */
const VORNAMEN = new Set(
  (
    'Adam Adrian Agnes Alexander Alexandra Alfred Alois Amelie Andrea Andreas Angelika Anita Anja Anna Anne ' +
    'Annemarie Anton Armin Astrid Barbara Bastian Beate Benedikt Benjamin Bernd Bernhard Bettina Birgit Brigitte ' +
    'Carina Carmen Caroline Christa Christian Christiane Christina Christine Christoph Clara Claudia Daniel Daniela ' +
    'David Dieter Dietmar Doris Dominik Edith Edeltraud Elena Elias Elisabeth Elke Emil Emma Erich Erik Erika Ernst ' +
    'Erwin Eva Evelyn Fabian Felix Ferdinand Florian Franz Franziska Friedrich Gabriele Georg Gerald Gerda Gerhard ' +
    'Gertrude Gottfried Gregor Gudrun Günter Günther Hannah Hannes Hans Harald Heidi Heinrich Heinz Helene Helga ' +
    'Helmut Herbert Hermann Hubert Ingrid Iris Isabella Jakob Jan Jana Johann Johanna Johannes Jonas Josef Josefine ' +
    'Julia Julian Jürgen Karin Karl Katharina Kathrin Klaus Konrad Kurt Laura Lea Lena Leo Leonhard Leopold Lisa ' +
    'Lorenz Lukas Magdalena Manfred Manuel Manuela Marco Margarete Maria Marianne Marie Mario Markus Martha Martin ' +
    'Martina Matthias Max Maximilian Melanie Michael Michaela Monika Nadine Nicole Niklas Nina Norbert Oliver Oskar ' +
    'Otto Patrick Patricia Paul Paula Peter Petra Philipp Rainer Raphael Regina Reinhard Renate Richard Robert ' +
    'Roland Roman Rosa Rosemarie Rudolf Sabine Sabrina Sandra Sarah Sebastian Silvia Simon Simone Sonja Sophie ' +
    'Stefan Stefanie Stephan Susanne Theresa Theresia Thomas Tobias Ulrike Ursula Valentin Valentina Verena ' +
    'Viktor Viktoria Walter Werner Wilhelm Wolfgang'
  ).split(' '),
);

/**
 * Wörter, die einen Betrieb oder eine Einrichtung verraten. Steht eines im
 * Namen, wird ein Vorname davor nicht als Person gelesen („Josef Huber
 * Installationen“ bleibt).
 */
const FIRMENWORT =
  /\b(?:Bau|Bauträger|Installationen?|Haustechnik|Technik|Immobilien|Hausverwaltung|Verwaltung|Gasthof|Gasthaus|Hotel|Bäckerei|Fleischerei|Tischlerei|Schule|Volksschule|Kindergarten|Pfarre|Verein|Holding|Handel|Service|Zentrum|Center|Apotheke|Praxis|Ordination|Kanzlei|Café|Restaurant|Werkstatt|Autohaus|Wohnbau|Genossenschaft|Siedlung|Heim|Stiftung|Söhne|Partner|Team)\b/i;

/** Ein Wort aus Buchstaben (auch mit Bindestrich oder Apostroph) mit großem Anfang. */
const NAMENSWORT = /^\p{Lu}[\p{L}'’-]*$/u;

/**
 * Die Kurzform eines Kunden für die Beschriftung eines Balkens:
 * „CT Bau GmbH“ → „CT Bau“, „Gemeinde Ansfelden“ → „Ansfelden“,
 * „Familie Huber“ → „Huber“, „Anna Beispiel“ → „Beispiel“.
 * Was sich nicht sicher kürzen lässt, bleibt, wie es ist.
 */
export function kurzname(kunde: string | null | undefined): string {
  const voll = (kunde ?? '').replace(/\s+/g, ' ').trim();
  if (!voll) return '';

  // 1. Rechtsform am Ende: eine Firma — der Rest ist ihr Name.
  const ohneForm = voll.replace(RECHTSFORM, '').replace(/[\s,&]+$/, '').trim();
  if (ohneForm !== voll && ohneForm) return ohneForm;

  // 2. Wohnungseigentümergemeinschaft: im Betrieb „WEG“, die Adresse bleibt.
  const weg = /^(?:Wohnungs)?eigentümergemeinschaft\s+(.+)$/i.exec(voll);
  if (weg) return `WEG ${weg[1]}`;

  // 3. Gemeinde: der Ort. „Neudorf bei Wiener Neustadt“ heißt kurz „Neudorf“.
  if (GEMEINDE.test(voll)) {
    const ort = voll.replace(GEMEINDE, '').trim();
    return ort.split(/\s+(?:bei|an der|am|im|in der|ob der|unter der)\s+/i)[0] || voll;
  }

  // 4. Familie, Herr, Frau, ein Titel: eine Person — ihr Nachname.
  const angeredet = ANREDE.test(voll) || TITEL.test(voll);
  const rest = voll.replace(ANREDE, '').replace(TITEL, '').trim();
  if (angeredet && rest) return FIRMENWORT.test(rest) ? voll : (nachname(rest) ?? rest);

  // 5. „Huber, Anna“: Nachname vor dem Komma, Vorname dahinter.
  const komma = /^([^,]+),\s*(\S+)$/.exec(voll);
  if (komma && VORNAMEN.has(komma[2]) && NAMENSWORT.test(komma[1])) return komma[1];

  // 6. Vorname und Nachname — nur mit bekanntem Vornamen und ohne Firmenwort.
  const woerter = voll.split(' ');
  if (
    woerter.length >= 2 &&
    woerter.length <= 3 &&
    VORNAMEN.has(woerter[0]) &&
    woerter.every((w) => NAMENSWORT.test(w)) &&
    !FIRMENWORT.test(voll)
  ) {
    return woerter[woerter.length - 1];
  }
  return voll;
}

/** Der Nachname aus „Josef Huber“, „Anna und Josef Huber“ oder „Huber“ — das letzte Namenswort. */
function nachname(name: string): string | null {
  const woerter = name.split(' ').filter((w) => NAMENSWORT.test(w));
  return woerter.length > 0 ? woerter[woerter.length - 1] : null;
}

/**
 * Die Kurzform einer Person: „Max Mustermann“ → „Max M.“ — für das Tablet,
 * wo die Namensspalte 120 px misst, und für die Sicht nach Baustellen.
 * Ein einzelnes Wort bleibt, wie es ist.
 *
 * KLAMMERN UND ZAHLEN SIND KEIN NACHNAME (Testbericht Runde 5, G2): aus
 * „Test Lehrling (Claude)“ wurde „Test (.“. Ein Zusatz in Klammern fällt weg;
 * gekürzt wird das letzte Wort, das mit einem Buchstaben beginnt. Gibt es
 * keins („Monteur 2“), bleibt der Name ganz — sonst wären „Monteur 1“ und
 * „Monteur 2“ nicht mehr zu unterscheiden.
 */
export function kurzPerson(name: string | null | undefined): string {
  const woerter = ohneKlammerzusatz(name).split(/\s+/).filter(Boolean);
  if (woerter.length < 2) return woerter[0] ?? '';
  const nach = [...woerter.slice(1)].reverse().find((w) => /^\p{L}/u.test(w));
  if (!nach) return woerter.join(' ');
  return `${woerter[0]} ${nach.charAt(0)}.`;
}

/** „Test Lehrling (Claude)“ → „Test Lehrling“ — ein Zusatz in Klammern ist kein Teil des Namens. */
function ohneKlammerzusatz(name: string | null | undefined): string {
  return (name ?? '').replace(/\([^)]*\)/g, ' ').trim();
}
