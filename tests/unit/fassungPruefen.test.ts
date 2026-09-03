// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  andereFassungAufDemServer,
  fassungBeobachten,
  abstandZuruecksetzen,
} from '@/lib/fassungPruefen';
import { FASSUNG } from '@/lib/fassung';

/**
 * Der zweite Weg, einen Deploy zu bemerken — der ohne Service Worker.
 *
 * WARUM ES IHN BRAUCHT. Bisher hing das Erkennen allein am Worker: er
 * vergleicht die ausgelieferte `index.html` mit der gespeicherten. Das setzt
 * voraus, dass er selbst aktuell ist und sein Vergleich laeuft. Haengt er
 * fest — und genau das war die Ausgangslage auf dem Telefon —, erfaehrt die
 * App nie etwas, und niemand kann sagen, woran es liegt.
 *
 * Hier fragt die App SELBST beim Server nach.
 */

function antworte(text: string, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, text: async () => text }) as unknown as Response),
  );
}

beforeEach(() => {
  abstandZuruecksetzen();
  vi.unstubAllGlobals();
});

describe('Beim Server nachfragen', () => {
  it('erkennt eine andere Fassung', async () => {
    antworte('abc1234 · 01.01.2027, 08:00');
    expect(await andereFassungAufDemServer()).toBe(true);
  });

  it('meldet nichts, wenn es dieselbe ist', async () => {
    antworte(FASSUNG);
    expect(await andereFassungAufDemServer()).toBe(false);
  });

  it('haelt eine UMGELEITETE Startseite NICHT fuer eine neue Fassung', async () => {
    /**
     * DIE GEFAEHRLICHSTE STELLE DIESER DATEI. Firebase Hosting leitet mit
     * `"source": "**"` JEDE unbekannte Adresse auf `index.html` um — mit
     * Status 200. Fehlte `/fassung.txt`, kaeme also HTML zurueck, das nie
     * zur eigenen Kennung passt: die App hielte das fuer einen Deploy, lade
     * neu, faende wieder HTML — eine Schleife, die das Telefon unbrauchbar
     * macht.
     */
    antworte('<!doctype html><html lang="de"><head><title>Perl</title></head></html>');
    expect(await andereFassungAufDemServer()).toBeNull();
  });

  it('sagt „weiss nicht", statt ohne Netz etwas zu behaupten', async () => {
    // `null` ist ausdruecklich NICHT dasselbe wie „nein": wer beides gleich
    // behandelt, baut entweder eine Schleife oder eine App, die nie erfaehrt,
    // dass es etwas Neues gibt.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect(await andereFassungAufDemServer()).toBeNull();

    antworte('', false);
    expect(await andereFassungAufDemServer()).toBeNull();
  });

  it('fragt am Zwischenspeicher vorbei', async () => {
    // Sonst beantwortete der Browser die Frage aus demselben alten Bestand,
    // wegen dem sie ueberhaupt gestellt wird.
    const f = vi.fn(async () => ({ ok: true, text: async () => FASSUNG }) as unknown as Response);
    vi.stubGlobal('fetch', f);
    await andereFassungAufDemServer();
    expect(f).toHaveBeenCalledWith('/fassung.txt', { cache: 'no-store' });
  });
});

describe('Beobachten', () => {
  it('meldet sich beim Start, wenn der Server etwas Neues hat', async () => {
    antworte('abc1234 · 01.01.2027, 08:00');
    const gemeldet = vi.fn();
    const ab = fassungBeobachten(gemeldet);
    await vi.waitFor(() => expect(gemeldet).toHaveBeenCalledTimes(1));
    ab();
  });

  it('meldet sich NICHT, wenn es dieselbe Fassung ist', async () => {
    antworte(FASSUNG);
    const gemeldet = vi.fn();
    const ab = fassungBeobachten(gemeldet);
    await new Promise((r) => setTimeout(r, 20));
    expect(gemeldet).not.toHaveBeenCalled();
    ab();
  });

  it('fragt nicht bei jedem Wechsel in den Vordergrund erneut', async () => {
    // Auf dem Telefon wechselt eine App dutzende Male am Tag in den
    // Vordergrund. Jedes Mal eine Netzrunde waere Datenverbrauch ohne Ertrag.
    const f = vi.fn(async () => ({ ok: true, text: async () => FASSUNG }) as unknown as Response);
    vi.stubGlobal('fetch', f);
    const ab = fassungBeobachten(vi.fn());
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1));

    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(f).toHaveBeenCalledTimes(1);
    ab();
  });

  it('hoert nach dem Abmelden auf', async () => {
    const f = vi.fn(async () => ({ ok: true, text: async () => FASSUNG }) as unknown as Response);
    vi.stubGlobal('fetch', f);
    const ab = fassungBeobachten(vi.fn());
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    ab();
    abstandZuruecksetzen();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(f).toHaveBeenCalledTimes(1);
  });
});
