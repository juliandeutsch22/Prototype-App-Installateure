/**
 * Eine JSON-Datei aus Teilen zusammensetzen (K4, Durchsicht 15.11.2026).
 *
 * WOFÜR. „Alle Daten herunterladen“ und die Datenauskunft kamen in EINER
 * Antwort und brachen über 8 MB ab. Jetzt legt die Datenbank eine
 * Arbeitskopie an und gibt sie in Seiten zu rund 1 MB heraus
 * (`20261116072000_auszug_in_teilen.sql`); jede Zeile darin ist ein Stück der
 * Datei mit seinem Ort (`pfad`): ein Eintrag einer Liste (`element`) oder ein
 * ganzer Wert (`wert`).
 *
 * WARUM ALS TEXTSTÜCKE UND NICHT ALS EIN OBJEKT. Ein Betrieb mit Historie hat
 * schnell Hunderte Megabyte; das ganze Objekt im Speicher und dann noch
 * einmal als ein String sprengte am Telefon den Browser. Hier entsteht die
 * Datei Stück für Stück als Folge von Texten, aus der der Browser eine Datei
 * macht, ohne sie je als Ganzes zu halten.
 *
 * DIE GESTALT IST DIESELBE wie beim Abruf in einem Stück — wer die Datei
 * weiterverarbeitet, merkt keinen Unterschied. Lesbar eingerückt, ein
 * Eintrag je Zeile.
 */

export interface AuszugZeile {
  pfad: string[];
  element?: unknown;
  wert?: unknown;
}

interface Rahmen {
  schluessel: string;
  art: 'objekt' | 'liste';
  leer: boolean;
}

export interface JsonTeile {
  /** Ein Stück anhängen. Die Stücke eines Behälters müssen beieinander stehen. */
  zeile(z: AuszugZeile): void;
  /** Alle Behälter schließen; die Texte ergeben zusammen die Datei. */
  fertig(): { teile: string[]; kopf: Record<string, unknown> };
}

export function jsonAusTeilen(): JsonTeile {
  const teile: string[] = [];
  const kopf: Record<string, unknown> = {};
  // Der äußerste Rahmen ist das Objekt der Datei selbst.
  const stapel: Rahmen[] = [{ schluessel: '', art: 'objekt', leer: true }];
  const geschlossen = new Set<string>();
  teile.push('{');

  const einzug = (tiefe: number) => '\n' + '  '.repeat(tiefe);
  const ort = (rahmen: Rahmen[]) => rahmen.slice(1).map((r) => `${r.art}:${r.schluessel}`).join('/');

  function schliessen() {
    const r = stapel.pop()!;
    geschlossen.add(ort([...stapel, r]));
    teile.push(r.leer ? '' : einzug(stapel.length), r.art === 'liste' ? ']' : '}');
  }

  /** Vor einem neuen Eintrag im obersten Rahmen: Komma und Einzug. */
  function eintragBeginnen() {
    const oben = stapel[stapel.length - 1];
    teile.push(oben.leer ? '' : ',', einzug(stapel.length));
    oben.leer = false;
  }

  function oeffnen(r: Omit<Rahmen, 'leer'>) {
    const neu = [...stapel, { ...r, leer: true }];
    /*
      EIN BEHÄLTER WIRD NUR EINMAL GEÖFFNET. Käme ein Stück für eine Liste,
      die schon geschlossen ist, entstünde derselbe Schlüssel zweimal — und
      wer die Datei liest, behielte nur einen der beiden. Lieber abbrechen
      als still eine halbe Auskunft herausgeben.
    */
    if (geschlossen.has(ort(neu))) {
      throw new Error('Die Teile des Auszugs kamen in falscher Reihenfolge. Bitte den Download neu beginnen.');
    }
    eintragBeginnen();
    teile.push(JSON.stringify(r.schluessel), ': ', r.art === 'liste' ? '[' : '{');
    stapel.push({ ...r, leer: true });
  }

  function hinGehen(ziel: Omit<Rahmen, 'leer'>[]) {
    let gleich = 0;
    while (
      gleich < ziel.length && gleich + 1 < stapel.length
      && stapel[gleich + 1].schluessel === ziel[gleich].schluessel
      && stapel[gleich + 1].art === ziel[gleich].art
    ) gleich += 1;
    while (stapel.length - 1 > gleich) schliessen();
    for (const r of ziel.slice(gleich)) oeffnen(r);
  }

  return {
    zeile(z) {
      if (!Array.isArray(z.pfad) || z.pfad.length === 0) throw new Error('Ein Teil des Auszugs hat keinen Ort.');
      const objekte = z.pfad.slice(0, -1).map((schluessel) => ({ schluessel, art: 'objekt' as const }));
      const letzter = z.pfad[z.pfad.length - 1];
      if ('element' in z) {
        hinGehen([...objekte, { schluessel: letzter, art: 'liste' }]);
        eintragBeginnen();
        teile.push(JSON.stringify(z.element));
      } else {
        hinGehen(objekte);
        eintragBeginnen();
        teile.push(JSON.stringify(letzter), ': ', JSON.stringify(z.wert ?? null));
        if (z.pfad.length === 1) kopf[letzter] = z.wert;
      }
    },
    fertig() {
      while (stapel.length > 1) schliessen();
      teile.push(einzug(0), '}', '\n');
      return { teile, kopf };
    },
  };
}
