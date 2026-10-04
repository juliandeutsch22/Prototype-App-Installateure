import { useEffect, useState } from 'react';
import type { KalenderAbo, KalenderAboArt } from '@/types';
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

/** Was je Art anders ist — der Rest ist derselbe Ablauf. */
const TEXTE: Record<KalenderAboArt, { leer: string; ende: string; hinweis: string }> = {
  eigen: {
    leer: 'Deine Einsätze und Termine im Kalender deines Telefons — Google, Apple oder Outlook holen sie selbst ab.',
    ende: 'Der Kalender zeigt deine Einsätze danach nicht mehr.',
    hinweis:
      'Deine Einsätze und Termine erscheinen im Kalender deines Telefons und werden laufend nachgezogen — meist innerhalb einer Stunde, je nach Kalender auch seltener. iPhone und Mac: „Im Kalender öffnen“ antippen. Google Kalender: am Computer unter „Weitere Kalender → Per URL“ den Link einfügen. Outlook: „Kalender hinzufügen → Aus dem Internet abonnieren“. Wer den Link hat, sieht deine Einsätze samt Kundenadressen — nicht weitergeben.',
  },
  gesamt: {
    leer: 'Der ganze Einsatzplan im Kalender deines Telefons: je Baustelle und Tag ein Eintrag mit den Eingeteilten, dazu die Termine.',
    ende: 'Der Kalender zeigt den Einsatzplan danach nicht mehr.',
    hinweis:
      'Der ganze Einsatzplan des Betriebs — je Baustelle und Tag ein Eintrag mit Kunde, Adresse und den Eingeteilten samt Stufe und Uhrzeit, dazu alle Termine. Abwesenheiten stehen nicht darin. Er wird laufend nachgezogen, meist innerhalb einer Stunde. Das Abo endet von selbst, wenn du die Einsatzplanung nicht mehr siehst oder das Modul ausgeschaltet wird. Wer den Link hat, sieht Namen und Einsatzorte der Mitarbeiter und Kundenadressen — nicht weitergeben. Dein eigenes Abo unter „Mein Einsatzplan“ ist ein getrennter Link.',
  },
};

/**
 * DER EINSATZPLAN IM EIGENEN KALENDER — ganz unten in „Mein Einsatzplan“
 * (Entscheidung vom 02.10.2026). Nur, wenn der Betrieb es eingeschaltet hat.
 *
 * MIT `art="gesamt"` DER GANZE PLAN für die Leitung, unter Einsatzplanung →
 * Wochenplan (Plan 10.4, PR B). Ein eigener Link: wer beides hat, trägt zwei
 * Kalender ein und kann sie getrennt ein- und ausblenden.
 *
 * DER LINK STEHT NUR EINMAL DA. Gespeichert ist sein Hashwert; wer ihn
 * verliert, legt einen neuen an, und der alte hört auf. Darum fragen „Neuer
 * Link“ und „Abo beenden“ vorher nach: der Kalender am Telefon zeigt danach
 * nichts mehr, bis der neue Link dort eingetragen ist.
 */
export default function KalenderAboKarte({ userId, art = 'eigen' }: { userId: string; art?: KalenderAboArt }) {
  const texte = TEXTE[art];
  const toast = useToast();
  const [stand, setStand] = useState<KalenderAbo | null | 'laedt' | 'fehler'>('laedt');
  const [link, setLink] = useState<string | null>(null);
  const [frage, setFrage] = useState<'neu' | 'ende' | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [nochmal, setNochmal] = useState(0);

  useEffect(() => {
    let weg = false;
    kalenderAboStand(userId, art)
      .then((s) => { if (!weg) setStand(s); })
      .catch(() => { if (!weg) setStand('fehler'); });
    return () => {
      weg = true;
    };
  }, [userId, art, nochmal]);

  async function anlegen() {
    setLaeuft(true);
    setFehler(null);
    try {
      const adresse = kalenderAdresse(import.meta.env.VITE_SUPABASE_URL, await kalenderAboAnlegen(art));
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
      await kalenderAboBeenden(art);
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
      hint={texte.hinweis}
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
            <p className="text-sm text-ink-muted">{texte.leer}</p>
          )}

          {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}

          {/* Solange der neue Link dasteht, nur Öffnen und Kopieren — der Rest beim nächsten Besuch. */}
          {link ? null : frage ? (
            <div className="space-y-2 rounded border border-line p-3">
              <p className="text-sm text-ink">
                {frage === 'neu'
                  ? 'Der bisherige Link hört dann auf; im Kalender muss der neue eingetragen werden.'
                  : texte.ende}
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
