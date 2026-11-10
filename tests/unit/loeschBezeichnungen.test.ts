import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { SOFORT_GELOESCHT } from '@/features/recht/auskunftDatei';

/**
 * Jeder Teil, den `person_loeschen` sofort entfernt, hat im Löschdialog einen
 * Namen (Prüfbefund 09.11.2026).
 *
 * WAS VORHER WAR. Termine, Geburtsdatum, Standardfahrer, Nachrichten,
 * Gesprächsteilnahmen und Startseite kamen mit späteren Migrationen dazu;
 * `SOFORT_GELOESCHT` erfuhr davon nichts, und der Dialog zeigte
 * „nachrichten_teilnehmer: 2“. Niemand hatte es vergessen wollen — es gab
 * nur keine Stelle, die beide Seiten nebeneinanderlegt. Das ist diese.
 *
 * GELESEN WIRD DIE LETZTE FASSUNG AUS DEN MIGRATIONEN, in ihrer Reihenfolge:
 * eine volle Fassung (`create or replace function public.person_loeschen(`)
 * setzt die Schlüssel neu, ein späterer Nachtrag über `pg_get_functiondef`
 * fügt seine hinzu. Ein Schlüssel ist eine Zeile `'name', (select …` — so
 * steht jeder Eintrag der Zählung `sofort`; die Liste `aufbewahren` beginnt
 * ihre Zeilen mit `select jsonb_build_object('was', …` und fällt nicht hinein.
 */
const ORDNER = 'supabase/migrations';
const VOLL = 'create or replace function public.person_loeschen(';
const NACHTRAG = "pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'";

const schluesselIn = (sql: string) => [...sql.matchAll(/^\s*'([a-z_]+)',\s*\(select\b/gm)].map((m) => m[1]);

function sofortSchluessel(): Set<string> {
  let schluessel = new Set<string>();
  for (const datei of readdirSync(ORDNER).filter((d) => d.endsWith('.sql')).sort()) {
    const text = readFileSync(`${ORDNER}/${datei}`, 'utf8');
    const stellen: Array<{ an: number; voll: boolean }> = [];
    for (const [marke, voll] of [[VOLL, true], [NACHTRAG, false]] as const) {
      for (let i = text.indexOf(marke); i >= 0; i = text.indexOf(marke, i + 1)) stellen.push({ an: i, voll });
    }
    for (const { an, voll } of stellen.sort((a, b) => a.an - b.an)) {
      if (voll) {
        // Die volle Fassung endet mit ihrem Rumpf.
        schluessel = new Set(schluesselIn(text.slice(an, text.indexOf('\n$$;', an))));
      } else {
        /*
          Ein Nachtrag reicht bis zur nächsten gelesenen Funktion oder bis zum
          Ende seines Blocks — ein Nachtrag an `person_auskunft` im selben
          Block (`'startseite', (select s.wahl …`) gehört nicht dazu.
        */
        const rest = text.slice(an + NACHTRAG.length);
        const enden = [rest.indexOf('pg_get_functiondef('), rest.indexOf('$migration$')].filter((n) => n >= 0);
        for (const k of schluesselIn(rest.slice(0, Math.min(rest.length, ...enden)))) schluessel.add(k);
      }
    }
  }
  return schluessel;
}

describe('Die Namen im Löschdialog', () => {
  const schluessel = sofortSchluessel();

  it('die Suche findet die Schlüssel überhaupt — alte wie nachgetragene', () => {
    // Sonst wäre die Prüfung darunter grün, weil sie nichts zu prüfen hätte.
    expect([...schluessel]).toEqual(expect.arrayContaining([
      'einstellungen', 'einsaetze', 'kontaktdaten', 'termine',
      'annahme_links', 'standardfahrer', 'nachrichten_teilnehmer', 'startseite',
    ]));
  });

  it('jeder Schlüssel der letzten Fassung hat einen Namen', () => {
    const ohneNamen = [...schluessel].filter((k) => !(k in SOFORT_GELOESCHT)).sort();
    expect(ohneNamen).toEqual([]);
  });

  it('kein Name für einen Schlüssel, den es nicht gibt', () => {
    // Ein Tippfehler im Schlüssel liesse den Namen nie erscheinen — und die Prüfung darüber bliebe grün.
    const verwaist = Object.keys(SOFORT_GELOESCHT).filter((k) => !schluessel.has(k)).sort();
    expect(verwaist).toEqual([]);
  });
});
