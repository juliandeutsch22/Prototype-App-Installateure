import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, KontoUmstellung, UrlaubsanspruchAnpassung } from '@/types';
import { kunstadresse } from '@shared/benutzername';

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

const profilAendern = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
const passwortMail = vi.fn(async () => undefined);

/** Das Geburtsdatum (05.10.2026) hat eine eigene Prüfung (`ArbeitszeitGrenzenKarten.test.tsx`). */
vi.mock('@/lib/db/arbeitszeitGrenzen', () => ({
  getGeburtsdatum: vi.fn(async () => null),
  setGeburtsdatum: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/users', () => ({
  getUserByUid: async () => {
    if (ladefehler) throw new Error('kaputt');
    return gefunden;
  },
  updateUserProfile: (...a: unknown[]) => profilAendern(...a),
  listKontoUmstellungen: async () => protokoll,
}));

vi.mock('@/lib/auth/provisionUser', () => ({
  resendPasswordReset: (...a: unknown[]) => passwortMail(...(a as [])),
  generatePassword: () => 'Messing-3319-Bogen',
}));

const vergeben = vi.fn<(a0: string, a1: string) => Promise<void>>(async () => undefined);
let protokoll: KontoUmstellung[] = [];
const umstellen = vi.fn<(uid: string, ziel: Record<string, string>) => Promise<{ anmeldung: string; startpasswort?: string }>>(
  async () => ({ anmeldung: 'neu@perl.at' }),
);
vi.mock('@/lib/auth/sitzung', () => ({
  passwortVergeben: (uid: string, pw: string) => vergeben(uid, pw),
  kontoUmstellen: (uid: string, ziel: Record<string, string>) => umstellen(uid, ziel),
}));

let anpassungen: UrlaubsanspruchAnpassung[] = [];
const anpassen = vi.fn<(d: Record<string, unknown>) => Promise<string>>(async () => 'neu');
const entfernen = vi.fn<(id: string, grund: string) => Promise<void>>(async () => undefined);
vi.mock('@/lib/db/urlaubsanspruch', () => ({
  listAnpassungen: async () => anpassungen,
  anspruchAnpassen: (d: Record<string, unknown>) => anpassen(d),
  anpassungEntfernen: (id: string, grund: string) => entfernen(id, grund),
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
  vergeben.mockReset().mockResolvedValue(undefined);
  anpassungen = [];
  anpassen.mockClear();
  entfernen.mockClear();
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
    expect(screen.getByRole('textbox', { name: /Wochenstunden/ })).toHaveValue('20');
    expect(screen.getByRole('textbox', { name: /Urlaubstage/ })).toHaveValue('30');
  });

  it('zeigt die Zeitkonto-Felder, ohne dass jemand sie aufklappen muss', async () => {
    // Im Anlege-Formular sind sie zu Recht eingeklappt: dort stimmen die
    // Vorgaben meistens. Hier sind sie der Grund, warum jemand kommt.
    zeige();
    await screen.findByRole('textbox', { name: /^Name/ });
    expect(
      screen.queryByRole('button', { name: /Zeitkonto-Einstellungen anzeigen/ }),
    ).not.toBeInTheDocument();
    // Ohne eigenes Eintrittsdatum ist es ein Neueintritt: das Feld heisst wie in der Anlage (M6).
    expect(screen.getByRole('textbox', { name: /Urlaub im ersten Jahr/ })).toBeInTheDocument();
  });

  it('zeigt Eintritt und Saldo-Start getrennt und benennt den Urlaub wie die Anlage (M6)', async () => {
    gefunden = person({ uid: 'u2', name: 'Erna Beispiel', eintritt: '2015-03-01', appStartDate: '2026-10-01' });
    zeige();
    await screen.findByRole('textbox', { name: /^Name/ });
    expect(screen.getByLabelText(/Eintrittsdatum/)).toHaveValue('2015-03-01');
    expect(screen.getByLabelText(/Saldo-Startdatum/)).toHaveValue('2026-10-01');
    expect(screen.getByRole('textbox', { name: /Resturlaub beim Umstieg/ })).toBeInTheDocument();
  });

  it('speichert keinen Eintritt nach dem Saldo-Start (M6)', async () => {
    gefunden = person({ uid: 'u2', name: 'Erna Beispiel', eintritt: '2026-01-01', appStartDate: '2026-01-01' });
    zeige();
    const eintritt = await screen.findByLabelText(/Eintrittsdatum/);
    await userEvent.clear(eintritt);
    await userEvent.type(eintritt, '2026-02-01');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(profilAendern).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Eintrittsdatum liegt nach dem Saldo-Start/);
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
    const feld = await screen.findByRole('textbox', { name: /Wochenstunden/ });
    await userEvent.clear(feld);
    await userEvent.type(feld, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][1]).toMatchObject({ weeklyTargetHours: 0 });
  });

  it('macht aus einem leeren Resturlaub `null` und nicht 0', async () => {
    // „Nicht angegeben" heisst voller Jahresanspruch. Auf 0 gerundet hiesse
    // es „dieses Jahr keinen Tag mehr" und schickte jeden Antrag ins Minus.
    gefunden = person({
      uid: 'u2', name: 'Erna Beispiel', initialVacationDays: 7, eintritt: '2015-03-01',
    });
    zeige();
    await userEvent.clear(await screen.findByRole('textbox', { name: /Resturlaub beim Umstieg/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][1]).toMatchObject({ initialVacationDays: null });
  });

  // Testbericht 30.09.2026, G9 — das leere Feld sagt, was es bedeutet.
  it('sagt im leeren Urlaubsfeld „leer = voller Anspruch“ (G9)', async () => {
    zeige();
    const feld = await screen.findByRole('textbox', { name: /Urlaub im ersten Jahr/ });
    expect(feld).toHaveValue('');
    expect(feld).toHaveAttribute('placeholder', 'leer = voller Anspruch');
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

describe('Die Einstufung (Testbericht 4.1)', () => {
  it('legt einen Lehrling mit Lehrbeginn und Lehrzeit an und zeigt das Lehrjahr', async () => {
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText('Einstufung'), 'lehrling');
    // Die Lehrzeit ist mit dem Üblichen vorbelegt, der Lehrbeginn nicht.
    expect(screen.getByLabelText('Lehrzeit')).toHaveValue('36');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(profilAendern).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Lehrbeginn/);

    await userEvent.type(screen.getByLabelText(/^Lehrbeginn/), '2025-09-01');
    expect(screen.getByText(/Heute im/)).toHaveTextContent(/Lehrjahr · Lehrzeit bis 31.08.2028/);
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][1]).toEqual(
      expect.objectContaining({ einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeitMonate: 36 }),
    );
  });

  it('ohne Lehrling fallen Lehrbeginn und Lehrzeit weg', async () => {
    gefunden = person({
      uid: 'u2', name: 'Erna Beispiel', einstufung: 'lehrling', lehrbeginn: '2023-09-01', lehrzeitMonate: 36,
    });
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText('Einstufung'), 'facharbeiter');
    expect(screen.queryByLabelText(/^Lehrbeginn/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][1]).toEqual(
      expect.objectContaining({ einstufung: 'facharbeiter', lehrbeginn: null, lehrzeitMonate: null }),
    );
  });

  // Entscheidung 03.10.2026 — Lehrlingsstunden im Projekt-Budget je Person.
  it('bietet beim Lehrling den Schalter „Stunden zählen ins Projekt-Budget“ und speichert ihn', async () => {
    gefunden = person({
      uid: 'u2', name: 'Erna Beispiel', einstufung: 'lehrling', lehrbeginn: '2023-09-01', lehrzeitMonate: 36,
    });
    zeige();
    const schalter = await screen.findByRole('checkbox', { name: 'Stunden zählen ins Projekt-Budget' });
    expect(schalter).toBeChecked(); // ab Werk wie bisher
    await userEvent.click(schalter);
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][1]).toEqual(expect.objectContaining({ stundenInsBudget: false }));
  });

  it('Gegenprobe: ohne Lehre kein Schalter, und gespeichert wird wieder „zählt“', async () => {
    gefunden = person({
      uid: 'u2', name: 'Erna Beispiel', einstufung: 'lehrling', lehrbeginn: '2023-09-01', lehrzeitMonate: 36,
      stundenInsBudget: false,
    });
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText('Einstufung'), 'facharbeiter');
    expect(screen.queryByRole('checkbox', { name: 'Stunden zählen ins Projekt-Budget' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][1]).toEqual(expect.objectContaining({ stundenInsBudget: true }));
  });

  // Runde 3, M13: eine Umstufung gilt ab ihrem Tag — die Akte sagt es, bevor gespeichert wird.
  it('sagt bei einer Umstufung, dass frühere Stunden den bisherigen Satz behalten', async () => {
    gefunden = person({
      uid: 'u2', name: 'Erna Beispiel', einstufung: 'lehrling', lehrbeginn: '2023-09-01', lehrzeitMonate: 36,
    });
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText('Einstufung'), 'facharbeiter');
    expect(screen.getByText(/Umstufung von Lehrling auf Facharbeiter: gilt ab heute/)).toBeInTheDocument();
    expect(screen.getByText(/bleiben beim Satz Lehrling\./)).toBeInTheDocument();
    expect(screen.queryByText(/für neue und für noch nicht verrechnete Stunden/)).toBeNull();
  });

  it('Gegenprobe: die erste Einstufung ist keine Umstufung', async () => {
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText('Einstufung'), 'helfer');
    expect(screen.queryByText(/Umstufung von/)).toBeNull();
  });

  it('nennt frühere Stufen mit ihrem letzten Tag', async () => {
    gefunden = person({
      uid: 'u2', name: 'Erna Beispiel', einstufung: 'facharbeiter',
      einstufungVerlauf: [{ einstufung: 'lehrling', lehrbeginn: '2023-09-01', lehrzeit_monate: 36, bis: '2026-10-06' }],
    });
    zeige();
    expect(await screen.findByText(/Frühere Einstufung: Lehrling bis 05\.10\.2026\./)).toBeInTheDocument();
  });

  it('zeigt „nicht festgelegt“, solange keine Einstufung gesetzt ist', async () => {
    zeige();
    await screen.findByRole('textbox', { name: /^Name/ });
    expect(screen.getByLabelText('Einstufung')).toHaveValue('');
    expect(screen.getAllByText(/zählt wie Facharbeiter/).length).toBeGreaterThan(0);
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

    /*
      GEWARTET WIRD AUF DAS FORMULAR, NICHT AUF DEN SATZ. Der Hinweis steht im
      Zugangsbereich und ist da, sobald die Person geladen ist; das Formular
      entsteht einen Rendergang später, weil der Entwurf aus einem Effekt
      kommt. Auf dem langsameren CI-Läufer fiel die Prüfung des Statusfeldes
      genau in diese Lücke — sie fand die Nur-Lese-Ansicht vor. Dieselbe
      Reihenfolge wie in den Prüfungen weiter oben.
    */
    expect(await screen.findByRole('textbox', { name: /^Name/ })).toBeInTheDocument();
    expect(screen.getByText(/eigene Konto lässt sich nicht sperren/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Konto deaktivieren/ })).not.toBeInTheDocument();
    // Die Passwort-Mail an sich selbst bleibt erlaubt.
    expect(screen.getByRole('button', { name: 'Passwort-Mail senden' })).toBeInTheDocument();
    // Und auch über das Statusfeld geht es nicht.
    expect(screen.getByRole('combobox', { name: /Status/ })).toBeDisabled();
  });
});

describe('Wenn es die Person nicht gibt', () => {
  it('unterscheidet „gibt es nicht“ von „konnte nicht laden“', async () => {
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

describe('Ein Konto mit Benutzername', () => {
  beforeEach(() => {
    gefunden = person({ uid: 'u3', name: 'Hans Helfer', email: kunstadresse('hans') });
  });

  it('zeigt den Benutzernamen, nicht die Kunstadresse', async () => {
    zeige('u3');
    expect(await screen.findByRole('textbox', { name: /Benutzername/ })).toHaveValue('hans');
    expect(screen.queryByDisplayValue(/senklot\.invalid/)).not.toBeInTheDocument();
  });

  it('bietet keine Passwort-Mail an — es gibt kein Postfach', async () => {
    zeige('u3');
    await screen.findByRole('button', { name: 'Neues Startpasswort vergeben' });
    expect(screen.queryByRole('button', { name: /Passwort-Mail/ })).not.toBeInTheDocument();
  });

  it('vergibt nach Rückfrage ein Startpasswort und zeigt es genau einmal', async () => {
    const nutzer = userEvent.setup();
    zeige('u3');
    await nutzer.click(await screen.findByRole('button', { name: 'Neues Startpasswort vergeben' }));
    // Erst die Rückfrage — das alte Passwort gilt danach nicht mehr.
    expect(vergeben).not.toHaveBeenCalled();
    await nutzer.click(screen.getByRole('button', { name: 'Vergeben' }));

    await waitFor(() => expect(vergeben).toHaveBeenCalledWith('u3', 'Messing-3319-Bogen'));
    const hinweis = await screen.findByRole('alert');
    expect(within(hinweis).getByText('Messing-3319-Bogen')).toBeInTheDocument();
    expect(within(hinweis).getByText('hans')).toBeInTheDocument();

    await nutzer.click(within(hinweis).getByRole('button', { name: 'Verstanden' }));
    expect(screen.queryByText('Messing-3319-Bogen')).not.toBeInTheDocument();
  });

  it('sagt, wenn der Server ablehnt — und zeigt dann kein Passwort', async () => {
    vergeben.mockRejectedValue(new Error('Das Passwort eines Administrators vergibt nur ein Administrator.'));
    const nutzer = userEvent.setup();
    zeige('u3');
    await nutzer.click(await screen.findByRole('button', { name: 'Neues Startpasswort vergeben' }));
    await nutzer.click(screen.getByRole('button', { name: 'Vergeben' }));

    expect(await screen.findByText(/vergibt nur ein Administrator/)).toBeInTheDocument();
    expect(screen.queryByText('Messing-3319-Bogen')).not.toBeInTheDocument();
  });

  it('beim eigenen Konto: kein Knopf, sondern der Weg zu „Mein Konto“', async () => {
    angemeldet = { ...angemeldet, uid: 'u3' };
    zeige('u3');
    expect(await screen.findByText(/Das eigene Passwort unter „Mein Konto“ ändern/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neues Startpasswort vergeben' })).not.toBeInTheDocument();
  });
});

/**
 * Zwei Schalter, entschieden am 24.09.2026 (Prüflauf F11, F12, F17).
 *
 * „Darf Kunden anlegen und ändern“ gibt es nur bei Verwaltung und
 * Buchhaltung, „Führt ein Zeitkonto“ nur bei der Geschäftsführung — bei allen
 * anderen legt die Rolle fest, was gilt, und ein Haken ohne Wirkung wäre eine
 * Einstellung, die lügt.
 */
describe('Kunden pflegen und Zeitkonto', () => {
  it('bietet der Verwaltung die Kundenfreigabe an — und speichert sie', async () => {
    gefunden = person({ uid: 'u2', name: 'Vera Büro', role: 'Verwaltung' });
    zeige();
    const haken = await screen.findByRole('checkbox', { name: 'Darf Kunden anlegen und ändern' });
    expect(haken).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Führt ein Zeitkonto' })).not.toBeInTheDocument();

    await userEvent.click(haken);
    await userEvent.click(await screen.findByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][1]).toMatchObject({ kundenPflegen: true, fuehrtZeitkonto: false });
  });

  it('bietet sie dem Monteur nicht an', async () => {
    gefunden = person({ uid: 'u2', role: 'Mitarbeiter' });
    zeige();
    await screen.findByRole('textbox', { name: /^Name/ });
    expect(screen.queryByRole('checkbox', { name: 'Darf Kunden anlegen und ändern' })).not.toBeInTheDocument();
  });

  it('lässt die Geschäftsführung ihr Zeitkonto wählen', async () => {
    gefunden = person({ uid: 'u2', name: 'Gabi Chef', role: 'Geschäftsführung' });
    zeige();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Führt ein Zeitkonto' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][1]).toMatchObject({ fuehrtZeitkonto: true, kundenPflegen: false });
  });

  it('nimmt die Freigabe beim Wechsel zum Monteur mit weg', async () => {
    gefunden = person({ uid: 'u2', role: 'Verwaltung', kundenPflegen: true });
    zeige();
    await screen.findByRole('checkbox', { name: 'Darf Kunden anlegen und ändern' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Rolle/ }), 'Mitarbeiter');
    await userEvent.click(await screen.findByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(profilAendern).toHaveBeenCalled());
    expect(profilAendern.mock.calls[0][1]).toMatchObject({ role: 'Mitarbeiter', kundenPflegen: false });
  });
});

/**
 * Konto umstellen zwischen E-Mail und Benutzername (02.10.2026). Was die
 * Function darf, prüft `tests/supabase/kontoUmstellen.test.ts`; hier, was die
 * Maske vorher sagt, was sie schickt und was danach dasteht.
 */
describe('Konto umstellen', () => {
  beforeEach(() => {
    protokoll = [];
    umstellen.mockClear();
    passwortMail.mockClear();
    angemeldet = { ...angemeldet, uid: 'gf1' };
  });

  it('vom Benutzernamen auf die E-Mail: schickt die Adresse, danach die Passwort-Mail an sie', async () => {
    gefunden = person({ uid: 'u3', name: 'Hans Helfer', email: kunstadresse('hans') });
    const nutzer = userEvent.setup();
    zeige('u3');
    await nutzer.click(await screen.findByRole('button', { name: 'Auf E-Mail umstellen …' }));
    expect(screen.getByText(/das Passwort bleibt/)).toBeInTheDocument();
    await nutzer.type(screen.getByRole('textbox', { name: /E-Mail/ }), 'hans@perl.at');
    await nutzer.click(screen.getByRole('button', { name: 'Umstellen' }));

    await waitFor(() => expect(umstellen).toHaveBeenCalledWith('u3', { nach: 'mail', email: 'hans@perl.at' }));
    await waitFor(() => expect(passwortMail).toHaveBeenCalledWith('neu@perl.at'));
    expect(await screen.findByText(/Passwort-Mail an neu@perl\.at gesendet/)).toBeInTheDocument();
  });

  it('Gegenprobe: eine unvollständige Adresse geht nicht hinaus', async () => {
    gefunden = person({ uid: 'u3', name: 'Hans Helfer', email: kunstadresse('hans') });
    const nutzer = userEvent.setup();
    zeige('u3');
    await nutzer.click(await screen.findByRole('button', { name: 'Auf E-Mail umstellen …' }));
    await nutzer.type(screen.getByRole('textbox', { name: /E-Mail/ }), 'hans@perl');
    await nutzer.click(screen.getByRole('button', { name: 'Umstellen' }));
    expect(await screen.findByText(/vollständige E-Mail-Adresse/)).toBeInTheDocument();
    expect(umstellen).not.toHaveBeenCalled();
  });

  it('von der E-Mail auf den Benutzernamen: nur mit Grund, danach das Startpasswort genau einmal', async () => {
    gefunden = person({ uid: 'u2', name: 'Erna Beispiel', email: 'erna@perl.at' });
    umstellen.mockImplementationOnce(async () => {
      gefunden = person({ uid: 'u2', name: 'Erna Beispiel', email: kunstadresse('erna') });
      return { anmeldung: kunstadresse('erna'), startpasswort: 'Kupfer-2741-Muffe' };
    });
    const nutzer = userEvent.setup();
    zeige('u2');
    await nutzer.click(await screen.findByRole('button', { name: 'Auf Benutzername umstellen …' }));
    expect(screen.getByText(/überall abgemeldet/)).toBeInTheDocument();
    await nutzer.type(screen.getByRole('textbox', { name: /^Benutzername/ }), 'erna');
    await nutzer.click(screen.getByRole('button', { name: 'Umstellen' }));
    expect(await screen.findByText(/Bitte einen Grund angeben/)).toBeInTheDocument();
    expect(umstellen).not.toHaveBeenCalled();

    await nutzer.type(screen.getByRole('textbox', { name: /Grund/ }), 'Kein Postfach');
    await nutzer.click(screen.getByRole('button', { name: 'Umstellen' }));
    await waitFor(() => expect(umstellen).toHaveBeenCalledWith('u2', { nach: 'benutzername', benutzername: 'erna', grund: 'Kein Postfach' }));

    const hinweis = await screen.findByRole('alert');
    expect(within(hinweis).getByText('Kupfer-2741-Muffe')).toBeInTheDocument();
    expect(within(hinweis).getByText('erna')).toBeInTheDocument();
    await nutzer.click(within(hinweis).getByRole('button', { name: 'Verstanden' }));
    expect(screen.queryByText('Kupfer-2741-Muffe')).not.toBeInTheDocument();
  });

  it('sagt, wenn der Server ablehnt, und lässt die Eingabe stehen', async () => {
    gefunden = person({ uid: 'u2', name: 'Erna Beispiel', email: 'erna@perl.at' });
    umstellen.mockRejectedValueOnce(new Error('Diesen Benutzernamen kann Senklot nicht vergeben — bitte einen anderen wählen.'));
    const nutzer = userEvent.setup();
    zeige('u2');
    await nutzer.click(await screen.findByRole('button', { name: 'Auf Benutzername umstellen …' }));
    await nutzer.type(screen.getByRole('textbox', { name: /^Benutzername/ }), 'erna');
    await nutzer.type(screen.getByRole('textbox', { name: /Grund/ }), 'Kein Postfach');
    await nutzer.click(screen.getByRole('button', { name: 'Umstellen' }));
    expect(await screen.findByText(/kann Senklot nicht vergeben/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Benutzername/ })).toHaveValue('erna');
  });

  it('das eigene Konto: auf die E-Mail ja, auf den Benutzernamen nein', async () => {
    angemeldet = { ...angemeldet, uid: 'u3' };
    gefunden = person({ uid: 'u3', name: 'Hans Helfer', email: kunstadresse('hans') });
    const erst = zeige('u3');
    expect(await screen.findByRole('button', { name: 'Auf E-Mail umstellen …' })).toBeInTheDocument();
    erst.unmount();

    angemeldet = { ...angemeldet, uid: 'u2' };
    gefunden = person({ uid: 'u2', name: 'Erna Beispiel', email: 'erna@perl.at' });
    zeige('u2');
    await screen.findByText(/Das eigene Konto lässt sich nicht sperren/);
    expect(screen.queryByRole('button', { name: /Auf Benutzername umstellen/ })).not.toBeInTheDocument();
  });

  it('zeigt das Protokoll: wann, wohin, durch wen, warum', async () => {
    gefunden = person({ uid: 'u3', name: 'Hans Helfer', email: kunstadresse('hans') });
    protokoll = [{
      id: '1', userId: 'u3', nach: 'benutzername', grund: 'Kein Postfach', durch: 'gf1', durchName: 'Chefin',
      am: Date.parse('2026-10-02T09:30:00+02:00'),
    }];
    zeige('u3');
    expect(await screen.findByText('Anmeldung umgestellt')).toBeInTheDocument();
    expect(screen.getByText(/02\.10\.2026 · auf Benutzername · durch Chefin · Kein Postfach/)).toBeInTheDocument();
  });
});

describe('Urlaubsanspruch anpassen (Plan 10.3)', () => {
  it('legt eine Anpassung mit Jahr, Tagen und Grund an', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Anspruch anpassen' }));
    const jahr = screen.getByRole('textbox', { name: /^Urlaubsjahr/ });
    await nutzer.clear(jahr);
    await nutzer.type(jahr, '2026');
    await nutzer.type(screen.getByRole('textbox', { name: /^Tage/ }), '-6,25');
    await nutzer.type(screen.getByRole('textbox', { name: /^Grund/ }), 'Unbezahlter Urlaub 01.03.–31.05.');
    await nutzer.click(screen.getByRole('button', { name: 'Anpassung speichern' }));
    await waitFor(() => expect(anpassen).toHaveBeenCalledTimes(1));
    expect(anpassen.mock.calls[0][0]).toEqual({
      userId: 'u2', urlaubsjahr: 2026, tage: -6.25, grund: 'Unbezahlter Urlaub 01.03.–31.05.',
    });
  });

  it('speichert ohne Grund nicht', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Anspruch anpassen' }));
    await nutzer.type(screen.getByRole('textbox', { name: /^Tage/ }), '-2');
    await nutzer.click(screen.getByRole('button', { name: 'Anpassung speichern' }));
    expect(await screen.findByText(/Bitte einen Grund angeben/)).toBeInTheDocument();
    expect(anpassen).not.toHaveBeenCalled();
  });

  it('zeigt bestehende Anpassungen und entfernt sie nur mit Grund', async () => {
    anpassungen = [{
      id: 'a1', companyId: 'perl', userId: 'u2', urlaubsjahr: 2026, tage: -6.25,
      grund: 'Elternkarenz', angelegtVonName: 'Chefin',
    }];
    const nutzer = userEvent.setup();
    zeige();
    expect(await screen.findByText('Urlaubsjahr 2026: −6,25 Tage')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Entfernen' }));
    const dialog = screen.getByRole('dialog');
    await nutzer.click(within(dialog).getByRole('button', { name: 'Entfernen' }));
    expect(await within(dialog).findByText(/Bitte einen Grund angeben/)).toBeInTheDocument();
    expect(entfernen).not.toHaveBeenCalled();
    await nutzer.type(within(dialog).getByRole('textbox', { name: /Grund/ }), 'Irrtümlich eingetragen');
    await nutzer.click(within(dialog).getByRole('button', { name: 'Entfernen' }));
    await waitFor(() => expect(entfernen).toHaveBeenCalledWith('a1', 'Irrtümlich eingetragen'));
  });

  it('fehlt bei einer Person ohne Zeitkonto', async () => {
    gefunden = person({ uid: 'u2', name: 'Ada Admin', email: 'ada@perl.at', role: 'Administrator' });
    angemeldet = { uid: 'ad1', companyId: 'perl', name: 'Chef-Admin', role: 'Administrator' };
    zeige();
    await screen.findByText('Ada Admin', { selector: 'h1' });
    expect(screen.queryByRole('button', { name: 'Anspruch anpassen' })).not.toBeInTheDocument();
  });
});
