import { Component, type ErrorInfo, type ReactNode } from 'react';
import { darfNeuLaden, istNachladeFehler } from '@/lib/nachladen';
import { huelleErneuernUndNeuLaden } from '@/lib/sw';
import { FASSUNG } from '@/lib/fassung';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
  /** Ein Neuladen ist bereits ausgelöst — dann keine Fehlertafel zeigen. */
  laedtNeu: boolean;
}

/**
 * Erkennung und Schleifenschutz liegen in `lib/nachladen.ts` — dieselbe
 * Antwort braucht auch `vite:preloadError`, das schon VOR React zuschlägt.
 * Hier weiterhin ausgeführt, weil die Tests der Fehlergrenze sie prüfen.
 */
export { istNachladeFehler } from '@/lib/nachladen';

/**
 * Fängt Render-Fehler ab. Ohne das führt ein einziger Fehler in einer
 * Komponente zur weißen Seite — auf der Baustelle wäre die App damit
 * schlicht kaputt, ohne Hinweis, was zu tun ist.
 *
 * Bewusst eine Klassenkomponente: React bietet für Fehlergrenzen bis heute
 * keinen Hook.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, laedtNeu: false };

  static getDerivedStateFromError(error: Error): State {
    // Ein Nachladefehler heilt gleich durch ein Neuladen. Bis dahin gehört
    // hier KEINE Alarmtafel hin — sie wäre eine Sekunde später ohnehin weg.
    return { error, laedtNeu: istNachladeFehler(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kein externer Dienst: die Meldung bleibt im Gerät des Nutzers (DSGVO).
    console.error('Unerwarteter Fehler:', error, info.componentStack);

    /**
     * EIN NACHLADEFEHLER HEILT NUR DURCH NEULADEN.
     *
     * „Erneut versuchen" hilft hier nicht, und das ist keine Meinung: React
     * merkt sich das abgelehnte Versprechen eines `lazy`-Imports. Derselbe
     * Versuch scheitert danach sofort wieder, ohne das Netz auch nur zu
     * fragen. Der Monteur tippte also auf einen Knopf, der nichts tun KANN.
     *
     * Beim Neuladen greift die neue `index.html`, die der Service Worker beim
     * Erkennen des Deploys bereits abgelegt hat — sie zeigt auf die Namen,
     * die es auf dem Server noch gibt.
     */
    if (!istNachladeFehler(error)) return;
    if (darfNeuLaden()) {
      /*
        ERST DIE HUELLE ERNEUERN, DANN LADEN. Ein sofortiges Neuladen holte
        dieselbe alte `index.html` aus dem Speicher des Workers, fand
        denselben fehlenden Baustein — und beim zweiten Versuch griff der
        Schleifenschutz. Genau so entstand die Fehlertafel, die aus dem
        Betrieb gemeldet wurde, obwohl die neue Fassung längst da war.
      */
      void huelleErneuernUndNeuLaden();
      return;
    }
    /**
     * Der Schleifenschutz hat gegriffen — es wurde eben schon einmal neu
     * geladen und es hat nicht geholfen. JETZT gehört die Tafel hin: sonst
     * stünde „wird neu geladen" für immer da, und niemand käme weiter.
     */
    this.setState({ laedtNeu: false });
  }

  render() {
    const { error, laedtNeu } = this.state;
    if (!error) return this.props.children;

    /**
     * WÄHREND DES NEULADENS EIN RUHIGES BILD, KEIN ALARM.
     *
     * Aus dem Betrieb gemeldet: „die Meldung, dass etwas nicht geladen werden
     * konnte, erscheint immer noch, wenn auch nur ganz kurz." Genau das war
     * es — die volle Fehlertafel mit „Da ist etwas schiefgelaufen" blitzte
     * auf, bevor das ausgelöste Neuladen griff. Der Vorgang ist harmlos, das
     * Bild war es nicht.
     */
    if (laedtNeu) {
      return (
        <div className="flex min-h-full items-center justify-center p-6">
          <p className="text-sm text-ink-muted">Neue Fassung wird geladen …</p>
        </div>
      );
    }

    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-bold text-ink">Da ist etwas schiefgelaufen</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {istNachladeFehler(error)
              ? 'Die Ansicht konnte nicht nachgeladen werden — meist, weil es gerade eine neue Fassung gibt. „Zur Startseite" holt sie. Deine gespeicherten Daten sind davon nicht betroffen.'
              : 'Die Ansicht konnte nicht geladen werden. Deine gespeicherten Daten sind davon nicht betroffen.'}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="min-h-touch rounded-sm bg-brand px-4 py-2 font-semibold text-brand-fg"
            >
              Erneut versuchen
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="min-h-touch rounded-sm border border-line px-4 py-2 font-medium text-ink"
            >
              Zur Startseite
            </button>
          </div>
          <details className="mt-4 text-xs text-ink-muted">
            <summary className="cursor-pointer">Technische Details</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
              {error.message}
            </pre>
            {/*
              Die Fassung gehoert in JEDE Fehlermeldung. Ein Bildschirmfoto
              der Tafel sagt sonst nur, DASS etwas schiefging — nicht, auf
              welchem Stand. Genau daran ist die letzte Suche haengengeblieben.
            */}
            <p className="mt-2">Fassung {FASSUNG}</p>
          </details>
        </div>
      </div>
    );
  }
}
