import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
/** Die Liste der Betriebe (M43) — ohne Inhalte. */
let betriebe: unknown[] = [];
vi.mock('@/lib/db/plattform', () => ({
  betriebAnlegen: (daten: unknown) => anlegen(daten),
  betriebAnlegenMitAnmeldung: (daten: unknown) => anlegen(daten),
  plattformBetriebe: vi.fn(async () => betriebe),
}));

// Der zentrale Basiszinssatz hat eine eigene Prüfung (`BasiszinsZentral.test.tsx`).
vi.mock('@/lib/db/basiszins', () => ({
  listBasiszinssaetze: vi.fn(async () => []),
  basiszinssatzSetzen: vi.fn(async () => undefined),
  basiszinssatzEntfernen: vi.fn(async () => undefined),
}));

const plattformFehler = vi.fn();
vi.mock('@/lib/db/fehlerprotokoll', () => ({
  plattformFehler: (...a: unknown[]) => plattformFehler(...a),
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
  // Die Kennung kommt als Vorschlag aus dem Namen (G21) — hier von Hand.
  await nutzer.clear(screen.getByLabelText('Kennung'));
  await nutzer.type(screen.getByLabelText('Kennung'), 'perl');
  await nutzer.type(screen.getByLabelText(/Erster Administrator/), 'Petra Perl');
  await nutzer.type(screen.getByLabelText(/Dessen E-Mail/), 'petra@perl.at');
}

beforeEach(() => {
  betriebe = [];
  plattformFehler.mockReset();
  plattformFehler.mockResolvedValue([]);
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

    // Vor der ersten Eingabe die Anleitung statt einer Rüge (Prüflauf, D19).
    expect(screen.getByText(/Alle Felder ausfüllen/)).toBeInTheDocument();
    expect(screen.queryByText(/braucht einen Namen/)).toBeNull();

    // Der Reihe nach: die Meldung nennt immer den ERSTEN offenen Punkt, sonst
    // stünden vier Sätze übereinander und keiner sagt, wo man anfängt.
    await nutzer.type(screen.getByLabelText(/Erster Administrator/), 'P');
    expect(screen.getByText(/braucht einen Namen/)).toBeInTheDocument();
    await nutzer.clear(screen.getByLabelText(/Erster Administrator/));

    await nutzer.type(screen.getByLabelText(/Name des Betriebs/), 'Perl Installationen');
    await nutzer.clear(screen.getByLabelText('Kennung'));
    await nutzer.type(screen.getByLabelText('Kennung'), 'Perl GmbH');
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
    expect((screen.getByLabelText('Kennung') as HTMLInputElement).value).toBe('');
  });

  it('reicht die Absage der Function durch, statt sie zu ersetzen', async () => {
    /*
      Sie sagt, WARUM abgelehnt wurde — vergebene Kennung, schon vorhandene
      Adresse —, und genau das braucht der Nächste, der es noch einmal
      versucht. Ein allgemeines „hat nicht geklappt" schickt ihn ins Raten.
    */
    anlegen.mockRejectedValue(new Error('Die Kennung „perl“ ist vergeben.'));
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

describe('Fehler aus den Betrieben', () => {
  it('zeigt Abstürze mit dem Betrieb und Meldungen mit ihrem Absender', async () => {
    plattformFehler.mockResolvedValue([
      { id: '1', companyId: 'perl', betrieb: 'Perl Installationen', art: 'absturz', nachricht: 'x is undefined', stapel: null, pfad: '/time', fassung: 'a1', geraet: null, beschreibung: null, createdAt: Date.UTC(2026, 8, 24, 7) },
      { id: '2', companyId: 'mayr', betrieb: 'Mayr Bad', art: 'absturz', nachricht: 'x is undefined', stapel: null, pfad: '/time', fassung: 'a1', geraet: null, beschreibung: null, createdAt: Date.UTC(2026, 8, 24, 8) },
      { id: '3', companyId: 'perl', betrieb: 'Perl Installationen', art: 'meldung', nachricht: null, stapel: null, pfad: '/invoices', fassung: 'a1', geraet: null, beschreibung: 'Rechnung druckt nicht', createdAt: Date.UTC(2026, 8, 24, 9), wer: 'Eva Büro · eva@perl.at' },
    ]);
    zeige();
    expect(await screen.findByText('Rechnung druckt nicht')).toBeInTheDocument();
    expect(screen.getByText(/Eva Büro · eva@perl\.at/)).toBeInTheDocument();
    expect(screen.getByText(/2 betroffen/)).toBeInTheDocument();
    expect(plattformFehler).toHaveBeenCalledWith(14);
  });

  it('sagt es, wenn das Protokoll nicht geladen werden kann', async () => {
    plattformFehler.mockRejectedValue(new Error('Netz weg'));
    zeige();
    expect(await screen.findByText(/Netz weg/)).toBeInTheDocument();
  });
});

/*
  TESTBERICHT 30.09.2026, M43 und G21 — die Liste der Betriebe und die
  Kennung aus dem Namen.
*/
describe('Die Plattformseite — Betriebe und Kennung (M43, G21)', () => {
  it('schlägt die Kennung aus dem Namen vor — bis jemand sie selbst tippt', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.type(screen.getByLabelText(/Name des Betriebs/), 'Müller & Söhne');
    expect(screen.getByLabelText('Kennung')).toHaveValue('mueller-soehne');
    await nutzer.clear(screen.getByLabelText('Kennung'));
    await nutzer.type(screen.getByLabelText('Kennung'), 'mueller');
    await nutzer.type(screen.getByLabelText(/Name des Betriebs/), ' GmbH');
    expect(screen.getByLabelText('Kennung')).toHaveValue('mueller');
  });

  it('listet die Betriebe mit Leitungskonten und wählt daraus den Notzugang', async () => {
    const nutzer = userEvent.setup();
    betriebe = [
      { kennung: 'perl', name: 'Perl Installationen', angelegtAm: '2026-09-01T08:00:00Z', leitungskonten: 1, leitungMitMail: 0, notzugangBis: null },
    ];
    zeige();
    expect(await screen.findByText(/1 Leitungskonto, 0 mit E-Mail/)).toBeInTheDocument();
    expect(screen.getByText('keine Leitung mit E-Mail')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Perl Installationen für den Notzugang wählen' }));
    expect(screen.getByLabelText(/^Betrieb/)).toHaveValue('perl');
  });

  it('Gegenprobe: ohne Liste bleibt das Kennungsfeld für den Notzugang', async () => {
    zeige();
    expect(await screen.findByText('Noch kein Betrieb angelegt.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Kennung des Betriebs/)).toBeInTheDocument();
  });
});

/*
  TESTBERICHT 30.09.2026, P1 — der erste Administrator mit Benutzername:
  Warnung vor dem Anlegen, Startpasswort einmal danach.
*/
describe('Die Plattformseite — erster Administrator mit Benutzername (P1)', () => {
  it('warnt, schickt den Benutzernamen und zeigt das Startpasswort einmal', async () => {
    const nutzer = userEvent.setup();
    anlegen.mockResolvedValue({ companyId: 'perl', ersterAdminUid: 'u1', passwortLink: '', startpasswort: 'Kx7mPq2wRt9aBc', benutzername: 'petra.perl' });
    zeige();
    await nutzer.type(screen.getByLabelText(/Name des Betriebs/), 'Perl Installationen');
    await nutzer.type(screen.getByLabelText(/Erster Administrator/), 'Petra Perl');
    await nutzer.selectOptions(screen.getByLabelText('Anmeldung mit'), 'benutzername');
    expect(screen.getByText(/nur über den Senklot-Support/)).toBeInTheDocument();
    await nutzer.type(screen.getByLabelText(/^Benutzername/), 'petra.perl');
    await nutzer.click(screen.getByRole('button', { name: 'Betrieb anlegen' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][0]).toMatchObject({ anmeldung: 'benutzername', adminBenutzername: 'petra.perl' });
    expect(await screen.findByText('Kx7mPq2wRt9aBc')).toBeInTheDocument();
    expect(screen.getByText(/Das Startpasswort steht nur jetzt hier/)).toBeInTheDocument();
  });

  it('Gegenprobe: ein unbrauchbarer Benutzername sperrt das Anlegen', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.type(screen.getByLabelText(/Name des Betriebs/), 'Perl Installationen');
    await nutzer.type(screen.getByLabelText(/Erster Administrator/), 'Petra Perl');
    await nutzer.selectOptions(screen.getByLabelText('Anmeldung mit'), 'benutzername');
    await nutzer.type(screen.getByLabelText(/^Benutzername/), 'Petra Perl');
    expect(screen.getByRole('button', { name: 'Betrieb anlegen' })).toBeDisabled();
  });
});

describe('Betriebe verwalten im Seitenfenster (Linie „Lot“)', () => {
  it('öffnet „Verwalten“ über die ganze Zeile und schliesst mit Esc', async () => {
    const nutzer = userEvent.setup();
    betriebe = [
      { kennung: 'perl', name: 'Perl Installationen', angelegtAm: '2026-09-01T08:00:00Z', leitungskonten: 1, leitungMitMail: 1, notzugangBis: null },
    ];
    zeige();
    // Vorher klappte die Maske zwischen den Zeilen auf; jetzt ein Fenster.
    await nutzer.click(await screen.findByRole('button', { name: /^Perl Installationen \(perl\)$/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Perl Installationen verwalten' });
    expect(within(fenster).getByLabelText(/Grund \(steht im Protokoll\)/)).toBeInTheDocument();
    await nutzer.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Der eigene Knopf „Verwalten“ bleibt als Weg dorthin.
    await nutzer.click(screen.getByRole('button', { name: 'Perl Installationen verwalten' }));
    expect(await screen.findByRole('dialog', { name: 'Perl Installationen verwalten' })).toBeInTheDocument();
  });
});
