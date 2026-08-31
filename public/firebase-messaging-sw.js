/*
 * Service Worker für Push-Benachrichtigungen.
 *
 * Läuft außerhalb der App und kennt deshalb weder die Build-Variablen noch
 * das Bundle. Die Projektkonfiguration kommt über die Query der
 * Registrierung (siehe src/lib/push.ts) — sie ist nicht geheim, sie steht
 * ohnehin im ausgelieferten JavaScript.
 *
 * Zuständig ist er nur für Meldungen, die eintreffen, während die App
 * geschlossen ist. Ist sie offen, übernimmt der Vordergrund-Handler.
 */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);

firebase.initializeApp({
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body, link } = payload.data ?? {};
  self.registration.showNotification(title || 'Perl Zeiterfassung', {
    body: body || '',
    icon: '/icon-192.png',
    badge: '/favicon-64.png',
    // Gleiche Kennung = die neue Meldung ersetzt die alte. Fünf Anforderungen
    // hintereinander sollen nicht fünf Einträge im Sperrbildschirm sein.
    tag: payload.data?.tag || 'perl-allgemein',
    data: { link: link || '/' },
  });
});

// Tippen öffnet die App an der passenden Stelle — und holt ein bereits
// offenes Fenster nach vorn, statt ein zweites zu öffnen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
