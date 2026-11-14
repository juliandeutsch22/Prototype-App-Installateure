import { createPortal } from 'react-dom';
import { getUserByUid } from '@/lib/db/users';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { canEditTime } from '@/lib/permissions';
import { istAn } from '@/lib/module';
import { datumAT } from '@/lib/datum';
import { grundAus } from '@/lib/fehlerGrund';
import type { AppUser, TimeEntry } from '@/types';
import { korrekturBuchungLaden, zeitkorrekturBeantragen, zeitkorrekturEntscheiden, zeitkorrekturenLaden, zeitkorrekturLaden, type Zeitkorrektur, type KorrekturBuchung } from '@/lib/db/zeitkorrekturen';
import Button from '@/components/Button';
import Card from '@/components/Card';
import BottomSheet from '@/components/BottomSheet';
import { List, ListRow } from '@/components/ListRow';
import { InputField, CheckboxField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import TimeForm from './TimeForm';

const STANDNAME = { offen: 'Offen', umgesetzt: 'Umgesetzt', abgelehnt: 'Abgelehnt', zurueckgezogen: 'Zurückgezogen' } as const;

export function KorrekturAnfordern({ eintrag }: { eintrag: TimeEntry }) {
  const { company } = useAuth(); const toast = useToast();
  const [offen, setOffen] = useState(false); const [wunsch, setWunsch] = useState('');
  const [id, setId] = useState(() => crypto.randomUUID()); const [speichert, setSpeichert] = useState(false); const [fehler, setFehler] = useState<string | null>(null);
  if (!istAn(company?.modules, 'zeiterfassung.korrekturantraege')) return null;
  async function senden() {
    setSpeichert(true); setFehler(null);
    try { await zeitkorrekturBeantragen(eintrag.id!, wunsch, id); toast.success('Korrektur beim Büro angefragt'); setOffen(false); setWunsch(''); setId(crypto.randomUUID()); window.dispatchEvent(new Event('senklot:zeitkorrektur')); }
    catch (e) { setFehler(grundAus(e, 'Der Antrag konnte nicht gesendet werden.')); } finally { setSpeichert(false); }
  }
  return <><Button variant="ghost" onClick={() => setOffen(true)}>Korrektur anfragen</Button>
    {/* Der feste Dialog darf nicht im Stapelkontext der Zeilenaktionen liegen. */}
    {createPortal(<BottomSheet open={offen} onClose={() => setOffen(false)} label="Korrektur anfragen" titel="Korrektur anfragen" auchBreit>
      {/*
        FELDER UND FUSS IM TAKT (E72, 09.11.2026): 16 px zwischen den Teilen,
        der Knopf im Fuß mit Linie und „Abbrechen“ daneben (R7) — er klebte
        ohne Abstand am Feld. Ohne Uhrzeit (Abwesenheit, Stundeneintrag)
        steht der Stand statt „· –“. Das Absenden bleibt im Fenster: über
        das Portal liefe es sonst bis zu einem umgebenden Formular durch.
      */}
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); if (wunsch.trim() && !speichert) void senden(); }}>
        <p className="text-sm">{datumAT(eintrag.date)} · {eintrag.startTime && eintrag.endTime ? `${eintrag.startTime}–${eintrag.endTime}` : eintrag.status}. Rechnungssperren und Abwesenheitsanträge bleiben geschützt.</p>
        <InputField id="korrektur-wunsch" label="Was soll berichtigt werden und warum? (keine Diagnose)" required pflicht value={wunsch} onChange={(e) => setWunsch(e.target.value)} />
        {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}
        <div className="fuss-aktionen">
          <Button type="button" variant="secondary" onClick={() => setOffen(false)}>Abbrechen</Button>
          <Button type="submit" disabled={!wunsch.trim() || speichert}>Beim Büro anfragen</Button>
        </div>
      </form>
    </BottomSheet>, document.body)}</>;
}
export default function Zeitkorrekturen() {
  const { user, company } = useAuth(); const toast = useToast();
  const [antraege, setAntraege] = useState<Zeitkorrektur[]>([]); const [fehler, setFehler] = useState<string | null>(null);
  const [linkFehler, setLinkFehler] = useState<string | null>(null);
  const ladeNummer = useRef(0);
  const [auchErledigte, setAuchErledigte] = useState(false); const [auswahl, setAuswahl] = useState<Zeitkorrektur | null>(null);
  const [besitzer, setBesitzer] = useState<AppUser | null>(null);
  const [buchung, setBuchung] = useState<KorrekturBuchung | null>(null); const [grund, setGrund] = useState(''); const [speichert, setSpeichert] = useState(false);
  const [params, setParams] = useSearchParams();
  const ausUrl = params.get('korrektur');
  const firma = user?.companyId;
  const an = istAn(company?.modules, 'zeiterfassung.korrekturantraege');
  useEffect(() => {
    setLinkFehler(null);
    if (!firma || !ausUrl) return; let weg = false;
    void zeitkorrekturLaden(firma, ausUrl).then((a) => { if (!weg) { setAuswahl(a); if (!a) setLinkFehler('Dieser Korrekturantrag fehlt oder ist nicht für dich zugänglich.'); } }).catch((e) => { if (!weg) setLinkFehler(grundAus(e, 'Der Korrekturantrag konnte nicht geladen werden.')); });
    return () => { weg = true; };
  }, [firma, ausUrl]);
  function schliessen() {
    setAuswahl(null);
    if (ausUrl) setParams((alt) => { const neu = new URLSearchParams(alt); neu.delete('korrektur'); return neu; }, { preventScrollReset: true, replace: true });
  }

  const laden = useCallback(async () => {
    if (!firma) return;
    const nr = ++ladeNummer.current;
    setFehler(null);
    try {
      const zeilen = await zeitkorrekturenLaden(firma, an && !auchErledigte);
      if (nr === ladeNummer.current) setAntraege(zeilen);
    } catch (e) {
      if (nr === ladeNummer.current) setFehler(grundAus(e, 'Die Korrekturanträge konnten nicht geladen werden.'));
    }
  }, [firma, auchErledigte, an]);
  useEffect(() => {
    void laden(); window.addEventListener('senklot:zeitkorrektur', laden);
    // Ein langsamer alter Filter darf die inzwischen gewählte Ansicht nicht ersetzen.
    return () => { ladeNummer.current += 1; window.removeEventListener('senklot:zeitkorrektur', laden); };
  }, [laden]);
  useEffect(() => {
    let weg = false; setBuchung(null); setBesitzer(null); setGrund('');
    if (auswahl && firma) void Promise.all([korrekturBuchungLaden(auswahl.eintragId), getUserByUid(firma, auswahl.userId)])
      .then(([e, person]) => { if (!weg) { setBuchung(e); setBesitzer(person); } })
      .catch((e) => { if (!weg) setFehler(grundAus(e, 'Die Buchung und das zugehörige Zeitprofil konnten nicht geladen werden.')); });
    return () => { weg = true; };
  }, [auswahl, firma]);
  if (!user || (!an && !antraege.length && !ausUrl)) return null;
  const buero = canEditTime(user.role);
  async function entscheiden(stand: string, eintrag?: Partial<TimeEntry>) {
    if (!auswahl || speichert) return; setSpeichert(true); setFehler(null);
    try { await zeitkorrekturEntscheiden(auswahl.id, stand, grund, eintrag, buchung?.korrekturStand); toast.success('Korrekturantrag entschieden'); schliessen(); window.dispatchEvent(new Event('senklot:zeitkorrektur')); }
    catch (e) { setFehler(grundAus(e, 'Der Antrag konnte nicht entschieden werden.')); throw e; } finally { setSpeichert(false); }
  }
  return <Card title={an ? 'Korrekturanträge' : 'Korrekturanträge · Archiv'} hint="Deine bisher erlaubten Korrekturen bleiben direkt möglich. Gesperrte Buchungen prüft das Büro. Verrechnete Zeiten können erst nach dem bestehenden Rechnungs-Korrekturablauf geändert werden; Abwesenheiten werden am ursprünglichen Antrag berichtigt. Erst eine tatsächliche Änderung erlaubt die Entscheidung „umgesetzt“.">
    {an && <CheckboxField id="korrekturen-erledigte" label="Auch entschiedene Anträge zeigen" checked={auchErledigte} onChange={(e) => setAuchErledigte(e.target.checked)} />}
    {(fehler || linkFehler) && <p role="alert" className="text-sm text-danger">{fehler ?? linkFehler}</p>}
    {!antraege.length && <p className="mt-3 text-sm text-ink-muted">Keine offenen Korrekturanträge.</p>}
    <List>{antraege.map((a) => <ListRow key={a.id} title={`${datumAT(a.datum)} · ${String(a.vorher.user_name ?? '')}`} subtitle={`${a.wunsch} · ${STANDNAME[a.stand]}`} onOeffnen={() => setAuswahl(a)} ausgewaehlt={auswahl?.id === a.id} pfeil />)}</List>
    {createPortal(<BottomSheet open={!!auswahl} onClose={schliessen} label="Korrekturantrag" titel="Korrekturantrag" auchBreit breit>
      {auswahl && <>
        <p className="mb-3">{datumAT(auswahl.datum)} · {auswahl.wunsch}</p>
        {auswahl.entscheidung && <p className="mb-3 text-sm">Entscheidung: {auswahl.entscheidung}</p>}
        {auswahl.stand === 'offen' && <>
          <InputField id="korrektur-entscheidung" label={buero ? 'Begründung der Entscheidung' : 'Grund für das Zurückziehen'} required pflicht value={grund} onChange={(e) => setGrund(e.target.value)} />
          {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}
          {buero && <>
            <p className="my-3 text-sm text-ink-muted">Stand und Abwesenheiten werden im ursprünglichen Vorgang geändert. Danach die tatsächlich durchgeführte Korrektur bestätigen.</p>
            {/* Dieselbe Grenze wie `zeit_korrektur_entscheiden`: nur Arbeitszeit und Zeitausgleich ohne Antrag oder Meldung. */}
            {buchung && besitzer && !buchung.isBilled && !buchung.vacationId && !buchung.krankmeldungId && !buchung.freistellungId && (buchung.status === 'Anwesend' || buchung.status === 'Zeitausgleich') ?
              <TimeForm ownerRole={besitzer.role} besitzerProfil={besitzer} key={buchung.id} entry={buchung} speichernMit={(werte) => entscheiden('umgesetzt', werte)} onSaved={() => undefined} onCancel={schliessen} /> :
              <p className="my-3 text-sm text-ink-muted">Die Buchung ist gesperrt, stammt aus einer Abwesenheit oder wurde bereits entfernt. Eine protokollierte Entfernung lässt sich als durchgeführte Korrektur bestätigen. Sonst zuerst den ursprünglichen Vorgang prüfen: <Link className="link" to="/invoices">Rechnungen</Link> · <Link className="link" to="/vacations">Abwesenheiten</Link>. Danach den Antrag erneut öffnen.</p>}
            <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" disabled={!grund.trim() || speichert} onClick={() => void entscheiden('umgesetzt').catch(() => undefined)}>Bereits durchgeführte Korrektur bestätigen</Button><Button variant="secondary" disabled={!grund.trim() || speichert} onClick={() => void entscheiden('abgelehnt').catch(() => undefined)}>Begründet ablehnen</Button></div>
          </>}
          {auswahl.userId === user.uid && <Button variant="secondary" disabled={!grund.trim() || speichert} onClick={() => void entscheiden('zurueckgezogen').catch(() => undefined)}>Antrag zurückziehen</Button>}
        </>}
      </>}
    </BottomSheet>, document.body)}
  </Card>;
}
