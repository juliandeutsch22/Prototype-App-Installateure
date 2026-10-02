import { useEffect, useState } from 'react';
import type { KalenderAbo } from '@/types';
import { kalenderAboAnlegen, kalenderAboBeenden, kalenderAboStand } from '@/lib/db/assignments';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { kalenderAdresse, webcalAdresse } from './kalenderAbo';

/** „02.10.2026, 22:15“ in Wiener Zeit. */
function zeitpunkt(ms: number): string {
  return new Date(ms).toLocaleString('de-AT', {
    timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * DER EINSATZPLAN IM EIGENEN KALENDER — ganz unten in „Mein Einsatzplan“
 * (Entscheidung vom 02.10.2026). Nur, wenn der Betrieb es eingeschaltet hat.
 *
 * DER LINK STEHT NUR EINMAL DA. Gespeichert ist sein Hashwert; wer ihn
 * verliert, legt einen neuen an, und der alte hört auf. Darum fragen „Neuer
 * Link“ und „Abo beenden“ vorher nach: der Kalender am Telefon zeigt danach
 * nichts mehr, bis der neue Link dort eingetragen ist.
 */
export default function KalenderAboKarte({ userId }: { userId: string }) {
  const toast = useToast();
  const [stand, setStand] = useState<KalenderAbo | null | 'laedt' | 'fehler'>('laedt');
  const [link, setLink] = useState<string | null>(null);
  const [frage, setFrage] = useState<'neu' | 'ende' | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [nochmal, setNochmal] = useState(0);

  useEffect(() => {
    let weg = false;
    kalenderAboStand(userId)
      .then((s) => { if (!weg) setStand(s); })
      .catch(() => { if (!weg) setStand('fehler'); });
    return () => {
      weg = true;
    };
  }, [userId, nochmal]);

  async function anlegen() {
    setLaeuft(true);
    setFehler(null);
    try {
      const adresse = kalenderAdresse(import.meta.env.VITE_SUPABASE_URL, await kalenderAboAnlegen());
      if (!adresse) throw new Error('Die Adresse des Kalenders ließ sich nicht bilden.');
      setLink(adresse);
      setFrage(null);
      setNochmal((n) => n + 1);
    } catch (e) {
      setFehler(grundAus(e, 'Das Kalender-Abo ließ sich nicht einrichten.'));
    } finally {
      setLaeuft(false);
    }
  }

  async function beenden() {
    setLaeuft(true);
    setFehler(null);
    try {
      await kalenderAboBeenden();
      setLink(null);
      setFrage(null);
      setNochmal((n) => n + 1);
      toast.success('Kalender-Abo beendet');
    } catch (e) {
      setFehler(grundAus(e, 'Das Kalender-Abo ließ sich nicht beenden.'));
    } finally {
      setLaeuft(false);
    }
  }

  async function kopieren() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link kopiert');
    } catch {
      // Ohne Zugriff auf die Zwischenablage: markieren, dann kopiert man von Hand.
      (document.getElementById('kalender-link') as HTMLInputElement | null)?.select();
    }
  }

  return (
    <Card
      title="Im eigenen Kalender"
      className="mt-3 lg:mt-5"
      hint={
        <>
          Deine Einsätze erscheinen im Kalender deines Telefons und werden laufend nachgezogen —
          meist innerhalb einer Stunde, je nach Kalender auch seltener. iPhone und Mac: „Im
          Kalender öffnen“ antippen. Google Kalender: am Computer unter „Weitere Kalender → Per
          URL“ den Link einfügen. Outlook: „Kalender hinzufügen → Aus dem Internet abonnieren“.
          Wer den Link hat, sieht deine Einsätze samt Kundenadressen — nicht weitergeben.
        </>
      }
    >
      {stand === 'laedt' ? (
        <p className="text-sm text-ink-muted">Lädt …</p>
      ) : stand === 'fehler' ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-danger">Der Stand des Kalender-Abos ließ sich nicht laden.</p>
          <Button variant="secondary" onClick={() => { setStand('laedt'); setNochmal((n) => n + 1); }}>
            Erneut versuchen
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {link ? (
            <div className="space-y-2">
              <label htmlFor="kalender-link" className="section-label">Dein Link — nur jetzt sichtbar</label>
              <input
                id="kalender-link"
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink"
              />
              <div className="flex flex-wrap gap-2">
                <a
                  href={webcalAdresse(link)}
                  className="flex min-h-touch items-center rounded bg-brand px-4 py-2 font-semibold text-brand-fg shadow-sm"
                >
                  Im Kalender öffnen
                </a>
                <Button variant="secondary" onClick={() => void kopieren()}>Link kopieren</Button>
              </div>
            </div>
          ) : stand ? (
            <p className="text-sm text-ink">
              Eingerichtet am {zeitpunkt(stand.angelegtAm)}
              <span className="block text-ink-muted">
                {stand.zuletztAbgerufen
                  ? `Zuletzt abgeholt am ${zeitpunkt(stand.zuletztAbgerufen)}`
                  : 'Noch von keinem Kalender abgeholt.'}
              </span>
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              Deine Einsätze im Kalender deines Telefons — Google, Apple oder Outlook holen sie
              selbst ab.
            </p>
          )}

          {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}

          {/* Solange der neue Link dasteht, nur Öffnen und Kopieren — der Rest beim nächsten Besuch. */}
          {link ? null : frage ? (
            <div className="space-y-2 rounded border border-line p-3">
              <p className="text-sm text-ink">
                {frage === 'neu'
                  ? 'Der bisherige Link hört dann auf; im Kalender muss der neue eingetragen werden.'
                  : 'Der Kalender zeigt deine Einsätze danach nicht mehr.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={frage === 'ende' ? 'danger' : 'primary'}
                  loading={laeuft}
                  onClick={() => void (frage === 'neu' ? anlegen() : beenden())}
                >
                  {frage === 'neu' ? 'Neuen Link erstellen' : 'Abo beenden'}
                </Button>
                <Button variant="ghost" onClick={() => setFrage(null)}>Abbrechen</Button>
              </div>
            </div>
          ) : stand ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setFrage('neu')}>Neuen Link erstellen …</Button>
              <Button variant="ghost" onClick={() => setFrage('ende')}>Abo beenden …</Button>
            </div>
          ) : (
            <Button variant="secondary" loading={laeuft} onClick={() => void anlegen()}>
              Kalender-Abo einrichten
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
