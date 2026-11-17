import { InputField } from '@/components/Field';
import { FOLGETAGE_HOECHSTENS, tagDanach, type FolgetageStand } from './folgetage';
import Schalter from '@/components/Schalter';

/**
 * „AUCH AN DEN FOLGENDEN TAGEN“ BEIM ENTFERNEN (Durchsicht 15.11.2026, V13):
 * eine Woche Bad abzusagen war fünfmal dieselbe Arbeit. Mit dem Haken nimmt
 * das Entfernen dieselbe Person (oder den Einsatz) auch an den Tagen bis
 * einschließlich dem gewählten heraus — höchstens 62 Tage, wie beim Anlegen.
 */

export default function FolgetageWahl({
  id,
  tag,
  stand,
  onStand,
}: {
  id: string;
  /** Der Tag des Einsatzes; die Folgetage beginnen am Tag danach. */
  tag: string;
  stand: FolgetageStand;
  onStand: (s: FolgetageStand) => void;
}) {
  return (
    <div className="space-y-2">
      <Schalter
        id={`${id}-an`}
        label="Auch an den folgenden Tagen entfernen"
        an={stand.an}
        onChange={(wert) => onStand({ an: wert, bis: stand.bis || tagDanach(tag, 4) })}
      />
      {stand.an && (
        <InputField
          id={`${id}-bis`}
          label="bis einschließlich"
          type="date"
          value={stand.bis}
          min={tagDanach(tag)}
          max={tagDanach(tag, FOLGETAGE_HOECHSTENS - 1)}
          onChange={(e) => onStand({ ...stand, bis: e.target.value })}
        />
      )}
    </div>
  );
}
