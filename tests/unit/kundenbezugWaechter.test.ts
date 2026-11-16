/**
 * DER WÄCHTER ÜBER DEN KUNDENBEZUG (Durchsicht 15.11.2026, F9).
 *
 * `kunden_zusammenfuehren` hängt alles von der Dublette an den bleibenden
 * Kunden und löscht die Dublette. Eine Tabelle mit Verweis auf `customers`,
 * die es dabei nicht kennt, verlöre ihre Zeilen (`on delete cascade`) oder
 * ihren Bezug (`set null`) — still. Die Datenbank verweigert das
 * Zusammenführen dann zwar (`app.kundenbezug_unbekannt`), aber erst im
 * Betrieb. Diese Prüfung fällt schon beim Schreiben der Migration: sie liest
 * alle Migrationen, findet jede Tabelle mit Kundenbezug und vergleicht sie
 * mit der Liste in `app.kundenbezug_tabellen()` (letzte Fassung).
 *
 * Kundenbezug heißt: ein Fremdschlüssel auf `customers` oder eine Spalte
 * `customer_id` bzw. `kunde_id` (so heißt der Bezug im Änderungsjournal —
 * ohne Fremdschlüssel). Die Gegenprobe gegen das echte Schema steht in
 * `tests/supabase/kundenZusammenfuehren.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORDNER = resolve(process.cwd(), 'supabase/migrations');

/** Kommentare raus — dort steht „references customers“ auch in Prosa. */
function ohneKommentare(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const BEZUG = /\breferences\s+(?:public\.)?customers\b|\b(?:customer_id|kunde_id)\b/i;

/** Der Inhalt bis zur passenden schließenden Klammer ab `ab` (dort steht „(“). */
function klammerInhalt(text: string, ab: number): string {
  let tiefe = 0;
  for (let i = ab; i < text.length; i += 1) {
    if (text[i] === '(') tiefe += 1;
    else if (text[i] === ')') {
      tiefe -= 1;
      if (tiefe === 0) return text.slice(ab + 1, i);
    }
  }
  return text.slice(ab + 1);
}

/** Tabellen in `public` mit Kundenbezug — aus den Migrationen in ihrer Reihenfolge. */
function tabellenMitKundenbezug(migrationen: readonly string[]): Set<string> {
  const mit = new Set<string>();
  for (const roh of migrationen) {
    const sql = ohneKommentare(roh);
    for (const m of sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(/gi)) {
      const koerper = klammerInhalt(sql, (m.index ?? 0) + m[0].length - 1);
      if (BEZUG.test(koerper)) mit.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(/\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?(\w+)"?\s+([^;]*)/gi)) {
      if (/\badd\b/i.test(m[2]) && BEZUG.test(m[2])) mit.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(/\bdrop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) {
      mit.delete(m[1].toLowerCase());
    }
  }
  // Der Kunde selbst ist kein Bezug auf ihn.
  mit.delete('customers');
  return mit;
}

/** Die Liste aus der letzten Fassung von `app.kundenbezug_tabellen()`. */
function behandelteTabellen(migrationen: readonly string[]): Set<string> | null {
  let liste: Set<string> | null = null;
  for (const roh of migrationen) {
    const sql = ohneKommentare(roh);
    const m = /function\s+app\.kundenbezug_tabellen\s*\(\s*\)[\s\S]*?array\s*\[([\s\S]*?)\]/i.exec(sql);
    if (m) liste = new Set([...m[1].matchAll(/'(\w+)'/g)].map((t) => t[1].toLowerCase()));
  }
  return liste;
}

function alleMigrationen(): string[] {
  return readdirSync(ORDNER)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(resolve(ORDNER, f), 'utf8'));
}

describe('Kunden zusammenführen kennt jede Tabelle mit Kundenbezug (F9)', () => {
  const migrationen = alleMigrationen();

  it('jede Tabelle mit Verweis auf den Kunden steht in app.kundenbezug_tabellen() — und keine darüber hinaus', () => {
    const gefunden = tabellenMitKundenbezug(migrationen);
    const behandelt = behandelteTabellen(migrationen);
    expect(behandelt).not.toBeNull();
    expect({
      fehlen: [...gefunden].filter((t) => !behandelt!.has(t)).sort(),
      ueberzaehlig: [...behandelt!].filter((t) => !gefunden.has(t)).sort(),
    }).toEqual({ fehlen: [], ueberzaehlig: [] });
  });

  it('der Wächter findet überhaupt etwas — die bekannten zehn', () => {
    // Ein Suchlauf, der nichts findet, meldet grün. Die Zahl darf wachsen.
    expect(tabellenMitKundenbezug(migrationen).size).toBeGreaterThanOrEqual(10);
  });

  it('Gegenprobe: eine neue Tabelle mit Kundenbezug ohne Eintrag fällt auf', () => {
    const neu = `
      create table public.kundenkontakte (
        id uuid primary key default gen_random_uuid(),
        company_id text not null references public.companies (id),
        customer_id uuid not null references public.customers (id) on delete cascade,
        telefon text
      );`;
    const gefunden = tabellenMitKundenbezug([...migrationen, neu]);
    const behandelt = behandelteTabellen(migrationen)!;
    expect([...gefunden].filter((t) => !behandelt.has(t))).toEqual(['kundenkontakte']);
  });

  it('Gegenprobe: eine nachträglich angefügte Spalte zählt ebenso, eine gelöschte Tabelle nicht mehr', () => {
    const spalte = 'alter table public.fahrzeuge add column kunde_id uuid;';
    expect(tabellenMitKundenbezug([...migrationen, spalte]).has('fahrzeuge')).toBe(true);
    expect(tabellenMitKundenbezug([...migrationen, spalte, 'drop table if exists public.fahrzeuge;']).has('fahrzeuge')).toBe(false);
  });

  it('bleibt gleich: ein Kommentar über Kunden ist kein Kundenbezug', () => {
    const prosa = `
      -- references customers
      /* customer_id steht hier nur im Text */
      create table public.notizen (id uuid primary key, text text);`;
    expect(tabellenMitKundenbezug([prosa]).has('notizen')).toBe(false);
  });
});
