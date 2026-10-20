import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from './PageHeader';

/** Rückweg und Identität haben feste Plätze; die Hauptaktion bleibt der bestehende Seitenkopf. */
export default function AktenKopf({ art, title, zurueck, zurueckText, meta, action, kontakt }: {
  art: string; title: string; zurueck: string; zurueckText: string;
  meta?: ReactNode; action?: ReactNode; kontakt?: ReactNode;
}) {
  return <header className="akten-kopf">
    <Link to={zurueck} className="akten-zurueck">← {zurueckText}</Link>
    <PageHeader ort={art} title={title} subtitle={meta} action={action} />
    {kontakt && <div className="akten-mobil-kontakt">{kontakt}</div>}
  </header>;
}
