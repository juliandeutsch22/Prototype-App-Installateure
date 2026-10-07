import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { imLager, istKnapp } from './lagerartikel';
import { aufschlagFuer, verkaufspreisVorschlag } from '@/lib/aufschlag';
import { useAuth } from '@/app/AuthContext';
import { darfEinkaufSehen, darfKatalogEinspielen } from '@/lib/permissions';
import {
  subscribeMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  LOW_STOCK_THRESHOLD,
} from '@/lib/db/materials';
import { KATALOG_GRENZE } from '@/lib/listengrenzen';
import { einkaufspreise } from '@/lib/db/kosten';
import type { WithId } from '@/lib/db/core';
import type { Material } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Marke, Warnung } from '@/components/Badge';
import BottomSheet from '@/components/BottomSheet';
import { MehrAnzeigen } from '@/components/LotBausteine';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { CheckboxField, InputField, FormGrid, Pflichthinweis } from '@/components/Field';
import { euro } from '@/lib/betrag';
import { fmtMenge } from '@/lib/belegLayout';
import InfoHint from '@/components/InfoHint';
import Nachladen from '@/components/Nachladen';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import { leseZahl, preisAlsText, zahlOder } from '@/lib/zahl';
import { grundAus } from '@/lib/fehlerGrund';
import ZahlFeld from '@/components/ZahlFeld';
import EinheitFeld from '@/components/EinheitFeld';

/*
  Die üblichen Mengeneinheiten im Sanitär- und Heizungsbau — als
  Vorschlagsliste, nicht als Zwang: ein Betrieb führt auch Sonderposten, und
  ein Auswahlfeld, das die passende Einheit nicht kennt, ist schlimmer als ein
  freies Feld. Die Liste steht in `@/lib/einheit`, samt der Regel, welche
  Einheit Nachkommastellen nimmt (M27).
*/

/** Gruppen höchstens 20 Zeilen (Regel 4), dann „und N weitere anzeigen“. */
const JE_SEITE = 20;

const empty = {
  name: '',
  category: '',
  stock: '0',
  articleNumber: '',
  /*
    LEER MIT „Stk“ ALS PLATZHALTER (Testbericht 30.09.2026, G2). Als echter
    Wert wurde beim Tippen „StkStk“ daraus; gespeichert wird ohne Angabe
    weiter „Stk“.
  */
  unit: '',
  verkaufspreis: '',
  einkaufspreis: '',
  /*
    VON HAND ANGELEGT HEISST MEIST „LIEGT IM REGAL“ — deshalb vorbelegt (M30).
    Eingespielte Artikel stehen dagegen nur im Katalog, bis jemand sie führt.
  */
  lagerartikel: true,
  mindestmenge: '',
  warengruppe: '',
};

/**
 * Materialkatalog (Verwaltung/GF). Ohne diese Pflege bleibt die Bestellansicht
 * für einen neuen Betrieb dauerhaft leer.
 *
 * DER VERKAUFSPREIS steht hier, seit Material auf die Rechnung kommt. Bis
 * dahin war der Katalog bewusst preisfrei — Materialanforderungen sind interne
 * Logistik, der Monteur sagt der Projektleitung, was er braucht, und ein Preis
 * hätte dort nur abgelenkt.
 *
 * Er ändert daran nichts: der Monteur sieht ihn nicht, und die Anforderung
 * trägt ihn auch weiterhin nicht. Gebraucht wird er an genau einer Stelle —
 * wenn das Büro aus den unterschriebenen Handwerksscheinen eine Rechnung
 * stellt. Fehlt er, steht die Zeile dort mit 0,00 € und will ausgefüllt
 * werden; das ist besser als eine erfundene Zahl.
 *
 * DER EINKAUFSPREIS steht seit dem 07.09.2026 daneben, aber nur für die
 * Geschäftsführung. Er ist die Kostenseite und damit Margendaten; die
 * Nachkalkulation rechnete ohne ihn und wies einen Deckungsbeitrag aus, der
 * systematisch zu hoch war. Dass die Verwaltung diesen Katalog pflegt und den
 * Einkaufspreis trotzdem nicht setzen darf, ist kein Widerspruch: die Grenze
 * läuft zwischen den FELDERN, nicht zwischen den Ansichten, und steht hart im
 * Trigger `materials_felder`. Seit dem 29.09.2026 gilt dasselbe fürs LESEN:
 * der Preis liegt in `material_einkaufspreise`, die nur die Spitze liest
 * (offene Punkte B1), und wird beim Öffnen eines Artikels eigens geholt.
 */
/**
 * @param zuBearbeiten Ein Artikel, der beim Öffnen sofort im Formular stehen
 *   soll — so kommt man aus der Bestandsliste mit einem Griff hierher, statt
 *   den Artikel im Katalog noch einmal suchen zu müssen.
 */
export default function MaterialCatalog({
  zuBearbeiten,
  onUebernommen,
}: {
  zuBearbeiten?: WithId<Material> | null;
  onUebernommen?: () => void;
} = {}) {
  const { user, company } = useAuth();
  const aufschlag = company?.rates?.materialaufschlag;
  /*
    DEN EINKAUFSPREIS SIEHT die Leitung — oder die Verwaltung mit Freigabe
    „Einkaufspreise sehen“ oder „Katalog einspielen“; SETZEN darf ihn die
    Leitung und, wer einspielen darf (Testbericht 30.09.2026, M37). Er ist
    Margendaten; die Grenze zieht die Datenbank.
  */
  const darfKosten = user ? darfEinkaufSehen(user) : false;
  const darfEkSetzen = user ? darfKatalogEinspielen(user) : false;
  const toast = useToast();
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /*
    DER LADEFEHLER HAT SEINEN EIGENEN PLATZ über der Liste. Bis zum Umbau
    teilte er sich die Meldung mit dem Formular, das immer sichtbar war; im
    Seitenfenster sähe ihn sonst niemand.
  */
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | null>(null);
  /** Das Seitenfenster mit dem Formular — für einen neuen wie für einen bestehenden Artikel. */
  const [formOffen, setFormOffen] = useState(false);
  /** Wie viele Zeilen stehen (Regel 4: höchstens 20, dann „und N weitere“). */
  const [gezeigt, setGezeigt] = useState(JE_SEITE);
  /*
    DER EINKAUFSPREIS KOMMT NICHT MIT DEM ARTIKEL (offene Punkte B1). Solange
    er nicht geholt ist, geht er beim Speichern NICHT mit: das leere Feld
    schriebe sonst 0 über den hinterlegten Preis.
  */
  const [ekStand, setEkStand] = useState<'da' | 'laedt' | 'fehlt'>('da');
  const offenerArtikel = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<WithId<Material> | null>(null);
  /*
    Wie viele Artikel geholt werden. Der Katalog lief bis hierher ohne jede
    Grenze — warum das eine Sicherung braucht und warum sie heute nirgends
    greift, steht in `lib/db/materials.ts`.
  */
  const [grenze, setGrenze] = useState(KATALOG_GRENZE);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeMaterials(
      user.companyId,
      (rows) => {
        setMaterials(rows);
        setLoading(false);
      },
      (e) => {
        setLadeFehler(e.message);
        setLoading(false);
      },
      grenze,
    );
    return unsub;
  }, [user, grenze]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = [...materials].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (!q) return rows;
    return rows.filter((m) =>
      [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [materials, search]);

  const lowStock = useMemo(
    () => materials.filter((m) => imLager(m) && istKnapp(m.stock ?? 0, m, LOW_STOCK_THRESHOLD)).length,
    [materials],
  );

  /**
   * Von aussen zum Bearbeiten hereingereicht.
   *
   * `onUebernommen` meldet zurueck, dass es angekommen ist — sonst wuerde
   * derselbe Artikel bei jedem Neuzeichnen erneut ins Formular gesetzt und
   * eine begonnene Aenderung dabei verworfen.
   */
  useEffect(() => {
    if (!zuBearbeiten) return;
    startEdit(zuBearbeiten);
    onUebernommen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zuBearbeiten]);

  function startEdit(m: WithId<Material>) {
    setEditId(m.id);
    setError(null);
    setFormOffen(true);
    offenerArtikel.current = m.id;
    if (darfKosten && user) {
      setEkStand('laedt');
      einkaufspreise(user.companyId, [m.id]).then(
        (preise) => {
          if (offenerArtikel.current !== m.id) return;
          const ek = preise.get(m.id);
          setForm((f) => ({ ...f, einkaufspreis: ek != null ? preisAlsText(ek) : '' }));
          setEkStand('da');
        },
        () => {
          if (offenerArtikel.current === m.id) setEkStand('fehlt');
        },
      );
    }
    setForm({
      name: m.name,
      category: m.category ?? '',
      stock: String(m.stock ?? 0),
      articleNumber: m.articleNumber ?? '',
      unit: m.unit ?? 'Stk',
      verkaufspreis: m.verkaufspreis != null ? preisAlsText(m.verkaufspreis) : '',
      einkaufspreis: '',
      lagerartikel: imLager(m),
      mindestmenge: m.mindestmenge != null ? String(m.mindestmenge).replace('.', ',') : '',
      warengruppe: m.warengruppe ?? '',
    });
  }
  function reset() {
    setFormOffen(false);
    setEditId(null);
    offenerArtikel.current = null;
    setEkStand('da');
    setForm(empty);
  }

  /** Ein neues Material: leeres Formular im Seitenfenster. */
  function neu() {
    reset();
    setError(null);
    setFormOffen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    // Zentrale Zahlenlesung (M15): „7.500“ ist uneindeutig und wird gemeldet, nicht 0.
    const unlesbar = [form.verkaufspreis, form.einkaufspreis, form.stock, form.mindestmenge]
      .map((t) => leseZahl(t).fehler)
      .find(Boolean);
    if (unlesbar) {
      setError(unlesbar);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      /*
        LEER HEISST „NICHT GEPFLEGT", NICHT NULL.

        Ein Preis von 0,00 € und ein fehlender Preis sind für die Rechnung
        dasselbe Ergebnis, aber nicht dieselbe Aussage: der eine ist eine
        Entscheidung, der andere eine Lücke. Die Rechnung weist genau die
        Lücken aus — deshalb geht ein leeres Feld als 0 hinein und wird dort
        als „ohne Preis" behandelt.
      */
      const preis = form.verkaufspreis.trim();
      const ek = form.einkaufspreis.trim();
      const bestand = zahlOder(form.stock, 0);
      const data = {
        name: form.name.trim(),
        category: form.category.trim(),
        articleNumber: form.articleNumber.trim(),
        unit: form.unit.trim() || 'Stk',
        verkaufspreis: preis === '' ? 0 : Math.max(0, zahlOder(preis, 0)),
        // M30/M31: ob er im Lager liegt, ab wann er knapp ist, welche Warengruppe den Aufschlag bestimmt.
        lagerartikel: form.lagerartikel,
        mindestmenge: form.lagerartikel && form.mindestmenge.trim() !== ''
          ? Math.max(0, zahlOder(form.mindestmenge, 0))
          : null,
        warengruppe: form.warengruppe.trim() || null,
        /*
          DER EINKAUFSPREIS WANDERT NUR MIT, WENN DIE ROLLE IHN SETZEN DARF.

          Serverseitig lässt die Regel eine Änderung dieses Feldes nur der
          Geschäftsführung durch. Das Formular der Verwaltung kennt den Wert
          gar nicht und trüge eine 0 ein, wo der Chef 3,50 hinterlegt hat —
          gescheitert wäre dann ihr GANZES Speichern, der Knopf täte nichts,
          und niemand wüsste warum. Sie schickt das Feld deshalb nicht mit.
        */
        ...(darfEkSetzen && ekStand === 'da'
          ? { einkaufspreis: ek === '' ? 0 : Math.max(0, zahlOder(ek, 0)) }
          : {}),
      };
      if (editId) {
        /*
          DER BESTAND BLEIBT HIER DRAUSSEN (Testbericht 30.09.2026, M28): er
          ändert sich nur über Wareneingang, Abholung, Retoure oder Inventur,
          jede mit Eintrag im Bewegungsprotokoll. Vorher liess er sich hier
          ohne Grund überschreiben.
        */
        await updateMaterial(editId, data);
      } else {
        await createMaterial(user.companyId, { ...data, stock: form.lagerartikel ? bestand : 0 });
      }
      toast.success(editId ? 'Material gespeichert' : 'Material angelegt');
      reset();
    } catch (err) {
      setError(grundAus(err, 'Das Material konnte nicht gespeichert werden.'));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/*
        DIE LISTE ZUERST, DAS FORMULAR IM SEITENFENSTER (Linie „Lot“,
        Regel 8). Bis zum Umbau stand das Formular als Karte über der Liste:
        wer weit unten auf „Bearbeiten“ tippte, sah oben das Formular
        wechseln und musste zurückrollen. Jetzt öffnet die Zeile den Artikel
        dort, wo man gerade ist.
      */}
      <Card
        title={`Katalog (${materials.length})`}
        action={
          <>
            {lowStock > 0 ? <Warnung>{lowStock} knapp</Warnung> : null}
            <Button variant="secondary" onClick={neu}>Neues Material</Button>
          </>
        }
      >
        <InputField
          id="msearch"
          label="Suche"
          placeholder="Name, Kategorie oder Art.-Nr."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setGezeigt(JE_SEITE);
          }}
        />
        <div className="mt-4">
          {ladeFehler && <ErrorState message={ladeFehler} />}
          {loading ? (
            <SkeletonList rows={4} />
          ) : visible.length === 0 ? (
            <EmptyState
              action={
                materials.length === 0 ? (
                  <Button onClick={neu}>
                    Erstes Material anlegen
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setSearch('')}>
                    Suche zurücksetzen
                  </Button>
                )
              }
            >
              {materials.length === 0
                ? 'Noch kein Material im Katalog. Was der Monteur anfordern kann, muss hier stehen.'
                : `Kein Material passt zu „${search}“.`}
            </EmptyState>
          ) : (
            <List>
              {visible.slice(0, gezeigt).map((m) => {
                const lager = imLager(m);
                const low = lager && istKnapp(m.stock ?? 0, m, LOW_STOCK_THRESHOLD);
                return (
                  <ListRow
                    key={m.id}
                    title={m.name}
                    onOeffnen={() => startEdit(m)}
                    subtitle={
                      [m.category, m.articleNumber && `Art.-Nr. ${m.articleNumber}`]
                        .filter(Boolean)
                        .join(' · ') || undefined
                    }
                    pfeil
                  >
                    {/*
                      „Ausgelaufen" steht VOR dem Bestand: es erklärt, warum
                      der Artikel in der Materialerfassung nicht mehr
                      auftaucht, und das ist die Frage, mit der jemand hier
                      nachsieht.
                    */}
                    {m.ausgelaufen && <Warnung>ausgelaufen</Warnung>}
                    {!lager ? (
                      // Nur im Katalog (M30): kein Bestand, den jemand prüfen müsste.
                      <span className="text-sm text-ink-muted">nur Katalog</span>
                    ) : low ? (
                      <Warnung>{m.stock ?? 0} {m.unit ?? 'Stk'}</Warnung>
                    ) : (
                      <Marke>{m.stock ?? 0} {m.unit ?? 'Stk'}</Marke>
                    )}
                  </ListRow>
                );
              })}
            </List>
          )}
          <MehrAnzeigen anzahl={Math.max(0, visible.length - gezeigt)} onClick={() => setGezeigt((n) => n + JE_SEITE)} />
          {/*
            Steht unter der Liste, nicht im Kopf: erst wer bis ans Ende
            gescrollt und nichts gefunden hat, braucht die Auskunft.
          */}
          <Nachladen
            geladen={materials.length}
            grenze={grenze}
            onMehr={() => setGrenze((g) => g + KATALOG_GRENZE)}
            einheit="Artikel"
            sucheSatz="Nach Name, Kategorie und Artikelnummer wird nur in diesen gesucht."
          />
        </div>
      </Card>

      <BottomSheet
        open={formOffen}
        onClose={reset}
        label={editId ? 'Material bearbeiten' : 'Neues Material'}
        auchBreit
        titel={editId ? 'Material bearbeiten' : 'Neues Material'}
      >
          <form onSubmit={submit} className="formular space-y-4">
            <FormGrid cols={1}>
              <InputField id="mname" label="Bezeichnung" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} required pflicht />
              <InputField id="mcat" label="Kategorie" placeholder="z. B. Sanitär" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <InputField id="mart" label="Artikelnummer" value={form.articleNumber}
                onChange={(e) => setForm({ ...form, articleNumber: e.target.value })} />
              {/*
                DIE EINHEIT IST DAS WORT HINTER DER ZAHL — mehr nicht.
              
                Aus dem Betrieb kam die Frage, wofür das Feld überhaupt da ist,
                und im Bestand stand daraufhin „100 20cm frei". Das ist die
                richtige Frage zur falschen Zeit gewesen: das Feld sagte nirgends,
                was es will, und eine Abmessung ist dort das Naheliegendste.
                Jetzt schlägt es die üblichen Einheiten vor und erklärt sich.
              */}
              <div>
                <EinheitFeld id="munit" value={form.unit || 'Stk'} onChange={(unit) => setForm({ ...form, unit })} />
                <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-muted">
                  Das Wort hinter der Zahl — „100 Stk“, „30 m“.
                  <InfoHint about="die Einheit">
                    Sie beschriftet nur die Menge: im Katalog, im Lager und beim Wareneingang.
                    Auf Rechnungen und Angeboten wirkt sie nicht — dort trägt jede Position ihre
                    eigene Einheit. <strong>Eine Abmessung gehört nicht hierher</strong>: aus „20cm“
                    wird im Bestand „100 20cm frei“. Die Größe gehört in die Bezeichnung
                    („Kupferrohr 20 cm“) oder in die Artikelnummer.
                  </InfoHint>
                </p>
              </div>
              <InputField id="mwg" label="Warengruppe" placeholder="aus DATANORM, z. B. 1201" value={form.warengruppe}
                onChange={(e) => setForm({ ...form, warengruppe: e.target.value })} />
            </FormGrid>
            {/*
              KATALOG UND LAGER GETRENNT (Testbericht 30.09.2026, M30). Nicht jeder
              Katalogartikel liegt im Regal; erst dieser Haken führt ihn im Lager.
              Abschalten geht nur bei Bestand null — sonst stünde ein Bestand in
              keiner Lagerliste.
            */}
            <div className="space-y-1">
              <CheckboxField
                id="mlager"
                label="Im Lager führen"
                checked={form.lagerartikel}
                disabled={!!editId && form.lagerartikel && zahlOder(form.stock, 0) !== 0}
                onChange={(e) => setForm({ ...form, lagerartikel: e.target.checked })}
              />
              <p className="text-xs text-ink-muted">
                {!!editId && form.lagerartikel && zahlOder(form.stock, 0) !== 0
                  ? 'Liegt im Lager — abschalten geht erst, wenn die Inventur den Bestand auf null gesetzt hat.'
                  : 'Ohne Haken steht der Artikel nur im Katalog: anforderbar und verrechenbar, aber in keiner Lagerliste.'}
              </p>
            </div>
            <FormGrid cols={1}>
              {!form.lagerartikel ? null : editId ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-normal text-ink">Lagerbestand</span>
                  <p className="text-sm text-ink">
                    {form.stock} {form.unit || 'Stk'}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Ändert sich über Wareneingang oder Inventur im Bereich „Bestand“ — mit Grund im
                    Bewegungsprotokoll.
                  </p>
                </div>
              ) : (
                <ZahlFeld id="mstock" label="Anfangsbestand" value={form.stock}
                  onChange={(t) => setForm({ ...form, stock: t })} required pflicht />
              )}
              {form.lagerartikel && (
                <ZahlFeld id="mmin" label="Mindestmenge" placeholder="leer = knapp ab höchstens 5 frei"
                  value={form.mindestmenge} onChange={(t) => setForm({ ...form, mindestmenge: t })} />
              )}
              <div className="flex flex-col gap-1.5">
                <ZahlFeld
                  id="mpreis"
                  label="Verkaufspreis netto je Einheit (€)"
                  placeholder="leer = nicht gepflegt"
                  value={form.verkaufspreis}
                  onChange={(t) => setForm({ ...form, verkaufspreis: t })}
                />
                {/*
                  DER VORSCHLAG AUS EINKAUF PLUS AUFSCHLAG (M31) — nur ein
                  Vorschlag: der Verkaufspreis ist die Kalkulation des Betriebs
                  und bleibt, was hier steht, bis jemand übernimmt.
                */}
                {(() => {
                  if (!darfKosten || ekStand !== 'da') return null;
                  const ek = leseZahl(form.einkaufspreis).wert;
                  const vorschlag = verkaufspreisVorschlag(ek, aufschlag, form.warengruppe);
                  if (vorschlag == null) return null;
                  const prozent = aufschlagFuer(aufschlag, form.warengruppe);
                  return (
                    <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                      <span>Vorschlag: {euro(vorschlag)} (Einkauf + {fmtMenge(prozent ?? 0)} %)</span>
                      <Button type="button" variant="ghost" onClick={() => setForm({ ...form, verkaufspreis: preisAlsText(vorschlag) })}>
                        Übernehmen
                      </Button>
                    </p>
                  );
                })()}
              </div>
              {/*
                Der EINKAUFSPREIS steht nur der Geschäftsführung offen: er ist
                die Grundlage der Nachkalkulation, also Margendaten. SETZEN kann
                ihn nur sie — das verweigert die Datenbank allen anderen
                (Trigger `materials_felder`), und seit dem 29.09.2026 LESEN auch
                nur sie (`material_einkaufspreise`, offene Punkte B1).
              */}
              {darfKosten && (
                <div className="flex flex-col gap-1.5">
                  <ZahlFeld
                    id="mek"
                    label="Einkaufspreis netto je Einheit (€)"
                    placeholder={ekStand === 'laedt' ? 'wird geladen …' : 'leer = nicht gepflegt'}
                    disabled={ekStand !== 'da' || !darfEkSetzen}
                    value={form.einkaufspreis}
                    onChange={(t) => setForm({ ...form, einkaufspreis: t })}
                  />
                  {ekStand === 'fehlt' && (
                    <p className="text-sm text-ink-muted">
                      Der Einkaufspreis konnte nicht geladen werden — er bleibt beim Speichern, wie er ist.
                    </p>
                  )}
                </div>
              )}
            </FormGrid>
            <Pflichthinweis />
            {error && <ErrorState message={error} />}
            <div className="fuss-aktionen">
              {editId && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    const m = materials.find((x) => x.id === editId);
                    // Die Rückfrage steht allein, nicht hinter dem Fenster.
                    if (m) {
                      reset();
                      setToDelete(m);
                    }
                  }}
                >
                  Material löschen …
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={reset}>
                Abbrechen
              </Button>
              <Button type="submit" loading={saving}>
                {editId ? 'Änderungen speichern' : 'Material anlegen'}
              </Button>
            </div>
          </form>
      </BottomSheet>

      <ConfirmDialog
        open={!!toDelete}
        title="Material löschen?"
        message={
          toDelete
            ? `„${toDelete.name}“ wird aus dem Katalog entfernt. Bereits erfasste Bestellungen bleiben erhalten.`
            : ''
        }
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            if (editId === toDelete.id) reset();
            await deleteMaterial(toDelete.id);
            toast.success('Material gelöscht');
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
