import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { canAccess, navForRole, unterseitenFuer, zusatzrechte } from './navigation';
import { istOben, useFokusFalle } from '@/components/fokusFalle';
import { ImFenster } from '@/components/imFenster';
import { useHintergrundSperre } from '@/components/hintergrundSperre';
import { searchCustomers } from '@/lib/db/customers';
import { searchProjects } from '@/lib/db/projects';
import { rechnungenNachNummer } from '@/lib/db/invoices';
import { angeboteNachNummer } from '@/lib/db/quotes';
import { listUsers } from '@/lib/db/users';
import { sucheKatalog } from '@/lib/db/materials';
import { datumAT } from '@/lib/datum';
import type { AppUser } from '@/types';

/**
 * „SUCHEN ODER SPRINGEN“ (Strg + K, Linie „Lot“, Protokoll Abschnitt 5).
 *
 * ZUSÄTZLICH, KEIN ERSATZ: jeder bisherige Weg bleibt. Das Fenster kennt
 * genau die Seiten und Unterseiten, die die Rolle in der Navigation hat —
 * dieselbe Quelle (`navigation.ts`), damit es keine Tür öffnet, die das Menü
 * nicht hat. Kunden und Baustellen sucht es in der Datenbank, und nur, wenn
 * die Rolle die Liste sehen darf; was sie dort sehen darf, entscheidet wie
 * überall der Zeilenschutz.
 *
 * SEIT C3 (E91) AUCH NUMMERN UND MENSCHEN: Rechnungs- und Angebotsnummer,
 * Personen und Artikel — jede Gruppe nach derselben Regel, nur mit der
 * Seite, die die Rolle in der Navigation hat. Scheine fehlen mit Grund: sie
 * tragen keine eigene Nummer; man findet sie über ihre Baustelle.
 */

const GRUPPEN = ['Seiten', 'Kunden', 'Baustellen', 'Rechnungen', 'Angebote', 'Personen', 'Artikel'] as const;
type Gruppe = (typeof GRUPPEN)[number];

interface Treffer {
  schluessel: string;
  gruppe: Gruppe;
  text: string;
  /** Die zweite Zeile — bei Baustellen die Kurzbezeichnung, die zwei Baustellen eines Kunden unterscheidet. */
  zweite?: string;
  neben?: string;
  ziel: string;
}

const HOECHSTENS = 5;

function passt(text: string, begriff: string): boolean {
  return text.toLocaleLowerCase('de-AT').includes(begriff.toLocaleLowerCase('de-AT'));
}

export default function Suchfenster({ offen, onSchliessen }: { offen: boolean; onSchliessen: () => void }) {
  const { user, company } = useAuth();
  const navigate = useNavigate();
  const [begriff, setBegriff] = useState('');
  const [daten, setDaten] = useState<Treffer[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [an, setAn] = useState(0);
  const fenster = useRef<HTMLDivElement>(null);
  /*
    DIE PERSONEN EINMAL JE ÖFFNEN. Ein Betrieb hat Dutzende, nicht
    Tausende; sie zu jedem Tastendruck neu zu holen, hiesse dieselbe Liste
    fünfmal für „Maier“.
  */
  const personen = useRef<Promise<AppUser[]> | null>(null);
  useFokusFalle(fenster, offen, { zurueckGeben: true });
  // Die Seite dahinter steht still, solange das Suchfenster offen ist.
  useHintergrundSperre(offen);

  const seiten = useMemo<Treffer[]>(() => {
    if (!user) return [];
    const zusatz = zusatzrechte(user, company);
    const schalter = { wochenplanFuerAlle: !!company?.wochenplanFuerAlle };
    return navForRole(user.role, company?.modules, zusatz).flatMap((item) => [
      { schluessel: item.path, gruppe: 'Seiten' as const, text: item.label, ziel: item.path },
      ...unterseitenFuer(item.path, user.role, schalter, company?.modules).map((u) => ({
        schluessel: `${item.path}/${u.pfad}`,
        gruppe: 'Seiten' as const,
        text: u.label,
        neben: item.label,
        ziel: `${item.path}/${u.pfad}`,
      })),
    ]);
  }, [user, company]);

  /*
    ESC AM FENSTER, NICHT NUR AM SUCHFELD. Ein Klick neben die Treffer (auf
    eine Gruppenüberschrift) nimmt dem Feld den Fokus — er liegt dann am
    Dokument, und eine Taste am Feld käme nie an. Wie bei den Seitenfenstern
    schliesst Esc nur, was obenauf liegt.
  */
  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && istOben(fenster)) {
        e.preventDefault();
        onSchliessen();
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [offen, onSchliessen]);

  useEffect(() => {
    if (!offen) {
      setBegriff('');
      setDaten([]);
      setAn(0);
      personen.current = null;
    }
  }, [offen]);

  /*
    DIE DATENBANK ERST AB ZWEI ZEICHEN und mit einer Viertelsekunde Ruhe: bei
    jedem Tastendruck zu fragen hiesse fünf Anfragen für „Huber“, und die
    Antwort auf „H“ käme womöglich als letzte und überschriebe die richtige.
  */
  useEffect(() => {
    if (!offen || !user) return;
    const b = begriff.trim();
    if (b.length < 2) {
      setDaten([]);
      return;
    }
    let gilt = true;
    const zusatz = zusatzrechte(user, company);
    const uhr = setTimeout(() => {
      setLaedt(true);
      const kunden = canAccess(user.role, '/customers', company?.modules, zusatz)
        ? searchCustomers(user.companyId, b, HOECHSTENS).then((ks) =>
            ks.map<Treffer>((k) => ({
              schluessel: `k-${k.id}`, gruppe: 'Kunden', text: k.name, neben: k.ort ?? undefined, ziel: `/customers/${k.id}`,
            })))
        : Promise.resolve([]);
      const darf = (pfad: string) => canAccess(user.role, pfad, company?.modules, zusatz);
      const baustellen = darf('/admin-projects')
        ? searchProjects(user.companyId, b, HOECHSTENS).then((ps) =>
            ps.map<Treffer>((p) => {
              const kunde = p.customerName?.trim() ?? '';
              const name = p.bezeichnung?.trim() ?? '';
              return {
                schluessel: `b-${p.id}`, gruppe: 'Baustellen', text: kunde || name || p.projectNumber,
                zweite: kunde && name ? name : undefined, neben: p.projectNumber, ziel: `/admin-projects/${p.id}`,
              };
            }))
        : Promise.resolve([]);
      /*
        DIE PROJEKTLEITUNG LIEST NUR (M38): ihre Liste kennt kein Fenster zur
        Rechnung, also führt der Treffer in die Liste, gefiltert auf die
        Nummer. Welche Rechnungen sie überhaupt findet, entscheidet der
        Zeilenschutz — nur die ihrer Baustellen.
      */
      const nurLesen = user.role === 'Projektleiter';
      const rechnungen = darf('/invoices')
        ? rechnungenNachNummer(user.companyId, b, HOECHSTENS).then((rs) =>
            rs.map<Treffer>((r) => {
              const storno = !!r.stornoNummer && r.stornoNummer.toLocaleLowerCase('de-AT').includes(b.toLocaleLowerCase('de-AT'));
              return {
                schluessel: `r-${r.id}`, gruppe: 'Rechnungen', text: r.customerName || r.invoiceNumber,
                zweite: [storno ? `Storno ${r.stornoNummer}` : '', r.invoiceDate ? datumAT(r.invoiceDate) : ''].filter(Boolean).join(' · ') || undefined,
                neben: r.invoiceNumber,
                ziel: nurLesen
                  ? `/invoices?suche=${encodeURIComponent(r.invoiceNumber)}`
                  : `/invoices?suche=${encodeURIComponent(r.invoiceNumber)}&oeffnen=${encodeURIComponent(r.id)}`,
              };
            }))
        : Promise.resolve([]);
      const angebote = darf('/quotes')
        ? angeboteNachNummer(user.companyId, b, HOECHSTENS).then((qs) =>
            qs.map<Treffer>((q) => ({
              schluessel: `a-${q.id}`, gruppe: 'Angebote', text: q.customerName || q.quoteNumber,
              zweite: q.status, neben: q.quoteNumber, ziel: `/quotes/${q.id}`,
            })))
        : Promise.resolve([]);
      const leute = darf('/user-mgmt')
        ? (personen.current ??= listUsers(user.companyId).catch((e: unknown) => {
            // Ein Fehlschlag bleibt nicht für die ganze Sitzung des Fensters liegen.
            personen.current = null;
            throw e;
          })).then((us) =>
            us
              .filter((u) => passt(u.name ?? '', b) || passt(u.email ?? '', b))
              .sort((x, y) => (x.name ?? '').localeCompare(y.name ?? '', 'de-AT'))
              .slice(0, HOECHSTENS)
              .map<Treffer>((u) => ({
                schluessel: `p-${u.uid}`, gruppe: 'Personen', text: u.name || u.email,
                zweite: u.active === false ? 'Deaktiviert' : undefined, neben: u.role, ziel: `/user-mgmt/${u.uid}`,
              })))
        : Promise.resolve([]);
      /*
        EIN ARTIKEL FÜHRT DORTHIN, WO DIE ROLLE MIT IHM ARBEITET: ins Lager
        (Katalog), wer es führt; sonst zu „Material anfordern“ mit dem
        Artikel im Suchfeld. Gesucht wird mit der Artikelnummer, wo es eine
        gibt — sie ist eindeutig, der Name oft nicht.
      */
      const artikelZiel = darf('/lager') ? '/lager?reiter=katalog&suche=' : darf('/material') ? '/material?suche=' : null;
      const artikel = artikelZiel
        ? sucheKatalog(user.companyId, b, HOECHSTENS).then((ms) =>
            ms.map<Treffer>((m) => ({
              schluessel: `m-${m.id}`, gruppe: 'Artikel', text: m.name, zweite: m.category || undefined,
              neben: m.articleNumber || undefined,
              ziel: `${artikelZiel}${encodeURIComponent(m.articleNumber?.trim() || m.name)}`,
            })))
        : Promise.resolve([]);
      void Promise.allSettled([kunden, baustellen, rechnungen, angebote, leute, artikel]).then((ergebnisse) => {
        if (!gilt) return;
        setDaten(ergebnisse.flatMap((e) => (e.status === 'fulfilled' ? e.value : [])));
        setLaedt(false);
      });
    }, 250);
    return () => {
      gilt = false;
      clearTimeout(uhr);
    };
  }, [begriff, offen, user, company]);

  const b = begriff.trim();
  const treffer = useMemo(() => {
    const s = b ? seiten.filter((t) => passt(t.text, b) || (t.neben && passt(t.neben, b))) : seiten;
    return [...s, ...daten];
  }, [b, seiten, daten]);

  useEffect(() => {
    if (an >= treffer.length) setAn(0);
  }, [treffer.length, an]);

  if (!offen) return null;

  function oeffnen(t: Treffer) {
    onSchliessen();
    navigate(t.ziel);
  }

  function taste(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAn((i) => Math.min(i + 1, treffer.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAn((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && treffer[an]) {
      e.preventDefault();
      oeffnen(treffer[an]);
    }
  }

  const gruppen = GRUPPEN
    .map((g) => ({ g, liste: treffer.filter((t) => t.gruppe === g) }))
    .filter((x) => x.liste.length > 0);

  return (
    <div className="schleier" onClick={onSchliessen}>
      <div
        ref={fenster}
        className="suchfenster"
        role="dialog"
        aria-modal="true"
        aria-label="Suchen oder springen"
        onClick={(e) => e.stopPropagation()}
      >
        <ImFenster>
          <input
            className="suchfeld"
            autoFocus
            value={begriff}
            onChange={(e) => {
              setBegriff(e.target.value);
              setAn(0);
            }}
            onKeyDown={taste}
            placeholder="Seite, Kunde, Baustelle oder Nummer …"
            aria-label="Suchen oder springen"
            role="combobox"
            aria-expanded="true"
            aria-controls="such-liste"
            aria-activedescendant={treffer[an] ? `such-${treffer[an].schluessel}` : undefined}
          />
          <div className="such-liste" id="such-liste" role="listbox" aria-label="Treffer">
            {gruppen.map(({ g, liste }) => (
              <div key={g} role="group" aria-label={g}>
                <p className="such-gruppe" aria-hidden="true">{g}</p>
                {liste.map((t) => {
                  const i = treffer.indexOf(t);
                  return (
                    <div
                      key={t.schluessel}
                      id={`such-${t.schluessel}`}
                      role="option"
                      aria-selected={i === an}
                      className={i === an ? 'such-treffer-an' : 'such-treffer'}
                      onMouseEnter={() => setAn(i)}
                      onClick={() => oeffnen(t)}
                    >
                      <span className="such-text">
                        <span>{t.text}</span>
                        {t.zweite && <span className="such-zweite">{t.zweite}</span>}
                      </span>
                      {t.neben && <span className="such-nebeninfo">{t.neben}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
            {treffer.length === 0 && !laedt && <p className="such-leer">Nichts gefunden.</p>}
            {laedt && <p className="such-leer" role="status">Suche läuft …</p>}
          </div>
        </ImFenster>
      </div>
    </div>
  );
}
