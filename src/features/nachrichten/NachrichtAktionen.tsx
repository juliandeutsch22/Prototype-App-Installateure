import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  anhangAdressen, kanalBaustelle, nachrichtBearbeiten, nachrichtLoeschen, nachrichtMelden, nachrichtSenden,
  type KanalKopf, type Nachricht, type NeueDatei,
} from '@/lib/db/nachrichten';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { TextareaField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { useModul } from '@/lib/useModule';
import BaustellenWahl from './BaustellenWahl';
import { zeitText } from './text';

type Schritt = 'wahl' | 'bearbeiten' | 'melden';

/**
 * WAS MAN MIT EINER NACHRICHT TUN KANN — ein Seitenfenster statt eines ⋯
 * an jeder Zeile (Linie „Lot“: ⋯ nur im Seitenkopf, ganze Zeilen antippbar).
 *
 *   - die eigene: bearbeiten, löschen (Text und Anhänge gehen wirklich),
 *     aus einem privaten Gespräch in eine Baustelle übernehmen;
 *   - eine fremde: melden (D5) — genau diese Nachricht geht als Kopie an die
 *     Geschäftsführung, sonst nichts aus dem Gespräch;
 *   - jede: den Text kopieren.
 */
export default function NachrichtAktionen({
  nachricht,
  kopf,
  companyId,
  onClose,
  onGeaendert,
}: {
  nachricht: Nachricht | null;
  kopf: KanalKopf;
  companyId: string;
  onClose: () => void;
  onGeaendert: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const nachrichtenAn = useModul('nachrichten');
  const [schritt, setSchritt] = useState<Schritt>('wahl');
  const [text, setText] = useState('');
  const [grund, setGrund] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [loeschenFrage, setLoeschenFrage] = useState(false);
  const [baustelleWahl, setBaustelleWahl] = useState(false);

  useEffect(() => {
    setSchritt('wahl');
    setText(nachricht?.text ?? '');
    setGrund('');
    setFehler(null);
  }, [nachricht]);

  if (!user) return null;
  const n = nachricht;
  const offen = !!n && !loeschenFrage && !baustelleWahl;
  const geloescht = !!n?.geloeschtAm;
  const darfUebernehmen = !!n && n.eigene && !geloescht && kopf.art !== 'baustelle' && nachrichtenAn;

  async function tun(was: () => Promise<unknown>, erfolg: string) {
    setLaeuft(true);
    setFehler(null);
    try {
      await was();
      toast.success(erfolg);
      onGeaendert();
    } catch (e) {
      setFehler(grundAus(e, 'Das hat nicht geklappt.'));
    } finally {
      setLaeuft(false);
    }
  }

  /*
    ÜBERNEHMEN (Spezifikation 4.5): eine NEUE Nachricht im Thread der
    Baustelle, mit demselben Text und denselben Anhängen. Die Dateien holt
    das Gerät aus dem privaten Gespräch und lädt sie unter der neuen
    Nachricht hoch — der Server kopiert nichts zwischen privat und Akte.
  */
  async function uebernehmen(projekt: string) {
    if (!n) return;
    setBaustelleWahl(false);
    setLaeuft(true);
    setFehler(null);
    try {
      const ziel = await kanalBaustelle(projekt);
      const adressen = await anhangAdressen(n.anhaenge);
      const dateien: NeueDatei[] = [];
      for (const a of n.anhaenge) {
        const url = adressen.get(`${a.eimer}/${a.pfad}`);
        if (!url) throw new Error(`„${a.name}“ lässt sich gerade nicht laden.`);
        const r = await fetch(url);
        if (!r.ok) throw new Error(`„${a.name}“ lässt sich gerade nicht laden.`);
        dateien.push({ id: crypto.randomUUID(), name: a.name, inhalt: await r.blob() });
      }
      const stand = await nachrichtSenden({
        id: crypto.randomUUID(), kanal: ziel, privat: false, companyId, text: n.text ?? '', dateien, aus: n.id,
      });
      toast.success(stand === 'queued' ? 'Vorgemerkt — geht mit Netz in die Baustelle' : 'In die Baustelle übernommen', {
        label: 'Zum Thread', onClick: () => navigate(`/nachrichten/${ziel}`),
      });
      onGeaendert();
    } catch (e) {
      setFehler(grundAus(e, 'Die Nachricht konnte nicht übernommen werden.'));
    } finally {
      setLaeuft(false);
    }
  }

  async function kopieren() {
    if (!n?.text) return;
    try {
      await navigator.clipboard.writeText(n.text);
      toast.success('Text kopiert');
      onClose();
    } catch {
      setFehler('Kopieren geht hier nicht — bitte den Text markieren.');
    }
  }

  return (
    <>
      <BottomSheet
        open={offen}
        onClose={onClose}
        label="Nachricht"
        titel={schritt === 'melden' ? 'Nachricht melden' : schritt === 'bearbeiten' ? 'Nachricht bearbeiten' : 'Nachricht'}
      >
        {n && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              {n.eigene ? 'Du' : n.vonName} · <span className="font-mono">{zeitText(n.gesendetAm)}</span>
            </p>

            {schritt === 'wahl' && (
              <>
                {geloescht ? (
                  <p className="text-ink-muted">Diese Nachricht ist gelöscht.</p>
                ) : (
                  n.text && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{n.text}</p>
                )}
                {!geloescht && (
                  <div className="flex flex-col gap-2">
                    {n.eigene && !kopf.sperre && (
                      <Button variant="secondary" onClick={() => setSchritt('bearbeiten')}>Bearbeiten</Button>
                    )}
                    {darfUebernehmen && (
                      <Button variant="secondary" loading={laeuft} onClick={() => setBaustelleWahl(true)}>
                        In eine Baustelle übernehmen …
                      </Button>
                    )}
                    {n.text && <Button variant="secondary" onClick={() => void kopieren()}>Text kopieren</Button>}
                    {!n.eigene && !n.gemeldet && (
                      <Button variant="secondary" onClick={() => setSchritt('melden')}>Melden …</Button>
                    )}
                    {!n.eigene && n.gemeldet && (
                      <p className="text-sm text-ink-muted">Du hast diese Nachricht der Geschäftsführung gemeldet.</p>
                    )}
                    {n.eigene && (
                      <Button variant="danger" onClick={() => setLoeschenFrage(true)}>Löschen</Button>
                    )}
                  </div>
                )}
              </>
            )}

            {schritt === 'bearbeiten' && (
              <form
                className="space-y-3"
                onSubmit={(e) => { e.preventDefault(); void tun(() => nachrichtBearbeiten(n.id, text), 'Nachricht geändert'); }}
              >
                <TextareaField id="nachricht-bearbeiten" label="Text" rows={5} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} />
                <p className="text-sm text-ink-muted">Geändert steht die Nachricht mit „bearbeitet“ da. Die alte Fassung wird nicht aufbewahrt.</p>
                <div className="fuss-aktionen">
                  <Button type="button" variant="ghost" onClick={() => setSchritt('wahl')}>Zurück</Button>
                  <Button type="submit" loading={laeuft} disabled={text.trim() === (n.text ?? '').trim()}>Speichern</Button>
                </div>
              </form>
            )}

            {schritt === 'melden' && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void tun(() => nachrichtMelden(n.id, grund), 'An die Geschäftsführung weitergegeben');
                }}
              >
                <p className="text-sm">
                  Die Geschäftsführung bekommt <strong>genau diese Nachricht</strong> — Absender, Zeit, Text
                  {n.anhaenge.length > 0 ? ' und Anhänge' : ''} — als Kopie. Das übrige Gespräch sieht sie nicht.
                  {n.vonName ? ` ${n.vonName} erfährt von der Meldung nichts durch die App.` : ''}
                </p>
                {n.text && <blockquote className="whitespace-pre-wrap border-l-2 border-line-strong pl-3 [overflow-wrap:anywhere]">{n.text}</blockquote>}
                <TextareaField id="melden-grund" label="Warum (freiwillig)" rows={3} maxLength={2000} value={grund} onChange={(e) => setGrund(e.target.value)} />
                <div className="fuss-aktionen">
                  <Button type="button" variant="ghost" onClick={() => setSchritt('wahl')}>Zurück</Button>
                  <Button type="submit" loading={laeuft}>An die Geschäftsführung weitergeben</Button>
                </div>
              </form>
            )}

            {fehler && <ErrorState message={fehler} />}
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={loeschenFrage}
        title="Nachricht löschen?"
        confirmLabel="Löschen"
        message="Text und Anhänge werden gelöscht — für alle im Gespräch. Es bleibt nur „Nachricht gelöscht“ mit dem Zeitpunkt."
        onCancel={() => setLoeschenFrage(false)}
        onConfirm={async () => {
          setLoeschenFrage(false);
          if (n) await tun(() => nachrichtLoeschen(n.id), 'Nachricht gelöscht');
        }}
      />

      <BaustellenWahl
        open={baustelleWahl}
        titel="In welche Baustelle?"
        companyId={companyId}
        uid={user.uid}
        rolle={user.role}
        onClose={() => setBaustelleWahl(false)}
        onWahl={(p) => void uebernehmen(p.id)}
      />
    </>
  );
}
