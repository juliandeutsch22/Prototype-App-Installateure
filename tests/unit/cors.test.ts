import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { mitCors } from '../../supabase/functions/_eigen/cors.ts';

/**
 * DER VORABFLUG DES BROWSERS — der Fehler, den es an keiner Stelle geben
 * konnte, ausser im echten Browser gegen das echte Projekt.
 *
 * WAS GEMELDET WURDE: „Der Benutzer konnte nicht angelegt werden. Failed to
 * send a request to the Edge Function." Kein Statuscode, kein Text vom
 * Server — weil der Browser die Anfrage nie gestellt hat. Vor einer Anfrage
 * an eine fremde Herkunft mit `Authorization`-Kopf fragt er mit `OPTIONS`
 * vorher nach; kam darauf keine Erlaubnis, bricht er ab.
 *
 * WARUM ALLES GRÜN WAR, WÄHREND ES NICHT GING — drei Schichten, die alle
 * an derselben Stelle wegsehen:
 *
 *   `npm test`              nachgebaute Umgebung, kein Netz
 *   `npm run supabase:test` `fetch` aus Node — Node kennt keinen Vorabflug
 *   örtlicher Stapel        vor ihm steht Kong, und Kong beantwortet
 *                           `OPTIONS` selbst, bevor die Function es sieht
 *
 * Nachgemessen an Kong vorbei, direkt am Edge-Runtime:
 *
 *   vorher   OPTIONS /mitarbeiter-anlegen → 405 {"error":"Nur POST."}, keine Köpfe
 *   nachher  OPTIONS /mitarbeiter-anlegen → 204, alle vier Köpfe
 */

describe('Der Vorabflug', () => {
  const durchgereicht = async () => new Response('sollte nicht laufen', { status: 200 });

  it('wird beantwortet, ohne die Function überhaupt zu wecken', async () => {
    /*
      Ein Vorabflug kommt OHNE `Authorization` — der Browser schickt bei
      einem grundsätzlich keines mit. Liefe er durch die Anmeldeprüfung der
      Function, käme 401 zurück, und der Browser bräche genauso ab wie
      vorher. Er darf die Function deshalb gar nicht erst erreichen.
    */
    let gelaufen = false;
    const behandeln = mitCors(async () => {
      gelaufen = true;
      return new Response('nein', { status: 401 });
    });

    const antwort = await behandeln(new Request('http://x/f', { method: 'OPTIONS' }));

    expect(gelaufen).toBe(false);
    expect(antwort.status).toBe(204);
  });

  it('erlaubt genau die Köpfe, die supabase-js mitschickt', async () => {
    /*
      `apikey` und `x-client-info` hängt supabase-js von sich aus an. Fehlt
      einer der Namen, lehnt der Browser ab — mit derselben nichtssagenden
      Meldung wie bei gar keiner Antwort. Deshalb steht hier jeder einzeln.
    */
    const antwort = await mitCors(durchgereicht)(
      new Request('http://x/f', { method: 'OPTIONS' }),
    );
    const erlaubt = antwort.headers.get('Access-Control-Allow-Headers') ?? '';

    for (const kopf of ['authorization', 'apikey', 'content-type', 'x-client-info']) {
      expect(erlaubt.toLowerCase(), `${kopf} fehlt in Allow-Headers`).toContain(kopf);
    }
    expect(antwort.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(antwort.headers.get('Access-Control-Allow-Methods') ?? '').toContain('POST');
  });
});

describe('Die Antwort selbst', () => {
  it('trägt die Köpfe auch im FEHLERFALL', async () => {
    /*
      Der wichtigere Fall von beiden. Ohne die Köpfe an der Fehlerantwort
      sieht der Benutzer bei jedem 403 und jedem 409 wieder „es kam nichts
      an" statt „Zu dieser Adresse gibt es schon ein Konto" — die Begründung
      wäre da und käme nie an.
    */
    const antwort = await mitCors(async () =>
      new Response(JSON.stringify({ error: 'Zu petra@perl.at gibt es schon ein Konto.' }), {
        status: 409, headers: { 'Content-Type': 'application/json' },
      }),
    )(new Request('http://x/f', { method: 'POST' }));

    expect(antwort.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(antwort.status).toBe(409);
    expect(await antwort.json()).toEqual({
      error: 'Zu petra@perl.at gibt es schon ein Konto.',
    });
  });

  it('lässt Statuscode, Rumpf und eigene Köpfe unberührt', async () => {
    const antwort = await mitCors(async () =>
      new Response(JSON.stringify({ uid: 'abc' }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'X-Eigen': 'bleibt' },
      }),
    )(new Request('http://x/f', { method: 'POST' }));

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('X-Eigen')).toBe('bleibt');
    expect(antwort.headers.get('Content-Type')).toBe('application/json');
    expect(await antwort.json()).toEqual({ uid: 'abc' });
  });
});

/**
 * DIE STOLPERSCHNUR — und sie liest die Liste, statt sie zu führen.
 *
 * Eine abgeschriebene Liste der Functions, die der Browser ruft, wäre beim
 * nächsten Mal veraltet: wer eine vierte hinzufügt, denkt an diese Datei
 * nicht. Die Namen kommen deshalb aus dem Quelltext der App selbst — aus den
 * Aufrufen `functions.invoke('…')`. Wer eine ruft, steht damit automatisch
 * hier, ob er will oder nicht.
 */
function vomBrowserGerufen(): string[] {
  const namen = new Set<string>();
  const durchgehen = (verzeichnis: string) => {
    for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
      const pfad = resolve(verzeichnis, eintrag.name);
      if (eintrag.isDirectory()) durchgehen(pfad);
      else if (/\.tsx?$/.test(eintrag.name)) {
        const text = readFileSync(pfad, 'utf8');
        for (const t of text.matchAll(/functions\.invoke\(\s*['"]([^'"]+)['"]/g)) namen.add(t[1]);
      }
    }
  };
  durchgehen(resolve(process.cwd(), 'src'));
  return [...namen].sort();
}

describe('Jede Function, die der Browser ruft', () => {
  const gerufen = vomBrowserGerufen();

  it('wird überhaupt gefunden — sonst prüft der Rest nichts', () => {
    // Ohne diese Zeile wäre eine kaputte Suche eine grüne Prüfung über eine
    // leere Liste. Genau die Sorte, die hier schon einmal danebenstand.
    expect(gerufen.length).toBeGreaterThanOrEqual(3);
  });

  it.each(vomBrowserGerufen())('beantwortet den Vorabflug: %s', (name) => {
    const pfad = resolve(process.cwd(), 'supabase/functions', name, 'index.ts');
    expect(existsSync(pfad), `${name} wird gerufen, liegt aber nicht in supabase/functions`).toBe(true);

    const quelle = readFileSync(pfad, 'utf8');
    expect(quelle, `${name} umhüllt seinen Ablauf nicht mit mitCors`).toContain(
      'Deno.serve(mitCors(',
    );
  });
});
