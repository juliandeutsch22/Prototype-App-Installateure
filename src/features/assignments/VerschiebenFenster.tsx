import { useState } from 'react';
import type { AppUser, Assignment } from '@/types';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import { CheckboxField, InputField, SelectField } from '@/components/Field';
import { tagLang } from './wochenTermine';

/**
 * „VERSCHIEBEN“ (E88): derselbe Schritt wie das Ziehen, ohne Ziehen — für
 * Tastatur, Vorlesehilfe, Handy und jeden, der lieber wählt als zieht. Tag
 * und Person stehen auf dem jetzigen Stand; „Kopieren statt verschieben“
 * lässt den Einsatz stehen und legt denselben am Ziel an.
 *
 * Geprüft wird auf dem Server (`einsatz_umplanen`); was nicht geht, steht
 * hier im Fenster, und es bleibt offen.
 */
export default function VerschiebenFenster({
  einsatz,
  titel,
  personen,
  onUmplanen,
  onClose,
}: {
  einsatz: Assignment;
  titel: string;
  /** Wer einplanbar ist. */
  personen: AppUser[];
  onUmplanen: (nachTag: string, nachPerson: string, kopieren: boolean) => Promise<string | null>;
  onClose: () => void;
}) {
  const [tag, setTag] = useState(einsatz.date);
  const [person, setPerson] = useState(einsatz.userId);
  const [kopieren, setKopieren] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const gleich = !kopieren && tag === einsatz.date && person === einsatz.userId;
  const wer = personen.find((u) => u.uid === einsatz.userId)?.name ?? einsatz.userName ?? 'Mitarbeiter';

  async function absenden() {
    if (!tag || gleich) return;
    setLaeuft(true);
    setFehler(null);
    const grund = await onUmplanen(tag, person, kopieren);
    setLaeuft(false);
    if (grund) setFehler(grund);
    else onClose();
  }

  return (
    <BottomSheet open onClose={onClose} label="Einsatz verschieben" titel="Einsatz verschieben" auchBreit>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void absenden(); }}>
        <p className="fenster-ueber">{titel} · {wer} · {tagLang(einsatz.date)}</p>
        <InputField id="verschieben-tag" label="Tag" type="date" required pflicht value={tag} onChange={(e) => setTag(e.target.value)} />
        <SelectField id="verschieben-person" label="Person" value={person} onChange={(e) => setPerson(e.target.value)}>
          {/* Wer nicht mehr einplanbar ist, steht trotzdem da, solange er der Ausgangspunkt ist. */}
          {!personen.some((u) => u.uid === einsatz.userId) && <option value={einsatz.userId}>{wer}</option>}
          {personen.map((u) => (
            <option key={u.uid} value={u.uid}>{u.name}</option>
          ))}
        </SelectField>
        <CheckboxField id="verschieben-kopieren" label="Kopieren statt verschieben" checked={kopieren} onChange={(e) => setKopieren(e.target.checked)} />
        {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}
        <div className="fuss-aktionen">
          <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" loading={laeuft} disabled={!tag || gleich}>{kopieren ? 'Kopieren' : 'Verschieben'}</Button>
        </div>
      </form>
    </BottomSheet>
  );
}
