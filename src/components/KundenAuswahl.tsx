import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Customer } from '@/types';
import type { WithId } from '@/lib/db/core';
import { listCustomersByIds, searchCustomers } from '@/lib/db/customers';
import { InputField } from './Field';
import { List, ListRow } from './ListRow';
import Button from './Button';

/** So viele Treffer zeigt die Auswahl — wer mehr braucht, tippt weiter. */
export const KUNDEN_TREFFER = 8;

/**
 * DIE KUNDENAUSWAHL — gesucht auf dem Server (Ladezeit, 19.10.2026).
 *
 * Bis hierher luden Angebot, Baustelle, Baustellenakte, Wartung und Termin
 * beim Öffnen bis zu 500 Kunden in ein Auswahlfeld. Das wuchs mit jedem
 * Jahr des Betriebs — und darüber hinaus fehlte ein Kunde einfach, nur mit
 * einem Hinweis unter dem Feld. Jetzt kommen die Kunden aus einer Suche über
 * den ganzen Bestand (`searchCustomers`: Name, Anschrift, Ansprechperson,
 * Telefon, E-Mail); geladen wird nur, was gesucht wird, und der gewählte
 * Kunde selbst.
 *
 * PFLICHT WIE BISHER ÜBER DAS FORMULAR (`required`): ohne gewählten Kunden meldet das
 * Suchfeld „Bitte einen Kunden wählen.“ — auch wenn etwas getippt, aber nichts
 * gewählt wurde. Ein getippter Name ist kein Kunde; genau gegen diese
 * Dublette wurden die Kundenstammdaten eingeführt.
 */
export default function KundenAuswahl({
  companyId,
  id,
  label = 'Kunde',
  value,
  kunde,
  onChange,
  pflicht,
  required,
  nurAktive,
  disabled,
}: {
  companyId: string;
  id: string;
  label?: string;
  /** Die Kennung des gewählten Kunden; leer = keiner. */
  value: string;
  /** Der gewählte Kunde, wenn der Aufrufer ihn schon hat — sonst wird er nachgeladen. */
  kunde?: WithId<Customer> | null;
  /** Kennung UND Datensatz — die Aufrufer brauchen Name und Anschrift. */
  onChange: (id: string, kunde: WithId<Customer> | null) => void;
  /** Der Stern an der Beschriftung. */
  pflicht?: boolean;
  /** Das Formular lässt sich ohne gewählten Kunden nicht abschicken. */
  required?: boolean;
  /** Inaktive Kunden nicht anbieten (der gewählte bleibt stehen). */
  nurAktive?: boolean;
  disabled?: boolean;
}) {
  const [geladen, setGeladen] = useState<WithId<Customer> | null>(null);
  const [suchen, setSuchen] = useState(!value);
  const [begriff, setBegriff] = useState('');
  const [antwort, setAntwort] = useState<{ fuer: string; treffer: WithId<Customer>[] } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const gewaehlt = kunde && kunde.id === value ? kunde : geladen && geladen.id === value ? geladen : null;

  // Ein vorgegebener Kunde (Bearbeiten, Tiefenlink), den der Aufrufer nicht mitgibt: einzeln nachladen.
  useEffect(() => {
    if (!value || gewaehlt) return;
    let weg = false;
    listCustomersByIds(companyId, [value])
      .then((rows) => { if (!weg) setGeladen(rows.find((k) => k.id === value) ?? null); })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [companyId, value, gewaehlt]);

  // Wird der Kunde von außen geleert (neues Formular), steht wieder die Suche da.
  useEffect(() => {
    if (!value) setSuchen(true);
  }, [value]);

  const q = begriff.trim();
  useEffect(() => {
    if (!q) return;
    let weg = false;
    // Kurz warten: nicht bei jedem Tastendruck eine Abfrage.
    const t = setTimeout(() => {
      searchCustomers(companyId, q, KUNDEN_TREFFER * 2)
        .then((liste) => {
          if (weg) return;
          setAntwort({ fuer: q, treffer: liste });
          setFehler(null);
        })
        .catch(() => { if (!weg) setFehler(q); });
    }, 300);
    return () => { weg = true; clearTimeout(t); };
  }, [companyId, q]);

  // Ohne Ref: `InputField` reicht keinen durch (wie bei `BaustellenSelect`).
  useEffect(() => {
    (document.getElementById(id) as HTMLInputElement | null)?.setCustomValidity?.(
      required && !value ? 'Bitte einen Kunden wählen.' : '',
    );
  }, [id, required, value, suchen]);

  const treffer = (antwort && antwort.fuer === q ? antwort.treffer : [])
    .filter((k) => !nurAktive || k.active !== false)
    .slice(0, KUNDEN_TREFFER);
  const laeuft = !!q && (!antwort || antwort.fuer !== q) && fehler !== q;

  if (value && !suchen) {
    return (
      <div className="flex flex-col gap-1.5" role="group" aria-labelledby={`${id}-beschriftung`}>
        {/* Wie die Beschriftung eines Feldes (`Field.tsx`) — hier gibt es nichts zu beschriften als die Gruppe. */}
        <span className="flex items-baseline gap-1">
          <span id={`${id}-beschriftung`} className="text-meta font-semibold text-ink-deep">{label}</span>
          {pflicht && <span aria-hidden="true" className="leading-none text-danger">*</span>}
        </span>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="min-w-[9rem]">
            <p>{gewaehlt?.name ?? 'Wird geladen …'}</p>
            {gewaehlt?.address && <p className="text-sm text-ink-muted">{gewaehlt.address}</p>}
          </div>
          <Button type="button" variant="secondary" groesse="klein" disabled={disabled} onClick={() => { setBegriff(''); setSuchen(true); }}>
            Anderen Kunden wählen
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
        placeholder="Name, Anschrift, Telefon oder E-Mail"
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
            Bei {gewaehlt.name} bleiben
          </Button>
        </div>
      )}
      {q !== '' && (
        <div className="mt-2">
          {fehler === q ? (
            <p className="text-sm text-ink-deep">Die Suche ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.</p>
          ) : treffer.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {laeuft ? 'Sucht …' : (
                <>
                  Kein Kunde passt zur Suche. Neue Kunden legt die{' '}
                  <Link to="/customers" className="link-hinweis-weiter">Kundenverwaltung</Link> an.
                </>
              )}
            </p>
          ) : (
            <List>
              {treffer.map((k) => (
                <ListRow
                  key={k.id}
                  title={k.active === false ? `${k.name} (inaktiv)` : k.name}
                  subtitle={k.address || undefined}
                  onOeffnen={() => {
                    setGeladen(k);
                    setBegriff('');
                    setSuchen(false);
                    onChange(k.id, k);
                  }}
                />
              ))}
            </List>
          )}
        </div>
      )}
    </div>
  );
}
