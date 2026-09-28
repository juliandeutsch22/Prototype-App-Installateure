/**
 * Darf diese Rolle dorthin, wohin der Link zeigt? (offene Punkte C1)
 *
 * DIESELBE FRAGE WIE DIE APP, NICHT EINE ZWEITE LISTE. Was die Navigation
 * kennt, beantwortet `canAccess` — dieselbe Funktion, die Menü und
 * `RequireNav` fragen. Eine eigene Aufzählung hier würde irgendwann von der
 * App abweichen, und dann prüfte dieser Test etwas, das es nicht gibt.
 * Ergänzt ist nur, was an der Navigation vorbeigeht: der einzelne Schein
 * (`SCHEIN_ROLLEN`, wie in `App.tsx`), die öffentlichen Seiten und die
 * alten Pfade, die weiterleiten.
 *
 * EIN UNBEKANNTER PFAD IST EIN BEFUND. Die App leitet ihn still auf die
 * Startseite um — für den, der klickt, ein Link ins Leere.
 */
import type { Role } from '@/types';
import { NAV, canAccess } from '@/app/navigation';
import { SCHEIN_ROLLEN } from '@/lib/permissions';
import { aktiveModule } from '@/lib/module';

/** Offen für jeden — auch ohne Anmeldung. */
const OEFFENTLICH = new Set(['/login', '/impressum', '/datenschutz']);

/** Alte Pfade und ihr heutiges Ziel (die `Navigate`-Routen in `App.tsx`). */
const WEITERLEITUNG: Record<string, string> = {
  '/order': '/material',
  '/admin-orders': '/anforderungen',
  '/stock': '/lager',
  '/notifications': '/settings/meldungen',
  '/modules': '/settings/module',
  '/material/anfordern': '/material',
  '/material/anforderungen': '/anforderungen',
  '/material/lager': '/lager',
};

export type Urteil = { ok: true } | { ok: false; grund: string };

/** Nur der Pfad — ohne Suche, ohne Anker, ohne abschliessenden Schrägstrich. */
export function pfadVon(href: string): string {
  const ohne = href.split('#')[0].split('?')[0];
  return ohne.length > 1 ? ohne.replace(/\/+$/, '') : ohne;
}

/**
 * Welcher Menüpunkt über diesen Pfad wacht. Die Akten und Unterseiten
 * (`/customers/k1`, `/settings/firma`) hängen an der Prüfung ihrer Liste —
 * so steht es in `App.tsx`.
 */
function waechter(pfad: string): string | null {
  if (NAV.some((i) => i.path === pfad)) return pfad;
  const eltern = NAV
    .filter((i) => i.path !== '/' && pfad.startsWith(`${i.path}/`))
    .sort((a, b) => b.path.length - a.path.length);
  return eltern[0]?.path ?? null;
}

export function darfZiel(
  rolle: Role,
  href: string,
  module?: Record<string, boolean>,
): Urteil {
  let pfad = pfadVon(href);
  if (!pfad.startsWith('/')) return { ok: true }; // extern, tel:, mailto:
  pfad = WEITERLEITUNG[pfad] ?? pfad;

  if (OEFFENTLICH.has(pfad)) return { ok: true };

  if (pfad === '/worksheet') {
    if (!aktiveModule(module).has('scheine')) return { ok: false, grund: 'Modul „scheine" ist aus' };
    return SCHEIN_ROLLEN.includes(rolle)
      ? { ok: true }
      : { ok: false, grund: `${rolle} darf keinen Schein schreiben` };
  }

  const w = waechter(pfad);
  if (!w) return { ok: false, grund: `unbekannter Pfad ${pfad} — die App leitet ihn auf die Startseite um` };
  return canAccess(rolle, w, module)
    ? { ok: true }
    : { ok: false, grund: `${rolle} darf ${w} nicht betreten` };
}
