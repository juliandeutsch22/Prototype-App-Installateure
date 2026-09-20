import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  freigabeGeben,
  freigabeWiderrufen,
  freigaben,
  istOffen,
  zugriffe,
  type SupportFreigabe,
  type SupportZugriff,
} from '@/lib/db/support';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { InputField, SelectField } from '@/components/Field';
import { Marke, Warnung } from '@/components/Badge';
import { useToast } from '@/components/Toast';
import { ErrorState, SkeletonList } from '@/components/States';

/**
 * Einblick gewähren — und wieder beenden.
 *
 * WARUM ES DIESE SEITE GIBT. Ruft der Betrieb an, weil eine Rechnung nicht
 * stimmt, muss jemand nachsehen können. Der einzige Weg dafür war bisher der
 * Dienstschlüssel: er umgeht jeden Zeilenschutz, erreicht jeden Mandanten und
 * hinterlässt keine Spur. Was hier entsteht, ist das Gegenteil davon —
 * befristet, begründet, widerrufbar, nur lesend und protokolliert.
 *
 * DIE SEITE IST BEWUSST NÜCHTERN. Sie ist keine Einladung: wer sie öffnet,
 * hat einen konkreten Anlass. Deshalb steht oben, was gerade gilt, und nicht
 * ein Formular, das zum Ausfüllen einlädt.
 */

/** Wie lange — in Stunden. Mehr als sieben Tage weist die Datenbank ab. */
const DAUERN: Array<[number, string]> = [
  [4, '4 Stunden'],
  [24, '1 Tag'],
  [72, '3 Tage'],
  [168, '7 Tage'],
];

const zeit = (ms: number) =>
  new Date(ms).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

export default function SupportzugangView() {
  const { user } = useAuth();
  const toast = useToast();
  const betrieb = user?.companyId ?? '';

  const [liste, setListe] = useState<WithId<SupportFreigabe>[] | null>(null);
  const [protokoll, setProtokoll] = useState<WithId<SupportZugriff>[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [grund, setGrund] = useState('');
  const [stunden, setStunden] = useState('24');
  const [laeuft, setLaeuft] = useState(false);

  async function laden() {
    if (!betrieb) return;
    const [f, z] = await Promise.all([freigaben(betrieb), zugriffe(betrieb)]);
    setListe(f);
    setProtokoll(z);
  }

  useEffect(() => {
    laden().catch((e: Error) => {
      setFehler(e.message);
      setListe([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betrieb]);

  const offen = (liste ?? []).find((f) => istOffen(f));

  async function gewaehren(e: FormEvent) {
    e.preventDefault();
    if (!user || grund.trim() === '') return;
    setLaeuft(true);
    setFehler(null);
    try {
      await freigabeGeben(betrieb, user.uid, grund, Number(stunden));
      setGrund('');
      await laden();
      toast.success('Einblick gewährt');
    } catch (err) {
      setFehler((err as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  async function beenden(id: string) {
    if (!user) return;
    setLaeuft(true);
    setFehler(null);
    try {
      await freigabeWiderrufen(id, user.uid);
      await laden();
      toast.success('Zugang beendet');
    } catch (err) {
      setFehler((err as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Supportzugang" subtitle="Einblick gewähren — befristet und widerrufbar" />

      {fehler && <ErrorState message={fehler} />}

      <Card
        title={offen ? 'Ein Zugang ist offen' : 'Einblick gewähren'}
        action={offen ? <Warnung>offen bis {zeit(offen.giltBis)}</Warnung> : undefined}
        hint={
          <>
            Der Support kann Ihre Daten <strong>nur sehen, wenn Sie es erlauben</strong>, und auch
            dann nur <strong>lesen</strong> — geändert wird nichts. Nicht sichtbar sind
            Zeitbuchungen, Urlaube und Fotos von Baustellen: dort stehen Kranken- und
            Urlaubstage Ihrer Mitarbeiter und Aufnahmen aus Kundenwohnungen. Jeder Zugriff
            steht unten im Protokoll, und solange ein Zugang offen ist, sieht jeder in Ihrem
            Betrieb ein Band über der App.
          </>
        }
      >
        {liste === null ? (
          <SkeletonList rows={2} />
        ) : offen ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm">
                <strong>Grund:</strong> {offen.grund}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {offen.notzugang
                  ? 'Notzugang — vom Support geöffnet, weil der Betrieb nicht selbst freigeben konnte.'
                  : 'Von Ihnen gewährt'}{' '}
                · gilt bis {zeit(offen.giltBis)}
              </p>
            </div>
            <Button variant="danger" loading={laeuft} onClick={() => void beenden(offen.id)}>
              Zugang sofort beenden
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void gewaehren(e)}>
            <InputField
              id="sup-grund"
              label="Wofür"
              placeholder="z. B. Rechnung RE-2026-0042 stimmt nicht"
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
              pflicht
            />
            <SelectField
              id="sup-dauer"
              label="Wie lange"
              value={stunden}
              onChange={(e) => setStunden(e.target.value)}
            >
              {DAUERN.map(([h, text]) => (
                <option key={h} value={h}>
                  {text}
                </option>
              ))}
            </SelectField>
            <Button type="submit" loading={laeuft} disabled={grund.trim() === ''}>
              Einblick gewähren
            </Button>
          </form>
        )}
      </Card>

      <Card
        title={`Protokoll (${protokoll.length})`}
        hint="Festgehalten wird, WER wann WELCHEN Bereich geöffnet hat — nicht jede gelesene Zeile. Angehängt wird, geändert nie: auch wir können hier nichts nachbessern."
      >
        {protokoll.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Noch kein Zugriff. Hier steht später, was der Support angesehen hat.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {protokoll.map((z) => (
              <li key={z.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{z.bereich}</span>
                <span className="text-ink-muted">{zeit(z.wann)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(liste ?? []).length > 0 && (
        <Card title="Bisher gewährt">
          <ul className="space-y-2 text-sm">
            {(liste ?? []).map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline gap-x-2">
                {f.notzugang ? <Warnung>Notzugang</Warnung> : <Marke>gewährt</Marke>}
                <span>{f.grund}</span>
                <span className="text-ink-muted">
                  bis {zeit(f.giltBis)}
                  {f.widerrufenAm ? ` · beendet am ${zeit(f.widerrufenAm)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
