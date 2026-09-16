/**
 * Was in einer Sicherungsdatei steht — und ob man ihr trauen darf.
 *
 * WARUM DAS VOM SCHREIBEN GETRENNT IST. `ruecklauf.mjs` schreibt in eine
 * Datenbank; das ist das gefährlichste Werkzeug im ganzen Projekt. Alles,
 * was sich VOR dem ersten Schreibvorgang entscheiden lässt — ist die Datei
 * heil, gehört sie zu EINEM Betrieb, welcher ist es —, gehört hierher, wo es
 * ohne Datenbank geprüft werden kann.
 *
 * Eine halb eingelesene Sicherung ist schlimmer als gar keine: sie sieht aus
 * wie ein Wiederanlauf und ist ein Datensalat.
 */

/**
 * Die Zeilen einer `.jsonl`-Sicherung, nach Tabelle sortiert.
 *
 * STRENG BEIM LESEN. Eine kaputte Zeile wird NICHT übersprungen, sondern
 * gemeldet. Überspringen hiesse, aus einer beschädigten Datei stillschweigend
 * einen unvollständigen Betrieb zu bauen — und niemand wüsste, was fehlt.
 */
export function standLesen(text) {
  const sammlungen = new Map();
  const fehler = [];
  const zeilen = text.split('\n');

  zeilen.forEach((zeile, i) => {
    if (zeile.trim() === '') return;
    let satz;
    try {
      satz = JSON.parse(zeile);
    } catch {
      fehler.push(`Zeile ${i + 1}: kein gültiges JSON`);
      return;
    }
    if (typeof satz?.sammlung !== 'string' || satz.sammlung === '') {
      fehler.push(`Zeile ${i + 1}: ohne Tabellennamen`);
      return;
    }
    if (satz.daten === null || typeof satz.daten !== 'object' || Array.isArray(satz.daten)) {
      fehler.push(`Zeile ${i + 1}: ohne Datensatz`);
      return;
    }
    if (!sammlungen.has(satz.sammlung)) sammlungen.set(satz.sammlung, []);
    sammlungen.get(satz.sammlung).push(satz.daten);
  });

  return { sammlungen, fehler };
}

/**
 * Zu welchem Betrieb gehört dieser Stand?
 *
 * ZWEI DINGE, DIE HIER ABGEWIESEN WERDEN, und beide wären im Ernstfall teuer:
 *
 *   1. Eine Datei OHNE `companies`-Zeile. An der Firma hängen Stundensätze
 *      und Steuersatz; ein Wiederanlauf ohne sie rechnet ab dem ersten Tag
 *      falsch, und zwar unauffällig.
 *   2. Eine Datei mit MEHREREN Betrieben. Die Ausleitung schreibt je Betrieb
 *      eine Datei; kämen hier zwei vor, wäre entweder die Datei
 *      zusammengestückelt oder der Export kaputt. In eine fremde Datenbank
 *      zwei Betriebe zu kippen, von denen einer nicht hingehört, ist der
 *      Fehler, den man nicht mehr auseinandersortiert.
 */
export function betriebAusStand(sammlungen) {
  const firmen = sammlungen.get('companies') ?? [];
  if (firmen.length === 0) {
    throw new Error('Die Datei enthält keine Zeile aus `companies` — ohne die Firma kein Wiederanlauf.');
  }
  if (firmen.length > 1) {
    throw new Error(
      `Die Datei enthält ${firmen.length} Betriebe (${firmen.map((f) => f.id).join(', ')}). ` +
      'Eine Sicherung gehört zu genau einem.',
    );
  }
  const betrieb = firmen[0].id;
  if (typeof betrieb !== 'string' || betrieb === '') {
    throw new Error('Die Firmenzeile hat keine Kennung.');
  }

  const fremde = new Set();
  for (const [tabelle, zeilen] of sammlungen) {
    if (tabelle === 'companies') continue;
    for (const zeile of zeilen) {
      if ('company_id' in zeile && zeile.company_id !== betrieb) fremde.add(String(zeile.company_id));
    }
  }
  if (fremde.size > 0) {
    throw new Error(
      `Die Datei gehört zu „${betrieb}", enthält aber auch Zeilen von: ${[...fremde].join(', ')}.`,
    );
  }
  return betrieb;
}

/**
 * Die Anmeldekonten, die zum Stand gehören.
 *
 * WARUM DER RÜCKLAUF SIE ÜBERHAUPT ANFASSEN MUSS. `public.users.id` verweist
 * auf `auth.users(id)`. Die Anmeldekonten selbst tragen kein `company_id` und
 * fallen deshalb aus der Ausleitung heraus — sie stehen in der Sicherung
 * NICHT. Ohne sie lässt sich aber keine einzige Profilzeile einfügen, und
 * ohne Profilzeilen hängt der ganze Rest in der Luft.
 *
 * Die Konten werden deshalb aus den Profilen neu gebaut, unter DERSELBEN
 * Kennung. Damit lösen sich alle Fremdschlüssel der Sicherung wieder auf.
 *
 * WAS NICHT ZURÜCKKOMMT, IST DAS PASSWORT. Es steht als Hash in `auth.users`
 * und damit nicht in der Sicherung. Jeder wiederhergestellte Zugang braucht
 * einmal „Passwort vergessen" — das ist keine Lücke, sondern die Folge davon,
 * dass eine Sicherung keine Passwörter mitnimmt.
 *
 * NUR KENNUNG UND ADRESSE — DIE ANSPRÜCHE SETZT DIE DATENBANK.
 *
 * Erst stand hier auch `{ company_id, role, active }`, und der Rücklauf
 * schrieb das beim Anlegen des Kontos mit. Das war überflüssig und schlimmer
 * als überflüssig: der Auslöser `users_ansprueche` setzt diese Angaben aus
 * der Profilzeile, sobald sie eingefügt wird, und sperrt ein inaktives Konto
 * gleich mit. Zwei Quellen für dieselbe Wahrheit laufen irgendwann
 * auseinander — und die eine hier wäre die schlechtere gewesen, weil sie eine
 * Datei glaubt statt der Datenbank.
 *
 * Aufgefallen ist es an einer Mutation, die überlebt hat: die Ansprüche
 * wegzulassen änderte am Ergebnis nichts. Das war kein Loch in der Prüfung,
 * sondern eine Antwort.
 */
export function kontenAusStand(sammlungen) {
  return (sammlungen.get('users') ?? []).map((u) => ({ id: u.id, email: u.email }));
}
