import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
import KnopfLink from '@/components/KnopfLink';
import { CheckboxField, InputField, TextareaField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthContext';
import { isTopLevel } from '@/lib/permissions';
import { grundAus } from '@/lib/fehlerGrund';
import {
  ANHANG_MAX_BYTES, anhangName, betreffFehler, empfaengerLesen, textFehler, vorlageFuellen, vorlageFuer, type BelegArt,
} from '@shared/belegMail';
import {
  BelegMailNichtEingerichtet, belegMailStand, belegPerMail, listBelegVersand, type BelegVersand,
} from '@/lib/db/belegMail';

/**
 * RECHNUNG ODER ANGEBOT PER MAIL (Durchsicht 15.11.2026, F16; Roadmap 11.2 Nr. 1).
 *
 * Empfänger aus dem Kunden vorbelegt, Betreff und Text aus der Vorlage des
 * Betriebs, das PDF wie beim „PDF laden“ aus dem gespeicherten Beleg, die
 * Kopie an den Betrieb vorgewählt. Gesendet wird über die Edge Function;
 * im Verlauf des Belegs steht danach wann, an wen, von wem.
 *
 * WENN DER VERSAND NICHT GEHT, bleibt der bisherige Weg im selben Fenster:
 * ist er nicht eingerichtet (das richtet der Betreiber ein), stehen gleich
 * „PDF laden“ und „Mail-Programm öffnen“ da; scheitert ein Versand, stehen
 * sie unter der Meldung. Niemand muss das Fenster schließen, um den Beleg
 * doch noch hinauszubringen.
 */

export interface BelegMailWerte {
  /** Bei der Mahnung die Nummer der Rechnung. */
  nummer: string;
  kunde: string;
  betrag?: string;
  faellig?: string;
  gueltig_bis?: string;
  baustelle?: string;
  link?: string;
  /** Mahnung: „Zahlungserinnerung“, „Mahnung“, „Letzte Mahnung“ — und ihre Stufe für den Dateinamen. */
  titel?: string;
  mahnstufe?: 1 | 2 | 3;
  /** Mahnung: der offene Rest der Rechnung und die Frist des Schreibens. */
  offen?: string;
  frist?: string;
}

type Stand = { art: 'pruefe' } | { art: 'bereit'; absender: string } | { art: 'nicht' } | { art: 'fehler'; text: string };

export default function BelegMailDialog({
  open,
  onClose,
  art,
  belegId,
  werte,
  kundenEmail,
  pdfErzeugen,
  pdfLaden,
  zusatz,
}: {
  open: boolean;
  /** `gesendet`: die Mail ging hinaus — der Aufrufer lädt neu (ein Entwurf ist jetzt versendet). */
  onClose: (gesendet: boolean) => void;
  art: BelegArt;
  belegId: string;
  werte: BelegMailWerte;
  kundenEmail?: string;
  /** Das PDF, genau wie beim „PDF laden“. Läuft erst beim Senden. */
  pdfErzeugen: () => Promise<Blob>;
  /** Der bisherige Weg: das PDF herunterladen. */
  pdfLaden: () => void;
  /** Was nur dieser Beleg braucht, über den Knöpfen (z. B. „Angebotsdatum auf heute“). */
  zusatz?: ReactNode;
}) {
  const { user, company } = useAuth();
  const toast = useToast();
  const vorlage = useMemo(() => vorlageFuer(art, company?.belegMailVorlagen), [art, company?.belegMailVorlagen]);
  const firma = company?.name ?? '';
  // Die Stufe ist kein Platzhalter, nur der Dateiname braucht sie.
  const { mahnstufe, ...platzhalter } = werte;
  const fuellen = (t: string) => vorlageFuellen(t, { ...platzhalter, firma });
  const [an, setAn] = useState(kundenEmail ?? '');
  const [kopie, setKopie] = useState(true);
  const [betreff, setBetreff] = useState(() => fuellen(vorlage.betreff));
  const [text, setText] = useState(() => fuellen(vorlage.text));
  const [stand, setStand] = useState<Stand>({ art: 'pruefe' });
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [frueher, setFrueher] = useState<BelegVersand[]>([]);
  const antwort = company?.belegMailAntwort ?? null;
  // Nur die Kennung: ein neues Objekt für dieselbe Person darf die Abfragen nicht erneut auslösen.
  const betrieb = user?.companyId;

  useEffect(() => {
    if (!open) return;
    let weg = false;
    setStand({ art: 'pruefe' });
    belegMailStand()
      .then((s) => { if (!weg) setStand(s.eingerichtet ? { art: 'bereit', absender: s.absender ?? '' } : { art: 'nicht' }); })
      .catch((e) => { if (!weg) setStand({ art: 'fehler', text: grundAus(e, 'Ob der Mailversand eingerichtet ist, ließ sich nicht klären.') }); });
    if (betrieb) {
      listBelegVersand(betrieb, art, belegId)
        .then((l) => { if (!weg) setFrueher(l); })
        .catch(() => { if (!weg) setFrueher([]); });
    }
    return () => { weg = true; };
  }, [open, art, belegId, betrieb]);

  const empfaenger = empfaengerLesen(an);
  const eingabeFehler = empfaenger.fehler ?? betreffFehler(betreff) ?? textFehler(text);
  const bereit = stand.art === 'bereit' && !!antwort && !eingabeFehler;
  const mailto = `mailto:${encodeURIComponent(empfaenger.adressen.join(',')).replace(/%40/g, '@').replace(/%2C/g, ',')}`
    + `?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;

  async function senden() {
    setFehler(null);
    setLaeuft(true);
    try {
      const pdf = await pdfErzeugen();
      if (pdf.size > ANHANG_MAX_BYTES) {
        setFehler('Das PDF ist größer als 6 MB — zu groß für eine Mail aus der App. Bitte das PDF laden und selbst senden.');
        return;
      }
      const r = await belegPerMail({
        art, beleg: belegId, an: empfaenger.adressen, kopie, betreff: betreff.trim(), text, pdf, mitLink: !!werte.link && text.includes(werte.link),
      });
      toast.success(`${belegWort} ${werte.nummer} an ${r.an.join(', ')} gesendet${r.kopie ? ' — Kopie an den Betrieb' : ''}`);
      if (r.hinweis) toast.error(r.hinweis);
      onClose(true);
    } catch (e) {
      if (e instanceof BelegMailNichtEingerichtet) setStand({ art: 'nicht' });
      else setFehler(grundAus(e, 'Die Mail konnte nicht gesendet werden.'));
    } finally {
      setLaeuft(false);
    }
  }

  const belegWort = art === 'rechnung' ? 'Rechnung' : art === 'angebot' ? 'Angebot' : (werte.titel ?? 'Mahnung');
  const titel = `${belegWort} per Mail`;
  const bisherigerWeg = (
    <div className="fuss-aktionen">
      <Button variant="secondary" onClick={pdfLaden}>PDF laden</Button>
      <KnopfLink variant="secondary" href={mailto}>Mail-Programm öffnen</KnopfLink>
    </div>
  );

  return (
    <BottomSheet open={open} onClose={() => onClose(false)} label={titel} auchBreit titel={titel} stempel={werte.nummer}>
      <form
        className="formular space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (bereit && !laeuft) void senden();
        }}
      >
        {stand.art === 'nicht' && (
          <Hinweiszeile stufe="warn">
            <p>
              Der Mailversand aus der App ist noch nicht eingerichtet — das erledigt der Betreiber von Senklot. Bis dahin
              das PDF laden und mit dem eigenen Mailprogramm senden; Empfänger, Betreff und Text unten gehen mit
              „Mail-Programm öffnen“ mit, das PDF wird dort angehängt.
            </p>
          </Hinweiszeile>
        )}
        {stand.art === 'fehler' && <Hinweiszeile stufe="warn"><p>{stand.text}</p></Hinweiszeile>}
        {stand.art !== 'nicht' && !antwort && (
          <Hinweiszeile stufe="warn">
            <p>
              Für den Versand fehlt die Antwortadresse des Betriebs — dorthin antwortet der Kunde, und dorthin geht die
              Kopie.{' '}
              {user && isTopLevel(user.role)
                ? <Link to="/settings/rechnung" className="link">In den Rechnungsvorgaben eintragen</Link>
                : 'Die Geschäftsführung trägt sie in den Rechnungsvorgaben ein.'}
            </p>
          </Hinweiszeile>
        )}

        <div>
          <InputField
            id="beleg-mail-an"
            label="An"
            type="text"
            inputMode="email"
            autoComplete="email"
            pflicht
            value={an}
            onChange={(e) => setAn(e.target.value)}
            aria-describedby="beleg-mail-an-hinweis"
          />
          <p id="beleg-mail-an-hinweis" className="mt-1 text-sm text-ink-muted">
            {kundenEmail ? 'Aus dem Kunden vorbelegt. ' : 'Beim Kunden ist keine Adresse hinterlegt. '}
            Bis zu drei Adressen, durch Komma getrennt.
          </p>
        </div>
        {antwort && (
          <CheckboxField id="beleg-mail-kopie" label={`Kopie an ${antwort}`} checked={kopie} onChange={(e) => setKopie(e.target.checked)} />
        )}
        <InputField id="beleg-mail-betreff" label="Betreff" pflicht value={betreff} onChange={(e) => setBetreff(e.target.value)} />
        <TextareaField id="beleg-mail-text" label="Text" pflicht rows={10} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="text-sm text-ink-muted">
          Anhang: {anhangName(art, werte.nummer, mahnstufe)} — {art === 'mahnung' ? 'das gespeicherte Schreiben, wie beim „PDF“ der Mahnung' : 'wie beim „PDF laden“'}.
          {stand.art === 'bereit' && antwort && ` Gesendet über ${stand.absender} im Namen von ${firma}; Antworten gehen an ${antwort}.`}
        </p>

        {frueher.length > 0 && (
          <div>
            <p className="section-label">Bisher per Mail</p>
            <ul className="mt-1 space-y-1 text-sm text-ink-muted">
              {frueher.slice(0, 5).map((v) => (
                <li key={v.id}>
                  {new Date(v.angefragtAm).toLocaleString('de-AT', { timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {' an '}{v.an.join(', ')}
                  {v.zustand === 'versendet' ? '' : v.zustand === 'gescheitert' ? ' — nicht gesendet' : ' — ohne Rückmeldung'}
                  {v.vonName ? ` · ${v.vonName}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {zusatz}

        {fehler && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-danger">{fehler}</p>
            <p className="text-sm text-ink-muted">Der bisherige Weg geht weiter:</p>
            {bisherigerWeg}
          </div>
        )}
        {stand.art === 'nicht' ? bisherigerWeg : (
          <div className="fuss-aktionen">
            <Button type="button" variant="ghost" onClick={() => onClose(false)}>Abbrechen</Button>
            <Button type="submit" loading={laeuft || stand.art === 'pruefe'} disabled={!bereit}>Senden</Button>
          </div>
        )}
        {eingabeFehler && an.trim() !== '' && stand.art === 'bereit' && (
          <p className="text-sm text-ink-muted" aria-live="polite">{eingabeFehler}</p>
        )}
      </form>
    </BottomSheet>
  );
}
