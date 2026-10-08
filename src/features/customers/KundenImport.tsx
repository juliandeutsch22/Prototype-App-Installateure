import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { kundenEinspielen, kundenVorhanden } from '@/lib/db/customers';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import InfoHint from '@/components/InfoHint';
import Metric, { MetricRow } from '@/components/Metric';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { dekodiere } from '@/features/materials/datanorm';
import { liesCsv, pruefeKunden, VORLAGE, type KundenProbelauf } from './kundenCsv';

/**
 * Kunden aus einer Datei übernehmen — erst ansehen, dann schreiben.
 *
 * DASSELBE MUSTER WIE BEIM KATALOG DES GROSSHÄNDLERS: lesen, ZEIGEN, was dabei
 * herauskam, und erst auf einen zweiten Klick schreiben. Bis dahin ist nichts
 * in der Datenbank. Der Unterschied ist die Grösse: ein Kundenstamm hat
 * hunderte Zeilen, nicht zehntausende, und geht deshalb in EINER Transaktion
 * hinein — alle oder keiner.
 *
 * Nicht übernommen wird, was es schon gibt (die Datenbank entscheidet, über
 * den ganzen Bestand) und was fehlerhaft ist. Beides steht mit Zeile und
 * Grund da, damit niemand glaubt, es sei mitgekommen.
 *
 * SEIT DER LINIE „LOT“ OHNE EIGENE KARTE AUF DER SEITE. Der Import ist eine
 * seltene Seitenaktion und steht im ⋯ des Seitenkopfs (Regel 2). Der Eintrag
 * dort öffnet gleich die Dateiauswahl (`dateiWaehlen`), damit der Weg nur um
 * den Tipp auf „⋯“ länger wird; Probelauf und Ergebnis stehen im
 * Seitenfenster.
 */

/** Wie viele nicht übernommene Zeilen die Ansicht zeigt. */
const ZEIGE_ZEILEN = 50;

const FELDNAME: Record<string, string> = {
  firma: 'Name (Firma)', name: 'Name', vorname: 'Name (Vorname)', nachname: 'Name (Nachname)',
  ansprechpartner: 'Ansprechpartner', adresse: 'Rechnungsadresse', strasse: 'Adresse (Straße)',
  hausnummer: 'Adresse (Hausnummer)', plz: 'Adresse (PLZ)', ort: 'Adresse (Ort)', land: 'Adresse (Land)',
  telefon: 'Telefon', email: 'E-Mail', uid: 'UID-Nummer', notiz: 'Notiz', kundennummer: 'Notiz (Kundennummer)',
};

/** Was die Kundenliste aus ihrem ⋯ heraus auslöst. */
export interface KundenImportGriff {
  dateiWaehlen: () => void;
  vorlageLaden: () => void;
}

const KundenImport = forwardRef<KundenImportGriff, { onUebernommen: () => void }>(function KundenImport(
  { onUebernommen },
  ref,
) {
  const toast = useToast();
  const [datei, setDatei] = useState<string | null>(null);
  const [probe, setProbe] = useState<KundenProbelauf | null>(null);
  const [vorhanden, setVorhanden] = useState<Set<number>>(new Set());
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ergebnis, setErgebnis] = useState<{ angelegt: number; uebersprungen: number } | null>(null);
  /** Das Seitenfenster: offen, sobald eine Datei gewählt ist. */
  const [offen, setOffen] = useState(false);
  const feld = useRef<HTMLInputElement>(null);

  const neu = useMemo(
    () => (probe ? probe.kunden.filter((_, i) => !vorhanden.has(i)) : []),
    [probe, vorhanden],
  );
  const schonDa = useMemo(
    () => (probe ? probe.kunden.filter((_, i) => vorhanden.has(i)) : []),
    [probe, vorhanden],
  );

  function vorlage() {
    // Mit BOM: sonst liest Excel die Umlaute der Vorlage als Windows-1252.
    const url = URL.createObjectURL(new Blob(['﻿', VORLAGE], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kunden-vorlage.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  useImperativeHandle(ref, () => ({
    dateiWaehlen: () => feld.current?.click(),
    vorlageLaden: vorlage,
  }));

  async function lesen(f: File) {
    setFehler(null);
    setErgebnis(null);
    setProbe(null);
    setOffen(true);
    setBusy(true);
    try {
      const { text } = dekodiere(await f.arrayBuffer());
      const p = pruefeKunden(liesCsv(text));
      const da = p.kunden.length > 0 ? await kundenVorhanden(p.kunden.map((k) => k.kunde)) : [];
      setVorhanden(new Set(da));
      setProbe(p);
      setDatei(f.name);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBusy(false);
      if (feld.current) feld.current.value = '';
    }
  }

  async function uebernehmen() {
    setFehler(null);
    setBusy(true);
    try {
      const r = await kundenEinspielen(neu.map((k) => k.kunde));
      setErgebnis(r);
      setProbe(null);
      setDatei(null);
      toast.success(`${r.angelegt} ${r.angelegt === 1 ? 'Kunde' : 'Kunden'} angelegt`);
      onUebernommen();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Schliessen und Verwerfen sind dasselbe: geschrieben ist bis dahin nichts. */
  function verwerfen() {
    setProbe(null);
    setDatei(null);
    setFehler(null);
    setErgebnis(null);
    setOffen(false);
  }

  const nichtUebernommen = probe
    ? [
        ...probe.fehler,
        ...schonDa.map((k) => ({ zeile: k.zeile, grund: 'Gibt es schon als Kunden', inhalt: k.kunde.name })),
      ].sort((a, b) => a.zeile - b.zeile)
    : [];

  return (
    <>
      {/* Auf der Seite wandert diese Erklärung in „Hilfe zu dieser Seite“. */}
      <InfoHint about="Kunden aus einer Datei">
        Für den Umstieg: eine CSV-Datei aus dem bisherigen Programm oder aus Excel („Speichern
        unter" → „CSV (Trennzeichen-getrennt)“). Die erste Zeile nennt die Spalten; erkannt
        werden etwa Firma, Vorname, Nachname, Straße, PLZ, Ort, Telefon, E-Mail, UID und Notiz.
        Eingelesen wird die Datei <strong>zuerst nur angesehen</strong> — übernommen wird erst
        auf Bestätigung, und Kunden, die es schon gibt, werden nicht doppelt angelegt. Zu finden
        im ⋯ oben: „Kunden aus einer Datei einlesen“ und die Vorlage.
      </InfoHint>
      {/*
        Das Dateifeld selbst ist unsichtbar und kein Tab-Halt: gewählt wird
        über das ⋯ des Seitenkopfs oder „Andere Datei wählen“ im Fenster.
      */}
      <input
        ref={feld}
        id="kunden-datei"
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        aria-label="CSV-Datei"
        tabIndex={-1}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void lesen(f);
        }}
      />

      <BottomSheet open={offen} onClose={verwerfen} label="Kunden aus einer Datei" auchBreit titel="Kunden aus einer Datei">
        <div className="flex flex-col gap-4">
          {busy && !probe && <LoadingState label="Datei wird gelesen …" />}
          {fehler && <ErrorState message={fehler} />}
          {ergebnis && (
            <p className="text-sm text-ink" role="status">
              Übernommen: {ergebnis.angelegt} angelegt
              {ergebnis.uebersprungen > 0 && `, ${ergebnis.uebersprungen} schon vorhanden`}.
            </p>
          )}

          {probe && (
            <>
              <section className="flex flex-col gap-3">
                <h3 className="flex flex-wrap items-center text-base font-semibold text-ink-deep">
                  Probelauf
                  <InfoHint about="Probelauf">
                    Noch ist nichts geschrieben. Stehen unten falsche Umlaute, war die Datei in einem
                    anderen Zeichensatz gespeichert — dann in Excel als „CSV UTF-8“ speichern und neu
                    einlesen.
                  </InfoHint>
                </h3>
                <p className="text-sm text-ink-muted">{datei}</p>
                <MetricRow>
                  <Metric label="Neu" value={neu.length} />
                  <Metric label="Schon vorhanden" value={schonDa.length} />
                  <Metric
                    label="Fehlerhaft"
                    value={probe.fehler.length}
                    tone={probe.fehler.length > 0 ? 'warning' : 'default'}
                  />
                </MetricRow>
                <p className="text-sm text-ink-muted">
                  Übernommen wird: {probe.erkannt.map((e) => `${e.spalte} → ${FELDNAME[e.feld]}`).join(', ')}.
                  {probe.ignoriert.length > 0 && <> Nicht übernommen: {probe.ignoriert.join(', ')}.</>}
                </p>
              </section>

              {nichtUebernommen.length > 0 && (
                <section className="flex flex-col gap-2 border-t border-line pt-4">
                  <h3 className="text-base font-semibold text-ink-deep">{`Nicht übernommen (${nichtUebernommen.length})`}</h3>
                  <ul className="space-y-3 text-sm">
                    {nichtUebernommen.slice(0, ZEIGE_ZEILEN).map((z) => (
                      <li key={`${z.zeile}-${z.grund}`} className="border-l-2 border-line pl-3">
                        <p className="font-normal">
                          Zeile {z.zeile}: {z.grund}
                        </p>
                        <p className="mt-1 break-words text-xs text-ink-muted">{z.inhalt}</p>
                      </li>
                    ))}
                  </ul>
                  {nichtUebernommen.length > ZEIGE_ZEILEN && (
                    <p className="text-sm text-ink-muted">
                      … und {nichtUebernommen.length - ZEIGE_ZEILEN} weitere.
                    </p>
                  )}
                </section>
              )}

              {neu.length > 0 && (
                <section className="flex flex-col gap-2 border-t border-line pt-4">
                  <h3 className="flex flex-wrap items-center text-base font-semibold text-ink-deep">
                    Vorschau
                    <InfoHint about="Vorschau">
                      Die ersten fünf neuen Kunden, so wie sie angelegt würden. Stimmen Name, Adresse
                      und Telefon hier nicht, stimmen sie auch bei den übrigen nicht.
                    </InfoHint>
                  </h3>
                  <ul className="space-y-2 text-sm">
                    {neu.slice(0, 5).map(({ zeile, kunde }) => (
                      <li key={zeile}>
                        <span className="font-normal">{kunde.name}</span>
                        <span className="text-ink-muted">
                          {[kunde.address, kunde.contactName, kunde.contactPhone, kunde.email]
                            .filter(Boolean)
                            .map((x) => ` · ${x}`)
                            .join('')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="fuss-aktionen">
                <Button variant="ghost" onClick={verwerfen} disabled={busy}>
                  Verwerfen
                </Button>
                <Button onClick={() => void uebernehmen()} loading={busy} disabled={neu.length === 0}>
                  {neu.length === 1 ? '1 Kunden übernehmen' : `${neu.length} Kunden übernehmen`}
                </Button>
              </div>
            </>
          )}

          {/* Ohne Probelauf (nach einem Fehler oder der Übernahme): weiter mit einer Datei. */}
          {!probe && !busy && (
            <div className="fuss-aktionen">
              <Button variant="ghost" onClick={vorlage}>
                Vorlage herunterladen
              </Button>
              <Button variant="secondary" onClick={() => feld.current?.click()}>
                Andere Datei wählen
              </Button>
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
});

export default KundenImport;
