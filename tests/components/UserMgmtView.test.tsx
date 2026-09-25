import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser } from '@/types';
import UserMgmtView from '@/features/users/UserMgmtView';

/**
 * Benutzerverwaltung — wer im Betrieb was darf, und wer noch hinein kommt.
 *
 * Zwei Dinge machen diese Ansicht heikel, und beide sind still: eine falsch
 * vergebene Rolle merkt niemand, bis jemand etwas sieht, das er nicht sehen
 * soll; und eine falsch gesetzte Zahl im Zeitkonto steht am Monatsende auf
 * dem Lohnzettel, ohne dass irgendwo eine Meldung erschienen wäre.
 *
 * GEPRÜFT WIRD DIE VERDRAHTUNG. Ob die Grenzen serverseitig HALTEN, sagen die
 * Regeltests gegen den Emulator — hier steht, ob die Oberfläche dieselbe
 * Grenze zieht. Beides zusammen ist der Punkt: eine Oberfläche, die etwas
 * anbietet, das der Server ablehnt, ist ein Knopf, der nichts tut.
 */

function person(p: Partial<AppUser> & { uid: string }): AppUser {
  return {
    id: p.uid, companyId: 'perl', name: 'Max Mustermann', email: 'max@perl.at',
    role: 'Mitarbeiter', active: true, weeklyTargetHours: 40,
    yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5],
    ...p,
  } as AppUser;
}

let leute: AppUser[] = [];
let ladefehler: string | null = null;
let mailGeht = true;

const profilAendern = vi.fn();
const anlegen = vi.fn();
const passwortMail = vi.fn();

vi.mock('@/lib/db/users', () => ({
  DEFAULT_WEEKLY_HOURS: 40,
  DEFAULT_VACATION_DAYS: 25,
  DEFAULT_WORK_DAYS: [1, 2, 3, 4, 5],
  listUsers: vi.fn(async () => {
    if (ladefehler) throw new Error(ladefehler);
    return leute;
  }),
  updateUserProfile: (...a: unknown[]) => profilAendern(...a),
}));

vi.mock('@/lib/auth/provisionUser', () => ({
  provisionUser: (...a: unknown[]) => {
    anlegen(...a);
    return Promise.resolve({ mailSent: mailGeht, tempPassword: 'Kupfer-7742-Rohr' });
  },
  resendPasswordReset: (...a: unknown[]) => {
    passwortMail(...a);
    return Promise.resolve();
  },
}));

let angemeldet = {
  uid: 'gf1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as AppUser['role'],
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: angemeldet }) }));

function zeige() {
  return render(
    // Die Liste verweist in die Akte — ohne Router wirft jeder `Link`.
    <MemoryRouter>
      <ToastProvider>
        <UserMgmtView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  leute = [];
  ladefehler = null;
  mailGeht = true;
  angemeldet = { uid: 'gf1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' };
  profilAendern.mockReset().mockResolvedValue(undefined);
  anlegen.mockReset();
  passwortMail.mockReset();
  // Die Ansicht scrollt beim Wechsel in den Bearbeitungsmodus nach oben;
  // jsdom kennt das nicht.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

/**
 * SEIT DEM 18.09.2026 IST DAS ANLAGE-FORMULAR ZUGEKLAPPT.
 *
 * Vorher stand es ueber der Benutzerliste, durch die man sucht. Jetzt oeffnet
 * es „Neuer Benutzer" oben — wer die Felder pruefen will, geht denselben Weg
 * wie der Betrieb.
 */
async function formularOeffnen() {
  await userEvent.click(await screen.findByRole('button', { name: 'Neuer Benutzer' }));
}

describe('Benutzerverwaltung — das Zeitkonto', () => {
  it('nimmt eine eingetragene NULL als Null, nicht als Vorgabe', async () => {
    /**
     * DER TEUERSTE FEHLER DIESER ANSICHT, und er war unsichtbar.
     * `Number(x) || VORGABE` faellt bei einer eingegebenen 0 auf die Vorgabe
     * zurueck — in JavaScript ist die Null unwahr. Beide Felder erlauben
     * ausdruecklich `min="0"`. Wer null Wochenstunden eintraegt
     * (geringfuegig, ruhendes Dienstverhaeltnis), bekam vierzig, und jeder
     * Monat produzierte danach rund 170 Minusstunden — auf dem Lohnzettel.
     */
    zeige();
    await formularOeffnen();
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), 'Aushilfe');
    await userEvent.type(screen.getByRole('textbox', { name: /Mail/ }), 'aushilfe@perl.at');
    await userEvent.click(screen.getByRole('button', { name: /Zeitkonto-Einstellungen/ }));

    const stunden = await screen.findByRole('spinbutton', { name: /Wochenstunden/ });
    await userEvent.clear(stunden);
    await userEvent.type(stunden, '0');
    const urlaub = screen.getByRole('spinbutton', { name: /Urlaubstage/ });
    await userEvent.clear(urlaub);
    await userEvent.type(urlaub, '0');

    await userEvent.click(screen.getByRole('button', { name: /Anlegen|Benutzer anlegen/ }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][1]).toMatchObject({
      weeklyTargetHours: 0,
      yearlyVacationDays: 0,
    });
  });

  it('faellt bei einem LEER gelassenen Feld auf die Vorgabe zurueck', async () => {
    // Der Rueckfall selbst ist richtig — leer heisst „nicht entschieden",
    // und ein Zeitkonto ohne Sollstunden rechnet gar nicht.
    zeige();
    await formularOeffnen();
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), 'Neu');
    await userEvent.type(screen.getByRole('textbox', { name: /Mail/ }), 'neu@perl.at');
    await userEvent.click(screen.getByRole('button', { name: /Zeitkonto-Einstellungen/ }));
    await userEvent.clear(await screen.findByRole('spinbutton', { name: /Wochenstunden/ }));
    await userEvent.click(screen.getByRole('button', { name: /Anlegen|Benutzer anlegen/ }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][1].weeklyTargetHours).toBe(40);
  });

  it('nimmt einen negativen Start-Saldo mit', async () => {
    // Wer mit Minusstunden uebernommen wird, startet mit Minusstunden. Ein
    // verschluckter Start-Saldo verschenkt oder erfindet Arbeitszeit.
    zeige();
    await formularOeffnen();
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), 'Uebernahme');
    await userEvent.type(screen.getByRole('textbox', { name: /Mail/ }), 'ue@perl.at');
    await userEvent.click(screen.getByRole('button', { name: /Zeitkonto-Einstellungen/ }));
    const saldo = await screen.findByRole('spinbutton', { name: /Start-Saldo/ });
    await userEvent.clear(saldo);
    await userEvent.type(saldo, '-12.5');
    await userEvent.click(screen.getByRole('button', { name: /Anlegen|Benutzer anlegen/ }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][1].initialOvertime).toBe(-12.5);
  });
});

describe('Benutzerverwaltung — die Rolle Administrator', () => {
  it('bietet der Geschaeftsfuehrung die Rolle Administrator NICHT an', async () => {
    /**
     * Dieselbe Grenze steht in `firestore.rules` und ist dort die Wahrheit.
     * Hier wird sie sichtbar gemacht — sonst waere es ein Knopf, der
     * serverseitig scheitert, ohne dass jemand versteht warum.
     */
    zeige();
    await formularOeffnen();
    const rolle = await screen.findByRole('combobox', { name: /Rolle/ });
    expect(within(rolle).queryByRole('option', { name: 'Administrator' })).not.toBeInTheDocument();
    expect(within(rolle).getByRole('option', { name: 'Geschäftsführung' })).toBeInTheDocument();
  });

  it('bietet sie einem Administrator schon an', async () => {
    angemeldet = { uid: 'ad1', companyId: 'perl', name: 'Admin', role: 'Administrator' };
    zeige();
    await formularOeffnen();
    const rolle = await screen.findByRole('combobox', { name: /Rolle/ });
    expect(within(rolle).getByRole('option', { name: 'Administrator' })).toBeInTheDocument();
  });

  /*
    „laesst die Geschaeftsfuehrung einen Administrator nicht anfassen" steht
    jetzt in `BenutzerakteView.test.tsx`. Hier stand dazu ein „nur durch
    Administrator" OHNE Weg zur Person — eine Sackgasse. Die Liste führt
    jetzt auch dorthin; wer nicht ändern darf, erfährt es in der Akte.
  */
  it('führt auch zu einem Administrator, den man nicht ändern darf', async () => {
    leute = [person({ uid: 'ad1', name: 'Root Person', role: 'Administrator' })];
    zeige();

    const zeile = (await screen.findByText('Root Person')).closest('li') as HTMLElement;
    expect(within(zeile).getByRole('link', { name: 'Akte' })).toHaveAttribute(
      'href', '/user-mgmt/ad1',
    );
  });
});

describe('Benutzerverwaltung — anlegen und bearbeiten', () => {
  /*
    „uebernimmt beim Bearbeiten die bestehenden Werte" und „aendert das
    Profil statt einen zweiten Zugang anzulegen" stehen jetzt in
    `BenutzerakteView.test.tsx` — dort wird bearbeitet. Was HIER bleibt, ist
    die Grenze zwischen den beiden Ansichten.
  */
  it('legt aus diesem Formular nur an — ändern kann es nicht mehr', async () => {
    leute = [person({ uid: 'u2', name: 'Erna Beispiel' })];
    zeige();

    await screen.findByText('Erna Beispiel');
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();

    await formularOeffnen();
    // Die Karte heisst „Neuen Benutzer anlegen" — nicht „bearbeiten".
    expect(screen.getByRole('heading', { name: 'Neuen Benutzer anlegen' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), 'Neu Person');
    await userEvent.type(screen.getByRole('textbox', { name: /E-Mail/ }), 'neu@perl.at');
    await userEvent.click(screen.getByRole('button', { name: 'Benutzer anlegen' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(profilAendern).not.toHaveBeenCalled();
  });

  it('zeigt das Startpasswort, wenn die Willkommens-Mail nicht rausging', async () => {
    /**
     * Ohne diesen Weg haette der neue Mitarbeiter KEINEN Zugang und niemand
     * wuesste es: das Konto steht in der Liste, die Anmeldung ist unmoeglich.
     * Das Passwort wird nur dieses eine Mal angezeigt.
     */
    mailGeht = false;
    zeige();
    await formularOeffnen();
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), 'Neuling');
    await userEvent.type(screen.getByRole('textbox', { name: /Mail/ }), 'neuling@perl.at');
    await userEvent.click(screen.getByRole('button', { name: /Anlegen|Benutzer anlegen/ }));

    const hinweis = await screen.findByRole('alert');
    expect(within(hinweis).getByText('Kupfer-7742-Rohr')).toBeInTheDocument();
  });

  it('zeigt es NICHT, wenn die Mail durchging', async () => {
    zeige();
    await formularOeffnen();
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), 'Neuling');
    await userEvent.type(screen.getByRole('textbox', { name: /Mail/ }), 'neuling@perl.at');
    await userEvent.click(screen.getByRole('button', { name: /Anlegen|Benutzer anlegen/ }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(screen.queryByText('Kupfer-7742-Rohr')).not.toBeInTheDocument();
  });

  it('nennt eine doppelte Mailadresse beim Namen', async () => {
    // „Konnte nicht angelegt werden" schickt den Benutzer auf die Suche. Der
    // Grund ist bekannt, also gehoert er auch hin.
    anlegen.mockImplementation(() => {
      throw new Error('auth/email-already-in-use');
    });
    zeige();
    await formularOeffnen();
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), 'Doppelt');
    await userEvent.type(screen.getByRole('textbox', { name: /Mail/ }), 'max@perl.at');
    await userEvent.click(screen.getByRole('button', { name: /Anlegen|Benutzer anlegen/ }));

    expect(await screen.findByText(/E-Mail ist bereits vergeben/)).toBeInTheDocument();
  });
});

describe('Benutzerverwaltung — die Liste', () => {
  it('unterscheidet einen leeren Betrieb von einer erfolglosen Suche', async () => {
    zeige();
    expect(await screen.findByText(/Noch keine Benutzer/)).toBeInTheDocument();
  });

  it('sagt bei erfolgloser Suche, wonach gesucht wurde', async () => {
    leute = Array.from({ length: 8 }, (_, i) =>
      person({ uid: `u${i}`, name: `Person ${i}`, email: `p${i}@perl.at` }),
    );
    zeige();
    await userEvent.type(await screen.findByRole('searchbox', { name: /Suche/ }), 'Wasserhahn');
    expect(await screen.findByText(/Niemand passt zu/)).toBeInTheDocument();
  });

  it('blendet deaktivierte Konten aus der Vorgabeansicht aus', async () => {
    leute = [
      person({ uid: 'u2', name: 'Erna Beispiel' }),
      person({ uid: 'u3', name: 'Ausgeschieden', active: false }),
    ];
    zeige();

    expect(await screen.findByText('Erna Beispiel')).toBeInTheDocument();
    expect(screen.queryByText('Ausgeschieden')).not.toBeInTheDocument();
  });

  it('zeigt den Ladefehler, statt „keine Benutzer" zu behaupten', async () => {
    ladefehler = 'Fehlende Berechtigung';
    zeige();
    expect(await screen.findByText(/Fehlende Berechtigung/)).toBeInTheDocument();
  });
});
