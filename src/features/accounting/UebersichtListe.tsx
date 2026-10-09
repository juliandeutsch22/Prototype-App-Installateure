import { useState } from 'react';
import { MehrAnzeigen } from '@/components/LotBausteine';
import type { AppUser } from '@/types';
import type { Tageswert } from './tagesauswertung';
import { Streifen, StreifenFeld, StreifenKopf, WochenKopf, WochenZellen } from './Streifen';

/** Eine Zeile der Liste — was die Seite aus `calcMonthStats`, der Vollständigkeit und der Tagesauswertung hat. */
export interface UebersichtZeile {
  user: AppUser;
  /** „3 Tage ohne Buchung“ (Bernstein) bzw. „Facharbeiter · vollständig“ (grau). */
  status: string;
  achtung: boolean;
  /** Die Tage des Streifens bzw. der Woche. */
  werte: Tageswert[];
  /** Offene Tage — danach wird gruppiert und sortiert. */
  offen: number;
  gebucht: string;
  soll: string;
  saldo: string;
}

/** Je Gruppe höchstens so viele Zeilen, dann „und N weitere anzeigen“ (Protokoll Regel 4). */
const GRUPPE_HOECHSTENS = 20;

/**
 * DIE LISTE DER MITARBEITERÜBERSICHT (Runde 4, Auftrag 3.3 und 3.4): eine
 * Zeile je Person — Name und Stand, der Monat als Streifen bzw. die Woche,
 * daneben die Summen. Oben die Personen mit Tagen ohne Buchung (absteigend),
 * darunter die vollständigen.
 *
 * DIE GANZE ZEILE ÖFFNET DAS SEITENFENSTER der Person, ein Feld öffnet es mit
 * diesem Tag. Für die Tastatur ist der Name der Knopf; die Felder sind eine
 * eigene Reihe (← →).
 */
export default function UebersichtListe({
  ansicht,
  tage,
  heute,
  zeilen,
  imSupport,
  onOeffnen,
}: {
  ansicht: 'monat' | 'woche';
  tage: string[];
  heute: string;
  zeilen: UebersichtZeile[];
  imSupport: boolean;
  onOeffnen: (uid: string, tag: string | null) => void;
}) {
  const woche = ansicht === 'woche';
  const mitLuecken = zeilen
    .filter((z) => z.offen > 0)
    .sort((a, b) => b.offen - a.offen || a.user.name.localeCompare(b.user.name, 'de'));
  const vollstaendig = zeilen.filter((z) => z.offen === 0);

  return (
    <div className={woche ? 'ue-liste-woche' : 'ue-liste'}>
      {!imSupport && (
        <div className={woche ? 'mw-kopfzeile' : 'ue-kopfzeile'} aria-hidden="true">
          <p className="ue-kopf-person">Person</p>
          {woche ? <WochenKopf tage={tage} heute={heute} /> : <StreifenKopf tage={tage} heute={heute} />}
          <p className="ue-kopf-zahl">Gebucht</p>
          <p className="ue-kopf-zahl">Soll bisher</p>
          <p className="ue-kopf-zahl">{woche ? 'Saldo' : 'Saldo Monat'}</p>
        </div>
      )}
      {imSupport ? (
        <Gruppe titel={null} zeilen={zeilen} {...{ woche, heute, imSupport, onOeffnen }} />
      ) : (
        <>
          {mitLuecken.length > 0 && (
            <Gruppe
              titel={`${woche ? 'Mit Tagen ohne Buchung in dieser Woche' : 'Mit Tagen ohne Buchung'} · ${mitLuecken.length}`}
              zeilen={mitLuecken}
              {...{ woche, heute, imSupport, onOeffnen }}
            />
          )}
          {vollstaendig.length > 0 && (
            <Gruppe
              titel={`Vollständig · ${vollstaendig.length}`}
              zeilen={vollstaendig}
              {...{ woche, heute, imSupport, onOeffnen }}
            />
          )}
          <Legende woche={woche} />
        </>
      )}
    </div>
  );
}

function Gruppe({
  titel,
  zeilen,
  woche,
  heute,
  imSupport,
  onOeffnen,
}: {
  titel: string | null;
  zeilen: UebersichtZeile[];
  woche: boolean;
  heute: string;
  imSupport: boolean;
  onOeffnen: (uid: string, tag: string | null) => void;
}) {
  const [alle, setAlle] = useState(false);
  const sichtbar = alle ? zeilen : zeilen.slice(0, GRUPPE_HOECHSTENS);
  return (
    <section aria-label={titel ?? 'Personen'}>
      {titel && <h3 className="ue-gruppe">{titel}</h3>}
      {sichtbar.map((z) =>
        imSupport ? (
          <div key={z.user.uid} className="ue-zeile-einfach" onClick={() => onOeffnen(z.user.uid, null)}>
            <button type="button" className="ue-person" onClick={(e) => { e.stopPropagation(); onOeffnen(z.user.uid, null); }}>
              <span className="ue-name">{z.user.name}</span>
              <span className="ue-status">{z.status}</span>
            </button>
          </div>
        ) : (
          <Zeile key={z.user.uid} zeile={z} woche={woche} heute={heute} onOeffnen={onOeffnen} />
        ),
      )}
      {zeilen.length > GRUPPE_HOECHSTENS && !alle && (
        <MehrAnzeigen anzahl={zeilen.length - GRUPPE_HOECHSTENS} onClick={() => setAlle(true)} />
      )}
    </section>
  );
}

function Zeile({
  zeile: z,
  woche,
  heute,
  onOeffnen,
}: {
  zeile: UebersichtZeile;
  woche: boolean;
  heute: string;
  onOeffnen: (uid: string, tag: string | null) => void;
}) {
  const oeffneTag = (tag: string) => onOeffnen(z.user.uid, tag);
  return (
    // Die Zeile ist für die Maus EIN Ziel; die Tastatur nimmt den Namen (ein Knopf).
    <div className={woche ? 'mw-zeile' : 'ue-zeile'} onClick={() => onOeffnen(z.user.uid, null)}>
      <button
        type="button"
        className="ue-person"
        onClick={(e) => {
          e.stopPropagation();
          onOeffnen(z.user.uid, null);
        }}
      >
        <span className="ue-name">{z.user.name}</span>
        <span className={z.achtung ? 'ue-status-achtung' : 'ue-status'}>{z.status}</span>
      </button>
      {woche ? (
        <WochenZellen name={z.user.name} werte={z.werte} heute={heute} onTag={oeffneTag} />
      ) : (
        <Streifen name={z.user.name} werte={z.werte} heute={heute} onTag={oeffneTag} />
      )}
      <p className="ue-zahl">
        <span className="ue-zahl-name">Gebucht</span>
        {z.gebucht}
      </p>
      <p className="ue-zahl">
        <span className="ue-zahl-name">Soll bisher</span>
        {z.soll}
      </p>
      <p className="ue-zahl-stark">
        <span className="ue-zahl-name">{woche ? 'Saldo' : 'Saldo Monat'}</span>
        {z.saldo}
      </p>
    </div>
  );
}

/** Die Legende in Wörtern — sie ersetzt die Kürzel-Legende des Rasters (Auftrag 3.3.1). */
function Legende({ woche }: { woche: boolean }) {
  if (woche) {
    return (
      <p className="ue-legende">
        Stunden je Tag mit Von–Bis · Abwesenheiten als Wort · Zelle antippen öffnet den Tag
      </p>
    );
  }
  const eintraege: Array<[Tageswert['zustand'], string]> = [
    ['ok', 'gebucht'],
    ['fehlt', 'Arbeitstag ohne Buchung'],
    ['weg', 'abwesend (Urlaub, Krank, Schule …)'],
    ['frei', 'Wochenende, Feiertag'],
    ['grenze', 'Arbeitszeitgrenze überschritten'],
  ];
  return (
    <div className="ue-legende">
      <ul className="ue-legende-liste">
        {eintraege.map(([zustand, wort]) => (
          <li key={zustand} className="ue-legende-punkt">
            <StreifenFeld zustand={zustand} />
            {wort}
          </li>
        ))}
      </ul>
      <p>Darüberfahren zeigt Stunden und Soll · Tag antippen öffnet ihn</p>
    </div>
  );
}
