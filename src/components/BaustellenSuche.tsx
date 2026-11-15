import { useEffect, useState } from 'react';
import type { Project } from '@/types';
import type { WithId } from '@/lib/db/core';
import { listLaufendeDesKunden, listProjectsByIds, searchProjects } from '@/lib/db/projects';
import { baustelleInAuswahl } from '@/lib/baustellenTitel';
import { InputField } from './Field';
import { List, ListRow } from './ListRow';
import Button from './Button';

/** So viele Treffer zeigt die Suche — wer mehr braucht, tippt weiter. */
export const BAUSTELLEN_TREFFER = 8;

/**
 * EINE BAUSTELLE ÜBER DIE SUCHE WÄHLEN (A3, A11) — wie `KundenAuswahl`.
 *
 * Eine feste Liste trägt eine Grenze (`BAUSTELLEN_AUSWAHL_GRENZE`): bei
 * Betrieben, die jede Reparatur als Baustelle führen, fehlte darin, was
 * gesucht war. Die Suche fragt die Datenbank über alle Baustellen; ohne
 * Begriff zeigt sie die laufenden des Kunden, wenn einer feststeht — das ist
 * beim Nachtrag fast immer die richtige.
 *
 * Abgeschlossene stehen mit dabei und sagen es: ein Nachtrag öffnet sie
 * wieder, ein Schein wird auch für eine gerade abgeschlossene nachgereicht.
 */
export default function BaustellenSuche({
  companyId,
  id,
  label = 'Baustelle',
  value,
  projekt,
  onChange,
  kundeId,
  pflicht,
  required,
  disabled,
  hinweisAbgeschlossen = 'abgeschlossen',
}: {
  companyId: string;
  id: string;
  label?: string;
  /** Die Kennung der gewählten Baustelle; leer = keine. */
  value: string;
  /** Die gewählte Baustelle, wenn der Aufrufer sie schon hat — sonst wird sie nachgeladen. */
  projekt?: WithId<Project> | null;
  onChange: (id: string, projekt: WithId<Project> | null) => void;
  /** Ohne Suchbegriff: die laufenden Baustellen dieses Kunden. */
  kundeId?: string;
  pflicht?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Was neben einer abgeschlossenen steht. */
  hinweisAbgeschlossen?: string;
}) {
  const [geladen, setGeladen] = useState<WithId<Project> | null>(null);
  const [suchen, setSuchen] = useState(!value);
  const [begriff, setBegriff] = useState('');
  const [antwort, setAntwort] = useState<{ fuer: string; treffer: WithId<Project>[] } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const gewaehlt = projekt && projekt.id === value ? projekt : geladen && geladen.id === value ? geladen : null;

  useEffect(() => {
    if (!value || gewaehlt) return;
    let weg = false;
    listProjectsByIds(companyId, [value])
      .then((rows) => { if (!weg) setGeladen(rows.find((p) => p.id === value) ?? null); })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [companyId, value, gewaehlt]);

  useEffect(() => {
    if (!value) setSuchen(true);
  }, [value]);

  const q = begriff.trim();
  // Ohne Begriff fragt die Suche nach den laufenden des Kunden — derselbe Ablauf, ein anderer Schlüssel.
  const schluessel = q || (kundeId ? `kunde:${kundeId}` : '');
  useEffect(() => {
    if (!schluessel) return;
    let weg = false;
    const t = setTimeout(() => {
      (q ? searchProjects(companyId, q, BAUSTELLEN_TREFFER * 2) : listLaufendeDesKunden(companyId, kundeId!, BAUSTELLEN_TREFFER))
        .then((liste) => {
          if (weg) return;
          setAntwort({ fuer: schluessel, treffer: liste });
          setFehler(null);
        })
        .catch(() => { if (!weg) setFehler(schluessel); });
    }, q ? 300 : 0);
    return () => { weg = true; clearTimeout(t); };
  }, [companyId, q, kundeId, schluessel]);

  useEffect(() => {
    (document.getElementById(id) as HTMLInputElement | null)?.setCustomValidity?.(
      required && !value ? 'Bitte eine Baustelle wählen.' : '',
    );
  }, [id, required, value, suchen]);

  const treffer = (antwort && antwort.fuer === schluessel ? antwort.treffer : []).slice(0, BAUSTELLEN_TREFFER);
  const laeuft = !!schluessel && (!antwort || antwort.fuer !== schluessel) && fehler !== schluessel;

  if (value && !suchen) {
    return (
      <div className="flex flex-col gap-1.5" role="group" aria-labelledby={`${id}-beschriftung`}>
        <span className="flex items-baseline gap-1">
          <span id={`${id}-beschriftung`} className="text-meta font-semibold text-ink-deep">{label}</span>
          {pflicht && <span aria-hidden="true" className="leading-none text-danger">*</span>}
        </span>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="min-w-[9rem]">
            <p>{gewaehlt ? baustelleInAuswahl(gewaehlt) : 'Wird geladen …'}</p>
            {gewaehlt?.address && <p className="text-sm text-ink-muted">{gewaehlt.address}</p>}
            {gewaehlt?.status === 'Abgeschlossen' && <p className="text-sm text-ink-muted">{hinweisAbgeschlossen}</p>}
          </div>
          <Button type="button" variant="secondary" groesse="klein" disabled={disabled} onClick={() => { setBegriff(''); setSuchen(true); }}>
            Andere Baustelle wählen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <InputField
        id={id}
        label={label}
        type="search"
        placeholder="Nummer, Kunde, Bezeichnung oder Adresse"
        value={begriff}
        onChange={(e) => setBegriff(e.target.value)}
        onKeyDown={(e) => {
          // Die Eingabetaste schickte sonst das ganze Formular ab.
          if (e.key === 'Enter') e.preventDefault();
        }}
        pflicht={pflicht}
        required={required}
        disabled={disabled}
        autoComplete="off"
      />
      {value && gewaehlt && (
        <div className="mt-1">
          <Button type="button" variant="ghost" groesse="klein" onClick={() => { setBegriff(''); setSuchen(false); }}>
            Bei {gewaehlt.projectNumber} bleiben
          </Button>
        </div>
      )}
      {schluessel !== '' && (
        <div className="mt-2">
          {fehler === schluessel ? (
            <p className="text-sm text-ink-deep">Die Suche ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.</p>
          ) : treffer.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {laeuft ? 'Sucht …' : q ? 'Keine Baustelle passt zur Suche.' : 'Dieser Kunde hat keine laufende Baustelle — oben suchen.'}
            </p>
          ) : (
            <>
              {!q && <p className="section-label">Laufende Baustellen des Kunden</p>}
              <List>
                {treffer.map((p) => (
                  <ListRow
                    key={p.id}
                    title={baustelleInAuswahl(p)}
                    subtitle={[p.address, p.status === 'Abgeschlossen' ? hinweisAbgeschlossen : p.status === 'Pausiert' ? 'pausiert' : '']
                      .filter(Boolean).join(' · ') || undefined}
                    onOeffnen={() => {
                      setGeladen(p);
                      setBegriff('');
                      setSuchen(false);
                      onChange(p.id, p);
                    }}
                  />
                ))}
              </List>
            </>
          )}
        </div>
      )}
    </div>
  );
}
