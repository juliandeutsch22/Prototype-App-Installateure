import type { ReactNode } from 'react';
import PageHeader from './PageHeader';

/**
 * Rückweg und Identität haben feste Plätze; die Hauptaktion bleibt der bestehende Seitenkopf.
 *
 * SEIT DER PLANLINIE (E30) trägt der Aktenkopf die Nummer als Stempel neben
 * dem Titel und die Eckdaten als Schriftfeld. Eine Skizze bekommt die Akte
 * nicht: ihr Akzent sind die Eckmarken der Kontextspalte — einer je Seite.
 */
export default function AktenKopf({ title, zurueck, zurueckText, meta, action, kontakt, stempel, stand, standWort, mehr }: {
  title: string; zurueck: string; zurueckText: string;
  meta?: ReactNode; action?: ReactNode; kontakt?: ReactNode;
  /** PR-, AN-, RE- oder Kundennummer als Nummernstempel. */
  stempel?: ReactNode;
  /** Die Eckdaten der Akte — eine `MetricRow`, wird zum Schriftfeld. */
  stand?: ReactNode;
  /** Der Stand als Wort („Aktiv“) neben dem Stempel, am Handy (E86). */
  standWort?: ReactNode;
  /** Seltene Handgriffe der Akte im „⋯“ des Seitenkopfs (F12: Stundennachweis, A11: Abschließen, V3: Neu für diesen Kunden). */
  mehr?: ReactNode;
}) {
  /*
    DER RÜCKWEG STEHT IN DER ORTSZEILE (E31, 31.10.2026), wie beim Angebot.
    Als eigene Zeile darüber begann jede Akte 56 px tiefer als die Liste, aus
    der man kam. Die Art der Akte sagt der Rückweg mit („Zur Kundenliste“).
  */
  return <header className="akten-kopf">
    <PageHeader zurueck={{ to: zurueck, text: zurueckText }} title={title} subtitle={meta} action={action} stempel={stempel} stempelZusatz={standWort} stand={stand} skizze={false} mehr={mehr} />
    {kontakt && <div className="akten-mobil-kontakt">{kontakt}</div>}
  </header>;
}
