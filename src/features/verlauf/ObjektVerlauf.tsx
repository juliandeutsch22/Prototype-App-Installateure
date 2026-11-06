import { useState } from 'react';
import { LotVerlauf } from '@/components/LotBausteine';
import Button from '@/components/Button';
import { datumAT } from '@/lib/datum';
import { listObjektVerlauf, type Objektart, type ObjektVerlaufZeile, type VerlaufZeiger } from '@/lib/db/objektVerlauf';
import { JOURNAL_SEIT, verlaufEintrag, type VerlaufKontext } from './objektVerlaufText';

type Akte = Exclude<Objektart, 'zahlung'>;

interface Eigenschaften {
  companyId: string;
  objektart: Akte;
  objektId: string;
  /** Namen zu Kennungen der Belegschaft (Team und Projektleitung einer Baustelle). */
  name?: VerlaufKontext['name'];
  /** `akte`: in einer Karte neben einem anderen Aufklapper derselben Art (Baustelle). */
  stil?: 'weiteres' | 'akte';
}

/**
 * DER VERLAUF EINES GESCHÄFTSOBJEKTS ZUM AUFKLAPPEN (M01b, wie E50).
 *
 * Zugeklappt, und geladen wird erst beim Aufklappen: wer die Akte öffnet,
 * will fast nie wissen, wer vor drei Monaten die Telefonnummer geändert hat
 * — und soll dafür nicht warten. Seitenweise, neueste zuerst; „Ältere
 * Einträge laden“ holt die nächste Seite, solange eine volle kam.
 *
 * Je Objekt neu: wechselt in einem Fenster die Rechnung, beginnt der Verlauf
 * zugeklappt und leer, statt die Einträge der vorigen zu zeigen.
 */
export default function ObjektVerlauf(p: Eigenschaften) {
  return <Verlauf key={`${p.objektart}:${p.objektId}`} {...p} />;
}

function Verlauf({ companyId, objektart, objektId, name, stil = 'weiteres' }: Eigenschaften) {
  const [zeilen, setZeilen] = useState<ObjektVerlaufZeile[]>([]);
  const [stand, setStand] = useState<'zu' | 'laedt' | 'fehler' | 'da'>('zu');
  const [weiter, setWeiter] = useState<VerlaufZeiger | null>(null);
  const [mehr, setMehr] = useState<'ruht' | 'laedt' | 'fehler'>('ruht');

  const erste = () => {
    setStand('laedt');
    listObjektVerlauf(companyId, objektart, objektId)
      .then((s) => {
        setZeilen(s.zeilen);
        setWeiter(s.weiter);
        setStand('da');
      })
      .catch(() => setStand('fehler'));
  };

  const aeltere = () => {
    if (!weiter) return;
    setMehr('laedt');
    listObjektVerlauf(companyId, objektart, objektId, weiter)
      .then((s) => {
        setZeilen((bisher) => [...bisher, ...s.zeilen]);
        setWeiter(s.weiter);
        setMehr('ruht');
      })
      .catch(() => setMehr('fehler'));
  };

  // Ganz geladen, und der älteste Eintrag ist nicht das Anlegen: das Objekt ist älter als das Journal.
  const letzte = zeilen[zeilen.length - 1];
  const ohneAnfang = stand === 'da' && !weiter && !!letzte && !(letzte.quelle === 'journal' && letzte.art === 'angelegt');
  const titel = 'Änderungsverlauf';

  return (
    <details
      className={stil === 'akte' ? 'akten-weitere' : 'weiteres'}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && stand === 'zu') erste();
      }}
    >
      <summary className={stil === 'akte' ? undefined : 'weiteres-kopf'}>{titel}</summary>
      <div className={stil === 'akte' ? undefined : 'weiteres-inhalt'}>
        {stand === 'laedt' && <p className="text-sm text-ink-muted">Wird geladen …</p>}
        {stand === 'fehler' && (
          <div className="text-sm">
            <p className="text-danger">Der Verlauf ließ sich nicht laden.</p>
            {/* `type="button"`: in einem Formular schickte der Knopf sonst das Formular ab. */}
            <Button type="button" variant="ghost" onClick={erste}>Erneut versuchen</Button>
          </div>
        )}
        {stand === 'da' && zeilen.length === 0 && (
          <p className="text-sm text-ink-muted">
            Keine Änderung aufgezeichnet. Aufgezeichnet wird seit {datumAT(JOURNAL_SEIT)}.
          </p>
        )}
        {stand === 'da' && zeilen.length > 0 && (
          <>
            <LotVerlauf
              name={titel}
              punkte={zeilen.map((z) => {
                const e = verlaufEintrag(z, { name });
                return {
                  titel: e.titel,
                  zeit: e.zeit,
                  text: e.zeilen.length > 0 ? (
                    <ul className="verlauf-angaben">
                      {e.zeilen.map((l, i) => <li key={i}>{l}</li>)}
                    </ul>
                  ) : undefined,
                };
              })}
            />
            {weiter && mehr !== 'fehler' && (
              <Button type="button" variant="ghost" loading={mehr === 'laedt'} onClick={aeltere}>
                Ältere Einträge laden
              </Button>
            )}
            {mehr === 'fehler' && (
              <div className="text-sm">
                <p className="text-danger">Die älteren Einträge ließen sich nicht laden.</p>
                <Button type="button" variant="ghost" onClick={aeltere}>Erneut versuchen</Button>
              </div>
            )}
            {ohneAnfang && (
              <p className="mt-2 text-xs text-ink-muted">
                Aufgezeichnet wird seit {datumAT(JOURNAL_SEIT)}; was davor geändert wurde, ist nicht bekannt.
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
