import { useEffect, useState } from 'react';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
import { InputField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import {
  betriebAktivieren, betriebDeaktivieren, betriebLoeschen, betriebProtokoll, betriebUebergabe,
  loeschungAbbrechen, loeschungPlanen, testbetriebSetzen,
  type BetriebProtokollEintrag, type PlattformBetrieb, type Uebergabe,
} from '@/lib/db/plattform';

/**
 * EINEN BETRIEB DEAKTIVIEREN UND LÖSCHEN (Nachtest 01.10.2026, Paket D).
 *
 * Die Schritte stehen in der Reihenfolge, in der sie gelten, und nur der
 * jeweils nächste ist zu drücken: aktiv → deaktiviert → Übergabe → Löschung
 * geplant → nach der Frist löschen. Jeder Schritt braucht einen Grund; er
 * steht im Protokoll der Plattform. Was erlaubt ist, entscheidet die
 * Datenbank — diese Maske zeigt nur den Weg und reicht ihre Gründe weiter.
 */

const AKTION: Record<BetriebProtokollEintrag['aktion'], string> = {
  deaktiviert: 'Deaktiviert',
  aktiviert: 'Wieder aktiviert',
  testbetrieb: 'Testbetrieb geändert',
  export: 'Übergabe erstellt',
  loeschung_geplant: 'Löschung geplant',
  loeschung_abgebrochen: 'Löschung abgebrochen',
  geloescht: 'Gelöscht',
};

const zeit = (iso: string) =>
  new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function BetriebVerwalten({
  betrieb, geaendert,
}: {
  betrieb: PlattformBetrieb;
  /** Nach jedem Schritt: die Liste neu laden. */
  geaendert: () => Promise<void> | void;
}) {
  const k = betrieb.kennung;
  const [grund, setGrund] = useState('');
  const [tage, setTage] = useState(betrieb.testbetrieb ? '0' : '30');
  const [bestaetigung, setBestaetigung] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [uebergabe, setUebergabe] = useState<Uebergabe | null>(null);
  const [protokoll, setProtokoll] = useState<BetriebProtokollEintrag[] | null>(null);

  async function protokollLaden() {
    try {
      setProtokoll(await betriebProtokoll(k, 10));
    } catch {
      setProtokoll([]);
    }
  }
  useEffect(() => {
    void protokollLaden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  useEffect(() => {
    setTage(betrieb.testbetrieb ? '0' : '30');
  }, [betrieb.testbetrieb]);

  /*
    DIE FRIST LÄUFT AUCH OHNE NEULADEN AB (Runde 3, G12). Bei einer Frist
    von 0 Tagen setzt die Datenbank den Zeitpunkt auf „jetzt“ — nach der Uhr
    des Servers. Geht die Uhr des Geräts ein paar Sekunden nach, stand danach
    „Vor Ablauf der Frist …“, bis jemand neu lud. Jetzt zeichnet die Maske
    sich zum Ablauf selbst neu.
  */
  const [, setUhr] = useState(0);
  const geplantAb = betrieb.loeschungGeplantFuer ? new Date(betrieb.loeschungGeplantFuer).getTime() : null;
  useEffect(() => {
    if (geplantAb === null) return;
    const rest = geplantAb - Date.now();
    if (rest < 0) return;
    // Höchstens einen Tag warten: längere Zeitgeber laufen in Browsern über.
    const t = setTimeout(() => setUhr((n) => n + 1), Math.min(rest + 250, 86_400_000));
    return () => clearTimeout(t);
  });

  async function schritt(tun: () => Promise<string | void>) {
    setFehler(null);
    setMeldung(null);
    setLaeuft(true);
    try {
      const text = await tun();
      if (text) setMeldung(text);
      setGrund('');
      setBestaetigung('');
      await geaendert();
      await protokollLaden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Abgewiesen.');
    } finally {
      setLaeuft(false);
    }
  }

  const ohneGrund = grund.trim() === '';
  const deaktiviert = !!betrieb.deaktiviertAm;
  const geplant = betrieb.loeschungGeplantFuer;
  const fristUm = !!geplant && new Date(geplant).getTime() <= Date.now();
  const exportFehlt = !betrieb.testbetrieb && !betrieb.exportAm;

  return (
    <div className="space-y-3 rounded-sm border border-line p-3" aria-label={`${betrieb.name} verwalten`}>
      <p className="text-sm text-ink">
        {deaktiviert ? (
          <>
            <strong>Deaktiviert</strong> seit {zeit(betrieb.deaktiviertAm!)}
            {betrieb.deaktiviertGrund ? ` — ${betrieb.deaktiviertGrund}` : ''}. Kein Konto meldet sich an,
            Push und Nachtlauf ruhen, die Daten sind unverändert.
          </>
        ) : (
          <>
            <strong>Aktiv.</strong> Deaktivieren sperrt alle Konten und beendet offene Sitzungen;
            Push und Nachtlauf ruhen, die Daten bleiben. Jederzeit rückgängig.
          </>
        )}
        {betrieb.testbetrieb && ' Als Testbetrieb gekennzeichnet: löschbar ohne Übergabe und ohne Frist.'}
      </p>

      <InputField
        id={`grund-${k}`}
        label="Grund (steht im Protokoll)"
        value={grund}
        onChange={(e) => setGrund(e.target.value)}
        placeholder="z. B. Kündigung zum 31.10., Antrag vom 01.10."
      />

      <div className="flex flex-wrap gap-2">
        {!deaktiviert ? (
          <Button
            variant="secondary"
            groesse="klein"
            disabled={laeuft || ohneGrund}
            onClick={() => void schritt(async () => {
              await betriebDeaktivieren(k, grund.trim());
              return 'Deaktiviert. Alle Konten sind gesperrt, offene Sitzungen beendet.';
            })}
          >
            Deaktivieren
          </Button>
        ) : (
          <Button
            variant="secondary"
            groesse="klein"
            disabled={laeuft || ohneGrund}
            onClick={() => void schritt(async () => {
              await betriebAktivieren(k, grund.trim());
              return geplant
                ? 'Wieder aktiv. Die geplante Löschung ist damit abgebrochen.'
                : 'Wieder aktiv. Wer in der Belegschaft aktiv ist, meldet sich wieder an.';
            })}
          >
            Wieder aktivieren
          </Button>
        )}
        {/*
          NACHTRÄGLICH NUR OHNE ECHTE DATEN (Runde 3, H1): ein Testbetrieb ist
          ohne Übergabe und Frist löschbar. Die Datenbank weist es ab; die
          Maske bietet es dann gar nicht erst an. „Kein Testbetrieb“ geht
          immer.
        */}
        {(betrieb.testbetrieb || !betrieb.echteDaten) && (
          <Button
            variant="ghost"
            groesse="klein"
            disabled={laeuft || ohneGrund}
            onClick={() => void schritt(async () => {
              await testbetriebSetzen(k, !betrieb.testbetrieb, grund.trim());
              return betrieb.testbetrieb && geplant
                ? 'Kein Testbetrieb mehr. Die geplante Löschung ist abgebrochen — sie braucht jetzt Übergabe und Frist.'
                : undefined;
            })}
          >
            {betrieb.testbetrieb ? 'Kein Testbetrieb' : 'Als Testbetrieb kennzeichnen'}
          </Button>
        )}
      </div>
      {/* Runde 3, G13: gesperrte Knöpfe sagen, was fehlt. */}
      {ohneGrund && (
        <p className="text-sm text-ink-muted">Für jeden Schritt zuerst oben einen Grund eintragen.</p>
      )}
      {!betrieb.testbetrieb && betrieb.echteDaten && (
        <p className="text-sm text-ink-muted">
          Kein Testbetrieb: {betrieb.echteDaten}. Gelöscht wird er nur mit Übergabe und Frist.
        </p>
      )}

      {deaktiviert && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-normal text-ink">Übergabe</p>
          <p className="text-sm text-ink-muted">
            Alle Tabellen als ein Stand und ein Verzeichnis aller Scheinfotos und Baustellendokumente,
            je mit Link, eine Woche gültig — für den Betrieb vor der Löschung. Belege als PDF erzeugt
            die App im Browser; der Stand enthält ihre Daten vollständig.
            {betrieb.exportAm ? ` Zuletzt erstellt am ${zeit(betrieb.exportAm)}.` : ''}
          </p>
          <Button
            variant="secondary"
            groesse="klein"
            disabled={laeuft || ohneGrund}
            onClick={() => void schritt(async () => {
              const u = await betriebUebergabe(k, grund.trim());
              setUebergabe(u);
              return `Übergabe erstellt: ${u.zeilen} Zeilen, ${u.dateien} Dateien.`;
            })}
          >
            Übergabe erstellen
          </Button>
          {uebergabe && (
            <ul className="space-y-1 text-sm">
              {uebergabe.datenLink && (
                <li><a className="link" href={uebergabe.datenLink} target="_blank" rel="noreferrer">Daten (JSON-Zeilen)</a></li>
              )}
              {uebergabe.dateienLink && (
                <li><a className="link" href={uebergabe.dateienLink} target="_blank" rel="noreferrer">Verzeichnis der Dateien</a></li>
              )}
              <li className="text-ink-muted">Gültig bis {zeit(uebergabe.gueltigBis)}.</li>
            </ul>
          )}
        </div>
      )}

      {deaktiviert && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-normal text-ink">Löschen</p>
          {!geplant ? (
            <>
              <p className="text-sm text-ink-muted">
                Nie sofort: zuerst mit Frist planen (vorgeschlagen 30 Tage, mindestens 7; ein Testbetrieb
                ab sofort). Bis dahin lässt sich alles abbrechen.
                {exportFehlt && ' Vorher braucht der Betrieb seine Übergabe.'}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <InputField
                  id={`tage-${k}`}
                  label="Frist (Tage)"
                  type="number"
                  inputMode="numeric"
                  min={betrieb.testbetrieb ? 0 : 7}
                  max={365}
                  value={tage}
                  onChange={(e) => setTage(e.target.value)}
                  className="w-32"
                />
                <Button
                  variant="secondary"
                  groesse="klein"
                  disabled={laeuft || ohneGrund || exportFehlt || tage.trim() === ''}
                  onClick={() => void schritt(async () => {
                    const ab = await loeschungPlanen(k, grund.trim(), Number(tage));
                    return `Löschung geplant — ausführbar ab ${zeit(ab)}.`;
                  })}
                >
                  Löschung planen
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink">
                Löschung geplant — ausführbar ab <strong>{zeit(geplant)}</strong>.
              </p>
              <Button
                variant="ghost"
                groesse="klein"
                disabled={laeuft || ohneGrund}
                onClick={() => void schritt(async () => {
                  await loeschungAbbrechen(k, grund.trim());
                  return 'Löschung abgebrochen. Der Betrieb bleibt deaktiviert.';
                })}
              >
                Löschung abbrechen
              </Button>
              {fristUm ? (
                <div className="space-y-2">
                  <Hinweiszeile stufe="warn">
                    <p>
                      Endgültig: alle Daten, Dateien, Anmeldekonten und Push-Geräte dieses Betriebs werden
                      gelöscht. Es bleibt ein Löschprotokoll ohne Inhalte; die Kennung „{k}“ wird nie
                      wieder vergeben. Ältere Stände in der Sicherung außer Haus laufen über deren
                      Ablaufregel aus.
                    </p>
                  </Hinweiszeile>
                  <InputField
                    id={`bestaetigung-${k}`}
                    label={`Zur Bestätigung die Kennung eintippen: ${k}`}
                    autoComplete="off"
                    value={bestaetigung}
                    onChange={(e) => setBestaetigung(e.target.value)}
                  />
                  <Button
                    variant="danger"
                    groesse="klein"
                    disabled={laeuft || ohneGrund || bestaetigung.trim() !== k}
                    onClick={() => void schritt(async () => {
                      const r = await betriebLoeschen(k, bestaetigung, grund.trim());
                      return r.kontenOffen.length
                        ? `Gelöscht: ${r.zeilen} Zeilen, ${r.dateien} Dateien. ${r.kontenOffen.length} Anmeldekonten ließen sich nicht entfernen — sie sind gesperrt und ohne Betrieb.`
                        : `Gelöscht: ${r.zeilen} Zeilen, ${r.dateien} Dateien, ${r.konten} Anmeldekonten.`;
                    })}
                  >
                    Endgültig löschen
                  </Button>
                  {(ohneGrund || bestaetigung.trim() !== k) && (
                    <p className="text-sm text-ink-muted">
                      {ohneGrund ? 'Zum Löschen oben einen Grund eintragen' : 'Zum Löschen die Kennung genau eintippen'}
                      {ohneGrund && bestaetigung.trim() !== k ? ' und die Kennung genau eintippen.' : '.'}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Vor Ablauf der Frist lässt sich nicht löschen.</p>
              )}
            </>
          )}
        </div>
      )}

      {fehler && <ErrorState message={fehler} />}
      {meldung && <p className="text-sm text-ink" role="status">{meldung}</p>}

      {protokoll && protokoll.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="text-sm font-normal text-ink">Protokoll</p>
          <ul className="mt-1 space-y-1 text-sm text-ink-muted">
            {protokoll.map((p, i) => (
              <li key={`${p.am}-${i}`}>
                {zeit(p.am)} · {AKTION[p.aktion] ?? p.aktion}
                {p.grund ? ` — ${p.grund}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
