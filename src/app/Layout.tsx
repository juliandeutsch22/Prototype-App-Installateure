import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { navForRole } from './navigation';
import Button from '@/components/Button';

/** App-Shell: mobile-first mit ausklappbarer Navigation, Desktop mit Sidebar. */
export default function Layout({ children }: { children: ReactNode }) {
  const { user, company, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return <>{children}</>;

  const items = navForRole(user.role);
  const brand = company?.name ?? 'Installateur-App';

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Hauptnavigation">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `min-h-touch rounded-lg px-3 py-2 text-base font-medium ${
              isActive ? 'bg-brand text-brand-fg' : 'text-gray-700 hover:bg-gray-100'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Topbar (mobil) */}
      <header className="flex items-center justify-between border-b bg-white p-3 md:hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          className="min-h-touch min-w-touch rounded-lg px-3 text-gray-700 hover:bg-gray-100"
          aria-label="Navigation umschalten"
          aria-expanded={open}
        >
          ☰
        </button>
        <span className="font-semibold">{brand}</span>
        <span className="w-10" />
      </header>

      {/* Sidebar */}
      <aside
        className={`${open ? 'block' : 'hidden'} border-b bg-white p-3 md:block md:w-64 md:shrink-0 md:border-b-0 md:border-r`}
      >
        <div className="mb-4 hidden items-center gap-2 md:flex">
          {company?.logoUrl && <img src={company.logoUrl} alt="" className="h-8 w-8 rounded" />}
          <span className="text-lg font-bold text-gray-900">{brand}</span>
        </div>
        {nav}
        <div className="mt-4 border-t pt-4">
          <p className="px-3 text-sm text-gray-600">{user.name}</p>
          <p className="px-3 text-xs text-gray-400">{user.role}</p>
          <Button variant="ghost" className="mt-2 w-full" onClick={() => void signOut()}>
            Abmelden
          </Button>
        </div>
      </aside>

      {/* Inhalt */}
      <main className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
