import { describe, it, expect } from 'vitest';
import { gewachsenerBetrieb, KURZER_FREITAG } from '../../tools/testbestand/gewachsenerBetrieb';
import { pflichtTage, calcOverallSaldo, hatTagessoll } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Der Testbestand „wie ein gewachsener Betrieb“ (Plan 15.11.2026, L11)
 * enthält, was der alte Testbestand nicht kannte und was deshalb nie
 * gemessen wurde (Analyse B1, B2): verschiedene Eintrittsmonate über zehn
 * Jahre, Tagessoll mit kurzem Freitag, Teilzeit — in der Menge eines Betriebs
 * mit 50 Leuten.
 */

const g = gewachsenerBetrieb();

describe('Gewachsener Betrieb', () => {
  it('ist bei jedem Aufruf derselbe (feste Saat)', () => {
    const zweiter = gewachsenerBetrieb();
    expect(zweiter.benutzer).toEqual(g.benutzer);
    expect(zweiter.zeiten.length).toBe(g.zeiten.length);
    expect(zweiter.zeiten.slice(-50)).toEqual(g.zeiten.slice(-50));
    expect(zweiter.kunden.slice(0, 20)).toEqual(g.kunden.slice(0, 20));
  });

  it('eine andere Saat ergibt einen anderen Bestand (Gegenprobe)', () => {
    expect(gewachsenerBetrieb({ saat: 7, personen: 5, kunden: 50 }).kunden.map((k) => k.name)).not.toEqual(
      gewachsenerBetrieb({ personen: 5, kunden: 50 }).kunden.map((k) => k.name),
    );
  });

  it('50 Personen, über zehn Jahre eingetreten, jede in einem anderen Monat', () => {
    expect(g.benutzer).toHaveLength(50);
    const monate = new Set(g.benutzer.map((b) => b.appStartDate.slice(0, 7)));
    expect(monate.size).toBe(50);
    const erste = g.benutzer.map((b) => b.appStartDate).sort()[0];
    expect(Number(g.heute.slice(0, 4)) - Number(erste.slice(0, 4))).toBe(10);
  });

  it('die meisten mit kurzem Freitag, einige in Teilzeit an vier Tagen', () => {
    const kurz = g.benutzer.filter((b) => hatTagessoll(b as unknown as AppUser));
    expect(kurz.length).toBeGreaterThan(30);
    expect(kurz[0].tagessoll).toEqual(KURZER_FREITAG);
    expect(g.benutzer.some((b) => b.workDays.length === 4 && b.weeklyTargetHours === 30)).toBe(true);
  });

  it('Mengen eines Betriebs nach zehn Jahren', () => {
    expect(g.kunden.length).toBe(2000);
    expect(g.baustellen.length).toBe(4000);
    expect(g.rechnungen.length).toBe(6000);
    // Wer am Anfang eingetreten ist, hat Tausende Buchungen (Analyse B1: rund 1.200 je Jahr und Person bei zwei je Tag).
    const erster = g.benutzer.find((b) => b.appStartDate === g.benutzer.map((x) => x.appStartDate).sort()[0])!;
    const seine = g.zeiten.filter((z) => z.userId === erster.uid);
    expect(seine.length).toBeGreaterThan(3500);
    expect(g.zeiten.length).toBeGreaterThan(100_000);
  });

  it('Krank und Urlaub nur an Tagen mit Soll, gebucht bis gestern', () => {
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    for (const p of g.benutzer.slice(0, 8)) {
      const soll = new Set(pflichtTage(p as unknown as AppUser, new Date(`${p.appStartDate}T00:00:00`), heute));
      const eigene = g.zeiten.filter((z) => z.userId === p.uid);
      for (const z of eigene) expect(soll.has(z.date as string), `${p.uid} ${z.date as string}`).toBe(true);
    }
    expect(g.zeiten.every((z) => (z.date as string) < g.heute)).toBe(true);
  });

  it('die Rechnung der App läuft über den ganzen Bestand einer Person (acht Jahre und mehr, kurzer Freitag)', () => {
    const p = g.benutzer
      .filter((b) => b.role === 'Mitarbeiter' && b.tagessoll)
      .sort((a, b) => a.appStartDate.localeCompare(b.appStartDate))[0];
    expect(Number(g.heute.slice(0, 4)) - Number(p.appStartDate.slice(0, 4))).toBeGreaterThanOrEqual(8);
    const eigene = g.zeiten.filter((z) => z.userId === p.uid) as unknown as TimeEntry[];
    const saldo = calcOverallSaldo(p as unknown as AppUser, eigene, false);
    expect(saldo.hasConfig).toBe(true);
    expect(Number.isFinite(saldo.saldoH)).toBe(true);
    // Gebucht wird das Soll und manchmal eine Stunde mehr — ein Saldo, aber kein negativer.
    expect(saldo.saldoH).toBeGreaterThanOrEqual(0);
  });

  it('Buchungen ab einem Tag (für die Vorschau) lassen das Ältere weg', () => {
    const ab = `${g.heute.slice(0, 7)}-01`;
    const kurz = gewachsenerBetrieb({ zeitenAb: ab });
    expect(kurz.zeiten.every((z) => (z.date as string) >= ab)).toBe(true);
    expect(kurz.benutzer).toEqual(g.benutzer);
  });

  it('erfunden: keine echten Adressen', () => {
    expect(g.benutzer.every((b) => b.email.endsWith('@beispiel.invalid'))).toBe(true);
    expect(g.kunden.filter((k) => k.email).every((k) => k.email!.endsWith('@beispiel.invalid'))).toBe(true);
  });
});
