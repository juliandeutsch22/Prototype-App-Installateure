/**
 * Netzzugriffe, die stillstehen, beenden — statt endlos zu warten.
 *
 * DER GEMELDETE FEHLER (01.11.2026): „Teilweise lädt die App sehr lange bzw.
 * gar nicht mehr — scheinbar willkürlich beim Wechseln der Seiten." Ursache:
 * kein Netzzugriff der App hatte eine Zeitgrenze. Bleibt eine Anfrage auf
 * einer halb toten Verbindung hängen (Telefon kommt aus dem Hintergrund,
 * WLAN wechselt auf Mobilfunk), wartet sie, bis der Browser aufgibt — am
 * Telefon Minuten oder nie. Und sie wartet nicht allein:
 *
 *   - Vor JEDER Abfrage holt supabase-js die Sitzung; ist das Token fast
 *     abgelaufen, erneuert es zuerst. Alle Abfragen warten auf DIESELBE
 *     Erneuerung (`refreshingDeferred`). Steht sie still, steht jede Seite
 *     still, die man danach öffnet.
 *   - Eine Seite, deren Abfrage noch läuft, bekommt beim nächsten Besuch
 *     dieselbe hängende Abfrage zurück (TanStack Query, Live-Listen).
 *
 * WAS HIER GILT — STILLSTAND, NICHT DAUER. Abgebrochen wird nicht nach einer
 * festen Gesamtzeit, sondern wenn nichts mehr kommt: keine Antwort binnen
 * der Frist, oder mitten in der Antwort keine Daten mehr binnen der Frist.
 * Eine große Liste darf so lange laden, wie Daten fließen — das skaliert mit
 * dem Betrieb, eine Gesamtfrist nicht.
 *
 * WAS NIE ABGEBROCHEN WIRD: alles, was schreiben kann (POST, PATCH, PUT,
 * DELETE, Edge Functions, Hochladen). Ein abgebrochener Schreibvorgang ist
 * auf dem Server womöglich schon geschehen; ein zweiter Versuch legte ihn
 * doppelt an. Lesende Datenbankfunktionen gehen zwar per POST, schreiben
 * aber nicht — nur die in `LESENDE_FUNKTIONEN`, und eine Prüfung gegen die
 * Datenbank (`tests/supabase/netzFrist.test.ts`) hält fest, dass jede davon
 * dort als `stable` steht, also gar nicht schreiben KANN.
 *
 * DER ABBRUCH ALS NETZFEHLER. Ein Stillstand endet als `TypeError` „Failed to
 * fetch …“, wie ein abgerissenes Netz. Das hat drei Folgen, alle gewollt:
 * postgrest-js wiederholt einen lesenden Abruf über eine frische Verbindung
 * (bis zu dreimal), auth-js wiederholt die Erneuerung des Tokens und behält
 * die Sitzung, und `grundAus` zeigt „Keine Verbindung zum Server“. Bricht
 * dagegen der Aufrufer selbst ab, bleibt es sein `AbortError`.
 */

/** Die Fristen je Art des Zugriffs, in Millisekunden. */
export const FRISTEN = {
  /**
   * Die Erneuerung des Tokens: klein, und der zweite Versuch muss noch
   * innerhalb des Wiederverwendungsfensters des Anmeldedienstes kommen
   * (`refresh_token_reuse_interval`, 10 s): 8 s plus 0,2 s Pause.
   */
  erneuern: { bisAntwort: 8_000, stillstand: 8_000 },
  /** Anmelden mit Passwort oder Code: wer tippt, wartet gern etwas länger. */
  anmelden: { bisAntwort: 30_000, stillstand: 15_000 },
  /** Lesen beim Anmeldedienst (das eigene Konto). */
  authLesen: { bisAntwort: 15_000, stillstand: 15_000 },
  /**
   * Lesen aus Datenbank und Dateiablage. PostgREST antwortet erst, wenn die
   * Abfrage fertig ist; die Datenbank bricht eine Abfrage nach ihrer eigenen
   * Grenze ab (`statement_timeout`, im gehosteten Projekt 8 s für angemeldete
   * Konten). 25 s bis zur Antwort lassen also jeder echten Abfrage Luft und
   * fangen nur die tote Verbindung.
   */
  lesen: { bisAntwort: 25_000, stillstand: 15_000 },
} as const;

export type Zugriffsart = keyof typeof FRISTEN;

/**
 * Datenbankfunktionen, die nur lesen — und deshalb wie ein GET behandelt
 * werden. Jede steht in der Datenbank als `stable`; die Prüfung gegen die
 * Datenbank verlangt außerdem, dass jede `stable`-Funktion, die die App
 * aufruft, hier steht, damit keine neue still ohne Frist bleibt.
 */
export const LESENDE_FUNKTIONEN: ReadonlySet<string> = new Set([
  'arbeitszeit_vorlauf',
  'ausgegebenes_material',
  'baustellen_einsatzlage',
  'baustellen_stunden',
  'buchungstage_je_person',
  'fehlerprotokoll_plattform',
  'kollegen',
  'lager_frei',
  'lager_knapp',
  'lieferant_vorschlag',
  'mein_zustand',
  'mein_zweiter_faktor',
  'monatsbilanzen_alle',
  'naechste_kundennummer',
  'naechste_nummern',
  'offene_posten',
  'person_auskunft',
  'plattform_betriebe',
  'plattform_leitung_mit_zweitem_faktor',
  'plattform_leitungskonten',
  'ruest_angefordert',
  'schlussrechnungen_ohne_abzug',
  'support_bereiche',
  'unverrechnete_stunden',
  'wochenplan_abwesend',
]);

/** Welche Frist gilt für diesen Zugriff — oder keine (`null`)? */
export function zugriffsart(adresse: string, methode: string): Zugriffsart | null {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return null;
  }
  const pfad = url.pathname;
  const m = methode.toUpperCase();
  if (pfad.endsWith('/auth/v1/token')) {
    return url.searchParams.get('grant_type') === 'refresh_token' ? 'erneuern' : 'anmelden';
  }
  const lesend = m === 'GET' || m === 'HEAD';
  if (pfad.includes('/auth/v1/')) return lesend ? 'authLesen' : null;
  if (pfad.includes('/rest/v1/rpc/')) {
    const name = pfad.slice(pfad.indexOf('/rest/v1/rpc/') + '/rest/v1/rpc/'.length);
    return lesend || (m === 'POST' && LESENDE_FUNKTIONEN.has(name)) ? 'lesen' : null;
  }
  if (pfad.includes('/rest/v1/') || pfad.includes('/storage/v1/')) return lesend ? 'lesen' : null;
  return null;
}

/** Der Fehler eines stillstehenden Zugriffs — für die Bibliotheken ein Netzfehler. */
export class Stillstand extends TypeError {
  constructor(sekunden: number) {
    super(`Failed to fetch — die Verbindung stand ${sekunden} s still`);
  }
}

/**
 * `fetch` mit Stillstandsfrist für die Zugriffe, die `zugriffsart` kennt;
 * alle anderen gehen unverändert durch.
 */
export function fetchMitFrist(basis: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return async (eingabe, init) => {
    const adresse = typeof eingabe === 'string' ? eingabe : eingabe instanceof URL ? eingabe.href : eingabe.url;
    const methode = init?.method ?? (eingabe instanceof Request ? eingabe.method : 'GET');
    const art = zugriffsart(adresse, methode);
    if (!art) return basis(eingabe, init);
    const { bisAntwort, stillstand } = FRISTEN[art];

    const steuer = new AbortController();
    const fremd = init?.signal ?? (eingabe instanceof Request ? eingabe.signal : undefined);
    let stand = false;
    // Bricht der Aufrufer ab, ist das SEIN Abbruch — mit seinem Grund, ohne Wiederholung.
    const weiterreichen = () => steuer.abort(fremd?.reason);
    if (fremd?.aborted) steuer.abort(fremd.reason);
    else fremd?.addEventListener('abort', weiterreichen, { once: true });
    let uhr: ReturnType<typeof setTimeout> | undefined;
    const wecken = (ms: number, dann?: () => void) => {
      clearTimeout(uhr);
      uhr = setTimeout(() => {
        stand = true;
        steuer.abort();
        dann?.();
      }, ms);
    };
    const aufraeumen = () => {
      clearTimeout(uhr);
      fremd?.removeEventListener('abort', weiterreichen);
    };

    wecken(bisAntwort);
    let antwort: Response;
    try {
      antwort = await basis(eingabe, { ...init, signal: steuer.signal });
    } catch (e) {
      aufraeumen();
      throw stand ? new Stillstand(Math.round(bisAntwort / 1000)) : e;
    }
    clearTimeout(uhr);
    if (!antwort.body) {
      aufraeumen();
      return antwort;
    }

    /*
      DER RUMPF MIT WÄCHTER: jedes Stück Daten stellt die Uhr neu. Eine
      Antwort, die fließt, läuft beliebig lange; eine, die mittendrin
      stehen bleibt, endet nach `stillstand` mit demselben Netzfehler.
    */
    const leser = antwort.body.getReader();
    let zu = false;
    const rumpf = new ReadableStream<Uint8Array>({
      pull(ziel) {
        return new Promise<void>((fertig) => {
          wecken(stillstand, () => {
            if (zu) return;
            zu = true;
            leser.cancel().catch(() => undefined);
            ziel.error(new Stillstand(Math.round(stillstand / 1000)));
            fertig();
          });
          leser.read().then(
            ({ done, value }) => {
              clearTimeout(uhr);
              if (zu) return fertig();
              if (done) {
                zu = true;
                aufraeumen();
                ziel.close();
              } else {
                ziel.enqueue(value);
              }
              fertig();
            },
            (fehler: unknown) => {
              clearTimeout(uhr);
              if (!zu) {
                zu = true;
                aufraeumen();
                ziel.error(stand ? new Stillstand(Math.round(stillstand / 1000)) : fehler);
              }
              fertig();
            },
          );
        });
      },
      cancel(grund) {
        zu = true;
        aufraeumen();
        return leser.cancel(grund);
      },
    });
    return new Response(rumpf, { status: antwort.status, statusText: antwort.statusText, headers: antwort.headers });
  };
}
