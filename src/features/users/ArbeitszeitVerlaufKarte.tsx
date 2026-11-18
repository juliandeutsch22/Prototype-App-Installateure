import { useState } from 'react';
import type { AppUser } from '@/types';
import {
  arbeitszeitAendern, arbeitszeitAenderungEntfernen, urlaubsanspruchAendern, urlaubsanspruchAenderungEntfernen,
} from '@/lib/db/zeitkonto';
import { arbeitszeitAm, localDateStr, todayStr, wochenstundenVon, urlaubsanspruchIm, urlaubsJahrVon, type Arbeitszeit } from '@/lib/time';
import Card from '@/components/Card';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField, FormGrid, CheckboxField, SelectField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { ErrorState } from '@/components/States';
import ZahlFeld from '@/components/ZahlFeld';
import { useToast } from '@/components/Toast';
import { LoeschenKnopf } from '@/components/Symbolknoepfe';
import { datumAT } from '@/lib/datum';
import { grundAus } from '@/lib/fehlerGrund';
import { leseZahl } from '@/lib/zahl';
import TagessollFelder from './TagessollFelder';
import {
  alsEntwurf, alsProfil, jugendschutzHinweise, tagessollAusEntwurf, tagessollNachTagen, WEEKDAYS, type BenutzerEntwurf,
} from './benutzerEntwurf';

/** Eine Zeile Arbeitszeit, wie man sie liest: „30 Std · Mo, Di, Mi, Do · Fr 4,5 Std“. */
function arbeitszeitText(az: Arbeitszeit): string {
  const tage = az.workDays && az.workDays.length ? az.workDays : [1, 2, 3, 4, 5];
  const teile = [
    `${String(wochenstundenVon(az.weeklyTargetHours)).replace('.', ',')} Std`,
    WEEKDAYS.filter((d) => tage.includes(d.value)).map((d) => d.label).join(', '),
  ];
  if (az.tagessoll && Object.keys(az.tagessoll).length > 0) {
    teile.push(WEEKDAYS.filter((d) => az.tagessoll?.[String(d.value)] != null)
      .map((d) => `${d.label} ${String(az.tagessoll![String(d.value)]).replace('.', ',')}`).join(' · '));
  }
  return teile.join(' · ');
}

/**
 * ARBEITSZEIT UND URLAUBSANSPRUCH MIT „GÜLTIG AB“ (Durchsicht 15.11.2026,
 * Z3 + F2) in der Benutzerakte.
 *
 * Bis hierher standen Wochenstunden, Arbeitstage, Tagessoll und Urlaubstage
 * in den Stammdaten ohne Datum; jede Änderung rechnete rückwirkend ab dem
 * Saldo-Start (40 → 30 Std ab 1.12.: im Beispiel +936 Std). Jetzt gilt jede
 * Änderung ab einem Tag (Arbeitszeit) bzw. ab einem Urlaubsjahr (Anspruch);
 * was davor lag, bleibt, wie es war. Ein Tag vor dem Saldo-Start berichtigt
 * den Anfang. Schreiben dürfen Geschäftsführung und Administration — die
 * Datenbank prüft es noch einmal.
 */
export default function ArbeitszeitVerlaufKarte({
  person,
  jahresbeginn,
  darfAendern,
  onGeaendert,
  geburtsdatum = null,
}: {
  person: AppUser;
  /** 'MM-DD' — wann das Urlaubsjahr des Betriebs beginnt. */
  jahresbeginn: string;
  darfAendern: boolean;
  /** Nach dem Speichern: die Akte lädt die Person neu. */
  onGeaendert: () => void;
  /** Für die Rückfrage zum Jugendschutz (Runde 3, M2) — wie beim Speichern der Akte. */
  geburtsdatum?: string | null;
}) {
  const toast = useToast();
  const heute = todayStr();
  const verlauf = person.arbeitszeitVerlauf ?? [];
  const anspruchVerlauf = person.urlaubsanspruchVerlauf ?? [];
  const laufendesJahr = urlaubsJahrVon(heute, jahresbeginn);
  const startJahr = person.appStartDate ? urlaubsJahrVon(person.appStartDate, jahresbeginn) : laufendesJahr;

  const [arbeitOffen, setArbeitOffen] = useState(false);
  const [ab, setAb] = useState(heute);
  const [entwurf, setEntwurf] = useState<BenutzerEntwurf>(() => alsEntwurf(person));
  const [urlaubOffen, setUrlaubOffen] = useState(false);
  const [jahr, setJahr] = useState(String(laufendesJahr + 1));
  const [tage, setTage] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [jugendschutz, setJugendschutz] = useState<string[] | null>(null);
  const [entfernen, setEntfernen] = useState<{ art: 'arbeitszeit'; ab: string } | { art: 'urlaub'; jahr: number } | null>(null);

  /** Die Felder mit der Arbeitszeit vorbelegen, die am gewählten Tag gilt. */
  function vorbelegen(tag: string) {
    const az = arbeitszeitAm(person, tag);
    const basis = alsEntwurf({ ...person, ...az });
    setEntwurf(basis);
  }

  function arbeitOeffnen() {
    setAb(heute);
    vorbelegen(heute);
    setFehler(null);
    setArbeitOffen(true);
  }

  /** `bestaetigt`: die Rückfrage zum Jugendschutz ist beantwortet. */
  async function arbeitSpeichern(bestaetigt = false) {
    if (!ab) {
      setFehler('Bitte angeben, ab wann die Arbeitszeit gilt.');
      return;
    }
    const tagessollAn = Object.keys(entwurf.tagessoll).length > 0;
    if (tagessollAn && !tagessollAusEntwurf(entwurf)) {
      setFehler('Bitte für jeden Arbeitstag ein Tagessoll zwischen 0 und 24 Stunden angeben.');
      return;
    }
    const stunden = leseZahl(entwurf.weeklyTargetHours, { negativ: false });
    if (!tagessollAn && (stunden.fehler || stunden.wert === null)) {
      setFehler(`Wochenstunden: ${stunden.fehler ?? 'bitte angeben'}`);
      return;
    }
    const profil = alsProfil(entwurf);
    /*
      DIE RÜCKFRAGE ZUM JUGENDSCHUTZ wandert mit den Feldern hierher: das
      Wochen- und Tagessoll ändert sich nur noch in dieser Karte.
    */
    const hinweise = bestaetigt ? [] : jugendschutzHinweise(entwurf, geburtsdatum, heute);
    if (hinweise.length > 0) {
      setJugendschutz(hinweise);
      return;
    }
    setSpeichert(true);
    setFehler(null);
    try {
      await arbeitszeitAendern({
        userId: person.uid,
        ab,
        wochenstunden: profil.weeklyTargetHours ?? 40,
        arbeitstage: profil.workDays ?? [1, 2, 3, 4, 5],
        tagessoll: profil.tagessoll ?? null,
      });
      toast.success(`Arbeitszeit ab ${datumAT(ab)} gespeichert`);
      setArbeitOffen(false);
      onGeaendert();
    } catch (e) {
      setFehler(grundAus(e, 'Die Arbeitszeit konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  function urlaubOeffnen() {
    const j = laufendesJahr + 1;
    setJahr(String(j));
    setTage(String(urlaubsanspruchIm(person, j)));
    setFehler(null);
    setUrlaubOffen(true);
  }

  async function urlaubSpeichern() {
    const j = Number(jahr);
    const gelesen = leseZahl(tage, { negativ: false });
    if (gelesen.fehler || gelesen.wert === null || !Number.isInteger(gelesen.wert)) {
      setFehler('Bitte die Urlaubstage pro Jahr als ganze Zahl angeben.');
      return;
    }
    setSpeichert(true);
    setFehler(null);
    try {
      await urlaubsanspruchAendern(person.uid, j, gelesen.wert);
      toast.success(`Urlaubsanspruch ab dem Urlaubsjahr ${j} gespeichert`);
      setUrlaubOffen(false);
      onGeaendert();
    } catch (e) {
      setFehler(grundAus(e, 'Der Urlaubsanspruch konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  async function entfernenBestaetigt() {
    if (!entfernen) return;
    /*
      RÜCKGÄNGIG (F15, Nacharbeit): dieselbe Änderung wieder anlegen, über
      denselben Weg wie „Speichern“ — mit den Werten, die eben galten. Leere
      Wochenstunden tragen wie beim Speichern die Vorgabe 40 (Z11).
    */
    let zurueck: (() => Promise<void>) | null = null;
    let wieder = '';
    if (entfernen.art === 'arbeitszeit') {
      const alt = verlauf.find((x) => x.ab === entfernen.ab);
      await arbeitszeitAenderungEntfernen(person.uid, entfernen.ab);
      if (alt) {
        wieder = `Arbeitszeit ab ${datumAT(alt.ab)} wieder eingetragen`;
        zurueck = () => arbeitszeitAendern({
          userId: person.uid, ab: alt.ab, wochenstunden: alt.wochenstunden ?? 40, arbeitstage: alt.arbeitstage, tagessoll: alt.tagessoll,
        });
      }
    } else {
      const alt = anspruchVerlauf.find((x) => x.jahr === entfernen.jahr);
      await urlaubsanspruchAenderungEntfernen(person.uid, entfernen.jahr);
      if (alt) {
        wieder = `Urlaubsanspruch ab dem Urlaubsjahr ${alt.jahr} wieder eingetragen`;
        zurueck = () => urlaubsanspruchAendern(person.uid, alt.jahr, alt.tage);
      }
    }
    setEntfernen(null);
    const nochmal = zurueck;
    toast.success('Änderung zurückgenommen', nochmal ? {
      label: 'Rückgängig',
      onClick: () => void nochmal().then(() => { toast.success(wieder); onGeaendert(); }, (e) => toast.error(grundAus(e, 'Rückgängig ging nicht.'))),
    } : undefined);
    onGeaendert();
  }

  const rueckwirkend = ab && ab < heute;
  const vonAnfang = ab && (verlauf.length > 0 ? ab <= verlauf[0].ab : !person.appStartDate || ab <= person.appStartDate);
  const jahre = Array.from({ length: Math.max(1, laufendesJahr + 3 - startJahr) }, (_, i) => startJahr + i);

  return (
    <Card
      title="Arbeitszeit und Anspruch ab einem Tag"
      id="akte-verlauf"
      hint="Eine Änderung gilt ab ihrem Tag; Soll und Saldo davor bleiben, wie sie waren. Der Urlaubsanspruch gilt für ganze Urlaubsjahre — für einen Teil des Jahres (etwa Teilzeit ab Juli) eine Anpassung des Anspruchs eintragen. Ein Tag vor dem Saldo-Start berichtigt den Anfang."
    >
      <h3 className="text-meta font-normal text-ink-muted">Arbeitszeit</h3>
      <List>
        {verlauf.length === 0 ? (
          <ListRow title={arbeitszeitText(person)} subtitle="seit dem Saldo-Start" />
        ) : verlauf.map((e, i) => (
          <ListRow
            key={e.ab}
            title={arbeitszeitText(arbeitszeitAm(person, e.ab))}
            subtitle={`${i === 0 ? 'von Anfang an' : `ab ${datumAT(e.ab)}`}${e.ab > heute ? ' · kommt noch' : ''}${verlauf[i + 1] ? ` · bis ${datumAT(vortag(verlauf[i + 1].ab))}` : ''}`}
          >
            {darfAendern && i > 0 && (
              <LoeschenKnopf label={`Arbeitszeit ab ${datumAT(e.ab)} zurücknehmen`} onClick={() => setEntfernen({ art: 'arbeitszeit', ab: e.ab })} />
            )}
          </ListRow>
        ))}
      </List>

      <h3 className="mt-4 text-meta font-normal text-ink-muted">Urlaubstage pro Jahr</h3>
      <List>
        {anspruchVerlauf.length === 0 ? (
          <ListRow title={`${urlaubsanspruchIm(person, laufendesJahr)} Tage`} subtitle="für jedes Urlaubsjahr" />
        ) : anspruchVerlauf.map((e, i) => (
          <ListRow
            key={e.jahr}
            title={`${e.tage} Tage`}
            subtitle={i === 0 ? 'von Anfang an' : `ab dem Urlaubsjahr ${e.jahr}`}
          >
            {darfAendern && i > 0 && (
              <LoeschenKnopf label={`Anspruch ab ${e.jahr} zurücknehmen`} onClick={() => setEntfernen({ art: 'urlaub', jahr: e.jahr })} />
            )}
          </ListRow>
        ))}
      </List>

      {arbeitOffen && (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <FormGrid>
            <InputField
              id="az-ab" label="Gilt ab" type="date" pflicht value={ab}
              onChange={(e) => { setAb(e.target.value); if (e.target.value) vorbelegen(e.target.value); }}
            />
            <ZahlFeld
              id="az-stunden" label="Wochenstunden" value={entwurf.weeklyTargetHours}
              disabled={Object.keys(entwurf.tagessoll).length > 0}
              onChange={(t) => setEntwurf({ ...entwurf, weeklyTargetHours: t })}
            />
          </FormGrid>
          <fieldset>
            <legend className="mb-1 text-meta font-normal text-ink">Arbeitstage</legend>
            <div className="flex flex-wrap gap-x-4">
              {WEEKDAYS.map((d) => (
                <CheckboxField
                  key={d.value} id={`az-tag-${d.value}`} label={d.label}
                  checked={entwurf.workDays.includes(d.value)}
                  onChange={() => setEntwurf({
                    ...entwurf,
                    workDays: entwurf.workDays.includes(d.value)
                      ? entwurf.workDays.filter((x) => x !== d.value)
                      : [...entwurf.workDays, d.value].sort(),
                    tagessoll: tagessollNachTagen(entwurf, d.value),
                  })}
                />
              ))}
            </div>
            <TagessollFelder form={entwurf} setForm={setEntwurf} />
          </fieldset>
          <p className="text-meta text-ink-muted" aria-live="polite">
            {vonAnfang
              ? 'Berichtigt den Anfang: gilt für alles bis zur nächsten Änderung, auch für Monate, die schon gerechnet sind.'
              : rueckwirkend
                ? `Rückwirkend: Soll und Saldo ab dem ${datumAT(ab)} rechnen mit der neuen Arbeitszeit.`
                : `Bis zum ${datumAT(vortag(ab))} bleibt es bei ${arbeitszeitText(arbeitszeitAm(person, vortag(ab)))}.`}
          </p>
          {fehler && <ErrorState message={fehler} />}
          <div className="flex flex-wrap gap-3">
            <Button loading={speichert} onClick={() => void arbeitSpeichern()}>Arbeitszeit speichern</Button>
            <Button variant="ghost" onClick={() => { setArbeitOffen(false); setFehler(null); }}>Abbrechen</Button>
          </div>
        </div>
      )}

      {urlaubOffen && (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <FormGrid>
            <SelectField id="ua-jahr" label="Ab dem Urlaubsjahr" value={jahr} onChange={(e) => {
              setJahr(e.target.value);
              setTage(String(urlaubsanspruchIm(person, Number(e.target.value))));
            }}>
              {jahre.map((j) => <option key={j} value={String(j)}>{j}</option>)}
            </SelectField>
            <InputField
              id="ua-tage" label="Urlaubstage pro Jahr" inputMode="numeric" pflicht
              value={tage} onChange={(e) => setTage(e.target.value)}
            />
          </FormGrid>
          <p className="text-meta text-ink-muted">
            {Number(jahr) <= laufendesJahr
              ? `Gilt auch für das laufende oder ein vergangenes Urlaubsjahr — Resturlaub und Übertrag ab ${jahr} rechnen neu.`
              : `Bis einschließlich ${Number(jahr) - 1} bleibt es bei ${urlaubsanspruchIm(person, Number(jahr) - 1)} Tagen.`}
          </p>
          {fehler && <ErrorState message={fehler} />}
          <div className="flex flex-wrap gap-3">
            <Button loading={speichert} onClick={() => void urlaubSpeichern()}>Anspruch speichern</Button>
            <Button variant="ghost" onClick={() => { setUrlaubOffen(false); setFehler(null); }}>Abbrechen</Button>
          </div>
        </div>
      )}

      {darfAendern && !arbeitOffen && !urlaubOffen && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={arbeitOeffnen}>Arbeitszeit ändern</Button>
          <Button variant="secondary" onClick={urlaubOeffnen}>Urlaubsanspruch ändern</Button>
        </div>
      )}

      <ConfirmDialog
        open={!!jugendschutz}
        title={`${person.name} ist unter 18`}
        confirmLabel="Trotzdem speichern"
        confirmTone="primary"
        message="Für Jugendliche gelten engere Grenzen der Arbeitszeit (KJBG). Gespeichert wird trotzdem; Buchungen über der Grenze zeigt die Mitarbeiterübersicht als Verstoß."
        onCancel={() => setJugendschutz(null)}
        onConfirm={async () => {
          setJugendschutz(null);
          await arbeitSpeichern(true);
        }}
      >
        <ul className="space-y-1 text-fliess text-ink">
          {(jugendschutz ?? []).map((h) => <li key={h}>{h}</li>)}
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!entfernen}
        title="Änderung zurücknehmen?"
        message={entfernen?.art === 'arbeitszeit'
          ? `Ab dem ${datumAT(entfernen.ab)} gilt dann wieder die Arbeitszeit davor.`
          : entfernen ? `Ab dem Urlaubsjahr ${entfernen.jahr} gilt dann wieder der Anspruch davor.` : undefined}
        confirmLabel="Zurücknehmen"
        onConfirm={entfernenBestaetigt}
        onCancel={() => setEntfernen(null)}
      />
    </Card>
  );
}

function vortag(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}
