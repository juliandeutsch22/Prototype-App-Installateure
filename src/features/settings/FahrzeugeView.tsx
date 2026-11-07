import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { canProcessOrders, isTopLevel } from '@/lib/permissions';
import {
  fahrzeugSpeichern, kennzeichenAusBuchungen, listFahrzeuge, type KennzeichenVorschlag,
} from '@/lib/db/lagerorte';
import { listUsers } from '@/lib/db/users';
import { updateCompany } from '@/lib/db/company';
import type { AppUser, Fahrzeug } from '@/types';
import { datumAT } from '@/lib/datum';
import { grundAus } from '@/lib/fehlerGrund';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import { List, ListRow } from '@/components/ListRow';
import { Zustand } from '@/components/Badge';
import { CheckboxField, InputField, SelectField } from '@/components/Field';
import { EmptyState, ErrorState, SkeletonList, TeilFehler } from '@/components/States';
import { useToast } from '@/components/Toast';
import { fahrzeugText } from '@/features/orders/lagerorte';

/**
 * FAHRZEUGE (SHK-Ausbau M04a) — unter Einstellungen, weil hier später die
 * Fristen dazukommen (W06: Pickerl, Service, Versicherung) und das
 * Fahrtenbuch (W07) dieselbe Kennung braucht.
 *
 * Jedes Fahrzeug hat ein Fahrzeuglager; es entsteht mit ihm und wird mit ihm
 * stillgelegt — nicht, solange darin etwas liegt.
 *
 * KENNZEICHEN AUS BUCHUNGEN sind ein VORSCHLAG. Die Zeiterfassung kennt
 * Fahrzeuge seit jeher nur als Freitext; zugeordnet wird davon nichts, und
 * die Buchungen bleiben, wie sie sind (Altdaten, Exporte). Wer einen
 * Vorschlag übernimmt, legt damit nur das Fahrzeug an.
 */
interface Entwurf {
  id?: string;
  kennzeichen: string;
  bezeichnung: string;
  standardfahrerUid: string;
  aktiv: boolean;
}

const LEER: Entwurf = { kennzeichen: '', bezeichnung: '', standardfahrerUid: '', aktiv: true };

export default function FahrzeugeView() {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[] | null>(null);
  const [personen, setPersonen] = useState<AppUser[]>([]);
  const [vorschlaege, setVorschlaege] = useState<KennzeichenVorschlag[] | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [rueckgabe, setRueckgabe] = useState(false);
  const [rueckgabeSpeichert, setRueckgabeSpeichert] = useState(false);
  const firma = user?.companyId;

  const rueckgabeGespeichert = !!company?.lagerRueckgabeFahrer;
  useEffect(() => {
    setRueckgabe(rueckgabeGespeichert);
  }, [rueckgabeGespeichert]);

  useEffect(() => {
    if (!firma) return;
    let weg = false;
    setLadeFehler(null);
    Promise.resolve()
      .then(() => listFahrzeuge(firma))
      .then((f) => { if (!weg) setFahrzeuge(f); })
      .catch((e) => { if (!weg) setLadeFehler(grundAus(e, 'Die Fahrzeuge konnten nicht geladen werden.')); });
    // Personen und Vorschläge sind Beiwerk: ohne sie steht die Liste trotzdem.
    Promise.resolve()
      .then(() => listUsers(firma))
      .then((p) => { if (!weg) setPersonen(p); })
      .catch(() => { if (!weg) setNebenFehler('Die Belegschaft'); });
    Promise.resolve()
      .then(() => kennzeichenAusBuchungen())
      .then((v) => { if (!weg) setVorschlaege(v); })
      .catch(() => { if (!weg) setNebenFehler('Die Kennzeichen aus Buchungen'); });
    return () => { weg = true; };
  }, [firma, versuch]);

  const namen = useMemo(() => new Map(personen.map((p) => [p.uid, p.name])), [personen]);
  const fahrerWahl = useMemo(
    () => personen.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [personen],
  );

  if (!user) return null;
  const darf = canProcessOrders(user.role);
  const spitze = isTopLevel(user.role);

  async function speichern() {
    if (!entwurf) return;
    setFehler(null);
    if (!entwurf.kennzeichen.trim()) {
      setFehler('Bitte das Kennzeichen eintragen.');
      return;
    }
    setSpeichert(true);
    try {
      await fahrzeugSpeichern({
        id: entwurf.id,
        kennzeichen: entwurf.kennzeichen.trim(),
        bezeichnung: entwurf.bezeichnung.trim() || null,
        standardfahrerUid: entwurf.standardfahrerUid || null,
        aktiv: entwurf.aktiv,
      });
      toast.success(entwurf.id ? `${entwurf.kennzeichen.trim().toUpperCase()} gespeichert` : `${entwurf.kennzeichen.trim().toUpperCase()} angelegt`);
      setEntwurf(null);
      setVersuch((v) => v + 1);
    } catch (err) {
      setFehler(grundAus(err, 'Das Fahrzeug konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  async function rueckgabeSpeichern() {
    if (!user) return;
    setRueckgabeSpeichert(true);
    try {
      await updateCompany(user.companyId, { lagerRueckgabeFahrer: rueckgabe });
      await reloadCompany();
      toast.success(rueckgabe ? 'Fahrer lagern ab jetzt selbst zurück' : 'Zurücklagern bucht wieder das Lager');
    } catch (err) {
      toast.error(grundAus(err, 'Die Einstellung konnte nicht gespeichert werden.'));
    } finally {
      setRueckgabeSpeichert(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        ort="Einstellungen"
        title="Fahrzeuge"
        subtitle="Kennzeichen, Standardfahrer und je Fahrzeug ein Fahrzeuglager"
        action={darf ? <Button onClick={() => { setFehler(null); setEntwurf({ ...LEER }); }}>Fahrzeug anlegen</Button> : undefined}
        hilfe={
          <>
            Jedes Fahrzeug hat ein eigenes Fahrzeuglager. Was dort liegt, steht im Lager unter dem
            Fahrzeug; dorthin kommt es durch Umlagern oder eine Zählung am Ort. Der Standardfahrer sieht
            sein Fahrzeug unter „Material anfordern“ als „Mein Fahrzeug“, und beim Abhaken der Rüstliste
            wird es vorgeschlagen. Ein Fahrzeug, in dem noch Material liegt, lässt sich nicht stilllegen.
            Das Kennzeichen an der Zeitbuchung bleibt ein freies Feld; die Zeiterfassung schlägt die
            Fahrzeuge nur vor.
          </>
        }
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <Card title="Fahrzeuge" buendig>
        {ladeFehler ? (
          <div className="px-4 pb-4"><ErrorState message={ladeFehler} /></div>
        ) : fahrzeuge === null ? (
          <div className="px-4 pb-4"><SkeletonList rows={3} /></div>
        ) : fahrzeuge.length === 0 ? (
          <EmptyState>Noch kein Fahrzeug angelegt.</EmptyState>
        ) : (
          <List>
            {fahrzeuge.map((f) => (
              <ListRow
                key={f.id}
                title={fahrzeugText(f)}
                subtitle={f.standardfahrerUid ? `Standardfahrer: ${namen.get(f.standardfahrerUid) ?? '—'}` : 'ohne Standardfahrer'}
                zustand={f.aktiv ? undefined : <Zustand stand="erledigt">stillgelegt</Zustand>}
                onOeffnen={darf ? () => {
                  setFehler(null);
                  setEntwurf({
                    id: f.id,
                    kennzeichen: f.kennzeichen,
                    bezeichnung: f.bezeichnung ?? '',
                    standardfahrerUid: f.standardfahrerUid ?? '',
                    aktiv: f.aktiv,
                  });
                } : undefined}
                pfeil={darf}
              />
            ))}
          </List>
        )}
      </Card>

      <Card
        title="Kennzeichen aus Buchungen"
        hint="Kennzeichen, die in Zeitbuchungen eingetragen sind und noch zu keinem Fahrzeug gehören — häufigste zuerst. Das ist nur ein Vorschlag: übernommen wird nichts von selbst, und die Buchungen bleiben, wie sie sind."
        buendig
      >
        {vorschlaege === null ? (
          <div className="px-4 pb-4"><SkeletonList rows={2} /></div>
        ) : vorschlaege.length === 0 ? (
          <EmptyState>Kein Kennzeichen aus Buchungen, das noch kein Fahrzeug ist.</EmptyState>
        ) : (
          <List>
            {vorschlaege.map((v) => (
              <ListRow
                key={v.kennzeichen}
                title={v.kennzeichen}
                subtitle={`${v.buchungen === 1 ? '1 Buchung' : `${v.buchungen} Buchungen`} · zuletzt ${datumAT(v.zuletzt)}`}
              >
                {darf && (
                  <Button
                    variant="secondary"
                    onClick={() => { setFehler(null); setEntwurf({ ...LEER, kennzeichen: v.kennzeichen }); }}
                  >
                    Als Fahrzeug anlegen
                  </Button>
                )}
              </ListRow>
            ))}
          </List>
        )}
      </Card>

      <Card
        title="Rückgabe durch den Fahrer"
        hint="Heute bucht das Lager die Verwaltung oder die Leitung. Ist das eingeschaltet, lagert der Standardfahrer Material aus seinem Fahrzeug selbst ins Hauptlager zurück — unter „Mein Fahrzeug“. In andere Fahrzeuge oder Lager umlagern kann er nicht. Festlegen darf es die Geschäftsführung."
      >
        <div className="formular flex flex-col gap-4">
          <CheckboxField
            id="lagerRueckgabeFahrer"
            label="Der Standardfahrer lagert aus seinem Fahrzeug selbst ins Hauptlager zurück"
            checked={rueckgabe}
            disabled={!spitze}
            onChange={(e) => setRueckgabe(e.target.checked)}
          />
          {spitze && (
            <div className="fuss-aktionen">
              <Button
                type="button"
                loading={rueckgabeSpeichert}
                disabled={rueckgabe === rueckgabeGespeichert}
                onClick={() => void rueckgabeSpeichern()}
              >
                Speichern
              </Button>
            </div>
          )}
        </div>
      </Card>

      <BottomSheet
        open={!!entwurf}
        onClose={() => setEntwurf(null)}
        label="Fahrzeug"
        auchBreit
        titel={entwurf?.id ? 'Fahrzeug ändern' : 'Fahrzeug anlegen'}
      >
        {entwurf && (
          <div className="formular space-y-4">
            <InputField
              id="fahrzeug-kennzeichen"
              label="Kennzeichen"
              pflicht
              autoComplete="off"
              placeholder="z. B. W-12345A"
              value={entwurf.kennzeichen}
              onChange={(e) => setEntwurf({ ...entwurf, kennzeichen: e.target.value.toUpperCase() })}
            />
            <InputField
              id="fahrzeug-bezeichnung"
              label="Bezeichnung"
              placeholder="z. B. Sprinter Kundendienst"
              value={entwurf.bezeichnung}
              onChange={(e) => setEntwurf({ ...entwurf, bezeichnung: e.target.value })}
            />
            <SelectField
              id="fahrzeug-fahrer"
              label="Standardfahrer (optional)"
              value={entwurf.standardfahrerUid}
              onChange={(e) => setEntwurf({ ...entwurf, standardfahrerUid: e.target.value })}
            >
              <option value="">kein Standardfahrer</option>
              {fahrerWahl.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
            </SelectField>
            {entwurf.id && (
              <CheckboxField
                id="fahrzeug-aktiv"
                label="In Betrieb"
                checked={entwurf.aktiv}
                onChange={(e) => setEntwurf({ ...entwurf, aktiv: e.target.checked })}
              />
            )}
            {fehler && <ErrorState message={fehler} />}
            <div className="fuss-aktionen">
              <Button variant="ghost" onClick={() => setEntwurf(null)}>Abbrechen</Button>
              <Button loading={speichert} onClick={() => void speichern()}>Speichern</Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
