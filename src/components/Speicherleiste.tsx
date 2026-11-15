import type { ReactNode } from 'react';
import Aktionsleiste from './Aktionsleiste';
import Button from './Button';

/**
 * DIE SPEICHERLEISTE — Muster 3 der Hauptaktion (U1, Durchsicht 15.11.2026):
 * jedes Formular und jede Einstellung speichert über diese eine Leiste.
 *
 * Vorher stand „Speichern“ an fünf verschiedenen Stellen: im Fluss am Ende
 * einer Karte („Sätze speichern“), als klebende Leiste mit Statuszeile
 * (Firmendaten), als Balken, der erst bei einer Änderung kam (Benutzerakte).
 * Wer eine Einstellung ändert, sucht den Knopf jedes Mal neu — und am Handy
 * lag er oft eine Bildschirmhöhe tiefer.
 *
 * Jetzt überall gleich:
 * - ERST BEI EINER ÄNDERUNG. Ohne Änderung gibt es nichts zu speichern; ein
 *   gesperrter Knopf, der immer dasteht, ist eine Frage ohne Antwort. Die
 *   Leiste bleibt während des Speicherns stehen („Speichert …“) und danach,
 *   wenn die Seite es bestätigt (`gespeichert`, `useSpeicherstand`), mit
 *   „Gespeichert“ — derselbe Knopf in derselben Breite (E72, Premium). Die
 *   nächste Änderung macht daraus wieder „Speichern“.
 * - KLEBEND, über der unteren Navigation (`Aktionsleiste`), in einem Blatt am
 *   unteren Rand des Blatts — der Daumen erreicht sie, egal wie weit oben
 *   geändert wurde.
 * - „Verwerfen“ links, „Speichern“ rechts, darüber ein Satz zum Stand.
 *
 * Ohne `onSpeichern` ist „Speichern“ der Absendeknopf des Formulars, in dem
 * die Leiste steht — Enter im Feld speichert wie bisher.
 */
export default function Speicherleiste({
  geaendert,
  speichert = false,
  onVerwerfen,
  onSpeichern,
  speichernText = 'Speichern',
  gesperrt = false,
  gespeichert = false,
  stand,
}: {
  /** Weicht die Eingabe vom gespeicherten Stand ab? Nur dann steht die Leiste da. */
  geaendert: boolean;
  speichert?: boolean;
  /** Zurück auf den gespeicherten Stand. */
  onVerwerfen: () => void;
  /** Ohne Angabe: Absendeknopf (`type="submit"`) des umgebenden Formulars. */
  onSpeichern?: () => void;
  /** Wenn der Name der Sache dazugehört („Kontenrahmen speichern“). */
  speichernText?: string;
  /** Speichern und Verwerfen gehen gerade nicht (etwa: ein Logo lädt noch hoch); den Grund nennt die Seite. */
  gesperrt?: boolean;
  /** Das Speichern ist bestätigt und seither nichts geändert (`useSpeicherstand`). */
  gespeichert?: boolean;
  /** Ein eigener Satz zum Stand statt „Nicht gespeicherte Änderungen“. */
  stand?: ReactNode;
}) {
  if (!geaendert && !speichert && !gespeichert) return null;
  const fertig = gespeichert && !geaendert && !speichert;
  return (
    <Aktionsleiste
      // B4 (Paket 10b): nach dem bestätigten Speichern zieht sich die Leiste zurück — in jedem Formular.
      ruht={fertig}
      summe={{
        name: <span role="status" className="lot-speicherstand">{speichert ? 'Änderungen werden gespeichert …' : stand ?? (fertig ? 'Gespeichert' : 'Nicht gespeicherte Änderungen')}</span>,
        wert: null,
      }}
      // Der Platzhalter hält die Spalte, damit „Gespeichert“ nicht in der Breite springt.
      links={fertig ? <span className="lot-speicherplatz" aria-hidden="true" /> : <Button type="button" variant="ghost" onClick={onVerwerfen} disabled={speichert || gesperrt}>Verwerfen</Button>}
      rechts={
        <Button
          type={onSpeichern ? 'button' : 'submit'}
          onClick={onSpeichern}
          loading={speichert}
          gespeichert={fertig}
          disabled={gesperrt || fertig}
          data-speicherleiste=""
        >
          {speichert ? 'Speichert …' : fertig ? 'Gespeichert' : speichernText}
        </Button>
      }
    />
  );
}
