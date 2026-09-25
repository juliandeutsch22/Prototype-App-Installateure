import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import * as dn from '@/lib/db/pg/datanorm';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Aktionsleiste from '@/components/Aktionsleiste';
import Metric, { MetricRow } from '@/components/Metric';
import { InputField, SelectField } from '@/components/Field';
import InfoHint from '@/components/InfoHint';
import { Marke, Warnung } from '@/components/Badge';
import { ErrorState } from '@/components/States';
import Grenzliste from '@/components/Grenzliste';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import {
  befunde,
  dekodiere,
  layoutWarnung,
  liesDatanorm,
  type DatanormErgebnis,
} from './datanorm';
import { datumAusMs } from '@/lib/datum';

/**
 * Den Artikelkatalog des Grosshändlers einspielen — erst ansehen, dann
 * übernehmen.
 *
 * DER PROBELAUF IST DER EIGENTLICHE INHALT DIESER SEITE. Eine
 * DATANORM-Datei bringt Zehntausende Artikel mit; was davon richtig gelesen
 * wurde, sieht man nicht, indem man es einspielt und hinterher nachschaut.
 * Also: lesen, ZEIGEN, was dabei herauskam, und erst auf einen zweiten Klick
 * schreiben. Bis dahin ist nichts in der Datenbank.
 *
 * ES GIBT DREI SCHRITTE UND IMMER NUR EINEN AUF DEM SCHIRM. Die Seite hätte
 * sonst drei Formulare übereinander, von denen zwei nicht dran sind — und
 * genau so entsteht der Eindruck, eine Software sei kompliziert. Die langen
 * Erklärungen stehen hinter „i", nicht im Fluss.
 */

type Schritt = 'datei' | 'probelauf' | 'fertig';

/** Wie viele nicht verstandene Zeilen die Ansicht zeigt. */
const ZEIGE_ZEILEN = 50;

const eur = (n: number) =>
  n.toLocaleString('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 4 });

export default function KatalogImport() {
  const { user } = useAuth();
  const toast = useToast();
  const betrieb = user?.companyId ?? '';

  const [schritt, setSchritt] = useState<Schritt>('datei');
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [lieferanten, setLieferanten] = useState<WithId<dn.Lieferant>[]>([]);
  const [lieferant, setLieferant] = useState('');
  const [neuerName, setNeuerName] = useState('');

  const [datei, setDatei] = useState<{ name: string; zeichensatz: string } | null>(null);
  const [ergebnis, setErgebnis] = useState<DatanormErgebnis | null>(null);
  const [saetze, setSaetze] = useState<Record<string, string>>({});
  const [fortschritt, setFortschritt] = useState<number | null>(null);
  const [bericht, setBericht] = useState<dn.UebernahmeBericht | null>(null);
  const [laeufe, setLaeufe] = useState<WithId<dn.Lauf>[]>([]);
  const dateiFeld = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!betrieb) return;
    dn.lieferanten(betrieb)
      .then((l) => {
        setLieferanten(l);
        if (l.length === 1) setLieferant(l[0].id);
      })
      .catch((e: Error) => setFehler(e.message));
    dn.laeufe(betrieb, 10).then(setLaeufe).catch(() => undefined);
  }, [betrieb]);

  const zahlen = useMemo(() => (ergebnis ? befunde(ergebnis) : null), [ergebnis]);
  const warnung = useMemo(() => (ergebnis ? layoutWarnung(ergebnis) : undefined), [ergebnis]);

  /**
   * Die Rabattgruppen, die in dieser Datei mit einem LISTENpreis vorkommen.
   *
   * Nur für die ist ein Satz nötig: ein Nettopreis ist schon der
   * Einkaufspreis. Die Anzahl steht daneben, damit erkennbar ist, welche
   * Gruppe sich zu füllen lohnt und welche zwei Artikel betrifft.
   */
  const gruppen = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of ergebnis?.artikel ?? []) {
      if (a.preisArt !== 'liste' || a.preis === undefined) continue;
      const g = a.rabattgruppe ?? '';
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [ergebnis]);

  const offeneGruppen = gruppen.filter(([g]) => (saetze[g] ?? '').trim() === '').length;

  async function lieferantWaehlen(): Promise<string> {
    if (lieferant) return lieferant;
    const name = neuerName.trim();
    if (!name) throw new Error('Bitte einen Lieferanten wählen oder anlegen.');
    const id = await dn.lieferantAnlegen(betrieb, name);
    setLieferanten(await dn.lieferanten(betrieb));
    setLieferant(id);
    setNeuerName('');
    return id;
  }

  async function dateiLesen(f: File) {
    setFehler(null);
    setBusy(true);
    try {
      /*
        ERST LESEN, DANN DEN LIEFERANTEN ANLEGEN. Andersherum bliebe nach
        einer unlesbaren Datei ein Lieferant stehen, den niemand bestellt hat
        — und beim zweiten Versuch stünde er doppelt da.
      */
      const roh = dekodiere(await f.arrayBuffer());
      const e = liesDatanorm(roh.text);
      const wer = await lieferantWaehlen();
      setDatei({ name: f.name, zeichensatz: roh.zeichensatz });
      setErgebnis(e);

      // Die schon hinterlegten Sätze in die Felder — sonst tippt der Betrieb
      // bei jedem Katalog dieselben Zahlen neu.
      const vorhanden = await dn.rabattsaetze(betrieb, wer);
      setSaetze(Object.fromEntries(vorhanden.map((r) => [r.gruppe, String(r.prozent)])));
      setSchritt('probelauf');
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBusy(false);
      if (dateiFeld.current) dateiFeld.current.value = '';
    }
  }

  async function uebernehmen() {
    if (!ergebnis || !datei) return;
    setFehler(null);
    setBusy(true);
    try {
      // Erst die Rabattsätze, dann der Lauf: die Übernahme liest sie, und
      // was hier nicht steht, lässt den Einkaufspreis leer.
      for (const [gruppe, wert] of Object.entries(saetze)) {
        const zahl = Number(wert.replace(',', '.'));
        if (wert.trim() === '' || !Number.isFinite(zahl)) continue;
        await dn.rabattsatzSetzen(betrieb, lieferant, gruppe, zahl);
      }

      const lauf = await dn.laufAnlegen(betrieb, lieferant, datei.name, datei.zeichensatz, {
        ...befunde(ergebnis),
        artikel: ergebnis.artikel.length,
      });
      setFortschritt(0);
      await dn.zeilenSchicken(betrieb, lauf, ergebnis.artikel, setFortschritt);
      setFortschritt(null);
      setBericht(await dn.uebernehmen(lauf));
      setLaeufe(await dn.laeufe(betrieb, 10));
      setSchritt('fertig');
      toast.success('Katalog übernommen');
    } catch (e) {
      setFehler((e as Error).message);
      setFortschritt(null);
    } finally {
      setBusy(false);
    }
  }

  function zurueck() {
    setErgebnis(null);
    setDatei(null);
    setBericht(null);
    setFehler(null);
    setSchritt('datei');
  }

  if (schritt === 'fertig' && bericht) {
    return (
      <div className="space-y-6">
        <Card title="Übernommen">
          <MetricRow>
            <Metric label="Neu angelegt" value={bericht.angelegt} />
            <Metric label="Aktualisiert" value={bericht.geaendert} />
            <Metric label="Ausgelaufen" value={bericht.ausgelaufen} />
            <Metric
              label="Ohne Einkaufspreis"
              value={bericht.ohneRabattsatz}
              tone={bericht.ohneRabattsatz > 0 ? 'warning' : 'default'}
            />
          </MetricRow>
          {bericht.ohneRabattsatz > 0 && (
            <p className="mt-4 text-sm text-ink-muted">
              {bericht.ohneRabattsatz} Artikel stehen mit Listenpreis im Katalog, aber ohne
              Einkaufspreis — zu ihrer Rabattgruppe ist kein Satz hinterlegt. Die Nachkalkulation
              führt sie weiter als Lücke.
            </p>
          )}
          <div className="mt-4">
            <Button onClick={zurueck}>Weiteren Katalog einspielen</Button>
          </div>
        </Card>
        <Protokoll laeufe={laeufe} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {fehler && <ErrorState message={fehler} />}

      {schritt === 'datei' && (
        <Card
          title="Katalog einspielen"
          hint={
            <>
              DATANORM ist das Austauschformat, in dem Grosshändler ihre Preislisten liefern —
              meist als Datei mit der Endung <code>.001</code>. Eingelesen wird sie hier{' '}
              <strong>zuerst nur angesehen</strong>: du bekommst einen Bericht darüber, was
              erkannt wurde und was nicht, und entscheidest danach, ob übernommen wird. Bis dahin
              ändert sich am Katalog nichts.
            </>
          }
        >
          <div className="space-y-4">
            {lieferanten.length > 0 && (
              <SelectField
                id="dn-lieferant"
                label="Lieferant"
                value={lieferant}
                onChange={(e) => setLieferant(e.target.value)}
              >
                <option value="">Neuen Lieferanten anlegen …</option>
                {lieferanten.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </SelectField>
            )}
            {lieferant === '' && (
              <div className="flex flex-wrap items-end gap-x-2">
                <div className="grow">
                  <InputField
                    id="dn-neu"
                    label="Name des Lieferanten"
                    placeholder="z. B. HTI Grosshandel"
                    value={neuerName}
                    onChange={(e) => setNeuerName(e.target.value)}
                    pflicht
                  />
                </div>
                <InfoHint about="den Lieferanten">
                  Der Preis eines Artikels gehört zum Lieferanten, nicht zum Artikel: derselbe
                  Kugelhahn kostet bei zwei Grosshändlern zwei verschiedene Beträge. Deshalb
                  gehört jeder Katalog zu genau einem Lieferanten.
                </InfoHint>
              </div>
            )}

            <div className="feld-block">
              <label htmlFor="dn-datei" className="feld-name">
                DATANORM-Datei
              </label>
              <input
                ref={dateiFeld}
                id="dn-datei"
                type="file"
                accept=".001,.002,.003,.dat,.txt,text/plain"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void dateiLesen(f);
                }}
                className="feld-datei"
              />
            </div>
          </div>
        </Card>
      )}

      {schritt === 'probelauf' && ergebnis && zahlen && datei && (
        <>
          {/* Die Zahlen stehen in ihrer eigenen Karte ÜBER dem Probelauf —
              die Kennzahlen-Leiste ist selbst eine Karte, und eine Karte
              in der Karte gibt es nach der Linie nicht. */}
          <MetricRow>
            <Metric label="Artikel erkannt" value={zahlen.artikel} />
            <Metric
              label="Ohne Preis"
              value={zahlen.ohnePreis}
              tone={zahlen.ohnePreis > 0 ? 'warning' : 'default'}
            />
            <Metric label="Nur Listenpreis" value={zahlen.nurListenpreis} />
            <Metric
              label="Nicht verstanden"
              value={zahlen.unverstanden}
              tone={zahlen.unverstanden > 0 ? 'warning' : 'default'}
            />
          </MetricRow>
          <Card
            title="Probelauf"
            action={<Marke>{datei.name}</Marke>}
            hint={
              <>
                Noch ist nichts geschrieben. Gelesen wurde die Datei als{' '}
                <strong>{datei.zeichensatz}</strong> — stehen in den Bezeichnungen unten falsche
                Umlaute, liegt es daran. „Nur Listenpreis" heisst: der Preis in der Datei ist der
                Preis <em>vor</em> dem ausgehandelten Rabatt; ohne hinterlegten Rabattsatz
                entsteht daraus kein Einkaufspreis.
              </>
            }
          >
            <p className="text-sm text-ink-muted">
              {zahlen.neu} neu · {zahlen.aenderungen} Änderungen · {zahlen.loeschungen}{' '}
              Löschsätze
              {zahlen.uebersprungen > 0 && <> · {zahlen.uebersprungen} andere Satzarten</>}
            </p>
          </Card>

          {warnung && (
            <Card title="Die Felder stehen anders als erwartet">
              <p className="text-sm">{warnung}</p>
              <p className="mt-3 text-sm text-ink-muted">
                Die Zeilen unten zeigen, woran es liegt. Schick deinem Grosshändler die
                Rückmeldung, welche DATANORM-Fassung er liefert.
              </p>
            </Card>
          )}

          {gruppen.length > 0 && !warnung && (
            <Card
              title={`Rabattsätze (${gruppen.length})`}
              action={
                offeneGruppen > 0 ? <Warnung>{offeneGruppen} offen</Warnung> : <Marke>vollständig</Marke>
              }
              hint={
                <>
                  Die Datei liefert die Rabatt<em>gruppe</em>, nicht den Satz — wie hoch dein Rabatt
                  ist, hast du mit deinem Grosshändler ausgehandelt, und das steht in keiner Norm.
                  Was du hier einträgst, bleibt gespeichert und gilt auch für den nächsten Katalog.
                  Eine Gruppe ohne Satz ist kein Fehler: die Artikel kommen in den Katalog, nur
                  eben ohne Einkaufspreis.
                </>
              }
            >
              <div className="space-y-3">
                {gruppen.map(([gruppe, anzahl]) => (
                  <div key={gruppe} className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[8rem] grow">
                      <InputField
                        id={`dn-satz-${gruppe || 'ohne'}`}
                        label={`${gruppe === '' ? 'Ohne Gruppe' : `Gruppe ${gruppe}`} (${anzahl} Artikel)`}
                        type="number"
                        min="0"
                        max="99.999"
                        step="0.1"
                        placeholder="Rabatt in % — leer = kein Einkaufspreis"
                        value={saetze[gruppe] ?? ''}
                        onChange={(e) => setSaetze({ ...saetze, [gruppe]: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {ergebnis.unverstanden.length > 0 && (
            <Card
              title={`Nicht verstandene Zeilen (${ergebnis.unverstanden.length})`}
              hint={
                <>
                  Diese Zeilen werden <strong>nicht</strong> übernommen. Die Originalzeile steht
                  neben dem Grund, damit erkennbar ist, ob es an der Datei liegt oder daran, dass
                  dein Grosshändler die Norm anders auslegt.
                </>
              }
            >
              <Grenzliste
                eintraege={ergebnis.unverstanden}
                grenze={ZEIGE_ZEILEN}
                zeile={(z) => (
                  <ListRow
                    key={z.zeile}
                    title={`Zeile ${z.zeile}: ${z.grund}`}
                    // Die Originalzeile Zeichen für Zeichen: Festbreitenschrift, und
                    // umbrochen wird überall — sie hat oft keine einzige Leerstelle.
                    subtitle={<span className="break-all font-mono">{z.inhalt}</span>}
                  />
                )}
              />
            </Card>
          )}

          {ergebnis.artikel.length > 0 && !warnung && (
            <Card
              title="Vorschau"
              hint="Die ersten fünf Artikel, so wie sie in den Katalog gingen. Stimmen Bezeichnung, Einheit und Preis hier nicht, stimmen sie auch bei den übrigen nicht."
            >
              <List>
                {ergebnis.artikel.slice(0, 5).map((a) => (
                  <ListRow
                    key={`${a.zeile}-${a.artikelnummer}`}
                    title={a.name || '(ohne Bezeichnung)'}
                    subtitle={
                      <>
                        Art.-Nr. {a.artikelnummer}
                        {a.einheit && ` · ${a.einheit}`}
                        {a.preis !== undefined &&
                          ` · ${eur(a.preis)} (${a.preisArt === 'liste' ? 'Liste' : a.preisArt === 'netto' ? 'netto' : 'Preisart unbekannt'})`}
                      </>
                    }
                  />
                ))}
              </List>
            </Card>
          )}

          {/* Die Knöpfe in der Aktionsleiste (docs/design/linie.md, 6): am
              Telefon unten fest, darüber die Summe aus dem Probelauf. */}
          <Aktionsleiste
            summe={{
              name: 'Aus der Datei',
              wert: `${zahlen.neu} neu · ${zahlen.aenderungen} geändert`,
            }}
          >
            <Button
              onClick={() => void uebernehmen()}
              loading={busy}
              disabled={!!warnung || zahlen.artikel === 0}
            >
              {fortschritt === null
                ? `${zahlen.artikel} Artikel übernehmen`
                : `${fortschritt} von ${zahlen.artikel} übertragen …`}
            </Button>
            <Button variant="ghost" onClick={zurueck} disabled={busy}>
              Verwerfen
            </Button>
          </Aktionsleiste>
        </>
      )}

      <Protokoll laeufe={laeufe} />
    </div>
  );
}

/**
 * Wer wann welchen Katalog eingespielt hat.
 *
 * Die Frage dahinter ist „seit wann steht bei dem Artikel dieser Preis" — und
 * die stellt sich erst, wenn eine Rechnung nicht stimmt. Dann ist es zu spät,
 * sie erst zu beantworten.
 */
function Protokoll({ laeufe }: { laeufe: WithId<dn.Lauf>[] }) {
  if (laeufe.length === 0) return null;
  return (
    <Card title="Bisher eingespielt">
      <List>
        {laeufe.map((l) => {
          const u = (l.bericht as { uebernahme?: dn.UebernahmeBericht } | null)?.uebernahme;
          return (
            <ListRow
              key={l.id}
              title={l.dateiname ?? 'ohne Dateiname'}
              subtitle={
                <>
                  {datumAusMs(l.createdAt)}
                  {l.status === 'uebernommen' && u
                    ? ` · ${u.angelegt} neu, ${u.geaendert} aktualisiert`
                    : l.status === 'verworfen'
                      ? ' · verworfen'
                      : ' · nicht abgeschlossen'}
                </>
              }
            />
          );
        })}
      </List>
    </Card>
  );
}
