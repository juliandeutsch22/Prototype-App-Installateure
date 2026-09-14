/**
 * Einen Betrieb anlegen — der einzige Weg des globalen Administrators in die
 * Daten, und er schreibt ausschliesslich.
 *
 * WARUM DAS EINE EDGE FUNCTION IST UND SONST FAST NICHTS. Fast alles aus dem
 * alten Functions-Bestand ist beim Umzug zu SQL geworden; das hier nicht, und
 * der Grund ist handfest: ein ANMELDEKONTO entsteht im Anmeldedienst, nicht
 * in einer Tabelle. Sein Passwort wird dort gehasht, seine Kennung dort
 * vergeben, sein Rücksetzlink dort signiert. Von Hand in `auth.users` zu
 * schreiben hiesse, all das nachzubauen — und beim nächsten Update des
 * Dienstes wäre es falsch.
 *
 * WAS SIE DESHALB TUT und was nicht: sie legt das Konto an und ruft danach
 * `public.betrieb_anlegen` auf, die Firma, Administrator und Protokolleintrag
 * in EINER Transaktion schreibt. Ein Betrieb ohne Administrator wäre nicht zu
 * betreten und nicht zu reparieren — niemand könnte sich anmelden, um den
 * fehlenden anzulegen.
 *
 * DER DIENSTSCHLÜSSEL LIEGT HIER, NICHT IM BROWSER. Er hebelt den
 * Zeilenschutz vollständig aus; er kommt zur Laufzeit aus der Umgebung und
 * steht in keinem Bundle.
 *
 * OHNE FERNIMPORT, und das ist eine Entscheidung. Der naheliegende Weg wäre
 * `import { createClient } from 'jsr:@supabase/supabase-js'` gewesen — beim
 * ersten Anlauf scheiterte er hier am Netz. Geblieben ist er trotzdem nicht,
 * weil es sechs Aufrufe sind, die als `fetch` genauso kurz und deutlich
 * dastehen, und weil eine Function ohne Fernimport nichts nachzuladen hat:
 * sie startet auch dann, wenn die Registry gerade nicht erreichbar ist, und
 * zwischen zwei Auslieferungen verschiebt sich unter ihr nichts.
 */
import { betriebFehler, betriebNormalisiert, type NeuerBetrieb } from '../_shared/plattform.ts';
import {
  alleDienstSchluessel, dienstKopfzeilen, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
/*
  ALLE Schlüssel, die diese Umgebung kennt — gesprochen wird mit dem ersten,
  anerkannt wird jeder. Ein Projekt mitten in der Ablösung hat zwei, und
  welcher im Tresor liegt, entscheidet nicht diese Datei.
*/
const SCHLUESSEL = alleDienstSchluessel(Deno.env.toObject());
const DIENST = SCHLUESSEL[0] ?? null;

/*
  Die Köpfe, mit denen der Dienstschlüssel spricht. Fehlt er, sind sie leer —
  benutzt werden sie dann nie, weil die Function vorher mit 503 antwortet.
*/
const alsDienst = dienstKopfzeilen(DIENST);

function antwort(inhalt: unknown, status = 200): Response {
  return new Response(JSON.stringify(inhalt), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Ein Fehlschlag bekommt immer einen TEXT.
 *
 * Die Ansicht liest `error`; ein nackter 500er ohne Inhalt wäre für den
 * Aufrufer nicht von einem Netzwerkabbruch zu unterscheiden.
 */
const fehler = (text: string, status: number) => antwort({ error: text }, status);

/** Die Kennung hinter einem Anmeldetoken — geprüft vom Anmeldedienst. */
async function werRuftAn(token: string): Promise<string | null> {
  const r = await fetch(`${URL_BASIS}/auth/v1/user`, {
    headers: { apikey: DIENST ?? '', Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const nutzer = await r.json();
  return typeof nutzer?.id === 'string' ? nutzer.id : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fehler('Nur POST.', 405);

  /*
    WER RUFT AN. Das Token kommt im Kopf; geprüft wird es vom Anmeldedienst
    und nicht von uns — eine selbst nachgebaute Signaturprüfung wäre die
    schlechteste Stelle für einen eigenen Einfall.
  */
  // Ohne Dienstschlüssel kann diese Function weder ein Konto anlegen noch
  // die Plattformverwaltung nachschlagen. Sagt sie es nicht, sieht jeder
  // Anrufer stattdessen „Keine Anmeldung." und sucht bei sich.
  if (!DIENST) return fehler(SCHLUESSEL_FEHLT, 503);

  const kopf = req.headers.get('Authorization') ?? '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  const aufrufer = token ? await werRuftAn(token) : null;
  if (!aufrufer) return fehler('Keine Anmeldung.', 401);

  /*
    DIE TABELLE ENTSCHEIDET, NICHT DAS TOKEN.

    Im Token steht `plattform_admin`, gesetzt vom Trigger auf
    `platform_admins`. Ein bereits ausgestelltes Token trägt seinen Anspruch
    aber bis zu einer Stunde weiter — wer heute früh entzogen wurde, legte
    sonst noch bis Mittag Betriebe an. Gefragt wird deshalb die Tabelle, so
    wie `app.aktiv()` die Belegschaft fragt statt das Token.
  */
  const adminAntwort = await fetch(
    `${URL_BASIS}/rest/v1/platform_admins?id=eq.${aufrufer}&select=id`,
    { headers: alsDienst },
  );
  const admins = adminAntwort.ok ? await adminAntwort.json() : [];
  if (!Array.isArray(admins) || admins.length === 0) {
    return fehler('Nur der globale Administrator.', 403);
  }

  let eingabe: Partial<NeuerBetrieb>;
  try {
    eingabe = await req.json();
  } catch {
    return fehler('Die Anfrage enthält keine lesbaren Daten.', 400);
  }

  // Dieselbe Prüfung wie im Browser — dort, damit niemand ins Leere tippt,
  // hier, weil sie die einzige ist, die zählt.
  const beanstandung = betriebFehler(eingabe ?? {});
  if (beanstandung) return fehler(beanstandung, 400);
  const betrieb = betriebNormalisiert(eingabe as NeuerBetrieb);

  /*
    EINE BESTEHENDE ADRESSE WIRD ABGEWIESEN, NICHT WIEDERVERWENDET.

    Die Ansprüche hängen an der Anmeldekennung, nicht an der Zeile in der
    Belegschaft. Bekäme dieselbe Person eine zweite Zeile in einem zweiten
    Betrieb, entschiede allein die Reihenfolge der Trigger, in welchem sie
    landet — und sie stünde eines Morgens im falschen Betrieb, ohne dass
    jemand etwas geändert hätte. Ein Konto gehört zu einem Betrieb.
  */
  const kontoAntwort = await fetch(`${URL_BASIS}/auth/v1/admin/users`, {
    method: 'POST',
    headers: alsDienst,
    body: JSON.stringify({
      email: betrieb.adminEmail,
      email_confirm: false,
      user_metadata: { name: betrieb.adminName },
      /*
        EIN ZUFALLSPASSWORT, DAS NIEMAND ERFÄHRT. Ein Konto ganz ohne Passwort
        hat keinen Passwort-Anbieter, und für ein solches lässt sich kein
        Rücksetzlink erzeugen — der erste Administrator käme nie hinein.
        Gesetzt wird es gleich darauf von ihm selbst.
      */
      password: `${crypto.randomUUID()}-Aa1!`,
    }),
  });
  const konto = await kontoAntwort.json();

  if (!kontoAntwort.ok || typeof konto?.id !== 'string') {
    const text = String(konto?.msg ?? konto?.message ?? konto?.error_description ?? '');
    const schonDa = kontoAntwort.status === 422 || /already|registered|exists/i.test(text);
    return fehler(
      schonDa
        ? `Zu ${betrieb.adminEmail} gibt es schon ein Konto. Ein Konto gehört zu genau einem Betrieb — bitte eine andere Adresse verwenden.`
        : (text || 'Das Konto liess sich nicht anlegen.'),
      schonDa ? 409 : 500,
    );
  }

  const zeilen = await fetch(`${URL_BASIS}/rest/v1/rpc/betrieb_anlegen`, {
    method: 'POST',
    headers: alsDienst,
    body: JSON.stringify({
      p_kennung: betrieb.companyId,
      p_name: betrieb.name,
      p_admin_uid: konto.id,
      p_admin_name: betrieb.adminName,
      p_admin_email: betrieb.adminEmail,
      p_angelegt_von: aufrufer,
    }),
  });

  if (!zeilen.ok) {
    const grund = await zeilen.json().catch(() => ({}));
    const text = String(grund?.message ?? 'Der Betrieb liess sich nicht anlegen.');
    /*
      AUFRÄUMEN, WENN DIE DATENBANK NICHT MITSPIELT. Sonst bliebe ein
      Anmeldekonto ohne Betrieb zurück — und die nächste Anlage mit derselben
      Adresse scheiterte an genau diesem Rest, ohne dass irgendwo stünde,
      warum.
    */
    await fetch(`${URL_BASIS}/auth/v1/admin/users/${konto.id}`, {
      method: 'DELETE', headers: alsDienst,
    }).catch(() => undefined);
    return fehler(text, text.includes('vergeben') ? 409 : 500);
  }

  /*
    DER LINK KOMMT ZURÜCK, STATT VERSENDET ZU WERDEN.

    Der Betrieb versendet seine Post selbst, und eine Mailanbindung wäre ein
    weiterer Dienst mit einem weiteren Auftragsverarbeitungsvertrag. Der
    globale Administrator hat das Konto gerade selbst erzeugt — der Link gibt
    ihm nichts, was er nicht ohnehin schon hätte.
  */
  const linkAntwort = await fetch(`${URL_BASIS}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: alsDienst,
    body: JSON.stringify({ type: 'recovery', email: betrieb.adminEmail }),
  });
  const link = linkAntwort.ok ? await linkAntwort.json() : {};

  return antwort({
    companyId: betrieb.companyId,
    ersterAdminUid: konto.id,
    passwortLink: String(link?.action_link ?? ''),
  });
});
