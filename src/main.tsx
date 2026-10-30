import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { ToastProvider } from './components/Toast';
import NeueFassung from './components/NeueFassung';
import VerloreneBuchung from './components/VerloreneBuchung';
import Nachsender from './components/Nachsender';
import { nachladefehlerBeobachten } from './lib/nachladen';
import { fehlerBeobachten } from './lib/fehlerprotokoll';
import { schluesselUmziehen, firestoreResteEntfernen } from './lib/speicher';
import { darstellungAnwenden } from './lib/darstellung';
import { startansichtVorladen } from './lib/ansichten';
import { sitzungVermutlich } from './lib/supabase';
// Poppins self-gehostet (kein Google-CDN -> keine IP-Übermittlung an Google, DSGVO).
// Text und Titel bleiben 400/600; Zahlen erhalten den freigegebenen leichteren Schnitt.
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
// IBM Plex Mono für alles Gemessene (Planlinie, E30) — ebenfalls lokal, die CSP lässt keine fremden Schriften zu.
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './index.css';

// Die Schlüssel im Browser heissen nach dem Produkt, nicht nach dem
// Pilotbetrieb; Reste der Firestore-Zeit gehen (Testbericht 30.09.2026, M9).
// Vor allem anderen: die Anmeldung liest ihren Merker gleich beim Start.
schluesselUmziehen();
darstellungAnwenden();
void firestoreResteEntfernen();

// Scheitert nach einem Deploy das Nachladen einer Ansicht, einmal neu laden —
// bevor daraus eine Fehlertafel wird. Siehe lib/nachladen.ts.
nachladefehlerBeobachten();

// Was an der Fehlergrenze vorbeigeht — ein Fehler in einem Klick, ein
// unbehandeltes Versprechen — ins eigene Protokoll. Siehe lib/fehlerprotokoll.ts.
fehlerBeobachten();

// Wer angemeldet ist, bekommt den Baustein seiner Seite schon, während die Anmeldung geprüft wird.
if (sitzungVermutlich()) startansichtVorladen(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
        {/* Meldet sich nur, wenn nach dem Start eine neue Fassung eintrifft. */}
        <NeueFassung />
        {/* Meldet sich nur, wenn eine vorgemerkte Buchung doch verlorengeht. */}
        <VerloreneBuchung />
        {/* Sendet nach, was ohne Empfang vorgemerkt wurde. Ohne das läge es. */}
        <Nachsender />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
