import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { kanalBaustelle, kanalDirekt, kanalRunde } from '@/lib/db/nachrichten';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import Icon from '@/components/Icon';
import { InputField } from '@/components/Field';
import { ErrorState, SkeletonList } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { useToast } from '@/components/Toast';
import { baustellenTitel } from '@/lib/baustellenTitel';
import { useBaustellenAuswahl } from './useBaustellenAuswahl';
import { kuerzel } from './text';
import type { Person } from './PersonWahl';

/**
 * NEUE NACHRICHT — ein Bogen, ein Schritt (Umbau E65): oben die Suche,
 * darunter gleich die Personen (ein Tipp: das Gespräch zu zweit, das es nur
 * einmal gibt) und die Baustellen (ein Tipp: ihr Thread). „Runde mit
 * mehreren“ schaltet auf Auswahl um; danach ist der Name freiwillig. Ohne
 * eingeschaltete Direktnachrichten stehen nur die Baustellen da.
 */
export default function NeueNachricht({
  open,
  onClose,
  direktAn,
  personen,
}: {
  open: boolean;
  onClose: () => void;
  direktAn: boolean;
  /** Die aktiven Konten des Betriebs ohne einen selbst. */
  personen: Person[];
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [suche, setSuche] = useState('');
  const [mehrere, setMehrere] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [benennen, setBenennen] = useState(false);
  const [name, setName] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const baustellen = useBaustellenAuswahl(open && !mehrere && !benennen, user?.companyId ?? '', user?.uid ?? '', user?.role ?? 'Mitarbeiter', suche);

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return [...personen]
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .filter((p) => !s || p.name.toLowerCase().includes(s));
  }, [personen, suche]);

  if (!user) return null;

  function schliessen() {
    setSuche('');
    setMehrere(false);
    setGewaehlt([]);
    setBenennen(false);
    setName('');
    setFehler(null);
    onClose();
  }

  async function oeffnen(kanal: () => Promise<string>) {
    setLaeuft(true);
    setFehler(null);
    try {
      const k = await kanal();
      schliessen();
      navigate(`/nachrichten/${k}`);
    } catch (e) {
      const grund = grundAus(e, 'Das Gespräch konnte nicht geöffnet werden.');
      setFehler(grund);
      toast.error(grund);
    } finally {
      setLaeuft(false);
    }
  }

  function weiter() {
    if (gewaehlt.length === 1) { void oeffnen(() => kanalDirekt(gewaehlt[0])); return; }
    setBenennen(true);
  }

  const namen = personen.filter((p) => gewaehlt.includes(p.uid)).map((p) => p.name);

  return (
    <BottomSheet open={open} onClose={schliessen} label="Neue Nachricht" titel={benennen ? 'Runde beginnen' : 'Neue Nachricht'} auchBreit>
      {open && benennen && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void oeffnen(() => kanalRunde(name, gewaehlt)); }}>
          <p className="text-sm">Mit {namen.join(', ')}.</p>
          <InputField id="runde-name" label="Name der Runde (freiwillig)" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="etwa „Bad Huber“" />
          {fehler && <ErrorState message={fehler} />}
          <div className="fuss-aktionen">
            <Button type="button" variant="ghost" onClick={() => setBenennen(false)}>Zurück</Button>
            <Button type="submit" loading={laeuft}>Runde beginnen</Button>
          </div>
        </form>
      )}
      {open && !benennen && (
        <div className="neu-bogen">
          <label className="chat-suche">
            <Icon name="lupe" size={20} aria-hidden="true" />
            <span className="sr-only">An</span>
            <input
              id="neu-suche"
              type="search"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder={direktAn ? 'An: Name oder Baustelle' : 'Baustelle suchen'}
              autoComplete="off"
            />
          </label>
          {direktAn && (
            <div className="chat-chips">
              <button
                type="button"
                className="chat-chip"
                aria-pressed={mehrere}
                onClick={() => { setMehrere((m) => !m); setGewaehlt([]); }}
              >
                Runde mit mehreren
              </button>
            </div>
          )}
          {fehler && <ErrorState message={fehler} />}

          {direktAn && (
            <section aria-label="Personen">
              <h3 className="neu-abschnitt">{mehrere ? 'Wer ist dabei?' : 'Personen'}</h3>
              {treffer.length === 0 ? (
                <p className="neu-leer">{suche ? `Niemand passt zu „${suche}“.` : 'Noch kein anderes aktives Konto.'}</p>
              ) : (
                <ul className="neu-liste">
                  {treffer.map((p) => {
                    const an = gewaehlt.includes(p.uid);
                    return (
                      <li key={p.uid}>
                        <button
                          type="button"
                          className="neu-zeile"
                          aria-pressed={mehrere ? an : undefined}
                          disabled={laeuft}
                          onClick={() => {
                            if (!mehrere) { void oeffnen(() => kanalDirekt(p.uid)); return; }
                            setGewaehlt((alt) => (an ? alt.filter((x) => x !== p.uid) : [...alt, p.uid]));
                          }}
                        >
                          <span className="postfach-kuerzel" aria-hidden="true">{mehrere && an ? <Icon name="haken" size={20} /> : kuerzel(p.name)}</span>
                          <span className="neu-text">
                            <span className="neu-name">{p.name}</span>
                            {p.rolle && <span className="neu-rolle">{p.rolle}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {!mehrere && (
            <section aria-label="Baustellen">
              <h3 className="neu-abschnitt">{user.role === 'Mitarbeiter' ? 'Baustellen, auf denen du bist' : 'Baustellen'}</h3>
              {baustellen.fehler && <ErrorState message="Die Baustellen konnten nicht geladen werden." />}
              {!baustellen.fehler && baustellen.liste === null && <SkeletonList rows={2} />}
              {!baustellen.fehler && baustellen.liste && baustellen.treffer.length === 0 && (
                <p className="neu-leer">{baustellen.begriff ? `Keine Baustelle passt zu „${baustellen.begriff}“.` : user.role === 'Mitarbeiter' ? 'Du bist noch auf keiner Baustelle eingeteilt.' : 'Noch keine aktive Baustelle.'}</p>
              )}
              {!baustellen.fehler && baustellen.treffer.length > 0 && (
                <ul className="neu-liste">
                  {baustellen.treffer.map((p) => (
                    <li key={p.id}>
                      <button type="button" className="neu-zeile" disabled={laeuft} onClick={() => void oeffnen(() => kanalBaustelle(p.id))}>
                        <span className="postfach-kuerzel neu-bau" aria-hidden="true"><Icon name="building" size={20} /></span>
                        <span className="neu-text">
                          <span className="neu-name">{baustellenTitel(p) || p.projectNumber}</span>
                          <span className="neu-rolle neu-nr">{p.projectNumber}{p.address ? ` · ${p.address}` : ''}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {mehrere && (
            <div className="fuss-aktionen">
              <Button variant="ghost" onClick={() => { setMehrere(false); setGewaehlt([]); }}>Abbrechen</Button>
              <Button disabled={gewaehlt.length === 0} loading={laeuft} onClick={weiter}>
                Weiter{gewaehlt.length > 0 ? ` (${gewaehlt.length})` : ''}
              </Button>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
