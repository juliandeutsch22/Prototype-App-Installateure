import type { AngebotLink } from '@/lib/db/angebotLinks';
import { datumAT } from '@/lib/datum';

/**
 * Der Annahme-Link eines Angebots (M02a, A06) — was das Büro dazu sieht und
 * verschickt.
 */

/** Die öffentliche Seite; der Schlüssel steht im Fragment (siehe `AngebotAnnahmeSeite`). */
export const ANNAHME_PFAD = '/angebot/annehmen';

/**
 * Die Adresse für den Kunden. Der Schlüssel steht hinter `#`: das Fragment
 * schickt kein Browser an einen Server — er landet weder im Protokoll der
 * Auslieferung noch im `Referer` einer anderen Seite.
 */
export function annahmeAdresse(herkunft: string, schluessel: string): string {
  return `${herkunft.replace(/\/+$/, '')}${ANNAHME_PFAD}#${schluessel}`;
}

/**
 * Bis wann der Link gilt, wenn niemand etwas anderes einträgt: bis zur
 * Bindefrist des Angebots, höchstens ein Jahr; liegt sie schon zurück, 30
 * Tage (wie `angebot_link_erzeugen`). `heute` als `JJJJ-MM-TT` in Wien.
 */
export function vorgabeGueltigBis(validUntil: string | undefined, heute: string): string {
  if (validUntil && validUntil >= heute) {
    const spaetestens = spaetestensGueltigBis(heute);
    return validUntil < spaetestens ? validUntil : spaetestens;
  }
  return tagPlus(heute, 30);
}

/** Der späteste Tag, den das Büro wählen kann — ein Jahr ab heute. */
export function spaetestensGueltigBis(heute: string): string {
  return tagPlus(heute, 365);
}

function tagPlus(tag: string, n: number): string {
  const d = new Date(`${tag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * „Per Mail-Programm senden“ — bis der Versand aus der App kommt (M14) ein
 * `mailto:` wie bei der Bestellung beim Lieferanten. Kurz genug für jedes
 * Mailprogramm: der Link ist 80 Zeichen, der Text eine Handvoll Zeilen.
 */
export function annahmeMail(o: {
  an?: string;
  angebotsnummer: string;
  firma: string;
  adresse: string;
  gueltigBis: string;
}): string {
  const betreff = `Angebot ${o.angebotsnummer} von ${o.firma}`;
  const text = [
    'Sehr geehrte Damen und Herren,',
    '',
    `unter diesem Link finden Sie unser Angebot ${o.angebotsnummer}. Dort können Sie es ansehen, als PDF speichern und mit Ihrer Unterschrift annehmen:`,
    '',
    o.adresse,
    '',
    `Der Link gilt bis ${datumAT(o.gueltigBis)}.`,
    '',
    'Mit freundlichen Grüßen',
    o.firma,
  ].join('\n');
  const an = (o.an ?? '').trim();
  // Das „@" bleibt lesbar: manche Mailprogramme lösen `%40` nicht auf (wie `bestellMail`).
  return `mailto:${encodeURIComponent(an).replace('%40', '@')}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}

/** Der Zustand in Worten fürs Büro — ein Satz, der sagt, was jetzt gilt. */
export function linkZustandText(l: AngebotLink): string {
  switch (l.zustand) {
    case 'offen':
      return `Offen bis ${datumAT(l.gueltigBis)}`;
    case 'angenommen':
      return `Angenommen von ${l.angenommenName ?? ''} am ${l.angenommenAm ? zeitpunkt(l.angenommenAm) : '–'}`;
    case 'abgelehnt':
      return `Abgelehnt von ${l.abgelehntName ?? ''} am ${l.abgelehntAm ? zeitpunkt(l.abgelehntAm) : '–'}`;
    case 'widerrufen':
      return `Widerrufen${l.widerrufenVonName ? ` von ${l.widerrufenVonName}` : ''} am ${l.widerrufenAm ? zeitpunkt(l.widerrufenAm) : '–'}`;
    case 'abgelaufen':
      return `Abgelaufen am ${datumAT(l.gueltigBis)}`;
    case 'gegenstandslos':
      return 'Gilt nicht mehr — das Angebot ist nicht mehr versendet oder eine andere Fassung ist angenommen';
    case 'geaendert':
      return 'Gilt nicht mehr — das Angebot wurde nach dem Erzeugen geändert';
  }
}

/** „Vom Kunden geöffnet …“ — erstes und letztes Mal, wie oft. */
export function oeffnenText(l: AngebotLink): string {
  if (!l.geoeffnetAnzahl || !l.zuerstGeoeffnetAm) return 'Noch nicht geöffnet';
  if (l.geoeffnetAnzahl === 1) return `Geöffnet am ${zeitpunkt(l.zuerstGeoeffnetAm)}`;
  return `Geöffnet ${l.geoeffnetAnzahl}-mal, zuerst am ${zeitpunkt(l.zuerstGeoeffnetAm)}, zuletzt am ${zeitpunkt(l.zuletztGeoeffnetAm ?? l.zuerstGeoeffnetAm)}`;
}

/** Tag und Uhrzeit in Wien: „06.11.2026, 14:05“. Die Annahme ist ein Nachweis — mit Uhrzeit. */
export function zeitpunkt(ms: number): string {
  return new Date(ms).toLocaleString('de-AT', {
    timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
