import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser } from '@/types';

/**
 * Die Benutzerakte.
 *
 * WAS SIE ABLÖST. Wer ein Zeitkonto korrigieren wollte, klickte in der Liste
 * auf „Bearbeiten", wurde nach ganz oben in das Anlege-Formular gescrollt und
 * musste dort erst noch „Zeitkonto-Einstellungen anzeigen" aufklappen — genau
 * die Felder, deretwegen er gekommen war. Passwort-Mail und Sperren lagen in
 * einem Zeilenmenü.
 *
 * VIER ZUSICHERUNGEN DIESER DATEI STAMMEN AUS `UserMgmtView.test.tsx` und
 * sind mit der Sache hierher gewandert: bestehende Werte übernehmen statt das
 * Formular leer zu starten, das Profil ändern statt einen zweiten Zugang
 * anzulegen, das eigene Konto nicht sperren können, und einen Administrator
 * nur durch einen Administrator ändern lassen.
 */

function person(p: Partial<AppUser> & { uid: string }): AppUser {
  return {
    id: p.uid, companyId: 'perl', name: 'Max Mustermann', email: 'max@perl.at',
    role: 'Mitarbeiter', active: true, weeklyTargetHours: 40,
    yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5],
    appStartDate: '2026-01-01', initialOvertime: 0,
    ...p,
  } as AppUser;
}

let gefunden: AppUser | null = person({ uid: 'u2', name: 'Erna Beispiel', email: 'erna@perl.at' });
let ladefehler = false;

const profilAendern = vi.fn<unknown[], Promise<void>>(async () => undefined);
const passwortMail = vi.fn(async () => undefined);

vi.mock('@/lib/db/users', () => ({
  getUserByUid: async () => {
    if (ladefehler) throw new Error('kaputt');
    return gefunden;
  },
  updateUserProfile: (...a: unknown[]) => profilAendern(...a),
}));

vi.mock('@/lib/auth/provisionUser', () => ({
  resendPasswordReset: (...a: unknown[]) => passwortMail(...(a as [])),
}));

let angemeldet = {
  uid: 'gf1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as AppUser['role'],
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: angemeldet }) }));

const { default: BenutzerakteView } = await import('@/features/users/BenutzerakteView');

function zeige(uid = 'u2') {
  return render(
    <MemoryRouter initialEntries={[`/user-mgmt/${uid}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/user-mgmt/:uid" element={<BenutzerakteView />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** Der Wert zu einer Beschriftung in den Stammdaten. */
function angabe(wort: string) {
  const dt = screen.getByText(wort);
  return dt.nextElementSibling as HTMLElement;
}

beforeEach(() => {
  gefunden = person({ uid: 'u2', name: 'Erna Beispiel', email: 'erna@perl.at' });
  ladefehler = false;
  angemeldet = { uid: 'gf1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' };
  profilAendern.mockClear();
  passwortMail.mockClear();
});

describe('Die Stammdaten in der Akte', () => {
  it('übernimmt die bestehenden Werte, statt leer zu starten', async () => {
    /*
      AUS DER LISTENPRÜFUNG ÜBERNOMMEN. Startete das Formular leer,
      überschriebe eine Namenskorrektur die Wochenstunden mit der Vorgabe —
      und der Saldo wäre ab dem nächsten Monat falsch, ohne dass jemand
      etwas angefasst hätte.
    */
    gefunden = person({
      uid: 'u2', name: 'Erna Beispiel', email: 'erna@perl.at',
      role: 'Buchhaltung', weeklyTargetHours: 20, yearlyVacationDays: 30,
    });
    zeige();

    expect(await screen.findByRole('textbox', { name: /^Name/ })).toHaveValue('Erna Beispiel');
    expect(screen.getByRole('combobox', { name: /Rolle/ })).toHaveValue('Buchhaltung');
    expect(screen.getByRole('spinbutton', { name: /Wochenstunden/ })).toHaveValue(20);
    expect(screen.getByRole('spinbutton', { name: /Urlaubstage/ })).toHaveValue(30);
  });

  it('zeigt die Zeitkonto-Felder, ohne dass jemand sie aufklappen muss', async () => {
    // Im Anlege-Formular sind sie zu Recht eingeklappt: dort stimmen die
    // Vorgaben meistens. Hier sind sie der Grund, warum jemand kommt.
    zeige();
    await screen.findByRole('textbox', { name: /^Name/ });
    expect(
      screen.queryByRole('button', { name: /Zeitkonto-Einstellungen anzeigen/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /Resturlaub beim Umstieg/ })).toBeInTheDocument();
  });

  it('zeigt die Speicherleiste erst bei einer echten Änderung', async () => {
    zeige();
    await screen.findByRole('textbox', { name: /^Name/ });
    expect(screen.queryByText(/ungespeicherte Änderungen/)).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), '!');
    expect(await screen.findByText(/ungespeicherte Änderungen/)).toBeInTheDocument();
  });

  it('ändert das Profil, statt einen zweiten Zugang anzulegen', async () => {
    // AUS DER LISTENPRÜFUNG ÜBERNOMMEN.
    zeige();
    await userEvent.type(await screen.findByRole('textbox', { name: /^Name/ }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][0]).toBe('u2');
  });

  it('macht aus einer eingetippten Null keine Vorgabe von vierzig', async () => {
    /*
      `Number(x) || 40` sieht harmlos aus und ist es nicht. Wer null
      Wochenstunden einträgt (geringfügig, ruhendes Dienstverhältnis, die
      Chefin selbst), bekäme stillschweigend vierzig — und jeder Monat
      produzierte danach rund 170 Minusstunden, die auf dem Lohnzettel
      stehen.
    */
    zeige();
    const feld = await screen.findByRole('spinbutton', { name: /Wochenstunden/ });
    await userEvent.clear(feld);
    await userEvent.type(feld, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][1]).toMatchObject({ weeklyTargetHours: 0 });
  });

  it('macht aus einem leeren Resturlaub `null` und nicht 0', async () => {
    // „Nicht angegeben" heisst voller Jahresanspruch. Auf 0 gerundet hiesse
    // es „dieses Jahr keinen Tag mehr" und schickte jeden Antrag ins Minus.
    gefunden = person({ uid: 'u2', name: 'Erna Beispiel', initialVacationDays: 7 });
    zeige();
    await userEvent.clear(await screen.findByRole('spinbutton', { name: /Resturlaub beim Umstieg/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][1]).toMatchObject({ initialVacationDays: null });
  });

  it('speichert nicht ohne Namen', async () => {
    zeige();
    await userEvent.clear(await screen.findByRole('textbox', { name: /^Name/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(profilAendern).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Ohne Namen/);
  });

  it('lässt die E-Mail-Adresse nicht ändern — sie ist das Anmeldekonto', async () => {
    zeige();
    expect(await screen.findByRole('textbox', { name: /E-Mail/ })).toBeDisabled();
  });
});

describe('Wen die Akte nicht ändern lässt', () => {
  it('zeigt einem Geschäftsführer einen Administrator nur zum Lesen', async () => {
    /*
      AUS DER LISTENPRÜFUNG ÜBERNOMMEN — und erweitert. Dort hiess es „nur
      durch Administrator", ohne einen Weg zur Person; ANSEHEN darf die
      Geschäftsführung sie. Ändern nicht: sonst könnte sie den letzten
      Superuser deaktivieren, und niemand käme mehr an die Rollenvergabe.
    */
    gefunden = person({ uid: 'ad1', name: 'Root Person', role: 'Administrator' });
    zeige('ad1');

    expect(await screen.findByText(/nur von einem Administrator/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^Name/ })).not.toBeInTheDocument();
    // Gelesen werden darf sie trotzdem — sonst wäre die Zeile eine Sackgasse.
    expect(angabe('Rolle')).toHaveTextContent('Administrator');
    expect(screen.queryByRole('button', { name: /Passwort-Mail/ })).not.toBeInTheDocument();
  });

  it('lässt einen Administrator einen Administrator sehr wohl ändern', async () => {
    // Die Gegenprobe: wäre die Sperre zu streng, käme niemand mehr an die
    // Rollenvergabe — und alle Prüfungen darüber wären trotzdem grün.
    gefunden = person({ uid: 'ad1', name: 'Root Person', role: 'Administrator' });
    angemeldet = { uid: 'ad9', companyId: 'perl', name: 'Admin', role: 'Administrator' };
    zeige('ad1');

    expect(await screen.findByRole('textbox', { name: /^Name/ })).toHaveValue('Root Person');
  });

  it('bietet die Rolle Administrator einer Geschäftsführung nicht zur Wahl an', async () => {
    // Sonst könnte sie sich selbst zum Superuser machen. Dieselbe Grenze
    // steht im Zeilenschutz — hier wird sie nur sichtbar gemacht.
    zeige();
    const rolle = await screen.findByRole('combobox', { name: /Rolle/ });
    expect(within(rolle).queryByRole('option', { name: 'Administrator' })).not.toBeInTheDocument();
  });

  it('bietet sie einem Administrator schon an', async () => {
    // Die Gegenprobe: wäre die Rolle nie wählbar, liesse sich kein zweiter
    // Administrator mehr ernennen, und die Prüfung darüber bliebe grün.
    angemeldet = { uid: 'ad9', companyId: 'perl', name: 'Admin', role: 'Administrator' };
    zeige();
    const rolle = await screen.findByRole('combobox', { name: /Rolle/ });
    expect(within(rolle).getByRole('option', { name: 'Administrator' })).toBeInTheDocument();
  });
});

describe('Der Zugang', () => {
  it('sendet die Passwort-Mail an die Adresse dieser Person', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Passwort-Mail senden' }));
    await waitFor(() => expect(passwortMail).toHaveBeenCalledWith('erna@perl.at'));
  });

  it('schreibt erst nach der Rückfrage, und schreibt NUR den Status', async () => {
    /*
      AUS DER LISTENPRÜFUNG ÜBERNOMMEN. Der Knopf muss „Deaktivieren"
      heissen: ohne gesetztes `confirmLabel` nimmt der Dialog seine Vorgabe
      „Löschen" — in einer Ansicht, die per Entscheidung NIE etwas löscht,
      weil sonst Zeiteinträge verwaisen.
    */
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Konto deaktivieren' }));
    expect(profilAendern).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deaktivieren' }));

    await waitFor(() => expect(profilAendern).toHaveBeenCalledWith('u2', { active: false }));
  });

  it('dreht die Richtung bei einem bereits deaktivierten Konto um', async () => {
    gefunden = person({ uid: 'u3', name: 'Ausgeschieden', active: false });
    zeige('u3');

    await userEvent.click(await screen.findByRole('button', { name: 'Konto aktivieren' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aktivieren' }));

    await waitFor(() => expect(profilAendern).toHaveBeenCalledWith('u3', { active: true }));
  });

  it('bietet keine Deaktivierung des EIGENEN Kontos an', async () => {
    /*
      AUS DER LISTENPRÜFUNG ÜBERNOMMEN. Wer sich selbst sperrt, kommt nicht
      mehr herein, um es rückgängig zu machen — und bei nur einer
      Geschäftsführung ist der Betrieb draussen.
    */
    gefunden = person({ uid: 'gf1', name: 'Chefin', role: 'Geschäftsführung' });
    zeige('gf1');

    expect(await screen.findByText(/eigene Konto lässt sich nicht sperren/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Konto deaktivieren/ })).not.toBeInTheDocument();
    // Die Passwort-Mail an sich selbst bleibt erlaubt.
    expect(screen.getByRole('button', { name: 'Passwort-Mail senden' })).toBeInTheDocument();
    // Und auch über das Statusfeld geht es nicht.
    expect(screen.getByRole('combobox', { name: /Status/ })).toBeDisabled();
  });
});

describe('Wenn es die Person nicht gibt', () => {
  it('unterscheidet „gibt es nicht" von „konnte nicht laden"', async () => {
    gefunden = null;
    zeige();
    expect(await screen.findByText(/gibt es nicht/)).toBeInTheDocument();
  });

  it('sagt beim Ladefehler, dass geladen werden konnte — und bietet es erneut an', async () => {
    ladefehler = true;
    zeige();
    expect(await screen.findByText(/konnte nicht geladen werden/)).toBeInTheDocument();
  });
});
