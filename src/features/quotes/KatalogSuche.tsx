import { useEffect, useState } from 'react';
import type { Material } from '@/types';
import type { WithId } from '@/lib/db/core';
import { sucheKatalog } from '@/lib/db/materials';
import Button from '@/components/Button';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { SkeletonList } from '@/components/States';
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
  const [antwort, setAntwort] = useState<{ schluessel: string; zeilen: WithId<Material>[]; fehler: boolean } | null>(null);
  const [versuch, setVersuch] = useState(0);
  const b = begriff.trim();
  const schluessel = JSON.stringify([companyId, b, versuch]);
  const aktuell = b.length >= 2 && antwort?.schluessel === schluessel;
  const treffer = aktuell ? antwort.zeilen : null;
  const fehler = aktuell && antwort.fehler;
  const sucht = b.length >= 2 && !aktuell;
  /*
    WAS ZULETZT ÜBERNOMMEN WURDE. Seit die Suche im Seitenfenster steht, liegt
    das Formular am Handy ganz dahinter: ohne diese Zeile sähe niemand, dass
    der Tipp gewirkt hat, und tippte ein zweites Mal.
  */
  const [zuletzt, setZuletzt] = useState<string | null>(null);

  useEffect(() => {
    if (b.length < 2) return;
    let weg = false;
    // Kurz warten: nicht bei jedem Tastendruck eine Abfrage.
    const t = setTimeout(() => {
      sucheKatalog(companyId, b)
        .then((liste) => {
          if (weg) return;
          // Ergebnis ist an genau diesen Suchlauf und Betrieb gebunden.
          setAntwort({ schluessel, zeilen: liste.filter((m) => !m.ausgelaufen), fehler: false });
        })
        .catch(() => { if (!weg) setAntwort({ schluessel, zeilen: [], fehler: true }); });
    }, 300);
    return () => {
      weg = true;
      clearTimeout(t);
    };
  }, [b, companyId, schluessel]);

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
        onChange={(e) => { setBegriff(e.target.value); setVersuch((v) => v + 1); }}
      />
      {zuletzt && (
        <p role="status" className="text-sm text-ink-muted">
          „{zuletzt}“ übernommen.
        </p>
      )}
      {b.length < 2 && <p className="text-sm text-ink-muted">Gib mindestens zwei Zeichen ein.</p>}
      {sucht && <div role="status" aria-busy="true"><p className="text-sm text-ink-muted">Suche nach „{b}“ …</p><SkeletonList rows={3} /></div>}
      {fehler && <div role="alert" className="space-y-2"><p className="text-sm text-danger">Der Katalog ließ sich nicht durchsuchen. Bereits übernommene Positionen bleiben erhalten.</p><Button type="button" variant="secondary" groesse="klein" onClick={() => setVersuch((v) => v + 1)}>Suche wiederholen</Button></div>}
      {treffer && treffer.length === 0 && !fehler && (
        <div className="space-y-2"><p className="text-sm text-ink-muted">Kein Artikel passt zur Suche.</p><Button type="button" variant="secondary" groesse="klein" onClick={() => { setBegriff(''); setVersuch((v) => v + 1); }}>Suche zurücksetzen</Button></div>
      )}
      {treffer && treffer.length > 0 && !fehler && (
        <div><p role="status" className="mb-2 text-sm text-ink-muted">{treffer.length} Treffer für „{b}“</p><List>
          {treffer.map((m) => (
            <ListRow
              key={m.id}
              title={m.name}
              subtitle={[
                m.articleNumber,
                m.verkaufspreis != null ? `${euro(m.verkaufspreis)} je ${m.unit || 'Einheit'}` : 'ohne Verkaufspreis',
              ].filter(Boolean).join(' · ')}
            >
              <Button type="button" variant="secondary" aria-label={`${m.name} übernehmen`} onClick={() => { onWahl(m); setZuletzt(m.name); }}>
                Übernehmen
              </Button>
            </ListRow>
          ))}
        </List></div>
      )}
      <Button type="button" variant="ghost" onClick={onSchliessen}>Fertig</Button>
    </div>
  );
}
