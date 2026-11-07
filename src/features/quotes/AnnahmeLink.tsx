import { useState } from 'react';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import Card from '@/components/Card';
import ConfirmDialog from '@/components/ConfirmDialog';
import Hinweiszeile from '@/components/Hinweiszeile';
import KnopfLink from '@/components/KnopfLink';
import { InputField, SelectField } from '@/components/Field';
import { Zustand, type Stand } from '@/components/Badge';
import { useToast } from '@/components/Toast';
import { ABRECHNUNGSARTEN, abrechnungHinweis, abrechnungText } from '@/lib/abrechnung';
import { angebotLinkErzeugen, type AngebotLink, type AngebotLinkZustand } from '@/lib/db/angebotLinks';
import { praefixFehler } from '@/lib/praefixe';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT } from '@/lib/datum';
import type { Abrechnungsart } from '@/types';
import {
  annahmeAdresse, annahmeMail, linkZustandText, oeffnenText, spaetestensGueltigBis, vorgabeGueltigBis, zeitpunkt,
} from './annahmeLink';

/**
 * DER ANNAHME-LINK IM ANGEBOT (M02a, A06): der Dialog zum Erzeugen und der
 * Abschnitt, der zeigt, was aus dem Link wurde.
 *
 * Abrechnungsart und Vorsatz stehen beim Erzeugen fest (E51, V4) — der
 * Kunde nimmt an, das Büro ist nicht dabei. Deshalb gibt es hier keine
 * Vorgabe für die Abrechnungsart: ohne eine Wahl kein Link.
 */

const STAND_JE_ZUSTAND: Record<AngebotLinkZustand, Stand> = {
  offen: 'laeuft',
  angenommen: 'erledigt',
  abgelehnt: 'storniert',
  widerrufen: 'storniert',
  abgelaufen: 'storniert',
  gegenstandslos: 'storniert',
  // Jemand hat das versendete Angebot an der App vorbei geändert — ansehen.
  geaendert: 'achtung',
};

const ZUSTAND_WORT: Record<AngebotLinkZustand, string> = {
  offen: 'Offen',
  angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt',
  widerrufen: 'Widerrufen',
  abgelaufen: 'Abgelaufen',
  gegenstandslos: 'Gilt nicht mehr',
  geaendert: 'Gilt nicht mehr',
};

export function AnnahmeLinkDialog({
  open,
  onClose,
  angebot,
  firma,
  kundenEmail,
  vorsatz,
  heute,
  ersetztOffenenLink,
}: {
  open: boolean;
  /** `erzeugt`: ein Link ist entstanden — die Seite lädt danach neu. */
  onClose: (erzeugt: boolean) => void;
  angebot: { id: string; quoteNumber: string; status: string; validUntil: string };
  firma: string;
  kundenEmail?: string;
  /** Der Vorsatz des Betriebs für Baustellen — vorbelegt, änderbar. */
  vorsatz: string;
  /** `JJJJ-MM-TT` in Wien. */
  heute: string;
  /** Steht noch ein offener Link? Dann sagt der Dialog, dass er aufhört. */
  ersetztOffenenLink: boolean;
}) {
  const toast = useToast();
  const [abrechnung, setAbrechnung] = useState<Abrechnungsart | ''>('');
  const [praefix, setPraefix] = useState(vorsatz);
  const [gueltigBis, setGueltigBis] = useState(() => vorgabeGueltigBis(angebot.validUntil, heute));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [link, setLink] = useState<{ adresse: string; gueltigBis: string } | null>(null);

  const spaetestens = spaetestensGueltigBis(heute);
  const praefixGrund = praefixFehler(praefix);
  const datumGrund = !gueltigBis
    ? 'Bitte einen Tag angeben.'
    : gueltigBis < heute || gueltigBis > spaetestens
      ? `Ab heute, höchstens bis ${datumAT(spaetestens)}.`
      : null;
  const bereit = !!abrechnung && !praefixGrund && !datumGrund;

  function schliessen() {
    onClose(!!link);
  }

  async function erzeugen() {
    if (!abrechnung) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const neu = await angebotLinkErzeugen(angebot.id, { abrechnung, praefix, gueltigBis });
      setLink({ adresse: annahmeAdresse(window.location.origin, neu.schluessel), gueltigBis: neu.gueltigBis });
    } catch (e) {
      setFehler(grundAus(e, 'Der Link konnte nicht erzeugt werden.'));
    } finally {
      setLaeuft(false);
    }
  }

  async function kopieren() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.adresse);
      toast.success('Link kopiert');
    } catch {
      // Ohne Zugriff auf die Zwischenablage: markieren, dann kopiert man von Hand.
      (document.getElementById('annahme-link-adresse') as HTMLInputElement | null)?.select();
    }
  }

  return (
    <BottomSheet open={open} onClose={schliessen} label="Annahme-Link" auchBreit titel="Annahme-Link" stempel={angebot.quoteNumber}>
      {link ? (
        <div className="formular space-y-4">
          <div className="space-y-2">
            <label htmlFor="annahme-link-adresse" className="section-label">Link für den Kunden — nur jetzt sichtbar</label>
            <input
              id="annahme-link-adresse"
              readOnly
              value={link.adresse}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink"
            />
          </div>
          <p className="text-sm text-ink-muted">
            Gilt bis {datumAT(link.gueltigBis)}. Wer den Link hat, kann das Angebot ansehen und annehmen — bitte nur an
            den Kunden schicken. Ist er verloren, gibt es im Angebot einen neuen.
          </p>
          <div className="fuss-aktionen">
            <Button variant="secondary" onClick={() => void kopieren()}>Kopieren</Button>
            <KnopfLink
              variant="secondary"
              href={annahmeMail({
                an: kundenEmail, angebotsnummer: angebot.quoteNumber, firma, adresse: link.adresse, gueltigBis: link.gueltigBis,
              })}
            >
              Per Mail-Programm senden
            </KnopfLink>
            <Button onClick={schliessen}>Fertig</Button>
          </div>
        </div>
      ) : (
        <form
          className="formular space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (bereit) void erzeugen();
          }}
        >
          <p className="text-sm text-ink">
            Der Kunde sieht das Angebot unter dem Link, kann es als PDF speichern und mit seiner Unterschrift annehmen
            oder ablehnen. Nimmt er an, entsteht die Baustelle wie beim Annehmen hier.
          </p>
          {angebot.status === 'Entwurf' && (
            <Hinweiszeile>
              <p>Der Entwurf gilt damit als versendet und lässt sich nicht mehr bearbeiten.</p>
            </Hinweiszeile>
          )}
          {ersetztOffenenLink && (
            <Hinweiszeile>
              <p>Der bisherige Link hört damit auf.</p>
            </Hinweiszeile>
          )}
          <div>
            <SelectField
              id="annahme-link-abrechnung"
              label="Abrechnung der Baustelle"
              pflicht
              required
              value={abrechnung}
              onChange={(e) => setAbrechnung(e.target.value as Abrechnungsart | '')}
            >
              <option value="">Bitte wählen</option>
              {ABRECHNUNGSARTEN.map((a) => (
                <option key={a.wert} value={a.wert}>
                  {a.text}
                </option>
              ))}
            </SelectField>
            <p className="mt-1 text-sm text-ink-muted">
              {abrechnung ? abrechnungHinweis(abrechnung) : 'Ohne Abrechnungsart gibt es keinen Link — der Kunde nimmt an, ohne dass jemand nachfragen kann.'}
            </p>
          </div>
          <div>
            <InputField
              id="annahme-link-vorsatz"
              label="Vorsatz der Baustellennummer"
              value={praefix}
              autoCapitalize="characters"
              onChange={(e) => setPraefix(e.target.value.toUpperCase())}
              aria-invalid={!!praefixGrund || undefined}
              aria-describedby="annahme-link-vorsatz-hinweis"
            />
            <p id="annahme-link-vorsatz-hinweis" className={`mt-1 text-sm ${praefixGrund ? 'text-danger' : 'text-ink-muted'}`}>
              {praefixGrund ?? (praefix ? `Die Baustelle bekommt eine Nummer wie ${praefix}-2026-0001.` : 'Ohne Vorsatz: eine Nummer wie 2026-0001.')}
            </p>
          </div>
          <div>
            <InputField
              id="annahme-link-gueltig"
              type="date"
              label="Gültig bis"
              pflicht
              required
              min={heute}
              max={spaetestens}
              value={gueltigBis}
              onChange={(e) => setGueltigBis(e.target.value)}
              aria-invalid={!!datumGrund || undefined}
              aria-describedby="annahme-link-gueltig-hinweis"
            />
            <p id="annahme-link-gueltig-hinweis" className={`mt-1 text-sm ${datumGrund ? 'text-danger' : 'text-ink-muted'}`}>
              {datumGrund ?? 'Vorgabe: die Bindefrist des Angebots, liegt sie zurück 30 Tage. Höchstens ein Jahr.'}
            </p>
          </div>
          {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}
          <div className="fuss-aktionen">
            <Button type="button" variant="ghost" onClick={schliessen}>Abbrechen</Button>
            <Button type="submit" loading={laeuft} disabled={!bereit}>Link erzeugen</Button>
          </div>
        </form>
      )}
    </BottomSheet>
  );
}

export function AnnahmeLinkAbschnitt({
  links,
  darfAendern,
  modulAn,
  neuMoeglich,
  onNeu,
  onWiderrufen,
}: {
  /** Der jüngste zuerst. */
  links: AngebotLink[];
  darfAendern: boolean;
  modulAn: boolean;
  /** Lässt das Angebot einen neuen Link zu (Entwurf oder versendet, keine andere Fassung angenommen)? */
  neuMoeglich: boolean;
  onNeu: () => void;
  onWiderrufen: (link: AngebotLink) => Promise<void>;
}) {
  const [frage, setFrage] = useState<AngebotLink | null>(null);
  const [jetzt, ...frueher] = links;
  if (!jetzt) return null;

  return (
    <Card
      title="Annahme per Link"
      id="angebot-annahmelink"
      hint={
        <>
          Der Kunde öffnet den Link ohne Konto, sieht das Angebot so, wie es beim Erzeugen war, und nimmt mit Name und
          Unterschrift an — oder lehnt ab. Nimmt er an, entsteht die Baustelle mit der Abrechnungsart und dem Vorsatz
          dieses Links. Jedes Öffnen zählt, auch ein eigenes zum Ausprobieren; festgehalten wird nur der Zeitpunkt,
          keine Adresse und kein Gerät.
        </>
      }
    >
      <div className="space-y-4">
        {!modulAn && (
          <Hinweiszeile stufe="warn">
            <p>
              Die Annahme per Link ist ausgeschaltet (Einstellungen → Module). Solange sieht der Kunde dieselbe Meldung
              wie bei einem ungültigen Link.
            </p>
          </Hinweiszeile>
        )}
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Zustand stand={STAND_JE_ZUSTAND[jetzt.zustand]}>{ZUSTAND_WORT[jetzt.zustand]}</Zustand>
            <span className="text-sm text-ink">{linkZustandText(jetzt)}</span>
          </p>
          <p className="text-sm text-ink-muted">
            Baustelle: {abrechnungText(jetzt.abrechnung)}, {jetzt.praefix ? `Vorsatz ${jetzt.praefix}` : 'ohne Vorsatz'}
          </p>
          <p className="text-sm text-ink-muted">
            Erzeugt{jetzt.erzeugtVonName ? ` von ${jetzt.erzeugtVonName}` : ''} am {zeitpunkt(jetzt.erzeugtAm)} · {oeffnenText(jetzt)}
          </p>
        </div>

        {jetzt.zustand === 'angenommen' && jetzt.angenommenUnterschrift && (
          <figure className="space-y-1">
            <img
              src={jetzt.angenommenUnterschrift}
              alt={`Unterschrift von ${jetzt.angenommenName ?? 'Kunde'}`}
              className="h-24 max-w-full border border-line bg-surface"
            />
            <figcaption className="text-sm text-ink-muted">
              {jetzt.angenommenName} — verbindlich angenommen über den Link
            </figcaption>
          </figure>
        )}
        {jetzt.zustand === 'abgelehnt' && (
          <p className="whitespace-pre-line text-sm text-ink">
            {jetzt.abgelehntGrund ? `Grund: ${jetzt.abgelehntGrund}` : 'Ohne Angabe eines Grundes.'}
          </p>
        )}
        <p className="text-xs text-ink-muted">
          Prüfsumme des Stands: <span className="break-all font-mono">{jetzt.schnappschussHash}</span>
        </p>

        {darfAendern && (jetzt.zustand === 'offen' || (neuMoeglich && modulAn)) && (
          <div className="fuss-aktionen">
            {jetzt.zustand === 'offen' && (
              <Button variant="ghost" onClick={() => setFrage(jetzt)}>Widerrufen</Button>
            )}
            {neuMoeglich && modulAn && (
              <Button variant="secondary" onClick={onNeu}>Neuer Link</Button>
            )}
          </div>
        )}

        {frueher.length > 0 && (
          <div>
            <p className="section-label">Frühere Links</p>
            <ul className="mt-1 space-y-1 text-sm text-ink-muted">
              {frueher.map((l) => (
                <li key={l.id}>
                  Vom {zeitpunkt(l.erzeugtAm)}: {linkZustandText(l)} · {oeffnenText(l)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!frage}
        title="Annahme-Link widerrufen?"
        message="Danach antwortet der Link wie ein ungültiger; der Kunde kann nicht mehr annehmen. Ein neuer Link geht jederzeit."
        confirmLabel="Widerrufen"
        confirmTone="danger"
        onCancel={() => setFrage(null)}
        onConfirm={async () => {
          if (!frage) return;
          // Scheitert es, bleibt der Dialog offen und sagt den Grund (ConfirmDialog).
          await onWiderrufen(frage);
          setFrage(null);
        }}
      />
    </Card>
  );
}
