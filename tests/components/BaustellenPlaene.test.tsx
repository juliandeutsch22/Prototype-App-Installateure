import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';

/**
 * Pläne hochladen — und die Rückfrage vor einem Beleg aus dem Büro.
 *
 * Im Launch-Check (25.09.2026, R1) lag ein Stundennachweis bei den Plänen,
 * sichtbar für jeden Monteur der Baustelle. Seit 11.10.2026 (17 D) lässt
 * sich ein Dokument „nur fürs Büro“ ablegen; in der Rückfrage ist das vorab
 * angekreuzt.
 *
 * SEIT 29.10.2026 ERST SAMMELN, DANN HOCHLADEN (`DokumentAblage`): gewählte
 * Dateien stehen mit Größe und Zustand in einer Liste, erst „Hochladen“
 * schreibt. Die Regeln von oben gelten unverändert — geprüft wird deshalb
 * jede alte Aussage auf dem neuen Weg, dazu die Liste selbst.
 */
const dokumentHochladen = vi.fn<(...a: unknown[]) => Promise<undefined>>(async () => undefined);
const dokumentNurBueroSetzen = vi.fn<(...a: unknown[]) => Promise<undefined>>(async () => undefined);
let vorhanden: unknown[] = [];
const listDokumente = vi.fn(async () => vorhanden);
vi.mock('@/lib/db/baustellenDokumente', async () => {
  const echt = await vi.importActual<typeof import('@/lib/db/pg/baustellenDokumente')>(
    '@/lib/db/pg/baustellenDokumente',
  );
  return {
    dokumentHochladen: (...a: unknown[]) => dokumentHochladen(...a),
    dokumentNurBueroSetzen: (...a: unknown[]) => dokumentNurBueroSetzen(...a),
    dokumentLoeschen: vi.fn(),
    // Die echte Prüfung: die Ablage kürzt ihren Satz um den Dateinamen und hängt damit an seinem Wortlaut.
    dateiPruefen: echt.dateiPruefen,
    listDokumente: () => listDokumente(),
    dokumentAdresse: vi.fn(async () => 'https://speicher/x'),
    dokumentBild: vi.fn(async () => new Blob(['x'])),
  };
});

const { default: BaustellenPlaene } = await import('@/features/projects/BaustellenPlaene');

function zeichne({ darfAendern = true, personen }: { darfAendern?: boolean; personen?: string[] } = {}) {
  return render(
    <ToastProvider>
      <BaustellenPlaene companyId="perl" projectId="p1" darfAendern={darfAendern} meinName="Chefin" personen={personen} />
    </ToastProvider>,
  );
}

const datei = (name: string) => new File(['%PDF'], name, { type: 'application/pdf' });
/** Eine Datei, die `dateiPruefen` abweist — der Browser bietet sie mit „Alle Dateien“ trotzdem an. */
const dwg = (name = 'Grundriss.dwg') => new File([new Uint8Array(10)], name, { type: '' });

type Nutzer = ReturnType<typeof userEvent.setup>;

const ablage = () => screen.getByRole('dialog', { name: 'Dokumente hinzufügen' });

async function ablageOeffnen(nutzer: Nutzer) {
  await nutzer.click(await screen.findByRole('button', { name: 'Dokumente hinzufügen' }));
  return ablage();
}

/** Der ganze Weg: Ablage öffnen, wählen, hochladen. */
async function hinzufuegen(nutzer: Nutzer, ...dateien: File[]) {
  await ablageOeffnen(nutzer);
  await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), dateien);
  await nutzer.click(within(ablage()).getByRole('button', { name: /hochladen$/i }));
}

const rueckfrage = () => screen.getByRole('dialog', { name: 'Wirklich zu den Plänen?' });

/** Die Zeile einer gewählten Datei in der Ablage. */
const zeileInAblage = (name: string) =>
  within(within(ablage()).getByRole('region', { name: 'Ausgewählte Dateien' })).getByText(name).closest('li')!;

beforeEach(() => {
  dokumentHochladen.mockReset();
  dokumentHochladen.mockImplementation(async () => undefined);
  dokumentNurBueroSetzen.mockClear();
  listDokumente.mockClear();
  vorhanden = [];
});

/** Das letzte Argument von `dokumentHochladen`: nur fürs Büro? */
const nurBueroBeimHochladen = () => dokumentHochladen.mock.calls.map((c) => c[4]);
const hochgeladeneNamen = () => dokumentHochladen.mock.calls.map((c) => (c[2] as File).name);

describe('Pläne hochladen', () => {
  it('sagt in der Ablage, wer alles sieht', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    expect(within(ablage()).getByText('Die Monteure dieser Baustelle sehen alles ohne „Nur Büro“.')).toBeInTheDocument();
  });

  it('lädt einen Plan ohne Rückfrage hoch', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await hinzufuegen(nutzer, datei('Grundriss EG.pdf'));
    await vi.waitFor(() => expect(dokumentHochladen).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Wirklich zu den Plänen?')).not.toBeInTheDocument();
    // Ohne Häkchen wie bisher: für die Monteure sichtbar.
    expect(nurBueroBeimHochladen()).toEqual([false]);
  });

  it('lädt erst bei „Hochladen“, nicht schon beim Auswählen', async () => {
    // Der Kern des Umbaus: eine versehentlich gewählte Datei liegt noch nicht bei den Monteuren.
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Grundriss EG.pdf'));
    expect(dokumentHochladen).not.toHaveBeenCalled();
  });

  it('fragt vor einem Stundennachweis nach — und lädt erst nach dem Ja', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await hinzufuegen(nutzer, datei('Stundennachweis September.pdf'));
    expect(await screen.findByText('Wirklich zu den Plänen?')).toBeInTheDocument();
    expect(dokumentHochladen).not.toHaveBeenCalled();

    // Vorab angekreuzt: wer weiterklickt, legt den Beleg nur fürs Büro ab.
    expect(screen.getByLabelText('Nur fürs Büro', { selector: '#plaene-rueckfrage-nur-buero' })).toBeChecked();
    await nutzer.click(within(rueckfrage()).getByRole('button', { name: 'Hinzufügen' }));
    await vi.waitFor(() => expect(dokumentHochladen).toHaveBeenCalledTimes(1));
    expect(nurBueroBeimHochladen()).toEqual([true]);
  });

  it('wer es den Monteuren zeigen will, nimmt das Häkchen in der Rückfrage weg', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await hinzufuegen(nutzer, datei('Stundennachweis September.pdf'));
    await nutzer.click(await screen.findByLabelText('Nur fürs Büro', { selector: '#plaene-rueckfrage-nur-buero' }));
    await nutzer.click(within(rueckfrage()).getByRole('button', { name: 'Hinzufügen' }));
    await vi.waitFor(() => expect(nurBueroBeimHochladen()).toEqual([false]));
  });

  it('mit „Nur fürs Büro“ angekreuzt: ohne Rückfrage, nur fürs Büro', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    await nutzer.click(screen.getByLabelText('Nur fürs Büro', { selector: '#plaene-nur-buero' }));
    expect(screen.getByText('Was jetzt dazukommt, sehen die Monteure nicht.')).toBeInTheDocument();
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Rechnung Lieferant.pdf'));
    await nutzer.click(within(ablage()).getByRole('button', { name: 'Hochladen' }));
    await vi.waitFor(() => expect(nurBueroBeimHochladen()).toEqual([true]));
    expect(screen.queryByText('Wirklich zu den Plänen?')).not.toBeInTheDocument();
  });

  it('nennt den Verdacht schon in der Liste — mit „Nur fürs Büro“ nicht mehr', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Rechnung 1002.pdf'));
    const zustand = within(zeileInAblage('Rechnung 1002.pdf')).getByText(/Beleg aus dem Büro/);
    expect(zustand).toHaveAttribute('data-stand', 'warn');
    await nutzer.click(screen.getByLabelText('Nur fürs Büro', { selector: '#plaene-nur-buero' }));
    expect(within(zeileInAblage('Rechnung 1002.pdf')).getByText(/Bereit zum Hochladen/)).not.toHaveAttribute('data-stand');
  });

  /*
    Runde 6, G20: „Nur fürs Büro“ war ein Knopf und las sich wie ein Zustand.
    Jetzt steht der Zustand als Etikett an jeder Zeile, der Knopf nennt die Aktion.
  */
  it('schaltet ein vorhandenes Dokument um — Zustand als Etikett, Knopf als Aktion (G20)', async () => {
    vorhanden = [
      { id: 'd1', projectId: 'p1', pfad: 'baustellen/perl/p1/a.pdf', dateiname: 'Grundriss.pdf', mime: 'application/pdf', bytes: 500 },
      { id: 'd2', projectId: 'p1', pfad: 'baustellen/perl/p1/b.xlsx', dateiname: 'Aufmaß.xlsx', bytes: 500, nurBuero: true,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ];
    const nutzer = userEvent.setup();
    zeichne();
    expect(await screen.findByText('EXCEL')).toBeInTheDocument();
    const zeile = (name: string) => screen.getByRole('button', { name }).closest('li')!;
    expect(within(zeile('Aufmaß.xlsx')).getByText('Nur fürs Büro')).toBeInTheDocument();
    expect(within(zeile('Grundriss.pdf')).getByText('Für Monteure sichtbar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nur fürs Büro' })).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Vor Monteuren verbergen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Für Monteure zeigen' }));
    expect(dokumentNurBueroSetzen.mock.calls).toEqual([['d1', true], ['d2', false]]);
  });

  it('fragt auch bei einem Mitarbeiternamen im Dateinamen nach (Testbericht 30.09.2026, H8)', async () => {
    const nutzer = userEvent.setup();
    zeichne({ personen: ['Max Mustermann', 'Eva Berger'] });
    await hinzufuegen(nutzer, datei('Nachweis_Max_Mustermann_09.pdf'));
    expect(await screen.findByText('Wirklich zu den Plänen?')).toBeInTheDocument();
    expect(dokumentHochladen).not.toHaveBeenCalled();
  });

  it('ein Plan mit nur einem Vornamen darin geht ohne Rückfrage', async () => {
    const nutzer = userEvent.setup();
    zeichne({ personen: ['Max Mustermann'] });
    await hinzufuegen(nutzer, datei('Grundriss Max EG.pdf'));
    await vi.waitFor(() => expect(dokumentHochladen).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Wirklich zu den Plänen?')).not.toBeInTheDocument();
  });

  it('lädt nach „Abbrechen“ in der Rückfrage nichts hoch — die Auswahl bleibt', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await hinzufuegen(nutzer, datei('Rechnung 1002.pdf'));
    await nutzer.click(within(rueckfrage()).getByRole('button', { name: 'Abbrechen' }));
    expect(dokumentHochladen).not.toHaveBeenCalled();
    expect(screen.queryByText('Wirklich zu den Plänen?')).not.toBeInTheDocument();
    // Wer abbricht, will meist „Nur fürs Büro“ ankreuzen — die Datei steht noch da.
    expect(zeileInAblage('Rechnung 1002.pdf')).toBeInTheDocument();
  });

  it('lädt nach „Abbrechen“ in der Ablage nichts hoch', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Grundriss EG.pdf'));
    await nutzer.click(within(ablage()).getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('dialog', { name: 'Dokumente hinzufügen' })).toBeNull();
    expect(dokumentHochladen).not.toHaveBeenCalled();
    // Neu geöffnet ist die Ablage leer: die alte Auswahl geht nicht beim nächsten Mal mit.
    await ablageOeffnen(nutzer);
    expect(within(ablage()).queryByRole('region', { name: 'Ausgewählte Dateien' })).toBeNull();
  });
});

/*
  DIE LISTE DER GEWÄHLTEN DATEIEN (29.10.2026): jede Datei mit Größe und
  Zustand, entfernbar; was nicht hochgehen kann, steht mit dem Grund da.
*/
describe('Die Ablage', () => {
  it('zeigt jede gewählte Datei mit Name, Größe und „Bereit zum Hochladen“', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), [
      new File([new Uint8Array(840 * 1024)], 'Grundriss EG.pdf', { type: 'application/pdf' }),
      datei('Schnitt A.pdf'),
    ]);
    const zeile = zeileInAblage('Grundriss EG.pdf');
    expect(within(zeile).getByText('840 KB · Bereit zum Hochladen')).toBeInTheDocument();
    expect(within(zeileInAblage('Schnitt A.pdf')).getByText('1 KB · Bereit zum Hochladen')).toBeInTheDocument();
    expect(within(ablage()).getByRole('button', { name: '2 Dateien hochladen' })).toBeEnabled();
  });

  it('nennt eine unzulässige Datei mit dem Grund, ohne den Namen doppelt — und lädt sie nicht hoch', async () => {
    const nutzer = userEvent.setup({ applyAccept: false });
    zeichne();
    await ablageOeffnen(nutzer);
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), [datei('Plan 1.pdf'), dwg(), datei('Plan 2.pdf')]);

    const zustand = within(zeileInAblage('Grundriss.dwg')).getByText(/nur PDF, Bilder/i);
    expect(zustand).toHaveAttribute('data-stand', 'fehl');
    expect(zustand.textContent).toMatch(/^1 KB · Nur PDF, Bilder/);
    expect(zustand.textContent).not.toContain('Grundriss.dwg');
    // Der Knopf zählt nur, was hochgehen kann.
    await nutzer.click(within(ablage()).getByRole('button', { name: '2 Dateien hochladen' }));
    await vi.waitFor(() => expect(hochgeladeneNamen()).toEqual(['Plan 1.pdf', 'Plan 2.pdf']));
  });

  it('nennt auch eine zu große und eine leere Datei ohne den Namen doppelt', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    const gross = datei('Bestandsplan.pdf');
    Object.defineProperty(gross, 'size', { value: 30 * 1024 * 1024 });
    const leer = new File([], 'Leer.pdf', { type: 'application/pdf' });
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), [gross, leer]);

    const zuGross = within(zeileInAblage('Bestandsplan.pdf')).getByText(/höchstens 25 MB/);
    expect(zuGross).toHaveAttribute('data-stand', 'fehl');
    expect(zuGross.textContent).not.toContain('Bestandsplan.pdf');
    const ohneInhalt = within(zeileInAblage('Leer.pdf')).getByText(/leer/);
    expect(ohneInhalt).toHaveAttribute('data-stand', 'fehl');
    expect(ohneInhalt.textContent).not.toContain('Leer.pdf');
    expect(within(ablage()).getByRole('button', { name: 'Hochladen' })).toBeDisabled();
  });

  it('nennt ungültige Dateien nach dem Hochladen auf der Seite mit vollem Satz', async () => {
    // Ohne die Liste fehlt der Name darüber — dann gehört er in den Satz.
    const nutzer = userEvent.setup({ applyAccept: false });
    zeichne();
    await hinzufuegen(nutzer, datei('Plan 1.pdf'), dwg());
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dokumente hinzufügen' })).toBeNull());
    expect(screen.getByRole('alert')).toHaveTextContent('„Grundriss.dwg“: nur PDF, Bilder');
  });

  /*
    SIND DATEIEN GEWÄHLT, IST DIE LISTE DIE HAUPTSACHE (Designprüfung
    29.10.2026): die Fläche wird schmal (`data-gefuellt`, Regel in
    lot-feinschliff.css), damit „Hochladen“ im Bild bleibt.
  */
  it('meldet der Fläche, ob Dateien gewählt sind — erst leer, dann gefüllt, nach Entfernen wieder leer', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    const flaeche = () => ablage().querySelector('.lot-ablage')!;
    expect(flaeche()).not.toHaveAttribute('data-gefuellt');
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Plan 1.pdf'));
    expect(flaeche()).toHaveAttribute('data-gefuellt');
    await nutzer.click(within(ablage()).getByRole('button', { name: 'Plan 1.pdf entfernen' }));
    expect(flaeche()).not.toHaveAttribute('data-gefuellt');
  });

  it('nimmt mit „Entfernen“ eine Datei wieder heraus', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), [datei('Plan 1.pdf'), datei('Falsch.pdf')]);
    await nutzer.click(within(ablage()).getByRole('button', { name: 'Falsch.pdf entfernen' }));
    expect(within(ablage()).queryByText('Falsch.pdf')).toBeNull();
    await nutzer.click(within(ablage()).getByRole('button', { name: 'Hochladen' }));
    await vi.waitFor(() => expect(hochgeladeneNamen()).toEqual(['Plan 1.pdf']));
  });

  it('dieselbe Datei zweimal gewählt ergibt eine Zeile', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    const plan = datei('Plan 1.pdf');
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), plan);
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), plan);
    expect(within(ablage()).getAllByText('Plan 1.pdf')).toHaveLength(1);
    expect(within(ablage()).getByRole('button', { name: 'Hochladen' })).toBeEnabled();
  });

  it('Gegenprobe: zwei verschiedene Dateien ergeben zwei Zeilen', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Plan 1.pdf'));
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Plan 2.pdf'));
    expect(within(ablage()).getByRole('button', { name: '2 Dateien hochladen' })).toBeEnabled();
  });

  it('teilweise gescheitert: bleibt offen, nennt die gescheiterte, meldet die angekommenen', async () => {
    dokumentHochladen.mockImplementation(async (...a: unknown[]) => {
      if ((a[2] as File).name === 'Plan 2.pdf') throw new Error('Netz weg');
      return undefined;
    });
    const nutzer = userEvent.setup();
    zeichne();
    await hinzufuegen(nutzer, datei('Plan 1.pdf'), datei('Plan 2.pdf'), datei('Plan 3.pdf'));

    expect(await screen.findByText('2 Dokumente hinzugefügt')).toBeInTheDocument();
    expect(ablage()).toBeInTheDocument();
    expect(within(zeileInAblage('Plan 2.pdf')).getByText(/Konnte nicht hochgeladen werden/)).toBeInTheDocument();
    // Sie zählt für den nächsten Versuch mit.
    expect(within(ablage()).getByRole('button', { name: 'Hochladen' })).toBeEnabled();
    // Was angekommen ist, steht nicht mehr zur Auswahl — sonst ginge es beim nächsten Mal doppelt hoch.
    expect(within(ablage()).queryByText('Plan 1.pdf')).toBeNull();
    expect(within(ablage()).queryByText('Plan 3.pdf')).toBeNull();
    // Die Liste der Seite zeigt die angekommenen schon.
    await vi.waitFor(() => expect(listDokumente.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('eine gescheiterte Datei lässt sich erneut hochladen', async () => {
    // „bitte erneut versuchen“ muss auch gehen: derselbe Knopf, dieselbe Datei.
    let netzWeg = true;
    dokumentHochladen.mockImplementation(async () => {
      if (netzWeg) throw new Error('Netz weg');
      return undefined;
    });
    const nutzer = userEvent.setup();
    zeichne();
    await hinzufuegen(nutzer, datei('Plan 1.pdf'));
    await within(ablage()).findByText(/Konnte nicht hochgeladen werden/);

    netzWeg = false;
    await nutzer.click(within(ablage()).getByRole('button', { name: 'Hochladen' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dokumente hinzufügen' })).toBeNull());
    expect(hochgeladeneNamen()).toEqual(['Plan 1.pdf', 'Plan 1.pdf']);
    expect(await screen.findByText('Dokument hinzugefügt')).toBeInTheDocument();
  });

  it('alles angekommen: die Ablage schließt, die Liste lädt neu', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Noch keine Pläne oder Dokumente.');
    expect(listDokumente).toHaveBeenCalledTimes(1);
    await hinzufuegen(nutzer, datei('Plan 1.pdf'), datei('Plan 2.pdf'));
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dokumente hinzufügen' })).toBeNull());
    expect(await screen.findByText('2 Dokumente hinzugefügt')).toBeInTheDocument();
    await vi.waitFor(() => expect(listDokumente).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('während des Hochladens: Abbrechen und Entfernen gesperrt, Schließen abgelehnt', async () => {
    let loesen: () => void = () => undefined;
    dokumentHochladen.mockImplementation(() => new Promise<undefined>((gut) => {
      loesen = () => gut(undefined);
    }));
    const nutzer = userEvent.setup();
    zeichne();
    await hinzufuegen(nutzer, datei('Plan 1.pdf'));
    await vi.waitFor(() => expect(dokumentHochladen).toHaveBeenCalledTimes(1));

    const fenster = ablage();
    expect(within(fenster).getByRole('status')).toHaveTextContent('Lade hoch …');
    expect(within(fenster).getByRole('button', { name: 'Abbrechen' })).toBeDisabled();
    expect(within(fenster).getByRole('button', { name: 'Plan 1.pdf entfernen' })).toBeDisabled();
    expect(within(fenster).getByRole('button', { name: 'Dateien auswählen' })).toBeDisabled();
    // Sonst wüsste niemand, was ankam — Schließen und Escape lassen das Fenster stehen.
    await nutzer.click(within(fenster).getByRole('button', { name: 'Schließen' }));
    await nutzer.keyboard('{Escape}');
    expect(ablage()).toBeInTheDocument();

    loesen();
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dokumente hinzufügen' })).toBeNull());
  });

  it('Gegenprobe: ohne laufendes Hochladen schließt „Schließen“ die Ablage', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    await nutzer.click(within(ablage()).getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog', { name: 'Dokumente hinzufügen' })).toBeNull();
  });
});

/*
  ZIEHEN UND ABLEGEN: am Schreibtisch kommen Pläne meist aus dem Explorer.
  jsdom kennt kein DataTransfer — das Ereignis trägt deshalb ein schlichtes
  Objekt mit `files` und `types`, wie es der Browser liefert.
*/
const gezogen = (dateien: File[]) => ({ dataTransfer: { files: dateien, types: ['Files'] } });

describe('Ziehen und Ablegen', () => {
  it('auf die Ablagefläche: die Dateien stehen in der Liste', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await ablageOeffnen(nutzer);
    const flaeche = within(ablage()).getByText('Dateien hier ablegen').closest('.lot-ablage')!;
    fireEvent.dragEnter(flaeche, gezogen([]));
    expect(flaeche).toHaveAttribute('data-darueber', 'true');
    fireEvent.drop(flaeche, gezogen([datei('Plan 1.pdf'), datei('Plan 2.pdf')]));
    expect(flaeche).not.toHaveAttribute('data-darueber');
    expect(zeileInAblage('Plan 1.pdf')).toBeInTheDocument();
    expect(zeileInAblage('Plan 2.pdf')).toBeInTheDocument();
    expect(dokumentHochladen).not.toHaveBeenCalled();
  });

  it('auf den Reiter selbst: die Ablage öffnet sich mit den Dateien', async () => {
    zeichne();
    const leer = await screen.findByText('Noch keine Pläne oder Dokumente.');
    fireEvent.drop(leer, gezogen([datei('Plan 1.pdf')]));
    expect(zeileInAblage('Plan 1.pdf')).toBeInTheDocument();
    expect(dokumentHochladen).not.toHaveBeenCalled();
  });

  /*
    Ob der Reiter ein Ablegen annimmt, entscheidet `dragover`: nur ein
    abgewiesenes Standardverhalten (`false` von fireEvent) lässt den Browser
    überhaupt fallen lassen. Gezogener Text bleibt beim Browser.
  */
  it('nimmt am Reiter nur Dateien an, keinen gezogenen Text', async () => {
    zeichne();
    const leer = await screen.findByText('Noch keine Pläne oder Dokumente.');
    expect(fireEvent.dragOver(leer, gezogen([datei('Plan 1.pdf')]))).toBe(false);
    expect(fireEvent.dragOver(leer, { dataTransfer: { files: [], types: ['text/plain'] } })).toBe(true);
    fireEvent.drop(leer, { dataTransfer: { files: [], types: ['text/plain'] } });
    expect(screen.queryByRole('dialog', { name: 'Dokumente hinzufügen' })).toBeNull();
  });

  it('ohne das Recht zum Ändern nimmt der Reiter nichts an', async () => {
    zeichne({ darfAendern: false });
    const leer = await screen.findByText('Noch keine Pläne oder Dokumente.');
    expect(fireEvent.dragOver(leer, gezogen([datei('Plan 1.pdf')]))).toBe(true);
    fireEvent.drop(leer, gezogen([datei('Plan 1.pdf')]));
    expect(screen.queryByRole('dialog', { name: 'Dokumente hinzufügen' })).toBeNull();
    expect(dokumentHochladen).not.toHaveBeenCalled();
  });
});

describe('Der leere Reiter', () => {
  it('nennt den Stand, zeigt die Zeichnung und bietet „Dokumente hinzufügen“ an', async () => {
    const { container } = zeichne();
    expect(await screen.findByRole('heading', { name: 'Noch keine Pläne oder Dokumente.' })).toBeInTheDocument();
    const bild = container.querySelector('svg[data-motiv="plan"]');
    expect(bild).not.toBeNull();
    expect(bild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Dokumente hinzufügen' })).toBeInTheDocument();
  });

  it('ohne das Recht zum Ändern: kein „Dokumente hinzufügen“, nur der Stand', async () => {
    zeichne({ darfAendern: false });
    expect(await screen.findByRole('heading', { name: 'Noch keine Pläne oder Dokumente.' })).toBeInTheDocument();
    expect(screen.getByText('Sobald das Büro Pläne ablegt, stehen sie hier.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dokumente hinzufügen' })).toBeNull();
    expect(screen.queryByLabelText('Dokumente auswählen')).toBeNull();
  });

  it('unter einer Liste steht „Dokumente hinzufügen“ einmal — ohne Recht gar nicht', async () => {
    vorhanden = [{ id: 'd1', projectId: 'p1', pfad: 'baustellen/perl/p1/a.pdf', dateiname: 'Grundriss.pdf', mime: 'application/pdf', bytes: 500 }];
    const { unmount } = zeichne();
    await screen.findByRole('button', { name: 'Grundriss.pdf' });
    expect(screen.getAllByRole('button', { name: 'Dokumente hinzufügen' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Noch keine Pläne oder Dokumente.' })).toBeNull();
    unmount();

    zeichne({ darfAendern: false });
    await screen.findByRole('button', { name: 'Grundriss.pdf' });
    expect(screen.queryByRole('button', { name: 'Dokumente hinzufügen' })).toBeNull();
  });
});
