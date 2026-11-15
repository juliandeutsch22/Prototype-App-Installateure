import type { ReactElement, ReactNode } from 'react';
import PageHeader from './PageHeader';
import Button from './Button';
import RowMenu, { type RowMenuItem } from './RowMenu';
import { useAmHandy } from '@/lib/breiten';

/**
 * Rückweg und Identität haben feste Plätze; die Hauptaktion bleibt der bestehende Seitenkopf.
 *
 * SEIT DER PLANLINIE (E30) trägt der Aktenkopf die Nummer als Stempel neben
 * dem Titel und die Eckdaten als Schriftfeld. Eine Skizze bekommt die Akte
 * nicht: ihr Akzent sind die Eckmarken der Kontextspalte — einer je Seite.
 *
 * MUSTER 2 DER HAUPTAKTION (U1, Durchsicht 15.11.2026): eine Akte hat EINE
 * kompakte Aktion (`action`), alles Weitere im ⋯. Am Handy stand die
 * Benutzerakte mit „Bearbeiten“ als Balken über die ganze Breite da, die
 * Baustellenakte mit zwei halben Knöpfen nebeneinander — die Gruppe
 * `.akten-aktionen` streckte jeden Knopf. Jetzt:
 * - `action` ist ein einzelner Knopf (die Wächter prüfen, dass hier keine
 *   Gruppe übergeben wird);
 * - `zweit` ist der eine häufige Nebenweg („Bearbeiten“ neben „Einsatz
 *   planen“). Ab dem Tablet steht er als Zweitknopf neben der Hauptaktion,
 *   wo Platz ist; am Handy wandert er als erster Eintrag ins ⋯;
 * - `weitere` sind die seltenen Handgriffe im ⋯ (F12: Stundennachweis, A11:
 *   Abschließen, V3: Neu für diesen Kunden).
 */
export default function AktenKopf({ title, zurueck, zurueckText, meta, action, zweit, weitere = [], ueber, kontakt, stempel, stand, standWort }: {
  title: string; zurueck: string; zurueckText: string;
  meta?: ReactNode;
  /** Die eine Hauptaktion der Akte — ein Knopf, keine Gruppe. */
  action?: ReactElement | false | null;
  /** Der häufige Nebenweg: ab dem Tablet Zweitknopf, am Handy im ⋯. */
  zweit?: RowMenuItem | false | null;
  /** Seltene Handgriffe der Akte im „⋯“ des Seitenkopfs. */
  weitere?: RowMenuItem[];
  /** Wessen Aktionen das ⋯ trägt, für die Vorlesehilfe („Baustelle B-2026-0147“); ohne Angabe der Titel. */
  ueber?: string;
  kontakt?: ReactNode;
  /** PR-, AN-, RE- oder Kundennummer als Nummernstempel. */
  stempel?: ReactNode;
  /** Die Eckdaten der Akte — eine `MetricRow`, wird zum Schriftfeld. */
  stand?: ReactNode;
  /** Der Stand als Wort („Aktiv“) neben dem Stempel, am Handy (E86). */
  standWort?: ReactNode;
}) {
  const amHandy = useAmHandy();
  const imMenue = [...(zweit && amHandy ? [zweit] : []), ...weitere];
  /*
    DER RÜCKWEG STEHT IN DER ORTSZEILE (E31, 31.10.2026), wie beim Angebot.
    Als eigene Zeile darüber begann jede Akte 56 px tiefer als die Liste, aus
    der man kam. Die Art der Akte sagt der Rückweg mit („Zur Kundenliste“).
  */
  return <header className="akten-kopf">
    <PageHeader zurueck={{ to: zurueck, text: zurueckText }} title={title} subtitle={meta}
      action={action || undefined}
      nebenAktion={zweit && !amHandy ? <Button variant="secondary" onClick={zweit.onSelect}>{zweit.label}</Button> : undefined}
      stempel={stempel} stempelZusatz={standWort} stand={stand} skizze={false}
      mehr={imMenue.length ? <RowMenu about={ueber ?? title} items={imMenue} /> : undefined} />
    {kontakt && <div className="akten-mobil-kontakt">{kontakt}</div>}
  </header>;
}
