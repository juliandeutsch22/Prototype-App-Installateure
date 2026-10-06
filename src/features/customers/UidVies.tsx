import { useEffect, useState } from 'react';
import type { Customer, UidPruefung } from '@/types';
import { listUidPruefungen, uidBeiViesPruefen } from '@/lib/db/customers';
import { beiViesPruefbar } from '@shared/vies';
import { uidFehler, uidNormalisieren } from '@/lib/uid';
import Button from '@/components/Button';
import { Zustand } from '@/components/Badge';
import { grundAus } from '@/lib/fehlerGrund';

/** „02.10.2026, 22:15“ in Wiener Zeit. */
function zeitpunkt(ms: number): string {
  return new Date(ms).toLocaleString('de-AT', {
    timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Warum eine Abfrage keine Abfrage-ID hat (Runde 3, G21). Seit dem
 * 06.10.2026 steht der Grund an der Abfrage; für ältere leitet er sich aus
 * der mitgeschickten eigenen UID ab — ohne sie vergibt VIES keine ID.
 */
function ohneIdGrund(p: Pick<UidPruefung, 'ohneIdGrund' | 'eigeneUid'>): string {
  if (p.ohneIdGrund) return p.ohneIdGrund;
  return p.eigeneUid
    ? 'VIES hat keine vergeben.'
    : 'Die eigene UID-Nummer ging nicht mit — sie fehlt in den Firmendaten, oder VIES kennt sie nicht.';
}

/**
 * DIE UID DES KUNDEN BEI VIES PRÜFEN — in der Kundenakte, unter den
 * Stammdaten (Entscheidung vom 02.10.2026; offene Punkte E2).
 *
 * Geprüft wird die GESPEICHERTE UID: der Nachweis gilt für die Nummer am
 * Kunden, nicht für das, was gerade im Feld steht. Wer sie ändert, speichert
 * zuerst.
 *
 * Gezeigt wird die letzte Abfrage zu dieser UID mit Ergebnis, Zeitpunkt laut
 * VIES und Abfrage-ID; frühere stehen eingeklappt darunter. Eine Abfrage zu
 * einer früheren UID des Kunden gilt nicht für die heutige und steht nur
 * dort.
 */
export default function UidVies({
  kunde, uidGeaendert, darfPruefen,
}: {
  kunde: Customer & { id: string };
  /** Im Formular steht eine andere UID als gespeichert. */
  uidGeaendert: boolean;
  /** Der Supportzugang liest mit, prüft aber nicht — die Abfrage schreibt in den Betrieb. */
  darfPruefen: boolean;
}) {
  const uid = uidNormalisieren(kunde.vatId);
  const [liste, setListe] = useState<UidPruefung[] | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);

  const pruefbar = !!uid && !uidFehler(uid) && beiViesPruefbar(uid);

  useEffect(() => {
    if (!pruefbar) return;
    let weg = false;
    listUidPruefungen(kunde.companyId, kunde.id)
      .then((z) => { if (!weg) setListe(z); })
      // Ohne Liste bleibt die Prüfung möglich; es fehlt nur der letzte Stand.
      .catch(() => { if (!weg) setListe([]); });
    return () => {
      weg = true;
    };
  }, [kunde.companyId, kunde.id, pruefbar]);

  /*
    OHNE PRÜFBARE UID BLEIBT DER BEREICH MEIST WEG — eine Privatperson hat
    keine. Bei einem Unternehmen sagt er, warum es nichts zu prüfen gibt
    (Runde 3, G21): vorher erschien er erst, wenn eine UID in richtiger Form
    gespeichert war, und niemand wusste, wo die Prüfung zu finden ist.
  */
  if (!uid) {
    return kunde.kundenart === 'unternehmen' ? (
      <Rahmen>
        <p className="text-sm text-ink-muted">Mit einer gespeicherten UID-Nummer lässt sie sich hier bei VIES prüfen.</p>
      </Rahmen>
    ) : null;
  }
  if (uidFehler(uid)) {
    return (
      <Rahmen>
        <p className="text-sm text-ink-muted">
          Die gespeicherte UID-Nummer hat nicht die richtige Form: {uidFehler(uid)} Geprüft wird sie, sobald sie stimmt.
        </p>
      </Rahmen>
    );
  }
  if (!beiViesPruefbar(uid)) {
    return (
      <Rahmen>
        <p className="text-sm text-ink-muted">
          Eine UID-Nummer außerhalb der EU lässt sich bei VIES nicht prüfen.
        </p>
      </Rahmen>
    );
  }

  const zurUid = (liste ?? []).filter((p) => p.uid === uid);
  const letzte = zurUid[0];
  const fruehere = zurUid.slice(1);

  async function pruefen() {
    setLaeuft(true);
    setFehler(null);
    setHinweis(null);
    try {
      const { pruefung, hinweis: h } = await uidBeiViesPruefen(kunde.id);
      setListe((l) => [pruefung, ...(l ?? [])]);
      setHinweis(h ?? null);
    } catch (e) {
      setFehler(grundAus(e, 'VIES ließ sich nicht fragen.'));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Rahmen>
      {liste === null ? (
        <p className="text-sm text-ink-muted">Lädt …</p>
      ) : letzte ? (
        <div className="space-y-0.5 text-sm">
          <p className="flex flex-wrap items-center gap-x-2">
            <Zustand stand={letzte.gueltig ? 'gut' : 'schlecht'}>{letzte.gueltig ? 'gültig' : 'nicht gültig'}</Zustand>
            <span className="text-ink">laut VIES am {zeitpunkt(letzte.abgefragtAm)}</span>
          </p>
          <p className="text-ink-muted">
            {letzte.abfrageId
              ? <>Abfrage-ID <span className="nr">{letzte.abfrageId}</span></>
              : `ohne Abfrage-ID: ${ohneIdGrund(letzte)}`}
            {letzte.durchName ? ` · gefragt von ${letzte.durchName}` : ''}
          </p>
          {(letzte.name || letzte.adresse) && (
            <p className="whitespace-pre-line text-ink-muted">
              {[letzte.name, letzte.adresse].filter(Boolean).join('\n')}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Noch nicht bei VIES geprüft.</p>
      )}

      {hinweis && <p className="text-sm text-ink-muted">{hinweis}</p>}
      {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}

      {darfPruefen && (
        uidGeaendert ? (
          <p className="text-sm text-ink-muted">Erst speichern — geprüft wird die gespeicherte UID-Nummer.</p>
        ) : (
          <Button variant="secondary" loading={laeuft} onClick={() => void pruefen()}>
            {letzte ? 'Erneut bei VIES prüfen' : 'Bei VIES prüfen'}
          </Button>
        )
      )}

      {fruehere.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-muted">Frühere Abfragen ({fruehere.length})</summary>
          <ul className="mt-1 space-y-0.5 text-ink-muted">
            {fruehere.map((p) => (
              <li key={p.id}>
                {zeitpunkt(p.abgefragtAm)} · {p.gueltig ? 'gültig' : 'nicht gültig'}
                {p.abfrageId ? <> · <span className="nr">{p.abfrageId}</span></> : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Rahmen>
  );
}

/** Unter den Stammdaten, abgesetzt wie die Notiz. */
function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 space-y-2 border-t border-line pt-3">
      <p className="section-label">Prüfung bei VIES</p>
      {children}
    </div>
  );
}
