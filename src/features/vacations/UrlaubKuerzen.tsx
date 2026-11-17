import { useState } from 'react';
import type { Vacation } from '@/types';
import type { WithId } from '@/lib/db/core';
import ConfirmDialog from '@/components/ConfirmDialog';
import { FormGrid, InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { zeitraumText } from './abwesenheitText';
import { kuerzenAnfang, kuerzenFehler, kuerzenSenden, kuerzenTeile, teileText, type KuerzenStand } from './kuerzenVorschau';

/**
 * Die Felder zum Kürzen (Z1): neuer Beginn, neues Ende, ein Tag zum Streichen
 * — und darunter, was bleibt. Ein Tag mitten im Urlaub teilt den Antrag;
 * die Zeile sagt es vorher.
 */
export function KuerzenFelder({
  antrag,
  stand,
  onChange,
  kennung,
}: {
  antrag: Pick<Vacation, 'von' | 'bis'>;
  stand: KuerzenStand;
  onChange: (s: KuerzenStand) => void;
  kennung: string;
}) {
  const streichen = stand.streichen ? [stand.streichen] : [];
  const fehler = kuerzenFehler(antrag, stand.von, stand.bis, streichen);
  const teile = fehler ? [] : kuerzenTeile(stand.von, stand.bis, streichen);
  return (
    <div className="space-y-3">
      <FormGrid>
        <InputField id={`${kennung}-von`} label="Beginn" type="date" min={antrag.von} max={antrag.bis}
          value={stand.von} onChange={(e) => onChange({ ...stand, von: e.target.value })} />
        <InputField id={`${kennung}-bis`} label="Ende (einschließlich)" type="date" min={antrag.von} max={antrag.bis}
          value={stand.bis} onChange={(e) => onChange({ ...stand, bis: e.target.value })} />
      </FormGrid>
      <InputField id={`${kennung}-streichen`} label="Einen Tag streichen (freiwillig)" type="date"
        min={stand.von} max={stand.bis} value={stand.streichen}
        onChange={(e) => onChange({ ...stand, streichen: e.target.value })} />
      <p className="text-fliess text-ink" role={fehler ? 'alert' : undefined}>
        {fehler ?? `Bleibt: ${teileText(teile)}${teile.length > 1 ? ' — der Antrag wird in zwei Teile geteilt.' : '.'}`}
      </p>
    </div>
  );
}

/** Der Dialog „Urlaub kürzen“ — aus der Liste „Genehmigt, noch nicht vorbei“ und dem Antrag. */
export default function KuerzenDialog({
  antrag,
  tag,
  entscheiderName,
  onFertig,
  onCancel,
}: {
  antrag: WithId<Vacation>;
  /** Vom Tag aus geöffnet: dieser Tag ist zum Streichen vorbelegt. */
  tag?: string;
  entscheiderName: string;
  onFertig: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [stand, setStand] = useState<KuerzenStand>(() => kuerzenAnfang(antrag, tag));
  const [grund, setGrund] = useState('');
  const za = antrag.art === 'Zeitausgleich';
  return (
    <ConfirmDialog
      open
      title={`${za ? 'Zeitausgleich' : 'Urlaub'} von ${antrag.userName} kürzen?`}
      message={`Genehmigt: ${zeitraumText(antrag.von, antrag.bis)}. Die weggefallenen Tage verschwinden aus dem Zeitkonto; der Grund geht an ${antrag.userName}.`}
      confirmLabel="Kürzen"
      confirmTone="primary"
      onConfirm={async () => {
        toast.success(await kuerzenSenden(antrag, stand, grund, entscheiderName));
        onFertig();
      }}
      onCancel={onCancel}
    >
      <KuerzenFelder antrag={antrag} stand={stand} onChange={setStand} kennung={`kuerzen-${antrag.id}`} />
      <div className="mt-3">
        <InputField id={`kuerzen-grund-${antrag.id}`} label="Grund" pflicht value={grund} onChange={(e) => setGrund(e.target.value)} />
      </div>
    </ConfirmDialog>
  );
}
