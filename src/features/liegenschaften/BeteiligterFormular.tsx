import { useState, type FormEvent, type ReactNode } from 'react';
import { beteiligterAendern, beteiligterAnlegen, type BeteiligterEingabe } from '@/lib/db/liegenschaften';
import { BETEILIGTEN_ROLLEN, type BeteiligtenRolle, type LiegenschaftBeteiligter, type LiegenschaftTop } from '@/types';
import KundenAuswahl from '@/components/KundenAuswahl';
import Button from '@/components/Button';
import { FormGrid, InputField, SelectField, TextareaField } from '@/components/Field';
import { Segmente } from '@/components/LotBausteine';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { ROLLE_TEXT, beteiligterFehler, topText } from './liegenschaftText';

type Art = 'kunde' | 'frei';

/**
 * EINEN BETEILIGTEN EINTRAGEN ODER ÄNDERN (M02c).
 *
 * Rolle (Pflicht), an der ganzen Liegenschaft oder an einem Top, ein Kunde
 * ODER freie Angaben (Name, Telefon, E-Mail), Hinweis und Zeitraum. Freie
 * Angaben sind für Beteiligte, die kein Kunde sind — den Mieter, den
 * Eigentümer als Privatperson; sie sind Personendaten und gehen mit
 * „Entfernen“ samt ihren Werten im Journal. Der Zeitraum ist für den
 * Mieterwechsel: ein ausgezogener Mieter steht unter „Früher“, bis ihn
 * jemand entfernt — gelöscht wird nichts von selbst.
 */
export default function BeteiligterFormular({
  companyId,
  liegenschaftId,
  tops,
  beteiligter,
  vorgabeTopId,
  onGespeichert,
  onAbbrechen,
  zusatz,
}: {
  companyId: string;
  liegenschaftId: string;
  tops: LiegenschaftTop[];
  beteiligter?: LiegenschaftBeteiligter;
  vorgabeTopId?: string;
  onGespeichert: () => void;
  onAbbrechen: () => void;
  /**
   * Weitere Handlungen am Beteiligten („Zum Kunden machen“, „Entfernen“) —
   * ÜBER dem Fensterfuß, im Formular (E72): danach stünden sie unter einer
   * klebenden Fußleiste, die bis an die Kante reicht. Knöpfe darin brauchen
   * `type="button"`.
   */
  zusatz?: ReactNode;
}) {
  const toast = useToast();
  const [f, setF] = useState({
    rolle: (beteiligter?.rolle ?? '') as BeteiligtenRolle | '',
    topId: beteiligter?.topId ?? vorgabeTopId ?? '',
    art: (beteiligter && !beteiligter.customerId ? 'frei' : 'kunde') as Art,
    customerId: beteiligter?.customerId ?? '',
    name: beteiligter?.name ?? '',
    telefon: beteiligter?.telefon ?? '',
    email: beteiligter?.email ?? '',
    hinweis: beteiligter?.hinweis ?? '',
    gueltigAb: beteiligter?.gueltigAb ?? '',
    gueltigBis: beteiligter?.gueltigBis ?? '',
  });
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const setze = <K extends keyof typeof f>(k: K, w: (typeof f)[K]) => setF((alt) => ({ ...alt, [k]: w }));

  async function speichern(e: FormEvent) {
    e.preventDefault();
    const falsch = beteiligterFehler(f);
    setFehler(falsch);
    if (falsch) return;
    const kunde = f.art === 'kunde';
    // Kunde ODER freie Angaben — das jeweils andere ausdrücklich leer (so verlangt es die Datenbank).
    const daten: BeteiligterEingabe = {
      rolle: f.rolle as BeteiligtenRolle,
      topId: f.topId || null,
      customerId: kunde ? f.customerId : null,
      name: kunde ? null : f.name,
      telefon: kunde ? null : f.telefon,
      email: kunde ? null : f.email,
      hinweis: f.hinweis,
      gueltigAb: f.gueltigAb || null,
      gueltigBis: f.gueltigBis || null,
    };
    setSpeichert(true);
    try {
      if (beteiligter) {
        await beteiligterAendern(beteiligter.id, daten);
        toast.success('Beteiligter gespeichert');
      } else {
        await beteiligterAnlegen(companyId, liegenschaftId, daten);
        toast.success('Beteiligter eingetragen');
      }
      onGespeichert();
    } catch (err) {
      setFehler(grundAus(err, 'Der Beteiligte konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  // Inaktive Tops nur, wenn er schon an einem steht.
  const angeboten = tops.filter((t) => t.aktiv !== false || t.id === f.topId);

  return (
    <form onSubmit={(e) => void speichern(e)} className="formular flex flex-col gap-4"
      aria-label={beteiligter ? 'Beteiligten ändern' : 'Beteiligten eintragen'} noValidate>
      <FormGrid>
        <SelectField id="beteiligter-rolle" label="Rolle" pflicht value={f.rolle}
          onChange={(e) => setze('rolle', e.target.value as BeteiligtenRolle | '')}>
          <option value="">Bitte wählen</option>
          {BETEILIGTEN_ROLLEN.map((r) => <option key={r} value={r}>{ROLLE_TEXT[r]}</option>)}
        </SelectField>
        <SelectField id="beteiligter-top" label="An" value={f.topId} onChange={(e) => setze('topId', e.target.value)}>
          <option value="">Ganze Liegenschaft</option>
          {angeboten.map((t) => <option key={t.id} value={t.id}>{topText(t)}</option>)}
        </SelectField>
      </FormGrid>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm text-ink">Wer</legend>
        <Segmente
          name="Beteiligter"
          werte={[{ wert: 'kunde', text: 'Kunde' }, { wert: 'frei', text: 'Freie Angaben' }]}
          wert={f.art}
          onChange={(w) => setze('art', w)}
        />
        {f.art === 'kunde' ? (
          <KundenAuswahl companyId={companyId} id="beteiligter-kunde" label="Kunde" pflicht value={f.customerId}
            onChange={(id) => setze('customerId', id)} />
        ) : (
          <>
            <InputField id="beteiligter-name" label="Name" pflicht maxLength={200}
              value={f.name} onChange={(e) => setze('name', e.target.value)} />
            <FormGrid>
              <InputField id="beteiligter-telefon" label="Telefon" type="tel" maxLength={60}
                value={f.telefon} onChange={(e) => setze('telefon', e.target.value)} />
              <InputField id="beteiligter-email" label="E-Mail" type="email" maxLength={200}
                value={f.email} onChange={(e) => setze('email', e.target.value)} />
            </FormGrid>
          </>
        )}
      </fieldset>

      <TextareaField id="beteiligter-hinweis" label="Hinweis" rows={2} maxLength={1000}
        placeholder="z. B. nur vormittags erreichbar"
        value={f.hinweis} onChange={(e) => setze('hinweis', e.target.value)} />
      <FormGrid>
        <InputField id="beteiligter-ab" label="Gültig ab" type="date" value={f.gueltigAb}
          onChange={(e) => setze('gueltigAb', e.target.value)} />
        <InputField id="beteiligter-bis" label="Gültig bis" type="date" value={f.gueltigBis}
          onChange={(e) => setze('gueltigBis', e.target.value)} />
      </FormGrid>

      {fehler && <ErrorState message={fehler} />}
      {zusatz}
      {/* Der Fensterfuß wie überall (E72, R7): Linie darüber, Abbrechen gerahmt, die Hauptaktion zuletzt. */}
      <div className="planung-fuss mt-0">
        <div className="planung-fuss-knoepfe">
          <Button type="button" variant="secondary" onClick={onAbbrechen} disabled={speichert}>Abbrechen</Button>
          <Button type="submit" loading={speichert}>{beteiligter ? 'Änderung speichern' : 'Beteiligten eintragen'}</Button>
        </div>
      </div>
    </form>
  );
}
