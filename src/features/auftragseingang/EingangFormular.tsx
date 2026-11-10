import { useState, type FormEvent } from 'react';
import { eingangAendern, eingangAnlegen, type EingangEingabe } from '@/lib/db/auftragseingaenge';
import { EINGANG_DRINGLICHKEITEN, EINGANG_QUELLEN, type Auftragseingang, type Customer } from '@/types';
import type { WithId } from '@/lib/db/core';
import KundenAuswahl from '@/components/KundenAuswahl';
import Button from '@/components/Button';
import { InputField, SelectField, TextareaField, FormGrid } from '@/components/Field';
import { Segmente, WeitereAngaben } from '@/components/LotBausteine';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT } from '@/lib/datum';
import LiegenschaftAuswahl from '@/features/liegenschaften/LiegenschaftAuswahl';
import { zuordnungAenderung } from '@/features/liegenschaften/liegenschaftText';
import {
  DRINGLICHKEIT_TEXT,
  QUELLE_TEXT,
  alsFeldzeit,
  ausFeldzeit,
  eingangFehler,
  type EingangFormularStand,
} from './eingangText';

/** Der Wert des Zeitfelds („2026-11-09T22:24“) zum Lesen: „09.11.2026, 22:24“. */
function feldzeitAT(feld: string): string {
  const uhr = feld.slice(11, 16);
  return uhr ? `${datumAT(feld)}, ${uhr}` : datumAT(feld);
}

function anfang(e: Auftragseingang | undefined, jetzt: number): EingangFormularStand {
  return {
    quelle: e?.quelle ?? '',
    auftraggeberNummer: e?.auftraggeberNummer ?? '',
    // Ein Eingang ohne Kunden und ohne neuen Kunden (der Kunde wurde gelöscht) verlangt eine Wahl.
    kundeArt: e && !e.customerId && e.neukundeName ? 'neu' : 'vorhanden',
    customerId: e?.customerId ?? '',
    neukundeName: e?.neukundeName ?? '',
    neukundeStrasse: e?.neukundeStrasse ?? '',
    neukundePlz: e?.neukundePlz ?? '',
    neukundeOrt: e?.neukundeOrt ?? '',
    neukundeTelefon: e?.neukundeTelefon ?? '',
    neukundeEmail: e?.neukundeEmail ?? '',
    ort: e?.ort ?? '',
    ansprechpartnerName: e?.ansprechpartnerName ?? '',
    ansprechpartnerTelefon: e?.ansprechpartnerTelefon ?? '',
    anliegen: e?.anliegen ?? '',
    dringlichkeit: e?.dringlichkeit ?? 'normal',
    wunschtermin: e?.wunschtermin ?? '',
    eingegangenAm: alsFeldzeit(e?.eingegangenAm ?? jetzt),
  };
}

/** Die Anschrift des neuen Kunden als eine Zeile — die Vorgabe für den Ort. */
function neukundeAnschrift(f: EingangFormularStand): string {
  const ortTeil = [f.neukundePlz.trim(), f.neukundeOrt.trim()].filter(Boolean).join(' ');
  return [f.neukundeStrasse.trim(), ortTeil].filter(Boolean).join(', ');
}

/**
 * EINEN EINGANG ERFASSEN ODER ÄNDERN (M02b, A11).
 *
 * Pflicht: woher, für wen (ein vorhandener Kunde oder die Angaben zu einem
 * neuen) und worum es geht. Der Ort ist ohne Angabe die Anschrift des
 * Kunden — wie bei einer Baustelle. Wann er hereinkam, steht auf „jetzt“
 * und lässt sich unter „Weitere Angaben“ nachtragen, wenn der Zettel vom
 * Vormittag erst am Nachmittag erfasst wird.
 *
 * Der neue Kunde wird hier noch NICHT angelegt: aus seinen Angaben wird er
 * beim Umwandeln — oder vorher mit „Kunde anlegen“ —, und nur von jemandem,
 * der Kunden pflegen darf. So kann auch die Verwaltung ohne dieses Recht
 * einen Anruf festhalten.
 */
export default function EingangFormular({
  companyId,
  eingang,
  jetzt = Date.now(),
  mitLiegenschaft = false,
  onGespeichert,
  onAbbrechen,
}: {
  companyId: string;
  /** Zum Ändern; ohne ihn wird erfasst. */
  eingang?: Auftragseingang;
  jetzt?: number;
  /** Liegenschaft und Top anbieten (M02c) — wenn die Unterfähigkeit an ist; das weiß die Seite. */
  mitLiegenschaft?: boolean;
  onGespeichert: (id: string) => void;
  onAbbrechen: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<EingangFormularStand>(() => anfang(eingang, jetzt));
  const [kunde, setKunde] = useState<WithId<Customer> | null>(null);
  const [ortWahl, setOrtWahl] = useState({ liegenschaftId: eingang?.liegenschaftId ?? '', topId: eingang?.topId ?? '' });
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const setze = <K extends keyof EingangFormularStand>(k: K, w: EingangFormularStand[K]) => setF((alt) => ({ ...alt, [k]: w }));

  async function speichern(e: FormEvent) {
    e.preventDefault();
    const falsch = eingangFehler(f);
    setFehler(falsch);
    if (falsch) return;
    const neu = f.kundeArt === 'neu';
    // Ohne Ort gilt die Anschrift des Kunden — wie bei einer Baustelle.
    const ort = f.ort.trim() || (neu ? neukundeAnschrift(f) : kunde?.address ?? '');
    const daten: EingangEingabe = {
      quelle: f.quelle as EingangEingabe['quelle'],
      auftraggeberNummer: f.auftraggeberNummer,
      customerId: neu ? null : f.customerId,
      neukundeName: neu ? f.neukundeName : null,
      neukundeStrasse: neu ? f.neukundeStrasse : null,
      neukundePlz: neu ? f.neukundePlz : null,
      neukundeOrt: neu ? f.neukundeOrt : null,
      neukundeTelefon: neu ? f.neukundeTelefon : null,
      neukundeEmail: neu ? f.neukundeEmail : null,
      ort,
      ansprechpartnerName: f.ansprechpartnerName,
      ansprechpartnerTelefon: f.ansprechpartnerTelefon,
      anliegen: f.anliegen,
      dringlichkeit: f.dringlichkeit,
      wunschtermin: f.wunschtermin || null,
      eingegangenAm: ausFeldzeit(f.eingegangenAm),
      // M02c: nur, was sich an Liegenschaft und Top geändert hat.
      ...(mitLiegenschaft ? zuordnungAenderung(ortWahl, eingang) : {}),
    };
    setSpeichert(true);
    try {
      if (eingang) {
        await eingangAendern(eingang.id, daten);
        toast.success(`Eingang ${eingang.nummer} gespeichert`);
        onGespeichert(eingang.id);
      } else {
        const id = await eingangAnlegen(companyId, daten);
        toast.success('Eingang erfasst');
        onGespeichert(id);
      }
    } catch (err) {
      setFehler(grundAus(err, 'Der Eingang konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <form onSubmit={(e) => void speichern(e)} className="formular flex flex-col gap-4" aria-label={eingang ? 'Eingang ändern' : 'Eingang erfassen'} noValidate>
      <FormGrid>
        <SelectField id="eingang-quelle" label="Quelle" pflicht value={f.quelle} onChange={(e) => setze('quelle', e.target.value as EingangFormularStand['quelle'])}>
          <option value="">Bitte wählen</option>
          {EINGANG_QUELLEN.map((q) => (
            <option key={q} value={q}>{QUELLE_TEXT[q]}</option>
          ))}
        </SelectField>
        <SelectField id="eingang-dringlichkeit" label="Dringlichkeit" value={f.dringlichkeit} onChange={(e) => setze('dringlichkeit', e.target.value as EingangFormularStand['dringlichkeit'])}>
          {EINGANG_DRINGLICHKEITEN.map((d) => (
            <option key={d} value={d}>{DRINGLICHKEIT_TEXT[d]}</option>
          ))}
        </SelectField>
      </FormGrid>
      <InputField
        id="eingang-auftraggeber-nummer"
        label="Auftrags- bzw. Schadensnummer des Auftraggebers"
        value={f.auftraggeberNummer}
        maxLength={80}
        onChange={(e) => setze('auftraggeberNummer', e.target.value)}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm text-ink">Für wen</legend>
        <Segmente
          name="Kunde"
          werte={[{ wert: 'vorhanden', text: 'Vorhandener Kunde' }, { wert: 'neu', text: 'Neuer Kunde' }]}
          wert={f.kundeArt}
          onChange={(w) => setze('kundeArt', w)}
        />
        {f.kundeArt === 'vorhanden' ? (
          <KundenAuswahl
            companyId={companyId}
            id="eingang-kunde"
            label="Kunde"
            pflicht
            value={f.customerId}
            nurAktive
            onChange={(id, k) => {
              setKunde(k);
              setF((alt) => ({ ...alt, customerId: id, ort: alt.ort.trim() ? alt.ort : k?.address ?? '' }));
            }}
          />
        ) : (
          <>
            <InputField id="eingang-neukunde-name" label="Name" pflicht value={f.neukundeName} maxLength={200} onChange={(e) => setze('neukundeName', e.target.value)} />
            <InputField id="eingang-neukunde-strasse" label="Straße" autoComplete="off" value={f.neukundeStrasse} onChange={(e) => setze('neukundeStrasse', e.target.value)} />
            <FormGrid>
              <InputField id="eingang-neukunde-plz" label="PLZ" inputMode="numeric" value={f.neukundePlz} onChange={(e) => setze('neukundePlz', e.target.value)} />
              <InputField id="eingang-neukunde-ort" label="Ort" value={f.neukundeOrt} onChange={(e) => setze('neukundeOrt', e.target.value)} />
              <InputField id="eingang-neukunde-telefon" label="Telefon" type="tel" value={f.neukundeTelefon} onChange={(e) => setze('neukundeTelefon', e.target.value)} />
              <InputField id="eingang-neukunde-email" label="E-Mail" type="email" value={f.neukundeEmail} onChange={(e) => setze('neukundeEmail', e.target.value)} />
            </FormGrid>
          </>
        )}
      </fieldset>

      {mitLiegenschaft && (
        <LiegenschaftAuswahl
          companyId={companyId}
          idPrefix="eingang-liegenschaft"
          liegenschaftId={ortWahl.liegenschaftId}
          topId={ortWahl.topId}
          onChange={(w) => {
            setOrtWahl({ liegenschaftId: w.liegenschaftId, topId: w.topId });
            // Die Anschrift der Liegenschaft als Vorschlag — nur in einen leeren Ort.
            if (w.liegenschaft?.anschrift) setF((alt) => (alt.ort.trim() ? alt : { ...alt, ort: w.liegenschaft?.anschrift ?? '' }));
          }}
        />
      )}
      <InputField
        id="eingang-ort"
        label="Ort des Einsatzes"
        placeholder="leer: die Anschrift des Kunden"
        value={f.ort}
        maxLength={300}
        onChange={(e) => setze('ort', e.target.value)}
      />
      <FormGrid>
        <InputField id="eingang-ap-name" label="Ansprechpartner vor Ort" value={f.ansprechpartnerName} onChange={(e) => setze('ansprechpartnerName', e.target.value)} />
        <InputField id="eingang-ap-telefon" label="Telefon vor Ort" type="tel" value={f.ansprechpartnerTelefon} onChange={(e) => setze('ansprechpartnerTelefon', e.target.value)} />
      </FormGrid>
      <TextareaField
        id="eingang-anliegen"
        label="Anliegen"
        required
        aria-required
        rows={4}
        maxLength={4000}
        value={f.anliegen}
        onChange={(e) => setze('anliegen', e.target.value)}
      />
      <InputField id="eingang-wunschtermin" label="Wunschtermin" type="date" value={f.wunschtermin} onChange={(e) => setze('wunschtermin', e.target.value)} />

      {/* Zugeklappt steht der Zeitpunkt österreichisch da (E72): „09.11.2026, 22:24“, nicht ISO. */}
      <WeitereAngaben titel="Eingegangen am" offen={!!eingang} zusatz={feldzeitAT(f.eingegangenAm)}>
        <InputField
          id="eingang-eingegangen"
          label="Eingegangen am"
          type="datetime-local"
          value={f.eingegangenAm}
          onChange={(e) => setze('eingegangenAm', e.target.value)}
        />
      </WeitereAngaben>

      {fehler && <ErrorState message={fehler} />}

      {/* Der Fensterfuß wie überall (E72, R7): Linie darüber, Abbrechen gerahmt, die Hauptaktion zuletzt. */}
      <div className="planung-fuss mt-0">
        <div className="planung-fuss-knoepfe">
          <Button type="button" variant="secondary" onClick={onAbbrechen} disabled={speichert}>Abbrechen</Button>
          <Button type="submit" loading={speichert}>{eingang ? 'Änderung speichern' : 'Eingang erfassen'}</Button>
        </div>
      </div>
    </form>
  );
}
