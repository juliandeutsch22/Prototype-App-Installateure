import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Metric, { MetricRow, GUTER_RAND } from '@/components/Metric';
import { SkeletonMetrics } from '@/components/States';
import Card from '@/components/Card';

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

    /*
      DAS MASS WIRD ZUERST GEPRÜFT, und das ist nicht überflüssig: mit
      `toContain` allein ginge eine LEERE Polsterung durch — jede
      Zeichenkette enthält die leere. Genau daran ist diese Prüfung beim
      ersten Anlauf vorbeigelaufen, und das ist der Ausgangsfehler selbst.
    */
    expect(GUTER_RAND).toMatch(/^px-\d+$/);
    // Über die Klassenliste und nicht über die Zeichenkette: `px-4` steckt
    // auch in `px-40`.
    expect([...reihe.classList]).toContain(GUTER_RAND);
    expect([...koerper.classList]).toContain(GUTER_RAND);
  });

  it('und der Ladeplatzhalter trägt sie auch', () => {
    /*
      Sonst springt die Seite in dem Augenblick, in dem die Zahlen
      eintreffen — und zwar seitlich, was noch stärker auffällt als ein
      Sprung in der Höhe. Der Platzhalter ist dafür da, genau das zu
      verhindern.
    */
    const { container } = render(<SkeletonMetrics />);
    expect([...container.firstElementChild!.classList]).toContain(GUTER_RAND);
  });

  it('lässt die erste Spalte links und die letzte rechts bündig stehen', () => {
    /*
      Die Polsterung sitzt an der REIHE, die Trennstriche zwischen den
      Spalten. Bekäme die erste Spalte ihre eigene dazu, stünde die
      Beschriftung doppelt eingerückt — und die Flucht wäre wieder dahin,
      nur in die andere Richtung.
    */
    const { container } = render(
      <MetricRow>
        <Metric label="Offen" value="€ 1,00" />
        <Metric label="Bezahlt" value="€ 2,00" />
      </MetricRow>,
    );
    /*
      MIT `sm:`-VORSATZ, und das ist kein Aufweichen der Pruefung: seit die
      Leiste auf dem Telefon ein zweispaltiges Raster ist, tragen die Spalten
      dort GAR KEINE Polsterung — es gibt also nichts zurueckzunehmen. Erst ab
      `sm` stehen sie wieder in einer Reihe mit `sm:px-3`, und genau dort muss
      die aeussere Polsterung wieder weg.
    */
    const spalten = [...container.firstElementChild!.children];
    expect([...spalten[0].classList]).toContain('sm:first:pl-0');
    expect([...spalten[spalten.length - 1].classList]).toContain('sm:last:pr-0');
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
