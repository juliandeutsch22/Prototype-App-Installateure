import { useEffect, useId, useMemo, useState } from 'react';
import type { Project } from '@/types';
import Icon from '@/components/Icon';
import IconButton from '@/components/IconButton';
import { MehrAnzeigen } from '@/components/LotBausteine';
import type { Last } from './umplanen';
import { ABLAGE_SUCHE_AB, ablageTreffer, ablageZuLesen, ablageZuMerken } from './ablage';

/** So viele Baustellen stehen auf einmal in der Liste; der Rest kommt mit „weitere anzeigen“. */
const ABLAGE_SEITE = 20;

type Griff = (last: Last) => Record<string, unknown>;

/**
 * NOCH EINZUPLANEN ALS SCHUBLADE NEBEN DEM RASTER (E88, umgebaut in E96 am
 * 17.11.2026), nur am Schreibtisch. Von hier zieht man eine Baustelle auf
 * Person und Tag; ein Klick tut, was der Eintrag im Fenster tut. Am Tablet
 * und Handy bleibt die Hinweiszeile mit dem Fenster „Noch einzuplanen …“:
 * dort fehlte dem Raster die Breite (Auftrag 4.1).
 *
 * - SO HOCH WIE DAS RASTER, NICHT HÖHER (`lot-planung.css`): die Liste rollt
 *   in sich. Vorher wuchs die Spalte mit jeder Baustelle (15 Baustellen:
 *   1.300 px neben 400 px Raster), und von unten aus war das Raster weg.
 * - ZWEI ZEILEN STATT DREI: Kunde und Kurzbezeichnung oben, Nummer darunter.
 * - EIN SUCHFELD ab neun Baustellen: Kunde, Nummer, Kurzbezeichnung.
 * - EINKLAPPBAR zu einer schmalen Leiste mit der Zahl; das Raster bekommt
 *   die volle Breite (Samstag und Sonntag ohne seitliches Rollen). Bleibt je
 *   Person auf diesem Gerät gemerkt.
 */
export default function PlanungsAblage({
  baustellen,
  griff,
  onEinplanen,
  name,
  mitNummer,
  uid,
}: {
  baustellen: Project[];
  griff: Griff;
  onEinplanen: (p: Project) => void;
  /** Der sichtbare Name (Kunde, sonst Nummer). */
  name: (p: Project) => string;
  /** Name mit Nummer, wie in jeder Auswahl — für die Vorlesehilfe. */
  mitNummer: (p: Project) => string;
  uid: string;
}) {
  const [zu, setZu] = useState(() => ablageZuLesen(uid));
  const [suche, setSuche] = useState('');
  const [gezeigt, setGezeigt] = useState(ABLAGE_SEITE);
  const listeId = useId();
  const sucheId = useId();

  // Eine neue Suche beginnt wieder oben — sonst stünde „weitere anzeigen“ für eine Liste, die es nicht mehr gibt.
  useEffect(() => setGezeigt(ABLAGE_SEITE), [suche]);

  const mitSuche = baustellen.length >= ABLAGE_SUCHE_AB;
  const treffer = useMemo(() => (mitSuche ? ablageTreffer(baustellen, suche) : baustellen), [baustellen, mitSuche, suche]);

  const umschalten = () => {
    setZu((alt) => {
      ablageZuMerken(uid, !alt);
      return !alt;
    });
  };

  if (zu) {
    return (
      <aside className="planung-ablage" data-zu="" aria-label="Noch einzuplanen">
        <IconButton label={`Noch einzuplanen (${baustellen.length}) aufklappen`} aria-expanded={false} onClick={umschalten}>
          <Icon name="zurueck" size={18} />
        </IconButton>
        <span className="planung-ablage-zahl" aria-hidden="true">{baustellen.length}</span>
        <span className="planung-ablage-senkrecht" aria-hidden="true">Noch einzuplanen</span>
      </aside>
    );
  }

  return (
    <aside className="planung-ablage" aria-label="Noch einzuplanen">
      <div className="planung-ablage-kopf">
        <h2 className="planung-ablage-titel">Noch einzuplanen</h2>
        <IconButton label="Noch einzuplanen einklappen" aria-expanded aria-controls={listeId} onClick={umschalten}>
          <Icon name="weiter" size={18} />
        </IconButton>
      </div>
      {/* Die Zahl unter dem Titel, nicht daneben: vierstellig passte sie mit dem Knopf nicht in die Breite. */}
      <p className="planung-ablage-hinweis">
        <span className="planung-ablage-zahl">{baustellen.length}</span> {baustellen.length === 1 ? 'Baustelle' : 'Baustellen'} · auf Person und Tag ziehen
      </p>
      {mitSuche && (
        <div className="listenleiste-suche planung-ablage-suche">
          <Icon name="lupe" size={18} aria-hidden="true" />
          <input
            id={sucheId}
            type="search"
            aria-label="Noch einzuplanen durchsuchen"
            placeholder="Baustelle suchen"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
        </div>
      )}
      <div className="planung-ablage-liste" id={listeId}>
        {treffer.length === 0 ? (
          <p className="planung-ablage-leer">Keine Baustelle passt zu „{suche.trim()}“.</p>
        ) : (
          <ul>
            {treffer.slice(0, gezeigt).map((p) => {
              const bezeichnung = p.bezeichnung?.trim();
              return (
                <li key={p.projectNumber}>
                  <button
                    type="button"
                    className="ablage-baustelle"
                    {...griff({ art: 'baustelle', nummer: p.projectNumber, titel: name(p) })}
                    onClick={() => onEinplanen(p)}
                    aria-label={`${mitNummer(p)} einplanen`}
                    title={mitNummer(p)}
                  >
                    <span className="ablage-zeile">
                      <span className="e-titel">{name(p)}</span>
                      {/* Die Kurzbezeichnung neben dem Kunden (C3, E91): „Bad“ und „Heizung“ desselben Kunden. */}
                      {bezeichnung && <span className="e-zeile">{bezeichnung}</span>}
                    </span>
                    <span className="e-zeile mono">{p.projectNumber}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <MehrAnzeigen anzahl={Math.max(0, treffer.length - gezeigt)} onClick={() => setGezeigt((n) => n + ABLAGE_SEITE)} />
      </div>
    </aside>
  );
}
