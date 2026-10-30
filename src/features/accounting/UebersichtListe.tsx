import { useState } from 'react';
import { MehrAnzeigen } from '@/components/LotBausteine';
import Abschnitt from '@/components/Abschnitt';
import { Zustand } from '@/components/Badge';
import { Saldolinie } from '@/components/Planlinie';
import { saldoMassstab } from './saldoMassstab';
import type { AppUser } from '@/types';
import type { Tageswert } from './tagesauswertung';
import { Streifen, StreifenFeld, StreifenKopf, WochenKopf, WochenZellen } from './Streifen';

/** Eine Zeile der Liste — was die Seite aus `calcMonthStats`, der Vollständigkeit und der Tagesauswertung hat. */
export interface UebersichtZeile {
  user: AppUser;
  /** „3 Tage ohne Buchung“ (Bernstein) bzw. „Facharbeiter · vollständig“ (grau). */
  status: string;
  achtung: boolean;
  /** Bereits vorhandene Grenzprüfung, auch wenn keine Buchung fehlt. */
  grenze?: boolean;
  /** Die Tage des Streifens bzw. der Woche. */
  werte: Tageswert[];
  /** Offene Tage — danach wird gruppiert und sortiert. */
  offen: number;
  gebucht: string;
  soll: string;
  saldo: string;
  /** Der Saldo seit dem Eintritt — nur im Personenvergleich, wo Zeitkonten nebeneinander stehen. */
  gesamt?: string;
  /** Derselbe Gesamtsaldo in Minuten, für die Saldolinie; `null`, solange er lädt oder fehlt. */
  gesamtMinuten?: number | null;
}

/** Die Summenzeile unter der Liste: gebucht und Soll aller Personen, wie sie die Seite schon zählt. */
export interface UebersichtSumme {
  text: string;
  gebucht: string;
  soll: string;
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
  tageZeigen = false,
  summe,
  onOeffnen,
}: {
  ansicht: 'monat' | 'woche';
  tage: string[];
  heute: string;
  zeilen: UebersichtZeile[];
  imSupport: boolean;
  /** Der Vergleich beginnt bei Personen; die einzelnen Monatstage bleiben zuschaltbar. */
  tageZeigen?: boolean;
  /** Die Summenzeile unter den Personen (Stückliste); im Supportzugang keine. */
  summe?: UebersichtSumme;
  onOeffnen: (uid: string, tag: string | null) => void;
}) {
  const woche = ansicht === 'woche';
  const vergleich = !woche && !tageZeigen;
  const mitLuecken = zeilen
    .filter((z) => z.offen > 0)
    .sort((a, b) => b.offen - a.offen || a.user.name.localeCompare(b.user.name, 'de'));
  const vollstaendig = zeilen.filter((z) => z.offen === 0);
  const massstab = vergleich ? saldoMassstab(zeilen.map((z) => z.gesamtMinuten)) : 0;
  const zeilenKlasse = woche ? 'mw-zeile' : vergleich ? 'ue-vergleich-zeile' : 'ue-zeile';

  return (
    <div className={woche ? 'ue-liste-woche' : vergleich ? 'ue-vergleich' : 'ue-liste'}>
      {!imSupport && (
        <div className={woche ? 'mw-kopfzeile' : vergleich ? 'ue-vergleich-kopf' : 'ue-kopfzeile'} aria-hidden="true">
          <p className="ue-kopf-person">Person</p>
          {woche ? <WochenKopf tage={tage} heute={heute} /> : vergleich ? <p className="ue-kopf-person">Zu prüfen / Stand</p> : <StreifenKopf tage={tage} heute={heute} />}
          <p className="ue-kopf-zahl">Gebucht</p>
          <p className="ue-kopf-zahl">Soll bisher</p>
          <p className="ue-kopf-zahl">{woche ? 'Saldo' : 'Saldo Monat'}</p>
          {/* Mit weicher Trennstelle: am Tablet ist die Spalte schmaler als das Wort (Runde 6, G8). */}
          {vergleich && <p className="ue-kopf-zahl">Gesamt&shy;saldo</p>}
        </div>
      )}
      {imSupport ? (
        <Gruppe titel={null} zeilen={zeilen} {...{ woche, vergleich, heute, imSupport, onOeffnen }} />
      ) : (
        <>
          {mitLuecken.length > 0 && (
            <Gruppe
              titel={woche ? 'Mit Tagen ohne Buchung in dieser Woche' : 'Mit Tagen ohne Buchung'}
              anzahl={mitLuecken.length}
              zeilen={mitLuecken}
              {...{ woche, vergleich, heute, imSupport, massstab, onOeffnen }}
            />
          )}
          {vollstaendig.length > 0 && (
            <Gruppe
              titel="Vollständig"
              anzahl={vollstaendig.length}
              zeilen={vollstaendig}
              {...{ woche, vergleich, heute, imSupport, massstab, onOeffnen }}
            />
          )}
          {summe && <Summenzeile klasse={zeilenKlasse} summe={summe} vergleich={vergleich} />}
          {!vergleich && <Legende woche={woche} mitZukunft={zeilen.some((z) => z.werte.some((t) => t.zustand === 'zukunft'))} />}
          {vergleich && zeilen.some((z) => z.gesamtMinuten != null) && (
            <p className="ue-massstab">
              Gesamtsaldo als Strecke um die Nulllinie: links Minusstunden, rechts Plusstunden. Maßstab: halbe Breite = {massstab} Std.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * DIE SUMMENZEILE wie in einer Stückliste (Planlinie B6): dasselbe Raster wie
 * die Zeilen darüber, gebucht und Soll über einer Doppellinie. Sie steht für
 * ALLE Personen, auch wenn ein Filter Zeilen ausblendet — die Summe des
 * Betriebs ändert sich nicht, weil man weniger ansieht. Deshalb steht
 * „Alle Personen“ davor.
 */
function Summenzeile({ klasse, summe, vergleich }: { klasse: string; summe: UebersichtSumme; vergleich: boolean }) {
  return (
    <section className={`${klasse} ue-summe`} aria-label="Gesamt aller Personen">
      <p className="ue-summe-name">{summe.text}</p>
      <span className="ue-summe-leer" aria-hidden="true" />
      <div className="ue-buchungen">
        <p className="ue-zahl">
          <span className="ue-zahl-name">Gebucht</span>
          {summe.gebucht}
        </p>
        <p className="ue-zahl">
          <span className="ue-zahl-name">Soll bisher</span>
          {summe.soll}
        </p>
      </div>
      <span className="ue-summe-leer" aria-hidden="true" />
      {vergleich && <span className="ue-summe-leer" aria-hidden="true" />}
    </section>
  );
}

function Gruppe({
  titel,
  anzahl,
  zeilen,
  woche,
  vergleich,
  heute,
  imSupport,
  massstab = 0,
  onOeffnen,
}: {
  titel: string | null;
  anzahl?: number;
  zeilen: UebersichtZeile[];
  woche: boolean;
  vergleich: boolean;
  heute: string;
  imSupport: boolean;
  massstab?: number;
  onOeffnen: (uid: string, tag: string | null) => void;
}) {
  const [alle, setAlle] = useState(false);
  const sichtbar = alle ? zeilen : zeilen.slice(0, GRUPPE_HOECHSTENS);
  return (
    <section aria-label={titel ?? 'Personen'}>
      {/* Die Anzahl im Achskreis vor dem Titel (Planlinie B5) statt „Vollständig · 3“. */}
      {titel && <Abschnitt titel={titel} anzahl={anzahl} />}
      {sichtbar.map((z) =>
        imSupport ? (
          <div key={z.user.uid} className="ue-zeile-einfach" onClick={() => onOeffnen(z.user.uid, null)}>
            <button type="button" className="ue-person" onClick={(e) => { e.stopPropagation(); onOeffnen(z.user.uid, null); }}>
              <span className="ue-name">{z.user.name}</span>
              <span className="ue-status">{z.status}</span>
            </button>
          </div>
        ) : (
          <Zeile key={z.user.uid} zeile={z} woche={woche} vergleich={vergleich} heute={heute} massstab={massstab} onOeffnen={onOeffnen} />
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
  vergleich,
  heute,
  massstab,
  onOeffnen,
}: {
  zeile: UebersichtZeile;
  woche: boolean;
  vergleich: boolean;
  heute: string;
  massstab: number;
  onOeffnen: (uid: string, tag: string | null) => void;
}) {
  const oeffneTag = (tag: string) => onOeffnen(z.user.uid, tag);
  return (
    // Die Zeile ist für die Maus EIN Ziel; die Tastatur nimmt den Namen (ein Knopf).
    <div className={woche ? 'mw-zeile' : vergleich ? 'ue-vergleich-zeile' : 'ue-zeile'} onClick={() => onOeffnen(z.user.uid, null)}>
      <button
        type="button"
        className="ue-person"
        onClick={(e) => {
          e.stopPropagation();
          onOeffnen(z.user.uid, null);
        }}
      >
        <span className="ue-name">{z.user.name}</span>
        {/* Tage ohne Buchung mit dem Zeichen „Achtung“ (Planlinie B3); der Stand sonst bleibt leiser Text. */}
        {!vergleich && (z.achtung ? (
          <span className="ue-status-achtung"><Zustand stand="achtung">{z.status}</Zustand></span>
        ) : (
          <span className="ue-status">{z.status}</span>
        ))}
      </button>
      {woche ? (
        <WochenZellen name={z.user.name} werte={z.werte} heute={heute} onTag={oeffneTag} />
      ) : vergleich ? (
        <p className="ue-pruefstand">
          {z.achtung ? <Zustand stand="achtung">{z.status}</Zustand> : z.status}
          {z.grenze && <span className="ue-grenzhinweis"><Zustand stand="achtung">Arbeitszeitgrenze prüfen</Zustand></span>}
        </p>
      ) : (
        <Streifen name={z.user.name} werte={z.werte} heute={heute} onTag={oeffneTag} />
      )}
      <div className="ue-buchungen">
        <p className="ue-zahl">
          <span className="ue-zahl-name">Gebucht</span>
          {z.gebucht}
        </p>
        <p className="ue-zahl">
          <span className="ue-zahl-name">Soll bisher</span>
          {z.soll}
        </p>
      </div>
      <p className="ue-zahl-stark">
        <span className="ue-zahl-name">{woche ? 'Saldo' : 'Saldo Monat'}</span>
        {z.saldo}
      </p>
      {/*
        DER GESAMTSALDO NUR IM VERGLEICH (19.10.2026): dort stehen die
        Zeitkonten nebeneinander. Im Tagesstreifen und in der Woche nähme
        eine vierte Zahl den Tagen den Platz.
      */}
      {vergleich && (
        <p className="ue-zahl-stark ue-gesamtsaldo">
          <span className="ue-zahl-name">Gesamtsaldo</span>
          {/*
            DIE SALDOLINIE (Planlinie B2a) neben der Zahl, nie statt ihr: um
            die Nulllinie, im Maßstab, den die Liste unten nennt. Die Zahl
            daneben bleibt, was vorgelesen und verglichen wird.
          */}
          {z.gesamtMinuten != null && massstab > 0 && (
            <Saldolinie
              minuten={z.gesamtMinuten}
              massstabMinuten={massstab * 60}
              name={`Gesamtsaldo ${z.gesamt ?? ''} Stunden, Maßstab halbe Breite ${massstab} Stunden`}
            />
          )}
          <span className="ue-gesamtsaldo-zahl">{z.gesamt ?? '—'}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Die Legende in Wörtern — sie ersetzt die Kürzel-Legende des Rasters (Auftrag 3.3.1).
 *
 * EINE ZEILE, KURZE WÖRTER (Wunsch des Betriebs, 09.10.2026): am Handy nahm
 * sie mit fünf Zeilen und einem Satz fast einen Bildschirm ein. Was die
 * Wörter umfassen und wie man den Streifen bedient, steht in „Hilfe zu dieser
 * Seite“. Die Woche braucht keine: ihre Zellen tragen Stunden und Wörter.
 */
function Legende({ woche, mitZukunft }: { woche: boolean; mitZukunft: boolean }) {
  if (woche) return null;
  const eintraege: Array<[Tageswert['zustand'], string]> = [
    ['ok', 'gebucht'],
    ['fehlt', 'ohne Buchung'],
    ['weg', 'abwesend'],
    ['frei', 'frei'],
    // Nur, wo der Streifen kommende Tage zeigt — im vergangenen Monat gibt es keine (Runde 6, G13).
    ...(mitZukunft ? [['zukunft', 'kommt noch'] as [Tageswert['zustand'], string]] : []),
    ['grenze', 'Grenze überschritten'],
  ];
  return (
    <ul className="ue-legende" aria-label="Legende">
      {eintraege.map(([zustand, wort]) => (
        <li key={zustand} className="ue-legende-punkt">
          <StreifenFeld zustand={zustand} />
          {wort}
        </li>
      ))}
    </ul>
  );
}
