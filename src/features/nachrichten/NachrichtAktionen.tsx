import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  anhangAdressen, kanalBaustelle, nachrichtBearbeiten, nachrichtLoeschen, nachrichtMelden, nachrichtSenden,
  REAKTION_NAME,
  type Nachricht, type NeueDatei,
} from '@/lib/db/nachrichten';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { TextareaField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import BaustellenWahl from './BaustellenWahl';
import { wer } from './reaktionen';
import { zeitText } from './text';

/**
 * Was geöffnet wird — aus der Leiste (am Schreibtisch beim Darüberfahren, am
 * Handy schwebend nach langem Drücken) oder vom Kästchen einer Reaktion.
 */
export type Schritt = 'bearbeiten' | 'melden' | 'loeschen' | 'uebernehmen' | 'reaktionen';
export interface Auftrag { n: Nachricht; schritt: Schritt }

/**
 * WAS MAN MIT EINER NACHRICHT TUN KANN — seit E77 (11.11.2026) ohne die
 * gerahmten Wortknöpfe („zu globig“). Alles Übrige steht in der Leiste
 * (`NachrichtLeiste`, am Handy schwebend: `NachrichtWahl`); dieses Fenster
 * öffnet nur noch, was ein Formular oder eine Rückfrage braucht: bearbeiten,
 * melden, löschen, die Baustelle wählen — und wer reagiert hat.
 *
 *   - die eigene: bearbeiten, löschen (Text und Anhänge gehen wirklich),
 *     aus einem privaten Gespräch in eine Baustelle übernehmen;
 *   - eine fremde: melden (D5) — genau diese Nachricht geht als Kopie an die
 *     Geschäftsführung, sonst nichts aus dem Gespräch;
 *   - jede: reagieren, den Text kopieren.
 */
export default function NachrichtAktionen({
  auftrag,
  companyId,
  onClose,
  onGeaendert,
}: {
  auftrag: Auftrag | null;
  companyId: string;
  onClose: () => void;
  onGeaendert: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [grund, setGrund] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    setText(auftrag?.n.text ?? '');
    setGrund('');
    setFehler(null);
  }, [auftrag]);

  if (!user) return null;
  const n = auftrag?.n ?? null;
  const schritt = auftrag?.schritt ?? null;
  const imFenster = !!n && (schritt === 'bearbeiten' || schritt === 'melden' || schritt === 'reaktionen');

  async function tun(was: () => Promise<unknown>, erfolg: string) {
    setLaeuft(true);
    setFehler(null);
    try {
      await was();
      toast.success(erfolg);
      onGeaendert();
    } catch (e) {
      // Ohne offenes Fenster (Löschen kommt aus der Rückfrage) steht der Grund als Meldung da.
      if (imFenster) setFehler(grundAus(e, 'Das hat nicht geklappt.'));
      else { toast.error(grundAus(e, 'Das hat nicht geklappt.')); onClose(); }
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
    setLaeuft(true);
    // Mit Anhängen dauert es: das Gerät lädt sie erst herunter und dann neu hinauf.
    if (n.anhaenge.length > 0) toast.info('Wird in die Baustelle übernommen …');
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
      toast.error(grundAus(e, 'Die Nachricht konnte nicht übernommen werden.'));
      onClose();
    } finally {
      setLaeuft(false);
    }
  }

  const werListe = n && n.reaktionen.length > 0 && (
    <ul className="nachricht-wahl-wer" aria-label="Wer reagiert hat">
      {n.reaktionen.map((r) => (
        <li key={r.zeichen}>
          <span className="reaktion-zeichen" aria-hidden="true">{r.zeichen}</span>
          <span className="sr-only">{REAKTION_NAME[r.zeichen]}: </span>
          <span>{wer(r, user.uid)}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <BottomSheet
        open={imFenster}
        onClose={onClose}
        label="Nachricht"
        auchBreit
        titel={schritt === 'melden' ? 'Nachricht melden' : schritt === 'bearbeiten' ? 'Nachricht bearbeiten' : schritt === 'reaktionen' ? 'Reaktionen' : 'Nachricht'}
      >
        {n && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              {n.eigene ? 'Du' : n.vonName} · <span className="font-mono">{zeitText(n.gesendetAm)}</span>
            </p>

            {schritt === 'reaktionen' && werListe}

            {schritt === 'bearbeiten' && (
              <form
                className="space-y-3"
                onSubmit={(e) => { e.preventDefault(); void tun(() => nachrichtBearbeiten(n.id, text), 'Nachricht geändert'); }}
              >
                <TextareaField id="nachricht-bearbeiten" label="Text" rows={5} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} />
                <p className="text-sm text-ink-muted">Geändert steht die Nachricht mit „bearbeitet“ da. Die alte Fassung wird nicht aufbewahrt.</p>
                <div className="fuss-aktionen">
                  <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
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
                  <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
                  <Button type="submit" loading={laeuft}>An die Geschäftsführung weitergeben</Button>
                </div>
              </form>
            )}

            {fehler && <ErrorState message={fehler} />}
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={!!n && schritt === 'loeschen'}
        title="Nachricht löschen?"
        confirmLabel="Löschen"
        message="Text und Anhänge werden gelöscht — für alle im Gespräch. Es bleibt nur „Nachricht gelöscht“ mit dem Zeitpunkt."
        onCancel={onClose}
        onConfirm={async () => {
          if (n) await tun(() => nachrichtLoeschen(n.id), 'Nachricht gelöscht');
        }}
      />

      <BaustellenWahl
        open={!!n && schritt === 'uebernehmen' && !laeuft}
        titel="In welche Baustelle?"
        companyId={companyId}
        uid={user.uid}
        rolle={user.role}
        onClose={onClose}
        onWahl={(p) => void uebernehmen(p.id)}
      />
    </>
  );
}
