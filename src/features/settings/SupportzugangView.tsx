import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  freigabeGeben,
  freigabeWiderrufen,
  freigaben,
  istOffen,
  bereiche,
  type SupportFreigabe,
  type SupportBereich,
  type SupportStufe,
} from '@/lib/db/support';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { InputField, SelectField } from '@/components/Field';
import { Marke, Warnung } from '@/components/Badge';
import { useToast } from '@/components/Toast';
import { ErrorState, SkeletonList } from '@/components/States';
import { SUPPORT_GEAENDERT } from '@/components/Supportband';

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

/**
 * Wie lange — in Stunden.
 *
 * MITARBEITEN ENDET NACH EINEM TAG. Eine Woche Schreibrecht ist kein
 * Supportfall mehr, sondern ein zweiter Administrator, den niemand auf der
 * Gehaltsliste hat. Dieselbe Grenze steht in der Datenbank; hier steht sie,
 * damit niemand eine Dauer wählt, die gleich darauf abgewiesen wird.
 */
const DAUERN: Array<[number, string, SupportStufe[]]> = [
  [4, '4 Stunden', ['ansehen', 'mitarbeiten']],
  [24, '1 Tag', ['ansehen', 'mitarbeiten']],
  [72, '3 Tage', ['ansehen']],
  [168, '7 Tage', ['ansehen']],
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
  const [gesehen, setGesehen] = useState<SupportBereich[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [grund, setGrund] = useState('');
  const [stunden, setStunden] = useState('24');
  const [stufe, setStufe] = useState<SupportStufe>('ansehen');
  const [laeuft, setLaeuft] = useState(false);

  async function laden() {
    if (!betrieb) return;
    const [f, b] = await Promise.all([freigaben(betrieb), bereiche(betrieb)]);
    setListe(f);
    setGesehen(b);
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
      await freigabeGeben(betrieb, user.uid, grund, Number(stunden), stufe);
      setGrund('');
      setStufe('ansehen');
      await laden();
      /* Das Band auf DIESEM Geraet nicht bis zum naechsten Takt warten
         lassen — siehe `Supportband`. */
      window.dispatchEvent(new Event(SUPPORT_GEAENDERT));
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
      window.dispatchEvent(new Event(SUPPORT_GEAENDERT));
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
            Der Support kommt an Ihre Daten <strong>nur, wenn Sie es erlauben</strong>, und
            nur so weit, wie Sie es erlauben. <strong>Ansehen</strong> heisst lesen und sonst
            nichts. <strong>Mitarbeiten</strong> heisst: er kann für höchstens einen Tag
            dasselbe wie ein Administrator bei Ihnen — dafür fragen Sie ihn besser, was er
            vorhat.
            <br />
            <br />
            <strong>In beiden Stufen verschlossen:</strong> Zeitbuchungen, Urlaube und Fotos von
            Baustellen. Dort stehen Kranken- und Urlaubstage Ihrer Mitarbeiter und Aufnahmen aus
            Kundenwohnungen; kein Supportfall braucht sie.
            <br />
            <br />
            Was in einem Zugang geöffnet wurde, steht unten bei diesem Zugang — und solange
            einer offen ist, sieht jeder in Ihrem Betrieb ein Band über der App.
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
                ·{' '}
                {offen.stufe === 'mitarbeiten'
                  ? 'Mitarbeiten — er kann bei Ihnen auch ändern'
                  : 'Ansehen — er kann nichts ändern'}{' '}
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
            {/*
              DIE STUFE STEHT VOR DER DAUER, und zwar als ausgeschriebene Wahl
              statt als Auswahlliste: sie ist die folgenreichere der beiden
              Fragen, und eine zugeklappte Liste mit „Ansehen" darin liest
              niemand. Wer nichts tut, gibt das Leserecht — die harmlosere
              Antwort ist die Vorgabe.
            */}
            <fieldset className="rounded border border-line bg-surface-2 p-4">
              <legend className="section-label px-1">Wie weit?</legend>
              <div className="flex flex-col gap-2">
                <label className="flex min-h-touch items-start gap-3 py-1">
                  <input
                    type="radio"
                    name="sup-stufe"
                    className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
                    checked={stufe === 'ansehen'}
                    onChange={() => setStufe('ansehen')}
                  />
                  <span className="text-sm">
                    <strong className="text-ink">Nur ansehen</strong>
                    <span className="mt-1 block text-ink-muted">
                      Er sieht Ihren Betrieb so, wie Sie ihn sehen — und kann nichts ändern.
                      Bis zu sieben Tage.
                    </span>
                  </span>
                </label>
                <label className="flex min-h-touch items-start gap-3 py-1">
                  <input
                    type="radio"
                    name="sup-stufe"
                    className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
                    checked={stufe === 'mitarbeiten'}
                    onChange={() => {
                      setStufe('mitarbeiten');
                      // Sieben Tage gibt es für diese Stufe nicht; eine
                      // stehengebliebene Auswahl wäre gleich darauf abgewiesen
                      // worden.
                      if (Number(stunden) > 24) setStunden('24');
                    }}
                  />
                  <span className="text-sm">
                    <strong className="text-ink">Mitarbeiten</strong>
                    <span className="mt-1 block text-ink-muted">
                      Er kann bei Ihnen auch ändern — wie ein Administrator. Höchstens einen
                      Tag, und jede Änderung trägt seine Kennung.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            <SelectField
              id="sup-dauer"
              label="Wie lange"
              value={stunden}
              onChange={(e) => setStunden(e.target.value)}
            >
              {DAUERN.filter(([, , fuer]) => fuer.includes(stufe)).map(([h, text]) => (
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
        title={`Bisherige Zugänge (${(liste ?? []).length})`}
        hint="Je Zugang steht hier, WOFÜR er gewährt wurde, WIE LANGE er galt — und welche Bereiche darin geöffnet wurden. Gezählt wird jeder einzelne Aufruf; angehängt wird, geändert nie. Auch wir können hier nichts nachbessern."
      >
        {(liste ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">
            Noch nie Einblick gewährt. Hier steht später jeder Zugang mit dem, was darin
            angesehen wurde.
          </p>
        ) : (
          /*
            EINE ZEILE JE ZUGANG, NICHT JE KLICK.

            Hier standen zwei Karten: eine Aufzählung der einzelnen Aufrufe
            („Baustellen 20:58", „Rechnungen 20:58", „Baustellen 20:58" …) und
            darunter getrennt die Liste der Freigaben. Zwei Minuten Support
            ergaben vierzehn Zeilen; nach einem halben Jahr liest die niemand
            mehr, und eine Liste, die niemand liest, ist keine Kontrolle.

            Der Betrieb fragt nicht „welche Klicks", sondern „was hat der
            Support in diesem Zugang gesehen". Genau das steht jetzt unter dem
            Zugang, zu dem es gehört — gezählt, nicht aufgezählt.
          */
          <ul className="space-y-4 text-sm">
            {(liste ?? []).map((f) => {
              const dazu = gesehen
                .filter((b) => b.freigabe_id === f.id)
                .sort((a, b) => b.anzahl - a.anzahl);
              const laeuft = istOffen(f);
              return (
                <li key={f.id} className="border-t border-line pt-3 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {f.notzugang ? <Warnung>Notzugang</Warnung> : null}
                    {f.stufe === 'mitarbeiten' ? (
                      <Warnung>mitarbeiten</Warnung>
                    ) : (
                      <Marke>ansehen</Marke>
                    )}
                    {laeuft ? <Marke>läuft</Marke> : null}
                    <span className="font-medium text-ink">{f.grund}</span>
                  </div>
                  <p className="mt-1 text-ink-muted">
                    {f.createdAt ? `${zeit(f.createdAt)} · ` : ''}
                    {f.widerrufenAm
                      ? `beendet am ${zeit(f.widerrufenAm)}`
                      : laeuft
                        ? `läuft bis ${zeit(f.giltBis)}`
                        : `abgelaufen am ${zeit(f.giltBis)}`}
                  </p>
                  {/*
                    „Nichts angesehen" ist eine eigene Aussage und die
                    beruhigendste von allen: gewährt, aber nie benutzt. Sie
                    wegzulassen hiesse, sie mit „noch nicht geladen" zu
                    verwechseln.
                  */}
                  <p className="mt-1 text-ink-muted">
                    {dazu.length === 0
                      ? 'Nichts angesehen.'
                      : `Angesehen: ${dazu
                          .map((b) => `${b.bereich} ${b.anzahl}×`)
                          .join(' · ')} — zuletzt ${zeit(
                          Math.max(...dazu.map((b) => Date.parse(b.zuletzt))),
                        )}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
