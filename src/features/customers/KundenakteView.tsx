import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  listCustomersByIds,
  listProjectsForCustomer,
  listUnlinkedProjectsByName,
  assignProjectToCustomer,
  updateCustomer,
  type NewCustomer,
} from '@/lib/db/customers';
import { listQuotesForCustomer } from '@/lib/db/quotes';
import { listWartungenForCustomer } from '@/lib/db/wartungen';
import { useModul } from '@/lib/useModule';
import { isGF } from '@/lib/permissions';
import { beurteile } from '@/features/maintenance/wartungsplan';
import { todayStr } from '@/lib/time';
import type { Customer, Project, Quote, Wartung } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import { InputField, FormGrid, CheckboxField } from '@/components/Field';
import Button from '@/components/Button';
import { Zustand } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { AdresseLink, TelefonLink, MailLink } from '@/components/Kontakt';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';

/**
 * Die Akte eines Kunden — alles, was der Betrieb über ihn weiss.
 *
 * AUS DEM BETRIEB GEMELDET: „Man kann Kunden zwar eine Mail, Notiz, UID und
 * weiteres hinzufügen, diese Daten scheinen jedoch nirgendwo auf."
 *
 * Das stimmte. Das Formular nahm sieben Felder entgegen, die Liste zeigte
 * drei davon. E-Mail, UID-Nummer und Notiz wurden erfasst und danach nie
 * wieder gezeigt — der Betrieb pflegte Daten in ein Loch. Am teuersten war
 * die UID: sie gehört auf jede Rechnung an ein Unternehmen, und wer sie
 * nachsehen wollte, musste in die Bearbeitungsmaske.
 *
 * WARUM EINE EIGENE SEITE und nicht wieder ein Aufklappen in der Liste. Die
 * Historie hing bisher IN der Nebenzeile einer Listenzeile — ein Absatz, in
 * dem Blöcke stehen sollten, mit `span` gebaut, weil ein `p` keine `div`
 * verträgt. Um Stammdaten und Wartungen erweitert wäre daraus vollends eine
 * Ansicht in der Verkleidung einer Zeile. Und eine Seite hat eine Adresse:
 * von der Baustelle oder der Rechnung lässt sich später darauf verlinken,
 * auf ein Aufklappen nicht.
 */

const fmtEUR = (n: number) =>
  `€ ${new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

const fmtDatum = (iso?: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT') : '—';

/** Ein Teil der Akte lädt für sich — ein Fehler nimmt nicht die ganze Seite. */
type Teil<T> = { zustand: 'laedt' } | { zustand: 'fehler' } | { zustand: 'bereit'; daten: T };

const LAEDT = { zustand: 'laedt' } as const;

export default function KundenakteView() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const wartungAn = useModul('wartung');
  const angeboteAn = useModul('angebote');

  const [kunde, setKunde] = useState<Teil<WithId<Customer> | null>>(LAEDT);
  const [baustellen, setBaustellen] = useState<Teil<WithId<Project>[]>>(LAEDT);
  const [namensgleich, setNamensgleich] = useState<WithId<Project>[]>([]);
  const [angebote, setAngebote] = useState<Teil<WithId<Quote>[]>>(LAEDT);
  const [wartungen, setWartungen] = useState<Teil<WithId<Wartung>[]>>(LAEDT);
  const [zuordnenLaeuft, setZuordnenLaeuft] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);

  /**
   * DER ENTWURF DER STAMMDATEN — und warum es keinen Bearbeitungsmodus gibt.
   *
   * Zwei Zustände derselben Seite („ansehen" und „bearbeiten") sind die Sorte
   * Oberfläche, bei der man ständig im falschen steht: man tippt in ein Feld,
   * das keines ist, oder liest in einer Maske, in der man versehentlich etwas
   * verstellt. Genau das ist bei der UID-Nummer schon passiert — sie war nur
   * in der Bearbeitungsmaske zu sehen.
   *
   * Stattdessen: die Felder sind bearbeitbar, und ein Speichern-Balken
   * erscheint erst, wenn sich wirklich etwas geändert hat. Wer nur nachsieht,
   * merkt vom Bearbeiten nichts.
   */
  const [entwurf, setEntwurf] = useState<NewCustomer | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);

  const companyId = user?.companyId;
  const darfAendern = user ? isGF(user.role) : false;
  const heute = todayStr();

  useEffect(() => {
    if (!companyId || !id) return;
    let weg = false;
    setKunde(LAEDT);
    void (async () => {
      try {
        const treffer = await listCustomersByIds(companyId, [id]);
        if (!weg) setKunde({ zustand: 'bereit', daten: treffer[0] ?? null });
      } catch {
        if (!weg) setKunde({ zustand: 'fehler' });
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, id, versuch]);

  /*
    Die drei Bereiche laden GETRENNT. Ein Ausfall bei den Angeboten darf die
    Stammdaten nicht mitreissen — die sind der Grund, warum jemand die Seite
    öffnet.
  */
  const kundeDaten = kunde.zustand === 'bereit' ? kunde.daten : null;
  const kundeName = kundeDaten?.name;

  /*
    Der Entwurf folgt dem geladenen Kunden — aber NUR, wenn dieser sich
    wirklich geändert hat. Liefe er bei jedem Durchlauf mit, überschriebe
    jedes erneute Zeichnen die halb getippte Eingabe.
  */
  useEffect(() => {
    setEntwurf(kundeDaten ? alsEntwurf(kundeDaten) : null);
  }, [kundeDaten]);

  const geaendert =
    entwurf !== null && kundeDaten !== null && !gleich(entwurf, alsEntwurf(kundeDaten));

  async function stammdatenSpeichern(): Promise<void> {
    if (!companyId || !id || !entwurf) return;
    if (!entwurf.name.trim()) {
      setSpeicherFehler('Ohne Namen geht es nicht — daran hängen Baustellen und Rechnungen.');
      return;
    }
    setSpeichert(true);
    setSpeicherFehler(null);
    try {
      const nachgezogen = await updateCustomer(companyId, id, entwurf);
      /*
        WIE VIELE BAUSTELLEN MITGEWANDERT SIND, WIRD GESAGT. Der Kundenname
        steht als Kopie auf jeder Baustelle; ein Umbenennen zieht sie nach.
        Das lautlos zu tun hiesse, eine Änderung an fremden Datensätzen zu
        verschweigen — dieselbe Meldung gab schon die Kundenliste.
      */
      toast.success(
        nachgezogen > 0
          ? `Gespeichert, ${nachgezogen} ${nachgezogen === 1 ? 'Baustelle' : 'Baustellen'} nachgezogen`
          : 'Gespeichert',
      );
      // Neu laden: der Name ist der Schlüssel, unter dem Angebote und
      // namensgleiche Baustellen gesucht werden.
      setVersuch((v) => v + 1);
    } catch {
      setSpeicherFehler('Der Kunde konnte nicht gespeichert werden.');
    } finally {
      setSpeichert(false);
    }
  }

  useEffect(() => {
    if (!companyId || !id || !kundeName) return;
    let weg = false;
    void (async () => {
      try {
        const [zugeordnet, offen] = await Promise.all([
          listProjectsForCustomer(companyId, id),
          listUnlinkedProjectsByName(companyId, kundeName),
        ]);
        if (weg) return;
        setBaustellen({ zustand: 'bereit', daten: zugeordnet });
        setNamensgleich(offen);
      } catch {
        if (!weg) setBaustellen({ zustand: 'fehler' });
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, id, kundeName, versuch]);

  /*
    DIE ANGEBOTE HINGEN AM NAMEN UND MUSSTEN AN DER KENNUNG HÄNGEN.

    Hier stand `listQuotesForCustomer(companyId, kundeName)`. Die Abfrage
    filtert aber auf `customerId` — und `quotes.customer_id` ist eine `uuid`.
    Unter Postgres scheitert sie damit an jedem Kunden, und die Akte meldete
    „die Angebote konnte nicht geladen werden"; unter Firestore kam einfach
    nichts zurück, was wie „noch kein Angebot" aussah. Der Abschnitt hat also
    nie funktioniert, und der Umzug hat aus einer stillen Leere eine sichtbare
    Meldung gemacht.

    Angebote tragen die Kennung (`QuotesView` setzt sie beim Anlegen aus dem
    gewählten Kunden), also wird danach gesucht.
  */
  useEffect(() => {
    if (!companyId || !id || !angeboteAn) return;
    let weg = false;
    listQuotesForCustomer(companyId, id)
      .then((q) => !weg && setAngebote({ zustand: 'bereit', daten: q }))
      .catch(() => !weg && setAngebote({ zustand: 'fehler' }));
    return () => {
      weg = true;
    };
  }, [companyId, id, angeboteAn, versuch]);

  useEffect(() => {
    if (!companyId || !id || !wartungAn) return;
    let weg = false;
    listWartungenForCustomer(companyId, id)
      .then((w) => !weg && setWartungen({ zustand: 'bereit', daten: w }))
      .catch(() => !weg && setWartungen({ zustand: 'fehler' }));
    return () => {
      weg = true;
    };
  }, [companyId, id, wartungAn, versuch]);

  if (!user) return null;

  if (kunde.zustand === 'laedt') {
    return (
      <div className="space-y-6">
        <PageHeader title="Kundenakte" />
        <Card>
          <SkeletonList rows={3} />
        </Card>
      </div>
    );
  }

  if (kunde.zustand === 'fehler') {
    return (
      <div className="space-y-6">
        <PageHeader title="Kundenakte" />
        <ErrorState
          message="Der Kunde konnte nicht geladen werden."
          onRetry={() => setVersuch((v) => v + 1)}
        />
      </div>
    );
  }

  const k = kunde.daten;
  if (!k) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kundenakte" />
        <Card>
          {/*
            „Nicht gefunden" ist etwas anderes als „nicht geladen". Wer einem
            alten Lesezeichen folgt, soll das erfahren und nicht auf einen
            Ladefehler schliessen.
          */}
          <EmptyState action={<Link to="/customers" className="text-brand underline">Zur Kundenliste</Link>}>
            Diesen Kunden gibt es nicht (mehr).
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={k.name}
        subtitle={
          <Link to="/customers" className="text-brand underline">
            ← Zur Kundenliste
          </Link>
        }
        /*
          KEIN „BEARBEITEN"-KNOPF MEHR. Er führte in das Formular der
          Kundenliste — also aus der Akte heraus, um etwas zu ändern, das in
          der Akte steht. Wer zurückkam, stand wieder in der Liste und musste
          den Kunden erneut suchen. Geändert wird jetzt dort, wo es steht.
        */
      />

      {/*
        DIE STAMMDATEN ZUERST. Sie sind der Grund, warum es diese Seite gibt:
        E-Mail, UID und Notiz standen bisher in keiner Ansicht.
      */}
      <Card title="Stammdaten">
        {darfAendern && entwurf ? (
          <StammdatenFormular
            entwurf={entwurf}
            setEntwurf={setEntwurf}
            geaendert={geaendert}
            speichert={speichert}
            fehler={speicherFehler}
            onSpeichern={() => void stammdatenSpeichern()}
            onVerwerfen={() => setEntwurf(alsEntwurf(k))}
          />
        ) : (
          <StammdatenLesen k={k} />
        )}
      </Card>

      <Card title={`Baustellen${baustellen.zustand === 'bereit' ? ` (${baustellen.daten.length})` : ''}`}>
        {baustellen.zustand === 'laedt' ? (
          <SkeletonList rows={2} />
        ) : baustellen.zustand === 'fehler' ? (
          <TeilFehler was="die Baustellen" onRetry={() => setVersuch((v) => v + 1)} />
        ) : baustellen.daten.length === 0 ? (
          <EmptyState>Noch keine Baustelle zugeordnet.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {baustellen.daten
              .slice()
              .sort((a, b) => b.projectNumber.localeCompare(a.projectNumber))
              .map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link
                    to={`/admin-projects?baustelle=${encodeURIComponent(p.projectNumber)}`}
                    className="truncate text-sm text-brand underline"
                  >
                    {p.projectNumber} · {p.address ?? 'ohne Adresse'}
                  </Link>
                  <StatusBadge status={p.status} />
                </li>
              ))}
          </ul>
        )}

        {/*
          Baustellen, die den Namen tragen, aber auf keinen Kunden zeigen.
          Sie nur anzuzeigen wäre halb — der Knopf stellt die Verbindung her.
        */}
        {namensgleich.length > 0 && (
          <div className="mt-4 rounded border border-warning/40 bg-warning-bg p-3">
            <p className="text-sm text-warning">
              <strong>{namensgleich.length}</strong>{' '}
              {namensgleich.length === 1
                ? 'Baustelle trägt diesen Namen, ist'
                : 'Baustellen tragen diesen Namen, sind'}{' '}
              aber keinem Kunden zugeordnet.
            </p>
            <ul className="mt-2 space-y-2">
              {namensgleich.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate text-sm text-ink">
                    {p.projectNumber} · {p.address ?? 'ohne Adresse'}
                  </span>
                  {darfAendern && (
                    <Button
                      variant="secondary"
                      loading={zuordnenLaeuft === p.id}
                      onClick={async () => {
                        setZuordnenLaeuft(p.id);
                        try {
                          await assignProjectToCustomer(p.id, k.id, k.name);
                          toast.success('Baustelle zugeordnet');
                          setVersuch((v) => v + 1);
                        } catch {
                          toast.error('Die Zuordnung ist fehlgeschlagen.');
                        } finally {
                          setZuordnenLaeuft(null);
                        }
                      }}
                    >
                      Zuordnen
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {baustellen.zustand === 'bereit' &&
          baustellen.daten.length === 0 &&
          namensgleich.length === 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Gesucht wurde nach exakt „{k.name}". Bei abweichender Schreibweise hilft
              „Bestehende Baustellen übernehmen" in der Kundenliste.
            </p>
          )}
      </Card>

      {wartungAn && (
        <Card title="Wartungen">
          {wartungen.zustand === 'laedt' ? (
            <SkeletonList rows={1} />
          ) : wartungen.zustand === 'fehler' ? (
            <TeilFehler was="die Wartungen" onRetry={() => setVersuch((v) => v + 1)} />
          ) : wartungen.daten.length === 0 ? (
            <EmptyState>Keine Wartungsvereinbarung.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {wartungen.daten.map((w) => {
                const u = beurteile(w, heute);
                return (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 text-sm text-ink">
                      {w.anlage}
                      <span className="block text-xs text-ink-muted">
                        alle {w.intervallMonate} Monate · Termin {fmtDatum(w.faelligAm)}
                      </span>
                    </span>
                    <Zustand
                      stand={
                        u.stand === 'überfällig'
                          ? 'schlecht'
                          : u.stand === 'fällig'
                            ? 'achtung'
                            : 'ruht'
                      }
                    >
                      {u.stand === 'ruht' ? 'ruht' : u.text}
                    </Zustand>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {angeboteAn && (
        <Card title="Angebote">
          {angebote.zustand === 'laedt' ? (
            <SkeletonList rows={1} />
          ) : angebote.zustand === 'fehler' ? (
            <TeilFehler was="die Angebote" onRetry={() => setVersuch((v) => v + 1)} />
          ) : angebote.daten.length === 0 ? (
            <EmptyState>Noch kein Angebot.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {angebote.daten.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link to="/quotes" className="truncate text-sm text-brand underline">
                    {q.quoteNumber}
                  </Link>
                  <span className="tnum text-sm text-ink-muted">
                    {fmtEUR(q.totalNetto)} netto · {q.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

/** Die Felder, die die Akte bearbeitet — dieselben, die das Anlegen kennt. */
function alsEntwurf(k: Customer): NewCustomer {
  return {
    name: k.name ?? '',
    address: k.address ?? '',
    contactName: k.contactName ?? '',
    contactPhone: k.contactPhone ?? '',
    email: k.email ?? '',
    vatId: k.vatId ?? '',
    notes: k.notes ?? '',
    active: k.active !== false,
  };
}

/**
 * Hat sich wirklich etwas geändert?
 *
 * Feldweise und nicht über `JSON.stringify`: die Reihenfolge der Schlüssel
 * wäre dort Teil des Vergleichs, und ein Entwurf aus einer anderen Quelle
 * gälte als geändert, obwohl er dasselbe sagt. Der Speichern-Balken erschiene
 * dann, ohne dass jemand etwas getan hat.
 */
function gleich(a: NewCustomer, b: NewCustomer): boolean {
  return (Object.keys(a) as (keyof NewCustomer)[]).every((f) => a[f] === b[f]);
}

/** Die Stammdaten für alle, die sie nicht ändern dürfen. */
function StammdatenLesen({ k }: { k: Customer }) {
  return (
    <>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Angabe wort="Rechnungsadresse">
          {k.address ? <AdresseLink adresse={k.address} /> : null}
        </Angabe>
        <Angabe wort="Ansprechpartner">{k.contactName}</Angabe>
        <Angabe wort="Telefon">
          {k.contactPhone ? <TelefonLink nummer={k.contactPhone} name={k.contactName} /> : null}
        </Angabe>
        <Angabe wort="E-Mail">{k.email ? <MailLink adresse={k.email} /> : null}</Angabe>
        {/*
          Die UID gehört auf jede Rechnung an ein Unternehmen. Sie war bisher
          nur in der Bearbeitungsmaske zu sehen — also genau dort, wo man sie
          versehentlich ändert, während man sie nachsieht.
        */}
        <Angabe wort="UID-Nummer">
          {k.vatId ? <span className="tnum">{k.vatId}</span> : null}
        </Angabe>
        <Angabe wort="Zustand">
          {k.active === false
            ? <Zustand stand="ruht">inaktiv</Zustand>
            : <Zustand stand="gut">aktiv</Zustand>}
        </Angabe>
      </dl>

      {k.notes?.trim() ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="section-label">Notiz</p>
          {/* Zeilenumbrüche bleiben: eine Notiz ist oft eine Liste. */}
          <p className="mt-1 whitespace-pre-line text-sm text-ink">{k.notes}</p>
        </div>
      ) : null}
    </>
  );
}

interface FormularProps {
  entwurf: NewCustomer;
  setEntwurf: (e: NewCustomer) => void;
  geaendert: boolean;
  speichert: boolean;
  fehler: string | null;
  onSpeichern: () => void;
  onVerwerfen: () => void;
}

/**
 * Dieselben Stammdaten, bearbeitbar.
 *
 * DIE ANRUF- UND KARTENVERWEISE BLEIBEN. Ein Eingabefeld allein nähme der
 * Akte genau das, wofür das Büro sie aufmacht: die Nummer antippen und
 * anrufen. Sie stehen deshalb als Zeile unter den Feldern und folgen dem, was
 * gerade im Feld steht — wer eine Nummer korrigiert, kann sie sofort wählen,
 * ohne vorher zu speichern.
 */
function StammdatenFormular({
  entwurf, setEntwurf, geaendert, speichert, fehler, onSpeichern, onVerwerfen,
}: FormularProps) {
  const setze = (feld: keyof NewCustomer, wert: string | boolean) =>
    setEntwurf({ ...entwurf, [feld]: wert });

  return (
    <div className="flex flex-col gap-4">
      <FormGrid>
        <InputField
          id="k-name" label="Name" pflicht value={entwurf.name}
          onChange={(e) => setze('name', e.target.value)}
        />
        <InputField
          id="k-adresse" label="Rechnungsadresse" value={entwurf.address ?? ''}
          onChange={(e) => setze('address', e.target.value)}
        />
        <InputField
          id="k-ansprech" label="Ansprechpartner" value={entwurf.contactName ?? ''}
          onChange={(e) => setze('contactName', e.target.value)}
        />
        <InputField
          id="k-telefon" label="Telefon" type="tel" value={entwurf.contactPhone ?? ''}
          onChange={(e) => setze('contactPhone', e.target.value)}
        />
        <InputField
          id="k-mail" label="E-Mail" type="email" value={entwurf.email ?? ''}
          onChange={(e) => setze('email', e.target.value)}
        />
        <InputField
          id="k-uid" label="UID-Nummer" value={entwurf.vatId ?? ''}
          placeholder="ATU12345678"
          onChange={(e) => setze('vatId', e.target.value)}
        />
      </FormGrid>

      <div className="flex flex-col gap-1">
        <label htmlFor="k-notiz" className="text-sm font-medium text-ink">Notiz</label>
        <textarea
          id="k-notiz"
          rows={3}
          className="min-h-touch rounded border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-brand focus:ring-1 focus:ring-brand"
          value={entwurf.notes ?? ''}
          onChange={(e) => setze('notes', e.target.value)}
        />
      </div>

      {/*
        DER ZUSTAND IST EIN KÄSTCHEN UND KEIN LÖSCHEN. Ein Kunde mit
        Baustellen und Rechnungen verschwindet nicht; er wird stillgelegt.
      */}
      <CheckboxField
        id="k-aktiv"
        label="Aktiv — erscheint in den Auswahlfeldern"
        checked={entwurf.active !== false}
        onChange={(e) => setze('active', e.target.checked)}
      />

      {(entwurf.address || entwurf.contactPhone || entwurf.email) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <AdresseLink adresse={entwurf.address} variante="knopf" />
          <TelefonLink nummer={entwurf.contactPhone} name={entwurf.contactName} variante="knopf" />
          <MailLink adresse={entwurf.email} variante="knopf" />
        </div>
      )}

      {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}

      {/*
        DER BALKEN ERSCHEINT ERST BEI EINER ÄNDERUNG — und er steht IN der
        Karte, nicht fest am unteren Rand. Dort sitzt am Telefon bereits die
        Tableiste; zwei Balken übereinander wären eine Falle statt einer
        Hilfe.
      */}
      {geaendert && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-brand-fixed/40 bg-info-bg p-3">
          <span className="text-sm text-ink">Es gibt ungespeicherte Änderungen.</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onVerwerfen} disabled={speichert}>
              Verwerfen
            </Button>
            <Button onClick={onSpeichern} loading={speichert}>
              Speichern
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Eine Angabe der Stammdaten.
 *
 * LEER HEISST „NICHT HINTERLEGT", und das steht auch da. Die Zeile ganz
 * wegzulassen wäre bequemer und falsch: dann sähe eine Akte ohne UID genauso
 * aus wie eine, in der das Feld gar nicht vorgesehen ist — und niemand käme
 * auf die Idee, sie nachzutragen.
 */
function Angabe({ wort, children }: { wort: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="section-label">{wort}</dt>
      <dd className="mt-0.5 text-sm text-ink">
        {children || <span className="text-ink-muted">nicht hinterlegt</span>}
      </dd>
    </div>
  );
}
