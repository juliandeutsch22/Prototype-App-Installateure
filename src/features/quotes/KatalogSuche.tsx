import { useEffect, useState } from 'react';
import type { Material } from '@/types';
import type { WithId } from '@/lib/db/core';
import { sucheKatalog } from '@/lib/db/materials';
import Button from '@/components/Button';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { euro } from '@/lib/betrag';

/**
 * EINEN ARTIKEL AUS DEM KATALOG INS ANGEBOT ÜBERNEHMEN (Testbericht
 * 30.09.2026, M18).
 *
 * Gesucht wird auf dem Server, nicht im geladenen Katalog: ein eingespielter
 * Großhandelskatalog hat leicht zehntausende Artikel, und die Liste im
 * Browser endet bei tausend. Übernommen werden Bezeichnung, Einheit und der
 * Verkaufspreis; danach ist es eine gewöhnliche Position, die sich ändern
 * lässt. Ein Artikel ohne Verkaufspreis kommt mit 0,00 € — die Zeile sagt
 * es, statt einen Preis zu erfinden.
 */
export default function KatalogSuche({
  companyId, onWahl, onSchliessen,
}: {
  companyId: string;
  onWahl: (m: WithId<Material>) => void;
  onSchliessen: () => void;
}) {
  const [begriff, setBegriff] = useState('');
  const [treffer, setTreffer] = useState<WithId<Material>[] | null>(null);
  const [fehler, setFehler] = useState(false);
  /*
    WAS ZULETZT ÜBERNOMMEN WURDE. Seit die Suche im Seitenfenster steht, liegt
    das Formular am Handy ganz dahinter: ohne diese Zeile sähe niemand, dass
    der Tipp gewirkt hat, und tippte ein zweites Mal.
  */
  const [zuletzt, setZuletzt] = useState<string | null>(null);

  useEffect(() => {
    const b = begriff.trim();
    if (b.length < 2) {
      setTreffer(null);
      return;
    }
    let weg = false;
    // Kurz warten: nicht bei jedem Tastendruck eine Abfrage.
    const t = setTimeout(() => {
      sucheKatalog(companyId, b)
        .then((liste) => {
          if (weg) return;
          setFehler(false);
          // Ausgelaufene Artikel führt der Großhändler nicht mehr — nicht anbieten.
          setTreffer(liste.filter((m) => !m.ausgelaufen));
        })
        .catch(() => { if (!weg) setFehler(true); });
    }, 300);
    return () => {
      weg = true;
      clearTimeout(t);
    };
  }, [begriff, companyId]);

  return (
    // Ohne eigenen Rahmen: sie steht im Seitenfenster, nicht als Kasten im Formular.
    <div className="space-y-3">
      <InputField
        id="angebot-katalog"
        label="Artikel aus dem Katalog"
        type="search"
        placeholder="Name, Art.-Nr. oder Kategorie"
        autoFocus
        value={begriff}
        onChange={(e) => setBegriff(e.target.value)}
      />
      {zuletzt && (
        <p role="status" className="text-sm text-ink-muted">
          „{zuletzt}“ übernommen.
        </p>
      )}
      {fehler && <p role="alert" className="text-sm text-danger">Der Katalog ließ sich nicht durchsuchen.</p>}
      {treffer && treffer.length === 0 && !fehler && (
        <p className="text-sm text-ink-muted">Kein Artikel passt zur Suche.</p>
      )}
      {treffer && treffer.length > 0 && (
        <List>
          {treffer.map((m) => (
            <ListRow
              key={m.id}
              title={m.name}
              subtitle={[
                m.articleNumber,
                m.verkaufspreis != null ? `${euro(m.verkaufspreis)} je ${m.unit || 'Einheit'}` : 'ohne Verkaufspreis',
              ].filter(Boolean).join(' · ')}
            >
              <Button variant="secondary" aria-label={`${m.name} übernehmen`} onClick={() => { onWahl(m); setZuletzt(m.name); }}>
                Übernehmen
              </Button>
            </ListRow>
          ))}
        </List>
      )}
      <Button variant="ghost" onClick={onSchliessen}>Fertig</Button>
    </div>
  );
}
