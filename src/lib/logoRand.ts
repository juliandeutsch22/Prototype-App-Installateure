/**
 * DAS LOGO OHNE RAND (E100, 23.11.2026; Auftrag: „der Firmenname bzw. auch
 * das hinterlegte Logo im Header erscheinen zu klein“).
 *
 * Beim Hochladen wird das Logo für den PDF-Briefkopf in ein festes
 * Querformat (34 × 16 mm) EINGEPASST — mittig, auf durchsichtigem Grund
 * (`logoAufbereiten.ts`). Für das PDF ist das richtig. In der App führt aber
 * die Höhe: ein Schriftzug, breiter als der Briefkopf, bekam oben und unten
 * Luft und stand im Kopf nur halb so hoch wie vorgesehen; ein hohes Zeichen
 * schob seitlich leere Fläche vor sich her. Dazu kommt Rand, den Logos
 * ohnehin oft mitbringen.
 *
 * Deshalb schneidet die App beim ANZEIGEN den Rand ab — durchsichtigen und
 * einfarbigen (alle vier Ecken gleich, etwa weiß bei einem JPEG). Das gilt
 * für jedes hinterlegte Logo, auch für die schon gespeicherten: nichts wird
 * umgeschrieben, das PDF behält sein Format.
 */

/** Unterhalb dieser Deckkraft gilt ein Bildpunkt als durchsichtig. */
const DURCHSICHTIG = 8;
/** So weit darf ein Bildpunkt von der Randfarbe abweichen und gilt noch als Rand (JPEG-Rauschen). */
const TOLERANZ = 24;
/** Größer wird zum Messen nicht gezeichnet — ein Logo braucht keine Fotoauflösung. */
const MESS_KANTE = 800;

export interface Rahmen { x: number; y: number; b: number; h: number }

/**
 * Wo im Bild der Inhalt steht — ohne durchsichtigen oder einfarbigen Rand.
 * `null`: kein Inhalt gefunden, oder die Ecken sind uneins (ein Foto, ein
 * Verlauf) — dann bleibt das Bild, wie es ist.
 */
export function inhaltsRahmen(daten: ArrayLike<number>, breite: number, hoehe: number): Rahmen | null {
  if (breite <= 0 || hoehe <= 0) return null;
  const punkt = (x: number, y: number) => {
    const i = (y * breite + x) * 4;
    return [daten[i], daten[i + 1], daten[i + 2], daten[i + 3]] as const;
  };
  const ecken = [punkt(0, 0), punkt(breite - 1, 0), punkt(0, hoehe - 1), punkt(breite - 1, hoehe - 1)];
  const durchsichtig = ecken.every((e) => e[3] < DURCHSICHTIG);
  const grund = ecken[0];
  const gleich = (a: readonly number[], b: readonly number[]) =>
    Math.abs(a[0] - b[0]) <= TOLERANZ && Math.abs(a[1] - b[1]) <= TOLERANZ && Math.abs(a[2] - b[2]) <= TOLERANZ;
  if (!durchsichtig && !ecken.every((e) => e[3] >= 255 - DURCHSICHTIG && gleich(e, grund))) return null;

  let links = breite;
  let rechts = -1;
  let oben = hoehe;
  let unten = -1;
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      const i = (y * breite + x) * 4;
      const a = daten[i + 3];
      const inhalt = durchsichtig
        ? a >= DURCHSICHTIG
        : a >= DURCHSICHTIG && !gleich([daten[i], daten[i + 1], daten[i + 2]], grund);
      if (!inhalt) continue;
      if (x < links) links = x;
      if (x > rechts) rechts = x;
      if (y < oben) oben = y;
      if (y > unten) unten = y;
    }
  }
  if (rechts < 0) return null;
  return { x: links, y: oben, b: rechts - links + 1, h: unten - oben + 1 };
}

const fertig = new Map<string, string>();
const unterwegs = new Map<string, Promise<string>>();

/** Was schon zugeschnitten ist, sofort — sonst `undefined`. */
export function logoOhneRandSofort(url: string): string | undefined {
  return fertig.get(url);
}

/**
 * Kann dieser Browser messen? Ohne Zeichenfläche (Prüfumgebung ohne
 * Grafik) bleibt das Logo, wie es ist — sofort, statt auf ein Laden zu
 * warten, das nie kommt.
 */
export function kannZuschneiden(): boolean {
  return typeof createImageBitmap === 'function' && typeof document !== 'undefined';
}

/**
 * Das Logo ohne Rand als Data-URL. Scheitert irgendetwas — fremde Adresse
 * ohne CORS, kein lesbares Bild —, kommt die ursprüngliche Adresse zurück:
 * ein Logo mit Rand ist besser als keins.
 */
export function logoOhneRand(url: string): Promise<string> {
  const schon = fertig.get(url);
  if (schon) return Promise.resolve(schon);
  const laeuft = unterwegs.get(url);
  if (laeuft) return laeuft;
  const auftrag = zuschneiden(url)
    .catch(() => url)
    .then((ergebnis) => {
      fertig.set(url, ergebnis);
      unterwegs.delete(url);
      return ergebnis;
    });
  unterwegs.set(url, auftrag);
  return auftrag;
}

async function zuschneiden(url: string): Promise<string> {
  if (!kannZuschneiden()) return url;
  const bild = new Image();
  bild.decoding = 'async';
  bild.src = url;
  await bild.decode();
  const faktor = Math.min(1, MESS_KANTE / Math.max(bild.naturalWidth, bild.naturalHeight));
  const breite = Math.max(1, Math.round(bild.naturalWidth * faktor));
  const hoehe = Math.max(1, Math.round(bild.naturalHeight * faktor));
  const flaeche = document.createElement('canvas');
  flaeche.width = breite;
  flaeche.height = hoehe;
  const stift = flaeche.getContext('2d');
  if (!stift) return url;
  stift.drawImage(bild, 0, 0, breite, hoehe);
  // Wirft bei einer fremden Adresse ohne CORS — dann bleibt das Logo, wie es ist.
  const rahmen = inhaltsRahmen(stift.getImageData(0, 0, breite, hoehe).data, breite, hoehe);
  if (!rahmen || (rahmen.b === breite && rahmen.h === hoehe)) return url;
  const aus = document.createElement('canvas');
  aus.width = rahmen.b;
  aus.height = rahmen.h;
  aus.getContext('2d')!.drawImage(flaeche, rahmen.x, rahmen.y, rahmen.b, rahmen.h, 0, 0, rahmen.b, rahmen.h);
  return aus.toDataURL('image/png');
}
