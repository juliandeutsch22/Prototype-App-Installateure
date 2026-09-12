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
    /*
      NUR DIE AUSSENSEITE, nicht das Innere.

      Der Vertrag sagt zu, dass die Ansichten nichts merken. Sie importieren
      aus `src/lib/db/x.ts` — den Weichen. Was in `fs/` und `pg/` steht, ist
      das Innere, das diese Stufe gerade austauscht; es hier festzunageln
      hiesse, die Fassung bei jedem Modul nachzuziehen, und eine Fassung, die
      dauernd nachgezogen wird, sagt bald gar nichts mehr.
    */
    if (pfad.startsWith('src/lib/db/fs/') || pfad.startsWith('src/lib/db/pg/')) continue;

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
      /*
        DURCHGEREICHTE EXPORTE ZÄHLEN MIT.

        `export { x } from './y'` liefert hier ein ALIAS und keinen Wert —
        `flags & Value` ist null, und die Prüfung liess solche Exporte
        stillschweigend aus dem Vertrag fallen. Betroffen waren die
        Rechennamen der Rechnungsnummern und die Vorgaben der Belegschaft:
        beides Dinge, die Ansichten importieren, und beides ungeprüft.

        Für den Aufrufer ist ein durchgereichter Export nicht von einem
        eigenen zu unterscheiden — also gehört er in den Vertrag.
      */
      const aufgeloest = (zeichen.flags & ts.SymbolFlags.Alias) !== 0
        ? pruefer.getAliasedSymbol(zeichen)
        : zeichen;

      const hatWert = (aufgeloest.flags & ts.SymbolFlags.Value) !== 0;
      if (!hatWert) continue;

      const typ = pruefer.getTypeOfSymbolAtLocation(aufgeloest, quelle);
      const text = pruefer.typeToString(
        typ, quelle,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType,
      );
      /*
        Der Compiler schreibt einen voll qualifizierten Typ mitunter als
        `import("/home/.../src/lib/db/core").WithId` — mit dem ABSOLUTEN Pfad
        dieses Rechners. In einer festgehaltenen Fassung ist das eine
        Zeitbombe: auf jedem anderen Rechner und in jedem Lauf auf fremder
        Hardware stünde ein anderer Pfad, und die Prüfung fiele aus einem
        Grund, der mit der Datenschicht nichts zu tun hat. Eine Zeile dieser
        Art stand bereits in der Fassung.
      */
      raus.push(`${pfad}#${zeichen.getName()}: ${text.split(`${process.cwd()}/`).join('')}`);
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

  /*
    DER WÄCHTER ÜBER DEN WÄCHTER.

    Er zählt, weil ein Vertrag, der nichts mehr findet, grün meldet. Die Zahl
    ist am 12.09.2026 von 123 auf 143 gestiegen, ohne dass ein Export
    hinzugekommen wäre: durchgereichte Exporte (`export { x } from './y'`)
    kamen als Alias heraus und fielen stillschweigend aus dem Vertrag. Neun
    Namen waren betroffen, darunter die Rechennamen der Rechnungsnummern und
    die Vorgaben der Belegschaft — alles Dinge, die Ansichten importieren.
  */
  it('es sind mindestens die 143, die der Vertrag heute trägt', () => {
    expect(signaturen().length).toBeGreaterThanOrEqual(143);
  });
});
