import Card from '@/components/Card';
import Hinweiszeile from '@/components/Hinweiszeile';

/**
 * U5 UND U9 AUF DER MUSTERSEITE: Warn- und Fehlertext tragen ihr Zeichen
 * (die Regel in `index.css`), und ein langer Warntext steht als ein Satz
 * plus „Anzeigen“. Nichts hier wird gespeichert.
 */
export default function MusterHinweise() {
  return (
    <Card title="Warnung: Zeichen und ein Satz" hint="Text in Warn- oder Fehlerfarbe trägt immer das Dreieck. Von einer langen Warnung steht der eine Satz da; was ihn erklärt oder aufzählt, kommt auf „Anzeigen“. Im Fenster und neben einem Knopf bleibt der Text offen — dort ist er die Entscheidung selbst.">
      <div className="space-y-3">
        <p className="text-meta text-warning">Kein Ansprechpartner hinterlegt.</p>
        <p className="text-meta text-danger">Die Rechnung konnte nicht erstellt werden.</p>
        <Hinweiszeile
          stufe="fehl"
          einzelheiten={<p>Der Saldo zählt beide. Betroffen: 02.11.2026, 05.11.2026, 09.11.2026 — bitte in der Liste den überflüssigen Eintrag löschen.</p>}
        >
          <p><strong>An 3 Tagen steht dieselbe Buchung zweimal.</strong></p>
        </Hinweiszeile>
      </div>
    </Card>
  );
}
