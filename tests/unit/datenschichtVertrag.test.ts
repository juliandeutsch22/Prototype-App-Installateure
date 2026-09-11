/**
 * DER VERTRAG DER DATENSCHICHT.
 *
 * Stufe 3 tauscht das Innere der zwanzig Module gegen Postgres und lässt ihre
 * Aussenseite gleich — das ist der ganze Grund, warum in dieser Stufe keine
 * Ansicht angefasst werden muss. Die Behauptung „die Signaturen bleiben"
 * gehört aber nicht in einen Kommentar, sondern in eine Prüfung.
 *
 * Diese Datei liest mit dem TypeScript-Compiler jede ausgeführte Funktion aus
 * `src/lib/db` samt ihrer Typen und vergleicht sie mit einer festgehaltenen
 * Fassung. Ändert sich eine Signatur, fällt der Lauf — und wer sie wirklich
 * ändern will, muss die Fassung bewusst nachziehen und erklärt damit im
 * Verlauf, was er getan hat.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const FASSUNG = resolve(process.cwd(), 'tests/unit/datenschichtVertrag.txt');

function signaturen(): string[] {
  const konfig = ts.readConfigFile(resolve(process.cwd(), 'tsconfig.json'), ts.sys.readFile);
  const geparst = ts.parseJsonConfigFileContent(
    konfig.config, ts.sys, resolve(process.cwd()),
  );
  const programm = ts.createProgram(geparst.fileNames, geparst.options);
  const pruefer = programm.getTypeChecker();
  const raus: string[] = [];

  for (const quelle of programm.getSourceFiles()) {
    const pfad = quelle.fileName.replace(`${process.cwd()}/`, '');
    if (!pfad.startsWith('src/lib/db/')) continue;

    const modul = pruefer.getSymbolAtLocation(quelle);
    if (!modul) continue;

    for (const zeichen of pruefer.getExportsOfModule(modul)) {
      /*
       * Reine TYP-Exporte bleiben draussen.
       *
       * Sie kämen hier als `any` heraus und stünden damit als Zusage im
       * Vertrag, die gar nichts zusagt. Nötig sind sie auch nicht: ändert
       * sich ein Typ, bricht der Typprüfer an jeder Ansicht, die ihn
       * benutzt — das ist die schärfere Prüfung.
       */
      const hatWert = (zeichen.flags & ts.SymbolFlags.Value) !== 0;
      if (!hatWert) continue;

      const typ = pruefer.getTypeOfSymbolAtLocation(zeichen, quelle);
      const text = pruefer.typeToString(
        typ, quelle,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType,
      );
      raus.push(`${pfad}#${zeichen.getName()}: ${text}`);
    }
  }
  return raus.sort();
}

describe('Die Datenschicht behält ihre Aussenseite', () => {
  it('kein Export hat seine Signatur verändert', () => {
    const jetzt = signaturen();

    if (!existsSync(FASSUNG)) {
      // Beim ersten Lauf wird die Fassung angelegt. Danach ist sie der Massstab.
      writeFileSync(FASSUNG, `${jetzt.join('\n')}\n`, 'utf8');
    }

    const fest = readFileSync(FASSUNG, 'utf8').trim().split('\n');

    const verschwunden = fest.filter((z) => !jetzt.includes(z));
    const neu = jetzt.filter((z) => !fest.includes(z));

    // Neue Exporte sind erlaubt — die Datenschicht darf wachsen. Verschwundene
    // oder veränderte nicht: dort hängen Ansichten dran, die niemand anfasst.
    expect({ verschwunden, anzahlNeu: neu.length })
      .toEqual({ verschwunden: [], anzahlNeu: neu.length });
  });

  it('es sind mindestens die 123, mit denen Stufe 3 begonnen hat', () => {
    expect(signaturen().length).toBeGreaterThanOrEqual(123);
  });
});
