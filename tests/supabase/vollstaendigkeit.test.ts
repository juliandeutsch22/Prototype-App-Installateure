/**
 * Ist beim Portieren etwas unter den Tisch gefallen?
 *
 * Die Vorgabe für den Umzug lautet: keine bestehende Funktion darf fehlen.
 * Für das Prüfnetz heisst das, dass jede der 155 Regelprüfungen aus Firestore
 * eine Entsprechung haben muss.
 *
 * Diese Datei prüft das MASCHINELL, statt sich darauf zu verlassen, dass
 * jemand beim Abhaken aufmerksam war.
 *
 * DIE GEGENSEITE IST SEIT DEM 19.09.2026 EINE TEXTFASSUNG. Bis dahin las
 * dieser Test die Titel unmittelbar aus `tests/firestore.rules.test.ts`.
 * Diese Datei ist mit Firestore gefallen — und hätte sie den Beweis
 * mitgenommen, wäre ausgerechnet die Zusicherung verschwunden, dass beim
 * Umzug nichts verlorenging.
 *
 * `regelnAusFirestore.txt` hält die 155 Titel deshalb wörtlich fest. Sie sind
 * eine TATSACHE über den Umzug und keine Eigenschaft von Firestore: was
 * damals galt, muss weiter gelten, auch wenn die Datenbank, für die es
 * geschrieben wurde, nicht mehr läuft. Die Liste ändert sich nie wieder —
 * wer sie anfasst, verschiebt die Messlatte und muss das begründen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function titel(datei: string): string[] {
  const inhalt = readFileSync(resolve(process.cwd(), datei), 'utf8');
  const muster = /^\s*it\(\s*(['"`])([\s\S]*?)\1/gm;
  const raus: string[] = [];
  for (const m of inhalt.matchAll(muster)) raus.push(m[2].replace(/\s+/g, ' ').trim());
  return raus;
}

/** Die festgehaltenen Titel der Firestore-Regelprüfungen. */
function ausFirestore(): string[] {
  return readFileSync(resolve(process.cwd(), 'tests/supabase/regelnAusFirestore.txt'), 'utf8')
    .trim()
    .split('\n');
}

/**
 * Prüfungen, die bewusst NICHT eins zu eins portiert sind, mit Grund.
 *
 * Jeder Eintrag hier ist eine Behauptung, die jemand nachlesen können muss.
 * Eine leere Begründung wäre schlimmer als eine fehlende Prüfung, weil sie
 * so aussieht, als hätte jemand nachgedacht.
 */
const ANDERS_GELOEST: Record<string, string> = {
  /*
    EINE BEWUSST GEÄNDERTE REGEL, keine verlorene Prüfung (Auftrag
    04.11.2026, E42): ein Entwurf ist kein Beleg und lässt sich löschen.
  */
  'geloescht wird kein Schein, in keinem Zustand':
    'Seit 04.11.2026 (E42) lässt sich ein Entwurf löschen; dass ein unterschriebener Schein nie gelöscht wird, prüft in regeln.test.ts „geloescht wird kein unterschriebener Schein — ein Entwurf seit 04.11.2026 schon“, dazu scheinEntwurfLoeschen.test.ts.',
  /*
    BEWUSST GEÄNDERTE REGELN DER DURCHSICHT VOM 15.11.2026 (Welle 2). G11:
    eine Rechnungsnummer entsteht nur mit ihrer Rechnung oder Stornorechnung
    — direkt gezogen, wurde sie nie ein Beleg und riss eine Lücke in den
    lückenlosen Kreis. G10: der Kreis zählt im laufenden Jahr in Wien; ein
    anderes Jahr nimmt die Schnittstelle nicht mehr an. M7: eine Retoure
    bucht den Bestand erst mit der Annahme im Lager.
  */
  'Buchhaltung darf den Zaehler anlegen und hochzaehlen':
    'Seit G11 zieht niemand eine Rechnungsnummer direkt; regeln.test.ts „die Buchhaltung zieht keine Rechnungsnummer mehr direkt“, der Kreis (1001, monoton, je Betrieb) über das Ausstellen in rechnungInEinemZug.test.ts und modulGeld.test.ts.',
  'der Zaehler darf NICHT zurueckgesetzt werden':
    'Zusammengefasst in regeln.test.ts „der Zaehler darf NICHT zurueckgesetzt und nicht geloescht werden“ — an die Tabelle kommt niemand heran; weiterzählen lässt sich seit G11 nur über das Ausstellen.',
  'der Zaehler darf nicht geloescht werden':
    'Zusammengefasst in regeln.test.ts „der Zaehler darf NICHT zurueckgesetzt und nicht geloescht werden“ (Löschversuch ohne Wirkung).',
  'eine fremde Firma kommt an den Zaehler nicht heran':
    'regeln.test.ts „eine fremde Firma sieht keinen fremden Zaehler“; dass jeder Betrieb seinen eigenen Kreis hat, prüft durchstich4.test.ts „führt für jeden Betrieb einen eigenen Nummernkreis“ über das Ausstellen.',
  'der Monteur schreibt eine Retoure zurück':
    'Seit M7 meldet der Monteur die Retoure, gutgeschrieben wird mit der Annahme im Lager: regeln.test.ts „der Monteur meldet eine Retoure — gutgeschrieben wird mit der Annahme im Lager (M7)“.',
  'der Rechnungskreis laeuft ueber den Jahreswechsel weiter':
    'Seit G11 zieht niemand eine Rechnungsnummer direkt und seit G10 gibt es nur das laufende Jahr — einen Jahreswechsel kann die Schnittstelle nicht mehr herbeiführen. Dass der Rechnungskreis ein eigener ist und nur über das Ausstellen weiterzählt: regeln.test.ts „der Rechnungskreis ist ein eigener — und nur über das Ausstellen erreichbar (G11)“.',
};

describe('Das Prüfnetz ist vollständig umgezogen', () => {
  it('jede Regelprüfung aus Firestore hat eine Entsprechung', () => {
    const firestore = ausFirestore();
    const postgres = new Set(titel('tests/supabase/regeln.test.ts'));

    const fehlend = firestore
      .filter((t) => !postgres.has(t))
      .filter((t) => !(t in ANDERS_GELOEST));

    expect(fehlend).toEqual([]);
  });

  it('und es sind wirklich 155', () => {
    // Der Wächter über den Wächter: wird die Liste gekürzt, sinkt die
    // Messlatte still. Diese Zahl steht der Kürzung im Weg.
    expect(ausFirestore()).toHaveLength(155);
  });

  it('jede erklärte Ausnahme trägt auch eine Erklärung', () => {
    const ohneGrund = Object.entries(ANDERS_GELOEST)
      .filter(([, grund]) => grund.trim().length < 20)
      .map(([t]) => t);
    expect(ohneGrund).toEqual([]);
  });
});
