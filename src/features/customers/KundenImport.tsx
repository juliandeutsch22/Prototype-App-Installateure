import { useMemo, useRef, useState } from 'react';
import { kundenEinspielen, kundenVorhanden } from '@/lib/db/customers';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Aktionsleiste from '@/components/Aktionsleiste';
import Metric, { MetricRow } from '@/components/Metric';
import { Marke } from '@/components/Badge';
import { ErrorState } from '@/components/States';
import Grenzliste from '@/components/Grenzliste';
import { List, ListRow } from '@/components/ListRow';
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
 */

/** Wie viele nicht übernommene Zeilen die Ansicht zeigt. */
const ZEIGE_ZEILEN = 50;

const FELDNAME: Record<string, string> = {
  firma: 'Name (Firma)', name: 'Name', vorname: 'Name (Vorname)', nachname: 'Name (Nachname)',
  ansprechpartner: 'Ansprechpartner', adresse: 'Rechnungsadresse', strasse: 'Adresse (Straße)',
  hausnummer: 'Adresse (Hausnummer)', plz: 'Adresse (PLZ)', ort: 'Adresse (Ort)', land: 'Adresse (Land)',
  telefon: 'Telefon', email: 'E-Mail', uid: 'UID-Nummer', notiz: 'Notiz', kundennummer: 'Notiz (Kundennummer)',
};

export default function KundenImport({ onUebernommen }: { onUebernommen: () => void }) {
  const toast = useToast();
  const [datei, setDatei] = useState<string | null>(null);
  const [probe, setProbe] = useState<KundenProbelauf | null>(null);
  const [vorhanden, setVorhanden] = useState<Set<number>>(new Set());
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ergebnis, setErgebnis] = useState<{ angelegt: number; uebersprungen: number } | null>(null);
  const feld = useRef<HTMLInputElement>(null);

  const neu = useMemo(
    () => (probe ? probe.kunden.filter((_, i) => !vorhanden.has(i)) : []),
    [probe, vorhanden],
  );
  const schonDa = useMemo(
    () => (probe ? probe.kunden.filter((_, i) => vorhanden.has(i)) : []),
    [probe, vorhanden],
  );

  async function lesen(f: File) {
    setFehler(null);
    setErgebnis(null);
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

  function verwerfen() {
    setProbe(null);
    setDatei(null);
    setFehler(null);
  }

  function vorlage() {
    // Mit BOM: sonst liest Excel die Umlaute der Vorlage als Windows-1252.
    const url = URL.createObjectURL(new Blob(['\uFEFF', VORLAGE], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kunden-vorlage.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!probe) {
    return (
      <Card
        title="Kunden aus einer Datei"
        hint={
          <>
            Für den Umstieg: eine CSV-Datei aus dem bisherigen Programm oder aus Excel („Speichern
            unter" → „CSV (Trennzeichen-getrennt)"). Die erste Zeile nennt die Spalten; erkannt
            werden etwa Firma, Vorname, Nachname, Straße, PLZ, Ort, Telefon, E-Mail, UID und Notiz.
            Eingelesen wird die Datei <strong>zuerst nur angesehen</strong> — übernommen wird erst
            auf Bestätigung, und Kunden, die es schon gibt, werden nicht doppelt angelegt.
          </>
        }
      >
        <div className="space-y-3">
          {fehler && <ErrorState message={fehler} />}
          {ergebnis && (
            <p className="text-sm text-ink" role="status">
              Übernommen: {ergebnis.angelegt} angelegt
              {ergebnis.uebersprungen > 0 && `, ${ergebnis.uebersprungen} schon vorhanden`}.
            </p>
          )}
          <div className="feld-block">
            <label htmlFor="kunden-datei" className="feld-name">
              CSV-Datei
            </label>
            <input
              ref={feld}
              id="kunden-datei"
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void lesen(f);
              }}
              className="feld-datei"
            />
          </div>
          <button type="button" onClick={vorlage} className="textlink-allein">
            Vorlage herunterladen
          </button>
        </div>
      </Card>
    );
  }

  const nichtUebernommen = [
    ...probe.fehler,
    ...schonDa.map((k) => ({ zeile: k.zeile, grund: 'Gibt es schon als Kunden', inhalt: k.kunde.name })),
  ].sort((a, b) => a.zeile - b.zeile);

  return (
    /* Eine eigene Hülle statt eines Fragments: die Aktionsleiste klebt an
       ihrem Behälter — ohne Hülle wäre das die ganze Kundenseite, und die
       Leiste stünde am Telefon über der Kundenliste. */
    <div className="space-y-6">
      {/* Die Zahlen in ihrer eigenen Karte über dem Probelauf — keine Karte
          in der Karte (docs/design/linie.md, 2). */}
      <MetricRow>
        <Metric label="Neu" value={neu.length} />
        <Metric label="Schon vorhanden" value={schonDa.length} />
        <Metric
          label="Fehlerhaft"
          value={probe.fehler.length}
          tone={probe.fehler.length > 0 ? 'warning' : 'default'}
        />
      </MetricRow>
      <Card
        title="Probelauf"
        action={<Marke>{datei}</Marke>}
        hint="Noch ist nichts geschrieben. Stehen unten falsche Umlaute, war die Datei in einem anderen Zeichensatz gespeichert — dann in Excel als „CSV UTF-8“ speichern und neu einlesen."
      >
        <p className="text-sm text-ink-muted">
          Übernommen wird: {probe.erkannt.map((e) => `${e.spalte} → ${FELDNAME[e.feld]}`).join(', ')}.
          {probe.ignoriert.length > 0 && <> Nicht übernommen: {probe.ignoriert.join(', ')}.</>}
        </p>
      </Card>

      {nichtUebernommen.length > 0 && (
        <Card title="Nicht übernommen" anzahl={nichtUebernommen.length}>
          <Grenzliste
            eintraege={nichtUebernommen}
            grenze={ZEIGE_ZEILEN}
            zeile={(z) => (
              <ListRow
                key={`${z.zeile}-${z.grund}`}
                title={`Zeile ${z.zeile}: ${z.grund}`}
                // Eine Rohzeile aus der Datei hat oft keine Leerstelle, an der
                // sie umbrechen könnte — ohne Umbruch im Wort liefe sie aus der Karte.
                subtitle={<span className="break-words">{z.inhalt}</span>}
              />
            )}
          />
        </Card>
      )}

      {neu.length > 0 && (
        <Card
          title="Vorschau"
          hint="Die ersten fünf neuen Kunden, so wie sie angelegt würden. Stimmen Name, Adresse und Telefon hier nicht, stimmen sie auch bei den übrigen nicht."
        >
          <List>
            {neu.slice(0, 5).map(({ zeile, kunde }) => (
              <ListRow
                key={zeile}
                title={kunde.name}
                subtitle={[kunde.address, kunde.contactName, kunde.contactPhone, kunde.email]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
          </List>
        </Card>
      )}

      {fehler && <ErrorState message={fehler} />}
      {/* Die Knöpfe in der Aktionsleiste wie beim Katalog-Import
          (docs/design/linie.md, 6): am Telefon unten fest, darüber die Summe
          aus dem Probelauf. */}
      <Aktionsleiste
        summe={{
          name: 'Aus der Datei',
          wert: `${neu.length} neu · ${schonDa.length} schon vorhanden`,
        }}
      >
        <Button onClick={() => void uebernehmen()} loading={busy} disabled={neu.length === 0}>
          {neu.length === 1 ? '1 Kunden übernehmen' : `${neu.length} Kunden übernehmen`}
        </Button>
        <Button variant="ghost" onClick={verwerfen} disabled={busy}>
          Verwerfen
        </Button>
      </Aktionsleiste>
    </div>
  );
}
