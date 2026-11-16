import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
  JEDE SEITE, DIE SELBST LÄDT, HOLT BEI „JETZT AKTUALISIEREN“ NACH (F15,
  Ziehen von oben; Nacharbeit 15.11.2026).

  Die Regel, maschinell geprüft — auch für jede künftige Seite:
    Eine Seite ist jedes Modul, das `App.tsx` als Route nachlädt. Sie LÄDT
    SELBST, wenn sie aus `@/lib/db/…` eine Lesefunktion holt (`list…`,
    `zaehle…`, `get…`, `such…`, `lade…`, `hole…`). Dann hält sie sich auf eine
    von drei Arten aktuell:
      - ein Live-Kanal (`subscribe…`, `beobachte…`, `abonnieren`, `use…Live`)
        — er hört selbst auf „jetzt aktualisieren“ (`kanalHalten`);
      - der Abfragespeicher (`useZwischengespeichert`, `useQuery`) — Layout
        holt ihn bei „jetzt aktualisieren“ neu;
      - `useBeiAktualisieren` oder `useAktualisierungsRunde`.
    Sonst steht sie mit Grund in AUSNAHMEN.
  DASSELBE FÜR TEILLISTEN: jeder Baustein unter `src/features`, der Zeilen
  zeigt (`ListRow`, `Arbeitszeile`) und selbst lädt — Reiter einer Seite
  (Krankmeldungen, Betriebsurlaub, Zähllisten), Listen in einer Akte
  (Scheine der Baustelle). Fenster, Dialoge, Auswahlen und Formulare (am
  Namen erkannt) laden beim Öffnen frisch und zählen nicht.
*/
const AUSNAHMEN: Record<string, string> = {
  // Akten und Formulare: keine Liste. Ein Neuholen mitten in der Bearbeitung
  // überschriebe ungespeicherte Eingaben (fachlich: verlorene Eingabe, P1/P10).
  'features/customers/KundenakteView': 'Akte mit Bearbeiten (P1)',
  'features/projects/BaustellenakteView': 'Akte mit Bearbeiten (P1)',
  'features/users/BenutzerakteView': 'Akte mit Bearbeiten (P1)',
  'features/liegenschaften/LiegenschaftView': 'Akte mit Bearbeiten (P1)',
  'features/auftragseingang/EingangView': 'Akte eines Eingangs mit Bearbeiten (P1)',
  'features/quotes/AngebotView': 'Angebot mit Positionen in Bearbeitung (P1)',
  'features/worksheets/WorkSheetView': 'Scheinformular mit Unterschrift (verlorene Eingabe)',
  'features/settings/NotificationSettings': 'Einstellungsformular (P10)',
  // Ein Abgleich über eine gewählte Datei: neu geholte offene Posten änderten die Vorschläge mitten im Zuordnen (fachlich).
  'features/invoices/KontoauszugView': 'Abgleich einer gewählten Bankdatei',
  // Keine Liste: lädt erst auf Knopfdruck (Sicherung herunterladen).
  'features/settings/SicherungView': 'lädt nur auf Knopfdruck',
};

const LESEN = /^(list|zaehle|get|such|search|lade|hole)[A-Z]|Listen$/;
const LIVE = /\b(subscribe[A-Z]\w*|abonnieren|beobachte[A-Z]\w*|use\w*Live)\b/;
const SPEICHER = /\b(useZwischengespeichert|useQuery)\b/;
const ANGEMELDET = /\b(useBeiAktualisieren|useAktualisierungsRunde)\b/;

export function laedtSelbst(quelle: string): boolean {
  return [...quelle.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@\/lib\/db\/[^']+'/g)]
    .flatMap((m) => m[1].split(','))
    .map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0])
    .some((n) => LESEN.test(n));
}
export function bleibtAktuell(quelle: string): boolean {
  return LIVE.test(quelle) || SPEICHER.test(quelle) || ANGEMELDET.test(quelle);
}

const app = readFileSync('src/app/App.tsx', 'utf8');
const seiten = [...new Set([...app.matchAll(/import\('@\/(features\/[^']+)'\)/g)].map((m) => m[1]))]
  .filter((s) => existsSync(`src/${s}.tsx`));

const OHNE = /(Fenster|Dialog|Auswahl|Form|Formular|Erfassen|Vorschlaege|Select|Picker)\.tsx$/;
const alle = (o: string): string[] => readdirSync(o).flatMap((n) => {
  const p = join(o, n);
  return statSync(p).isDirectory() ? alle(p) : p.endsWith('.tsx') ? [p] : [];
});
const teillisten = alle('src/features')
  .filter((d) => !OHNE.test(d) && /<ListRow|<Arbeitszeile/.test(readFileSync(d, 'utf8')))
  .map((d) => d.replace(/^src\//, '').replace(/\.tsx$/, ''));
const geprueft = [...new Set([...seiten, ...teillisten])];

describe('Jede selbst ladende Seite holt bei „jetzt aktualisieren“ nach', () => {
  it('die Prüfung erkennt selbst Ladendes und jede der drei Arten (Gegenprobe)', () => {
    const liste = "import {\n  listWartungen,\n  createWartung,\n} from '@/lib/db/wartungen';";
    expect(laedtSelbst(liste)).toBe(true);
    expect(laedtSelbst("import { createWartung } from '@/lib/db/wartungen';")).toBe(false);
    expect(bleibtAktuell(liste)).toBe(false);
    expect(bleibtAktuell(`${liste}\nuseBeiAktualisieren(laden);`)).toBe(true);
    expect(bleibtAktuell(`${liste}\nconst r = useAktualisierungsRunde();`)).toBe(true);
    expect(bleibtAktuell(`${liste}\nsubscribeWartungen(cb);`)).toBe(true);
    expect(bleibtAktuell(`${liste}\nuseZwischengespeichert({})`)).toBe(true);
  });

  it('findet die Seiten aus App.tsx', () => {
    expect(seiten.length).toBeGreaterThan(40);
    expect(seiten).toContain('features/maintenance/WartungenView');
  });

  it('jede Seite und Teilliste, die selbst lädt, ist angemeldet — oder begründet ausgenommen', () => {
    expect(teillisten).toContain('features/vacations/Krankmeldungen');
    const fehlt = geprueft.filter((s) => {
      const q = readFileSync(`src/${s}.tsx`, 'utf8');
      return laedtSelbst(q) && !bleibtAktuell(q) && !AUSNAHMEN[s];
    });
    expect(fehlt).toEqual([]);
  });

  it('keine Ausnahme ist überholt (die Seite gibt es, sie lädt selbst, und sie ist nicht schon angemeldet)', () => {
    for (const s of Object.keys(AUSNAHMEN)) {
      expect(geprueft, s).toContain(s);
      const q = readFileSync(`src/${s}.tsx`, 'utf8');
      expect(laedtSelbst(q) && !bleibtAktuell(q), s).toBe(true);
    }
  });
});
