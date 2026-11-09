import { useState } from 'react';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import { CheckboxField } from '@/components/Field';
import Icon from '@/components/Icon';
import { useAuth } from '@/app/AuthContext';
import { useToastWennDa } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { startseiteWahlSpeichern } from '@/lib/db/startseiteWahl';
import type { StartRolle } from './laden';
import {
  BEREICH_ARBEITSTAG,
  BEREICH_NAMEN,
  BEREICH_TAG,
  HOECHSTENS_KENNZAHLEN,
  KENNZAHL_NAMEN,
  KENNZAHLEN_VORGABE,
  THEMEN,
  geltendeKennzahlen,
  type StartWahl,
} from './einrichtung';
import { startWahlNeuLaden } from './useStartWahl';

/**
 * „STARTSEITE ANPASSEN“ (E68) — im ⋯ des Seitenkopfs der Startseite.
 *
 * Drei Teile: die Zahlen oben (höchstens vier, in eigener Folge), die
 * Bereiche (Arbeitstag, Tagesüberblick) und die Themen unter „Zu erledigen“.
 * Angeboten wird nur, was die Rolle sehen darf (`waehlbar`); ausgeblendete
 * Themen stehen auf der Seite gesammelt, sie gehen nicht verloren.
 *
 * Gespeichert wird nur, was von der Vorgabe abweicht: wer nichts ändert,
 * bekommt auch künftige Vorgaben der Rolle.
 */
export default function StartseiteAnpassen({
  open,
  onClose,
  rolle,
  waehlbar,
  arbeitstagMoeglich,
  wahl,
}: {
  open: boolean;
  onClose: () => void;
  rolle: StartRolle;
  /** Die Kennzahlen, die diese Person wählen kann (`waehlbareKennzahlen`). */
  waehlbar: string[];
  /** Steht die Karte „Arbeitstag“ überhaupt auf der Startseite (Start/Stopp an)? */
  arbeitstagMoeglich: boolean;
  wahl: StartWahl | null;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Startseite anpassen" titel="Startseite anpassen" auchBreit>
      {open && <Inhalt onClose={onClose} rolle={rolle} waehlbar={waehlbar} arbeitstagMoeglich={arbeitstagMoeglich} wahl={wahl} />}
    </BottomSheet>
  );
}

function Inhalt({ onClose, rolle, waehlbar, arbeitstagMoeglich, wahl }: {
  onClose: () => void;
  rolle: StartRolle;
  waehlbar: string[];
  arbeitstagMoeglich: boolean;
  wahl: StartWahl | null;
}) {
  const { user } = useAuth();
  const toast = useToastWennDa();
  const vorgabe = KENNZAHLEN_VORGABE[rolle].filter((k) => waehlbar.includes(k));
  const [gewaehlt, setGewaehlt] = useState<string[]>(() => geltendeKennzahlen(rolle, wahl).filter((k) => waehlbar.includes(k)));
  const [aus, setAus] = useState<Set<string>>(() => new Set(wahl?.aus ?? []));
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const voll = gewaehlt.length >= HOECHSTENS_KENNZAHLEN;
  const nichtGewaehlt = waehlbar.filter((k) => !gewaehlt.includes(k));
  const bereiche = [...(arbeitstagMoeglich ? [BEREICH_ARBEITSTAG] : []), BEREICH_TAG];

  const umschalten = (k: string) =>
    setGewaehlt((alt) => (alt.includes(k) ? alt.filter((x) => x !== k) : alt.length >= HOECHSTENS_KENNZAHLEN ? alt : [...alt, k]));
  const schieben = (i: number, um: -1 | 1) =>
    setGewaehlt((alt) => {
      const neu = [...alt];
      [neu[i], neu[i + um]] = [neu[i + um], neu[i]];
      return neu;
    });
  const zeigen = (k: string, an: boolean) =>
    setAus((alt) => {
      const neu = new Set(alt);
      if (an) neu.delete(k);
      else neu.add(k);
      return neu;
    });

  async function speichern(neu: StartWahl) {
    if (!user) return;
    setSpeichert(true);
    setFehler(null);
    try {
      await startseiteWahlSpeichern(neu);
      await startWahlNeuLaden(user);
      toast?.success('Startseite gespeichert');
      onClose();
    } catch (e) {
      setFehler(grundAus(e, 'Die Startseite konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  function uebernehmen() {
    const gleichVorgabe = gewaehlt.length === vorgabe.length && gewaehlt.every((k, i) => k === vorgabe[i]);
    // Nur Bekanntes merken: ein Thema, das es für die Rolle nicht (mehr) gibt, fällt heraus.
    const bekannt = new Set([...bereiche, ...THEMEN[rolle].map((t) => t.key)]);
    const ausListe = [...aus].filter((k) => bekannt.has(k));
    void speichern({
      ...(gleichVorgabe ? {} : { kennzahlen: gewaehlt }),
      ...(ausListe.length ? { aus: ausListe } : {}),
    });
  }

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); uebernehmen(); }}>
      {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}

      {waehlbar.length > 0 && (
        <fieldset className="anpassen-gruppe">
          <legend className="anpassen-titel">Zahlen oben</legend>
          <p className="anpassen-hinweis">Höchstens {HOECHSTENS_KENNZAHLEN}. In dieser Reihenfolge stehen sie oben.</p>
          <ul className="anpassen-liste" aria-label="Gewählte Zahlen">
            {gewaehlt.map((k, i) => (
              <li key={k} className="anpassen-zeile">
                <CheckboxField id={`kz-${k}`} label={KENNZAHL_NAMEN[k]} checked onChange={() => umschalten(k)} />
                <span className="anpassen-folge">
                  <button type="button" className="anpassen-pfeil" aria-label={`${KENNZAHL_NAMEN[k]} nach vorn`} disabled={i === 0} onClick={() => schieben(i, -1)}>
                    <Icon name="chevron" size={16} className="anpassen-hoch" aria-hidden="true" />
                  </button>
                  <button type="button" className="anpassen-pfeil" aria-label={`${KENNZAHL_NAMEN[k]} nach hinten`} disabled={i === gewaehlt.length - 1} onClick={() => schieben(i, 1)}>
                    <Icon name="chevron" size={16} aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
            {nichtGewaehlt.map((k) => (
              <li key={k} className="anpassen-zeile">
                <CheckboxField id={`kz-${k}`} label={KENNZAHL_NAMEN[k]} checked={false} disabled={voll} onChange={() => umschalten(k)} />
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <fieldset className="anpassen-gruppe">
        <legend className="anpassen-titel">Bereiche</legend>
        {bereiche.map((k) => (
          <CheckboxField key={k} id={`zeige-${k}`} label={BEREICH_NAMEN[k]} checked={!aus.has(k)} onChange={(e) => zeigen(k, e.target.checked)} />
        ))}
      </fieldset>

      <fieldset className="anpassen-gruppe">
        <legend className="anpassen-titel">Zu erledigen</legend>
        <p className="anpassen-hinweis">Ausgeblendetes verschwindet nicht: unter „Zu erledigen“ steht, wie viel ausgeblendet ist, und ein Tipp zeigt es.</p>
        {THEMEN[rolle].map((t) => (
          <CheckboxField key={t.key} id={`zeige-${t.key}`} label={t.name} checked={!aus.has(t.key)} onChange={(e) => zeigen(t.key, e.target.checked)} />
        ))}
      </fieldset>

      <div className="fuss-aktionen">
        <Button type="button" variant="ghost" disabled={speichert} onClick={() => void speichern({})}>Vorgabe wiederherstellen</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
        <Button type="submit" loading={speichert}>Speichern</Button>
      </div>
    </form>
  );
}
