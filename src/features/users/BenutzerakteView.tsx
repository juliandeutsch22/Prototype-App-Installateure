import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { useUngespeichertWarnung } from '@/lib/ungespeichert';
import { getUserByUid, updateUserProfile } from '@/lib/db/users';
import { generatePassword, resendPasswordReset } from '@/lib/auth/provisionUser';
import { passwortVergeben } from '@/lib/auth/sitzung';
import { istBenutzerkonto, kontoAnzeige } from '@shared/benutzername';
import { canManageAdmins, fuehrtZeitkonto } from '@/lib/permissions';
import { ROLES, type AppUser, type Role } from '@/types';
import Card from '@/components/Card';
import Aktionsleiste from '@/components/Aktionsleiste';
import Aktenspalten from '@/components/Aktenspalten';
import Hinweiszeile from '@/components/Hinweiszeile';
import Button from '@/components/Button';
import { Marke, Zustand } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import InfoHint from '@/components/InfoHint';
import { InputField, SelectField, FormGrid, CheckboxField } from '@/components/Field';
import { MailLink } from '@/components/Kontakt';
import { useToast } from '@/components/Toast';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import {
  alsEntwurf, alsProfil, entwurfFehler, gleich, mitKundenFreigabe, mitLagerFreigaben,
  mitRechnungsFreigabe, mitZeitkontoWahl,
  tagessollNachTagen, urlaubsfeldName, WEEKDAYS,
  type BenutzerEntwurf,
} from './benutzerEntwurf';
import TagessollFelder from './TagessollFelder';
import EinstufungFelder from './EinstufungFelder';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT } from '@/lib/datum';
import { todayStr, uebertragsRegel } from '@/lib/time';
import { einstufungText, lehrzeitEnde } from '@/lib/einstufung';
import Datenauskunft from '@/features/recht/Datenauskunft';
import { zeigtAuskunft } from '@/features/recht/auskunftDatei';
import ZahlFeld from '@/components/ZahlFeld';
import KontoUmstellen from './KontoUmstellen';
import UrlaubsanspruchKarte from './UrlaubsanspruchKarte';

/**
 * Die Akte eines Benutzers — und die Stelle, an der sie bearbeitet wird.
 *
 * WAS VORHER WAR. Wer ein Zeitkonto korrigieren wollte, klickte in der Liste
 * auf „Bearbeiten", wurde nach ganz oben in das Anlege-Formular gescrollt und
 * musste dort erst noch „Zeitkonto-Einstellungen anzeigen" aufklappen —
 * genau die Felder, deretwegen er gekommen war. Danach stand er wieder in
 * einer Liste von fünfundzwanzig Namen.
 *
 * WARUM DIE ZEITKONTO-FELDER HIER NICHT AUFGEKLAPPT WERDEN. Im Anlege-
 * Formular sind sie zu Recht eingeklappt: beim Anlegen sind sie vorbelegt und
 * stimmen meistens. In der Akte sind sie der Grund, warum jemand die Seite
 * öffnet.
 */

/** Ein Teil der Akte lädt für sich. */
type Teil<T> = { zustand: 'laedt' } | { zustand: 'fehler' } | { zustand: 'bereit'; daten: T };

const LAEDT = { zustand: 'laedt' } as const;

const fmtDatum = (iso?: string | null) =>
  datumAT(iso);

const tageText = (tage: number[]) =>
  WEEKDAYS.filter((d) => tage.includes(d.value)).map((d) => d.label).join(', ');

export default function BenutzerakteView() {
  const { uid } = useParams<{ uid: string }>();
  const { user, einblick, company } = useAuth();
  const toast = useToast();

  const [person, setPerson] = useState<Teil<AppUser | null>>(LAEDT);
  const [entwurf, setEntwurf] = useState<BenutzerEntwurf | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);
  const [umschalten, setUmschalten] = useState(false);
  const [neuesPasswortFragen, setNeuesPasswortFragen] = useState(false);
  const [vergibt, setVergibt] = useState(false);
  /** Nur für diesen Augenblick sichtbar — nirgends gespeichert. */
  const [vergeben, setVergeben] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);

  const companyId = user?.companyId;

  useEffect(() => {
    if (!companyId || !uid) return;
    let weg = false;
    setPerson(LAEDT);
    void (async () => {
      try {
        const gefunden = await getUserByUid(companyId, uid);
        if (!weg) setPerson({ zustand: 'bereit', daten: gefunden });
      } catch {
        if (!weg) setPerson({ zustand: 'fehler' });
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, uid, versuch]);

  const daten = person.zustand === 'bereit' ? person.daten : null;

  /*
    Der Entwurf folgt der geladenen Person — aber NUR, wenn diese sich wirklich
    geändert hat. Sonst überschriebe jedes erneute Zeichnen die halb getippte
    Eingabe.
  */
  useEffect(() => {
    setEntwurf(daten ? alsEntwurf(daten) : null);
  }, [daten]);

  const geaendert = entwurf !== null && daten !== null && !gleich(entwurf, alsEntwurf(daten));
  // Wer mit ungespeicherten Änderungen weggeht, wird gefragt (Testbericht 30.09.2026, M1).
  const warnung = useUngespeichertWarnung(geaendert);

  /*
    EIN ADMINISTRATOR LÄSST SICH NUR VON EINEM ADMINISTRATOR ANFASSEN.
    Sonst könnte die Geschäftsführung den letzten Superuser deaktivieren und
    sich selbst aussperren. Dieselbe Grenze zieht die Liste, und dieselbe
    steht im Zeilenschutz — hier wird sie nur sichtbar gemacht.
  */
  const darfAendern =
    !!user && !!daten && (daten.role !== 'Administrator' || canManageAdmins(user.role));

  async function speichern(): Promise<void> {
    if (!uid || !entwurf) return;
    if (!entwurf.name.trim()) {
      setSpeicherFehler('Ohne Namen geht es nicht — er steht auf jeder Buchung und jedem Schein.');
      return;
    }
    const falsch = entwurfFehler(entwurf);
    if (falsch) {
      setSpeicherFehler(falsch);
      return;
    }
    setSpeichert(true);
    setSpeicherFehler(null);
    try {
      await updateUserProfile(uid, alsProfil(entwurf));
      toast.success(`${entwurf.name} aktualisiert`);
      setVersuch((v) => v + 1);
    } catch {
      setSpeicherFehler('Die Änderungen konnten nicht gespeichert werden.');
    } finally {
      setSpeichert(false);
    }
  }

  async function startpasswortVergeben(): Promise<void> {
    if (!uid) return;
    setVergibt(true);
    const pw = generatePassword();
    try {
      await passwortVergeben(uid, pw);
      setVergeben(pw);
    } catch (e) {
      toast.error(grundAus(e, 'Das Passwort konnte nicht vergeben werden.'));
    } finally {
      setVergibt(false);
    }
  }

  function tagUmschalten(d: number) {
    if (!entwurf) return;
    setEntwurf({
      ...entwurf,
      workDays: entwurf.workDays.includes(d)
        ? entwurf.workDays.filter((x) => x !== d)
        : [...entwurf.workDays, d].sort(),
      tagessoll: tagessollNachTagen(entwurf, d),
    });
  }

  if (person.zustand === 'laedt') {
    return (
      <div className="space-y-6">
        <PageHeader title="Benutzer" />
        <Card><SkeletonList rows={4} /></Card>
      </div>
    );
  }

  if (person.zustand === 'fehler') {
    return (
      <div className="space-y-6">
        <PageHeader title="Benutzer" />
        <Card>
          <ErrorState
            message="Der Benutzer konnte nicht geladen werden."
            onRetry={() => setVersuch((v) => v + 1)}
          />
        </Card>
      </div>
    );
  }

  const p = person.daten;
  if (!p || !user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Benutzer" />
        <Card>
          {/*
            „Gibt es nicht" ist etwas anderes als „nicht geladen". Wer einem
            alten Lesezeichen folgt, soll das erfahren.
          */}
          <EmptyState
            action={<Link to="/user-mgmt" className="link-weiter">Zur Benutzerliste</Link>}
          >
            Diesen Benutzer gibt es nicht (mehr).
          </EmptyState>
        </Card>
      </div>
    );
  }

  const eigenesKonto = p.uid === user.uid;

  /*
    DIE KARTEN DER AKTE — am Telefon untereinander, am Schreibtisch links
    die Stammdaten, rechts der Zugang (`Aktenspalten`).
  */
  const stammdaten = (
    <Card title="Stammdaten">
      {darfAendern && entwurf ? (
        <StammdatenFormular
          entwurf={entwurf}
          setEntwurf={setEntwurf}
          rollen={ROLES.filter((r) => r !== 'Administrator' || canManageAdmins(user.role))}
          eigenesKonto={eigenesKonto}
          onTag={tagUmschalten}
          geaendert={geaendert}
          speichert={speichert}
          fehler={speicherFehler}
          onSpeichern={() => void speichern()}
          onVerwerfen={() => setEntwurf(alsEntwurf(p))}
        />
      ) : (
        <>
          <StammdatenLesen p={p} />
          <p className="mt-4 border-t border-line pt-3 text-sm text-ink-muted">
            Ein Administrator lässt sich nur von einem Administrator ändern.
          </p>
        </>
      )}
    </Card>
  );
  const zugang = darfAendern ? (
    <Card title="Zugang">
      {/*
        HIER STANDEN SIE IN EINEM ZEILENMENÜ. Passwort-Mail und Sperren
        sind selten und im Fall des Sperrens folgenreich — in der Liste
        gehören sie nicht unter den Daumen, der gerade durchwischt. In der
        Akte ist man bei genau dieser Person und hat es so gemeint.
      */}
      <div className="flex flex-wrap items-center gap-3">
        {/*
          EIN BENUTZERNAME HAT KEIN POSTFACH. Der Knopf für die Mail wäre
          hier ein Versprechen ohne Empfänger — an seiner Stelle vergibt
          das Büro ein neues Startpasswort. Das eigene nicht: das steht
          unter „Mein Konto", mit zweiter Eingabe.
        */}
        {istBenutzerkonto(p.email) ? (
          eigenesKonto ? (
            <span className="text-sm text-ink-muted">
              Das eigene Passwort unter „Mein Konto“ ändern.
            </span>
          ) : (
            <Button
              variant="secondary"
              loading={vergibt}
              onClick={() => setNeuesPasswortFragen(true)}
            >
              Neues Startpasswort vergeben
            </Button>
          )
        ) : (
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await resendPasswordReset(p.email);
                toast.success(`Passwort-Mail an ${p.email} gesendet`);
              } catch (err) {
                toast.error(grundAus(err, 'Die Passwort-Mail konnte nicht gesendet werden.'));
              }
            }}
          >
            Passwort-Mail senden
          </Button>
        )}
        {eigenesKonto ? (
          // Wer sich selbst sperrt, ist ausgesperrt — und niemand sonst
          // muss den Fehler beheben können.
          <span className="text-sm text-ink-muted">
            Das eigene Konto lässt sich nicht sperren.
          </span>
        ) : (
          <Button
            variant={p.active === false ? 'secondary' : 'ghost'}
            onClick={() => setUmschalten(true)}
          >
            {p.active === false ? 'Konto aktivieren' : 'Konto deaktivieren'}
          </Button>
        )}
      </div>
      {vergeben && (
        <div className="mt-4">
          <Hinweiszeile stufe="warn" role="alert">
            <p><b>Neues Startpasswort für {p.name}</b></p>
            <p className="mt-1">
              Bitte persönlich weitergeben — es wird nur jetzt angezeigt. Beim nächsten
              Anmelden vergibt {p.name} ein eigenes.
            </p>
            <p className="mt-2 text-sm text-ink">
              Benutzername:{' '}
              <span className="select-all font-semibold">{kontoAnzeige(p.email)}</span>
            </p>
            <p data-testid="startpasswort" className="mt-2 select-all text-lg font-semibold text-ink-deep">{vergeben}</p>
            <Button variant="ghost" className="mt-2" onClick={() => setVergeben(null)}>
              Verstanden
            </Button>
          </Hinweiszeile>
        </div>
      )}
      <KontoUmstellen
        person={p}
        eigenesKonto={eigenesKonto}
        onUmgestellt={(startpasswort) => {
          // Zuerst das Passwort: die Akte lädt gleich neu, das hier bleibt stehen.
          if (startpasswort) setVergeben(startpasswort);
          setVersuch((v) => v + 1);
        }}
      />
      {/* Bewusst kein Löschen: Zeiteinträge, Bestellungen und Einsätze
          verweisen auf die Kennung und würden verwaisen. */}
      <p className="mt-3 text-sm text-ink-muted">
        Gelöscht wird ein Benutzer nie — seine Buchungen und Scheine hängen
        an ihm. Deaktivieren sperrt die Anmeldung und nimmt ihn aus den
        Auswahllisten.
      </p>
    </Card>
  ) : null;

  /*
    NUR MIT ZEITKONTO: ohne Zeitkonto führt Senklot keinen Resturlaub, und
    eine Anpassung hätte nichts, woran sie wirkt.
  */
  const anspruch = fuehrtZeitkonto(p) ? (
    <UrlaubsanspruchKarte person={p} jahresbeginn={uebertragsRegel(company).jahresbeginn ?? '01-01'} />
  ) : null;

  const auskunft = zeigtAuskunft(user?.role, !!einblick) ? (
    <Datenauskunft
      art="mitarbeiter"
      id={p.uid}
      aktiv={p.active !== false}
      onGeloescht={() => setVersuch((v) => v + 1)}
    />
  ) : null;

  return (
    // Abstände der Designlinie „Fassung 3": 12 px am Telefon, 20 px am Schreibtisch.
    <div className="space-y-3 lg:space-y-5">
      {warnung}
      <PageHeader
        title={p.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link to="/user-mgmt" className="link inline-flex min-h-touch items-center">← Zur Benutzerliste</Link>
            <Marke>{p.role}</Marke>
            {p.active === false && <Marke>inaktiv</Marke>}
          </span>
        }
      />

      <Aktenspalten
        telefon={[stammdaten, zugang, anspruch, auskunft]}
        links={[stammdaten]}
        rechts={[zugang, anspruch, auskunft]}
      />

      <ConfirmDialog
        open={neuesPasswortFragen}
        title="Neues Startpasswort vergeben?"
        confirmLabel="Vergeben"
        message={`Das bisherige Passwort von ${p.name} gilt danach nicht mehr. Bereits angemeldete Geräte bleiben angemeldet — wer ein verlorenes Telefon sperren will, deaktiviert das Konto.`}
        onCancel={() => setNeuesPasswortFragen(false)}
        onConfirm={() => {
          setNeuesPasswortFragen(false);
          void startpasswortVergeben();
        }}
      />

      <ConfirmDialog
        open={umschalten}
        title={p.active === false ? 'Benutzer aktivieren?' : 'Benutzer deaktivieren?'}
        confirmLabel={p.active === false ? 'Aktivieren' : 'Deaktivieren'}
        confirmTone={p.active === false ? 'primary' : 'danger'}
        message={
          p.active === false
            ? `${p.name} kann sich danach wieder anmelden.`
            : `${p.name} kann sich danach nicht mehr anmelden. Alle bisherigen Zeiteinträge bleiben erhalten.`
        }
        onCancel={() => setUmschalten(false)}
        onConfirm={async () => {
          const naechster = p.active === false;
          await updateUserProfile(p.uid, { active: naechster });
          setUmschalten(false);
          setVersuch((v) => v + 1);
          toast.success(naechster ? 'Benutzer aktiviert' : 'Benutzer deaktiviert');
        }}
      />
    </div>
  );
}

/** Die Stammdaten für alle, die sie nicht ändern dürfen. */
function StammdatenLesen({ p }: { p: AppUser }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {istBenutzerkonto(p.email) ? (
        <Angabe wort="Benutzername">{kontoAnzeige(p.email)}</Angabe>
      ) : (
        <Angabe wort="E-Mail"><MailLink adresse={p.email} /></Angabe>
      )}
      <Angabe wort="Rolle">{p.role}</Angabe>
      {mitKundenFreigabe(p.role) && (
        <Angabe wort="Kunden pflegen">{p.kundenPflegen ? 'ja' : 'nein'}</Angabe>
      )}
      {mitLagerFreigaben(p.role) && (
        <>
          <Angabe wort="Katalog einspielen">{p.katalogEinspielen ? 'ja' : 'nein'}</Angabe>
          <Angabe wort="Einkaufspreise sehen">{p.einkaufSehen || p.katalogEinspielen ? 'ja' : 'nein'}</Angabe>
        </>
      )}
      {mitRechnungsFreigabe(p.role) && (
        <Angabe wort="Rechnungen lesen">{p.rechnungenLesen ? 'ja' : 'nein'}</Angabe>
      )}
      {mitZeitkontoWahl(p.role) && (
        <Angabe wort="Zeitkonto">{p.fuehrtZeitkonto ? 'ja' : 'nein'}</Angabe>
      )}
      <Angabe wort="Zustand">
        {p.active === false
          ? <Zustand stand="ruht">inaktiv</Zustand>
          : <Zustand stand="gut">aktiv</Zustand>}
      </Angabe>
      <Angabe wort="Einstufung">
        {p.einstufung ? (
          <span>
            {einstufungText(p, todayStr())}
            {p.einstufung === 'lehrling' && p.lehrbeginn && p.lehrzeitMonate
              ? ` · Lehrbeginn ${fmtDatum(p.lehrbeginn)}, Lehrzeit bis ${fmtDatum(lehrzeitEnde(p.lehrbeginn, p.lehrzeitMonate))}`
              : ''}
            {p.einstufung === 'lehrling' && p.stundenInsBudget === false ? ' · Stunden nicht im Projekt-Budget' : ''}
          </span>
        ) : (
          <span className="text-ink-muted">nicht festgelegt — zählt wie Facharbeiter</span>
        )}
      </Angabe>
      <Angabe wort="Wochenstunden">
        {p.weeklyTargetHours != null ? <span>{p.weeklyTargetHours}</span> : null}
      </Angabe>
      <Angabe wort="Urlaubstage pro Jahr">
        {p.yearlyVacationDays != null ? <span>{p.yearlyVacationDays}</span> : null}
      </Angabe>
      {/* Zwei Daten seit dem 30.09.2026 (M6): wann die Person angefangen hat,
          und ab wann Senklot ihr Zeitkonto rechnet. */}
      <Angabe wort="Eintrittsdatum">{fmtDatum(p.eintritt ?? p.appStartDate)}</Angabe>
      <Angabe wort="Saldo-Startdatum">{fmtDatum(p.appStartDate)}</Angabe>
      <Angabe wort="Start-Saldo (Stunden)">
        {p.initialOvertime != null ? <span>{p.initialOvertime}</span> : null}
      </Angabe>
      <Angabe wort={urlaubsfeldName(p)}>
        {p.initialVacationDays != null ? (
          <span>{p.initialVacationDays}</span>
        ) : (
          // Nicht „0": leer heisst hier voller Jahresanspruch, und der
          // Unterschied entscheidet über jeden Urlaubsantrag.
          <span className="text-ink-muted">nicht angegeben — voller Jahresanspruch</span>
        )}
      </Angabe>
      <Angabe wort="Arbeitstage">{tageText(p.workDays ?? [])}</Angabe>
      {p.tagessoll && Object.keys(p.tagessoll).length > 0 && (
        <Angabe wort="Tagessoll je Wochentag">
          {WEEKDAYS.filter((d) => p.tagessoll?.[String(d.value)] != null)
            .map((d) => `${d.label} ${String(p.tagessoll?.[String(d.value)]).replace('.', ',')} Std.`)
            .join(' · ')}
        </Angabe>
      )}
    </dl>
  );
}

interface FormularProps {
  entwurf: BenutzerEntwurf;
  setEntwurf: (e: BenutzerEntwurf) => void;
  rollen: readonly Role[];
  eigenesKonto: boolean;
  onTag: (d: number) => void;
  geaendert: boolean;
  speichert: boolean;
  fehler: string | null;
  onSpeichern: () => void;
  onVerwerfen: () => void;
}

/** Dieselben Stammdaten, bearbeitbar. */
function StammdatenFormular({
  entwurf, setEntwurf, rollen, eigenesKonto, onTag,
  geaendert, speichert, fehler, onSpeichern, onVerwerfen,
}: FormularProps) {
  const setze = <F extends keyof BenutzerEntwurf>(feld: F, wert: BenutzerEntwurf[F]) =>
    setEntwurf({ ...entwurf, [feld]: wert });

  return (
    <div className="flex flex-col gap-4">
      <FormGrid>
        <InputField
          id="b-name" label="Name" pflicht value={entwurf.name}
          onChange={(e) => setze('name', e.target.value)}
        />
        {/*
          DIE E-MAIL IST DAS ANMELDEKONTO. Sie hier zu ändern hiesse, ein
          zweites Konto anzulegen und das erste stehen zu lassen — sie steht
          deshalb nur da.
        */}
        {istBenutzerkonto(entwurf.email) ? (
          <InputField
            id="b-mail" label="Benutzername" value={kontoAnzeige(entwurf.email)} disabled
            title="Der Benutzername ist das Anmeldekonto und kann hier nicht geändert werden."
            onChange={() => undefined}
          />
        ) : (
          <InputField
            id="b-mail" label="E-Mail" value={entwurf.email} disabled
            title="Die E-Mail-Adresse ist das Anmeldekonto und kann hier nicht geändert werden."
            onChange={() => undefined}
          />
        )}
        <SelectField
          id="b-rolle" label="Rolle" value={entwurf.role}
          onChange={(e) => setze('role', e.target.value as Role)}
        >
          {rollen.map((r) => <option key={r} value={r}>{r}</option>)}
        </SelectField>
        <SelectField
          id="b-status" label="Status" value={entwurf.active ? 'aktiv' : 'inaktiv'}
          disabled={eigenesKonto}
          title={eigenesKonto ? 'Das eigene Konto lässt sich nicht deaktivieren.' : undefined}
          onChange={(e) => setze('active', e.target.value === 'aktiv')}
        >
          <option value="aktiv">Aktiv</option>
          <option value="inaktiv">Deaktiviert</option>
        </SelectField>
      </FormGrid>

      <EinstufungFelder form={entwurf} setForm={setEntwurf} idPrefix="b" />

      {/*
        NUR DORT, WO DER HAKEN ETWAS BEDEUTET. Die Leitung pflegt Kunden
        ohnehin, Monteure nie (siehe `darfKundenPflegen`) — ein Haken, der bei
        ihnen nichts bewirkt, wäre eine Einstellung, die lügt.
      */}
      {mitKundenFreigabe(entwurf.role) && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <CheckboxField
              id="b-kunden"
              label="Darf Kunden anlegen und ändern"
              checked={entwurf.kundenPflegen}
              onChange={(e) => setze('kundenPflegen', e.target.checked)}
            />
          </div>
          <InfoHint about="Kunden anlegen und ändern">
            Kunden anlegen, bearbeiten, löschen und aus einer Datei übernehmen. Baustellen einem
            Kunden zuordnen bleibt bei der Leitung, die Kunden ohnehin pflegen darf.
          </InfoHint>
        </div>
      )}
      {/*
        FREIGABEN STATT NEUER ROLLEN (Testbericht 30.09.2026, M37, M38). Der
        Lagerist ist Verwaltung; die Projektleitung liest auf Wunsch die
        Rechnungen ihrer Baustellen. Die Grenze zieht die Datenbank.
      */}
      {mitLagerFreigaben(entwurf.role) && (
        <div className="space-y-1">
          <CheckboxField
            id="b-katalog"
            label="Darf den Katalog einspielen (DATANORM, mit Einkaufspreisen)"
            checked={entwurf.katalogEinspielen}
            onChange={(e) => setze('katalogEinspielen', e.target.checked)}
          />
          <CheckboxField
            id="b-einkauf"
            label="Darf Einkaufspreise sehen"
            checked={entwurf.einkaufSehen || entwurf.katalogEinspielen}
            disabled={entwurf.katalogEinspielen}
            onChange={(e) => setze('einkaufSehen', e.target.checked)}
          />
        </div>
      )}
      {mitRechnungsFreigabe(entwurf.role) && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <CheckboxField
              id="b-rechnungen"
              label="Darf die Rechnungen seiner Baustellen lesen"
              checked={entwurf.rechnungenLesen}
              onChange={(e) => setze('rechnungenLesen', e.target.checked)}
            />
          </div>
          <InfoHint about="Rechnungen lesen">
            Nur die Rechnungen der Baustellen, in deren Leitung die Person steht — lesen, nicht
            anlegen oder ändern.
          </InfoHint>
        </div>
      )}

      {/*
        DIE ZEITKONTO-FELDER STEHEN OFFEN. Im Anlege-Formular sind sie zu Recht
        eingeklappt — dort stimmen die Vorgaben meistens. Hier sind sie der
        Grund, warum jemand die Akte öffnet.
      */}
      <div className="space-y-4 border-t border-line pt-4">
        <p className="section-label">Zeitkonto</p>
        {/*
          Nur die Geschäftsführung wählt: der angestellte Geschäftsführer hat
          ein Soll, der Inhaber meist nicht. Für alle anderen legt die Rolle
          es fest (siehe `fuehrtZeitkonto`).
        */}
        {mitZeitkontoWahl(entwurf.role) && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <CheckboxField
                id="b-zeitkonto"
                label="Führt ein Zeitkonto"
                checked={entwurf.fuehrtZeitkonto}
                onChange={(e) => setze('fuehrtZeitkonto', e.target.checked)}
              />
            </div>
            <InfoHint about="Zeitkonto der Geschäftsführung">
              Mit Zeitkonto gibt es ein Soll und einen Saldo, die Person steht in der
              Mitarbeiterübersicht, und die Startseite meldet Tage ohne Buchung. Ohne Zeitkonto
              kann sie trotzdem Zeit buchen.
            </InfoHint>
          </div>
        )}
        <FormGrid>
          <ZahlFeld
            id="b-stunden" label="Wochenstunden"
            value={entwurf.weeklyTargetHours}
            // Mit eigenem Tagessoll sind die Wochenstunden dessen Summe (M5).
            disabled={Object.keys(entwurf.tagessoll).length > 0}
            onChange={(t) => setze('weeklyTargetHours', t)}
          />
          <ZahlFeld
            id="b-urlaub" label="Urlaubstage pro Jahr"
            value={entwurf.yearlyVacationDays}
            onChange={(t) => setze('yearlyVacationDays', t)}
          />
          <InputField
            id="b-eintritt" label="Eintrittsdatum (im Betrieb seit)" type="date"
            value={entwurf.eintritt}
            max={entwurf.appStartDate || undefined}
            onChange={(e) => setze('eintritt', e.target.value)}
          />
          <InputField
            id="b-start" label="Saldo-Startdatum (ab hier rechnet das Zeitkonto)" type="date"
            value={entwurf.appStartDate}
            onChange={(e) => setze('appStartDate', e.target.value)}
          />
          <ZahlFeld
            id="b-saldo" label="Start-Saldo (Stunden)" negativ
            value={entwurf.initialOvertime}
            onChange={(t) => setze('initialOvertime', t)}
          />
          {/* Zwei Nachkommastellen wie in der Anlage: der aliquote Anspruch
              eines Neueintritts ist selten ein halber Tag. */}
          <ZahlFeld
            id="b-resturlaub"
            label={`${urlaubsfeldName(entwurf)} (Tage)`}
            placeholder="leer = voller Anspruch"
            value={entwurf.initialVacationDays}
            onChange={(t) => setze('initialVacationDays', t)}
          />
        </FormGrid>

        {/* Zwei Urlaubsfelder nebeneinander brauchen einen Satz dazu — „pro
            Jahr" und „beim Umstieg" sehen sonst aus wie dasselbe. */}
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <span>Warum es zwei Urlaubsfelder gibt</span>
          <InfoHint about="Resturlaub beim Umstieg">
            <p>
              <strong>Urlaubstage pro Jahr</strong> ist der Anspruch laut Vertrag. Danach rechnet
              die App in jedem vollen Jahr.
            </p>
            <p className="mt-2">
              <strong>{urlaubsfeldName(entwurf)}</strong> gilt nur für das Jahr, in dem der Saldo
              startet. Wer im September umsteigt und schon 18 von 25 Tagen genommen hat, trägt
              hier <span>7</span> ein — sonst zeigt die App weiterhin 25, weil
              die Tage davor in keiner Buchung stehen.
            </p>
            <p className="mt-2">
              Leer lassen, wenn der Anspruch am Startdatum unangetastet war.
            </p>
          </InfoHint>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink">Arbeitstage</legend>
          <div className="flex flex-wrap gap-x-4">
            {WEEKDAYS.map((d) => (
              <CheckboxField
                key={d.value}
                id={`b-tag-${d.value}`}
                label={d.label}
                checked={entwurf.workDays.includes(d.value)}
                onChange={() => onTag(d.value)}
              />
            ))}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Bestimmt das Tagessoll: Wochenstunden geteilt durch Arbeitstage.
          </p>
          <TagessollFelder form={entwurf} setForm={setEntwurf} />
        </fieldset>
      </div>

      {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}

      {/*
        DER BALKEN ERSCHEINT ERST BEI EINER ÄNDERUNG — als Aktionsleiste
        (Designlinie „Fassung 3"), wie am Buchungsformular: am Telefon klebt
        sie ÜBER der Reiterleiste statt darauf, am Schreibtisch steht sie
        rechtsbündig unter dem Formular. So ist „Speichern" nach einer
        Änderung weit oben im Formular zu erreichen, ohne ans Ende zu rollen.
      */}
      {geaendert && (
        <Aktionsleiste
          summe={{ name: 'Es gibt ungespeicherte Änderungen.', wert: null }}
          links={
            <Button variant="ghost" onClick={onVerwerfen} disabled={speichert}>
              Verwerfen
            </Button>
          }
          rechts={
            <Button onClick={onSpeichern} loading={speichert}>
              Speichern
            </Button>
          }
        />
      )}
    </div>
  );
}

/**
 * Eine Angabe der Stammdaten.
 *
 * LEER HEISST „NICHT HINTERLEGT", und das steht auch da — sonst sähe eine
 * Akte ohne Startdatum genauso aus wie eine, in der das Feld gar nicht
 * vorgesehen ist.
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
