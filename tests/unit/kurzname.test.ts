import { describe, it, expect } from 'vitest';
import { kurzname, kurzPerson } from '@/features/assignments/kurzname';

/*
  KURZNAMEN FÜR DIE BALKEN DES MONATS (Runde 4, Auftrag 5.1): reine Anzeige.
  Geprüft wird beides — dass gekürzt wird, wo der Name es sagt, und dass der
  Name bleibt, wo es nicht sicher ist (die Gegenprobe: ein falscher Kurzname
  wäre schlimmer als ein langer).
*/
describe('kurzname — Firmen ohne Rechtsform', () => {
  it.each([
    ['CT Bau GmbH', 'CT Bau'],
    ['Perl Installationen GmbH', 'Perl Installationen'],
    ['Muster & Söhne KG', 'Muster & Söhne'],
    ['Huber Haustechnik GmbH & Co KG', 'Huber Haustechnik'],
    ['Huber Haustechnik GmbH & Co. KG', 'Huber Haustechnik'],
    ['Maier Bau Ges.m.b.H.', 'Maier Bau'],
    ['Maier Bau Gesellschaft m.b.H.', 'Maier Bau'],
    ['Pichler & Partner OG', 'Pichler & Partner'],
    ['Elektro Gruber e.U.', 'Elektro Gruber'],
    ['Wohnbau Süd AG', 'Wohnbau Süd'],
    ['Raiffeisen Lagerhaus eGen', 'Raiffeisen Lagerhaus'],
    ['Steiner, GmbH', 'Steiner'],
  ])('„%s“ → „%s“', (voll, kurz) => {
    expect(kurzname(voll)).toBe(kurz);
  });
});

describe('kurzname — Gemeinden und Eigentümergemeinschaften', () => {
  it.each([
    ['Gemeinde Ansfelden', 'Ansfelden'],
    ['Marktgemeinde Gleisdorf', 'Gleisdorf'],
    ['Stadtgemeinde Weiz', 'Weiz'],
    ['Gemeinde Neudorf bei Wiener Neustadt', 'Neudorf'],
    ['Gemeinde St. Georgen an der Gusen', 'St. Georgen'],
    ['Wohnungseigentümergemeinschaft Hauptstraße 112–118', 'WEG Hauptstraße 112–118'],
    ['Eigentümergemeinschaft Ringstraße 3', 'WEG Ringstraße 3'],
  ])('„%s“ → „%s“', (voll, kurz) => {
    expect(kurzname(voll)).toBe(kurz);
  });
});

describe('kurzname — Privatkunden mit dem Nachnamen', () => {
  it.each([
    ['Familie Huber', 'Huber'],
    ['Fam. Huber', 'Huber'],
    ['Familie Berger-Steinmetz', 'Berger-Steinmetz'],
    ['Familie Anna und Josef Huber', 'Huber'],
    ['Anna Beispiel', 'Beispiel'],
    ['Max Mustermann', 'Mustermann'],
    ['Anna Maria Beispiel', 'Beispiel'],
    ['Herr Josef Gruber', 'Gruber'],
    ['Frau Mag. Anna Beispiel', 'Beispiel'],
    ['Dr. Franz Hinterleitner', 'Hinterleitner'],
    ['DI Max Muster', 'Muster'],
    ['Huber, Anna', 'Huber'],
  ])('„%s“ → „%s“', (voll, kurz) => {
    expect(kurzname(voll)).toBe(kurz);
  });
});

describe('kurzname — im Zweifel bleibt der Name (Gegenprobe)', () => {
  it.each([
    // Kein bekannter Vorname: eine Firma ohne Rechtsform, kein Nachname.
    'Gasthof Post',
    'Bäckerei Pichler',
    'Volksschule Weiz',
    'CT Bau',
    'Hotel Erzherzog Johann',
    // Vorname, aber ein Firmenwort im Namen.
    'Josef Huber Installationen',
    'Anna Huber Immobilien',
    // Titel vor einem Firmennamen.
    'Dr. Huber & Partner',
    // Rechtsform klein geschrieben am Ende ist keine („Ag“ ist kein Kürzel).
    'Familienpension Ag',
    // Ein Wort.
    'Hausverwaltung',
    'Pfarre',
  ])('„%s“ bleibt', (voll) => {
    expect(kurzname(voll)).toBe(voll);
  });

  it('leer und ohne Angabe bleibt leer', () => {
    expect(kurzname('')).toBe('');
    expect(kurzname(null)).toBe('');
    expect(kurzname(undefined)).toBe('');
    expect(kurzname('   ')).toBe('');
  });

  it('räumt doppelte Leerzeichen weg, ändert sonst nichts', () => {
    expect(kurzname('  Gasthof   Post ')).toBe('Gasthof Post');
  });

  it('eine Rechtsform allein bleibt stehen (sonst stünde nichts da)', () => {
    expect(kurzname('GmbH')).toBe('GmbH');
  });
});

describe('kurzPerson — „Max M.“', () => {
  it.each([
    ['Max Mustermann', 'Max M.'],
    ['Anton Berger-Steinmetz', 'Anton B.'],
    ['Anna Maria Beispiel', 'Anna B.'],
    ['Lena', 'Lena'],
    ['', ''],
  ])('„%s“ → „%s“', (voll, kurz) => {
    expect(kurzPerson(voll)).toBe(kurz);
  });
});
