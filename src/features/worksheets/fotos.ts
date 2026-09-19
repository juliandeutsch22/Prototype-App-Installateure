import type { WorkSheetFoto } from '@/types';

/**
 * Fotos am Handwerksschein.
 *
 * WOFÜR SIE DA SIND. Der Schein sagt, was gemacht wurde; das Foto sagt, wie
 * es aussah. Bei einem Wasserschaden im Keller, einer verkalkten Therme oder
 * einer Leitung, die hinter der Wand anders lag als geplant, ist das Bild das
 * einzige, was sich später nicht wegdiskutieren lässt.
 *
 * SIE SIND FREIWILLIG, und das ist eine bewusste Entscheidung, keine
 * Sparsamkeit. Der Schein muss im Keller ohne Netz unterschreibbar bleiben:
 * Das Ausgangsfach hält einen Schreibvorgang ohne Empfang vor und schickt
 * ihn nach, der Dateispeicher tut das NICHT. Wäre auch nur ein Foto
 * Bedingung, hinge der
 * ganze Beleg an einem Balken Empfang — und der Monteur stünde mit einem
 * Kunden vor sich da, der unterschreiben will.
 *
 * Was die App stattdessen tut: sie sagt VOR dem Unterschreiben, wenn ein Bild
 * noch nicht oben ist (siehe `nochNichtOben`), statt es still fallen zu
 * lassen. Der Monteur entscheidet dann — nochmal versuchen, oder ohne.
 */

/**
 * Die längere Kante nach dem Verkleinern, in Bildpunkten.
 *
 * 1600 ist der Punkt, an dem ein Riss in der Wand oder eine Typenschild-
 * Beschriftung noch lesbar bleibt und die Datei von 4 MB auf ein paar hundert
 * Kilobyte fällt. Das Original hochzuladen wäre auf einer Baustelle mit
 * halbem Balken keine Übertragung, sondern ein Abbruch.
 */
export const MAX_KANTE = 1600;

/** JPEG-Güte. 0,72 ist die Schwelle, unter der Fugen und Kanten matschen. */
export const GUETE = 0.72;

/**
 * Wie viele Fotos an einen Schein passen.
 *
 * Nicht aus technischer Not — Storage nähme mehr —, sondern weil ein Beleg
 * mit dreissig Bildern niemandem hilft. Wer dokumentiert, wählt aus.
 */
export const MAX_FOTOS = 8;

/** Was der Dateiwähler annimmt. HEIC kommt von iPhones und wird umgewandelt. */
export const ERLAUBTE_TYPEN = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/**
 * Die Zielmasse für ein Bild — die längere Kante auf `MAX_KANTE`, das
 * Seitenverhältnis erhalten.
 *
 * Ein bereits kleines Bild wird NICHT vergrössert: das kostete Bytes und
 * brächte keinen einzigen Bildpunkt an Information dazu.
 */
export function zielMasse(
  breite: number,
  hoehe: number,
  maxKante = MAX_KANTE,
): { breite: number; hoehe: number } {
  if (!(breite > 0) || !(hoehe > 0)) return { breite: 0, hoehe: 0 };
  const laengste = Math.max(breite, hoehe);
  if (laengste <= maxKante) return { breite: Math.round(breite), hoehe: Math.round(hoehe) };
  const faktor = maxKante / laengste;
  return { breite: Math.round(breite * faktor), hoehe: Math.round(hoehe * faktor) };
}

/**
 * Der Speicherpfad eines Fotos.
 *
 * MANDANT ZUERST, dann der Schein. Die Storage-Regel schneidet die
 * Mandantengrenze an diesem ersten Abschnitt — läge er weiter hinten, müsste
 * sie den Pfad zerlegen, und eine Regel, die Zeichenketten zerlegt, ist eine
 * Regel, die irgendwann danebenliegt.
 */
export function fotoPfad(companyId: string, scheinId: string, name: string): string {
  return `scheine/${companyId}/${scheinId}/${name}`;
}

/**
 * Der Inhalts-Hash eines Bildes, hexadezimal.
 *
 * ER IST DER GRUND, WARUM DIE FOTOS ÜBERHAUPT BEWEISKRAFT HABEN. Die
 * Prüfsumme des Scheins sieht nur seine Zeilen, nicht die Bilddatei.
 * Ohne diesen Hash liesse sich das Bild nach der Unterschrift austauschen,
 * ohne dass irgendetwas auffiele.
 */
export async function bildHash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Ein Foto, das im Formular liegt — hochgeladen oder noch nicht. */
export interface FotoEntwurf {
  /** Nur im Browser gültig, zum Anzeigen der Vorschau. */
  vorschau: string;
  /** Die komprimierten Bytes — bleiben liegen, damit ein Nachreichen geht. */
  daten: Blob;
  geraetZeit: number;
  /** Gesetzt, sobald der Upload durch ist. */
  oben?: WorkSheetFoto;
  /** Warum es nicht hochgegangen ist — für die Meldung am Bild. */
  fehler?: string;
}

/**
 * Welche Fotos noch nicht oben sind.
 *
 * Der Aufrufer fragt das VOR dem Unterschreiben. Ein leeres Ergebnis heisst
 * nicht „es gibt Fotos", sondern „nichts geht verloren".
 */
export function nochNichtOben(entwuerfe: FotoEntwurf[]): FotoEntwurf[] {
  return entwuerfe.filter((f) => !f.oben);
}

/**
 * Die Fotos, wie sie in den Schein geschrieben werden.
 *
 * NUR DIE HOCHGELADENEN. Ein Eintrag für ein Bild, das nicht im Storage
 * liegt, wäre ein Verweis ins Leere — und er ginge in die Prüfsumme ein, die
 * damit einen Beleg zusicherte, den niemand ansehen kann.
 */
export function fuerDenSchein(entwuerfe: FotoEntwurf[]): WorkSheetFoto[] {
  return entwuerfe.map((f) => f.oben).filter((f): f is WorkSheetFoto => !!f);
}

/** Menschenlesbare Grösse — „340 KB", „1,2 MB". */
export function groesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export interface AufnahmePruefung {
  moeglich: boolean;
  grund?: string;
}

/**
 * Darf noch ein Foto dazu?
 *
 * Der Schein muss ein Entwurf sein: nach der Unterschrift ist er eingefroren,
 * und ein nachgereichtes Bild wäre eine Änderung an einem Beleg, den der
 * Kunde in der Hand hat.
 */
export function darfFotografieren(
  status: string,
  vorhanden: number,
): AufnahmePruefung {
  if (status !== 'Entwurf') {
    return {
      moeglich: false,
      grund: 'Der Schein ist unterschrieben. Fotos lassen sich danach nicht mehr ändern.',
    };
  }
  if (vorhanden >= MAX_FOTOS) {
    return { moeglich: false, grund: `Mehr als ${MAX_FOTOS} Fotos je Schein sind nicht vorgesehen.` };
  }
  return { moeglich: true };
}
