import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Metric, { MetricRow } from '@/components/Metric';
import { SkeletonMetrics } from '@/components/States';
import Card from '@/components/Card';

/**
 * Die Regel EINER Klasse aus `src/index.css` — ihr Körper zwischen den
 * geschweiften Klammern. Seit die Bausteine je Element genau eine Klasse
 * tragen (Design-Durchgang 25.09.2026), stehen die Maße dort und nicht mehr
 * als Tailwind-Klassen an der Komponente; die Prüfung liest sie deshalb dort.
 */
// Ohne Kommentare: sie stehen vor den Regeln und enthielten sonst Kommas und
// Klammern, die die Selektorliste verfälschen.
const CSS = readFileSync(resolve(__dirname, '../../src/index.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/**
 * Alle Angaben, die für `.klasse` gelten — aus jeder Regel, in deren
 * Selektorliste sie steht, auch innerhalb von Media-Abfragen, in der
 * Reihenfolge der Datei zusammengelegt.
 */
function regel(klasse: string): string {
  const teile: string[] = [];
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selektoren = m[1].split(',').map((x) => x.trim());
    if (selektoren.includes(`.${klasse}`)) teile.push(m[2]);
  }
  if (teile.length === 0) throw new Error(`.${klasse} steht nicht in index.css`);
  return teile.join(';');
}
function wert(klasse: string, eigenschaft: string): string | null {
  const treffer = [...regel(klasse).matchAll(new RegExp(`(?:^|[;\\s])${eigenschaft}\\s*:\\s*([^;]+);`, 'g'))];
  return treffer.length ? treffer[treffer.length - 1][1].trim() : null;
}

/**
 * Die Kennzahlen-Leiste fluchtet mit dem, was unter ihr steht.
 *
 * DER BEFUND AUS DEM BETRIEB. Die Leiste hat keinen Rahmen und deshalb keine
 * eigene Polsterung — ihre erste Beschriftung stand genau dort, wo die KANTE
 * der Karte darunter liegt, und damit sechzehn Bildpunkte links neben deren
 * Titel. Zwei Beschriftungen untereinander, die knapp nicht übereinander
 * stehen, sehen nicht nach einer Entscheidung aus, sondern nach einem
 * Versehen; auf dem Telefon, wo die Karte fast die ganze Breite einnimmt,
 * umso mehr.
 *
 * WAS DIESE PRÜFUNG KANN UND WAS NICHT. Sie misst keine Bildpunkte — in
 * jsdom gibt es kein Tailwind und keine Layoutrechnung. Sie hält die beiden
 * Masse ZUSAMMEN: weicht eines ab, fällt sie. Genau das ist der Fehler, der
 * passiert ist — nicht ein falscher Wert, sondern zwei Werte, wo einer
 * gehört.
 */
describe('Die Kennzahlen-Leiste', () => {
  it('trägt dieselbe seitliche Polsterung wie der Kartenkörper', () => {
    const { container: leiste } = render(
      <MetricRow><Metric label="Offen" value="€ 0,00" /></MetricRow>,
    );
    const { container: karte } = render(<Card title="Neue Rechnung">Inhalt</Card>);

    const reihe = leiste.firstElementChild!;
    // Der Körper der Karte ist das Geschwister nach dem Kopf.
    const koerper = karte.querySelector('section > div')!;

    // Beide tragen ihre Baustein-Klasse …
    expect([...reihe.classList]).toEqual(['kennzahlen']);
    expect([...koerper.classList]).toEqual(['karte-inhalt']);

    /*
      … und die beiden Maße sind DASSELBE. Zuerst geprüft, dass es überhaupt
      eines gibt: ein fehlender Wert auf beiden Seiten wäre auch „gleich“ —
      genau daran ist diese Prüfung beim ersten Anlauf vorbeigelaufen.
    */
    const leisteRand = wert('kennzahlen', 'padding-inline');
    const karteRand = wert('karte-inhalt', 'padding');
    expect(leisteRand).toMatch(/^\d+(\.\d+)?rem$/);
    expect(karteRand).toMatch(/^\d+(\.\d+)?rem$/);
    expect(leisteRand).toBe(karteRand);
  });

  it('und der Ladeplatzhalter trägt sie auch', () => {
    /*
      Sonst springt die Seite in dem Augenblick, in dem die Zahlen
      eintreffen — und zwar seitlich, was noch stärker auffällt als ein
      Sprung in der Höhe. Der Platzhalter ist dafür da, genau das zu
      verhindern.
    */
    const { container } = render(<SkeletonMetrics />);
    expect([...container.firstElementChild!.classList]).toEqual(['kennzahlen']);
  });

  it('lässt die erste Spalte links und die letzte rechts bündig stehen', () => {
    /*
      Die Polsterung sitzt an der REIHE, die Trennstriche zwischen den
      Spalten. Bekäme eine Spalte eine eigene dazu, stünde die Beschriftung
      doppelt eingerückt — und die Flucht wäre wieder dahin, nur in die
      andere Richtung.

      Seit dem 25.09.2026 ohne `first:`/`last:`: die Spalten tragen GAR KEINE
      seitliche Polsterung, den Abstand zwischen ihnen macht das Trennelement.
      Geprüft wird beides — dass die Spalte keine Polsterung hat, und dass
      zwischen zwei Spalten genau ein Trenner steht und außen keiner.
    */
    const { container } = render(
      <MetricRow>
        <Metric label="Offen" value="€ 1,00" />
        <Metric label="Bezahlt" value="€ 2,00" />
      </MetricRow>,
    );
    const kinder = [...container.firstElementChild!.children].map((k) => k.className);
    expect(kinder).toEqual(['kennzahl', 'kennzahl-trenner', 'kennzahl']);
    expect(regel('kennzahl')).not.toMatch(/padding/);
    expect(wert('kennzahl-trenner', 'margin-inline')).toMatch(/^\d+(\.\d+)?rem$/);
  });

  it('zeigt Beschriftung und Wert', () => {
    render(<MetricRow><Metric label="Überfällig" value="€ 12,00" hint="seit 30 Tagen" /></MetricRow>);
    expect(screen.getByText('Überfällig')).toBeInTheDocument();
    expect(screen.getByText('€ 12,00')).toBeInTheDocument();
    expect(screen.getByText('seit 30 Tagen')).toBeInTheDocument();
  });
});

describe('Eine Kennzahl mit Ziel', () => {
  it('ist ein Link dorthin', () => {
    render(
      <MemoryRouter>
        <Metric label="Überfällig" value="€ 800,00" to="/invoices?status=%C3%9Cberf%C3%A4llig" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Überfällig/ })).toHaveAttribute(
      'href',
      '/invoices?status=%C3%9Cberf%C3%A4llig',
    );
  });

  it('und ohne Ziel keiner', () => {
    render(<Metric label="Offen" value="€ 0,00" />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
