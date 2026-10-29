import { useEffect, useState, type FormEvent } from 'react';
import { MehrAnzeigen } from '@/components/LotBausteine';
import ProduktMarke from '@/components/ProduktMarke';
import { SeitenHilfeProvider } from '@/components/SeitenHilfe';
import type { ReactNode } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  betriebAnlegenMitAnmeldung, geloeschteBetriebe, plattformBetriebe,
  type GeloeschterBetrieb, type PlattformBetrieb,
} from '@/lib/db/plattform';
import { notzugang, offeneFreigaben, type OffeneFreigabe } from '@/lib/db/support';
import { betriebFehler, kennungVorschlag, WARNUNG_OHNE_MAIL, type NeuerBetrieb } from '@shared/plattform';
import Hinweiszeile from '@/components/Hinweiszeile';
import Button from '@/components/Button';
import Card from '@/components/Card';
import BottomSheet from '@/components/BottomSheet';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { CheckboxField, InputField, SelectField, FormGrid } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { Marke, Warnung } from '@/components/Badge';
import PasswortAendern from '@/features/auth/PasswortAendern';
import ZweiFaktorKarte from '@/features/settings/ZweiFaktorKarte';
import { plattformFehler, type PlattformFehler } from '@/lib/db/fehlerprotokoll';
import FehlerListe from './FehlerListe';
import NotzugangPasswort from './NotzugangPasswort';
import NotzugangZweiFaktor from './NotzugangZweiFaktor';
import BetriebVerwalten from './BetriebVerwalten';
import BasiszinsZentral from './BasiszinsZentral';

/**
 * Die einzige Seite des globalen Administrators.
 *
 * SIE LIEGT AUSSERHALB DER BETRIEBS-APP. Die lokale Bereichswahl ordnet nur
 * Plattformaufgaben und erschließt keine Betriebsnavigation.
 * Das ist nicht Sparsamkeit, sondern die sichtbare Form der Zusage: dieses
 * Konto gehört zu keinem Betrieb und kann in keinen hineinsehen. Es hat kein
 * `users`-Dokument, sein Token trägt keine `companyId`, und daran hängt jede
 * einzelne Leseregel. Warum das so gebaut ist, steht in `shared/plattform.ts`.
 *
 * WAS HIER NICHT STEHT UND NICHT STEHEN WIRD: Zahlen aus den Betrieben, ein
 * Zustand ihrer Nachtläufe, eine Statistik. Jede davon wäre am Ende doch ein
 * Fenster in fremde Betriebe — und dann hätte dieses Konto genau das, was es
 * nicht haben soll.
 *
 * SEIT 30.09.2026 GIBT ES DIE LISTE DER BETRIEBE (Testbericht M43) — mit
 * Name, Kennung, Anlagedatum und den Konten der Leitung, sonst nichts. Ohne
 * sie musste man die Kennung für den Notzugang auswendig wissen. Die Grenze
 * steht in `public.plattform_betriebe`, nicht hier.
 *
 * SEIT 20.09.2026 GIBT ES EINE EINZIGE AUSNAHME, und sie ist keine: die Liste
 * der Betriebe, die GERADE EINBLICK GEWÄHREN. Sie steht nicht hier, weil ein
 * Plattformkonto Betriebe sehen dürfte, sondern weil diese es ihm erlaubt
 * haben — mit Grund und mit Frist. Wer nichts gewährt, steht nicht darin.
 *
 * DER NOTZUGANG IST DIE ZWEITE AUSNAHME UND DIESMAL WIRKLICH EINE. Eine rein
 * einvernehmliche Lösung versagt dort, wofür man sie braucht: wer sich
 * ausgesperrt hat, kann nichts mehr freigeben. Er läuft ohne Zustimmung, aber
 * nicht heimlich — gekennzeichnet, höchstens 24 Stunden, im Protokoll des
 * Betriebs und mit einem Band in seiner App.
 *
 * DIE DRITTE AUSNAHME, SEIT 24.09.2026: DIE FEHLER DER APP. Sie sind kein
 * Fenster in den Betrieb, sondern in die eigene Software — was abstürzt, in
 * welcher Fassung, auf welchem Gerät. Geputzt, ohne Person, ohne Kennungen in
 * der Ansicht. Eine von Hand geschriebene Meldung erscheint nur, wenn ihr
 * Verfasser sie ausdrücklich auch an den Support geschickt hat. Die Grenze
 * steht in `fehlerprotokoll_plattform`, nicht hier.
 */

const datumKurz = (iso: string) => new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const zeitKurz = (iso: string) =>
  new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const LEER: NeuerBetrieb = { name: '', companyId: '', adminEmail: '', adminName: '', anmeldung: 'email', adminBenutzername: '', testbetrieb: false };

interface Angelegt {
  companyId: string;
  name: string;
  passwortLink: string;
  adminEmail: string;
  /** Mit Benutzername (P1): Name und Startpasswort, nur jetzt zu sehen. */
  benutzername?: string;
  startpasswort?: string | null;
  /** Etwas, das beim Anlegen nur halb klappte (etwa der Vermerk „Testbetrieb“). */
  hinweis?: string;
}

export default function PlattformView() {
  const { signOut, einblickStarten } = useAuth();
  const [bereich, setBereich] = useState<PlattformBereich>('betriebe');
  const [betriebSeite, setBetriebSeite] = useState<'liste' | 'neu' | 'angelegt' | 'geloescht'>('liste');
  const [supportSeite, setSupportSeite] = useState<'liste' | 'notzugang' | 'passwort' | 'zweiter-faktor'>('liste');
  const [suche, setSuche] = useState('');
  const [anzahl, setAnzahl] = useState(20);
  const [loeschErgebnis, setLoeschErgebnis] = useState<string | null>(null);
  const [filter, setFilter] = useState<'alle' | 'aktiv' | 'deaktiviert'>('alle');
  const [form, setForm] = useState<NeuerBetrieb>(LEER);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  /*
    Was in DIESER Sitzung angelegt wurde — nicht, was es gibt. Der Unterschied
    ist der ganze Punkt: gelesen wird nichts, gezeigt wird nur, was gerade
    durch die eigenen Hände ging.
  */
  const [angelegt, setAngelegt] = useState<Angelegt[]>([]);
  /** Hat jemand die Kennung selbst getippt? Dann folgt sie dem Namen nicht mehr (G21). */
  const [kennungVonHand, setKennungVonHand] = useState(false);

  /*
    DIE BETRIEBE, OHNE INHALTE (Testbericht 30.09.2026, M43): Name, Kennung,
    Leitungskonten, ob eine davon eine E-Mail hat, ein offener Notzugang.
    Daraus wählt man den Notzugang, statt die Kennung auswendig zu wissen.
  */
  const [betriebe, setBetriebe] = useState<PlattformBetrieb[] | null>(null);
  const [betriebeFehler, setBetriebeFehler] = useState<string | null>(null);
  /** Paket D: welcher Betrieb gerade verwaltet wird (deaktivieren, löschen). */
  const [verwaltet, setVerwaltet] = useState<string | null>(null);
  /** Das Löschprotokoll — gelöschte Betriebe, ohne Inhalte. */
  const [geloescht, setGeloescht] = useState<GeloeschterBetrieb[]>([]);
  async function betriebeLaden() {
    setBetriebeFehler(null);
    try {
      setBetriebe(await plattformBetriebe());
    } catch (e) {
      setBetriebeFehler(e instanceof Error ? e.message : 'Die Liste der Betriebe konnte nicht geladen werden.');
    }
    try {
      setGeloescht(await geloeschteBetriebe());
    } catch {
      setGeloescht([]);
    }
  }
  useEffect(() => {
    void betriebeLaden();
  }, []);

  /* Wer gerade Einblick gewährt. */
  const [offen, setOffen] = useState<OffeneFreigabe[]>([]);
  const [freigabenGeladen, setFreigabenGeladen] = useState(false);
  const [freigabenFehler, setFreigabenFehler] = useState<string | null>(null);
  /**
   * Hat der Betrieb ein aktives Leitungskonto mit Benutzername (N5)? Nur dafür
   * setzt der Notzugang ein Passwort neu. `null`, solange die Liste fehlt —
   * dann bleibt der Knopf weg, statt etwas zu versprechen.
   */
  const betriebZu = (kennung: string) => betriebe?.find((b) => b.kennung === kennung);
  const passwortMoeglich = (kennung: string): boolean | null => {
    const b = betriebZu(kennung);
    return b ? b.leitungskonten - b.leitungMitMail > 0 : null;
  };
  const mitMail = (kennung: string) => betriebZu(kennung)?.leitungMitMail ?? 0;
  const [notForm, setNotForm] = useState({ companyId: '', grund: '', stunden: '4' });
  const [notLaeuft, setNotLaeuft] = useState(false);
  /** Für welchen Betrieb im Notzugang das Passwortformular offen ist (P2). */
  const [passwortFuer, setPasswortFuer] = useState<string | null>(null);
  /** Für welchen Betrieb im Notzugang das Formular zum zweiten Faktor offen ist (Runde 3, H1). */
  const [zweiterFaktorFuer, setZweiterFaktorFuer] = useState<string | null>(null);
  const [notFehler, setNotFehler] = useState<string | null>(null);

  async function freigabenLaden() {
    setFreigabenFehler(null);
    try {
      setOffen(await offeneFreigaben());
    } catch (e) {
      setFreigabenFehler(e instanceof Error ? e.message : 'Die Supportzugänge konnten nicht geladen werden.');
    } finally {
      setFreigabenGeladen(true);
    }
  }

  useEffect(() => {
    void freigabenLaden();
  }, []);

  /* Was in den letzten zwei Wochen in den Betrieben abgestürzt ist. */
  const [fehlerListe, setFehlerListe] = useState<PlattformFehler[] | null>(null);
  const [fehlerFehler, setFehlerFehler] = useState<string | null>(null);
  async function fehlerLaden() {
    setFehlerFehler(null);
    try {
      setFehlerListe(await plattformFehler(14));
    } catch (e) {
      setFehlerFehler(e instanceof Error ? e.message : 'Das Fehlerprotokoll konnte nicht geladen werden.');
    }
  }
  useEffect(() => {
    void fehlerLaden();
  }, []);

  async function notzugangOeffnen(e: FormEvent) {
    e.preventDefault();
    setNotLaeuft(true);
    setNotFehler(null);
    try {
      await notzugang(notForm.companyId.trim(), notForm.grund.trim(), Number(notForm.stunden));
      setNotForm({ companyId: '', grund: '', stunden: '4' });
      await freigabenLaden();
      await betriebeLaden();
      setSupportSeite('liste');
    } catch (err) {
      setNotFehler(err instanceof Error ? err.message : 'Der Notzugang wurde abgewiesen.');
    } finally {
      setNotLaeuft(false);
    }
  }

  /*
    Dieselbe Prüfung wie in der Function, aus derselben Datei. Hier, damit
    niemand ins Leere tippt; dort, weil nur sie zählt — eine Prüfung im
    Browser ist eine Bequemlichkeit und keine Grenze.
  */
  const eingabeFehler = betriebFehler(form);

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    if (eingabeFehler) {
      setFehler(eingabeFehler);
      return;
    }
    setFehler(null);
    setLaeuft(true);
    try {
      const data = await betriebAnlegenMitAnmeldung(form);
      setAngelegt((bisher) => [
        {
          companyId: data.companyId,
          name: form.name.trim(),
          passwortLink: data.passwortLink,
          adminEmail: form.adminEmail.trim().toLowerCase(),
          benutzername: data.benutzername,
          startpasswort: data.startpasswort,
          hinweis: data.hinweis,
        },
        ...bisher,
      ]);
      setForm(LEER);
      setKennungVonHand(false);
      setBetriebSeite('angelegt');
      await betriebeLaden();
    } catch (e) {
      /*
        Die Meldung der Function durchreichen statt sie zu ersetzen: sie sagt,
        WARUM abgelehnt wurde — vergebene Kennung, schon vorhandene Adresse —,
        und genau das braucht der Nächste, der es noch einmal versucht.
      */
      setFehler(e instanceof Error ? e.message : 'Der Betrieb konnte nicht angelegt werden.');
    } finally {
      setLaeuft(false);
    }
  }

  function notzugangWaehlen(kennung: string) {
    setNotForm((alt) => ({ ...alt, companyId: kennung }));
    setBereich('support');
    setSupportSeite('notzugang');
  }

  useEffect(() => {
    if (bereich === 'support' && supportSeite === 'notzugang') document.getElementById('n-grund')?.focus();
  }, [bereich, supportSeite]);

  const sichtbar = (betriebe ?? []).filter((b) => {
    const passt = `${b.name} ${b.kennung}`.toLocaleLowerCase('de-AT').includes(suche.trim().toLocaleLowerCase('de-AT'));
    return passt && (filter === 'alle' || (filter === 'deaktiviert' ? !!b.deaktiviertAm : !b.deaktiviertAm));
  }).sort((a, b) => a.name.localeCompare(b.name, 'de-AT'));

  return (
    <div className="plattform">
      <header className="plattform-markenband">
        <div className="plattform-markeninhalt">
          <ProduktMarke hoehe={34} />
          <span className="plattform-markenkontext">Plattform</span>
          <button type="button" className="plattform-konto" aria-current={bereich === 'konto' ? 'page' : undefined} onClick={() => setBereich('konto')}>Mein Konto</button>
        </div>
      </header>
      <div className="plattform-seite">
        <nav className="plattform-navigation" aria-label="Bereiche der Plattform">
          {BEREICHE.map(([wert, name]) => (
            <button key={wert} type="button" aria-current={bereich === wert ? 'page' : undefined} onClick={() => setBereich(wert)}>{name}</button>
          ))}
        </nav>
        <main>
          <Bereich offen={bereich === 'betriebe'}>
            <PageHeader zeichnung={betriebSeite === 'liste' ? 'betrieb' : undefined} ort="Globaler Administrator" title={betriebSeite === 'neu' ? 'Betrieb anlegen' : betriebSeite === 'angelegt' ? 'Betrieb angelegt' : betriebSeite === 'geloescht' ? 'Löschprotokoll' : 'Betriebe'}
              subtitle={betriebSeite === 'liste' ? 'Einrichten und verwalten – ohne Einblick in Betriebsinhalte.' : betriebSeite === 'neu' ? 'Betrieb und ersten Administrator gemeinsam einrichten.' : betriebSeite === 'geloescht' ? 'Gelöschte Betriebe und dauerhaft gesperrte Kennungen.' : 'Den ersten Zugang jetzt an den Administrator weitergeben.'}
              hilfe="Dieses Konto gehört zu keinem Betrieb und sieht in keinen hinein. Betriebsinhalte bleiben nur über eine gültige Supportfreigabe oder einen protokollierten Notzugang erreichbar."
              action={betriebSeite === 'liste' ? <Button onClick={() => setBetriebSeite('neu')}>Betrieb anlegen</Button> : undefined} />
            <div hidden={betriebSeite !== 'liste'} className="plattform-teilseite">
              {loeschErgebnis && <div className="plattform-ergebnis"><p role="status">{loeschErgebnis}</p><Button variant="ghost" onClick={() => setLoeschErgebnis(null)} aria-label="Löschmeldung schließen">Schließen</Button></div>}
              <div className="plattform-spalten">
                <div>
                  <div className="plattform-werkzeuge">
                    <div className="plattform-suche"><InputField id="plattform-suche" type="search" label="Betrieb suchen" placeholder="Name oder Kennung" value={suche} onChange={(e) => { setSuche(e.target.value); setFilter('alle'); setAnzahl(20); }} /></div>
                    <div className="plattform-filter" aria-label="Betriebe filtern">
                      {(['alle', 'aktiv', 'deaktiviert'] as const).map((wert) => <button key={wert} type="button" aria-pressed={filter === wert} onClick={() => { setFilter(wert); setAnzahl(20); }}>{wert === 'alle' ? 'Alle' : wert === 'aktiv' ? 'Aktiv' : 'Deaktiviert'}</button>)}
                    </div>
                  </div>
                  <Card className="plattform-betriebsliste" title={`Betriebe (${sichtbar.length}${betriebe && sichtbar.length !== betriebe.length ? ` von ${betriebe.length}` : ''})`} hint="Name, Kennung und die Konten der Leitung — ohne Einblick in Inhalte. Hat keine Leitung eine E-Mail, gibt es für den Betrieb kein „Passwort vergessen“; dann hilft im Ernstfall nur der Notzugang." buendig>
                    {betriebeFehler ? <ErrorState message={betriebeFehler} onRetry={() => void betriebeLaden()} /> : !betriebe ? <p className="leer">Wird geladen …</p> : betriebe.length === 0 ? <p className="leer">Noch kein Betrieb angelegt.</p> : sichtbar.length === 0 ? <p className="leer">Kein Betrieb passt zur Auswahl. Suche oder Filter ändern.</p> : (
                      <List>
                        {sichtbar.slice(0, anzahl).map((b) => (
                          <ListRow key={b.kennung} onOeffnen={() => setVerwaltet(b.kennung)}
                            title={<span>{b.name} <span className="plattform-kennung">({b.kennung})</span></span>}
                            subtitle={<>
                              angelegt am {datumKurz(b.angelegtAm)} · {b.leitungskonten} {b.leitungskonten === 1 ? 'Leitungskonto' : 'Leitungskonten'}{b.leitungskonten > 0 && `, ${b.leitungMitMail} mit E-Mail`}
                              <span className="plattform-zustaende">
                                {b.testbetrieb && <Marke>Testbetrieb</Marke>}
                                {b.deaktiviertAm && <Warnung>deaktiviert</Warnung>}
                                {b.loeschungGeplantFuer && <Warnung>Löschung ab {zeitKurz(b.loeschungGeplantFuer)}</Warnung>}
                                {!b.deaktiviertAm && b.leitungMitMail === 0 && <Warnung>keine Leitung mit E-Mail</Warnung>}
                                {b.notzugangBis && <Warnung>Notzugang bis {zeitKurz(b.notzugangBis)}</Warnung>}
                              </span>
                            </>}>
                            <Button className="plattform-verwalten" variant="ghost" groesse="klein" aria-expanded={verwaltet === b.kennung} onClick={() => setVerwaltet(b.kennung)} aria-label={`${b.name} verwalten`}><span className="plattform-verwalten-text">Verwalten</span><span className="plattform-zeilenpfeil" aria-hidden="true">›</span></Button>
                            <Button className="plattform-notzugang" variant="secondary" groesse="klein" onClick={() => notzugangWaehlen(b.kennung)} aria-label={`${b.name} für den Notzugang wählen`}>Notzugang</Button>
                          </ListRow>
                        ))}
                      </List>
                    )}
                  </Card>
                  <MehrAnzeigen anzahl={Math.max(0, sichtbar.length - anzahl)} onClick={() => setAnzahl((alt) => alt + 20)} />
                  {geloescht.length > 0 && <Button variant="ghost" onClick={() => setBetriebSeite('geloescht')}>Löschprotokoll ({geloescht.length})</Button>}
                  {angelegt.length > 0 && <Button variant="ghost" onClick={() => setBetriebSeite('angelegt')}>In dieser Sitzung angelegt ({angelegt.length})</Button>}
                </div>
                <aside className="plattform-kontext" aria-label="Freigegebener Einblick">
                  <h2>Freigegebener Einblick</h2>
                  {!freigabenGeladen ? <p>Supportzugänge werden geladen …</p> : freigabenFehler ? <ErrorState message={freigabenFehler} onRetry={() => void freigabenLaden()} /> : offen.length === 0 ? <p>Kein Betrieb gewährt gerade Einblick.</p> : offen.slice(0, 2).map((f) => (
                    <div key={f.id} className="plattform-kontextzeile">
                      <h3>{f.name}</h3>
                      <p>{f.notzugang ? <Warnung>Notzugang</Warnung> : f.stufe === 'mitarbeiten' ? <Warnung>Mitarbeiten</Warnung> : <Marke>Ansehen</Marke>}</p>
                      <p>{f.grund}</p><p>Bis {zeitKurz(f.gilt_bis)}</p>
                      <Button variant="ghost" onClick={() => { setBereich('support'); setSupportSeite('liste'); }}>Zugang ansehen</Button>
                    </div>
                  ))}
                  <Button variant="ghost" onClick={() => { setBereich('support'); setSupportSeite('liste'); }}>Alle Supportzugänge ({offen.length})</Button>
                  <Button variant="ghost" onClick={() => { setBereich('support'); setSupportSeite('notzugang'); }}>Notzugang öffnen</Button>
                </aside>
              </div>
            </div>
            <div hidden={betriebSeite !== 'neu'} className="plattform-teilseite">
              <Button variant="ghost" onClick={() => setBetriebSeite('liste')}>Zu den Betrieben</Button>
              <div className="plattform-spalten">
                <div>
      <Card
        title="Betrieb"
        hint={
          <>
            <strong>Die Kennung lässt sich nachträglich nicht ändern.</strong> Sie steht als Feld
            in jedem einzelnen Datensatz des Betriebs und wird zur Adresse seines Firmendokuments.
            Kleinbuchstaben, Ziffern und Bindestriche.
            <br />
            <br />
            <strong>Der erste Administrator braucht eine eigene Adresse.</strong> Ein Konto gehört
            zu genau einem Betrieb: die Berechtigungen hängen an der Anmeldekennung, nicht am
            Betrieb. Wäre dieselbe Person in zwei Betrieben, entschiede allein die Reihenfolge der
            Änderungen, in welchem sie landet.
          </>
        }
      >
        {/* Formular der Linie: höchstens 560 px (Regel 9). */}
        <form onSubmit={anlegen} className="formular space-y-4">
          <FormGrid cols={1}>
            <InputField
              id="b-name"
              label="Name des Betriebs"
              placeholder="Name des Betriebs"
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                  // Vorschlag aus dem Namen, solange niemand die Kennung selbst getippt hat (G21).
                  companyId: kennungVonHand ? form.companyId : kennungVorschlag(e.target.value),
                })
              }
              required
              pflicht
            />
            <InputField
              id="b-kennung"
              label="Kennung"
              placeholder="z. B. mustermann"
              value={form.companyId}
              onChange={(e) => {
                setKennungVonHand(e.target.value !== '');
                setForm({ ...form, companyId: e.target.value });
              }}
              required
              pflicht
            />
          <CheckboxField
            id="b-testbetrieb"
            label="Testbetrieb (lässt sich später ohne Übergabe und ohne Frist löschen)"
            checked={form.testbetrieb === true}
            onChange={(e) => setForm({ ...form, testbetrieb: e.target.checked })}
          />
<h3 className="plattform-formulartitel">Erster Zugang</h3>
            <InputField
              id="b-adminname"
              label="Erster Administrator"
              placeholder="Vor- und Nachname"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              required
              pflicht
            />
            <SelectField
              id="b-anmeldung"
              label="Anmeldung mit"
              value={form.anmeldung ?? 'email'}
              onChange={(e) => setForm({ ...form, anmeldung: e.target.value as 'email' | 'benutzername' })}
            >
              <option value="email">E-Mail</option>
              <option value="benutzername">Benutzername</option>
            </SelectField>
            {form.anmeldung === 'benutzername' ? (
              <InputField
                id="b-adminname-login"
                label="Benutzername"
                placeholder="z. B. petra.perl"
                autoComplete="off"
                value={form.adminBenutzername ?? ''}
                onChange={(e) => setForm({ ...form, adminBenutzername: e.target.value })}
                required
                pflicht
              />
            ) : (
              <InputField
                id="b-adminmail"
                label="Dessen E-Mail"
                type="email"
                placeholder="name@betrieb.at"
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                required
                pflicht
              />
            )}
          </FormGrid>

          {/* P1: ohne E-Mail gibt es kein „Passwort vergessen“ — das steht da, bevor angelegt wird. */}
          {form.anmeldung === 'benutzername' && (
            <Hinweiszeile stufe="warn">
              <p>{WARNUNG_OHNE_MAIL}</p>
            </Hinweiszeile>
          )}

          {fehler && <ErrorState message={fehler} />}

          {/*
            Der Grund für die gesperrte Schaltfläche steht daneben, nicht
            erst nach dem Drücken. Ein Knopf, der nicht geht und nicht sagt
            warum, ist die unangenehmste Form einer Fehlermeldung.
          */}
          {/*
            Vor der ersten Eingabe kein Fehler, sondern die Anleitung: „Der
            Betrieb braucht einen Namen." über einer leeren Maske las sich
            wie eine Rüge für etwas, das noch niemand versucht hat (D19).
          */}
          {eingabeFehler && !fehler && (
            <p className="text-sm text-ink-muted">
              {[form.name, form.companyId, form.adminName, form.adminEmail, form.adminBenutzername].some((v) => String(v ?? '').trim() !== '')
                ? eingabeFehler
                : 'Alle Felder ausfüllen — dann lässt sich der Betrieb anlegen.'}
            </p>
          )}

          <Button type="submit" variant="primary" loading={laeuft} disabled={!!eingabeFehler}>
            Betrieb anlegen
          </Button>
        </form>
      </Card>
                </div>
                <aside className="plattform-kontext" aria-label="Nach dem Anlegen"><h2>Nach dem Anlegen</h2><p>Link oder Benutzername und Startpasswort an den ersten Administrator weitergeben.</p><p>Der Zugang wird nicht automatisch versendet und ist nur in dieser Sitzung sichtbar.</p></aside>
              </div>
            </div>
            <div hidden={betriebSeite !== 'angelegt'} className="plattform-teilseite">
              <Button variant="ghost" onClick={() => setBetriebSeite('liste')}>Zu den Betrieben</Button>
{angelegt.length > 0 && (
      <Card title={`In dieser Sitzung angelegt (${angelegt.length})`}>
          {/*
            DER RÜCKSETZLINK STEHT NUR HIER UND NUR JETZT.

            Er wird nicht gespeichert und nicht versendet — der Betrieb
            versendet seine Post selbst, und eine Mailanbindung wäre ein
            weiterer Dienst mit einem weiteren Auftragsverarbeitungsvertrag.
            Wer die Seite verlässt, muss den nächsten Zugang über
            „Passwort vergessen?" freischalten lassen. Das steht auch da.
          */}
          <ul className="space-y-4">
            {angelegt.map((b) => (
              <li key={b.companyId} className="border-t border-line pt-3 first:border-0 first:pt-0">
                <p className="font-semibold text-ink">
                  {b.name} <span className="text-ink-muted">({b.companyId})</span>
                </p>
                {b.hinweis && <p className="mt-1 text-sm text-warning">{b.hinweis}</p>}
                {b.startpasswort ? (
                  <>
                    <p className="mt-1 text-sm text-ink-muted">
                      Erster Administrator: Benutzername <strong className="text-ink">{b.benutzername}</strong>
                    </p>
                    <p className="mt-2 text-sm">
                      Startpasswort: <span className="font-mono text-base text-ink">{b.startpasswort}</span>
                    </p>
                    <p className="mt-1 text-xs text-warning">
                      Benutzername und Startpasswort an den Administrator weitergeben. Beim ersten
                      Anmelden vergibt er ein eigenes. Das Startpasswort steht nur jetzt hier.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-ink-muted">
                      Erster Administrator: {b.adminEmail}
                    </p>
                    <p className="mt-2 break-all text-sm">
                      <a href={b.passwortLink} className="link">
                        {b.passwortLink}
                      </a>
                    </p>
                    <p className="mt-1 text-xs text-warning">
                      Diesen Link an den Administrator weitergeben — er setzt damit sein Passwort. Er
                      steht nur jetzt hier; danach hilft nur noch „Passwort vergessen?“.
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
)}
              <Button onClick={() => setBetriebSeite('neu')}>Weiteren Betrieb anlegen</Button>
            </div>
            <div hidden={betriebSeite !== 'geloescht'} className="plattform-teilseite">
              <Button variant="ghost" onClick={() => setBetriebSeite('liste')}>Zu den Betrieben</Button>
              <Card title="Gelöschte Betriebe" hint="Das Löschprotokoll enthält keine Inhalte. Diese Kennungen werden nie wieder vergeben." buendig>
                <List>{geloescht.map((g) => <ListRow key={g.kennung} title={<span>{g.name} <span className="nr font-normal text-ink-muted">({g.kennung})</span></span>} subtitle={`gelöscht am ${datumKurz(g.geloeschtAm)}${g.testbetrieb ? ' · Testbetrieb' : ''}`} />)}</List>
              </Card>
            </div>
          </Bereich>
          <Bereich offen={bereich === 'support'}>
            <PageHeader zeichnung={supportSeite === 'liste' ? 'betrieb' : undefined} ort="Globaler Administrator" title={supportSeite === 'notzugang' ? 'Notzugang öffnen' : supportSeite === 'passwort' ? 'Passwort neu setzen' : supportSeite === 'zweiter-faktor' ? 'Zwei-Faktor zurücksetzen' : 'Supportzugänge'}
              subtitle="Nur ausdrücklich freigegebene oder protokollierte Zugänge."
              hilfe="Ansehen ist lesend; Mitarbeiten erlaubt die ausdrücklich freigegebenen Änderungen. Notzugänge sind lesend, höchstens 24 Stunden gültig, im Betrieb sichtbar und protokolliert."
              action={supportSeite === 'liste' ? <Button variant="secondary" onClick={() => setSupportSeite('notzugang')}>Notzugang öffnen</Button> : undefined} />
            <div hidden={supportSeite !== 'liste'} className="plattform-teilseite">
              <div className="plattform-spalten"><div>
      <Card
        title={`Aktuelle Zugänge (${offen.length})`}
        hint="„Ansehen“ ist lesend; „Mitarbeiten“ erlaubt die ausdrücklich freigegebenen Änderungen. Zeitbuchungen, Urlaube und Fotos von Baustellen bleiben auch damit verschlossen — dort stehen Kranken- und Urlaubstage von Mitarbeitern und Aufnahmen aus Kundenwohnungen. Jeder geöffnete Bereich steht im Protokoll des Betriebs."
      >
        {!freigabenGeladen && <p className="text-sm text-ink-muted">Supportzugänge werden geladen …</p>}
        {freigabenFehler && <ErrorState message={freigabenFehler} onRetry={() => void freigabenLaden()} />}
        {offen.length === 0 && freigabenGeladen && !freigabenFehler ? (
          <p className="text-sm text-ink-muted">
            Kein Betrieb gewährt gerade Einblick. Gewähren kann ihn nur er selbst, unter
            Einstellungen → Supportzugang.
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {offen.map((f) => (
              <li key={f.id} className="plattform-supportzeile">
                <div className="plattform-supportinfo">
                  <h3>{f.name}</h3>
                  <div className="plattform-supportstufen">
                    {f.notzugang && <Warnung>Notzugang</Warnung>}
                    {f.stufe === 'mitarbeiten' ? <Warnung>Mitarbeiten</Warnung> : <Marke>Ansehen</Marke>}
                  </div>
                  <p>{f.grund}</p>
                  <p className="text-ink-muted">bis {zeitKurz(f.gilt_bis)}</p>
                </div>
                <Button variant="secondary" onClick={() => einblickStarten(f)}>Öffnen</Button>
                {f.notzugang && passwortMoeglich(f.company_id) === false && (
                  <p className="plattform-supporthinweis">
                    Kein aktives Leitungskonto mit Benutzername — Passwort neu setzen geht hier nicht.
                    {mitMail(f.company_id) > 0 && ' Mit E-Mail hilft „Passwort vergessen“ auf der Anmeldeseite.'}
                  </p>
                )}
                {f.notzugang && (
                  <div className="plattform-supportaktionen">
                    {passwortMoeglich(f.company_id) && <Button variant="ghost" onClick={() => { setPasswortFuer(f.company_id); setSupportSeite('passwort'); }}>Passwort neu setzen</Button>}
                    <Button variant="ghost" onClick={() => { setZweiterFaktorFuer(f.company_id); setSupportSeite('zweiter-faktor'); }}>Zwei-Faktor zurücksetzen</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
              </div><aside className="plattform-kontext" aria-label="Berechtigungen"><h2>Berechtigung ist sichtbar</h2><h3>Ansehen</h3><p>Lesender Einblick in die freigegebenen Bereiche.</p><h3>Mitarbeiten</h3><p>Änderungen nur im ausdrücklich freigegebenen Umfang.</p><h3>Notzugang</h3><p>Lesend, höchstens 24 Stunden. Wiederherstellung separat.</p></aside></div>
            </div>
            <div hidden={supportSeite !== 'notzugang'} className="plattform-teilseite">
              <Button variant="ghost" onClick={() => setSupportSeite('liste')}>Zu den Supportzugängen</Button>
              <div className="plattform-spalten"><div>
      <Card
        title="Notzugang"
        className="plattform-formulargruppe"
        hint={
          <>
            <strong>Nur, wenn der Betrieb selbst nicht mehr freigeben kann</strong> — etwa weil
            er sich ausgesperrt hat. Er ist als Notzugang gekennzeichnet, gilt höchstens 24
            Stunden, steht im Protokoll des Betriebs und erzeugt dort dasselbe Band in der App
            wie jede andere Freigabe. Der Betrieb kann ihn jederzeit beenden. Lesen ja,
            schreiben nein — wie bei jedem Supportzugang.
          </>
        }
      >
        <form onSubmit={notzugangOeffnen} className="formular space-y-4">
          <FormGrid cols={1}>
            {betriebe && betriebe.length > 0 ? (
              <SelectField
                id="n-kennung"
                label="Betrieb"
                value={notForm.companyId}
                onChange={(e) => setNotForm({ ...notForm, companyId: e.target.value })}
                required
                pflicht
              >
                <option value="">— wählen —</option>
                {betriebe.map((b) => (
                  <option key={b.kennung} value={b.kennung}>
                    {b.name} ({b.kennung})
                  </option>
                ))}
              </SelectField>
            ) : (
              <InputField
                id="n-kennung"
                label="Kennung des Betriebs"
                placeholder="z. B. mustermann"
                value={notForm.companyId}
                onChange={(e) => setNotForm({ ...notForm, companyId: e.target.value })}
                required
                pflicht
              />
            )}
            <InputField
              id="n-stunden"
              label="Stunden (1–24)"
              type="number"
              min="1"
              max="24"
              value={notForm.stunden}
              onChange={(e) => setNotForm({ ...notForm, stunden: e.target.value })}
              required
              pflicht
            />
          </FormGrid>
          <InputField
            id="n-grund"
            label="Grund"
            placeholder="z. B. Betrieb ausgesperrt"
            value={notForm.grund}
            onChange={(e) => setNotForm({ ...notForm, grund: e.target.value })}
            required
            pflicht
          />
          {notFehler && <ErrorState message={notFehler} />}
          <Button
            type="submit"
            loading={notLaeuft}
            disabled={notForm.companyId.trim() === '' || notForm.grund.trim() === ''}
          >
            Notzugang öffnen
          </Button>
        </form>
      </Card>
              </div><aside className="plattform-kontext" aria-label="Notzugang"><h2>{betriebZu(notForm.companyId)?.name ?? 'Notzugang'}</h2><p>Lesender Zugang, sichtbar und protokolliert. Der Betrieb kann ihn jederzeit beenden.</p><p>Passwort und zweiten Faktor erst über einen aktiven Notzugang wiederherstellen.</p></aside></div>
            </div>
            <div hidden={supportSeite !== 'passwort'} className="plattform-teilseite">
              <Button variant="ghost" onClick={() => setSupportSeite('liste')}>Zu den Supportzugängen</Button>
              {passwortFuer && offen.some((f) => f.company_id === passwortFuer && f.notzugang) && <NotzugangPasswort key={passwortFuer} kennung={passwortFuer} name={betriebZu(passwortFuer)?.name ?? passwortFuer} />}
            </div>
            <div hidden={supportSeite !== 'zweiter-faktor'} className="plattform-teilseite">
              <Button variant="ghost" onClick={() => setSupportSeite('liste')}>Zu den Supportzugängen</Button>
              {zweiterFaktorFuer && offen.some((f) => f.company_id === zweiterFaktorFuer && f.notzugang) && <NotzugangZweiFaktor key={zweiterFaktorFuer} kennung={zweiterFaktorFuer} name={betriebZu(zweiterFaktorFuer)?.name ?? zweiterFaktorFuer} />}
            </div>
          </Bereich>
          <Bereich offen={bereich === 'fehler'}>
            <PageHeader zeichnung="betrieb" ort="Globaler Administrator" title="Fehlerprotokoll" subtitle="Meldungen und technische Vorfälle der letzten 14 Tage." hilfe="Nur ausdrücklich an den Support gesendete Meldungen. Technische Vorfälle werden nach Art und Meldung gruppiert; der bestehende Zeitraum von 14 Tagen bleibt erhalten." />
      <section aria-label="Fehler aus den Betrieben" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="titel-karte">Fehler aus den Betrieben (14 Tage)</h2>
          <Button variant="secondary" onClick={() => void fehlerLaden()}>
            Neu laden
          </Button>
        </div>
        {fehlerFehler && <ErrorState message={fehlerFehler} onRetry={() => void fehlerLaden()} />}
        {!fehlerListe && !fehlerFehler && <p className="text-sm text-ink-muted">Fehlerprotokoll wird geladen …</p>}
        {fehlerListe && <FehlerListe zeilen={fehlerListe} />}
      </section>
          </Bereich>
          <Bereich offen={bereich === 'basiszins'}>
            <PageHeader zeichnung="betrieb" ort="Globaler Administrator" title="Basiszinssatz" subtitle="Zentral je Halbjahr – für alle Betriebe." />
            <div className="plattform-spalten"><div><BasiszinsZentral /></div><aside className="plattform-kontext"><h2>Vorrang des zentralen Satzes</h2><h3>Zentral hinterlegt</h3><p>Gilt für dieses Halbjahr in allen Betrieben.</p><h3>Zentral nicht hinterlegt</h3><p>Der Eintrag des jeweiligen Betriebs bleibt der Rückfall.</p></aside></div>
          </Bereich>
          <Bereich offen={bereich === 'konto'}>
            <PageHeader zeichnung="betrieb" ort="Globaler Administrator" title="Mein Konto" subtitle="Passwort und Zwei-Faktor-Anmeldung des Plattformkontos." />
            <div className="plattform-spalten"><div><PasswortAendern /><ZweiFaktorKarte /><Card title="Sitzung"><div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => void signOut()}>Abmelden</Button><Button variant="ghost" onClick={() => void signOut(true)}>Auf allen Geräten abmelden</Button></div></Card></div><aside className="plattform-kontext"><h2>Plattformkonto</h2><h3>Rolle</h3><p>Globaler Administrator</p><h3>Betriebszuordnung</h3><p>Keine</p><h3>Zwei-Faktor-Anmeldung</h3><p>Verpflichtend</p></aside></div>
          </Bereich>
        </main>
        <div className="plattform-verwaltungsfenster">
      {(() => {
        const b = betriebe?.find((x) => x.kennung === verwaltet);
        return (
          <BottomSheet
            open={!!b}
            onClose={() => setVerwaltet(null)}
            label={b ? `${b.name} verwalten` : 'Betrieb verwalten'}
            auchBreit
            breit
            titel={b ? b.name : ''}
          >
            {b && <BetriebVerwalten betrieb={b} onGeloescht={(text) => setLoeschErgebnis(`${b.name}: ${text}`)} geaendert={async () => { await Promise.all([betriebeLaden(), freigabenLaden()]); }} notzugangOeffnen={() => { setVerwaltet(null); notzugangWaehlen(b.kennung); }} />}
          </BottomSheet>
        );
      })()}
        </div>
      </div>
    </div>
  );
}

type PlattformBereich = 'betriebe' | 'support' | 'fehler' | 'basiszins' | 'konto';
const BEREICHE = [['betriebe', 'Betriebe'], ['support', 'Supportzugänge'], ['fehler', 'Fehlerprotokoll'], ['basiszins', 'Basiszinssatz']] as const;

function Bereich({ offen, children }: { offen: boolean; children: ReactNode }) {
  // Bereichswechsel erhalten Entwürfe und einmalige Zugangsdaten; jede Hilfe bleibt lokal.
  return <section hidden={!offen} className="plattform-bereich"><SeitenHilfeProvider>{children}</SeitenHilfeProvider></section>;
}
