import Card from '@/components/Card';
import Icon from '@/components/Icon';
import { GEFAHR, messungen } from './gefahrVorschlag';

/**
 * E4 AUF DER MUSTERSEITE: die Gefahrfarbe heute und der Vorschlag
 * nebeneinander, im hellen und im dunklen Satz, mit den gemessenen Werten.
 * Nur zum Ansehen — eingebaut ist er nicht (Entscheidung E4: erst ansehen).
 * Die Farben stehen hier fest im Stil, weil beide Sätze gleichzeitig zu
 * sehen sein sollen, unabhängig von der gewählten Darstellung.
 */
const zahl = (n: number) => n.toFixed(1).replace('.', ',');

function Probe({ satz, farbe, titel }: { satz: 'hell' | 'dunkel'; farbe: string; titel: string }) {
  const s = GEFAHR[satz];
  return (
    <div className="muster-gefahr-probe" style={{ background: s.blatt, color: s.text }}>
      <p className="muster-gefahr-titel">{titel} <span className="font-mono">{farbe}</span></p>
      <div className="muster-gefahr-reihe">
        {/* Aktion, Gefahr und Warnung nebeneinander — genau dort verwechselte man sie. */}
        <span className="muster-gefahr-knopf" style={{ background: s.knopf, color: s.knopfText }}>Speichern</span>
        <span className="muster-gefahr-knopf" style={{ border: `1px solid ${farbe}`, color: farbe }}>Löschen</span>
      </div>
      <p className="muster-gefahr-zeile" style={{ color: farbe }}><Icon name="warnung" size={16} /> Überfällig seit 6 Tagen</p>
      <p className="muster-gefahr-zeile" style={{ color: s.warnung }}><Icon name="warnung" size={16} /> Zwischenstand — es kommen noch Stunden dazu</p>
      <p style={{ color: s.terrakotta }}>Verweis in Terrakotta ›</p>
    </div>
  );
}

export default function MusterGefahr() {
  return (
    <Card
      title="Vorschlag: Gefahr vom Terrakotta absetzen (E4)"
      hint="Nur zum Ansehen, nicht eingebaut. Heute liegen Aktion (Terrakotta), Gefahr und Warnung im Ton fast aufeinander. Der Vorschlag dreht die Gefahr ins Karmin — kühler, Richtung Rot-Violett —, bleibt auf Papier und Blatt gut lesbar und ändert an Terrakotta und Warnung nichts. Kontrast nach WCAG 2.1 (AA ab 4,5 : 1), Abstand als ΔE im Farbraum Lab (ab etwa 20 eindeutig verschieden)."
    >
      <div className="muster-gefahr">
        {(['hell', 'dunkel'] as const).map((satz) => (
          <section key={satz} aria-label={satz === 'hell' ? 'Heller Satz' : 'Dunkler Satz'}>
            <p className="section-label">{satz === 'hell' ? 'Heller Satz' : 'Dunkler Satz'}</p>
            <div className="muster-gefahr-paar">
              <Probe satz={satz} farbe={GEFAHR[satz].alt} titel="Heute" />
              <Probe satz={satz} farbe={GEFAHR[satz].neu} titel="Vorschlag" />
            </div>
            <table className="tabelle tabelle-eng muster-gefahr-tabelle">
              <thead><tr><th>Messung</th><th>heute</th><th>Vorschlag</th></tr></thead>
              <tbody>
                {messungen(satz).map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td className="font-mono">{zahl(m.alt)}{m.art === 'kontrast' ? ' : 1' : ''}</td>
                    <td className="font-mono">{zahl(m.neu)}{m.art === 'kontrast' ? ' : 1' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Card>
  );
}
