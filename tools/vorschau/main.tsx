import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@/index.css';
import { darstellungAnwenden } from '@/lib/darstellung';
import { vorladenAbschalten } from '@/lib/ansichten';
import App from '@/app/App';
import { ToastProvider } from '@/components/Toast';

/*
 * `MemoryRouter` und nicht `BrowserRouter`: so laesst sich jede Route ueber
 * `?pfad=/invoices` aufrufen, ohne dass der Vite-Server fuer jeden Pfad eine
 * Umschreibung braucht.
 */
const pfad = new URLSearchParams(location.search).get('pfad') ?? '/';

// Wie in src/main.tsx: hell, ausser dieses Gerät hat dunkel gewählt.
darstellungAnwenden();
// Jede Seite wird hier frisch geladen; Vorladen holte jedes Mal alle Ansichten.
vorladenAbschalten();

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[pfad]}>
    <ToastProvider>
      <App />
    </ToastProvider>
  </MemoryRouter>,
);
