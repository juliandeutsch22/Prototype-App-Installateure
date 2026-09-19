import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';

/**
 * Die einzige Seite des globalen Administrators.
 *
 * WAS HIER GEPRÜFT WIRD, IST NICHT DIE SICHERHEIT. Die steht in
 * `tests/firestore.rules.test.ts` (dieses Konto kommt an kein Dokument eines
 * Betriebs) und in `tests/functions/plattform.test.ts` (die Function weist
 * jeden ab, der den Claim nicht trägt). Hier geht es um die Seite: sagt sie,
 * was sie kann, führt sie den Anlagevorgang zu Ende, und zeigt sie den
 * Rücksetzlink — den einzigen Weg, wie der erste Administrator hineinkommt.
 */

const anlegen = vi.fn();
vi.mock('@/lib/db/plattform', () => ({
  betriebAnlegen: (daten: unknown) => anlegen(daten),
}));

const abmelden = vi.fn();
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ signOut: abmelden }),
}));

const { default: PlattformView } = await import('@/features/plattform/PlattformView');

function zeige() {
  return render(
    <ToastProvider>
      <PlattformView />
    </ToastProvider>,
  );
}

async function ausfuellen(nutzer: ReturnType<typeof userEvent.setup>) {
  await nutzer.type(screen.getByLabelText(/Name des Betriebs/), 'Perl Installationen');
  await nutzer.type(screen.getByLabelText(/^Kennung/), 'perl');
  await nutzer.type(screen.getByLabelText(/Erster Administrator/), 'Petra Perl');
  await nutzer.type(screen.getByLabelText(/Dessen E-Mail/), 'petra@perl.at');
}

beforeEach(() => {
  anlegen.mockReset();
  anlegen.mockResolvedValue({
    companyId: 'perl', ersterAdminUid: 'neu1', passwortLink: 'https://x.invalid/pw',
  });
  abmelden.mockClear();
});

describe('Die Plattformseite', () => {
  it('sagt gleich zu Beginn, was dieses Konto NICHT kann', async () => {
    /*
      Ein Konto, das nach „Administrator" klingt und in nichts hineinsieht,
      ist erklärungsbedürftig — sonst sucht der Betreiber die fehlenden Reiter
      und hält die Seite für kaputt.
    */
    zeige();
    expect(await screen.findByText(/sieht in keinen hinein/)).toBeInTheDocument();
  });

  it('lässt nicht anlegen, solange die Eingabe unbrauchbar ist — und sagt warum', async () => {
    // Ein Knopf, der nicht geht und nicht sagt warum, ist die unangenehmste
    // Form einer Fehlermeldung.
    const nutzer = userEvent.setup();
    zeige();
    const knopf = screen.getByRole('button', { name: 'Betrieb anlegen' });
    expect(knopf).toBeDisabled();

    // Der Reihe nach: die Meldung nennt immer den ERSTEN offenen Punkt, sonst
    // stünden vier Sätze übereinander und keiner sagt, wo man anfängt.
    expect(screen.getByText(/braucht einen Namen/)).toBeInTheDocument();

    await nutzer.type(screen.getByLabelText(/Name des Betriebs/), 'Perl Installationen');
    await nutzer.type(screen.getByLabelText(/^Kennung/), 'Perl GmbH');
    expect(screen.getByText(/Kleinbuchstaben, Ziffern und Bindestrichen/)).toBeInTheDocument();
    expect(knopf).toBeDisabled();
  });

  it('legt an und zeigt den Rücksetzlink', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await ausfuellen(nutzer);
    await nutzer.click(screen.getByRole('button', { name: 'Betrieb anlegen' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][0]).toMatchObject({
      companyId: 'perl',
      adminEmail: 'petra@perl.at',
    });

    // Der Link ist der einzige Weg des ersten Administrators hinein — er wird
    // nicht versendet, also muss er hier stehen.
    expect(await screen.findByRole('link', { name: 'https://x.invalid/pw' })).toBeInTheDocument();
    expect(screen.getByText(/nur jetzt hier/)).toBeInTheDocument();
  });

  it('leert das Formular danach, damit kein Betrieb doppelt entsteht', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await ausfuellen(nutzer);
    await nutzer.click(screen.getByRole('button', { name: 'Betrieb anlegen' }));

    await screen.findByText(/nur jetzt hier/);
    expect((screen.getByLabelText(/^Kennung/) as HTMLInputElement).value).toBe('');
  });

  it('reicht die Absage der Function durch, statt sie zu ersetzen', async () => {
    /*
      Sie sagt, WARUM abgelehnt wurde — vergebene Kennung, schon vorhandene
      Adresse —, und genau das braucht der Nächste, der es noch einmal
      versucht. Ein allgemeines „hat nicht geklappt" schickt ihn ins Raten.
    */
    anlegen.mockRejectedValue(new Error('Die Kennung „perl" ist vergeben.'));
    const nutzer = userEvent.setup();
    zeige();
    await ausfuellen(nutzer);
    await nutzer.click(screen.getByRole('button', { name: 'Betrieb anlegen' }));

    expect(await screen.findByText(/ist vergeben/)).toBeInTheDocument();
    // Und die Eingabe bleibt stehen: sonst tippt man alles noch einmal.
    expect((screen.getByLabelText(/Name des Betriebs/) as HTMLInputElement).value).toBe(
      'Perl Installationen',
    );
  });

  it('zeigt nur, was in DIESER Sitzung entstanden ist', async () => {
    // Eine Liste aller Betriebe wäre am Ende doch ein Fenster in fremde
    // Betriebe — und dann hätte dieses Konto genau das, was es nicht haben soll.
    zeige();
    expect(screen.queryByText(/In dieser Sitzung angelegt/)).not.toBeInTheDocument();
  });
});
