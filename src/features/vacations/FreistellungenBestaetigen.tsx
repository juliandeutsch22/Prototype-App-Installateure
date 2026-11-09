import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppUser, Company, Freistellung } from '@/types';
import {
  arztbesuchVorschlag,
  freistellungEntscheiden,
  listBestaetigteFreistellungenAb,
  listFreistellungenVon,
  listOffeneFreistellungen,
  nachweisAdresse,
  nachweiseAufraeumen,
} from '@/lib/db/freistellungen';
import { listUsers } from '@/lib/db/users';
import {
  KUERZUNG_AB_VORGABE,
  anlaesseDesBetriebs,
  anlassVon,
  istArztbesuch,
  istTeilung,
  kalendertage,
  laengerAlsEinMonat,
  pflegeStand,
  tageUeberKontingent,
  warnungen,
  type FreistellungFuerRegeln,
} from '@shared/freistellung';
import { kuerzungsVorschlag } from '@shared/urlaubAliquot';
import { darfUnbezahltEntscheiden, darfUrlaubEntscheiden } from '@/lib/permissions';
import { DEFAULT_VACATION_DAYS as DEFAULT_URLAUBSTAGE } from '@/lib/db/benutzerVorgaben';
import { fmtDauer, fmtMin, todayStr, uebertragsRegel, urlaubsTage, tageZahl } from '@/lib/time';
import { leseZahl } from '@/lib/zahl';
import Card from '@/components/Card';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import InfoHint from '@/components/InfoHint';
import { CheckboxField, InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { Warnung } from '@/components/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { schluessel, useGemerkt } from '@/lib/zwischenspeicher';
import { anrechnungVermerk, freistellungWas, freistellungZeitraum, leseDauer, nachweisVermerk, terminMinuten, ueberVermerk } from './freistellungText';
import type { ArztbesuchVorschlag } from '@/lib/db/freistellungen';
import { eintraegeUmDenTag } from '@/lib/db/timeEntries';
import { ueberschneidungen, type Ueberschneidung } from './freistellungUeberschneidung';

/** Was ein Bestätigen im Zeitkonto bewirkt hat, in einem Satz. */
function ergebnis(e: { angelegt: number; uebersprungen: number; entfernt: number; alsUrlaub?: number }): string {
  const teile: string[] = [];
  if (e.angelegt) {
    teile.push(`${e.angelegt} ${e.angelegt === 1 ? 'Tag' : 'Tage'} eingetragen${
      e.alsUrlaub ? `, davon ${e.alsUrlaub} als Urlaub` : ''}`);
  }
  if (e.entfernt) teile.push(`${e.entfernt} ${e.entfernt === 1 ? 'Tag' : 'Tage'} entfernt`);
  if (e.uebersprungen) teile.push(`${e.uebersprungen} übersprungen (dort war schon gebucht)`);
  return teile.join(', ');
}

interface Kuerzungszeile {
  urlaubsjahr: number;
  kalendertage: number;
  tage: string;
  an: boolean;
}

/**
 * SONDERURLAUB BESTÄTIGEN — für Büro, Geschäftsführung und Administration
 * (Plan 10.3). Neben den Urlaubsanträgen, weil der Anlass nicht in die
 * Urlaubsliste gehört: die liest auch die Projektleitung.
 *
 * Je Antrag: Anlass, Arbeitstage, Warnungen, der Nachweis zum Ansehen und
 * der Haken „Nachweis geprüft"; beim unbezahlten Urlaub der Vorschlag zur
 * Kürzung des Anspruchs. Darunter die bestätigten, die noch laufen — zum
 * Zurücknehmen.
 */
export default function FreistellungenBestaetigen({
  user,
  company,
}: {
  user: { uid: string; companyId: string; role: AppUser['role'] };
  company: Company | null | undefined;
}) {
  const toast = useToast();
  /*
    DER LETZTE STAND (Stufe 3, `lib/zwischenspeicher.ts`): beim zweiten
    Besuch stehen die Anträge sofort da; frisch geholt wird im Hintergrund.
    Nur beim Aufbau — nach einer Bestätigung lädt die Karte wie bisher mit
    „Wird geladen …“, damit niemand einen eben entschiedenen Antrag ein
    zweites Mal antippt.
  */
  const { anfang, merken } = useGemerkt<{
    offene: Freistellung[];
    laufend: Freistellung[];
    verlauf: Freistellung[];
    leute: AppUser[];
    vorschlaege?: Record<string, ArztbesuchVorschlag | 'fehler'>;
  }>(schluessel('sonderurlaubBestaetigen', user));
  const [offene, setOffene] = useState<Freistellung[] | 'laedt' | 'fehler'>(() => anfang?.offene ?? 'laedt');
  const [laufend, setLaufend] = useState<Freistellung[]>(() => anfang?.laufend ?? []);
  const [verlauf, setVerlauf] = useState<Freistellung[]>(() => anfang?.verlauf ?? []);
  const [leute, setLeute] = useState<AppUser[]>(() => anfang?.leute ?? []);
  const [versuch, setVersuch] = useState(0);
  const [geprueft, setGeprueft] = useState<Record<string, boolean>>({});
  const [kuerzung, setKuerzung] = useState<Record<string, Kuerzungszeile[]>>({});
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [begruenden, setBegruenden] = useState<{ f: Freistellung; art: 'Abgelehnt' | 'Storniert' } | null>(null);
  const [grund, setGrund] = useState('');
  /** Je Antrag: was mit den Tagen über dem Kontingent geschieht (Runde 3, G17). */
  const [ueberWahl, setUeberWahl] = useState<Record<string, 'urlaub' | 'sonderurlaub'>>({});
  const [ueberGrund, setUeberGrund] = useState<Record<string, string>>({});
  /*
    ARZTBESUCH (E35): je offenem Arztbesuch der Vorschlag der Datenbank —
    höchstens der Rest zur Sollzeit des Tages —, die angerechnete Zeit (als
    „h:mm“, vorbelegt mit dem Vorschlag) und ein Grund, wenn sie abweicht.
  */
  const [vorschlaege, setVorschlaege] = useState<Record<string, ArztbesuchVorschlag | 'fehler'>>(() => anfang?.vorschlaege ?? {});
  const [angerechnet, setAngerechnet] = useState<Record<string, string>>({});
  const [anrechnungGrund, setAnrechnungGrund] = useState<Record<string, string>>({});
  /*
    STUNDENWEISER SONDERURLAUB (Befund 09.11.2026): je offenem Antrag mit
    Uhrzeit, was zur selben Zeit schon gebucht ist. Über gearbeiteter Zeit
    lehnt die Datenbank das Bestätigen ab; die Karte sagt es vorher. Nicht
    Teil des Ladens der Liste: ein langsamer Blick in die Zeiten hält die
    Anträge nicht auf.
  */
  const [belegt, setBelegt] = useState<Record<string, Ueberschneidung[] | 'fehler'>>({});
  /** Beim Ablehnen eines Arztbesuchs: was aus der Zeit wird. */
  const [folge, setFolge] = useState<'zeitausgleich' | 'keine' | null>(null);
  // Ab Werk verlangt; nur ein ausdrückliches Nein des Betriebs schaltet es ab.
  const nachweisVerlangt = company?.arztbesuchNachweis !== false;

  const anlaesse = useMemo(() => anlaesseDesBetriebs(company?.freistellungAnlaesse), [company?.freistellungAnlaesse]);
  const spitze = darfUnbezahltEntscheiden(user.role);
  // Tage als Urlaub buchen darf nur, wer über Urlaub entscheidet — wie in der Datenbank.
  const urlaubEntscheiden = darfUrlaubEntscheiden(user.role, user.uid, company?.vacationApprovers);
  const regel = uebertragsRegel(company);

  const laden = useCallback(async (stehenLassen: boolean) => {
    setOffene((o) => (stehenLassen && Array.isArray(o) ? o : 'laedt'));
    try {
      const [o, l, alle] = await Promise.all([
        listOffeneFreistellungen(user.companyId),
        listBestaetigteFreistellungenAb(user.companyId, todayStr()),
        listUsers(user.companyId),
      ]);
      const [v, vs] = await Promise.all([
        listFreistellungenVon(user.companyId, o.map((x) => x.userId)),
        Promise.all(o.filter(istArztbesuch).map((f) =>
          arztbesuchVorschlag(f.id)
            .then((x) => [f.id, x] as const)
            // Ein fehlender Vorschlag hält die Liste nicht auf; die Zeile sagt es.
            .catch(() => [f.id, 'fehler'] as const))),
      ]);
      const vorschlagJeAntrag = Object.fromEntries(vs);
      setVerlauf(v);
      setLeute(alle);
      setLaufend(l);
      setVorschlaege(vorschlagJeAntrag);
      setOffene(o);
      merken({ offene: o, laufend: l, verlauf: v, leute: alle, vorschlaege: vorschlagJeAntrag });
    } catch {
      setOffene('fehler');
    }
  }, [user.companyId, merken]);

  useEffect(() => {
    // Beim Aufbau bleibt ein gemerkter Stand stehen; nach einer Aktion (`versuch`) lädt die Karte sichtbar neu.
    void laden(versuch === 0);
  }, [laden, versuch]);

  // Der Arztbesuch hat das schon in seinem Vorschlag (`arztbesuchTeil`).
  const stundenweise = Array.isArray(offene) ? offene.filter((f) => !!f.zeitVon && !istArztbesuch(f)) : [];
  const stundenweiseSchluessel = stundenweise.map((f) => f.id).join('|');
  useEffect(() => {
    let weg = false;
    for (const f of stundenweise) {
      Promise.resolve()
        .then(() => eintraegeUmDenTag(user.companyId, f.userId, f.von))
        .then((e) => ueberschneidungen(f, e))
        .catch(() => 'fehler' as const)
        .then((x) => { if (!weg) setBelegt((alt) => ({ ...alt, [f.id]: x })); });
    }
    return () => { weg = true; };
    // Am Inhalt, nicht an der Identität der Liste: sie ist nach jedem Laden eine neue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stundenweiseSchluessel, user.companyId, versuch]);

  // Liegengebliebene Nachweise entschiedener Anträge — einmal beim Öffnen.
  useEffect(() => {
    void nachweiseAufraeumen(user.companyId);
  }, [user.companyId]);

  const person = (uid: string) => leute.find((u) => u.uid === uid);

  /** Gibt es außer mir noch jemanden, der über diese Art entscheiden darf? */
  const andereEntscheiden = (f: Freistellung) =>
    leute.some((u) => u.uid !== user.uid && u.active !== false
      && (f.art === 'unbezahlt'
        ? u.role === 'Geschäftsführung' || u.role === 'Administrator'
        : u.role === 'Buchhaltung' || u.role === 'Geschäftsführung' || u.role === 'Administrator'));

  /** Der Vorschlag zur Kürzung — einmal je Antrag gerechnet, danach änderbar. */
  function vorschlag(f: Freistellung): Kuerzungszeile[] {
    const p = person(f.userId);
    const jahresanspruch = Number(p?.yearlyVacationDays ?? DEFAULT_URLAUBSTAGE) || DEFAULT_URLAUBSTAGE;
    return kuerzungsVorschlag(jahresanspruch, f.von, f.bis, regel.jahresbeginn ?? '01-01').map((t) => ({
      urlaubsjahr: t.urlaubsjahr,
      kalendertage: t.kalendertage,
      tage: tageZahl(t.tage),
      an: true,
    }));
  }

  useEffect(() => {
    if (!Array.isArray(offene)) return;
    const ab = company?.kuerzungAbTagen ?? KUERZUNG_AB_VORGABE;
    setKuerzung((bisher) => {
      const neu = { ...bisher };
      for (const f of offene) {
        if (f.art === 'unbezahlt' && !neu[f.id] && kalendertage(f.von, f.bis) >= ab) neu[f.id] = vorschlag(f);
      }
      return neu;
    });
    // vorschlag hängt an Personen und Regel; neu gerechnet wird nur für neue Anträge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offene, leute, company?.kuerzungAbTagen]);

  /*
    EINEN ARZTBESUCH BESTÄTIGEN (E35). Die Datenbank prüft dasselbe noch
    einmal; hier sagt es die Karte, bevor jemand auf eine Ablehnung wartet.
  */
  async function arztbesuchBestaetigen(f: Freistellung) {
    const v = vorschlaege[f.id];
    if (!v || v === 'fehler') {
      toast.error('Der Vorschlag zur angerechneten Zeit fehlt — bitte die Liste neu laden.');
      return;
    }
    if (nachweisVerlangt && !geprueft[f.id]) {
      toast.error('Der Betrieb verlangt für Arztbesuche eine Bestätigung — bitte ansehen (Datei oder Papier) und „Nachweis geprüft“ anhaken.');
      return;
    }
    const min = leseDauer(angerechnet[f.id] ?? fmtMin(v.vorschlag));
    if (min === null) {
      toast.error('Die angerechnete Zeit bitte als Stunden:Minuten angeben, etwa 1:30.');
      return;
    }
    if (min <= 0) {
      toast.error('Angerechnet wird mehr als null — sonst bitte ablehnen.');
      return;
    }
    if (min > v.termin) {
      toast.error(`Angerechnet werden höchstens die ${fmtDauer(v.termin)} des Termins.`);
      return;
    }
    const grundText = (anrechnungGrund[f.id] ?? '').trim();
    if (min !== v.vorschlag && grundText.length < 3) {
      toast.error('Bitte begründen, warum die angerechnete Zeit vom Vorschlag abweicht.');
      return;
    }
    setArbeitet(f.id);
    try {
      const e = await freistellungEntscheiden({
        id: f.id, entscheidung: 'Bestätigt', nachweisGeprueft: !!geprueft[f.id],
        angerechnetMin: min === v.vorschlag ? null : min,
        anrechnungGrund: min === v.vorschlag ? undefined : grundText,
      });
      toast.success(`Bestätigt — ${fmtDauer(Number(e.angerechnet ?? min))} angerechnet`);
      if (e.dateiBlieb) toast.error('Der Nachweis konnte nicht gelöscht werden — beim nächsten Öffnen wird er weggeräumt.');
      setVersuch((x) => x + 1);
    } catch (err) {
      toast.error(grundAus(err, 'Der Arztbesuch konnte nicht bestätigt werden.'));
    } finally {
      setArbeitet(null);
    }
  }

  async function bestaetigen(f: Freistellung, ueber: number) {
    if (istArztbesuch(f)) {
      await arztbesuchBestaetigen(f);
      return;
    }
    /*
      ÜBER DEM KONTINGENT (Runde 3, G17): vorher ging die Bestätigung mit
      einem Hinweis durch, ohne Grund. Jetzt erst nach einer Wahl — die
      Datenbank verlangt sie ebenso.
    */
    const wahl = ueber > 0 ? ueberWahl[f.id] : undefined;
    if (ueber > 0 && !wahl) {
      toast.error('Bitte wählen, wie die Tage über dem Kontingent gebucht werden.');
      return;
    }
    if (wahl === 'sonderurlaub' && (ueberGrund[f.id] ?? '').trim().length < 3) {
      toast.error('Bitte begründen, warum die Tage über dem Kontingent als Sonderurlaub gelten.');
      return;
    }
    const zeilen = (kuerzung[f.id] ?? []).filter((z) => z.an);
    const k: Array<{ urlaubsjahr: number; tage: number }> = [];
    for (const z of zeilen) {
      const g = leseZahl(z.tage);
      if (g.fehler || g.wert === null || g.wert <= 0) {
        toast.error(`Die Kürzung für ${z.urlaubsjahr} ist keine gültige Zahl.`);
        return;
      }
      k.push({ urlaubsjahr: z.urlaubsjahr, tage: Math.round(g.wert * 100) / 100 });
    }
    setArbeitet(f.id);
    try {
      const e = await freistellungEntscheiden({
        id: f.id, entscheidung: 'Bestätigt', nachweisGeprueft: !!geprueft[f.id], kuerzung: k,
        ueberKontingent: wahl ?? null,
        ueberGrund: wahl === 'sonderurlaub' ? (ueberGrund[f.id] ?? '').trim() : undefined,
      });
      toast.success(`Bestätigt — ${ergebnis(e)}`);
      if (e.dateiBlieb) toast.error('Der Nachweis konnte nicht gelöscht werden — beim nächsten Öffnen wird er weggeräumt.');
      setVersuch((v) => v + 1);
    } catch (err) {
      toast.error(grundAus(err, 'Der Antrag konnte nicht bestätigt werden.'));
    } finally {
      setArbeitet(null);
    }
  }

  async function begruendetEntscheiden() {
    if (!begruenden) return;
    if (grund.trim().length < 3) throw new Error('Bitte einen Grund angeben — mindestens drei Zeichen.');
    // Ein abgelehnter Arztbesuch braucht die Folge: Zeitausgleich oder ohne Buchung (E35).
    const arzt = begruenden.art === 'Abgelehnt' && istArztbesuch(begruenden.f);
    if (arzt && !folge) throw new Error('Bitte wählen, was aus der Zeit wird: Zeitausgleich oder ohne Buchung.');
    const e = await freistellungEntscheiden({
      id: begruenden.f.id, entscheidung: begruenden.art, grund: grund.trim(),
      ...(arzt ? { ablehnungFolge: folge } : {}),
    });
    setBegruenden(null);
    setGrund('');
    setFolge(null);
    toast.success(begruenden.art === 'Abgelehnt'
      ? (e.alsZeitausgleich ? 'Abgelehnt — als Zeitausgleich gebucht' : 'Abgelehnt')
      : `Zurückgenommen${e.entfernt ? ` — ${ergebnis(e)}` : ''}`);
    if (e.dateiBlieb) toast.error('Der Nachweis konnte nicht gelöscht werden — beim nächsten Öffnen wird er weggeräumt.');
    setVersuch((v) => v + 1);
  }

  /*
    DAS FENSTER ÖFFNET SICH NOCH IM KLICK (Runde 3, G26). Safari auf iPhone und
    iPad öffnet ein neues Fenster nur unmittelbar auf eine Berührung; nach dem
    Warten auf die signierte Adresse blockte es `window.open` still, und der
    Nachweis ließ sich nicht ansehen. Erst ein leeres Fenster, dann die Adresse.
  */
  async function ansehen(pfad: string) {
    const fenster = window.open('', '_blank');
    try {
      const adresse = await nachweisAdresse(pfad);
      if (fenster) {
        // Wie `noopener`: der Nachweis bekommt keinen Zugriff auf die App.
        fenster.opener = null;
        fenster.location.href = adresse;
      } else {
        window.open(adresse, '_blank', 'noopener');
      }
    } catch (err) {
      fenster?.close();
      toast.error(grundAus(err, 'Der Nachweis lässt sich nicht öffnen.'));
    }
  }

  const alsRegel = (x: Freistellung): FreistellungFuerRegeln => ({ ...x });

  function ueberschneidungZeilen(liste: ReadonlyArray<{ status: string; von: string; bis: string }>, zusatz = '') {
    return liste.map((u) => (
      <span key={`${u.status}-${u.von}`} className="flex flex-wrap items-center gap-2">
        <Warnung>Hinweis</Warnung>
        Zur selben Zeit gebucht: {u.status === 'Anwesend' ? 'Arbeitszeit' : u.status} {u.von}–{u.bis}{zusatz}
      </span>
    ));
  }

  /*
    DER TEIL EINES ARZTBESUCHS (E35): Sollzeit, Gebuchtes, der Vorschlag,
    was sich zeitlich überschneidet, und die angerechnete Zeit — vorbelegt
    mit dem Vorschlag, änderbar mit Grund.
  */
  function arztbesuchTeil(f: Freistellung) {
    const v = vorschlaege[f.id];
    if (!v) return <span className="text-ink-muted">Vorschlag wird geladen …</span>;
    if (v === 'fehler') {
      return <span className="text-ink-muted">Der Vorschlag zur angerechneten Zeit ließ sich nicht laden — bitte neu laden.</span>;
    }
    const text = angerechnet[f.id] ?? fmtMin(v.vorschlag);
    const min = leseDauer(text);
    const abweichend = min !== null && min !== v.vorschlag;
    return (
      <span className="flex flex-col gap-1 border-t border-line pt-2">
        <span className="flex flex-wrap items-center gap-2">
          Sollzeit {fmtDauer(v.soll)}, gearbeitet {fmtDauer(v.gearbeitet)} — anzurechnen {fmtDauer(v.vorschlag)}
          {v.vorschlag < v.termin ? ` von ${fmtDauer(v.termin)}` : ''}
          <InfoHint about="Angerechnete Zeit beim Arztbesuch">
            Bezahlt ist beim Arztbesuch nur Zeit, die sonst gearbeitet worden wäre (Dienstverhinderung, § 1154b
            ABGB bzw. § 8 Abs 3 AngG). Die App schlägt deshalb höchstens vor, was an diesem Tag noch zur Sollzeit
            fehlt. Eine andere Zeit geht mit Grund — etwa bei Gleitzeit, wenn der Termin in die Normalarbeitszeit
            fällt, aber schon länger gearbeitet wurde. Im Zeitkonto steht genau die angerechnete Zeit.
          </InfoHint>
        </span>
        {!v.arbeitstag && (
          <span className="flex flex-wrap items-center gap-2"><Warnung>Hinweis</Warnung>Kein Arbeitstag der Person — bestätigen geht nicht.</span>
        )}
        {v.ganztags && (
          <span className="flex flex-wrap items-center gap-2">
            <Warnung>Hinweis</Warnung>Am Tag steht „{v.ganztags}“ für den ganzen Tag — bestätigen geht erst, wenn das weg ist.
          </span>
        )}
        {ueberschneidungZeilen(v.ueberschneidung)}
        <span className="flex flex-wrap items-end gap-3">
          <InputField
            id={`angerechnet-${f.id}`}
            label="Angerechnet (Std:Min)"
            inputMode="numeric"
            value={text}
            onChange={(e) => setAngerechnet({ ...angerechnet, [f.id]: e.target.value })}
          />
          {abweichend && (
            <InputField
              id={`anrechnung-grund-${f.id}`}
              label="Grund für die andere Zeit"
              pflicht
              value={anrechnungGrund[f.id] ?? ''}
              onChange={(e) => setAnrechnungGrund({ ...anrechnungGrund, [f.id]: e.target.value })}
            />
          )}
        </span>
      </span>
    );
  }

  function zeile(f: Freistellung) {
    const p = person(f.userId);
    const andere = verlauf.filter((x) => x.userId === f.userId && x.id !== f.id).map(alsRegel);
    const tageVon = (x: FreistellungFuerRegeln) => (p ? urlaubsTage(p, x.von, x.bis).length : 0);
    const hinweise = warnungen(alsRegel(f), andere, anlaesse, tageVon);
    if (f.art === 'pflegefreistellung' && p && !f.zusatzwoche) {
      const stand = pflegeStand(andere, p.weeklyTargetHours, p.eintritt ?? p.appStartDate, f.von);
      hinweise.push(`Pflegefreistellung in diesem Arbeitsjahr noch offen: ${fmtDauer(stand.ersteWocheRestMin)}.`);
    }
    const teilungOhneTod = f.art === 'dienstverhinderung' && istTeilung(alsRegel(f), andere) && !anlassVon(f.anlass, anlaesse)?.todesfall;
    const eigener = f.userId === user.uid && andereEntscheiden(f);
    const sperre = eigener
      ? 'Über den eigenen Antrag entscheidet jemand anderer.'
      : f.art === 'unbezahlt' && !spitze
        ? 'Über unbezahlten Urlaub entscheiden Geschäftsführung oder Administration.'
        : teilungOhneTod && !spitze
          ? 'Geteilt — das bestätigen Geschäftsführung oder Administration.'
          : null;
    const kz = kuerzung[f.id];
    const ueber = tageUeberKontingent(alsRegel(f), andere, anlaesse, tageVon);
    const wahl = ueberWahl[f.id];
    const tagBelegt = belegt[f.id];
    return (
      <ListRow
        key={f.id}
        title={<span>{f.userName} · {freistellungZeitraum(f)}</span>}
        subtitle={
          <span className="flex flex-col gap-1">
            <span>
              {freistellungWas(f, company?.freistellungAnlaesse)}
              {istArztbesuch(f)
                ? ` · Termin ${fmtDauer(terminMinuten(f))}`
                : p && f.art !== 'unbezahlt' ? ` · ${urlaubsTage(p, f.von, f.bis).length} Arbeitstage` : ''}
              {f.art === 'unbezahlt' ? ` · ${kalendertage(f.von, f.bis)} Kalendertage` : ''}
            </span>
            {f.notiz && <span className="text-ink">„{f.notiz}“</span>}
            {hinweise.map((h) => (
              <span key={h} className="flex flex-wrap items-center gap-2"><Warnung>Hinweis</Warnung>{h}</span>
            ))}
            {istArztbesuch(f) && !sperre && arztbesuchTeil(f)}
            {!!f.zeitVon && !istArztbesuch(f) && !sperre && (
              tagBelegt === 'fehler'
                ? <span className="text-ink-muted">Ob zur selben Zeit schon gebucht ist, ließ sich nicht prüfen — die Datenbank prüft es beim Bestätigen.</span>
                : ueberschneidungZeilen(tagBelegt ?? [], ' — bestätigen geht erst, wenn die Zeit dort angepasst ist')
            )}
            {f.art !== 'unbezahlt' && !sperre && (
              <span className="flex flex-wrap items-center gap-2">
                {f.nachweisPfad && (
                  <Button variant="ghost" onClick={() => void ansehen(f.nachweisPfad!)}>Nachweis ansehen</Button>
                )}
                <CheckboxField
                  id={`geprueft-${f.id}`}
                  label={istArztbesuch(f)
                    ? (f.nachweisPfad ? 'Arztbestätigung geprüft' : nachweisVerlangt
                      ? 'Arztbestätigung geprüft (auf Papier gezeigt)'
                      : 'Arztbestätigung geprüft (freiwillig, auf Papier gezeigt)')
                    : f.nachweisPfad ? 'Nachweis geprüft' : 'Nachweis geprüft (auf Papier gezeigt)'}
                  checked={!!geprueft[f.id]}
                  onChange={(e) => setGeprueft({ ...geprueft, [f.id]: e.target.checked })}
                />
              </span>
            )}
            {kz && kz.length > 0 && !sperre && (
              <span className="flex flex-col gap-2 border-t border-line pt-2">
                <span className="flex flex-wrap items-center gap-2">
                  Wegen des unbezahlten Urlaubs von {kalendertage(f.von, f.bis)} Tagen verringert sich der Jahresanspruch
                  {kz.length > 1 ? ' — je Urlaubsjahr:' : ` um ${kz[0].tage} Tage.`}
                  <InfoHint about="Kürzung des Urlaubsanspruchs">
                    Jahresanspruch × Kalendertage unbezahlt ÷ Tage des Urlaubsjahres. Die Zahl ist ein Vorschlag:
                    änderbar oder abwählbar, übernommen wird sie mit dem Bestätigen.
                    {laengerAlsEinMonat(f.von, f.bis)
                      ? ' Mehr als ein Monat: die Pflichtversicherung über den Betrieb endet, die Lohnverrechnung meldet ab.'
                      : ''}
                  </InfoHint>
                </span>
                {kz.map((z, i) => (
                  <span key={z.urlaubsjahr} className="flex flex-wrap items-end gap-3">
                    <CheckboxField
                      id={`kz-an-${f.id}-${z.urlaubsjahr}`}
                      label={`Urlaubsjahr ${z.urlaubsjahr} kürzen`}
                      checked={z.an}
                      onChange={(e) => setKuerzung({ ...kuerzung, [f.id]: kz.map((x, j) => (j === i ? { ...x, an: e.target.checked } : x)) })}
                    />
                    <InputField
                      id={`kz-tage-${f.id}-${z.urlaubsjahr}`}
                      label="um Tage"
                      inputMode="decimal"
                      value={z.tage}
                      disabled={!z.an}
                      onChange={(e) => setKuerzung({ ...kuerzung, [f.id]: kz.map((x, j) => (j === i ? { ...x, tage: e.target.value } : x)) })}
                    />
                  </span>
                ))}
              </span>
            )}
            {ueber > 0 && !sperre && (
              <span
                role="radiogroup"
                aria-labelledby={`ueber-titel-${f.id}`}
                className="flex flex-col gap-1 border-t border-line pt-2"
              >
                <span id={`ueber-titel-${f.id}`} className="flex flex-wrap items-center gap-2 text-ink">
                  {ueber === 1 ? '1 Arbeitstag liegt' : `${ueber} Arbeitstage liegen`} über dem Kontingent. Wie bestätigen?
                  <InfoHint about="Tage über dem Kontingent">
                    Als Urlaub: die letzten Tage des Antrags werden als genehmigter Urlaub gebucht und zählen
                    gegen den Resturlaub. Das darf nur, wer über Urlaub entscheidet. Als Sonderurlaub: alle Tage
                    bleiben bezahlte Dienstverhinderung — mit einem Grund, der am Antrag stehen bleibt.
                  </InfoHint>
                </span>
                <label className="flex min-h-touch items-start gap-3 py-1">
                  <input
                    type="radio"
                    name={`ueber-${f.id}`}
                    className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
                    checked={wahl === 'urlaub'}
                    disabled={!urlaubEntscheiden}
                    onChange={() => setUeberWahl({ ...ueberWahl, [f.id]: 'urlaub' })}
                  />
                  <span className="text-sm">
                    Tage darüber als Urlaub buchen
                    {!urlaubEntscheiden && (
                      <span className="block text-ink-muted">Nur, wer über Urlaub entscheidet.</span>
                    )}
                  </span>
                </label>
                <label className="flex min-h-touch items-start gap-3 py-1">
                  <input
                    type="radio"
                    name={`ueber-${f.id}`}
                    className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
                    checked={wahl === 'sonderurlaub'}
                    onChange={() => setUeberWahl({ ...ueberWahl, [f.id]: 'sonderurlaub' })}
                  />
                  <span className="text-sm">Als Sonderurlaub bestätigen (mit Grund)</span>
                </label>
                {wahl === 'sonderurlaub' && (
                  <InputField
                    id={`ueber-grund-${f.id}`}
                    label="Grund für die Tage darüber"
                    pflicht
                    value={ueberGrund[f.id] ?? ''}
                    onChange={(e) => setUeberGrund({ ...ueberGrund, [f.id]: e.target.value })}
                  />
                )}
              </span>
            )}
            {sperre && <span className="text-ink-muted">{sperre}</span>}
          </span>
        }
      >
        {!sperre && (
          <>
            <Button loading={arbeitet === f.id} onClick={() => void bestaetigen(f, ueber)}>Bestätigen</Button>
            <Button variant="ghost" onClick={() => { setGrund(''); setFolge(null); setBegruenden({ f, art: 'Abgelehnt' }); }}>Ablehnen</Button>
          </>
        )}
      </ListRow>
    );
  }

  return (
    <Card
      title="Sonderurlaub und Arztbesuche bestätigen"
      hint="Dienstverhinderung (Sonderurlaub, Arztbesuch) und Pflegefreistellung stehen zu, wenn der Anlass vorliegt — bestätigt wird der Anlass, nicht genehmigt. Unbezahlten Urlaub entscheiden Geschäftsführung oder Administration. Der Anlass steht nur hier; die Projektleitung sieht im Wochenplan die Art, die Kollegen „abwesend“. Einen Arztbesuch sieht nur das Büro als solchen, alle anderen „abwesend“ mit der Uhrzeit — schon ab dem Antrag. Beim Arztbesuch schlägt die App vor, wie viel angerechnet wird: höchstens, was am Tag noch zur Sollzeit fehlt. Wird er abgelehnt, wählt man, ob die Zeit als Zeitausgleich gebucht wird oder im Saldo fehlt."
    >
      {offene === 'laedt' ? (
        <SkeletonList rows={2} />
      ) : offene === 'fehler' ? (
        <ErrorState message="Die Anträge konnten nicht geladen werden." onRetry={() => setVersuch((v) => v + 1)} />
      ) : (
        <>
          {offene.length === 0 ? (
            <EmptyState>Kein Antrag wartet.</EmptyState>
          ) : (
            <List>{offene.map(zeile)}</List>
          )}
          {laufend.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-sm font-normal text-ink">Bestätigt, noch nicht vorbei</p>
              <List>
                {laufend.map((f) => {
                  /*
                    Mit Urlaub für die Tage darüber nimmt zurück, wer über
                    Urlaub entscheidet (G17) — der Urlaub geht mit zurück.
                  */
                  const mitUrlaub = !!f.ueberUrlaubId && !urlaubEntscheiden;
                  const darf = (f.art !== 'unbezahlt' || spitze) && !mitUrlaub;
                  const vermerk = nachweisVermerk(f);
                  const ueberText = ueberVermerk(f);
                  return (
                    <ListRow
                      key={f.id}
                      title={<span>{f.userName} · {freistellungZeitraum(f)}</span>}
                      subtitle={
                        <>
                          <span className="block">{freistellungWas(f, company?.freistellungAnlaesse)}</span>
                          {vermerk && <span className="mt-1 block text-xs text-ink-muted">{vermerk}</span>}
                          {anrechnungVermerk(f) && <span className="mt-1 block text-xs text-ink-muted">{anrechnungVermerk(f)}</span>}
                          {ueberText && <span className="mt-1 block text-xs text-ink-muted">{ueberText}</span>}
                          {mitUrlaub && (
                            <span className="mt-1 block text-xs text-ink-muted">
                              Zurücknehmen kann, wer über Urlaub entscheidet — der Urlaub für die Tage darüber geht mit.
                            </span>
                          )}
                        </>
                      }
                    >
                      {darf && (
                        <Button variant="ghost" onClick={() => { setGrund(''); setBegruenden({ f, art: 'Storniert' }); }}>
                          Zurücknehmen
                        </Button>
                      )}
                    </ListRow>
                  );
                })}
              </List>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!begruenden}
        title={begruenden?.art === 'Abgelehnt'
          ? (istArztbesuch(begruenden.f) ? 'Arztbesuch ablehnen?' : 'Antrag ablehnen?')
          : begruenden && istArztbesuch(begruenden.f) ? 'Arztbesuch zurücknehmen?' : 'Sonderurlaub zurücknehmen?'}
        message={begruenden
          ? `${begruenden.f.userName}, ${freistellungZeitraum(begruenden.f)}${begruenden.art !== 'Storniert' ? ''
            : istArztbesuch(begruenden.f) ? ' — die angerechnete Zeit verschwindet aus dem Zeitkonto'
            : ` — die Tage verschwinden aus dem Zeitkonto, eine Kürzung des Anspruchs mit ihnen${begruenden.f.ueberUrlaubId ? ', ebenso der Urlaub für die Tage über dem Kontingent' : ''}`}. Der Grund geht an ${begruenden.f.userName}.`
          : undefined}
        confirmLabel={begruenden?.art === 'Abgelehnt' ? 'Ablehnen' : 'Zurücknehmen'}
        onConfirm={begruendetEntscheiden}
        onCancel={() => setBegruenden(null)}
      >
        <InputField id="frei-grund" label="Grund" pflicht value={grund} onChange={(e) => setGrund(e.target.value)} />
        {/*
          ABGELEHNTER ARZTBESUCH (E35): was aus der Zeit wird, gleich mit.
          Als Zeitausgleich bucht nur, wer über Urlaub entscheidet — wie in
          der Datenbank.
        */}
        {begruenden?.art === 'Abgelehnt' && istArztbesuch(begruenden.f) && (
          <span role="radiogroup" aria-label="Was aus der Zeit wird" className="mt-3 flex flex-col gap-1">
            <label className="flex min-h-touch items-start gap-3 py-1">
              <input
                type="radio"
                name="arzt-folge"
                className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
                checked={folge === 'zeitausgleich'}
                disabled={!urlaubEntscheiden}
                onChange={() => setFolge('zeitausgleich')}
              />
              <span className="text-sm">
                Als Zeitausgleich buchen ({freistellungZeitraum(begruenden.f)})
                {!urlaubEntscheiden && <span className="block text-ink-muted">Nur, wer über Urlaub entscheidet.</span>}
              </span>
            </label>
            <label className="flex min-h-touch items-start gap-3 py-1">
              <input
                type="radio"
                name="arzt-folge"
                className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
                checked={folge === 'keine'}
                onChange={() => setFolge('keine')}
              />
              <span className="text-sm">Nicht buchen — die Zeit fehlt im Saldo</span>
            </label>
          </span>
        )}
      </ConfirmDialog>
    </Card>
  );
}
