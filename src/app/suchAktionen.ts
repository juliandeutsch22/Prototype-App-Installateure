import type { Company, CurrentUser } from '@/types';
import { canAccess, zusatzrechte } from './navigation';
import { canWriteWorkSheet, darfKundenPflegen, isGF } from '@/lib/permissions';
import { istAn } from '@/lib/module';

/**
 * AKTIONEN IN „SUCHEN ODER SPRINGEN“ (Plan 15.11.2026, F15).
 *
 * Neben Seiten und Treffern stehen die häufigen ersten Schritte: „Neue
 * Rechnung“, „Zeit erfassen“, „Neuer Kunde“ … — wer Strg + K drückt oder
 * oben sucht, ist mit einem Wort dort, wo das Formular schon offen ist.
 *
 * DIESELBEN RECHTE WIE DER KNOPF AUF DER SEITE. Jede Aktion steht nur, wenn
 * die Rolle die Seite in der Navigation hat (`canAccess`, wie die Seiten im
 * Fenster) UND auf der Seite den Knopf sähe — sonst öffnete das Fenster eine
 * Tür, die die Seite nicht hat (dieselben Rechte wie „Neu …“ in der
 * Kundenakte, `neuFuer.ts`). Die Seite prüft beim Ankommen noch einmal
 * (`useNeuAusAdresse`), und was dann gespeichert werden darf, entscheidet wie
 * überall die Datenbank.
 */
export interface SuchAktion {
  text: string;
  /** Andere Wörter, unter denen man sie sucht („Rechnung erstellen“). */
  auch: string;
  ziel: string;
  /** Was die Seite beim Ankommen öffnet (Router-Zustand), wo sie es so liest. */
  zustand?: unknown;
}

export function suchAktionen(user: CurrentUser | null | undefined, company: Company | null | undefined): SuchAktion[] {
  if (!user) return [];
  const zusatz = zusatzrechte(user, company);
  const darf = (pfad: string) => canAccess(user.role, pfad, company?.modules, zusatz);
  const r = user.role;
  const aktionen: Array<SuchAktion | false> = [
    darf('/time') && istAn(company?.modules, 'zeiterfassung') && {
      // Derselbe Weg wie „Zeit von Hand eintragen“ (E90): am Handy das Blatt, am Schreibtisch das Formular.
      text: 'Zeit erfassen', auch: 'Zeit buchen eintragen nachtragen Stunden', ziel: '/time', zustand: { vonHand: true },
    },
    darf('/material') && { text: 'Material anfordern', auch: 'Bestellen Anforderung', ziel: '/material' },
    darf('/worksheets') && canWriteWorkSheet(r) && { text: 'Neuer Schein', auch: 'Handwerksschein Regieschein', ziel: '/worksheet' },
    darf('/invoices') && r !== 'Projektleiter' && { text: 'Neue Rechnung', auch: 'Rechnung erstellen stellen', ziel: '/invoices?neu' },
    darf('/quotes') && isGF(r) && { text: 'Neues Angebot', auch: 'Angebot erstellen', ziel: '/quotes?neu' },
    darf('/customers') && darfKundenPflegen(user) && { text: 'Neuer Kunde', auch: 'Kunde anlegen', ziel: '/customers?neu' },
    darf('/admin-projects') && isGF(r) && { text: 'Neue Baustelle', auch: 'Baustelle anlegen Auftrag', ziel: '/admin-projects?neu' },
    darf('/wartungen') && isGF(r) && { text: 'Neue Wartung', auch: 'Wartung anlegen', ziel: '/wartungen?neu' },
  ];
  return aktionen.filter((a): a is SuchAktion => !!a);
}
