import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { ToastProvider } from './components/Toast';
import NeueFassung from './components/NeueFassung';
import { verbindungBeimAufwachenErneuern } from './lib/firebase';
import { nachladefehlerBeobachten } from './lib/nachladen';
// Poppins self-gehostet (kein Google-CDN -> keine IP-Übermittlung an Google, DSGVO).
// Nur die tatsächlich genutzten Schnitte, damit der Erstaufruf auf der Baustelle
// (schlechtes Netz) schlank bleibt.
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import './index.css';

// Nach laengerem Wegschalten die Firestore-Verbindung erneuern — siehe
// lib/firebase.ts. Muss vor dem ersten Rendern stehen, damit auch ein sofort
// weggeschaltetes Fenster erfasst wird.
verbindungBeimAufwachenErneuern();

// Scheitert nach einem Deploy das Nachladen einer Ansicht, einmal neu laden —
// bevor daraus eine Fehlertafel wird. Siehe lib/nachladen.ts.
nachladefehlerBeobachten();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
        {/* Meldet sich nur, wenn nach dem Start eine neue Fassung eintrifft. */}
        <NeueFassung />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
