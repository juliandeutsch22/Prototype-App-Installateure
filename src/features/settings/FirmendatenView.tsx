import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import { isTopLevel } from '@/lib/permissions';
import { logoAufbereiten, LogoFehler, dataUrlBytes } from '@/lib/logoAufbereiten';
import { istZeichenbar } from '@/lib/pdfBriefkopf';
import { urteil } from '@/lib/kontrast';
import Card from '@/components/Card';
import Button from '@/components/Button';
import LotZeichnung from '@/components/LotZeichnung';
import { einrichtungsstand } from './EinstellungenUebersicht';
import PageHeader from '@/components/PageHeader';
import { Hinweislinie } from '@/components/Planlinie';
import { InputField, CheckboxField, FormGrid, Pflichthinweis } from '@/components/Field';
import { firmenbuchEingetragen, firmenbuchGesperrt, firmenbuchPflichtform, imFirmenbuch, inGruendung } from '@/lib/firmenbuch';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import AdressteileFelder from '@/components/AdressteileFelder';
import { adresseZeile, angabenZuPruefen, type Adressteile } from '@/lib/adresse';
import ConfirmDialog from '@/components/ConfirmDialog';
import { uidFehler, uidSperrt } from '@/lib/uid';
import Aktionsleiste from '@/components/Aktionsleiste';
import Hinweiszeile from '@/components/Hinweiszeile';
import { useUngespeichertWarnung } from '@/lib/ungespeichert';
import { bicFehler, ibanAnzeige, ibanFehler, ibanNormal } from '@shared/iban';

/**
 * Die Stammdaten des Betriebs — was auf Rechnung, Stundenbericht und
 * Handwerksschein steht.
 *
 * WARUM ES DIESE SEITE BRAUCHT. Die Felder gab es längst im Datenmodell, und
 * Rechnung und Stundenbericht lesen sie auch. Nur pflegen konnte sie niemand:
 * es gab kein einziges Formular dafür. Wer den Briefkopf ändern wollte,
 * musste das Dokument in der Firebase-Konsole von Hand bearbeiten — für einen
 * Installationsbetrieb keine ernsthafte Antwort.
 *
 * WAS HIER NICHT STEHT: die Markenfarben. Sie greifen in das ganze
 * Erscheinungsbild ein, und eine falsch gewählte Kombination macht Text
 * unlesbar. Das gehört mit einer Vorschau und Kontrastprüfung gebaut, nicht
 * nebenbei in ein Formular für Anschriften.
 *
 * SEIT DEM 07.09.2026 SIND SIE DA — mit genau dieser Vorschau und dieser
 * Prüfung. Die Mechanik dahinter gab es längst (`lib/tenant.ts` setzt die
 * CSS-Variablen); gefehlt hat der Weg, sie zu pflegen, ohne sich die
 * Oberfläche unlesbar zu machen.
 */
export default function FirmendatenView() {
  const { user, company, reloadCompany } = useAuth();
  /*
    „HINWEIS AUSBLENDEN“ GILT FÜR DIESES GERÄT. Es ist eine Bequemlichkeit,
    keine Angabe des Betriebs — deshalb im Browser gemerkt. Fehlt der
    Speicher (privates Fenster), steht der Hinweis eben wieder da; sobald der
    Briefkopf vollständig gespeichert ist, kommt er ohnehin nicht mehr.
  */
  const hinweisSchluessel = `senklot.einrichtungshinweis.${company?.id ?? ''}`;
  const [hinweisWeg, setHinweisWeg] = useState(() => {
    try {
      return localStorage.getItem(hinweisSchluessel) === 'aus';
    } catch {
      return false;
    }
  });
  function hinweisAusblenden() {
    setHinweisWeg(true);
    try {
      localStorage.setItem(hinweisSchluessel, 'aus');
    } catch {
      /* ohne Speicher gilt es bis zum Neuladen */
    }
  }
  const toast = useToast();

  const [name, setName] = useState(company?.name ?? '');
  /* Die Anschrift in Teilen (M12); die Zeile im Briefkopf setzt die Datenbank zusammen. */
  const [adresse, setAdresse] = useState<Adressteile>({
    strasse: company?.strasse ?? company?.addressLine ?? '',
    plz: company?.plz ?? '',
    ort: company?.ort ?? '',
    land: company?.land ?? 'AT',
  });
  const [firmenbuchgericht, setFirmenbuchgericht] = useState(company?.firmenbuchgericht ?? '');
  /*
    IM FIRMENBUCH EINGETRAGEN (A12, 24.10.2026). Vorbelegt mit dem, was
    bisher galt — der Eigenangabe, sonst der Rechtsform im Namen.
  */
  const [eingetragen, setEingetragen] = useState(firmenbuchEingetragen(company));
  /** „Zur Kenntnis genommen“ der Meldung aus Runde 7, 6.1 läuft. */
  const [kenntnisLaeuft, setKenntnisLaeuft] = useState(false);
  const [contactLine, setContactLine] = useState(company?.contactLine ?? '');
  const [vatId, setVatId] = useState(company?.vatId ?? '');
  const uidFalsch = uidFehler(vatId);
  const [companyRegister, setCompanyRegister] = useState(company?.companyRegister ?? '');
  // In Vierergruppen gezeigt, ohne Leerzeichen gespeichert (Runde 3, H3).
  const [iban, setIban] = useState(ibanAnzeige(company?.iban));
  const [bic, setBic] = useState(company?.bic ?? '');
  const ibanFalsch = ibanFehler(iban);
  const bicFalsch = bicFehler(bic);
  const [bankName, setBankName] = useState(company?.bankName ?? '');
  const [logoUrl, setLogoUrl] = useState(company?.logoUrl ?? '');
  const [brandColor, setBrandColor] = useState(company?.brandColor ?? '');
  const [brandForeground, setBrandForeground] = useState(company?.brandForeground ?? '');
  const [accentColor, setAccentColor] = useState(company?.accentColor ?? '');
  const [accentForeground, setAccentForeground] = useState(company?.accentForeground ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Runde 6, M6: eine PLZ, die nicht zum Land passt — die Rückfrage „Trotzdem speichern“. */
  const [plzFrage, setPlzFrage] = useState<string[] | null>(null);
  const [logoFehler, setLogoFehler] = useState<string | null>(null);
  const [logoLaeuft, setLogoLaeuft] = useState(false);

  const eingabe = {
    name, adresse, firmenbuchgericht, eingetragen, contactLine, vatId, companyRegister,
    iban, bic, bankName, logoUrl, brandColor, brandForeground, accentColor, accentForeground,
  };
  const [letzterStand, setLetzterStand] = useState(eingabe);
  const geaendert = JSON.stringify(eingabe) !== JSON.stringify(letzterStand);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [anzeigeFehler, setAnzeigeFehler] = useState(false);
  const [laedtAnzeige, setLaedtAnzeige] = useState(false);
  const speichert = useRef(false);
  const logoLauf = useRef(0);
  const warnung = useUngespeichertWarnung(!!user && isTopLevel(user.role) && (geaendert || logoLaeuft));
  function verwerfen() {
    const v = letzterStand;
    setName(v.name);
    setAdresse(v.adresse);
    setFirmenbuchgericht(v.firmenbuchgericht);
    setEingetragen(v.eingetragen);
    setContactLine(v.contactLine);
    setVatId(v.vatId);
    setCompanyRegister(v.companyRegister);
    setIban(v.iban);
    setBic(v.bic);
    setBankName(v.bankName);
    setLogoUrl(v.logoUrl);
    setBrandColor(v.brandColor);
    setBrandForeground(v.brandForeground);
    setAccentColor(v.accentColor);
    setAccentForeground(v.accentForeground);
    setError(null);
    setLogoFehler(null);
  }
  async function anzeigeLaden() {
    setLaedtAnzeige(true);
    try { await reloadCompany(); setAnzeigeFehler(false); }
    catch { setAnzeigeFehler(true); }
    finally { setLaedtAnzeige(false); }
  }

  if (!user) return null;
  if (!isTopLevel(user.role)) {
    return (
      <div className="space-y-6">
        <PageHeader ort="Einstellungen" title="Firmendaten" subtitle="Was auf den Belegen steht" />
        <Card>
          <p className="text-sm text-ink-muted">
            Diese Angaben pflegt die Geschäftsführung. Sie stehen auf Rechnungen und Belegen und
            gelten für den ganzen Betrieb.
          </p>
        </Card>
      </div>
    );
  }

  async function logoWaehlen(datei: File | undefined) {
    if (!datei) return;
    const lauf = ++logoLauf.current;
    setLogoFehler(null);
    setLogoLaeuft(true);
    try {
      const logo = await logoAufbereiten(datei);
      if (lauf === logoLauf.current) setLogoUrl(logo);
    } catch (e) {
      /*
        Der Text kommt aus `LogoFehler` und ist für den Betrieb geschrieben.
        Alles andere bekommt einen eigenen Satz — eine durchgereichte
        technische Meldung hilft hier niemandem.
      */
      if (lauf !== logoLauf.current) return;
      setLogoFehler(
        e instanceof LogoFehler ? e.message : 'Das Logo konnte nicht verarbeitet werden.',
      );
    } finally {
      if (lauf === logoLauf.current) setLogoLaeuft(false);
    }
  }

  /*
    DER HAKEN IST FEST bei einer Rechtsform, die es nur mit Eintragung gibt
    (Runde 7, 6.1) — nach dem Namen, wie er gerade im Feld steht. Abgewählt
    schaltete er nur die Mahnung zu Firmenbuchnummer und -gericht ab. Frei
    bleibt er bei Einzelunternehmen und bei „in Gründung“ / „i. G.“.
  */
  const gesperrt = firmenbuchGesperrt(name.trim());
  const gruendung = !gesperrt && inGruendung(name.trim()) && firmenbuchPflichtform(name.trim()) !== null;

  /** Die Meldung, dass die Migration den abgewählten Haken zurückgesetzt hat, ist gelesen. */
  async function zurKenntnis() {
    setKenntnisLaeuft(true);
    try {
      await updateCompany(user!.companyId, { firmenbuchKorrigiertAm: null });
      await reloadCompany();
    } catch (err) {
      toast.error(grundAus(err, 'Das ließ sich nicht speichern.'));
    } finally {
      setKenntnisLaeuft(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await speichern(false);
  }

  async function speichern(plzBestaetigt: boolean) {
    if (speichert.current || logoLaeuft) return;
    // Die eigene UID steht auf jedem Beleg — eine falsche Form hält auf, wenn
    // sie geändert wurde (Testbericht 30.09.2026, M10).
    const uidSperre = uidSperrt(vatId, letzterStand.vatId);
    if (uidSperre) {
      setError(uidSperre);
      return;
    }
    /*
      DIE IBAN STEHT IM ZAHLUNGSHINWEIS JEDER RECHNUNG (Runde 3, H3): eine
      falsche schickt das Geld ins Leere. Wie bei der UID hält nur ein
      geänderter Wert auf; ein Altbestand steht markiert da, bis jemand ihn
      berichtigt — dann prüft auch die Datenbank.
    */
    const ibanGeaendert = ibanNormal(iban) !== ibanNormal(letzterStand.iban);
    if (ibanGeaendert && ibanFalsch) {
      setError(ibanFalsch);
      return;
    }
    if (ibanNormal(bic) !== ibanNormal(letzterStand.bic) && bicFalsch) {
      setError(bicFalsch);
      return;
    }
    /*
      DIE EIGENE ANSCHRIFT STEHT IM BRIEFKOPF JEDES BELEGS (Runde 6, M6):
      „82“ wurde mit „Firmendaten gespeichert“ angenommen. Wie beim Kunden
      eine Rückfrage, nur wenn PLZ oder Land geändert wurden.
    */
    if (!plzBestaetigt) {
      const funde = angabenZuPruefen(adresse, {
        plz: letzterStand.adresse.plz ?? '',
        land: letzterStand.adresse.land ?? 'AT',
      });
      if (funde.length > 0) {
        setPlzFrage(funde);
        return;
      }
    }
    speichert.current = true;
    const gesendet = eingabe;
    setSaving(true);
    setError(null);
    try {
      /*
        Leere Felder werden als leerer Text gespeichert, nicht ausgelassen:
        sonst liesse sich eine einmal eingetragene Angabe nie wieder
        entfernen — `merge` würde den alten Wert stehen lassen.
      */
      await updateCompany(user!.companyId, {
        name: name.trim(),
        strasse: adresse.strasse?.trim() ?? '',
        plz: adresse.plz?.trim() ?? '',
        ort: adresse.ort?.trim() ?? '',
        land: adresse.land ?? 'AT',
        firmenbuchgericht: firmenbuchgericht.trim(),
        /*
          Gespeichert wird nur, was vom Namen abweicht: wer später „GmbH“ in
          den Namen schreibt, ist damit eingetragen, ohne den Haken nachzuziehen.
        */
        imFirmenbuch: gesperrt || eingetragen === imFirmenbuch(name.trim()) ? null : eingetragen,
        contactLine: contactLine.trim(),
        vatId: vatId.trim(),
        companyRegister: companyRegister.trim(),
        iban: ibanNormal(iban),
        bic: ibanNormal(bic),
        bankName: bankName.trim(),
        logoUrl,
        brandColor: brandColor.trim(),
        brandForeground: brandForeground.trim(),
        accentColor: accentColor.trim(),
        accentForeground: accentForeground.trim(),
      });
      setLetzterStand(gesendet);
      setBestaetigt(true);
      toast.success('Firmendaten gespeichert');
      // Ein Fehler beim Lesen darf das bestätigte Schreiben nicht zurücknehmen.
      await anzeigeLaden();
    } catch (err) {
      setError(grundAus(err, 'Die Firmendaten konnten nicht gespeichert werden.'));
    } finally {
      speichert.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        ort="Einstellungen"
        title="Firmendaten"
        subtitle="Briefkopf für Rechnung, Bericht und Schein"
      />

      {/*
        DER EINRICHTUNGSHINWEIS — NUR, SOLANGE DER BRIEFKOPF FEHLT
        (Illustrationsentwurf 29.10.2026, „Firmendaten · Ersteinrichtung“).
        Er richtet sich nach dem GESPEICHERTEN Stand wie der Einrichtungsstand
        der Übersicht, nicht nach dem Getippten: nach dem ersten vollständigen
        Speichern ist er weg und kommt in keinem späteren Formular wieder.
      */}
      {einrichtungsstand(company)[0].wort === 'offen' && !hinweisWeg && (
        <div className="lot-einrichtung" role="note">
          <LotZeichnung motiv="einrichtung" art="hinweis" />
          <div>
            <p>
              <b>Bereit für den ersten Beleg?</b>
              Name und Anschrift stehen oben auf jedem Angebot und jeder Rechnung — hier einmal
              eintragen, dann stimmt jeder Beleg.
            </p>
            <button type="button" className="link min-h-touch" onClick={hinweisAusblenden}>
              Hinweis ausblenden
            </button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Card
          title="Briefkopf"
          hint="Diese Angaben stehen oben auf jedem Beleg, den der Betrieb ausgibt."
        >
          {/* Formular der Linie: höchstens 560 px breit (Regel 9). */}
          <div className="formular">
          <FormGrid>
            <InputField
              id="fd-name"
              label="Firmenname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              pflicht
            />
            <div className="sm:col-span-2">
              <AdressteileFelder idPrefix="fd-adresse" wert={adresse} onChange={setAdresse} />
              {adresseZeile(adresse) && (
                <p className="mt-1 text-sm text-ink-muted">Im Briefkopf: {adresseZeile(adresse)}</p>
              )}
            </div>
            <InputField
              id="fd-kontakt"
              label="Kontakt (eine Zeile)"
              placeholder="z. B. 02622 12345 · office@betrieb.at"
              value={contactLine}
              onChange={(e) => setContactLine(e.target.value)}
            />
          </FormGrid>
          </div>
        </Card>

        <Card
          title="Logo"
          hint={
            <>
              Erscheint oben rechts auf allen drei Belegen. Das Bild wird beim Auswählen
              verkleinert und in das Briefkopf-Format eingepasst — es behält seine Form und wird
              nicht beschnitten. PNG mit durchsichtigem Grund sieht am besten aus.
            </>
          }
        >
          {istZeichenbar(logoUrl) ? (
            <div className="space-y-3">
              {/*
                Vorschau auf hellem Grund und im Seitenverhältnis des
                Briefkopfs: so sieht man vorher, was auf dem Beleg landet.
              */}
              <div className="inline-flex items-center justify-center rounded border border-line bg-white p-2">
                <img src={logoUrl} alt="Logo des Betriebs" className="h-12 w-auto" />
              </div>
              <p className="text-xs text-ink-muted">
                Rund <span>{Math.round(dataUrlBytes(logoUrl) / 1024)}</span> kB.
              </p>
              <Button type="button" variant="danger" onClick={() => setLogoUrl('')}>
                Logo entfernen
              </Button>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              {logoUrl
                ? 'Hier steht eine Adresse statt eines Bildes. Für die Oberfläche reicht das, für das PDF nicht — dort muss das Bild selbst hinterlegt sein. Bitte die Datei auswählen.'
                : 'Noch kein Logo hinterlegt. Die Belege tragen dann nur den Firmennamen.'}
            </p>
          )}

          <div className="mt-3">
            <label htmlFor="fd-logo" className="section-label block">
              Bilddatei wählen
            </label>
            <input
              id="fd-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={logoLaeuft}
              onChange={(e) => void logoWaehlen(e.target.files?.[0])}
              className="mt-1 block w-full text-sm text-ink file:mr-3 file:min-h-touch file:rounded file:border file:border-line file:bg-surface-2 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
            />
          </div>
          {logoFehler && (
            <div className="mt-3">
              <ErrorState message={logoFehler} />
            </div>
          )}
        </Card>

        <Card
          title="Rechnungsangaben"
          hint="UID, Firmenbuchnummer und Firmenbuchgericht (§ 14 UGB) stehen im Fuß jedes Belegs, die Bankverbindung im Zahlungshinweis. „Im Firmenbuch eingetragen“ ist vorbelegt nach der Rechtsform im Namen (GmbH, KG, OG, e.U. …); ein eingetragenes Einzelunternehmen ohne Zusatz im Namen setzt den Haken selbst. Dann mahnen Rechnungen und Startseite Firmenbuchnummer und -gericht an. Bei GmbH, FlexCo, AG, SE, KG, OG und Genossenschaft ist der Haken fest gesetzt — außer der Name sagt „in Gründung“ oder „i. G.“."
        >
          <div className="formular">
          <FormGrid>
            <div>
              <InputField
                id="fd-uid"
                label="UID-Nummer"
                placeholder="z. B. ATU12345678"
                value={vatId}
                aria-invalid={uidFalsch ? true : undefined}
                aria-describedby={uidFalsch ? 'fd-uid-fehler' : undefined}
                onChange={(e) => setVatId(e.target.value)}
              />
              {/* Die Warnung am Feld als Hinweislinie (Planlinie B8), wie eine Notiz im Plan. */}
              {uidFalsch && <Hinweislinie stufe="fehl" id="fd-uid-fehler">{uidFalsch}</Hinweislinie>}
            </div>
            <div className="sm:col-span-2">
              <CheckboxField
                id="fd-firmenbuch"
                label="Im Firmenbuch eingetragen"
                checked={gesperrt ? true : eingetragen}
                disabled={!!gesperrt}
                aria-describedby={gesperrt || gruendung ? 'fd-firmenbuch-grund' : undefined}
                onChange={(e) => setEingetragen(e.target.checked)}
              />
              {gesperrt && (
                <p id="fd-firmenbuch-grund" className="mt-1 text-sm text-ink-muted">
                  Eine {gesperrt} ist immer im Firmenbuch eingetragen. Firmenbuchnummer und -gericht gehören
                  auf jede Rechnung.
                </p>
              )}
              {gruendung && (
                <p id="fd-firmenbuch-grund" className="mt-1 text-sm text-ink-muted">
                  Firmenbuchnummer nachtragen, sobald eingetragen.
                </p>
              )}
              {/*
                EINMAL GEMELDET (Runde 7, 6.1): die Migration hat den abgewählten
                Haken bei dieser Rechtsform zurückgesetzt. Die Startseite zeigt es
                der Geschäftsführung, bis sie es hier zur Kenntnis nimmt.
              */}
              {company?.firmenbuchKorrigiertAm ? (
                <div className="mt-2">
                  <Hinweiszeile stufe="warn">
                    <p>
                      <b>
                        „Im Firmenbuch eingetragen“ war abgewählt und wurde am{' '}
                        {new Date(company.firmenbuchKorrigiertAm).toLocaleDateString('de-AT', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                        })}{' '}
                        wieder gesetzt.
                      </b>{' '}
                      Bei dieser Rechtsform ist der Betrieb immer eingetragen; abgewählt war die Mahnung zu
                      Firmenbuchnummer und -gericht abgeschaltet.
                    </p>
                    <Button type="button" variant="secondary" groesse="klein" loading={kenntnisLaeuft} onClick={zurKenntnis}>
                      Zur Kenntnis genommen
                    </Button>
                  </Hinweiszeile>
                </div>
              ) : null}
            </div>
            <InputField
              id="fd-fn"
              label="Firmenbuchnummer"
              placeholder="z. B. FN 123456a"
              value={companyRegister}
              onChange={(e) => setCompanyRegister(e.target.value)}
            />
            <InputField
              id="fd-fbg"
              label="Firmenbuchgericht"
              placeholder="z. B. Landesgericht Wiener Neustadt"
              value={firmenbuchgericht}
              onChange={(e) => setFirmenbuchgericht(e.target.value)}
            />
            <div>
              <InputField
                id="fd-iban"
                label="IBAN"
                placeholder="z. B. AT61 1904 3002 3457 3201"
                value={iban}
                aria-invalid={ibanFalsch ? true : undefined}
                aria-describedby={ibanFalsch ? 'fd-iban-fehler' : undefined}
                onChange={(e) => setIban(e.target.value)}
                onBlur={() => setIban((x) => ibanAnzeige(x))}
              />
              {ibanFalsch && (
                <Hinweislinie stufe="fehl" id="fd-iban-fehler">
                  {ibanFalsch}
                  {ibanNormal(iban) === ibanNormal(company?.iban) && ' Mit dieser IBAN lässt sich keine Rechnung erstellen.'}
                </Hinweislinie>
              )}
            </div>
            <div>
              <InputField
                id="fd-bic"
                label="BIC"
                placeholder="z. B. BKAUATWW"
                value={bic}
                aria-invalid={bicFalsch ? true : undefined}
                aria-describedby={bicFalsch ? 'fd-bic-fehler' : undefined}
                onChange={(e) => setBic(e.target.value)}
              />
              {bicFalsch && <Hinweislinie stufe="fehl" id="fd-bic-fehler">{bicFalsch}</Hinweislinie>}
            </div>
            <InputField
              id="fd-bank"
              label="Bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </FormGrid>
          </div>
        </Card>

        {/*
          DIE MARKENFARBEN — mit Vorschau und Prüfung, oder gar nicht.

          Zwei Werte, die über die ganze Oberfläche wirken: `--brand` trägt
          jeden Hauptknopf, `--accent` jede Hervorhebung. Wer sie aussucht,
          weiss ja, was auf dem Knopf steht — der Monteur im Keller bei
          schlechtem Licht nicht.

          Die Prüfung SPERRT NICHT, sie sagt. Es gibt Betriebe mit einer
          Hausfarbe, die knapp unter der Schwelle liegt, und ihnen die eigene
          Marke zu verbieten wäre anmassend. Aber niemand soll sie
          versehentlich unlesbar machen.
        */}
        <Card
          title="Farben"
          hint={
            'Die Hausfarben des Betriebs. Sie färben Knöpfe und Hervorhebungen in der ganzen ' +
            'App — die Belege bleiben davon unberührt. Leer lassen heißt: die Vorgabe gilt.'
          }
        >
          <div className="formular">
          <FormGrid>
            <InputField
              id="fd-brand"
              label="Hauptfarbe (#rrggbb)"
              placeholder="#0f4552"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
            />
            {/*
              „Schrift darauf" stand zweimal wortgleich da — einmal zur Haupt-,
              einmal zur Akzentfarbe. Auf dem Bildschirm ordnet die Nähe das
              zu; eine Sprachausgabe liest die Beschriftung ohne ihre Umgebung
              und sagt beide Male dasselbe. Jetzt benennt jedes Feld die Farbe,
              zu der es gehört.
            */}
            <InputField
              id="fd-brand-fg"
              label="Schrift auf der Hauptfarbe"
              placeholder="#ffffff"
              value={brandForeground}
              onChange={(e) => setBrandForeground(e.target.value)}
            />
            <InputField
              id="fd-accent"
              label="Akzentfarbe (#rrggbb)"
              placeholder="#00778a"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
            />
            <InputField
              id="fd-accent-fg"
              label="Schrift auf der Akzentfarbe"
              placeholder="#ffffff"
              value={accentForeground}
              onChange={(e) => setAccentForeground(e.target.value)}
            />
          </FormGrid>

          <div className="mt-4 space-y-3">
            {(
              [
                ['Hauptfarbe', brandColor, brandForeground],
                ['Akzentfarbe', accentColor, accentForeground],
              ] as const
            ).map(([bezeichnung, hintergrund, schrift]) => {
              if (!hintergrund && !schrift) return null;
              const u = urteil(hintergrund, schrift);
              return (
                <div key={bezeichnung} className="flex flex-wrap items-center gap-3">
                  {/*
                    Die Vorschau zeigt, was der Nutzer bekommt: ein Knopf, wie
                    er später überall steht. Eine Farbfläche allein sagt nichts
                    über Lesbarkeit.
                  */}
                  <span
                    className="inline-flex min-h-touch items-center rounded px-4 py-2 text-sm font-semibold"
                    style={{ backgroundColor: hintergrund || undefined, color: schrift || undefined }}
                  >
                    {bezeichnung}
                  </span>
                  <span
                    className={`text-sm ${u.reicht ? 'text-ink-muted' : 'text-warning'}`}
                    role={u.reicht ? undefined : 'alert'}
                  >
                    {u.text}
                  </span>
                </div>
              );
            })}
          </div>
          </div>
        </Card>

        <Pflichthinweis />

        {error && <ErrorState message={error} />}

        {anzeigeFehler && <Hinweiszeile stufe="warn" role="status"><p>Firmendaten gespeichert. Die Anzeige konnte noch nicht aktualisiert werden.</p><Button type="button" variant="secondary" groesse="klein" loading={laedtAnzeige} onClick={anzeigeLaden}>Anzeige erneut laden</Button></Hinweiszeile>}
        <Aktionsleiste
          summe={{ name: <span role="status" className="lot-speicherstand">{saving ? 'Änderungen werden gespeichert …' : geaendert ? (bestaetigt ? 'Vorheriger Stand gespeichert · weitere Änderungen noch offen' : 'Nicht gespeicherte Änderungen') : bestaetigt ? 'Gespeichert' : 'Keine offenen Änderungen'}</span>, wert: null }}
          links={geaendert ? <Button type="button" variant="ghost" disabled={saving || logoLaeuft} onClick={verwerfen}>Verwerfen</Button> : <span className="lot-speicherplatz" aria-hidden="true" />}
          rechts={<Button type="submit" loading={saving} gespeichert={bestaetigt && !geaendert && !saving} disabled={logoLaeuft || (bestaetigt && !geaendert)}>{saving ? 'Speichert …' : bestaetigt && !geaendert ? 'Gespeichert' : 'Firmendaten speichern'}</Button>}
        />
      </form>

      {warnung}
      <ConfirmDialog
        open={plzFrage !== null}
        title="PLZ prüfen — trotzdem speichern?"
        message="Diese Anschrift steht im Briefkopf jeder Rechnung und in jeder E-Rechnung. Die Prüfung ist grob — wer es besser weiß, speichert trotzdem."
        confirmLabel="Trotzdem speichern"
        confirmTone="primary"
        onCancel={() => setPlzFrage(null)}
        onConfirm={async () => {
          setPlzFrage(null);
          await speichern(true);
        }}
      >
        <ul className="space-y-1 text-sm text-ink">
          {(plzFrage ?? []).map((f) => <li key={f}>{f}</li>)}
        </ul>
      </ConfirmDialog>
    </div>
  );
}
