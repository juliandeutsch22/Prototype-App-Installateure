import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { getPrefs, savePrefs, PREFS_DEFAULTS } from '@/lib/db/prefs';
import { getPushState, enablePush, disablePush, type PushState } from '@/lib/push';
import { canProcessOrders, isGF, isMitarbeiter } from '@/lib/permissions';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { CheckboxField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';

/** Was der Zustand für den Nutzer bedeutet — in seinen Worten, nicht in Fehlercodes. */
const PUSH_TEXT: Record<PushState, { text: string; ton: 'ok' | 'hinweis' | 'aus' }> = {
  bereit: { text: 'Dieses Gerät ist angemeldet und bekommt Meldungen.', ton: 'ok' },
  aus: { text: 'Dieses Gerät bekommt noch keine Meldungen.', ton: 'aus' },
  blockiert: {
    text:
      'Benachrichtigungen wurden für diese Seite abgelehnt. Das lässt sich nur in den ' +
      'Browsereinstellungen wieder erlauben — in der Adresszeile auf das Schloss tippen.',
    ton: 'hinweis',
  },
  'nicht-unterstuetzt': {
    text: 'Dieser Browser kann keine Push-Benachrichtigungen anzeigen.',
    ton: 'hinweis',
  },
  'ios-installation-noetig': {
    text:
      'Auf dem iPhone gibt es Benachrichtigungen nur, wenn die App zum Home-Bildschirm ' +
      'hinzugefügt wurde: in Safari auf „Teilen" und dann „Zum Home-Bildschirm".',
    ton: 'hinweis',
  },
  'nicht-konfiguriert': {
    text: 'Für diesen Betrieb ist der Push-Dienst noch nicht eingerichtet.',
    ton: 'hinweis',
  },
};

/**
 * Persönliche Benachrichtigungen. Jeder stellt für sich ein, was er bekommen
 * will — die Geschäftsführung entscheidet über Sätze, nicht über das Telefon
 * ihrer Monteure.
 *
 * Bewusst zwei getrennte Ebenen: WAS jemand bekommen will (gilt für ihn
 * überall) und OB dieses Gerät Meldungen anzeigt (gilt nur hier). Wer das
 * Telefon wechselt, verliert sonst unbemerkt seine Meldungen.
 */
export default function NotificationSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const [newOrder, setNewOrder] = useState(PREFS_DEFAULTS.notifyNewOrder ?? true);
  const [orderReady, setOrderReady] = useState(PREFS_DEFAULTS.notifyOrderReady ?? true);
  const [push, setPush] = useState<PushState>('aus');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wer Anforderungen bearbeitet, ist der Empfänger der Eingangsmeldung;
  // wer selbst anfordert, der der Abholmeldung. Beides zu zeigen, wenn nur
  // eines zutrifft, wäre Ballast.
  const zeigeNeueAnforderung = user ? canProcessOrders(user.role) || isGF(user.role) : false;
  const zeigeAbholbereit = user ? isMitarbeiter(user.role) : false;

  useEffect(() => {
    if (!user) return;
    getPrefs(user.uid)
      .then((p) => {
        if (!p) return;
        setNewOrder(p.notifyNewOrder ?? true);
        setOrderReady(p.notifyOrderReady ?? true);
      })
      .catch(() => undefined);
    getPushState().then(setPush).catch(() => undefined);
  }, [user]);

  async function speichern(next: { notifyNewOrder: boolean; notifyOrderReady: boolean }) {
    if (!user) return;
    setNewOrder(next.notifyNewOrder);
    setOrderReady(next.notifyOrderReady);
    try {
      await savePrefs(user.companyId, user.uid, next);
    } catch {
      setError('Die Einstellung konnte nicht gespeichert werden.');
    }
  }

  async function geraetAnmelden() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const token = await enablePush(user.companyId, user.uid);
      const state = await getPushState();
      setPush(state);
      if (token) toast.success('Dieses Gerät bekommt jetzt Meldungen');
      else if (state === 'blockiert') setError(PUSH_TEXT.blockiert.text);
      else setError('Das Gerät konnte nicht angemeldet werden.');
    } catch {
      setError('Das Gerät konnte nicht angemeldet werden.');
    } finally {
      setBusy(false);
    }
  }

  async function geraetAbmelden() {
    if (!user) return;
    setBusy(true);
    try {
      await disablePush(user.uid);
      setPush(await getPushState());
      toast.success('Dieses Gerät bekommt keine Meldungen mehr');
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  const zustand = PUSH_TEXT[push];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benachrichtigungen"
        subtitle="Was du bekommen möchtest — und auf welchem Gerät"
      />

      <Card title="Wovon möchtest du erfahren?">
        <div className="space-y-1">
          {zeigeNeueAnforderung && (
            <CheckboxField
              id="n-new-order"
              label="Eine neue Materialanforderung geht ein"
              checked={newOrder}
              onChange={(e) =>
                void speichern({ notifyNewOrder: e.target.checked, notifyOrderReady: orderReady })
              }
            />
          )}
          {zeigeAbholbereit && (
            <CheckboxField
              id="n-order-ready"
              label="Mein angefordertes Material ist abholbereit"
              checked={orderReady}
              onChange={(e) =>
                void speichern({ notifyNewOrder: newOrder, notifyOrderReady: e.target.checked })
              }
            />
          )}
          {!zeigeNeueAnforderung && !zeigeAbholbereit && (
            <p className="text-ink-muted">
              Für deine Rolle gibt es derzeit keine Benachrichtigungen.
            </p>
          )}
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          Die Auswahl gilt für dich auf allen Geräten und wird sofort gespeichert.
        </p>
      </Card>

      <Card title="Dieses Gerät">
        <p
          className={
            zustand.ton === 'ok'
              ? 'font-medium text-success'
              : zustand.ton === 'hinweis'
                ? 'text-warning'
                : 'text-ink-muted'
          }
        >
          {zustand.text}
        </p>

        {(push === 'aus' || push === 'bereit') && (
          <div className="mt-4">
            {push === 'bereit' ? (
              <Button variant="ghost" loading={busy} onClick={() => void geraetAbmelden()}>
                Auf diesem Gerät abschalten
              </Button>
            ) : (
              <Button loading={busy} onClick={() => void geraetAnmelden()}>
                Auf diesem Gerät einschalten
              </Button>
            )}
          </div>
        )}

        <p className="mt-3 text-sm text-ink-muted">
          Jedes Gerät meldet sich einzeln an — Telefon und Rechner getrennt. Das ist Absicht:
          so entscheidest du, wo dich eine Meldung erreicht.
        </p>

        {error && (
          <div className="mt-3">
            <ErrorState message={error} />
          </div>
        )}
      </Card>
    </div>
  );
}
