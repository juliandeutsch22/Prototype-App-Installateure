/**
 * Der Entwurf eines Benutzerprofils — aus dem Datensatz in die Eingabefelder
 * und wieder zurück.
 *
 * WARUM EIN EIGENES MODUL. Zwei Masken bearbeiten dieselben Felder: die Liste
 * legt an, die Akte ändert. Stünden die Umrechnungen zweimal da, wären es
 * eines Tages zwei Auslegungen von „leer" — und genau daran hängen
 * Wochenstunden, Urlaubsanspruch und Startsaldo, also der Lohnzettel.
 */
import type { AppUser, Role } from '@/types';
import {
  DEFAULT_WEEKLY_HOURS,
  DEFAULT_VACATION_DAYS,
  DEFAULT_WORK_DAYS,
  type UserProfileInput,
} from '@/lib/db/benutzerVorgaben';
import { leseZahl, zahlAlsText, zahlOder } from '@/lib/zahl';
import { aliquot, tageZwischen } from '@shared/urlaubAliquot';
import { todayStr, urlaubsJahrVon, JAHRESBEGINN_VORGABE } from '@/lib/time';
import { LEHRZEIT_MAX, LEHRZEIT_MIN, type Einstufung } from '@/lib/einstufung';
import { GRENZEN, istJugendlich } from '@/features/accounting/arbeitszeitGrenzen';

/**
 * Was für ein Zugang hier entsteht — und es sind zwei verschiedene Dinge.
 *
 * `bestand`: die Person arbeitet schon im Betrieb, die App kommt dazu. Was
 * sie mitbringt (Resturlaub, Überstundensaldo), weiss nur das Büro; die App
 * kann es nicht ausrechnen und muss danach fragen.
 *
 * `neu`: die Person tritt ein. Sie bringt nichts mit — und genau hier sass
 * die Falle: wer das Feld „Resturlaub" leer liess, was naheliegt, weil ja
 * nichts mitzubringen ist, bekam den VOLLEN Jahresanspruch ab Tag eins. Wer
 * am 1. Oktober anfängt, hatte damit 25 Tage statt rund sechs. Das stand
 * nirgends und fiel erst auf, wenn jemand Urlaub einreicht, den er nicht hat.
 */
export type Eintrittsart = 'bestand' | 'neu';

/** Der Vorschlag für ein angebrochenes erstes Urlaubsjahr. */
export interface AliquoterAnspruch {
  /** Tage, auf zwei Stellen gerundet. */
  tage: number;
  /** Kalendertage vom Eintritt (mitgezählt) bis zum Ende des Urlaubsjahres. */
  restTage: number;
  /** Wie viele Tage das Urlaubsjahr hat (365 oder 366). */
  jahresTage: number;
}

/**
 * Der aliquote Urlaubsanspruch für ein angebrochenes erstes Urlaubsjahr.
 *
 * WARUM DAS EIN VORSCHLAG IST UND KEINE REGEL. § 2 Abs 2 UrlG rechnet im
 * ersten ARBEITSJAHR aliquot und lässt den Anspruch nach sechs Monaten auf
 * das volle Ausmass springen. Ist das Urlaubsjahr durch Kollektivvertrag auf
 * das Kalenderjahr umgestellt, ist die übliche Praxis die Aliquotierung des
 * angebrochenen Jahres. Welche Variante im Einzelfall gilt, entscheidet der
 * Kollektivvertrag und nicht die Software — die Zahl bleibt änderbar.
 *
 * TAGGENAU SEIT DEM 30.09.2026 (Testbericht M3): Jahresanspruch ×
 * Kalendertage ab dem Eintritt (mitgezählt) ÷ Tage des Urlaubsjahres. Vorher
 * zählte der Eintrittsmonat voll: ein Eintritt am 30.09. ergab 8,33 Tage, am
 * 01.10. 6,25 — zwei Tage Unterschied für einen Kalendertag. Die Lesart ist
 * noch mit der WKO abzugleichen (siehe PLAN-TESTBERICHT).
 */
export function aliquoterAnspruch(
  jahresanspruch: number,
  eintritt: string,
  jahresbeginn: string = JAHRESBEGINN_VORGABE,
): AliquoterAnspruch {
  const jahr = urlaubsJahrVon(eintritt, jahresbeginn);
  const beginn = `${jahr}-${jahresbeginn}`;
  const naechster = `${jahr + 1}-${jahresbeginn}`;
  const jahresTage = tageZwischen(beginn, naechster);
  const restTage = Math.max(0, Math.min(jahresTage, tageZwischen(eintritt, naechster)));
  return {
    restTage,
    jahresTage,
    tage: aliquot(jahresanspruch, restTage, jahresTage),
  };
}

/**
 * Die Wochentage, in der Reihenfolge, in der sie im Betrieb genannt werden —
 * Montag zuerst, Sonntag zuletzt. `Date.getDay()` zählt ab Sonntag; die
 * Werte folgen dem, die Reihenfolge nicht.
 *
 * Stand vorher in `UserMgmtView`. Die Akte braucht dieselbe Tabelle, und
 * zwei Kopien wären zwei Wochen.
 */
export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Di' },
  { value: 3, label: 'Mi' },
  { value: 4, label: 'Do' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
  { value: 0, label: 'So' },
];

/**
 * Ein leeres Feld nimmt die Vorgabe, eine eingetippte 0 NICHT.
 *
 * `Number('')` ist `0` und endlich — ohne die ausdrückliche Prüfung auf die
 * leere Eingabe käme aus einem leeren Feld eine Null, und aus einer
 * eingetippten Null die Vorgabe. Beide Felder erlauben ausdrücklich `min="0"`:
 * wer null Wochenstunden einträgt (geringfügig, ruhendes Dienstverhältnis, die
 * Chefin selbst), bekam stillschweigend vierzig. Jeder Monat produziert danach
 * rund 170 Minusstunden, und die Zahl steht auf dem Lohnzettel.
 */
export function zahlOderVorgabe(eingabe: string, vorgabe: number): number {
  // Zentral gelesen (M15): „38,5“ ist achtunddreissigeinhalb, nicht die Vorgabe.
  return leseZahl(eingabe, { negativ: true }).wert ?? vorgabe;
}

/** Leeres Feld heisst „nicht angegeben" — und das ist nicht dasselbe wie 0. */
export function zahlOderNull(eingabe: string): number | null {
  return leseZahl(eingabe, { negativ: true }).wert;
}

/** Was das Formular hält: alles als Zeichenkette, so wie ein `<input>` liefert. */
export interface BenutzerEntwurf {
  name: string;
  email: string;
  role: Role;
  active: boolean;
  weeklyTargetHours: string;
  yearlyVacationDays: string;
  appStartDate: string;
  /** Eintritt in den Betrieb (M6) — bei einem Neueintritt gleich dem Saldo-Start. */
  eintritt: string;
  initialOvertime: string;
  initialVacationDays: string;
  workDays: number[];
  /**
   * Eigenes Tagessoll je Wochentag in Stunden (M5), Schlüssel wie `workDays`.
   * Leer heisst gleichmässig: Wochenstunden durch Arbeitstage.
   */
  tagessoll: Record<string, string>;
  /** Freigabe „Kunden pflegen“ — nur für Verwaltung und Buchhaltung angeboten. */
  kundenPflegen: boolean;
  /** Freigaben für den Lageristen (Verwaltung, M37). */
  katalogEinspielen: boolean;
  einkaufSehen: boolean;
  /** Freigabe für die Projektleitung (M38). */
  rechnungenLesen: boolean;
  /** Nur für die Geschäftsführung angeboten. */
  fuehrtZeitkonto: boolean;
  /** Einstufung (4.1); leer heisst nicht festgelegt — zählt wie Facharbeiter. */
  einstufung: Einstufung | '';
  /** Nur beim Lehrling: Lehrbeginn (ISO) und Lehrzeit in Monaten. */
  lehrbeginn: string;
  lehrzeitMonate: string;
  /** Nur beim Lehrling: zählen seine Stunden ins Projekt-Budget? (03.10.2026) */
  stundenInsBudget: boolean;
}

/** Für welche Rollen der Haken „Kunden pflegen“ etwas bedeutet. */
export const mitKundenFreigabe = (r: Role) => r === 'Verwaltung' || r === 'Buchhaltung';
/** „Katalog einspielen“ und „Einkaufspreise sehen“ — nur für die Verwaltung angeboten (M37). */
export const mitLagerFreigaben = (r: Role) => r === 'Verwaltung';
/** „Rechnungen lesen“ — nur für die Projektleitung angeboten (M38). */
export const mitRechnungsFreigabe = (r: Role) => r === 'Projektleiter';
/** Für welche Rolle das Zeitkonto wählbar ist — die anderen legt die Rolle fest. */
export const mitZeitkontoWahl = (r: Role) => r === 'Geschäftsführung';

export function leererEntwurf(): BenutzerEntwurf {
  return {
    name: '',
    email: '',
    role: 'Mitarbeiter',
    active: true,
    weeklyTargetHours: String(DEFAULT_WEEKLY_HOURS),
    yearlyVacationDays: String(DEFAULT_VACATION_DAYS),
    // Ohne Startdatum bliebe der Saldo dauerhaft „nicht konfiguriert".
    appStartDate: todayStr(),
    eintritt: todayStr(),
    initialOvertime: '0',
    /*
      LEER UND NICHT VORBELEGT. Beim Überstundensaldo ist 0 die richtige
      Vorgabe — wer nichts angibt, bringt nichts mit. Beim Urlaub wäre 0 die
      Behauptung „hat dieses Jahr keinen Tag mehr" und würde jeden Antrag
      rechnerisch ins Minus schicken.
    */
    initialVacationDays: '',
    workDays: DEFAULT_WORK_DAYS,
    tagessoll: {},
    kundenPflegen: false,
    katalogEinspielen: false,
    einkaufSehen: false,
    rechnungenLesen: false,
    fuehrtZeitkonto: false,
    einstufung: '',
    lehrbeginn: '',
    lehrzeitMonate: '',
    stundenInsBudget: true,
  };
}

export function alsEntwurf(u: AppUser): BenutzerEntwurf {
  return {
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active !== false,
    // Mit Komma, wie man es tippt (Runde 5, G7: „5.96“ stand neben „8,5“).
    weeklyTargetHours: zahlAlsText(u.weeklyTargetHours ?? DEFAULT_WEEKLY_HOURS),
    yearlyVacationDays: zahlAlsText(u.yearlyVacationDays ?? DEFAULT_VACATION_DAYS),
    appStartDate: u.appStartDate ?? todayStr(),
    eintritt: u.eintritt ?? u.appStartDate ?? todayStr(),
    initialOvertime: zahlAlsText(u.initialOvertime ?? 0),
    initialVacationDays:
      u.initialVacationDays === null || u.initialVacationDays === undefined
        ? ''
        : zahlAlsText(u.initialVacationDays),
    workDays: u.workDays ?? DEFAULT_WORK_DAYS,
    tagessoll: Object.fromEntries(
      Object.entries(u.tagessoll ?? {}).map(([tag, h]) => [tag, String(h).replace('.', ',')]),
    ),
    kundenPflegen: u.kundenPflegen === true,
    katalogEinspielen: u.katalogEinspielen === true,
    einkaufSehen: u.einkaufSehen === true,
    rechnungenLesen: u.rechnungenLesen === true,
    fuehrtZeitkonto: u.fuehrtZeitkonto === true,
    einstufung: u.einstufung ?? '',
    lehrbeginn: u.lehrbeginn ?? '',
    lehrzeitMonate: u.lehrzeitMonate ? String(u.lehrzeitMonate) : '',
    stundenInsBudget: u.stundenInsBudget !== false,
  };
}

/**
 * Das eigene Tagessoll als Zahlen — nur für die gewählten Arbeitstage und nur,
 * wenn für JEDEN davon eine Zahl dasteht. Ein halb ausgefülltes Soll wäre eine
 * Woche, deren Summe niemand angegeben hat.
 */
export function tagessollAusEntwurf(e: Pick<BenutzerEntwurf, 'tagessoll' | 'workDays'>): Record<string, number> | null {
  const tage = e.workDays.length ? e.workDays : DEFAULT_WORK_DAYS;
  const werte = tage.map((t) => [String(t), zahlOder(e.tagessoll[String(t)] ?? '', NaN)] as const);
  if (werte.some(([t]) => (e.tagessoll[t] ?? '').trim() === '')) return null;
  if (werte.some(([, h]) => !Number.isFinite(h) || h < 0 || h > 24)) return null;
  return Object.fromEntries(werte);
}

/**
 * Ein Arbeitstag kommt dazu oder fällt weg: das eigene Tagessoll folgt — ein
 * weggefallener Tag verliert sein Feld, ein neuer bekommt ein leeres, damit
 * ihn jemand ausfüllt. Ohne eigenes Tagessoll bleibt es leer.
 */
export function tagessollNachTagen(f: Pick<BenutzerEntwurf, 'tagessoll' | 'workDays'>, tag: number): Record<string, string> {
  if (Object.keys(f.tagessoll).length === 0) return f.tagessoll;
  const neu = { ...f.tagessoll };
  if (f.workDays.includes(tag)) delete neu[String(tag)];
  else neu[String(tag)] = '';
  return neu;
}

/**
 * Was Anlage und Akte gleich prüfen, bevor gespeichert wird (Testbericht
 * 30.09.2026, M5 und M6). `null` heisst: in Ordnung.
 */
export function entwurfFehler(
  e: Pick<BenutzerEntwurf, 'tagessoll' | 'workDays' | 'eintritt' | 'appStartDate'> &
    Partial<Pick<BenutzerEntwurf, 'weeklyTargetHours' | 'yearlyVacationDays' | 'initialOvertime' | 'initialVacationDays'
      | 'einstufung' | 'lehrbeginn' | 'lehrzeitMonate'>>,
): string | null {
  // Eine Zahl, die sich nicht lesen lässt, geht nicht als Vorgabe durch (M15).
  const zahlen: [string, string | undefined, boolean][] = [
    ['Wochenstunden', e.weeklyTargetHours, false],
    ['Urlaubstage pro Jahr', e.yearlyVacationDays, false],
    ['Start-Saldo', e.initialOvertime, true],
    [urlaubsfeldName(e), e.initialVacationDays, false],
  ];
  for (const [name, text, negativ] of zahlen) {
    const { fehler } = leseZahl(text ?? '', { negativ });
    if (fehler) return `${name}: ${fehler}`;
  }
  if (Object.keys(e.tagessoll).length > 0 && !tagessollAusEntwurf(e)) {
    return 'Bitte für jeden Arbeitstag ein Tagessoll zwischen 0 und 24 Stunden angeben.';
  }
  // ISO-Daten lassen sich als Text vergleichen.
  if (e.eintritt && e.appStartDate && e.eintritt > e.appStartDate) {
    return 'Das Eintrittsdatum liegt nach dem Saldo-Start — vor dem Eintritt kann das Zeitkonto nicht rechnen.';
  }
  return lehreFehler(e);
}

/**
 * Beim Lehrling gehören Lehrbeginn und Lehrzeit dazu — ohne sie gibt es kein
 * Lehrjahr und damit keinen Satz (4.1). Die Datenbank prüft dasselbe.
 */
export function lehreFehler(e: Partial<Pick<BenutzerEntwurf, 'einstufung' | 'lehrbeginn' | 'lehrzeitMonate'>>): string | null {
  if (e.einstufung !== 'lehrling') return null;
  if (!e.lehrbeginn) return 'Beim Lehrling bitte den Lehrbeginn angeben — daraus ergibt sich das Lehrjahr.';
  const monate = Number(e.lehrzeitMonate);
  if (!Number.isInteger(monate) || monate < LEHRZEIT_MIN || monate > LEHRZEIT_MAX) {
    return `Die Lehrzeit liegt zwischen ${LEHRZEIT_MIN / 12} und ${LEHRZEIT_MAX / 12} Jahren.`;
  }
  return null;
}

/**
 * Wie das Urlaubsfeld heisst — in Anlage und Akte gleich (M6): bei einem
 * Neueintritt (Eintritt = Saldo-Start) ist es der Urlaub im ersten Jahr, bei
 * einem Umstieg der Resturlaub, der beim Umstieg noch offen war.
 */
export function urlaubsfeldName(e: { eintritt?: string | null; appStartDate?: string | null }): string {
  const neu = !e.eintritt || !e.appStartDate || e.eintritt === e.appStartDate;
  return neu ? 'Urlaub im ersten Jahr' : 'Resturlaub beim Umstieg';
}

/** Aus dem Entwurf wird das, was in die Datenbank geht. */
export function alsProfil(e: BenutzerEntwurf): UserProfileInput {
  const tagessoll = Object.keys(e.tagessoll).length > 0 ? tagessollAusEntwurf(e) : null;
  return {
    name: e.name,
    email: e.email,
    role: e.role,
    active: e.active,
    /*
      MIT EIGENEM TAGESSOLL SIND DIE WOCHENSTUNDEN SEINE SUMME — sonst stünde
      „von 38:30“ über einer Woche, die in Wahrheit 36 Stunden hat.
    */
    weeklyTargetHours: tagessoll
      ? Math.round(Object.values(tagessoll).reduce((a, b) => a + b, 0) * 100) / 100
      : zahlOderVorgabe(e.weeklyTargetHours, DEFAULT_WEEKLY_HOURS),
    yearlyVacationDays: zahlOderVorgabe(e.yearlyVacationDays, DEFAULT_VACATION_DAYS),
    appStartDate: e.appStartDate || null,
    eintritt: e.eintritt || e.appStartDate || null,
    tagessoll,
    initialOvertime: zahlOderVorgabe(e.initialOvertime, 0),
    initialVacationDays: zahlOderNull(e.initialVacationDays),
    // Eine leere Auswahl wäre ein Tagessoll von „Wochenstunden durch null".
    workDays: e.workDays.length ? e.workDays : DEFAULT_WORK_DAYS,
    /*
      NUR, WO DIE ROLLE ES ZULÄSST. Wird aus der Bürokraft ein Monteur, fällt
      die Freigabe mit — sonst lebte sie unsichtbar weiter und wäre nach einem
      Wechsel zurück plötzlich wieder da, ohne dass jemand sie erteilt hätte.
    */
    kundenPflegen: mitKundenFreigabe(e.role) && e.kundenPflegen,
    katalogEinspielen: mitLagerFreigaben(e.role) && e.katalogEinspielen,
    einkaufSehen: mitLagerFreigaben(e.role) && e.einkaufSehen,
    rechnungenLesen: mitRechnungsFreigabe(e.role) && e.rechnungenLesen,
    fuehrtZeitkonto: mitZeitkontoWahl(e.role) && e.fuehrtZeitkonto,
    einstufung: e.einstufung || null,
    // Lehrbeginn und Lehrzeit nur beim Lehrling — sonst lebten sie unsichtbar weiter.
    lehrbeginn: e.einstufung === 'lehrling' ? e.lehrbeginn || null : null,
    lehrzeitMonate: e.einstufung === 'lehrling' ? Number(e.lehrzeitMonate) || null : null,
    // Ohne Lehre wieder „zählt“ — sonst lebte ein „aus“ unsichtbar weiter.
    stundenInsBudget: e.einstufung === 'lehrling' ? e.stundenInsBudget : true,
  };
}

/**
 * Hat sich wirklich etwas geändert?
 *
 * Feldweise statt über `JSON.stringify` — die Schlüsselreihenfolge eines
 * Objekts ist kein Vertrag. Die Arbeitstage werden als MENGE verglichen: wer
 * einen Tag abwählt und wieder anwählt, hat nichts geändert.
 */
export function gleich(a: BenutzerEntwurf, b: BenutzerEntwurf): boolean {
  return (Object.keys(a) as (keyof BenutzerEntwurf)[]).every((f) => {
    const x = a[f];
    const y = b[f];
    if (f === 'tagessoll') {
      const ordnen = (o: unknown) => JSON.stringify(Object.entries(o as Record<string, string>).sort());
      return ordnen(x) === ordnen(y);
    }
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length) return false;
      const links = [...x].sort();
      const rechts = [...y].sort();
      return links.every((w, i) => w === rechts[i]);
    }
    return x === y;
  });
}

const stunden = (h: number) => zahlAlsText(Math.round(h * 100) / 100);

/**
 * WAS DIE AKTE VOR DEM SPEICHERN FRAGT, WENN DIE PERSON UNTER 18 IST
 * (Runde 3, M2). Ein Tagessoll von 8,5 Std. für eine 17-Jährige ging ohne
 * ein Wort durch; der Verstoss zeigte sich erst an den Buchungen.
 *
 * Ein Hinweis, keine Sperre: ob ein längerer Tag bei anderer Verteilung der
 * Wochenarbeitszeit zulässig ist (§ 11 Abs 2 KJBG, bis 9 Std.), ist mit der
 * WKO noch zu klären — die Akte sagt es dazu und speichert nach Rückfrage.
 * Ohne Geburtsdatum und ab 18 kommt nichts (Gegenprobe in den Tests).
 */
export function jugendschutzHinweise(
  e: BenutzerEntwurf,
  geburtsdatum: string | null | undefined,
  heute: string,
): string[] {
  if (!istJugendlich(geburtsdatum, heute)) return [];
  const p = alsProfil(e);
  const wochenStd = p.weeklyTargetHours ?? 0;
  const tage = WEEKDAYS.filter((d) => (p.workDays ?? []).includes(d.value));
  const out: string[] = [];
  const woche = GRENZEN.jugendlich.woche / 60;
  const tag = GRENZEN.jugendlich.tag / 60;
  if (wochenStd > woche) {
    out.push(`Wochensoll ${stunden(wochenStd)} Std. — für Jugendliche höchstens ${woche} Std. in der Woche (§ 11 KJBG).`);
  }
  const ausnahme = `bei anderer Verteilung der Wochenarbeitszeit bis ${GRENZEN.jugendlich.tagVerteilt / 60} Std. (§ 11 Abs 2 KJBG, vorbehaltlich der WKO-Klärung)`;
  if (p.tagessoll) {
    const lang = tage.filter((d) => (p.tagessoll?.[String(d.value)] ?? 0) > tag);
    if (lang.length > 0) {
      const liste = lang.map((d) => `${d.label} ${stunden(p.tagessoll![String(d.value)])} Std.`).join(', ');
      out.push(`Tagessoll ${liste} — für Jugendliche höchstens ${tag} Std. am Tag, ${ausnahme}.`);
    }
  } else if (tage.length > 0 && wochenStd / tage.length > tag) {
    out.push(`Tagessoll ${stunden(wochenStd / tage.length)} Std. (Wochenstunden durch Arbeitstage) — für Jugendliche höchstens ${tag} Std. am Tag (§ 11 KJBG).`);
  }
  return out;
}

/**
 * LEHRBEGINN VOR DEM EINTRITT (Runde 3, G18): kann gewollt sein — Lehrzeit
 * aus einem anderen Betrieb wird angerechnet. Deshalb ein Hinweis und keine
 * Sperre. `eintritt` ist der Eintritt in DIESEN Betrieb.
 */
export function lehrbeginnVorEintritt(
  e: Pick<BenutzerEntwurf, 'einstufung' | 'lehrbeginn'>,
  eintritt: string | null | undefined,
): boolean {
  return e.einstufung === 'lehrling' && !!e.lehrbeginn && !!eintritt && e.lehrbeginn < eintritt;
}
