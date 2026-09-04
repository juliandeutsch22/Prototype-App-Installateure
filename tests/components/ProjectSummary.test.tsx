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

describe('Projektauswertung — Marker am Eintrag', () => {
  it('zeigt den Notdienst', async () => {
    render(
      <ProjectSummary
        entries={[eintrag({ id: 'a', isEmergency: true } as Partial<TimeEntry>)]}
        projects={[projekt]}
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
        label="September 2026"
      />,
    );
    await aufklappen();

    expect(screen.queryByText('Notdienst')).not.toBeInTheDocument();
    expect(screen.queryByText('Nacht')).not.toBeInTheDocument();
    expect(screen.queryByText('Helfer')).not.toBeInTheDocument();
  });
});
