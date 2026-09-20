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
/*
  Der Betrieb kommt mit: an ihm hängt der Beginn des Urlaubsjahres, und davon
  hängt der aliquote Vorschlag beim Neueintritt ab.
*/
let betrieb: Record<string, unknown> = { id: 'perl', name: 'Perl Installationen' };
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: angemeldet, company: betrieb }),
}));

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

/**
 * Das Anlege-Formular aufklappen.
 *
 * SEIT DEM 18.09. STEHT ES NICHT MEHR OFFEN. Gemessen am Telefon begann die
 * Benutzerliste bei 932 px — eineinhalb Bildschirme unter der Kante. Ein
 * Benutzer wird ein paarmal im Jahr angelegt und dauernd nachgesehen.
 */
async function formOeffnen() {
  await userEvent.click(await screen.findByRole('button', { name: 'Neuer Benutzer' }));
}

beforeEach(() => {
  leute = [];
  ladefehler = null;
  mailGeht = true;
  angemeldet = { uid: 'gf1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' };
  betrieb = { id: 'perl', name: 'Perl Installationen' };
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
    await formOeffnen();
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
    await formOeffnen();
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
    await formOeffnen();
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
    await formOeffnen();
    const rolle = await screen.findByRole('combobox', { name: /Rolle/ });
    expect(within(rolle).queryByRole('option', { name: 'Administrator' })).not.toBeInTheDocument();
    expect(within(rolle).getByRole('option', { name: 'Geschäftsführung' })).toBeInTheDocument();
  });

  it('bietet sie einem Administrator schon an', async () => {
    angemeldet = { uid: 'ad1', companyId: 'perl', name: 'Admin', role: 'Administrator' };
    zeige();
    await formOeffnen();
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
    await formOeffnen();

    await screen.findByText('Erna Beispiel');
    expect(screen.getByText('Neuen Benutzer anlegen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();

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
    await formOeffnen();
    await userEvent.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Neuling');
    await userEvent.type(screen.getByRole('textbox', { name: /Mail/ }), 'neuling@perl.at');
    await userEvent.click(screen.getByRole('button', { name: /Anlegen|Benutzer anlegen/ }));

    const hinweis = await screen.findByRole('alert');
    expect(within(hinweis).getByText('Kupfer-7742-Rohr')).toBeInTheDocument();
  });

  it('zeigt es NICHT, wenn die Mail durchging', async () => {
    zeige();
    await formOeffnen();
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
    await formOeffnen();
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

  it('zeigt die Liste zuerst, nicht die leere Maske', async () => {
    // Gemessen: 932 px bis zur ersten Zeile. Ein Benutzer wird ein paarmal im
    // Jahr angelegt und dauernd nachgesehen.
    zeige();
    await screen.findByRole('button', { name: 'Neuer Benutzer' });
    expect(screen.queryByRole('textbox', { name: /^Name/ })).not.toBeInTheDocument();
  });

  it('zeigt den Ladefehler AUCH bei zugeklapptem Formular', async () => {
    /*
      DIE VERSCHLECHTERUNG, DIE BEIM ZUKLAPPEN FAST ENTSTANDEN WÄRE. Der
      Ladefehler der LISTE stand im Anlege-Formular; solange das immer offen
      war, fiel das nicht auf. Zugeklappt wäre er unsichtbar geworden — die
      Liste bliebe leer, und niemand erführe, warum.
    */
    ladefehler = 'Fehlende Berechtigung';
    zeige();
    expect(await screen.findByText(/Fehlende Berechtigung/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^Name/ })).not.toBeInTheDocument();
  });

  it('zeigt den Ladefehler, statt „keine Benutzer" zu behaupten', async () => {
    ladefehler = 'Fehlende Berechtigung';
    zeige();
    expect(await screen.findByText(/Fehlende Berechtigung/)).toBeInTheDocument();
  });
});

describe('Neueintritt oder Bestand', () => {
  it('fragt danach, bevor jemand die Zeitkonto-Felder überhaupt aufklappt', async () => {
    /*
      DIE FALLE SASS IM EINGEKLAPPTEN TEIL. Wer ihn nie öffnete, bekam die
      Vorbelegung — für einen Bestandsmitarbeiter richtig, für einen
      Neueintritt der VOLLE Jahresanspruch ab Tag eins.
    */
    zeige();
    await formOeffnen();
    expect(await screen.findByLabelText(/Tritt neu ein/)).toBeInTheDocument();
    // Und die Vorgabe ist der Bestand — also das Verhalten von vorher.
    expect((screen.getByLabelText(/Arbeitet schon im Betrieb/) as HTMLInputElement).checked)
      .toBe(true);
  });

  it('legt einen Bestandsmitarbeiter an wie bisher: Resturlaub bleibt leer', async () => {
    zeige();
    await formOeffnen();
    await userEvent.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Berta Bestand');
    await userEvent.type(screen.getByRole('textbox', { name: /Mail/ }), 'berta@perl.at');
    await userEvent.click(screen.getByRole('button', { name: /Anlegen|Benutzer anlegen/ }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][1]).toMatchObject({ initialVacationDays: null });
  });

  it('schlägt beim Neueintritt den aliquoten Anspruch vor und zeigt die Rechnung', async () => {
    zeige();
    await formOeffnen();
    await userEvent.click(screen.getByLabelText(/Tritt neu ein/));
    await userEvent.click(screen.getByRole('button', { name: /Zeitkonto-Einstellungen/ }));

    const eintritt = await screen.findByLabelText('Eintrittsdatum');
    await userEvent.clear(eintritt);
    await userEvent.type(eintritt, '2026-10-15');

    // 25 × 3 von 12 Monaten = 6,25 — und die Rechnung steht daneben.
    expect((screen.getByLabelText(/Urlaub im ersten Jahr/) as HTMLInputElement).value).toBe('6.25');
    expect(screen.getByText(/3 von 12 Monaten/)).toBeInTheDocument();
  });

  it('trägt den Vorschlag sofort beim Umschalten ein, nicht erst beim Datum', async () => {
    /*
      SONST BLIEBE DAS FELD LEER — und leer heisst in `alsProfil` „nicht
      angegeben", also voller Jahresanspruch. Genau die Falle, die diese Wahl
      schliessen soll, wäre damit zurück: wer auf „tritt neu ein" klickt und
      das vorbelegte Datum stehen lässt, bekäme wieder 25 Tage.

      Geprüft wird nur, DASS eine Zahl drinsteht — welche, hängt am heutigen
      Tag und gehört in die Rechenprüfung, nicht hierher.
    */
    zeige();
    await formOeffnen();
    await userEvent.click(screen.getByLabelText(/Tritt neu ein/));
    await userEvent.click(screen.getByRole('button', { name: /Zeitkonto-Einstellungen/ }));

    const feld = (await screen.findByLabelText(/Urlaub im ersten Jahr/)) as HTMLInputElement;
    expect(feld.value).not.toBe('');
    expect(Number(feld.value)).not.toBeNaN();
  });

  it('verlangt beim Neueintritt keinen Überstundensaldo', async () => {
    // Wer eintritt, bringt keine mit. Ein Feld, in das nur eine 0 gehört, ist
    // eine Gelegenheit für einen Tippfehler und sonst nichts.
    zeige();
    await formOeffnen();
    await userEvent.click(screen.getByLabelText(/Tritt neu ein/));
    await userEvent.click(screen.getByRole('button', { name: /Zeitkonto-Einstellungen/ }));

    expect(await screen.findByLabelText('Eintrittsdatum')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Start-Saldo/)).toBeNull();
  });

  it('rechnet den Vorschlag nach dem Urlaubsjahr des Betriebs', async () => {
    /*
      Bei einem Urlaubsjahr ab 1. Juli liegt ein Eintritt im Oktober im
      Urlaubsjahr, das noch neun Monate läuft — nach dem Kalender gerechnet
      bekäme die Person ein Dreivierteljahr Urlaub zu wenig.
    */
    betrieb = { id: 'perl', name: 'Perl Installationen', urlaubJahresbeginn: '07-01' };
    zeige();
    await formOeffnen();
    await userEvent.click(screen.getByLabelText(/Tritt neu ein/));
    await userEvent.click(screen.getByRole('button', { name: /Zeitkonto-Einstellungen/ }));

    const eintritt = await screen.findByLabelText('Eintrittsdatum');
    await userEvent.clear(eintritt);
    await userEvent.type(eintritt, '2026-10-15');

    expect((screen.getByLabelText(/Urlaub im ersten Jahr/) as HTMLInputElement).value)
      .toBe('18.75');
  });

  it('schreibt den Vorschlag auch wirklich in die Anlage', async () => {
    zeige();
    await formOeffnen();
    await userEvent.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Nico Neu');
    await userEvent.type(screen.getByRole('textbox', { name: /Mail/ }), 'nico@perl.at');
    await userEvent.click(screen.getByLabelText(/Tritt neu ein/));
    await userEvent.click(screen.getByRole('button', { name: /Zeitkonto-Einstellungen/ }));

    const eintritt = await screen.findByLabelText('Eintrittsdatum');
    await userEvent.clear(eintritt);
    await userEvent.type(eintritt, '2026-10-15');
    await userEvent.click(screen.getByRole('button', { name: /Anlegen|Benutzer anlegen/ }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][1]).toMatchObject({
      initialVacationDays: 6.25,
      appStartDate: '2026-10-15',
      initialOvertime: 0,
    });
  });
});
