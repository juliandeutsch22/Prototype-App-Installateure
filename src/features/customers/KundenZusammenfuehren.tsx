import { useEffect, useState } from 'react';
import type { Customer } from '@/types';
import type { WithId } from '@/lib/db/core';
import {
  kundenZusammenfuehren,
  kundenZusammenfuehrenVorschau,
  type Stammfeld,
  type StammfeldHerkunft,
  type ZusammenfuehrenVorschau,
} from '@/lib/db/customers';
import ConfirmDialog from '@/components/ConfirmDialog';
import KundenAuswahl from '@/components/KundenAuswahl';
import Hinweiszeile from '@/components/Hinweiszeile';
import { SkeletonList } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import {
  STAMMFELDER,
  hinweise,
  unterschiede,
  vorgabeWahl,
  wahlFehler,
  wandertZeilen,
} from './zusammenfuehren';

type Wahl = Partial<Record<Stammfeld, StammfeldHerkunft>>;
type Stand =
  | { zustand: 'leer' }
  | { zustand: 'laedt' }
  | { zustand: 'fehler'; text: string }
  | { zustand: 'bereit'; vorschau: ZusammenfuehrenVorschau };

/**
 * KUNDEN ZUSAMMENFÜHREN (Durchsicht 15.11.2026, F9) — aus der Kundenakte.
 *
 * Eine Dublette mit Belegen war bisher unlösbar: löschen ging nicht, und
 * umhängen ließ sich nur eine Baustelle nach der anderen, Belege gar nicht.
 * Hier wird der doppelte Kunde gewählt, festgelegt, welcher bleibt, und
 * VOR dem Zusammenführen gezeigt, was wandert und welche Stammdaten gelten.
 * Die Datenbank führt alles in einem Zug zusammen; hat sich seit der
 * Vorschau etwas geändert, führt sie nichts zusammen und die Vorschau zeigt
 * den neuen Stand.
 */
export default function KundenZusammenfuehren({
  companyId,
  kunde,
  onSchliessen,
  onFertig,
}: {
  companyId: string;
  /** Der Kunde der Akte, aus der das Fenster geöffnet wurde. */
  kunde: WithId<Customer>;
  onSchliessen: () => void;
  /** Zusammengeführt: der bleibende Kunde. */
  onFertig: (bleibt: string, name: string) => void;
}) {
  const [andererId, setAndererId] = useState('');
  const [anderer, setAnderer] = useState<WithId<Customer> | null>(null);
  /** Welcher bleibt — vorbelegt: der Kunde dieser Akte, der doppelte geht. */
  const [diesBleibt, setDiesBleibt] = useState(true);
  const [stand, setStand] = useState<Stand>({ zustand: 'leer' });
  const [wahl, setWahl] = useState<Wahl>({});
  const [veraltet, setVeraltet] = useState(false);

  const selbst = andererId !== '' && andererId === kunde.id;
  const bleibtId = diesBleibt ? kunde.id : andererId;
  const gehtId = diesBleibt ? andererId : kunde.id;

  useEffect(() => {
    if (!andererId || selbst) {
      setStand({ zustand: 'leer' });
      return;
    }
    let weg = false;
    setStand({ zustand: 'laedt' });
    setVeraltet(false);
    kundenZusammenfuehrenVorschau(bleibtId, gehtId)
      .then((v) => {
        if (weg) return;
        setStand({ zustand: 'bereit', vorschau: v });
        setWahl(vorgabeWahl(v.bleibt, v.geht));
      })
      .catch((e) => !weg && setStand({ zustand: 'fehler', text: grundAus(e, 'Die Vorschau konnte nicht geladen werden.') }));
    return () => {
      weg = true;
    };
  }, [andererId, selbst, bleibtId, gehtId]);

  const v = stand.zustand === 'bereit' ? stand.vorschau : null;
  const fehler = v ? wahlFehler(v.bleibt, v.geht, wahl) : null;

  async function zusammenfuehren() {
    if (!v) return;
    const r = await kundenZusammenfuehren(v.bleibt.id, v.geht.id, wahl, v.stand);
    if (r.art === 'veraltet') {
      /*
        NICHTS ZUSAMMENGEFÜHRT: seit der Vorschau kam etwas hinzu oder ein
        Kunde wurde geändert. Die neue Vorschau steht da; was schon gewählt
        war und weiter zur Wahl steht, bleibt gewählt.
      */
      const neu = vorgabeWahl(r.vorschau.bleibt, r.vorschau.geht);
      for (const feld of Object.keys(neu) as Stammfeld[]) if (wahl[feld]) neu[feld] = wahl[feld];
      setStand({ zustand: 'bereit', vorschau: r.vorschau });
      setWahl(neu);
      setVeraltet(true);
      return;
    }
    onFertig(r.kunde, r.name);
  }

  const zeilen = v ? wandertZeilen(v.zahlen) : [];
  const felder = v ? unterschiede(v.bleibt, v.geht) : [];

  return (
    <ConfirmDialog
      open
      title="Kunden zusammenführen"
      message="Für einen Kunden, der doppelt angelegt ist. Alles, was an der Dublette hängt, wandert zum bleibenden Kunden; die Dublette verschwindet. Das lässt sich nicht rückgängig machen."
      confirmLabel="Zusammenführen"
      confirmTone="danger"
      gesperrt={!v || !!fehler}
      onConfirm={zusammenfuehren}
      onCancel={onSchliessen}
    >
      <div className="space-y-4">
        <KundenAuswahl
          companyId={companyId}
          id="zusammenfuehren-kunde"
          label="Doppelter Kunde"
          value={andererId}
          kunde={anderer}
          onChange={(id, k) => {
            setAndererId(id);
            setAnderer(k);
          }}
        />
        {selbst && (
          <Hinweiszeile stufe="warn">
            <p>Das ist der Kunde dieser Akte — bitte den doppelten wählen.</p>
          </Hinweiszeile>
        )}

        {andererId && !selbst && (
          <fieldset className="space-y-2">
            <legend className="section-label">Welcher Kunde bleibt?</legend>
            <div className="wahl-gruppe">
              {[
                { bleibt: true, name: kunde.name, zusatz: 'Der Kunde dieser Akte' },
                { bleibt: false, name: anderer?.name ?? 'Der gewählte Kunde', zusatz: 'Der gewählte Kunde' },
              ].map((o) => (
                <label key={String(o.bleibt)} className="wahl-option">
                  <input
                    type="radio"
                    name="zusammenfuehren-bleibt"
                    checked={diesBleibt === o.bleibt}
                    onChange={() => setDiesBleibt(o.bleibt)}
                  />
                  <span className="wahl-text">
                    <span className="wahl-name">{o.name}</span>
                    <span className="wahl-zusatz">{o.zusatz}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {stand.zustand === 'laedt' && <SkeletonList rows={3} />}
        {stand.zustand === 'fehler' && (
          <Hinweiszeile stufe="fehl" role="alert">
            <p>{stand.text}</p>
          </Hinweiszeile>
        )}

        {v && (
          <>
            {veraltet && (
              <Hinweiszeile stufe="warn" role="status">
                <p>Inzwischen hat sich etwas geändert — es wurde nichts zusammengeführt. Die Vorschau zeigt jetzt den neuen Stand; bitte noch einmal prüfen.</p>
              </Hinweiszeile>
            )}
            <section aria-labelledby="zusammenfuehren-wandert">
              <h3 id="zusammenfuehren-wandert" className="section-label">
                Wandert von „{v.geht.name}“ zu „{v.bleibt.name}“
              </h3>
              {zeilen.length === 0 ? (
                <p className="text-sm text-ink-muted">An der Dublette hängt nichts — sie wird nur entfernt.</p>
              ) : (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink">
                  {zeilen.map((z) => <li key={z}>{z}</li>)}
                </ul>
              )}
            </section>

            {felder.length > 0 && (
              <section aria-labelledby="zusammenfuehren-stamm" className="space-y-3">
                <h3 id="zusammenfuehren-stamm" className="section-label">Stammdaten — was gilt danach?</h3>
                {felder.map((feld) => {
                  const f = STAMMFELDER.find((s) => s.feld === feld)!;
                  const optionen: { wert: StammfeldHerkunft; text: string; zusatz: string }[] = [
                    { wert: 'bleibt', text: f.wert(v.bleibt) || 'nichts eingetragen', zusatz: `von „${v.bleibt.name}“` },
                    { wert: 'geht', text: f.wert(v.geht) || 'nichts eingetragen', zusatz: `von „${v.geht.name}“` },
                    ...(feld === 'notes' && f.wert(v.bleibt).trim() && f.wert(v.geht).trim()
                      ? [{ wert: 'beide' as const, text: 'Beide behalten', zusatz: 'untereinander, die bleibende zuerst' }]
                      : []),
                  ];
                  return (
                    <fieldset key={feld}>
                      <legend className="text-sm text-ink">{f.name}</legend>
                      <div className="wahl-gruppe mt-1">
                        {optionen.map((o) => (
                          <label key={o.wert} className="wahl-option">
                            <input
                              type="radio"
                              name={`zusammenfuehren-${feld}`}
                              checked={(wahl[feld] ?? 'bleibt') === o.wert}
                              onChange={() => setWahl((w) => ({ ...w, [feld]: o.wert }))}
                            />
                            <span className="wahl-text">
                              <span className="wahl-name whitespace-pre-line break-words">{o.text}</span>
                              <span className="wahl-zusatz">{o.zusatz}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </section>
            )}

            {hinweise(v, wahl).map((h) => <p key={h} className="text-sm text-ink-muted">{h}</p>)}
            {fehler && (
              <Hinweiszeile stufe="warn">
                <p>{fehler}</p>
              </Hinweiszeile>
            )}
          </>
        )}
      </div>
    </ConfirmDialog>
  );
}
