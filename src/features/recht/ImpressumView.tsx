import RechtSeite, { Abschnitt } from './RechtSeite';
import { BETREIBER } from './betreiber';

/**
 * Impressum nach § 5 ECG, § 14 UGB und § 25 MedienG — für die App Senklot.
 *
 * Es nennt den BETREIBER der Software, nicht den Installationsbetrieb, der sie
 * benutzt: der steht mit seinen Firmendaten auf seinen eigenen Belegen.
 */
export default function ImpressumView() {
  return (
    <RechtSeite titel="Impressum">
      <Abschnitt titel="Medieninhaber und Diensteanbieter">
        <p>
          {BETREIBER.name}
          <br />
          {BETREIBER.anschrift}
        </p>
        <p>
          E-Mail: {BETREIBER.email}
          <br />
          Telefon: {BETREIBER.telefon}
        </p>
      </Abschnitt>

      <Abschnitt titel="Unternehmensangaben">
        <p>Unternehmensgegenstand: Entwicklung und Betrieb der Software „Senklot" für Installationsbetriebe.</p>
        <p>UID-Nummer: {BETREIBER.uid}</p>
        <p>Firmenbuch: {BETREIBER.firmenbuch}</p>
        <p>Gewerbe und Aufsicht: {BETREIBER.gewerbe}</p>
        <p>
          Anwendbare Vorschriften: Gewerbeordnung, abrufbar unter{' '}
          <a href="https://www.ris.bka.gv.at" className="underline underline-offset-2" rel="noreferrer" target="_blank">
            www.ris.bka.gv.at
          </a>
          .
        </p>
      </Abschnitt>

      <Abschnitt titel="Grundlegende Richtung">
        <p>
          Senklot ist eine Arbeitsanwendung für Installationsbetriebe: Zeiterfassung, Einsätze,
          Material, Handwerksscheine, Angebote und Rechnungen. Die Inhalte, die ein Betrieb darin
          führt, verantwortet dieser Betrieb.
        </p>
      </Abschnitt>

      <Abschnitt titel="Streitbeilegung">
        <p>
          Senklot richtet sich an Unternehmen, nicht an Verbraucher. Zur Teilnahme an einem
          Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle ist der Betreiber
          weder verpflichtet noch bereit.
        </p>
      </Abschnitt>
    </RechtSeite>
  );
}
