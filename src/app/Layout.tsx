import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { kontoAnzeige } from '@shared/benutzername';
import {
  navGroupsForRole, gruppeMitUeberschrift, tabBarForRole, hinweisZahl, hinweisSumme, hinweisWort, type NavItem,
} from './navigation';
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

/**
 * Der aktive Eintrag wird über die KANTE markiert, nicht über eine volle
 * Farbfläche: das hält die Navigation ruhig und lässt den leuchtenden Ton als
 * Marker wirken statt als Teppich. Zusätzlich ist der Text fett — Farbe allein
 * trägt nie eine Information, weil sie bei Farbsehschwäche wegfällt.
 *
 * Zwei Fassungen, weil es zwei Träger gibt: die Seitenleiste ist dunkel, die
 * Blätter von unten (Mehr, Profil) stehen auf heller Fläche. Ein gemeinsamer
 * Stil müsste auf einem von beiden falsch aussehen.
 *
 * AUF DER HELLEN FLÄCHE STEHT DER TEXT IN TINTE. `--accent-deep` auf
 * `--info-bg` erreichte nachgerechnet 4,49 : 1 — knapp unter der Grenze;
 * Tinte darauf 14,3 : 1. Die Fläche, die Kante und die Fettung tragen den
 * Zustand, wie der aktive Eintrag im Entwurf (Mockup S. 1 unten).
 */
const sideLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-touch min-w-0 items-center gap-3 rounded-sm border-l-[3px] px-3 py-2 text-base transition ${
    isActive
      ? 'border-l-accent-deep bg-info-bg font-bold text-ink'
      : 'border-l-transparent font-medium text-ink-muted hover:bg-surface-2 hover:text-ink'
  }`;

/**
 * Dieselbe Zeile auf der dunklen Seitenleiste.
 *
 * DIE MARKIERUNG IST WEISS, NICHT CYAN. Auf der Trägerfläche steht nur Weiß —
 * das ist die Farbpaarung des Zeichens, und seit die Fläche flach ist (kein
 * Verlauf mehr), hat Cyan dort auch keinen Ton mehr, an den es anschliesst.
 * Getragen wird der Zustand ohnehin dreifach: Fläche, Fettung, Textfarbe.
 * Der Strich ist der vierte Hinweis und nie der einzige.
 *
 * Die Fläche ist deckendes `--ink-deep`, eine Stufe dunkler als die Leiste —
 * keine halbtransparente Weiß-Tönung. Weiß darauf steht bei über 16:1.
 */
const sideLinkDark = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-touch min-w-0 items-center gap-3 rounded px-3 py-2 text-base transition ${
    isActive
      ? 'bg-ink-deep font-semibold text-white'
      : 'font-medium text-white/75 hover:bg-ink-deep hover:text-white'
  }`;

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
    <span className="ml-auto flex items-center">
      <Zaehler anzahl={n} was={hinweisWort(item.hinweis, n)} auf={auf} />
    </span>
  );
}

/** App-Shell: Desktop-Sidebar; mobil Top-Bar + Icon-Tab-Bar (4 + „Mehr"-Drawer). */
export default function Layout({ children }: { children: ReactNode }) {
  const { user, company, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [profilOpen, setProfilOpen] = useState(false);
  const ort = useLocation();
  const posten = useOffenePosten();
  const angemeldet = !!user;

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

  if (!user) return <>{children}</>;

  /**
   * Die untere Leiste ist je Rolle AUSGESUCHT, nicht abgeschnitten.
   *
   * Vorher standen dort die ersten vier Eintraege der Liste — ein Nebeneffekt
   * der Reihenfolge, kein Entschluss. Bei der Buchhaltung lagen die
   * Rechnungen deshalb unter „Mehr". Siehe `tabBarForRole`.
   */
  const groups = navGroupsForRole(user.role, company?.modules);
  const { unten: primary, mehr } = tabBarForRole(user.role, company?.modules);
  const hasMore = mehr.length > 0;
  const mehrSumme = hinweisSumme(mehr, posten);
  /*
    ÜBER DEN ROUTER UND NICHT ÜBER `location` DES FENSTERS. Hier stand die
    globale Adresse; die ändert sich zwar, löst aber kein Neuzeichnen aus —
    der Knopf „Mehr" blieb deshalb so markiert (oder unmarkiert), wie er beim
    letzten Zeichnen aus anderem Grund gerade war. Aufgefallen ist es erst,
    als der Seitenwechsel für die Abzeichen ohnehin gebraucht wurde.
  */
  const moreActive = mehr.some((i) => i.path === ort.pathname);

  /*
    HIER STEHT DER BETRIEB, NICHT DAS PRODUKT. Die Seitenleiste ist der
    Arbeitsplatz von Perls Leuten; ihnen zwanzigmal am Tag zu sagen, in
    welcher Software sie sind, bringt ihnen nichts. Zu sehen, WESSEN Betrieb
    das ist, schon — spätestens, wenn jemand für zwei Firmen arbeitet.

    Ein hinterlegtes Logo trägt den Firmennamen meist schon als Schriftzug;
    ihn daneben noch einmal zu setzen wäre doppelt. Ist keines hinterlegt,
    setzt `BrandLogo` den Namen selbst — und nicht das Logo eines fremden
    Betriebs.

    Gilt für die schmale Kopfleiste am Telefon. Am Schreibtisch steht oben
    das Produkt und darunter der Betrieb als Text (siehe Seitenleiste).
  */
  const BrandMarkMobile = <BrandLogo height={32} className="rounded-sm text-white" />;

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Mobile Top-Bar — dieselbe dunkle Trägerfläche wie die Seitenleiste
          am Schreibtisch, abgesetzt durch dieselbe weisse Fuge.

          `pt-[env(safe-area-inset-top)]`: die Kopfzeile im Anzug (`index.html`
          setzt `viewport-fit=cover`) reicht bis unter die Statusleiste des
          Telefons. Ohne den Zuschlag stünde das Logo dahinter; mit ihm malt
          die Leiste diesen Streifen in ihrer eigenen Farbe aus — genau das,
          was man von einer App vom Startbildschirm erwartet. Auf einem Gerät
          ohne Aussparung ist der Wert 0 und es ändert sich nichts. */}
      <header className="panel-dark pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
        {BrandMarkMobile}
        {/* Der Avatar allein zeigt nur zwei Buchstaben. Auf einem
            Baustellen-Tablet, an dem mehrere arbeiten, ist die Frage „wer bin
            ich hier gerade?" real — und Initialen beantworten sie nicht. Ein
            Tipp oeffnet Name, Rolle und Abmelden. */}
        <button
          type="button"
          onClick={() => setProfilOpen(true)}
          aria-label={`Angemeldet als ${user.name}, ${user.role} — Profil öffnen`}
          className="flex min-h-touch min-w-touch items-center justify-center rounded-full"
        >
          <Avatar name={user.name} size={32} />
        </button>
        </div>
      </header>

      {/* Desktop-Sidebar */}
      <aside className="panel-dark hidden md:flex md:w-64 lg:w-[17.5rem] md:shrink-0 md:flex-col md:p-3">
        {/*
          OBEN DAS PRODUKT, DARUNTER DER BETRIEB (Mockup S. 7, 8). Senklot
          ist der Name, unter dem Monteur und Büro die App kennen und den
          Support anrufen; der Betrieb steht direkt darunter, damit auch klar
          ist, WESSEN Arbeitsplatz das ist.
        */}
        <div className="seitenleiste-marke">
          <ProduktMarke hoehe={30} className="text-white" />
          {company?.name && <p className="seitenleiste-betrieb">{company.name}</p>}
        </div>
        <nav className="flex flex-col gap-4 overflow-y-auto" aria-label="Hauptnavigation">
          {groups.map(({ group, items: groupItems }) => (
            <div key={group} className="flex flex-col gap-1">
              {gruppeMitUeberschrift(group, groups) && (
                <p className="px-3 pb-1 text-xs font-semibold text-white/60">
                  {group}
                </p>
              )}
              {groupItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={sideLinkDark}
                >
                  <Icon name={item.icon} size={20} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                  <ZeilenHinweis item={item} posten={posten} auf="dunkel" />
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/15 pt-4">
          <div className="flex items-center gap-3 px-3">
            <Avatar name={user.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              <p className="truncate text-xs text-white/70">{user.role}</p>
            </div>
          </div>
          <div className="seitenleiste-fuss">
            <ProblemMelden
              ausloeser={(oeffnen) => (
                <button type="button" className="seitenleiste-link" onClick={oeffnen}>
                  Problem melden
                </button>
              )}
            />
            <button type="button" className="seitenleiste-link" onClick={() => void signOut()}>
              Abmelden
            </button>
          </div>
          <RechtLinks className="mt-2 px-3 text-xs text-white/60" />
        </div>
      </aside>

      {/* Inhalt */}
      {/*
        `min-w-0` IST HIER NICHT KOSMETIK, SONDERN DIE BREMSE.

        `main` ist das Flex-Geschwister der 259 px breiten Seitenleiste
        (256 + 3 px Fuge). Ein Flex-Element hat von sich aus `min-width: auto`
        und kann damit NICHT unter die Mindestbreite seines Inhalts
        schrumpfen — es schiebt stattdessen die ganze Seite auf.

        Auf dem Tablet war das zu sehen: bei 834 px stehen dem Inhalt 575 px
        zu, sein Mindestmass lag aber bei 592, und das Dokument wurde 848 px
        breit. Die Seite liess sich also seitwaerts schieben, auf neun der
        achtundzwanzig Ansichten. Am Telefon faellt es nicht auf (keine
        Seitenleiste), am Schreibtisch auch nicht (genug Platz) — genau
        dazwischen bricht es.

        Mit `min-w-0` schrumpft `main` wie vorgesehen, und was wirklich breit
        ist (Tabellen), scrollt in seinem eigenen Behaelter mit
        `overflow-x-auto`.
      */}
      <main className="min-w-0 flex-1 pb-24 md:pb-6">
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
        {/*
          BIS 80 rem BREIT (Mockup S. 7, 8): die Seiten stehen am Schreibtisch
          zweispaltig, Tabellen haben fünf bis sieben Spalten. Mit der alten
          Grenze von 64 rem brach „Wie zuletzt buchen“ bei 1440 px dreizeilig
          um, und die rechte Spalte war schmaler als ihr Inhalt. Darüber
          bleibt der Inhalt mittig, damit Zeilen nicht endlos lang werden.
        */}
        <div className="mx-auto max-w-7xl p-4 md:p-6 xl:px-10 xl:py-8">{children}</div>
      </main>

      {/* Mobile Tab-Bar — dieselbe dunkle Trägerfläche wie die Kopfleiste, so
          dass der Inhalt oben und unten von der Marke eingefasst wird.
          Aktiv = helle Pille um das Symbol PLUS volles Weiss statt 70 % —
          auf 12 px Schrift ist Farbe allein zu wenig. Die Pille ist deckend
          `--bg` mit dem Symbol in `--brand-fixed` (9,6 : 1), wie der aktive
          Eintrag im Entwurf (Mockup S. 1 unten); vorher `--ink-deep` auf der
          Leiste, das sich von ihr kaum abhob. Die Beschriftung ist
          halbfett für alle, nicht fett (Marke: „Fett wirkt laut";
          Prüflauf 24.09.2026, C9). */}
      <nav
        className="panel-dark fixed inset-x-0 bottom-0 z-30 md:hidden"
        aria-label="Hauptnavigation"
      >
        {/* Dieselbe Fuge wie an Kopfleiste und Seitenleiste. */}
        <div className="h-[3px] bg-white" aria-hidden="true" />
        <div className="flex pb-[env(safe-area-inset-bottom)]">
          {primary.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex min-h-touch flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-semibold ${
                  isActive ? 'text-white' : 'text-white/70'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/*
                    AM TELEFON HAENGT DIE ZAHL AM SYMBOL, nicht hinter dem
                    Wort: die Beschriftung darunter ist 12 px hoch und oft
                    abgeschnitten („Rechnungen"), eine Zahl dahinter waere das
                    Erste, was wegfaellt. Ueber der rechten oberen Ecke ist sie
                    die gewohnte Stelle und kostet keinen Platz in der Zeile.
                  */}
                  <span
                    className={`relative flex h-8 w-14 items-center justify-center rounded-pill transition-colors ${
                      isActive ? 'bg-bg text-brand-fixed' : ''
                    }`}
                  >
                    <Icon name={item.icon} size={20} />
                    {item.hinweis && (
                      <span className="absolute -right-1.5 -top-1">
                        <Zaehler
                          anzahl={hinweisZahl(item, posten)}
                          was={hinweisWort(item.hinweis, hinweisZahl(item, posten))}
                          auf="dunkel"
                        />
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate px-1">{item.short}</span>
                </>
              )}
            </NavLink>
          ))}
          {hasMore && (
            <button
              onClick={() => setMoreOpen(true)}
              aria-label="Weitere Bereiche"
              className={`flex min-h-touch flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-semibold ${
                moreActive ? 'text-white' : 'text-white/70'
              }`}
            >
              <span
                className={`relative flex h-8 w-14 items-center justify-center rounded-pill transition-colors ${
                  moreActive ? 'bg-bg text-brand-fixed' : ''
                }`}
              >
                <Icon name="more" size={20} />
                {/*
                  DIE SUMME DESSEN, WAS DER KNOPF VERDECKT. „Mehr" verbirgt am
                  Telefon bis zu zwoelf Bereiche; ohne diese Zahl laege eine
                  Meldung hinter einem Knopf, den man nur oeffnet, wenn man
                  ohnehin schon etwas sucht — genau der Zustand, den die
                  Abzeichen beenden sollen.
                */}
                <span className="absolute -right-1.5 -top-1">
                  <Zaehler
                    anzahl={mehrSumme}
                    was={mehrSumme === 1 ? 'offener Posten' : 'offene Posten'}
                    auf="dunkel"
                  />
                </span>
              </span>
              <span>Mehr</span>
            </button>
          )}
        </div>
      </nav>

      {/* „Mehr"-Drawer (mobil) */}
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} label="Weitere Bereiche">
        <nav className="flex flex-col gap-3" aria-label="Weitere Bereiche">
          {groups.map(({ group, items: groupItems }) => (
            <div key={group}>
              {gruppeMitUeberschrift(group, groups) && (
                <p className="mb-1 px-1 text-xs font-semibold text-ink-muted">
                  {group}
                </p>
              )}
              <div className="flex flex-col gap-1">
                {groupItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    onClick={() => setMoreOpen(false)}
                    className={sideLink}
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

      {/* Profil hinter den Initialen (mobil) */}
      <BottomSheet open={profilOpen} onClose={() => setProfilOpen(false)} label="Profil">
        <div className="flex items-center gap-3 px-1">
          <Avatar name={user.name} size={48} />
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-ink">{user.name}</p>
            <p className="truncate text-sm text-ink-muted">{user.role}</p>
            <p className="truncate text-sm text-ink-muted">{kontoAnzeige(user.email)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-1 border-t border-line pt-3">
          <NavLink to="/settings/meldungen" onClick={() => setProfilOpen(false)} className={sideLink}>
            <Icon name="bell" size={20} className="shrink-0" />
            <span>Benachrichtigungen</span>
          </NavLink>
          <ProblemMelden
            ausloeser={(oeffnen) => (
              <button type="button" onClick={oeffnen} className={sideLink({ isActive: false })}>
                <Icon name="mail" size={20} className="shrink-0" />
                <span>Problem melden</span>
              </button>
            )}
          />
        </div>
        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => {
            setProfilOpen(false);
            void signOut();
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
          {/*
            Der Knopf steht GENAU HIER, weil hier die Frage entsteht: wer
            nachsieht, welche Fassung läuft, tut das, weil eine Änderung
            fehlt. Die Antwort darauf soll nicht drei Bildschirme entfernt
            sein.
          */}
          <AppErneuern />
          <RechtLinks className="mt-3 text-center text-xs text-ink-muted" />
        </div>
      </BottomSheet>

    </div>
  );
}
