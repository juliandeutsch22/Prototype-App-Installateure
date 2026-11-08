import { useMemo, useState } from 'react';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import { List, ListRow } from '@/components/ListRow';
import { Listenleiste } from '@/components/LotBausteine';
import { EmptyState } from '@/components/States';

export interface Person { uid: string; name: string; rolle?: string }

/**
 * Personen wählen — eine (Erwähnen) oder mehrere (Runde, Hinzufügen). Mit
 * Suche über den Namen; die ganze Zeile wählt.
 */
export default function PersonWahl({
  open,
  titel,
  personen,
  mehrere,
  bestaetigen = 'Übernehmen',
  onClose,
  onWahl,
}: {
  open: boolean;
  titel: string;
  personen: Person[];
  mehrere: boolean;
  bestaetigen?: string;
  onClose: () => void;
  onWahl: (gewaehlt: Person[]) => void;
}) {
  const [suche, setSuche] = useState('');
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return [...personen]
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .filter((p) => !s || p.name.toLowerCase().includes(s));
  }, [personen, suche]);

  function schliessen() {
    setSuche('');
    setGewaehlt(new Set());
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={schliessen} label={titel} titel={titel} auchBreit>
      {open && (
        <div className="space-y-3">
          <Listenleiste suche={{ id: 'person-suche', wert: suche, onChange: setSuche, platzhalter: 'Name', name: 'Personen suchen' }} />
          {treffer.length === 0 ? (
            <EmptyState titel="Niemand gefunden">Kein aktives Konto passt zu „{suche}“.</EmptyState>
          ) : (
            <List>
              {treffer.map((p) => {
                const an = gewaehlt.has(p.uid);
                return (
                  <ListRow
                    key={p.uid}
                    title={p.name}
                    subtitle={p.rolle}
                    zustand={mehrere && an ? <span className="text-sm text-ink">gewählt</span> : undefined}
                    onOeffnen={() => {
                      if (!mehrere) { onWahl([p]); setSuche(''); return; }
                      setGewaehlt((alt) => {
                        const neu = new Set(alt);
                        if (neu.has(p.uid)) neu.delete(p.uid); else neu.add(p.uid);
                        return neu;
                      });
                    }}
                  />
                );
              })}
            </List>
          )}
          {mehrere && (
            <div className="fuss-aktionen">
              <Button variant="ghost" onClick={schliessen}>Abbrechen</Button>
              <Button
                disabled={gewaehlt.size === 0}
                onClick={() => {
                  const liste = personen.filter((p) => gewaehlt.has(p.uid));
                  setSuche('');
                  setGewaehlt(new Set());
                  onWahl(liste);
                }}
              >
                {bestaetigen}{gewaehlt.size > 0 ? ` (${gewaehlt.size})` : ''}
              </Button>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
