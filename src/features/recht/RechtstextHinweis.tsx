import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import Button from '@/components/Button';
import Icon from '@/components/Icon';
import { datumAusMs } from '@/lib/datum';
import {
  rechtstexteAktuell, verarbeiterAenderungen, verarbeiterZurKenntnisNehmen, type VerarbeiterAenderung,
} from '@/lib/db/rechtstexte';
import type { GeltendeTexte } from './rechtstext';

/**
 * WENN SICH AN DEN RECHTSTEXTEN ETWAS ÄNDERT, ERFÄHRT ES, WEN ES ANGEHT
 * (04.11.2026, E45). Eine Zeile oben im Inhalt, in zwei Fällen:
 *
 * 1. NEUE UNTERAUFTRAGSVERARBEITER — an Geschäftsführung und Administration
 *    jedes Betriebs. Der Betreiber ist Auftragsverarbeiter des Betriebs und
 *    muss ihn über jeden neuen Unterauftragsverarbeiter informieren, damit
 *    er Einspruch erheben kann (Art. 28 Abs. 2 DSGVO). Die Zeile bleibt, bis
 *    jemand aus der Leitung „Zur Kenntnis genommen“ tippt; festgehalten wird
 *    nur der Zeitpunkt am Betrieb, nicht wer (Datenminimierung).
 *
 * 2. EINE GEÄNDERTE DATENSCHUTZERKLÄRUNG, wenn der Betreiber beim
 *    Veröffentlichen „Alle hinweisen“ gewählt hat — an jeden, der die App
 *    benutzt und schon vor der Änderung ein Konto hatte. Ob jemand sie
 *    gesehen hat, merkt sich NUR SEIN GERÄT: wer welchen Hinweis gelesen hat,
 *    wäre ein neues Datum über jede Person, ohne dass es jemand braucht. Auf
 *    einem zweiten Gerät erscheint der Hinweis deshalb ein zweites Mal.
 *
 * Während einer Supportsitzung nicht: die Hinweise gelten dem Betrieb.
 */

const GESEHEN = (uid: string) => `senklot.datenschutz.gesehen:${uid}`;
const ZEITPUNKT = (iso: string) => datumAusMs(Date.parse(iso));

function gesehenBis(uid: string): number {
  try {
    return Number(window.localStorage.getItem(GESEHEN(uid)) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function alsGesehen(uid: string, nummer: number) {
  try {
    window.localStorage.setItem(GESEHEN(uid), String(nummer));
  } catch {
    // Ohne Speicher (privates Fenster) erscheint der Hinweis beim nächsten Laden wieder — kein Schaden.
  }
}

export default function RechtstextHinweis() {
  const { user, einblick } = useAuth();
  const [texte, setTexte] = useState<GeltendeTexte | null>(null);
  const [aenderungen, setAenderungen] = useState<VerarbeiterAenderung[]>([]);
  const [gesehen, setGesehen] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const leitung = user?.role === 'Geschäftsführung' || user?.role === 'Administrator';
  const uid = user?.uid ?? '';

  const nachsehen = useCallback(async () => {
    if (!uid) return;
    try {
      const [t, a] = await Promise.all([rechtstexteAktuell(), leitung ? verarbeiterAenderungen() : Promise.resolve([])]);
      setTexte(t);
      setAenderungen(a);
      setGesehen(gesehenBis(uid));
    } catch {
      // Ein Hinweis, der nicht geladen werden kann, fehlt eben; die Seiten selbst sind erreichbar.
    }
  }, [uid, leitung]);

  useEffect(() => {
    void nachsehen();
    // Eine Fassung kann erscheinen, während die App offen ist: beim Zurückkehren nachsehen.
    const sichtbar = () => {
      if (document.visibilityState === 'visible') void nachsehen();
    };
    document.addEventListener('visibilitychange', sichtbar);
    return () => document.removeEventListener('visibilitychange', sichtbar);
  }, [nachsehen]);

  if (!user || einblick) return null;

  if (aenderungen.length > 0) {
    const namen = [...new Set(aenderungen.flatMap((a) => a.neueVerarbeiter))];
    const seit = aenderungen[0].veroeffentlichtAm;
    const email = texte?.betreiber?.inhalt.email.trim();
    return (
      <div className="rechtshinweis" role="status">
        <Icon name="hinweis" size={16} aria-hidden="true" />
        <p className="rechtshinweis-text">
          <b>Neue Unterauftragsverarbeiter bei Senklot</b> seit {ZEITPUNKT(seit)}: {namen.join(', ')}.{' '}
          {email ? `Einwände an den Betreiber: ${email}.` : 'Einwände an den Betreiber (Kontakt im Impressum).'}
          {fehler && <span className="text-danger"> {fehler}</span>}
        </p>
        <span className="rechtshinweis-aktionen">
          <Link to="/datenschutz" className="link">Datenschutzerklärung</Link>
          <Button
            variant="secondary"
            groesse="klein"
            loading={laeuft}
            onClick={async () => {
              setLaeuft(true);
              setFehler(null);
              try {
                await verarbeiterZurKenntnisNehmen();
                // Wer die Änderung zur Kenntnis nimmt, hat die neue Erklärung gesehen.
                if (texte?.datenschutz) {
                  alsGesehen(uid, texte.datenschutz.nummer);
                  setGesehen(texte.datenschutz.nummer);
                }
                setAenderungen([]);
              } catch (e) {
                setFehler(e instanceof Error ? e.message : String(e));
              } finally {
                setLaeuft(false);
              }
            }}
          >
            Zur Kenntnis genommen
          </Button>
        </span>
      </div>
    );
  }

  const ds = texte?.datenschutz;
  const kontoSeit = (user as { createdAt?: number }).createdAt;
  const zeigen = !!ds && ds.hinweisen && ds.nummer > gesehen
    && !(typeof kontoSeit === 'number' && kontoSeit >= Date.parse(ds.veroeffentlichtAm));
  if (!zeigen || !ds) return null;
  const schliessen = () => {
    alsGesehen(uid, ds.nummer);
    setGesehen(ds.nummer);
  };
  return (
    <div className="rechtshinweis" role="status">
      <Icon name="hinweis" size={16} aria-hidden="true" />
      <p className="rechtshinweis-text">Die Datenschutzerklärung wurde am {ZEITPUNKT(ds.veroeffentlichtAm)} geändert.</p>
      <span className="rechtshinweis-aktionen">
        <Link to="/datenschutz" className="link" onClick={schliessen}>Ansehen</Link>
        <Button variant="ghost" groesse="klein" onClick={schliessen}>Ausblenden</Button>
      </span>
    </div>
  );
}
