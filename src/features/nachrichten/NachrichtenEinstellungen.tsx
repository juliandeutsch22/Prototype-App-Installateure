import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  anhangAdressen, aufbewahrungSetzen, meldungen, meldungErledigen, meldungLoeschen, type Meldung,
} from '@/lib/db/nachrichten';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import { SelectField, TextareaField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { Zustand } from '@/components/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { postenNeuLaden } from '@/app/offenePosten';
import { ART_TEXT, groesseText, istBild, zeitText } from './text';

const FRISTEN: { wert: string; text: string }[] = [
  { wert: '', text: 'Nie automatisch löschen' },
  { wert: '6', text: '6 Monate nach der letzten Nachricht' },
  { wert: '12', text: '12 Monate nach der letzten Nachricht' },
  { wert: '24', text: '24 Monate nach der letzten Nachricht' },
];

/**
 * NACHRICHTEN IN DEN EINSTELLUNGEN (M10/B09) — für die Geschäftsführung:
 *
 *   - wie lange private Gespräche bleiben (D3): ab Werk für immer, wählbar
 *     6, 12 oder 24 Monate nach der letzten Nachricht; Baustellen-Threads
 *     bleiben mit der Akte;
 *   - die gemeldeten Nachrichten (D5): genau die Kopie, die jemand
 *     weitergegeben hat — das Gespräch dahinter sieht die Führung nicht.
 */
export default function NachrichtenEinstellungen() {
  const { company, reloadCompany, einblick } = useAuth();
  const toast = useToast();
  const [frist, setFrist] = useState('');
  const [speichert, setSpeichert] = useState(false);
  const [liste, setListe] = useState<Meldung[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [offen, setOffen] = useState<Meldung | null>(null);
  const [vermerk, setVermerk] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [loeschen, setLoeschen] = useState<Meldung | null>(null);
  const [adressen, setAdressen] = useState<Map<string, string>>(new Map());
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    setFrist(company?.nachrichtenAufbewahrungMonate ? String(company.nachrichtenAufbewahrungMonate) : '');
  }, [company]);

  const laden = useCallback(() => {
    if (einblick) return;
    setFehler(false);
    meldungen().then(setListe).catch(() => setFehler(true));
  }, [einblick]);
  useEffect(() => { laden(); }, [laden, versuch]);

  useEffect(() => {
    setVermerk('');
    if (!offen || offen.anhaenge.length === 0) { setAdressen(new Map()); return; }
    let weg = false;
    void anhangAdressen(offen.anhaenge).then((m) => { if (!weg) setAdressen(m); }).catch(() => undefined);
    return () => { weg = true; };
  }, [offen]);

  async function fristSpeichern(wert: string) {
    setFrist(wert);
    setSpeichert(true);
    try {
      await aufbewahrungSetzen(wert ? (Number(wert) as 6 | 12 | 24) : null);
      await reloadCompany();
      toast.success(wert ? 'Aufbewahrung gespeichert' : 'Private Gespräche werden nicht automatisch gelöscht');
    } catch (e) {
      toast.error(grundAus(e, 'Die Aufbewahrung konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  async function erledigen(m: Meldung) {
    setLaeuft(true);
    try {
      await meldungErledigen(m.id, vermerk);
      toast.success('Als erledigt vermerkt');
      setOffen(null);
      laden();
      void postenNeuLaden();
    } catch (e) {
      toast.error(grundAus(e, 'Die Meldung konnte nicht erledigt werden.'));
    } finally {
      setLaeuft(false);
    }
  }

  const offene = (liste ?? []).filter((m) => m.status === 'offen').length;

  // Die Meldungen sieht nur die Führung des Betriebs, nicht der Support (`support_niemals`).
  if (einblick) {
    return (
      <div className="space-y-6">
        <PageHeader ort="Einstellungen" title="Nachrichten" />
        <Card>
          <EmptyState titel="Im Einblick nicht einsehbar">
            Aufbewahrung und gemeldete Nachrichten stellt nur die Geschäftsführung des Betriebs ein.
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        ort="Einstellungen"
        title="Nachrichten"
        subtitle="Aufbewahrung privater Gespräche und gemeldete Nachrichten"
        hilfe={
          <>
            Private Gespräche (Direkt und Runden) liest nur, wer daran teilnimmt — auch die
            Geschäftsführung nicht. Hier steht deshalb kein Gespräch, sondern nur, was jemand
            ausdrücklich gemeldet hat: genau diese eine Nachricht als Kopie, mit Absender, Zeit
            und Anhängen. Die Kopie bleibt, auch wenn der Absender seine Nachricht löscht, bis
            die Meldung als erledigt gelöscht wird.
          </>
        }
      />

      <Card
        title="Aufbewahrung"
        hint="Gilt für private Gespräche: ist die letzte Nachricht älter als die Frist, löscht der Nachtlauf das ganze Gespräch samt Anhängen. Baustellen-Threads gehören zur Akte und bleiben. Gemeldete Nachrichten bleiben, bis sie hier gelöscht werden."
      >
        <SelectField
          id="nachrichten-frist"
          label="Private Gespräche löschen"
          value={frist}
          disabled={speichert}
          onChange={(e) => void fristSpeichern(e.target.value)}
        >
          {FRISTEN.map((f) => <option key={f.wert} value={f.wert}>{f.text}</option>)}
        </SelectField>
      </Card>

      <Card title={offene ? `Gemeldete Nachrichten · ${offene} offen` : 'Gemeldete Nachrichten'} buendig>
        {fehler && (
          <div className="px-4 pb-4">
            <ErrorState message="Die Meldungen konnten nicht geladen werden." onRetry={() => setVersuch((v) => v + 1)} />
          </div>
        )}
        {!fehler && liste === null && <SkeletonList rows={2} />}
        {!fehler && liste && liste.length === 0 && (
          <EmptyState titel="Nichts gemeldet">Wird eine Nachricht gemeldet, steht sie hier — und auf der Startseite.</EmptyState>
        )}
        {!fehler && liste && liste.length > 0 && (
          <List>
            {liste.map((m) => (
              <ListRow
                key={m.id}
                title={`${m.vonName} an ${m.gemeldetVonName}`}
                subtitle={[ART_TEXT[m.kanalArt], `gemeldet ${zeitText(m.gemeldetAm)}`, m.textKopie ? m.textKopie.split('\n')[0].slice(0, 80) : 'Anhang'].join(' · ')}
                zustand={m.status === 'offen' ? <Zustand stand="achtung">offen</Zustand> : <Zustand stand="erledigt">erledigt</Zustand>}
                onOeffnen={() => setOffen(m)}
                pfeil
              />
            ))}
          </List>
        )}
      </Card>

      <BottomSheet open={!!offen} onClose={() => setOffen(null)} label="Gemeldete Nachricht" titel="Gemeldete Nachricht" auchBreit>
        {offen && (
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-muted">Von</dt><dd>{offen.vonName}</dd>
              <dt className="text-ink-muted">Gesendet</dt><dd className="font-mono">{zeitText(offen.gesendetAm)}</dd>
              <dt className="text-ink-muted">Gemeldet von</dt><dd>{offen.gemeldetVonName}</dd>
              <dt className="text-ink-muted">Gemeldet</dt><dd className="font-mono">{zeitText(offen.gemeldetAm)}</dd>
              <dt className="text-ink-muted">Gespräch</dt><dd>{ART_TEXT[offen.kanalArt]}</dd>
            </dl>
            {offen.textKopie && (
              <blockquote className="whitespace-pre-wrap border-l-2 border-line-strong pl-3 [overflow-wrap:anywhere]">{offen.textKopie}</blockquote>
            )}
            {offen.anhaenge.length > 0 && (
              <div className="nachricht-anhaenge">
                {offen.anhaenge.map((a) => {
                  const url = adressen.get(`${a.eimer}/${a.pfad}`);
                  if (url && istBild(a.inhaltsart)) {
                    return <a key={a.pfad} href={url} target="_blank" rel="noreferrer"><img src={url} alt={a.name} className="nachricht-bild" /></a>;
                  }
                  return url
                    ? <a key={a.pfad} href={url} target="_blank" rel="noreferrer" className="nachricht-datei">{a.name} <span className="font-mono text-xs text-ink-muted">{groesseText(a.bytes)}</span></a>
                    : <span key={a.pfad} className="nachricht-datei">{a.name}</span>;
                })}
              </div>
            )}
            {offen.grund && <p className="text-sm"><span className="text-ink-muted">Grund: </span>{offen.grund}</p>}
            {offen.status === 'offen' ? (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void erledigen(offen); }}>
                <TextareaField id="meldung-vermerk" label="Vermerk (freiwillig)" rows={3} maxLength={2000} value={vermerk} onChange={(e) => setVermerk(e.target.value)} />
                <div className="fuss-aktionen">
                  <Button type="button" variant="ghost" onClick={() => setOffen(null)}>Schließen</Button>
                  <Button type="submit" loading={laeuft}>Als erledigt vermerken</Button>
                </div>
              </form>
            ) : (
              <>
                <p className="text-sm text-ink-muted">
                  Erledigt {offen.erledigtAm ? zeitText(offen.erledigtAm) : ''}{offen.erledigtVonName ? ` von ${offen.erledigtVonName}` : ''}.
                  {offen.vermerk ? ` Vermerk: ${offen.vermerk}` : ''}
                </p>
                <div className="fuss-aktionen">
                  <Button variant="danger" onClick={() => { setLoeschen(offen); setOffen(null); }}>Meldung löschen</Button>
                </div>
              </>
            )}
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={!!loeschen}
        title="Meldung löschen?"
        confirmLabel="Löschen"
        message="Die Kopie und ihre Anhänge gehen endgültig. Das Gespräch selbst bleibt, wie es ist."
        onCancel={() => setLoeschen(null)}
        onConfirm={async () => {
          const m = loeschen;
          setLoeschen(null);
          if (!m) return;
          try {
            await meldungLoeschen(m.id);
            toast.success('Meldung gelöscht');
            laden();
          } catch (e) {
            toast.error(grundAus(e, 'Die Meldung konnte nicht gelöscht werden.'));
          }
        }}
      />
    </div>
  );
}
