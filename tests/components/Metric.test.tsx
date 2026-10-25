import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Metric, { MetricRow } from '@/components/Metric';
import { SkeletonMetrics } from '@/components/States';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Die Kennzahlen einer Seite als Stand-Zeile (E22 Startseite, E23 alle Seiten).
 *
 * Bis zum 25.10.2026 standen sie als Leiste großer Kacheln über der Liste.
 * Jetzt ist es eine Reihe kleiner Einträge — dieselben Werte, Zusätze und
 * Ziele. Geprüft wird, dass dabei nichts verloren geht und dass die
 * Gestaltung nur EINMAL steht: die Startseite und alle anderen Seiten
 * zeichnen mit demselben Baustein.
 */
describe('Die Stand-Zeile', () => {
  it('ist eine Liste mit einem Eintrag je Kennzahl — keine Kachel mehr', () => {
    const { container } = render(
      <MemoryRouter>
        <MetricRow>
          <Metric label="Offen" value="€ 1,00" />
          <Metric label="Überfällig" value="€ 2,00" to="/invoices" />
        </MetricRow>
      </MemoryRouter>,
    );
    const zeile = screen.getByRole('list');
    expect([...zeile.classList]).toContain('lage-zeile');
    const eintraege = within(zeile).getAllByRole('listitem');
    expect(eintraege).toHaveLength(2);
    for (const e of eintraege) {
      expect([...e.classList]).toContain('lage-punkt');
      // Eine eigene Polsterung je Eintrag rückte seine Beschriftung gegen die Nachbarn ein.
      expect([...e.querySelectorAll('*'), e].some((el) => [...el.classList].some((c) => /^(md:|lg:)?p[xlr]-/.test(c)))).toBe(false);
    }
    expect(container.querySelector('.kennzahl, .kennzahlen, .kennzahl-wert')).toBeNull();
  });

  it('liest sich als ein Satz: Beschriftung, Wert, Zusatz', () => {
    render(
      <MemoryRouter>
        <MetricRow>
          <Metric label="Überfällig" value="€ 2,00" hint="seit 30 Tagen" to="/invoices" />
        </MetricRow>
      </MemoryRouter>,
    );
    // Ohne Leerzeichen zwischen den Teilen hieße der Verweis „Überfällig€ 2,00seit 30 Tagen“.
    expect(screen.getByRole('link')).toHaveTextContent(/^Überfällig € 2,00 seit 30 Tagen$/);
  });

  it('der Ladeplatzhalter hat die Form der Zeile', () => {
    // Sonst springt die Seite in dem Augenblick, in dem die Zahlen eintreffen.
    const { container } = render(<SkeletonMetrics count={2} />);
    const platz = container.firstElementChild!;
    expect([...platz.classList]).toContain('lage-platzhalter');
    expect(platz).toHaveAttribute('role', 'status');
    expect(platz.querySelectorAll('.skeleton')).toHaveLength(2);
  });

  it('färbt nur „Überfällig“ rot, Achtung in der Warnfarbe, und schreibt nie fett', () => {
    render(
      <MetricRow>
        <Metric label="Offen" value="€ 1,00" tone="brand" />
        <Metric label="Überfällig" value="€ 2,00" tone="danger" />
        <Metric label="Knapp" value="3" tone="warning" />
        <Metric label="Bezahlt" value="€ 4,00" tone="success" />
      </MetricRow>,
    );
    expect([...screen.getByText('€ 2,00').classList]).toContain('lage-wert-rot');
    expect([...screen.getByText('3').classList]).toContain('lage-wert-warn');
    for (const ruhig of ['€ 1,00', '€ 4,00']) {
      expect(screen.getByText(ruhig).className).not.toMatch(/lage-wert-(rot|warn)|text-(danger|brand|success)/);
    }
    const alle = ['€ 1,00', '€ 2,00', '3', '€ 4,00'].map((w) => screen.getByText(w).className).join(' ');
    expect(alle).not.toMatch(/font-bold|font-extrabold|font-semibold/);
  });

  it('zeigt Beschriftung und Wert', () => {
    render(<MetricRow><Metric label="Überfällig" value="€ 12,00" hint="seit 30 Tagen" /></MetricRow>);
    expect(screen.getByText('Überfällig')).toBeInTheDocument();
    expect(screen.getByText('€ 12,00')).toBeInTheDocument();
    expect(screen.getByText('seit 30 Tagen')).toBeInTheDocument();
  });

  it('die Gestaltung steht einmal, in lot.css — die alte Kachel-Leiste ist weg', () => {
    /*
      Zwei Fassungen derselben Zeile liefen auseinander, sobald eine davon
      angepasst wird. Deshalb stehen die Regeln nur in lot.css; die Startseite
      hat keine eigenen mehr, und die Kachel-Regeln aus index.css sind fort.
    */
    const lesen = (datei: string) => readFileSync(join(process.cwd(), 'src', datei), 'utf8');
    const lot = lesen('styles/lot.css');
    expect(lot).toMatch(/\.lage-zeile \{/);
    expect(lot).toMatch(/\.lage-wert-warn \{/);
    expect(lesen('styles/lot-start.css')).not.toMatch(/\.lage-/);
    /*
      Am Schreibtisch eine Reihe. Die Regel des Handys stellt die Einträge
      untereinander (`column`); ohne ausdrückliche Richtung erbte die Reihe
      ab 1.200 px genau das — so stand sie bis zum 25.10.2026 auch auf der
      Startseite. jsdom rechnet kein Layout, deshalb steht die Prüfung an der
      Regel selbst.
    */
    expect(lot).toMatch(/@media \(min-width: 1200px\) \{ \.lage-zeile \{[^}]*flex-direction: row;/);
    expect(lesen('index.css')).not.toMatch(/\.kennzahlen? \{/);
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

/*
  Laden ohne Springen (Analyse 10.10.2026): solange die Grundlage fehlt, steht
  ein Platzhalter in der Form des späteren Werts — nicht ein Wert, der nur so
  aussieht wie einer.
*/
describe('Eine Kennzahl, die lädt', () => {
  it('zeigt Platzhalter statt Wert und Zusatz', () => {
    render(<Metric label="Offen" value="€ 0,00" hint="3 Rechnungen" bereit={false} />);
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.queryByText('€ 0,00')).toBeNull();
    expect(screen.queryByText('3 Rechnungen')).toBeNull();
  });

  it('der Platzhalter des Zusatzes hat die Form, die man ihm gibt — bricht der Zusatz um, bricht er mit', () => {
    const { container } = render(
      <Metric label="Saldo" value="+1:00" hint="58 Tage ohne Buchung" bereit={false} zusatzMuster="000 Tage ohne Buchung — unvollständig" />,
    );
    const zusatz = container.querySelector('.lage-zusatz');
    expect(zusatz?.querySelector('.skeleton-text')?.getAttribute('data-muster')).toBe('000 Tage ohne Buchung — unvollständig');
  });

  it('ohne Angabe von „bereit“ bleibt sie, wie sie war', () => {
    render(<Metric label="Offen" value="€ 0,00" hint="3 Rechnungen" />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('€ 0,00')).toBeInTheDocument();
  });
});
