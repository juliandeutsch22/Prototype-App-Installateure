import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { navGroupsForRole, tabBarForRole } from './navigation';
import Button from '@/components/Button';
import Icon from '@/components/Icon';
import Avatar from '@/components/Avatar';
import BrandLogo from '@/components/BrandLogo';
import OfflineBanner from '@/components/OfflineBanner';
import BottomSheet from '@/components/BottomSheet';

/**
 * Aktiver Eintrag = roter Kantenmarker + blauer, fetter Text auf hellblauem
 * Grund. Der Prototyp markiert bewusst über die Kante statt über eine volle
 * Farbfläche (dort die rote Unterkante der Tabs) — das hält die Navigation
 * ruhig und lässt Rot als Marker wirken statt als Fläche.
 */
const sideLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-touch min-w-0 items-center gap-3 rounded-sm border-l-[3px] px-3 py-2 text-base transition ${
    isActive
      ? 'border-l-accent bg-info-bg font-bold text-brand'
      : 'border-l-transparent font-medium text-ink-muted hover:bg-surface-2 hover:text-ink'
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
      {/* Mobile Top-Bar */}
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
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
      </header>

      {/* Desktop-Sidebar */}
      <aside className="hidden border-r border-line bg-surface md:flex md:w-64 md:shrink-0 md:flex-col md:p-3">
        <div className="mb-4 px-2 pt-1">{BrandMarkSidebar}</div>
        <nav className="flex flex-col gap-4 overflow-y-auto" aria-label="Hauptnavigation">
          {groups.map(({ group, items: groupItems }) => (
            <div key={group} className="flex flex-col gap-1">
              {group !== 'Allgemein' && (
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {group}
                </p>
              )}
              {groupItems.map((item) => (
                <NavLink key={item.path} to={item.path} end={item.path === '/'} className={sideLink}>
                  <Icon name={item.icon} size={20} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <div className="flex items-center gap-3 px-3">
            <Avatar name={user.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
              <p className="truncate text-xs text-ink-muted">{user.role}</p>
            </div>
          </div>
          <Button variant="ghost" className="mt-2 w-full justify-start" onClick={() => void signOut()}>
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

      {/* Mobile Tab-Bar — rote Oberkante als Markenband, aktives Icon in
          hellblauer Pille (beides aus dem Prototyp). */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t-2 border-t-accent bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Hauptnavigation"
      >
        {primary.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex min-h-touch flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.65rem] font-bold ${
                isActive ? 'text-brand' : 'text-ink-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex h-7 w-9 items-center justify-center rounded-lg transition-colors ${
                    isActive ? 'bg-info-bg' : ''
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
              moreActive ? 'text-brand' : 'text-ink-muted'
            }`}
          >
            <span
              className={`flex h-7 w-9 items-center justify-center rounded-lg transition-colors ${
                moreActive ? 'bg-info-bg' : ''
              }`}
            >
              <Icon name="more" size={20} />
            </span>
            <span>Mehr</span>
          </button>
        )}
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
          <NavLink to="/notifications" onClick={() => setProfilOpen(false)} className={sideLink}>
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
      </BottomSheet>

    </div>
  );
}
