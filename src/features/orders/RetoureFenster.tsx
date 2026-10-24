import { useEffect, useState } from 'react';
import { sucheKatalog } from '@/lib/db/materials';
import { createReturn } from '@/lib/db/materialOrders';
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
import { zahlOder } from '@/lib/zahl';
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
 */
export default function RetoureFenster({
  offen,
  onClose,
  companyId,
  user,
  baustelle = '',
  personen,
  personenFehler = null,
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
}) {
  const toast = useToast();
  /** Das gewählte Material — der Datensatz selbst; die Suche liefert ihn vom Server. */
  const [gewaehlt, setGewaehlt] = useState<WithId<Material> | null>(null);
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

  // Wer das Fenster mit einer anderen Baustelle öffnet, will sie vorbelegt sehen.
  useEffect(() => {
    if (offen) setProjekt(baustelle);
  }, [offen, baustelle]);

  /**
   * DIE ARTIKELAUSWAHL IST EINE SUCHE, KEIN AUSWAHLFELD.
   *
   * Ein Auswahlfeld ist bei zwanzig Artikeln bequem und bei zweihundert
   * unbrauchbar: auf dem Telefon wird daraus eine Rolliste, durch die man
   * blind scrollt, ohne tippen zu können. Gesucht wird über dieselben drei
   * Felder wie im Katalog — Bezeichnung, Kategorie, Artikelnummer.
   */
  const [treffer, setTreffer] = useState<WithId<Material>[]>([]);
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
    const falsch = mengeFehler(qty, gewaehlt.unit);
    if (falsch) {
      setFehler(falsch);
      return;
    }
    setSpeichert(true);
    setFehler(null);
    try {
      await createReturn(companyId, {
        materialId: gewaehlt.id,
        materialName: gewaehlt.name,
        quantity: qty,
        condition: zustand,
        note: grund,
        projectNumber: projekt,
        userId: person.uid,
        userName: person.name,
      });
      setGewaehlt(null);
      setVon('');
      setSuche('');
      setMenge('1');
      setGrund('');
      onClose();
      toast.success(
        zustand === 'neu'
          ? 'Retoure erfasst — Material wurde dem Lager gutgeschrieben'
          : 'Retoure erfasst',
      );
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
          Nur Neues wird dem Lager gutgeschrieben.
          <InfoHint about="die Retoure">
            Nur unbenutztes Material in Originalverpackung wird dem Lagerbestand wieder
            gutgeschrieben. Gebrauchtes und defektes Material wird nur erfasst.
          </InfoHint>
        </p>
        {gewaehlt ? (
          // Die Wahl steht wie ein ausgefülltes Feld da: weiss mit Haarlinie.
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-surface px-3 py-2">
            <div>
              <span className="section-label block">Material</span>
              <span className="font-semibold text-ink">{gewaehlt.name}</span>
              <span className="block text-sm text-ink-muted">
                {[gewaehlt.category, gewaehlt.articleNumber].filter(Boolean).join(' · ')}
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
                ) : (
                  <List>
                    {treffer.map((m) => (
                      <ListRow
                        key={m.id}
                        title={m.name}
                        subtitle={[m.category, m.articleNumber].filter(Boolean).join(' · ') || undefined}
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
        <SelectField id="retcond" label="Zustand" value={zustand}
          onChange={(e) => setZustand(e.target.value as Zustand)}>
          <option value="neu">Neu / originalverpackt</option>
          <option value="gebraucht">Gebraucht</option>
          <option value="defekt">Defekt</option>
        </SelectField>
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
