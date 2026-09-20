/**
 * DATANORM 4.0 lesen — der Artikelkatalog des Grosshändlers.
 *
 * WARUM DAS DIE WICHTIGSTE DER DREI SCHNITTSTELLEN IST. Der Materialstamm
 * wird heute von Hand gepflegt. Ein Installateur führt aber nicht dreissig
 * Artikel, sondern die Preisliste seines Grosshändlers — Zehntausende. Ohne
 * Katalog steht auf jeder Rechnung Material mit 0,00 €, die Nachkalkulation
 * weist einen Deckungsbeitrag aus, der um die Materialkosten zu hoch ist, und
 * das Büro tippt nach. Genau die Lücke, die `materialLuecken` heute BENENNT,
 * schliesst diese Datei.
 *
 * DIESER PARSER VERSCHWEIGT NICHTS, und das ist seine eigentliche Aufgabe.
 * DATANORM ist eine Norm, aber jeder Grosshändler legt sie ein wenig anders
 * aus: andere Satzarten, andere Reihenfolge, 4.0 neben 5.0, Preise mal als
 * Liste, mal netto. Ein Parser, der beim ersten Zweifel rät, erzeugt einen
 * Katalog, der vollständig AUSSIEHT und falsche Preise trägt — und das fällt
 * erst auf der Rechnung beim Kunden auf.
 *
 * Deshalb landet jede Zeile in genau einem von drei Töpfen: sie wird ein
 * Artikel, oder sie steht mit Nummer und Grund unter `unverstanden`, oder
 * ihre Satzart wird unter `uebersprungen` gezählt. Was hier herauskommt,
 * zeigt die Ansicht im Probelauf, bevor irgendetwas geschrieben wird.
 *
 * NICHT GEPRÜFT GEGEN EINE ECHTE LIEFERANTENDATEI. Die Feldreihenfolge unten
 * folgt der Norm; ob sie zur Datei des Grosshändlers passt, entscheidet der
 * Probelauf an echten Daten und nicht dieser Kommentar. Für den Fall, dass
 * sie NICHT passt, gibt es `layoutWarnung` — siehe dort.
 */

/** Was für ein Preis in der Datei steht — und das ist nicht dasselbe. */
export type PreisArt =
  /**
   * Listenpreis: der Bruttopreis der Preisliste, VOR dem Rabatt, den der
   * Betrieb mit seinem Grosshändler ausgehandelt hat. NICHT der
   * Einkaufspreis. Wer ihn dafür hält, rechnet die Baustelle zu teuer und
   * sieht einen Deckungsbeitrag, der zu niedrig ist.
   */
  | 'liste'
  /** Nettopreis: was der Betrieb tatsächlich zahlt. Das IST der Einkaufspreis. */
  | 'netto'
  /** Das Preiskennzeichen war leer oder unbekannt. Dann wird nichts behauptet. */
  | 'unbekannt';

/** Was der Satz mit dem Artikel tun will. */
export type Verarbeitung = 'neu' | 'aenderung' | 'loeschung';

export interface DatanormArtikel {
  /** Die Artikelnummer des Grosshändlers — der Schlüssel für den Abgleich. */
  artikelnummer: string;
  /** Kurztext 1 und 2 zusammengesetzt; das ist der Name im Katalog. */
  name: string;
  einheit?: string;
  /**
   * Preis je EINER Einheit in Euro.
   *
   * In der Datei steht er in Cent und bezogen auf die Preiseinheit (je 1, 10,
   * 100 oder 1000 Stück). Beides ist hier schon herausgerechnet — sonst
   * stünde im Katalog der tausendfache Preis, und zwar plausibel aussehend.
   */
  preis?: number;
  preisArt: PreisArt;
  /** Ohne sie lässt sich aus einem Listenpreis kein Einkaufspreis rechnen. */
  rabattgruppe?: string;
  warengruppe?: string;
  verarbeitung: Verarbeitung;
  /** Zeilennummer in der Datei — der Probelauf zeigt sie neben dem Ergebnis. */
  zeile: number;
}

/** Eine Zeile, die der Parser nicht einordnen konnte. */
export interface UnverstandeneZeile {
  zeile: number;
  /** Gekürzt — im Probelauf steht sie neben dem Grund. */
  inhalt: string;
  grund: string;
}

export interface DatanormErgebnis {
  /** Aus dem Vorlaufsatz: wer die Datei geschickt hat und wann. */
  kopf: { info?: string; datum?: string; waehrung?: string };
  artikel: DatanormArtikel[];
  unverstanden: UnverstandeneZeile[];
  /**
   * Satzarten, die es gibt, die dieser Parser aber nicht auswertet — je
   * Buchstabe gezählt. Langtexte (T), Preisänderungssätze (P) und
   * Warengruppen (W) gehören dazu.
   *
   * GEZÄHLT UND NICHT VERSCHWIEGEN: wer eine Datei einliest, in der 12.000
   * Preissätze stehen und 3 Artikel, soll das sehen, bevor er sich über den
   * leeren Katalog wundert.
   */
  uebersprungen: Record<string, number>;
}

/**
 * Die Preiseinheit: auf wie viele Stück sich der Preis bezieht.
 *
 * Ein Kupferrohr wird je Meter geführt, Dichtringe je 100 Stück. Ohne diese
 * Umrechnung stünde der hundertfache Preis im Katalog — und er sähe aus wie
 * ein Preis.
 */
const PREISEINHEIT: Record<string, number> = { '0': 1, '1': 10, '2': 100, '3': 1000 };

/**
 * Das Preiskennzeichen der Norm: 0 = Listenpreis, 1 = Nettopreis.
 *
 * Weitere Kennzeichen kommen vor, ihre Bedeutung ist aber je nach Ausgabe der
 * Norm verschieden. Sie werden deshalb „unbekannt" — und ein unbekannter
 * Preis wird im Probelauf gezeigt, statt als Einkaufspreis übernommen zu
 * werden. Raten hiesse: mal den Listenpreis als Einkauf zu buchen.
 */
const PREISART: Record<string, PreisArt> = { '0': 'liste', '1': 'netto' };

const VERARBEITUNG: Record<string, Verarbeitung> = {
  N: 'neu',
  A: 'aenderung',
  Ä: 'aenderung',
  L: 'loeschung',
};

/**
 * Die obere Hälfte von CP850 — der DOS-Zeichensatz, in dem DATANORM gross
 * geworden ist. Node kennt ihn nicht, Browser auch nicht; darum steht er hier.
 */
const CP850 =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒ' +
  'áíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐' +
  '└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀' +
  'ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';

/** Welcher Zeichensatz gelesen wurde — der Probelauf nennt ihn. */
export type Zeichensatz = 'utf-8' | 'windows-1252' | 'cp850';

export interface Dekodiert {
  text: string;
  zeichensatz: Zeichensatz;
}

/**
 * DATANORM-Dateien sind selten UTF-8.
 *
 * Der Grosshandel liefert CP850 (DOS) oder Windows-1252. Liest man das als
 * UTF-8, wird aus „Eckventil für Waschtisch" ein „Eckventil f?r Waschtisch" —
 * und zwar in jedem zweiten Artikelnamen. Der Katalog ist dann unbrauchbar
 * und sieht nur unschön aus, statt kaputt.
 *
 * ERKANNT STATT EINGESTELLT, in dieser Reihenfolge:
 *
 *  1. UTF-8 versuchen. Steht darin kein Ersatzzeichen U+FFFD, war es UTF-8.
 *  2. Sonst zählen, WO die Bytes über 127 liegen. CP850 legt die Umlaute nach
 *     0x80–0x9F (ü=0x81, ä=0x84, ö=0x94), Windows-1252 nach 0xC0–0xFF
 *     (ü=0xFC, ä=0xE4, ö=0xF6). In Windows-1252-Text stehen unten höchstens
 *     vereinzelt Anführungszeichen und Gedankenstriche; liegt die Mehrheit
 *     dort, ist es DOS.
 *
 * Welcher Weg genommen wurde, kommt MIT heraus. Sieht die Vorschau im
 * Probelauf falsch aus, steht daneben, woran es liegt — statt dass jemand
 * raten muss.
 */
export function dekodiere(daten: ArrayBuffer): Dekodiert {
  const alsUtf8 = new TextDecoder('utf-8').decode(daten);
  if (!alsUtf8.includes('�')) return { text: alsUtf8, zeichensatz: 'utf-8' };

  const bytes = new Uint8Array(daten);
  let unten = 0;
  let oben = 0;
  for (const b of bytes) {
    if (b >= 0x80 && b <= 0x9f) unten += 1;
    else if (b >= 0xa0) oben += 1;
  }

  if (unten > oben) {
    let text = '';
    for (const b of bytes) text += b < 0x80 ? String.fromCharCode(b) : CP850[b - 0x80];
    return { text, zeichensatz: 'cp850' };
  }
  return { text: new TextDecoder('windows-1252').decode(daten), zeichensatz: 'windows-1252' };
}

/** Leerer Wert oder nur Leerzeichen — in DATANORM dasselbe wie „nicht gesetzt". */
const leer = (s: string | undefined) => s === undefined || s.trim() === '';

/** Aus „2350" wird 23.50; aus Unsinn wird `undefined` statt einer Null. */
function centAlsEuro(roh: string | undefined, teiler: number): number | undefined {
  if (leer(roh)) return undefined;
  const geputzt = roh!.trim();
  // `Number('')` ist 0 und `Number('12 ')` ist 12 — beides hier unerwünscht.
  if (!/^-?\d+$/.test(geputzt)) return undefined;
  return Math.round((Number(geputzt) / 100 / teiler) * 10000) / 10000;
}

/**
 * Liest eine DATANORM-Datei.
 *
 * @param text Der bereits dekodierte Inhalt (siehe `dekodiere`).
 */
export function liesDatanorm(text: string): DatanormErgebnis {
  const ergebnis: DatanormErgebnis = {
    kopf: {},
    artikel: [],
    unverstanden: [],
    uebersprungen: {},
  };

  const zeilen = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < zeilen.length; i += 1) {
    const roh = zeilen[i];
    const nummer = i + 1;
    if (roh.trim() === '') continue;

    const f = roh.split(';');
    const satzart = (f[0] ?? '').trim().toUpperCase();

    if (satzart === 'V') {
      // Vorlaufsatz: V;Datum;Info;Währung;…
      ergebnis.kopf = {
        datum: leer(f[1]) ? undefined : f[1].trim(),
        info: leer(f[2]) ? undefined : f[2].trim(),
        waehrung: leer(f[3]) ? undefined : f[3].trim(),
      };
      continue;
    }

    if (satzart !== 'A') {
      /*
        Andere Satzarten gibt es, und sie sind nicht falsch — sie werden nur
        hier nicht ausgewertet. Gezählt, damit der Probelauf sagen kann,
        WORAUS die Datei besteht.
      */
      const schluessel = satzart || '(leer)';
      ergebnis.uebersprungen[schluessel] = (ergebnis.uebersprungen[schluessel] ?? 0) + 1;
      continue;
    }

    const kurz = (n: number) => (leer(f[n]) ? '' : f[n].trim());

    const verarbeitung = VERARBEITUNG[kurz(1).toUpperCase()];
    if (!verarbeitung) {
      ergebnis.unverstanden.push({
        zeile: nummer,
        inhalt: roh.slice(0, 120),
        grund: `Unbekanntes Verarbeitungskennzeichen „${kurz(1)}" — erwartet N, A oder L.`,
      });
      continue;
    }

    const artikelnummer = kurz(2);
    if (artikelnummer === '') {
      ergebnis.unverstanden.push({
        zeile: nummer,
        inhalt: roh.slice(0, 120),
        grund: 'Ohne Artikelnummer — sie ist der Schlüssel für den Abgleich.',
      });
      continue;
    }

    const name = [kurz(4), kurz(5)].filter((t) => t !== '').join(' ');
    if (name === '' && verarbeitung !== 'loeschung') {
      /*
        Ein Löschsatz darf ohne Text kommen — er nennt nur die Nummer. Ein
        neuer Artikel ohne Bezeichnung wäre dagegen eine Zeile im Katalog,
        die niemand wiederfindet.
      */
      ergebnis.unverstanden.push({
        zeile: nummer,
        inhalt: roh.slice(0, 120),
        grund: 'Ohne Bezeichnung — ein Artikel ohne Text ist im Katalog nicht auffindbar.',
      });
      continue;
    }

    const preisArt = PREISART[kurz(6)] ?? 'unbekannt';
    const teiler = PREISEINHEIT[kurz(7)] ?? 1;
    const preis = centAlsEuro(f[9], teiler);

    /*
      EIN PREIS, DER KEINER IST, WIRD NICHT ZU NULL. „Nicht hinterlegt" und
      „kostet nichts" sind zwei Aussagen — dieselbe Unterscheidung, die der
      Materialstamm und die Nachkalkulation schon treffen.
    */
    if (!leer(f[9]) && preis === undefined) {
      ergebnis.unverstanden.push({
        zeile: nummer,
        inhalt: roh.slice(0, 120),
        grund: `Preisfeld „${f[9].trim()}" ist keine Zahl.`,
      });
      continue;
    }

    ergebnis.artikel.push({
      artikelnummer,
      name,
      einheit: leer(f[8]) ? undefined : f[8].trim(),
      preis,
      preisArt,
      rabattgruppe: leer(f[10]) ? undefined : f[10].trim(),
      warengruppe: leer(f[11]) ? undefined : f[11].trim(),
      verarbeitung,
      zeile: nummer,
    });
  }

  return ergebnis;
}

/** Was der Probelauf in einem Satz sagt. */
export interface DatanormBefund {
  artikel: number;
  neu: number;
  aenderungen: number;
  loeschungen: number;
  ohnePreis: number;
  /** Artikel, deren Preis ein LISTENpreis ist — ohne Rabattsatz kein Einkauf. */
  nurListenpreis: number;
  unverstanden: number;
  uebersprungen: number;
}

/**
 * Die Zahlen für den Probelauf.
 *
 * WARUM DAS EIGEN GERECHNET WIRD UND NICHT IN DER ANSICHT: dieselbe Zahl
 * steht später im Bericht, im Protokoll und in der Bestätigung. Eine Ansicht,
 * die selbst zählt, zählt eines Tages anders.
 */
export function befunde(e: DatanormErgebnis): DatanormBefund {
  return {
    artikel: e.artikel.length,
    neu: e.artikel.filter((a) => a.verarbeitung === 'neu').length,
    aenderungen: e.artikel.filter((a) => a.verarbeitung === 'aenderung').length,
    loeschungen: e.artikel.filter((a) => a.verarbeitung === 'loeschung').length,
    ohnePreis: e.artikel.filter((a) => a.verarbeitung !== 'loeschung' && a.preis === undefined)
      .length,
    nurListenpreis: e.artikel.filter((a) => a.preis !== undefined && a.preisArt === 'liste').length,
    unverstanden: e.unverstanden.length,
    uebersprungen: Object.values(e.uebersprungen).reduce((s, n) => s + n, 0),
  };
}

/**
 * Der Verdacht, dass die Felder in der Datei ANDERS stehen als in der Norm.
 *
 * DAS IST DER GEFÄHRLICHSTE FEHLER DIESER SCHNITTSTELLE. Verrutscht die
 * Feldreihenfolge um eine Stelle, kann alles formal aufgehen: die Zeile wird
 * gelesen, es kommen Artikel heraus, der Probelauf zeigt eine grosse Zahl —
 * und im Katalog steht die Lieferantennummer als Artikelnummer und der
 * Rabattsatz als Preis. Ein Abbruch mit Fehlermeldung wäre harmlos dagegen.
 *
 * Zwei Spuren verraten es, ohne dass man die Datei kennen muss:
 *
 *  1. Ein grosser Teil der A-Sätze scheitert — mindestens ein Viertel, und
 *     mindestens drei. Passt das Layout, scheitern einzelne Zeilen; passt es
 *     nicht, scheitern sie reihenweise am gleichen Feld.
 *  2. Die Artikelnummern wiederholen sich. Ein Katalog hat je Artikel eine
 *     Nummer; steht in dem Feld in Wahrheit die Katalog- oder
 *     Lieferantennummer, ist sie in jeder Zeile dieselbe.
 *
 * WARUM „UND MINDESTENS DREI". Der Anteil allein genügt nicht: in einer
 * Nachlieferung mit acht Artikeln ist eine krumme Zeile schon ein Achtel, in
 * einer mit vieren ein Viertel. Der ganze Import stünde dann wegen EINES
 * Datenfehlers des Lieferanten — und die Zeile steht ohnehin im Befund. Ein
 * verschobenes Layout scheitert nicht einmal, sondern reihenweise.
 *
 * Gibt diese Funktion einen Satz zurück, wird im Probelauf nicht übernommen.
 */
export function layoutWarnung(e: DatanormErgebnis): string | undefined {
  const aSaetze = e.artikel.length + e.unverstanden.length;
  if (aSaetze === 0) return undefined;

  if (e.unverstanden.length >= 3 && e.unverstanden.length * 4 >= aSaetze) {
    const anteil = Math.round((e.unverstanden.length / aSaetze) * 100);
    return (
      `${anteil} % der Artikelsätze (${e.unverstanden.length} von ${aSaetze}) wurden nicht ` +
      'verstanden. Das deutet darauf hin, dass die Felder in dieser Datei anders stehen als ' +
      'in DATANORM 4.0 vorgesehen. Es wird nichts übernommen — bitte die Datei mit dem ' +
      'Grosshändler prüfen.'
    );
  }

  const nummern = new Set(e.artikel.map((a) => a.artikelnummer));
  if (e.artikel.length >= 3 && nummern.size * 2 <= e.artikel.length) {
    return (
      `${e.artikel.length} Artikelsätze teilen sich nur ${nummern.size} Artikelnummer(n). ` +
      'Vermutlich steht an dieser Stelle in Wahrheit die Katalog- oder Lieferantennummer, ' +
      'und alle weiteren Felder sind verschoben. Es wird nichts übernommen — bitte die Datei ' +
      'mit dem Grosshändler prüfen.'
    );
  }

  return undefined;
}
