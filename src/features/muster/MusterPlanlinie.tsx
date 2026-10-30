import Card from '@/components/Card';
import Abschnitt from '@/components/Abschnitt';
import Metric, { MetricRow } from '@/components/Metric';
import { Zustand } from '@/components/Badge';
import {
  Eckmarken,
  Hinweislinie,
  LotZeichen,
  Masskette,
  Masslinie,
  MasslinieZeile,
  Modulskizze,
  Saldolinie,
  Stempel,
  type SkizzenMotiv,
} from '@/components/Planlinie';

/*
  DIE BAUSTEINE DER PLANLINIE (Auftrag 30.10.2026, E30) auf der Musterseite —
  jede Variante einmal, mit Beispieldaten, hell und dunkel über den Schalter
  oben. Erst hier, dann auf den Seiten: so lässt sich jeder Baustein für sich
  abnehmen.
*/
const SKIZZEN: [SkizzenMotiv, string][] = [
  ['bau', 'Start'],
  ['baustelle', 'Baustellen'],
  ['planung', 'Einsatzplanung'],
  ['schein', 'Handwerksscheine'],
  ['angebot', 'Angebote'],
  ['kunde', 'Kunden'],
  ['wartung', 'Wartungen'],
  ['rechnung', 'Rechnungen'],
  ['waage', 'Nachkalkulation'],
  ['zeit', 'Zeit, Urlaub'],
  ['team', 'Mitarbeiter, Benutzer'],
  ['lager', 'Material, Lager'],
  ['einstellungen', 'Einstellungen'],
];

const dauer = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

export default function MusterPlanlinie() {
  return (
    <>
      <Card title="Planlinie · B1 Schriftfeld und Lineal">
        <div className="schriftfeld">
          <MetricRow label="Beispiel">
            <Metric label="Aktiv" value="15" hint="laufende Baustellen" />
            <Metric label="Über Budget" value="2" tone="danger" hint="Stunden über Budget" />
            <Metric label="Ab 90 %" value="1" tone="warning" hint="nahe am Budget" />
            <Metric label="Ende überschritten" value="0" hint="Endtermin vorbei" />
          </MetricRow>
          <div className="schriftfeld-skizze"><Modulskizze motiv="baustelle" /></div>
        </div>
        <div className="lineal" aria-hidden="true" />
        <p className="mt-4 flex flex-wrap items-center gap-3 text-sm">B10 Nummernstempel: <Stempel>PR-2026-0194</Stempel> <Stempel>RE-2026-1502</Stempel> <Stempel gross>AN-2026-0009</Stempel></p>
      </Card>

      <Card title="Planlinie · B2 Maßlinie und B2a Saldolinie">
        <MasslinieZeile name="Im Rahmen">
          <Masslinie ist={12} soll={16} istText="12,0 h gebucht" sollText="Budget 16 h" name="12,0 h gebucht von 16 h Budget" />
        </MasslinieZeile>
        <MasslinieZeile name="Nahe am Budget">
          <Masslinie ist={14.5} soll={16} achtung istText="14,5 h gebucht" sollText="Budget 16 h · 1,5 h verbleibend" name="14,5 h gebucht von 16 h Budget" />
        </MasslinieZeile>
        <MasslinieZeile name="Überschritten">
          <Masslinie ist={45} soll={16} istText="45,0 h gebucht (davon 16,0 h Lehrling)" sollText="Budget 16 h" ueberText="+29,0 h über Budget" name="45,0 h gebucht von 16 h Budget, 29,0 h darüber" />
        </MasslinieZeile>
        <MasslinieZeile name="Schmal, in der Zeile">
          <div className="w-60"><Masslinie schmal ist={20.5} soll={16} istText="20,5 h gebucht" sollText="16 h" ueberText="+4,5 h" name="20,5 h gebucht von 16 h Budget, 4,5 h darüber" /></div>
        </MasslinieZeile>
        <MasslinieZeile name="Saldo">
          <span className="flex flex-wrap items-center gap-4 text-sm">
            <Saldolinie minuten={-160 * 60} massstabMinuten={240 * 60} name="Saldo minus 160 Stunden" /> <span className="mono">-160:00</span>
            <Saldolinie minuten={12 * 60} massstabMinuten={240 * 60} name="Saldo plus 12 Stunden" /> <span className="mono">+12:00</span>
          </span>
        </MasslinieZeile>
      </Card>

      <Card title="Planlinie · B3 Statuszeichen und B4 Lot">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Zustand stand="geplant">geplant</Zustand>
          <Zustand stand="offen">offen</Zustand>
          <Zustand stand="laeuft">in Arbeit, teilbezahlt</Zustand>
          <Zustand stand="erledigt">erledigt, bezahlt</Zustand>
          <Zustand stand="achtung">prüfen, knapp</Zustand>
          <Zustand stand="schlecht">überfällig, fehlt</Zustand>
          <Zustand stand="storniert">storniert, inaktiv</Zustand>
        </div>
        <p className="mt-4 flex items-center gap-6 text-sm text-ink-muted">
          <span className="flex items-center gap-2"><LotZeichen /> hier, heute</span>
          <span className="flex items-center gap-2"><LotZeichen pendelt /> pendelt beim Laden aus</span>
        </p>
      </Card>

      <Card title="Planlinie · B5 Achskreis und B6 Stückliste" buendig>
        <Abschnitt titel="Dringend" anzahl={2} />
        <Abschnitt titel="Diese Woche" anzahl={6} />
        <Abschnitt titel="Fassung A · ersetzt" anzahl="A" />
        <div className="overflow-x-auto px-4 pb-4">
          <table className="tabelle">
            <thead><tr><th scope="col">Pos</th><th scope="col">Bezeichnung</th><th scope="col" className="r">Menge</th><th scope="col" className="r">Netto</th></tr></thead>
            <tbody>
              <tr><td className="pos">01</td><td>Montage Wärmepumpe</td><td className="r">10,5 h</td><td className="r">682,50</td></tr>
              <tr><td className="pos">02</td><td>Wärmepumpe Luft/Wasser 8 kW</td><td className="r">1 Stk</td><td className="r">7 500,50</td></tr>
              <tr className="summe"><td /><td>Summe netto</td><td /><td className="r">8 183,00</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Planlinie · B7 Eckmarken und B8 Hinweislinie">
        <div className="grid gap-6 md:grid-cols-2">
          <Eckmarken>
            <p className="text-xs uppercase tracking-widest text-ink-muted">Kunde und Ort</p>
            <p className="mt-2">Workflow Haustechnik GmbH</p>
            <p className="text-sm text-ink-muted">Bürgergasse 7, 8200 Gleisdorf</p>
          </Eckmarken>
          <div>
            <p className="text-sm text-ink-muted">PLZ</p>
            <p className="mono">82</p>
            <Hinweislinie>Die PLZ hat in Österreich vier Ziffern. Trotzdem speichern?</Hinweislinie>
          </div>
        </div>
      </Card>

      <Card title="Planlinie · B11 Schraffur, Einsatzbalken, Maßkette und B12 Raster">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="schraffur h-12 px-2 pt-1 text-xs">Urlaub</div>
          <div className="einsatzbalken h-12 px-2 pt-1 text-xs">Einsatz</div>
          <div className="raster h-12 border border-line" aria-hidden="true" />
        </div>
        <Masskette vonText="07:00" bisText="16:00" gesamtMinuten={540} pauseMinuten={30} dauer={dauer} name="Arbeitszeit 8:30 Stunden von 07:00 bis 16:00, 30 Minuten Pause" />
      </Card>

      <Card title="Planlinie · B9 Modulskizzen">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
          {SKIZZEN.map(([motiv, name]) => (
            <figure key={motiv} className="flex flex-col items-center gap-1 text-center">
              <Modulskizze motiv={motiv} />
              <figcaption className="text-xs text-ink-muted">{name}</figcaption>
            </figure>
          ))}
        </div>
      </Card>
    </>
  );
}
