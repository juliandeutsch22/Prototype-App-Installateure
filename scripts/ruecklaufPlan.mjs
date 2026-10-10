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

/** Die Kopfzeile eines Teils (`shared/ausleitungPlan.ts`, `TEIL_SAMMLUNG`). */
export const TEIL_SAMMLUNG = '_teil';

/**
 * Einen Stand aus einer oder mehreren Dateien lesen.
 *
 * SEIT 10.10.2026 KOMMT EIN GROSSER STAND IN TEILEN (`….jsonl`,
 * `….<lauf>.teil-2.jsonl`, …). Jeder Teil nennt in seiner Kopfzeile Lauf und
 * Nummer, der erste dazu die Zahl der Teile. Eingespielt wird nur, wenn ALLE
 * Teile EINES Laufs beisammen sind: ein fehlender Teil hiesse ein halber
 * Betrieb, einer aus einem anderen Lauf ein Datensalat — beides sähe aus wie
 * ein Wiederanlauf.
 *
 * Eine Sicherung von vorher hat keine Kopfzeile und ist immer eine Datei;
 * die wird gelesen wie bisher.
 *
 * `dateien`: `[{ name, text }]` in beliebiger Reihenfolge.
 */
export function staendeLesen(dateien) {
  const sammlungen = new Map();
  const fehler = [];
  const gelesen = dateien.map(({ name, text }) => {
    const stand = standLesen(text);
    for (const f of stand.fehler) fehler.push(dateien.length > 1 ? `${name}: ${f}` : f);
    const kopfzeilen = stand.sammlungen.get(TEIL_SAMMLUNG) ?? [];
    stand.sammlungen.delete(TEIL_SAMMLUNG);
    if (kopfzeilen.length > 1) fehler.push(`${name}: mehr als eine Kopfzeile`);
    return { name, kopf: kopfzeilen[0] ?? null, sammlungen: stand.sammlungen };
  });

  // In der Reihenfolge der Teile, damit jede Tabelle so dasteht wie geschrieben.
  const nachNummer = [...gelesen].sort((a, b) => (a.kopf?.nr ?? 0) - (b.kopf?.nr ?? 0));
  for (const teil of nachNummer) {
    for (const [tabelle, zeilen] of teil.sammlungen) {
      if (!sammlungen.has(tabelle)) sammlungen.set(tabelle, []);
      const ziel = sammlungen.get(tabelle);
      for (const z of zeilen) ziel.push(z);
    }
  }

  fehler.push(...teileFehler(gelesen));
  return { sammlungen, fehler };
}

/** Was an den Teilen nicht stimmt — leer, wenn sie zusammen genau einen Stand ergeben. */
function teileFehler(koepfe) {
  const ohne = koepfe.filter((k) => k.kopf === null).map((k) => k.name);
  if (ohne.length === koepfe.length) {
    return koepfe.length <= 1 ? [] : [
      `${koepfe.length} Dateien ohne Kopfzeile (${ohne.join(', ')}) — das sind keine Teile eines Stands. ` +
      'Eine Sicherung ohne Kopfzeile ist immer eine einzige Datei.',
    ];
  }
  if (ohne.length > 0) return [`Ohne Kopfzeile, also kein Teil dieses Stands: ${ohne.join(', ')}`];

  const fehler = [];
  for (const { name, kopf } of koepfe) {
    if (typeof kopf.lauf !== 'string' || kopf.lauf === '' || !Number.isInteger(kopf.nr) || kopf.nr < 1) {
      fehler.push(`${name}: die Kopfzeile ist unvollständig`);
    }
  }
  if (fehler.length > 0) return fehler;

  const erste = koepfe.filter((k) => k.kopf.nr === 1);
  if (erste.length === 0) {
    return ['Der erste Teil fehlt (die Datei ohne „.teil-“ im Namen) — er trägt die Zahl der Teile.'];
  }
  if (erste.length > 1) return [`Mehr als ein erster Teil: ${erste.map((k) => k.name).join(', ')}`];
  const { lauf, teile } = erste[0].kopf;
  if (!Number.isInteger(teile) || teile < 1) return [`${erste[0].name}: die Zahl der Teile fehlt`];

  const fremde = koepfe.filter((k) => k.kopf.lauf !== lauf);
  if (fremde.length > 0) {
    fehler.push(`Aus einem anderen Lauf als der erste Teil: ${fremde.map((k) => k.name).join(', ')}`);
  }
  const gesehen = new Map();
  for (const { name, kopf } of koepfe) {
    if (kopf.lauf !== lauf) continue;
    if (kopf.nr > teile) fehler.push(`${name}: Teil ${kopf.nr}, der Stand hat aber nur ${teile}`);
    else if (gesehen.has(kopf.nr)) fehler.push(`Teil ${kopf.nr} doppelt: ${gesehen.get(kopf.nr)}, ${name}`);
    else gesehen.set(kopf.nr, name);
  }
  const fehlend = [];
  for (let nr = 1; nr <= teile; nr += 1) if (!gesehen.has(nr)) fehlend.push(nr);
  if (fehlend.length > 0) fehler.push(`Es fehlen Teil ${fehlend.join(', ')} von ${teile}.`);
  return fehler;
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
 * Tabellen, die es nicht mehr gibt — mit dem Grund.
 *
 * Eine Sicherung von VOR dem Entfernen trägt sie noch. Der Rücklauf spielte
 * sie ein, bis eine Runde nichts mehr schafft, und bräche dann ab — mit dem
 * Rest schon im Ziel. Eine Tabelle, die es absichtlich nicht mehr gibt, ist
 * aber kein Fehler der Datei; sie wird übergangen und genannt.
 *
 * NUR WAS HIER STEHT. Eine unbekannte Tabelle, die nicht in dieser Liste
 * steht, führt weiter zum Abbruch: dort passt die Datei nicht zur Datenbank,
 * und das soll auffallen.
 */
export const ENTFERNTE_TABELLEN = {
  follow_ups:
    'Wiedervorlagen, am 30.09.2026 entfernt — geschrieben hat dorthin nur die KI-Erfassung, und sichtbar waren sie nirgends',
};

/** Nimmt die entfernten Tabellen aus dem Stand und sagt, was übergangen wurde. */
export function entfernteAussondern(sammlungen) {
  const uebergangen = [];
  for (const [tabelle, grund] of Object.entries(ENTFERNTE_TABELLEN)) {
    const zeilen = sammlungen.get(tabelle);
    if (!zeilen) continue;
    uebergangen.push({ tabelle, zeilen: zeilen.length, grund });
    sammlungen.delete(tabelle);
  }
  return uebergangen;
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
