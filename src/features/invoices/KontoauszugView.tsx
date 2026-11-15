import { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import Hinweiszeile from '@/components/Hinweiszeile';
import ZahlFeld from '@/components/ZahlFeld';
import Metric, { MetricRow } from '@/components/Metric';
import { SelectField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { Zustand, type Stand } from '@/components/Badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { cent, euro } from '@/lib/betrag';
import { datumAT } from '@/lib/datum';
import { leseZahl, zahlAlsText } from '@/lib/zahl';
import { grundAus } from '@/lib/fehlerGrund';
import { praefixeVon } from '@/lib/praefixe';
import { listMahnungenZurRechnung, listUnpaidInvoiceKoepfe } from '@/lib/db/invoices';
import { listZahlungenImZeitraum } from '@/lib/db/zahlungen';
import {
  kontoauszugSchonVerbucht, kontoauszugVerbuchen, rechnungsKoepfeNachNummer, type VerbuchtErgebnis,
} from '@/lib/db/kontoauszug';
import { dekodiere } from '@/features/materials/datanorm';
import { AuszugUnlesbar, kontoauszugKennungen, kontoauszugLesen, type Kontoauszug } from './kontoauszugLesen';
import {
  abgleichen, nichtZugeordnet, nummernImText, zuordnungFehler,
  type AbgleichRechnung, type Stufe, type Teil, type Vorschlag,
} from './kontoauszugAbgleich';
import { letzteMahnforderung } from './mahnung';
import { zahlstand } from './zahlstand';

/**
 * KONTOAUSZUG ABGLEICHEN (Durchsicht 15.11.2026, F13).
 *
 * Datei der Bank wählen, ansehen, was Senklot zuordnet, korrigieren,
 * bestätigen — und in einem Zug verbuchen. Bis zum Bestätigen ist nichts
 * geschrieben, und die Datei verlässt das Gerät nie (`kontoauszugLesen.ts`).
 *
 * VORGEWÄHLT IST NUR, WAS ÜBER DIE RECHNUNGSNUMMER EINDEUTIG IST. Ein
 * Vorschlag nach Betrag oder Name steht unter „Bitte prüfen“ und wird erst
 * mit einem Häkchen verbucht. Nicht Zuordenbares bleibt sichtbar — von Hand
 * zuordnen oder liegen lassen; es wird nichts geraten.
 *
 * Nach dem Verbuchen wird neu abgeglichen: Verbuchtes steht dann unter
 * „Schon erfasst“, Abgewiesenes behält seinen Grund aus der Datenbank.
 */

type Geladen = {
  auszug: Kontoauszug;
  datei: string;
  rechnungen: AbgleichRechnung[];
  vorschlaege: Vorschlag[];
};

const GRUPPEN: { stufe: Stufe; titel: string; hint: string }[] = [
  { stufe: 'passt', titel: 'Zugeordnet', hint: 'Über die Rechnungsnummer im Verwendungszweck eindeutig — vorgewählt. Eine Zeile antippen zeigt die Aufteilung und lässt sie ändern.' },
  { stufe: 'pruefen', titel: 'Bitte prüfen', hint: 'Ein Vorschlag ohne Rechnungsnummer (nach Betrag und Name), eine Sammelüberweisung, deren Summe nicht passt, oder ein Eingang, der Guthaben würde. Verbucht wird erst mit Häkchen.' },
  { stufe: 'offen', titel: 'Ohne Zuordnung', hint: 'Keine Rechnungsnummer im Zweck und keine eindeutige offene Rechnung über den Betrag. Antippen, um von Hand zuzuordnen — oder liegen lassen.' },
  { stufe: 'erledigt', titel: 'Schon erfasst', hint: 'Diese Bewegung ist schon verbucht, oder auf der Rechnung steht ein Eingang mit gleichem Tag und Betrag. Wird nicht noch einmal verbucht.' },
];

const STAND: Record<Stufe, { stand: Stand; wort: string }> = {
  passt: { stand: 'gut', wort: 'zugeordnet' },
  pruefen: { stand: 'achtung', wort: 'prüfen' },
  offen: { stand: 'offen', wort: 'ohne Zuordnung' },
  erledigt: { stand: 'erledigt', wort: 'schon erfasst' },
};

const anzahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;

/** Woran ein Eingang auf dem Zahlungseingang später zu erkennen ist. */
function hinweisFuer(v: Vorschlag): string {
  return `Kontoauszug: ${[v.buchung.name, v.buchung.zweck].filter(Boolean).join(' — ')}`.slice(0, 300);
}

export default function KontoauszugView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const feld = useRef<HTMLInputElement>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [daten, setDaten] = useState<Geladen | null>(null);
  const [roh, setRoh] = useState<{ text: string; datei: string } | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [ergebnisse, setErgebnisse] = useState<Map<string, VerbuchtErgebnis>>(new Map());
  const [bearbeiten, setBearbeiten] = useState<Vorschlag | null>(null);
  const [fragen, setFragen] = useState(false);

  const praefix = praefixeVon(company).rechnung;

  async function abgleichLaden(text: string, datei: string) {
    if (!user) return;
    setLaedt(true);
    setFehler(null);
    try {
      const auszug = kontoauszugLesen(text);
      const kennungen = await kontoauszugKennungen(auszug.eingaenge);
      const nummern = [...new Set(auszug.eingaenge.flatMap((b) => nummernImText(`${b.zweck} ${b.name ?? ''}`, praefix)))];
      const [offen, genannt, erfasst, verbucht] = await Promise.all([
        listUnpaidInvoiceKoepfe(user.companyId),
        rechnungsKoepfeNachNummer(user.companyId, nummern),
        auszug.von && auszug.bis ? listZahlungenImZeitraum(user.companyId, auszug.von, auszug.bis) : Promise.resolve([]),
        kontoauszugSchonVerbucht(kennungen),
      ]);
      const alle = new Map<string, AbgleichRechnung>();
      for (const r of [...offen, ...genannt]) alle.set(r.id, r);
      // Was die letzte Mahnung an Spesen und Zinsen fordert — nur, wo gemahnt wurde.
      await Promise.all([...alle.values()].filter((r) => (r.mahnstufe ?? 0) > 0).map(async (r) => {
        const mahnungen = await listMahnungenZurRechnung(user.companyId, r.id);
        alle.set(r.id, { ...r, mahnforderung: letzteMahnforderung(mahnungen, r) });
      }));
      const rechnungen = [...alle.values()];
      const vorschlaege = abgleichen(
        auszug.eingaenge.map((buchung, i) => ({ buchung, kennung: kennungen[i] })),
        rechnungen,
        erfasst.map((z) => ({ invoiceId: z.invoiceId, datum: z.datum, betrag: z.betrag })),
        new Set(verbucht.keys()),
      );
      setDaten({ auszug, datei, rechnungen, vorschlaege });
      setAuswahl(new Set(vorschlaege.filter((v) => v.stufe === 'passt').map((v) => v.kennung)));
    } catch (e) {
      setDaten(null);
      setFehler(e instanceof AuszugUnlesbar ? e.message : grundAus(e, 'Der Abgleich ließ sich nicht vorbereiten.'));
    } finally {
      setLaedt(false);
    }
  }

  async function dateiLesen(f: File) {
    setErgebnisse(new Map());
    try {
      const { text } = dekodiere(await f.arrayBuffer());
      setRoh({ text, datei: f.name });
      await abgleichLaden(text, f.name);
    } finally {
      if (feld.current) feld.current.value = '';
    }
  }

  const rechnungNach = useMemo(() => new Map((daten?.rechnungen ?? []).map((r) => [r.id, r])), [daten]);
  const zuVerbuchen = (daten?.vorschlaege ?? []).filter((v) => auswahl.has(v.kennung) && v.stufe !== 'erledigt' && v.teile.length > 0);
  const summe = cent(zuVerbuchen.reduce((s, v) => s + v.teile.reduce((t, x) => t + x.betrag + x.mahnkosten, 0), 0));

  async function verbuchen() {
    if (!roh || zuVerbuchen.length === 0) return;
    const ergebnis = await kontoauszugVerbuchen(zuVerbuchen.map((v) => ({
      kennung: v.kennung,
      buchungstag: v.buchung.buchungstag,
      betrag: v.buchung.betrag,
      hinweis: hinweisFuer(v),
      teile: v.teile.map((t) => ({ rechnung: t.rechnungId, betrag: t.betrag, skonto: t.skonto, mahnkosten: t.mahnkosten })),
    })));
    const neu = new Map(ergebnis.map((e) => [e.kennung, e]));
    setErgebnisse(neu);
    const gebucht = ergebnis.filter((e) => e.ergebnis === 'gebucht').length;
    const abgewiesen = ergebnis.filter((e) => e.ergebnis === 'abgewiesen').length;
    if (abgewiesen > 0) toast.error(`${gebucht} verbucht, ${abgewiesen} abgewiesen — der Grund steht an der Zeile.`);
    else toast.success(gebucht === 1 ? '1 Eingang verbucht' : `${gebucht} Eingänge verbucht`);
    // Neu abgleichen: Verbuchtes steht danach unter „Schon erfasst“, offene Reste rechnen mit dem neuen Stand.
    await abgleichLaden(roh.text, roh.datei);
    // Abgewiesenes bleibt gewählt, damit es nach einer Korrektur gleich wieder mitgeht.
    setAuswahl((a) => new Set([...a].filter((k) => neu.get(k)?.ergebnis !== 'gebucht')));
  }

  function zuordnungSetzen(v: Vorschlag, teile: Teil[]) {
    setDaten((d) => d && {
      ...d,
      vorschlaege: d.vorschlaege.map((x) => x.kennung !== v.kennung ? x : teile.length === 0
        ? { ...x, stufe: 'offen', teile: [], grund: 'Von Hand ohne Zuordnung gelassen.', hinweise: [] }
        : { ...x, stufe: 'passt', teile, grund: 'Von Hand zugeordnet.', hinweise: [] }),
    });
    setAuswahl((a) => {
      const n = new Set(a);
      if (teile.length > 0) n.add(v.kennung);
      else n.delete(v.kennung);
      return n;
    });
    setBearbeiten(null);
  }

  if (!user) return null;
  const zaehle = (s: Stufe) => daten?.vorschlaege.filter((v) => v.stufe === s).length ?? 0;
  const auszug = daten?.auszug;
  const nicht = auszug?.nichtBetrachtet;

  return (
    <div className="space-y-6">
      <PageHeader
        zurueck={{ to: '/invoices', text: 'Zu den Rechnungen' }}
        title="Kontoauszug abgleichen"
        subtitle={daten ? daten.datei : 'Eingänge der Bank den offenen Rechnungen zuordnen'}
        hilfe={
          <>
            Den Auszug im Online-Banking als camt.053 (XML), MT940 oder CSV herunterladen und hier wählen. Die Datei bleibt
            auf diesem Gerät: gelesen und zugeordnet wird im Browser, gespeichert wird nur, was verbucht ist — der
            Zahlungseingang und eine Prüfsumme der Bewegung, damit dieselbe Datei nicht zweimal verbucht wird.
            Abbuchungen, vorgemerkte Umsätze und fremde Währungen werden genannt, aber nicht abgeglichen.
          </>
        }
        action={daten && zuVerbuchen.length > 0
          ? <Button onClick={() => setFragen(true)}>{zuVerbuchen.length === 1 ? '1 Eingang verbuchen' : `${zuVerbuchen.length} Eingänge verbuchen`}</Button>
          : <Button variant={daten ? 'secondary' : 'primary'} onClick={() => feld.current?.click()} loading={laedt}>Datei wählen</Button>}
        stand={daten ? (
          <MetricRow>
            <Metric label="Eingänge" value={daten.vorschlaege.length} />
            <Metric label="Zugeordnet" value={zaehle('passt')} />
            <Metric label="Bitte prüfen" value={zaehle('pruefen')} tone={zaehle('pruefen') > 0 ? 'warning' : 'default'} />
            <Metric label="Ohne Zuordnung" value={zaehle('offen')} />
          </MetricRow>
        ) : undefined}
      />

      <input
        ref={feld}
        id="kontoauszug-datei"
        type="file"
        accept=".xml,.csv,.txt,.sta,.mt940,.940,text/xml,application/xml,text/csv,text/plain"
        aria-label="Kontoauszug"
        tabIndex={-1}
        className="sr-only"
        disabled={laedt}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void dateiLesen(f);
        }}
      />

      {laedt && !daten && <Card><LoadingState label="Kontoauszug wird gelesen …" /></Card>}
      {fehler && <ErrorState message={fehler} onRetry={roh ? () => void abgleichLaden(roh.text, roh.datei) : undefined} />}

      {!daten && !laedt && !fehler && (
        <Card>
          <EmptyState action={<Button onClick={() => feld.current?.click()}>Datei wählen</Button>} aktionImDaumen>
            Noch keine Datei gewählt. Senklot liest camt.053, MT940 und CSV der österreichischen Banken und schlägt zu
            jedem Eingang die Rechnung vor — verbucht wird erst nach Ihrer Bestätigung.
          </EmptyState>
        </Card>
      )}

      {daten && auszug && nicht && (
        <Card title="Datei" action={<Button variant="ghost" onClick={() => feld.current?.click()} disabled={laedt}>Andere Datei wählen</Button>}>
          <dl className="space-y-1 text-sm">
            <div><dt className="inline text-ink-muted">Form: </dt><dd className="inline text-ink">{auszug.beschreibung}</dd></div>
            {auszug.konto && <div><dt className="inline text-ink-muted">Konto: </dt><dd className="inline font-mono text-ink">{auszug.konto}</dd></div>}
            {auszug.von && (
              <div>
                <dt className="inline text-ink-muted">Zeitraum der Eingänge: </dt>
                <dd className="inline text-ink">{auszug.von === auszug.bis ? datumAT(auszug.von) : `${datumAT(auszug.von)} – ${datumAT(auszug.bis)}`}</dd>
              </div>
            )}
          </dl>
          {(nicht.abbuchungen + nicht.vorgemerkt + nicht.rueckbuchungen + nicht.fremdwaehrung > 0) && (
            <p className="mt-2 text-sm text-ink-muted">
              Nicht abgeglichen: {[
                nicht.abbuchungen ? anzahl(nicht.abbuchungen, 'Abbuchung', 'Abbuchungen') : '',
                nicht.vorgemerkt ? anzahl(nicht.vorgemerkt, 'vorgemerkte Bewegung', 'vorgemerkte Bewegungen') : '',
                nicht.rueckbuchungen ? anzahl(nicht.rueckbuchungen, 'Rückbuchung', 'Rückbuchungen') : '',
                nicht.fremdwaehrung ? `${nicht.fremdwaehrung} in fremder Währung` : '',
              ].filter(Boolean).join(', ')}.
            </p>
          )}
          {auszug.unlesbar.length > 0 && (
            <Hinweiszeile stufe="warn">
              <p>
                {auszug.unlesbar.length === 1 ? 'Eine Zeile ließ sich nicht lesen' : `${auszug.unlesbar.length} Zeilen ließen sich nicht lesen`}:{' '}
                {auszug.unlesbar.slice(0, 10).map((u) => `Nr. ${u.stelle} (${u.grund})`).join(', ')}
                {auszug.unlesbar.length > 10 ? ' …' : ''}
              </p>
            </Hinweiszeile>
          )}
          {daten.vorschlaege.length === 0 && (
            <p className="mt-2 text-sm text-ink">In dieser Datei steht kein gebuchter Eingang in Euro.</p>
          )}
        </Card>
      )}

      {daten && GRUPPEN.map((g) => {
        const zeilen = daten.vorschlaege.filter((v) => v.stufe === g.stufe);
        if (zeilen.length === 0) return null;
        return (
          <Card key={g.stufe} title={`${g.titel} (${zeilen.length})`} hint={g.hint} buendig>
            <List>
              {zeilen.map((v) => (
                <VorschlagZeile
                  key={v.kennung}
                  v={v}
                  rechnungNach={rechnungNach}
                  gewaehlt={auswahl.has(v.kennung)}
                  ergebnis={ergebnisse.get(v.kennung)}
                  onWahl={(an) => setAuswahl((a) => {
                    const n = new Set(a);
                    if (an) n.add(v.kennung);
                    else n.delete(v.kennung);
                    return n;
                  })}
                  onOeffnen={() => setBearbeiten(v)}
                />
              ))}
            </List>
          </Card>
        );
      })}

      {bearbeiten && daten && (
        <ZuordnungBearbeiten
          v={bearbeiten}
          rechnungen={daten.rechnungen}
          onClose={() => setBearbeiten(null)}
          onUebernehmen={(teile) => zuordnungSetzen(bearbeiten, teile)}
        />
      )}

      <ConfirmDialog
        open={fragen}
        title={zuVerbuchen.length === 1 ? '1 Eingang verbuchen?' : `${zuVerbuchen.length} Eingänge verbuchen?`}
        message={`Zusammen ${euro(summe)} auf ${anzahl(new Set(zuVerbuchen.flatMap((v) => v.teile.map((t) => t.rechnungId))).size, 'Rechnung', 'Rechnungen')}, je mit dem Buchungstag der Bank. Ein Fehlgriff lässt sich im Zahlungsdialog der Rechnung löschen; dann lässt sich die Bewegung erneut einlesen.`}
        confirmLabel="Verbuchen"
        onCancel={() => setFragen(false)}
        onConfirm={async () => {
          await verbuchen();
          setFragen(false);
        }}
      />
    </div>
  );
}

function VorschlagZeile({
  v, rechnungNach, gewaehlt, ergebnis, onWahl, onOeffnen,
}: {
  v: Vorschlag;
  rechnungNach: Map<string, AbgleichRechnung>;
  gewaehlt: boolean;
  ergebnis?: VerbuchtErgebnis;
  onWahl: (an: boolean) => void;
  onOeffnen: () => void;
}) {
  const b = v.buchung;
  const rest = nichtZugeordnet(b, v.teile);
  const ziel = v.teile.map((t) => {
    const r = rechnungNach.get(t.rechnungId);
    const teile = [
      t.betrag > 0 ? euro(t.betrag) : '',
      t.skonto > 0 ? `Skonto ${euro(t.skonto)}` : '',
      t.mahnkosten > 0 ? `Mahnkosten ${euro(t.mahnkosten)}` : '',
    ].filter(Boolean).join(' + ');
    return `${r?.invoiceNumber ?? '?'} (${r?.customerName ?? ''}): ${teile}`;
  });
  const waehlbar = v.stufe !== 'erledigt' && v.teile.length > 0;
  const stand = ergebnis?.ergebnis === 'abgewiesen' && v.stufe !== 'erledigt'
    ? { stand: 'schlecht' as Stand, wort: 'abgewiesen' }
    : STAND[v.stufe];
  return (
    <ListRow
      gestapelt
      title={b.name || b.zweck.slice(0, 60) || 'Ohne Angabe'}
      nummer={datumAT(b.buchungstag)}
      onOeffnen={v.stufe === 'erledigt' ? undefined : onOeffnen}
      zustand={<Zustand stand={stand.stand}>{stand.wort}</Zustand>}
      wert={euro(b.betrag)}
      subtitle={
        <>
          {ziel.length > 0 && <span className="block text-ink">{ziel.join(' · ')}</span>}
          <span className="block">{v.grund}</span>
          {v.hinweise.map((h) => <span key={h} className="block">{h}</span>)}
          {v.teile.length > 0 && rest > 0 && <span className="block">{euro(rest)} ohne Zuordnung.</span>}
          {ergebnis?.ergebnis === 'abgewiesen' && v.stufe !== 'erledigt' && (
            <span className="block text-danger">Abgewiesen: {ergebnis.grund}</span>
          )}
          {b.zweck && b.name && <span className="block break-words">{b.zweck}</span>}
        </>
      }
    >
      {waehlbar && (
        <label className="flex min-h-touch items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="checkbox"
            checked={gewaehlt}
            onChange={(e) => onWahl(e.target.checked)}
            aria-label={`Eingang vom ${datumAT(b.buchungstag)} über ${euro(b.betrag)} verbuchen`}
          />
          verbuchen
        </label>
      )}
    </ListRow>
  );
}

type TeilText = { rechnungId: string; betrag: string; skonto: string; mahnkosten: string };

function ZuordnungBearbeiten({
  v, rechnungen, onClose, onUebernehmen,
}: {
  v: Vorschlag;
  rechnungen: AbgleichRechnung[];
  onClose: () => void;
  onUebernehmen: (teile: Teil[]) => void;
}) {
  const b = v.buchung;
  const alsText = (t: Teil): TeilText => ({
    rechnungId: t.rechnungId,
    betrag: t.betrag ? zahlAlsText(t.betrag) : '',
    skonto: t.skonto ? zahlAlsText(t.skonto) : '',
    mahnkosten: t.mahnkosten ? zahlAlsText(t.mahnkosten) : '',
  });
  const [teile, setTeile] = useState<TeilText[]>(() => (v.teile.length > 0 ? v.teile.map(alsText) : [{ rechnungId: '', betrag: zahlAlsText(b.betrag), skonto: '', mahnkosten: '' }]));
  // Auswählbar: offene Rechnungen, dazu die schon vorgeschlagenen — die jüngsten zuerst.
  const auswahl = useMemo(() => rechnungen
    .filter((r) => (r.paymentStatus !== 'Storniert' && zahlstand(r).rest > 0) || teile.some((t) => t.rechnungId === r.id))
    .sort((x, y) => y.invoiceDate.localeCompare(x.invoiceDate) || y.invoiceNumber.localeCompare(x.invoiceNumber)),
  [rechnungen, teile]);
  const nach = new Map(rechnungen.map((r) => [r.id, r]));
  const gelesen: Teil[] = teile.map((t) => ({
    rechnungId: t.rechnungId,
    betrag: leseZahl(t.betrag || '0').wert ?? NaN,
    skonto: leseZahl(t.skonto || '0').wert ?? NaN,
    mahnkosten: leseZahl(t.mahnkosten || '0').wert ?? NaN,
  }));
  const unlesbar = gelesen.some((t) => [t.betrag, t.skonto, t.mahnkosten].some((n) => !Number.isFinite(n)));
  const fehler = unlesbar ? 'Bitte die Beträge als Zahl angeben.' : zuordnungFehler(b, gelesen.map((t) => ({
    ...t, betrag: cent(t.betrag), skonto: cent(t.skonto), mahnkosten: cent(t.mahnkosten),
  })));
  const rest = unlesbar ? null : nichtZugeordnet(b, gelesen);
  const setze = (i: number, f: Partial<TeilText>) => setTeile((ts) => ts.map((t, j) => (j === i ? { ...t, ...f } : t)));

  return (
    <BottomSheet open onClose={onClose} label="Zuordnung" auchBreit titel="Zuordnung" stempel={euro(b.betrag)}>
      <div className="formular space-y-4">
        <dl className="space-y-1 text-sm">
          <div><dt className="inline text-ink-muted">Buchungstag: </dt><dd className="inline text-ink">{datumAT(b.buchungstag)}</dd></div>
          {b.name && <div><dt className="inline text-ink-muted">Auftraggeber: </dt><dd className="inline text-ink">{b.name}</dd></div>}
          {b.iban && <div><dt className="inline text-ink-muted">IBAN: </dt><dd className="inline font-mono text-ink">{b.iban}</dd></div>}
          <div><dt className="inline text-ink-muted">Zweck: </dt><dd className="inline break-words text-ink">{b.zweck || '–'}</dd></div>
        </dl>
        <p className="text-sm text-ink-muted">{v.grund}</p>

        {teile.map((t, i) => {
          const r = nach.get(t.rechnungId);
          const offen = r ? zahlstand(r).rest : 0;
          return (
            <fieldset key={i} className="space-y-3 border-t border-line pt-3">
              <legend className="sr-only">{`Teil ${i + 1}`}</legend>
              <SelectField
                id={`zuordnung-rechnung-${i}`}
                label="Rechnung"
                value={t.rechnungId}
                onChange={(e) => setze(i, { rechnungId: e.target.value })}
              >
                <option value="">Bitte wählen</option>
                {auswahl.map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${x.invoiceNumber} · ${x.customerName} · ${x.paymentStatus === 'Storniert' ? 'storniert' : `offen ${euro(zahlstand(x).rest)}`}`}
                  </option>
                ))}
              </SelectField>
              {r && (
                <p className="text-sm text-ink-muted">
                  {`Offen ${euro(offen)}`}
                  {r.skontoProzent && r.skontoBis ? ` · Skonto ${r.skontoProzent} % bis ${datumAT(r.skontoBis)}` : ''}
                  {(r.mahnforderung ?? 0) > 0 ? ` · letzte Mahnung fordert ${euro(r.mahnforderung!)} Spesen und Zinsen` : ''}
                </p>
              )}
              <ZahlFeld id={`zuordnung-betrag-${i}`} label="Auf die Rechnung (€)" value={t.betrag} onChange={(x) => setze(i, { betrag: x })} />
              {(r?.skontoProzent || t.skonto) && (
                <ZahlFeld id={`zuordnung-skonto-${i}`} label="Skonto (€)" value={t.skonto} onChange={(x) => setze(i, { skonto: x })} />
              )}
              {((r?.mahnforderung ?? 0) > 0 || t.mahnkosten) && (
                <ZahlFeld id={`zuordnung-mahnkosten-${i}`} label="Mahnspesen und Zinsen (€)" value={t.mahnkosten} onChange={(x) => setze(i, { mahnkosten: x })} />
              )}
              {teile.length > 1 && (
                <Button variant="ghost" onClick={() => setTeile((ts) => ts.filter((_, j) => j !== i))}>Diesen Teil entfernen</Button>
              )}
            </fieldset>
          );
        })}

        <Button variant="secondary" onClick={() => setTeile((ts) => [...ts, { rechnungId: '', betrag: rest && rest > 0 ? zahlAlsText(rest) : '', skonto: '', mahnkosten: '' }])}>
          Weitere Rechnung
        </Button>

        {rest !== null && rest > 0 && <p className="text-sm text-ink-muted">{euro(rest)} bleiben ohne Zuordnung.</p>}
        {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}

        <div className="fuss-aktionen">
          <Button variant="ghost" onClick={() => onUebernehmen([])}>Ohne Zuordnung lassen</Button>
          <Button
            disabled={!!fehler}
            onClick={() => onUebernehmen(gelesen.map((t) => ({ ...t, betrag: cent(t.betrag), skonto: cent(t.skonto), mahnkosten: cent(t.mahnkosten) })))}
          >
            Übernehmen
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
