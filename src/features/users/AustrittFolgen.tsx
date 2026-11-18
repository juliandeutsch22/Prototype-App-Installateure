import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { austrittFolgen, zeitsitzungBeendenFuer, type AustrittFolgen as Folgen } from '@/lib/db/zeitkonto';
import { tagesStatusName } from '@/lib/time';
import type { TimeEntry } from '@/types';
import Button from '@/components/Button';
import { List, ListRow } from '@/components/ListRow';
import { ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { datumAT } from '@/lib/datum';
import { grundAus } from '@/lib/fehlerGrund';

const zeitraum = (von?: string | null, bis?: string | null) =>
  !von ? '' : von === bis || !bis ? datumAT(von) : `${datumAT(von)} – ${datumAT(bis)}`;

/**
 * AUSTRITT IN EINEM ZUG (Durchsicht 15.11.2026, Z2): was nach dem
 * Austrittstag noch gebucht, genehmigt, beantragt, eingeplant oder am Laufen
 * ist — beim Setzen des Austritts und danach in der Akte, je mit dem
 * Handgriff, der dazu gehört.
 *
 * Vorher sagte niemand etwas: Urlaub und Krank danach schrieben weiter im
 * Saldo gut, offene Anträge standen unter „Offene Anträge“, eine laufende
 * Zeitsitzung lief für immer. Die Saldorechnung endet jetzt am Austrittstag;
 * die Zeilen danach bleiben stehen (Datenverlust wäre schlimmer) und werden
 * hier genannt.
 *
 * `beenden`: die laufende Sitzung lässt sich erst beenden, wenn der Austritt
 * gespeichert ist — vorher gehört sie der Person.
 */
export default function AustrittFolgen({
  uid,
  tag,
  beenden = false,
  urlaubsweg = '/vacations',
}: {
  uid: string;
  /** 'YYYY-MM-DD' — der Austrittstag. */
  tag: string;
  beenden?: boolean;
  /** Wo Urlaubs- und ZA-Anträge entschieden werden (ohne Modul Urlaub: Sonderurlaub). */
  urlaubsweg?: string;
}) {
  const toast = useToast();
  const [folgen, setFolgen] = useState<Folgen | 'laedt' | 'fehler'>('laedt');
  const [versuch, setVersuch] = useState(0);
  const [beendet, setBeendet] = useState(false);

  useEffect(() => {
    let weg = false;
    setFolgen('laedt');
    austrittFolgen(uid, tag)
      .then((f) => { if (!weg) setFolgen(f); })
      .catch(() => { if (!weg) setFolgen('fehler'); });
    return () => { weg = true; };
  }, [uid, tag, versuch]);

  if (folgen === 'laedt') return <SkeletonList rows={2} />;
  if (folgen === 'fehler') {
    return <ErrorState message="Was nach dem Austritt noch offen ist, konnte nicht geladen werden." onRetry={() => setVersuch((v) => v + 1)} />;
  }

  const offeneAntraege = folgen.urlaub.filter((u) => u.status === 'Beantragt');
  const genehmigt = folgen.urlaub.filter((u) => u.status === 'Genehmigt');
  const nichts = folgen.buchungen.length === 0 && folgen.urlaub.length === 0 && folgen.krank.length === 0
    && folgen.freistellungen.length === 0 && folgen.korrekturen === 0 && folgen.einsaetze.anzahl === 0 && !folgen.sitzung;

  if (nichts) return <p className="text-meta text-ink-muted">Nach dem {datumAT(tag)} hängt nichts mehr an dieser Person.</p>;

  async function sitzungBeenden() {
    try {
      await zeitsitzungBeendenFuer(uid);
      setBeendet(true);
      toast.success('Zeitsitzung beendet');
      setVersuch((v) => v + 1);
    } catch (e) {
      toast.error(grundAus(e, 'Die Zeitsitzung konnte nicht beendet werden.'));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-meta text-ink-muted">
        Nach dem {datumAT(tag)} ist noch offen. Soll und Saldo enden am Austrittstag — was danach gebucht ist, zählt nicht mehr.
      </p>
      <List>
        {folgen.buchungen.map((b) => (
          <ListRow
            key={b.status}
            title={`${b.anzahl} × ${tagesStatusName(b.status as TimeEntry['status'])} gebucht`}
            subtitle={`${zeitraum(b.von, b.bis)} · zählt nicht mehr im Saldo`}
          />
        ))}
        {genehmigt.map((u) => (
          <ListRow key={u.id} title={`${u.art === 'Zeitausgleich' ? 'Zeitausgleich' : 'Urlaub'} genehmigt`} subtitle={zeitraum(u.von, u.bis)}>
            <Link to={urlaubsweg} className="link">Zum Antrag</Link>
          </ListRow>
        ))}
        {offeneAntraege.map((u) => (
          <ListRow key={u.id} title={`${u.art === 'Zeitausgleich' ? 'Zeitausgleich' : 'Urlaub'} beantragt, nicht entschieden`} subtitle={zeitraum(u.von, u.bis)}>
            <Link to={urlaubsweg} className="link">Entscheiden</Link>
          </ListRow>
        ))}
        {folgen.krank.map((k) => (
          <ListRow key={k.id} title="Krankmeldung über den Austritt hinaus" subtitle={zeitraum(k.von, k.bis)} />
        ))}
        {folgen.freistellungen.map((f) => (
          <ListRow key={f.id} title={`Freistellung ${f.status === 'Beantragt' ? 'beantragt' : 'bestätigt'}`} subtitle={zeitraum(f.von, f.bis)}>
            <Link to={urlaubsweg === '/vacations' ? '/vacations' : '/sonderurlaub'} className="link">Öffnen</Link>
          </ListRow>
        ))}
        {folgen.korrekturen > 0 && (
          <ListRow title={`${folgen.korrekturen === 1 ? 'Ein Korrekturantrag' : `${folgen.korrekturen} Korrekturanträge`} offen`}>
            <Link to="/accounting" className="link">In der Mitarbeiterübersicht</Link>
          </ListRow>
        )}
        {folgen.einsaetze.anzahl > 0 && (
          <ListRow title={`${folgen.einsaetze.anzahl === 1 ? 'Ein Einsatz' : `${folgen.einsaetze.anzahl} Einsätze`} eingeplant`} subtitle={zeitraum(folgen.einsaetze.von, folgen.einsaetze.bis)}>
            <Link to={folgen.einsaetze.von ? `/assignments?datum=${folgen.einsaetze.von}` : '/assignments'} className="link">Umplanen</Link>
          </ListRow>
        )}
        {folgen.sitzung && !beendet && (
          <ListRow title="Zeitsitzung läuft noch" subtitle={folgen.sitzung.seit ? `seit ${new Date(folgen.sitzung.seit).toLocaleString('de-AT')} · daraus ist nichts gebucht` : 'daraus ist nichts gebucht'}>
            {beenden && <Button variant="secondary" onClick={() => void sitzungBeenden()}>Sitzung beenden</Button>}
          </ListRow>
        )}
      </List>
    </div>
  );
}
