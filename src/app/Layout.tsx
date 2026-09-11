import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { navGroupsForRole, tabBarForRole } from './navigation';
import Button from '@/components/Button';
import { FASSUNG } from '@/lib/fassung';
import Icon from '@/components/Icon';
import Avatar from '@/components/Avatar';
import BrandLogo from '@/components/BrandLogo';
import OfflineBanner from '@/components/OfflineBanner';
import BottomSheet from '@/components/BottomSheet';
import AppErneuern from '@/components/AppErneuern';

/**
 * Der aktive Eintrag wird über die KANTE markiert, nicht über eine volle
 * Farbfläche: das hält die Navigation ruhig und lässt den leuchtenden Ton als
 * Marker wirken statt als Teppich. Zusätzlich ist der Text fett — Farbe allein
 * trägt nie eine Information, weil sie bei Farbsehschwäche wegfällt.
 *
 * Zwei Fassungen, weil es zwei Träger gibt: die Seitenleiste ist dunkel, die
 * Blätter von unten (Mehr, Profil) stehen auf heller Fläche. Ein gemeinsamer
 * Stil müsste auf einem von beiden falsch aussehen.
 */
const sideLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-touch min-w-0 items-center gap-3 rounded-sm border-l-[3px] px-3 py-2 text-base transition ${
    isActive
      ? 'border-l-accent-deep bg-info-bg font-bold text-accent-deep'
      : 'border-l-transparent font-medium text-ink-muted hover:bg-surface-2 hover:text-ink'
  }`;

/** Dieselbe Zeile auf der dunklen Seitenleiste. */
const sideLinkDark = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-touch min-w-0 items-center gap-3 rounded-sm border-l-[3px] px-3 py-2 text-base transition ${
    isActive
      ? 'border-l-accent-bright bg-white/10 font-bold text-white'
      : 'border-l-transparent font-medium text-white/75 hover:bg-white/10 hover:text-white'
  }`;

/** App-Shell: Desktop-Sidebar; mobil Top-Bar + Icon-Tab-Bar (4 + „Mehr"-Drawer). */
export default function Layout({ children }: { children: ReactNode }) {
  const { user, company, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [profilOpen, setProfilOpen] = useState(false);
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
  const moreActive = mehr.some((i) => i.path === location.pathname);

  // Das Logo trägt den Firmennamen bereits als Schriftzug — ihn daneben noch
  // einmal zu setzen wäre doppelt. Der Name bleibt als Alternativtext im Bild
  // und damit für Screenreader erhalten.
  //
  // Unter etwa 36 px ist die Zeile „DAS BAD · DIE HEIZUNG" nicht mehr lesbar,
  // deshalb in der Sidebar größer als in der schmalen mobilen Kopfleiste.
  const BrandMarkMobile = <BrandLogo height={32} className="rounded-sm" />;
  const BrandMarkSidebar = <BrandLogo height={40} className="rounded-sm" />;

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Mobile Top-Bar — dunkles Markenband mit leuchtender Unterkante. Die
          Kante ist ein eigenes Element und keine Rahmenfarbe: einen Verlauf
          kann ein `border-bottom` nicht tragen.

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
        <div className="edge-accent h-[3px]" aria-hidden="true" />
        {/* Weisser Trenner zwischen Navigation und Inhalt. Er sitzt HINTER
            der Markenkante, nicht statt ihr: die Kante gehört zur dunklen
            Leiste, der weisse Streifen ist die Fuge zum Arbeitsbereich. Auf
            dem hellen Grund (#eef6f8) ist Weiss zurückhaltend, gegen das
            Tintenblau der Leiste liest es sich als saubere Kante. */}
        <div className="h-[3px] bg-white" aria-hidden="true" />
      </header>

      {/* Desktop-Sidebar */}
      <aside className="panel-dark hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r-[3px] md:border-r-white md:p-3">
        <div className="mb-4 px-2 pt-1">{BrandMarkSidebar}</div>
        <nav className="flex flex-col gap-4 overflow-y-auto" aria-label="Hauptnavigation">
          {groups.map(({ group, items: groupItems }) => (
            <div key={group} className="flex flex-col gap-1">
              {group !== 'Allgemein' && (
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-white/60">
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
          <Button
            variant="ghost-dark"
            className="mt-2 w-full justify-start"
            onClick={() => void signOut()}
          >
            Abmelden
          </Button>
        </div>
      </aside>

      {/* Inhalt */}
      <main className="flex-1 pb-24 md:pb-6">
        {/* Ganz oben im Inhalt, nicht in der Kopfleiste: dort wäre er auf dem
            Schreibtisch gar nicht zu sehen, wo es keine mobile Top-Bar gibt. */}
        <OfflineBanner />
        <div className="mx-auto max-w-5xl p-4 md:p-6">{children}</div>
      </main>

      {/* Mobile Tab-Bar — dieselbe dunkle Trägerfläche wie die Kopfleiste, so
          dass der Inhalt oben und unten von der Marke eingefasst wird. Die
          leuchtende Oberkante (Cyan → Mint) ist die Signatur; sie liegt als
          eigenes Element über der Leiste, weil ein Rahmen keinen Verlauf
          tragen kann. Aktiv = weiße Schrift in heller Pille, PLUS Fettung —
          auf 10 px Schrift ist Farbe allein zu wenig. */}
      <nav
        className="panel-dark fixed inset-x-0 bottom-0 z-30 md:hidden"
        aria-label="Hauptnavigation"
      >
        {/* Gespiegelt zur Kopfleiste: erst die Fuge zum Inhalt, dann die
            Markenkante, dann die dunkle Leiste. */}
        <div className="h-[3px] bg-white" aria-hidden="true" />
        <div className="edge-accent h-[3px]" aria-hidden="true" />
        <div className="flex pb-[env(safe-area-inset-bottom)]">
          {primary.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex min-h-touch flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.65rem] font-bold ${
                  isActive ? 'text-white' : 'text-white/70'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-7 w-9 items-center justify-center rounded-lg transition-colors ${
                      isActive ? 'bg-white/15' : ''
                    }`}
                  >
                    <Icon name={item.icon} size={20} />
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
              className={`flex min-h-touch flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.65rem] font-bold ${
                moreActive ? 'text-white' : 'text-white/70'
              }`}
            >
              <span
                className={`flex h-7 w-9 items-center justify-center rounded-lg transition-colors ${
                  moreActive ? 'bg-white/15' : ''
                }`}
              >
                <Icon name="more" size={20} />
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
              {group !== 'Allgemein' && (
                <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
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
            <p className="truncate text-sm text-ink-muted">{user.email}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-1 border-t border-line pt-3">
          <NavLink to="/settings/meldungen" onClick={() => setProfilOpen(false)} className={sideLink}>
            <Icon name="bell" size={20} className="shrink-0" />
            <span>Benachrichtigungen</span>
          </NavLink>
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
        </div>
      </BottomSheet>

    </div>
  );
}
