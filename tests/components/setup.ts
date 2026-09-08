import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Nach jedem Test das DOM leeren. Ohne das sammeln sich die gerenderten
// Bäume an und eine Abfrage wie getByRole('button') findet plötzlich
// Elemente aus einem früheren Test.
afterEach(cleanup);

/**
 * Kein Komponenten-Test spricht mit Firebase.
 *
 * `lib/firebase` baut beim Import eine echte Verbindung auf (und wirft ohne
 * Konfiguration). Ein Test, der eine Ansicht rendert, zöge das über die
 * Datenbank-Module unweigerlich mit herein — und würde damit still zu einem
 * Netzwerktest, der mal läuft und mal nicht. Was aus der Datenbank kommt,
 * setzt jeder Test selbst per `vi.mock`.
 */
vi.mock('@/lib/firebase', () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
}));

/**
 * jsdom kann kein Canvas. Das Unterschriftenfeld holt sich einen 2D-Kontext
 * und kommt ohne ihn auch zurecht — jsdom wirft dabei aber jedes Mal eine
 * seitenlange „Not implemented"-Meldung auf stderr. Die Testausgabe wird
 * dadurch unlesbar, und in einer unlesbaren Ausgabe übersieht man echte
 * Fehler. Ein stiller Null-Kontext genügt.
 *
 * Nur wenn ein DOM da ist: dieselbe Vorbereitung läuft auch für die reinen
 * Logiktests, und die haben kein `HTMLCanvasElement`.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement['getContext'];
}

/**
 * jsdom kennt `URL.createObjectURL` nicht.
 *
 * Die Fotovorschau am Handwerksschein braucht es — ohne Ersatz wirft schon
 * das ANLEGEN der Vorschau, und der Fehler sieht dann aus, als sei das
 * Hochladen gescheitert. Genau darauf bin ich beim Schreiben dieser Tests
 * hereingefallen: die Komprimierung lief, der Upload nicht, und die Ursache
 * lag drei Zeilen dazwischen.
 *
 * Ein Zähler statt einer festen Zeichenkette, damit zwei Vorschauen zwei
 * verschiedene Schlüssel bekommen — die Liste im Formular hängt daran.
 */
if (typeof URL !== 'undefined' && !URL.createObjectURL) {
  let lauf = 0;
  URL.createObjectURL = () => `blob:test/${++lauf}`;
  URL.revokeObjectURL = () => undefined;
}
