import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  buchungskonten,
  kontoAendern,
  kontoAnlegen,
  kontoLoeschen,
  type Buchungskonto,
} from '@/lib/db/konten';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import PageHeader from '@/components/PageHeader';
import { InputField } from '@/components/Field';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { ErrorState, SkeletonList } from '@/components/States';

/**
 * Welche Konten die Buchhaltung bebucht.
 *
 * WARUM DAS EINE EINSTELLUNG IST UND KEINE EINGEBAUTE ZAHL. In keinem Gesetz
 * steht, dass Erlöse zu 20 % auf 4000 gehören — das steht im Kontenplan der
 * Kanzlei. Der österreichische Einheitskontenrahmen ist ein Vorschlag: der
 * eine Betrieb führt 4000, der nächste 4020, ein dritter trennt nach Sparten.
 * Eine fest eingebaute Zahl wäre eine Buchhaltungsauskunft, die diese
 * Software nicht geben kann, und sie fiele frühestens beim Jahresabschluss
 * auf.
 *
 * GEPFLEGT AUCH VON DER BUCHHALTUNG, nicht nur von der Führung. Sie ist die
 * Rolle, die mit der Kanzlei spricht; sie hier auszusperren hiesse, für jede
 * Kontenänderung die Chefin zu holen.
 */

interface Zeile {
  /** Fehlt, solange die Zeile nur im Formular steht. */
  id?: string;
  konto: string;
  steuercode: string;
}

interface Satzzeile extends Zeile {
  /** Der Steuersatz in Prozent, wie er im Feld steht: „20". */
  satz: string;
}

const LEER: Zeile = { konto: '', steuercode: '' };

/**
 * Der Vorschlag nach dem österreichischen Einheitskontenrahmen.
 *
 * AUSDRÜCKLICH EIN VORSCHLAG UND KEINE VORBELEGUNG: er wird nur eingesetzt,
 * wenn jemand ihn anfordert. Eine Vorbelegung sähe aus wie eine Auskunft, und
 * wer sie stehen lässt, bucht ein Jahr lang auf Konten, die er nie geprüft
 * hat.
 */
const VORSCHLAG = {
  debitoren: { konto: '2000', steuercode: '' },
  anzahlung: { konto: '3500', steuercode: 'M20' },
  reverse: { konto: '4005', steuercode: 'M00' },
  saetze: [
    { satz: '20', konto: '4000', steuercode: 'M20' },
    { satz: '0', konto: '4009', steuercode: 'M00' },
  ],
};

/** „20" → 0.2 — und `null`, wenn dort kein Satz steht. */
function alsAnteil(satz: string): number | null {
  const n = Number(satz.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n >= 100) return null;
  return Math.round(n * 100) / 10000;
}

const alsProzent = (anteil: number | null | undefined) =>
  anteil == null ? '' : String(Math.round((anteil ?? 0) * 10000) / 100);

export default function KontenrahmenView() {
  const { user } = useAuth();
  const toast = useToast();
  const betrieb = user?.companyId ?? '';

  const [geladen, setGeladen] = useState<WithId<Buchungskonto>[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  const [debitoren, setDebitoren] = useState<Zeile>(LEER);
  const [anzahlung, setAnzahlung] = useState<Zeile>(LEER);
  const [reverse, setReverse] = useState<Zeile>(LEER);
  const [saetze, setSaetze] = useState<Satzzeile[]>([]);

  useEffect(() => {
    if (!betrieb) return;
    buchungskonten(betrieb)
      .then((rows) => {
        setGeladen(rows);
        const eines = (z: Buchungskonto['zweck']) => {
          const r = rows.find((x) => x.zweck === z);
          return r ? { id: r.id, konto: r.konto, steuercode: r.steuercode ?? '' } : LEER;
        };
        setDebitoren(eines('debitoren'));
        setAnzahlung(eines('anzahlung'));
        setReverse(eines('reverse_charge'));
        setSaetze(
          rows
            .filter((r) => r.zweck === 'erloes')
            .sort((a, b) => (b.ustSatz ?? 0) - (a.ustSatz ?? 0))
            .map((r) => ({
              id: r.id,
              satz: alsProzent(r.ustSatz),
              konto: r.konto,
              steuercode: r.steuercode ?? '',
            })),
        );
      })
      .catch((e: Error) => setFehler(e.message));
  }, [betrieb]);

  /** Was beim Speichern abgewiesen würde — lieber vorher sagen. */
  const einwand = useMemo(() => {
    for (const s of saetze) {
      if (s.konto.trim() === '') continue;
      if (alsAnteil(s.satz) === null) return `„${s.satz}" ist kein Steuersatz zwischen 0 und 100.`;
    }
    const doppelt = saetze
      .filter((s) => s.konto.trim() !== '')
      .map((s) => alsAnteil(s.satz))
      .filter((a): a is number => a !== null);
    if (new Set(doppelt).size !== doppelt.length) {
      return 'Zwei Erlöskonten für denselben Steuersatz — das ist keine Auswahl, sondern eine offene Frage beim nächsten Export.';
    }
    return null;
  }, [saetze]);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (einwand || !geladen) return;
    setSpeichert(true);
    setFehler(null);
    try {
      /*
        GEWOLLT IST, WAS EIN KONTO TRÄGT. Eine Zeile ohne Kontonummer ist
        keine Angabe, sondern eine geleerte — und eine geleerte Zeile wird
        gelöscht, nicht als leeres Konto gespeichert. Sonst stünde im
        Kontenrahmen ein Zweck mit leerem Konto, und der Export meldete ihn
        als vorhanden.
      */
      const gewollt: Array<{ id?: string; daten: Omit<Buchungskonto, 'companyId'> }> = [];
      const nimm = (z: Zeile, zweck: Buchungskonto['zweck']) => {
        if (z.konto.trim() === '') return;
        gewollt.push({
          id: z.id,
          daten: { zweck, ustSatz: null, konto: z.konto.trim(), steuercode: z.steuercode.trim() || null },
        });
      };
      nimm(debitoren, 'debitoren');
      nimm(anzahlung, 'anzahlung');
      nimm(reverse, 'reverse_charge');
      for (const s of saetze) {
        if (s.konto.trim() === '') continue;
        gewollt.push({
          id: s.id,
          daten: {
            zweck: 'erloes',
            ustSatz: alsAnteil(s.satz),
            konto: s.konto.trim(),
            steuercode: s.steuercode.trim() || null,
          },
        });
      }

      const behalten = new Set(gewollt.map((g) => g.id).filter(Boolean));
      for (const alt of geladen) {
        if (!behalten.has(alt.id)) await kontoLoeschen(alt.id);
      }
      for (const g of gewollt) {
        if (g.id) await kontoAendern(g.id, g.daten);
        else await kontoAnlegen(betrieb, g.daten);
      }

      setGeladen(await buchungskonten(betrieb));
      toast.success('Kontenrahmen gespeichert');
    } catch (err) {
      setFehler((err as Error).message);
    } finally {
      setSpeichert(false);
    }
  }

  function vorschlagEinsetzen() {
    setDebitoren((z) => ({ ...z, ...VORSCHLAG.debitoren }));
    setAnzahlung((z) => ({ ...z, ...VORSCHLAG.anzahlung }));
    setReverse((z) => ({ ...z, ...VORSCHLAG.reverse }));
    setSaetze((alt) =>
      VORSCHLAG.saetze.map((v) => {
        const vorhanden = alt.find((a) => a.satz === v.satz);
        return { ...v, id: vorhanden?.id };
      }),
    );
  }

  if (geladen === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kontenrahmen" subtitle="Welche Konten die Buchhaltung bebucht" />
        {fehler ? <ErrorState message={fehler} /> : <SkeletonList rows={4} />}
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={(e) => void speichern(e)}>
      <PageHeader title="Kontenrahmen" subtitle="Welche Konten die Buchhaltung bebucht" />

      <Card
        title="Grundkonten"
        hint={
          <>
            Diese Konten braucht der <strong>Buchungsstapel für BMD</strong>, den die
            Rechnungsansicht ausgibt. Sie stehen hier und nicht im Programm, weil sie aus dem
            Kontenplan deiner Kanzlei kommen — der österreichische Einheitskontenrahmen ist ein
            Vorschlag, kein Zwang. <strong>Fehlt ein Konto, entsteht keine Datei</strong>, sondern
            eine Liste dessen, was fehlt: ein Stapel mit Lücken importiert sich fehlerfrei und
            bucht einen zu niedrigen Umsatz.
          </>
        }
        action={
          <Button type="button" variant="ghost" onClick={vorschlagEinsetzen}>
            Vorschlag einsetzen
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-x-2">
            <div className="min-w-[10rem] grow">
              <InputField
                id="k-debitoren"
                label="Forderungen (Debitorensammelkonto)"
                placeholder="z. B. 2000"
                value={debitoren.konto}
                onChange={(e) => setDebitoren({ ...debitoren, konto: e.target.value })}
              />
            </div>
            <InfoHint about="das Debitorensammelkonto">
              Jede Rechnung wird im <strong>Soll</strong> auf dieses eine Konto gebucht. Eigene
              Kontonummern je Kunde führt Senklot nicht — die offene-Posten-Verwaltung bleibt
              damit bei der Kanzlei. Für einen Betrieb dieser Grösse ist das der übliche Weg;
              wenn deine Kanzlei je Kunde ein Konto will, sag es uns.
            </InfoHint>
          </div>

          <div className="flex flex-wrap items-end gap-x-2 gap-y-3">
            <div className="min-w-[10rem] grow">
              <InputField
                id="k-anzahlung"
                label="Erhaltene Anzahlungen"
                placeholder="z. B. 3500"
                value={anzahlung.konto}
                onChange={(e) => setAnzahlung({ ...anzahlung, konto: e.target.value })}
              />
            </div>
            <div className="w-32">
              <InputField
                id="k-anzahlung-code"
                label="Steuercode"
                placeholder="z. B. M20"
                value={anzahlung.steuercode}
                onChange={(e) => setAnzahlung({ ...anzahlung, steuercode: e.target.value })}
              />
            </div>
            <InfoHint about="erhaltene Anzahlungen">
              Was der Kunde vorab zahlt, ist eine <strong>Verbindlichkeit</strong> und kein Erlös,
              solange die Leistung aussteht. Die Umsatzsteuer schuldet der Betrieb trotzdem schon
              — darum trägt auch diese Zeile einen Steuercode. Mit der Schlussrechnung wird der
              Betrag von hier in den Erlös umgebucht; ohne diese Umbuchung bliebe das Konto für
              immer stehen und der Umsatz wäre zu niedrig.
            </InfoHint>
          </div>

          <div className="flex flex-wrap items-end gap-x-2 gap-y-3">
            <div className="min-w-[10rem] grow">
              <InputField
                id="k-rc"
                label="Bauleistung mit Übergang der Steuerschuld"
                placeholder="z. B. 4005"
                value={reverse.konto}
                onChange={(e) => setReverse({ ...reverse, konto: e.target.value })}
              />
            </div>
            <div className="w-32">
              <InputField
                id="k-rc-code"
                label="Steuercode"
                placeholder="z. B. M00"
                value={reverse.steuercode}
                onChange={(e) => setReverse({ ...reverse, steuercode: e.target.value })}
              />
            </div>
            <InfoHint about="den Übergang der Steuerschuld">
              § 19 Abs 1a UStG ist <strong>nicht</strong> dasselbe wie 0 % Umsatzsteuer. Beides
              ergibt 0,00 €, aber beim Übergang der Steuerschuld schuldet der Empfänger die
              Steuer, und in der Umsatzsteuervoranmeldung stehen die beiden getrennt. Deshalb ein
              eigenes Konto.
            </InfoHint>
          </div>
        </div>
      </Card>

      <Card
        title={`Erlöskonten je Steuersatz (${saetze.length})`}
        hint="Je Steuersatz, den du tatsächlich verrechnest, ein Konto. Was hier fehlt, verhindert den Buchungsstapel für jeden Zeitraum, in dem eine Rechnung mit diesem Satz liegt — gemeldet wird es mit Satz und Klartext."
      >
        {saetze.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Noch kein Erlöskonto hinterlegt. Ohne mindestens eines gibt es keinen
            Buchungsstapel.
          </p>
        ) : (
          <div className="space-y-4">
            {saetze.map((s, n) => (
              <div key={s.id ?? `neu-${n}`} className="flex flex-wrap items-end gap-2">
                <div className="w-24">
                  <InputField
                    id={`k-satz-${n}`}
                    label="Satz %"
                    inputMode="decimal"
                    value={s.satz}
                    onChange={(e) =>
                      setSaetze(saetze.map((x, i) => (i === n ? { ...x, satz: e.target.value } : x)))
                    }
                  />
                </div>
                <div className="min-w-[8rem] grow">
                  <InputField
                    id={`k-konto-${n}`}
                    label="Erlöskonto"
                    placeholder="z. B. 4000"
                    value={s.konto}
                    onChange={(e) =>
                      setSaetze(saetze.map((x, i) => (i === n ? { ...x, konto: e.target.value } : x)))
                    }
                  />
                </div>
                <div className="w-32">
                  <InputField
                    id={`k-code-${n}`}
                    label="Steuercode"
                    placeholder="z. B. M20"
                    value={s.steuercode}
                    onChange={(e) =>
                      setSaetze(
                        saetze.map((x, i) => (i === n ? { ...x, steuercode: e.target.value } : x)),
                      )
                    }
                  />
                </div>
                <IconButton
                  label={`Erlöskonto für ${s.satz || '?'} % entfernen`}
                  tone="danger"
                  onClick={() => setSaetze(saetze.filter((_, i) => i !== n))}
                >
                  ✕
                </IconButton>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSaetze([...saetze, { satz: '', konto: '', steuercode: '' }])}
          >
            + Steuersatz
          </Button>
        </div>
      </Card>

      {einwand && <ErrorState message={einwand} />}
      {fehler && <ErrorState message={fehler} />}

      <div>
        <Button type="submit" loading={speichert} disabled={!!einwand}>
          Kontenrahmen speichern
        </Button>
      </div>
    </form>
  );
}
