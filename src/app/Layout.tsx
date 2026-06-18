import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { navForRole } from './navigation';
import Button from '@/components/Button';
import Icon from '@/components/Icon';

const sideLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-touch min-w-0 items-center gap-3 rounded px-3 py-2 text-base font-medium transition ${
    isActive ? 'bg-brand text-brand-fg' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
  }`;

/** App-Shell: Desktop-Sidebar; mobil Top-Bar + Icon-Tab-Bar (4 + „Mehr"-Drawer). */
export default function Layout({ children }: { children: ReactNode }) {
  const { user, company, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  if (!user) return <>{children}</>;

  const items = navForRole(user.role);
  const brand = company?.name ?? 'Installateur-App';
  const primary = items.slice(0, 4);
  const hasMore = items.length > 4;
  const moreActive = items.slice(4).some((i) => i.path === location.pathname);

  const BrandMark = (
    <div className="flex items-center gap-2">
      {company?.logoUrl && <img src={company.logoUrl} alt="" className="h-8 w-8 rounded" />}
      <span className="text-lg font-bold text-ink">{brand}</span>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Mobile Top-Bar */}
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
        {BrandMark}
        <span className="text-sm text-ink-muted">{user.role}</span>
      </header>

      {/* Desktop-Sidebar */}
      <aside className="hidden border-r border-line bg-surface md:flex md:w-64 md:shrink-0 md:flex-col md:p-3">
        <div className="mb-4 px-1">{BrandMark}</div>
        <nav className="flex flex-col gap-1" aria-label="Hauptnavigation">
          {items.map((item) => (
            <NavLink key={item.path} to={item.path} end={item.path === '/'} className={sideLink}>
              <Icon name={item.icon} size={20} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <p className="px-3 text-sm font-medium text-ink">{user.name}</p>
          <p className="px-3 text-xs text-ink-muted">{user.email}</p>
          <Button variant="ghost" className="mt-2 w-full justify-start" onClick={() => void signOut()}>
            Abmelden
          </Button>
        </div>
      </aside>

      {/* Inhalt */}
      <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      {/* Mobile Tab-Bar (Icons + Kurzlabel) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Hauptnavigation"
      >
        {primary.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex min-h-touch flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.7rem] font-medium ${
                isActive ? 'text-brand' : 'text-ink-muted'
              }`
            }
          >
            <Icon name={item.icon} size={22} />
            <span className="max-w-full truncate px-0.5">{item.short}</span>
          </NavLink>
        ))}
        {hasMore && (
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="Weitere Bereiche"
            className={`flex min-h-touch flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.7rem] font-medium ${
              moreActive ? 'text-brand' : 'text-ink-muted'
            }`}
          >
            <Icon name="more" size={22} />
            <span>Mehr</span>
          </button>
        )}
      </nav>

      {/* „Mehr"-Drawer (mobil) */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-ink/40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-lg bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <nav className="grid grid-cols-2 gap-2" aria-label="Weitere Bereiche">
              {items.map((item) => (
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
            </nav>
            <Button variant="secondary" className="mt-3 w-full" onClick={() => void signOut()}>
              Abmelden
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
