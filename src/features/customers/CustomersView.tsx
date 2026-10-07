import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import BottomSheet from '@/components/BottomSheet';
import InfoHint from '@/components/InfoHint';
import { MehrAnzeigen, Segmente } from '@/components/LotBausteine';
import { useAuth } from '@/app/AuthContext';
import {
  searchCustomers,
  kundenAdressePruefen,
  kundenOhneKundenart,
  naechsteKundennummer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  assignProjectToCustomer,
  type NewCustomer,
} from '@/lib/db/customers';
import { listRecentProjects } from '@/lib/db/projects';
import { darfKundenPflegen, isGF } from '@/lib/permissions';
import type { Customer, Project } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import RowMenu from '@/components/RowMenu';
import { Marke, Warnung } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import Nachladen from '@/components/Nachladen';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField, FormGrid, Pflichthinweis } from '@/components/Field';
import AdressteileFelder from '@/components/AdressteileFelder';
import { List, ListRow } from '@/components/ListRow';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, LoadingState, SkeletonList } from '@/components/States';
import KundenImport, { type KundenImportGriff } from './KundenImport';
import KundenartUidFelder from '@/components/KundenartUidFelder';
import { uidSperrt } from '@/lib/uid';
import { grundAus } from '@/lib/fehlerGrund';

const LEER: NewCustomer = {
  name: '',
  address: '',
  strasse: '',
  plz: '',
  ort: '',
  land: 'AT',
  kundennummer: '',
  contactName: '',
  contactPhone: '',
  email: '',
  vatId: '',
  kundenart: 'privat',
  notes: '',
  active: true,
};

/** Namen für den Abgleich vereinheitlichen — Groß-/Kleinschreibung und Leerraum. */
function schluessel(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Die Rückfrage: wen es schon gibt, mit Adresse — daran erkennt man ihn. */
function rueckfrageText(name: string, gleiche: Customer[]): string {
  const wer = gleiche
    .slice(0, 3)
    .map((k) => `„${k.name}“ (${k.address?.trim() || 'ohne Adresse'})`)
    .join(', ');
  const mehr = gleiche.length > 3 ? ` und ${gleiche.length - 3} weitere` : '';
  return `Es gibt schon ${wer}${mehr}. Ist „${name}“ ein anderer Kunde, trotzdem anlegen; sonst den bestehenden bearbeiten.`;
}

/**
 * Kundenverwaltung.
 *
 * Der Kunde war bis hierher ein Textfeld an der Baustelle und wurde bei jedem
 * Auftrag neu getippt. Was dadurch fehlte, ist keine Bequemlichkeit, sondern
 * Substanz: die Kundenhistorie („was haben wir dort zuletzt gemacht?"), die
 * Grundlage für Wartungsverträge, und ein Mahnwesen, das über die einzelne
 * Rechnung hinausgeht. Zwei Schreibweisen desselben Namens ergaben zwei
 * Kunden, und keiner der beiden war vollständig.
 */
/**
 * Wie viele Kunden auf einmal geholt werden.
 *
 * Zweihundert statt der bisherigen fünfhundert: die Liste ist zum
 * NACHSCHLAGEN da, und nachgeschlagen wird über die Suche, nicht durch
 * Scrollen. Die kleinere Zahl kostet auf einer Baustelle mit halbem Balken
 * weniger — und was fehlt, steht jetzt dabei, statt lautlos zu verschwinden.
 */
const KUNDEN_JE_SEITE = 200;

/** Höchstens so viele Zeilen, dann „und N weitere anzeigen“ (Linie „Lot“, Regel 4). */
const JE_GRUPPE = 20;

const AUSWAHL = ['alle', 'pruefen', 'ohne-art'] as const;
type Auswahl = (typeof AUSWAHL)[number];

export default function CustomersView() {
  const { user } = useAuth();
  const toast = useToast();
  const [kunden, setKunden] = useState<WithId<Customer>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [form, setForm] = useState<NewCustomer>(LEER);
  const [bearbeitet, setBearbeitet] = useState<WithId<Customer> | null>(null);
  /*
    DAS FORMULAR STEHT NICHT MEHR OFFEN, SONDERN KLAPPT AUF.

    GEMESSEN am Telefon (390 px breit, davon nach Kopf- und Fussleiste rund
    590 px sichtbar): die Kundenliste begann bei 1175 px — zwei Bildschirme
    Wischen an einer leeren Maske vorbei. Man öffnet diesen Reiter aber, um
    einen Kunden zu FINDEN; angelegt wird alle paar Wochen einer.

    Das offene Formular sparte beim Anlegen einen Klick und kostete beim
    Nachschauen jedes Mal zwei Wischer. Schlimmer als die Wege: eine Maske
    ganz oben sieht aus wie der ZWECK der Seite.

    Seit der Linie „Lot“ steht das Formular im Seitenfenster (Regel 8): die
    Liste bleibt daneben stehen, und wer das Fenster nur wegklickt, findet
    einen begonnenen neuen Kunden beim nächsten „Neuer Kunde“ wieder.
  */
  const [formOffen, setFormOffen] = useState(false);
  /** Das Seitenfenster „Bestehende Baustellen übernehmen“. */
  const [uebernahmeOffen, setUebernahmeOffen] = useState(false);
  /** Der Import wählt seine Datei aus dem ⋯ des Seitenkopfs heraus. */
  const kundenImport = useRef<KundenImportGriff>(null);

  const formSchliessen = () => {
    setFormOffen(false);
    setBearbeitet(null);
    setForm(LEER);
  };
  const [speichert, setSpeichert] = useState(false);
  const [toDelete, setToDelete] = useState<WithId<Customer> | null>(null);
  /**
   * Kunden mit demselben Namen, die es schon gibt — die Rückfrage vor dem
   * Anlegen (Testbericht 30.09.2026, M11). `null`: keine Rückfrage offen.
   */
  const [gleichNamig, setGleichNamig] = useState<WithId<Customer>[] | null>(null);

  /*
    ZWEI RECHTE, NICHT EINES. Kunden pflegt, wer die Freigabe hat (siehe
    `darfKundenPflegen`) — die Bürokraft ebenso wie die Leitung. „Bestehende
    Baustellen übernehmen“ ordnet dagegen BAUSTELLEN zu, und die ändert nur
    die Leitung; bekäme die Bürokraft den Knopf, schlüge er in der
    Datenbank fehl.
  */
  const darfAendern = user ? darfKundenPflegen(user) : false;
  const darfBaustellenZuordnen = user ? isGF(user.role) : false;

  /*
    WIE VIELE KUNDEN GELADEN SIND — als Zustand, nicht als feste Zahl.

    Vorher stand hier die Voreinstellung der Abfrage: fünfhundert,
    alphabetisch. Ein Betrieb mit mehr Kunden verlor die hinteren Buchstaben,
    und zwar lautlos — der 501. Kunde existierte für die App nicht mehr, auch
    nicht in der Suche. Jetzt sagt die Liste, wenn sie an ihrer Grenze steht,
    und lässt nachladen.
  */
  const [grenze, setGrenze] = useState(KUNDEN_JE_SEITE);

  /*
    GESUCHT WIRD SERVERSEITIG — und das ändert, was die Liste bedeutet.

    Vorher wurden die ersten `grenze` Kunden geladen und im Browser gefiltert:
    wer den 501. suchte, fand ihn nicht, und die App sagte darüber nichts. Der
    Suchbegriff geht jetzt mit in die Abfrage, und die Datenbank sucht über
    den ganzen Bestand.

    WARUM NICHT BEI JEDEM TASTENDRUCK. Zwischen zwei Anschlägen liegen
    Millisekunden, eine Abfrage dauert länger — ohne Verzögerung stünden
    zwanzig Abfragen gleichzeitig in der Leitung, und die Antworten kämen in
    beliebiger Reihenfolge zurück. Dreihundert Millisekunden sind die Pause,
    nach der jemand aufgehört hat zu tippen.
  */
  const [begriff, setBegriff] = useState('');
  /*
    WELCHE KUNDEN: alle, nur die mit zu prüfender Anschrift (M12) oder nur
    die ohne Kundenart (Runde 3, M10). Bis zum Umbau zwei Kästchen, die
    einander ausschalteten — also schon immer eine Auswahl aus dreien, jetzt
    als Segmente und in der Adresse (Protokoll 7.5).
  */
  const [suchparameter, setSuchparameter] = useSearchParams();
  const auswahlInAdresse = suchparameter.get('auswahl');
  const auswahl: Auswahl = (AUSWAHL as readonly string[]).includes(auswahlInAdresse ?? '')
    ? (auswahlInAdresse as Auswahl)
    : 'alle';
  const setAuswahl = (wert: Auswahl) => {
    const neu = new URLSearchParams(suchparameter);
    if (wert === 'alle') neu.delete('auswahl');
    else neu.set('auswahl', wert);
    setSuchparameter(neu, { replace: true });
  };
  const nurPruefen = auswahl === 'pruefen';
  const nurOhneArt = auswahl === 'ohne-art';
  const [ohneSuche, setOhneSuche] = useState(0);
  /** Wie viele Zeilen gezeigt sind — höchstens 20, dann „und N weitere“ (Regel 4). */
  const [gezeigt, setGezeigt] = useState(JE_GRUPPE);
  // Eine neue Suche oder Auswahl beginnt wieder oben.
  useEffect(() => setGezeigt(JE_GRUPPE), [begriff, auswahl]);
  useEffect(() => {
    const t = setTimeout(() => setBegriff(suche), 300);
    return () => clearTimeout(t);
  }, [suche]);

  const laden = useMemo(
    () => async () => {
      if (!user) return;
      setLoading(true);
      try {
        const treffer = nurPruefen
          ? await kundenAdressePruefen(user.companyId)
          : nurOhneArt
            ? await kundenOhneKundenart(user.companyId)
            : await searchCustomers(user.companyId, begriff, grenze);
        setKunden(treffer);
        /*
          WIE VIELE OHNE SUCHE DA WAREN — getrennt gemerkt.

          Der Nachladehinweis spricht über die geladene LISTE, nicht über ein
          Suchergebnis. Speiste man ihn mit den Treffern, verschwände er beim
          ersten Suchversuch — und mit ihm die Auskunft, dass die Liste
          überhaupt an ihrer Grenze steht.
        */
        if (!begriff.trim()) setOhneSuche(treffer.length);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [user, grenze, begriff, nurPruefen, nurOhneArt],
  );

  useEffect(() => {
    void laden();
  }, [laden]);

  const sichtbar = kunden;

  async function speichern(e: FormEvent) {
    e.preventDefault();
    await speichernBestaetigt(false);
  }

  async function speichernBestaetigt(trotzdem: boolean) {
    if (!user || !form.name.trim()) return;
    // Eine falsch geschriebene UID hält auf — nur wenn sie geändert wurde (M10).
    const uidFalsch = uidSperrt(form.vatId, bearbeitet?.vatId);
    if (uidFalsch) {
      setError(uidFalsch);
      return;
    }
    setSpeichert(true);
    setError(null);
    try {
      if (bearbeitet) {
        const nachgezogen = await updateCustomer(user.companyId, bearbeitet.id, form);
        toast.success(
          // Runde 3, G9: sagen, WAS nachgezogen wurde — und nur, wenn sich der Name dort geändert hat.
          nachgezogen > 0
            ? `Kunde gespeichert. Der neue Name steht jetzt auch auf ${nachgezogen === 1 ? 'einer Baustelle' : `${nachgezogen} Baustellen`}.`
            : 'Kunde gespeichert',
        );
      } else {
        /*
          GLEICHER NAME IST ERLAUBT — MIT RÜCKFRAGE (Testbericht 30.09.2026,
          M11). Huber und Gruber gibt es oft; vorher wies die Maske jeden
          zweiten ab, auch mit anderer Adresse. Jetzt sagt sie, wen es schon
          gibt und wo, und legt auf Bestätigung trotzdem an. Gefragt wird der
          Server, nicht die geladene Liste: sie kennt den ganzen Bestand.
        */
        if (!trotzdem) {
          const treffer = await searchCustomers(user.companyId, form.name.trim(), 50);
          const gleiche = treffer.filter((k) => schluessel(k.name) === schluessel(form.name));
          if (gleiche.length > 0) {
            setGleichNamig(gleiche);
            return;
          }
        }
        await createCustomer(user.companyId, form);
        toast.success('Kunde angelegt');
      }
      setForm(LEER);
      setBearbeitet(null);
      setFormOffen(false);
      await laden();
    } catch (err) {
      setError(grundAus(err, 'Der Kunde konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  /**
   * Bestehende Baustellen übernehmen.
   *
   * Bewusst mit Vorschau statt als stiller Hintergrundlauf: die
   * Geschäftsführung sieht, wie viele Kunden aus wie vielen Baustellen
   * entstehen, bevor etwas geschrieben wird. Bei Altbeständen mit
   * uneinheitlichen Schreibweisen ist genau das die Stelle, an der jemand
   * merkt, dass „Huber" und „Fam. Huber" derselbe Kunde sind.
   */
  const [uebernahme, setUebernahme] = useState<{ name: string; projekte: WithId<Project>[] }[] | null>(
    null,
  );
  const [uebernahmeLaeuft, setUebernahmeLaeuft] = useState(false);

  async function uebernahmeVorbereiten() {
    if (!user) return;
    setUebernahmeLaeuft(true);
    setError(null);
    try {
      const projekte = await listRecentProjects(user.companyId, 500);
      const ohneKunde = projekte.filter((p) => !p.customerId && p.customerName?.trim());
      const nachName = new Map<string, { name: string; projekte: WithId<Project>[] }>();
      for (const p of ohneKunde) {
        const k = schluessel(p.customerName);
        const eintrag = nachName.get(k) ?? { name: p.customerName.trim(), projekte: [] };
        eintrag.projekte.push(p);
        nachName.set(k, eintrag);
      }
      setUebernahme([...nachName.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')));
    } catch {
      setError('Die Baustellen konnten nicht gelesen werden.');
    } finally {
      setUebernahmeLaeuft(false);
    }
  }

  async function uebernahmeAusfuehren() {
    if (!user || !uebernahme) return;
    setUebernahmeLaeuft(true);
    setError(null);
    try {
      let neu = 0;
      let zugeordnet = 0;
      for (const gruppe of uebernahme) {
        // Gibt es den Kunden schon, wird er verwendet statt neu angelegt.
        const bestehend = kunden.find((k) => schluessel(k.name) === schluessel(gruppe.name));
        const jüngste = [...gruppe.projekte].sort((a, b) =>
          b.projectNumber.localeCompare(a.projectNumber),
        )[0];
        const id =
          bestehend?.id ??
          (await createCustomer(user.companyId, {
            ...LEER,
            name: gruppe.name,
            // Adresse und Ansprechpartner der JÜNGSTEN Baustelle als
            // Startwert — die älteste ist am ehesten veraltet.
            address: jüngste?.address ?? '',
            contactName: jüngste?.contactName ?? '',
            contactPhone: jüngste?.contactPhone ?? '',
          }));
        if (!bestehend) neu++;
        for (const p of gruppe.projekte) {
          await assignProjectToCustomer(p.id, id, gruppe.name);
          zugeordnet++;
        }
      }
      toast.success(`${neu} Kunden angelegt, ${zugeordnet} Baustellen zugeordnet`);
      setUebernahme(null);
      setUebernahmeOffen(false);
      await laden();
    } catch (err) {
      setError(grundAus(err, 'Die Übernahme ist fehlgeschlagen.'));
    } finally {
      setUebernahmeLaeuft(false);
    }
  }

  if (!user) return null;

  function neuerKunde() {
    /*
      EIN BEGONNENER NEUER KUNDE BLEIBT. Das Seitenfenster schliesst auch ein
      Tipp daneben; das soll nicht das Eingetippte kosten. Verworfen wird
      erst mit „Abbrechen“ (oder durch „Bearbeiten“ eines anderen Kunden).
    */
    if (!bearbeitet && form !== LEER) {
      setFormOffen(true);
      return;
    }
    setBearbeitet(null);
    setForm(LEER);
    setFormOffen(true);
    // Die nächste freie Kundennummer als Vorschlag (M12) — scheitert es, bleibt das Feld leer.
    void Promise.resolve()
      .then(() => naechsteKundennummer())
      .then((nr) => setForm((f) => (f.kundennummer ? f : { ...f, kundennummer: nr })))
      .catch(() => undefined);
  }

  /*
    DAS ⋯ DES SEITENKOPFS: was beim Umstieg einmal und danach selten
    gebraucht wird. Jeder Eintrag tut, was vorher der Knopf auf der Seite
    tat — die Datei wählen, die Vorlage laden, die Vorschau erstellen —,
    damit der Weg nur um den Tipp auf „⋯“ länger wird.
  */
  const seitenMenue = [
    ...(darfAendern
      ? [
          { label: 'Kunden aus einer Datei einlesen', onSelect: () => kundenImport.current?.dateiWaehlen() },
          { label: 'Vorlage für den Import herunterladen', onSelect: () => kundenImport.current?.vorlageLaden() },
        ]
      : []),
    ...(darfBaustellenZuordnen
      ? [
          {
            label: 'Bestehende Baustellen übernehmen',
            onSelect: () => {
              setUebernahmeOffen(true);
              void uebernahmeVorbereiten();
            },
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        title="Kunden"
        subtitle="Stammdaten, Ansprechpartner und Baustellenhistorie"
        mehr={seitenMenue.length > 0 ? <RowMenu about="Kunden" items={seitenMenue} /> : undefined}
        action={
          darfAendern && !formOffen ? <Button onClick={neuerKunde}>Neuer Kunde</Button> : undefined
        }
      />

      {/* Die Erklärung zur Übernahme steht unter „Hilfe zu dieser Seite“, wie
          vorher das „i“ ihrer Karte. */}
      {darfBaustellenZuordnen && (
        <InfoHint about="Bestehende Baustellen übernehmen">
          Legt aus den Kundennamen bestehender Baustellen Kunden an und ordnet die Baustellen
          zu. Vor dem Schreiben wird angezeigt, was entstehen würde — geschrieben wird erst
          auf Bestätigung. Zu finden im ⋯ oben.
        </InfoHint>
      )}

      {/* Der Kundenstamm aus dem Altprogramm — beim Umstieg einmal, danach selten. */}
      {darfAendern && <KundenImport ref={kundenImport} onUebernommen={() => void laden()} />}

      <Card buendig>
        <div className="listen-werkzeug">
          <div className="listen-suche">
            <label htmlFor="ksuche" className="mb-1 block text-sm font-normal text-ink">
              Suche
            </label>
            <input
              id="ksuche"
              type="search"
              aria-label="Kunden durchsuchen"
              placeholder="Name, Adresse oder Telefon"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              className="listen-suchfeld"
            />
          </div>
          <div className="listen-auswahl">
            {/* M12 und Runde 3, M10: die Kunden, die jemand prüfen muss. Ohne
                Kundenart gehen Rechnung und Mahnung nicht. */}
            <Segmente
              name="Kunden filtern"
              werte={[
                { wert: 'alle', text: 'Alle' },
                { wert: 'pruefen', text: 'Anschrift prüfen' },
                { wert: 'ohne-art', text: 'Ohne Kundenart' },
              ]}
              wert={auswahl}
              onChange={setAuswahl}
            />
          </div>
        </div>

        {loading ? (
          <div className="border-t border-line p-4">
            <SkeletonList rows={4} />
          </div>
        ) : sichtbar.length === 0 ? (
          <div className="border-t border-line">
            <EmptyState>
              {/*
                DIE UNTERSCHEIDUNG HÄNGT AM SUCHBEGRIFF, NICHT AN DER LISTE.

                `kunden` ist das ERGEBNIS DER SUCHE — leer heisst dann „nichts
                passt“. Ein Betrieb mit vierhundert Kunden läse sonst beim
                ersten Fehlversuch „Noch keine Kunden“, und das wäre ein
                Schrecken ohne Grund.
              */}
              {suche.trim()
                ? `Kein Kunde passt zu „${suche}“.`
                : 'Noch keine Kunden. Über „Bestehende Baustellen übernehmen“ lassen sich die vorhandenen anlegen.'}
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="border-t border-line">
              <List>
                {sichtbar.slice(0, gezeigt).map((k) => (
                  <ListRow
                    key={k.id}
                    /*
                      DIE GANZE ZEILE ÖFFNET DIE AKTE (Linie „Lot“, Regel 3) —
                      bis zum Umbau ein eigener Verweis „Akte“ rechts.
                    */
                    to={`/customers/${k.id}`}
                    pfeil
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        {k.name}
                        {k.kundennummer && <span className="text-sm font-normal text-ink-muted">Nr. {k.kundennummer}</span>}
                        {/* M12: die alte Zeile liess sich nicht eindeutig zerlegen. */}
                        {k.adressePruefen && <Warnung>Adresse prüfen</Warnung>}
                        {!k.kundenart && <Warnung>Kundenart prüfen</Warnung>}
                      </span>
                    }
                    subtitle={
                      <>
                        {/* Über der Fläche der Zeile: anrufen und hinfahren bleiben ein Tipp. */}
                        <span className="flex flex-wrap items-center gap-x-3">
                          <span className="zeile-griff"><AdresseLink adresse={k.address} /></span>
                          <span className="zeile-griff"><TelefonLink nummer={k.contactPhone} name={k.contactName} /></span>
                        </span>
                        {k.contactName && (
                          <span className="mt-1 block text-xs text-ink-muted">{k.contactName}</span>
                        )}
                      </>
                    }
                  >
                    {/*
                      DIESELBEN ZEILENAKTIONEN WIE BEI DEN BAUSTELLEN: das Seltene
                      im „⋯“ (Launch-Check 25.09.2026). Das Löschen gehört nicht
                      an die auffälligste Stelle der Zeile.
                    */}
                    {darfAendern && (
                      <RowMenu
                        about={`Kunde ${k.name}`}
                        items={[
                          {
                            label: 'Bearbeiten',
                            onSelect: () => {
                              setBearbeitet(k);
                              setFormOffen(true);
                              setForm({
                                name: k.name,
                                address: k.address ?? '',
                                strasse: k.strasse ?? '',
                                plz: k.plz ?? '',
                                ort: k.ort ?? '',
                                land: k.land ?? 'AT',
                                kundennummer: k.kundennummer ?? '',
                                contactName: k.contactName ?? '',
                                contactPhone: k.contactPhone ?? '',
                                email: k.email ?? '',
                                vatId: k.vatId ?? '',
                                kundenart: k.kundenart ?? null,
                                notes: k.notes ?? '',
                                active: k.active ?? true,
                              });
                            },
                          },
                          { label: 'Löschen', onSelect: () => setToDelete(k), danger: true },
                        ]}
                      />
                    )}
                  </ListRow>
                ))}
              </List>
            </div>
            <MehrAnzeigen
              anzahl={Math.max(0, sichtbar.length - gezeigt)}
              onClick={() => setGezeigt(sichtbar.length)}
            />
          </>
        )}
        {/*
          Der Hinweis steht AUSSERHALB der Leermeldung: er gehört auch dann
          hin, wenn die Suche gerade nichts findet — denn genau dann ist die
          Frage „gibt es den Kunden nicht, oder ist er nur nicht geladen?" die
          entscheidende.
        */}
        {!loading && (
          <div className="px-4 pb-3 empty:hidden">
          <Nachladen
            geladen={suche.trim() ? ohneSuche : kunden.length}
            grenze={grenze}
            einheit="Kunden"
            onMehr={() => setGrenze((n) => n + KUNDEN_JE_SEITE)}
            /*
              UNTER POSTGRES IST DER SATZ „Die Suche geht nur über diese"
              FALSCH — und eine Auskunft, die einmal danebenlag, wird beim
              nächsten Mal nicht mehr geglaubt.

              Die Datenbank sucht über den ganzen Bestand; die Grenze gilt nur
              für das, was OHNE Suchbegriff angezeigt wird. Der Knopf bleibt
              deshalb stehen, der Satz daneben nicht.
            */
            sucheImBrowser={false}
          />
          </div>
        )}
      </Card>

      {/* Anlegen und Bearbeiten im Seitenfenster (Linie „Lot“, Regel 8). */}
      <BottomSheet
        open={darfAendern && formOffen}
        onClose={() => setFormOffen(false)}
        label={bearbeitet ? `„${bearbeitet.name}“ bearbeiten` : 'Neuen Kunden anlegen'}
        auchBreit
        titel={bearbeitet ? `„${bearbeitet.name}“ bearbeiten` : 'Neuen Kunden anlegen'}
      >
        <form onSubmit={speichern} className="flex flex-col gap-4">
          <InputField
            id="kname"
            label="Name oder Firma"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            pflicht
          />
          {/* Ausdrücklich die RECHNUNGSadresse: die Baustelle hat ihre
              eigene, und eine Hausverwaltung hat zwanzig davon. */}
          <AdressteileFelder
            idPrefix="kadr"
            titel="Rechnungsadresse"
            wert={form}
            onChange={(teile) => setForm({ ...form, ...teile, land: teile.land ?? 'AT' })}
          />
          <InputField
            id="knr"
            label="Kundennummer (freiwillig)"
            placeholder="z. B. 10001"
            value={form.kundennummer ?? ''}
            onChange={(e) => setForm({ ...form, kundennummer: e.target.value })}
          />
          {/* Einspaltig: das Seitenfenster ist am Tablet 440 px breit. */}
          <FormGrid cols={1}>
            <InputField
              id="kcontact"
              label="Ansprechpartner"
              value={form.contactName ?? ''}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            />
            <InputField
              id="kphone"
              label="Telefon"
              value={form.contactPhone ?? ''}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            />
            <InputField
              id="kmail"
              label="E-Mail"
              type="email"
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </FormGrid>
          <KundenartUidFelder
            idPrefix="k"
            kundenart={form.kundenart}
            vatId={form.vatId}
            onChange={({ kundenart, vatId }) =>
              setForm({ ...form, kundenart: kundenart || null, vatId })
            }
          />
          <InputField
            id="knotes"
            label="Notiz"
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <Pflichthinweis />
          {error && <ErrorState message={error} />}
          <div className="fuss-aktionen">
            {/* Der Weg zurück zur Liste — und der einzige, der das Eingetragene verwirft. */}
            <Button type="button" variant="ghost" onClick={formSchliessen}>
              Abbrechen
            </Button>
            <Button type="submit" loading={speichert}>
              {bearbeitet ? 'Änderungen speichern' : 'Kunde anlegen'}
            </Button>
          </div>
        </form>
      </BottomSheet>

      {/*
        BESTEHENDE BAUSTELLEN ÜBERNEHMEN — erst die Vorschau, geschrieben wird
        erst auf „Übernahme durchführen“. Wegklicken verwirft die Vorschau
        wie „Abbrechen“; geschrieben ist bis dahin nichts.
      */}
      <BottomSheet
        open={darfBaustellenZuordnen && uebernahmeOffen}
        onClose={() => {
          setUebernahmeOffen(false);
          setUebernahme(null);
        }}
        label="Bestehende Baustellen übernehmen"
        auchBreit
        titel="Bestehende Baustellen übernehmen"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">
            Legt aus den Kundennamen bestehender Baustellen Kunden an und ordnet die Baustellen
            zu. Geschrieben wird erst auf Bestätigung.
          </p>
          {error && <ErrorState message={error} />}
          {uebernahme === null ? (
            uebernahmeLaeuft ? (
              <LoadingState label="Vorschau wird erstellt …" />
            ) : (
              <div>
                <Button variant="secondary" loading={uebernahmeLaeuft} onClick={uebernahmeVorbereiten}>
                  Vorschau erstellen
                </Button>
              </div>
            )
          ) : uebernahme.length === 0 ? (
            <>
              <EmptyState>
                Alle Baustellen sind bereits einem Kunden zugeordnet. Nichts zu übernehmen.
              </EmptyState>
              <div className="fuss-aktionen">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setUebernahme(null);
                    setUebernahmeOffen(false);
                  }}
                >
                  Schließen
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink">
                <strong>{uebernahme.length}</strong>{' '}
                {uebernahme.length === 1 ? 'Kunde entsteht' : 'Kunden entstehen'} aus{' '}
                {uebernahme.reduce((n, g) => n + g.projekte.length, 0)} Baustellen.
              </p>
              <p className="text-sm text-ink-muted">
                Stehen hier zwei Schreibweisen desselben Kunden, entstehen auch zwei Datensätze.
                Sie lassen sich danach zusammenführen, indem die Baustellen der einen dem anderen
                zugeordnet werden.
              </p>
              <ul className="divide-y divide-line border-y border-line">
                {uebernahme.map((g) => (
                  <li key={g.name} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate text-ink">{g.name}</span>
                    <Marke>
                      {g.projekte.length}{' '}
                      {g.projekte.length === 1 ? 'Baustelle' : 'Baustellen'}
                    </Marke>
                  </li>
                ))}
              </ul>
              <div className="fuss-aktionen">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setUebernahme(null);
                    setUebernahmeOffen(false);
                  }}
                >
                  Abbrechen
                </Button>
                <Button loading={uebernahmeLaeuft} onClick={uebernahmeAusfuehren}>
                  Übernahme durchführen
                </Button>
              </div>
            </>
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={gleichNamig !== null}
        title="Gleicher Name — trotzdem anlegen?"
        message={gleichNamig ? rueckfrageText(form.name.trim(), gleichNamig) : ''}
        confirmLabel="Trotzdem anlegen"
        confirmTone="primary"
        onCancel={() => setGleichNamig(null)}
        onConfirm={async () => {
          setGleichNamig(null);
          await speichernBestaetigt(true);
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Kunde löschen?"
        message={
          toDelete
            ? `„${toDelete.name}“ wird entfernt. Das geht nur, solange dem Kunden keine Baustelle zugeordnet ist.`
            : ''
        }
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete || !user) return;
          try {
            await deleteCustomer(user.companyId, toDelete.id);
            toast.success('Kunde gelöscht');
            await laden();
          } catch (e) {
            setError((e as Error).message);
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
