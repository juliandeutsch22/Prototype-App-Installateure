import { AbschnittBlock } from './Handlungsbedarf';
import StartKarte from './StartKarte';
import { abschnitt, type Zeile } from './abschnitte';
import { datumAT } from '@/lib/datum';
import { fehlenText } from '@/features/assignments/besetzung';
import { ZIEL } from './ziele';
import type { Abwesend } from './laden';
import type { TagesBaustelle } from './regeln';

/**
 * HEUTE, AUS SICHT DER LEITUNG (Skizzen 04, 05): wer fehlt und wer wo ist,
 * je höchstens drei. Alles Weitere steht in der Einsatzplanung, Tag heute.
 */
export default function HeuteLeitung({
  heute,
  abwesend,
  tag,
}: {
  heute: string;
  abwesend: Abwesend[];
  tag: TagesBaustelle[];
}) {
  const imEinsatz = tag.filter((b) => !b.unbesetzt);
  const personen = new Set(imEinsatz.flatMap((b) => b.namen)).size;
  if (abwesend.length === 0 && imEinsatz.length === 0) return null;
  const ziel = ZIEL.tag(heute);
  const unbesetztBei = new Map<string, string>();
  for (const b of tag) {
    if (!b.unbesetzt) continue;
    for (const f of b.fehlen) unbesetztBei.set(f.name, b.projectNumber);
  }

  const weg = abschnitt(
    'abwesend',
    'Abwesend',
    abwesend.map<Zeile>((a) => ({
      key: `weg-${a.uid}`,
      titel: a.name,
      detail: unbesetztBei.has(a.name)
        ? `${unbesetztBei.get(a.name)} unbesetzt`
        : a.zeiten
          ? a.zeiten
          : a.bis > heute
            ? `bis ${datumAT(a.bis)}`
            : 'heute',
      status: { text: a.grund ?? 'abwesend', ton: a.grund === 'Krank' ? 'warn' : 'leise' },
      to: ziel,
    })),
    ziel,
  );
  const da = abschnitt(
    'im-einsatz',
    'Im Einsatz',
    imEinsatz.map<Zeile>((b) => ({
      key: `da-${b.projectNumber}`,
      titel: b.customerName,
      detail: [b.namen.join(', '), b.fehlen.length ? `fehlt: ${fehlenText(b.fehlen)}` : ''].filter(Boolean).join(' · '),
      status: { text: b.namen.length === 1 ? '1 Person' : `${b.namen.length} Personen`, ton: 'leise' },
      to: ziel,
    })),
    ziel,
  );

  return (
    <StartKarte titel="Heute" zusatz={`${personen} im Einsatz`} verweis={{ to: ziel, text: 'Einsatzplanung' }}>
      {weg && <AbschnittBlock a={weg} />}
      {da && <AbschnittBlock a={da} />}
    </StartKarte>
  );
}
