import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { TERMIN_ARTEN, type AppUser, type Customer, type Termin, type TerminArt } from '@/types';
import { terminAendern, terminAnlegen } from '@/lib/db/termine';
import { listCustomers } from '@/lib/db/customers';
import type { WithId } from '@/lib/db/core';
import BaustellenSelect from '@/components/BaustellenSelect';
import PersonPicker from '@/components/PersonPicker';
import Button from '@/components/Button';
import InfoHint from '@/components/InfoHint';
import Hinweiszeile from '@/components/Hinweiszeile';
import { InputField, SelectField, TextareaField, FormGrid } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { artName } from './terminText';

/**
 * Wo das Formular steht, bestimmt, woran der Termin hängt:
 *
 *  frei       Tagesplanung — Baustelle ODER Kunde (Besichtigung vor der Baustelle)
 *  baustelle  Baustellenakte — die Baustelle steht fest
 *  kunde      Kundenakte — eine seiner Baustellen oder „ohne Baustelle"
 */
export type TerminVorgabe =
  | { bezug: 'frei'; datum: string }
  | { bezug: 'baustelle'; projectNumber: string }
  | { bezug: 'kunde'; customerId: string; baustellen: { projectNumber: string; label: string }[] };

/**
 * EIN TERMIN, DER KEIN EINSATZ IST (Plan 10.4): Art, Tag, Uhrzeit oder
 * Zeitfenster, Baustelle oder Kunde, Teilnehmer, Notiz. Er bucht nichts.
 */
export default function TerminFormular({
  companyId,
  vorgabe,
  termin,
  personen,
  heute,
  onGespeichert,
  onAbbrechen,
}: {
  companyId: string;
  vorgabe: TerminVorgabe;
  /** Zum Ändern; ohne ihn wird angelegt. */
  termin?: Termin;
  personen: AppUser[];
  heute: string;
  onGespeichert: () => void;
  onAbbrechen: () => void;
}) {
  const toast = useToast();
  const [art, setArt] = useState<TerminArt>(termin?.art ?? 'Kundentermin');
  const [datum, setDatum] = useState(termin?.datum ?? (vorgabe.bezug === 'frei' ? vorgabe.datum : heute));
  const [zeitVon, setZeitVon] = useState(termin?.zeitVon ?? '');
  const [zeitBis, setZeitBis] = useState(termin?.zeitBis ?? '');
  const [wo, setWo] = useState<'baustelle' | 'kunde'>(
    termin ? (termin.customerId ? 'kunde' : 'baustelle') : vorgabe.bezug === 'kunde' && vorgabe.baustellen.length === 0 ? 'kunde' : 'baustelle',
  );
  const [projectNumber, setProjectNumber] = useState(
    termin?.projectNumber ?? (vorgabe.bezug === 'baustelle' ? vorgabe.projectNumber : vorgabe.bezug === 'kunde' ? vorgabe.baustellen[0]?.projectNumber ?? '' : ''),
  );
  const [customerId, setCustomerId] = useState(termin?.customerId ?? (vorgabe.bezug === 'kunde' ? vorgabe.customerId : ''));
  const [teilnehmer, setTeilnehmer] = useState<string[]>(termin?.teilnehmer ?? []);
  const [notiz, setNotiz] = useState(termin?.notiz ?? '');
  const [kunden, setKunden] = useState<WithId<Customer>[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  // Die Kundenliste nur, wo sie gebraucht wird: in der Tagesplanung bei „beim Kunden".
  useEffect(() => {
    if (vorgabe.bezug !== 'frei' || wo !== 'kunde' || kunden) return;
    listCustomers(companyId)
      .then((ks) => setKunden(ks.filter((k) => k.active !== false || k.id === customerId).sort((a, b) => a.name.localeCompare(b.name, 'de'))))
      .catch(() => setFehler('Die Kunden konnten nicht geladen werden.'));
  }, [vorgabe.bezug, wo, kunden, companyId, customerId]);

  const leute = useMemo(
    () =>
      personen
        .filter((p) => p.active !== false || teilnehmer.includes(p.uid))
        .map((p) => ({ uid: p.uid, name: p.name, hint: p.role }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [personen, teilnehmer],
  );

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    if (!datum) return setFehler('Bitte einen Tag wählen.');
    if (zeitVon && zeitBis && zeitBis <= zeitVon) return setFehler('„Bis“ muss nach „Von“ liegen.');
    const baustelle = wo === 'baustelle' ? projectNumber.trim() : '';
    const kunde = wo === 'kunde' ? customerId : '';
    if (!baustelle && !kunde) {
      return setFehler(wo === 'baustelle' ? 'Bitte eine Baustelle wählen.' : 'Bitte einen Kunden wählen.');
    }
    setSpeichert(true);
    const eingabe = {
      art,
      datum,
      zeitVon,
      zeitBis,
      projectNumber: baustelle || null,
      customerId: kunde || null,
      teilnehmer,
      notiz,
    };
    try {
      if (termin) await terminAendern(termin.id, eingabe);
      else await terminAnlegen(companyId, eingabe);
      toast.success(termin ? 'Termin geändert' : 'Termin angelegt');
      onGespeichert();
    } catch (err) {
      setFehler(grundAus(err, 'Der Termin konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <form onSubmit={(e) => void speichern(e)} className="flex flex-col gap-4" aria-label={termin ? 'Termin ändern' : 'Termin anlegen'}>
      <FormGrid>
        <SelectField id="termin-art" label="Art" value={art} onChange={(e) => setArt(e.target.value as TerminArt)}>
          {TERMIN_ARTEN.map((a) => (
            <option key={a} value={a}>{artName(a)}</option>
          ))}
        </SelectField>
        <InputField id="termin-datum" label="Tag" type="date" pflicht value={datum} onChange={(e) => setDatum(e.target.value)} />
        <InputField id="termin-von" label={art === 'Lieferung' ? 'Zeitfenster von' : 'Von'} type="time" value={zeitVon} onChange={(e) => setZeitVon(e.target.value)} />
        <InputField id="termin-bis" label={art === 'Lieferung' ? 'Zeitfenster bis' : 'Bis'} type="time" value={zeitBis} onChange={(e) => setZeitBis(e.target.value)} />
      </FormGrid>
      {/*
        DIE UHRZEIT WIEDER WEGNEHMEN, wie beim Einsatz (gemeldet am
        05.10.2026): das Uhrzeitfeld am iPhone hat keinen Knopf zum Leeren.
        Und verdrehte Zeiten gleich sagen, nicht erst beim Speichern.
      */}
      {(zeitVon || zeitBis) && (
        <div className="-mt-2 flex flex-col items-start gap-2">
          <Button type="button" variant="ghost" onClick={() => { setZeitVon(''); setZeitBis(''); }}>
            Uhrzeit entfernen
          </Button>
          {zeitVon && zeitBis && zeitBis <= zeitVon && (
            <Hinweiszeile stufe="warn">
              <p>„{art === 'Lieferung' ? 'Zeitfenster bis' : 'Bis'}“ liegt nicht nach „{art === 'Lieferung' ? 'Zeitfenster von' : 'Von'}“ — so lässt sich der Termin nicht speichern.</p>
            </Hinweiszeile>
          )}
        </div>
      )}

      {vorgabe.bezug === 'baustelle' ? null : (
        <fieldset className="flex flex-col gap-3">
          <legend className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            Wo
            <InfoHint about="Wo">
              Ein Termin hängt an einer Baustelle oder — etwa bei der Besichtigung vor dem Angebot — nur am Kunden.
              Wer an diesem Tag auf der Baustelle eingeteilt ist, sieht ihn in „Mein Einsatzplan“, auch ohne
              Teilnehmer zu sein.
            </InfoHint>
          </legend>
          <div className="flex flex-wrap gap-x-6">
            <label className="flex min-h-touch cursor-pointer items-center gap-2 text-base text-ink">
              <input type="radio" name="termin-wo" className="h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]" checked={wo === 'baustelle'} onChange={() => setWo('baustelle')} />
              Auf einer Baustelle
            </label>
            <label className="flex min-h-touch cursor-pointer items-center gap-2 text-base text-ink">
              <input type="radio" name="termin-wo" className="h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]" checked={wo === 'kunde'} onChange={() => setWo('kunde')} />
              Beim Kunden, ohne Baustelle
            </label>
          </div>
          {wo === 'baustelle' && vorgabe.bezug === 'frei' && (
            <BaustellenSelect id="termin-baustelle" companyId={companyId} value={projectNumber} onChange={(nr) => setProjectNumber(nr)} />
          )}
          {wo === 'baustelle' && vorgabe.bezug === 'kunde' && (
            vorgabe.baustellen.length === 0 ? (
              <p className="text-sm text-ink-muted">Dieser Kunde hat noch keine Baustelle.</p>
            ) : (
              <SelectField id="termin-baustelle" label="Baustelle" value={projectNumber} onChange={(e) => setProjectNumber(e.target.value)}>
                {vorgabe.baustellen.map((b) => (
                  <option key={b.projectNumber} value={b.projectNumber}>{b.label}</option>
                ))}
              </SelectField>
            )
          )}
          {wo === 'kunde' && vorgabe.bezug === 'frei' && (
            <SelectField id="termin-kunde" label="Kunde" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!kunden}>
              <option value="">{kunden ? 'Bitte wählen' : 'Wird geladen …'}</option>
              {(kunden ?? []).map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </SelectField>
          )}
        </fieldset>
      )}

      <PersonPicker
        legend="Teilnehmer"
        idPrefix="termin-teilnehmer"
        people={leute}
        selected={teilnehmer}
        onChange={setTeilnehmer}
        emptyHint="Keine aktiven Konten."
      />

      <TextareaField id="termin-notiz" label="Notiz" value={notiz} onChange={(e) => setNotiz(e.target.value)} />

      {fehler && <ErrorState message={fehler} />}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={speichert}>{termin ? 'Änderung speichern' : 'Termin anlegen'}</Button>
        <Button type="button" variant="ghost" onClick={onAbbrechen} disabled={speichert}>Abbrechen</Button>
      </div>
    </form>
  );
}
