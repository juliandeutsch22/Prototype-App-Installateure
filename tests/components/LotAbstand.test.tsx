import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PageHeader from '@/components/PageHeader';
import Metric, { MetricRow } from '@/components/Metric';

/**
 * Stand im Seitenkopf und Abstand statt Linien (E24, 25.10.2026).
 *
 * Die Seiten trennten ihre Abschnitte mit Linien über jeder Karte, dazu
 * eine unter dem Titel jeder Liste und eine je Zeile — und der Stand stand
 * als eigener Streifen zwischen zwei Linien. Jetzt steht der Stand im
 * Seitenkopf, Abschnitte trennt Luft, und alles steht an einer Kante.
 *
 * jsdom rechnet kein Layout; die Gestaltung wird an den Regeln selbst
 * geprüft, der Aufbau am DOM.
 */
const lesen = (datei: string) => readFileSync(join(process.cwd(), 'src', datei), 'utf8');

describe('Der Stand im Seitenkopf', () => {
  it('steht im Kopf unter dem Untertitel', () => {
    const { container } = render(
      <MemoryRouter>
        <PageHeader
          title="Rechnungen"
          subtitle="Aus einer Baustelle erzeugen"
          stand={
            <MetricRow>
              <Metric label="Offen" value="€ 8 310,00" to="/invoices?ansicht=offen" />
            </MetricRow>
          }
        />
      </MemoryRouter>,
    );
    const kopf = container.querySelector('.seitenkopf')!;
    const stand = kopf.querySelector('.seitenkopf-stand')!;
    expect(stand).not.toBeNull();
    expect(stand.querySelector('.lage-zeile')).not.toBeNull();
    // Unter dem Untertitel, nicht daneben bei den Knöpfen.
    expect(stand.previousElementSibling).toHaveClass('seitenkopf-meta');
    expect(screen.getByRole('link', { name: /^Offen/ })).toHaveAttribute('href', '/invoices?ansicht=offen');
  });

  it('Gegenprobe: ohne Stand bleibt der Kopf, wie er war', () => {
    const { container } = render(<MemoryRouter><PageHeader title="Kunden" subtitle="Stammdaten" /></MemoryRouter>);
    expect(container.querySelector('.seitenkopf-stand')).toBeNull();
  });

  it('mit Stand steht die Hauptaktion oben neben dem Titel', () => {
    expect(lesen('index.css')).toMatch(/\.seitenkopf:has\(\.seitenkopf-stand\) \{ align-items: flex-start; \}/);
  });
});

describe('Abstand statt Linien', () => {
  const css = lesen('index.css');
  const regel = /\.inhalt \.karte:not\(:is\(([^)]*)\) \.karte\) \{ ([^}]*) \}/.exec(css);

  it('ein Abschnitt der Seite beginnt ohne Linie, mit Luft, an der Kante des Kopfs', () => {
    expect(regel).not.toBeNull();
    const werte = regel![2];
    expect(werte).toContain('border-top: 0');
    // Um das Polster in den Rand: Titel, Zeilen und Felder fluchten mit dem Seitentitel.
    expect(werte).toContain('margin-inline: -1rem');
    expect(werte).toMatch(/padding-top: [\d.]+rem/);
  });

  it('gilt nicht, wo die Seite schon bündig gebaut ist oder kein Seitenrand ist', () => {
    const ausgenommen = regel![1];
    for (const s of ['.akten-seite', '.start-seite', '.plattform', '.beleg-kontext', '.fenster', '.fenster-breit', '.blatt', "[role='dialog']"]) {
      expect(ausgenommen).toContain(s);
    }
  });

  it('gleich geblieben: die Karte selbst trägt ihre Linie weiter — in Fenstern und Blättern ändert sich nichts', () => {
    expect(css).toMatch(/\.karte \{ overflow: hidden; overflow: clip; background: var\(--surface\); border: 0; border-top: 1px solid var\(--border\);/);
  });

  it('der Abschnittstitel trägt die Trennung allein: eine Stufe größer (Abschnitt 18)', () => {
    expect(css).toMatch(/\.karte\) \.karte-kopf \.titel-karte \{ font-size: 1\.125rem;/);
  });

  it('auch Akten und Kontextspalte der Startseite trennen ihre Abschnitte durch Luft', () => {
    const akten = lesen('styles/lot-akten.css');
    expect(akten).toMatch(/\.akten-seite \.karte \{ overflow: visible; border-top: 0; \}/);
    expect(akten).not.toMatch(/\.akten-seite \.karte \{[^}]*border-bottom/);
    expect(lesen('styles/lot-start.css')).not.toMatch(/\.start-kontext \.start-karte \{[^}]*border-bottom/);
  });

  it('wo zwei Karten nebeneinanderstehen, ist der Spaltenabstand so groß, dass sie sich nicht überdecken', () => {
    // Je Karte 1 rem in den Rand: unter 2 rem überdeckten sich zwei Nachbarn.
    const zeit = /\.zeit-raster \{[^}]*gap: [\d.]+rem ([\d.]+)rem;/.exec(lesen('styles/lot-zeit.css'));
    expect(zeit).not.toBeNull();
    expect(Number(zeit![1])).toBeGreaterThanOrEqual(2);
  });
});
