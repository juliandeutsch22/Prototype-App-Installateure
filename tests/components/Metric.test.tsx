import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Metric, { MetricRow, GUTER_RAND } from '@/components/Metric';
import { SkeletonMetrics } from '@/components/States';
import Card from '@/components/Card';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  /*
    SEIT DER DESIGNLINIE „FASSUNG 3" ist die Leiste ein eigener Kasten mit
    Rand (`.kennzahlen`), und jede Kennzahl polstert sich selbst
    (`.kennzahl`). Die Flucht entsteht damit so: Kante der Leiste = Kante der
    Karte darunter, Polsterung der Kennzahl = Polsterung des Kartenkörpers.
    Das zweite ist die Stelle, an der zwei Werte auseinanderlaufen können —
    der eine steht in index.css, der andere als Tailwind-Klasse an `Card`.
  */
  it('polstert jede Kennzahl so wie den Kartenkörper', () => {
    const { container: karte } = render(<Card title="Neue Rechnung">Inhalt</Card>);
    const koerper = karte.querySelector('section > div')!;

    /*
      DAS MASS WIRD ZUERST GEPRÜFT, und das ist nicht überflüssig: mit
      `toContain` allein ginge eine LEERE Polsterung durch — jede
      Zeichenkette enthält die leere.
    */
    const stufe = /^px-(\d+)$/.exec(GUTER_RAND);
    expect(stufe).not.toBeNull();
    // Über die Klassenliste und nicht über die Zeichenkette: `px-4` steckt
    // auch in `px-40`.
    expect([...koerper.classList]).toContain(GUTER_RAND);

    // Tailwind: eine Stufe sind 0,25 rem.
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    const kennzahl = /\.kennzahl \{ padding: [\d.]+rem ([\d.]+)rem;/.exec(css);
    expect(kennzahl).not.toBeNull();
    expect(Number(kennzahl![1])).toBe(Number(stufe![1]) * 0.25);
  });

  it('und der Ladeplatzhalter ist genauso gebaut', () => {
    /*
      Sonst springt die Seite in dem Augenblick, in dem die Zahlen
      eintreffen — und zwar seitlich, was noch stärker auffällt als ein
      Sprung in der Höhe. Der Platzhalter ist dafür da, genau das zu
      verhindern.
    */
    const { container } = render(<SkeletonMetrics />);
    const leiste = container.firstElementChild!;
    expect([...leiste.classList]).toContain('kennzahlen');
    const spalten = [...leiste.children].filter((k) => !k.classList.contains('sr-only'));
    expect(spalten.length).toBe(3);
    for (const s of spalten) expect([...s.classList]).toContain('kennzahl');
  });

  it('gibt jeder Spalte dieselbe Form, ohne eigene Polsterung daneben', () => {
    /*
      Die Polsterung sitzt an `.kennzahl`. Bekäme eine Spalte zusätzlich eine
      eigene (`px-…`, `pl-…`), stünde ihre Beschriftung anders eingerückt als
      die der Nachbarn — und die Flucht wäre wieder dahin.
    */
    const { container } = render(
      <MemoryRouter>
        <MetricRow>
          <Metric label="Offen" value="€ 1,00" />
          <Metric label="Überfällig" value="€ 2,00" to="/invoices" />
        </MetricRow>
      </MemoryRouter>,
    );
    const leiste = container.firstElementChild!;
    expect([...leiste.classList]).toContain('kennzahlen');
    for (const spalte of [...leiste.children]) {
      const k = [...spalte.classList];
      expect(k).toContain('kennzahl');
      expect(k.some((c) => /^(sm:|lg:)?p[xlr]-/.test(c))).toBe(false);
    }
  });

  it('färbt nur „Überfällig“ rot und schreibt nie fett', () => {
    render(
      <MetricRow>
        <Metric label="Offen" value="€ 1,00" tone="brand" />
        <Metric label="Überfällig" value="€ 2,00" tone="danger" />
      </MetricRow>,
    );
    const offen = screen.getByText('€ 1,00');
    const faellig = screen.getByText('€ 2,00');
    expect([...faellig.classList]).toContain('text-danger');
    expect(offen.className).not.toMatch(/text-(danger|brand|success)/);
    expect(offen.className + faellig.className).not.toMatch(/font-bold|font-extrabold/);
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
