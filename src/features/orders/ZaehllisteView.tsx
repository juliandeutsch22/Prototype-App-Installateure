import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  inventurArtikelHinzufuegen,
  inventurBuchen,
  inventurLaden,
  inventurVerwerfen,
  inventurVorschau,
  inventurZaehlen,
  type InventurVorschau,
  type ZaehllisteVoll,
  type ZaehllistenZeile,
} from '@/lib/db/inventur';
import { useKatalogSuche } from './useKatalogSuche';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import RowMenu from '@/components/RowMenu';
import ConfirmDialog from '@/components/ConfirmDialog';
import Hinweiszeile from '@/components/Hinweiszeile';
import Metric, { MetricRow } from '@/components/Metric';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { Listenleiste, Segmente } from '@/components/LotBausteine';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { leseZahl, zahlAlsText } from '@/lib/zahl';
import { fmtMenge } from '@/lib/belegLayout';
import { datumAusMs } from '@/lib/datum';
import { downloadCsv } from '@/features/accounting/export';
import {
  abweichungText,
  ergebnisText,
  fortschritt,
  inventurDateiname,
  protokollCsv,
  vorgabeGrund,
  zaehlzeitText,
  zeilenFiltern,
  type ZaehlFilter,
} from './inventur';

type Stand = { zustand: 'laedt' } | { zustand: 'fehler'; text: string } | { zustand: 'bereit'; liste: ZaehllisteVoll };

const ZURUECK = { to: '/lager?reiter=inventur', text: 'Zur Inventur' };
const uhrzeit = (ms: number) => new Date(ms).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
const heuteIso = () => new Date().toLocaleDateString('sv-SE');

/**
 * EINE ZÄHLLISTE (Durchsicht 15.11.2026, F14) — zählen, Abweichungen prüfen
 * und in einem Zug buchen; nach dem Buchen das Protokoll.
 *
 * GEZÄHLT WIRD ZEILE FÜR ZEILE, AM HANDY: tippen, Zahl eintragen, „Weiter“
 * springt zur nächsten Zeile. Jede Zahl ist sofort gespeichert — mehrere
 * Geräte zählen zugleich, und ein abgerissenes Netz kostet höchstens die
 * eine Zeile, die es dann sagt. Die Zahl im System steht beim Zählen nicht
 * da (wer sie sieht, zählt die erwartete); sie erscheint erst beim Prüfen.
 */
export default function ZaehllisteView() {
  const { id = '' } = useParams<{ id: string }>();
  const { user, company } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [stand, setStand] = useState<Stand>({ zustand: 'laedt' });
  const [versuch, setVersuch] = useState(0);
  const [filter, setFilter] = useState<ZaehlFilter>('offen');
  const [suche, setSuche] = useState('');
  const [pruefen, setPruefen] = useState(false);
  const [hinzufuegen, setHinzufuegen] = useState(false);
  const [verwerfen, setVerwerfen] = useState(false);

  useEffect(() => {
    let weg = false;
    inventurLaden(id)
      .then((l) => !weg && setStand({ zustand: 'bereit', liste: l }))
      .catch((e) => !weg && setStand({ zustand: 'fehler', text: grundAus(e, 'Die Zählliste konnte nicht geladen werden.') }));
    return () => {
      weg = true;
    };
  }, [id, versuch]);

  /*
    ZÄHLEN MEHRERE ZUGLEICH, sieht jeder die Zahlen der anderen: beim
    Zurückkommen auf die Seite und alle 30 Sekunden kommt der Stand neu.
    Das Feld, in dem gerade getippt wird, bleibt davon unberührt
    (`ZaehlZeile`); was gebucht wird, sichert ohnehin der Stand der Vorschau.
  */
  const offen = stand.zustand === 'bereit' && stand.liste.zustand === 'offen';
  useEffect(() => {
    if (!offen) return;
    const neu = () => setVersuch((n) => n + 1);
    const takt = window.setInterval(neu, 30_000);
    window.addEventListener('focus', neu);
    return () => {
      window.clearInterval(takt);
      window.removeEventListener('focus', neu);
    };
  }, [offen]);

  if (!user) return null;
  if (stand.zustand !== 'bereit') {
    return (
      <div className="space-y-3 lg:space-y-5">
        <PageHeader title="Zählliste" zurueck={ZURUECK} />
        {stand.zustand === 'laedt' ? <Card><SkeletonList rows={4} /></Card>
          : <ErrorState message={stand.text} onRetry={() => setVersuch((n) => n + 1)} />}
      </div>
    );
  }

  const liste = stand.liste;
  const neuLaden = () => setVersuch((n) => n + 1);
  const zeileAendern = (zeile: string, neu: Partial<ZaehllistenZeile>) =>
    setStand((s) => (s.zustand !== 'bereit' ? s : {
      zustand: 'bereit',
      liste: { ...s.liste, zeilen: s.liste.zeilen.map((z) => (z.id === zeile ? { ...z, ...neu } : z)) },
    }));
  const untertitel = <span>{[liste.ortName, liste.bezeichnung].filter(Boolean).join(' · ')}</span>;

  async function pdf(art: 'zaehlliste' | 'protokoll') {
    if (!company) return;
    try {
      const { buildInventurPdf } = await import('./inventurPdf');
      const doc = await buildInventurPdf({ company, liste, art });
      doc.save(inventurDateiname(art === 'protokoll' ? 'Inventurprotokoll' : 'Zaehlliste', liste.ortName, heuteIso(), 'pdf'));
    } catch (e) {
      toast.error(grundAus(e, 'Das PDF konnte nicht erzeugt werden.'));
    }
  }

  if (liste.zustand === 'gebucht') {
    const zaehl = (e: ZaehllistenZeile['ergebnis']) => liste.zeilen.filter((z) => z.ergebnis === e).length;
    const abweichend = liste.zeilen.filter((z) => z.ergebnis === 'gebucht' && z.abweichung).length;
    return (
      <div className="space-y-3 lg:space-y-5">
        <PageHeader
          title="Inventurprotokoll"
          zurueck={ZURUECK}
          subtitle={untertitel}
          hilfe="Das Protokoll einer gebuchten Zählliste: je Artikel der Bestand im System zum Zeitpunkt der Zählung (Soll), was gezählt wurde, die gebuchte Abweichung und der Bestand danach. Jede Buchung steht auch im Bewegungsprotokoll des Artikels."
          stand={
            <MetricRow>
              <Metric label="Gebucht" value={zaehl('gebucht')} hint={`${abweichend} mit Abweichung`} />
              <Metric label="Überholt" value={zaehl('ueberholt')} />
              <Metric label="Nicht gezählt" value={zaehl('nicht_gezaehlt')} />
            </MetricRow>
          }
          mehr={
            <RowMenu
              about="Inventurprotokoll"
              items={[
                { label: 'Protokoll als PDF', onSelect: () => void pdf('protokoll') },
                {
                  label: 'Protokoll als CSV',
                  onSelect: () => downloadCsv(protokollCsv(liste), inventurDateiname('Inventurprotokoll', liste.ortName, heuteIso(), 'csv')),
                },
              ]}
            />
          }
        />
        <Card
          title={`Gebucht ${datumAusMs(liste.gebuchtAm)}${liste.gebuchtVonName ? ` von ${liste.gebuchtVonName}` : ''}`}
          buendig
        >
          <p className="px-4 pb-2 text-sm text-ink-muted">
            Gezählt {zaehlzeitText(liste.stichtag)}{liste.grund ? ` · Grund: ${liste.grund}` : ''}
          </p>
          <List>
            {liste.zeilen.map((z) => (
              <ListRow
                key={z.id}
                title={z.name}
                subtitle={[
                  z.artikelnummer,
                  z.soll != null ? `Soll ${fmtMenge(z.soll)}` : null,
                  z.gezaehlt != null ? `gezählt ${fmtMenge(z.gezaehlt)}${z.gezaehltVonName ? ` von ${z.gezaehltVonName}` : ''}` : null,
                  z.bestandNachher != null ? `danach ${fmtMenge(z.bestandNachher)} ${z.einheit}` : null,
                  z.grund,
                ].filter(Boolean).join(' · ')}
                wert={z.ergebnis === 'gebucht' ? abweichungText(z.abweichung, z.einheit) : undefined}
                zustand={ergebnisText(z)}
              />
            ))}
          </List>
        </Card>
      </div>
    );
  }

  const { gezaehlt, gesamt } = fortschritt(liste.zeilen);
  const gezeigt = zeilenFiltern(liste.zeilen, filter, suche);
  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        title="Zählliste"
        zurueck={ZURUECK}
        subtitle={untertitel}
        hilfe="Tippen Sie eine Zeile an und tragen Sie ein, was gezählt wurde — die Zahl ist sofort gespeichert, „Weiter“ springt zur nächsten Zeile. Ein leeres Feld nimmt die Zählung zurück. Die Zahl im System erscheint erst unter „Abweichungen buchen“. Was am Ort liegt, aber fehlt, ergänzt „Artikel hinzufügen“."
        action={<Button onClick={() => setPruefen(true)} disabled={gezaehlt === 0}>Abweichungen buchen</Button>}
        stand={
          <MetricRow>
            <Metric label="Gezählt" value={`${gezaehlt} von ${gesamt}`} />
            <Metric label="Verglichen" value={liste.stichtag ? datumAusMs(liste.stichtag) : 'beim Zählen'} hint={liste.stichtag ? `Stichtag, ${uhrzeit(liste.stichtag)} Uhr` : 'je Artikel'} />
          </MetricRow>
        }
        mehr={
          <RowMenu
            about="Zählliste"
            items={[
              { label: 'Artikel hinzufügen …', onSelect: () => setHinzufuegen(true) },
              { label: 'Zählliste als PDF', onSelect: () => void pdf('zaehlliste') },
              { label: 'Zählliste verwerfen …', onSelect: () => setVerwerfen(true) },
            ]}
          />
        }
      />
      <div className="anf-leiste">
        <Listenleiste
          reiter={
            <Segmente
              name="Zeilen"
              werte={[
                { wert: 'offen' as ZaehlFilter, text: 'Offen', anzahl: gesamt - gezaehlt },
                { wert: 'gezaehlt' as ZaehlFilter, text: 'Gezählt', anzahl: gezaehlt },
                { wert: 'alle' as ZaehlFilter, text: 'Alle', anzahl: gesamt },
              ]}
              wert={filter}
              onChange={setFilter}
            />
          }
          suche={{ id: 'zaehlliste-suche', wert: suche, onChange: setSuche, platzhalter: 'Artikel, Nummer, Warengruppe' }}
        />
      </div>
      <Card buendig>
        {gezeigt.length === 0 ? (
          <EmptyState>{filter === 'offen' && !suche ? 'Alles gezählt — jetzt die Abweichungen buchen.' : 'Keine Zeile passt.'}</EmptyState>
        ) : (
          <ul className="zaehl-liste" aria-label="Zählliste">
            {gezeigt.map((z) => (
              <ZaehlZeile key={z.id} zeile={z} onGespeichert={(neu) => zeileAendern(z.id, neu)} />
            ))}
          </ul>
        )}
      </Card>

      {pruefen && (
        <AbweichungenBuchen
          liste={liste}
          onAbbrechen={() => setPruefen(false)}
          onGebucht={(text) => {
            setPruefen(false);
            toast.success(text);
            neuLaden();
          }}
          onNeuLaden={neuLaden}
        />
      )}
      {hinzufuegen && (
        <ArtikelHinzufuegen
          liste={liste}
          onAbbrechen={() => setHinzufuegen(false)}
          onFertig={(name) => {
            setHinzufuegen(false);
            toast.success(`${name} steht jetzt auf der Liste.`);
            setFilter('offen');
            setSuche(name);
            neuLaden();
          }}
        />
      )}
      <ConfirmDialog
        open={verwerfen}
        title="Zählliste verwerfen?"
        message={gezaehlt > 0
          ? `Gebucht ist noch nichts. Die ${gezaehlt} eingetragenen Zählungen gehen verloren; der Bestand bleibt, wie er ist.`
          : 'Gebucht ist noch nichts; der Bestand bleibt, wie er ist.'}
        confirmLabel="Verwerfen"
        confirmTone="danger"
        onCancel={() => setVerwerfen(false)}
        onConfirm={async () => {
          await inventurVerwerfen(liste.id);
          toast.success('Zählliste verworfen');
          navigate(ZURUECK.to);
        }}
      />
    </div>
  );
}

/**
 * EINE ZEILE ZUM ZÄHLEN. Die ganze Zeile ist die Beschriftung des Felds —
 * ein Tipp irgendwo darauf setzt den Cursor. Gespeichert wird beim
 * Verlassen des Felds und mit „Weiter“ (Eingabetaste), das zur nächsten
 * Zeile springt.
 */
function ZaehlZeile({ zeile, onGespeichert }: { zeile: ZaehllistenZeile; onGespeichert: (neu: Partial<ZaehllistenZeile>) => void }) {
  const [text, setText] = useState(zeile.gezaehlt == null ? '' : zahlAlsText(zeile.gezaehlt));
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const feld = useRef<HTMLInputElement>(null);
  const kennung = `zaehlen-${zeile.id}`;

  // Kommt ein neuer Stand von außen (neu geladen), folgt das Feld — außer man tippt gerade darin.
  useEffect(() => {
    if (document.activeElement !== feld.current) setText(zeile.gezaehlt == null ? '' : zahlAlsText(zeile.gezaehlt));
  }, [zeile.gezaehlt]);

  async function speichern() {
    const leer = text.trim() === '';
    const gelesen = leer ? null : leseZahl(text);
    if (gelesen?.fehler) {
      setFehler(gelesen.fehler);
      return;
    }
    const menge = gelesen ? gelesen.wert : null;
    if (menge === zeile.gezaehlt) {
      setFehler(null);
      return;
    }
    setSpeichert(true);
    try {
      const neu = await inventurZaehlen(zeile.id, menge);
      setFehler(null);
      onGespeichert(neu);
    } catch (e) {
      setFehler(grundAus(e, 'Nicht gespeichert — bitte noch einmal.'));
    } finally {
      setSpeichert(false);
    }
  }

  const meta = fehler ?? [
    zeile.artikelnummer,
    zeile.warengruppe,
    speichert ? 'wird gespeichert …'
      : zeile.gezaehltAm ? `gezählt ${uhrzeit(zeile.gezaehltAm)}${zeile.gezaehltVonName ? ` von ${zeile.gezaehltVonName}` : ''}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <li>
      <label className="zaehl-zeile" htmlFor={kennung} data-gezaehlt={zeile.gezaehlt != null ? '' : undefined}>
        <span className="zaehl-zeile-text">
          <span className="zaehl-zeile-name">{zeile.name}</span>
          {meta && <span className={fehler ? 'zaehl-zeile-fehler' : 'zaehl-zeile-meta'} role={fehler ? 'alert' : undefined}>{meta}</span>}
        </span>
        <span className="zaehl-zeile-menge">
          <input
            ref={feld}
            id={kennung}
            className="zaehl-zeile-feld"
            type="text"
            inputMode="decimal"
            enterKeyHint="next"
            autoComplete="off"
            aria-label={`${zeile.name}: gezählt in ${zeile.einheit}`}
            aria-invalid={fehler ? true : undefined}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => void speichern()}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              // Weiter zur nächsten Zeile — das Verlassen speichert.
              const alle = [...document.querySelectorAll<HTMLInputElement>('.zaehl-zeile-feld')];
              const naechste = alle[alle.indexOf(e.currentTarget) + 1];
              if (naechste) naechste.focus();
              else e.currentTarget.blur();
            }}
          />
          <span className="zaehl-zeile-einheit">{zeile.einheit}</span>
        </span>
      </label>
    </li>
  );
}

/**
 * ABWEICHUNGEN PRÜFEN UND BUCHEN. Die Datenbank rechnet je Zeile das Soll
 * zum Zeitpunkt der Zählung; gezeigt werden die Abweichungen mit dem
 * Bestand danach, die überholten und die Konflikte. Gebucht wird mit einem
 * Grund für alle — und, wo nötig, einem eigenen je Zeile.
 */
function AbweichungenBuchen({
  liste,
  onAbbrechen,
  onGebucht,
  onNeuLaden,
}: {
  liste: ZaehllisteVoll;
  onAbbrechen: () => void;
  onGebucht: (text: string) => void;
  onNeuLaden: () => void;
}) {
  const [vorschau, setVorschau] = useState<InventurVorschau | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [veraltet, setVeraltet] = useState(false);
  const [grund, setGrund] = useState(() => vorgabeGrund(liste.ortName, liste.stichtag, Date.now()));
  const [gruende, setGruende] = useState<Record<string, string>>({});

  useEffect(() => {
    let weg = false;
    inventurVorschau(liste.id)
      .then((v) => !weg && setVorschau(v))
      .catch((e) => !weg && setFehler(grundAus(e, 'Die Abweichungen konnten nicht berechnet werden.')));
    return () => {
      weg = true;
    };
  }, [liste.id]);

  const z = vorschau?.zeilen ?? [];
  const gezaehlt = z.filter((x) => x.gezaehlt != null);
  const abweichend = gezaehlt.filter((x) => !x.ueberholt && x.abweichung !== 0);
  const stimmt = gezaehlt.filter((x) => !x.ueberholt && x.abweichung === 0).length;
  const ueberholt = gezaehlt.filter((x) => x.ueberholt);
  const konflikte = gezaehlt.filter((x) => x.konflikt);
  const offen = z.length - gezaehlt.length;
  const zuFrueh = vorschau?.stichtag != null && vorschau.stichtag > Date.now();

  async function buchen() {
    if (!vorschau) return;
    if (!grund.trim()) throw new Error('Ohne Grund keine Korrektur — etwa „Inventur 31.12.“.');
    const eigene = Object.fromEntries(Object.entries(gruende).filter(([, g]) => g.trim()));
    const r = await inventurBuchen(liste.id, grund.trim(), eigene, vorschau.stand);
    if (r.art === 'veraltet') {
      // Inzwischen hat jemand gezählt oder korrigiert: nichts gebucht, die neue Vorschau steht da.
      setVorschau(r.vorschau);
      setVeraltet(true);
      onNeuLaden();
      return;
    }
    onGebucht(r.abweichend === 0
      ? `Inventur gebucht — ${r.gebucht} ${r.gebucht === 1 ? 'Artikel' : 'Artikel'} gezählt, alles stimmt.`
      : `Inventur gebucht — ${r.abweichend} ${r.abweichend === 1 ? 'Abweichung' : 'Abweichungen'} im Bewegungsprotokoll.`);
  }

  return (
    <ConfirmDialog
      open
      title="Abweichungen buchen"
      message="Verglichen wird mit dem Bestand zum Zeitpunkt der Zählung; was danach hinein- oder hinausging, bleibt erhalten. Jede Abweichung wird eine Bewegung „Inventur“ mit Grund — auch was stimmt, steht im Protokoll."
      confirmLabel="Buchen"
      confirmTone="primary"
      gesperrt={!vorschau || gezaehlt.length === 0 || konflikte.length > 0 || zuFrueh}
      onConfirm={buchen}
      onCancel={onAbbrechen}
    >
      {fehler ? (
        <Hinweiszeile stufe="fehl" role="alert"><p>{fehler}</p></Hinweiszeile>
      ) : !vorschau ? (
        <SkeletonList rows={3} />
      ) : (
        <div className="space-y-4">
          {veraltet && (
            <Hinweiszeile stufe="warn" role="status">
              <p>Inzwischen wurde gezählt oder korrigiert — es wurde nichts gebucht. Die Abweichungen zeigen jetzt den neuen Stand.</p>
            </Hinweiszeile>
          )}
          <p className="text-sm text-ink">
            {gezaehlt.length} gezählt: {abweichend.length} mit Abweichung, {stimmt} stimmen
            {ueberholt.length > 0 ? `, ${ueberholt.length} überholt (danach einzeln inventiert — die spätere Zählung gilt)` : ''}.
            {offen > 0 ? ` ${offen} nicht gezählt — ihr Bestand bleibt, wie er ist.` : ''}
          </p>
          {zuFrueh && (
            <Hinweiszeile stufe="warn"><p>Gezählt wird zum Stichtag {zaehlzeitText(vorschau.stichtag)} — gebucht werden kann erst danach.</p></Hinweiszeile>
          )}
          {konflikte.length > 0 && (
            <Hinweiszeile stufe="warn">
              {konflikte.map((k) => <p key={k.zeile}><strong>{k.name}:</strong> {k.konflikt}</p>)}
            </Hinweiszeile>
          )}
          <InputField id="inventur-grund-alle" label="Grund" pflicht maxLength={300} value={grund} onChange={(e) => setGrund(e.target.value)} />
          {abweichend.length > 0 && (
            <ul className="space-y-3" aria-label="Abweichungen">
              {abweichend.map((a) => (
                <li key={a.zeile} className="space-y-1">
                  <p className="text-sm text-ink">
                    <strong>{a.name}</strong> · Soll {fmtMenge(a.soll ?? 0)}, gezählt {fmtMenge(a.gezaehlt ?? 0)} →{' '}
                    {abweichungText(a.abweichung, a.einheit)} · danach {fmtMenge(a.danach)} {a.einheit}
                  </p>
                  <InputField
                    id={`inventur-grund-${a.zeile}`}
                    label={`Grund für ${a.name} (optional)`}
                    maxLength={300}
                    placeholder={grund || 'wie oben'}
                    value={gruende[a.zeile] ?? ''}
                    onChange={(e) => setGruende((g) => ({ ...g, [a.zeile]: e.target.value }))}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ConfirmDialog>
  );
}

/** Einen Artikel ergänzen, der am Ort liegt, aber nicht auf der Liste steht. */
function ArtikelHinzufuegen({
  liste,
  onAbbrechen,
  onFertig,
}: {
  liste: ZaehllisteVoll;
  onAbbrechen: () => void;
  onFertig: (name: string) => void;
}) {
  const { user } = useAuth();
  const [begriff, setBegriff] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const keine = useMemo(() => [], []);
  const { treffer, laeuft } = useKatalogSuche(user?.companyId, begriff, keine);
  const schon = useMemo(() => new Set(liste.zeilen.map((z) => z.materialId)), [liste.zeilen]);
  // Im Hauptlager liegt nur, was als Lagerartikel geführt wird — die Datenbank weist anderes ab.
  const passend = treffer.filter((m) => !schon.has(m.id) && (!liste.imHauptlager || m.lagerartikel));

  async function waehlen(materialId: string, name: string) {
    setFehler(null);
    try {
      await inventurArtikelHinzufuegen(liste.id, materialId);
      onFertig(name);
    } catch (e) {
      setFehler(grundAus(e, 'Der Artikel konnte nicht hinzugefügt werden.'));
    }
  }

  return (
    <ConfirmDialog open title="Artikel hinzufügen" nurSchliessen onConfirm={onAbbrechen} onCancel={onAbbrechen}
      message={liste.imHauptlager
        ? 'Was im Regal liegt, aber nicht auf der Liste steht. Im Hauptlager stehen nur Lagerartikel zur Wahl.'
        : 'Was am Ort liegt, aber nicht auf der Liste steht.'}
    >
      <div className="space-y-3">
        <InputField id="inventur-artikel-suche" label="Artikel suchen" type="search" value={begriff} onChange={(e) => setBegriff(e.target.value)} placeholder="Name oder Artikelnummer" autoComplete="off" />
        {fehler && <Hinweiszeile stufe="fehl" role="alert"><p>{fehler}</p></Hinweiszeile>}
        {begriff.trim() && (
          passend.length === 0 ? (
            <p className="text-sm text-ink-muted">{laeuft ? 'Sucht …' : 'Kein passender Artikel, der nicht schon auf der Liste steht.'}</p>
          ) : (
            <List>
              {passend.slice(0, 20).map((m) => (
                <ListRow key={m.id} title={m.name} subtitle={m.articleNumber || undefined} onOeffnen={() => void waehlen(m.id, m.name)} />
              ))}
            </List>
          )
        )}
      </div>
    </ConfirmDialog>
  );
}
