import { useEffect, useState } from 'react';
import { useBeiAktualisieren } from '@/lib/aktualisieren';
import { useNavigate } from 'react-router-dom';
import type { Lagerort } from '@/types';
import { inventurAnlegen, inventurListen, type InventurUmfang, type Zaehlliste } from '@/lib/db/inventur';
import Card from '@/components/Card';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { datumAusMs } from '@/lib/datum';
import { grundAus } from '@/lib/fehlerGrund';
import { OrtWahl } from './LagerDialoge';
import { HAUPTLAGER, weitereOrte } from './lagerorte';
import { zaehlzeitText } from './inventur';

/**
 * DIE ZÄHLLISTEN IM LAGER (Durchsicht 15.11.2026, F14) — der Reiter
 * „Inventur“: offene Listen mit ihrem Fortschritt, darunter die gebuchten
 * als Protokoll. Eine Zeile öffnet die Liste zum Zählen bzw. das Protokoll.
 *
 * Die Einzelinventur (⋯ → „Inventur …“) bleibt für den einen Artikel, an
 * dem gerade etwas nicht stimmt; die Zählliste ist für den ganzen Ort.
 */
export default function Zaehllisten({
  orte,
  mitOrten,
  warengruppen,
}: {
  /** Alle Orte des Betriebs — leer, wenn „Lagerorte und Fahrzeuglager“ aus ist. */
  orte: readonly Lagerort[];
  /** Gibt es weitere Orte? Sonst wird im Hauptlager gezählt, ohne Wahl. */
  mitOrten: boolean;
  /** Die Warengruppen der Lagerartikel — Vorschläge für den Filter. */
  warengruppen: readonly string[];
}) {
  const navigate = useNavigate();
  const [listen, setListen] = useState<Zaehlliste[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);
  // Ziehen zum Aktualisieren (F15): diese Liste lädt selbst — sie holt dann nach.
  useBeiAktualisieren(() => setVersuch((v) => v + 1));
  const [neuOffen, setNeuOffen] = useState(false);

  useEffect(() => {
    let weg = false;
    setFehler(null);
    inventurListen()
      .then((l) => !weg && setListen(l))
      .catch((e) => !weg && setFehler(grundAus(e, 'Die Zähllisten konnten nicht geladen werden.')));
    return () => {
      weg = true;
    };
  }, [versuch]);

  const offen = (listen ?? []).filter((l) => l.zustand === 'offen');
  const gebucht = (listen ?? []).filter((l) => l.zustand === 'gebucht');
  const titel = (l: Zaehlliste) => [l.ortName, l.bezeichnung].filter(Boolean).join(' · ');

  return (
    <>
      <Card
        title="Zähllisten"
        buendig
        hint="Eine Zählliste umfasst alle Artikel eines Orts — Hauptlager, weiteres Lager oder Fahrzeug. Gezählt wird am Handy Zeile für Zeile oder auf der ausgedruckten Liste; jede Zahl ist sofort gespeichert. Verglichen wird mit dem Bestand zum Zeitpunkt der Zählung: was danach hinein- oder hinausgeht, bleibt erhalten. „Abweichungen buchen“ bucht alle Unterschiede in einem Zug, mit Grund im Bewegungsprotokoll."
        action={<Button variant="secondary" onClick={() => setNeuOffen(true)}>Neue Zählliste</Button>}
      >
        {fehler ? (
          <div className="px-4 pb-4"><ErrorState message={fehler} onRetry={() => setVersuch((n) => n + 1)} /></div>
        ) : listen === null ? (
          <div className="px-4 pb-4"><SkeletonList rows={2} /></div>
        ) : offen.length === 0 ? (
          <EmptyState>Keine offene Zählliste.</EmptyState>
        ) : (
          <List>
            {offen.map((l) => (
              <ListRow
                key={l.id}
                title={titel(l)}
                subtitle={`angelegt ${datumAusMs(l.angelegtAm)}${l.angelegtVonName ? ` von ${l.angelegtVonName}` : ''} · gezählt ${zaehlzeitText(l.stichtag)}`}
                wert={`${l.gezaehlt} von ${l.artikel} gezählt`}
                onOeffnen={() => navigate(`/lager/inventur/${l.id}`)}
              />
            ))}
          </List>
        )}
      </Card>

      {gebucht.length > 0 && (
        <Card title="Gebuchte Inventuren" buendig>
          <List>
            {gebucht.map((l) => (
              <ListRow
                key={l.id}
                title={titel(l)}
                subtitle={`gebucht ${datumAusMs(l.gebuchtAm)}${l.gebuchtVonName ? ` von ${l.gebuchtVonName}` : ''}`}
                wert={l.abweichend === 0 ? 'ohne Abweichung' : `${l.abweichend} ${l.abweichend === 1 ? 'Abweichung' : 'Abweichungen'}`}
                onOeffnen={() => navigate(`/lager/inventur/${l.id}`)}
              />
            ))}
          </List>
        </Card>
      )}

      {neuOffen && (
        <NeueZaehlliste
          orte={orte}
          mitOrten={mitOrten}
          warengruppen={warengruppen}
          onAbbrechen={() => setNeuOffen(false)}
          onAngelegt={(id) => navigate(`/lager/inventur/${id}`)}
        />
      )}
    </>
  );
}

/** Ein Zeitpunkt aus `datetime-local` (Uhr des Geräts) als ISO für die Datenbank. */
function alsIso(lokal: string): string | null {
  if (!lokal) return null;
  const d = new Date(lokal);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * EINE NEUE ZÄHLLISTE: Ort, Umfang, optional Warengruppe und Suchbegriff,
 * und wann gezählt wird. Artikel, die am Ort schon auf einer offenen Liste
 * stehen, kommen nicht ein zweites Mal dazu — die Meldung sagt, wie viele.
 */
export function NeueZaehlliste({
  orte,
  mitOrten,
  warengruppen,
  onAbbrechen,
  onAngelegt,
}: {
  orte: readonly Lagerort[];
  mitOrten: boolean;
  warengruppen: readonly string[];
  onAbbrechen: () => void;
  onAngelegt: (id: string) => void;
}) {
  const toast = useToast();
  const [ort, setOrt] = useState(HAUPTLAGER);
  const [umfang, setUmfang] = useState<InventurUmfang>('bestand');
  const [warengruppe, setWarengruppe] = useState('');
  const [suche, setSuche] = useState('');
  const [bezeichnung, setBezeichnung] = useState('');
  const [mitStichtag, setMitStichtag] = useState(false);
  const [stichtag, setStichtag] = useState('');

  async function anlegen() {
    const iso = mitStichtag ? alsIso(stichtag) : null;
    if (mitStichtag && !iso) throw new Error('Bitte den Stichtag mit Uhrzeit eintragen.');
    const r = await inventurAnlegen({ ort, umfang, warengruppe, suche, bezeichnung, stichtag: iso });
    toast.success(
      r.uebersprungen > 0
        ? `Zählliste mit ${r.artikel} Artikeln angelegt — ${r.uebersprungen} stehen schon auf einer offenen Liste für diesen Ort.`
        : `Zählliste mit ${r.artikel} Artikeln angelegt.`,
    );
    onAngelegt(r.id);
  }

  return (
    <ConfirmDialog
      open
      title="Neue Zählliste"
      message="Alle Artikel eines Orts auf einer Liste — gezählt wird am Handy oder auf Papier, gebucht in einem Zug."
      confirmLabel="Zählliste anlegen"
      confirmTone="primary"
      onConfirm={anlegen}
      onCancel={onAbbrechen}
    >
      <div className="space-y-4">
        {mitOrten && (
          <OrtWahl id="zaehlliste-ort" label="Ort" alle={orte} wahl={weitereOrte(orte)} wert={ort} onChange={setOrt} />
        )}
        <fieldset className="space-y-2">
          <legend className="section-label">Welche Artikel</legend>
          <div className="wahl-gruppe">
            {([
              ['bestand', 'Was dort im Bestand ist', 'Alle Artikel, die das System an diesem Ort führt'],
              ['lagerartikel', 'Alle Lagerartikel', 'Auch, was dort laut System fehlt — findet Ware, die nie gebucht wurde'],
            ] as const).map(([wert, name, zusatz]) => (
              <label key={wert} className="wahl-option">
                <input type="radio" name="zaehlliste-umfang" checked={umfang === wert} onChange={() => setUmfang(wert)} />
                <span className="wahl-text">
                  <span className="wahl-name">{name}</span>
                  <span className="wahl-zusatz">{zusatz}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <InputField
          id="zaehlliste-warengruppe"
          label="Warengruppe (optional)"
          list="zaehlliste-warengruppen"
          value={warengruppe}
          onChange={(e) => setWarengruppe(e.target.value)}
          placeholder="alle Warengruppen"
        />
        <datalist id="zaehlliste-warengruppen">
          {warengruppen.map((w) => <option key={w} value={w} />)}
        </datalist>
        <InputField
          id="zaehlliste-suche"
          label="Nur Artikel mit (optional)"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Name oder Artikelnummer, z. B. Rohr"
        />
        <InputField
          id="zaehlliste-bezeichnung"
          label="Bezeichnung (optional)"
          maxLength={120}
          value={bezeichnung}
          onChange={(e) => setBezeichnung(e.target.value)}
          placeholder="z. B. Jahresinventur 2026"
        />
        <fieldset className="space-y-2">
          <legend className="section-label">Verglichen wird mit dem Bestand …</legend>
          <div className="wahl-gruppe">
            <label className="wahl-option">
              <input type="radio" name="zaehlliste-zeit" checked={!mitStichtag} onChange={() => setMitStichtag(false)} />
              <span className="wahl-text">
                <span className="wahl-name">beim Zählen</span>
                <span className="wahl-zusatz">Je Artikel im Augenblick der Eingabe — für das Zählen am Handy</span>
              </span>
            </label>
            <label className="wahl-option">
              <input type="radio" name="zaehlliste-zeit" checked={mitStichtag} onChange={() => setMitStichtag(true)} />
              <span className="wahl-text">
                <span className="wahl-name">zu einem Stichtag</span>
                <span className="wahl-zusatz">Zählung vor Arbeitsbeginn oder auf Papier, später eingetragen</span>
              </span>
            </label>
          </div>
          {mitStichtag && (
            <InputField
              id="zaehlliste-stichtag"
              label="Stichtag und Uhrzeit"
              type="datetime-local"
              pflicht
              value={stichtag}
              onChange={(e) => setStichtag(e.target.value)}
            />
          )}
        </fieldset>
      </div>
    </ConfirmDialog>
  );
}
