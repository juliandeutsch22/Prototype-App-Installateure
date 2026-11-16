/**
 * KEINE `vite.config.js` NEBEN DER `.ts` (Durchsicht 15.11.2026).
 *
 * `tsconfig.node.json` war ein Verweis mit `composite`; `tsc -b` legte dabei
 * `vite.config.js` neben `vite.config.ts` ab. Vite sucht die `.js` zuerst —
 * ein späteres `npx vite build` lief mit einem veralteten Stand der
 * Konfiguration (Leistungswächter, Kopfzeilen), ohne dass es jemand sah.
 *
 * Geprüft wird hier, was der Bau wirklich tut: das Programm aus
 * `tsconfig.node.json` übersetzen und mitschreiben, was es ablegen würde.
 * Gegenprobe: mit dem Stand davor (`composite`, ohne `noEmit`) schreibt es
 * `vite.config.js` — rot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const wurzel = join(__dirname, '../..');

function programmAus(datei: string) {
  const gelesen = ts.readConfigFile(join(wurzel, datei), (p) => ts.sys.readFile(p));
  expect(gelesen.error).toBeUndefined();
  const konfig = ts.parseJsonConfigFileContent(gelesen.config, ts.sys, wurzel, undefined, join(wurzel, datei));
  return { konfig, programm: ts.createProgram({ rootNames: konfig.fileNames, options: konfig.options }) };
}

describe('Typprüfung der Vite-Konfiguration', () => {
  it('legt keine Datei ab — schon gar keine vite.config.js', () => {
    const { programm } = programmAus('tsconfig.node.json');
    const geschrieben: string[] = [];
    programm.emit(undefined, (name) => { geschrieben.push(name); });
    expect(geschrieben).toEqual([]);
  });

  it('bleibt gleich: vite.config.ts wird weiter geprüft, und ohne Fehler', () => {
    const { konfig, programm } = programmAus('tsconfig.node.json');
    expect(konfig.fileNames.map((f) => f.replace(/\\/g, '/'))).toEqual([`${wurzel.replace(/\\/g, '/')}/vite.config.ts`]);
    const fehler = ts.getPreEmitDiagnostics(programm).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(fehler).toEqual([]);
  });

  it('bleibt gleich: der Bau prüft die Konfiguration mit, bevor Vite baut', () => {
    const paket = JSON.parse(readFileSync(join(wurzel, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    const [pruefen, bauen] = paket.scripts.build.split('&&').map((s) => s.trim());
    expect(pruefen.split(/\s+/)).toEqual(expect.arrayContaining(['tsc', 'tsconfig.json', 'tsconfig.node.json']));
    expect(bauen).toBe('vite build');
  });
});
