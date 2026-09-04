import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Role, WorkSheet } from '@/types';

/**
 * Der Weg zurück in einen Entwurf.
 *
 * „Als Entwurf speichern" war eine Sackgasse: der Schein landete in dieser
 * Liste, und dort gab es nur Aufklappen, PDF und Storno. Wer ihn anlegte, um
 * ihn später unterschreiben zu lassen — der Regelfall für diesen Knopf:
 * vormittags vorbereiten, nachmittags unterschreiben lassen —, kam nie
 * wieder hinein. Er tippte alles neu und legte damit einen ZWEITEN Beleg
 * über dieselbe Arbeit an.
 */

const scheine: (WorkSheet & { id: string })[] = [
  {
    id: 'e1',
    companyId: 'perl',
    projectNumber: 'B-001',
    customerId: 'k1',
    customerName: 'Familie Huber',
    address: 'Hauptstraße 12',
    datum: '2026-09-04',
    status: 'Entwurf',
    abrechnung: 'Regie',
    zeiten: [],
    material: [],
    erstelltVonUid: 'm1',
    erstelltVonName: 'Max Mustermann',
  } as WorkSheet & { id: string },
  {
    id: 'u1',
    companyId: 'perl',
    projectNumber: 'B-002',
    customerId: 'k2',
    customerName: 'Familie Berger',
    address: 'Nebenweg 3',
    datum: '2026-09-03',
    status: 'Unterschrieben',
    abrechnung: 'Regie',
    zeiten: [],
    material: [],
    erstelltVonUid: 'm1',
    erstelltVonName: 'Max Mustermann',
  } as WorkSheet & { id: string },
];

vi.mock('@/lib/db/workSheets', () => ({
  listRecentWorkSheets: vi.fn(async () => scheine),
  cancelWorkSheet: vi.fn(async () => undefined),
}));
vi.mock('@/features/worksheets/worksheetPdf', () => ({
  buildWorkSheetPdf: vi.fn(),
  shareOrDownloadPdf: vi.fn(),
}));

/*
  EIN STABILES Objekt, nicht bei jedem Aufruf ein neues.

  Die Ansicht haengt ihr Laden an `user`. Gaebe der Mock jedes Mal ein frisch
  gebautes Objekt zurueck, aenderte sich die Identitaet bei jedem Zeichnen,
  das Laden liefe endlos neu an und die Liste bliebe fuer immer bei „Wird
  geladen …". Genau das ist hier zuerst passiert — ein Fehler im TEST, nicht
  in der Ansicht: `AuthContext` liefert im Betrieb einen stabilen Wert.
*/
const authWert = {
  user: {
    uid: 'm1',
    email: 'max@perl.at',
    name: 'Max Mustermann',
    role: 'Mitarbeiter' as Role,
    companyId: 'perl',
    docId: 'm1',
  },
  company: { id: 'perl', name: 'Perl Installationen' },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: WorkSheetsListView } = await import(
  '@/features/worksheets/WorkSheetsListView'
);

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <WorkSheetsListView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authWert.user.role = 'Mitarbeiter';
});

describe('Liste der Handwerksscheine', () => {
  it('führt aus einem Entwurf zurück ins Formular — mit seiner Kennung', async () => {
    /*
      Die Kennung ist der Punkt. Ohne sie öffnete der Knopf ein LEERES
      Formular, und der Monteur legte einen zweiten Beleg über dieselbe
      Arbeit an, statt den vorhandenen zu Ende zu bringen.
    */
    zeichne();
    const knopf = await screen.findByRole('link', { name: /Weiterbearbeiten/ });
    expect(knopf).toHaveAttribute('href', '/worksheet?entwurf=e1');
  });

  it('bietet das bei einem unterschriebenen Schein NICHT an', async () => {
    // Er ist eingefroren; die Rules lehnen jede Änderung ab. Ein Knopf
    // dafür wäre ein Versprechen, das die Datenbank nicht hält.
    zeichne();
    await screen.findByText('Unterschrieben');
    expect(screen.getAllByRole('link', { name: /Weiterbearbeiten/ })).toHaveLength(1);
  });

  it('zeigt den Knopf der Buchhaltung gar nicht erst', async () => {
    /*
      Sie steht in diesem Reiter, darf den Schein aber nicht schreiben. Ein
      sichtbarer Knopf führte sie auf eine Seite mit „Kein Zugriff" — die
      unangenehmste Art, eine Berechtigung zu erklären.
    */
    authWert.user.role = 'Buchhaltung';
    zeichne();
    await screen.findByText('Entwurf');
    expect(screen.queryByRole('link', { name: /Weiterbearbeiten/ })).not.toBeInTheDocument();
  });
});
