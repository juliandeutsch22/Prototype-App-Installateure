import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listProjectsByNumbers, listProjectsForEmployee } from '@/lib/db/projects';
import { listUpcomingAssignments } from '@/lib/db/assignments';
import { listAbwesendInRange, type Abwesenheit } from '@/lib/db/vacations';
import { ganztagsWeg } from '@/features/assignments/besetzung';
import { todayStr, fmtStunden } from '@/lib/time';
import type { Project } from '@/types';
import Card from '@/components/Card';
import Icon from '@/components/Icon';
import { TelefonLink } from '@/components/Kontakt';
import { mapsUrl } from '@/lib/kontakt';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { Marke } from '@/components/Badge';
import { LoadingState, ErrorState, EmptyState, TeilFehler } from '@/components/States';
import PlaeneListe from './PlaeneListe';
import { planeVon, usePlaene } from './usePlaene';
import { baustellenTitel } from '@/lib/baustellenTitel';

/** 'YYYY-MM-DD' -> '27.08.2026'; leer bleibt leer. */
function fmt(d?: string): string {
  if (!d) return '';
  return new Date(`${d}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Ein ISO-Datum n Tage später. */
function tageSpaeter(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

/**
 * Baustellen des Mitarbeiters. Bewusst als Karten statt als Liste: vor Ort
 * zählen Ansprechpartner, Telefonnummer und Route — die müssen groß und mit
 * einem Daumen erreichbar sein.
 */
export default function MyProjectsView() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  /** Baustellennummer -> nächster Einsatztag, für Baustellen aus der Einteilung. */
  const [naechsterEinsatz, setNaechsterEinsatz] = useState<Map<string, string>>(new Map());
  /**
   * Baustellennummer -> Tag eines Einsatzes, der in die eigene Abwesenheit
   * fällt und VOR dem nächsten möglichen liegt (Nachtest 01.10.2026, N6).
   * Der Einsatzplan blendet ihn aus und sagt „das Büro plant ihn neu“ —
   * hier stand er weiter als „nächster Einsatz“.
   */
  const [neuZuPlanen, setNeuZuPlanen] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    /*
      ZWEI WEGE AUF EINE BAUSTELLE: das Team der Baustelle und die Einteilung.

      Bis zum 24.09.2026 zählte nur das Team. Wer von der Projektleitung für
      nächsten Montag eingeteilt wurde, sah die Baustelle unter „Mein
      Einsatzplan“, hier aber „Dir sind aktuell keine Baustellen zugeordnet“
      (Prüflauf L2) — für den Monteur ist „eingeteilt“ und „zugeordnet“
      dasselbe. Jetzt stehen beide da, jede Baustelle einmal.
    */
    const heute = todayStr();
    Promise.all([
      listProjectsForEmployee(user.companyId, user.uid),
      listUpcomingAssignments(user.companyId, user.uid, heute, 200),
      // Wie im Einsatzplan: höchstens 62 Tage voraus; ohne Abwesenheiten bleibt alles, wie es war.
      Promise.resolve()
        .then(() => listAbwesendInRange(heute, tageSpaeter(heute, 62)))
        .catch(() => [] as Abwesenheit[]),
    ])
      .then(async ([team, einsaetze, abwesend]) => {
        const naechster = new Map<string, string>();
        const weg = new Map<string, string>();
        for (const a of [...einsaetze].sort((x, y) => x.date.localeCompare(y.date))) {
          if (ganztagsWeg(abwesend, user.uid, a.date)) {
            if (!naechster.has(a.projectNumber) && !weg.has(a.projectNumber)) weg.set(a.projectNumber, a.date);
            continue;
          }
          if (!naechster.has(a.projectNumber)) naechster.set(a.projectNumber, a.date);
        }
        // Eine Baustelle, deren einziger Einsatz in die Abwesenheit fällt, steht trotzdem da.
        for (const n of weg.keys()) if (!naechster.has(n)) naechster.set(n, '');
        const fehlen = [...naechster.keys()].filter(
          (n) => !team.some((p) => p.projectNumber === n),
        );
        const dazu = fehlen.length ? await listProjectsByNumbers(user.companyId, fehlen) : [];
        setNaechsterEinsatz(new Map([...naechster].filter(([, d]) => d)));
        setNeuZuPlanen(weg);
        setProjects([...team, ...dazu]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  // Abgeschlossene Baustellen gehören nicht in die Arbeitsliste.
  const active = useMemo(
    () => projects.filter((p) => p.status !== 'Abgeschlossen'),
    [projects],
  );

  /*
    DIE PLÄNE, die das Büro an die Baustelle gehängt hat — in einer Abfrage
    für alle Karten. Ohne Pläne steht dazu nichts da: eine leere Rubrik auf
    jeder Karte wäre Lärm.
  */
  const { stand: plaene, neuLaden: plaeneNeu } = usePlaene(
    user?.companyId,
    active.map((p) => p.id),
  );

  return (
    // Abstände der Designlinie „Fassung 3": 12 px am Telefon, 20 px am Schreibtisch.
    <div className="space-y-3 lg:space-y-5">
      <PageHeader title="Meine Baustellen" subtitle="Aus deinem Team und aus deiner Einteilung" />

      {loading ? (
        <Card><LoadingState /></Card>
      ) : error ? (
        <Card><ErrorState message={error} /></Card>
      ) : active.length === 0 ? (
        <Card><EmptyState>Du bist auf keiner laufenden Baustelle und hast keinen kommenden Einsatz. Die Einteilung macht die Projektleitung.</EmptyState></Card>
      ) : (
        <div className="space-y-4">
          {plaene.zustand === 'fehler' && <TeilFehler was="Die Pläne" onRetry={plaeneNeu} />}
          {active.map((p) => (
            <Card
              key={p.id}
              title={baustellenTitel(p)}
              action={<StatusBadge status={p.status} />}
            >
              <p className="nr text-sm text-ink-muted">{p.projectNumber}</p>
              {neuZuPlanen.has(p.projectNumber) && (
                <p className="mt-1 text-sm text-ink-muted">
                  Der Einsatz am {fmt(neuZuPlanen.get(p.projectNumber))} liegt an einem Tag, an dem du
                  abwesend bist — das Büro plant ihn neu.
                </p>
              )}
              {naechsterEinsatz.has(p.projectNumber) && (
                <p className="mt-1">
                  <Marke>nächster Einsatz {fmt(naechsterEinsatz.get(p.projectNumber))}</Marke>
                </p>
              )}
              {/* Zeilenumbrüche bleiben: der Auftragsumfang aus dem Angebot ist oft eine Liste. */}
              {p.description && <p className="mt-2 whitespace-pre-line text-ink">{p.description}</p>}

              {plaene.zustand === 'bereit' && planeVon(plaene, p.id).length > 0 && (
                <div className="mt-3">
                  <p className="section-label">Pläne und Dokumente</p>
                  <PlaeneListe dokumente={planeVon(plaene, p.id)} adressen={plaene.adressen} />
                </div>
              )}

              {(p.startDate || p.endDate) && (
                <p className="mt-2 text-sm text-ink-muted">
                  {fmt(p.startDate)}
                  {p.endDate && ` – ${fmt(p.endDate)}`}
                </p>
              )}
              {p.estimatedHours ? (
                <p className="mt-2">
                  <Marke>{fmtStunden(p.estimatedHours)} h kalkuliert</Marke>
                </p>
              ) : null}

              {/* Ansprechpartner: ohne Nummer steht der Monteur vor Ort ohne
                  Kontakt da — deshalb wird ein fehlender Eintrag angemahnt. */}
              {/* Eine Gruppe mit Linie oben statt eines getönten Kastens in der Karte. */}
              <div className="mt-4 border-t border-line pt-3">
                <p className="section-label">Ansprechpartner</p>
                {p.contactName || p.contactPhone ? (
                  <div className="mt-1">
                    {p.contactName && <p className="font-normal text-ink">{p.contactName}</p>}
                    <TelefonLink
                      nummer={p.contactPhone}
                      name={p.contactName}
                      className="mt-1"
                    />
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-warning">Kein Ansprechpartner hinterlegt.</p>
                )}
              </div>

              {/* Die Route bleibt hier die Hauptaktion der Karte und
                  behaelt deshalb die volle Breite und die Markenfarbe. */}
              {p.address && (
                <a
                  href={mapsUrl(p.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex min-h-touch items-center justify-center gap-2 rounded-sm bg-brand px-4 py-2 font-semibold text-brand-fg shadow-sm"
                >
                  <Icon name="pin" size={18} aria-hidden />
                  Route: {p.address}
                </a>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
