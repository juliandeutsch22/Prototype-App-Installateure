import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listProjectsByNumbers, listProjectsForEmployee } from '@/lib/db/projects';
import { listUpcomingAssignments } from '@/lib/db/assignments';
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

/** 'YYYY-MM-DD' -> '27.08.2026'; leer bleibt leer. */
function fmt(d?: string): string {
  if (!d) return '';
  return new Date(`${d}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
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
    ])
      .then(async ([team, einsaetze]) => {
        const naechster = new Map<string, string>();
        for (const a of einsaetze) {
          const bisher = naechster.get(a.projectNumber);
          if (!bisher || a.date < bisher) naechster.set(a.projectNumber, a.date);
        }
        const fehlen = [...naechster.keys()].filter(
          (n) => !team.some((p) => p.projectNumber === n),
        );
        const dazu = fehlen.length ? await listProjectsByNumbers(user.companyId, fehlen) : [];
        setNaechsterEinsatz(naechster);
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
    <div className="space-y-6">
      <PageHeader title="Meine Baustellen" subtitle="Aus deinem Team und aus deiner Einteilung" />

      {/* Laden, Fehler und „keine Baustelle" stehen für sich, ohne Karte
          darum — eine Karte um einen einzigen Satz ist ein Platzhalter. */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : active.length === 0 ? (
        <EmptyState>Du bist auf keiner laufenden Baustelle und hast keinen kommenden Einsatz. Die Einteilung macht die Projektleitung.</EmptyState>
      ) : (
        <>
          {plaene.zustand === 'fehler' && <TeilFehler was="Die Pläne" onRetry={plaeneNeu} />}
          <div className="baustellen-karten">
            {active.map((p) => (
              /*
                AUFBAU WIE DIE HEUTE-KARTE AM START (Mockup S. 1): Kunde groß,
                darunter Nummer und Zeitraum mit dem Stand rechts, die Marken,
                der Auftragsumfang, Kontakt als Chip und die Route als
                Hauptknopf. Kein Kasten in der Karte — der Ansprechpartner
                stand bisher in einem eigenen.
              */
              <Card key={p.id}>
                <h2 className="einsatz-kunde">{p.customerName}</h2>
                <div className="einsatz-meta">
                  <p className="einsatz-auftrag">
                    <span>{p.projectNumber}</span>
                    {(p.startDate || p.endDate) && (
                      <>
                        {' · '}
                        <span>
                          {fmt(p.startDate)}
                          {p.endDate && ` – ${fmt(p.endDate)}`}
                        </span>
                      </>
                    )}
                  </p>
                  <span className="einsatz-marken">
                    <StatusBadge status={p.status} />
                  </span>
                </div>
                {(naechsterEinsatz.has(p.projectNumber) || !!p.estimatedHours || !!p.billingMode) && (
                  <p className="mt-2 flex flex-wrap gap-2">
                    {naechsterEinsatz.has(p.projectNumber) && (
                      <Marke>nächster Einsatz {fmt(naechsterEinsatz.get(p.projectNumber))}</Marke>
                    )}
                    {p.estimatedHours ? <Marke>{fmtStunden(p.estimatedHours)} h kalkuliert</Marke> : null}
                    {p.billingMode && <Marke>{p.billingMode}</Marke>}
                  </p>
                )}
                {/* Zeilenumbrüche bleiben: der Auftragsumfang aus dem Angebot ist oft eine Liste. */}
                {p.description && <p className="mt-3 whitespace-pre-line text-ink">{p.description}</p>}

                {plaene.zustand === 'bereit' && planeVon(plaene, p.id).length > 0 && (
                  <div className="mt-3">
                    <p className="section-label">Pläne und Dokumente</p>
                    <PlaeneListe dokumente={planeVon(plaene, p.id)} adressen={plaene.adressen} />
                  </div>
                )}

                {/* Ansprechpartner als Chip (Name · Nummer). Ohne Nummer steht
                    der Monteur vor Ort ohne Kontakt da — deshalb wird ein
                    fehlender Eintrag angemahnt, und ein Name ohne Nummer steht
                    wenigstens als Text da. */}
                <div className="mt-4">
                  {p.contactPhone ? (
                    <TelefonLink nummer={p.contactPhone} name={p.contactName} variante="chip" />
                  ) : p.contactName ? (
                    <p className="text-sm text-ink-muted">
                      Ansprechpartner: <span className="font-medium text-ink">{p.contactName}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-warning">Kein Ansprechpartner hinterlegt.</p>
                  )}
                </div>

                {/* Die Route bleibt hier die Hauptaktion der Karte — derselbe
                    Hauptknopf wie am Einsatz. */}
                {p.address && (
                  <div className="einsatz-knoepfe">
                    <a
                      href={mapsUrl(p.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="einsatz-hauptknopf"
                    >
                      <span className="einsatz-hauptknopf-route">
                        <Icon name="pin" size={18} aria-hidden />
                        Route: {p.address}
                      </span>
                    </a>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
