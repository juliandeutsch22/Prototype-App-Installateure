import { useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { unterseitenFuer } from '@/app/navigation';
import { isTopLevel } from '@/lib/permissions';
import { uidFehler } from '@/lib/uid';
import { ibanFehler } from '@shared/iban';
import type { Company } from '@/types';
import Card from '@/components/Card';
import PageHeader from '@/components/PageHeader';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { Zustand, type Stand } from '@/components/Badge';
import { EmptyState } from '@/components/States';

/**
 * DIE ÜBERSICHT DER EINSTELLUNGEN (Protokoll E9: „eine Seite mit Abschnitten,
 * Suche und Einrichtungsstand“).
 *
 * WARUM EINE ÜBERSICHT UND NICHT ALLES AUF EINER SEITE. Die Unterseiten
 * bleiben eigene Adressen (`/settings/<teil>`): sie stehen in Lesezeichen und
 * verschickten Meldungen, laden erst beim Öffnen und haben je eigene
 * Speichern-Knöpfe. Zehn Formulare untereinander wären 8 000 px am Telefon.
 * Die Übersicht beantwortet die beiden Fragen davor: „wo steht das?“ (Suche)
 * und „was fehlt noch?“ (Einrichtungsstand).
 *
 * WAS SIE ZEIGT, ENTSCHEIDET `navigation.ts` — dieselbe Liste, aus der die
 * Reiter entstehen. Eine Rolle sieht hier genau die Unterseiten, die sie
 * öffnen darf, nicht mehr.
 *
 * DER EINRICHTUNGSSTAND KOMMT NUR AUS DEM BETRIEB, der ohnehin geladen ist.
 * Kostensätze, Kontenrahmen, Basiszinssatz und Sicherung liegen in eigenen
 * Tabellen; sie hier zu laden hiesse vier Anfragen bei jedem Öffnen — und
 * eine Übersicht, die langsamer ist als die Seiten, die sie zeigt.
 */

/** Wonach jemand sucht, der die Unterseite meint — die Wörter ihrer Felder. */
const STICHWORTE: Record<string, string> = {
  meldungen: 'Benachrichtigungen, dieses Gerät, Zwei-Faktor-Anmeldung, Passwort',
  firma: 'Briefkopf, Anschrift, Logo, UID, Firmenbuch, IBAN, BIC, Bank, Farben',
  saetze: 'Stundensätze, Einstufung, Zuschläge, Nacht, Notdienst, Kostensätze, Materialaufschlag, Verkaufspreise',
  rechnung: 'Umsatzsteuer, Zahlungsziel, Skonto, Mahnspesen, Basiszinssatz, Anzahlungs- und Schlussrechnungen',
  nummern: 'Rechnungsnummer, Angebotsnummer, Baustellennummer, Kennzeichen des Fuhrparks',
  personal:
    'Urlaubsjahr, Übertrag, Verfallstag, Urlaub genehmigen, Wochenplan, Einsatzplan, Kalender-Abo, 24. und 31. Dezember, Nachtzeit, Überstunden, Sonderurlaub',
  konten: 'BMD, Debitoren, Anzahlungen, Erlöskonten, Steuercodes, Bankkonto, Skonti',
  support: 'Einblick gewähren, Support, bisherige Zugänge',
  module: 'Bereiche ein- und ausschalten',
  sicherung: 'Nächtliche Sicherung, Daten herunterladen, Belegarchiv',
};

export interface Einrichtungspunkt {
  titel: string;
  pfad: string;
  stand: Stand;
  wort: string;
  info: string;
}

/**
 * Was am Betrieb für Belege fehlt oder falsch ist — nur aus `company`.
 * Ausgelagert, damit es sich ohne Oberfläche prüfen lässt.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function einrichtungsstand(c: Company | null | undefined): Einrichtungspunkt[] {
  const anschrift = !!(c?.strasse || c?.addressLine) && !!c?.plz && !!c?.ort;
  const uid = (c?.vatId ?? '').trim();
  const uidFalsch = uid ? uidFehler(uid) : null;
  const iban = (c?.iban ?? '').trim();
  const ibanFalsch = iban ? ibanFehler(iban) : null;
  return [
    {
      titel: 'Briefkopf',
      pfad: 'firma',
      ...(c?.name?.trim() && anschrift
        ? { stand: 'ruht' as Stand, wort: 'erledigt', info: 'Firmenname und Anschrift' }
        : { stand: 'achtung' as Stand, wort: 'offen', info: 'Firmenname oder Anschrift fehlt — sie stehen auf jedem Beleg' }),
    },
    {
      titel: 'UID-Nummer',
      pfad: 'firma',
      ...(uidFalsch
        ? { stand: 'schlecht' as Stand, wort: 'prüfen', info: uidFalsch }
        : uid
          ? { stand: 'ruht' as Stand, wort: 'erledigt', info: uid }
          : { stand: 'achtung' as Stand, wort: 'offen', info: 'Keine UID hinterlegt — nötig, sobald der Betrieb eine hat' }),
    },
    {
      titel: 'Bankverbindung',
      pfad: 'firma',
      ...(ibanFalsch
        ? { stand: 'schlecht' as Stand, wort: 'prüfen', info: ibanFalsch }
        : iban
          ? { stand: 'ruht' as Stand, wort: 'erledigt', info: 'IBAN steht im Zahlungshinweis' }
          : { stand: 'achtung' as Stand, wort: 'offen', info: 'Keine IBAN — Rechnungen tragen sonst keinen Zahlungshinweis' }),
    },
  ];
}

export default function EinstellungenUebersicht() {
  const { user, company } = useAuth();
  const [suche, setSuche] = useState('');

  const seiten = useMemo(
    () =>
      user
        ? unterseitenFuer('/settings', user.role, { wochenplanFuerAlle: !!company?.wochenplanFuerAlle }).filter(
            (s) => s.pfad !== 'uebersicht',
          )
        : [],
    [user, company?.wochenplanFuerAlle],
  );

  const treffer = useMemo(() => {
    const q = suche.trim().toLocaleLowerCase('de');
    if (!q) return seiten;
    return seiten.filter((s) =>
      `${s.label} ${STICHWORTE[s.pfad] ?? ''}`.toLocaleLowerCase('de').includes(q),
    );
  }, [seiten, suche]);

  if (!user) return null;

  // Den Briefkopf pflegt die Spitze; nur sie bekommt den Stand dazu angezeigt.
  const darfFirma = isTopLevel(user.role) && seiten.some((s) => s.pfad === 'firma');
  const stand = darfFirma ? einrichtungsstand(company) : [];
  const erledigt = stand.filter((p) => p.stand === 'ruht').length;

  return (
    <div className="space-y-6">
      <PageHeader ort="Betrieb" title="Einstellungen" subtitle="Was den Betrieb einrichtet — und dein Konto" />

      <div className="formular">
        <InputField
          id="einstellung-suche"
          label="Einstellung suchen"
          type="search"
          placeholder="z. B. Skonto, IBAN, Urlaubsjahr"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
      </div>

      {stand.length > 0 && !suche.trim() && (
        <Card
          title="Einrichtungsstand"
          action={<span className="einrichtung-zahl">{erledigt} von {stand.length} erledigt</span>}
          buendig
        >
          <List>
            {stand.map((p) => (
              <ListRow
                key={p.titel}
                to={`/settings/${p.pfad}`}
                title={p.titel}
                subtitle={p.info}
                zustand={<Zustand stand={p.stand}>{p.wort}</Zustand>}
                pfeil
              />
            ))}
          </List>
        </Card>
      )}

      <Card title={suche.trim() ? `Treffer (${treffer.length})` : 'Alle Einstellungen'} buendig>
        {treffer.length === 0 ? (
          <EmptyState>Keine Einstellung passt zu „{suche.trim()}“.</EmptyState>
        ) : (
          <List>
            {treffer.map((s) => (
              <ListRow key={s.pfad} to={`/settings/${s.pfad}`} title={s.label} subtitle={STICHWORTE[s.pfad]} pfeil />
            ))}
          </List>
        )}
      </Card>
    </div>
  );
}
