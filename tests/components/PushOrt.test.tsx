import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

/*
 * DAS FENSTER SAGT DEM WORKER, WO ES STEHT (E69). Die App wechselt Seiten
 * ohne Neuladen; die Adresse, die der Worker kennt, ist die vom Laden. Ohne
 * Antwort kam im Gespräch, in dem man gerade liest, trotzdem eine Meldung
 * (gemessen in Chromium). Gegenprobe: ohne den Zuhörer in `PushAnmeldung`
 * ist die Prüfung rot.
 */
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: null, einblick: null }) }));
const container = new EventTarget() as EventTarget & { startMessages: () => void };
container.startMessages = vi.fn();
Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });

const { default: PushAnmeldung } = await import('@/components/PushAnmeldung');

describe('PushAnmeldung — Ort für den Worker', () => {
  it('antwortet auf „ortGefragt“ mit dem aktuellen Pfad', async () => {
    window.history.pushState({}, '', '/nachrichten/k7');
    const { unmount } = render(<PushAnmeldung />);
    const kanal = new MessageChannel();
    const antwort = new Promise((fertig) => { kanal.port1.onmessage = (e) => fertig(e.data); });
    container.dispatchEvent(new MessageEvent('message', { data: 'ortGefragt', ports: [kanal.port2] }));
    expect(await antwort).toBe('/nachrichten/k7');
    expect(container.startMessages).toHaveBeenCalled();
    kanal.port1.close();
    unmount();
  });
});
