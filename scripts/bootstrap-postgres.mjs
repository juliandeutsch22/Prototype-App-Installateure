// Erstanlage im Postgres-Projekt — Betrieb, erster Zugang, Plattformverwalter.
//
// WARUM ES DIESES SKRIPT BRAUCHT: Henne und Ei, zweimal übereinander.
//
//   Einen Betrieb legt die Edge Function `betrieb-anlegen` an. Sie lässt nur
//   herein, wer in `platform_admins` steht.
//   In `platform_admins` trägt niemanden die App ein — die Tabelle hat
//   absichtlich keine einzige Richtlinie; sie wird ausschliesslich
//   serverseitig beschrieben.
//
// Beim allerersten Mal gibt es also weder einen Betrieb noch jemanden, der
// einen anlegen dürfte. Dieses Skript durchbricht den Ring genau einmal, mit
// dem Dienstschlüssel — und zwar über DIESELBE Datenbankfunktion, die auch
// die Edge Function ruft. Zwei Wege, einen Betrieb anzulegen, wären zwei
// Fassungen derselben Vorgabewerte: Stundensätze, Zuschläge, Steuersatz,
// Zahlungsziel. Sie liefen auseinander, und bemerkt würde es auf einer
// Rechnung.
//
// ES SETZT BEWUSST KEIN PASSWORT UND GIBT KEINEN LINK AUS. Der Zugang wird
// über „Passwort vergessen?" auf dem Anmeldebildschirm freigeschaltet. So
// läuft kein Geheimnis durch ein Protokoll, das später jeder mit Repo- oder
// Terminalzugriff liest.
//
// ZWEI KONTEN, NICHT EINES. Ein Plattformverwalter gehört zu keinem Betrieb —
// das setzt die Datenbank durch, nicht nur die Absicht: gäbe es für dieselbe
// Kennung beides, entschiede allein die Reihenfolge zweier Trigger, ob am Ende
// ein Plattformkonto oder ein Konto MIT Betrieb dasteht. Mit einem Betrieb im
// Token greift jede Leseregel; ein Zufall entschiede also über Leserechte an
// fremden Kundendaten. Deshalb bekommt der Plattformverwalter eine eigene
// Adresse, oder es gibt vorerst keinen.
//
// Aufruf:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_KEY=<Schlüssel aus Project Settings → API Keys> \
//   ADMIN_EMAIL=... ADMIN_NAME=... COMPANY_NAME=... COMPANY_ID=... \
//   [PLATTFORM_EMAIL=... PLATTFORM_NAME=...] \
//   node scripts/bootstrap-postgres.mjs
//
// Mehrfach ausführbar: ein bestehender Betrieb und bestehende Konten werden
// erkannt und nicht überschrieben.

const basis = (process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const schluessel = (
  process.env.SUPABASE_SERVICE_KEY
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? process.env.SUPABASE_SECRET_KEY
  ?? ''
).trim();
const email = (process.env.ADMIN_EMAIL ?? '').trim();
const name = (process.env.ADMIN_NAME ?? '').trim() || 'Administrator';
const betriebName = (process.env.COMPANY_NAME ?? '').trim() || 'Perl Installationen GmbH';
const kennung = (process.env.COMPANY_ID ?? '').trim() || 'perl';
const plattformEmail = (process.env.PLATTFORM_EMAIL ?? '').trim();
const plattformName = (process.env.PLATTFORM_NAME ?? '').trim() || 'Plattformverwaltung';

function abbruch(text) {
  console.error(`FEHLER: ${text}`);
  process.exit(1);
}

if (!basis) abbruch('SUPABASE_URL fehlt.');
if (!schluessel) abbruch('SUPABASE_SERVICE_KEY fehlt (Project Settings → API Keys).');
// Eine Adresse ohne @ nimmt der Anmeldedienst ohnehin nicht an — hier
// scheitern heisst, mit einer klaren Meldung zu scheitern.
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  abbruch(`"${email}" ist keine gültige E-Mail-Adresse (fehlt das @?).`);
}
if (!/^[a-z0-9-]{2,40}$/.test(kennung)) {
  abbruch(`Die Kennung "${kennung}" taugt nicht: erlaubt sind 2–40 Zeichen aus a–z, 0–9 und -.`);
}
if (plattformEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(plattformEmail)) {
  abbruch(`"${plattformEmail}" ist keine gültige E-Mail-Adresse.`);
}
if (plattformEmail && plattformEmail.toLowerCase() === email.toLowerCase()) {
  abbruch('PLATTFORM_EMAIL und ADMIN_EMAIL müssen verschieden sein: ein Plattformkonto '
    + 'gehört zu keinem Betrieb, und die Datenbank weist die zweite Rolle ab.');
}

/*
  EIN NEUER SCHLÜSSEL IST KEIN JWT, und das Tor prüft alles im
  `Authorization`-Kopf als eines. Ein `sb_secret_…` gehört deshalb nur in
  `apikey` — dieselbe Regel wie in `shared/dienstSchluessel.ts` und in den
  Anstossfunktionen der Datenbank.
*/
const istJwt = schluessel.split('.').length === 3
  && schluessel.split('.').every((t) => t.length > 0);
const kopf = {
  apikey: schluessel,
  'Content-Type': 'application/json',
  ...(istJwt ? { Authorization: `Bearer ${schluessel}` } : {}),
};

async function ruf(pfad, eigenschaften = {}) {
  const antwort = await fetch(`${basis}${pfad}`, { headers: kopf, ...eigenschaften });
  const text = await antwort.text();
  let inhalt;
  try { inhalt = text ? JSON.parse(text) : null; } catch { inhalt = text; }
  return { ok: antwort.ok, status: antwort.status, inhalt };
}

/** Das Konto zu dieser Adresse — oder `null`, wenn es keines gibt. */
async function kontoSuchen(adresse) {
  const { ok, inhalt } = await ruf(
    `/auth/v1/admin/users?page=1&per_page=200&filter=${encodeURIComponent(adresse)}`,
  );
  if (!ok) return null;
  const liste = Array.isArray(inhalt?.users) ? inhalt.users : [];
  return liste.find((n) => String(n.email).toLowerCase() === adresse.toLowerCase()) ?? null;
}

/** Ein Anmeldekonto anlegen — oder das bestehende nehmen. */
async function kontoSichern(adresse, anzeigename) {
  const vorhanden = await kontoSuchen(adresse);
  if (vorhanden) return { konto: vorhanden, neu: false };

  /*
    EIN ZUFALLSPASSWORT, DAS NIEMAND ERFÄHRT. Ein Konto ganz ohne Passwort hat
    keinen Passwort-Anbieter, und für ein solches lässt sich kein Rücksetzlink
    erzeugen — der erste Zugang käme nie hinein. Gesetzt wird es gleich darauf
    von ihm selbst.
  */
  const angelegt = await ruf('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: adresse,
      email_confirm: false,
      user_metadata: { name: anzeigename },
      password: `${crypto.randomUUID()}-Aa1!`,
    }),
  });
  if (!angelegt.ok) {
    abbruch(`Das Konto für ${adresse} liess sich nicht anlegen (${angelegt.status}): `
      + JSON.stringify(angelegt.inhalt));
  }
  return { konto: angelegt.inhalt, neu: true };
}

async function main() {
  console.log(`Projekt : ${basis}`);
  console.log(`Betrieb : ${betriebName} (${kennung})`);
  console.log(`Zugang  : ${email} als Administrator`);
  console.log('');

  const vorhanden = await ruf(
    `/rest/v1/companies?select=id&id=eq.${encodeURIComponent(kennung)}`,
  );
  if (!vorhanden.ok) {
    abbruch(`Das Projekt antwortet nicht wie erwartet (${vorhanden.status}). `
      + 'Stimmen SUPABASE_URL und der Schlüssel?');
  }
  const betriebSteht = Array.isArray(vorhanden.inhalt) && vorhanden.inhalt.length > 0;

  const { konto, neu } = await kontoSichern(email, name);
  console.log(neu ? `• Konto angelegt (${konto.id}).` : `• Konto besteht bereits (${konto.id}).`);

  if (betriebSteht) {
    console.log(`• Betrieb „${kennung}" besteht bereits — Stammdaten bleiben unangetastet.`);
  } else {
    const angelegt = await ruf('/rest/v1/rpc/betrieb_anlegen', {
      method: 'POST',
      body: JSON.stringify({
        p_kennung: kennung,
        p_name: betriebName,
        p_admin_uid: konto.id,
        p_admin_name: name,
        p_admin_email: email,
        /*
          Angelegt hat ihn niemand aus der Plattformverwaltung — es gab noch
          keine. Eingetragen wird deshalb das Konto selbst; so steht in
          `betriebsanlagen` eine wahre Angabe statt einer erfundenen.
        */
        p_angelegt_von: konto.id,
      }),
    });
    if (!angelegt.ok) {
      abbruch(`Der Betrieb liess sich nicht anlegen (${angelegt.status}): `
        + JSON.stringify(angelegt.inhalt));
    }
    console.log(`• Betrieb angelegt (${kennung}).`);
  }

  /*
    DER PLATTFORMVERWALTER KOMMT ZULETZT — und nur, wenn Betrieb und Zugang
    stehen. Wäre es umgekehrt, bliebe bei einem Abbruch ein Konto mit
    Plattformrechten und ohne Betrieb zurück; das ist der gefährlichere Rest.
  */
  if (!plattformEmail) {
    console.log('• Kein Plattformverwalter angelegt (PLATTFORM_EMAIL nicht gesetzt).');
  } else {
    const { konto: verwalterKonto, neu: verwalterNeu } =
      await kontoSichern(plattformEmail, plattformName);
    console.log(verwalterNeu
      ? `• Plattformkonto angelegt (${verwalterKonto.id}).`
      : `• Plattformkonto besteht bereits (${verwalterKonto.id}).`);

    const steht = await ruf(`/rest/v1/platform_admins?select=id&id=eq.${verwalterKonto.id}`);
    if (Array.isArray(steht.inhalt) && steht.inhalt.length > 0) {
      console.log('• Steht bereits in der Plattformverwaltung.');
    } else {
      const eingetragen = await ruf('/rest/v1/platform_admins', {
        method: 'POST',
        body: JSON.stringify({ id: verwalterKonto.id, name: plattformName }),
      });
      if (!eingetragen.ok) {
        abbruch(`Die Plattformverwaltung liess sich nicht eintragen (${eingetragen.status}): `
          + JSON.stringify(eingetragen.inhalt));
      }
      console.log('• In die Plattformverwaltung eingetragen.');
    }
  }

  console.log('');
  console.log('Fertig. Weiter geht es auf dem Anmeldebildschirm:');
  console.log(`  „Passwort vergessen?" mit ${email} — damit wird der Zugang freigeschaltet.`);
  if (plattformEmail) console.log(`  Dasselbe für ${plattformEmail}.`);
  console.log('Ein Link wird hier absichtlich nicht ausgegeben: er wäre ein Geheimnis');
  console.log('in einem Protokoll, und das Protokoll überlebt ihn.');
  if (!plattformEmail) {
    console.log('');
    console.log('Ohne Plattformverwalter lässt sich über die App kein WEITERER Betrieb');
    console.log('anlegen. Für einen einzelnen Betrieb ist das in Ordnung; sonst das');
    console.log('Skript noch einmal mit PLATTFORM_EMAIL laufen lassen.');
  }
}

main().catch((fehler) => abbruch(fehler instanceof Error ? fehler.message : String(fehler)));
