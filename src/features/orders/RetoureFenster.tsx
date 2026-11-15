import { useEffect, useState } from 'react';
import { katalogNachIds, sucheKatalog } from '@/lib/db/materials';
import { gefundenUeberText, type MitNummer } from '@/lib/katalogTreffer';
import { createReturn, createReturnInOrt, retoureRahmen, type RetoureRahmen } from '@/lib/db/materialOrders';
import Hinweiszeile from '@/components/Hinweiszeile';
import { fmtMenge } from '@/lib/belegLayout';
import { useAuth } from '@/app/AuthContext';
import { canProcessOrders } from '@/lib/permissions';
import { useLagerorte } from './useLagerorte';
import { eigeneFahrzeugOrte, HAUPTLAGER, ortNameVon, weitereOrte } from './lagerorte';
import { OrtWahl } from './LagerDialoge';
import type { WithId } from '@/lib/db/core';
import type { Material } from '@/types';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import BaustellenSelect from '@/components/BaustellenSelect';
import InfoHint from '@/components/InfoHint';
import ZahlFeld from '@/components/ZahlFeld';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { zahlAlsText, zahlOder } from '@/lib/zahl';
import { mengeFehler } from '@/lib/einheit';

type Zustand = 'neu' | 'gebraucht' | 'defekt';

/**
 * MATERIAL ZURÜCKGEBEN — EIN FORMULAR FÜR ZWEI WEGE (20.10.2026, Auftrag
 * „Retoure zu dezent“). Der Monteur gibt unter „Material anfordern“ zurück,
 * was von der Baustelle übrig ist; das Lager erfasst unter „Anforderungen ›
 * Retouren“, was ihm jemand hereinbringt — es beurteilt am Regal, ob etwas
 * wirklich neu und originalverpackt ist, und davon hängt die Gutschrift ab.
 * Zwei Formulare liefen früher oder später auseinander; deshalb eines.
 *
 * Gutgeschrieben wird nur „neu“ — die Regel steht in `retoure_anlegen`.
 *
 * ANNAHME UND HÖCHSTMENGE (M7, 16.11.2026): Meldet der Monteur „neu“ ins
 * Lager, schreibt erst die Annahme im Lager gut — vorher stieg der Bestand
 * sofort und unbegrenzt. Mit Baustelle geht höchstens zurück, was für sie
 * ausgegeben wurde; das Formular sagt es vorher und auch, wenn die Ware
 * schon verrechnet ist (dann braucht der Kunde eine Gutschrift).
 *
 * AUS DER ANFORDERUNG (V11, 16.11.2026): „Zurückgeben“ an einer abgeholten
 * Anforderung öffnet dieses Formular mit Artikel, Baustelle, Menge und —
 * im Lager — der Person vorbelegt. Frei getippte Ware (ohne Katalogartikel)
 * lässt sich jetzt ebenso zurückgeben; sie wird erfasst und mindert den
 * Rechnungsvorschlag, gutgeschrieben wird ohne Katalogartikel nichts.
 */
export interface RetoureVorbelegt {
  materialId: string | null;
  materialName: string;
  einheit?: string | null;
  menge: number;
  baustelle: string;
  /** Wer zurückbringt — im Lager vorgewählt (der Besteller). */
  userId?: string;
}

export default function RetoureFenster({
  offen,
  onClose,
  companyId,
  user,
  baustelle = '',
  personen,
  personenFehler = null,
  vorbelegt = null,
}: {
  offen: boolean;
  onClose: () => void;
  companyId: string;
  user: { uid: string; name: string };
  /** Vorbelegte Baustelle — etwa aus der Rüstliste eines Einsatzes. */
  baustelle?: string;
  /**
   * Erfasst das Lager für jemand anderen: die Belegschaft zur Auswahl
   * „Zurückgebracht von“. Ohne sie gilt die Retoure für den, der erfasst.
   */
  personen?: { uid: string; name: string }[];
  /** Kam die Belegschaft nicht, steht es im Fenster — erfasst wird dann nicht. */
  personenFehler?: string | null;
  /** Aus einer Anforderung (V11): alles vorbelegt. */
  vorbelegt?: RetoureVorbelegt | null;
}) {
  const toast = useToast();
  /** Das gewählte Material — der Datensatz selbst; die Suche liefert ihn vom Server. */
  const [gewaehlt, setGewaehlt] = useState<WithId<Material> | null>(null);
  /** Frei getippt (V11): kein Katalogartikel — erfasst, nicht gutgeschrieben. */
  const istFrei = !!gewaehlt && !gewaehlt.id;
  const [suche, setSuche] = useState('');
  const [menge, setMenge] = useState('1');
  const [zustand, setZustand] = useState<Zustand>('neu');
  const [projekt, setProjekt] = useState(baustelle);
  const [grund, setGrund] = useState('');
  /*
    WER ZURÜCKGEBRACHT HAT (A4, 24.10.2026) — beim Lager eine Pflichtwahl,
    nicht der Erfassende als Vorgabe: sonst stünde die Retoure wieder still
    auf dem Namen des Lagers, wie vorher.
  */
  const [von, setVon] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  /*
    DIE KENNUNG DES BELEGS, EINMAL JE GEÖFFNETEM FORMULAR. Riss nach dem
    Senden das Netz ab, schickte ein zweiter Tipp früher einen neuen Beleg —
    zweite Zeile, zweite Gutschrift. Mit derselben Kennung bucht die
    Datenbank (`retoure_anlegen`) nichts noch einmal. Neu wird sie erst beim
    nächsten Öffnen und nach einer erfassten Retoure.
  */
  const [kennung, setKennung] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (offen) setKennung(crypto.randomUUID());
  }, [offen]);
  /*
    WOHIN „NEU“ ZURÜCKGEHT (M04a): ins Hauptlager wie bisher, oder an einen
    weiteren Ort — der Monteur in sein eigenes Fahrzeug (Restmaterial bleibt
    im Bus), das Lager an jeden Ort. Dieselbe Grenze zieht `retoure_anlegen`.
  */
  const { user: angemeldet } = useAuth();
  const lo = useLagerorte();
  const zielorte = !angemeldet
    ? []
    : canProcessOrders(angemeldet.role)
      ? weitereOrte(lo.orte)
      : eigeneFahrzeugOrte(lo.orte, lo.fahrzeuge, angemeldet.uid);
  const [ziel, setZiel] = useState(HAUPTLAGER);

  /*
    WAS HÖCHSTENS ZURÜCK KANN (M7) — sobald Baustelle und Material feststehen.
    Kommt die Antwort nicht, steht nichts da; die Datenbank prüft beim
    Erfassen ohnehin selbst.
  */
  const [rahmen, setRahmen] = useState<RetoureRahmen | null>(null);
  const rahmenName = gewaehlt?.name ?? '';
  const rahmenId = gewaehlt?.id || null;
  useEffect(() => {
    setRahmen(null);
    if (!offen || !projekt.trim() || !rahmenName.trim()) return;
    let weg = false;
    const t = setTimeout(() => {
      Promise.resolve()
        .then(() => retoureRahmen(projekt, rahmenId, rahmenName))
        .then((r) => { if (!weg) setRahmen(r); })
        .catch(() => { if (!weg) setRahmen(null); });
    }, 250);
    return () => {
      weg = true;
      clearTimeout(t);
    };
  }, [offen, projekt, rahmenId, rahmenName]);
  /*
    WARTET AUF DIE ANNAHME (M7) — dieselbe Regel wie `retoure_anlegen`:
    „neu“ mit Katalogartikel, erfasst nicht vom Lager und nicht ins eigene
    Fahrzeug.
  */
  const lagerErfasst = !!angemeldet && canProcessOrders(angemeldet.role);
  const insEigene = !lagerErfasst && zielorte.some((o) => o.id === ziel);
  const wartet = zustand === 'neu' && !!gewaehlt && !istFrei && !lagerErfasst && !insEigene;

  // Wer das Fenster mit einer anderen Baustelle öffnet, will sie vorbelegt sehen.
  useEffect(() => {
    if (offen) setProjekt(vorbelegt ? vorbelegt.baustelle : baustelle);
  }, [offen, baustelle, vorbelegt]);
  // Aus einer Anforderung (V11): Artikel, Menge und Person dazu.
  useEffect(() => {
    if (!offen || !vorbelegt) return;
    setGewaehlt({
      id: vorbelegt.materialId ?? '', companyId, name: vorbelegt.materialName, unit: vorbelegt.einheit ?? '',
    } as WithId<Material>);
    setMenge(zahlAlsText(vorbelegt.menge));
    setSuche('');
    if (vorbelegt.userId) setVon(vorbelegt.userId);
    // Der ganze Datensatz — für Einheit (Mengenprüfung), Kategorie und Nummer.
    if (!vorbelegt.materialId) return;
    let weg = false;
    Promise.resolve()
      .then(() => katalogNachIds(companyId, [vorbelegt.materialId!]))
      .then((liste) => {
        const m = liste[0];
        if (!weg && m) setGewaehlt((g) => (g && g.id === m.id ? m : g));
      })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [offen, vorbelegt, companyId]);


  /**
   * DIE ARTIKELAUSWAHL IST EINE SUCHE, KEIN AUSWAHLFELD.
   *
   * Ein Auswahlfeld ist bei zwanzig Artikeln bequem und bei zweihundert
   * unbrauchbar: auf dem Telefon wird daraus eine Rolliste, durch die man
   * blind scrollt, ohne tippen zu können. Gesucht wird über dieselben drei
   * Felder wie im Katalog — Bezeichnung, Kategorie, Artikelnummer.
   */
  const [treffer, setTreffer] = useState<MitNummer<WithId<Material>>[]>([]);
  useEffect(() => {
    const q = suche.trim();
    if (!q) {
      setTreffer([]);
      return;
    }
    // Auf dem Server — sonst fände die Retoure nur, was gerade geladen ist.
    let weg = false;
    const t = setTimeout(() => {
      sucheKatalog(companyId, q, 8)
        .then((rows) => { if (!weg) setTreffer(rows); })
        .catch(() => { if (!weg) setTreffer([]); });
    }, 250);
    return () => {
      weg = true;
      clearTimeout(t);
    };
  }, [companyId, suche]);

  function schliessen() {
    setFehler(null);
    onClose();
  }

  const person = personen ? personen.find((p) => p.uid === von) : user;

  async function erfassen() {
    if (!gewaehlt || !person) return;
    // Ohne diese Prüfung ginge eine negative Menge durch, und eine Retoure
    // würde den Lagerbestand VERRINGERN. Zentral gelesen (M15).
    const qty = zahlOder(menge, NaN, { negativ: true });
    // Je Einheit (M27): Rohr in Metern mit Komma, Stück ganz.
    // Ohne Katalogartikel kennt niemand die Einheit — dann nur: größer als null.
    const falsch = istFrei
      ? (!(qty > 0) ? 'Die Menge muss größer als null sein.' : null)
      : mengeFehler(qty, gewaehlt.unit);
    if (falsch) {
      setFehler(falsch);
      return;
    }
    if (rahmen && qty > rahmen.hoechstens) {
      setFehler(`Für diese Baustelle können höchstens ${fmtMenge(rahmen.hoechstens)} zurückkommen. Stammt die Ware von woanders, ohne Baustelle erfassen.`);
      return;
    }
    setSpeichert(true);
    setFehler(null);
    try {
      const beleg = {
        materialId: gewaehlt.id || null,
        materialName: gewaehlt.name,
        quantity: qty,
        condition: zustand,
        note: grund,
        projectNumber: projekt,
        userId: person.uid,
        userName: person.name,
      };
      // Ins Hauptlager derselbe Aufruf wie bisher; ein Ort nur bei „neu“ — nur das wird gutgeschrieben.
      const zielOrt = zustand === 'neu' && zielorte.some((o) => o.id === ziel) ? ziel : HAUPTLAGER;
      if (zielOrt) await createReturnInOrt(companyId, beleg, zielOrt, kennung);
      else await createReturn(companyId, beleg, kennung);
      setKennung(crypto.randomUUID());
      setGewaehlt(null);
      setVon('');
      setSuche('');
      setMenge('1');
      setGrund('');
      onClose();
      toast.success(
        wartet
          ? 'Retoure gemeldet — gutgeschrieben wird, sobald das Lager sie annimmt'
          : zustand === 'neu' && !istFrei
            ? zielorte.some((o) => o.id === ziel)
              ? `Retoure erfasst — gutgeschrieben: ${ortNameVon(lo.orte, ziel)}`
              : 'Retoure erfasst — Material wurde dem Lager gutgeschrieben'
            : 'Retoure erfasst',
      );
      setZiel(HAUPTLAGER);
    } catch (err) {
      setFehler(grundAus(err, 'Die Retoure konnte nicht erfasst werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <BottomSheet open={offen} onClose={schliessen} label="Material zurückgeben" auchBreit titel="Material zurückgeben">
      <div className="formular space-y-4">
        <p className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
          {lagerErfasst ? 'Nur Neues wird dem Lager gutgeschrieben.' : 'Nur Neues wird gutgeschrieben — ins Lager, sobald es dort angenommen ist.'}
          <InfoHint about="die Retoure">
            Nur unbenutztes Material in Originalverpackung wird dem Lagerbestand wieder
            gutgeschrieben. Gebrauchtes und defektes Material wird nur erfasst. Was ins Lager
            zurückgeht, schreibt das Lager gut, sobald es die Ware angenommen hat; ins eigene
            Fahrzeug sofort. Mit Baustelle kann höchstens zurückkommen, was für sie ausgegeben wurde.
          </InfoHint>
        </p>
        {gewaehlt ? (
          // Die Wahl steht wie ein ausgefülltes Feld da: weiss mit Haarlinie.
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-surface px-3 py-2">
            <div>
              <span className="section-label block">Material</span>
              <span className="font-semibold text-ink">{gewaehlt.name}</span>
              <span className="block text-sm text-ink-muted">
                {istFrei
                  ? 'Nicht im Katalog — wird erfasst, aber keinem Bestand gutgeschrieben.'
                  : [gewaehlt.category, gewaehlt.articleNumber].filter(Boolean).join(' · ')}
              </span>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setGewaehlt(null);
                setSuche('');
              }}
            >
              Ändern
            </Button>
          </div>
        ) : (
          <div>
            <InputField
              id="retmat"
              label="Material"
              type="search"
              placeholder="Name, Kategorie oder Art.-Nr."
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
            {suche.trim() !== '' && (
              <div className="mt-2">
                {treffer.length === 0 ? (
                  <p className="text-sm text-ink-muted">Kein Material passt zur Suche.</p>
                ) : null}
                {/* V11: frei getippte Ware — wie bei der Anforderung „Nicht im Katalog“. */}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setGewaehlt({ id: '', companyId, name: suche.trim(), unit: '' } as WithId<Material>);
                    setSuche('');
                  }}
                >
                  {`„${suche.trim()}“ ohne Katalog zurückgeben`}
                </Button>
                {treffer.length === 0 ? null : (
                  <List>
                    {treffer.map((m) => (
                      <ListRow
                        key={m.id}
                        title={m.name}
                        subtitle={[m.category, m.articleNumber, gefundenUeberText(m)].filter(Boolean).join(' · ') || undefined}
                      >
                        <Button
                          variant="secondary"
                          aria-label={`${m.name} zurückgeben`}
                          onClick={() => {
                            setGewaehlt(m);
                            setSuche('');
                          }}
                        >
                          Wählen
                        </Button>
                      </ListRow>
                    ))}
                  </List>
                )}
              </div>
            )}
          </div>
        )}
        <ZahlFeld id="retqty" label="Menge" value={menge} onChange={setMenge} />
        {rahmen && (
          <p className="text-sm text-ink-muted" data-testid="retoure-rahmen">
            Für diese Baustelle ausgegeben: {fmtMenge(rahmen.ausgegeben)}, schon zurück: {fmtMenge(rahmen.zurueck)} —
            höchstens {fmtMenge(rahmen.hoechstens)}.
          </p>
        )}
        {rahmen?.verrechnet && (
          <Hinweiszeile stufe="warn">
            <p>
              Diese Ware ist schon verrechnet{rahmen.rechnungen?.length ? ` (${rahmen.rechnungen.join(', ')})` : ''}. Die
              Rückgabe mindert die nächste Rechnung dieser Baustelle — kommt keine mehr, braucht der Kunde eine
              Gutschrift vom Büro.
            </p>
          </Hinweiszeile>
        )}
        <SelectField id="retcond" label="Zustand" value={zustand}
          onChange={(e) => setZustand(e.target.value as Zustand)}>
          <option value="neu">Neu / originalverpackt</option>
          <option value="gebraucht">Gebraucht</option>
          <option value="defekt">Defekt</option>
        </SelectField>
        {zustand === 'neu' && zielorte.length > 0 && (
          <OrtWahl id="retziel" label="Zurück in" alle={lo.orte} wahl={zielorte} wert={ziel} onChange={setZiel} />
        )}
        <BaustellenSelect
          id="retproj"
          label="Von welcher Baustelle? (optional)"
          companyId={companyId}
          value={projekt}
          onChange={(nr) => setProjekt(nr)}
        />
        {personen && (
          <SelectField id="retvon" label="Zurückgebracht von" value={von}
            onChange={(e) => setVon(e.target.value)}>
            <option value="">Bitte wählen</option>
            {personen.map((p) => (
              <option key={p.uid} value={p.uid}>{p.name}</option>
            ))}
          </SelectField>
        )}
        {personenFehler && <ErrorState message={personenFehler} />}
        <InputField id="retreason" label="Grund / Notiz" value={grund}
          onChange={(e) => setGrund(e.target.value)} />
        {/* Der Fehler steht im Fenster, wo er entstand. */}
        {fehler && <ErrorState message={fehler} />}
        <div className="fuss-aktionen">
          <Button variant="ghost" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button onClick={erfassen} loading={speichert} disabled={!gewaehlt || !person}>
            Retoure erfassen
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
