import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listAssignmentsForUserInRange } from '@/lib/db/assignments';
import { listProjectsByNumbers } from '@/lib/db/projects';
import { callScheinVorbereiten } from '@/lib/functions';
import {
  createWorkSheet,
  signWorkSheet,
  listWorkSheetsForProject,
  type NewWorkSheet,
} from '@/lib/db/workSheets';
import { fmtMin, todayStr } from '@/lib/time';
import type { Project, WorkSheet, WorkSheetZeit, WorkSheetMaterial } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import SignaturePad from '@/components/SignaturePad';
import BaustellenSelect from '@/components/BaustellenSelect';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, LoadingState } from '@/components/States';

/**
 * Handwerksschein erstellen, unterschreiben lassen, einfrieren.
 *
 * DER WERT LIEGT NICHT IM UNTERSCHREIBEN, sondern darin, dass die Kette
 * Zeit → Schein → Rechnung geschlossen wird. Regiestunden sind die am
 * häufigsten bestrittene Rechnungsposition; ohne unterschriebenen Beleg lässt
 * sich eine Mehrstunde im Zweifel nicht durchsetzen.
 *
 * Vorausgefüllt wird aus dem, was ohnehin erfasst ist — der Monteur soll auf
 * der Baustelle nichts abtippen, was das System schon weiß.
 */
export default function WorkSheetView() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const params = useParams();
  const [suchparameter] = useSearchParams();

  const projektAusUrl = params.projectNumber ?? suchparameter.get('projekt') ?? '';
  const datumAusUrl = suchparameter.get('datum') ?? todayStr();

  const [projekt, setProjekt] = useState<WithId<Project> | undefined>();
  const [projectNumber, setProjectNumber] = useState(projektAusUrl);
  const [datum, setDatum] = useState(datumAusUrl);
  const [zeiten, setZeiten] = useState<WorkSheetZeit[]>([]);
  const [material, setMaterial] = useState<WorkSheetMaterial[]>([]);
  const [notizen, setNotizen] = useState('');
  const [laden, setLaden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  /** Unterschriften — erst wenn beide da sind, lässt sich einfrieren. */
  const [monteurName, setMonteurName] = useState(user?.name ?? '');
  const [monteurBild, setMonteurBild] = useState<string | null>(null);
  const [kundeName, setKundeName] = useState('');
  const [kundeBild, setKundeBild] = useState<string | null>(null);

  const [bestehende, setBestehende] = useState<WithId<WorkSheet>[]>([]);

  /**
   * Die eigenen Einsätze am gewählten Tag — der eigentliche Einstieg.
   *
   * EIN MONTEUR SUCHT SEINE BAUSTELLE NICHT IN EINER LISTE. Er war heute auf
   * ein, zwei Baustellen, und für eine davon schreibt er den Schein. Die
   * Auswahl über alle Baustellen des Betriebs ist der Umweg für den Fall, dass
   * die Einteilung fehlt oder jemand aus dem Büro einen Schein nachträgt.
   *
   * Bei genau einem Einsatz wird vorausgewählt: dann ist die Frage, die das
   * Auswahlfeld stellt, bereits beantwortet.
   */
  const [heutige, setHeutige] = useState<{ projectNumber: string; name: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    listAssignmentsForUserInRange(user.companyId, user.uid, datum, datum)
      .then(async (einsaetze) => {
        if (verworfen || einsaetze.length === 0) {
          if (!verworfen) setHeutige([]);
          return;
        }
        const nummern = [...new Set(einsaetze.map((a) => a.projectNumber))];
        const stamm = await listProjectsByNumbers(user.companyId, nummern);
        if (verworfen) return;
        setHeutige(
          nummern.map((nr) => ({
            projectNumber: nr,
            name: stamm.find((p) => p.projectNumber === nr)?.customerName ?? nr,
          })),
        );
        // Nur vorauswählen, wenn nichts vorgegeben ist und die Lage eindeutig
        // ist — eine falsche Vorauswahl wäre schlimmer als gar keine.
        if (nummern.length === 1 && !projektAusUrl) setProjectNumber(nummern[0]);
      })
      .catch(() => setHeutige([]));
    return () => {
      verworfen = true;
    };
    // `projektAusUrl` ist beim ersten Zeichnen fix und gehört nicht ins
    // Abhängigkeitsfeld: sonst liefe die Vorauswahl bei jeder Auswahl erneut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, datum]);

  /**
   * Vorausfüllen aus Zeiten und Material der Baustelle.
   *
   * Die Zeiten werden auf das gewählte Datum eingegrenzt — ein Schein geht
   * über einen Tag, nicht über die Laufzeit der Baustelle. Wer mehrere Tage
   * zusammenfassen will, legt mehrere Scheine an; das entspricht dem
   * Papierbeleg und hält den Streitfall klein.
   */
  useEffect(() => {
    if (!user || !projectNumber) {
      setZeiten([]);
      setMaterial([]);
      return;
    }
    setLaden(true);
    setError(null);
    Promise.all([
      // Serverseitig zusammengestellt: der Schein braucht die Stunden der
      // GANZEN Mannschaft, und die darf ein Monteur nicht selbst lesen.
      callScheinVorbereiten({ projectNumber, datum }),
      listWorkSheetsForProject(user.companyId, projectNumber),
    ])
      .then(([{ data }, scheine]) => {
        setZeiten(data.zeiten);
        setMaterial(data.material);
        setBestehende(scheine.filter((s) => s.datum === datum));
      })
      .catch(() => setError('Zeiten und Material konnten nicht geladen werden.'))
      .finally(() => setLaden(false));
  }, [user, projectNumber, datum]);

  const gesamtMinuten = zeiten.reduce((s, z) => s + z.minuten, 0);
  /**
   * Der Datensatz gehört in die Bedingung, nicht nur die Nummer.
   *
   * Vorher prüfte der Knopf auf die Nummer, das Speichern aber auf den
   * Datensatz und brach ohne Meldung ab, wenn er fehlte. Ein Knopf, der
   * anklickbar aussieht und nichts tut, ist schlimmer als ein gesperrter.
   */
  const bereit =
    !!projekt && !!monteurBild && !!kundeBild && kundeName.trim().length > 1;

  async function unterschreibenUndEinfrieren() {
    if (!user || !projekt || !monteurBild || !kundeBild) return;
    setSpeichert(true);
    setError(null);
    try {
      /**
       * Der Inhalt wird KOPIERT, nicht referenziert.
       *
       * Korrigiert die Buchhaltung morgen einen Zeiteintrag, ändert sich damit
       * nicht rückwirkend, was der Kunde unterschrieben hat.
       */
      const entwurf: NewWorkSheet = {
        projectNumber,
        customerId: projekt.customerId,
        customerName: projekt.customerName,
        address: projekt.address,
        datum,
        status: 'Entwurf',
        abrechnung: projekt.billingMode ?? 'Regie',
        zeiten,
        material,
        notizen,
        erstelltVonUid: user.uid,
        erstelltVonName: user.name,
      };
      const id = await createWorkSheet(user.companyId, entwurf);

      // Gerätezeit: offline im Keller ist die Serverzeit die der späteren
      // Übertragung, nicht die der Unterschrift.
      const jetzt = Date.now();
      await signWorkSheet(
        id,
        { name: monteurName.trim() || user.name, bild: monteurBild, geraetZeit: jetzt },
        { name: kundeName.trim(), bild: kundeBild, geraetZeit: jetzt },
      );

      toast.success('Handwerksschein unterschrieben und eingefroren');
      navigate(`/worksheets?markiert=${id}`);
    } catch {
      setError('Der Schein konnte nicht gespeichert werden.');
    } finally {
      setSpeichert(false);
    }
  }

  async function alsEntwurfSichern() {
    if (!user || !projekt) return;
    setSpeichert(true);
    try {
      await createWorkSheet(user.companyId, {
        projectNumber,
        customerId: projekt.customerId,
        customerName: projekt.customerName,
        address: projekt.address,
        datum,
        status: 'Entwurf',
        abrechnung: projekt.billingMode ?? 'Regie',
        zeiten,
        material,
        notizen,
        erstelltVonUid: user.uid,
        erstelltVonName: user.name,
      });
      toast.success('Als Entwurf gespeichert');
      navigate('/worksheets');
    } catch {
      setError('Der Entwurf konnte nicht gespeichert werden.');
    } finally {
      setSpeichert(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Handwerksschein"
        subtitle="Leistung vor Ort bestätigen lassen — Zeiten, Material, Unterschrift"
      />

      <Card title="Baustelle und Tag">
        {/*
          Die eigenen Einsätze zuerst und als Knopf, nicht als Listeneintrag:
          das ist am Telefon mit Handschuhen ein Ziel, das man trifft.
        */}
        {heutige.length > 0 && (
          <div className="mb-4">
            <span className="section-label block">Deine Einsätze an diesem Tag</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {heutige.map((e) => (
                <button
                  key={e.projectNumber}
                  type="button"
                  onClick={() => {
                    // Den alten Datensatz mit weglegen: sonst zeigte die
                    // Kontaktzeile für einen Wimpernschlag die vorige
                    // Baustelle, und genau die ruft dann jemand an.
                    setProjekt(undefined);
                    setProjectNumber(e.projectNumber);
                  }}
                  className={`min-h-touch rounded border px-3 py-2 text-left text-sm ${
                    projectNumber === e.projectNumber
                      ? 'border-brand bg-brand text-brand-fg'
                      : 'border-line bg-surface text-ink'
                  }`}
                >
                  {e.name}
                  <span className="tnum ml-1 opacity-70">({e.projectNumber})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <BaustellenSelect
          id="wsproj"
          companyId={user.companyId}
          value={projectNumber}
          onChange={(nr, p) => {
            setProjectNumber(nr);
            setProjekt(p);
          }}
          required
        />
        <div className="mt-4">
          <InputField
            id="wsdate"
            label="Leistungsdatum"
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
          />
        </div>
        {projekt && (
          <div className="mt-3 space-y-2">
            {/*
              Adresse und Nummer anklickbar: wer den Schein schreibt, steht vor
              dem Haus oder sucht es noch — und braucht danach oft den Kunden
              ans Telefon, weil unterschrieben werden soll.
            */}
            <span className="flex flex-wrap items-center gap-x-3 text-sm">
              <AdresseLink adresse={projekt.address} />
              <TelefonLink nummer={projekt.contactPhone} name={projekt.contactName} />
            </span>
            <Badge tone={projekt.billingMode === 'Pauschal' ? 'gray' : 'info'}>
              {projekt.billingMode ?? 'Regie'}
            </Badge>
          </div>
        )}
        {/*
          Auf einer Pauschalbaustelle belegt der Schein nur, DASS gearbeitet
          wurde — die Stunden sind dort keine Rechnungsgrundlage. Das gehört
          gesagt, sonst rechnet jemand später damit.
        */}
        {projekt?.billingMode === 'Pauschal' && (
          <p className="mt-2 rounded-sm border border-info/30 bg-info-bg px-3 py-2 text-sm text-info">
            Pauschalbaustelle: Der Schein dokumentiert die geleistete Arbeit, die Stunden sind
            aber keine Grundlage für eine Nachverrechnung.
          </p>
        )}
        {bestehende.length > 0 && (
          <p className="mt-2 rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
            Für diesen Tag gibt es bereits {bestehende.length}{' '}
            {bestehende.length === 1 ? 'Schein' : 'Scheine'}. Ein zweiter ist möglich, etwa für
            einen getrennt beauftragten Zusatz — doppelt bestätigen sollte man dieselben Stunden
            aber nicht.
          </p>
        )}
      </Card>

      {laden ? (
        <Card>
          <LoadingState />
        </Card>
      ) : projectNumber ? (
        <>
          <Card title={`Zeiten am ${datum} · ${fmtMin(gesamtMinuten)}`}>
            {zeiten.length === 0 ? (
              <EmptyState>
                Für diesen Tag ist auf dieser Baustelle keine Zeit gebucht. Ein Schein ohne
                Stunden ergibt nur Sinn, wenn ausschließlich Material geliefert wurde.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {zeiten.map((z, i) => (
                  <li key={`${z.mitarbeiter}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{z.mitarbeiter}</span>
                      <span className="block text-xs text-ink-muted">
                        {z.von && z.bis ? `${z.von}–${z.bis}` : '—'}
                        {z.pauseMin ? ` · ${z.pauseMin} min Pause` : ''}
                        {z.taetigkeit ? ` · ${z.taetigkeit}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {z.helfer && <Badge tone="warning">Helfer</Badge>}
                      <span className="tnum font-medium text-ink">{fmtMin(z.minuten)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Material (${material.length})`}>
            {material.length === 0 ? (
              <EmptyState>Kein Material für diese Baustelle angefordert.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {material.map((m, i) => (
                  <li key={`${m.name}-${i}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate text-ink">{m.name}</span>
                    <span className="tnum shrink-0 text-ink-muted">
                      {m.menge} {m.einheit ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Ergänzungen">
            <InputField
              id="wsnotes"
              label="Notizen, Regiearbeiten, Mängel"
              value={notizen}
              onChange={(e) => setNotizen(e.target.value)}
            />
          </Card>

          <Card title="Unterschriften">
            {/*
              Name in Druckbuchstaben NEBEN dem Strich. Eine Unterschrift ohne
              zuordenbaren Namen ist im Streitfall wenig wert — beim Kunden ist
              das Feld deshalb Pflicht.
            */}
            <div className="space-y-6">
              <div>
                <InputField
                  id="wsmname"
                  label="Monteur (Name in Druckbuchstaben)"
                  value={monteurName}
                  onChange={(e) => setMonteurName(e.target.value)}
                />
                <div className="mt-2">
                  <SignaturePad titel="Unterschrift Monteur" onChange={setMonteurBild} />
                </div>
              </div>
              <div>
                <InputField
                  id="wskname"
                  label="Kunde (Name in Druckbuchstaben)"
                  value={kundeName}
                  onChange={(e) => setKundeName(e.target.value)}
                  required
                />
                <div className="mt-2">
                  <SignaturePad titel="Unterschrift Kunde" onChange={setKundeBild} />
                </div>
              </div>
            </div>

            <p className="mt-4 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-ink-muted">
              Mit dem Unterschreiben wird der Schein <strong>eingefroren</strong>: Zeiten,
              Material und Notizen lassen sich danach nicht mehr ändern. Eine Korrektur läuft über
              einen Storno und einen neuen Schein.
            </p>

            {error && <div className="mt-3"><ErrorState message={error} /></div>}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={unterschreibenUndEinfrieren}
                loading={speichert}
                disabled={!bereit}
                className="w-full sm:w-auto"
              >
                Unterschreiben und abschließen
              </Button>
              <Button
                variant="secondary"
                onClick={alsEntwurfSichern}
                loading={speichert}
                disabled={!projekt}
                className="w-full sm:w-auto"
              >
                Als Entwurf speichern
              </Button>
            </div>
            {!bereit && projectNumber && (
              <p className="mt-2 text-sm text-ink-muted">
                {!projekt
                  ? 'Die Stammdaten der Baustelle werden noch geladen.'
                  : `Zum Abschließen fehlen: ${[
                      !monteurBild && 'Unterschrift Monteur',
                      !kundeBild && 'Unterschrift Kunde',
                      kundeName.trim().length < 2 && 'Name des Kunden',
                    ]
                      .filter(Boolean)
                      .join(', ')}`}
              </p>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState>Zuerst eine Baustelle wählen.</EmptyState>
        </Card>
      )}
    </div>
  );
}
