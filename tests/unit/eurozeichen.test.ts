import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * „€ 22 104,60 €" — das Zeichen stand zweimal da.
 *
 * GESEHEN AUF EINEM TELEFON, NICHT IM QUELLTEXT. Auf der Mahnlauf-Karte stand
 * „€ 22 104,60 € offen"; sechs Stellen in `InvoicesView` hängten ein zweites
 * Eurozeichen an einen Betrag, der es schon trug.
 *
 * DER GRUND IST DER NAME, NICHT DIE UNACHTSAMKEIT. `fmtEUR` gibt es in ACHT
 * Dateien:
 *
 *   MIT vorangestelltem €   InvoicesView, QuotesView, KundenakteView,
 *                           NachkalkulationView, DashboardView
 *   OHNE                    pdf.ts, mahnungPdf.ts, SettingsView
 *
 * Zwei gleichnamige Funktionen mit verschiedenem Verhalten sind eine Falle:
 * wer aus der Nachbardatei abschreibt, schreibt die falsche Hälfte ab. Auf
 * einen Betrag geschaut fällt das nie auf — nur auf den Beleg.
 *
 * WARUM DIE ACHT KOPIEN NICHT ZU EINER WERDEN. Das wäre die gründlichere
 * Antwort und ein Eingriff in acht Ansichten, von denen zwei PDFs erzeugen
 * und je eigene Nachkommastellen führen (die Startseite rundet auf ganze
 * Euro). Diese Prüfung kostet nichts und fängt genau den Fehler, der
 * aufgetreten ist. Wird zusammengelegt, fällt sie ersatzlos weg.
 */

/** Jede Datei, die ein eigenes `fmtEUR` hat. */
function dateienMitEigenemFmtEUR(): string[] {
  const roh = execSync(
    'grep -rl "const fmtEUR" --include=*.ts --include=*.tsx src/',
    { encoding: 'utf8' },
  );
  return roh.split('\n').filter(Boolean);
}

/** Stellt diese Fassung das Zeichen voran? */
function stelltVoran(quelle: string): boolean {
  const start = quelle.indexOf('const fmtEUR');
  return /`€ \$\{/.test(quelle.slice(start, start + 220));
}

describe('Das Eurozeichen steht genau einmal da', () => {
  const dateien = dateienMitEigenemFmtEUR();

  it('es gibt die acht Kopien überhaupt noch — sonst prüft das hier nichts', () => {
    /*
      DER WÄCHTER ÜBER DEN WÄCHTER. Würden die Kopien zusammengelegt, fände
      die Prüfung unten nichts mehr und meldete fröhlich grün. Diese Zeile
      fällt dann und sagt, dass die Prüfung ihre Grundlage verloren hat.
    */
    expect(dateien.length).toBeGreaterThanOrEqual(5);
  });

  it.each(dateienMitEigenemFmtEUR())(
    'in %s hängt keine Aufrufstelle ein zweites Zeichen an',
    (pfad) => {
      const quelle = readFileSync(pfad, 'utf8');
      if (!stelltVoran(quelle)) return; // Dort GEHÖRT das Zeichen hinten hin.

      /*
        Gesucht wird `fmtEUR(...)` mit einem € unmittelbar danach — in JSX
        (`{fmtEUR(x)} €`) wie im Textbaustein (`${fmtEUR(x)} €`). Beides kam
        vor.
      */
      const doppelt = [...quelle.matchAll(/fmtEUR\([^)]*\)[}`]?\s*€/g)]
        .map((m) => m[0]);

      expect(doppelt, `„${doppelt[0]}" in ${pfad}`).toEqual([]);
    },
  );
});
