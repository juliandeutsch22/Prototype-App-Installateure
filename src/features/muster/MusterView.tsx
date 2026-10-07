import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import RowMenu from '@/components/RowMenu';
import Metric, { MetricRow } from '@/components/Metric';
import InfoHint from '@/components/InfoHint';
import BottomSheet from '@/components/BottomSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import { ListRow, List } from '@/components/ListRow';
import { Zustand, Marke } from '@/components/Badge';
import { EmptyState } from '@/components/States';
import { InputField, SelectField, FormGrid } from '@/components/Field';
import {
  Arbeitszeile,
  Kurzzeile,
  LotVerlauf,
  MehrAnzeigen,
  Sammelleiste,
  Segmente,
  WeitereAngaben,
} from '@/components/LotBausteine';
import { useToast } from '@/components/Toast';
import { useDarstellung } from '@/lib/darstellung';

/**
 * DIE MUSTERSEITE DER LINIE „LOT“ (Protokoll Abschnitt 4.2): jeder Baustein
 * einmal, mit Beispieldaten und ohne Wirkung auf den Betrieb. Nur für
 * Administrator und globalen Admin — sie ist ein Werkzeug für die Abnahme,
 * kein Teil der Arbeit.
 *
 * Hier wird nichts gespeichert. Jede „Aktion“ zeigt nur eine Meldung.
 */

const FARBEN: [string, string][] = [
  ['Papier', '--papier'],
  ['Fläche', '--flaeche'],
  ['Tinte', '--tinte'],
  ['Grau', '--grau'],
  ['Linie', '--linie'],
  ['Linie stark', '--linie-stark'],
  ['Petrol', '--petrol'],
  ['Petrol tief', '--petrol-tief'],
  ['Petrol hell', '--petrol-hell'],
  ['Navigation', '--navi'],
  ['Achtung', '--achtung'],
  ['Fehler', '--fehler'],
  ['Abwesend', '--abwesend'],
];

const ANFORDERUNGEN = [
  { id: 'a1', titel: 'Kupferrohr 15 mm, 10 m', info: 'Baustelle Gleisdorf · eilt', schritt: 'Annehmen' },
  { id: 'a2', titel: 'Pressfitting Bogen 15 mm, 20 Stk', info: 'Baustelle Weiz · seit gestern', schritt: 'Annehmen' },
  { id: 'a3', titel: 'Thermostatkopf, 4 Stk', info: 'Baustelle Graz · abholbereit', schritt: 'Abgeholt' },
];

export default function MusterView() {
  const toast = useToast();
  const [darstellung, setDarstellung] = useDarstellung();
  const [ansicht, setAnsicht] = useState<'woche' | 'monat'>('woche');
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [fenster, setFenster] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [gezeigt, setGezeigt] = useState(2);
  const zeilen = ['Familie Huber', 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', 'Gasthof Post', 'Bäckerei Pichler', 'Volksschule Weiz'];

  const wahl = (id: string, an: boolean) =>
    setGewaehlt((g) => (an ? [...g, id] : g.filter((x) => x !== id)));

  return (
    <div className="space-y-6">
      <PageHeader
        ort="Werkzeug für die Abnahme"
        title="Musterseite"
        subtitle="Jeder Baustein der Linie „Lot“ einmal — ohne Wirkung auf den Betrieb"
        hilfe="Diese Seite zeigt die Bausteine der Oberfläche. Nichts hier wird gespeichert."
        mehr={
          <RowMenu
            about="Musterseite"
            items={[
              { label: 'Beispiel: Exportieren', onSelect: () => toast.info('Nur ein Muster.') },
              { label: 'Beispiel: Löschen', onSelect: () => setDialog(true), danger: true },
            ]}
          />
        }
        action={<Button onClick={() => setFenster(true)}>Seitenfenster öffnen</Button>}
      />

      <Card title="Darstellung" hint="Hell ist Standard. Dunkel gilt nur auf diesem Gerät und nur auf ausdrückliche Wahl.">
        <Segmente
          name="Darstellung"
          werte={[{ wert: 'hell', text: 'Hell' }, { wert: 'dunkel', text: 'Dunkel' }]}
          wert={darstellung}
          onChange={setDarstellung}
        />
      </Card>

      <Card title="Grundwerte">
        <div className="grid grid-cols-2 gap-x-6 md:grid-cols-3">
          {FARBEN.map(([name, token]) => (
            <div key={token} className="muster-farbe">
              <span className="muster-feld" style={{ background: `var(${token})` }} aria-hidden="true" />
              <span>{name}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-2xl font-semibold">Seitentitel 26</p>
        <p className="text-lg font-semibold">Abschnitt 18</p>
        <p className="text-fliess">Fliesstext 15</p>
        <p className="text-meta text-ink-muted">Nebeninfo 13</p>
      </Card>

      <MetricRow>
        <Metric label="Offen" value="€ 18 240,00" to="/_muster" />
        <Metric label="Überfällig" value="€ 1 120,00" tone="danger" to="/_muster" />
        <Metric label="Nicht verrechnet" value="3 Scheine" to="/_muster" />
        <Metric label="Baustellen" value="14" to="/_muster" />
      </MetricRow>

      <Card title="Zu erledigen" buendig>
        <List>
          {zeilen.slice(0, gezeigt).map((z, i) => (
            <ListRow
              key={z}
              title={z}
              subtitle={i === 0 ? 'RE-2026-1498 · seit 6 Tagen' : 'Baustelle · diese Woche'}
              wert={i === 0 ? '€ 1 120,00' : undefined}
              zustand={i === 0 ? <Zustand stand="schlecht">mahnen</Zustand> : <Zustand stand="offen">einplanen</Zustand>}
              onOeffnen={() => setFenster(true)}
              pfeil
            />
          ))}
        </List>
        <MehrAnzeigen anzahl={zeilen.length - gezeigt} onClick={() => setGezeigt(zeilen.length)} />
      </Card>

      <Card title="Fünf Zustände">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Zustand stand="offen">offen</Zustand>
          <Zustand stand="laeuft">läuft</Zustand>
          <Zustand stand="ruht">erledigt</Zustand>
          <Zustand stand="achtung">Achtung</Zustand>
          <Zustand stand="schlecht">Fehler</Zustand>
          <Marke>Marke ohne Urteil</Marke>
        </div>
      </Card>

      <Card title="Arbeitsliste" buendig>
        <div className="p-4">
          <Sammelleiste
            anzahl={gewaehlt.length}
            aktion={{
              text: 'Alle: nächster Schritt',
              onClick: () => {
                const vorher = gewaehlt;
                setGewaehlt([]);
                toast.success(`${vorher.length} weitergesetzt`, { label: 'Rückgängig', onClick: () => setGewaehlt(vorher) });
              },
            }}
            onAufheben={() => setGewaehlt([])}
          />
        </div>
        <ul>
          {ANFORDERUNGEN.map((a) => (
            <Arbeitszeile
              key={a.id}
              name={a.titel}
              gewaehlt={gewaehlt.includes(a.id)}
              onWahl={(an) => wahl(a.id, an)}
              onOeffnen={() => setFenster(true)}
              schritt={{ text: a.schritt, onClick: () => toast.success(`${a.schritt}: ${a.titel}`, { label: 'Rückgängig', onClick: () => toast.info('Zurückgenommen.') }) }}
            >
              <span className="zeile-text">
                <span className="zeile-titel block">{a.titel}</span>
                <span className="zeile-meta block">{a.info}</span>
              </span>
            </Arbeitszeile>
          ))}
        </ul>
      </Card>

      <Card title="Auswahl als Segmente">
        <Segmente
          name="Ansicht"
          werte={[{ wert: 'woche', text: 'Woche' }, { wert: 'monat', text: 'Monat' }]}
          wert={ansicht}
          onChange={setAnsicht}
        />
      </Card>

      <Card title="Akte: Kurzzeilen und Verlauf" buendig>
        <Kurzzeile name="Kunde" wert="Familie Huber">Hauptplatz 1, 8200 Gleisdorf · 0664 123 45 67</Kurzzeile>
        <Kurzzeile name="Budget" wert="40 h, davon 31 h gebucht">Facharbeiter 24 h, Helfer 7 h</Kurzzeile>
        <div className="border-t border-line p-4">
          <LotVerlauf
            name="Verlauf"
            punkte={[
              { titel: 'Angelegt', zeit: '02.10.2026' },
              { titel: 'Eingeplant', zeit: '05.10.2026' },
              { titel: 'In Arbeit', zeit: 'heute', jetzt: true },
            ]}
          />
        </div>
      </Card>

      <Card title="Formular">
        <div className="formular space-y-4">
          <InputField id="m-name" label="Name" pflicht defaultValue="Familie Huber" />
          <FormGrid>
            <InputField id="m-plz" label="PLZ" defaultValue="8200" />
            <InputField id="m-ort" label="Ort" defaultValue="Gleisdorf" />
          </FormGrid>
          <p className="text-meta text-ink-muted">
            Hinweise höchstens eine Zeile <InfoHint about="Hinweise">Längeres steht hinter „Hilfe zu dieser Seite“.</InfoHint>
          </p>
          <WeitereAngaben>
            <SelectField id="m-art" label="Kundenart" defaultValue="privat">
              <option value="privat">Privat</option>
              <option value="unternehmen">Unternehmen</option>
            </SelectField>
          </WeitereAngaben>
          <div className="fuss-aktionen">
            <Button variant="secondary" onClick={() => toast.info('Nichts geändert.')}>Abbrechen</Button>
            <Button onClick={() => toast.success('Gespeichert (Muster).')}>Speichern</Button>
          </div>
        </div>
      </Card>

      <Card title="Leerer Zustand" buendig>
        <EmptyState>Heute liegt nichts an.</EmptyState>
      </Card>

      <BottomSheet open={fenster} onClose={() => setFenster(false)} label="Muster" auchBreit titel="Seitenfenster">
        <p className="text-fliess">Am Schreibtisch und Tablet rechts, am Handy ein Blatt von unten. Esc schliesst.</p>
        <div className="mt-4">
          <Button onClick={() => setFenster(false)}>Fertig</Button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={dialog}
        title="Unumkehrbar"
        message="Bestätigung nur für Unumkehrbares — sonst „Rückgängig“."
        onConfirm={() => setDialog(false)}
        onCancel={() => setDialog(false)}
      />
    </div>
  );
}
