import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { kontoAnzeige } from '@shared/benutzername';
import {
  navGroupsForRole, OHNE_UEBERSCHRIFT, tabBarForRole, hinweisZahl, hinweisSumme, hinweisWort, zusatzrechte, type NavItem,
} from './navigation';
import Seitenposition from './Seitenposition';
import FehlerInsBlickfeld from './FehlerInsBlickfeld';
import { useOffenePosten, postenNeuLaden } from './offenePosten';
import type { OffenePosten } from '@/lib/db/offenePosten';
import { Zaehler } from '@/components/Badge';
import Button from '@/components/Button';
import { FASSUNG } from '@/lib/fassung';
import Icon from '@/components/Icon';
import Avatar from '@/components/Avatar';
import BrandLogo from '@/components/BrandLogo';
import ProduktMarke from '@/components/ProduktMarke';
import Verbindungsband from '@/components/Verbindungsband';
import Supportband from '@/components/Supportband';
import Supportsitzung from '@/components/Supportsitzung';
import BottomSheet from '@/components/BottomSheet';
import AppErneuern from '@/components/AppErneuern';
import ProblemMelden from '@/components/ProblemMelden';
import RechtLinks from '@/components/RechtLinks';
import { SeitenHilfeProvider } from '@/components/SeitenHilfe';
import { useDarstellung } from '@/lib/darstellung';
import Suchfenster from './Suchfenster';
import ConfirmDialog from '@/components/ConfirmDialog';
import { offeneVormerkungen } from '@/lib/db/pg/ohneEmpfang';
import { rolleAnzeige } from '@/lib/rolleAnzeige';

/**
 * Die Einträge der Linie „Lot“: in der dunklen Navigation `navi-punkt`, in
 * den hellen Blättern (Mehr, Profil) `mehr-punkt`. Der aktive Eintrag trägt
 * Fläche UND Halbfett — Farbe allein trägt nie eine Information.
 */
const naviPunkt = ({ isActive }: { isActive: boolean }) => (isActive ? 'navi-punkt-aktiv' : 'navi-punkt');
const mehrPunkt = ({ isActive }: { isActive: boolean }) => (isActive ? 'mehr-punkt-aktiv' : 'mehr-punkt');

/**
 * Das Abzeichen an einer Menuezeile — rechtsbuendig, oder gar nicht.
 *
 * `ml-auto` STEHT HIER UND NICHT IM `Zaehler`: die Zahl haengt am Telefon
 * auch in der Ecke eines Symbols, und dort waere ein automatischer
 * Aussenabstand falsch. Die Zeile weiss, wo sie ihr Abzeichen hinhaengt; das
 * Abzeichen weiss, wie es aussieht.
 */
function ZeilenHinweis(
  { item, posten, auf }: { item: NavItem; posten?: OffenePosten; auf: 'hell' | 'dunkel' },
) {
  /*
    OB DIE ZAHL GROSS GENUG IST, ENTSCHEIDET DER `Zaehler` UND NICHT DIESE
    ZEILE. Hier stand kurz zusaetzlich `n < 1` — und damit war die Regel „null
    ist kein Abzeichen" an vier Stellen geschrieben. Nachgemessen: eine
    Mutation, die den `Zaehler` bei null zeichnen liess, fiel dadurch nur in
    EINER Pruefung auf, weil die Huelle sie vorher abfing. Vier Waechter fuer
    eine Regel heisst, dass drei davon nie gepruefte Behauptungen sind.

    Bleibt die Frage, die WIRKLICH hierher gehoert: haengt an diesem Eintrag
    ueberhaupt eine Zahl?
  */
  if (!item.hinweis) return null;
  const n = hinweisZahl(item, posten);
  return (
    <span className={auf === 'dunkel' ? 'navi-zahl' : 'ml-auto flex items-center'}>
      <Zaehler anzahl={n} was={hinweisWort(item.hinweis, n)} auf={auf} />
    </span>
  );
}

/** App-Shell: Desktop-Sidebar; mobil Top-Bar + Icon-Tab-Bar (4 + „Mehr"-Drawer). */
export default function Layout({ children }: { children: ReactNode }) {
  const { user, company, signOut, einblick } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [profilOpen, setProfilOpen] = useState(false);
  const [sucheOffen, setSucheOffen] = useState(false);
  const [darstellung, setDarstellung] = useDarstellung();
  const ort = useLocation();
  const posten = useOffenePosten();
  const angemeldet = !!user;
  /** Wie viele eigene Buchungen noch im Fach liegen, wenn abgemeldet werden soll. */
  const [ungesendet, setUngesendet] = useState(0);
  const reiterleiste = useRef<HTMLElement>(null);
  const inhalt = useRef<HTMLElement>(null);
  const ersterPfad = useRef(ort.pathname);

  /*
    NACH EINEM SEITENWECHSEL STEHT DER FOKUS AM NEUEN INHALT (offene Punkte
    C6). Sonst blieb er am angetippten Menüpunkt, und wer mit Tastatur oder
    Vorlesehilfe arbeitet, musste sich durch die ganze Navigation zurück
    zum Inhalt tasten. Nicht beim ersten Laden (da gehört der Fokus dem
    Browser), und nicht, wenn die neue Seite selbst schon ein Feld im
    Inhalt fokussiert hat — das hat Vorrang.
  */
  useEffect(() => {
    if (ort.pathname === ersterPfad.current) return;
    ersterPfad.current = '';
    const main = inhalt.current;
    if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
  }, [ort.pathname]);

  /*
    DIE HÖHE DER REITERLEISTE ALS CSS-VARIABLE (`--reiter-hoehe` am `body`).

    Die feste Aktionsleiste der Formulare (`.aktionsleiste`, Designlinie
    „Fassung 3") klebt am Telefon ÜBER der Reiterleiste. Deren Höhe ist
    keine Konstante: die untere Sicherheitszone des iPhones kommt dazu, und
    ab dem Tablet ist die Leiste ganz ausgeblendet (dann 0). Gemessen statt
    geschätzt, und bei jeder Änderung nachgeführt.
  */
  useEffect(() => {
    const leiste = reiterleiste.current;
    if (!angemeldet || !leiste) return;
    const setzen = () =>
      document.body.style.setProperty('--reiter-hoehe', `${leiste.offsetHeight}px`);
    setzen();
    const beobachter = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(setzen);
    beobachter?.observe(leiste);
    window.addEventListener('resize', setzen);
    return () => {
      beobachter?.disconnect();
      window.removeEventListener('resize', setzen);
      document.body.style.removeProperty('--reiter-hoehe');
    };
  }, [angemeldet]);

  /*
    ABMELDEN MIT UNGESENDETEN BUCHUNGEN (Prüflauf 25.09.2026, P1-05).

    Was ohne Empfang vorgemerkt wurde, geht nur mit der Sitzung seines
    Besitzers hinaus. Nach dem Abmelden bleibt es auf dem Gerät liegen, bis
    er sich HIER wieder anmeldet — auf dem Baustellen-Tablet, auf dem sich
    gleich der Kollege anmeldet, womöglich nie. Das muss er vorher wissen.
    Die Nachfrage kommt NUR, wenn etwas offen ist; sonst meldet der Knopf ab
    wie bisher.
  */
  async function abmelden() {
    const offen = user ? await offeneVormerkungen(user.uid).catch(() => 0) : 0;
    if (offen > 0) setUngesendet(offen);
    else await signOut();
  }

  /*
    NACHGELADEN WIRD BEI JEDEM SEITENWECHSEL — eine Abfrage, ein Umlauf.

    Der Zeitpunkt ist mit Absicht dieser: wer einen Antrag entscheidet,
    bleibt auf der Seite, und die Ansicht stösst dann selbst an
    (`postenNeuLaden`). Wer nur wechselt, bekommt den frischen Stand
    kostenlos mit. Und wer den Tab eine Stunde liegen lässt, soll beim
    Zurückkommen keine Zahl von vorgestern sehen — deshalb zusätzlich am
    `visibilitychange`.

    DIE ABFRAGE LÄUFT NICHT OHNE ANMELDUNG: vor dem Anmelden gibt es keinen
    Betrieb, und der Aufruf käme leer zurück. Ein Umlauf, dessen Antwort
    schon feststeht, ist einer zu viel.
  */
  useEffect(() => {
    if (!angemeldet) return;
    void postenNeuLaden();
    const beiSicht = () => {
      if (document.visibilityState === 'visible') void postenNeuLaden();
    };
    document.addEventListener('visibilitychange', beiSicht);
    return () => document.removeEventListener('visibilitychange', beiSicht);
  }, [angemeldet, ort.pathname]);

  /*
    STRG + K (am Mac ⌘ + K) öffnet „Suchen oder springen“ — überall, auch
    aus einem Eingabefeld heraus: dort hat die Kombination keine eigene
    Bedeutung, und gerade wer tippt, will nicht zur Maus greifen.
  */
  useEffect(() => {
    if (!angemeldet) return;
    const taste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSucheOffen(true);
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [angemeldet]);

  if (!user) return <>{children}</>;

  /**
   * Die untere Leiste ist je Rolle AUSGESUCHT, nicht abgeschnitten.
   *
   * Vorher standen dort die ersten vier Eintraege der Liste — ein Nebeneffekt
   * der Reihenfolge, kein Entschluss. Bei der Buchhaltung lagen die
   * Rechnungen deshalb unter „Mehr". Siehe `tabBarForRole`.
   */
  const groups = navGroupsForRole(user.role, company?.modules, zusatzrechte(user, company));
  const { unten: primary, mehr } = tabBarForRole(user.role, company?.modules, zusatzrechte(user, company));
  const hasMore = mehr.length > 0;
  const mehrSumme = hinweisSumme(mehr, posten);
  /*
    ÜBER DEN ROUTER UND NICHT ÜBER `location` DES FENSTERS. Hier stand die
    globale Adresse; die ändert sich zwar, löst aber kein Neuzeichnen aus —
    der Knopf „Mehr" blieb deshalb so markiert (oder unmarkiert), wie er beim
    letzten Zeichnen aus anderem Grund gerade war. Aufgefallen ist es erst,
    als der Seitenwechsel für die Abzeichen ohnehin gebraucht wurde.
  */
  /* Auch eine Unterseite oder Akte („/quotes/…“) liegt dort, wo ihre Liste liegt. */
  const moreActive = mehr.some(
    (i) => i.path === ort.pathname || (i.path !== '/' && ort.pathname.startsWith(`${i.path}/`)),
  );
  /*
    IM BLATT „MEHR“ NUR, WAS UNTEN NICHT SCHON STEHT (Analyse 03.10.2026,
    Paket 1). Es zeigte alle Gruppen, also auch die vier Einträge der Leiste
    darunter noch einmal — wer „Mehr“ öffnet, sucht genau das andere.
    Gruppen und Reihenfolge bleiben die der Seitenleiste.
  */
  const mehrPfade = new Set(mehr.map((i) => i.path));
  const mehrGruppen = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => mehrPfade.has(i.path)) }))
    .filter((g) => g.items.length > 0);

  /*
    HIER STEHT DER BETRIEB, NICHT DAS PRODUKT. Die Seitenleiste ist der
    Arbeitsplatz von Perls Leuten; ihnen zwanzigmal am Tag zu sagen, in
    welcher Software sie sind, bringt ihnen nichts. Zu sehen, WESSEN Betrieb
    das ist, schon — spätestens, wenn jemand für zwei Firmen arbeitet.

    Ein hinterlegtes Logo trägt den Firmennamen meist schon als Schriftzug;
    ihn daneben noch einmal zu setzen wäre doppelt. Ist keines hinterlegt,
    setzt `BrandLogo` den Namen selbst — und nicht das Logo eines fremden
    Betriebs.

    Unter etwa 36 px ist eine Zeile wie „DAS BAD · DIE HEIZUNG" nicht mehr
    lesbar, deshalb in der Seitenleiste grösser als in der schmalen mobilen
    Kopfleiste.
  */
  const BrandMarkMobile = <BrandLogo height={28} className="rounded-sm text-white" />;
  const BrandMarkSidebar = <BrandLogo height={40} className="rounded-sm text-white" />;

  const unterGruppen = groups.filter((g) => g.group !== 'Einstellungen');
  const einstellungen = groups.find((g) => g.group === 'Einstellungen')?.items ?? [];
  const darstellungKnopf = (
    <button
      type="button"
      className="mehr-punkt"
      onClick={() => setDarstellung(darstellung === 'dunkel' ? 'hell' : 'dunkel')}
      aria-pressed={darstellung === 'dunkel'}
    >
      <Icon name="sun" size={20} className="shrink-0" />
      <span>Dunkle Darstellung</span>
      <span className="ml-auto text-sm text-ink-muted">{darstellung === 'dunkel' ? 'an' : 'aus'}</span>
    </button>
  );

  const naviEintrag = (item: NavItem) => (
    <NavLink key={item.path} to={item.path} end={item.path === '/'} className={naviPunkt}>
      <Icon name={item.icon} size={20} className="shrink-0" />
      <span className="navi-text-lang">{item.label}</span>
      <span className="navi-text-kurz" aria-hidden="true">{item.short}</span>
      <ZeilenHinweis item={item} posten={posten} auf="dunkel" />
    </NavLink>
  );

  return (
    <div className="huelle">
      {/* Der erste Tab-Halt: an Kopfleiste und Menü vorbei direkt zum Inhalt. */}
      <a href="#inhalt" className="sprunglink">
        Zum Inhalt
      </a>
      {/*
        KOPFZEILE AM HANDY. Der Entwurf hat am Handy keine; sie bleibt
        trotzdem, schmal: hier steht der Betrieb (sein Logo ist meist für den
        dunklen Grund gemacht) und hinter den Initialen das Profil — auf einem
        Telefon, das mehrere benutzen, ist „wer bin ich hier gerade?“ eine
        echte Frage. Die Suche (Strg + K) hat am Telefon hier ihren Knopf.
      */}
      <header className="kopfzeile">
        {BrandMarkMobile}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSucheOffen(true)}
            className="min-h-touch px-2 text-sm text-navi-text"
          >
            Suchen
          </button>
          <button
            type="button"
            onClick={() => setProfilOpen(true)}
            aria-label={`Angemeldet als ${user.name}, ${rolleAnzeige(user.role, einblick)} — Profil öffnen`}
            className="flex min-h-touch min-w-touch items-center justify-center rounded-full"
          >
            <Avatar name={user.name} size={32} />
          </button>
        </div>
      </header>

      {/* Seitenleiste (Schreibtisch) bzw. schmale Leiste (Tablet). */}
      <aside className="navi">
        <div className="navi-betrieb">{BrandMarkSidebar}</div>
        <button type="button" className="navi-suche" onClick={() => setSucheOffen(true)}>
          <span>Suchen</span>
          <span className="navi-taste" aria-hidden="true">Strg K</span>
        </button>
        <nav className="flex flex-col gap-0.5" aria-label="Hauptnavigation">
          {unterGruppen.map(({ group, items: groupItems }) => (
            <div key={group} className="flex flex-col gap-0.5">
              {!OHNE_UEBERSCHRIFT.has(group) && <p className="navi-gruppe">{group}</p>}
              {groupItems.map(naviEintrag)}
            </div>
          ))}
        </nav>
        <div className="navi-fuss">
          <nav className="flex flex-col gap-0.5" aria-label="Einstellungen">
            {einstellungen.map(naviEintrag)}
          </nav>
          {/* Am Tablet: die Initialen öffnen das Profil (Name, Abmelden …). */}
          <button
            type="button"
            className="navi-profil"
            onClick={() => setProfilOpen(true)}
            aria-label={`Angemeldet als ${user.name}, ${rolleAnzeige(user.role, einblick)} — Profil öffnen`}
          >
            <Avatar name={user.name} size={36} />
          </button>
          <div className="navi-breit">
            <div className="navi-person">
              <Avatar name={user.name} />
              <div className="min-w-0">
                <p className="navi-person-name truncate">{user.name}</p>
                <p className="navi-person-rolle truncate">{rolleAnzeige(user.role, einblick)}</p>
              </div>
            </div>
            <ProblemMelden
              ausloeser={(oeffnen) => (
                <Button variant="ghost-dark" className="w-full justify-start" onClick={oeffnen}>
                  Problem melden
                </Button>
              )}
            />
            <Button
              variant="ghost-dark"
              className="w-full justify-start"
              onClick={() => setDarstellung(darstellung === 'dunkel' ? 'hell' : 'dunkel')}
              aria-pressed={darstellung === 'dunkel'}
            >
              Dunkle Darstellung: {darstellung === 'dunkel' ? 'an' : 'aus'}
            </Button>
            <Button
              variant="ghost-dark"
              className="w-full justify-start"
              onClick={() => void abmelden()}
            >
              Abmelden
            </Button>

            {/*
              DIE PRODUKTMARKE, KLEIN UND UNTERGEORDNET. Nicht aus Eitelkeit:
              wenn ein Monteur anruft und sagt „die App tut nicht", ist
              „Senklot" das Wort, mit dem er sucht und mit dem das Büro den
              Support anspricht. Ganz unten, gedämpft, hinter dem Abmelden —
              dort konkurriert sie mit nichts, und der Betrieb bleibt oben.
            */}
            <p className="mt-4 px-2.5 text-navi-text">
              <ProduktMarke hoehe={20} />
            </p>
            <RechtLinks className="mt-2 px-2.5 text-xs text-navi-text" />
          </div>
        </div>
      </aside>

      {/* Inhalt */}
      {/*
        `min-w-0` IST HIER NICHT KOSMETIK, SONDERN DIE BREMSE: `main` ist das
        Flex-Geschwister der Navigation und könnte sonst nicht unter die
        Mindestbreite seines Inhalts schrumpfen — die ganze Seite liesse sich
        seitwärts schieben (gemessen bei 834 px, neun von achtundzwanzig
        Ansichten). Was wirklich breit ist (Tabellen), scrollt in seinem
        eigenen Behälter.
      */}
      {/* Neue Seiten starten oben, „Zurück“ stellt die Position wieder her (M2). */}
      <Seitenposition />
      {/* Eine neue Fehlermeldung ausserhalb des Bildes wird hereingeholt (G10). */}
      <FehlerInsBlickfeld />
      <main
        id="inhalt"
        ref={inhalt}
        // Programmatisch fokussierbar (Sprunglink, Seitenwechsel), aber kein Tab-Halt.
        tabIndex={-1}
        className="min-w-0 flex-1 pb-24 outline-none md:pb-6"
      >
        {/* Ganz oben im Inhalt, nicht in der Kopfleiste: dort wäre es auf dem
            Schreibtisch gar nicht zu sehen, wo es keine mobile Top-Bar gibt. */}
        <Verbindungsband />
        {/*
          Das Supportband steht UNTER dem Verbindungsband: fällt das Netz aus,
          ist das die dringendere Auskunft, und zwei Bänder übereinander
          sortieren sich dann von selbst nach Dringlichkeit.
        */}
        <Supportband />
        {/*
          FÜR DEN SUPPORT SELBST, nicht für den Betrieb. Es zeigt sich nur
          während eines Einblicks und sagt, in wessen Daten man gerade
          arbeitet — die Oberfläche sieht sonst aus wie jede andere.
        */}
        <Supportsitzung />
        <SeitenHilfeProvider>
          <div className="inhalt">{children}</div>
        </SeitenHilfeProvider>
      </main>

      {/*
        UNTERE LEISTE AM HANDY (Linie „Lot“): hell, vier Ziele je Rolle und
        „Mehr“. Der aktive Eintrag in Petrol UND halbfett; am Symbol hängt der
        Zähler, weil die Beschriftung darunter als Erstes gekürzt wird.
      */}
      <nav ref={reiterleiste} className="unten" aria-label="Hauptnavigation">
        {primary.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => (isActive ? 'unten-punkt-aktiv' : 'unten-punkt')}
          >
            <span className="unten-symbol">
              <Icon name={item.icon} size={22} />
              {item.hinweis && (
                <span className="unten-zahl">
                  <Zaehler
                    anzahl={hinweisZahl(item, posten)}
                    was={hinweisWort(item.hinweis, hinweisZahl(item, posten))}
                  />
                </span>
              )}
            </span>
            <span className="unten-text">{item.short}</span>
          </NavLink>
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            /*
              DER NAME TRÄGT DAS SICHTBARE WORT UND DIE ZAHL. „Weitere
              Bereiche" überschrieb den Inhalt: die Summe (sr-only im
              Zaehler) wurde nie vorgelesen, und wer per Sprache „Mehr"
              sagt, traf den Knopf nicht (Prüflauf 25.09.2026, P4-08).
            */
            aria-label={
              Number.isFinite(mehrSumme) && mehrSumme >= 1
                ? `Mehr, ${mehrSumme} ${mehrSumme === 1 ? 'offener Posten' : 'offene Posten'}`
                : 'Mehr'
            }
            className={moreActive ? 'unten-punkt-aktiv' : 'unten-punkt'}
          >
            <span className="unten-symbol">
              <Icon name="more" size={22} />
              {/* Die Summe dessen, was der Knopf verdeckt. */}
              <span className="unten-zahl">
                <Zaehler
                  anzahl={mehrSumme}
                  was={mehrSumme === 1 ? 'offener Posten' : 'offene Posten'}
                />
              </span>
            </span>
            <span className="unten-text">Mehr</span>
          </button>
        )}
      </nav>

      {/* „Mehr"-Blatt (Handy) */}
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} label="Weitere Bereiche">
        <nav className="flex flex-col" aria-label="Weitere Bereiche">
          {mehrGruppen.map(({ group, items: groupItems }) => (
            <div key={group}>
              {!OHNE_UEBERSCHRIFT.has(group) && <p className="mehr-gruppe">{group}</p>}
              <div className="flex flex-col gap-0.5">
                {groupItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    onClick={() => setMoreOpen(false)}
                    className={mehrPunkt}
                  >
                    <Icon name={item.icon} size={20} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                    <ZeilenHinweis item={item} posten={posten} auf="hell" />
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </BottomSheet>

      {/* Profil hinter den Initialen (Handy und Tablet) */}
      <BottomSheet open={profilOpen} onClose={() => setProfilOpen(false)} label="Profil" auchBreit>
        <div className="flex items-center gap-3 px-1">
          <Avatar name={user.name} size={48} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink">{user.name}</p>
            <p className="truncate text-sm text-ink-muted">{rolleAnzeige(user.role, einblick)}</p>
            <p className="truncate text-sm text-ink-muted">{kontoAnzeige(user.email)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-0.5 border-t border-line pt-3">
          <NavLink to="/settings/meldungen" onClick={() => setProfilOpen(false)} className={mehrPunkt}>
            <Icon name="bell" size={20} className="shrink-0" />
            {/* So heißt die Seite, auf der man landet (navigation.ts,
                Unterseite `meldungen`): Passwort UND Meldungen (P4-17). */}
            <span>Mein Konto</span>
          </NavLink>
          <ProblemMelden
            ausloeser={(oeffnen) => (
              <button type="button" onClick={oeffnen} className="mehr-punkt">
                <Icon name="mail" size={20} className="shrink-0" />
                <span>Problem melden</span>
              </button>
            )}
          />
          {darstellungKnopf}
        </div>
        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => {
            setProfilOpen(false);
            void abmelden();
          }}
        >
          Abmelden
        </Button>
        {/*
          WELCHE FASSUNG LAEUFT HIER. Aus dem Betrieb gemeldet: „keine deiner
          Aenderungen ist in der App vorhanden." Der Deploy meldete Erfolg,
          das Telefon zeigte etwas anderes — und niemand konnte nachsehen.
          Eine Zeile mit Datum und Uhrzeit beendet das Ratespiel.
        */}
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-center text-xs text-ink-muted">Fassung {FASSUNG}</p>
          {/* Der Knopf steht genau hier, weil hier die Frage entsteht. */}
          <AppErneuern />
          <RechtLinks className="mt-3 text-center text-xs text-ink-muted" />
        </div>
      </BottomSheet>

      <Suchfenster offen={sucheOffen} onSchliessen={() => setSucheOffen(false)} />

      <ConfirmDialog
        open={ungesendet > 0}
        title="Noch nicht gesendet"
        message={
          `${ungesendet === 1 ? 'Eine Buchung liegt' : `${ungesendet} Buchungen liegen`} noch ` +
          'ungesendet auf diesem Gerät — sie wurden ohne Empfang gespeichert. Nach dem Abmelden ' +
          'gehen sie erst hinaus, wenn du dich auf DIESEM Gerät wieder anmeldest. Besser: erst ' +
          'Empfang abwarten, dann abmelden.'
        }
        confirmLabel="Trotzdem abmelden"
        onConfirm={async () => {
          await signOut();
          setUngesendet(0);
        }}
        onCancel={() => setUngesendet(0)}
      />
    </div>
  );
}
