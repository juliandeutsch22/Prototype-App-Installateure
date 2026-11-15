import type { TimeEntry } from '@/types';
import { calcWorkMin, normProjectNumber } from '@/lib/time';
import { satzklasse, satzName, istLehrlingssatz } from '@/lib/einstufung';

/**
 * WAS AUF DEN STUNDENNACHWEIS EINER BAUSTELLE GEHÖRT (F12, Z8).
 *
 * Der Nachweis geht an den Kunden — meist den Regiekunden, der die Stunden
 * bestätigt haben will. Der Stundennachweis einer Person war dafür das
 * falsche Blatt: er zeigte jede Buchung des Zeitraums, mit Krankenstand,
 * Arztbesuch, Pflegefreistellung und den Baustellen anderer Kunden samt
 * Kommentaren — Gesundheitsdaten an Dritte oder Nacharbeit von Hand.
 *
 * Hier steht deshalb NUR gearbeitete Zeit auf den gewählten Baustellen:
 * Anwesenheit mit Arbeitsminuten, alle Personen. Keine Abwesenheit, keine
 * fremde Baustelle, keine freien Zeitfelder (sie können Innerbetriebliches
 * tragen) und kein Saldo.
 *
 * Eigene Datei ohne jsPDF: die Auswahl ist reine Rechnung und lässt sich ohne
 * PDF prüfen; das Blatt selbst lädt erst, wer es erzeugt.
 */

export interface NachweisZeile {
  eintrag: TimeEntry;
  minuten: number;
  /** „Facharbeiter“, „Helfer“, „Lehrling, 2. Lehrjahr“ — der Satz der Buchung. */
  einstufung: string;
}

/** Die Buchungen, die auf den Nachweis gehören — nach Tag, Beginn und Name geordnet. */
export function nachweisZeilen(eintraege: readonly TimeEntry[], nummern: readonly string[]): NachweisZeile[] {
  const erlaubt = new Set(nummern.map(normProjectNumber).filter(Boolean));
  return eintraege
    .filter((e) => e.status === 'Anwesend' && erlaubt.has(normProjectNumber(e.projectNumber)))
    .map((e) => ({ eintrag: e, minuten: calcWorkMin(e), einstufung: satzName(satzklasse(e)) }))
    .filter((z) => z.minuten > 0)
    .sort(
      (a, b) =>
        a.eintrag.date.localeCompare(b.eintrag.date) ||
        (a.eintrag.startTime ?? '').localeCompare(b.eintrag.startTime ?? '') ||
        (a.eintrag.userName ?? '').localeCompare(b.eintrag.userName ?? '', 'de'),
    );
}

/**
 * Die Stunden je Einstufung — die Grundlage, nach der Regie verrechnet wird
 * (Facharbeiter- und Helfersatz). Lehrjahre stehen zusammen unter „Lehrling“.
 */
export function minutenJeSatz(zeilen: readonly NachweisZeile[]): { satz: string; minuten: number }[] {
  const je = new Map<string, number>();
  for (const z of zeilen) {
    const k = satzklasse(z.eintrag);
    const name = istLehrlingssatz(k) ? 'Lehrling' : satzName(k);
    je.set(name, (je.get(name) ?? 0) + z.minuten);
  }
  const reihe = ['Facharbeiter', 'Obermonteur', 'Helfer', 'Lehrling'];
  return [...je.entries()]
    .sort((a, b) => reihe.indexOf(a[0]) - reihe.indexOf(b[0]))
    .map(([satz, minuten]) => ({ satz, minuten }));
}

/** Dateiname: Baustellennummer bzw. Kunde und Zeitraum. */
export function nachweisDateiname(bezug: string, von: string, bis: string): string {
  return `Stundennachweis_${bezug.replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '_')}_${von}_${bis}.pdf`;
}
