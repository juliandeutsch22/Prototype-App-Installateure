/**
 * Worauf der Schalter steht — und dass die Zugangsdaten mitkommen.
 *
 * WARUM DAS EINE PRÜFUNG IST UND KEIN KOMMENTAR. `VITE_DATENQUELLE`
 * entscheidet, gegen welche Datenbank die ausgelieferte App arbeitet. Alles
 * ausser `postgres` heisst Firestore — ein Tippfehler, ein gelöschter
 * Vorgabewert, ein vertauschter Zweig, und die App zeigt auf die alte Seite.
 *
 * DAS WÄRE STILL. Die App startet, die Anmeldung funktioniert, die Listen
 * füllen sich — nur eben aus der Datenbank, die gerade abgelöst wurde.
 * Bemerkt würde es an dem Tag, an dem jemand einen Eintrag sucht, den ein
 * anderer angelegt hat.
 *
 * Und die zweite Hälfte derselben Sache: ein Build, der auf Postgres zeigt,
 * aber die Zugangsdaten nicht mitbekommt, ist genauso falsch — er scheitert
 * nur lauter. Beides steht hier zusammen, weil es zusammengehört.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKFLOW = resolve(process.cwd(), '.github/workflows/deploy.yml');

/** Der Block, mit dem `npm run build` seine Umgebung bekommt. */
function bauUmgebung(): string {
  const inhalt = readFileSync(WORKFLOW, 'utf8');
  const bis = inhalt.indexOf('run: npm run build');
  expect(bis, 'Der Workflow baut nicht mehr mit `npm run build`').toBeGreaterThan(0);
  // Rückwärts bis zum Anfang des `env:`-Blocks dieses Schritts.
  const von = inhalt.lastIndexOf('env:', bis);
  expect(von, 'Der Bauschritt hat keinen env-Block mehr').toBeGreaterThan(0);
  return inhalt.slice(von, bis);
}

describe('Die Datenquelle der ausgelieferten App', () => {
  it('steht als Vorgabe auf postgres', () => {
    expect(bauUmgebung()).toContain("VITE_DATENQUELLE: ${{ vars.VITE_DATENQUELLE || 'postgres' }}");
  });

  /*
    DIE RÜCKFALLTÜR IST TEIL DER ZUSAGE. Ohne die Repository-Variable bliebe
    als Rückweg nur ein Revert unter Druck — und der ist in genau dem Moment
    am teuersten, in dem man ihn braucht.
  */
  it('bleibt über eine Variable umschaltbar', () => {
    expect(bauUmgebung()).toContain('vars.VITE_DATENQUELLE');
  });

  it('und der Bau bekommt die Zugangsdaten mit', () => {
    const umgebung = bauUmgebung();
    expect(umgebung).toContain('VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}');
    expect(umgebung).toContain('VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}');
  });
});
