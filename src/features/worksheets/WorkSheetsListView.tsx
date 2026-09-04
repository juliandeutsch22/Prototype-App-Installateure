import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listRecentWorkSheets, cancelWorkSheet } from '@/lib/db/workSheets';
import { buildWorkSheetPdf, shareOrDownloadPdf } from './worksheetPdf';
import { isGF, canWriteWorkSheet } from '@/lib/permissions';
import { fmtMin } from '@/lib/time';
import type { WorkSheet } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';

const TON: Record<WorkSheet['status'], 'success' | 'gray' | 'danger'> = {
  Unterschrieben: 'success',
  Entwurf: 'gray',
  Storniert: 'danger',
};

/**
 * Die Handwerksscheine des Betriebs.
 *
 * Für das Büro der Beleg zur Rechnung, für die Baustelle der Nachweis. Ein
 * unterschriebener Schein lässt sich hier ansehen und als PDF weitergeben,
 * aber nicht mehr ändern — Korrekturen laufen ausschließlich über einen
 * Storno und einen neuen Schein.
 */
export default function WorkSheetsListView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const [suchparameter] = useSearchParams();
  const markiert = suchparameter.get('markiert');

  const [scheine, setScheine] = useState<WithId<WorkSheet>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [offen, setOffen] = useState<string | null>(markiert);
  const [stornoFuer, setStornoFuer] = useState<WithId<WorkSheet> | null>(null);
  const [stornoGrund, setStornoGrund] = useState('');
  const [busy, setBusy] = useState(false);

  const darfStornieren = user ? isGF(user.role) : false;
  /**
   * Wer darf einen Entwurf weiterbearbeiten?
   *
   * DIESELBE Prüfung wie die Route dahinter — sonst führte der Knopf für die
   * Buchhaltung und die Verwaltung, die diese Liste ebenfalls sehen, auf eine
   * Seite mit „Kein Zugriff".
   */
  const darfSchreiben = user ? canWriteWorkSheet(user.role) : false;

  const laden = useMemo(
    () => async () => {
      if (!user) return;
      setLoading(true);
      try {
        setScheine(await listRecentWorkSheets(user.companyId));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    void laden();
  }, [laden]);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return scheine;
    return scheine.filter((s) =>
      [s.customerName, s.projectNumber, s.datum, s.notizen].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [scheine, suche]);

  async function pdfAusgeben(s: WithId<WorkSheet>) {
    setBusy(true);
    try {
      // Der ganze Firmensatz, nicht nur der Name: der Beleg soll sagen, an
      // wen der Kunde sich wenden muss.
      const blob = await buildWorkSheetPdf(s, {
        name: company?.name ?? 'Installateur',
        addressLine: company?.addressLine,
        contactLine: company?.contactLine,
        logoUrl: company?.logoUrl,
      });
      const art = await shareOrDownloadPdf(
        blob,
        `Handwerksschein_${s.projectNumber}_${s.datum}.pdf`,
      );
      toast.success(art === 'geteilt' ? 'Schein geteilt' : 'PDF gespeichert');
    } catch {
      setError('Das PDF konnte nicht erzeugt werden.');
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Handwerksscheine"
        subtitle="Unterschriebene Leistungsnachweise der Baustellen"
      />

      <Card>
        <Link
          to="/worksheet"
          className="flex min-h-touch items-center justify-center rounded bg-brand px-4 py-2 font-semibold text-brand-fg"
        >
          Neuen Schein erstellen
        </Link>
      </Card>

      <Card
        title={`Scheine (${scheine.length})`}
        action={
          <input
            aria-label="Scheine durchsuchen"
            placeholder="Suchen …"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            className="min-h-touch rounded border border-line bg-surface px-3 py-1 text-base text-ink"
          />
        }
      >
        {error && <div className="mb-3"><ErrorState message={error} /></div>}
        {loading ? (
          <SkeletonList rows={4} />
        ) : sichtbar.length === 0 ? (
          <EmptyState>
            {scheine.length === 0
              ? 'Noch kein Handwerksschein erstellt.'
              : `Kein Schein passt zu „${suche}".`}
          </EmptyState>
        ) : (
          <List>
            {sichtbar.map((s) => {
              const gesamt = s.zeiten.reduce((n, z) => n + z.minuten, 0);
              const auf = offen === s.id;
              return (
                <ListRow
                  key={s.id}
                  title={
                    <span>
                      {s.customerName}{' '}
                      <span className="tnum text-sm font-normal text-ink-muted">
                        ({s.projectNumber})
                      </span>
                    </span>
                  }
                  subtitle={
                    <>
                      {s.datum} · {fmtMin(gesamt)} · {s.abrechnung}
                      {s.unterschriften?.kunde && (
                        <span className="mt-1 block text-xs text-ink-muted">
                          Unterschrieben von {s.unterschriften.kunde.name}
                        </span>
                      )}
                      {s.stornoGrund && (
                        <span className="mt-1 block text-xs text-danger">
                          Storno: {s.stornoGrund}
                          {s.storniertVonName ? ` (${s.storniertVonName})` : ''}
                        </span>
                      )}
                      {auf && (
                        <span className="mt-2 block rounded border border-line p-3">
                          {s.zeiten.length > 0 && (
                            <>
                              <span className="section-label block">Zeiten</span>
                              <span className="mt-1 block space-y-1">
                                {s.zeiten.map((z, i) => (
                                  <span key={i} className="block text-sm text-ink">
                                    {z.mitarbeiter}
                                    {z.helfer ? ' (Helfer)' : ''} ·{' '}
                                    {z.von && z.bis ? `${z.von}–${z.bis}` : '—'} ·{' '}
                                    {fmtMin(z.minuten)}
                                    {z.taetigkeit ? ` · ${z.taetigkeit}` : ''}
                                  </span>
                                ))}
                              </span>
                            </>
                          )}
                          {s.material.length > 0 && (
                            <>
                              <span className="section-label mt-3 block">Material</span>
                              <span className="mt-1 block space-y-1">
                                {s.material.map((m, i) => (
                                  <span key={i} className="block text-sm text-ink">
                                    {m.menge}× {m.name}
                                  </span>
                                ))}
                              </span>
                            </>
                          )}
                          {s.notizen && (
                            <>
                              <span className="section-label mt-3 block">Anmerkungen</span>
                              <span className="mt-1 block text-sm text-ink">{s.notizen}</span>
                            </>
                          )}
                          {/*
                            Die Prüfsumme sichtbar machen. Sie ist der
                            eigentliche Manipulationsschutz: mit ihr lässt
                            sich belegen, dass ein vorgelegtes PDF genau das
                            ist, was unterschrieben wurde.
                          */}
                          {/*
                            Die Pruefsumme entsteht serverseitig, kurz NACH
                            dem Unterschreiben — und offline erst beim
                            Uebertragen. Statt die Zeile dann einfach
                            wegzulassen, sagt sie, dass noch etwas aussteht:
                            eine fehlende Pruefsumme sieht sonst aus wie ein
                            Fehler, ist aber nur eine Frage von Sekunden.
                          */}
                          <span className="section-label mt-3 block">Prüfsumme</span>
                          {s.inhaltHash ? (
                            <span className="mt-1 block break-all font-mono text-xs text-ink-muted">
                              {s.inhaltHash}
                            </span>
                          ) : s.status === 'Entwurf' ? (
                            <span className="mt-1 block text-xs text-ink-muted">
                              Entsteht mit der Unterschrift.
                            </span>
                          ) : (
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                              Wird berechnet — bei fehlender Verbindung erst nach der Übertragung.
                              <Button variant="ghost" onClick={() => void laden()}>
                                Neu laden
                              </Button>
                            </span>
                          )}
                        </span>
                      )}
                    </>
                  }
                >
                  <Badge tone={TON[s.status]}>{s.status}</Badge>
                  <Button variant="ghost" onClick={() => setOffen(auf ? null : s.id)}>
                    {auf ? 'Zuklappen' : 'Details'}
                  </Button>
                  <Button variant="ghost" loading={busy} onClick={() => pdfAusgeben(s)}>
                    PDF
                  </Button>
                  {/*
                    „Als Entwurf speichern" war bis hierher eine Sackgasse: der
                    Schein landete in dieser Liste, und dort gab es nur
                    Aufklappen, PDF und Storno. Wer ihn anlegte, um ihn später
                    unterschreiben zu lassen, kam nie wieder hinein und musste
                    alles neu tippen — oder legte einen ZWEITEN Beleg über
                    dieselbe Arbeit an.
                  */}
                  {darfSchreiben && s.status === 'Entwurf' && (
                    <Link to={`/worksheet?entwurf=${s.id}`}>
                      <Button variant="secondary">Weiterbearbeiten</Button>
                    </Link>
                  )}
                  {darfStornieren && s.status === 'Unterschrieben' && (
                    <Button variant="ghost" onClick={() => setStornoFuer(s)}>
                      Stornieren
                    </Button>
                  )}
                </ListRow>
              );
            })}
          </List>
        )}
      </Card>

      {/*
        Storno mit Pflichtgrund. Ein unterschriebener Beleg verschwindet nicht
        und wird nicht überschrieben — er bleibt sichtbar und trägt den Grund.
        Ein spurlos gelöschter Schein wäre schlimmer als ein falscher.
      */}
      {stornoFuer && (
        <Card title={`Schein stornieren — ${stornoFuer.customerName}, ${stornoFuer.datum}`}>
          <p className="text-sm text-ink-muted">
            Der Schein bleibt erhalten und sichtbar, wird aber als storniert gekennzeichnet. Für
            eine Korrektur ist danach ein neuer Schein zu erstellen.
          </p>
          <div className="mt-3">
            <InputField
              id="stornogrund"
              label="Grund (Pflicht)"
              value={stornoGrund}
              onChange={(e) => setStornoGrund(e.target.value)}
              required
            />
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              loading={busy}
              disabled={stornoGrund.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                try {
                  await cancelWorkSheet(stornoFuer.id, stornoGrund.trim(), user.name);
                  toast.success('Schein storniert');
                  setStornoFuer(null);
                  setStornoGrund('');
                  await laden();
                } catch {
                  setError('Der Storno ist fehlgeschlagen.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Storno bestätigen
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStornoFuer(null);
                setStornoGrund('');
              }}
            >
              Abbrechen
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
