import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from './PageHeader';

/**
 * Rückweg und Identität haben feste Plätze; die Hauptaktion bleibt der bestehende Seitenkopf.
 *
 * SEIT DER PLANLINIE (E30) trägt der Aktenkopf die Nummer als Stempel neben
 * dem Titel und die Eckdaten als Schriftfeld. Eine Skizze bekommt die Akte
 * nicht: ihr Akzent sind die Eckmarken der Kontextspalte — einer je Seite.
 */
export default function AktenKopf({ art, title, zurueck, zurueckText, meta, action, kontakt, stempel, stand }: {
  art: string; title: string; zurueck: string; zurueckText: string;
  meta?: ReactNode; action?: ReactNode; kontakt?: ReactNode;
  /** PR-, AN-, RE- oder Kundennummer als Nummernstempel. */
  stempel?: ReactNode;
  /** Die Eckdaten der Akte — eine `MetricRow`, wird zum Schriftfeld. */
  stand?: ReactNode;
}) {
  return <header className="akten-kopf">
    <Link to={zurueck} className="akten-zurueck">← {zurueckText}</Link>
    <PageHeader ort={art} title={title} subtitle={meta} action={action} stempel={stempel} stand={stand} skizze={false} />
    {kontakt && <div className="akten-mobil-kontakt">{kontakt}</div>}
  </header>;
}
