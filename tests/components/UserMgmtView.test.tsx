import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    <ToastProvider>
      <UserMgmtView />
    </ToastProvider>,
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
    await userEvent.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Aushilfe');
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
    await userEvent.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Neu');
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
    await userEvent.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Uebernahme');
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
    const rolle = await screen.findByRole('combobox', { name: /Rolle/ });
    expect(within(rolle).queryByRole('option', { name: 'Administrator' })).not.toBeInTheDocument();
    expect(within(rolle).getByRole('option', { name: 'Geschäftsführung' })).toBeInTheDocument();
  });

  it('bietet sie einem Administrator schon an', async () => {
    angemeldet = { uid: 'ad1', companyId: 'perl', name: 'Admin', role: 'Administrator' };
    zeige();
    const rolle = await screen.findByRole('combobox', { name: /Rolle/ });
    expect(within(rolle).getByRole('option', { name: 'Administrator' })).toBeInTheDocument();
  });

  it('laesst die Geschaeftsfuehrung einen Administrator nicht anfassen', async () => {
    // Sonst koennte sie den letzten Superuser deaktivieren — und niemand
    // kaeme mehr an die Rollenvergabe.
    leute = [person({ uid: 'ad1', name: 'Root Person', role: 'Administrator' })];
    zeige();

    expect(await screen.findByText('nur durch Administrator')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });
});

describe('Benutzerverwaltung — deaktivieren', () => {
  it('bietet keine Deaktivierung des EIGENEN Kontos an', async () => {
    // Wer sich selbst sperrt, kommt nicht mehr herein, um es rueckgaengig zu
    // machen — und bei nur einer Geschaeftsfuehrung ist der Betrieb draussen.
    leute = [
      person({ uid: 'gf1', name: 'Chefin', role: 'Geschäftsführung' }),
      person({ uid: 'u2', name: 'Erna Beispiel' }),
    ];
    zeige();

    await screen.findByText('Chefin');
    await userEvent.click(screen.getByRole('button', { name: /Chefin/ }));
    expect(screen.queryByRole('menuitem', { name: 'Deaktivieren' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Passwort-Mail senden' })).toBeInTheDocument();
  });

  it('schreibt erst nach der Rueckfrage, und schreibt NUR den Status', async () => {
    leute = [person({ uid: 'u2', name: 'Erna Beispiel' })];
    zeige();

    await screen.findByText('Erna Beispiel');
    await userEvent.click(screen.getByRole('button', { name: /Erna Beispiel/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Deaktivieren' }));
    expect(profilAendern).not.toHaveBeenCalled();

    /**
     * Der Knopf muss „Deaktivieren" heissen. Ohne gesetztes `confirmLabel`
     * nimmt der Dialog seine Vorgabe „Löschen" — in einer Ansicht, die per
     * Entscheidung NIE etwas loescht, weil sonst Zeiteintraege verwaisen.
     */
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deaktivieren' }));

    await waitFor(() => expect(profilAendern).toHaveBeenCalledWith('u2', { active: false }));
  });

  it('dreht die Richtung bei einem bereits deaktivierten Konto um', async () => {
    leute = [person({ uid: 'u3', name: 'Ausgeschieden', active: false })];
    zeige();

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: '' }).catch(
      () => screen.getAllByRole('combobox')[0],
    ), 'alle');
    await userEvent.click(await screen.findByRole('button', { name: /Ausgeschieden/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Aktivieren' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aktivieren' }));

    await waitFor(() => expect(profilAendern).toHaveBeenCalledWith('u3', { active: true }));
  });
});

describe('Benutzerverwaltung — anlegen und bearbeiten', () => {
  it('uebernimmt beim Bearbeiten die bestehenden Werte ins Formular', async () => {
    /**
     * Startete das Formular leer, ueberschriebe eine Namenskorrektur die
     * Wochenstunden mit der Vorgabe — und der Saldo waere ab dem naechsten
     * Monat falsch, ohne dass jemand etwas angefasst haette.
     */
    leute = [
      person({ uid: 'u2', name: 'Erna Beispiel', email: 'erna@perl.at',
        role: 'Buchhaltung', weeklyTargetHours: 20, yearlyVacationDays: 30 }),
    ];
    zeige();

    await userEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));

    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('Erna Beispiel');
    expect(screen.getByRole('combobox', { name: /Rolle/ })).toHaveValue('Buchhaltung');
    expect(await screen.findByRole('spinbutton', { name: /Wochenstunden/ })).toHaveValue(20);
    expect(screen.getByRole('spinbutton', { name: /Urlaubstage/ })).toHaveValue(30);
  });

  it('aendert beim Bearbeiten das Profil, statt einen zweiten Zugang anzulegen', async () => {
    leute = [person({ uid: 'u2', name: 'Erna Beispiel' })];
    zeige();

    await userEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    await userEvent.click(screen.getByRole('button', { name: /Speichern|Änderungen/ }));

    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][0]).toBe('u2');
    expect(anlegen).not.toHaveBeenCalled();
  });

  it('zeigt das Startpasswort, wenn die Willkommens-Mail nicht rausging', async () => {
    /**
     * Ohne diesen Weg haette der neue Mitarbeiter KEINEN Zugang und niemand
     * wuesste es: das Konto steht in der Liste, die Anmeldung ist unmoeglich.
     * Das Passwort wird nur dieses eine Mal angezeigt.
     */
    mailGeht = false;
    zeige();
    await userEvent.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Neuling');
    await userEvent.type(screen.getByRole('textbox', { name: /Mail/ }), 'neuling@perl.at');
    await userEvent.click(screen.getByRole('button', { name: /Anlegen|Benutzer anlegen/ }));

    const hinweis = await screen.findByRole('alert');
    expect(within(hinweis).getByText('Kupfer-7742-Rohr')).toBeInTheDocument();
  });

  it('zeigt es NICHT, wenn die Mail durchging', async () => {
    zeige();
    await userEvent.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Neuling');
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
    await userEvent.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Doppelt');
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
