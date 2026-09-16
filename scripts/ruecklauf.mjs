#!/usr/bin/env node
/**
 * Der Rücklauf: aus einer Sicherungsdatei wird wieder ein Betrieb.
 *
 * WOFÜR. Eine Sicherung, die nie zurückgespielt wurde, ist keine. Bis hierher
 * gab es den Weg hinaus (nächtliche Ausleitung, Eimer ausser Haus) und keinen
 * zurück — das heisst: niemand wusste, ob die abgelegten Dateien überhaupt
 * etwas taugen. Jetzt gibt es den Weg, und `tests/supabase/ruecklauf.test.ts`
 * geht ihn bei jedem Prüflauf einmal ganz durch.
 *
 * WARUM EIN WERKZEUG FÜR DIE HAND UND KEINE EDGE FUNCTION. Der Ernstfall ist
 * „das Projekt ist weg" — eine Function IN diesem Projekt wäre dann ebenfalls
 * weg. Ein Rücklauf läuft auf dem Rechner eines Menschen, gegen ein FRISCHES
 * Projekt, mit einem Schlüssel, den dieser Mensch in dem Moment in der Hand
 * hat. Genau so ist es gebaut.
 *
 *   node scripts/ruecklauf.mjs <datei.jsonl>              — nur nachsehen
 *   node scripts/ruecklauf.mjs <datei.jsonl> --schreiben  — wirklich einspielen
 *
 *   RUECKLAUF_URL              https://<projekt>.supabase.co
 *   RUECKLAUF_DIENSTSCHLUESSEL der service_role-Schlüssel des ZIELS
 *
 * DER TROCKENLAUF IST DIE VORGABE, und das ist keine Höflichkeit: ein
 * Werkzeug, das beim ersten unbedachten Aufruf schreibt, wird irgendwann
 * unbedacht aufgerufen.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { standLesen, betriebAusStand, kontenAusStand } from './ruecklaufPlan.mjs';

const args = process.argv.slice(2);
const datei = args.find((a) => !a.startsWith('--'));
const schreiben = args.includes('--schreiben');
const auchWennVorhanden = args.includes('--auch-wenn-vorhanden');

const URL_BASIS = process.env.RUECKLAUF_URL;
const DIENST = process.env.RUECKLAUF_DIENSTSCHLUESSEL;

function abbruch(text) {
  console.error(`\n${text}\n`);
  process.exit(1);
}

if (!datei) abbruch('Aufruf: node scripts/ruecklauf.mjs <datei.jsonl> [--schreiben]');
if (!URL_BASIS || !DIENST) {
  abbruch('RUECKLAUF_URL und RUECKLAUF_DIENSTSCHLUESSEL müssen gesetzt sein.');
}

const ziel = createClient(URL_BASIS, DIENST, { auth: { persistSession: false } });

/**
 * Einfügen in RUNDEN statt in einer festgelegten Reihenfolge.
 *
 * Die Tabellen hängen über Fremdschlüssel aneinander: Baustellen brauchen
 * Kunden, Rechnungspositionen brauchen Rechnungen. Eine fest einprogrammierte
 * Reihenfolge wäre die naheliegende Lösung und die schlechteste — sie veraltet
 * bei der nächsten neuen Tabelle, und zwar unbemerkt, weil sie erst im
 * Ernstfall gebraucht wird.
 *
 * Stattdessen: alles versuchen, was scheitert in die nächste Runde. Solange
 * jede Runde etwas schafft, geht es weiter. Schafft eine Runde nichts mehr,
 * bricht es ab und sagt, was übrig ist und warum — besser ein ehrlicher
 * Abbruch als ein halb eingespielter Betrieb.
 */
async function inRunden(sammlungen) {
  let offen = [...sammlungen.entries()].filter(([t]) => t !== 'companies');
  const geschafft = [];
  let runde = 0;

  while (offen.length > 0) {
    runde += 1;
    const gescheitert = [];
    for (const [tabelle, zeilen] of offen) {
      const { error } = await ziel.from(tabelle).insert(zeilen);
      if (error) gescheitert.push([tabelle, zeilen, error.message]);
      else geschafft.push({ tabelle, zeilen: zeilen.length, runde });
    }
    if (gescheitert.length === offen.length) {
      console.error(`\nRunde ${runde} hat nichts mehr geschafft. Übrig:`);
      for (const [tabelle, zeilen, meldung] of gescheitert) {
        console.error(`  ${tabelle} (${zeilen.length} Zeilen): ${meldung}`);
      }
      abbruch('Der Rücklauf ist unvollständig. Nichts weiter eingespielt.');
    }
    offen = gescheitert.map(([tabelle, zeilen]) => [tabelle, zeilen]);
  }
  return geschafft;
}

const { sammlungen, fehler } = standLesen(readFileSync(datei, 'utf8'));
if (fehler.length > 0) {
  console.error('\nDie Datei ist beschädigt:');
  for (const f of fehler) console.error(`  ${f}`);
  abbruch('Ein halb eingelesener Stand ist schlimmer als keiner. Nichts eingespielt.');
}

let betrieb;
try {
  betrieb = betriebAusStand(sammlungen);
} catch (e) {
  abbruch(e.message);
}

const konten = kontenAusStand(sammlungen);
const zeilenGesamt = [...sammlungen.values()].reduce((s, z) => s + z.length, 0);

console.log(`\nSicherung:  ${datei}`);
console.log(`Betrieb:    ${betrieb}`);
console.log(`Ziel:       ${URL_BASIS}`);
console.log(`Umfang:     ${zeilenGesamt} Zeilen in ${sammlungen.size} Tabellen, ${konten.length} Zugänge\n`);
for (const [tabelle, zeilen] of [...sammlungen].sort()) {
  console.log(`  ${tabelle.padEnd(24)} ${String(zeilen.length).padStart(6)}`);
}

/*
  GIBT ES DEN BETRIEB DORT SCHON? Dann ist das Ziel nicht leer, und ein
  Rücklauf würde entweder an jedem Primärschlüssel scheitern oder — schlimmer
  — einen bestehenden Betrieb mit einem alten Stand vermischen.
*/
const { data: vorhanden } = await ziel.from('companies').select('id').eq('id', betrieb);
if (vorhanden?.length && !auchWennVorhanden) {
  abbruch(
    `Im Ziel gibt es „${betrieb}" bereits. Ein Rücklauf gehört in ein FRISCHES Projekt.\n` +
    'Wenn Sie genau wissen, was Sie tun: --auch-wenn-vorhanden.',
  );
}

if (!schreiben) {
  console.log('\nTrockenlauf — es wurde nichts geschrieben.');
  console.log('Zum wirklichen Einspielen: --schreiben\n');
  process.exit(0);
}

/*
  ZUERST DIE ANMELDEKONTEN. `public.users.id` verweist auf `auth.users(id)`;
  ohne Konto keine Profilzeile, ohne Profilzeile kein Rest.

  OHNE ANSPRÜCHE — die setzt die Datenbank. Der Auslöser `users_ansprueche`
  nimmt Betrieb, Rolle und Zustand aus der Profilzeile, sobald sie eingefügt
  wird, und sperrt ein inaktives Konto gleich mit. Sie hier ein zweites Mal zu
  schreiben hiesse, einer Datei zu glauben statt der Datenbank.

  Das Passwort kommt nicht zurück: es steht als Hash in `auth.users` und damit
  nicht in der Sicherung. Jeder Zugang braucht danach einmal „Passwort
  vergessen".
*/
console.log('\nZugänge anlegen …');
for (const konto of konten) {
  const { error } = await ziel.auth.admin.createUser({
    id: konto.id,
    email: konto.email,
    password: `rueck-${crypto.randomUUID()}`,
    email_confirm: true,
  });
  if (error) abbruch(`Zugang ${konto.email}: ${error.message}`);
}
console.log(`  ${konten.length} angelegt`);

console.log('\nFirma einspielen …');
const { error: firmaFehler } = await ziel.from('companies').insert(sammlungen.get('companies'));
if (firmaFehler) abbruch(`companies: ${firmaFehler.message}`);

console.log('Übrige Tabellen einspielen …');
const geschafft = await inRunden(sammlungen);
for (const g of geschafft) {
  console.log(`  ${g.tabelle.padEnd(24)} ${String(g.zeilen).padStart(6)}  (Runde ${g.runde})`);
}

console.log(`\nFertig. ${zeilenGesamt} Zeilen, ${konten.length} Zugänge.`);
console.log('Die Passwörter sind NICHT zurückgekommen — bitte einmal „Passwort vergessen".\n');
