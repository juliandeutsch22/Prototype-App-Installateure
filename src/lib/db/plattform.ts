/**
 * Die Plattform — Betriebe anlegen, in keinen hineinsehen.
 *
 * Die Edge Function `betrieb-anlegen` tut die Arbeit, und sie ist die einzige,
 * die den Umzug nach Postgres überlebt hat: alles andere aus dem
 * Functions-Bestand ist zu SQL geworden, ein ANMELDEKONTO aber entsteht im
 * Anmeldedienst und nicht in einer Tabelle.
 */
import * as pg from './pg/plattform';
import type { NeuerBetrieb } from '@shared/plattform';

export type { BetriebAngelegt } from './pg/plattform';

export function betriebAnlegen(daten: {
  name: string; companyId: string; adminEmail: string; adminName: string;
}): Promise<pg.BetriebAngelegt> {
  return pg.betriebAnlegen(daten);
}

/**
 * Dasselbe mit der Wahl der Anmeldung — E-Mail oder Benutzername (Testbericht
 * 30.09.2026, P1). Eine eigene Aussenseite, weil `betriebAnlegen` ihre
 * Signatur behält (`tests/unit/datenschichtVertrag.test.ts`).
 */
export function betriebAnlegenMitAnmeldung(daten: NeuerBetrieb): Promise<pg.BetriebAngelegt> {
  return pg.betriebAnlegen(daten);
}

export type { PlattformBetrieb } from './pg/plattform';

/** Die Liste der Betriebe — Name, Kennung, Leitungskonten, ohne Inhalte (M43). */
export function plattformBetriebe(): Promise<pg.PlattformBetrieb[]> {
  return pg.plattformBetriebe();
}

export type { Leitungskonto } from './pg/plattform';

/** Die Leitungskonten mit Benutzername eines Betriebs im Notzugang (P2). */
export function leitungskontenImNotzugang(kennung: string): Promise<pg.Leitungskonto[]> {
  return pg.leitungskontenImNotzugang(kennung);
}

/** Ein neues Startpasswort über den Notzugang (P2). */
export function notzugangPasswort(eingabe: {
  uid: string; grund: string; rueckruf: string; identitaetBestaetigt: boolean;
}): Promise<string> {
  return pg.notzugangPasswort(eingabe);
}

export type { BetriebProtokollEintrag, GeloeschterBetrieb, Uebergabe, BetriebGeloescht } from './pg/plattform';

/*
  BETRIEBE DEAKTIVIEREN UND LÖSCHEN (Nachtest 01.10.2026, Paket D) — jede
  Bedingung (Plattform, Grund, Reihenfolge, Frist) prüft die Datenbank.
*/

export function betriebDeaktivieren(kennung: string, grund: string): Promise<void> {
  return pg.betriebDeaktivieren(kennung, grund);
}

export function betriebAktivieren(kennung: string, grund: string): Promise<void> {
  return pg.betriebAktivieren(kennung, grund);
}

export function testbetriebSetzen(kennung: string, testbetrieb: boolean, grund: string): Promise<void> {
  return pg.testbetriebSetzen(kennung, testbetrieb, grund);
}

export function loeschungPlanen(kennung: string, grund: string, tage?: number): Promise<string> {
  return pg.loeschungPlanen(kennung, grund, tage);
}

export function loeschungAbbrechen(kennung: string, grund: string): Promise<void> {
  return pg.loeschungAbbrechen(kennung, grund);
}

export function betriebProtokoll(kennung: string | null, grenze = 50): Promise<pg.BetriebProtokollEintrag[]> {
  return pg.betriebProtokoll(kennung, grenze);
}

export function geloeschteBetriebe(): Promise<pg.GeloeschterBetrieb[]> {
  return pg.geloeschteBetriebe();
}

export function betriebUebergabe(kennung: string, grund: string): Promise<pg.Uebergabe> {
  return pg.betriebUebergabe(kennung, grund);
}

export function betriebLoeschen(kennung: string, bestaetigung: string, grund: string): Promise<pg.BetriebGeloescht> {
  return pg.betriebLoeschen(kennung, bestaetigung, grund);
}
