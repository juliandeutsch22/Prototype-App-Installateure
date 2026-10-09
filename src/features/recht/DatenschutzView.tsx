import RechtSeite, { Abschnitt } from './RechtSeite';
import { BETREIBER, VERARBEITER } from './betreiber';

/**
 * Datenschutzerklärung der App.
 *
 * WAS HIER STEHT, IST AUS DEM CODE ABGELESEN, nicht aus einer Vorlage: welche
 * Daten die App tatsächlich führt, wo sie liegen, wer sie sieht und wann sie
 * verschwinden. Die rechtliche Einordnung (Rechtsgrundlagen, Drittland) ist
 * der Teil, den jemand mit Rechtskenntnis freigeben muss — deshalb das Band
 * „Entwurf" in `RechtSeite`.
 *
 * GEDUZT, WIE DIE GANZE APP (offene Punkte A8, entschieden 29.09.2026). Eine
 * Seite, die als einzige siezt, klingt nach Fremdtext — und ist schwerer zu
 * lesen für die, um deren Daten es geht.
 */
export default function DatenschutzView() {
  return (
    <RechtSeite titel="Datenschutzerklärung">
      <Abschnitt titel="Wer verantwortlich ist">
        <p>
          Senklot ist eine Arbeitsanwendung, die ein Installationsbetrieb für sich und seine
          Mitarbeiter einsetzt. <strong>Verantwortlich</strong> für die Daten, die darin geführt
          werden — Mitarbeiter, Arbeitszeiten, Kunden, Belege —, ist dieser Betrieb (Art. 4 Z 7
          DSGVO). Fragen zu diesen Daten und Anträge auf Auskunft oder Löschung richtest du an ihn,
          in der Regel an deinen Arbeitgeber.
        </p>
        <p>
          Der Betreiber von Senklot verarbeitet die Daten im Auftrag des Betriebs
          (Auftragsverarbeiter, Art. 28 DSGVO) auf Grundlage eines Auftragsverarbeitungsvertrags:
          {' '}{BETREIBER.name}, {BETREIBER.anschrift}, {BETREIBER.email}.
        </p>
      </Abschnitt>

      <Abschnitt titel="Welche Daten die App verarbeitet">
        <ul className="list-disc space-y-1 pl-5">
          <li>Dein Konto: Name, E-Mail-Adresse oder Benutzername, Rolle im Betrieb.</li>
          <li>
            Arbeitszeiten, Einsätze, Urlaube, Zeitausgleich und Krankenstände. Krankenstände sind
            Gesundheitsdaten (Art. 9 DSGVO): sehen können sie nur du selbst und die Personen im
            Betrieb, deren Rolle es verlangt; nach einer Diagnose fragt die App nicht.
          </li>
          <li>
            Wenn der Betrieb es einträgt, dein Geburtsdatum — nur, um die Schutzregeln für
            Jugendliche unter 18 zu prüfen (KJBG). Sehen können es du selbst sowie Büro und
            Leitung. Dazu Begründungen des Büros, wenn deine Arbeitszeit eine gesetzliche Grenze
            überschreitet (etwa Notdienst).
          </li>
          <li>
            Handwerksscheine mit Unterschriften und, wenn aufgenommen, Fotos; Pläne und Dokumente
            zu Baustellen.
          </li>
          <li>Kunden, Angebote, Rechnungen und Zahlungen des Betriebs.</li>
          <li>
            Das Änderungsprotokoll der Zeitbuchungen: Buchung, tatsächliche Änderung oder
            Löschung, Zeitpunkt, Bearbeiter sowie der Stand davor und danach. Auch gelöschte
            Buchungen bleiben darin für die Aufbewahrung nachvollziehbar. Sehen kannst du
            deine eigenen Einträge; Buchhaltung, Geschäftsführung und Administration sehen
            die Einträge des Betriebs. Alte Änderungen werden nicht nachträglich rekonstruiert.
          </li>
          <li>
            Prüft das Büro die UID-Nummer eines Kunden, gehen diese Nummer und die UID-Nummer des
            Betriebs an das Abfragesystem VIES der EU-Kommission; Ergebnis, Zeitpunkt und wer
            gefragt hat, stehen danach beim Kunden.
          </li>
          <li>
            Wenn der Betrieb es erlaubt und du ein Kalender-Abo einrichtest: deine Einsätze samt
            Kundenname, Adresse und Ansprechpartner gehen an den Kalenderdienst, den du dafür
            wählst (etwa Google, Apple oder Microsoft). In Senklot steht nur, wann das Abo
            eingerichtet und zuletzt abgeholt wurde; beenden kannst du es jederzeit. Dasselbe gilt
            für die Termine, an denen du teilnimmst oder deren Baustelle du an dem Tag hast.
          </li>
          <li>
            Richtet die Leitung (Geschäftsführung, Administration, Projektleitung) den ganzen
            Einsatzplan als Kalender-Abo ein, gehen auch Name und Einsatzort der Mitarbeiter —
            wer an welchem Tag auf welcher Baustelle ist, mit Uhrzeit und Einstufung — sowie die
            Termine des Betriebs an deren Kalenderdienst. Abwesenheiten wie Urlaub oder
            Krankenstand stehen nicht darin. Das Abo endet, sobald die Person die Einsatzplanung
            nicht mehr sieht.
          </li>
          <li>Wenn du Push-Meldungen erlaubst: eine Kennung deines Geräts.</li>
          <li>
            Ein Fehlerprotokoll: stürzt die App ab, werden Fehlermeldung, Ansicht, Fassung der App
            und Gerätetyp festgehalten — ohne Inhalte, Namen oder Kennungen. Was du unter
            „Problem melden“ selbst schreibst, geht mit deinem Namen und deiner E-Mail-Adresse an den
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

      <Abschnitt titel="Auf deinem Gerät">
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
        <ul className="space-y-3">
          {VERARBEITER.map((v) => (
            <li key={v.wer + v.wofuer} className="border-l-2 border-line pl-3">
              <p className="font-semibold">{v.wer}</p>
              <p className="text-sm">{v.wofuer}</p>
              <p className="text-sm text-ink-muted">{v.wo}</p>
            </li>
          ))}
        </ul>
        <p>
          Wo ein Anbieter oder seine Muttergesellschaft ihren Sitz in den USA hat, stützt sich die
          Übermittlung auf das EU-US Data Privacy Framework bzw. auf Standardvertragsklauseln der
          EU-Kommission.
        </p>
      </Abschnitt>

      <Abschnitt titel="Wie lange">
        <p>
          Solange der Betrieb die Daten führt und gesetzliche Aufbewahrungsfristen es verlangen
          (etwa sieben Jahre für Buchhaltungsbelege und Arbeitszeitaufzeichnungen nach § 132 BAO).
          Verlangst du die Löschung, entfernt der Betrieb, was keiner Aufbewahrung
          unterliegt; aufbewahrte Daten bleiben unter den bestehenden Zugriffsrechten erhalten.
          Die App zeigt dafür Umfang, Frist und den hinterlegten Rechtsgrund an.
          Eine automatische Löschung nach Fristablauf ist noch nicht eingerichtet. Sicherungen im eigenen
          Rechenzentrum werden nach 30 Tagen gelöscht, die Kopie außer Haus nach der Ablauffrist beim
          Anbieter der Sicherung (vorgesehen 90 Tage); das Fehlerprotokoll nach 90 Tagen. Endet die Nutzung durch den Betrieb,
          werden seine Daten nach Rückgabe gelöscht, wie im Auftragsverarbeitungsvertrag vereinbart.
        </p>
      </Abschnitt>

      <Abschnitt titel="Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
          Datenübertragbarkeit und Widerspruch. Wende dich dafür an den Betrieb, für den du die
          App nutzt — die Auskunft kann er dir als Datei aus der App geben. Beschwerden kannst du
          bei der Österreichischen Datenschutzbehörde einbringen: Barichgasse 40–42, 1030 Wien,
          dsb@dsb.gv.at.
        </p>
      </Abschnitt>
    </RechtSeite>
  );
}
