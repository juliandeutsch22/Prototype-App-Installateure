import { useMemo, useRef, useState, type FormEvent } from 'react';
import type { AppUser, Company, Freistellung } from '@/types';
import { freistellungBeantragen, nachweisHochladen, nachweisPruefen } from '@/lib/db/freistellungen';
import {
  ART_NAME,
  KUERZUNG_AB_VORGABE,
  anlaesseDesBetriebs,
  anlassVon,
  istTeilung,
  kalendertage,
  laengerAlsEinMonat,
  pflegeStand,
  type FreistellungArt,
} from '@shared/freistellung';
import { fmtDauer, todayStr, urlaubsTage } from '@/lib/time';
import Button from '@/components/Button';
import InfoHint from '@/components/InfoHint';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import { ErrorState } from '@/components/States';
import Hinweiszeile from '@/components/Hinweiszeile';
import { datumAT } from '@/lib/datum';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';

/**
 * DER ANTRAG AUF SONDERURLAUB, PFLEGEFREISTELLUNG ODER UNBEZAHLTEN URLAUB
 * (Plan 10.3). Je Art nur die nötigen Felder; was lang zu erklären ist,
 * steht hinter dem „i".
 *
 * Bestätigt wird von anderen; harte Grenzen prüft die Datenbank, alles
 * andere sehen die Bestätigenden als Warnung.
 */
export default function FreistellungFormular({
  art,
  user,
  profil,
  company,
  eigene,
  onGestellt,
}: {
  art: FreistellungArt;
  user: { uid: string; companyId: string };
  profil: AppUser | null;
  company: Company | null | undefined;
  eigene: Freistellung[];
  onGestellt: () => void;
}) {
  const toast = useToast();
  const heute = todayStr();
  const anlaesse = useMemo(() => anlaesseDesBetriebs(company?.freistellungAnlaesse), [company?.freistellungAnlaesse]);
  const [anlass, setAnlass] = useState('');
  const [ereignis, setEreignis] = useState(heute);
  const [von, setVon] = useState(heute);
  const [bis, setBis] = useState(heute);
  const [stundenweise, setStundenweise] = useState(false);
  const [zeitVon, setZeitVon] = useState('08:00');
  const [zeitBis, setZeitBis] = useState('12:00');
  const [kind, setKind] = useState(false);
  const [zusatz, setZusatz] = useState(false);
  const [notiz, setNotiz] = useState('');
  const [datei, setDatei] = useState<File | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);

  const gewaehlt = anlassVon(anlass, anlaesse);
  const stundenErlaubt = art === 'pflegefreistellung' || (art === 'dienstverhinderung' && gewaehlt?.regel === 'notwendigeZeit');
  const mitStunden = stundenErlaubt && stundenweise;
  const bisTag = mitStunden ? von : bis;
  const arbeitstage = profil ? urlaubsTage(profil, von, bisTag).length : 0;

  // Eine Teilung (zweiter Antrag zum selben Fall) braucht außer beim Todesfall eine Begründung.
  const teilung = art === 'dienstverhinderung' && !!anlass && istTeilung(
    { id: '', userId: user.uid, art, anlass, ereignisDatum: ereignis, von, bis: bisTag, status: 'Beantragt' },
    eigene,
  );
  const begruendungNoetig = teilung && !gewaehlt?.todesfall;

  const pflege = profil
    ? pflegeStand(eigene, profil.weeklyTargetHours, profil.eintritt ?? profil.appStartDate, von)
    : null;

  /*
    DIE ÜBERSCHNEIDUNG SCHON IM FORMULAR (Runde 3, G16), wie beim Urlaub.
    Dieselbe Regel wie `freistellung_beantragen`: ein offener oder bestätigter
    eigener Antrag im selben Zeitraum. Vorher meldete erst das Absenden die
    Ablehnung der Datenbank; entscheiden tut sie weiterhin.
  */
  const ueberschneidung = useMemo(() => {
    if (bisTag < von) return null;
    const andere = eigene
      .filter((f) => (f.status === 'Beantragt' || f.status === 'Bestätigt') && f.von <= bisTag && f.bis >= von)
      .sort((a, b) => a.von.localeCompare(b.von))[0];
    if (!andere) return null;
    const wann = andere.von === andere.bis
      ? `am ${datumAT(andere.von)}`
      : `vom ${datumAT(andere.von)} bis ${datumAT(andere.bis)}`;
    return `Überschneidet sich mit dem Antrag auf ${ART_NAME[andere.art]} ${wann} (${andere.status}). Bitte einen anderen Zeitraum wählen.`;
  }, [eigene, von, bisTag]);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    if (art === 'dienstverhinderung' && !anlass) {
      setFehler('Bitte den Anlass wählen.');
      return;
    }
    if (ueberschneidung) {
      setFehler(ueberschneidung);
      return;
    }
    if (begruendungNoetig && notiz.trim().length < 3) {
      setFehler('Zu diesem Anlass gibt es schon einen Antrag. Bitte in der Notiz begründen, warum geteilt wird.');
      return;
    }
    if (datei) {
      const f = nachweisPruefen(datei);
      if (f) {
        setFehler(f);
        return;
      }
    }
    setSendet(true);
    try {
      const id = await freistellungBeantragen({
        art,
        anlass: art === 'dienstverhinderung' ? anlass : null,
        ereignisDatum: art === 'dienstverhinderung' ? ereignis : null,
        von,
        bis: bisTag,
        zeitVon: mitStunden ? zeitVon : null,
        zeitBis: mitStunden ? zeitBis : null,
        kindUnter12: art === 'pflegefreistellung' && kind,
        zusatzwoche: art === 'pflegefreistellung' && kind && zusatz,
        notiz: notiz.trim() || undefined,
      });
      if (datei) {
        try {
          await nachweisHochladen(user.companyId, user.uid, id, datei);
        } catch (err) {
          // Der Antrag steht; den Nachweis kann man in „Meine Anträge" nachreichen.
          toast.error(grundAus(err, 'Der Antrag ist gestellt, der Nachweis kam nicht an — bitte unten beim Antrag noch einmal hochladen.'));
        }
      }
      toast.success('Antrag gestellt');
      setNotiz('');
      setDatei(null);
      setAnlass('');
      onGestellt();
    } catch (err) {
      setFehler(grundAus(err, 'Der Antrag konnte nicht gestellt werden.'));
    } finally {
      setSendet(false);
    }
  }

  return (
    <form onSubmit={absenden} className="space-y-4">
      {art === 'dienstverhinderung' && (
        <FormGrid>
          <SelectField id="fanlass" label="Anlass" value={anlass} onChange={(e) => setAnlass(e.target.value)} pflicht>
            <option value="">— bitte wählen —</option>
            {anlaesse.map((a) => (
              <option key={a.schluessel} value={a.schluessel}>
                {a.name}{a.tage !== null ? ` (${a.tage} ${a.tage === 1 ? 'Arbeitstag' : 'Arbeitstage'})` : ' (die notwendige Zeit)'}
              </option>
            ))}
          </SelectField>
          <InputField
            id="fereignis" label="Tag des Ereignisses" type="date" pflicht required
            value={ereignis} onChange={(e) => setEreignis(e.target.value)}
          />
        </FormGrid>
      )}

      {stundenErlaubt && (
        <CheckboxField
          id="fstunden" label="Nur einige Stunden (an einem Tag)"
          checked={stundenweise} onChange={(e) => setStundenweise(e.target.checked)}
        />
      )}

      <FormGrid>
        <InputField
          id="fvon" label={mitStunden ? 'Tag' : 'Von'} type="date" pflicht required value={von}
          onChange={(e) => {
            setVon(e.target.value);
            if (bis < e.target.value) setBis(e.target.value);
          }}
        />
        {!mitStunden && (
          <InputField
            id="fbis" label="Bis (einschließlich)" type="date" pflicht required min={von}
            value={bis} onChange={(e) => setBis(e.target.value)}
          />
        )}
      </FormGrid>
      {ueberschneidung && (
        <Hinweiszeile stufe="warn">
          <p>{ueberschneidung}</p>
        </Hinweiszeile>
      )}
      {mitStunden && (
        <FormGrid>
          <InputField id="fzvon" label="Frei von" type="time" pflicht required value={zeitVon} onChange={(e) => setZeitVon(e.target.value)} />
          <InputField id="fzbis" label="Frei bis" type="time" pflicht required value={zeitBis} onChange={(e) => setZeitBis(e.target.value)} />
        </FormGrid>
      )}

      {art === 'pflegefreistellung' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <CheckboxField
              id="fkind" label="Für ein erkranktes Kind unter 12 Jahren"
              checked={kind} onChange={(e) => { setKind(e.target.checked); if (!e.target.checked) setZusatz(false); }}
            />
            <InfoHint about="Pflegefreistellung">
              Bis zu einer Arbeitswoche je Arbeitsjahr für die Pflege eines erkrankten nahen Angehörigen im
              gemeinsamen Haushalt, auch für die Betreuung eines Kindes, wenn die betreuende Person ausfällt
              (§ 16 UrlG). Für ein erkranktes Kind unter 12 Jahren, auch Wahl- oder Pflegekind, gibt es eine
              zweite Woche — erst, wenn die erste verbraucht ist.
            </InfoHint>
          </div>
          {kind && pflege?.zusatzwocheMoeglich && (
            <CheckboxField
              id="fzusatz" label="Zweite Woche (die erste ist in diesem Arbeitsjahr verbraucht)"
              checked={zusatz} onChange={(e) => setZusatz(e.target.checked)}
            />
          )}
          {pflege && (
            <p className="text-sm text-ink-muted">
              In diesem Arbeitsjahr noch {fmtDauer(pflege.ersteWocheRestMin)} Pflegefreistellung
              {pflege.zusatzwocheMoeglich ? `, dazu ${fmtDauer(pflege.zusatzwocheRestMin)} der zweiten Woche` : ''}.
            </p>
          )}
        </>
      )}

      {art === 'unbezahlt' && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <span>
            {kalendertage(von, bis)} Kalendertage
            {kalendertage(von, bis) >= (company?.kuerzungAbTagen ?? KUERZUNG_AB_VORGABE)
              ? ' — der Urlaubsanspruch sinkt dadurch aliquot.'
              : '.'}
          </span>
          <InfoHint about="Unbezahlter Urlaub">
            Unbezahlter Urlaub braucht eine Vereinbarung; entscheiden Geschäftsführung oder Administration.
            Im Zeitkonto entsteht kein Minus, die Lohnverrechnung zieht die Tage ab. Ein längerer unbezahlter
            Urlaub verringert den Jahresanspruch aliquot.
            {laengerAlsEinMonat(von, bis)
              ? ' Bei mehr als einem Monat endet die Pflichtversicherung über den Betrieb — die Lohnverrechnung meldet ab, die Versicherung ist selbst zu regeln.'
              : ''}
          </InfoHint>
        </div>
      )}

      {art !== 'unbezahlt' && profil && (
        <p className="text-sm text-ink-muted">
          {arbeitstage} {arbeitstage === 1 ? 'Arbeitstag' : 'Arbeitstage'} in diesem Zeitraum
          {gewaehlt?.tage != null && arbeitstage > gewaehlt.tage ? ` — vorgesehen ${gewaehlt.tage === 1 ? 'ist 1' : `sind ${gewaehlt.tage}`}` : ''}.
        </p>
      )}

      <InputField
        id="fnotiz"
        label={begruendungNoetig ? 'Begründung (zweiter Antrag zum selben Anlass)' : 'Anmerkung (freiwillig)'}
        pflicht={begruendungNoetig}
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
      />

      {art !== 'unbezahlt' && (
        <div className="flex flex-wrap items-center gap-2">
          <NachweisWahl id="fnachweis" onWahl={setDatei} />
          {datei ? (
            <span className="flex flex-wrap items-center gap-2 text-sm text-ink">
              {datei.name}
              <Button variant="ghost" onClick={() => setDatei(null)}>Entfernen</Button>
            </span>
          ) : (
            <span className="text-sm text-ink-muted">freiwillig</span>
          )}
          <InfoHint about="Nachweis">
            Etwa Heiratsurkunde, Parte oder Geburtsurkunde. Wer bestätigt, sieht ihn und hakt „Nachweis geprüft“
            an; danach löscht die App die Datei. Es bleibt nur der Vermerk, wer ihn wann geprüft hat. Ein Nachweis
            auf Papier geht genauso.
          </InfoHint>
        </div>
      )}

      {fehler && <ErrorState message={fehler} />}

      {/* Die Fusszeile der Linie, wie beim Urlaubsantrag daneben. */}
      <div className="fuss-aktionen">
        <Button type="submit" className="w-full sm:w-auto" loading={sendet}>
          Antrag einreichen
        </Button>
      </div>
    </form>
  );
}

/**
 * Die Dateiauswahl für einen Nachweis — ein verstecktes Feld hinter einem
 * Knopf, wie bei den Plänen der Baustelle.
 */
export function NachweisWahl({ id, onWahl, laedt = false }: { id: string; onWahl: (d: File) => void; laedt?: boolean }) {
  const feld = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={feld}
        id={id}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
        className="sr-only"
        aria-label="Nachweis auswählen"
        onChange={(e) => {
          const d = e.target.files?.[0];
          // Zurücksetzen, damit dieselbe Datei ein zweites Mal gewählt werden kann.
          e.target.value = '';
          if (d) onWahl(d);
        }}
      />
      <Button variant="secondary" loading={laedt} onClick={() => feld.current?.click()}>
        Nachweis wählen
      </Button>
    </>
  );
}
