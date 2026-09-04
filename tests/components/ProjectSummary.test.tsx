import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectSummary from '@/features/accounting/ProjectSummary';
import type { Project, TimeEntry } from '@/types';

/**
 * Was in der Projektauswertung an einem Eintrag DRANSTEHT.
 *
 * AUS DEM BETRIEB GEMELDET: „Notdienst wurde bei der zweiten Erfassung
 * angehakt, aber das scheint beim Eintrag in der Projektauswertung nicht auf."
 *
 * Der Haken war korrekt gespeichert — gezeigt wurde er nur in der eigenen
 * Zeitübersicht. Hier hängt er an Geld: ein Notdiensteinsatz trägt +100 % auf
 * den Stundensatz. Wer die Stunde ohne diesen Hinweis liest, schreibt sie ohne
 * den Zuschlag in die Rechnung, und auffallen würde es niemandem — die Zahl
 * ist ja plausibel.
 */

const projekt: Project = {
  companyId: 'perl',
  projectNumber: 'B-2026-0001',
  customerName: 'Max Musterkunde',
  address: 'Teststraße 1',
  status: 'Aktiv',
  estimatedHours: 40,
} as Project;

const eintrag = (over: Partial<TimeEntry>): TimeEntry =>
  ({
    companyId: 'perl',
    date: '2026-09-03',
    status: 'Anwesend',
    startTime: '07:00',
    endTime: '16:00',
    breakDuration: 30,
    userId: 'u1',
    userName: 'Max Mustermann',
    projectNumber: 'B-2026-0001',
    customerName: 'Max Musterkunde',
    ...over,
  }) as TimeEntry;

async function aufklappen() {
  const nutzer = userEvent.setup();
  await nutzer.click(screen.getByRole('button', { name: /Max Musterkunde/ }));
}

/**
 * DAS BUDGET GEHÖRT DER GANZEN BAUSTELLE, NICHT DEM MONAT.
 *
 * AUFGEFALLEN AUS DEM BETRIEB: das Dashboard meldete für eine Baustelle
 * „39,5 von 40 h · 99 %", dieselbe Baustelle stand in der Projektauswertung
 * bei „22,5 h / 40 h · 56 %". Der Unterschied waren die Stunden des
 * Vormonats: die Auswertung verglich EINEN MONAT mit einem Budget, das für
 * den ganzen Auftrag kalkuliert ist.
 *
 * Das ist keine Ungenauigkeit, sondern eine Falschaussage in der teuersten
 * Richtung: wer hier nachsieht, hält eine ausgereizte Baustelle für halb
 * offen und plant weiter.
 */
describe('Projektauswertung — Budget gegen die GANZE Baustelle', () => {
  /** 8 h am 1. August — der Monat, den die Auswertung NICHT zeigt. */
  const august = eintrag({
    id: 'aug',
    date: '2026-08-03',
    startTime: '07:00',
    endTime: '15:00',
    breakDuration: 0,
  } as Partial<TimeEntry>);

  /** 8,5 h im September — der gewählte Monat. */
  const september = eintrag({ id: 'sep' } as Partial<TimeEntry>);

  it('rechnet den Prozentsatz aus ALLEN Stunden, nicht nur denen des Monats', () => {
    render(
      <ProjectSummary
        entries={[september]}
        gesamtEntries={[august, september]}
        projects={[{ ...projekt, estimatedHours: 20 }]}
        label="September 2026"
      />,
    );

    // 8 + 8,5 = 16,5 von 20 h → 83 %. Aus dem Monat allein wären es 43 %.
    expect(screen.getByText('83 %')).toBeInTheDocument();
    expect(screen.queryByText('43 %')).not.toBeInTheDocument();
  });

  it('nennt beide Zahlen, damit niemand die eine für die andere hält', () => {
    render(
      <ProjectSummary
        entries={[september]}
        gesamtEntries={[august, september]}
        projects={[{ ...projekt, estimatedHours: 20 }]}
        label="September 2026"
      />,
    );

    // Der Satz steckt in mehreren Spans; geprüft wird der zusammengesetzte
    // Text des Absatzes.
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          /8,5 h in September 2026 · gesamt 16,5 h von 20 h/.test(el.textContent ?? ''),
      ),
    ).toBeInTheDocument();
  });

  it('zeigt GAR KEINEN Balken, wenn die Gesamtstunden fehlen', () => {
    /*
      `null` heißt „nicht geladen" und ist nicht dasselbe wie „keine". Auf die
      Monatszahl zurückzufallen wäre genau die Falschaussage, um die es hier
      geht — nur diesmal ohne dass jemand sie bemerken könnte.
    */
    render(
      <ProjectSummary
        entries={[september]}
        gesamtEntries={null}
        projects={[{ ...projekt, estimatedHours: 20 }]}
        label="September 2026"
      />,
    );

    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
    expect(screen.getByText(/Gesamtstunden der Baustelle konnten nicht geladen werden/))
      .toBeInTheDocument();
  });
});

describe('Projektauswertung — Marker am Eintrag', () => {
  it('zeigt den Notdienst', async () => {
    render(
      <ProjectSummary
        entries={[eintrag({ id: 'a', isEmergency: true } as Partial<TimeEntry>)]}
        projects={[projekt]}
        gesamtEntries={[]}
        label="September 2026"
      />,
    );
    await aufklappen();

    expect(screen.getByText('Notdienst')).toBeInTheDocument();
  });

  it('zeigt die Nachtarbeit', async () => {
    // Derselbe Grund: Nachtarbeit trägt ebenfalls einen Zuschlag.
    render(
      <ProjectSummary
        entries={[eintrag({ id: 'a', isNightWork: true } as Partial<TimeEntry>)]}
        projects={[projekt]}
        gesamtEntries={[]}
        label="September 2026"
      />,
    );
    await aufklappen();

    expect(screen.getByText('Nacht')).toBeInTheDocument();
  });

  it('zeigt weiterhin den Helfer', async () => {
    // Der einzige Marker, den es hier vorher gab — er darf nicht verlorengehen.
    render(
      <ProjectSummary
        entries={[eintrag({ id: 'a', isHelper: true } as Partial<TimeEntry>)]}
        projects={[projekt]}
        gesamtEntries={[]}
        label="September 2026"
      />,
    );
    await aufklappen();

    expect(screen.getAllByText('Helfer').length).toBeGreaterThan(0);
  });

  it('hängt an einen gewöhnlichen Eintrag GAR NICHTS', async () => {
    // Ein Marker, der immer dasteht, ist keiner.
    render(
      <ProjectSummary
        entries={[eintrag({ id: 'a' } as Partial<TimeEntry>)]}
        projects={[projekt]}
        gesamtEntries={[]}
        label="September 2026"
      />,
    );
    await aufklappen();

    expect(screen.queryByText('Notdienst')).not.toBeInTheDocument();
    expect(screen.queryByText('Nacht')).not.toBeInTheDocument();
    expect(screen.queryByText('Helfer')).not.toBeInTheDocument();
  });
});
