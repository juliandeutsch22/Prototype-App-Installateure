import RechtSeite, { Abschnitt } from './RechtSeite';
import { BETREIBER, VERARBEITER } from './betreiber';
import { List, ListRow } from '@/components/ListRow';

/**
 * Datenschutzerklärung der App.
 *
 * WAS HIER STEHT, IST AUS DEM CODE ABGELESEN, nicht aus einer Vorlage: welche
 * Daten die App tatsächlich führt, wo sie liegen, wer sie sieht und wann sie
 * verschwinden. Die rechtliche Einordnung (Rechtsgrundlagen, Drittland) ist
 * der Teil, den jemand mit Rechtskenntnis freigeben muss — deshalb das Band
 * „Entwurf" in `RechtSeite`.
 */
export default function DatenschutzView() {
  return (
    <RechtSeite titel="Datenschutzerklärung">
      <Abschnitt titel="Wer verantwortlich ist">
        <p>
          Senklot ist eine Arbeitsanwendung, die ein Installationsbetrieb für sich und seine
          Mitarbeiter einsetzt. <strong>Verantwortlich</strong> für die Daten, die darin geführt
          werden — Mitarbeiter, Arbeitszeiten, Kunden, Belege —, ist dieser Betrieb (Art. 4 Z 7
          DSGVO). Fragen zu diesen Daten und Anträge auf Auskunft oder Löschung richten Sie an ihn,
          in der Regel an Ihren Arbeitgeber.
        </p>
        <p>
          Der Betreiber von Senklot verarbeitet die Daten im Auftrag des Betriebs
          (Auftragsverarbeiter, Art. 28 DSGVO) auf Grundlage eines Auftragsverarbeitungsvertrags:
          {' '}{BETREIBER.name}, {BETREIBER.anschrift}, {BETREIBER.email}.
        </p>
      </Abschnitt>

      <Abschnitt titel="Welche Daten die App verarbeitet">
        <ul className="list-disc space-y-1 pl-5">
          <li>Ihr Konto: Name, E-Mail-Adresse oder Benutzername, Rolle im Betrieb.</li>
          <li>
            Arbeitszeiten, Einsätze, Urlaube, Zeitausgleich und Krankenstände. Krankenstände sind
            Gesundheitsdaten (Art. 9 DSGVO): sehen können sie nur Sie selbst und die Personen im
            Betrieb, deren Rolle es verlangt; nach einer Diagnose fragt die App nicht.
          </li>
          <li>
            Handwerksscheine mit Unterschriften und, wenn aufgenommen, Fotos; Pläne und Dokumente
            zu Baustellen.
          </li>
          <li>Kunden, Angebote, Rechnungen und Zahlungen des Betriebs.</li>
          <li>Wenn Sie Push-Meldungen erlauben: eine Kennung Ihres Geräts.</li>
          <li>
            Ein Fehlerprotokoll: stürzt die App ab, werden Fehlermeldung, Ansicht, Fassung der App
            und Gerätetyp festgehalten — ohne Inhalte, Namen oder Kennungen. Was Sie unter
            „Problem melden" selbst schreiben, geht mit Ihrem Namen und Ihrer E-Mail-Adresse an den
            Senklot-Support, damit er nachfragen kann. Beides liest nur der Support, nicht der
            Betrieb.
          </li>
          <li>
            Wenn der Betrieb dem Senklot-Support befristet Einblick oder Mitarbeit gewährt: wer
            wann welchen Bereich geöffnet hat. Zeitbuchungen, Urlaube und Krankenstände sind davon ausgenommen.
          </li>
        </ul>
      </Abschnitt>

      <Abschnitt titel="Wozu">
        <p>
          Um die Arbeit des Betriebs zu organisieren und abzurechnen: Arbeitszeitaufzeichnung,
          Lohnverrechnung, Einsatzplanung, Leistungsnachweise und Rechnungen. Rechtsgrundlage ist
          in der Regel das Arbeitsverhältnis und die gesetzliche Aufzeichnungspflicht (Art. 6
          Abs. 1 lit. b und c, für Krankenstände Art. 9 Abs. 2 lit. b DSGVO), für das
          Fehlerprotokoll das berechtigte Interesse an einer funktionierenden Anwendung (Art. 6
          Abs. 1 lit. f DSGVO).
        </p>
      </Abschnitt>

      <Abschnitt titel="Auf Ihrem Gerät">
        <p>
          Die App speichert im Browser, was sie zum Arbeiten braucht: die Anmeldung, einen
          Zwischenstand für die Arbeit ohne Empfang und Buchungen, die noch nicht gesendet werden
          konnten. Es gibt keine Werbe- oder Analyse-Cookies, keine Reichweitenmessung und kein
          Tracking. Die Schriften werden von der App selbst ausgeliefert, nicht von einem fremden
          Dienst.
        </p>
      </Abschnitt>

      <Abschnitt titel="Wer die Daten technisch verarbeitet">
        <p>Der Betreiber setzt diese Unterauftragsverarbeiter ein:</p>
        {/* Eine Liste mit Trennlinien wie überall in der App, statt eines
            Balkens links an jedem Eintrag. Wortlaut unverändert. */}
        <List>
          {VERARBEITER.map((v) => (
            <ListRow
              key={v.wer + v.wofuer}
              title={v.wer}
              subtitle={
                <>
                  <span className="block text-ink">{v.wofuer}</span>
                  <span className="block">{v.wo}</span>
                </>
              }
            />
          ))}
        </List>
        <p>
          Wo ein Anbieter oder seine Muttergesellschaft ihren Sitz in den USA hat, stützt sich die
          Übermittlung auf das EU-US Data Privacy Framework bzw. auf Standardvertragsklauseln der
          EU-Kommission.
        </p>
      </Abschnitt>

      <Abschnitt titel="Wie lange">
        <p>
          Solange der Betrieb die Daten führt und gesetzliche Aufbewahrungsfristen es verlangen
          (etwa sieben Jahre für Buchhaltungsbelege nach § 132 BAO). Sicherungen werden nach 30
          Tagen gelöscht, das Fehlerprotokoll nach 90 Tagen. Endet die Nutzung durch den Betrieb,
          werden seine Daten nach Rückgabe gelöscht, wie im Auftragsverarbeitungsvertrag vereinbart.
        </p>
      </Abschnitt>

      <Abschnitt titel="Ihre Rechte">
        <p>
          Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
          Datenübertragbarkeit und Widerspruch. Wenden Sie sich dafür an den Betrieb, für den Sie
          die App nutzen. Beschwerden können Sie bei der Österreichischen Datenschutzbehörde
          einbringen: Barichgasse 40–42, 1030 Wien, dsb@dsb.gv.at.
        </p>
      </Abschnitt>
    </RechtSeite>
  );
}
