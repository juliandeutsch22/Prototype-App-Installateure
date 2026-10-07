import type { ReactNode } from 'react';
import type { Freistellung, Vacation } from '@/types';
import BottomSheet from '@/components/BottomSheet';
import { LotVerlauf, type LotPunkt } from '@/components/LotBausteine';
import { datumAusMs } from '@/lib/datum';
import { todayStr } from '@/lib/time';
import { ART_NAME } from '@shared/freistellung';
import { freistellungWas, freistellungZeitraum, nachweisVermerk, ueberVermerk } from './freistellungText';
import { zeitraumText } from './abwesenheitText';

/**
 * EIN ANTRAG MIT SEINEM VERLAUF (Protokoll E8: „Urlaub und Anträge — Antrag
 * mit Lot“). Die Zeile in „Meine Anträge“ sagt den Stand; das Seitenfenster
 * sagt, wie es dazu kam: wann beantragt, wann und von wem entschieden, und
 * ob der Urlaub gerade läuft.
 *
 * NUR, WAS SCHON GELADEN IST. Ein Antrag trägt den Zeitpunkt des Antrags und
 * den der letzten Entscheidung — nicht jeden Zwischenstand. Wird ein
 * genehmigter Urlaub zurückgenommen, überschreibt die Rücknahme die
 * Genehmigung; der Verlauf zeigt dann „Beantragt“ und „Storniert“, nicht
 * mehr. Eine Geschichte, die die Datenbank nicht führt, wird hier nicht
 * erfunden.
 *
 * Die Handgriffe im Fenster sind dieselben wie in der Zeile (Zurückziehen,
 * Zurücknehmen, Nachweis) — der Aufrufer reicht sie als `children` herein.
 */

/** Seitenfenster mit Kopf (Zeitraum, Umfang, Stand), Lot und Handgriffen. */
function AntragFenster({
  offen,
  titel,
  zeitraum,
  umfang,
  stand,
  punkte,
  onClose,
  children,
}: {
  offen: boolean;
  titel: string;
  zeitraum: string;
  umfang: ReactNode;
  stand: ReactNode;
  punkte: LotPunkt[];
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <BottomSheet open={offen} onClose={onClose} label={titel} auchBreit titel={titel}>
      <div className="antrag-kopf">
        <p className="antrag-zeitraum">{zeitraum}</p>
        <p className="antrag-umfang">{umfang}</p>
        <div>{stand}</div>
      </div>
      <LotVerlauf name="Verlauf des Antrags" punkte={punkte} />
      {children && <div className="antrag-aktionen">{children}</div>}
    </BottomSheet>
  );
}

/** „am 03.10.2026“ aus einem Zeitpunkt — leer, wo ältere Anträge keinen tragen. */
const am = (ms?: number | null) => (ms ? datumAusMs(ms) : undefined);

/** Entschieden von wem, mit welchem Grund — in einer Zeile. */
const vonUndGrund = (name?: string | null, grund?: string | null) =>
  [name ? `von ${name}` : '', grund ? `„${grund}“` : ''].filter(Boolean).join(' — ') || undefined;

/** Urlaub oder Zeitausgleich: Antrag, Entscheidung, die freie Zeit selbst. */
export function UrlaubsantragFenster({
  antrag,
  umfang,
  stand,
  onClose,
  children,
}: {
  antrag: Vacation | null;
  /** Wie in der Zeile („10 Urlaubstage“, „ZA – 04:00 Std (13:00–17:00)“). */
  umfang: string;
  stand: ReactNode;
  onClose: () => void;
  children?: ReactNode;
}) {
  const v = antrag;
  const punkte: LotPunkt[] = [];
  if (v) {
    const za = v.art === 'Zeitausgleich';
    const heute = todayStr();
    if (v.betriebsurlaubId) {
      // Einen Betriebsurlaub beantragt niemand: er wird für alle eingetragen.
      punkte.push({
        titel: 'Betriebsurlaub eingetragen',
        zeit: am(v.entschiedenAm ?? v.createdAt),
        text: vonUndGrund(v.entschiedenVonName),
      });
    } else {
      punkte.push({ titel: 'Beantragt', zeit: am(v.createdAt), text: v.notiz || undefined });
      if (v.status === 'Beantragt') {
        punkte.push({
          titel: 'Entscheidung offen',
          text: 'Noch nicht entschieden — bitte noch nichts fix buchen.',
          jetzt: true,
        });
      } else {
        punkte.push({
          titel: v.status,
          zeit: am(v.entschiedenAm),
          text: vonUndGrund(v.entschiedenVonName, v.grund),
        });
      }
    }
    if (v.status === 'Genehmigt') {
      punkte.push({
        titel: za ? 'Zeitausgleich' : 'Urlaub',
        zeit: zeitraumText(v.von, v.bis),
        text: v.bis < heute ? 'vorbei' : v.von <= heute ? 'läuft' : undefined,
        jetzt: v.von <= heute && v.bis >= heute,
      });
    }
  }
  return (
    <AntragFenster
      offen={!!v}
      titel={v?.art === 'Zeitausgleich' ? 'Antrag auf Zeitausgleich' : 'Urlaubsantrag'}
      zeitraum={v ? zeitraumText(v.von, v.bis) : ''}
      umfang={umfang}
      stand={stand}
      punkte={punkte}
      onClose={onClose}
    >
      {children}
    </AntragFenster>
  );
}

/** Sonderurlaub, Pflegefreistellung, unbezahlter Urlaub: Antrag, Nachweis, Bestätigung. */
export function SonderurlaubFenster({
  antrag,
  anlaesse,
  stand,
  onClose,
  children,
}: {
  antrag: Freistellung | null;
  anlaesse?: Record<string, number> | null;
  stand: ReactNode;
  onClose: () => void;
  children?: ReactNode;
}) {
  const f = antrag;
  const punkte: LotPunkt[] = [];
  if (f) {
    const heute = todayStr();
    punkte.push({ titel: 'Beantragt', zeit: am(f.createdAt), text: f.notiz || undefined });
    const vermerk = nachweisVermerk(f);
    if (vermerk) punkte.push({ titel: 'Nachweis geprüft', zeit: am(f.nachweisGeprueftAm), text: vermerk });
    if (f.status === 'Beantragt') {
      punkte.push({
        titel: 'Bestätigung offen',
        text: f.nachweisPfad ? 'Nachweis liegt bei — wird nach der Entscheidung gelöscht.' : undefined,
        jetzt: true,
      });
    } else {
      const ueber = f.status === 'Bestätigt' ? ueberVermerk(f) : null;
      punkte.push({
        titel: f.status,
        zeit: am(f.entschiedenAm),
        text: [vonUndGrund(f.entschiedenVonName, f.grund), ueber].filter(Boolean).join(' · ') || undefined,
      });
    }
    if (f.status === 'Bestätigt') {
      punkte.push({
        titel: ART_NAME[f.art],
        zeit: freistellungZeitraum(f),
        text: f.bis < heute ? 'vorbei' : f.von <= heute ? 'läuft' : undefined,
        jetzt: f.von <= heute && f.bis >= heute,
      });
    }
  }
  return (
    <AntragFenster
      offen={!!f}
      titel="Antrag auf Sonderurlaub"
      zeitraum={f ? freistellungZeitraum(f) : ''}
      umfang={f ? freistellungWas(f, anlaesse) : ''}
      stand={stand}
      punkte={punkte}
      onClose={onClose}
    >
      {children}
    </AntragFenster>
  );
}
