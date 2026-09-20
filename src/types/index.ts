/**
 * Zentrale Datentypen. Abgeleitet aus dem Legacy-Datenmodell
 * (siehe docs/LEGACY-ANALYSIS.md) und um `companyId` (Mandantenfähigkeit)
 * ergänzt. Jedes Dokument JEDER Collection trägt `companyId`.
 *
 * Hinweise zur Treue gegenüber dem Bestand (Spec §6: "an bestehende Felder
 * anpassen"):
 *  - Es existieren real FÜNF Rollen (nicht drei) — alle bleiben erhalten,
 *    damit bestehende Nutzerdokumente nicht brechen.
 *  - Projekte werden überall per String `projectNumber` verknüpft, nicht per
 *    Dokument-ID. Beibehalten.
 *  - Nutzer sind per `uid` (Firebase-Auth-UID) verknüpft, nicht per Doc-ID.
 *  - `timeEntries` haben start/end/Pause; "hours" wird daraus berechnet.
 *    Sprach-Einträge dürfen zusätzlich `hours` direkt setzen.
 */

export type Role =
  | 'Mitarbeiter'
  | 'Verwaltung'
  | 'Buchhaltung'
  /**
   * Projektleitung: wie die Geschäftsführung, aber ohne Einblick in die
   * Zeitkonten der Mitarbeiter. Siehe lib/permissions.ts.
   */
  | 'Projektleiter'
  | 'Geschäftsführung'
  | 'Administrator';

export const ROLES: Role[] = [
  'Mitarbeiter',
  'Verwaltung',
  'Buchhaltung',
  'Projektleiter',
  'Geschäftsführung',
  'Administrator',
];

/** Quelle eines Eintrags: manuell erfasst oder per KI-Sprachextraktion. */
export type EntrySource = 'manual' | 'voice';

/** companies/{companyId} — Mandanten-Stammdaten + Branding + Rechnungskopf. */
export interface Company {
  id: string;
  name: string;
  brandColor?: string; // Hex, Primärfarbe
  brandForeground?: string; // Hex, Vordergrund auf Primärfarbe
  accentColor?: string; // Hex, Akzent (z. B. Aktion/Hervorhebung)
  accentForeground?: string; // Hex, Vordergrund auf Akzent
  logoUrl?: string;
  // Rechnungs-Stammdaten (ersetzen die hartkodierten "Perl"-Werte im PDF)
  addressLine?: string; // "Musterstraße 1 · 1010 Wien"
  contactLine?: string; // "Tel · Mail · Web"
  iban?: string;
  bic?: string;
  bankName?: string;
  vatId?: string; // UID-Nummer, z. B. "ATU12345678"
  companyRegister?: string; // FN
  /*
    `defaultVatRate` STAND HIER UND WURDE NIE GELESEN.

    Drei Einrichtungsskripte schrieben es, kein einziger Aufrufer holte es je
    ab: gerechnet wird ausschliesslich mit `rates.vatRate`, und das ist in den
    Einstellungen gepflegt. Ein zweites Feld für dieselbe Zahl ist die
    klassische Falle — wer es setzt, wundert sich, warum die Rechnung eine
    andere Steuer ausweist.

    Bestehende Betriebe tragen es noch in ihren Stammdaten; es dort zu
    entfernen wäre eine Wanderung durch fremde Daten für nichts.
  */
  /**
   * Die Vorsätze der Nummernkreise und des Fuhrparks.
   *
   * VIER EINSTELLUNGEN STATT VIER FEST VERDRAHTETER ZEICHENFOLGEN. Was hier
   * nicht gesetzt ist, fällt auf `PRAEFIX_VORGABE` zurück — mit einer
   * Ausnahme: das Kennzeichen hat KEINE Vorgabe. `WZ` stand fest im Code und
   * ist der Bezirkskenner eines bestimmten Bezirks; ihn als Vorgabe zu
   * behalten hiesse, ihn jedem neuen Betrieb aufzustempeln.
   *
   * Die Regeln stehen in `lib/praefixe.ts`, die Grenze in der Datenbank
   * (`companies_praefix_*`). Geändert werden darf nur von der Spitze — das
   * setzt die Richtlinie `companies_aendern` durch, nicht das Formular.
   */
  praefixRechnung?: string;
  praefixAngebot?: string;
  praefixBaustelle?: string;
  praefixKennzeichen?: string;

  /** Stundensätze und Zuschläge, gepflegt von der Geschäftsführung. */
  rates?: InvoiceRates;
  /**
   * Was eine Arbeitsstunde den BETRIEB kostet — nicht, was sie dem Kunden
   * verrechnet wird.
   *
   * Die Unterscheidung ist der ganze Punkt der Nachkalkulation. `rates.fach`
   * ist der ERLÖS; die Kosten sind Lohn plus Lohnnebenkosten plus anteilige
   * Gemeinkosten und liegen erfahrungsgemäß deutlich darunter. Wer beide
   * verwechselt, bekommt eine Marge von null und hält sie für ein Ergebnis.
   *
   * Bewusst ein einziger Mischsatz je Qualifikation statt echter Personalkosten
   * je Mitarbeiter: die Gehälter einzelner Monteure gehören nicht in eine
   * Baustellenauswertung, die die Projektleitung ansieht.
   */
  costRates?: {
    /** Kosten je Facharbeiterstunde. */
    fach: number;
    /** Kosten je Helferstunde. */
    helper: number;
  };
  /**
   * Wer Urlaubsanträge entscheiden darf — uids, zusätzlich zur Leitung.
   *
   * Die Rolle allein reicht als Antwort nicht: in dem einen Betrieb entscheidet
   * die Buchhaltung, im anderen ein Vorarbeiter, im dritten ausschließlich der
   * Chef. Das ist eine betriebliche Festlegung und keine Eigenschaft der
   * Software.
   *
   * NICHT GESETZT heißt: es bleibt beim Ausgangszustand — Buchhaltung,
   * Geschäftsführung, Administration. Sonst hätte das Einführen dieses Feldes
   * bestehenden Betrieben stillschweigend Rechte entzogen.
   *
   * Geschäftsführung und Administration können IMMER entscheiden und stehen
   * deshalb nicht in dieser Liste. Wären sie abwählbar, könnte eine
   * Fehleingabe den ganzen Betrieb aussperren — und niemand könnte sie
   * zurücknehmen, weil auch das Ändern dieser Liste ihnen vorbehalten ist.
   */
  vacationApprovers?: string[];
  /**
   * Wie nicht verbrauchter Urlaub zum Jahreswechsel behandelt wird.
   *
   * `verjaehrung` (Vorgabe) ist die gesetzliche Lesart: der Rest wird
   * übertragen und verjährt zwei Jahre nach dem Jahr, in dem er entstand
   * (§ 4 Abs 5 UrlG). `stichtag` ist die vereinbarte: übertragen wird
   * ebenfalls, was aus früheren Jahren offen ist, verfällt aber an
   * `urlaubStichtag`.
   *
   * DIE VORGABE IST DAS GESETZ UND NICHT DAS FRÜHERE VERHALTEN. Bis hierher
   * warf die App den Rest am 1. Jänner weg. Das als dritte Wahlmöglichkeit
   * anzubieten hiesse, einen Fehler zur Einstellung zu erklären.
   */
  /**
   * Zeigt beim Anlegen einer Rechnung die Auswahl Anzahlung / Teil / Schluss.
   *
   * AUS IST DIE VORGABE. Die Auswahl steht in der Maske, in der jede Rechnung
   * dieses Betriebs entsteht — auch die vierhundert im Jahr, die schlicht
   * Rechnungen sind. Ein Betrieb, der nie eine Anzahlung stellt, bekäme ein
   * Feld, das er jedes Mal überliest.
   *
   * Bereits ausgestellte Belege bleiben unberührt: sie behalten ihre Art,
   * ihre Abzüge und ihre Gesamtleistung und drucken unverändert, auch wenn
   * der Betrieb die Arten später wieder abdreht.
   */
  rechnungsarten?: boolean;
  urlaubUebertrag?: 'verjaehrung' | 'stichtag';
  /** 'MM-DD'. Nur bei `urlaubUebertrag === 'stichtag'` gesetzt. */
  urlaubStichtag?: string | null;
  /**
   * 'MM-DD' — wann das Urlaubsjahr BEGINNT und der neue Anspruch entsteht.
   *
   * Vorgabe `01-01`, also das Kalenderjahr; das ist der häufigste Fall, weil
   * der Kollektivvertrag das Urlaubsjahr in vielen Branchen darauf umstellt.
   * Bis zum 20.09.2026 war der 1. Jänner fest verdrahtet — für jeden Betrieb
   * mit einem anderen Urlaubsjahr rechnete die App still falsch.
   *
   * NICHT ABGEBILDET: das Arbeitsjahr je Mitarbeiter (Jahrestag des
   * Eintritts). Dort hätte jede Person ihren eigenen Stichtag. Das ist eine
   * benannte Grenze, siehe die Migration.
   */
  urlaubJahresbeginn?: string;
  /**
   * Welche Bereiche der App dieser Betrieb benutzt.
   *
   * Gespeichert werden nur die ABWEICHUNGEN vom Standard; was fehlt, gilt wie
   * in `lib/module.ts` festgelegt. Damit ändert sich für bestehende Betriebe
   * nichts, solange niemand etwas umstellt — und ein später hinzukommendes
   * Modul erscheint automatisch mit seinem Standard, statt bei allen zu
   * fehlen.
   *
   * KEINE SICHERHEITSGRENZE. Ein abgeschaltetes Modul nimmt den Weg weg, nicht
   * das Recht; wer als Buchhaltung Rechnungen anlegen darf, darf das
   * weiterhin. Was serverseitig geschützt ist, ist dieses Feld selbst — sonst
   * schaltete sich jeder frei, was er will.
   */
  modules?: Record<string, boolean>;
  createdAt?: number;
}

/**
 * Verrechnungssätze eines Betriebs. Zuschläge sind ANTEILE des Stundensatzes
 * (0.5 = +50 %), nicht eigene Sätze: eine Preiserhöhung beim Grundsatz wirkt
 * damit automatisch auf alle Zuschläge, wie es Kollektivverträge vorgeben.
 */
export interface InvoiceRates {
  /** Monteur / Facharbeiter, €/h */
  fach: number;
  /**
   * Helfer, €/h. Gilt für Einsätze, die im Zeiteintrag als Helferarbeit
   * gekennzeichnet sind — nicht für eine Person dauerhaft.
   */
  helper: number;
  /** Zuschlag für Nachtarbeit, Anteil (0.5 = +50 %). */
  nightSurcharge: number;
  /** Zuschlag für Notdienst, Anteil (1 = +100 %). */
  emergencySurcharge: number;
  /** Umsatzsteuer, Anteil (0.2 = 20 %). */
  vatRate: number;
  /** Zahlungsziel in Tagen. */
  dueDays: number;
  /**
   * Mahnspesen je Stufe, in Euro — [Erinnerung, Mahnung, letzte Mahnung].
   *
   * OHNE VORGABE. Was ein Betrieb verrechnen darf, hängt am Aufwand und am
   * Vertrag; eine voreingestellte Zahl sähe aus wie eine Auskunft darüber.
   * Nicht gesetzt heisst null — dann steht auf der Mahnung keine Spesenzeile.
   */
  mahnspesen?: number[];
}

/** users/{docId} — Auth-Verknüpfung über `uid`, nicht Doc-ID. */
export interface AppUser {
  id: string; // Kennung der Zeile (in der Altanwendung als docId gelesen)
  companyId: string;
  uid: string; // Firebase Auth UID
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  weeklyTargetHours?: number; // default 40
  yearlyVacationDays?: number; // default 25
  initialOvertime?: number; // Startsaldo Überstunden (kann negativ sein)
  /**
   * Resturlaub am `appStartDate` — was die Person mitbringt.
   *
   * `undefined`/`null` heisst NICHT ANGEGEBEN, nicht „null Tage": dann gilt
   * der volle Jahresanspruch, also genau das Verhalten von vorher. Kann
   * negativ sein, wer im Vorgriff mehr genommen hat, als ihm zusteht.
   */
  initialVacationDays?: number | null;
  appStartDate?: string | null; // 'YYYY-MM-DD' ab dem Soll/Ist gilt
  workDays?: number[]; // 0=So..6=Sa, default [1,2,3,4,5]
  createdAt?: number;
}

/** Im Client gehaltenes Profil des angemeldeten Nutzers. */
export interface CurrentUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
  companyId: string;
  docId: string;
}

/**
 * userPrefs/{uid} — persönliche Einstellungen, vom Nutzer SELBST gepflegt.
 *
 * Bewusst nicht in `users`: dort darf nur die Geschäftsführung schreiben
 * (Rolle, Wochensoll, Urlaubsanspruch sind nichts, was der Mitarbeiter selbst
 * ändern soll). Seine Benachrichtigungen und die Geräte, auf denen er sie
 * empfängt, gehören dagegen ihm.
 */
export interface UserPrefs {
  id: string; // = uid
  companyId: string;
  userId: string;
  /** Benachrichtigung, wenn eine neue Materialanforderung eingeht (Verwaltung/GF). */
  notifyNewOrder?: boolean;
  /** Benachrichtigung, wenn die eigene Anforderung abholbereit ist (Monteur). */
  notifyOrderReady?: boolean;
  /**
   * Benachrichtigung bei Eilzustellungen der eigenen Baustellen
   * (Projektleitung). Eigener Schalter, weil das eine andere Dringlichkeit
   * ist als die Sammelmeldung über neue Anforderungen: wer die abschaltet,
   * will damit nicht auch den Eilfall verpassen.
   */
  notifyUrgentDelivery?: boolean;
  /**
   * Push-Token je Gerät. Ein Mensch hat Telefon und Rechner, beide sollen
   * die Meldung bekommen; ein abgemeldetes Gerät wird wieder entfernt.
   */
  pushTokens?: string[];
  updatedAt?: number;
}

/** projects/{id} — verknüpft über `projectNumber`. */
/**
 * Ein Kunde — wer beauftragt und wer bezahlt.
 *
 * Bis hierher gab es ihn nicht: der Kunde war ein Textfeld an der Baustelle
 * und wurde bei jedem Auftrag neu getippt. Die Folgen sind strukturell, nicht
 * kosmetisch — keine Kundenhistorie („was haben wir dort zuletzt gemacht?"),
 * ein Tippfehler spaltet denselben Kunden in zwei, kein Wartungsvertrag, kein
 * Mahnwesen auf Kundenebene. Für ein Gewerk, das von wiederkehrender
 * Kundschaft lebt, ist das die teuerste Lücke.
 *
 * ABGRENZUNG ZUR BAUSTELLE, und die ist wichtig: Hier steht die
 * RECHNUNGSadresse und der HAUPT-Ansprechpartner. Die Baustelle behält ihre
 * eigene Adresse und ihren eigenen Ansprechpartner vor Ort — eine
 * Hausverwaltung kann zwanzig Baustellen haben, und der Monteur fährt nicht
 * zur Rechnungsadresse. Das ist keine Dopplung, sondern zweierlei.
 */
/**
 * Ein Handwerksschein (Regie- oder Arbeitsschein).
 *
 * Der Beleg, den der Kunde auf der Baustelle unterschreibt. Regiestunden sind
 * die am häufigsten bestrittene Rechnungsposition; ohne unterschriebenen
 * Schein lässt sich eine Mehrstunde im Zweifel nicht durchsetzen.
 *
 * DIE ZENTRALE ENTSCHEIDUNG: Der Schein KOPIERT die Zeiten und das Material,
 * er referenziert sie nicht. Die Buchhaltung kann einen Zeiteintrag
 * nachträglich korrigieren — bei einer Referenz änderte sich damit
 * rückwirkend, was der Kunde unterschrieben hat. Das ist das genaue Gegenteil
 * der sonst geltenden Regel, hier aber zwingend: mit der Unterschrift wird
 * der Inhalt festgeschrieben.
 */
/**
 * Ein Angebot.
 *
 * Schließt die Kette nach vorne: Anfrage → Angebot → Auftrag → Baustelle.
 * Ohne diesen Schritt beginnt alles bei der Baustelle, und die kalkulierten
 * Stunden werden ein zweites Mal von Hand eingetippt — die Budget-Ampel misst
 * dann gegen eine Zahl ohne Herkunft.
 *
 * Positionen und Summen haben bewusst dieselbe Form wie bei der Rechnung
 * (`InvoicePosition`, `calcTotals`): ein Angebot ist rechnerisch dasselbe,
 * nur nach vorne gerichtet. Zwei getrennte Rechenwege hätten früher oder
 * später zwei verschiedene Summen für dieselben Positionen ergeben.
 */
export interface Quote {
  id: string;
  companyId: string;
  /** 'AN-YYYY-NNNN' */
  quoteNumber: string;
  customerId?: string;
  customerName: string;
  /** Wo gearbeitet werden soll — noch keine Baustelle, die gibt es erst mit dem Auftrag. */
  address?: string;
  quoteDate: string;
  /** Bindefrist. Ein Angebot ohne Ablauf bindet den Betrieb unbegrenzt an seine Preise. */
  validUntil: string;
  status: 'Entwurf' | 'Versendet' | 'Angenommen' | 'Abgelehnt';
  positions: { label: string; qty: number; unit: string; unitPrice: number; netto: number }[];
  discount?: InvoiceDiscount | null;
  discountAmount?: number;
  subtotalNetto: number;
  totalNetto: number;
  totalVat: number;
  totalBrutto: number;
  vatRate: number;
  /**
   * Die kalkulierten Facharbeiterstunden.
   *
   * Getrennt von den Positionen gehalten, weil genau diese Zahl beim
   * Zuschlag als Stundenbudget in die Baustelle wandert — und damit zur
   * Messlatte der Budget-Ampel wird. Aus den Positionen ließe sie sich zwar
   * ableiten, aber nur solange niemand eine Position mit der Einheit „h"
   * einfügt, die keine Arbeitszeit ist (Anfahrtspauschale etwa).
   */
  kalkulierteStunden: number;
  notes?: string;
  /** Bei Annahme: die Baustelle, die daraus entstanden ist. */
  projectNumber?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface WorkSheet {
  id: string;
  companyId: string;
  projectNumber: string;
  customerId?: string;
  customerName: string;
  /** Baustellenadresse, zum Zeitpunkt der Unterschrift. */
  address?: string;
  /** Leistungsdatum (der Tag, über den der Schein geht). */
  datum: string;
  /**
   * „Verworfen" ist der aufgegebene ENTWURF, nicht der widerrufene Beleg.
   *
   * Der Storno zieht einen unterschriebenen Schein aus dem Verkehr und
   * braucht dafür einen Grund — der Kunde hat etwas in der Hand. Ein Entwurf
   * hat das Haus nie verlassen: der Auftrag ist geplatzt, oder er wurde
   * versehentlich angelegt. Er wird deshalb gekennzeichnet, nicht gelöscht,
   * und lässt sich als einziger Zustand wieder aufnehmen.
   */
  status: 'Entwurf' | 'Unterschrieben' | 'Storniert' | 'Verworfen';
  abrechnung: 'Regie' | 'Pauschal';
  /** Die kopierten Positionen — nach der Unterschrift unveränderlich. */
  zeiten: WorkSheetZeit[];
  material: WorkSheetMaterial[];
  notizen?: string;
  erstelltVonUid: string;
  erstelltVonName: string;
  unterschriften?: {
    monteur?: WorkSheetUnterschrift;
    kunde?: WorkSheetUnterschrift;
  };
  /**
   * SHA-256 über den eingefrorenen Inhalt, serverseitig gerechnet.
   *
   * Der eigentliche Manipulationsschutz. Ein qualifizierter Zeitstempel nach
   * eIDAS käme von einem Vertrauensdiensteanbieter und kostet; für einen
   * Rapportzettel ist er nicht nötig. Der Hash dagegen beweist, dass ein
   * vorgelegtes PDF genau das ist, was unterschrieben wurde.
   */
  inhaltHash?: string;
  /**
   * Fotos vom Einsatz — FREIWILLIG, nie Voraussetzung.
   *
   * WARUM OPTIONAL UND NICHT PFLICHT. Der Schein muss im Keller ohne Netz
   * unterschreibbar bleiben; das Ausgangsfach hält einen Schreibvorgang ohne
   * Empfang vor, ein Datei-Upload nicht. Wäre auch nur ein Foto Bedingung, hinge der
   * ganze Beleg an einem Balken Empfang — und der Monteur stünde mit einem
   * Kunden vor sich da, der unterschreiben will.
   *
   * Was die App dafür tut: sie sagt VOR dem Unterschreiben, wenn ein Bild
   * noch nicht oben ist, statt es still fallen zu lassen.
   */
  fotos?: WorkSheetFoto[];
  /** Zeitpunkt des Einfrierens, vom SERVER. */
  unterschriebenAm?: number;
  stornoGrund?: string;
  storniertVonName?: string;
  /** Wer den Entwurf aufgegeben hat — ohne Grund: er war nie beim Kunden. */
  verworfenVonName?: string;
  createdAt?: number;
}

export interface WorkSheetZeit {
  datum: string;
  mitarbeiter: string;
  von?: string;
  bis?: string;
  pauseMin?: number;
  /** Gerechnete Arbeitszeit in Minuten — als Zahl kopiert, nicht neu gerechnet. */
  minuten: number;
  taetigkeit?: string;
  helfer?: boolean;
}

export interface WorkSheetMaterial {
  name: string;
  menge: number;
  einheit?: string;
}

/**
 * Ein Foto am Schein.
 *
 * DIE BILDDATEI LIEGT IM DATEISPEICHER, nicht in der Tabelle — ein Handyfoto
 * wiegt Megabyte, und die gehören nicht in eine Zeile, die bei jeder Abfrage
 * mitkommt. Hier steht nur, wo es liegt und was drinsteht.
 *
 * `hash` IST DER GRUND, WARUM DAS FUNKTIONIERT. Die Prüfsumme des Scheins
 * kann die Bilddatei nicht mitrechnen, sie sieht nur die Zeilen. Ohne einen
 * Inhalts-Hash liesse sich die Datei im Speicher nach der Unterschrift
 * austauschen, ohne dass irgendetwas auffiele — der Beleg wäre dann genau
 * dort löchrig, wo er beweisen soll. Der Hash steht im Dokument, geht in die
 * Prüfsumme ein und ist damit vom Einfrieren mitgeschützt.
 */
export interface WorkSheetFoto {
  /** Pfad in Firebase Storage. */
  pfad: string;
  /** SHA-256 der hochgeladenen Bytes, hexadezimal. */
  hash: string;
  /** Grösse der komprimierten Datei in Byte — für die Anzeige. */
  bytes: number;
  /** Wann am Gerät aufgenommen bzw. gewählt. */
  geraetZeit: number;
}

/**
 * Eine Unterschrift samt Umständen.
 *
 * BEWUSST OHNE biometrische Merkmale. Schreibgeschwindigkeit und Druckverlauf
 * wären auf kapazitiven Touchscreens ohne Stift ohnehin überwiegend Fiktion —
 * `PointerEvent.pressure` liefert dort konstant 1.0 — und rechtlich ein
 * biometrisches Datum nach Art. 9 DSGVO mit Einwilligungspflicht. Der
 * Streitfall ist praktisch nie eine gefälschte Unterschrift, sondern eine
 * bestrittene Stundenzahl; dagegen hilft der eingefrorene Inhalt.
 */
export interface WorkSheetUnterschrift {
  /** Name in Druckbuchstaben — ein Strich ohne zuordenbaren Namen ist wenig wert. */
  name: string;
  /** Das Unterschriftsbild als PNG-Data-URL (~10 KB). */
  bild: string;
  /**
   * Zeit des GERÄTS bei der Unterschrift.
   *
   * Zusätzlich zur Serverzeit, und das ist kein Zierrat: Der Monteur steht im
   * Keller ohne Empfang. Eine offline erfasste Unterschrift synchronisiert
   * später, und die Serverzeit wäre dann die Zeit der Übertragung, nicht die
   * der Unterschrift. Wer nur eine der beiden speichert, hat im Streitfall
   * einen Zeitstempel, der die falsche Frage beantwortet.
   */
  geraetZeit: number;
}

export interface Customer {
  id: string;
  companyId: string;
  /** Firmenname oder „Familie Huber". */
  name: string;
  /** Rechnungsadresse — NICHT die Baustellenadresse. */
  address?: string;
  contactName?: string;
  contactPhone?: string;
  /** Für den späteren Versand von Handwerksscheinen und Rechnungen. */
  email?: string;
  /** UID-Nummer für Rechnungen an Unternehmen. */
  vatId?: string;
  notes?: string;
  active?: boolean;
  createdAt?: number;
}

export interface Project {
  id: string;
  companyId: string;
  projectNumber: string; // Geschäftsschlüssel, z. B. "2024-001"
  /**
   * Verknüpfter Kunde. Optional, weil Baustellen aus der Zeit vor den
   * Kundenstammdaten keinen haben — sie tragen den Namen weiterhin nur als
   * Text und lassen sich in der Kundenverwaltung nachträglich zuordnen.
   */
  customerId?: string;
  /**
   * Kundenname als Kopie.
   *
   * Bewusst redundant: die Baustellenlisten zeigen den Namen und sollen dafür
   * nicht zusätzlich die Kundensammlung laden müssen. Wird ein Kunde
   * umbenannt, ziehen die verknüpften Baustellen im selben Schreibvorgang
   * nach — sonst liefen Anzeige und Stammdaten auseinander.
   */
  customerName: string;
  address?: string;
  description?: string;
  status: 'Aktiv' | 'Pausiert' | 'Abgeschlossen';
  /**
   * Wie diese Baustelle abgerechnet wird.
   *
   * Steht an der Baustelle und nicht am einzelnen Zeiteintrag: entschieden
   * wird das beim Auftrag, nicht täglich neu. Für den Monteur heißt das
   * NULL zusätzliche Tipparbeit — und ein vergessener Haken kann nicht
   * passieren, weil es keinen gibt.
   *
   * Der Handwerksschein braucht die Angabe: auf einer Regiebaustelle sind die
   * bestätigten Stunden die Rechnungsgrundlage, auf einer Pauschalbaustelle
   * belegt derselbe Schein nur, DASS gearbeitet wurde.
   */
  billingMode?: 'Regie' | 'Pauschal';
  estimatedHours?: number;
  startDate?: string;
  endDate?: string;
  contactName?: string;
  contactPhone?: string;
  assignedEmployees?: string[]; // Array von uids
  /**
   * Verantwortliche Projektleitung — eine oder mehrere. Sie bekommt die
   * Meldungen zu Eilzustellungen dieser Baustelle, weil sie das Material auf
   * dem Weg mitnehmen kann. Ohne Zuordnung gibt es für eine Eilbestellung
   * niemanden zu benachrichtigen; die Oberfläche sagt das dann auch.
   */
  projectManagers?: string[]; // Array von uids
  createdAt?: number;
}

/**
 * materials/{id} — Katalog.
 *
 * Er trägt inzwischen ZWEI Preise, und die Unterscheidung ist der ganze
 * Punkt: der Verkaufspreis geht auf die Rechnung, der Einkaufspreis in die
 * Nachkalkulation. Sein ursprünglicher Zweck bleibt daneben bestehen — dass
 * ein Monteur auf der Baustelle benennen kann, was ihm die Projektleitung
 * bringen soll; die Anforderung selbst trägt weiterhin keinen Preis.
 */
export interface Material {
  id: string;
  companyId: string;
  name: string;
  category?: string;
  stock: number;
  articleNumber?: string;
  unit?: string;
  /**
   * Verkaufspreis netto je Einheit, in Euro.
   *
   * OHNE IHN GEHT MATERIAL NICHT AUF DIE RECHNUNG. Genau das war die Lücke:
   * die Stunden liefen automatisch durch, das Material tippte das Büro von
   * Hand nach — bei einem Installateur schnell die Hälfte der Summe.
   *
   * Der EINKAUFSpreis steht getrennt darunter, mit eigener Schreibgrenze:
   * er ist Margendaten und gehört der Geschäftsführung, während diesen Preis
   * hier die Verwaltung pflegt.
   */
  verkaufspreis?: number;
  /**
   * Einkaufspreis netto je Einheit, in Euro — was der BETRIEB zahlt.
   *
   * Die andere Hälfte der Rechnung. Der Verkaufspreis darüber bestimmt den
   * Erlös, dieser die Kosten; wer beide verwechselt, bekommt in der
   * Nachkalkulation für jedes Material einen Deckungsbeitrag von null und
   * hält ihn für ein Ergebnis — dieselbe Falle wie beim Stundensatz.
   *
   * ÄNDERN DARF IHN NUR DIE GESCHÄFTSFÜHRUNG, nicht die Verwaltung, die den
   * Katalog sonst pflegt: er ist Margendaten. Die Grenze steht in
   * `app.materialfelder_geschuetzt` und läuft zwischen den FELDERN, nicht
   * zwischen den Rollen. Was sie NICHT kann, ist das Lesen verhindern — der
   * Zeilenschutz gibt eine Zeile ganz oder gar nicht heraus.
   *
   * NICHT GESETZT heisst „nicht hinterlegt", nicht „kostet nichts". Die
   * Nachkalkulation nennt solche Artikel beim Namen, statt sie mit null
   * anzusetzen.
   */
  einkaufspreis?: number;
}

/**
 * materialOrders/{id} — Anforderung oder Retoure.
 *
 * Eine „Bestellung" ist hier eine interne Anforderung des Monteurs an die
 * Projektleitung, keine Bestellung beim Lieferanten und kein Rechnungsposten.
 */
export interface MaterialOrder {
  id: string;
  companyId: string;
  materialId: string;
  materialName: string;
  quantity: number;
  note?: string;
  projectNumber?: string;
  status: 'Offen' | 'In Bearbeitung' | 'Abholbereit' | 'Erledigt';
  /**
   * Eilzustellung: die Projektleitung der Baustelle wird sofort verständigt
   * und noch einmal, sobald das Material abholbereit ist — sie fährt ohnehin
   * hin und kann es mitnehmen. Setzt eine gewählte Baustelle voraus, denn
   * ohne sie gibt es keine zuständige Projektleitung.
   */
  isUrgent?: boolean;
  transactionType: 'order' | 'return';
  condition?: string; // nur Retoure
  userId: string; // uid
  userName?: string;
  processed?: boolean; // Lagerabzug-Guard
  isBilled?: boolean;
  invoiceNumber?: string;
  source?: EntrySource;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Eine Position der Ruestliste — ein Artikel, den der Monteur mitnehmen soll.
 */
export interface RuestPosition {
  /**
   * Stabil ueber Umsortieren und Umbenennen hinweg.
   *
   * An dieser Kennung haengt der Haken „eingeladen". Waere sie die
   * Listenposition, ruecke der Haken mit, sobald der Planer eine Zeile
   * einfuegt — und der Monteur laedt die falsche Kiste ein.
   */
  id: string;
  /** Katalogartikel, wenn es einer ist. Freie Zeilen tragen keinen. */
  materialId?: string;
  name: string;
  menge: number;
  einheit?: string;
}

/**
 * einsatzMaterial/{companyId}_{date}_{projectNumber} — die Ruestliste.
 *
 * WAS SIE IST UND WAS NICHT. Sie sagt „nimm das mit", nicht „das muss
 * besorgt werden". Das Zweite gibt es schon als Materialanforderung
 * (`MaterialOrder`), und die beiden zu vermischen waere teuer: die
 * Verwaltung bekaeme eine Arbeitsliste voller Dinge, die im Regal stehen,
 * und der Lagerstand wuerde zweimal abgezogen — einmal beim Erledigen der
 * Anforderung, einmal wenn der Monteur das Material tatsaechlich mitnimmt.
 * Eine Ruestliste bewegt den Bestand deshalb NICHT.
 *
 * WARUM EIN EIGENES DOKUMENT UND NICHT EIN FELD AM EINSATZ. `assignments`
 * traegt EINE ZEILE JE MITARBEITER. Material am Einsatz hiesse: vier
 * Monteure, vier Kopien derselben Liste — und ein Haken, von dem niemand
 * sagen kann, fuer wen er gilt. Material gehoert zum Paar aus TAG und
 * BAUSTELLE, nicht zur Person. Die Kiste steht einmal im Bus.
 *
 * DIE KENNUNG IST BERECHENBAR, damit die Startseite je Einsatz genau ein
 * Dokument liest, ohne Abfrage. Sie ist aber KEINE Sicherheitsgrenze: die
 * liegt wie ueberall am Feld `companyId`.
 */
export interface EinsatzMaterial {
  id: string;
  companyId: string;
  date: string; // 'YYYY-MM-DD'
  projectNumber: string;
  /**
   * Wer an diesem Tag auf dieser Baustelle eingeteilt ist.
   *
   * Steht hier doppelt (die Wahrheit steht in `assignments`), und zwar aus
   * einem Grund: nur so kann die Sicherheitsregel „darf dieser Monteur
   * abhaken?" ohne einen Nachschlag beantworten. Die Kennungen der Einsaetze
   * sind zufaellig, eine Regel kaeme mit `get()` gar nicht an sie heran.
   * Gepflegt wird das Feld beim Speichern der Einteilung UND beim Speichern
   * der Liste.
   */
  uids: string[];
  positionen: RuestPosition[];
  /**
   * Was schon im Bus ist: Positions-Kennung -> wer und wann.
   *
   * EIGENES FELD, NICHT EIN HAKEN IN DER POSITION. Nur so laesst sich in
   * den Regeln die Grenze ziehen: der Monteur darf `geladen` schreiben und
   * sonst nichts. Laege der Haken innerhalb von `positionen`, koennte keine
   * Regel „Haken gesetzt" von „ganze Liste ueberschrieben" unterscheiden.
   *
   * Die Zeit kommt vom Geraet, nicht vom Server. Sie ist eine Anzeige
   * („eingeladen von Max, 06:12"), keine Grundlage fuer eine Entscheidung —
   * und ein Serverzeitstempel ist in einer verschachtelten Karte nicht zu
   * haben, ohne die Regel aufzuweichen.
   */
  geladen?: Record<string, { von: string; am: number }>;
  updatedAt?: number;
  updatedBy?: string;
}

/** timeEntries/{id} — Zeiterfassung. */
export interface TimeEntry {
  id: string;
  companyId: string;
  date: string; // 'YYYY-MM-DD'
  status: 'Anwesend' | 'Krank' | 'Urlaub';
  startTime?: string; // 'HH:MM'
  endTime?: string; // 'HH:MM'
  breakDuration?: number; // Minuten
  travelTime?: number; // Minuten (Wegzeit)
  /** Direkt gesetzte Stunden (v. a. Sprach-Einträge). Greift nur, wenn keine
   * Zeitspanne (start+end) gesetzt ist — siehe calcWorkMin. */
  hours?: number;
  /** Nachtarbeit — wird bewusst manuell gesetzt, nicht aus der Uhrzeit geraten. */
  isNightWork?: boolean;
  /** Notdienst / Störungseinsatz außerhalb der regulären Zeit. */
  isEmergency?: boolean;
  customerName?: string;
  projectNumber?: string;
  helperName?: string;
  vehiclePlate?: string;
  comment?: string;
  isHelper?: boolean;
  userId: string; // uid
  userName?: string;
  source?: EntrySource;
  isBilled?: boolean;
  invoiceNumber?: string;
  createdAt?: number;
  lastEditedBy?: string;
  lastEditedByUid?: string;
  lastEditedAt?: number;
  /**
   * Aus welchem genehmigten Urlaubsantrag dieser Eintrag entstanden ist.
   *
   * Nur bei `status === 'Urlaub'` gesetzt und nur bei Einträgen, die die
   * Genehmigung automatisch angelegt hat. Wird ein Urlaub nachträglich
   * storniert, sind daran genau die Tage zu finden, die wieder verschwinden
   * müssen — ohne dass ein von Hand gebuchter Urlaubstag mit gelöscht wird.
   */
  vacationId?: string;
}

/**
 * vacations/{id} — ein Urlaubsantrag.
 *
 * WARUM EIGENE SAMMLUNG UND NICHT NUR EIN TAGESSTATUS. „Urlaub" gab es schon
 * als Status eines Zeiteintrags, und damit konnte sich jeder seinen Urlaub
 * selbst eintragen — genehmigt war er deshalb nicht. Es fehlte das, worum es
 * beim Urlaub eigentlich geht: ein Antrag, eine Entscheidung darüber, und für
 * beide Seiten die Gewissheit, woran man ist.
 *
 * Der Zeiteintrag bleibt trotzdem die Grundlage der Stundenrechnung. Er wird
 * bei der Genehmigung erzeugt — siehe `vacationId` oben. Damit rechnen Saldo,
 * Monatsbilanz und Auswertung unverändert weiter, und ein genehmigter
 * Urlaubstag taucht nicht als „Zeit fehlt" auf der Startseite auf.
 */
export interface Vacation {
  id: string;
  companyId: string;
  userId: string; // uid des Antragstellers
  /** Name als Kopie — die Genehmigungsliste soll nicht alle Nutzer laden. */
  userName: string;
  von: string; // 'YYYY-MM-DD'
  bis: string; // 'YYYY-MM-DD', einschließlich
  /**
   * Arbeitstage im Zeitraum, zum Zeitpunkt des Antrags gerechnet.
   *
   * Als Kopie festgehalten, nicht bei jeder Anzeige neu ermittelt: ändert
   * jemand später die Arbeitstage eines Mitarbeiters, soll ein bereits
   * genehmigter Urlaub nicht rückwirkend anders lang werden.
   */
  tage: number;
  status: 'Beantragt' | 'Genehmigt' | 'Abgelehnt' | 'Storniert';
  /** Anmerkung des Antragstellers. */
  notiz?: string;
  entschiedenVonUid?: string;
  entschiedenVonName?: string;
  entschiedenAm?: number;
  /**
   * Begründung bei Ablehnung oder Storno.
   *
   * Pflicht in der Oberfläche: eine Ablehnung ohne Grund ist für den, der sie
   * bekommt, nicht von Willkür zu unterscheiden.
   */
  grund?: string;
  createdAt?: number;
}

/** assignments/{id} — Einsatzplanung: ein Dokument pro (Datum × Projekt × Mitarbeiter). */
export interface Assignment {
  id: string;
  companyId: string;
  date: string; // 'YYYY-MM-DD'
  projectNumber: string;
  userId: string; // uid
  userName?: string;
  asHelper?: boolean;
  comment?: string;
  createdBy?: string;
  createdAt?: number;
}

/** invoices/{id} */
/**
 * Was eine Rechnung IST — und nicht bloss, wie sie heisst.
 *
 * `einzel` ist die ganze Leistung auf einem Beleg: der Normalfall beim
 * Notdiensteinsatz. Die anderen drei gehören zu einer Baustelle, die über
 * Monate läuft:
 *
 *   anzahlung  vor der Leistung, auf die künftige Leistung
 *   teil       nach einem abgeschlossenen Bauabschnitt
 *   schluss    zum Schluss — und sie MUSS die vorher verrechneten
 *              Teilentgelte samt Steuer abziehen (§ 11 Abs 12 UStG)
 *
 * WARUM DAS EIN FELD IST UND KEIN TEXT IM BETREFF: an der Art hängt, ob die
 * Schlussrechnung abziehen muss und ob die Nachkalkulation den Erlös doppelt
 * zählt. Beides lässt sich einer Überschrift nicht ansehen.
 */
export type RechnungsArt = 'einzel' | 'anzahlung' | 'teil' | 'schluss';

/**
 * Eine abgezogene Vorrechnung, wie sie auf der Schlussrechnung steht.
 *
 * KOPIE, KEIN VERWEIS — aus demselben Grund wie die Positionen: der Abzug
 * muss auch dann noch so auf dem Beleg stehen, wie der Kunde ihn bekommen
 * hat, wenn die abgezogene Rechnung später storniert wird.
 *
 * `netto`, `vat` und `brutto` sind die Beträge der ABGEZOGENEN Rechnung,
 * positiv aufgeschrieben. Abgezogen werden sie beim Rechnen; ein negatives
 * Vorzeichen zusätzlich im Feld wäre eine Verneinung zu viel.
 */
export interface Vorrechnung {
  /** Kennung der abgezogenen Rechnung — daran hängt die Prüfung auf Doppelabzug. */
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  netto: number;
  vat: number;
  brutto: number;
}

export interface Invoice {
  id: string;
  companyId: string;
  invoiceNumber: string; // 'RE-YYYY-NNNN'
  projectNumber: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  /**
   * Was DIESE Rechnung fordert — nicht, was die Baustelle insgesamt kostet.
   *
   * Bei einer Schlussrechnung ist das der Rest nach Abzug der Teilentgelte.
   * Daran hängen die offenen Posten, der Mahnlauf und der Zahlungsstand, und
   * die dürfen nicht die volle Leistung ansetzen, von der drei Viertel längst
   * verrechnet und bezahlt sind. Die volle Leistung steht in `gesamt*`.
   */
  totalNetto: number;
  totalVat: number;
  totalBrutto: number;
  /** Fehlt bei Altbestand — der ist durchwegs `einzel`, so wie die Vorgabe. */
  art?: RechnungsArt;
  /**
   * Die abgezogenen Vorrechnungen. Nur bei einer Schluss- oder Teilrechnung
   * belegt; sonst gar nicht da.
   */
  vorrechnungen?: Vorrechnung[];
  /**
   * Die GESAMTE Leistung der Baustelle, vor Abzug der Vorrechnungen.
   *
   * Steht nur auf einer Rechnung, die abzieht — sonst wäre sie dasselbe wie
   * `total*` und damit eine zweite Wahrheit über dieselbe Zahl.
   */
  gesamtNetto?: number;
  gesamtVat?: number;
  gesamtBrutto?: number;
  /**
   * Positionen zum Zeitpunkt der Rechnungslegung. Eine Rechnung ist ein
   * Dokument, kein Blick auf die aktuellen Daten: würde man sie später aus
   * den Zeiteinträgen neu berechnen, änderte sich eine bereits verschickte
   * Rechnung, sobald jemand einen Eintrag korrigiert.
   */
  positions?: { label: string; qty: number; unit: string; unitPrice: number; netto: number }[];
  /** Summe der Positionen VOR Rabatt. Ohne sie liesse sich der Rabatt im
   *  Nachhinein nicht mehr nachvollziehen. */
  subtotalNetto?: number;
  /**
   * Gewaehrter Rabatt, wie er auf der Rechnung steht. `null` heisst
   * ausdruecklich „kein Rabatt": ein Feld, das gar nicht da ist, liesse sich
   * von „ohne Rabatt ausgestellt" nicht unterscheiden.
   */
  discount?: InvoiceDiscount | null;
  /** Der daraus errechnete Abzug in Euro — festgehalten, nicht neu gerechnet. */
  discountAmount?: number;
  /** Angewandter USt-Satz (0.2 = 20 %). Bei Reverse Charge 0. */
  vatRate?: number;
  /**
   * BAULEISTUNG MIT ÜBERGANG DER STEUERSCHULD — § 19 Abs 1a UStG.
   *
   * Der Normalfall ist: der Betrieb weist 20 % aus, kassiert sie und führt
   * sie ab. Erbringt er eine BAULEISTUNG an einen anderen Bauunternehmer —
   * also als Subunternehmer —, kehrt sich das um: die Rechnung geht netto
   * hinaus, und der Empfänger schuldet die Steuer selbst.
   *
   * WARUM DAS EIN EIGENES FELD IST und nicht einfach `vatRate: 0`. Beides
   * ergibt dieselbe Summe und bedeutet etwas völlig anderes. „0 %" ist ein
   * Steuersatz; Reverse Charge ist ein Übergang der Steuerschuld, der auf dem
   * Beleg ausdrücklich benannt werden MUSS (§ 11 Abs 1a UStG) und im Journal
   * getrennt auszuweisen ist. Wer die beiden Fälle über eine Null
   * zusammenlegt, kann sie im Nachhinein nicht mehr unterscheiden.
   *
   * WAS SCHIEFGEHT, WENN ES FEHLT: der Betrieb schreibt 20 % auf eine
   * Rechnung an einen Baumeister. Der zahlt sie nicht und verlangt eine
   * Berichtigung — die ausgewiesene Steuer schuldet der Betrieb bis dahin
   * trotzdem (§ 11 Abs 12 UStG).
   */
  reverseCharge?: boolean;
  /**
   * Die UID des Leistungsempfängers, festgehalten zum Zeitpunkt der Rechnung.
   *
   * Bei Reverse Charge Pflicht: ohne sie ist der Übergang der Steuerschuld
   * nicht belegt. Kopiert und nicht verknüpft — aus demselben Grund wie die
   * Anschrift: ein Beleg ist ein Dokument, kein Blick auf die aktuellen
   * Stammdaten.
   */
  customerVatId?: string;
  /** Anschrift der Baustelle zum Zeitpunkt der Rechnungslegung. */
  address?: string;
  /**
   * Leistungszeitraum — der Tag oder Zeitraum, über den die Leistung erbracht
   * wurde.
   *
   * PFLICHTANGABE nach § 11 Abs 1 Z 4 UStG. Sie fehlte auf jeder bisher
   * geschriebenen Rechnung: dort standen Rechnungsdatum, Zahlungsziel und
   * Baustellennummer, und die Positionen hiessen schlicht
   * „Facharbeiterstunden". Ohne den Zeitraum ist die Rechnung formal
   * unvollständig, und beim Kunden wackelt der Vorsteuerabzug.
   *
   * Vorbelegt aus den verrechneten Belegen, aber ÄNDERBAR: eine Rechnung
   * kann sich bewusst auf einen anderen Zeitraum beziehen als den, den die
   * Buchungen zufällig aufspannen — etwa bei einer Teilrechnung oder wenn
   * eine Nacharbeit später gebucht wurde.
   *
   * Sind beide gleich, steht auf dem Beleg „Leistungsdatum", sonst
   * „Leistungszeitraum".
   */
  leistungVon?: string;
  leistungBis?: string;
  /**
   * WO DIE RECHNUNG STEHT — abgeleitet, nicht gesetzt.
   *
   * Bis zum 19.09.2026 war das ein Haken: jemand stellte „Bezahlt" ein, und
   * damit galt die Rechnung als erledigt. Seit es Zahlungseingänge gibt,
   * rechnet die Datenbank diesen Wert aus ihnen (`app.zahlstand_setzen`), und
   * ein Schreibversuch von Hand wird abgewiesen.
   *
   * Die einzigen beiden Ausnahmen sind kein Widerspruch: „Überfällig" hängt
   * am Datum und nicht am Geld, und „Storniert" ist eine Entscheidung des
   * Betriebs. Beide darf die Ansicht weiterhin setzen.
   */
  paymentStatus:
    | 'Offen'
    | 'Überfällig'
    | 'Teilbezahlt'
    | 'Bezahlt'
    | 'Überzahlt'
    | 'Storniert';
  /**
   * Summe aller Zahlungseingänge zu dieser Rechnung.
   *
   * Bewusst redundant zu `zahlungseingaenge` — und zwar aus demselben Grund
   * wie `faelligAm` an der Wartung: die Liste zeigt dreihundert Rechnungen
   * mit ihrem Restbetrag, und ohne diese Zahl wäre das je Zeile eine eigene
   * Abfrage. Geschrieben wird sie NUR von der Datenbank.
   */
  bezahltBetrag?: number;
  linkedEntries?: string[];
  linkedOrders?: string[];
  /**
   * Handwerksscheine, deren Material in dieser Rechnung steckt.
   *
   * WARUM HIER UND NICHT AM SCHEIN. Zeiteinträge tragen ein `isBilled`; beim
   * Schein geht das nicht — er ist nach der Unterschrift eingefroren, und die
   * Rules lassen nur noch den Storno zu. Das ist richtig so: ein Beleg, den
   * der Kunde unterschrieben hat, darf sich nicht mehr ändern.
   *
   * Also merkt sich die RECHNUNG, welche Scheine sie verbraucht hat. Der
   * Storno gibt sie damit von selbst wieder frei — anders als ein Feld am
   * Schein, das jemand zurücksetzen müsste.
   */
  linkedWorkSheets?: string[];
  cancellationNote?: string | null;
  cancelledAt?: number | null;
  /**
   * MAHNWESEN — wie oft und wann gemahnt wurde.
   *
   * Vorher gab es nur den Status „Überfällig". Er wurde beim Öffnen der Liste
   * gesetzt und angezeigt; das Mahnen selbst führte der Betrieb im Kopf. Ab
   * der dritten Stufe geht es hier nicht weiter — was dann folgt, entscheidet
   * ein Mensch mit einem Anwalt oder einem Inkassobüro.
   *
   * `mahnfrist` ist die NEUE Frist aus der letzten Mahnung, nicht das
   * ursprüngliche Zahlungsziel. Beide werden gebraucht: das eine sagt, wie
   * lange der Verzug dauert, das andere, wann die nächste Stufe ansteht.
   */
  mahnstufe?: number;
  gemahntAm?: string;
  mahnfrist?: string;
  /** Die auf der letzten Mahnung ausgewiesenen Spesen, in Euro. */
  mahnspesen?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Rabatt auf eine Rechnung.
 *
 * Entweder ein Anteil ('percent', 5 = 5 %) oder ein fester Betrag in Euro.
 * Beides zusammen gibt es bewusst nicht: zwei Rabatte auf derselben Rechnung
 * sind fuer den Kunden nicht nachvollziehbar, und die Reihenfolge ihrer
 * Anwendung waere Auslegungssache.
 */
/**
 * Ein Zahlungseingang zu einer Rechnung.
 *
 * WARUM EINE EIGENE SAMMLUNG UND KEIN FELD AN DER RECHNUNG. Teilzahlungen
 * sind im Handwerk der Normalfall — Anzahlung, Abschlag, Rest. Ein Betrag am
 * Beleg könnte immer nur den letzten festhalten; die Frage „wann kam wie
 * viel" wäre danach nicht mehr zu beantworten, und genau an ihr hängen
 * Skonto, Verzugszinsen und eine ehrliche Liste offener Posten.
 */
export interface Zahlungseingang {
  id: string;
  companyId: string;
  /** Die Rechnung, auf die gezahlt wurde. */
  invoiceId: string;
  /** Wertstellung laut Kontoauszug, nicht der Tag der Erfassung. */
  datum: string;
  /**
   * Der Betrag in Euro. NEGATIV ist erlaubt und meint eine Rückzahlung —
   * derselbe Vorgang mit umgekehrtem Vorzeichen. Ohne ihn bliebe eine
   * überzahlte Rechnung für immer überzahlt.
   */
  betrag: number;
  art: 'Überweisung' | 'Bar' | 'Karte' | 'Sonstiges';
  /** Freitext: „Skonto gezogen", „Teilzahlung laut Vereinbarung". */
  hinweis?: string;
  /** Wer ihn erfasst hat — eine Zahl ohne Herkunft lässt sich nicht klären. */
  erfasstVon?: string;
  erfasstVonName?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface InvoiceDiscount {
  mode: 'percent' | 'amount';
  value: number;
  /** Was auf der Rechnung steht, z. B. „Stammkundenrabatt". */
  label?: string;
}

/** followUps/{id} — neuer optionaler Typ aus dem KI-Magic-Moment (Spec §6). */
/**
 * wartungen/{id} — eine wiederkehrende Wartung, die der Betrieb schuldet.
 *
 * NICHT DASSELBE WIE EIN TERMIN. Ein Termin steht im Einsatzplan und ist
 * vorbei, wenn er vorbei ist. Diese Vereinbarung überlebt ihre Ausführung:
 * beim Eintragen der erledigten Wartung rückt der nächste Termin nach. Genau
 * darin liegt der Wert — der Betrieb muss sich nichts merken.
 */
export interface Wartung {
  id: string;
  companyId: string;
  /** Der Kunde, dem die Anlage gehört. Ohne ihn gäbe es niemanden anzurufen. */
  customerId: string;
  /**
   * Kundenname als Kopie — dieselbe Überlegung wie bei den Baustellen: die
   * Liste zeigt den Namen und soll dafür nicht die Kundensammlung laden.
   */
  customerName: string;
  /** Was gewartet wird, in Worten: „Therme Vaillant ecoTEC, Keller". */
  anlage: string;
  /**
   * Wo die Anlage steht.
   *
   * AUSDRÜCKLICH NICHT die Rechnungsadresse des Kunden. Eine Hausverwaltung
   * hat eine Adresse und zwanzig Heizungen an zwanzig anderen. Leer heisst:
   * es gilt die Kundenadresse.
   */
  address?: string;
  /** Abstand zwischen zwei Wartungen, in ganzen Monaten. */
  intervallMonate: number;
  /** Wann zuletzt gewartet wurde. Fehlt bei einer neu übernommenen Anlage. */
  zuletztAm?: string;
  /**
   * Der nächste Termin — abgeleitet, aber gespeichert.
   *
   * Bewusst redundant zu `zuletztAm` + `intervallMonate`: nur ein
   * gespeichertes Feld lässt sich abfragen. Berechnet würde die Frage „was ist
   * fällig?" jedes Dokument des Betriebs in den Browser laden. Geschrieben
   * wird es an genau einer Stelle (`wartungErledigt`), gerechnet an genau
   * einer (`naechsterTermin`).
   */
  faelligAm: string;
  /**
   * Ruht die Vereinbarung?
   *
   * Gekündigte Verträge werden nicht gelöscht: die Historie „bis 2027
   * gewartet" ist der Grund, warum man den Kunden zwei Jahre später wieder
   * anruft.
   */
  aktiv: boolean;
  /** Freitext — Gerätenummer, Schlüsselübergabe, wer aufsperrt. */
  hinweis?: string;
  /** Baustelle, auf der zuletzt gewartet wurde — für den Weg in die Historie. */
  letzteBaustelle?: string;
  /**
   * Die Baustelle, die für die ANSTEHENDE Wartung schon angelegt ist.
   *
   * DAS IST DER UNTERSCHIED ZWISCHEN „ZU TUN" UND „SCHON EINGEPLANT", und
   * ohne ihn war die Liste der fälligen Wartungen nicht abarbeitbar: wer sie
   * am Montag durchgeht und drei Baustellen anlegt, sieht am Dienstag
   * dieselben drei Zeilen im selben Rot. Beim zweiten Durchgang entsteht die
   * Baustelle ein zweites Mal.
   *
   * Getrennt von `letzteBaustelle` gehalten, weil es zwei verschiedene
   * Aussagen sind: hier steht, was ansteht, dort, was gewesen ist. Beim
   * Eintragen der erledigten Wartung wandert der Wert von hier nach dort und
   * wird hier geleert — in EINEM Schreibvorgang, damit kein Zustand entsteht,
   * in dem er in beiden Feldern steht.
   */
  offeneBaustelle?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface FollowUp {
  id: string;
  companyId: string;
  projectNumber?: string;
  title: string;
  dueWeek?: string; // ISO-Woche, z. B. "2026-W26"
  createdFrom: 'voice' | 'manual';
  done: boolean;
  createdAt?: number;
}
