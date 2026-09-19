import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  listWartungen,
  searchWartungen,
  createWartung,
  updateWartung,
  deleteWartung,
  wartungErledigt,
  type NewWartung,
} from '@/lib/db/wartungen';
import { wartungEingeplant } from '@/lib/db/wartungen';
import { listCustomers } from '@/lib/db/customers';
import { listRecentProjects, createProject } from '@/lib/db/projects';
import { isGF } from '@/lib/permissions';
import { todayStr } from '@/lib/time';
import type { Customer, Wartung } from '@/types';
import type { WithId } from '@/lib/db/core';
import {
  beurteile,
  nachFaelligkeit,
  naechsterTermin,
  INTERVALLE,
  VORLAUF_TAGE,
  type Dringlichkeit,
} from './wartungsplan';
import {
  naechsteProjektnummer,
  nummerFrei,
  baustelleAusWartung,
} from './wartungBaustelle';
import Card from '@/components/Card';
import KundenGrenze from '@/components/AuswahlGrenze';
import Button from '@/components/Button';
import Icon from '@/components/Icon';
import { Zustand, type Stand } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import Nachladen from '@/components/Nachladen';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  InputField,
  SelectField,
  CheckboxField,
  FormGrid,
  Pflichthinweis,
} from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';

const fmtDatum = (iso?: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT') : '—';

/*
  DIE LISTE IST DER AUFRUF, NICHT DIE ZEILE. „Überfällig" sagt, WO eine
  Wartung steht; dass sie zu tun ist, sagt die Ansicht, in der sie steht.
  Stünde beides als gefüllte Pille da, riefe die Liste zweimal dasselbe.
*/
const STAND: Record<Dringlichkeit, Stand> = {
  'überfällig': 'schlecht',
  'fällig': 'achtung',
  'später': 'laeuft',
  ruht: 'ruht',
  unklar: 'ruht',
};

const LEER = (): NewWartung => ({
  customerId: '',
  customerName: '',
  anlage: '',
  address: '',
  intervallMonate: 12,
  zuletztAm: '',
  faelligAm: '',
  aktiv: true,
  hinweis: '',
});

/** Was gerade erledigt eingetragen wird. */
interface Erledigung {
  wartung: WithId<Wartung>;
  datum: string;
  intervall: number;
  baustelle: string;
}

/** Die Baustelle, die gerade aus einer Wartung entstehen soll. */
interface Einplanung {
  wartung: WithId<Wartung>;
  nummer: string;
}

/**
 * Wiederkehrende Wartungen.
 *
 * DER GANZE ABLAUF, nicht die Liste allein: erfassen, sehen was fällig wird,
 * erledigt eintragen — und mit dem Eintragen rückt der nächste Termin nach.
 * Ohne den letzten Schritt wäre das hier nach einem Jahr eine Sammlung roter
 * Zeilen, die niemand mehr ansieht, und die Vereinbarung wäre dieselbe
 * Karteileiche wie vorher im Kalender.
 *
 * Zwei Abschnitte, und die Reihenfolge ist die Aussage: oben steht, was zu
 * tun ist, darunter der Bestand. Wer die Seite öffnet, will nicht
 * dreihundert Vereinbarungen sehen, sondern die vier, die anstehen.
 */
/**
 * Wie viele Wartungsvereinbarungen auf einmal geholt werden.
 *
 * Zweihundert reichen für einen Betrieb mit ein paar Jahren Bestand; wer mehr
 * führt, lädt nach. Die Zahl ist bewusst kleiner als der Bestand sein kann —
 * die Antwort auf „was steht an" steht ohnehin oben und rechnet über das
 * Geladene hinaus nicht anders.
 */
const WARTUNGEN_JE_SEITE = 200;

export default function WartungenView() {
  const { user } = useAuth();
  const toast = useToast();
  const [wartungen, setWartungen] = useState<WithId<Wartung>[]>([]);
  const [kunden, setKunden] = useState<WithId<Customer>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [form, setForm] = useState<NewWartung>(LEER);
  const [bearbeitet, setBearbeitet] = useState<WithId<Wartung> | null>(null);
  const [formOffen, setFormOffen] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [erledigung, setErledigung] = useState<Erledigung | null>(null);
  const [einplanung, setEinplanung] = useState<Einplanung | null>(null);
  /*
    Die vorhandenen Projektnummern — für den Vorschlag UND für die Prüfung,
    ob die Nummer noch frei ist. Es gibt für Baustellen bewusst keinen Zähler
    (siehe `wartungBaustelle.ts`); zwei Baustellen mit derselben Nummer wären
    aber der teuerste Fehler dieser Kette, weil Zeiten, Scheine und Rechnungen
    an der Nummer hängen und nicht an der Dokument-ID.
  */
  const [nummern, setNummern] = useState<string[]>([]);
  /*
    Wie weit der Bestand geladen ist. Vorher stand hier die Voreinstellung der
    Abfrage — fünfhundert —, und ein Betrieb mit mehr Vereinbarungen verlor
    die späteren Termine lautlos. Ausgerechnet bei Wartungen ist das teuer:
    eine Vereinbarung, die niemand sieht, wird nicht ausgeführt.
  */
  const [grenze, setGrenze] = useState(WARTUNGEN_JE_SEITE);
  const [toDelete, setToDelete] = useState<WithId<Wartung> | null>(null);

  const darfAendern = user ? isGF(user.role) : false;
  const heute = todayStr();

  const companyId = user?.companyId;

  useEffect(() => {
    if (!companyId) return;
    let weg = false;
    setLoading(true);
    void (async () => {
      try {
        const [w, k, p] = await Promise.all([
          listWartungen(companyId, grenze),
          listCustomers(companyId),
          /*
            Nur für den Nummernvorschlag. Scheitert es — etwa weil eine Rolle
            die Baustellen nicht lesen darf —, bleibt die Liste leer und der
            Vorschlag beginnt beim ersten des Jahres. Die ganze Wartungsliste
            deswegen scheitern zu lassen, wäre die falsche Reihenfolge.
          */
          listRecentProjects(companyId, 300).catch(() => []),
        ]);
        if (weg) return;
        setWartungen(w);
        setKunden(k);
        setNummern(p.map((x) => x.projectNumber));
        setError(null);
      } catch (e) {
        if (!weg) setError((e as Error).message);
      } finally {
        if (!weg) setLoading(false);
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, grenze]);

  const neuLaden = async () => {
    if (!companyId) return;
    setWartungen(await listWartungen(companyId, grenze));
  };

  /**
   * Anstehend heisst überfällig, fällig binnen Vorlauf — und ohne Termin.
   *
   * Der letzte Fall gehört dazu, weil eine Vereinbarung ohne brauchbares
   * Datum sonst im Bestand verschwindet. Sie ist der einzige Eintrag, der
   * eine Eingabe braucht, und der einzige, den niemand vermisst.
   */
  const anstehend = useMemo(
    () =>
      wartungen
        .filter((w) => {
          const s = beurteile(w, heute).stand;
          return s === 'überfällig' || s === 'fällig' || s === 'unklar';
        })
        .sort(nachFaelligkeit),
    [wartungen, heute],
  );

  /*
    GESUCHT WIRD SERVERSEITIG — und zwar NEBEN der geladenen Liste, nicht
    statt ihrer.

    Die Liste `wartungen` trägt zwei Aufgaben: aus ihr entsteht die Karte
    „anstehend", und sie ist zugleich das, was unten steht. Würde die Suche
    sie ersetzen, schrumpfte beim Tippen auch die Anstehend-Karte — und wer
    nach einem Kunden sucht, bekäme den Eindruck, es sei nichts mehr fällig.

    Deshalb eine zweite Abfrage. Sie sucht über den ganzen Bestand und findet
    auch mitten im Wort.
  */
  const [gesucht, setGesucht] = useState<WithId<Wartung>[]>([]);
  const [suchtGerade, setSuchtGerade] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const begriff = suche.trim();
    if (!begriff) {
      setGesucht([]);
      setSuchtGerade(false);
      return;
    }
    let weg = false;
    setSuchtGerade(true);
    // Dreihundert Millisekunden: die Pause, nach der jemand aufgehört hat zu
    // tippen. Ohne sie stünden zwanzig Abfragen gleichzeitig in der Leitung.
    const verzoegert = setTimeout(() => {
      void searchWartungen(companyId, begriff, grenze)
        .then((treffer) => {
          if (!weg) setGesucht(treffer);
        })
        // Ein Fehlschlag lässt die geladene Liste stehen, statt sie zu leeren:
        // was da ist, ist deshalb nicht falsch.
        .catch(() => {
          if (!weg) setGesucht([]);
        })
        .finally(() => {
          if (!weg) setSuchtGerade(false);
        });
    }, 300);
    return () => {
      weg = true;
      clearTimeout(verzoegert);
    };
  }, [companyId, suche, grenze]);

  const gefiltert = useMemo(
    () => (suche.trim() ? gesucht : wartungen),
    [wartungen, gesucht, suche],
  );

  const formOeffnen = (w?: WithId<Wartung>) => {
    if (w) {
      setBearbeitet(w);
      setForm({
        customerId: w.customerId,
        customerName: w.customerName,
        anlage: w.anlage,
        address: w.address ?? '',
        intervallMonate: w.intervallMonate,
        zuletztAm: w.zuletztAm ?? '',
        faelligAm: w.faelligAm,
        aktiv: w.aktiv !== false,
        hinweis: w.hinweis ?? '',
      });
    } else {
      setBearbeitet(null);
      setForm(LEER());
    }
    setFormOffen(true);
  };

  /**
   * Beim Wechsel des Kunden wandert der Name als Kopie mit.
   *
   * Dieselbe Überlegung wie bei den Baustellen: die Liste zeigt ihn und soll
   * dafür nicht die Kundensammlung nachladen müssen.
   */
  const kundeWaehlen = (id: string) => {
    const k = kunden.find((x) => x.id === id);
    setForm((f) => ({ ...f, customerId: id, customerName: k?.name ?? '' }));
  };

  /**
   * Aus „zuletzt gewartet" den Vorschlag für den nächsten Termin rechnen.
   *
   * VORSCHLAG, nicht Zwang: das Feld bleibt frei änderbar. Eine übernommene
   * Anlage kann eine Frist haben, die nicht in dieses Raster passt — etwa
   * weil der Vorbetrieb sie im Herbst gewartet hat und der Kunde die Wartung
   * künftig im Frühjahr will.
   */
  const terminVorschlagen = () => {
    if (!form.zuletztAm) return;
    try {
      setForm((f) => ({ ...f, faelligAm: naechsterTermin(f.zuletztAm!, f.intervallMonate) }));
    } catch {
      /* unbrauchbares Datum: dann bleibt der Termin, wie er ist */
    }
  };

  const speichern = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (!form.customerId) {
      toast.error('Bitte einen Kunden wählen.');
      return;
    }
    if (!form.anlage.trim()) {
      toast.error('Bitte eintragen, was gewartet wird.');
      return;
    }
    if (!form.faelligAm) {
      toast.error('Ohne Termin wüsste niemand, wann die Wartung ansteht.');
      return;
    }
    setSpeichert(true);
    try {
      const daten: NewWartung = {
        ...form,
        anlage: form.anlage.trim(),
        address: form.address?.trim() || undefined,
        hinweis: form.hinweis?.trim() || undefined,
        zuletztAm: form.zuletztAm || undefined,
      };
      if (bearbeitet) {
        await updateWartung(bearbeitet.id, daten);
        toast.success('Wartung geändert.');
      } else {
        await createWartung(companyId, daten);
        toast.success('Wartung angelegt.');
      }
      setFormOffen(false);
      setBearbeitet(null);
      setForm(LEER());
      await neuLaden();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  /**
   * Aus der Wartung eine Baustelle machen — und sie an der Wartung vormerken.
   *
   * ZWEI SCHREIBVORGÄNGE, UND DIE REIHENFOLGE IST DIE AUSSAGE. Zuerst
   * entsteht die Baustelle, dann wird sie vermerkt. Bricht der zweite Schritt
   * ab, steht eine Baustelle da, die niemand der Wartung zuordnet — ärgerlich,
   * aber sichtbar und von Hand nachtragbar. Andersherum verwiese die Wartung
   * auf eine Baustelle, die es nicht gibt, und der Monteur bekäme einen
   * Einsatz auf eine Nummer, unter der nichts steht.
   *
   * Eine Transaktion über beide wäre die saubere Antwort, und seit dem Umzug
   * wäre sie auch möglich — eine Datenbankfunktion, die Baustelle und Termin
   * in einem Zug schreibt. Sie ist noch nicht gebaut; bis dahin gilt die
   * Reihenfolge unten, und der schlimmste Ausgang ist eine Baustelle ohne
   * nachgerückten Termin, nicht ein Termin ohne Baustelle.
   */
  const einplanenSpeichern = async () => {
    if (!einplanung || !companyId) return;
    const nummer = einplanung.nummer.trim();
    if (!nummer) {
      toast.error('Ohne Projektnummer gibt es keine Baustelle.');
      return;
    }
    if (!nummerFrei(nummer, nummern)) {
      toast.error(`${nummer} ist schon vergeben. Bitte eine andere Nummer.`);
      return;
    }
    setSpeichert(true);
    try {
      const kunde = kunden.find((k) => k.id === einplanung.wartung.customerId);
      await createProject(
        companyId,
        baustelleAusWartung(einplanung.wartung, kunde, nummer),
      );
      await wartungEingeplant(einplanung.wartung.id, nummer);
      setNummern((n) => [...n, nummer]);
      setEinplanung(null);
      await neuLaden();
      toast.success(`Baustelle ${nummer} angelegt. Jetzt im Einsatzplan einteilen.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  const erledigtSpeichern = async () => {
    if (!erledigung) return;
    setSpeichert(true);
    try {
      await wartungErledigt(erledigung.wartung.id, {
        erledigtAm: erledigung.datum,
        intervallMonate: erledigung.intervall,
        projectNumber: erledigung.baustelle.trim() || undefined,
      });
      const naechster = naechsterTermin(erledigung.datum, erledigung.intervall);
      setErledigung(null);
      await neuLaden();
      toast.success(`Eingetragen. Nächste Wartung: ${fmtDatum(naechster)}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  const loeschen = async () => {
    if (!toDelete) return;
    try {
      await deleteWartung(toDelete.id);
      setToDelete(null);
      await neuLaden();
      toast.success('Wartung gelöscht.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!user) return null;
  if (error) return <ErrorState message={error} />;

  const zeile = (w: WithId<Wartung>) => {
    const u = beurteile(w, heute);
    return (
      <ListRow
        key={w.id}
        title={
          <>
            <span>{w.customerName}</span>
            <Zustand stand={STAND[u.stand]}>{u.stand === 'ruht' ? 'ruht' : u.text}</Zustand>
          </>
        }
        subtitle={
          <>
            {w.anlage}
            {w.address ? ` · ${w.address}` : ''} · alle {w.intervallMonate} Monate · Termin{' '}
            {fmtDatum(w.faelligAm)}
            {w.zuletztAm ? ` · zuletzt ${fmtDatum(w.zuletztAm)}` : ' · noch nie gewartet'}
            {w.hinweis ? ` · ${w.hinweis}` : ''}
            {/*
              WAS SCHON EINGEPLANT IST, SAGT ES. Ohne diese Zeile hiess
              „fällig" zweierlei — „noch nichts passiert" und „steht längst im
              Einsatzplan" —, und wer die Liste zweimal durchging, legte die
              Baustelle zweimal an.
            */}
            {w.offeneBaustelle ? (
              <span className="mt-1 block text-xs text-ink-muted">
                Eingeplant auf Baustelle{' '}
                <Link className="underline" to={`/projects?baustelle=${encodeURIComponent(w.offeneBaustelle)}`}>
                  {w.offeneBaustelle}
                </Link>
              </span>
            ) : null}
          </>
        }
      >
        {darfAendern && (
          <>
            {/*
              Einplanen steht nur dort, wo es etwas zu planen gibt: bei einer
              anstehenden Wartung ohne offene Baustelle. An einer Vereinbarung,
              die erst in acht Monaten fällig wird, wäre der Knopf eine
              Einladung, Baustellen auf Vorrat anzulegen.
            */}
            {!w.offeneBaustelle && u.stand !== 'später' && u.stand !== 'ruht' && (
              <Button
                onClick={() =>
                  setEinplanung({
                    wartung: w,
                    nummer: naechsteProjektnummer(nummern, new Date().getFullYear()),
                  })
                }
              >
                Baustelle anlegen
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() =>
                setErledigung({
                  wartung: w,
                  datum: heute,
                  intervall: w.intervallMonate,
                  // Die eingeplante Baustelle steht schon da: niemand soll
                  // eine Nummer abtippen, die die App kennt.
                  baustelle: w.offeneBaustelle ?? '',
                })
              }
            >
              Erledigt
            </Button>
            <Button variant="ghost" onClick={() => formOeffnen(w)}>
              Bearbeiten
            </Button>
          </>
        )}
      </ListRow>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wartungen"
        subtitle={`Wiederkehrende Wartungen · fällig gilt ab ${VORLAUF_TAGE} Tagen im Voraus`}
        action={
          darfAendern ? <Button onClick={() => formOeffnen()}><Icon name="plus" size={18} />Neue Wartung</Button> : undefined
        }
      />

      {formOffen && darfAendern && (
        <Card title={bearbeitet ? 'Wartung ändern' : 'Neue Wartung'}>
          <form onSubmit={speichern} className="space-y-4">
            <FormGrid>
              <SelectField id="w-kunde"
                label="Kunde"
                pflicht
                value={form.customerId}
                onChange={(e) => kundeWaehlen(e.target.value)}
              >
                <option value="">— wählen —</option>
                {kunden.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </SelectField>
              <KundenGrenze kunden={kunden} />
              <InputField id="w-anlage"
                label="Anlage"
                pflicht
                placeholder="Therme Vaillant ecoTEC, Keller"
                value={form.anlage}
                onChange={(e) => setForm({ ...form, anlage: e.target.value })}
              />
              <InputField id="w-standort"
                label="Standort (leer = Kundenadresse)"
                value={form.address ?? ''}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
              <SelectField id="w-intervall"
                label="Intervall"
                value={String(form.intervallMonate)}
                onChange={(e) => setForm({ ...form, intervallMonate: Number(e.target.value) })}
              >
                {INTERVALLE.map((m) => (
                  <option key={m} value={m}>
                    alle {m} Monate
                  </option>
                ))}
              </SelectField>
              <InputField id="w-zuletzt"
                label="Zuletzt gewartet"
                type="date"
                value={form.zuletztAm ?? ''}
                onChange={(e) => setForm({ ...form, zuletztAm: e.target.value })}
                onBlur={terminVorschlagen}
              />
              <InputField id="w-termin"
                label="Nächster Termin"
                pflicht
                type="date"
                value={form.faelligAm}
                onChange={(e) => setForm({ ...form, faelligAm: e.target.value })}
              />
              <InputField id="w-hinweis"
                label="Hinweis"
                placeholder="Schlüssel bei der Hausverwaltung"
                value={form.hinweis ?? ''}
                onChange={(e) => setForm({ ...form, hinweis: e.target.value })}
              />
              <CheckboxField id="w-aktiv"
                label="Vereinbarung läuft"
                checked={form.aktiv}
                onChange={(e) => setForm({ ...form, aktiv: e.target.checked })}
              />
            </FormGrid>
            <Pflichthinweis />
            <p className="text-sm text-ink-muted">
              Eine gekündigte Vereinbarung wird nicht gelöscht, sondern angehalten — die
              Historie ist der Grund, warum man den Kunden später wieder anruft.
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={speichert}>
                {speichert ? 'Speichert …' : 'Speichern'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFormOffen(false);
                  setBearbeitet(null);
                }}
              >
                Abbrechen
              </Button>
              {bearbeitet && (
                <Button type="button" variant="danger" onClick={() => setToDelete(bearbeitet)}>
                  Löschen
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      <Card title={`Steht an (${anstehend.length})`}>
        {loading ? (
          <SkeletonList />
        ) : anstehend.length === 0 ? (
          <EmptyState>
            In den nächsten {VORLAUF_TAGE} Tagen steht keine Wartung an.
          </EmptyState>
        ) : (
          <List>{anstehend.map(zeile)}</List>
        )}
      </Card>

      <Card title={`Alle Vereinbarungen (${wartungen.length})`}>
        <div className="mb-3">
          <InputField id="w-suche"
            label="Suche"
            placeholder="Kunde, Anlage oder Standort"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
        </div>
        {loading || suchtGerade ? (
          /*
            WÄHREND DER SUCHE STEHT DAS GERÜST, NICHT DIE LEERE.

            Zwischen Tastendruck und Antwort liegen die Verzögerung und eine
            Netzrunde. Ohne diesen Zweig stünde in dieser Zeit „Kein Treffer
            für diese Suche" — eine Aussage über den Bestand, wo nur noch
            keine Antwort da ist. Wer schnell tippt, läse sie bei jedem
            Buchstaben.
          */
          <SkeletonList />
        ) : gefiltert.length === 0 ? (
          <EmptyState>
            {wartungen.length === 0
              ? 'Noch keine Wartung erfasst.'
              : 'Kein Treffer für diese Suche.'}
          </EmptyState>
        ) : (
          <List>{gefiltert.map(zeile)}</List>
        )}
        {!loading && (
          <Nachladen
            geladen={wartungen.length}
            grenze={grenze}
            einheit="Vereinbarungen"
            onMehr={() => setGrenze((n) => n + WARTUNGEN_JE_SEITE)}
          />
        )}
      </Card>

      {erledigung && (
        <ConfirmDialog
          open
          title="Wartung erledigt eintragen"
          confirmLabel={speichert ? 'Trägt ein …' : 'Eintragen'}
          onConfirm={erledigtSpeichern}
          onCancel={() => setErledigung(null)}
        >
          <div className="space-y-3">
            <p className="text-sm">
              {erledigung.wartung.customerName} · {erledigung.wartung.anlage}
            </p>
            <FormGrid cols={1}>
              <InputField id="e-datum"
                label="Gewartet am"
                type="date"
                value={erledigung.datum}
                onChange={(e) => setErledigung({ ...erledigung, datum: e.target.value })}
              />
              <SelectField id="e-intervall"
                label="Intervall ab jetzt"
                value={String(erledigung.intervall)}
                onChange={(e) =>
                  setErledigung({ ...erledigung, intervall: Number(e.target.value) })
                }
              >
                {INTERVALLE.map((m) => (
                  <option key={m} value={m}>
                    alle {m} Monate
                  </option>
                ))}
              </SelectField>
              <InputField id="e-baustelle"
                label="Baustelle (optional)"
                placeholder="2026-014"
                value={erledigung.baustelle}
                onChange={(e) => setErledigung({ ...erledigung, baustelle: e.target.value })}
              />
            </FormGrid>
            <p className="text-sm text-ink-muted">
              Nächster Termin: {fmtDatum(naechsterTermin(erledigung.datum, erledigung.intervall))}
              . Gerechnet ab dem Tag der Ausführung, nicht ab dem geplanten Termin — das
              Wartungsintervall läuft ab der letzten tatsächlichen Wartung.
            </p>
          </div>
        </ConfirmDialog>
      )}

      {einplanung && (
        <ConfirmDialog
          open
          title="Baustelle für diese Wartung anlegen?"
          confirmLabel="Anlegen"
          confirmTone="primary"
          onConfirm={einplanenSpeichern}
          onCancel={() => setEinplanung(null)}
        >
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              {einplanung.wartung.customerName} · {einplanung.wartung.anlage}
            </p>
            <FormGrid cols={1}>
              <InputField id="p-nummer"
                label="Projektnummer"
                pflicht
                value={einplanung.nummer}
                onChange={(e) => setEinplanung({ ...einplanung, nummer: e.target.value })}
              />
            </FormGrid>
            {/*
              VORSCHLAG, NICHT ZÄHLER — und das steht auch da. Projektnummern
              vergibt der Betrieb frei; wer ein eigenes System führt,
              überschreibt die Zahl. Vergeben ist sie deshalb erst, wenn
              gespeichert wird, und dabei wird sie noch einmal geprüft.
            */}
            <p className="text-sm text-ink-muted">
              Vorgeschlagen aus den vorhandenen Nummern — änderbar. Die Baustelle entsteht mit
              Kunde, Standort und der Anlage in der Beschreibung; einzuteilen ist sie danach im
              Einsatzplan. Die Abrechnungsart bleibt offen: was im Wartungsvertrag steht, weiß
              diese App nicht.
            </p>
          </div>
        </ConfirmDialog>
      )}

      {toDelete && (
        <ConfirmDialog
          open
          title="Wartung löschen?"
          confirmLabel="Löschen"
          onConfirm={loeschen}
          onCancel={() => setToDelete(null)}
        >
          <p>
            {toDelete.customerName} · {toDelete.anlage}. Die Historie geht mit verloren. Wer die
            Vereinbarung nur beenden will, hält sie besser an.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
