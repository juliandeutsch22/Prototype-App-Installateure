import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { isTopLevel } from '@/lib/permissions';
import { ladeLauf } from '@/lib/db/laeufe';
import { nutztPostgres } from '@/lib/db/quelle';
import { beurteile, type NachtLaufArt } from '@shared/laufStatus';

/**
 * Die Meldung, die einen ausgefallenen Nachtlauf sichtbar macht.
 *
 * WARUM AUF DER STARTSEITE. Der Zustand steht auch unter Einstellungen — aber
 * dorthin geht niemand, der nichts sucht. Eine Überwachung, die man aufrufen
 * muss, ist keine: sie meldet erst, wenn man ohnehin schon nachsieht.
 *
 * SIE ERSCHEINT NUR, WENN ETWAS IST. Eine dauerhafte grüne Kachel „alles in
 * Ordnung" wäre nach zwei Wochen unsichtbar — und mit ihr die eine Meldung,
 * auf die es ankommt. Hier steht nichts, solange nichts ist.
 *
 * NUR FÜR DIE LEITUNG. Der Monteur kann an einer ausgefallenen Sicherung
 * nichts ändern; eine Meldung auf seinem Telefon wäre eine Beunruhigung ohne
 * Handlungsmöglichkeit. Die Rules sehen das genauso — er darf den Zustand
 * gar nicht lesen.
 */

const WOHIN: Record<NachtLaufArt, { pfad: string; wort: string }> = {
  ausleitung: { pfad: '/settings/sicherung', wort: 'Zur Datensicherung' },
  bilanzen: { pfad: '/settings/saetze', wort: 'Zu den Monatsbilanzen' },
};

/**
 * Welche Läufe es in dieser Umgebung überhaupt GIBT.
 *
 * DER BILANZLAUF IST UNTER POSTGRES KEINER MEHR. In Firestore musste die
 * Monatsbilanz vorgerechnet und abgelegt werden — mit einem Trigger zum
 * Nachziehen und einem nächtlichen Lauf zum Ausgleichen. Unter Postgres ist
 * `monthly_stats` eine SICHT: sie rechnet bei jeder Abfrage neu, es gibt
 * nichts nachzuziehen und nichts auszugleichen, und deshalb steht für sie
 * auch kein Eintrag in `cron`.
 *
 * DIESE ZEILE FEHLTE, UND DAS WAR IM BETRIEB ZU SEHEN. Die Startseite fragte
 * weiter nach dem Bilanzlauf, bekam „noch nie durchgelaufen" — was stimmt,
 * weil es ihn nicht gibt — und meldete GF und Administration dauerhaft „Ein
 * nächtlicher Lauf steht aus". Der Weg, den sie dazu anbot, führte auf eine
 * Karte, die selbst erklärt, dass hier nichts anzustossen ist.
 *
 * Eine Warnung, die niemand abstellen kann, ist schlimmer als keine: sie
 * bringt einem bei, die Stelle zu übersehen, an der eines Tages die
 * ausgefallene SICHERUNG steht.
 *
 * Mit Stufe 9 fällt die Firestore-Seite weg und mit ihr diese Fallunterscheidung.
 *
 * ALS FUNKTION UND NICHT ALS KONSTANTE: eine Konstante läse die Umgebung
 * EINMAL beim Laden des Moduls. Das ist in der App dasselbe Ergebnis und im
 * Prüflauf ein anderes — dort entschiede die Reihenfolge der Importe darüber,
 * welcher Zweig überhaupt geprüft werden kann.
 */
function arten(): NachtLaufArt[] {
  return nutztPostgres() ? ['ausleitung'] : ['ausleitung', 'bilanzen'];
}

export default function LaufWarnung() {
  const { user } = useAuth();
  const [offen, setOffen] = useState<Array<{ art: NachtLaufArt; text: string }>>([]);

  /*
    AN DEN WERTEN, nicht am `user`-OBJEKT — sonst liefe der Effekt bei jedem
    Kontext neu, der einen frischen Wert liefert, und lüde in einer Schleife.
  */
  const companyId = user?.companyId;
  const rolle = user?.role;

  useEffect(() => {
    if (!companyId || !rolle || !isTopLevel(rolle)) return;
    let weg = false;
    void (async () => {
      /*
        NUR DIE NACHTLÄUFE, und der Typ hält das fest. Der Push-Versand hat
        keine Frist — er läuft, wenn es etwas zu melden gibt. Hier
        aufgenommen, stünde am ruhigen Wochenende „steht aus" über etwas, das
        gar nichts zu tun hatte.
      */
      const gemeldet: Array<{ art: NachtLaufArt; text: string }> = [];
      for (const art of arten()) {
        const u = beurteile(await ladeLauf(companyId, art), Date.now());
        // „Unbekannt" wird MITGEMELDET. Ein Betrieb ohne Aufzeichnung sieht
        // genauso aus wie einer, bei dem nie etwas lief — und beides heisst:
        // es gibt keine Sicherung, von der jemand weiss.
        if (u.stand !== 'gut') gemeldet.push({ art, text: u.text });
      }
      if (!weg) setOffen(gemeldet);
    })();
    return () => {
      weg = true;
    };
  }, [companyId, rolle]);

  if (offen.length === 0) return null;

  return (
    <div className="rounded border border-warning/40 bg-warning-bg p-4 text-warning" role="alert">
      <p className="font-semibold">
        {offen.length === 1 ? 'Ein nächtlicher Lauf steht aus' : 'Zwei nächtliche Läufe stehen aus'}
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {offen.map((o) => (
          <li key={o.art}>
            {o.text}{' '}
            <Link to={WOHIN[o.art].pfad} className="underline">
              {WOHIN[o.art].wort}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
