import { useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { List, ListRow } from '@/components/ListRow';
import { timerFortschreiben, timerOrtszeit, type TimerArt, type Zeitsitzung } from '@/lib/zeitsitzung';
/** Nur das Bedienmuster: keine Buchung und kein Zugriff auf Betriebsdaten. */
export default function MusterZeitablauf() {
  const [s, setS] = useState<Zeitsitzung | null>(null);
  function schritt(art: TimerArt) {
    const revision = s?.revision ?? 0;
    setS(timerFortschreiben(s, { p_id: 'muster', p_befehl: `schritt-${revision}`, p_revision: revision, p_art: art,
      p_zeit: new Date(Date.UTC(2026, 10, 8, 6 + revision)).toISOString(), p_baustelle: 'PR-2026-0190' }, 'muster', 'person'));
  }
  return <Card title="Start / Stopp · Bedienmuster" hint="Eine Sitzung sammelt Abschnitte. Erst deren Bestätigung im gewohnten Formular bucht tatsächliche Arbeitszeit. Das Muster speichert nichts.">
    <p className="mb-3">{s?.stand === 'beendet' ? 'Abschnitte zur Prüfung' : s?.stand === 'pause' ? 'In Pause' : s ? 'Läuft' : 'Bereit'}</p>
    <div className="flex flex-wrap gap-2">
      {!s && <Button variant="secondary" onClick={() => schritt('start')}>Starten</Button>}
      {s && s.stand !== 'beendet' && <><Button variant="secondary" onClick={() => schritt(s.stand === 'pause' ? 'weiter' : 'pause')}>{s.stand === 'pause' ? 'Weiterarbeiten' : 'Pause beginnen'}</Button><Button onClick={() => schritt('stop')}>Stoppen und prüfen</Button></>}
      {s && <Button variant="ghost" onClick={() => setS(null)}>Muster zurücksetzen</Button>}
    </div>
    <List>{s?.segmente.map((v) => <ListRow key={v.id} title={`${timerOrtszeit(v.von).time}–${v.bis ? timerOrtszeit(v.bis).time : '…'}`} subtitle={v.art === 'pause' ? 'Pause · keine Arbeitszeit' : 'PR-2026-0190 · noch nicht gebucht'} />)}</List>
  </Card>;
}
