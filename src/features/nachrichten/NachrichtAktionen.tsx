import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  anhangAdressen, kanalBaustelle, nachrichtBearbeiten, nachrichtLoeschen, nachrichtMelden, nachrichtSenden,
  REAKTIONEN, REAKTION_NAME,
  type KanalKopf, type Nachricht, type NeueDatei, type Reaktionszeichen,
} from '@/lib/db/nachrichten';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { TextareaField } from '@/components/Field';
import Icon from '@/components/Icon';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { useModul } from '@/lib/useModule';
import BaustellenWahl from './BaustellenWahl';
import { HANDLUNGEN, moeglichkeiten, textKopieren, type Handlung } from './moeglichkeiten';
import { wer } from './reaktionen';
import { zeitText } from './text';

/**
 * Wo das Fenster beginnt: `wahl` nach langem Drücken (oder mit der Tastatur),
 * die übrigen direkt aus der Leiste beim Darüberfahren (E77).
 */
export type Schritt = 'wahl' | 'bearbeiten' | 'melden' | 'loeschen' | 'uebernehmen' | 'reaktionen';
export interface Auftrag { n: Nachricht; schritt: Schritt }

/**
 * WAS MAN MIT EINER NACHRICHT TUN KANN — seit E77 (11.11.2026) ohne die
 * gerahmten Wortknöpfe („zu globig“). Am Schreibtisch steht alles in der
 * Leiste beim Darüberfahren; dieses Fenster öffnet nur noch, was ein
 * Formular oder eine Rückfrage braucht: bearbeiten, melden, löschen, die
 * Baustelle wählen. Am Handy öffnet langes Drücken die Wahl: oben die
 * Reaktionen, darunter eine knappe Liste mit Zeichen — wie in Teams.
 *
 *   - die eigene: bearbeiten, löschen (Text und Anhänge gehen wirklich),
 *     aus einem privaten Gespräch in eine Baustelle übernehmen;
 *   - eine fremde: melden (D5) — genau diese Nachricht geht als Kopie an die
 *     Geschäftsführung, sonst nichts aus dem Gespräch;
 *   - jede: reagieren, den Text kopieren.
 */
export default function NachrichtAktionen({
  auftrag,
  kopf,
  companyId,
  onClose,
  onGeaendert,
  onReagieren,
}: {
  auftrag: Auftrag | null;
  kopf: KanalKopf;
  companyId: string;
  onClose: () => void;
  onGeaendert: () => void;
  onReagieren: (n: Nachricht, z: Reaktionszeichen, an: boolean) => void;
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

  useEffect(() => {
    setSchritt(auftrag?.schritt ?? 'wahl');
    setText(auftrag?.n.text ?? '');
    setGrund('');
    setFehler(null);
  }, [auftrag]);

  if (!user) return null;
  const n = auftrag?.n ?? null;
  // Aus der Wahl kommt man mit „Zurück“ dorthin; aus der Leiste schließt „Abbrechen“.
  const ausWahl = auftrag?.schritt === 'wahl';
  const zurueck = () => (ausWahl ? setSchritt('wahl') : onClose());
  const imFenster = !!n && (schritt === 'wahl' || schritt === 'bearbeiten' || schritt === 'melden' || schritt === 'reaktionen');
  const m = n ? moeglichkeiten(n, kopf, nachrichtenAn) : null;

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

  async function handlung(h: Handlung) {
    if (!n) return;
    if (h === 'kopieren') {
      if (await textKopieren(n.text ?? '')) { toast.success('Text kopiert'); onClose(); }
      else setFehler('Kopieren geht hier nicht — bitte den Text markieren.');
      return;
    }
    setSchritt(h);
  }

  const reagieren = (z: Reaktionszeichen) => {
    if (!n) return;
    const an = !n.reaktionen.find((r) => r.zeichen === z)?.meine;
    onReagieren(n, z, an);
    onClose();
  };

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
        {n && m && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              {n.eigene ? 'Du' : n.vonName} · <span className="font-mono">{zeitText(n.gesendetAm)}</span>
            </p>

            {schritt === 'wahl' && (
              <>
                {n.geloeschtAm ? (
                  <p className="text-ink-muted">Diese Nachricht ist gelöscht.</p>
                ) : (
                  n.text && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{n.text}</p>
                )}
                {m.reagieren && (
                  <div className="nachricht-wahl-reaktionen" role="group" aria-label="Reagieren">
                    {REAKTIONEN.map((z) => (
                      <button
                        key={z}
                        type="button"
                        className="nachricht-wahl-zeichen"
                        aria-label={`Reagieren: ${REAKTION_NAME[z]}`}
                        aria-pressed={!!n.reaktionen.find((r) => r.zeichen === z)?.meine}
                        onClick={() => reagieren(z)}
                      >
                        <span aria-hidden="true">{z}</span>
                      </button>
                    ))}
                  </div>
                )}
                {werListe}
                {HANDLUNGEN.some((h) => m[h.art]) && (
                  <ul className="nachricht-wahl-liste">
                    {HANDLUNGEN.filter((h) => m[h.art]).map((h) => (
                      <li key={h.art}>
                        <button
                          type="button"
                          className="nachricht-wahl-zeile"
                          data-ton={h.art === 'loeschen' ? 'gefahr' : undefined}
                          onClick={() => void handlung(h.art)}
                        >
                          <Icon name={h.icon} size={20} />
                          <span>{h.art === 'melden' || h.art === 'uebernehmen' ? `${h.name} …` : h.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!n.eigene && n.gemeldet && !n.geloeschtAm && (
                  <p className="text-sm text-ink-muted">Du hast diese Nachricht der Geschäftsführung gemeldet.</p>
                )}
              </>
            )}

            {schritt === 'reaktionen' && werListe}

            {schritt === 'bearbeiten' && (
              <form
                className="space-y-3"
                onSubmit={(e) => { e.preventDefault(); void tun(() => nachrichtBearbeiten(n.id, text), 'Nachricht geändert'); }}
              >
                <TextareaField id="nachricht-bearbeiten" label="Text" rows={5} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} />
                <p className="text-sm text-ink-muted">Geändert steht die Nachricht mit „bearbeitet“ da. Die alte Fassung wird nicht aufbewahrt.</p>
                <div className="fuss-aktionen">
                  <Button type="button" variant="ghost" onClick={zurueck}>{ausWahl ? 'Zurück' : 'Abbrechen'}</Button>
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
                  <Button type="button" variant="ghost" onClick={zurueck}>{ausWahl ? 'Zurück' : 'Abbrechen'}</Button>
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
