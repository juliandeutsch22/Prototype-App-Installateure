import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { canAccess, navForRole, unterseitenFuer, zusatzrechte } from './navigation';
import { istOben, useFokusFalle } from '@/components/fokusFalle';
import { ImFenster } from '@/components/imFenster';
import { useHintergrundSperre } from '@/components/hintergrundSperre';
import { searchCustomers } from '@/lib/db/customers';
import { searchProjects } from '@/lib/db/projects';
import { baustellenTitel } from '@/lib/baustellenTitel';

/**
 * „SUCHEN ODER SPRINGEN“ (Strg + K, Linie „Lot“, Protokoll Abschnitt 5).
 *
 * ZUSÄTZLICH, KEIN ERSATZ: jeder bisherige Weg bleibt. Das Fenster kennt
 * genau die Seiten und Unterseiten, die die Rolle in der Navigation hat —
 * dieselbe Quelle (`navigation.ts`), damit es keine Tür öffnet, die das Menü
 * nicht hat. Kunden und Baustellen sucht es in der Datenbank, und nur, wenn
 * die Rolle die Liste sehen darf; was sie dort sehen darf, entscheidet wie
 * überall der Zeilenschutz.
 */

interface Treffer {
  schluessel: string;
  gruppe: 'Seiten' | 'Kunden' | 'Baustellen';
  text: string;
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
  useFokusFalle(fenster, offen, { zurueckGeben: true });
  // Die Seite dahinter steht still, solange das Suchfenster offen ist.
  useHintergrundSperre(offen);

  const seiten = useMemo<Treffer[]>(() => {
    if (!user) return [];
    const zusatz = zusatzrechte(user, company);
    const schalter = { wochenplanFuerAlle: !!company?.wochenplanFuerAlle };
    return navForRole(user.role, company?.modules, zusatz).flatMap((item) => [
      { schluessel: item.path, gruppe: 'Seiten' as const, text: item.label, ziel: item.path },
      ...unterseitenFuer(item.path, user.role, schalter).map((u) => ({
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
      const baustellen = canAccess(user.role, '/admin-projects', company?.modules, zusatz)
        ? searchProjects(user.companyId, b, HOECHSTENS).then((ps) =>
            ps.map<Treffer>((p) => ({
              schluessel: `b-${p.id}`, gruppe: 'Baustellen', text: baustellenTitel(p) || p.projectNumber, neben: p.projectNumber, ziel: `/admin-projects/${p.id}`,
            })))
        : Promise.resolve([]);
      void Promise.allSettled([kunden, baustellen]).then((ergebnisse) => {
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

  const gruppen = (['Seiten', 'Kunden', 'Baustellen'] as const)
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
            placeholder="Seite, Kunde oder Baustelle …"
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
                      <span>{t.text}</span>
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
